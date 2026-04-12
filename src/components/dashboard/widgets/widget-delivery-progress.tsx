'use client'

import { useState, useEffect } from 'react'
import { Truck } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { WidgetSkeleton, WidgetError } from '../widget-wrapper'

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
  const [error, setError] = useState(false)

  useEffect(() => {
    async function load() {
      try {
        const supabase = createClient()
        // Load pedidos from tt_documents
        const { data: docData, error: e1 } = await supabase
          .from('tt_documents')
          .select('id, display_ref, system_code, total, status, metadata')
          .eq('type', 'pedido')
          .in('status', ['open', 'sent', 'accepted', 'draft'])
          .order('created_at', { ascending: false })
          .limit(8)

        // Also load from tt_sales_orders
        const { data: localData, error: e2 } = await supabase
          .from('tt_sales_orders')
          .select('id, doc_number, total, status, tt_clients(name)')
          .in('status', ['open', 'partially_delivered'])
          .order('created_at', { ascending: false })
          .limit(4)

        if (e1) throw e1
        if (e2) throw e2

        const docItems: DeliveryItem[] = (docData || []).map((d: Record<string, unknown>) => {
          const raw = (d.metadata as Record<string, unknown>)?.stelorder_raw as Record<string, unknown> | undefined
          const clientName = raw ? ((raw['account-name'] as string) || (raw['legal-name'] as string) || 'Sin cliente') : 'Sin cliente'
          return {
            id: d.id as string,
            doc_number: (d.display_ref as string) || (d.system_code as string) || 'S/N',
            total_qty: 100,
            delivered_qty: (d.status as string) === 'closed' ? 100 : 30,
            client_name: clientName,
          }
        })
        const localItems: DeliveryItem[] = (localData || []).map((d: Record<string, unknown>) => ({
          id: d.id as string,
          doc_number: (d.doc_number as string) || 'S/N',
          total_qty: 100,
          delivered_qty: (d.status as string) === 'partially_delivered' ? 50 : 0,
          client_name: ((d.tt_clients as Record<string, unknown>)?.name as string) || 'Sin cliente',
        }))
        const items: DeliveryItem[] = [...localItems, ...docItems].slice(0, 8)
        setDeliveries(items)
      } catch {
        setError(true)
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [])

  if (loading) return <WidgetSkeleton />
  if (error) return <WidgetError />

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
                <p className="text-[10px] text-[#6B7280] font-mono">{d.doc_number}</p>
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
