// ============================================================================
// queryWithFallback — Helper para queries que necesitan funcionar offline.
// Si la red falla / tarda > timeout, devuelve datos del cache local en lugar
// de tirar el error. Útil para páginas que renderean listados.
// ============================================================================

import { readCache, type CachedEntity } from './entity-cache'

const DEFAULT_TIMEOUT_MS = 4000

export interface QueryWithFallbackOptions<T> {
  /** Promise de la query Supabase (ej: supabase.from(...).select(...)) */
  query: PromiseLike<{ data: T[] | null; error: unknown }>
  /** Entidad cacheada para fallback. */
  fallbackEntity: CachedEntity
  /** Company key para leer del cache (default: 'global'). */
  companyKey?: string
  /** Filtro adicional aplicado a los datos del cache. */
  filterFromCache?: (row: T) => boolean
  /** Timeout en ms antes de caer al cache (default 4000). */
  timeoutMs?: number
}

export interface QueryWithFallbackResult<T> {
  data: T[]
  source: 'network' | 'cache' | 'empty'
  error: Error | null
}

function isOnline(): boolean {
  if (typeof navigator === 'undefined') return true
  return navigator.onLine !== false
}

/**
 * Ejecuta una query Supabase con fallback a IndexedDB.
 *
 * Comportamiento:
 *   - Si navigator.onLine === false → va directo al cache.
 *   - Si la query falla o tarda > timeout → cache.
 *   - Si la query devuelve OK → usa esos datos.
 */
export async function queryWithFallback<T>(
  opts: QueryWithFallbackOptions<T>
): Promise<QueryWithFallbackResult<T>> {
  const companyKey = opts.companyKey ?? 'global'
  const timeoutMs = opts.timeoutMs ?? DEFAULT_TIMEOUT_MS

  const readFallback = async (): Promise<QueryWithFallbackResult<T>> => {
    const entry = await readCache<T>(opts.fallbackEntity, companyKey)
    const filtered = opts.filterFromCache
      ? entry.data.filter(opts.filterFromCache)
      : entry.data
    return {
      data: filtered,
      source: filtered.length > 0 ? 'cache' : 'empty',
      error: null,
    }
  }

  // 1. Offline conocido → ni intentamos red
  if (!isOnline()) {
    return readFallback()
  }

  // 2. Race entre query y timeout
  const timeout = new Promise<{ timedOut: true }>((resolve) =>
    setTimeout(() => resolve({ timedOut: true }), timeoutMs)
  )

  try {
    const raced = await Promise.race([
      Promise.resolve(opts.query).then((r) => ({ result: r, timedOut: false as const })),
      timeout,
    ])

    if ('result' in raced) {
      const { data, error } = raced.result
      if (error) {
        console.warn('[queryWithFallback] supabase error, cayendo al cache:', error)
        return readFallback()
      }
      return { data: data || [], source: 'network', error: null }
    } else {
      console.warn(`[queryWithFallback] timeout ${timeoutMs}ms, cayendo al cache`)
      return readFallback()
    }
  } catch (err) {
    console.warn('[queryWithFallback] excepción, cayendo al cache:', err)
    const fallback = await readFallback()
    return { ...fallback, error: err instanceof Error ? err : new Error(String(err)) }
  }
}
