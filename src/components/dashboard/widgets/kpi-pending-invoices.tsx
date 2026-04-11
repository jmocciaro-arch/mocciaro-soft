'use client'

import { useState, useEffect } from 'react'
import { Receipt } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { formatCurrency } from '@/lib/utils'
import { WidgetSkeleton, WidgetError } from '../widget-wrapper'

export function KpiPendingInvoices() {
  const [count, setCount] = useState(0)
  const [value, setValue] = useState(0)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(false)

  useEffect(() => {
    async function load() {
      try {
        const supabase = createClient()
        const { data, count: c, error: e } = await supabase
          .from('tt_documents')
          .select('total', { count: 'exact' })
          .eq('type', 'delivery_note')
          .eq('invoiced', false)

        if (e) throw e
        setCount(c ?? 0)
        const sum = (data || []).reduce((acc: number, d: { total: number }) => acc + (d.total || 0), 0)
        setValue(sum)
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
        <p className="text-3xl font-bold text-amber-400">{count}</p>
        <p className="text-xs text-[#6B7280] mt-1">
          {formatCurrency(value, 'EUR')}
        </p>
      </div>
      <div className="p-3 rounded-xl bg-amber-500/10">
        <Receipt size={22} className="text-amber-400" />
      </div>
    </div>
  )
}
