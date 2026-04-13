'use client'

import { useState, useEffect } from 'react'
import { BarChart3 } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { CRM_STAGES, formatCurrency } from '@/lib/utils'
import { WidgetSkeleton, WidgetError } from '../widget-wrapper'

interface StageData {
  stage: string
  label: string
  value: number
  color: string
}

export function WidgetPipelineChart() {
  const [data, setData] = useState<StageData[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(false)

  useEffect(() => {
    async function load() {
      try {
        const supabase = createClient()
        const { data: ops, error: e } = await supabase
          .from('tt_opportunities')
          .select('stage, value')

        if (e) throw e

        const byStage: Record<string, number> = {}
        ;(ops || []).forEach((o: Record<string, unknown>) => {
          const stage = o.stage as string
          const val = (o.value as number) || 0
          byStage[stage] = (byStage[stage] || 0) + val
        })

        const chartData = CRM_STAGES
          .filter(s => s.id !== 'perdido')
          .map(s => ({
            stage: s.id,
            label: s.label,
            value: byStage[s.id] || 0,
            color: s.color,
          }))

        setData(chartData)
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

  if (data.every(d => d.value === 0)) {
    return (
      <div className="flex flex-col items-center justify-center h-full text-[#4B5563] py-6">
        <BarChart3 size={28} className="mb-2" />
        <p className="text-xs">Sin datos de pipeline</p>
        <p className="text-[10px] mt-1">Crea oportunidades en CRM / Leads</p>
      </div>
    )
  }

  // Simple bar chart without recharts (avoids SSR issues)
  const maxVal = Math.max(...data.map(d => d.value), 1)

  return (
    <div className="space-y-3 py-2">
      {data.map(d => {
        const width = Math.max((d.value / maxVal) * 100, 3)
        return (
          <div key={d.stage}>
            <div className="flex justify-between text-xs mb-1">
              <span className="text-[#9CA3AF] flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full" style={{ backgroundColor: d.color }} />
                {d.label}
              </span>
              <span className="text-[#F0F2F5] font-medium">{formatCurrency(d.value)}</span>
            </div>
            <div className="w-full h-3 rounded-full bg-[#1E2330] overflow-hidden">
              <div
                className="h-full rounded-full transition-all duration-500"
                style={{ width: `${width}%`, backgroundColor: d.color }}
              />
            </div>
          </div>
        )
      })}
    </div>
  )
}
