'use client'

import { useState, useEffect } from 'react'
import { Truck } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { useCompanyFilter } from '@/hooks/use-company-filter'
import { DocLink } from '@/components/ui/doc-link'
import { WidgetSkeleton } from '../widget-wrapper'

interface DeliveryItem {
  id: string
  doc_number: string
  total_qty: number
  delivered_qty: number
  client_name: string
}

export function WidgetDeliveryProgress() {
  const [deliveries, setDeliveries] = useState<DeliveryItem[]>([])
  const [loading, setLoading] = useState(true)
  const { filterByCompany, companyKey } = useCompanyFilter()

  useEffect(() => {
    async function load() {
      try {
        const sb = createClient()
        // Cargar pedidos abiertos del último mes con sus items y nombre del cliente
        const oneMonthAgo = new Date()
        oneMonthAgo.setMonth(oneMonthAgo.getMonth() - 1)

        let q = sb
          .from('tt_sales_orders')
          .select('id, number, status, created_at, client:tt_clients(name, legal_name), items:tt_so_items(qty_ordered, qty_delivered)')
          .in('status', ['open', 'partial', 'confirmed', 'sent', 'accepted', 'draft'])
          .gte('created_at', oneMonthAgo.toISOString())
          .order('created_at', { ascending: false })
          .limit(8)
        q = filterByCompany(q)
        const { data, error } = await q
        if (error) throw error

        const items: DeliveryItem[] = (data || []).map((d: Record<string, unknown>) => {
          const client = d.client as Record<string, unknown> | null
          const clientName =
            (client?.legal_name as string) || (client?.name as string) || 'Sin cliente'
          const rawItems = (d.items as Array<{ qty_ordered: number | null; qty_delivered: number | null }> | null) || []
          const totalQty = rawItems.reduce((s, it) => s + (Number(it.qty_ordered) || 0), 0)
          const deliveredQty = rawItems.reduce((s, it) => s + (Number(it.qty_delivered) || 0), 0)
          return {
            id: d.id as string,
            doc_number: (d.number as string) || 'S/N',
            total_qty: totalQty,
            delivered_qty: deliveredQty,
            client_name: clientName,
          }
        })
        // Solo mostrar los que tienen al menos 1 item ordenado
        setDeliveries(items.filter(i => i.total_qty > 0).slice(0, 8))
      } catch {
        // Fallback graceful: muestra "no hay entregas" en lugar de error visual
        setDeliveries([])
      } finally {
        setLoading(false)
      }
    }
    load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [companyKey])

  if (loading) return <WidgetSkeleton />

  if (deliveries.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-full text-[#4B5563] py-6">
        <Truck size={28} className="mb-2" />
        <p className="text-xs">No hay entregas en curso</p>
      </div>
    )
  }

  return (
    <div className="space-y-3">
      {deliveries.map(d => {
        const pct = d.total_qty > 0 ? Math.round((d.delivered_qty / d.total_qty) * 100) : 0
        return (
          <div key={d.id} className="space-y-1">
            <div className="flex items-center justify-between">
              <div className="flex-1 min-w-0">
                <p className="text-xs text-[#F0F2F5] truncate">{d.client_name}</p>
                <DocLink docRef={d.doc_number} docId={d.id} docType="delivery_note" className="text-[10px] font-mono" />
              </div>
              <span className="text-xs font-medium text-[#FF6600] ml-2">{pct}%</span>
            </div>
            <div className="w-full h-1.5 bg-[#1E2330] rounded-full overflow-hidden">
              <div
                className="h-full rounded-full transition-all duration-500"
                style={{
                  width: `${pct}%`,
                  backgroundColor: pct === 100 ? '#10B981' : pct > 50 ? '#FF6600' : '#F59E0B',
                }}
              />
            </div>
          </div>
        )
      })}
    </div>
  )
}
