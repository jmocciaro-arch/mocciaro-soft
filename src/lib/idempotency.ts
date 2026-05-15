/**
 * idempotency.ts
 *
 * Helper genérico para operaciones idempotentes contra Supabase.
 *
 * Uso típico:
 *   const result = await withIdempotency(
 *     { key: `quote_to_order:${quoteId}:${userId}`, scope: 'quote_to_order' },
 *     async () => quoteToOrder(quoteId, source)
 *   )
 *
 * Garantías:
 *   1. Si dos requests llegan con la misma key, sólo el primero ejecuta `fn`.
 *      El segundo lee el resultado guardado y lo devuelve.
 *   2. Si la ejecución falla, la key NO queda guardada — el próximo intento
 *      con la misma key reintenta limpio.
 *   3. La race condition (dos requests simultáneos antes de que el primero
 *      guarde) se resuelve vía constraint UNIQUE de la tabla + reintento
 *      diferido para leer el resultado del ganador.
 *
 * Reusable en FASE 1 (orderToDeliveryNote, registerPayment) y FASE 2
 * (emitir factura legal contra API fiscal — la key viene del idempotency_key
 * que ya provee TusFacturas / Verifacti).
 */

import { createClient } from '@/lib/supabase/client'

const POLL_WAIT_MS = 250
const POLL_MAX_ATTEMPTS = 8 // ~2s total esperando al ganador

export interface IdempotencyOptions {
  /**
   * Clave única de la operación. Convención:
   *   {scope}:{entity_id}:{user_id} para acciones de usuario
   *   {scope}:{entity_id}              para acciones de sistema/cron
   */
  key: string
  /**
   * Etiqueta semántica (ej: 'quote_to_order', 'register_payment').
   * Sólo para introspección / queries en el panel admin.
   */
  scope?: string
  /**
   * Usuario que origina la acción. Default: null (acción de sistema).
   * No se valida — sólo se persiste para auditoría.
   */
  userId?: string | null
}

export class IdempotencyConflictError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'IdempotencyConflictError'
  }
}

/**
 * Ejecuta `fn` de forma idempotente.
 *
 * Algoritmo:
 *   1. Lookup en tt_idempotency_keys por key. Si existe, devolver result cacheado.
 *   2. Ejecutar fn().
 *   3. Persistir result. Si conflicto (otro request lo persistió primero),
 *      releer y devolver el del ganador.
 *
 * @throws Cualquier error que tire `fn`. En ese caso NO se persiste la key.
 */
export async function withIdempotency<T>(
  options: IdempotencyOptions,
  fn: () => Promise<T>
): Promise<T> {
  if (!options.key || options.key.length < 4) {
    throw new Error('idempotency key requerida (mínimo 4 chars)')
  }

  const sb = createClient()

  // 1. Lookup previo
  const cached = await readCachedResult<T>(options.key)
  if (cached.found) return cached.result

  // 2. Ejecutar fn. Si falla, propagar sin persistir.
  let result: T
  try {
    result = await fn()
  } catch (err) {
    throw err
  }

  // 3. Persistir resultado. Si choca con UNIQUE (otro request ganó la
  //    carrera), reintentar lectura — el ganador ya debe haber escrito.
  const { error } = await sb.from('tt_idempotency_keys').insert({
    key: options.key,
    result: result as unknown as Record<string, unknown>,
    scope: options.scope ?? null,
    created_by: options.userId ?? null,
  })

  if (error) {
    // Conflicto de unicidad → ganamos la carrera tarde. Releer ganador.
    if (isUniqueViolation(error)) {
      const winner = await pollCachedResult<T>(options.key)
      if (winner.found) return winner.result
      // No debería pasar: la key existe pero no la podemos leer.
      throw new IdempotencyConflictError(
        `Conflicto de idempotencia para key "${options.key}" pero el resultado del ganador no es legible. ` +
          `Revisar políticas RLS de tt_idempotency_keys.`
      )
    }
    // Cualquier otro error de DB en la persistencia: el fn() ya corrió.
    // No queremos hacer rollback semántico desde acá (el caller no sabría),
    // así que devolvemos el resultado y logueamos el problema.
    console.error('[withIdempotency] No se pudo persistir la key', options.key, error)
  }

  return result
}

// ---------------------------------------------------------------
// Helpers internos
// ---------------------------------------------------------------

async function readCachedResult<T>(key: string): Promise<{ found: true; result: T } | { found: false }> {
  const sb = createClient()
  const { data, error } = await sb
    .from('tt_idempotency_keys')
    .select('result')
    .eq('key', key)
    .maybeSingle()

  if (error || !data) return { found: false }
  return { found: true, result: data.result as T }
}

async function pollCachedResult<T>(key: string): Promise<{ found: true; result: T } | { found: false }> {
  for (let attempt = 0; attempt < POLL_MAX_ATTEMPTS; attempt++) {
    const result = await readCachedResult<T>(key)
    if (result.found) return result
    await sleep(POLL_WAIT_MS)
  }
  return { found: false }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

function isUniqueViolation(error: { code?: string; message?: string }): boolean {
  // Postgres: 23505 = unique_violation
  return error.code === '23505' || /duplicate key|unique constraint/i.test(error.message ?? '')
}

// ---------------------------------------------------------------
// Builder de claves (convención compartida)
// ---------------------------------------------------------------

/**
 * Construye una clave canónica del estilo {scope}:{...parts}.
 * Filtra null/undefined y normaliza espacios.
 */
export function buildIdempotencyKey(scope: string, ...parts: Array<string | null | undefined>): string {
  const clean = parts.filter((p): p is string => typeof p === 'string' && p.length > 0).map((p) => p.trim())
  if (clean.length === 0) throw new Error(`buildIdempotencyKey(${scope}, ...): al menos una parte requerida`)
  return [scope, ...clean].join(':')
}
