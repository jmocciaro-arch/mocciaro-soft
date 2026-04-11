'use client'

import { useState, useEffect } from 'react'
import { FileText } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { formatCurrency } from '@/lib/utils'
import { WidgetSkeleton, WidgetError } from '../widget-wrapper'

export function KpiQuotesMonth() {
  const [count, setCount] = useState(0)
  const [totalValue, setTotalValue] = useState(0)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(false)

  useEffect(() => {
    async function load() {
      try {
        const supabase = createClient()
        const now = new Date()
        const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1).toISOString()

        const { data, count: c, error: e } = await supabase
          .from('tt_quotes')
          .select('total', { count: 'exact' })
          .gte('created_at', startOfMonth)

        if (e) throw e
        setCount(c ?? 0)
        const sum = (data || []).reduce((acc: number, q: { total: number }) => acc + (q.total || 0), 0)
        setTotalValue(sum)
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

  return (
    <div className="flex items-start justify-between h-full">
      <div>
        <p className="text-3xl font-bold text-[#F0F2F5]">{count}</p>
        <p className="text-xs text-[#6B7280] mt-1">
          {formatCurrency(totalValue, 'EUR')}
        </p>
      </div>
      <div className="p-3 rounded-xl bg-orange-500/10">
        <FileText size={22} className="text-[#FF6600]" />
      </div>
    </div>
  )
}
