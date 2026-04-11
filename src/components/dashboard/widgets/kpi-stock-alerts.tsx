'use client'

import { useState, useEffect } from 'react'
import { AlertTriangle } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { WidgetSkeleton, WidgetError } from '../widget-wrapper'

export function KpiStockAlerts() {
  const [count, setCount] = useState(0)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(false)

  useEffect(() => {
    async function load() {
      try {
        const supabase = createClient()
        // Products where current stock is below min_stock
        const { data, error: e } = await supabase
          .from('tt_stock')
          .select('quantity, tt_products!inner(min_stock)')

        if (e) throw e

        const alerts = (data || []).filter((item: any) => {
          const minStock = item.tt_products?.min_stock ?? 0
          return minStock > 0 && (item.quantity || 0) < minStock
        })
        setCount(alerts.length)
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

  const color = count > 5 ? 'text-red-400' : count > 0 ? 'text-amber-400' : 'text-emerald-400'
  const bg = count > 5 ? 'bg-red-500/10' : count > 0 ? 'bg-amber-500/10' : 'bg-emerald-500/10'

  return (
    <div className="flex items-start justify-between h-full">
      <div>
        <p className={`text-3xl font-bold ${color}`}>{count}</p>
        <p className="text-xs text-[#6B7280] mt-1">
          {count === 0 ? 'todo en orden' : 'bajo stock minimo'}
        </p>
      </div>
      <div className={`p-3 rounded-xl ${bg}`}>
        <AlertTriangle size={22} className={color} />
      </div>
    </div>
  )
}
