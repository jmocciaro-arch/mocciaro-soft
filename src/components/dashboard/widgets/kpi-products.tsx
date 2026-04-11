'use client'

import { useState, useEffect } from 'react'
import { Package } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { WidgetSkeleton, WidgetError } from '../widget-wrapper'

export function KpiProducts() {
  const [count, setCount] = useState<number | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(false)

  useEffect(() => {
    async function load() {
      try {
        const supabase = createClient()
        const { count: c, error: e } = await supabase
          .from('tt_products')
          .select('*', { count: 'exact', head: true })
        if (e) throw e
        setCount(c ?? 0)
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
        <p className="text-3xl font-bold text-[#F0F2F5]">
          {(count ?? 0).toLocaleString('es-AR')}
        </p>
        <p className="text-xs text-[#6B7280] mt-1">en catalogo</p>
      </div>
      <div className="p-3 rounded-xl bg-emerald-500/10">
        <Package size={22} className="text-emerald-400" />
      </div>
    </div>
  )
}
