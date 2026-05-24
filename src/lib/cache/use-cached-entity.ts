// ============================================================================
// Mocciaro Soft — useCachedEntity hook
// Stale-while-revalidate: devuelve datos cacheados al instante y dispara
// refresh en background. Cambia automáticamente cuando cambia companyKey.
// ============================================================================

'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { useCompanyFilter } from '@/hooks/use-company-filter'
import {
  readCache,
  onCacheEvent,
  type CachedEntity,
  type CacheMeta,
} from './entity-cache'
import {
  buildCompanyKey,
  refreshClients,
  refreshProducts,
  refreshProductCategories,
  refreshSuppliers,
  refreshWarehouses,
  refreshCompanies,
  type FetchResult,
} from './fetchers'

type Refresher = (scope: { companyIds: string[]; global?: boolean }) => Promise<FetchResult>

const REFRESHERS: Record<CachedEntity, Refresher> = {
  clients: (s) => refreshClients(s),
  products: () => refreshProducts(),
  product_categories: () => refreshProductCategories(),
  suppliers: (s) => refreshSuppliers(s),
  warehouses: (s) => refreshWarehouses(s),
  companies: () => refreshCompanies(),
  users: () => Promise.reject(new Error('users refresher no implementado')),
}

const GLOBAL_ENTITIES: CachedEntity[] = ['products', 'product_categories', 'companies']

export interface UseCachedEntityOptions {
  /** Si true, no autorefresca al montar (solo lee del cache). */
  noAutoRefresh?: boolean
  /** TTL personalizado en ms para considerar stale. */
  staleAfterMs?: number
}

export interface UseCachedEntityResult<T> {
  data: T[]
  meta: CacheMeta | null
  /** True solo en la primera carga sin cache previo. */
  loading: boolean
  /** True mientras revalidamos en background (no bloquea la UI). */
  refreshing: boolean
  /** True si el cache existe pero está vencido. */
  isStale: boolean
  error: Error | null
  refresh: () => Promise<void>
  companyKey: string
}

/**
 * Hook genérico stale-while-revalidate sobre una entidad cacheada.
 */
export function useCachedEntity<T = unknown>(
  entity: CachedEntity,
  options: UseCachedEntityOptions = {}
): UseCachedEntityResult<T> {
  const { companyIds } = useCompanyFilter()
  const isGlobal = GLOBAL_ENTITIES.includes(entity)
  const companyKey = isGlobal ? 'global' : buildCompanyKey({ companyIds })

  const [data, setData] = useState<T[]>([])
  const [meta, setMeta] = useState<CacheMeta | null>(null)
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [isStale, setIsStale] = useState(false)
  const [error, setError] = useState<Error | null>(null)

  const mountedRef = useRef(true)
  useEffect(() => {
    mountedRef.current = true
    return () => { mountedRef.current = false }
  }, [])

  const doRefresh = useCallback(async () => {
    if (refreshing) return
    setRefreshing(true)
    setError(null)
    try {
      const refresher = REFRESHERS[entity]
      await refresher({ companyIds, global: isGlobal })
      const fresh = await readCache<T>(entity, companyKey)
      if (!mountedRef.current) return
      setData(fresh.data)
      setMeta(fresh.meta)
      setIsStale(false)
    } catch (err) {
      if (!mountedRef.current) return
      setError(err instanceof Error ? err : new Error(String(err)))
    } finally {
      if (mountedRef.current) {
        setRefreshing(false)
        setLoading(false)
      }
    }
  }, [entity, companyKey, companyIds, isGlobal, refreshing])

  // Carga inicial: lee del cache, decide si refrescar
  useEffect(() => {
    let cancelled = false
    setLoading(true)
    ;(async () => {
      const entry = await readCache<T>(entity, companyKey)
      if (cancelled) return
      setData(entry.data)
      setMeta(entry.meta)
      setIsStale(entry.isStale)
      setLoading(entry.isEmpty) // solo bloquea si no había nada

      // Si no hay datos o está stale → refrescar
      const shouldRefresh = !options.noAutoRefresh && (entry.isEmpty || entry.isStale)
      if (shouldRefresh) {
        doRefresh()
      } else {
        setLoading(false)
      }
    })()
    return () => { cancelled = true }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [entity, companyKey])

  // Escuchamos eventos para sincronizar con otras pestañas / acciones
  useEffect(() => {
    const off = onCacheEvent(async (ev) => {
      if (ev.kind === 'updated' && ev.entity === entity && ev.companyKey === companyKey) {
        const fresh = await readCache<T>(entity, companyKey)
        if (!mountedRef.current) return
        setData(fresh.data)
        setMeta(fresh.meta)
        setIsStale(false)
      } else if (ev.kind === 'invalidated' && ev.entity === entity) {
        // Próxima oportunidad lo refrescamos
        if (!options.noAutoRefresh) doRefresh()
        else setIsStale(true)
      }
    })
    return off
  }, [entity, companyKey, doRefresh, options.noAutoRefresh])

  return {
    data,
    meta,
    loading,
    refreshing,
    isStale,
    error,
    refresh: doRefresh,
    companyKey,
  }
}

// ============================================================================
// Wrappers tipados por entidad
// ============================================================================

export function useCachedClients<T = unknown>(opts?: UseCachedEntityOptions) {
  return useCachedEntity<T>('clients', opts)
}

export function useCachedProducts<T = unknown>(opts?: UseCachedEntityOptions) {
  return useCachedEntity<T>('products', opts)
}

export function useCachedSuppliers<T = unknown>(opts?: UseCachedEntityOptions) {
  return useCachedEntity<T>('suppliers', opts)
}

export function useCachedWarehouses<T = unknown>(opts?: UseCachedEntityOptions) {
  return useCachedEntity<T>('warehouses', opts)
}

export function useCachedProductCategories<T = unknown>(opts?: UseCachedEntityOptions) {
  return useCachedEntity<T>('product_categories', opts)
}

export function useCachedCompanies<T = unknown>(opts?: UseCachedEntityOptions) {
  return useCachedEntity<T>('companies', opts)
}
