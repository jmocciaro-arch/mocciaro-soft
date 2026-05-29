'use client'

import { useSupabase } from './use-supabase'

interface DocumentRow {
  id: string
  doc_type: string
  status: string
  system_code: string
  display_ref: string | null
  total: number | null
  currency: string | null
  client_id: string | null
  company_id: string | null
  created_at: string | null
  client?: { id: string; name: string; legal_name: string | null; tax_id: string | null } | null
}

/**
 * Hook para listar documentos del modelo unificado.
 *
 * @param docTypes — array de tipos (ej. ['presupuesto'] o ['factura','factura_abono'])
 * @param companyIds — filter por company (RLS company-aware ya filtra, pero esto reduce el set)
 * @param statuses — opcional, lista de status válidos
 */
export function useDocuments(opts: {
  docTypes: string[]
  companyIds?: string[]
  statuses?: string[]
  limit?: number
}) {
  const { docTypes, companyIds, statuses, limit = 500 } = opts
  const key = companyIds && companyIds.length > 0
    ? ['documents', docTypes.join(','), companyIds.join(','), statuses?.join(',') ?? '', limit]
    : null

  return useSupabase<DocumentRow[]>(
    key,
    async (sb) => {
      let q = sb
        .from('tt_documents')
        .select('*, client:tt_clients(id, name, legal_name, tax_id)')
        .in('doc_type', docTypes)
        .in('company_id', companyIds!)
        .order('created_at', { ascending: false })
        .limit(limit)
      if (statuses && statuses.length > 0) {
        q = q.in('status', statuses)
      }
      return q
    }
  )
}
