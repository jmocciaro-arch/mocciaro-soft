'use client'

import { useState, useEffect } from 'react'
import { TrendingUp } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, Area, AreaChart } from 'recharts'
import { WidgetSkeleton, WidgetError } from '../widget-wrapper'

interface MonthData {
  month: string
  count: number
  total: number
}

export function WidgetSalesChart() {
  const [data, setData] = useState<MonthData[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(false)

  useEffect(() => {
    async function load() {
      try {
        const supabase = createClient()
        const now = new Date()
        const sixMonthsAgo = new Date(now.getFullYear(), now.getMonth() - 5, 1)

        const { data: quotes, error: e } = await supabase
          .from('tt_quotes')
          .select('created_at, total')
          .gte('created_at', sixMonthsAgo.toISOString())
          .order('created_at', { ascending: true })

        if (e) throw e

        // Agrupar por mes
        const months: Record<string, { count: number; total: number }> = {}
        const monthNames = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic']

        for (let i = 5; i >= 0; i--) {
          const d = new Date(now.getFullYear(), now.getMonth() - i, 1)
          const key = `${d.getFullYear()}-${d.getMonth()}`
          months[key] = { count: 0, total: 0 }
        }

        ;(quotes || []).forEach((q: { created_at: string; total: number }) => {
          const d = new Date(q.created_at)
          const key = `${d.getFullYear()}-${d.getMonth()}`
          if (months[key]) {
            months[key].count++
            months[key].total += q.total || 0
          }
        })

        const chartData = Object.entries(months).map(([key, val]) => {
          const [, m] = key.split('-')
          return {
            month: monthNames[parseInt(m)],
            count: val.count,
            total: val.total,
          }
        })

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

  if (data.every(d => d.count === 0)) {
    return (
      <div className="flex flex-col items-center justify-center h-full text-[#4B5563] py-6">
        <TrendingUp size={28} className="mb-2" />
        <p className="text-xs">Sin datos de ventas</p>
      </div>
    )
  }

  return (
    <ResponsiveContainer width="100%" height="100%">
      <AreaChart data={data} margin={{ top: 5, right: 10, bottom: 5, left: 5 }}>
        <defs>
          <linearGradient id="colorQuotes" x1="0" y1="0" x2="0" y2="1">
            <stop offset="5%" stopColor="#FF6600" stopOpacity={0.3} />
            <stop offset="95%" stopColor="#FF6600" stopOpacity={0} />
          </linearGradient>
        </defs>
        <XAxis
          dataKey="month"
          tick={{ fill: '#6B7280', fontSize: 11 }}
          axisLine={false}
          tickLine={false}
        />
        <YAxis
          tick={{ fill: '#6B7280', fontSize: 10 }}
          axisLine={false}
          tickLine={false}
          width={30}
        />
        <Tooltip
          contentStyle={{
            backgroundColor: '#141820',
            border: '1px solid #1E2330',
            borderRadius: '8px',
            fontSize: '12px',
          }}
          formatter={(value, name) => [
            String(value),
            name === 'count' ? 'Cotizaciones' : 'Valor',
          ]}
          labelStyle={{ color: '#9CA3AF' }}
        />
        <Area
          type="monotone"
          dataKey="count"
          stroke="#FF6600"
          strokeWidth={2}
          fill="url(#colorQuotes)"
          dot={{ fill: '#FF6600', r: 3 }}
          activeDot={{ r: 5, stroke: '#FF6600', strokeWidth: 2 }}
        />
      </AreaChart>
    </ResponsiveContainer>
  )
}
