/**
 * Tests unitarios de src/lib/idempotency.ts
 *
 * Cubre:
 *  - withIdempotency: ejecuta fn una sola vez si la key ya existe (cache hit)
 *  - withIdempotency: ejecuta fn y persiste el resultado en cache miss
 *  - withIdempotency: si fn() tira, no persiste la key (próximo intento limpio)
 *  - withIdempotency: si dos requests ganan la carrera, el segundo devuelve
 *    el resultado del primero al chocar con UNIQUE
 *  - withIdempotency: rechaza keys vacías o muy cortas
 *  - buildIdempotencyKey: arma claves canónicas y rechaza vacíos
 *
 * Ejecutar: npm run test:unit
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'

// Stub del cliente supabase. createClient() devuelve un fake con `from(table)`
// que cachea estado entre llamadas (simulando la tabla tt_idempotency_keys).
const fakeStore = new Map<string, { key: string; result: unknown; scope?: string | null; created_by?: string | null }>()

function makeSupabaseStub(options?: { uniqueViolationOnInsert?: () => boolean; preInsert?: (key: string) => void }) {
  return {
    from(table: string) {
      if (table !== 'tt_idempotency_keys') throw new Error(`Tabla inesperada en stub: ${table}`)
      return {
        select(_cols: string) {
          let _key: string | null = null
          const api = {
            eq(_col: string, val: string) {
              _key = val
              return api
            },
            async maybeSingle() {
              if (_key && fakeStore.has(_key)) {
                const row = fakeStore.get(_key)!
                return { data: { result: row.result }, error: null }
              }
              return { data: null, error: null }
            },
          }
          return api
        },
        async insert(row: { key: string; result: unknown; scope?: string | null; created_by?: string | null }) {
          options?.preInsert?.(row.key)
          if (options?.uniqueViolationOnInsert?.()) {
            return { error: { code: '23505', message: 'duplicate key value violates unique constraint' } }
          }
          if (fakeStore.has(row.key)) {
            return { error: { code: '23505', message: 'duplicate key value violates unique constraint' } }
          }
          fakeStore.set(row.key, row)
          return { error: null }
        },
      }
    },
  }
}

// Mock antes del import del módulo bajo test.
vi.mock('@/lib/supabase/client', () => ({
  createClient: () => currentStub,
}))

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let currentStub: any = makeSupabaseStub()

import { withIdempotency, buildIdempotencyKey, IdempotencyConflictError } from '@/lib/idempotency'

describe('withIdempotency()', () => {
  beforeEach(() => {
    fakeStore.clear()
    currentStub = makeSupabaseStub()
  })

  it('ejecuta fn una sola vez en cache miss y persiste el resultado', async () => {
    const fn = vi.fn().mockResolvedValue({ orderId: 'ord-1', orderNumber: 'PED-2026-0001' })

    const result = await withIdempotency({ key: 'quote_to_order:q1:u1', scope: 'quote_to_order' }, fn)

    expect(result).toEqual({ orderId: 'ord-1', orderNumber: 'PED-2026-0001' })
    expect(fn).toHaveBeenCalledTimes(1)
    expect(fakeStore.has('quote_to_order:q1:u1')).toBe(true)
  })

  it('devuelve el resultado cacheado sin volver a ejecutar fn en cache hit', async () => {
    fakeStore.set('quote_to_order:q1:u1', {
      key: 'quote_to_order:q1:u1',
      result: { orderId: 'ord-1', orderNumber: 'PED-2026-0001' },
    })
    const fn = vi.fn().mockResolvedValue({ orderId: 'ord-IGNORED' })

    const result = await withIdempotency<{ orderId: string; orderNumber: string }>(
      { key: 'quote_to_order:q1:u1' },
      fn
    )

    expect(result).toEqual({ orderId: 'ord-1', orderNumber: 'PED-2026-0001' })
    expect(fn).not.toHaveBeenCalled()
  })

  it('NO persiste la key si fn() tira — el próximo intento reintenta limpio', async () => {
    const fn = vi.fn().mockRejectedValue(new Error('boom'))

    await expect(withIdempotency({ key: 'quote_to_order:q1:u1' }, fn)).rejects.toThrow('boom')

    expect(fakeStore.has('quote_to_order:q1:u1')).toBe(false)

    // Segundo intento, ahora fn devuelve OK — debe ejecutarse y persistirse
    const fn2 = vi.fn().mockResolvedValue({ orderId: 'ord-2' })
    const result = await withIdempotency({ key: 'quote_to_order:q1:u1' }, fn2)
    expect(result).toEqual({ orderId: 'ord-2' })
    expect(fn2).toHaveBeenCalledTimes(1)
  })

  it('en carrera: si el insert choca con UNIQUE, devuelve el resultado del ganador', async () => {
    // Simulamos: cuando estamos por insertar, el "ganador" ya escribió.
    let triedInsert = false
    currentStub = makeSupabaseStub({
      uniqueViolationOnInsert: () => !triedInsert,
      preInsert: (key) => {
        if (!triedInsert) {
          triedInsert = true
          // El ganador puso su resultado primero
          fakeStore.set(key, { key, result: { orderId: 'ord-WINNER' } })
        }
      },
    })

    const fn = vi.fn().mockResolvedValue({ orderId: 'ord-LOSER' })
    const result = await withIdempotency<{ orderId: string }>(
      { key: 'quote_to_order:race:u1' },
      fn
    )

    // fn() del perdedor sí corrió (no podemos prevenirlo a este nivel),
    // pero al persistir chocó y leyó el resultado del ganador.
    expect(fn).toHaveBeenCalledTimes(1)
    expect(result).toEqual({ orderId: 'ord-WINNER' })
  })

  it('rechaza keys vacías o muy cortas', async () => {
    const fn = vi.fn()
    await expect(withIdempotency({ key: '' }, fn)).rejects.toThrow(/idempotency key requerida/)
    await expect(withIdempotency({ key: 'abc' }, fn)).rejects.toThrow(/idempotency key requerida/)
    expect(fn).not.toHaveBeenCalled()
  })

  it('tira IdempotencyConflictError si choca UNIQUE pero no logra releer al ganador', async () => {
    // Insert siempre choca, y el store queda vacío (el ganador "fantasma" no escribió).
    currentStub = makeSupabaseStub({
      uniqueViolationOnInsert: () => true,
      preInsert: () => {},
    })

    const fn = vi.fn().mockResolvedValue({ orderId: 'ord-X' })

    // Acortamos la espera de polling con timers fake para no esperar 2s reales
    vi.useFakeTimers()
    const promise = withIdempotency({ key: 'quote_to_order:ghost:u1' }, fn).catch((e) => e)
    // Avanzar todos los timers para que el polling termine rápido
    await vi.runAllTimersAsync()
    const err = await promise
    vi.useRealTimers()

    expect(err).toBeInstanceOf(IdempotencyConflictError)
  })
})

describe('buildIdempotencyKey()', () => {
  it('arma key canónica con scope y partes', () => {
    expect(buildIdempotencyKey('quote_to_order', 'q1', 'u1')).toBe('quote_to_order:q1:u1')
  })

  it('filtra null/undefined', () => {
    expect(buildIdempotencyKey('reg_payment', 'inv-7', null, 'u1', undefined)).toBe('reg_payment:inv-7:u1')
  })

  it('rechaza si no quedan partes', () => {
    expect(() => buildIdempotencyKey('scope_only')).toThrow(/al menos una parte/)
    expect(() => buildIdempotencyKey('scope', null, undefined)).toThrow(/al menos una parte/)
  })
})
