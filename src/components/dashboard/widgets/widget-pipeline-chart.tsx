'use client'

import { useState, useEffect } from 'react'
import { BarChart3 } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell } from 'recharts'
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
        ;(ops || []).forEach((o: { stage: string; value: number }) => {
          byStage[o.stage] = (byStage[o.stage] || 0) + (o.value || 0)
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
      </div>
    )
  }

  return (
    <ResponsiveContainer width="100%" height="100%">
      <BarChart data={data} layout="vertical" margin={{ top: 5, right: 10, bottom: 5, left: 5 }}>
        <XAxis
          type="number"
          tick={{ fill: '#6B7280', fontSize: 10 }}
          tickFormatter={(v: number) => `${(v / 1000).toFixed(0)}k`}
          axisLine={false}
          tickLine={false}
        />
        <YAxis
          dataKey="label"
          type="category"
          tick={{ fill: '#9CA3AF', fontSize: 11 }}
          axisLine={false}
          tickLine={false}
          width={80}
        />
        <Tooltip
          contentStyle={{
            backgroundColor: '#141820',
            border: '1px solid #1E2330',
            borderRadius: '8px',
            fontSize: '12px',
          }}
          formatter={(value) => [formatCurrency(Number(value), 'EUR'), 'Valor']}
          labelStyle={{ color: '#9CA3AF' }}
        />
        <Bar dataKey="value" radius={[0, 4, 4, 0]} barSize={20}>
          {data.map((entry) => (
            <Cell key={entry.stage} fill={entry.color} />
          ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  )
}
