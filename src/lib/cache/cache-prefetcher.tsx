'use client'

// ============================================================================
// CachePrefetcher
// Cuando hay una empresa activa, dispara prefetch en background de todas
// las entidades cacheables. Reactiva sobre cambios de empresa.
// ============================================================================

import { useEffect, useRef } from 'react'
import { useCompanyContext } from '@/lib/company-context'
import { prefetchAll } from './fetchers'
import { listMeta } from './entity-cache'

export function CachePrefetcher() {
  const { activeCompanyId, activeCompanyIds, isMultiMode, loading } = useCompanyContext()
  const lastKeyRef = useRef<string>('')

  useEffect(() => {
    if (loading) return
    const companyIds = isMultiMode
      ? activeCompanyIds
      : activeCompanyId
        ? [activeCompanyId]
        : []
    if (companyIds.length === 0) return

    const key = companyIds.sort().join(',')
    if (key === lastKeyRef.current) return
    lastKeyRef.current = key

    // No bloqueamos render; en background
    ;(async () => {
      // Si todo el cache es razonablemente fresco (< 30 min), no refrescamos
      const FRESH_THRESHOLD_MS = 30 * 60 * 1000
      const metas = await listMeta()
      const now = Date.now()
      const allFresh = metas.length > 0 && metas.every((m) => now - m.fetchedAt < FRESH_THRESHOLD_MS)

      if (allFresh) {
        console.log('[cache] prefetch saltado, todo fresco (<30min)')
        return
      }

      console.log('[cache] prefetch iniciado para company key=', key)
      await prefetchAll({ companyIds })
      console.log('[cache] prefetch completo')
    })().catch((err) => console.warn('[cache] prefetch fallo', err))
  }, [activeCompanyId, activeCompanyIds, isMultiMode, loading])

  return null
}
