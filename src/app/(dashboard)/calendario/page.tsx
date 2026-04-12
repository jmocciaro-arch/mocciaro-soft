'use client'

import { useState, useEffect, useCallback, useMemo } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Modal } from '@/components/ui/modal'
import { formatDate, formatDateTime } from '@/lib/utils'
import {
  Calendar, ChevronLeft, ChevronRight, Clock, Loader2,
  FileText, Truck, CreditCard, Wrench, Users, Package
} from 'lucide-react'

type ActivityEvent = {
  id: string
  entity_type: string
  action: string
  detail: string
  created_at: string
}

const ENTITY_ICONS: Record<string, typeof FileText> = {
  quote: FileText,
  sales_order: Package,
  purchase_order: Package,
  delivery_note: Truck,
  invoice: CreditCard,
  sat_ticket: Wrench,
  client: Users,
}

const ENTITY_COLORS: Record<string, string> = {
  quote: '#FF6600',
  sales_order: '#3B82F6',
  purchase_order: '#8B5CF6',
  delivery_note: '#10B981',
  invoice: '#F59E0B',
  sat_ticket: '#EF4444',
  client: '#6366F1',
}

const MONTHS_ES = [
  'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
  'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'
]

const DAYS_ES = ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom']

export default function CalendarioPage() {
  const supabase = createClient()

  const [currentDate, setCurrentDate] = useState(new Date())
  const [events, setEvents] = useState<ActivityEvent[]>([])
  const [loading, setLoading] = useState(true)
  const [selectedDay, setSelectedDay] = useState<Date | null>(null)
  const [showDayModal, setShowDayModal] = useState(false)

  const year = currentDate.getFullYear()
  const month = currentDate.getMonth()

  const loadEvents = useCallback(async () => {
    setLoading(true)
    const sb = createClient()
    const start = new Date(year, month, 1)
    const end = new Date(year, month + 1, 0, 23, 59, 59)

    const { data } = await sb
      .from('tt_activity_log')
      .select('id, entity_type, action, detail, created_at')
      .gte('created_at', start.toISOString())
      .lte('created_at', end.toISOString())
      .order('created_at', { ascending: false })
      .limit(500)

    setEvents(data || [])
    setLoading(false)
  }, [year, month])

  useEffect(() => { loadEvents() }, [loadEvents])

  const prevMonth = () => setCurrentDate(new Date(year, month - 1, 1))
  const nextMonth = () => setCurrentDate(new Date(year, month + 1, 1))
  const goToday = () => setCurrentDate(new Date())

  // Build calendar grid
  const calendarDays = useMemo(() => {
    const firstDay = new Date(year, month, 1)
    let startDay = firstDay.getDay() - 1 // Monday = 0
    if (startDay < 0) startDay = 6
    const daysInMonth = new Date(year, month + 1, 0).getDate()
    const daysInPrevMonth = new Date(year, month, 0).getDate()

    const days: Array<{ date: Date; currentMonth: boolean; events: ActivityEvent[] }> = []

    // Previous month days
    for (let i = startDay - 1; i >= 0; i--) {
      days.push({
        date: new Date(year, month - 1, daysInPrevMonth - i),
        currentMonth: false,
        events: [],
      })
    }

    // Current month days
    for (let d = 1; d <= daysInMonth; d++) {
      const date = new Date(year, month, d)
      const dayStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`
      const dayEvents = events.filter(e => e.created_at?.startsWith(dayStr))
      days.push({ date, currentMonth: true, events: dayEvents })
    }

    // Next month days to complete grid
    const remaining = 42 - days.length
    for (let d = 1; d <= remaining; d++) {
      days.push({
        date: new Date(year, month + 1, d),
        currentMonth: false,
        events: [],
      })
    }

    return days
  }, [year, month, events])

  const today = new Date()
  const isToday = (date: Date) =>
    date.getDate() === today.getDate() &&
    date.getMonth() === today.getMonth() &&
    date.getFullYear() === today.getFullYear()

  const openDay = (day: { date: Date; events: ActivityEvent[] }) => {
    if (day.events.length === 0) return
    setSelectedDay(day.date)
    setShowDayModal(true)
  }

  const dayEvents = selectedDay
    ? events.filter(e => {
        const d = new Date(e.created_at)
        return d.getDate() === selectedDay.getDate() && d.getMonth() === selectedDay.getMonth() && d.getFullYear() === selectedDay.getFullYear()
      })
    : []

  // Today sidebar events
  const todayStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`
  const todayEvents = events.filter(e => e.created_at?.startsWith(todayStr))

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-[#F0F2F5]">Calendario</h1>
          <p className="text-sm text-[#6B7280] mt-1">
            {today.toLocaleDateString('es-AR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}
          </p>
        </div>
        <Button variant="secondary" onClick={goToday}>Hoy</Button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
        {/* Calendar Grid */}
        <Card className="lg:col-span-3 p-4">
          <div className="flex items-center justify-between mb-4">
            <Button variant="ghost" size="sm" onClick={prevMonth}><ChevronLeft size={18} /></Button>
            <h2 className="text-lg font-semibold text-[#F0F2F5]">
              {MONTHS_ES[month]} {year}
            </h2>
            <Button variant="ghost" size="sm" onClick={nextMonth}><ChevronRight size={18} /></Button>
          </div>

          {loading ? (
            <div className="flex items-center justify-center py-20">
              <Loader2 className="animate-spin text-[#FF6600]" size={32} />
            </div>
          ) : (
            <div className="grid grid-cols-7 gap-px bg-[#1E2330] rounded-lg overflow-hidden">
              {/* Day headers */}
              {DAYS_ES.map(d => (
                <div key={d} className="bg-[#0F1218] px-2 py-2 text-center text-xs font-semibold text-[#6B7280]">
                  {d}
                </div>
              ))}

              {/* Days */}
              {calendarDays.map((day, idx) => (
                <div
                  key={idx}
                  onClick={() => openDay(day)}
                  className={`bg-[#141820] min-h-[80px] p-1.5 transition-colors ${
                    day.currentMonth ? '' : 'opacity-30'
                  } ${
                    isToday(day.date) ? 'ring-1 ring-[#FF6600] ring-inset' : ''
                  } ${
                    day.events.length > 0 ? 'cursor-pointer hover:bg-[#1A1F2E]' : ''
                  }`}
                >
                  <span className={`text-xs font-medium ${
                    isToday(day.date) ? 'text-[#FF6600] font-bold' : day.currentMonth ? 'text-[#D1D5DB]' : 'text-[#4B5563]'
                  }`}>
                    {day.date.getDate()}
                  </span>

                  {/* Event dots */}
                  <div className="flex flex-wrap gap-0.5 mt-1">
                    {day.events.slice(0, 4).map((ev, i) => (
                      <div
                        key={i}
                        className="w-1.5 h-1.5 rounded-full"
                        style={{ backgroundColor: ENTITY_COLORS[ev.entity_type] || '#FF6600' }}
                        title={ev.detail}
                      />
                    ))}
                    {day.events.length > 4 && (
                      <span className="text-[8px] text-[#6B7280]">+{day.events.length - 4}</span>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Legend */}
          <div className="flex flex-wrap gap-4 mt-4">
            {Object.entries(ENTITY_COLORS).map(([key, color]) => (
              <div key={key} className="flex items-center gap-1.5">
                <div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: color }} />
                <span className="text-[10px] text-[#6B7280] capitalize">{key.replace('_', ' ')}</span>
              </div>
            ))}
          </div>
        </Card>

        {/* Today sidebar */}
        <div className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-sm">Hoy</CardTitle>
              {todayEvents.length > 0 && (
                <Badge variant="orange">{todayEvents.length}</Badge>
              )}
            </CardHeader>
            <CardContent>
              {todayEvents.length === 0 ? (
                <p className="text-sm text-[#6B7280] text-center py-4">Sin actividad hoy</p>
              ) : (
                <div className="space-y-2 max-h-[400px] overflow-y-auto">
                  {todayEvents.slice(0, 10).map((ev) => {
                    const Icon = ENTITY_ICONS[ev.entity_type] || Clock
                    const color = ENTITY_COLORS[ev.entity_type] || '#FF6600'
                    return (
                      <div key={ev.id} className="flex items-start gap-2 p-2 rounded-lg bg-[#0F1218]">
                        <div className="p-1 rounded" style={{ backgroundColor: `${color}20` }}>
                          <Icon size={12} style={{ color }} />
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-xs text-[#D1D5DB] truncate">{ev.detail}</p>
                          <p className="text-[10px] text-[#4B5563]">
                            {new Date(ev.created_at).toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' })}
                          </p>
                        </div>
                      </div>
                    )
                  })}
                </div>
              )}
            </CardContent>
          </Card>

          {/* Stats */}
          <Card>
            <CardHeader>
              <CardTitle className="text-sm">Este mes</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-2">
                {Object.entries(ENTITY_COLORS).map(([type, color]) => {
                  const count = events.filter(e => e.entity_type === type).length
                  if (count === 0) return null
                  return (
                    <div key={type} className="flex items-center justify-between">
                      <span className="text-xs text-[#6B7280] capitalize">{type.replace('_', ' ')}</span>
                      <span className="text-xs font-bold" style={{ color }}>{count}</span>
                    </div>
                  )
                })}
                <div className="pt-2 border-t border-[#1E2330] flex items-center justify-between">
                  <span className="text-xs text-[#6B7280]">Total actividades</span>
                  <span className="text-xs font-bold text-[#FF6600]">{events.length}</span>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>

      {/* ─── DAY MODAL ─── */}
      <Modal
        isOpen={showDayModal}
        onClose={() => setShowDayModal(false)}
        title={selectedDay ? `${selectedDay.toLocaleDateString('es-AR', { weekday: 'long', day: 'numeric', month: 'long' })}` : ''}
        size="lg"
      >
        <div className="space-y-3 max-h-[60vh] overflow-y-auto">
          {dayEvents.length === 0 ? (
            <p className="text-sm text-[#6B7280] text-center py-8">Sin actividad este día</p>
          ) : (
            dayEvents.map((ev) => {
              const Icon = ENTITY_ICONS[ev.entity_type] || Clock
              const color = ENTITY_COLORS[ev.entity_type] || '#FF6600'
              return (
                <div key={ev.id} className="flex items-start gap-3 p-3 rounded-lg bg-[#0F1218]">
                  <div className="p-2 rounded-lg" style={{ backgroundColor: `${color}15` }}>
                    <Icon size={16} style={{ color }} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <Badge variant="default" size="sm">{ev.entity_type.replace('_', ' ')}</Badge>
                      <Badge variant="info" size="sm">{ev.action}</Badge>
                    </div>
                    <p className="text-sm text-[#D1D5DB] mt-1">{ev.detail}</p>
                    <p className="text-[10px] text-[#4B5563] mt-1">{formatDateTime(ev.created_at)}</p>
                  </div>
                </div>
              )
            })
          )}
        </div>
      </Modal>
    </div>
  )
}
