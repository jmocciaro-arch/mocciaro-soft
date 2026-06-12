'use client'

import { AlertTriangle } from 'lucide-react'
import { useStockAlerts } from '@/hooks/use-stock-alerts'
import { WidgetSkeleton, WidgetError } from '../widget-wrapper'

export function KpiStockAlerts() {
  const { count, loading, error } = useStockAlerts()

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
