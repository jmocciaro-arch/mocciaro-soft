'use client'

import { useState, useEffect } from 'react'
import { Calendar, Clock } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { WidgetSkeleton, WidgetError } from '../widget-wrapper'

interface Event {
  id: string
  action: string
  description: string | null
  created_at: string
}

export function WidgetCalendarToday() {
  const [events, setEvents] = useState<Event[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(false)

  useEffect(() => {
    async function load() {
      try {
        const supabase = createClient()
        const today = new Date()
        const startOfDay = new Date(today.getFullYear(), today.getMonth(), today.getDate()).toISOString()
        const endOfDay = new Date(today.getFullYear(), today.getMonth(), today.getDate() + 1).toISOString()

        const { data, error: e } = await supabase
          .from('tt_activity_log')
          .select('id, action, description, created_at')
          .gte('created_at', startOfDay)
          .lt('created_at', endOfDay)
          .order('created_at', { ascending: true })
          .limit(15)

        if (e) throw e
        setEvents((data as Event[]) || [])
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

  const todayStr = new Date().toLocaleDateString('es-AR', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
  })

  if (events.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-full text-[#4B5563] py-6">
        <Calendar size={28} className="mb-2" />
        <p className="text-xs capitalize">{todayStr}</p>
        <p className="text-[10px] mt-1">Sin eventos para hoy</p>
      </div>
    )
  }

  return (
    <div>
      <p className="text-xs text-[#6B7280] mb-3 capitalize">{todayStr}</p>
      <div className="space-y-2">
        {events.map(ev => {
          const time = new Date(ev.created_at).toLocaleTimeString('es-AR', {
            hour: '2-digit',
            minute: '2-digit',
          })
          return (
            <div
              key={ev.id}
              className="flex items-start gap-2.5 p-2 rounded-lg hover:bg-[#1A1F2E] transition-colors"
            >
              <div className="flex items-center gap-1 text-[10px] text-[#FF6600] font-mono shrink-0 mt-0.5 w-12">
                <Clock size={10} />
                {time}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-xs text-[#F0F2F5] truncate">{ev.action}</p>
                {ev.description && (
                  <p className="text-[10px] text-[#6B7280] truncate">{ev.description}</p>
                )}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
