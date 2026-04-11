'use client'

import { useState, useEffect } from 'react'
import { Users } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { WidgetSkeleton, WidgetError } from '../widget-wrapper'

export function KpiClients() {
  const [count, setCount] = useState<number | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(false)

  useEffect(() => {
    async function load() {
      try {
        const supabase = createClient()
        const { count: c, error: e } = await supabase
          .from('tt_clients')
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
        <p className="text-xs text-[#6B7280] mt-1">registrados</p>
      </div>
      <div className="p-3 rounded-xl bg-blue-500/10">
        <Users size={22} className="text-blue-400" />
      </div>
    </div>
  )
}
