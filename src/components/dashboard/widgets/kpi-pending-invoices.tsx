'use client'

import { useState, useEffect } from 'react'
import { Receipt } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { useCompanyFilter } from '@/hooks/use-company-filter'
import { formatCurrency } from '@/lib/utils'
import { WidgetSkeleton, WidgetError } from '../widget-wrapper'

export function KpiPendingInvoices() {
  const [count, setCount] = useState(0)
  const [value, setValue] = useState(0)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(false)
  const { filterByCompany, companyKey } = useCompanyFilter()

  useEffect(() => {
    async function load() {
      try {
        const sb = createClient()
        // Count pending invoicing from tt_documents (filtered) + tt_invoices (no company_id)
        let docQ = sb.from('tt_documents').select('total', { count: 'exact' }).in('doc_type', ['factura', 'factura_abono']).in('status', ['draft', 'pending', 'sent', 'open'])
        docQ = filterByCompany(docQ)

        const [docRes, localRes] = await Promise.all([
          docQ,
          sb.from('tt_invoices').select('total', { count: 'exact' }).eq('type', 'sale').in('status', ['draft', 'pending']),
        ])
        if (docRes.error) throw docRes.error
        if (localRes.error) throw localRes.error
        setCount((docRes.count ?? 0) + (localRes.count ?? 0))
        const docSum = (docRes.data || []).reduce((acc: number, d: { total: number }) => acc + (d.total || 0), 0)
        const localSum = (localRes.data || []).reduce((acc: number, d: { total: number }) => acc + (d.total || 0), 0)
        setValue(docSum + localSum)
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
        <p className="text-3xl font-bold text-amber-400">{count}</p>
        <p className="text-xs text-[#6B7280] mt-1">
          {formatCurrency(value, 'EUR')}
        </p>
      </div>
      <div className="p-3 rounded-xl bg-amber-500/10">
        <Receipt size={22} className="text-amber-400" />
      </div>
    </div>
  )
}
