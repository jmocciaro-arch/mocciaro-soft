'use client'

import { useState, useEffect, useCallback, Suspense } from 'react'
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
import {
  Wrench, Plus, Eye, Loader2, AlertTriangle, Clock, CheckCircle,
  Package, ClipboardList, Cpu, Play, Pause
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
  { id: 'workflow', label: 'Workflow SAT', icon: <Play size={16} /> },
  { id: 'ordenes', label: 'Ordenes de trabajo', icon: <ClipboardList size={16} /> },
  { id: 'activos', label: 'Activos/Equipos', icon: <Cpu size={16} /> },
]

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

  const loadFormData = async () => {
    const [{ data: cl }, { data: pr }, { data: us }] = await Promise.all([
      supabase.from('tt_clients').select('id, name').eq('active', true).order('name').limit(500),
      supabase.from('tt_products').select('id, sku, name').order('name').limit(500),
      supabase.from('tt_users').select('id, full_name, email').order('full_name'),
    ])
    setClients(cl || []); setAllProducts(pr || []); setUsers(us || [])
  }

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
          title={`Workflow SAT — ${(workflowTicket.number as string) || ''}`}
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
            <TableHeader><TableRow><TableHead>Nro</TableHead><TableHead>Cliente</TableHead><TableHead>Descripcion</TableHead><TableHead>Prioridad</TableHead><TableHead>Estado</TableHead><TableHead>Workflow</TableHead><TableHead>Fecha</TableHead><TableHead>Acciones</TableHead></TableRow></TableHeader>
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
          <Select label="Cliente *" options={clients.map(c => ({ value: c.id as string, label: c.name as string }))} value={form.client_id} onChange={(e) => setForm({ ...form, client_id: e.target.value })} placeholder="Selecciona un cliente" />
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
        {selectedTicket && (
          <div className="space-y-6">
            <div className="flex items-center gap-3 flex-wrap">
              <Badge variant={STATUS_MAP[(selectedTicket.status as string) || 'open'].variant} size="md">{STATUS_MAP[(selectedTicket.status as string) || 'open'].label}</Badge>
              <Badge variant={PRIORITY_MAP[(selectedTicket.priority as string) || 'normal'].variant} size="md">{PRIORITY_MAP[(selectedTicket.priority as string) || 'normal'].label}</Badge>
              {hasWorkflow(selectedTicket) && (
                <Badge variant="info" size="md">Workflow activo</Badge>
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
                  <Play size={14} /> {hasWorkflow(selectedTicket) ? 'Continuar Workflow' : 'Iniciar Workflow'}
                </Button>
              )}
              {(selectedTicket.status as string) === 'open' && <Button variant="secondary" onClick={() => changeStatus('in_progress')}>Iniciar Trabajo</Button>}
              {(selectedTicket.status as string) === 'in_progress' && <><Button variant="secondary" onClick={() => changeStatus('waiting_parts')}>Esperando Repuestos</Button><Button onClick={() => changeStatus('resolved')}><CheckCircle size={14} /> Resuelto</Button></>}
              {(selectedTicket.status as string) === 'resolved' && <Button onClick={() => changeStatus('closed')}>Cerrar Ticket</Button>}
            </div>
          </div>
        )}
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
          title={`Workflow SAT — ${(selectedTicket.number as string) || ''}`}
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
        <KPICard label="Workflows activos" value={tickets.length} icon={<Play size={22} />} />
        <KPICard label="En curso" value={activeCount} icon={<Wrench size={22} />} color="#14B8A6" />
        <KPICard label="Pausados" value={pausedCount} icon={<Pause size={22} />} color="#F59E0B" />
      </div>

      <Card className="p-0 overflow-hidden">
        {loading ? (
          <div className="flex items-center justify-center py-20"><Loader2 className="animate-spin text-[#FF6600]" size={32} /></div>
        ) : tickets.length === 0 ? (
          <div className="text-center py-20 text-[#6B7280]">
            <Play size={48} className="mx-auto mb-3 opacity-30" />
            <p>No hay workflows activos</p>
            <p className="text-xs mt-1">Inicia un workflow desde un ticket de la tab Incidencias</p>
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
// MAIN PAGE
// ═══════════════════════════════════════════════════════
export default function SATPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-[#F0F2F5]">SAT - Servicio Tecnico</h1>
        <p className="text-sm text-[#6B7280] mt-1">Incidencias, workflow de mantenimiento, ordenes de trabajo y equipos</p>
      </div>
      <Suspense fallback={<div className="flex justify-center py-10"><Loader2 className="animate-spin text-[#FF6600]" size={32} /></div>}>
        <Tabs tabs={satTabs} defaultTab="incidencias">
          {(activeTab) => (
            <>
              {activeTab === 'incidencias' && <IncidenciasTab />}
              {activeTab === 'workflow' && <WorkflowSATTab />}
              {activeTab === 'ordenes' && <OrdenesTrabajoTab />}
              {activeTab === 'activos' && <ActivosTab />}
            </>
          )}
        </Tabs>
      </Suspense>
    </div>
  )
}
