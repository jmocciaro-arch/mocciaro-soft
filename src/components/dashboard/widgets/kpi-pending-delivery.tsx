'use client'

import { useState, useEffect } from 'react'
import { Truck } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { useCompanyFilter } from '@/hooks/use-company-filter'
import { WidgetSkeleton, WidgetError } from '../widget-wrapper'

export function KpiPendingDelivery() {
  const [count, setCount] = useState(0)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(false)
  const { filterByCompany, companyKey } = useCompanyFilter()

  useEffect(() => {
    async function load() {
      try {
        const sb = createClient()
        // Count from tt_documents (pedidos without delivery) + tt_sales_orders
        let docQ = sb.from('tt_documents').select('*', { count: 'exact', head: true }).eq('doc_type', 'pedido').in('status', ['open', 'sent', 'accepted', 'draft'])
        docQ = filterByCompany(docQ)

        let localQ = sb.from('tt_sales_orders').select('*', { count: 'exact', head: true }).in('status', ['open', 'partially_delivered'])
        localQ = filterByCompany(localQ)

        const [docRes, localRes] = await Promise.all([docQ, localQ])
        if (docRes.error) throw docRes.error
        if (localRes.error) throw localRes.error
        setCount((docRes.count ?? 0) + (localRes.count ?? 0))
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

  const urgencyColor = count > 10 ? 'text-red-400' : count > 5 ? 'text-amber-400' : 'text-emerald-400'
  const urgencyBg = count > 10 ? 'bg-red-500/10' : count > 5 ? 'bg-amber-500/10' : 'bg-emerald-500/10'

  return (
    <div className="flex items-start justify-between h-full">
      <div>
        <p className={`text-3xl font-bold ${urgencyColor}`}>{count}</p>
        <p className="text-xs text-[#6B7280] mt-1">pedidos pendientes</p>
      </div>
      <div className={`p-3 rounded-xl ${urgencyBg}`}>
        <Truck size={22} className={urgencyColor} />
      </div>
    </div>
  )
}
