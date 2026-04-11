'use client'

import { useState, useEffect, useRef } from 'react'
import { Clock } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { formatRelative, getInitials } from '@/lib/utils'
import { Badge } from '@/components/ui/badge'
import { WidgetSkeleton, WidgetError } from '../widget-wrapper'

interface ActivityItem {
  id: string
  action: string
  description: string | null
  entity_type: string
  created_at: string
  user?: { full_name: string } | null
}

const typeColors: Record<string, 'default' | 'success' | 'warning' | 'danger' | 'info' | 'orange'> = {
  quote: 'orange',
  client: 'info',
  opportunity: 'success',
  product: 'warning',
  stock: 'default',
}

export function WidgetRecentActivity() {
  const [items, setItems] = useState<ActivityItem[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(false)
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null)

  async function load() {
    try {
      const supabase = createClient()
      const { data, error: e } = await supabase
        .from('tt_activity_log')
        .select('id, action, description, entity_type, created_at, user:tt_users(full_name)')
        .order('created_at', { ascending: false })
        .limit(15)

      if (e) throw e
      setItems((data as unknown as ActivityItem[]) || [])
    } catch {
      setError(true)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    load()
    // Auto-refresh cada 60s
    intervalRef.current = setInterval(load, 60000)
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current)
    }
  }, [])

  if (loading) return <WidgetSkeleton />
  if (error) return <WidgetError />

  if (items.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-full text-[#4B5563] py-6">
        <Clock size={28} className="mb-2" />
        <p className="text-xs">No hay actividad registrada</p>
      </div>
    )
  }

  return (
    <div className="space-y-2">
      {items.map(item => (
        <div
          key={item.id}
          className="flex items-start gap-2.5 p-2 rounded-lg hover:bg-[#1A1F2E] transition-colors"
        >
          <div className="w-7 h-7 rounded-full bg-[#1E2330] flex items-center justify-center shrink-0 text-[10px] font-medium text-[#9CA3AF]">
            {item.user?.full_name ? getInitials(item.user.full_name) : 'S'}
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-1.5 flex-wrap">
              <p className="text-xs font-medium text-[#F0F2F5] truncate">{item.action}</p>
              <Badge variant={typeColors[item.entity_type] || 'default'}>
                {item.entity_type}
              </Badge>
            </div>
            {item.description && (
              <p className="text-[11px] text-[#6B7280] mt-0.5 truncate">{item.description}</p>
            )}
            <p className="text-[10px] text-[#4B5563] mt-0.5">
              {item.user?.full_name || 'Sistema'} &middot; {formatRelative(item.created_at)}
            </p>
          </div>
        </div>
      ))}
    </div>
  )
}
