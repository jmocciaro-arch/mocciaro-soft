'use client'

import { useState, useEffect, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useCompanyFilter } from './use-company-filter'

export interface SatAsset {
  id: string
  ref: string
  internal_id: string | null
  serial_number: string | null
  brand: string
  model: string | null
  model_normalized: string | null
  client_id: string | null
  client_name_raw: string | null
  company_id: string
  city: string | null
  province: string | null
  country: string | null
  warranty_start: string | null
  warranty_end: string | null
  is_new: boolean
  notes: string | null
  created_at: string
  updated_at: string
  // Joined from tt_clients
  tt_clients?: { name: string } | null
}

export interface SatAssetFilters {
  search?: string
  model?: string
  clientId?: string
  isNew?: boolean
}

export function useSatAssets(filters: SatAssetFilters = {}) {
  const { filterByCompany, companyKey } = useCompanyFilter()
  const [assets, setAssets] = useState<SatAsset[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    const sb = createClient()
    let q = sb
      .from('tt_sat_assets')
      .select('*, tt_clients(name)')
      .order('ref', { ascending: true })
    q = filterByCompany(q)
    if (filters.model) q = q.ilike('model_normalized', `%${filters.model}%`)
    if (filters.clientId) q = q.eq('client_id', filters.clientId)
    if (typeof filters.isNew === 'boolean') q = q.eq('is_new', filters.isNew)
    const { data, error } = await q
    if (error) {
      setError(error.message)
      setAssets([])
    } else {
      let list = (data || []) as SatAsset[]
      if (filters.search) {
        const s = filters.search.toLowerCase()
        list = list.filter((a) =>
          [a.ref, a.internal_id, a.serial_number, a.model, a.client_name_raw, a.tt_clients?.name]
            .some((v) => (v || '').toLowerCase().includes(s))
        )
      }
      setAssets(list)
    }
    setLoading(false)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filters.model, filters.clientId, filters.isNew, filters.search, companyKey])

  useEffect(() => { load() }, [load])

  const create = useCallback(async (asset: Partial<SatAsset>) => {
    const sb = createClient()
    const { data, error } = await sb.from('tt_sat_assets').insert(asset as any).select().single()
    if (error) throw error
    await load()
    return data
  }, [load])

  const update = useCallback(async (id: string, patch: Partial<SatAsset>) => {
    const sb = createClient()
    const { error } = await sb.from('tt_sat_assets').update(patch as any).eq('id', id)
    if (error) throw error
    await load()
  }, [load])

  const remove = useCallback(async (id: string) => {
    const sb = createClient()
    const { error } = await sb.from('tt_sat_assets').delete().eq('id', id)
    if (error) throw error
    await load()
  }, [load])

  return { assets, loading, error, reload: load, create, update, remove }
}
