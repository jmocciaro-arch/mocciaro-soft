'use client'

import { useState, useEffect, useCallback, useMemo } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Select } from '@/components/ui/select'
import { Badge } from '@/components/ui/badge'
import { Modal } from '@/components/ui/modal'
import { KPICard } from '@/components/ui/kpi-card'
import { useToast } from '@/components/ui/toast'
import { useCompanyFilter } from '@/hooks/use-company-filter'
import { formatDate, formatDateTime } from '@/lib/utils'
import {
  Calendar, ChevronLeft, ChevronRight, Clock, Loader2,
  FileText, Truck, CreditCard, Wrench, Users, Package,
  Plus, X, Edit2, Trash2
} from 'lucide-react'

type Row = Record<string, unknown>

type CalendarEvent = {
  id: string
  ticket_id: string | null
  maintenance_id: string | null
  title: string
  start_date: string
  end_date: string | null
  all_day: boolean
  assigned_to: string | null
  status: string
  color: string | null
  notes: string | null
  company_id: string | null
  tt_users?: { full_name: string } | null
}

const STATUS_OPTIONS = [
  { value: 'scheduled', label: 'Programado' },
  { value: 'in_progress', label: 'En progreso' },
  { value: 'completed', label: 'Completado' },
  { value: 'cancelled', label: 'Cancelado' },
]

const STATUS_COLORS: Record<string, string> = {
  scheduled: '#3B82F6',
  in_progress: '#F59E0B',
  completed: '#10B981',
  cancelled: '#6B7280',
}

const STATUS_LABELS: Record<string, string> = {
  scheduled: 'Programado',
  in_progress: 'En progreso',
  completed: 'Completado',
  cancelled: 'Cancelado',
}

const MONTHS_ES = [
  'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
  'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'
]

const DAYS_ES = ['Lun', 'Mar', 'Mie', 'Jue', 'Vie', 'Sab', 'Dom']

export default function CalendarioPage() {
  const { filterByCompany, companyKey, defaultCompanyId } = useCompanyFilter()
  const { addToast } = useToast()

  const [currentDate, setCurrentDate] = useState(new Date())
  const [events, setEvents] = useState<CalendarEvent[]>([])
  const [users, setUsers] = useState<Array<Row>>([])
  const [loading, setLoading] = useState(true)
  const [techFilter, setTechFilter] = useState('')

  // Modal state
  const [showEventModal, setShowEventModal] = useState(false)
  const [showDetailModal, setShowDetailModal] = useState(false)
  const [selectedEvent, setSelectedEvent] = useState<CalendarEvent | null>(null)
  const [saving, setSaving] = useState(false)

  const emptyForm = {
    title: '',
    start_date: '',
    end_date: '',
    all_day: true,
    assigned_to: '',
    status: 'scheduled',
    color: '#3B82F6',
    notes: '',
  }
  const [form, setForm] = useState(emptyForm)

  const year = currentDate.getFullYear()
  const month = currentDate.getMonth()

  const loadEvents = useCallback(async () => {
    setLoading(true)
    const sb = createClient()

    const start = new Date(year, month, 1)
    const end = new Date(year, month + 1, 0, 23, 59, 59)

    let q = sb
      .from('tt_sat_calendar_events')
      .select('*, tt_users:assigned_to(full_name)')
      .gte('start_date', start.toISOString())
      .lte('start_date', end.toISOString())
      .order('start_date', { ascending: true })
    q = filterByCompany(q)

    if (techFilter) {
      q = q.eq('assigned_to', techFilter)
    }

    const { data, error } = await q
    if (error) { addToast({ type: 'error', title: 'Error cargando eventos', message: error.message }) }
    setEvents((data || []) as CalendarEvent[])
    setLoading(false)
  }, [year, month, companyKey, techFilter])

  useEffect(() => { loadEvents() }, [loadEvents])

  // Load users on mount
  useEffect(() => {
    (async () => {
      const sb = createClient()
      const { data } = await sb.from('tt_users').select('id, full_name, email').order('full_name')
      setUsers(data || [])
    })()
  }, [])

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

    const days: Array<{ date: Date; currentMonth: boolean; dateStr: string }> = []

    // Previous month days
    for (let i = startDay - 1; i >= 0; i--) {
      const d = new Date(year, month - 1, daysInPrevMonth - i)
      days.push({
        date: d,
        currentMonth: false,
        dateStr: `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`,
      })
    }

    // Current month days
    for (let d = 1; d <= daysInMonth; d++) {
      const date = new Date(year, month, d)
      days.push({
        date,
        currentMonth: true,
        dateStr: `${year}-${String(month + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`,
      })
    }

    // Next month days to complete grid (6 rows)
    const remaining = 42 - days.length
    for (let d = 1; d <= remaining; d++) {
      const date = new Date(year, month + 1, d)
      days.push({
        date,
        currentMonth: false,
        dateStr: `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`,
      })
    }

    return days
  }, [year, month])

  // Group events by day
  const eventsByDay = useMemo(() => {
    const map: Record<string, CalendarEvent[]> = {}
    events.forEach(ev => {
      const d = new Date(ev.start_date)
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
      if (!map[key]) map[key] = []
      map[key].push(ev)
    })
    return map
  }, [events])

  const today = new Date()
  const isToday = (date: Date) =>
    date.getDate() === today.getDate() &&
    date.getMonth() === today.getMonth() &&
    date.getFullYear() === today.getFullYear()

  // Click a day to create new event
  const clickDay = (day: { date: Date; dateStr: string }) => {
    const dateForInput = day.dateStr
    setSelectedEvent(null)
    setForm({
      ...emptyForm,
      start_date: dateForInput,
      end_date: dateForInput,
    })
    setShowEventModal(true)
  }

  // Click an event to see detail
  const clickEvent = (ev: CalendarEvent, e: React.MouseEvent) => {
    e.stopPropagation()
    setSelectedEvent(ev)
    setShowDetailModal(true)
  }

  // Open edit from detail modal
  const editEvent = () => {
    if (!selectedEvent) return
    const startD = new Date(selectedEvent.start_date)
    const startStr = `${startD.getFullYear()}-${String(startD.getMonth() + 1).padStart(2, '0')}-${String(startD.getDate()).padStart(2, '0')}`
    let endStr = startStr
    if (selectedEvent.end_date) {
      const endD = new Date(selectedEvent.end_date)
      endStr = `${endD.getFullYear()}-${String(endD.getMonth() + 1).padStart(2, '0')}-${String(endD.getDate()).padStart(2, '0')}`
    }
    setForm({
      title: selectedEvent.title || '',
      start_date: startStr,
      end_date: endStr,
      all_day: selectedEvent.all_day,
      assigned_to: selectedEvent.assigned_to || '',
      status: selectedEvent.status || 'scheduled',
      color: selectedEvent.color || STATUS_COLORS[selectedEvent.status] || '#3B82F6',
      notes: selectedEvent.notes || '',
    })
    setShowDetailModal(false)
    setShowEventModal(true)
  }

  const handleSave = async () => {
    if (!form.title.trim()) { addToast({ type: 'warning', title: 'Ingresa un titulo' }); return }
    if (!form.start_date) { addToast({ type: 'warning', title: 'Selecciona fecha de inicio' }); return }
    setSaving(true)
    const sb = createClient()

    const color = STATUS_COLORS[form.status] || form.color || '#3B82F6'

    const payload = {
      title: form.title,
      start_date: new Date(form.start_date + 'T08:00:00').toISOString(),
      end_date: form.end_date ? new Date(form.end_date + 'T18:00:00').toISOString() : null,
      all_day: form.all_day,
      assigned_to: form.assigned_to || null,
      status: form.status,
      color,
      notes: form.notes || null,
      company_id: defaultCompanyId,
    }

    if (selectedEvent) {
      // Update
      const { error } = await sb.from('tt_sat_calendar_events').update(payload).eq('id', selectedEvent.id)
      if (error) { addToast({ type: 'error', title: 'Error', message: error.message }); setSaving(false); return }
      addToast({ type: 'success', title: 'Evento actualizado' })
    } else {
      // Create
      const { error } = await sb.from('tt_sat_calendar_events').insert(payload)
      if (error) { addToast({ type: 'error', title: 'Error', message: error.message }); setSaving(false); return }
      addToast({ type: 'success', title: 'Evento creado' })
    }

    setShowEventModal(false)
    setSaving(false)
    setSelectedEvent(null)
    loadEvents()
  }

  const deleteEvent = async () => {
    if (!selectedEvent) return
    const sb = createClient()
    const { error } = await sb.from('tt_sat_calendar_events').delete().eq('id', selectedEvent.id)
    if (error) { addToast({ type: 'error', title: 'Error', message: error.message }); return }
    addToast({ type: 'success', title: 'Evento eliminado' })
    setShowDetailModal(false)
    setSelectedEvent(null)
    loadEvents()
  }

  // KPIs
  const todayStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`
  const todayEvents = eventsByDay[todayStr] || []
  const scheduledCount = events.filter(e => e.status === 'scheduled').length
  const inProgressCount = events.filter(e => e.status === 'in_progress').length
  const completedCount = events.filter(e => e.status === 'completed').length

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-[#F0F2F5]">Calendario SAT</h1>
          <p className="text-sm text-[#6B7280] mt-1">
            {today.toLocaleDateString('es-AR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}
          </p>
        </div>
        <div className="flex gap-2">
          <Select
            options={[{ value: '', label: 'Todos los tecnicos' }, ...users.map(u => ({ value: u.id as string, label: u.full_name as string }))]}
            value={techFilter}
            onChange={(e) => setTechFilter(e.target.value)}
          />
          <Button variant="secondary" onClick={goToday}>Hoy</Button>
        </div>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <KPICard label="Eventos hoy" value={todayEvents.length} icon={<Calendar size={22} />} color="#FF6600" />
        <KPICard label="Programados" value={scheduledCount} icon={<Clock size={22} />} color="#3B82F6" />
        <KPICard label="En progreso" value={inProgressCount} icon={<Wrench size={22} />} color="#F59E0B" />
        <KPICard label="Completados" value={completedCount} icon={<Package size={22} />} color="#10B981" />
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
              {calendarDays.map((day, idx) => {
                const dayEvs = eventsByDay[day.dateStr] || []
                return (
                  <div
                    key={idx}
                    onClick={() => clickDay(day)}
                    className={`bg-[#141820] min-h-[90px] p-1.5 transition-colors cursor-pointer hover:bg-[#1A1F2E] ${
                      day.currentMonth ? '' : 'opacity-30'
                    } ${
                      isToday(day.date) ? 'ring-1 ring-[#FF6600] ring-inset' : ''
                    }`}
                  >
                    <div className="flex items-center justify-between mb-1">
                      <span className={`text-xs font-medium ${
                        isToday(day.date) ? 'text-[#FF6600] font-bold' : day.currentMonth ? 'text-[#D1D5DB]' : 'text-[#4B5563]'
                      }`}>
                        {day.date.getDate()}
                      </span>
                      {dayEvs.length > 0 && (
                        <span className="text-[8px] text-[#6B7280] bg-[#1E2330] px-1 rounded">{dayEvs.length}</span>
                      )}
                    </div>

                    {/* Event bars */}
                    <div className="space-y-0.5">
                      {dayEvs.slice(0, 3).map((ev) => (
                        <button
                          key={ev.id}
                          onClick={(e) => clickEvent(ev, e)}
                          className="w-full text-left px-1 py-0.5 rounded text-[9px] font-medium truncate transition-opacity hover:opacity-80"
                          style={{
                            backgroundColor: `${ev.color || STATUS_COLORS[ev.status] || '#3B82F6'}20`,
                            color: ev.color || STATUS_COLORS[ev.status] || '#3B82F6',
                            borderLeft: `2px solid ${ev.color || STATUS_COLORS[ev.status] || '#3B82F6'}`,
                          }}
                        >
                          {ev.title}
                        </button>
                      ))}
                      {dayEvs.length > 3 && (
                        <span className="text-[8px] text-[#6B7280] pl-1">+{dayEvs.length - 3} mas</span>
                      )}
                    </div>
                  </div>
                )
              })}
            </div>
          )}

          {/* Legend */}
          <div className="flex flex-wrap gap-4 mt-4">
            {Object.entries(STATUS_COLORS).map(([key, color]) => (
              <div key={key} className="flex items-center gap-1.5">
                <div className="w-2.5 h-2.5 rounded-sm" style={{ backgroundColor: color }} />
                <span className="text-[10px] text-[#6B7280]">{STATUS_LABELS[key]}</span>
              </div>
            ))}
          </div>
        </Card>

        {/* Today sidebar */}
        <div className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-sm">Eventos de hoy</CardTitle>
              {todayEvents.length > 0 && (
                <Badge variant="orange">{todayEvents.length}</Badge>
              )}
            </CardHeader>
            <CardContent>
              {todayEvents.length === 0 ? (
                <p className="text-sm text-[#6B7280] text-center py-4">Sin eventos hoy</p>
              ) : (
                <div className="space-y-2 max-h-[300px] overflow-y-auto">
                  {todayEvents.map((ev) => {
                    const color = ev.color || STATUS_COLORS[ev.status] || '#3B82F6'
                    return (
                      <button
                        key={ev.id}
                        onClick={(e) => clickEvent(ev, e)}
                        className="w-full text-left flex items-start gap-2 p-2 rounded-lg bg-[#0F1218] hover:bg-[#1A1F2E] transition-colors"
                      >
                        <div
                          className="w-1 h-full min-h-[32px] rounded-full shrink-0"
                          style={{ backgroundColor: color }}
                        />
                        <div className="flex-1 min-w-0">
                          <p className="text-xs text-[#D1D5DB] font-medium truncate">{ev.title}</p>
                          <div className="flex items-center gap-2 mt-0.5">
                            <Badge
                              variant={ev.status === 'completed' ? 'success' : ev.status === 'in_progress' ? 'warning' : ev.status === 'cancelled' ? 'default' : 'info'}
                              size="sm"
                            >
                              {STATUS_LABELS[ev.status] || ev.status}
                            </Badge>
                            {ev.tt_users?.full_name && (
                              <span className="text-[9px] text-[#4B5563]">{ev.tt_users.full_name}</span>
                            )}
                          </div>
                        </div>
                      </button>
                    )
                  })}
                </div>
              )}
            </CardContent>
          </Card>

          {/* Month stats */}
          <Card>
            <CardHeader>
              <CardTitle className="text-sm">Este mes</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-2">
                {Object.entries(STATUS_COLORS).map(([status, color]) => {
                  const count = events.filter(e => e.status === status).length
                  if (count === 0) return null
                  return (
                    <div key={status} className="flex items-center justify-between">
                      <span className="text-xs text-[#6B7280]">{STATUS_LABELS[status]}</span>
                      <span className="text-xs font-bold" style={{ color }}>{count}</span>
                    </div>
                  )
                })}
                <div className="pt-2 border-t border-[#1E2330] flex items-center justify-between">
                  <span className="text-xs text-[#6B7280]">Total eventos</span>
                  <span className="text-xs font-bold text-[#FF6600]">{events.length}</span>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Quick create */}
          <Card hover onClick={() => {
            const tStr = todayStr
            setSelectedEvent(null)
            setForm({ ...emptyForm, start_date: tStr, end_date: tStr })
            setShowEventModal(true)
          }}>
            <div className="flex items-center gap-3 text-[#6B7280] hover:text-[#FF6600] transition-colors">
              <Plus size={20} />
              <span className="text-sm font-medium">Crear evento rapido</span>
            </div>
          </Card>
        </div>
      </div>

      {/* ─── CREATE / EDIT EVENT MODAL ─── */}
      <Modal
        isOpen={showEventModal}
        onClose={() => { setShowEventModal(false); setSelectedEvent(null) }}
        title={selectedEvent ? 'Editar evento' : 'Nuevo evento'}
        size="lg"
      >
        <div className="space-y-4">
          <Input
            label="Titulo *"
            value={form.title}
            onChange={(e) => setForm({ ...form, title: e.target.value })}
            placeholder="Ej: Mantenimiento preventivo - Cliente X"
          />

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Input
              label="Fecha inicio *"
              type="date"
              value={form.start_date}
              onChange={(e) => setForm({ ...form, start_date: e.target.value })}
            />
            <Input
              label="Fecha fin"
              type="date"
              value={form.end_date}
              onChange={(e) => setForm({ ...form, end_date: e.target.value })}
            />
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Select
              label="Tecnico asignado"
              options={[{ value: '', label: 'Sin asignar' }, ...users.map(u => ({ value: u.id as string, label: u.full_name as string }))]}
              value={form.assigned_to}
              onChange={(e) => setForm({ ...form, assigned_to: e.target.value })}
            />
            <Select
              label="Estado"
              options={STATUS_OPTIONS}
              value={form.status}
              onChange={(e) => setForm({ ...form, status: e.target.value })}
            />
          </div>

          {/* All day toggle */}
          <div className="flex items-center justify-between p-3 rounded-lg bg-[#0F1218] border border-[#1E2330]">
            <div>
              <p className="text-sm font-medium text-[#F0F2F5]">Todo el dia</p>
              <p className="text-xs text-[#6B7280]">El evento abarca el dia completo</p>
            </div>
            <button
              onClick={() => setForm({ ...form, all_day: !form.all_day })}
              className={`relative w-11 h-6 rounded-full transition-colors ${form.all_day ? 'bg-[#FF6600]' : 'bg-[#2A3040]'}`}
            >
              <span className={`absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-white transition-transform ${form.all_day ? 'translate-x-5' : ''}`} />
            </button>
          </div>

          <div>
            <label className="block text-sm font-medium text-[#9CA3AF] mb-1.5">Notas</label>
            <textarea
              value={form.notes}
              onChange={(e) => setForm({ ...form, notes: e.target.value })}
              className="w-full h-20 rounded-lg bg-[#1E2330] border border-[#2A3040] px-3 py-2 text-sm text-[#F0F2F5] placeholder:text-[#4B5563] focus:outline-none focus:ring-2 focus:ring-orange-500/50 resize-none"
              placeholder="Detalles adicionales..."
            />
          </div>

          <div className="flex justify-end gap-3 pt-4 border-t border-[#1E2330]">
            <Button variant="secondary" onClick={() => { setShowEventModal(false); setSelectedEvent(null) }}>Cancelar</Button>
            <Button onClick={handleSave} loading={saving}>{selectedEvent ? 'Guardar cambios' : 'Crear evento'}</Button>
          </div>
        </div>
      </Modal>

      {/* ─── EVENT DETAIL MODAL ─── */}
      <Modal
        isOpen={showDetailModal}
        onClose={() => { setShowDetailModal(false); setSelectedEvent(null) }}
        title="Detalle del evento"
        size="md"
      >
        {selectedEvent && (() => {
          const color = selectedEvent.color || STATUS_COLORS[selectedEvent.status] || '#3B82F6'
          return (
            <div className="space-y-4">
              <div className="flex items-start gap-3">
                <div className="w-1.5 rounded-full min-h-[48px]" style={{ backgroundColor: color }} />
                <div className="flex-1">
                  <h3 className="text-lg font-semibold text-[#F0F2F5]">{selectedEvent.title}</h3>
                  <div className="flex flex-wrap gap-2 mt-2">
                    <Badge
                      variant={selectedEvent.status === 'completed' ? 'success' : selectedEvent.status === 'in_progress' ? 'warning' : selectedEvent.status === 'cancelled' ? 'default' : 'info'}
                      size="md"
                    >
                      {STATUS_LABELS[selectedEvent.status] || selectedEvent.status}
                    </Badge>
                    {selectedEvent.all_day && <Badge variant="default" size="md">Todo el dia</Badge>}
                  </div>
                </div>
              </div>

              <div className="space-y-2 p-3 rounded-lg bg-[#0F1218] border border-[#1E2330]">
                <div className="flex items-center justify-between text-sm">
                  <span className="text-[#6B7280]">Inicio</span>
                  <span className="text-[#D1D5DB]">{formatDate(selectedEvent.start_date)}</span>
                </div>
                {selectedEvent.end_date && (
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-[#6B7280]">Fin</span>
                    <span className="text-[#D1D5DB]">{formatDate(selectedEvent.end_date)}</span>
                  </div>
                )}
                <div className="flex items-center justify-between text-sm">
                  <span className="text-[#6B7280]">Tecnico</span>
                  <span className="text-[#D1D5DB]">{selectedEvent.tt_users?.full_name || 'Sin asignar'}</span>
                </div>
              </div>

              {selectedEvent.notes && (
                <div>
                  <p className="text-xs text-[#6B7280] mb-1">Notas</p>
                  <p className="text-sm text-[#D1D5DB] whitespace-pre-wrap">{selectedEvent.notes}</p>
                </div>
              )}

              <div className="flex justify-between pt-4 border-t border-[#1E2330]">
                <Button variant="danger" size="sm" onClick={deleteEvent}>
                  <Trash2 size={14} /> Eliminar
                </Button>
                <Button onClick={editEvent}>
                  <Edit2 size={14} /> Editar
                </Button>
              </div>
            </div>
          )
        })()}
      </Modal>
    </div>
  )
}
