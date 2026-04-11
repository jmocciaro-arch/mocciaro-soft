'use client'

import { useState, useEffect } from 'react'
import { PieChart as PieChartIcon } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip } from 'recharts'
import { BRAND_COLORS } from '@/lib/utils'
import { WidgetSkeleton, WidgetError } from '../widget-wrapper'

interface BrandData {
  name: string
  value: number
  color: string
}

const DEFAULT_COLORS = ['#FF6600', '#3B82F6', '#10B981', '#F59E0B', '#8B5CF6', '#EC4899', '#06B6D4']

export function WidgetBrandDistribution() {
  const [data, setData] = useState<BrandData[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(false)

  useEffect(() => {
    async function load() {
      try {
        const supabase = createClient()
        const { data: products, error: e } = await supabase
          .from('tt_products')
          .select('brand')

        if (e) throw e

        const byBrand: Record<string, number> = {}
        ;(products || []).forEach((p: { brand: string | null }) => {
          const brand = p.brand || 'Sin marca'
          byBrand[brand] = (byBrand[brand] || 0) + 1
        })

        const chartData = Object.entries(byBrand)
          .sort((a, b) => b[1] - a[1])
          .map(([name, value], idx) => ({
            name,
            value,
            color: BRAND_COLORS[name] || DEFAULT_COLORS[idx % DEFAULT_COLORS.length],
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

  if (data.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-full text-[#4B5563] py-6">
        <PieChartIcon size={28} className="mb-2" />
        <p className="text-xs">Sin datos de marcas</p>
      </div>
    )
  }

  return (
    <div className="flex items-center gap-4 h-full">
      <div className="flex-1 h-full min-h-0">
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie
              data={data}
              cx="50%"
              cy="50%"
              innerRadius="45%"
              outerRadius="80%"
              paddingAngle={2}
              dataKey="value"
            >
              {data.map((entry, idx) => (
                <Cell key={idx} fill={entry.color} stroke="transparent" />
              ))}
            </Pie>
            <Tooltip
              contentStyle={{
                backgroundColor: '#141820',
                border: '1px solid #1E2330',
                borderRadius: '8px',
                fontSize: '12px',
              }}
              formatter={(value) => [String(value), 'Productos']}
              labelStyle={{ color: '#9CA3AF' }}
            />
          </PieChart>
        </ResponsiveContainer>
      </div>
      <div className="shrink-0 space-y-1.5 max-w-[120px]">
        {data.slice(0, 6).map(d => (
          <div key={d.name} className="flex items-center gap-2">
            <div
              className="w-2.5 h-2.5 rounded-full shrink-0"
              style={{ backgroundColor: d.color }}
            />
            <span className="text-[10px] text-[#9CA3AF] truncate">{d.name}</span>
            <span className="text-[10px] text-[#6B7280] ml-auto">{d.value}</span>
          </div>
        ))}
      </div>
    </div>
  )
}
