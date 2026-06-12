'use client'

import { useSupabase } from './use-supabase'

interface ClientRow {
  id: string
  name: string
  legal_name: string | null
  tax_id: string | null
  email: string | null
  phone: string | null
  city: string | null
  country: string | null
  category: string | null
  active: boolean | null
  company_id: string | null
  created_at: string | null
}

/**
 * Lista de clientes filtrada por compañías activas + búsqueda opcional.
 * Cache compartido — múltiples componentes que llaman este hook reusan datos.
 */
export function useClients(opts: { companyIds?: string[]; search?: string } = {}) {
  const { companyIds, search } = opts
  const key = companyIds && companyIds.length > 0 ? ['clients', companyIds.join(','), search ?? ''] : null

  return useSupabase<ClientRow[]>(
    key,
    async (sb) => {
      let q = sb
        .from('tt_clients')
        .select('id, name, legal_name, tax_id, email, phone, city, country, category, active, company_id, created_at')
        .in('company_id', companyIds!)
        .eq('active', true)
        .order('name')
        .limit(500)
      if (search && search.trim().length > 0) {
        q = q.ilike('name', `%${search.trim()}%`)
      }
      return q
    }
  )
}

/**
 * Cliente único por id.
 */
export function useClient(clientId: string | null | undefined) {
  return useSupabase<ClientRow>(
    clientId ? ['client', clientId] : null,
    async (sb) => sb.from('tt_clients').select('*').eq('id', clientId!).maybeSingle()
  )
}
