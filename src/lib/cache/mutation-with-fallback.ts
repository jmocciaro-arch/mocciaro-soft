// ============================================================================
// mutationWithFallback — Helper para mutaciones que necesitan tolerar offline.
// Intenta la mutación contra Supabase con un timeout. Si la red está caída
// o tarda demasiado, encola en la sync-queue y devuelve un "soft success".
// ============================================================================

import { enqueue, type SyncActionType } from '@/lib/offline/sync-queue'
import { invalidate, type CachedEntity } from './entity-cache'

const DEFAULT_TIMEOUT_MS = 6000

export interface MutationOptions<T> {
  /** Promise de la mutación (ej: supabase.from('x').insert(y)) */
  mutation: PromiseLike<{ data: T | T[] | null; error: unknown }>
  /** Tipo de acción a encolar si falla */
  action: SyncActionType
  /** Tabla destino */
  table: string
  /** Payload original — guardamos para reintentar offline */
  data: Record<string, unknown>
  /** Entidad cacheada a invalidar tras éxito */
  invalidateEntity?: CachedEntity
  /** Timeout antes de considerar fallo de red */
  timeoutMs?: number
}

export interface MutationResult<T> {
  ok: boolean
  data: T | T[] | null
  /** True si quedó encolado en lugar de aplicarse online */
  queued: boolean
  queueId?: string
  error: Error | null
}

function isOnline(): boolean {
  if (typeof navigator === 'undefined') return true
  return navigator.onLine !== false
}

export async function mutationWithFallback<T>(
  opts: MutationOptions<T>
): Promise<MutationResult<T>> {
  const timeoutMs = opts.timeoutMs ?? DEFAULT_TIMEOUT_MS

  // 1. Offline conocido → directo a la cola
  if (!isOnline()) {
    const queueId = await enqueue(opts.action, opts.table, opts.data)
    if (opts.invalidateEntity) void invalidate(opts.invalidateEntity)
    return { ok: true, data: null, queued: true, queueId, error: null }
  }

  // 2. Race
  const timeout = new Promise<{ timedOut: true }>((resolve) =>
    setTimeout(() => resolve({ timedOut: true }), timeoutMs)
  )

  try {
    const raced = await Promise.race([
      Promise.resolve(opts.mutation).then((r) => ({ result: r, timedOut: false as const })),
      timeout,
    ])

    if ('result' in raced) {
      const { data, error } = raced.result
      if (error) {
        // Error de Supabase: si parece de red, encolar; si no, propagar
        const msg = error instanceof Error ? error.message : String(error)
        if (/network|fetch failed|offline|enotfound|etimedout/i.test(msg)) {
          const queueId = await enqueue(opts.action, opts.table, opts.data)
          if (opts.invalidateEntity) void invalidate(opts.invalidateEntity)
          return { ok: true, data: null, queued: true, queueId, error: null }
        }
        return { ok: false, data: null, queued: false, error: error instanceof Error ? error : new Error(msg) }
      }
      if (opts.invalidateEntity) void invalidate(opts.invalidateEntity)
      return { ok: true, data: (data as T | T[] | null), queued: false, error: null }
    } else {
      // Timeout → encolar
      const queueId = await enqueue(opts.action, opts.table, opts.data)
      if (opts.invalidateEntity) void invalidate(opts.invalidateEntity)
      return { ok: true, data: null, queued: true, queueId, error: null }
    }
  } catch (err) {
    // Excepción cruda de fetch → encolar
    const queueId = await enqueue(opts.action, opts.table, opts.data)
    if (opts.invalidateEntity) void invalidate(opts.invalidateEntity)
    return {
      ok: true,
      data: null,
      queued: true,
      queueId,
      error: err instanceof Error ? err : new Error(String(err)),
    }
  }
}
