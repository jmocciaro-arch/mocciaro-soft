'use client'

import { useEffect, useState, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useCompanyFilter } from '@/hooks/use-company-filter'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Modal } from '@/components/ui/modal'
import { Badge } from '@/components/ui/badge'
import { LeadScoreBadge } from '@/components/ai/lead-score-badge'
import { DocumentProcessBar } from '@/components/workflow/document-process-bar'
import { buildSteps } from '@/lib/workflow-definitions'
import { useRouter } from 'next/navigation'
import { Plus, Sparkles, RefreshCw, Mail, Phone, Zap, FileText } from 'lucide-react'

interface Lead {
  id: string
  code?: string
  name: string
  email?: string
  phone?: string
  company_name?: string
  industry?: string
  source?: string
  status: string
  estimated_value?: number
  currency: string
  raw_message?: string
  ai_score?: number
  ai_temperature?: 'hot' | 'warm' | 'cold'
  ai_tags?: string[]
  ai_suggested_action?: string
  ai_suggested_email?: string
  ai_needs?: Record<string, unknown>
  ai_analysis_at?: string
  ai_provider?: string
  converted_opportunity_id?: string
  converted_client_id?: string
  created_at: string
}

export { LeadsPage as LeadsIATab }
export default function LeadsPage() {
  const supabase = createClient()
  const { filterByCompany, activeCompanyId } = useCompanyFilter()
  const [leads, setLeads] = useState<Lead[]>([])
  const [loading, setLoading] = useState(true)
  const [newOpen, setNewOpen] = useState(false)
  const [detailLead, setDetailLead] = useState<Lead | null>(null)
  const [scoringId, setScoringId] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    const q = supabase.from('tt_leads').select('*').order('created_at', { ascending: false })
    const { data } = await filterByCompany(q)
    setLeads((data as Lead[]) || [])
    setLoading(false)

  }, [activeCompanyId])

  useEffect(() => { void load() }, [load])

  async function scoreLead(lead: Lead) {
    setScoringId(lead.id)
    try {
      const res = await fetch('/api/leads/score', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          leadId: lead.id,
          input: {
            name: lead.name,
            email: lead.email,
            phone: lead.phone,
            company: lead.company_name,
            industry: lead.industry,
            source: lead.source,
            rawMessage: lead.raw_message || `${lead.name} (${lead.company_name || 'sin empresa'}) contactó por ${lead.source}`,
            estimatedValue: lead.estimated_value,
          },
          persist: true,
        }),
      })
      const j = await res.json()
      if (res.ok) {
        setLeads((prev) =>
          prev.map((l) => (l.id === lead.id ? { ...l, ...{
            ai_score: j.score, ai_temperature: j.temperature, ai_tags: j.tags,
            ai_suggested_action: j.suggested_action, ai_suggested_email: j.suggested_email,
            ai_needs: j.needs, ai_provider: j.provider_used,
            ai_analysis_at: new Date().toISOString(),
          } } : l))
        )
      } else {
        alert('Error: ' + j.error)
      }
    } finally {
      setScoringId(null)
    }
  }

  const hot = leads.filter((l) => l.ai_temperature === 'hot').length
  const warm = leads.filter((l) => l.ai_temperature === 'warm').length
  const cold = leads.filter((l) => l.ai_temperature === 'cold').length
  const unscored = leads.filter((l) => l.ai_score == null).length

  return (
    <div className="p-6 space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Sparkles className="w-6 h-6 text-orange-500" /> Leads con IA
          </h1>
          <p className="text-sm opacity-60">Scoring automático, clasificación y draft de respuesta</p>
        </div>
        <Button onClick={() => setNewOpen(true)}><Plus className="w-4 h-4 mr-1" /> Nuevo lead</Button>
      </div>

      <div className="grid grid-cols-4 gap-3">
        <KPI label="🔥 Hot" value={hot} />
        <KPI label="🌡️ Warm" value={warm} />
        <KPI label="❄️ Cold" value={cold} />
        <KPI label="⚠️ Sin score" value={unscored} />
      </div>

      <Card className="p-0 overflow-hidden">
        <div className="p-3 border-b flex items-center justify-between" style={{ borderColor: '#2A3040' }}>
          <strong>Leads ({leads.length})</strong>
          <Button size="sm" variant="secondary" onClick={load}><RefreshCw className="w-3 h-3 mr-1" /> Refrescar</Button>
        </div>
        {loading ? (
          <div className="p-8 text-center opacity-60">Cargando...</div>
        ) : leads.length === 0 ? (
          <div className="p-8 text-center opacity-60">Sin leads todavía — creá uno con el botón de arriba</div>
        ) : (
          <div className="divide-y" style={{ borderColor: '#2A3040' }}>
            {leads.map((l) => (
              <div key={l.id} className="p-3 hover:bg-[#1E2330] cursor-pointer" onClick={() => setDetailLead(l)}>
                <div className="flex items-center justify-between gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <strong>{l.name}</strong>
                      {l.company_name && <span className="text-xs opacity-60">@ {l.company_name}</span>}
                      <LeadScoreBadge score={l.ai_score} temperature={l.ai_temperature} tags={l.ai_tags} />
                    </div>
                    <div className="text-xs opacity-60 flex items-center gap-3 mt-1">
                      {l.email && <span><Mail className="w-3 h-3 inline" /> {l.email}</span>}
                      {l.phone && <span><Phone className="w-3 h-3 inline" /> {l.phone}</span>}
                      <Badge variant="default">{l.status}</Badge>
                      {l.source && <span>via {l.source}</span>}
                    </div>
                    {l.ai_suggested_action && (
                      <div className="text-xs mt-1 opacity-80">💡 {l.ai_suggested_action}</div>
                    )}
                  </div>
                  <Button
                    size="sm"
                    variant={l.ai_score == null ? 'primary' : 'secondary'}
                    onClick={(e) => { e.stopPropagation(); void scoreLead(l) }}
                    disabled={scoringId === l.id}
                  >
                    {scoringId === l.id ? 'Analizando...' : <><Zap className="w-3 h-3 mr-1" /> {l.ai_score == null ? 'Analizar' : 'Re-scorear'}</>}
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )}
      </Card>

      <NewLeadModal open={newOpen} onClose={() => setNewOpen(false)} onCreated={() => { setNewOpen(false); void load() }} />
      {detailLead && (
        <LeadDetailModal
          lead={detailLead}
          onClose={() => setDetailLead(null)}
          onRefresh={load}
        />
      )}
    </div>
  )
}

function KPI({ label, value }: { label: string; value: number }) {
  return (
    <div className="p-3 rounded-lg border" style={{ borderColor: '#2A3040', background: '#151821' }}>
      <div className="text-xs opacity-60">{label}</div>
      <div className="text-2xl font-bold mt-1">{value}</div>
    </div>
  )
}

function NewLeadModal({ open, onClose, onCreated }: { open: boolean; onClose: () => void; onCreated: () => void }) {
  const supabase = createClient()
  const { activeCompanyId } = useCompanyFilter()
  const [form, setForm] = useState({ name: '', email: '', phone: '', company_name: '', industry: '', source: 'web_form', raw_message: '', estimated_value: '' })
  const [saving, setSaving] = useState(false)
  const [autoScore, setAutoScore] = useState(true)

  async function save() {
    if (!form.name || !activeCompanyId) return
    setSaving(true)
    try {
      const { data, error } = await supabase
        .from('tt_leads')
        .insert({
          company_id: activeCompanyId,
          name: form.name,
          email: form.email || null,
          phone: form.phone || null,
          company_name: form.company_name || null,
          industry: form.industry || null,
          source: form.source,
          raw_message: form.raw_message || null,
          estimated_value: form.estimated_value ? Number(form.estimated_value) : null,
          status: 'new',
        })
        .select('id')
        .single()
      if (error) throw error

      if (autoScore && data?.id && form.raw_message) {
        await fetch('/api/leads/score', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            leadId: data.id,
            input: {
              name: form.name, email: form.email, phone: form.phone,
              company: form.company_name, industry: form.industry, source: form.source,
              rawMessage: form.raw_message, estimatedValue: form.estimated_value ? Number(form.estimated_value) : undefined,
            },
          }),
        })
      }
      onCreated()
    } catch (err) {
      alert('Error: ' + (err as Error).message)
    } finally {
      setSaving(false)
    }
  }

  return (
    <Modal isOpen={open} onClose={onClose} title="Nuevo lead" size="md">
      <div className="space-y-3">
        <div className="grid grid-cols-2 gap-3">
          <Input placeholder="Nombre *" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
          <Input placeholder="Empresa" value={form.company_name} onChange={(e) => setForm({ ...form, company_name: e.target.value })} />
          <Input placeholder="Email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
          <Input placeholder="Teléfono" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
          <Input placeholder="Industria" value={form.industry} onChange={(e) => setForm({ ...form, industry: e.target.value })} />
          <Input type="number" placeholder="Valor estimado" value={form.estimated_value} onChange={(e) => setForm({ ...form, estimated_value: e.target.value })} />
        </div>

        <label className="flex flex-col gap-1">
          <span className="text-xs opacity-70">Mensaje/descripción (para que IA analice)</span>
          <textarea
            value={form.raw_message}
            onChange={(e) => setForm({ ...form, raw_message: e.target.value })}
            rows={4}
            placeholder="Pegá acá el email, whatsapp, formulario, o describí la conversación telefónica..."
            className="rounded-md bg-[#1E2330] border border-[#2A3040] px-3 py-2 text-sm"
          />
        </label>

        <label className="flex items-center gap-2 text-xs">
          <input type="checkbox" checked={autoScore} onChange={(e) => setAutoScore(e.target.checked)} />
          <Sparkles className="w-3 h-3" /> Analizar con IA al crear (scoring + draft email)
        </label>

        <div className="flex justify-end gap-2">
          <Button variant="secondary" onClick={onClose}>Cancelar</Button>
          <Button onClick={save} disabled={saving || !form.name}>{saving ? 'Guardando...' : 'Crear lead'}</Button>
        </div>
      </div>
    </Modal>
  )
}

function LeadDetailModal({ lead, onClose, onRefresh }: { lead: Lead; onClose: () => void; onRefresh: () => void }) {
  const [converting, setConverting] = useState(false)
  const [convertMsg, setConvertMsg] = useState('')
  const needs = (lead.ai_needs || {}) as Record<string, unknown>

  async function convertToOpportunity() {
    if (!confirm('¿Convertir este lead en una oportunidad del pipeline?')) return
    setConverting(true)
    setConvertMsg('Convirtiendo...')
    try {
      const res = await fetch('/api/crm/convert-lead', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          leadId: lead.id,
          createClient: true,
          stage: 'lead',
          probability: lead.ai_score || 20,
        }),
      })
      const j = await res.json()
      if (res.ok) {
        setConvertMsg(`✓ Oportunidad ${j.opportunityCode} creada`)
        onRefresh()
        setTimeout(onClose, 1200)
      } else {
        setConvertMsg('✗ ' + j.error)
      }
    } catch (err) {
      setConvertMsg('✗ ' + (err as Error).message)
    } finally {
      setConverting(false)
    }
  }

  // Mapear el status del lead al paso del workflow
  const leadStepId = lead.converted_opportunity_id ? 'convert'
    : lead.ai_score != null ? 'qualify'
    : lead.raw_message ? 'analysis'
    : 'capture'

  const leadBadgeVariant = lead.converted_opportunity_id ? 'success'
    : lead.ai_temperature === 'hot' ? 'danger'
    : lead.ai_temperature === 'warm' ? 'warning'
    : 'default'

  const leadStatusLabel = lead.converted_opportunity_id ? 'Convertido'
    : lead.ai_temperature === 'hot' ? 'Hot'
    : lead.ai_temperature === 'warm' ? 'Warm'
    : lead.ai_temperature === 'cold' ? 'Cold'
    : lead.status || 'Nuevo'

  return (
    <Modal isOpen title={lead.name} onClose={onClose} size="lg">
      <div className="space-y-4">
        {/* ══════════════════════════════════════════════════════════════
            REGLA FUNDAMENTAL: Barra sticky con código + stepper + alertas
            ══════════════════════════════════════════════════════════════ */}
        <DocumentProcessBar
          code={lead.code || `LEAD-${lead.id.slice(0, 8)}`}
          badge={{ label: leadStatusLabel, variant: leadBadgeVariant }}
          entity={
            <span>
              <strong>{lead.name}</strong>
              {lead.company_name && <> · {lead.company_name}</>}
              {lead.source && <> · via {lead.source}</>}
            </span>
          }
          alerts={[
            ...(lead.ai_score == null ? [{ type: 'warning' as const, message: 'Sin análisis IA todavía — hacé click en Analizar' }] : []),
            ...(lead.ai_suggested_action ? [{ type: 'info' as const, message: `Acción sugerida: ${lead.ai_suggested_action}` }] : []),
          ]}
          steps={buildSteps('lead', leadStepId)}
          onClose={onClose}
        />
        <div className="flex items-center gap-2 flex-wrap">
          <LeadScoreBadge score={lead.ai_score} temperature={lead.ai_temperature} tags={lead.ai_tags} size="md" />
          {lead.ai_provider && <Badge variant="default">🤖 {lead.ai_provider}</Badge>}
          <Badge>{lead.status}</Badge>
        </div>

        {lead.raw_message && (
          <div>
            <div className="text-xs opacity-70 mb-1">Mensaje original</div>
            <div className="text-sm p-3 rounded-md border whitespace-pre-wrap" style={{ borderColor: '#2A3040', background: '#1E2330' }}>
              {lead.raw_message}
            </div>
          </div>
        )}

        {lead.ai_suggested_action && (
          <div className="p-3 rounded-md" style={{ background: 'rgba(249,115,22,0.1)', border: '1px solid rgba(249,115,22,0.3)' }}>
            <div className="text-xs opacity-70 mb-1">💡 Acción sugerida</div>
            <div className="font-semibold text-sm">{lead.ai_suggested_action}</div>
          </div>
        )}

        {Object.keys(needs).length > 0 && (
          <div>
            <div className="text-xs opacity-70 mb-1">🎯 Necesidades detectadas</div>
            <div className="grid grid-cols-2 gap-2 text-xs">
              {Array.isArray(needs.productos) && (
                <div>Productos: <strong>{(needs.productos as string[]).join(', ')}</strong></div>
              )}
              {needs.urgencia ? <div>Urgencia: <strong>{String(needs.urgencia)}</strong></div> : null}
              {needs.presupuesto_estimado ? <div>Presupuesto: <strong>${String(needs.presupuesto_estimado)}</strong></div> : null}
              {needs.plazo_entrega ? <div>Plazo: <strong>{String(needs.plazo_entrega)}</strong></div> : null}
              {needs.volumen ? <div>Volumen: <strong>{String(needs.volumen)}</strong></div> : null}
            </div>
          </div>
        )}

        {lead.ai_suggested_email && (
          <div>
            <div className="text-xs opacity-70 mb-1 flex items-center justify-between">
              <span>✉️ Email sugerido</span>
              <button
                type="button"
                className="text-xs underline"
                onClick={() => { navigator.clipboard.writeText(lead.ai_suggested_email || ''); alert('Copiado') }}
              >Copiar</button>
            </div>
            <div className="text-sm p-3 rounded-md border whitespace-pre-wrap font-mono" style={{ borderColor: '#2A3040', background: '#1E2330', fontSize: 12 }}>
              {lead.ai_suggested_email}
            </div>
          </div>
        )}

        {convertMsg && (
          <div
            className="text-xs p-2 rounded-md"
            style={{
              background: convertMsg.startsWith('✓') ? 'rgba(16,185,129,0.1)'
                : convertMsg.startsWith('✗') ? 'rgba(239,68,68,0.1)'
                : 'rgba(249,115,22,0.1)',
            }}
          >
            {convertMsg}
          </div>
        )}

        <div className="space-y-2 pt-2">
          {/* Acciones principales */}
          <div className="flex gap-2 flex-wrap">
            <Button
              onClick={() => {
                // Ir al cotizador con el cliente pre-cargado via URL params
                const params = new URLSearchParams()
                if (lead.converted_client_id) params.set('clientId', lead.converted_client_id)
                else params.set('clientName', lead.company_name || lead.name)
                if (lead.email) params.set('clientEmail', lead.email)
                const needs = (lead.ai_needs || {}) as Record<string, unknown>
                if (Array.isArray(needs.productos)) params.set('products', (needs.productos as string[]).join(','))
                if (needs.presupuesto_estimado) params.set('estimatedValue', String(needs.presupuesto_estimado))
                window.location.href = `/cotizador?${params.toString()}`
              }}
            >
              <FileText className="w-4 h-4 mr-1" /> Crear cotización
            </Button>

            {!lead.converted_opportunity_id && (
              <Button variant="secondary" onClick={convertToOpportunity} disabled={converting}>
                {converting ? 'Convirtiendo...' : '🎯 Convertir a oportunidad'}
              </Button>
            )}
            {lead.converted_opportunity_id && (
              <Badge>✓ Convertido a oportunidad</Badge>
            )}
          </div>

          {/* Fila secundaria */}
          <div className="flex justify-end">
            <Button variant="ghost" onClick={onClose}>Cerrar</Button>
          </div>
        </div>
      </div>
    </Modal>
  )
}
