'use client'

import { useState, useEffect, useCallback, useMemo } from 'react'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Select } from '@/components/ui/select'
import { Badge } from '@/components/ui/badge'
import { Modal } from '@/components/ui/modal'
import { Tabs } from '@/components/ui/tabs'
import { SearchBar } from '@/components/ui/search-bar'
import { useToast } from '@/components/ui/toast'
import { createClient } from '@/lib/supabase/client'
import { formatDateTime, formatRelative } from '@/lib/utils'
import {
  Zap, Plus, Loader2, Save, Trash2, Power, PowerOff, Clock,
  Mail, MessageSquare, Bell, ArrowRight, Edit, Eye,
  FileText, Play, AlertTriangle, CheckCircle2,
  Send, Code,
} from 'lucide-react'

type Row = Record<string, unknown>

// ═══════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════
interface Automation {
  id: string
  name: string
  trigger_type: string
  trigger_config: Record<string, unknown> | null
  action_type: string
  action_config: Record<string, unknown> | null
  delay_hours: number
  company_id: string | null
  active: boolean
  last_run: string | null
  run_count: number
  created_at?: string
}

interface EmailTemplate {
  id: string
  name: string
  subject: string
  body_html: string
  doc_type: string | null
  language: string
  variables: string[] | null
  company_id: string | null
  active: boolean
  created_at?: string
}

const TRIGGER_TYPES = [
  { value: 'invoice_overdue', label: 'Factura vencida', icon: AlertTriangle, color: '#FF3D00' },
  { value: 'invoice_due_soon', label: 'Factura proxima a vencer', icon: Clock, color: '#FFB300' },
  { value: 'quote_expired', label: 'Cotizacion expirada', icon: FileText, color: '#9CA3AF' },
  { value: 'lead_no_response', label: 'Lead sin respuesta', icon: MessageSquare, color: '#3B82F6' },
  { value: 'payment_received', label: 'Pago recibido', icon: CheckCircle2, color: '#00C853' },
  { value: 'order_delivered', label: 'Pedido entregado', icon: Send, color: '#FF6600' },
]

const ACTION_TYPES = [
  { value: 'send_email', label: 'Enviar email', icon: Mail },
  { value: 'send_whatsapp', label: 'Enviar WhatsApp', icon: MessageSquare },
  { value: 'create_alert', label: 'Crear alerta', icon: Bell },
  { value: 'change_status', label: 'Cambiar estado', icon: ArrowRight },
]

const DOC_TYPES = [
  { value: 'cotizacion', label: 'Cotizacion' },
  { value: 'pedido', label: 'Pedido' },
  { value: 'factura', label: 'Factura' },
  { value: 'albaran', label: 'Albaran' },
  { value: 'pap', label: 'Pedido de compra' },
]

const TEMPLATE_VARIABLES = [
  '{{client_name}}', '{{document_ref}}', '{{total}}', '{{due_date}}',
  '{{company_name}}', '{{agent_name}}', '{{product_name}}', '{{tracking_url}}',
]

const pageTabs = [
  { id: 'automations', label: 'Automatizaciones', icon: <Zap size={16} /> },
  { id: 'templates', label: 'Plantillas de email', icon: <Mail size={16} /> },
]

// ═══════════════════════════════════════════════════════
// TRIGGER / ACTION BADGES
// ═══════════════════════════════════════════════════════
function TriggerBadge({ type }: { type: string }) {
  const config = TRIGGER_TYPES.find((t) => t.value === type)
  if (!config) return <Badge>{type}</Badge>
  const Icon = config.icon
  return (
    <span
      className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-bold border"
      style={{
        backgroundColor: `${config.color}15`,
        color: config.color,
        borderColor: `${config.color}30`,
      }}
    >
      <Icon size={11} />
      {config.label}
    </span>
  )
}

function ActionBadge({ type }: { type: string }) {
  const config = ACTION_TYPES.find((t) => t.value === type)
  if (!config) return <Badge>{type}</Badge>
  const Icon = config.icon
  return (
    <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-bold bg-[#FF6600]/10 text-[#FF6600] border border-[#FF6600]/20">
      <Icon size={11} />
      {config.label}
    </span>
  )
}

// ═══════════════════════════════════════════════════════
// AUTOMATIONS TAB
// ═══════════════════════════════════════════════════════
function AutomationsTab() {
  const [automations, setAutomations] = useState<Automation[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [showModal, setShowModal] = useState(false)
  const [editing, setEditing] = useState<Automation | null>(null)
  const [saving, setSaving] = useState(false)
  const [deleting, setDeleting] = useState<string | null>(null)
  const { addToast } = useToast()

  // Form state
  const [formName, setFormName] = useState('')
  const [formTrigger, setFormTrigger] = useState('')
  const [formAction, setFormAction] = useState('')
  const [formDelay, setFormDelay] = useState(0)
  const [formActive, setFormActive] = useState(true)
  const [formTemplateId, setFormTemplateId] = useState('')

  // Templates for action_config
  const [templates, setTemplates] = useState<Array<{ id: string; name: string }>>([])

  const loadAutomations = useCallback(async () => {
    const sb = createClient()
    setLoading(true)
    try {
      const { data } = await sb
        .from('tt_automations')
        .select('*')
        .order('created_at', { ascending: false })
      setAutomations((data || []).map((a: Row) => ({
        id: (a.id as string) || '',
        name: (a.name as string) || '',
        trigger_type: (a.trigger_type as string) || '',
        trigger_config: (a.trigger_config as Record<string, unknown>) || null,
        action_type: (a.action_type as string) || '',
        action_config: (a.action_config as Record<string, unknown>) || null,
        delay_hours: (a.delay_hours as number) || 0,
        company_id: (a.company_id as string) || null,
        active: (a.active as boolean) ?? true,
        last_run: (a.last_run as string) || null,
        run_count: (a.run_count as number) || 0,
        created_at: (a.created_at as string) || '',
      })))

      // Load template names for the action config selector
      const { data: tplData } = await sb
        .from('tt_email_templates')
        .select('id, name')
        .eq('active', true)
        .order('name')
      setTemplates((tplData || []).map((t: Row) => ({
        id: (t.id as string) || '',
        name: (t.name as string) || '',
      })))
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { loadAutomations() }, [loadAutomations])

  function openCreateModal() {
    setEditing(null)
    setFormName('')
    setFormTrigger('')
    setFormAction('')
    setFormDelay(0)
    setFormActive(true)
    setFormTemplateId('')
    setShowModal(true)
  }

  function openEditModal(automation: Automation) {
    setEditing(automation)
    setFormName(automation.name)
    setFormTrigger(automation.trigger_type)
    setFormAction(automation.action_type)
    setFormDelay(automation.delay_hours)
    setFormActive(automation.active)
    setFormTemplateId((automation.action_config?.template_id as string) || '')
    setShowModal(true)
  }

  const handleSave = useCallback(async () => {
    if (!formName.trim() || !formTrigger || !formAction) {
      addToast({ type: 'warning', title: 'Completa los campos obligatorios' })
      return
    }
    setSaving(true)
    try {
      const sb = createClient()
      const payload = {
        name: formName.trim(),
        trigger_type: formTrigger,
        trigger_config: {},
        action_type: formAction,
        action_config: formAction === 'send_email' && formTemplateId ? { template_id: formTemplateId } : {},
        delay_hours: formDelay,
        active: formActive,
      }
      if (editing) {
        const { error } = await sb.from('tt_automations').update(payload).eq('id', editing.id)
        if (error) throw error
        addToast({ type: 'success', title: 'Automatizacion actualizada' })
      } else {
        const { error } = await sb.from('tt_automations').insert(payload)
        if (error) throw error
        addToast({ type: 'success', title: 'Automatizacion creada' })
      }
      setShowModal(false)
      loadAutomations()
    } catch (err) {
      addToast({ type: 'error', title: 'Error al guardar', message: (err as Error).message })
    } finally {
      setSaving(false)
    }
  }, [formName, formTrigger, formAction, formDelay, formActive, formTemplateId, editing, addToast, loadAutomations])

  const toggleActive = useCallback(async (automation: Automation) => {
    const sb = createClient()
    try {
      const { error } = await sb
        .from('tt_automations')
        .update({ active: !automation.active })
        .eq('id', automation.id)
      if (error) throw error
      addToast({ type: 'success', title: `Automatizacion ${automation.active ? 'desactivada' : 'activada'}` })
      loadAutomations()
    } catch (err) {
      addToast({ type: 'error', title: 'Error', message: (err as Error).message })
    }
  }, [addToast, loadAutomations])

  const handleDelete = useCallback(async (id: string) => {
    setDeleting(id)
    try {
      const sb = createClient()
      const { error } = await sb.from('tt_automations').delete().eq('id', id)
      if (error) throw error
      addToast({ type: 'success', title: 'Automatizacion eliminada' })
      loadAutomations()
    } catch (err) {
      addToast({ type: 'error', title: 'Error', message: (err as Error).message })
    } finally {
      setDeleting(null)
    }
  }, [addToast, loadAutomations])

  const filtered = useMemo(() => {
    if (!search.trim()) return automations
    const q = search.toLowerCase()
    return automations.filter((a) =>
      a.name.toLowerCase().includes(q) ||
      a.trigger_type.toLowerCase().includes(q) ||
      a.action_type.toLowerCase().includes(q)
    )
  }, [automations, search])

  return (
    <div className="space-y-4">
      {/* Toolbar */}
      <div className="flex flex-col md:flex-row gap-3 items-start md:items-center justify-between">
        <SearchBar value={search} onChange={setSearch} placeholder="Buscar automatizaciones..." className="flex-1" />
        <Button onClick={openCreateModal}>
          <Plus size={14} /> Nueva automatizacion
        </Button>
      </div>

      {/* List */}
      {loading ? (
        <div className="flex justify-center py-16"><Loader2 size={32} className="animate-spin text-[#FF6600]" /></div>
      ) : filtered.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 text-[#4B5563]">
          <Zap size={48} className="mb-4" />
          <p className="text-sm">{search ? 'No se encontraron automatizaciones' : 'No hay automatizaciones creadas'}</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filtered.map((auto) => (
            <Card key={auto.id} className={`relative ${!auto.active ? 'opacity-60' : ''}`}>
              <div className="space-y-3">
                {/* Header */}
                <div className="flex items-start justify-between">
                  <div className="flex-1 min-w-0">
                    <h3 className="text-sm font-bold text-[#F0F2F5] truncate">{auto.name}</h3>
                  </div>
                  <div className="flex items-center gap-1 ml-2 shrink-0">
                    <button
                      onClick={() => toggleActive(auto)}
                      className={`p-1.5 rounded-lg transition-colors ${auto.active ? 'bg-emerald-500/10 text-emerald-400 hover:bg-emerald-500/20' : 'bg-[#1E2330] text-[#6B7280] hover:bg-[#2A3040]'}`}
                      title={auto.active ? 'Desactivar' : 'Activar'}
                    >
                      {auto.active ? <Power size={14} /> : <PowerOff size={14} />}
                    </button>
                    <button
                      onClick={() => openEditModal(auto)}
                      className="p-1.5 rounded-lg bg-[#1E2330] hover:bg-[#2A3040] text-[#6B7280] hover:text-[#F0F2F5] transition-colors"
                      title="Editar"
                    >
                      <Edit size={14} />
                    </button>
                    <button
                      onClick={() => handleDelete(auto.id)}
                      disabled={deleting === auto.id}
                      className="p-1.5 rounded-lg bg-[#1E2330] hover:bg-red-500/10 text-[#6B7280] hover:text-red-400 transition-colors"
                      title="Eliminar"
                    >
                      {deleting === auto.id ? <Loader2 size={14} className="animate-spin" /> : <Trash2 size={14} />}
                    </button>
                  </div>
                </div>

                {/* Badges */}
                <div className="flex flex-wrap gap-2">
                  <TriggerBadge type={auto.trigger_type} />
                  <ActionBadge type={auto.action_type} />
                </div>

                {/* Meta */}
                <div className="flex items-center justify-between text-xs text-[#6B7280] pt-2 border-t border-[#1E2330]">
                  <div className="flex items-center gap-1.5">
                    <Clock size={12} />
                    <span>Delay: {auto.delay_hours}h</span>
                  </div>
                  <div className="flex items-center gap-3">
                    {auto.last_run && (
                      <span title={formatDateTime(auto.last_run)}>
                        Ultima: {formatRelative(auto.last_run)}
                      </span>
                    )}
                    <span className="flex items-center gap-1">
                      <Play size={10} /> {auto.run_count}
                    </span>
                  </div>
                </div>
              </div>
            </Card>
          ))}
        </div>
      )}

      {/* Create / Edit Modal */}
      <Modal isOpen={showModal} onClose={() => setShowModal(false)} title={editing ? 'Editar automatizacion' : 'Nueva automatizacion'} size="lg">
        <div className="space-y-5">
          <Input
            label="Nombre"
            value={formName}
            onChange={(e) => setFormName(e.target.value)}
            placeholder="Nombre de la automatizacion"
          />

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Select
              label="Trigger (disparador)"
              value={formTrigger}
              onChange={(e) => setFormTrigger(e.target.value)}
              options={TRIGGER_TYPES.map((t) => ({ value: t.value, label: t.label }))}
              placeholder="Selecciona trigger"
            />
            <Select
              label="Accion"
              value={formAction}
              onChange={(e) => setFormAction(e.target.value)}
              options={ACTION_TYPES.map((t) => ({ value: t.value, label: t.label }))}
              placeholder="Selecciona accion"
            />
          </div>

          {/* Template selector (only when action is send_email) */}
          {formAction === 'send_email' && (
            <Select
              label="Plantilla de email"
              value={formTemplateId}
              onChange={(e) => setFormTemplateId(e.target.value)}
              options={templates.map((t) => ({ value: t.id, label: t.name }))}
              placeholder="Selecciona plantilla"
            />
          )}

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Input
              label="Delay (horas)"
              type="number"
              min={0}
              value={formDelay}
              onChange={(e) => setFormDelay(Number(e.target.value))}
            />
            <div>
              <label className="block text-xs font-semibold text-[#9CA3AF] mb-1.5">Estado</label>
              <button
                onClick={() => setFormActive(!formActive)}
                className={`flex items-center gap-2 px-4 py-2.5 rounded-lg border transition-colors w-full ${formActive ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-400' : 'bg-[#0A0D12] border-[#2A3040] text-[#6B7280]'}`}
              >
                {formActive ? <Power size={16} /> : <PowerOff size={16} />}
                <span className="text-sm font-medium">{formActive ? 'Activa' : 'Inactiva'}</span>
              </button>
            </div>
          </div>

          {/* Submit */}
          <div className="flex justify-end gap-3 pt-2">
            <Button onClick={() => setShowModal(false)} className="bg-[#1E2330] hover:bg-[#2A3040] text-[#9CA3AF]">
              Cancelar
            </Button>
            <Button onClick={handleSave} disabled={saving}>
              {saving ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}
              {editing ? 'Guardar cambios' : 'Crear automatizacion'}
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  )
}

// ═══════════════════════════════════════════════════════
// EMAIL TEMPLATES TAB
// ═══════════════════════════════════════════════════════
function EmailTemplatesTab() {
  const [templates, setTemplates] = useState<EmailTemplate[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [showModal, setShowModal] = useState(false)
  const [editing, setEditing] = useState<EmailTemplate | null>(null)
  const [saving, setSaving] = useState(false)
  const [deleting, setDeleting] = useState<string | null>(null)
  const [showPreview, setShowPreview] = useState(false)
  const { addToast } = useToast()

  // Form state
  const [formName, setFormName] = useState('')
  const [formSubject, setFormSubject] = useState('')
  const [formBody, setFormBody] = useState('')
  const [formDocType, setFormDocType] = useState('')
  const [formLanguage, setFormLanguage] = useState('es')
  const [formActive, setFormActive] = useState(true)

  const loadTemplates = useCallback(async () => {
    const sb = createClient()
    setLoading(true)
    try {
      const { data } = await sb
        .from('tt_email_templates')
        .select('*')
        .order('name')
      setTemplates((data || []).map((t: Row) => ({
        id: (t.id as string) || '',
        name: (t.name as string) || '',
        subject: (t.subject as string) || '',
        body_html: (t.body_html as string) || '',
        doc_type: (t.doc_type as string) || null,
        language: (t.language as string) || 'es',
        variables: (t.variables as string[]) || null,
        company_id: (t.company_id as string) || null,
        active: (t.active as boolean) ?? true,
        created_at: (t.created_at as string) || '',
      })))
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { loadTemplates() }, [loadTemplates])

  function openCreateModal() {
    setEditing(null)
    setFormName('')
    setFormSubject('')
    setFormBody('')
    setFormDocType('')
    setFormLanguage('es')
    setFormActive(true)
    setShowModal(true)
  }

  function openEditModal(template: EmailTemplate) {
    setEditing(template)
    setFormName(template.name)
    setFormSubject(template.subject)
    setFormBody(template.body_html)
    setFormDocType(template.doc_type || '')
    setFormLanguage(template.language)
    setFormActive(template.active)
    setShowModal(true)
  }

  const handleSave = useCallback(async () => {
    if (!formName.trim() || !formSubject.trim()) {
      addToast({ type: 'warning', title: 'Nombre y asunto son obligatorios' })
      return
    }
    setSaving(true)
    try {
      const sb = createClient()
      // Extract variables from subject + body
      const allText = formSubject + ' ' + formBody
      const vars = [...new Set((allText.match(/\{\{[a-z_]+\}\}/g) || []))]

      const payload = {
        name: formName.trim(),
        subject: formSubject.trim(),
        body_html: formBody,
        doc_type: formDocType || null,
        language: formLanguage,
        variables: vars.length > 0 ? vars : null,
        active: formActive,
      }
      if (editing) {
        const { error } = await sb.from('tt_email_templates').update(payload).eq('id', editing.id)
        if (error) throw error
        addToast({ type: 'success', title: 'Plantilla actualizada' })
      } else {
        const { error } = await sb.from('tt_email_templates').insert(payload)
        if (error) throw error
        addToast({ type: 'success', title: 'Plantilla creada' })
      }
      setShowModal(false)
      loadTemplates()
    } catch (err) {
      addToast({ type: 'error', title: 'Error al guardar', message: (err as Error).message })
    } finally {
      setSaving(false)
    }
  }, [formName, formSubject, formBody, formDocType, formLanguage, formActive, editing, addToast, loadTemplates])

  const handleDelete = useCallback(async (id: string) => {
    setDeleting(id)
    try {
      const sb = createClient()
      const { error } = await sb.from('tt_email_templates').delete().eq('id', id)
      if (error) throw error
      addToast({ type: 'success', title: 'Plantilla eliminada' })
      loadTemplates()
    } catch (err) {
      addToast({ type: 'error', title: 'Error', message: (err as Error).message })
    } finally {
      setDeleting(null)
    }
  }, [addToast, loadTemplates])

  // Preview with sample variable substitution
  const previewHtml = useMemo(() => {
    const sampleVars: Record<string, string> = {
      '{{client_name}}': 'Empresa Demo S.L.',
      '{{document_ref}}': 'COT-2026-0042',
      '{{total}}': '1.250,00 EUR',
      '{{due_date}}': '30/04/2026',
      '{{company_name}}': 'TORQUETOOLS S.L.',
      '{{agent_name}}': 'Juan Mocciaro',
      '{{product_name}}': 'Atornillador Fein ASB 18',
      '{{tracking_url}}': 'https://tracking.example.com/ABC123',
    }
    let html = formBody
    for (const [k, v] of Object.entries(sampleVars)) {
      html = html.replaceAll(k, `<mark style="background:#FF660030;color:#FF6600;padding:0 2px;border-radius:2px">${v}</mark>`)
    }
    return html
  }, [formBody])

  const previewSubject = useMemo(() => {
    const sampleVars: Record<string, string> = {
      '{{client_name}}': 'Empresa Demo S.L.',
      '{{document_ref}}': 'COT-2026-0042',
      '{{total}}': '1.250,00 EUR',
      '{{due_date}}': '30/04/2026',
      '{{company_name}}': 'TORQUETOOLS S.L.',
      '{{agent_name}}': 'Juan Mocciaro',
      '{{product_name}}': 'Atornillador Fein ASB 18',
      '{{tracking_url}}': 'https://tracking.example.com/ABC123',
    }
    let sub = formSubject
    for (const [k, v] of Object.entries(sampleVars)) {
      sub = sub.replaceAll(k, v)
    }
    return sub
  }, [formSubject])

  const filtered = useMemo(() => {
    if (!search.trim()) return templates
    const q = search.toLowerCase()
    return templates.filter((t) =>
      t.name.toLowerCase().includes(q) ||
      t.subject.toLowerCase().includes(q) ||
      (t.doc_type || '').toLowerCase().includes(q)
    )
  }, [templates, search])

  return (
    <div className="space-y-4">
      {/* Toolbar */}
      <div className="flex flex-col md:flex-row gap-3 items-start md:items-center justify-between">
        <SearchBar value={search} onChange={setSearch} placeholder="Buscar plantillas..." className="flex-1" />
        <Button onClick={openCreateModal}>
          <Plus size={14} /> Nueva plantilla
        </Button>
      </div>

      {/* List */}
      {loading ? (
        <div className="flex justify-center py-16"><Loader2 size={32} className="animate-spin text-[#FF6600]" /></div>
      ) : filtered.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 text-[#4B5563]">
          <Mail size={48} className="mb-4" />
          <p className="text-sm">{search ? 'No se encontraron plantillas' : 'No hay plantillas creadas'}</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filtered.map((tpl) => (
            <Card key={tpl.id} className={`relative ${!tpl.active ? 'opacity-60' : ''}`}>
              <div className="space-y-3">
                {/* Header */}
                <div className="flex items-start justify-between">
                  <div className="flex-1 min-w-0">
                    <h3 className="text-sm font-bold text-[#F0F2F5] truncate">{tpl.name}</h3>
                    <p className="text-xs text-[#6B7280] truncate mt-0.5">{tpl.subject}</p>
                  </div>
                  <div className="flex items-center gap-1 ml-2 shrink-0">
                    <button
                      onClick={() => openEditModal(tpl)}
                      className="p-1.5 rounded-lg bg-[#1E2330] hover:bg-[#2A3040] text-[#6B7280] hover:text-[#F0F2F5] transition-colors"
                      title="Editar"
                    >
                      <Edit size={14} />
                    </button>
                    <button
                      onClick={() => handleDelete(tpl.id)}
                      disabled={deleting === tpl.id}
                      className="p-1.5 rounded-lg bg-[#1E2330] hover:bg-red-500/10 text-[#6B7280] hover:text-red-400 transition-colors"
                      title="Eliminar"
                    >
                      {deleting === tpl.id ? <Loader2 size={14} className="animate-spin" /> : <Trash2 size={14} />}
                    </button>
                  </div>
                </div>

                {/* Badges */}
                <div className="flex flex-wrap gap-2">
                  {tpl.doc_type && <Badge variant="info">{DOC_TYPES.find(d => d.value === tpl.doc_type)?.label || tpl.doc_type}</Badge>}
                  <Badge>{tpl.language === 'es' ? 'Espanol' : tpl.language === 'en' ? 'English' : tpl.language}</Badge>
                  {tpl.active ? <Badge variant="success">Activa</Badge> : <Badge variant="danger">Inactiva</Badge>}
                </div>

                {/* Variables */}
                {tpl.variables && tpl.variables.length > 0 && (
                  <div className="flex flex-wrap gap-1 pt-2 border-t border-[#1E2330]">
                    {tpl.variables.map((v) => (
                      <span key={v} className="px-1.5 py-0.5 rounded bg-[#1E2330] text-[10px] text-[#9CA3AF] font-mono">{v}</span>
                    ))}
                  </div>
                )}
              </div>
            </Card>
          ))}
        </div>
      )}

      {/* Create / Edit Modal */}
      <Modal isOpen={showModal} onClose={() => { setShowModal(false); setShowPreview(false) }} title={editing ? 'Editar plantilla' : 'Nueva plantilla'} size="xl">
        <div className="space-y-5">
          <Input
            label="Nombre de la plantilla"
            value={formName}
            onChange={(e) => setFormName(e.target.value)}
            placeholder="Ej: Recordatorio de pago"
          />

          <Input
            label="Asunto"
            value={formSubject}
            onChange={(e) => setFormSubject(e.target.value)}
            placeholder="Ej: Recordatorio: Factura {{document_ref}} vence el {{due_date}}"
          />

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Select
              label="Tipo de documento"
              value={formDocType}
              onChange={(e) => setFormDocType(e.target.value)}
              options={DOC_TYPES.map((d) => ({ value: d.value, label: d.label }))}
              placeholder="Todos los tipos"
            />
            <Select
              label="Idioma"
              value={formLanguage}
              onChange={(e) => setFormLanguage(e.target.value)}
              options={[
                { value: 'es', label: 'Espanol' },
                { value: 'en', label: 'English' },
                { value: 'fr', label: 'Francais' },
                { value: 'de', label: 'Deutsch' },
              ]}
            />
          </div>

          {/* Variables help */}
          <div>
            <label className="block text-xs font-semibold text-[#9CA3AF] mb-1.5">Variables disponibles</label>
            <div className="flex flex-wrap gap-1.5">
              {TEMPLATE_VARIABLES.map((v) => (
                <button
                  key={v}
                  type="button"
                  onClick={() => setFormBody(formBody + v)}
                  className="px-2 py-1 rounded-md bg-[#1E2330] hover:bg-[#FF6600]/10 text-[10px] text-[#9CA3AF] hover:text-[#FF6600] font-mono transition-colors border border-[#2A3040] hover:border-[#FF6600]/30"
                >
                  {v}
                </button>
              ))}
            </div>
          </div>

          {/* Body HTML */}
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label className="text-xs font-semibold text-[#9CA3AF]">Cuerpo HTML</label>
              <button
                onClick={() => setShowPreview(!showPreview)}
                className="flex items-center gap-1 text-xs text-[#FF6600] hover:text-[#FF8833] transition-colors"
              >
                {showPreview ? <Code size={12} /> : <Eye size={12} />}
                {showPreview ? 'Editor' : 'Vista previa'}
              </button>
            </div>
            {showPreview ? (
              <div className="bg-white rounded-lg border border-[#2A3040] p-4 min-h-[200px]">
                <div className="mb-3 pb-2 border-b border-gray-200">
                  <p className="text-xs text-gray-500">Asunto:</p>
                  <p className="text-sm font-medium text-gray-900">{previewSubject || '(sin asunto)'}</p>
                </div>
                <div
                  className="text-sm text-gray-800 prose prose-sm max-w-none"
                  dangerouslySetInnerHTML={{ __html: previewHtml || '<p style="color:#999">Escribe el cuerpo del email...</p>' }}
                />
              </div>
            ) : (
              <textarea
                value={formBody}
                onChange={(e) => setFormBody(e.target.value)}
                rows={8}
                className="w-full px-4 py-3 text-sm bg-[#0A0D12] border border-[#2A3040] rounded-lg text-[#F0F2F5] placeholder-[#4B5563] focus:outline-none focus:border-[#FF6600] transition-colors font-mono resize-y"
                placeholder={'<h2>Hola {{client_name}},</h2>\n<p>Le recordamos que la factura {{document_ref}} por {{total}} vence el {{due_date}}.</p>\n<p>Saludos,<br>{{company_name}}</p>'}
              />
            )}
          </div>

          {/* Active toggle */}
          <div>
            <button
              onClick={() => setFormActive(!formActive)}
              className={`flex items-center gap-2 px-4 py-2.5 rounded-lg border transition-colors ${formActive ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-400' : 'bg-[#0A0D12] border-[#2A3040] text-[#6B7280]'}`}
            >
              {formActive ? <Power size={16} /> : <PowerOff size={16} />}
              <span className="text-sm font-medium">{formActive ? 'Activa' : 'Inactiva'}</span>
            </button>
          </div>

          {/* Submit */}
          <div className="flex justify-end gap-3 pt-2">
            <Button onClick={() => { setShowModal(false); setShowPreview(false) }} className="bg-[#1E2330] hover:bg-[#2A3040] text-[#9CA3AF]">
              Cancelar
            </Button>
            <Button onClick={handleSave} disabled={saving}>
              {saving ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}
              {editing ? 'Guardar cambios' : 'Crear plantilla'}
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  )
}

// ═══════════════════════════════════════════════════════
// MAIN PAGE
// ═══════════════════════════════════════════════════════
export default function AutomatizacionesPage() {
  return (
    <div className="space-y-6 animate-fade-in">
      <div>
        <h1 className="text-2xl font-bold text-[#F0F2F5]">Automatizaciones</h1>
        <p className="text-sm text-[#6B7280] mt-1">Gestiona reglas automaticas y plantillas de email</p>
      </div>
      <Tabs tabs={pageTabs} defaultTab="automations">
        {(activeTab) => (
          <>
            {activeTab === 'automations' && <AutomationsTab />}
            {activeTab === 'templates' && <EmailTemplatesTab />}
          </>
        )}
      </Tabs>
    </div>
  )
}
