'use client'

import { useState, useEffect, useRef, Suspense } from 'react'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Modal } from '@/components/ui/modal'
import { Input } from '@/components/ui/input'
import { Select } from '@/components/ui/select'
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from '@/components/ui/table'
import { KPICard } from '@/components/ui/kpi-card'
import { Tabs } from '@/components/ui/tabs'
import { useToast } from '@/components/ui/toast'
import { createClient } from '@/lib/supabase/client'
import { formatCurrency, formatDate, formatRelative, CRM_STAGES } from '@/lib/utils'
import type { Opportunity, Client, User } from '@/types'
import {
  Plus, Target, Calendar, User as UserIcon, GripVertical, Save,
  Loader2, Activity, BarChart3, TrendingUp, PieChart, DollarSign
} from 'lucide-react'

type Row = Record<string, unknown>

const crmTabs = [
  { id: 'pipeline', label: 'Pipeline', icon: <Target size={16} /> },
  { id: 'actividades', label: 'Actividades', icon: <Activity size={16} /> },
  { id: 'informes', label: 'Informes', icon: <BarChart3 size={16} /> },
]

// ═══════════════════════════════════════════════════════
// PIPELINE TAB (existing CRM kanban)
// ═══════════════════════════════════════════════════════
function PipelineTab() {
  const { addToast } = useToast()
  const [opportunities, setOpportunities] = useState<Opportunity[]>([])
  const [loading, setLoading] = useState(true)
  const [selectedOpp, setSelectedOpp] = useState<Opportunity | null>(null)
  const [showNew, setShowNew] = useState(false)
  const [users, setUsers] = useState<User[]>([])
  const [dragId, setDragId] = useState<string | null>(null)
  const [newOpp, setNewOpp] = useState({ title: '', client_name: '', client_id: '', value: 0, currency: 'EUR', probability: 50, stage: 'lead' as string, assigned_to: '', expected_close_date: '', notes: '' })
  const [savingNew, setSavingNew] = useState(false)
  const [clientSearchResults, setClientSearchResults] = useState<Client[]>([])
  const [showClientDropdown, setShowClientDropdown] = useState(false)
  const clientDebounceRef = useRef<NodeJS.Timeout | null>(null)
  const [editStage, setEditStage] = useState('')
  const [editProbability, setEditProbability] = useState(0)
  const [editNotes, setEditNotes] = useState('')
  const [savingEdit, setSavingEdit] = useState(false)

  useEffect(() => { loadData() }, [])

  async function loadData() {
    const supabase = createClient(); setLoading(true)
    const [oppsRes, usersRes] = await Promise.all([
      supabase.from('tt_opportunities').select('*, client:tt_clients(company_name), assignee:tt_users(full_name)').order('sort_order', { ascending: true }),
      supabase.from('tt_users').select('*').eq('is_active', true),
    ])
    setOpportunities((oppsRes.data as unknown as Opportunity[]) || []); setUsers((usersRes.data as User[]) || []); setLoading(false)
  }

  function handleClientSearch(query: string) {
    setNewOpp((prev) => ({ ...prev, client_name: query }))
    if (!query.trim()) { setClientSearchResults([]); setShowClientDropdown(false); return }
    if (clientDebounceRef.current) clearTimeout(clientDebounceRef.current)
    clientDebounceRef.current = setTimeout(async () => {
      const supabase = createClient()
      const { data } = await supabase.from('tt_clients').select('id, company_name').ilike('company_name', `%${query}%`).limit(10)
      setClientSearchResults((data || []) as Client[]); setShowClientDropdown(true)
    }, 300)
  }

  function handleDragStart(e: React.DragEvent, oppId: string) { setDragId(oppId); e.dataTransfer.effectAllowed = 'move' }
  function handleDragOver(e: React.DragEvent) { e.preventDefault(); e.dataTransfer.dropEffect = 'move' }
  async function handleDrop(e: React.DragEvent, targetStage: string) {
    e.preventDefault(); if (!dragId) return
    const opp = opportunities.find((o) => o.id === dragId)
    if (!opp || opp.stage === targetStage) { setDragId(null); return }
    setOpportunities((prev) => prev.map((o) => (o.id === dragId ? { ...o, stage: targetStage as Opportunity['stage'] } : o))); setDragId(null)
    const supabase = createClient()
    const { error } = await supabase.from('tt_opportunities').update({ stage: targetStage, updated_at: new Date().toISOString() }).eq('id', opp.id)
    if (error) { setOpportunities((prev) => prev.map((o) => (o.id === opp.id ? { ...o, stage: opp.stage } : o))); addToast({ type: 'error', title: 'Error al mover' }) }
    else { addToast({ type: 'success', title: `Movido a ${CRM_STAGES.find(s => s.id === targetStage)?.label || targetStage}` }) }
  }

  function openDetail(opp: Opportunity) { setSelectedOpp(opp); setEditStage(opp.stage); setEditProbability(opp.probability); setEditNotes(opp.notes || '') }

  async function saveOppEdit() {
    if (!selectedOpp) return; setSavingEdit(true)
    const supabase = createClient()
    const { error } = await supabase.from('tt_opportunities').update({ stage: editStage, probability: editProbability, notes: editNotes, updated_at: new Date().toISOString() }).eq('id', selectedOpp.id)
    if (!error) { setOpportunities((prev) => prev.map((o) => o.id === selectedOpp.id ? { ...o, stage: editStage as Opportunity['stage'], probability: editProbability, notes: editNotes } : o)); setSelectedOpp(null); addToast({ type: 'success', title: 'Actualizada' }) }
    setSavingEdit(false)
  }

  async function createOpportunity() {
    if (!newOpp.title.trim()) { addToast({ type: 'error', title: 'El titulo es obligatorio' }); return }
    setSavingNew(true)
    const supabase = createClient()
    const { error } = await supabase.from('tt_opportunities').insert({ title: newOpp.title, client_id: newOpp.client_id || null, stage: newOpp.stage, value: newOpp.value, currency: newOpp.currency, probability: newOpp.probability, assigned_to: newOpp.assigned_to || null, expected_close_date: newOpp.expected_close_date || null, notes: newOpp.notes || null, tags: [], sort_order: 0 })
    if (!error) { addToast({ type: 'success', title: 'Oportunidad creada' }); setShowNew(false); setNewOpp({ title: '', client_name: '', client_id: '', value: 0, currency: 'EUR', probability: 50, stage: 'lead', assigned_to: '', expected_close_date: '', notes: '' }); loadData() }
    setSavingNew(false)
  }

  const pipelineTotal = opportunities.filter((o) => o.stage !== 'perdido').reduce((sum, o) => sum + o.value * (o.probability / 100), 0)
  const stageValues = CRM_STAGES.map((stage) => { const stageOpps = opportunities.filter((o) => o.stage === stage.id); return { ...stage, opps: stageOpps, totalValue: stageOpps.reduce((sum, o) => sum + o.value, 0), count: stageOpps.length } })

  if (loading) return <div className="flex justify-center py-20"><Loader2 className="animate-spin text-[#FF6600]" size={32} /></div>

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-4">
        <p className="text-[#6B7280]">{opportunities.length} oportunidades - Valor ponderado: <span className="text-[#FF6600] font-semibold">{formatCurrency(pipelineTotal, 'EUR')}</span></p>
        <Button variant="primary" onClick={() => setShowNew(true)}><Plus size={16} /> Nueva Oportunidad</Button>
      </div>

      <div className="flex gap-4 overflow-x-auto pb-4 -mx-4 px-4 lg:-mx-6 lg:px-6">
        {stageValues.map((stage) => (
          <div key={stage.id} className="flex-shrink-0 w-[300px]" onDragOver={handleDragOver} onDrop={(e) => handleDrop(e, stage.id)}>
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
              ) : stage.opps.map((opp) => (
                <div key={opp.id} draggable onDragStart={(e) => handleDragStart(e, opp.id)} onClick={() => openDetail(opp)} className={`p-3 rounded-lg bg-[#141820] border border-[#1E2330] hover:border-[#2A3040] transition-all cursor-pointer group ${dragId === opp.id ? 'opacity-50' : ''}`}>
                  <div className="flex items-start justify-between mb-2"><h4 className="text-sm font-medium text-[#F0F2F5] line-clamp-2 flex-1">{opp.title}</h4><GripVertical size={14} className="text-[#2A3040] group-hover:text-[#4B5563] shrink-0 ml-2 cursor-grab" /></div>
                  <p className="text-xs text-[#6B7280] mb-2">{(opp.client as unknown as { company_name: string })?.company_name || 'Sin cliente'}</p>
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-bold text-[#FF6600]">{formatCurrency(opp.value, (opp.currency || 'EUR') as 'EUR' | 'ARS' | 'USD')}</span>
                    <div className="flex items-center gap-1"><div className="w-12 h-1.5 rounded-full bg-[#1E2330] overflow-hidden"><div className="h-full rounded-full" style={{ width: `${opp.probability}%`, backgroundColor: opp.probability >= 70 ? '#10B981' : opp.probability >= 40 ? '#F59E0B' : '#6B7280' }} /></div><span className="text-[10px] text-[#6B7280]">{opp.probability}%</span></div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>

      <Modal isOpen={!!selectedOpp} onClose={() => setSelectedOpp(null)} title={selectedOpp?.title || ''} size="md">
        {selectedOpp && (
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <div className="p-3 rounded-lg bg-[#0F1218] border border-[#1E2330]"><p className="text-xs text-[#6B7280]">Cliente</p><p className="text-sm font-medium text-[#F0F2F5]">{(selectedOpp.client as unknown as { company_name: string })?.company_name || '-'}</p></div>
              <div className="p-3 rounded-lg bg-[#0F1218] border border-[#1E2330]"><p className="text-xs text-[#6B7280]">Valor</p><p className="text-sm font-bold text-[#FF6600]">{formatCurrency(selectedOpp.value, (selectedOpp.currency || 'EUR') as 'EUR' | 'ARS' | 'USD')}</p></div>
            </div>
            <Select label="Etapa" options={CRM_STAGES.map((s) => ({ value: s.id, label: s.label }))} value={editStage} onChange={(e) => setEditStage(e.target.value)} />
            <Input label="Probabilidad (%)" type="number" min={0} max={100} value={editProbability} onChange={(e) => setEditProbability(Number(e.target.value))} />
            <div className="flex gap-2 pt-2"><Button variant="primary" className="flex-1" onClick={saveOppEdit} loading={savingEdit}><Save size={14} /> Guardar</Button><Button variant="secondary" onClick={() => setSelectedOpp(null)}>Cerrar</Button></div>
          </div>
        )}
      </Modal>

      <Modal isOpen={showNew} onClose={() => setShowNew(false)} title="Nueva Oportunidad" size="md">
        <div className="space-y-4">
          <Input label="Titulo *" value={newOpp.title} onChange={(e) => setNewOpp({ ...newOpp, title: e.target.value })} />
          <div className="relative"><Input label="Cliente" value={newOpp.client_name} onChange={(e) => handleClientSearch(e.target.value)} />
            {showClientDropdown && clientSearchResults.length > 0 && (
              <div className="absolute top-full left-0 right-0 mt-1 bg-[#141820] border border-[#1E2330] rounded-lg shadow-xl z-10 max-h-36 overflow-y-auto">
                {clientSearchResults.map((c) => (<button key={c.id} onClick={() => { setNewOpp({ ...newOpp, client_id: c.id, client_name: c.company_name }); setShowClientDropdown(false) }} className="w-full text-left px-4 py-2 hover:bg-[#1E2330] text-sm text-[#F0F2F5]">{c.company_name}</button>))}
              </div>
            )}
          </div>
          <div className="grid grid-cols-2 gap-4">
            <Input label="Valor" type="number" value={newOpp.value || ''} onChange={(e) => setNewOpp({ ...newOpp, value: Number(e.target.value) })} />
            <Select label="Moneda" value={newOpp.currency} onChange={(e) => setNewOpp({ ...newOpp, currency: e.target.value })} options={[{ value: 'EUR', label: 'EUR' }, { value: 'USD', label: 'USD' }, { value: 'ARS', label: 'ARS' }]} />
          </div>
          <Select label="Etapa" value={newOpp.stage} onChange={(e) => setNewOpp({ ...newOpp, stage: e.target.value })} options={CRM_STAGES.map((s) => ({ value: s.id, label: s.label }))} />
          <div className="flex justify-end gap-2 pt-2"><Button variant="secondary" onClick={() => setShowNew(false)}>Cancelar</Button><Button variant="primary" onClick={createOpportunity} loading={savingNew}><Save size={14} /> Crear</Button></div>
        </div>
      </Modal>
    </div>
  )
}

// ═══════════════════════════════════════════════════════
// ACTIVIDADES TAB
// ═══════════════════════════════════════════════════════
function ActividadesTab() {
  const supabase = createClient()
  const [activities, setActivities] = useState<Row[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    (async () => {
      setLoading(true)
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
            {activities.map((a) => (
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
  const supabase = createClient()
  const [stats, setStats] = useState<{ total: number; won: number; lost: number; pipelineValue: number; byStage: Array<{ stage: string; count: number; value: number }> }>({ total: 0, won: 0, lost: 0, pipelineValue: 0, byStage: [] })
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    (async () => {
      setLoading(true)
      const { data } = await supabase.from('tt_opportunities').select('stage, value, probability')
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
          {stats.byStage.filter(s => s.count > 0).map((s) => {
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
