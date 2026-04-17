'use client'

import '@/components/sat/buscatools-theme.css'
import { useState, useEffect, useCallback, Suspense } from 'react'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Select } from '@/components/ui/select'
import { Badge } from '@/components/ui/badge'
import { Modal } from '@/components/ui/modal'
import { SearchBar } from '@/components/ui/search-bar'
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from '@/components/ui/table'
import { KPICard } from '@/components/ui/kpi-card'
import { Tabs } from '@/components/ui/tabs'
import { useToast } from '@/components/ui/toast'
import { formatDate } from '@/lib/utils'
import { ExportButton } from '@/components/ui/export-button'
import { useCompanyFilter } from '@/hooks/use-company-filter'
import { SATWorkflow } from '@/components/sat/sat-workflow'
import { ClientCombobox } from '@/components/sat/client-combobox'
import { DocumentProcessBar } from '@/components/workflow/document-process-bar'
import { buildSteps } from '@/lib/workflow-definitions'
import {
  Wrench, Plus, Eye, Loader2, AlertTriangle, Clock, CheckCircle,
  Package, ClipboardList, Cpu, Play, Pause, Box, BookOpen, FileText,
  Settings, Layers, History, Calendar, Trash2, Power, RotateCcw,
  ChevronDown, ChevronUp, X, Check
} from 'lucide-react'

type Row = Record<string, unknown>

const STATUS_MAP: Record<string, { label: string; variant: 'default' | 'success' | 'warning' | 'danger' | 'info' | 'orange' }> = {
  open: { label: 'Abierto', variant: 'info' }, in_progress: { label: 'En progreso', variant: 'warning' },
  waiting_parts: { label: 'Esperando repuestos', variant: 'orange' }, resolved: { label: 'Resuelto', variant: 'success' }, closed: { label: 'Cerrado', variant: 'default' },
}
const PRIORITY_MAP: Record<string, { label: string; variant: 'default' | 'success' | 'warning' | 'danger'; color: string }> = {
  low: { label: 'Baja', variant: 'default', color: '#6B7280' }, normal: { label: 'Normal', variant: 'success', color: '#10B981' },
  high: { label: 'Alta', variant: 'warning', color: '#F59E0B' }, urgent: { label: 'Urgente', variant: 'danger', color: '#EF4444' },
}

const satTabs = [
  { id: 'incidencias', label: 'Incidencias', icon: <AlertTriangle size={16} /> },
  { id: 'workflow', label: 'Hojas activas', icon: <Play size={16} /> },
  { id: 'ordenes', label: 'Ordenes de trabajo', icon: <ClipboardList size={16} /> },
  { id: 'activos', label: 'Activos/Equipos', icon: <Cpu size={16} /> },
  { id: 'mantenimientos', label: 'Mantenimientos', icon: <Calendar size={16} /> },
]

const FREQUENCY_MAP: Record<string, { label: string; variant: 'default' | 'success' | 'warning' | 'danger' | 'info' | 'orange'; days: number }> = {
  weekly: { label: 'Semanal', variant: 'info', days: 7 },
  monthly: { label: 'Mensual', variant: 'success', days: 30 },
  quarterly: { label: 'Trimestral', variant: 'warning', days: 90 },
  semiannual: { label: 'Semestral', variant: 'orange', days: 180 },
  annual: { label: 'Anual', variant: 'default', days: 365 },
  custom: { label: 'Personalizado', variant: 'danger', days: 0 },
}

// ═══════════════════════════════════════════════════════
// INCIDENCIAS TAB (existing SAT tickets)
// ═══════════════════════════════════════════════════════
function IncidenciasTab() {
  const { filterByCompany, companyKey } = useCompanyFilter()
  const supabase = createClient()
  const { addToast } = useToast()
  const [tickets, setTickets] = useState<Row[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState('')
  const [priorityFilter, setPriorityFilter] = useState('')
  const [showCreate, setShowCreate] = useState(false)
  const [showDetail, setShowDetail] = useState(false)
  const [selectedTicket, setSelectedTicket] = useState<Row | null>(null)
  const [activityLog, setActivityLog] = useState<Row[]>([])
  const [clients, setClients] = useState<Array<Row>>([])
  const [allProducts, setAllProducts] = useState<Array<Row>>([])
  const [users, setUsers] = useState<Array<Row>>([])
  const [form, setForm] = useState({ client_id: '', product_id: '', assigned_to: '', priority: 'normal', description: '', serial_number: '', work_address: '' })
  const [saving, setSaving] = useState(false)
  const [diagnosis, setDiagnosis] = useState('')
  const [resolution, setResolution] = useState('')
  // Workflow state
  const [showWorkflow, setShowWorkflow] = useState(false)
  const [workflowTicket, setWorkflowTicket] = useState<Row | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    const sb = createClient()
    let q = sb.from('tt_sat_tickets').select('*, tt_clients(name)').order('created_at', { ascending: false })
    q = filterByCompany(q)
    if (statusFilter) q = q.eq('status', statusFilter)
    if (priorityFilter) q = q.eq('priority', priorityFilter)
    if (search) q = q.ilike('description', `%${search}%`)
    const { data } = await q
    setTickets(data || [])
    setLoading(false)
  }, [statusFilter, priorityFilter, search, companyKey])

  useEffect(() => { load() }, [load])

  // Cargar clientes/productos/usuarios desde el mount (no esperar al modal)
  useEffect(() => {
    (async () => {
      const [{ data: cl }, { data: pr }, { data: us }] = await Promise.all([
        supabase.from('tt_clients').select('id, name, city').eq('active', true).order('name').limit(5000),
        supabase.from('tt_products').select('id, sku, name').order('name').limit(500),
        supabase.from('tt_users').select('id, full_name, email').order('full_name'),
      ])
      // Deduplicar clientes por nombre normalizado (quedarse con el primero)
      const seen = new Set<string>()
      const deduped = (cl || []).filter((c: Row) => {
        const key = ((c.name as string) || '').toLowerCase().trim()
        if (seen.has(key)) return false
        seen.add(key)
        return true
      })
      setClients(deduped)
      setAllProducts(pr || [])
      setUsers(us || [])
    })()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const loadFormData = async () => { /* obsolete — clientes ya se cargan en useEffect */ }

  const handleCreate = async () => {
    if (!form.client_id || !form.description.trim()) { addToast({ type: 'warning', title: 'Completa los datos' }); return }
    setSaving(true)
    const yr = new Date().getFullYear().toString().slice(-2)
    const mo = (new Date().getMonth() + 1).toString().padStart(2, '0')
    const seq = Math.floor(Math.random() * 9999).toString().padStart(4, '0')
    const ticketNum = `SAT-${yr}${mo}-${seq}`
    const { error } = await supabase.from('tt_sat_tickets').insert({ number: ticketNum, client_id: form.client_id, product_id: form.product_id || null, assigned_to: form.assigned_to || null, priority: form.priority, status: 'open', description: form.description, serial_number: form.serial_number || null, work_address: form.work_address || null })
    if (error) { addToast({ type: 'error', title: 'Error', message: error.message }); setSaving(false); return }
    addToast({ type: 'success', title: 'Ticket creado', message: ticketNum })
    setShowCreate(false); setForm({ client_id: '', product_id: '', assigned_to: '', priority: 'normal', description: '', serial_number: '', work_address: '' }); load(); setSaving(false)
  }

  const openDetail = async (ticket: Row) => {
    setSelectedTicket(ticket); setDiagnosis((ticket.diagnosis as string) || ''); setResolution((ticket.resolution as string) || '')
    const { data } = await supabase.from('tt_activity_log').select('*').eq('entity_type', 'sat_ticket').eq('entity_id', ticket.id).order('created_at', { ascending: false })
    setActivityLog(data || []); setShowDetail(true)
  }

  const updateField = async (field: string, value: string) => {
    if (!selectedTicket) return
    await supabase.from('tt_sat_tickets').update({ [field]: value }).eq('id', selectedTicket.id)
    addToast({ type: 'success', title: 'Actualizado' })
  }

  const changeStatus = async (newStatus: string) => {
    if (!selectedTicket) return
    await supabase.from('tt_sat_tickets').update({ status: newStatus }).eq('id', selectedTicket.id)
    addToast({ type: 'success', title: 'Estado actualizado' }); setShowDetail(false); load()
  }

  const startWorkflow = (ticket: Row) => {
    setWorkflowTicket(ticket)
    setShowWorkflow(true)
    setShowDetail(false)
  }

  const openCount = tickets.filter(t => t.status === 'open').length
  const inProgressCount = tickets.filter(t => t.status === 'in_progress').length
  const urgentCount = tickets.filter(t => t.priority === 'urgent' || t.priority === 'high').length

  // Check if ticket has workflow data
  const hasWorkflow = (ticket: Row): boolean => {
    const meta = (ticket.metadata as Record<string, unknown>) || {}
    return !!meta.sat_workflow
  }

  const getWorkflowStep = (ticket: Row): number | null => {
    const meta = (ticket.metadata as Record<string, unknown>) || {}
    const wf = meta.sat_workflow as Record<string, unknown> | undefined
    return wf ? (wf.current_step as number) : null
  }

  return (
    <div className="space-y-4">
      {/* Workflow Full-screen View */}
      {showWorkflow && workflowTicket && (
        <Modal
          isOpen={showWorkflow}
          onClose={() => { setShowWorkflow(false); load() }}
          title={`Hoja de mantenimiento — ${(workflowTicket.number as string) || ''}`}
          size="full"
        >
          <SATWorkflow
            ticketId={workflowTicket.id as string}
            ticketNumber={(workflowTicket.number as string) || ''}
            onClose={() => { setShowWorkflow(false); load() }}
            onComplete={() => { setShowWorkflow(false); load() }}
          />
        </Modal>
      )}

      <div className="flex justify-end gap-2">
        <ExportButton
          data={tickets as Record<string, unknown>[]}
          filename="tickets_sat_torquetools"
          columns={[
            { key: 'number', label: 'Numero' },
            { key: 'description', label: 'Descripcion' },
            { key: 'status', label: 'Estado' },
            { key: 'priority', label: 'Prioridad' },
            { key: 'serial_number', label: 'Nro Serie' },
            { key: 'work_address', label: 'Direccion' },
            { key: 'created_at', label: 'Fecha' },
          ]}
        />
        <Button onClick={() => { setShowCreate(true); loadFormData() }}><Plus size={16} /> Nuevo Ticket</Button>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <KPICard label="Total tickets" value={tickets.length} icon={<Wrench size={22} />} />
        <KPICard label="Abiertos" value={openCount} icon={<Clock size={22} />} color="#3B82F6" />
        <KPICard label="En progreso" value={inProgressCount} icon={<Wrench size={22} />} color="#F59E0B" />
        <KPICard label="Urgentes/Altos" value={urgentCount} icon={<AlertTriangle size={22} />} color="#EF4444" />
      </div>
      <Card>
        <div className="flex flex-col sm:flex-row gap-3">
          <SearchBar placeholder="Buscar tickets..." value={search} onChange={setSearch} className="flex-1" />
          <Select options={[{ value: '', label: 'Estado' }, ...Object.entries(STATUS_MAP).map(([k, v]) => ({ value: k, label: v.label }))]} value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} />
          <Select options={[{ value: '', label: 'Prioridad' }, ...Object.entries(PRIORITY_MAP).map(([k, v]) => ({ value: k, label: v.label }))]} value={priorityFilter} onChange={(e) => setPriorityFilter(e.target.value)} />
        </div>
      </Card>
      <Card className="p-0 overflow-hidden">
        {loading ? (
          <div className="flex items-center justify-center py-20"><Loader2 className="animate-spin text-[#FF6600]" size={32} /></div>
        ) : tickets.length === 0 ? (
          <div className="text-center py-20 text-[#6B7280]"><Wrench size={48} className="mx-auto mb-3 opacity-30" /><p>No hay tickets</p></div>
        ) : (
          <Table>
            <TableHeader><TableRow><TableHead>Nro</TableHead><TableHead>Cliente</TableHead><TableHead>Descripcion</TableHead><TableHead>Prioridad</TableHead><TableHead>Estado</TableHead><TableHead>Hoja</TableHead><TableHead>Fecha</TableHead><TableHead>Acciones</TableHead></TableRow></TableHeader>
            <TableBody>
              {tickets.map((t) => {
                const st = STATUS_MAP[(t.status as string) || 'open']; const pr = PRIORITY_MAP[(t.priority as string) || 'normal']
                const wfStep = getWorkflowStep(t)
                return (
                  <TableRow key={t.id as string}>
                    <TableCell><span className="font-mono text-xs text-[#FF6600]">{(t.number as string) || ''}</span></TableCell>
                    <TableCell><span className="text-[#F0F2F5]">{((t.tt_clients as Row)?.name as string) || '-'}</span></TableCell>
                    <TableCell><span className="text-sm text-[#9CA3AF] truncate block max-w-[200px]">{(t.description as string) || ''}</span></TableCell>
                    <TableCell><Badge variant={pr.variant}>{pr.label}</Badge></TableCell>
                    <TableCell><Badge variant={st.variant}>{st.label}</Badge></TableCell>
                    <TableCell>
                      {wfStep !== null ? (
                        <button
                          onClick={() => startWorkflow(t)}
                          className="flex items-center gap-1 px-2 py-1 rounded-md bg-teal-500/10 border border-teal-500/20 text-teal-400 text-[10px] font-medium hover:bg-teal-500/20 transition-colors"
                        >
                          <Play size={10} /> Paso {wfStep + 1}/5
                        </button>
                      ) : (
                        <span className="text-[10px] text-[#4B5563]">—</span>
                      )}
                    </TableCell>
                    <TableCell className="text-sm">{t.created_at ? formatDate(t.created_at as string) : '-'}</TableCell>
                    <TableCell>
                      <div className="flex gap-1">
                        <Button variant="ghost" size="sm" onClick={() => openDetail(t)}><Eye size={14} /></Button>
                      </div>
                    </TableCell>
                  </TableRow>
                )
              })}
            </TableBody>
          </Table>
        )}
      </Card>

      <Modal isOpen={showCreate} onClose={() => setShowCreate(false)} title="Nuevo Ticket SAT" size="lg">
        <div className="space-y-4">
          <ClientCombobox
            label="Cliente *"
            value={form.client_id || null}
            onChange={(id) => setForm({ ...form, client_id: id || '' })}
            clients={clients.map((c) => ({ id: c.id as string, name: c.name as string, city: (c as { city?: string }).city }))}
            placeholder="Seleccioná un cliente (escribí para buscar)"
          />
          <Select label="Producto / Equipo" options={allProducts.map(p => ({ value: p.id as string, label: `${p.sku || ''} - ${p.name}` }))} value={form.product_id} onChange={(e) => setForm({ ...form, product_id: e.target.value })} placeholder="Opcional" />
          <Input label="Nro de serie" value={form.serial_number} onChange={(e) => setForm({ ...form, serial_number: e.target.value })} />
          <Select label="Tecnico asignado" options={users.map(u => ({ value: u.id as string, label: `${u.full_name} (${u.email})` }))} value={form.assigned_to} onChange={(e) => setForm({ ...form, assigned_to: e.target.value })} placeholder="Sin asignar" />
          <Select label="Prioridad" options={Object.entries(PRIORITY_MAP).map(([k, v]) => ({ value: k, label: v.label }))} value={form.priority} onChange={(e) => setForm({ ...form, priority: e.target.value })} />
          <div><label className="block text-sm font-medium text-[#9CA3AF] mb-1.5">Descripcion del problema *</label>
            <textarea value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} className="w-full h-24 rounded-lg bg-[#1E2330] border border-[#2A3040] px-3 py-2 text-sm text-[#F0F2F5] placeholder:text-[#4B5563] focus:outline-none focus:ring-2 focus:ring-orange-500/50 resize-none" placeholder="Describi el problema..." />
          </div>
          <div className="flex justify-end gap-3 pt-4 border-t border-[#1E2330]"><Button variant="secondary" onClick={() => setShowCreate(false)}>Cancelar</Button><Button onClick={handleCreate} loading={saving}>Crear Ticket</Button></div>
        </div>
      </Modal>

      <Modal isOpen={showDetail} onClose={() => setShowDetail(false)} title={`Ticket ${(selectedTicket?.number as string) || ''}`} size="xl">
        {selectedTicket && (() => {
          const ticketStatus = (selectedTicket.status as string) || 'open'
          const ticketStepId = ticketStatus === 'closed' || ticketStatus === 'resolved' ? 'cierre'
            : ticketStatus === 'in_progress' ? 'reparacion'
            : ticketStatus === 'waiting_parts' ? 'reparacion'
            : hasWorkflow(selectedTicket) ? 'reparacion'
            : 'diagnostico'
          const ticketBadgeVariant = ticketStatus === 'closed' ? 'success'
            : ticketStatus === 'resolved' ? 'success'
            : ticketStatus === 'in_progress' ? 'info'
            : ticketStatus === 'waiting_parts' ? 'warning'
            : 'default'
          return (
          <div className="space-y-6">
            {/* ══════════════════════════════════════════════════════════════
                REGLA FUNDAMENTAL: Barra sticky con código + stepper + alertas
                ══════════════════════════════════════════════════════════════ */}
            <DocumentProcessBar
              code={(selectedTicket.number as string) || `SAT-${(selectedTicket.id as string).slice(0, 8)}`}
              badge={{ label: STATUS_MAP[ticketStatus]?.label || ticketStatus, variant: ticketBadgeVariant }}
              entity={
                <span>
                  <strong>{((selectedTicket.tt_clients as Row)?.name as string) || 'Sin cliente'}</strong>
                  {(selectedTicket.serial_number as string) && <> · Serie: {selectedTicket.serial_number as string}</>}
                  {(selectedTicket.priority as string) && <> · Prioridad: {PRIORITY_MAP[(selectedTicket.priority as string) || 'normal']?.label}</>}
                </span>
              }
              alerts={[
                ...(ticketStatus === 'waiting_parts' ? [{ type: 'warning' as const, message: 'Esperando repuestos — ticket pausado' }] : []),
                ...(hasWorkflow(selectedTicket) ? [{ type: 'info' as const, message: `Hoja de mantenimiento activa — paso ${(getWorkflowStep(selectedTicket) ?? 0) + 1}/5` }] : []),
              ]}
              steps={buildSteps('sat_ticket', ticketStepId)}
              onClose={() => setShowDetail(false)}
            />
            <div className="flex items-center gap-3 flex-wrap">
              <Badge variant={STATUS_MAP[(selectedTicket.status as string) || 'open'].variant} size="md">{STATUS_MAP[(selectedTicket.status as string) || 'open'].label}</Badge>
              <Badge variant={PRIORITY_MAP[(selectedTicket.priority as string) || 'normal'].variant} size="md">{PRIORITY_MAP[(selectedTicket.priority as string) || 'normal'].label}</Badge>
              {hasWorkflow(selectedTicket) && (
                <Badge variant="info" size="md">Hoja activa</Badge>
              )}
            </div>
            <p className="text-sm text-[#D1D5DB] whitespace-pre-wrap">{selectedTicket.description as string}</p>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div><label className="block text-sm font-medium text-[#9CA3AF] mb-1.5">Diagnostico</label>
                <textarea value={diagnosis} onChange={(e) => setDiagnosis(e.target.value)} onBlur={() => updateField('diagnosis', diagnosis)} className="w-full h-20 rounded-lg bg-[#1E2330] border border-[#2A3040] px-3 py-2 text-sm text-[#F0F2F5] focus:outline-none focus:ring-2 focus:ring-orange-500/50 resize-none" />
              </div>
              <div><label className="block text-sm font-medium text-[#9CA3AF] mb-1.5">Resolucion</label>
                <textarea value={resolution} onChange={(e) => setResolution(e.target.value)} onBlur={() => updateField('resolution', resolution)} className="w-full h-20 rounded-lg bg-[#1E2330] border border-[#2A3040] px-3 py-2 text-sm text-[#F0F2F5] focus:outline-none focus:ring-2 focus:ring-orange-500/50 resize-none" />
              </div>
            </div>
            <div className="flex flex-wrap justify-end gap-2 pt-4 border-t border-[#1E2330]">
              {/* Workflow Button — available for open or in_progress tickets */}
              {['open', 'in_progress', 'waiting_parts'].includes(selectedTicket.status as string) && (
                <Button variant="secondary" onClick={() => startWorkflow(selectedTicket)}>
                  <Play size={14} /> {hasWorkflow(selectedTicket) ? 'Continuar hoja de mantenimiento' : 'Iniciar hoja de mantenimiento'}
                </Button>
              )}
              {(selectedTicket.status as string) === 'open' && <Button variant="secondary" onClick={() => changeStatus('in_progress')}>Iniciar Trabajo</Button>}
              {(selectedTicket.status as string) === 'in_progress' && <><Button variant="secondary" onClick={() => changeStatus('waiting_parts')}>Esperando Repuestos</Button><Button onClick={() => changeStatus('resolved')}><CheckCircle size={14} /> Resuelto</Button></>}
              {(selectedTicket.status as string) === 'resolved' && <Button onClick={() => changeStatus('closed')}>Cerrar Ticket</Button>}
            </div>
          </div>
          )
        })()}
      </Modal>
    </div>
  )
}

// ═══════════════════════════════════════════════════════
// WORKFLOW SAT TAB — List of active workflows
// ═══════════════════════════════════════════════════════
function WorkflowSATTab() {
  const { filterByCompany, companyKey } = useCompanyFilter()
  const [tickets, setTickets] = useState<Row[]>([])
  const [loading, setLoading] = useState(true)
  const [showWorkflow, setShowWorkflow] = useState(false)
  const [selectedTicket, setSelectedTicket] = useState<Row | null>(null)

  const STEP_LABELS = ['Diagnostico', 'Cotizacion', 'Reparacion', 'Torque', 'Cierre']
  const STEP_BADGE_COLORS = ['orange', 'warning', 'info', 'success', 'default'] as const

  const load = useCallback(async () => {
    setLoading(true)
    const sb = createClient()
    // Query active/paused tickets, filter for workflows client-side
    // (JSONB arrow operator may not be available until migration runs)
    let q = sb.from('tt_sat_tickets').select('*, tt_clients(name)')
      .in('status', ['open', 'in_progress', 'waiting_parts'])
      .order('updated_at', { ascending: false })
    q = filterByCompany(q)
    const { data } = await q
    // Filter client-side: only tickets that have sat_workflow in metadata
    const filtered = (data || []).filter(t => {
      const meta = (t.metadata as Record<string, unknown>) || {}
      return !!meta.sat_workflow
    })
    setTickets(filtered)
    setLoading(false)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [companyKey, filterByCompany])

  useEffect(() => { load() }, [load])

  const getWorkflowInfo = (ticket: Row) => {
    const meta = (ticket.metadata as Record<string, unknown>) || {}
    const wf = meta.sat_workflow as Record<string, unknown> | undefined
    if (!wf) return { step: 0, paused: false }
    const pause = wf.pause as Record<string, unknown> | undefined
    return {
      step: (wf.current_step as number) || 0,
      paused: pause?.is_paused === true,
      pauseReason: (pause?.reason as string) || '',
    }
  }

  const activeCount = tickets.filter(t => !getWorkflowInfo(t).paused).length
  const pausedCount = tickets.filter(t => getWorkflowInfo(t).paused).length

  return (
    <div className="space-y-4">
      {showWorkflow && selectedTicket && (
        <Modal
          isOpen={showWorkflow}
          onClose={() => { setShowWorkflow(false); load() }}
          title={`Hoja de mantenimiento — ${(selectedTicket.number as string) || ''}`}
          size="full"
        >
          <SATWorkflow
            ticketId={selectedTicket.id as string}
            ticketNumber={(selectedTicket.number as string) || ''}
            onClose={() => { setShowWorkflow(false); load() }}
            onComplete={() => { setShowWorkflow(false); load() }}
          />
        </Modal>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <KPICard label="Hojas activas" value={tickets.length} icon={<Play size={22} />} />
        <KPICard label="En curso" value={activeCount} icon={<Wrench size={22} />} color="#14B8A6" />
        <KPICard label="Pausados" value={pausedCount} icon={<Pause size={22} />} color="#F59E0B" />
      </div>

      <Card className="p-0 overflow-hidden">
        {loading ? (
          <div className="flex items-center justify-center py-20"><Loader2 className="animate-spin text-[#FF6600]" size={32} /></div>
        ) : tickets.length === 0 ? (
          <div className="text-center py-20 text-[#6B7280]">
            <Play size={48} className="mx-auto mb-3 opacity-30" />
            <p>No hay hojas activas</p>
            <p className="text-xs mt-1">Iniciá una hoja desde un ticket de la tab Incidencias</p>
          </div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Ticket</TableHead>
                <TableHead>Cliente</TableHead>
                <TableHead>Paso actual</TableHead>
                <TableHead>Estado</TableHead>
                <TableHead>Acciones</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {tickets.map((t) => {
                const info = getWorkflowInfo(t)
                return (
                  <TableRow key={t.id as string}>
                    <TableCell>
                      <span className="font-mono text-xs text-[#FF6600]">{(t.number as string) || ''}</span>
                    </TableCell>
                    <TableCell className="text-[#F0F2F5]">
                      {((t.tt_clients as Row)?.name as string) || '-'}
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-medium text-[#F0F2F5]">{info.step + 1}/5</span>
                        <Badge variant={STEP_BADGE_COLORS[info.step] || 'default'}>
                          {STEP_LABELS[info.step]}
                        </Badge>
                      </div>
                    </TableCell>
                    <TableCell>
                      {info.paused ? (
                        <Badge variant="warning">
                          <Pause size={10} className="mr-1" /> Pausado
                        </Badge>
                      ) : (
                        <Badge variant="success">
                          <Play size={10} className="mr-1" /> Activo
                        </Badge>
                      )}
                    </TableCell>
                    <TableCell>
                      <Button
                        variant="secondary"
                        size="sm"
                        onClick={() => { setSelectedTicket(t); setShowWorkflow(true) }}
                      >
                        <Play size={14} /> {info.paused ? 'Reanudar' : 'Continuar'}
                      </Button>
                    </TableCell>
                  </TableRow>
                )
              })}
            </TableBody>
          </Table>
        )}
      </Card>
    </div>
  )
}

// ═══════════════════════════════════════════════════════
// ORDENES DE TRABAJO TAB
// ═══════════════════════════════════════════════════════
function OrdenesTrabajoTab() {
  const { filterByCompany, companyKey } = useCompanyFilter()
  const supabase = createClient()
  const [tickets, setTickets] = useState<Row[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    (async () => {
      setLoading(true)
      let q = supabase.from('tt_sat_tickets').select('*, tt_clients(name)').in('status', ['in_progress', 'waiting_parts']).order('updated_at', { ascending: false })
      q = filterByCompany(q)
      const { data } = await q
      setTickets(data || [])
      setLoading(false)
    })()
  }, [companyKey])

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <KPICard label="Ordenes activas" value={tickets.length} icon={<ClipboardList size={22} />} />
        <KPICard label="Esperando repuestos" value={tickets.filter(t => t.status === 'waiting_parts').length} icon={<Package size={22} />} color="#F59E0B" />
      </div>
      <Card className="p-0 overflow-hidden">
        {loading ? (
          <div className="flex items-center justify-center py-20"><Loader2 className="animate-spin text-[#FF6600]" size={32} /></div>
        ) : tickets.length === 0 ? (
          <div className="text-center py-20 text-[#6B7280]"><ClipboardList size={48} className="mx-auto mb-3 opacity-30" /><p>No hay ordenes de trabajo activas</p></div>
        ) : (
          <Table>
            <TableHeader><TableRow><TableHead>Ticket</TableHead><TableHead>Cliente</TableHead><TableHead>Estado</TableHead><TableHead>Prioridad</TableHead><TableHead>Descripcion</TableHead></TableRow></TableHeader>
            <TableBody>
              {tickets.map((t) => (
                <TableRow key={t.id as string}>
                  <TableCell><span className="font-mono text-xs text-[#FF6600]">{(t.number as string) || ''}</span></TableCell>
                  <TableCell className="text-[#F0F2F5]">{((t.tt_clients as Row)?.name as string) || '-'}</TableCell>
                  <TableCell><Badge variant={STATUS_MAP[(t.status as string) || 'open']?.variant || 'default'}>{STATUS_MAP[(t.status as string) || 'open']?.label}</Badge></TableCell>
                  <TableCell><Badge variant={PRIORITY_MAP[(t.priority as string) || 'normal']?.variant || 'default'}>{PRIORITY_MAP[(t.priority as string) || 'normal']?.label}</Badge></TableCell>
                  <TableCell className="text-sm text-[#9CA3AF] max-w-[250px] truncate">{(t.description as string) || ''}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </Card>
    </div>
  )
}

// ═══════════════════════════════════════════════════════
// ACTIVOS/EQUIPOS TAB
// ═══════════════════════════════════════════════════════
function ActivosTab() {
  const { filterByCompany, companyKey } = useCompanyFilter()
  const supabase = createClient()
  const [equipment, setEquipment] = useState<Row[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')

  const load = useCallback(async () => {
    setLoading(true)
    const sb = createClient()
    // Get unique equipments from SAT tickets (serial numbers)
    let q = sb.from('tt_sat_tickets').select('serial_number, product_id, tt_clients(name), description, created_at, status').not('serial_number', 'is', null).order('created_at', { ascending: false })
    q = filterByCompany(q)
    if (search) q = q.ilike('serial_number', `%${search}%`)
    const { data } = await q
    setEquipment(data || [])
    setLoading(false)
  }, [search, companyKey])

  useEffect(() => { load() }, [load])

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <KPICard label="Equipos registrados" value={equipment.length} icon={<Cpu size={22} />} />
      </div>
      <Card><SearchBar placeholder="Buscar por numero de serie..." value={search} onChange={setSearch} /></Card>
      <Card className="p-0 overflow-hidden">
        {loading ? (
          <div className="flex items-center justify-center py-20"><Loader2 className="animate-spin text-[#FF6600]" size={32} /></div>
        ) : equipment.length === 0 ? (
          <div className="text-center py-20 text-[#6B7280]"><Cpu size={48} className="mx-auto mb-3 opacity-30" /><p>No hay equipos registrados</p></div>
        ) : (
          <Table>
            <TableHeader><TableRow><TableHead>Nro Serie</TableHead><TableHead>Cliente</TableHead><TableHead>Ultimo servicio</TableHead><TableHead>Estado</TableHead></TableRow></TableHeader>
            <TableBody>
              {equipment.map((e, i) => (
                <TableRow key={i}>
                  <TableCell><span className="font-mono text-xs text-[#FF6600]">{(e.serial_number as string) || '-'}</span></TableCell>
                  <TableCell className="text-[#F0F2F5]">{((e.tt_clients as Row)?.name as string) || '-'}</TableCell>
                  <TableCell className="text-sm">{e.created_at ? formatDate(e.created_at as string) : '-'}</TableCell>
                  <TableCell><Badge variant={STATUS_MAP[(e.status as string) || 'open']?.variant || 'default'}>{STATUS_MAP[(e.status as string) || 'open']?.label || (e.status as string)}</Badge></TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </Card>
    </div>
  )
}

// ═══════════════════════════════════════════════════════
// MANTENIMIENTOS TAB — Preventive Maintenance Schedules
// ═══════════════════════════════════════════════════════
type ChecklistItem = { id: string; text: string; done: boolean }
type ScheduleRow = Row & {
  tt_clients?: { name: string } | null
  tt_users?: { full_name: string } | null
}

function MantenimientosTab() {
  const { filterByCompany, companyKey, defaultCompanyId } = useCompanyFilter()
  const { addToast } = useToast()
  const [schedules, setSchedules] = useState<ScheduleRow[]>([])
  const [loading, setLoading] = useState(true)
  const [clients, setClients] = useState<Array<Row>>([])
  const [users, setUsers] = useState<Array<Row>>([])
  const [showModal, setShowModal] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [executing, setExecuting] = useState<string | null>(null)

  const emptyForm = {
    name: '', client_id: '', asset_id: '', frequency: 'monthly' as string,
    custom_days: 30, assigned_to: '', priority: 'normal', description: '',
    auto_create_ticket: true, active: true,
    checklist: [] as ChecklistItem[],
  }
  const [form, setForm] = useState(emptyForm)
  const [newCheckItem, setNewCheckItem] = useState('')

  const load = useCallback(async () => {
    setLoading(true)
    const sb = createClient()
    let q = sb.from('tt_maintenance_schedules')
      .select('*, tt_clients(name), tt_users:assigned_to(full_name)')
      .order('next_date', { ascending: true })
    q = filterByCompany(q)
    const { data, error } = await q
    if (error) { addToast({ type: 'error', title: 'Error cargando mantenimientos', message: error.message }) }
    setSchedules((data || []) as ScheduleRow[])
    setLoading(false)
  }, [companyKey])

  useEffect(() => { load() }, [load])

  // Load clients & users on mount
  useEffect(() => {
    (async () => {
      const sb = createClient()
      const [{ data: cl }, { data: us }] = await Promise.all([
        sb.from('tt_clients').select('id, name, city').eq('active', true).order('name').limit(5000),
        sb.from('tt_users').select('id, full_name, email').order('full_name'),
      ])
      // Dedup clients
      const seen = new Set<string>()
      const deduped = (cl || []).filter((c: Row) => {
        const key = ((c.name as string) || '').toLowerCase().trim()
        if (seen.has(key)) return false
        seen.add(key)
        return true
      })
      setClients(deduped)
      setUsers(us || [])
    })()
  }, [])

  const openCreate = () => {
    setEditingId(null)
    setForm(emptyForm)
    setNewCheckItem('')
    setShowModal(true)
  }

  const openEdit = (s: ScheduleRow) => {
    setEditingId(s.id as string)
    setForm({
      name: (s.name as string) || '',
      client_id: (s.client_id as string) || '',
      asset_id: (s.asset_id as string) || '',
      frequency: (s.frequency as string) || 'monthly',
      custom_days: (s.custom_days as number) || 30,
      assigned_to: (s.assigned_to as string) || '',
      priority: (s.priority as string) || 'normal',
      description: (s.description as string) || '',
      auto_create_ticket: s.auto_create_ticket !== false,
      active: s.active !== false,
      checklist: (s.checklist as ChecklistItem[]) || [],
    })
    setNewCheckItem('')
    setShowModal(true)
  }

  const addChecklistItem = () => {
    if (!newCheckItem.trim()) return
    setForm({
      ...form,
      checklist: [...form.checklist, { id: crypto.randomUUID(), text: newCheckItem.trim(), done: false }],
    })
    setNewCheckItem('')
  }

  const removeChecklistItem = (id: string) => {
    setForm({ ...form, checklist: form.checklist.filter(i => i.id !== id) })
  }

  const calcNextDate = (freq: string, customDays: number): string => {
    const now = new Date()
    const freqInfo = FREQUENCY_MAP[freq]
    const days = freq === 'custom' ? customDays : (freqInfo?.days || 30)
    now.setDate(now.getDate() + days)
    return now.toISOString()
  }

  const handleSave = async () => {
    if (!form.name.trim()) { addToast({ type: 'warning', title: 'Ingresa un nombre para el plan' }); return }
    if (!form.client_id) { addToast({ type: 'warning', title: 'Selecciona un cliente' }); return }
    setSaving(true)
    const sb = createClient()

    const payload = {
      name: form.name,
      client_id: form.client_id,
      asset_id: form.asset_id || null,
      company_id: defaultCompanyId,
      frequency: form.frequency,
      custom_days: form.frequency === 'custom' ? form.custom_days : null,
      assigned_to: form.assigned_to || null,
      priority: form.priority,
      description: form.description || null,
      auto_create_ticket: form.auto_create_ticket,
      active: form.active,
      checklist: form.checklist,
    }

    if (editingId) {
      const { error } = await sb.from('tt_maintenance_schedules').update(payload).eq('id', editingId)
      if (error) { addToast({ type: 'error', title: 'Error', message: error.message }); setSaving(false); return }
      addToast({ type: 'success', title: 'Plan actualizado' })
    } else {
      const nextDate = calcNextDate(form.frequency, form.custom_days)
      const { error } = await sb.from('tt_maintenance_schedules').insert({ ...payload, next_date: nextDate, total_executed: 0 })
      if (error) { addToast({ type: 'error', title: 'Error', message: error.message }); setSaving(false); return }
      addToast({ type: 'success', title: 'Plan de mantenimiento creado' })
    }
    setShowModal(false)
    setSaving(false)
    load()
  }

  const toggleActive = async (s: ScheduleRow) => {
    const sb = createClient()
    const newActive = !(s.active as boolean)
    await sb.from('tt_maintenance_schedules').update({ active: newActive }).eq('id', s.id)
    addToast({ type: 'success', title: newActive ? 'Plan activado' : 'Plan desactivado' })
    load()
  }

  const executeNow = async (s: ScheduleRow) => {
    setExecuting(s.id as string)
    const sb = createClient()

    // Create SAT ticket from schedule
    const yr = new Date().getFullYear().toString().slice(-2)
    const mo = (new Date().getMonth() + 1).toString().padStart(2, '0')
    const seq = Math.floor(Math.random() * 9999).toString().padStart(4, '0')
    const ticketNum = `SAT-${yr}${mo}-${seq}`

    const checklistText = ((s.checklist as ChecklistItem[]) || []).map(i => `[ ] ${i.text}`).join('\n')
    const desc = `[MANTENIMIENTO PREVENTIVO] ${(s.name as string) || ''}\n\n${(s.description as string) || ''}\n\nChecklist:\n${checklistText}`

    const { error: ticketError } = await sb.from('tt_sat_tickets').insert({
      number: ticketNum,
      client_id: s.client_id,
      assigned_to: (s.assigned_to as string) || null,
      priority: (s.priority as string) || 'normal',
      status: 'open',
      description: desc.trim(),
      company_id: s.company_id,
    })

    if (ticketError) {
      addToast({ type: 'error', title: 'Error creando ticket', message: ticketError.message })
      setExecuting(null)
      return
    }

    // Update schedule: next_date, last_executed, total_executed
    const freq = (s.frequency as string) || 'monthly'
    const customDays = (s.custom_days as number) || 30
    const nextDate = calcNextDate(freq, customDays)
    const totalExec = ((s.total_executed as number) || 0) + 1

    await sb.from('tt_maintenance_schedules').update({
      next_date: nextDate,
      last_executed: new Date().toISOString(),
      total_executed: totalExec,
    }).eq('id', s.id)

    addToast({ type: 'success', title: 'Ticket SAT creado', message: ticketNum })
    setExecuting(null)
    load()
  }

  // KPIs
  const activeCount = schedules.filter(s => s.active !== false).length
  const now = new Date()
  const overdueCount = schedules.filter(s => {
    if (s.active === false) return false
    const nd = s.next_date ? new Date(s.next_date as string) : null
    return nd ? nd < now : false
  }).length
  const nextPending = schedules.find(s => {
    if (s.active === false) return false
    const nd = s.next_date ? new Date(s.next_date as string) : null
    return nd ? nd >= now : false
  })
  const nextPendingLabel = nextPending?.next_date ? formatDate(nextPending.next_date as string) : '-'

  const isOverdue = (s: ScheduleRow): boolean => {
    if (s.active === false) return false
    const nd = s.next_date ? new Date(s.next_date as string) : null
    return nd ? nd < now : false
  }

  return (
    <div className="space-y-4">
      <div className="flex justify-end gap-2">
        <Button onClick={openCreate}><Plus size={16} /> Nuevo plan</Button>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <KPICard label="Planes activos" value={activeCount} icon={<Calendar size={22} />} color="#14B8A6" />
        <KPICard label="Proximo pendiente" value={nextPendingLabel} icon={<Clock size={22} />} color="#3B82F6" />
        <KPICard label="Vencidos" value={overdueCount} icon={<AlertTriangle size={22} />} color="#EF4444" />
        <KPICard label="Total planes" value={schedules.length} icon={<ClipboardList size={22} />} />
      </div>

      {/* Schedule Cards */}
      {loading ? (
        <div className="flex items-center justify-center py-20"><Loader2 className="animate-spin text-[#FF6600]" size={32} /></div>
      ) : schedules.length === 0 ? (
        <Card>
          <div className="text-center py-16 text-[#6B7280]">
            <Calendar size={48} className="mx-auto mb-3 opacity-30" />
            <p>No hay planes de mantenimiento preventivo</p>
            <p className="text-xs mt-1">Crea uno para programar revisiones periodicas</p>
          </div>
        </Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {schedules.map((s) => {
            const freq = FREQUENCY_MAP[(s.frequency as string) || 'monthly']
            const overdue = isOverdue(s)
            const inactive = s.active === false
            return (
              <Card
                key={s.id as string}
                className={`relative ${inactive ? 'opacity-50' : ''} ${overdue ? 'ring-1 ring-red-500/40' : ''}`}
              >
                {/* Active toggle */}
                <button
                  onClick={() => toggleActive(s)}
                  className={`absolute top-4 right-4 p-1.5 rounded-lg transition-colors ${
                    inactive ? 'text-[#4B5563] hover:text-[#9CA3AF]' : 'text-emerald-400 hover:text-emerald-300'
                  }`}
                  title={inactive ? 'Activar' : 'Desactivar'}
                >
                  <Power size={16} />
                </button>

                <div className="pr-10">
                  <h3 className="text-sm font-semibold text-[#F0F2F5] mb-1 truncate">{(s.name as string) || 'Sin nombre'}</h3>
                  <p className="text-xs text-[#6B7280] mb-3 truncate">
                    {(s.tt_clients as Row)?.name as string || 'Sin cliente'}
                  </p>
                </div>

                <div className="flex flex-wrap gap-2 mb-3">
                  <Badge variant={freq?.variant || 'default'}>
                    {freq?.label || (s.frequency as string)}
                    {(s.frequency as string) === 'custom' && s.custom_days ? ` (${String(s.custom_days)}d)` : ''}
                  </Badge>
                  <Badge variant={PRIORITY_MAP[(s.priority as string) || 'normal']?.variant || 'default'}>
                    {PRIORITY_MAP[(s.priority as string) || 'normal']?.label || 'Normal'}
                  </Badge>
                  {inactive && <Badge variant="default">Inactivo</Badge>}
                </div>

                <div className="space-y-1.5 mb-3">
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-[#6B7280]">Proxima fecha</span>
                    <span className={overdue ? 'text-red-400 font-semibold' : 'text-[#D1D5DB]'}>
                      {s.next_date ? formatDate(s.next_date as string) : '-'}
                      {overdue && ' (VENCIDO)'}
                    </span>
                  </div>
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-[#6B7280]">Tecnico</span>
                    <span className="text-[#D1D5DB]">{(s.tt_users as Row)?.full_name as string || 'Sin asignar'}</span>
                  </div>
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-[#6B7280]">Ejecuciones</span>
                    <span className="text-[#D1D5DB]">{(s.total_executed as number) || 0}</span>
                  </div>
                  {((s.checklist as ChecklistItem[]) || []).length > 0 && (
                    <div className="flex items-center justify-between text-xs">
                      <span className="text-[#6B7280]">Checklist</span>
                      <span className="text-[#D1D5DB]">{((s.checklist as ChecklistItem[]) || []).length} items</span>
                    </div>
                  )}
                </div>

                <div className="flex gap-2 pt-3 border-t border-[#1E2330]">
                  <Button variant="secondary" size="sm" className="flex-1" onClick={() => openEdit(s)}>
                    <Eye size={14} /> Editar
                  </Button>
                  <Button
                    size="sm"
                    className="flex-1"
                    onClick={() => executeNow(s)}
                    loading={executing === (s.id as string)}
                    disabled={inactive}
                  >
                    <Play size={14} /> Ejecutar ahora
                  </Button>
                </div>
              </Card>
            )
          })}
        </div>
      )}

      {/* Create/Edit Modal */}
      <Modal isOpen={showModal} onClose={() => setShowModal(false)} title={editingId ? 'Editar plan de mantenimiento' : 'Nuevo plan de mantenimiento'} size="xl">
        <div className="space-y-4">
          <Input label="Nombre del plan *" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Ej: Revision anual torquimetros" />

          <ClientCombobox
            label="Cliente *"
            value={form.client_id || null}
            onChange={(id) => setForm({ ...form, client_id: id || '' })}
            clients={clients.map((c) => ({ id: c.id as string, name: c.name as string, city: (c as { city?: string }).city }))}
            placeholder="Selecciona un cliente"
          />

          <Input label="ID Activo / Equipo" value={form.asset_id} onChange={(e) => setForm({ ...form, asset_id: e.target.value })} placeholder="Opcional — numero de serie o referencia" />

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Select
              label="Frecuencia"
              options={Object.entries(FREQUENCY_MAP).map(([k, v]) => ({ value: k, label: v.label }))}
              value={form.frequency}
              onChange={(e) => setForm({ ...form, frequency: e.target.value })}
            />
            {form.frequency === 'custom' && (
              <Input label="Dias personalizados" type="number" value={form.custom_days.toString()} onChange={(e) => setForm({ ...form, custom_days: parseInt(e.target.value) || 1 })} />
            )}
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Select label="Tecnico asignado" options={[{ value: '', label: 'Sin asignar' }, ...users.map(u => ({ value: u.id as string, label: `${u.full_name} (${u.email})` }))]} value={form.assigned_to} onChange={(e) => setForm({ ...form, assigned_to: e.target.value })} />
            <Select label="Prioridad" options={Object.entries(PRIORITY_MAP).map(([k, v]) => ({ value: k, label: v.label }))} value={form.priority} onChange={(e) => setForm({ ...form, priority: e.target.value })} />
          </div>

          <div>
            <label className="block text-sm font-medium text-[#9CA3AF] mb-1.5">Descripcion / Notas</label>
            <textarea
              value={form.description}
              onChange={(e) => setForm({ ...form, description: e.target.value })}
              className="w-full h-20 rounded-lg bg-[#1E2330] border border-[#2A3040] px-3 py-2 text-sm text-[#F0F2F5] placeholder:text-[#4B5563] focus:outline-none focus:ring-2 focus:ring-orange-500/50 resize-none"
              placeholder="Instrucciones o notas para el tecnico..."
            />
          </div>

          {/* Checklist */}
          <div>
            <label className="block text-sm font-medium text-[#9CA3AF] mb-1.5">Checklist de tareas</label>
            <div className="space-y-2 mb-2">
              {form.checklist.map((item) => (
                <div key={item.id} className="flex items-center gap-2 px-3 py-2 rounded-lg bg-[#0F1218] border border-[#1E2330]">
                  <Check size={14} className="text-emerald-400 shrink-0" />
                  <span className="flex-1 text-sm text-[#D1D5DB]">{item.text}</span>
                  <button onClick={() => removeChecklistItem(item.id)} className="p-1 rounded hover:bg-[#1E2330] text-[#6B7280] hover:text-red-400">
                    <X size={14} />
                  </button>
                </div>
              ))}
            </div>
            <div className="flex gap-2">
              <Input
                placeholder="Agregar item al checklist..."
                value={newCheckItem}
                onChange={(e) => setNewCheckItem(e.target.value)}
                onKeyDown={(e: React.KeyboardEvent<HTMLInputElement>) => { if (e.key === 'Enter') { e.preventDefault(); addChecklistItem() } }}
              />
              <Button variant="secondary" onClick={addChecklistItem} disabled={!newCheckItem.trim()}>
                <Plus size={14} />
              </Button>
            </div>
          </div>

          {/* Auto create ticket toggle */}
          <div className="flex items-center justify-between p-3 rounded-lg bg-[#0F1218] border border-[#1E2330]">
            <div>
              <p className="text-sm font-medium text-[#F0F2F5]">Crear ticket automaticamente</p>
              <p className="text-xs text-[#6B7280]">Genera un ticket SAT cuando se ejecuta el mantenimiento</p>
            </div>
            <button
              onClick={() => setForm({ ...form, auto_create_ticket: !form.auto_create_ticket })}
              className={`relative w-11 h-6 rounded-full transition-colors ${form.auto_create_ticket ? 'bg-[#FF6600]' : 'bg-[#2A3040]'}`}
            >
              <span className={`absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-white transition-transform ${form.auto_create_ticket ? 'translate-x-5' : ''}`} />
            </button>
          </div>

          <div className="flex justify-end gap-3 pt-4 border-t border-[#1E2330]">
            <Button variant="secondary" onClick={() => setShowModal(false)}>Cancelar</Button>
            <Button onClick={handleSave} loading={saving}>{editingId ? 'Guardar cambios' : 'Crear plan'}</Button>
          </div>
        </div>
      </Modal>
    </div>
  )
}

// ═══════════════════════════════════════════════════════
// MAIN PAGE
// ═══════════════════════════════════════════════════════
export default function SATPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold" style={{ color: 'var(--sat-tx)' }}>SAT — Servicio Técnico FEIN</h1>
        <p className="text-sm mt-1" style={{ color: 'var(--sat-tx2)' }}>Incidencias, workflow de mantenimiento, cotizaciones por lote, catálogo de repuestos y más</p>
      </div>

      <Suspense fallback={<div className="flex justify-center py-10"><Loader2 className="animate-spin text-[#FF6600]" size={32} /></div>}>
        <Tabs tabs={satTabs} defaultTab="incidencias">
          {(activeTab) => (
            <>
              {activeTab === 'incidencias' && <IncidenciasTab />}
              {activeTab === 'workflow' && <WorkflowSATTab />}
              {activeTab === 'ordenes' && <OrdenesTrabajoTab />}
              {activeTab === 'activos' && <ActivosTab />}
              {activeTab === 'mantenimientos' && <MantenimientosTab />}
            </>
          )}
        </Tabs>
      </Suspense>
    </div>
  )
}
