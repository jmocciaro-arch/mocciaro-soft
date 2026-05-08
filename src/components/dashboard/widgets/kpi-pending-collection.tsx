'use client'

import { useState, useEffect } from 'react'
import { Banknote } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { useCompanyFilter } from '@/hooks/use-company-filter'
import { formatCurrency } from '@/lib/utils'
import { WidgetSkeleton, WidgetError } from '../widget-wrapper'

export function KpiPendingCollection() {
  const [value, setValue] = useState(0)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(false)
  const { filterByCompany, companyKey } = useCompanyFilter()

  useEffect(() => {
    async function load() {
      try {
        const sb = createClient()
        // Pending collection from tt_documents (filtered) + tt_invoices (no company_id)
        let docQ = sb.from('tt_documents').select('total').in('doc_type', ['factura']).in('status', ['sent', 'open', 'pending', 'draft'])
        docQ = filterByCompany(docQ)

        const [docRes, localRes] = await Promise.all([
          docQ,
          sb.from('tt_invoices').select('total').eq('type', 'sale').in('status', ['draft', 'pending', 'partial']),
        ])
        if (docRes.error) throw docRes.error
        if (localRes.error) throw localRes.error
        const docPending = (docRes.data || []).reduce((acc: number, q: { total: number }) => acc + (q.total || 0), 0)
        const localPending = (localRes.data || []).reduce((acc: number, q: { total: number }) => acc + (q.total || 0), 0)
        setValue(docPending + localPending)
      } catch {
        setError(true)
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [companyKey])

  if (loading) return <WidgetSkeleton />
  if (error) return <WidgetError />

  return (
    <div className="flex items-start justify-between h-full">
      <div>
        <p className="text-3xl font-bold text-[#F0F2F5]">
          {formatCurrency(value, 'EUR')}
        </p>
        <p className="text-xs text-[#6B7280] mt-1">pendiente de cobro</p>
      </div>
      <div className="p-3 rounded-xl bg-green-500/10">
        <Banknote size={22} className="text-green-400" />
      </div>
    </div>
  )
}
