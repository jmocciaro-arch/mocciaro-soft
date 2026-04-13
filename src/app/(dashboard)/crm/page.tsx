'use client'

import { useState, useEffect, useRef, useCallback, Suspense } from 'react'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Modal } from '@/components/ui/modal'
import { Input } from '@/components/ui/input'
import { Select } from '@/components/ui/select'
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from '@/components/ui/table'
import { KPICard } from '@/components/ui/kpi-card'
import { Tabs } from '@/components/ui/tabs'
import { SearchBar } from '@/components/ui/search-bar'
import { useToast } from '@/components/ui/toast'
import { createClient } from '@/lib/supabase/client'
import { formatCurrency, formatDate, formatRelative, CRM_STAGES } from '@/lib/utils'
import type { Opportunity, Client, User } from '@/types'
import { ExportButton } from '@/components/ui/export-button'
import { useCompanyFilter } from '@/hooks/use-company-filter'
import {
  Plus, Target, Calendar, User as UserIcon, GripVertical, Save,
  Loader2, Activity, BarChart3, TrendingUp, PieChart, DollarSign,
  Search, Phone, Mail, Globe, MessageSquare, FileText, X,
  AlertCircle, Clock, Zap, UserPlus, Building2, Tag
} from 'lucide-react'

type Row = Record<string, unknown>

const LEAD_SOURCES = [
  { value: 'telefono', label: 'Llamada telefonica' },
  { value: 'email', label: 'Email recibido' },
  { value: 'whatsapp', label: 'WhatsApp' },
  { value: 'web_form', label: 'Formulario web' },
  { value: 'referido', label: 'Referido' },
  { value: 'feria', label: 'Feria / Evento' },
  { value: 'linkedin', label: 'LinkedIn' },
  { value: 'visita', label: 'Visita comercial' },
  { value: 'otro', label: 'Otro' },
]

const URGENCY_LEVELS = [
  { value: 'baja', label: 'Baja — sin apuro' },
  { value: 'media', label: 'Media — esta semana' },
  { value: 'alta', label: 'Alta — urgente' },
  { value: 'critica', label: 'Critica — para ayer' },
]

const PRODUCT_INTEREST = [
  { value: 'atornilladores', label: 'Atornilladores / Torque' },
  { value: 'llaves_torque', label: 'Llaves de torque / Torquimetros' },
  { value: 'equilibradoras', label: 'Equilibradoras / Balancines' },
  { value: 'soldadura', label: 'Soldadura por puntos' },
  { value: 'ingenieria', label: 'Ingenieria / Produccion' },
  { value: 'epp_seguridad', label: 'EPP / Seguridad Industrial' },
  { value: 'accesorios', label: 'Accesorios / Repuestos' },
  { value: 'servicio_tecnico', label: 'Servicio tecnico (SAT)' },
  { value: 'calibracion', label: 'Calibracion' },
  { value: 'ecommerce', label: 'Comercio electronico' },
  { value: 'logistica', label: 'Logistica / Envios' },
  { value: 'varios', label: 'Varios productos' },
  { value: 'otro', label: 'Otro' },
]

// Mapeo: producto de interes → especialidad del vendedor
const PRODUCT_TO_SPECIALTY: Record<string, string[]> = {
  atornilladores: ['torque'],
  llaves_torque: ['torque'],
  equilibradoras: ['ingenieria', 'produccion'],
  soldadura: ['ingenieria', 'produccion'],
  ingenieria: ['ingenieria', 'produccion'],
  epp_seguridad: ['epp_seguridad'],
  accesorios: ['torque', 'ingenieria'],
  servicio_tecnico: ['torque', 'ingenieria'],
  calibracion: ['torque'],
  ecommerce: ['ecommerce'],
  logistica: ['logistica'],
}

/** Staff specialties categories (editable in Admin → Users) */
export const STAFF_SPECIALTIES = [
  { value: 'torque', label: 'Torque (atornilladores, torquimetros)' },
  { value: 'ingenieria', label: 'Ingenieria / Produccion' },
  { value: 'produccion', label: 'Produccion' },
  { value: 'epp_seguridad', label: 'EPP / Seguridad Industrial' },
  { value: 'ecommerce', label: 'Comercio Electronico' },
  { value: 'logistica', label: 'Logistica / Envios' },
  { value: 'administracion', label: 'Administracion' },
  { value: 'sat', label: 'Servicio Tecnico (SAT)' },
  { value: 'calibracion', label: 'Calibracion' },
  { value: 'all', label: 'Ve todo (Admin)' },
]

const crmTabs = [
  { id: 'pipeline', label: 'Pipeline', icon: <Target size={16} /> },
  { id: 'actividades', label: 'Actividades', icon: <Activity size={16} /> },
  { id: 'informes', label: 'Informes', icon: <BarChart3 size={16} /> },
]

// ═══════════════════════════════════════════════════════
// PIPELINE TAB
// ═══════════════════════════════════════════════════════
function PipelineTab() {
  const { filterByCompany } = useCompanyFilter()
  const { addToast } = useToast()
  const [opportunities, setOpportunities] = useState<Opportunity[]>([])
  const [loading, setLoading] = useState(true)
  const [selectedOpp, setSelectedOpp] = useState<Opportunity | null>(null)
  const [showNew, setShowNew] = useState(false)
  const [users, setUsers] = useState<User[]>([])
  const [dragId, setDragId] = useState<string | null>(null)
  const [search, setSearch] = useState('')
  const [filterStage, setFilterStage] = useState('')
  const [filterAssigned, setFilterAssigned] = useState('')

  // New opportunity form
  const emptyOpp = { title: '', client_name: '', client_id: '', value: 0, currency: 'EUR', probability: 50, stage: 'lead' as string, assigned_to: '', expected_close_date: '', notes: '', source: '', urgency: 'media', product_interest: '', contact_name: '', contact_phone: '', contact_email: '' }
  const [newOpp, setNewOpp] = useState(emptyOpp)
  const [savingNew, setSavingNew] = useState(false)
  const [clientSearchResults, setClientSearchResults] = useState<Client[]>([])
  const [showClientDropdown, setShowClientDropdown] = useState(false)
  const [showNewClientInline, setShowNewClientInline] = useState(false)
  const clientDebounceRef = useRef<NodeJS.Timeout | null>(null)
  const clientInputRef = useRef<HTMLDivElement>(null)

  // Edit modal
  const [editData, setEditData] = useState({ stage: '', probability: 0, notes: '', assigned_to: '', value: 0, expected_close_date: '', source: '', urgency: '', lost_reason: '' })
  const [savingEdit, setSavingEdit] = useState(false)

  useEffect(() => { loadData() }, [])

  async function loadData() {
    const supabase = createClient(); setLoading(true)
    let oppsQuery = supabase.from('tt_opportunities').select('*, client:tt_clients(id, name, legal_name, email, phone), assignee:tt_users(full_name)').order('created_at', { ascending: false })
    oppsQuery = filterByCompany(oppsQuery)
    const [oppsRes, usersRes] = await Promise.all([
      oppsQuery,
      supabase.from('tt_users').select('*').eq('active', true),
    ])
    setOpportunities((oppsRes.data as unknown as Opportunity[]) || [])
    setUsers((usersRes.data as User[]) || [])
    setLoading(false)
  }

  // Client search with autocomplete
  function handleClientSearch(query: string) {
    setNewOpp(prev => ({ ...prev, client_name: query, client_id: '' }))
    setShowNewClientInline(false)
    if (!query.trim()) { setClientSearchResults([]); setShowClientDropdown(false); return }
    if (clientDebounceRef.current) clearTimeout(clientDebounceRef.current)
    clientDebounceRef.current = setTimeout(async () => {
      const supabase = createClient()
      const { data } = await supabase.from('tt_clients').select('id, name, legal_name, email, phone, country')
        .or(`name.ilike.%${query}%,legal_name.ilike.%${query}%,tax_id.ilike.%${query}%,email.ilike.%${query}%`)
        .eq('active', true).limit(10)
      setClientSearchResults((data || []) as Client[])
      setShowClientDropdown(true)
    }, 300)
  }

  function selectClient(client: Client) {
    setNewOpp(prev => ({
      ...prev,
      client_id: client.id,
      client_name: client.legal_name || client.name,
      contact_name: client.name !== client.legal_name ? client.name : '',
      contact_email: client.email || '',
      contact_phone: client.phone || '',
    }))
    setShowClientDropdown(false)
    // Auto-assign to client's salesperson if exists
    if (client.assigned_to && !newOpp.assigned_to) {
      setNewOpp(prev => ({ ...prev, assigned_to: client.assigned_to || '' }))
    }
  }

  // Drag & drop
  function handleDragStart(e: React.DragEvent, oppId: string) { setDragId(oppId); e.dataTransfer.effectAllowed = 'move' }
  function handleDragOver(e: React.DragEvent) { e.preventDefault(); e.dataTransfer.dropEffect = 'move' }
  async function handleDrop(e: React.DragEvent, targetStage: string) {
    e.preventDefault(); if (!dragId) return
    const opp = opportunities.find(o => o.id === dragId)
    if (!opp || opp.stage === targetStage) { setDragId(null); return }
    setOpportunities(prev => prev.map(o => o.id === dragId ? { ...o, stage: targetStage as Opportunity['stage'] } : o))
    setDragId(null)
    const supabase = createClient()
    const { error } = await supabase.from('tt_opportunities').update({ stage: targetStage }).eq('id', opp.id)
    if (error) {
      setOpportunities(prev => prev.map(o => o.id === opp.id ? { ...o, stage: opp.stage } : o))
      addToast({ type: 'error', title: 'Error al mover' })
    } else {
      addToast({ type: 'success', title: `Movido a ${CRM_STAGES.find(s => s.id === targetStage)?.label || targetStage}` })
    }
  }

  function openDetail(opp: Opportunity) {
    setSelectedOpp(opp)
    setEditData({
      stage: opp.stage,
      probability: opp.probability,
      notes: opp.notes || '',
      assigned_to: (opp as unknown as Row).assigned_to as string || '',
      value: (opp as unknown as Row).value as number || opp.expected_value || 0,
      expected_close_date: (opp as unknown as Row).expected_close_date as string || '',
      source: (opp as unknown as Row).source as string || '',
      urgency: ((opp as unknown as Row).tags as string[])?.find(t => ['baja', 'media', 'alta', 'critica'].includes(t)) || '',
      lost_reason: (opp as unknown as Row).lost_reason as string || '',
    })
  }

  async function saveOppEdit() {
    if (!selectedOpp) return; setSavingEdit(true)
    const supabase = createClient()
    const tags = editData.urgency ? [editData.urgency] : []
    const { error } = await supabase.from('tt_opportunities').update({
      stage: editData.stage,
      probability: editData.probability,
      notes: editData.notes,
      assigned_to: editData.assigned_to || null,
      value: editData.value,
      expected_close_date: editData.expected_close_date || null,
      source: editData.source || null,
      lost_reason: editData.stage === 'perdido' ? editData.lost_reason : null,
      tags,
    }).eq('id', selectedOpp.id)
    if (!error) {
      setSelectedOpp(null)
      addToast({ type: 'success', title: 'Oportunidad actualizada' })
      loadData()
    }
    setSavingEdit(false)
  }

  async function createOpportunity() {
    if (!newOpp.title.trim()) { addToast({ type: 'error', title: 'El titulo es obligatorio' }); return }
    setSavingNew(true)
    const supabase = createClient()

    // If creating new client inline
    let clientId = newOpp.client_id
    if (!clientId && showNewClientInline && newOpp.client_name.trim()) {
      const { data: newClient, error: clientErr } = await supabase.from('tt_clients').insert({
        name: newOpp.contact_name || newOpp.client_name,
        legal_name: newOpp.client_name,
        email: newOpp.contact_email || null,
        phone: newOpp.contact_phone || null,
        category: 'potential',
        source: 'crm',
        active: true,
        payment_terms: 'contado',
        credit_limit: 0,
      }).select('id').single()
      if (clientErr) { addToast({ type: 'error', title: 'Error creando cliente', message: clientErr.message }); setSavingNew(false); return }
      clientId = newClient.id

      // Create contact record if contact info provided
      if (newOpp.contact_name.trim()) {
        await supabase.from('tt_client_contacts').insert({
          client_id: clientId,
          name: newOpp.contact_name,
          email: newOpp.contact_email || null,
          phone: newOpp.contact_phone || null,
          is_primary: true,
        })
      }
    }

    const tags = newOpp.urgency ? [newOpp.urgency] : []
    if (newOpp.product_interest) tags.push(newOpp.product_interest)

    const { error } = await supabase.from('tt_opportunities').insert({
      title: newOpp.title,
      client_id: clientId || null,
      stage: newOpp.stage,
      value: newOpp.value,
      currency: newOpp.currency,
      probability: newOpp.probability,
      assigned_to: newOpp.assigned_to || null,
      expected_close_date: newOpp.expected_close_date || null,
      notes: newOpp.notes || null,
      source: newOpp.source || null,
      tags,
    })
    if (!error) {
      addToast({ type: 'success', title: 'Oportunidad creada' })
      setShowNew(false)
      setNewOpp(emptyOpp)
      setShowNewClientInline(false)
      loadData()
    } else {
      addToast({ type: 'error', title: 'Error', message: error.message })
    }
    setSavingNew(false)
  }

  // Filtered opportunities
  const filteredOpps = opportunities.filter(o => {
    if (filterStage && o.stage !== filterStage) return false
    if (filterAssigned && (o as unknown as Row).assigned_to !== filterAssigned) return false
    if (search.trim()) {
      const q = search.toLowerCase()
      const clientName = ((o.client as unknown as { name: string })?.name || '').toLowerCase()
      return o.title.toLowerCase().includes(q) || clientName.includes(q)
    }
    return true
  })

  const pipelineTotal = filteredOpps.filter(o => o.stage !== 'perdido').reduce((sum, o) => sum + ((o as unknown as Row).value as number || o.expected_value || 0) * (o.probability / 100), 0)
  const stageValues = CRM_STAGES.map(stage => {
    const stageOpps = filteredOpps.filter(o => o.stage === stage.id)
    return { ...stage, opps: stageOpps, totalValue: stageOpps.reduce((sum, o) => sum + ((o as unknown as Row).value as number || o.expected_value || 0), 0), count: stageOpps.length }
  })

  if (loading) return <div className="flex justify-center py-20"><Loader2 className="animate-spin text-[#FF6600]" size={32} /></div>

  return (
    <div className="space-y-4">
      {/* Top bar: search + filters + actions */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
        <div className="flex items-center gap-3 flex-1">
          <SearchBar placeholder="Buscar oportunidad o cliente..." value={search} onChange={setSearch} className="max-w-xs" />
          <Select value={filterStage} onChange={e => setFilterStage(e.target.value)} options={CRM_STAGES.map(s => ({ value: s.id, label: s.label }))} placeholder="Todas las etapas" />
          <Select value={filterAssigned} onChange={e => setFilterAssigned(e.target.value)} options={users.map(u => ({ value: u.id, label: u.full_name }))} placeholder="Todos los vendedores" />
        </div>
        <div className="flex items-center gap-2">
          <p className="text-xs text-[#6B7280] hidden lg:block">{filteredOpps.length} opps &middot; <span className="text-[#FF6600] font-semibold">{formatCurrency(pipelineTotal, 'EUR')}</span> ponderado</p>
          <ExportButton data={filteredOpps as unknown as Record<string, unknown>[]} filename="oportunidades" columns={[
            { key: 'title', label: 'Titulo' }, { key: 'stage', label: 'Etapa' }, { key: 'value', label: 'Valor' },
            { key: 'probability', label: 'Probabilidad %' }, { key: 'source', label: 'Canal' }, { key: 'created_at', label: 'Creado' },
          ]} />
          <Button variant="primary" onClick={() => setShowNew(true)}><Plus size={16} /> Nueva Oportunidad</Button>
        </div>
      </div>

      {/* Kanban columns */}
      <div className="flex gap-4 overflow-x-auto pb-4 -mx-4 px-4 lg:-mx-6 lg:px-6">
        {stageValues.map(stage => (
          <div key={stage.id} className="flex-shrink-0 w-[300px]" onDragOver={handleDragOver} onDrop={e => handleDrop(e, stage.id)}>
            <div className="flex items-center justify-between mb-3 px-1">
              <div className="flex items-center gap-2">
                <div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: stage.color }} />
                <h3 className="text-sm font-semibold text-[#F0F2F5]">{stage.label}</h3>
                <span className="text-xs text-[#6B7280] bg-[#1E2330] px-1.5 py-0.5 rounded-full">{stage.count}</span>
              </div>
              <span className="text-xs text-[#6B7280]">{formatCurrency(stage.totalValue, 'EUR')}</span>
            </div>
            <div className="space-y-2 min-h-[200px] p-2 rounded-xl bg-[#0F1218] border border-[#1E2330]">
              {stage.opps.length === 0 ? (
                <div className="flex items-center justify-center py-8 text-[#2A3040]"><p className="text-xs">Sin oportunidades</p></div>
              ) : stage.opps.map(opp => {
                const oppRow = opp as unknown as Row
                const oppValue = (oppRow.value as number) || opp.expected_value || 0
                const source = oppRow.source as string
                const assigneeName = (opp.assignee as unknown as { full_name: string })?.full_name
                const tags = (oppRow.tags as string[]) || []
                const urgency = tags.find(t => ['baja', 'media', 'alta', 'critica'].includes(t))
                return (
                  <div key={opp.id} draggable onDragStart={e => handleDragStart(e, opp.id)} onClick={() => openDetail(opp)}
                    className={`p-3 rounded-lg bg-[#141820] border border-[#1E2330] hover:border-[#FF6600]/30 transition-all cursor-pointer group ${dragId === opp.id ? 'opacity-50' : ''}`}>
                    <div className="flex items-start justify-between mb-1.5">
                      <h4 className="text-sm font-medium text-[#F0F2F5] line-clamp-2 flex-1">{opp.title}</h4>
                      <GripVertical size={14} className="text-[#2A3040] group-hover:text-[#4B5563] shrink-0 ml-2 cursor-grab" />
                    </div>
                    <p className="text-xs text-[#6B7280] mb-2">{(opp.client as unknown as { name: string })?.name || (opp.client as unknown as { legal_name: string })?.legal_name || 'Sin cliente'}</p>
                    <div className="flex items-center justify-between mb-1.5">
                      <span className="text-sm font-bold text-[#FF6600]">{formatCurrency(oppValue, 'EUR')}</span>
                      <div className="flex items-center gap-1">
                        <div className="w-12 h-1.5 rounded-full bg-[#1E2330] overflow-hidden">
                          <div className="h-full rounded-full" style={{ width: `${opp.probability}%`, backgroundColor: opp.probability >= 70 ? '#10B981' : opp.probability >= 40 ? '#F59E0B' : '#6B7280' }} />
                        </div>
                        <span className="text-[10px] text-[#6B7280]">{opp.probability}%</span>
                      </div>
                    </div>
                    {/* Tags row */}
                    <div className="flex items-center gap-1.5 flex-wrap">
                      {source && <span className="text-[9px] px-1.5 py-0.5 rounded bg-[#1E2330] text-[#9CA3AF]">{LEAD_SOURCES.find(s => s.value === source)?.label || source}</span>}
                      {urgency && <span className={`text-[9px] px-1.5 py-0.5 rounded ${urgency === 'critica' ? 'bg-red-500/20 text-red-400' : urgency === 'alta' ? 'bg-orange-500/20 text-orange-400' : urgency === 'media' ? 'bg-yellow-500/20 text-yellow-400' : 'bg-[#1E2330] text-[#6B7280]'}`}>{urgency}</span>}
                      {assigneeName && <span className="text-[9px] px-1.5 py-0.5 rounded bg-blue-500/10 text-blue-400">{assigneeName}</span>}
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        ))}
      </div>

      {/* ─── DETAIL MODAL ─── */}
      <Modal isOpen={!!selectedOpp} onClose={() => setSelectedOpp(null)} title={selectedOpp?.title || ''} size="lg">
        {selectedOpp && (
          <div className="space-y-4">
            <div className="grid grid-cols-2 lg:grid-cols-3 gap-3">
              <div className="p-3 rounded-lg bg-[#0F1218] border border-[#1E2330]">
                <p className="text-xs text-[#6B7280]">Cliente</p>
                <p className="text-sm font-medium text-[#F0F2F5]">{(selectedOpp.client as unknown as { legal_name?: string; name?: string })?.legal_name || (selectedOpp.client as unknown as { name: string })?.name || '-'}</p>
              </div>
              <div className="p-3 rounded-lg bg-[#0F1218] border border-[#1E2330]">
                <p className="text-xs text-[#6B7280]">Email</p>
                <p className="text-sm text-[#F0F2F5]">{(selectedOpp.client as unknown as { email?: string })?.email || '-'}</p>
              </div>
              <div className="p-3 rounded-lg bg-[#0F1218] border border-[#1E2330]">
                <p className="text-xs text-[#6B7280]">Telefono</p>
                <p className="text-sm text-[#F0F2F5]">{(selectedOpp.client as unknown as { phone?: string })?.phone || '-'}</p>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <Input label="Valor" type="number" value={editData.value || ''} onChange={e => setEditData({ ...editData, value: Number(e.target.value) })} />
              <Select label="Etapa" options={CRM_STAGES.map(s => ({ value: s.id, label: s.label }))} value={editData.stage} onChange={e => setEditData({ ...editData, stage: e.target.value })} />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <Input label="Probabilidad (%)" type="number" min={0} max={100} value={editData.probability} onChange={e => setEditData({ ...editData, probability: Number(e.target.value) })} />
              <Select label="Vendedor asignado" options={users.map(u => ({ value: u.id, label: u.full_name }))} value={editData.assigned_to} onChange={e => setEditData({ ...editData, assigned_to: e.target.value })} placeholder="Sin asignar" />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <Input label="Fecha cierre esperado" type="date" value={editData.expected_close_date} onChange={e => setEditData({ ...editData, expected_close_date: e.target.value })} />
              <Select label="Canal de origen" options={LEAD_SOURCES} value={editData.source} onChange={e => setEditData({ ...editData, source: e.target.value })} placeholder="No especificado" />
            </div>
            <Select label="Urgencia" options={URGENCY_LEVELS} value={editData.urgency} onChange={e => setEditData({ ...editData, urgency: e.target.value })} placeholder="Sin definir" />
            {editData.stage === 'perdido' && (
              <Input label="Razon de perdida" value={editData.lost_reason} onChange={e => setEditData({ ...editData, lost_reason: e.target.value })} placeholder="Precio, competencia, timing..." />
            )}
            <Input label="Notas" value={editData.notes} onChange={e => setEditData({ ...editData, notes: e.target.value })} />
            <p className="text-[10px] text-[#4B5563]">Creado: {selectedOpp.created_at ? formatDate(selectedOpp.created_at) : '-'}</p>
            <div className="flex gap-2 pt-2">
              <Button variant="primary" className="flex-1" onClick={saveOppEdit} loading={savingEdit}><Save size={14} /> Guardar</Button>
              <Button variant="secondary" onClick={() => setSelectedOpp(null)}>Cerrar</Button>
            </div>
          </div>
        )}
      </Modal>

      {/* ─── NEW OPPORTUNITY MODAL ─── */}
      <Modal isOpen={showNew} onClose={() => { setShowNew(false); setShowNewClientInline(false) }} title="Nueva Oportunidad" size="lg">
        <div className="space-y-4">
          <Input label="Titulo de la oportunidad *" placeholder="ej: Cotizacion atornilladores FIAM para linea de montaje" value={newOpp.title} onChange={e => setNewOpp({ ...newOpp, title: e.target.value })} />

          {/* Client search */}
          <div ref={clientInputRef}>
            <label className="block text-xs font-medium text-[#9CA3AF] mb-1">Cliente</label>
            <div className="relative">
              <div className="flex gap-2">
                <div className="relative flex-1">
                  <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-[#4B5563]" />
                  <input
                    type="text"
                    value={newOpp.client_name}
                    onChange={e => handleClientSearch(e.target.value)}
                    onFocus={() => { if (clientSearchResults.length > 0) setShowClientDropdown(true) }}
                    placeholder="Buscar cliente por nombre, CIF, email..."
                    className="w-full h-10 pl-9 pr-3 rounded-lg bg-[#0F1218] border border-[#1E2330] text-sm text-[#F0F2F5] placeholder:text-[#4B5563] focus:outline-none focus:border-[#FF6600]/50"
                  />
                  {newOpp.client_id && <span className="absolute right-3 top-1/2 -translate-y-1/2 text-[10px] text-green-400 font-medium">Vinculado</span>}
                </div>
                {!newOpp.client_id && newOpp.client_name.trim() && (
                  <Button variant="secondary" onClick={() => setShowNewClientInline(true)} className="shrink-0 text-xs">
                    <UserPlus size={14} /> Nuevo
                  </Button>
                )}
              </div>

              {/* Client dropdown */}
              {showClientDropdown && clientSearchResults.length > 0 && (
                <div className="absolute top-full left-0 right-0 mt-1 bg-[#141820] border border-[#1E2330] rounded-lg shadow-xl z-20 max-h-48 overflow-y-auto">
                  {clientSearchResults.map(c => (
                    <button key={c.id} onClick={() => selectClient(c)} className="w-full text-left px-4 py-2.5 hover:bg-[#1E2330] transition-colors border-b border-[#1E2330] last:border-0">
                      <p className="text-sm font-medium text-[#F0F2F5]">{c.legal_name || c.name}</p>
                      <p className="text-[10px] text-[#6B7280]">{[c.email, c.phone, c.country].filter(Boolean).join(' · ')}</p>
                    </button>
                  ))}
                </div>
              )}
              {showClientDropdown && clientSearchResults.length === 0 && newOpp.client_name.trim().length >= 2 && (
                <div className="absolute top-full left-0 right-0 mt-1 bg-[#141820] border border-[#1E2330] rounded-lg shadow-xl z-20 p-4 text-center">
                  <p className="text-xs text-[#6B7280] mb-2">No se encontro el cliente</p>
                  <Button variant="secondary" onClick={() => { setShowNewClientInline(true); setShowClientDropdown(false) }} className="text-xs">
                    <UserPlus size={14} /> Crear &ldquo;{newOpp.client_name}&rdquo; como nuevo cliente
                  </Button>
                </div>
              )}
            </div>
          </div>

          {/* New client inline form */}
          {showNewClientInline && (
            <div className="p-4 rounded-lg bg-green-500/5 border border-green-500/20 space-y-3">
              <div className="flex items-center justify-between">
                <p className="text-xs font-semibold text-green-400">Nuevo cliente: {newOpp.client_name}</p>
                <button onClick={() => setShowNewClientInline(false)} className="text-[#6B7280] hover:text-[#F0F2F5]"><X size={14} /></button>
              </div>
              <div className="grid grid-cols-3 gap-3">
                <Input label="Contacto" placeholder="Nombre persona" value={newOpp.contact_name} onChange={e => setNewOpp({ ...newOpp, contact_name: e.target.value })} />
                <Input label="Email" type="email" value={newOpp.contact_email} onChange={e => setNewOpp({ ...newOpp, contact_email: e.target.value })} />
                <Input label="Telefono" value={newOpp.contact_phone} onChange={e => setNewOpp({ ...newOpp, contact_phone: e.target.value })} />
              </div>
            </div>
          )}

          {/* Value + Currency + Source */}
          <div className="grid grid-cols-3 gap-4">
            <Input label="Valor estimado" type="number" value={newOpp.value || ''} onChange={e => setNewOpp({ ...newOpp, value: Number(e.target.value) })} />
            <Select label="Moneda" value={newOpp.currency} onChange={e => setNewOpp({ ...newOpp, currency: e.target.value })} options={[{ value: 'EUR', label: 'EUR' }, { value: 'USD', label: 'USD' }, { value: 'ARS', label: 'ARS' }]} />
            <Select label="Canal de origen *" value={newOpp.source} onChange={e => setNewOpp({ ...newOpp, source: e.target.value })} options={LEAD_SOURCES} placeholder="Seleccionar..." />
          </div>

          {/* Product interest + Urgency */}
          <div className="grid grid-cols-2 gap-4">
            <Select label="Producto de interes" value={newOpp.product_interest} onChange={e => {
              const product = e.target.value
              setNewOpp(prev => ({ ...prev, product_interest: product }))
              // Auto-suggest vendor by specialty (only if not already assigned)
              if (product && !newOpp.assigned_to && !newOpp.client_id) {
                const neededSpecs = PRODUCT_TO_SPECIALTY[product] || []
                if (neededSpecs.length > 0) {
                  const match = users.find(u => {
                    const specs = ((u as unknown as Row).permissions as Record<string, unknown>)?.specialties as string[] || []
                    return neededSpecs.some(s => specs.includes(s)) && !specs.includes('all')
                  })
                  if (match) {
                    setNewOpp(prev => ({ ...prev, assigned_to: match.id }))
                    addToast({ type: 'info', title: `Auto-asignado a ${match.full_name}`, message: `Especialista en ${neededSpecs.join(', ')}` })
                  }
                }
              }
            }} options={PRODUCT_INTEREST} placeholder="Seleccionar..." />
            <Select label="Urgencia" value={newOpp.urgency} onChange={e => setNewOpp({ ...newOpp, urgency: e.target.value })} options={URGENCY_LEVELS} />
          </div>

          {/* Assigned to + Stage + Probability */}
          <div className="grid grid-cols-3 gap-4">
            <Select label="Vendedor asignado" value={newOpp.assigned_to} onChange={e => setNewOpp({ ...newOpp, assigned_to: e.target.value })} options={users.map(u => ({ value: u.id, label: u.full_name }))} placeholder="Sin asignar" />
            <Select label="Etapa" value={newOpp.stage} onChange={e => setNewOpp({ ...newOpp, stage: e.target.value })} options={CRM_STAGES.map(s => ({ value: s.id, label: s.label }))} />
            <Input label="Probabilidad %" type="number" min={0} max={100} value={newOpp.probability} onChange={e => setNewOpp({ ...newOpp, probability: Number(e.target.value) })} />
          </div>

          {/* Close date + Notes */}
          <div className="grid grid-cols-2 gap-4">
            <Input label="Fecha cierre esperado" type="date" value={newOpp.expected_close_date} onChange={e => setNewOpp({ ...newOpp, expected_close_date: e.target.value })} />
            <Input label="Notas" value={newOpp.notes} onChange={e => setNewOpp({ ...newOpp, notes: e.target.value })} placeholder="Contexto, necesidades especificas..." />
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <Button variant="secondary" onClick={() => { setShowNew(false); setShowNewClientInline(false) }}>Cancelar</Button>
            <Button variant="primary" onClick={createOpportunity} loading={savingNew}><Save size={14} /> Crear Oportunidad</Button>
          </div>
        </div>
      </Modal>
    </div>
  )
}

// ═══════════════════════════════════════════════════════
// ACTIVIDADES TAB
// ═══════════════════════════════════════════════════════
function ActividadesTab() {
  const [activities, setActivities] = useState<Row[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    (async () => {
      setLoading(true)
      const supabase = createClient()
      const { data } = await supabase.from('tt_activity_log').select('*').in('entity_type', ['opportunity', 'client', 'quote', 'sales_order']).order('created_at', { ascending: false }).limit(50)
      setActivities(data || [])
      setLoading(false)
    })()
  }, [])

  return (
    <div className="space-y-4">
      <KPICard label="Actividades recientes" value={activities.length} icon={<Activity size={22} />} />
      <Card className="p-0 overflow-hidden">
        {loading ? (
          <div className="flex items-center justify-center py-20"><Loader2 className="animate-spin text-[#FF6600]" size={32} /></div>
        ) : activities.length === 0 ? (
          <div className="text-center py-20 text-[#6B7280]"><Activity size={48} className="mx-auto mb-3 opacity-30" /><p>No hay actividades</p></div>
        ) : (
          <div className="divide-y divide-[#1E2330]">
            {activities.map(a => (
              <div key={a.id as string} className="flex items-start gap-3 p-4">
                <div className="w-2 h-2 rounded-full bg-[#FF6600] mt-2 shrink-0" />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <Badge variant="default" size="sm">{(a.entity_type as string) || '-'}</Badge>
                    <span className="text-sm font-medium text-[#F0F2F5]">{(a.action as string) || '-'}</span>
                  </div>
                  <p className="text-xs text-[#9CA3AF] truncate">{(a.detail as string) || (a.description as string) || ''}</p>
                  <p className="text-[10px] text-[#4B5563] mt-1">{a.created_at ? formatRelative(a.created_at as string) : ''}</p>
                </div>
              </div>
            ))}
          </div>
        )}
      </Card>
    </div>
  )
}

// ═══════════════════════════════════════════════════════
// INFORMES TAB
// ═══════════════════════════════════════════════════════
function InformesTab() {
  const { filterByCompany } = useCompanyFilter()
  const [stats, setStats] = useState<{ total: number; won: number; lost: number; pipelineValue: number; byStage: Array<{ stage: string; count: number; value: number }> }>({ total: 0, won: 0, lost: 0, pipelineValue: 0, byStage: [] })
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    (async () => {
      setLoading(true)
      const supabase = createClient()
      let q = supabase.from('tt_opportunities').select('stage, value, probability')
      q = filterByCompany(q)
      const { data } = await q
      const opps = data || []
      const won = opps.filter(o => (o.stage as string) === 'ganado').length
      const lost = opps.filter(o => (o.stage as string) === 'perdido').length
      const pipelineValue = opps.filter(o => (o.stage as string) !== 'perdido').reduce((s, o) => s + ((o.value as number) || 0) * (((o.probability as number) || 0) / 100), 0)
      const byStage = CRM_STAGES.map(s => {
        const stageOpps = opps.filter(o => (o.stage as string) === s.id)
        return { stage: s.label, count: stageOpps.length, value: stageOpps.reduce((sum, o) => sum + ((o.value as number) || 0), 0) }
      })
      setStats({ total: opps.length, won, lost, pipelineValue, byStage })
      setLoading(false)
    })()
  }, [])

  if (loading) return <div className="flex justify-center py-20"><Loader2 className="animate-spin text-[#FF6600]" size={32} /></div>

  const winRate = stats.total > 0 ? Math.round((stats.won / (stats.won + stats.lost || 1)) * 100) : 0

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <KPICard label="Total oportunidades" value={stats.total} icon={<Target size={22} />} />
        <KPICard label="Ganadas" value={stats.won} icon={<TrendingUp size={22} />} color="#10B981" />
        <KPICard label="Perdidas" value={stats.lost} icon={<PieChart size={22} />} color="#EF4444" />
        <KPICard label="Tasa de conversion" value={`${winRate}%`} icon={<BarChart3 size={22} />} color="#3B82F6" />
      </div>
      <Card>
        <h3 className="text-sm font-semibold text-[#F0F2F5] mb-4">Valor por etapa del pipeline</h3>
        <div className="space-y-3">
          {stats.byStage.filter(s => s.count > 0).map(s => {
            const maxVal = Math.max(...stats.byStage.map(b => b.value), 1)
            const width = Math.max((s.value / maxVal) * 100, 5)
            return (
              <div key={s.stage}>
                <div className="flex justify-between text-sm mb-1"><span className="text-[#9CA3AF]">{s.stage}</span><span className="text-[#F0F2F5] font-medium">{formatCurrency(s.value)} ({s.count})</span></div>
                <div className="w-full h-3 rounded-full bg-[#1E2330]"><div className="h-full rounded-full bg-[#FF6600] transition-all" style={{ width: `${width}%` }} /></div>
              </div>
            )
          })}
        </div>
      </Card>
      <KPICard label="Valor ponderado del pipeline" value={formatCurrency(stats.pipelineValue)} icon={<DollarSign size={22} />} color="#FF6600" />
    </div>
  )
}

// ═══════════════════════════════════════════════════════
// MAIN PAGE
// ═══════════════════════════════════════════════════════
export default function CRMPage() {
  return (
    <div className="space-y-6 animate-fade-in">
      <div>
        <h1 className="text-2xl font-bold text-[#F0F2F5]">Pipeline CRM</h1>
        <p className="text-sm text-[#6B7280] mt-1">Pipeline, actividades e informes comerciales</p>
      </div>
      <Suspense fallback={<div className="flex justify-center py-10"><Loader2 className="animate-spin text-[#FF6600]" size={32} /></div>}>
        <Tabs tabs={crmTabs} defaultTab="pipeline">
          {(activeTab) => (
            <>
              {activeTab === 'pipeline' && <PipelineTab />}
              {activeTab === 'actividades' && <ActividadesTab />}
              {activeTab === 'informes' && <InformesTab />}
            </>
          )}
        </Tabs>
      </Suspense>
    </div>
  )
}
