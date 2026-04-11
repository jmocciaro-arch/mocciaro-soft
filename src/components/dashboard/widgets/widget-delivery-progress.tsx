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
        const { data, error: e } = await supabase
          .from('tt_documents')
          .select('id, doc_number, total_qty, delivered_qty, client:tt_clients(company_name)')
          .eq('type', 'sales_order')
          .in('status', ['accepted', 'partially_fulfilled'])
          .order('created_at', { ascending: false })
          .limit(8)

        if (e) throw e

        const items: DeliveryItem[] = (data || []).map((d: any) => ({
          id: d.id,
          doc_number: d.doc_number || 'S/N',
          total_qty: d.total_qty || 1,
          delivered_qty: d.delivered_qty || 0,
          client_name: d.client?.company_name || 'Sin cliente',
        }))
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
