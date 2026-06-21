'use client'

import { useEffect, useState, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'

export interface AssetChangeReason {
  id: string
  value: string
  label: string
  hint: string | null
  sort_order: number
  active: boolean
  company_id: string | null
}

/**
 * Carga el catálogo de motivos para cambios sobre activos SAT.
 * Trae motivos globales (company_id IS NULL) + motivos custom de la empresa.
 * Pasá { onlyActive: false } para incluir los desactivados (útil en el CRUD).
 */
export function useAssetChangeReasons(opts: { onlyActive?: boolean } = {}) {
  const onlyActive = opts.onlyActive !== false
  const [reasons, setReasons] = useState<AssetChangeReason[]>([])
  const [loading, setLoading] = useState(true)

  const load = useCallback(async () => {
    setLoading(true)
    const sb = createClient()
    let q = sb.from('tt_sat_change_reasons').select('*').order('sort_order')
    if (onlyActive) q = q.eq('active', true)
    const { data } = await q
    setReasons((data || []) as AssetChangeReason[])
    setLoading(false)
  }, [onlyActive])

  useEffect(() => { load() }, [load])

  return { reasons, loading, reload: load }
}
