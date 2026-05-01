'use client'

/**
 * Modal pro unificado para Cotizaciones / Pedidos / Facturas — estilo Salesforce.
 * 5 pestañas: Resumen · Items · Cliente · Documentos relacionados · Actividad
 */

import { useEffect, useState, useCallback } from 'react'
import { Modal } from '@/components/ui/modal'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { useToast } from '@/components/ui/toast'
import { createClient } from '@/lib/supabase/client'
import {
  FileText, Package, User, Link as LinkIcon, Activity,
  Save, Edit3, Send, Download, Copy, Trash2, ExternalLink,
  TrendingUp, Calendar, Clock, DollarSign, Hash, ChevronDown, ChevronRight,
} from 'lucide-react'

export interface DocumentData {
  id: string
  type: 'cotizacion' | 'pedido' | 'factura' | 'albaran' | 'remito' | 'oc_compra'
  system_code?: string | null
  legal_number?: string | null
  status?: string | null
  total?: number | null
  subtotal?: number | null
  tax?: number | null
  currency?: string | null
  client_id?: string | null
  company_id?: string | null
  created_at?: string | null
  due_date?: string | null
  metadata?: Record<string, unknown> | null
  notes?: string | null
}

interface DocumentItem {
  id: string
  line_number: number | null
  sku: string | null
  description: string
  quantity: number
  unit_price: number
  subtotal: number
}

interface RelatedDoc {
  id: string
  type: string
  system_code: string | null
  legal_number: string | null
  total: number | null
  currency: string | null
  status: string | null
  relation: string
}

interface ActivityEntry {
  id: string
  action: string
  description: string | null
  created_at: string
  user_name: string | null
}

interface ClientInfo {
  id: string
  name: string | null
  tax_id: string | null
  email: string | null
  phone: string | null
  city: string | null
  country: string | null
}

interface Props {
  open: boolean
  onClose: () => void
  documentId: string | null
  onChanged?: () => void
}

const TYPE_LABELS: Record<string, { label: string; icon: React.ComponentType<{size?: number; className?: string}>; tone: string }> = {
  cotizacion: { label: 'Cotización', icon: FileText,  tone: 'blue' },
  pedido:     { label: 'Pedido',     icon: Package,   tone: 'violet' },
  factura:    { label: 'Factura',    icon: TrendingUp,tone: 'emerald' },
  albaran:    { label: 'Albarán',    icon: Package,   tone: 'orange' },
  remito:     { label: 'Remito',     icon: Package,   tone: 'orange' },
  oc_compra:  { label: 'OC Compra',  icon: FileText,  tone: 'gray' },
}

const STATUS_TONES: Record<string, string> = {
  draft:      'gray',
  borrador:   'gray',
  sent:       'blue',
  enviada:    'blue',
  approved:   'emerald',
  aceptada:   'emerald',
  paid:       'emerald',
  pagada:     'emerald',
  rejected:   'red',
  rechazada:  'red',
  cancelled:  'red',
  partial:    'orange',
  parcial:    'orange',
  pending:    'orange',
  vencida:    'red',
}

export function DocumentDetailModal({ open, onClose, documentId, onChanged }: Props) {
  const supabase = createClient()
  const { addToast } = useToast()

  const [tab, setTab] = useState<'summary' | 'items' | 'client' | 'related' | 'activity'>('summary')
  const [doc, setDoc] = useState<DocumentData | null>(null)
  const [items, setItems] = useState<DocumentItem[]>([])
  const [client, setClient] = useState<ClientInfo | null>(null)
  const [related, setRelated] = useState<RelatedDoc[]>([])
  const [activity, setActivity] = useState<ActivityEntry[]>([])
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [editingNotes, setEditingNotes] = useState(false)
  const [notesDraft, setNotesDraft] = useState('')

  // Cargar todo al abrir
  useEffect(() => {
    if (!open || !documentId) return
    setLoading(true)
    setTab('summary')

    void Promise.all([
      supabase.from('tt_documents').select('*').eq('id', documentId).single(),
      supabase.from('tt_document_items').select('*').eq('document_id', documentId).order('line_number'),
      supabase.from('tt_document_links')
        .select('*, parent:tt_documents!parent_id(id,type,system_code,legal_number,total,currency,status), child:tt_documents!child_id(id,type,system_code,legal_number,total,currency,status)')
        .or(`parent_id.eq.${documentId},child_id.eq.${documentId}`),
      supabase.from('tt_activity_log').select('*, user:tt_users(name)').eq('entity_type', 'document').eq('entity_id', documentId).order('created_at', { ascending: false }).limit(30),
    ]).then(async ([docR, itemsR, relR, actR]) => {
      const d = docR.data as DocumentData | null
      setDoc(d)
      setItems((itemsR.data || []) as DocumentItem[])
      setNotesDraft(d?.notes || '')

      // Cliente
      if (d?.client_id) {
        const { data: cli } = await supabase.from('tt_clients').select('id, name, tax_id, email, phone, city, country').eq('id', d.client_id).single()
        setClient(cli as ClientInfo | null)
      }

      // Related docs (parent o child del actual)
      const rels: RelatedDoc[] = []
      for (const r of (relR.data || []) as Array<Record<string, unknown>>) {
        const isParent = r.parent_id === documentId
        const other = (isParent ? r.child : r.parent) as Record<string, unknown> | null
        if (!other) continue
        rels.push({
          id: other.id as string,
          type: other.type as string,
          system_code: other.system_code as string | null,
          legal_number: other.legal_number as string | null,
          total: other.total as number | null,
          currency: other.currency as string | null,
          status: other.status as string | null,
          relation: (r.relation_type as string) || (isParent ? 'origen' : 'destino'),
        })
      }
      setRelated(rels)

      // Activity
      const acts: ActivityEntry[] = []
      for (const a of (actR.data || []) as Array<Record<string, unknown>>) {
        acts.push({
          id: a.id as string,
          action: a.action as string,
          description: a.description as string | null,
          created_at: a.created_at as string,
          user_name: ((a.user as { name?: string } | null)?.name) || null,
        })
      }
      setActivity(acts)

      setLoading(false)
    })
  }, [open, documentId, supabase])

  const saveNotes = async () => {
    if (!doc) return
    setSaving(true)
    try {
      const { error } = await supabase.from('tt_documents').update({ notes: notesDraft }).eq('id', doc.id)
      if (error) throw error
      await supabase.from('tt_activity_log').insert({
        entity_type: 'document', entity_id: doc.id, action: 'updated',
        description: 'Notas actualizadas',
      })
      setDoc({ ...doc, notes: notesDraft })
      setEditingNotes(false)
      addToast({ type: 'success', title: 'Notas guardadas' })
      onChanged?.()
    } catch (e) {
      addToast({ type: 'error', title: 'Error', message: (e as Error).message })
    } finally {
      setSaving(false)
    }
  }

  const duplicateDoc = async () => {
    if (!doc) return
    if (!confirm('¿Crear una copia de este documento como borrador?')) return
    setSaving(true)
    try {
      const newCode = `${doc.type.toUpperCase().slice(0, 3)}-COPY-${Date.now()}`
      const { data: newDoc, error } = await supabase.from('tt_documents').insert({
        type: doc.type,
        system_code: newCode,
        client_id: doc.client_id,
        company_id: doc.company_id,
        currency: doc.currency,
        total: doc.total,
        subtotal: doc.subtotal,
        tax: doc.tax,
        status: 'draft',
        notes: doc.notes,
      }).select('id').single()
      if (error) throw error

      // Copiar items
      if (items.length > 0 && newDoc) {
        await supabase.from('tt_document_items').insert(
          items.map(it => ({
            document_id: newDoc.id,
            line_number: it.line_number,
            sku: it.sku,
            description: it.description,
            quantity: it.quantity,
            unit_price: it.unit_price,
            subtotal: it.subtotal,
          }))
        )
      }
      addToast({ type: 'success', title: `Copia creada: ${newCode}` })
      onChanged?.()
    } catch (e) {
      addToast({ type: 'error', title: 'Error', message: (e as Error).message })
    } finally { setSaving(false) }
  }

  if (!open) return null
  if (loading || !doc) {
    return (
      <Modal isOpen={open} onClose={onClose} title="Cargando..." size="xl">
        <div className="text-center py-12 text-[#6B7280]">Cargando documento...</div>
      </Modal>
    )
  }

  const typeMeta = TYPE_LABELS[doc.type] || TYPE_LABELS.cotizacion
  const TypeIcon = typeMeta.icon
  const toneClasses = {
    blue: 'bg-blue-500/10 border-blue-500/30 text-blue-400',
    violet: 'bg-violet-500/10 border-violet-500/30 text-violet-400',
    emerald: 'bg-emerald-500/10 border-emerald-500/30 text-emerald-400',
    orange: 'bg-orange-500/10 border-orange-500/30 text-orange-400',
    gray: 'bg-gray-500/10 border-gray-500/30 text-gray-400',
  }[typeMeta.tone] || 'bg-gray-500/10 border-gray-500/30 text-gray-400'

  return (
    <Modal isOpen={open} onClose={onClose} title="" size="xl">
      <div className="space-y-4">
        {/* Header */}
        <div className="flex items-start gap-4 pb-4 border-b border-[#1E2330]">
          <div className={`w-14 h-14 rounded-xl border flex items-center justify-center shrink-0 ${toneClasses}`}>
            <TypeIcon size={20} />
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <Badge variant="default" size="sm">{typeMeta.label}</Badge>
              <h2 className="text-lg font-bold text-[#F0F2F5] font-mono">{doc.legal_number || doc.system_code}</h2>
              {doc.status && <StatusBadge status={doc.status} />}
            </div>
            <p className="text-xs text-[#6B7280] mt-0.5 flex items-center gap-2">
              {client && <span className="flex items-center gap-1"><User size={10} /> {client.name}</span>}
              {doc.created_at && (
                <span className="flex items-center gap-1">
                  <Calendar size={10} /> {new Date(doc.created_at).toLocaleDateString('es-AR')}
                </span>
              )}
            </p>
          </div>
          {/* KPIs en header */}
          <div className="text-right shrink-0">
            <p className="text-[10px] uppercase text-[#6B7280]">Total</p>
            <p className="text-2xl font-bold text-emerald-400 font-mono">
              {doc.currency || '$'} {Number(doc.total || 0).toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </p>
          </div>
        </div>

        {/* Tabs */}
        <div className="flex gap-1 p-1 bg-[#0A0D12] rounded-lg border border-[#1E2330] overflow-x-auto">
          {([
            { id: 'summary',  label: 'Resumen',     icon: Hash },
            { id: 'items',    label: 'Items',       icon: Package, count: items.length },
            { id: 'client',   label: 'Cliente',     icon: User },
            { id: 'related',  label: 'Relacionados',icon: LinkIcon, count: related.length },
            { id: 'activity', label: 'Actividad',   icon: Activity, count: activity.length },
          ] as const).map(t => (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition whitespace-nowrap ${
                tab === t.id ? 'bg-[#FF6600] text-white' : 'text-[#6B7280] hover:text-[#F0F2F5] hover:bg-[#1E2330]'
              }`}
            >
              <t.icon size={12} /> {t.label}
              {('count' in t && (t as { count?: number }).count) ? (
                <span className={`text-[9px] px-1 rounded ${tab === t.id ? 'bg-white/20' : 'bg-[#1E2330]'}`}>
                  {(t as { count: number }).count}
                </span>
              ) : null}
            </button>
          ))}
        </div>

        {/* TAB: SUMMARY */}
        {tab === 'summary' && (
          <div className="space-y-4">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <KpiBox label="Subtotal" value={`${doc.currency || ''} ${Number(doc.subtotal || 0).toLocaleString('es-AR')}`} />
              <KpiBox label="Impuestos" value={`${doc.currency || ''} ${Number(doc.tax || 0).toLocaleString('es-AR')}`} />
              <KpiBox label="Total" value={`${doc.currency || ''} ${Number(doc.total || 0).toLocaleString('es-AR')}`} tone="emerald" />
              <KpiBox label="Items" value={items.length.toString()} />
            </div>

            <div className="rounded-lg border border-[#1E2330] bg-[#0F1218] p-3">
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs uppercase font-bold text-[#FF6600]">Notas</span>
                {!editingNotes && (
                  <button onClick={() => setEditingNotes(true)} className="text-[10px] text-[#FF6600] flex items-center gap-1">
                    <Edit3 size={9} /> Editar
                  </button>
                )}
              </div>
              {editingNotes ? (
                <div className="space-y-2">
                  <textarea
                    value={notesDraft}
                    onChange={e => setNotesDraft(e.target.value)}
                    rows={4}
                    className="w-full rounded bg-[#1E2330] border border-[#2A3040] px-3 py-2 text-sm text-[#F0F2F5] resize-none"
                  />
                  <div className="flex justify-end gap-2">
                    <Button variant="secondary" size="sm" onClick={() => { setEditingNotes(false); setNotesDraft(doc.notes || '') }}>Cancelar</Button>
                    <Button size="sm" onClick={saveNotes} loading={saving}><Save size={11} /> Guardar</Button>
                  </div>
                </div>
              ) : (
                <p className="text-sm text-[#D1D5DB] whitespace-pre-wrap">
                  {doc.notes || <span className="text-[#4B5563] italic">Sin notas</span>}
                </p>
              )}
            </div>
          </div>
        )}

        {/* TAB: ITEMS */}
        {tab === 'items' && (
          <div className="rounded-lg border border-[#1E2330] bg-[#0F1218] overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-[#0A0D12] border-b border-[#1E2330]">
                <tr className="text-left text-[10px] uppercase text-[#6B7280]">
                  <th className="px-3 py-2 w-8">#</th>
                  <th className="px-3 py-2">SKU</th>
                  <th className="px-3 py-2">Descripción</th>
                  <th className="px-3 py-2 text-right">Cant.</th>
                  <th className="px-3 py-2 text-right">P.Unit</th>
                  <th className="px-3 py-2 text-right">Subtotal</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#1E2330]">
                {items.length === 0 ? (
                  <tr><td colSpan={6} className="text-center py-6 text-[#6B7280] text-xs">Sin items</td></tr>
                ) : items.map(it => (
                  <tr key={it.id} className="hover:bg-[#141820]">
                    <td className="px-3 py-2 text-[#6B7280] font-mono text-[10px]">{it.line_number || ''}</td>
                    <td className="px-3 py-2 font-mono text-xs text-[#FF6600]">{it.sku || '—'}</td>
                    <td className="px-3 py-2 text-[#F0F2F5] truncate max-w-md">{it.description}</td>
                    <td className="px-3 py-2 text-right font-mono text-xs">{Number(it.quantity).toLocaleString('es-AR')}</td>
                    <td className="px-3 py-2 text-right font-mono text-xs">{Number(it.unit_price).toLocaleString('es-AR', { minimumFractionDigits: 2 })}</td>
                    <td className="px-3 py-2 text-right font-mono text-xs font-semibold text-emerald-400">
                      {Number(it.subtotal).toLocaleString('es-AR', { minimumFractionDigits: 2 })}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* TAB: CLIENT */}
        {tab === 'client' && client && (
          <div className="space-y-3">
            <div className="rounded-lg border border-[#1E2330] bg-[#0F1218] p-4">
              <div className="flex items-center gap-3 mb-3">
                <div className="w-10 h-10 rounded-lg bg-blue-500/10 border border-blue-500/30 flex items-center justify-center">
                  <User size={16} className="text-blue-400" />
                </div>
                <div>
                  <p className="text-base font-semibold text-[#F0F2F5]">{client.name}</p>
                  <p className="text-xs text-[#6B7280]">{client.tax_id} · {client.country}</p>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3 text-xs">
                <div><span className="text-[#6B7280]">Email:</span> <span className="text-[#F0F2F5]">{client.email || '—'}</span></div>
                <div><span className="text-[#6B7280]">Teléfono:</span> <span className="text-[#F0F2F5]">{client.phone || '—'}</span></div>
                <div><span className="text-[#6B7280]">Ciudad:</span> <span className="text-[#F0F2F5]">{client.city || '—'}</span></div>
                <div><span className="text-[#6B7280]">País:</span> <span className="text-[#F0F2F5]">{client.country || '—'}</span></div>
              </div>
              <a href={`/clientes?id=${client.id}`} className="text-xs text-[#FF6600] hover:text-[#FF8833] inline-flex items-center gap-1 mt-3">
                Ver ficha completa <ChevronRight size={11} />
              </a>
            </div>
          </div>
        )}

        {/* TAB: RELATED */}
        {tab === 'related' && (
          <div className="space-y-2">
            {related.length === 0 ? (
              <div className="rounded-lg border border-dashed border-[#2A3040] bg-[#0A0D12] p-8 text-center">
                <LinkIcon size={28} className="text-[#3A4050] mx-auto mb-2" />
                <p className="text-sm text-[#6B7280]">Sin documentos relacionados</p>
              </div>
            ) : related.map(r => {
              const meta = TYPE_LABELS[r.type] || TYPE_LABELS.cotizacion
              const RIcon = meta.icon
              return (
                <a
                  key={r.id}
                  href={`/documents/${r.id}`}
                  className="flex items-center gap-3 p-3 rounded-lg border border-[#1E2330] bg-[#0F1218] hover:border-[#FF6600]/40 hover:bg-[#141820] transition"
                >
                  <RIcon size={14} className="text-[#FF6600]" />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-bold text-[#F0F2F5]">{r.legal_number || r.system_code}</span>
                      <Badge variant="default" size="sm">{meta.label}</Badge>
                      {r.status && <StatusBadge status={r.status} />}
                    </div>
                    <p className="text-[10px] text-[#6B7280] mt-0.5">Relación: {r.relation}</p>
                  </div>
                  <span className="text-sm font-mono text-emerald-400">
                    {r.currency} {Number(r.total || 0).toLocaleString('es-AR')}
                  </span>
                  <ExternalLink size={11} className="text-[#6B7280]" />
                </a>
              )
            })}
          </div>
        )}

        {/* TAB: ACTIVITY */}
        {tab === 'activity' && (
          <div className="space-y-2 relative pl-6 before:absolute before:left-2 before:top-2 before:bottom-2 before:w-px before:bg-[#1E2330]">
            {activity.length === 0 ? (
              <div className="text-center py-8 text-[#6B7280] text-sm">Sin actividad registrada</div>
            ) : activity.map(a => (
              <div key={a.id} className="relative">
                <div className="absolute -left-[1.25rem] top-2 w-2.5 h-2.5 rounded-full bg-[#FF6600] ring-4 ring-[#0A0D12]" />
                <div className="rounded-lg bg-[#0F1218] border border-[#1E2330] p-2.5">
                  <div className="flex items-center gap-2 flex-wrap">
                    <Badge variant="default" size="sm">{a.action}</Badge>
                    <span className="text-[10px] text-[#6B7280]">por {a.user_name || 'Sistema'}</span>
                    <span className="text-[10px] text-[#6B7280]">·</span>
                    <span className="text-[10px] text-[#6B7280]">{new Date(a.created_at).toLocaleString('es-AR')}</span>
                  </div>
                  {a.description && <p className="text-xs text-[#D1D5DB] mt-1">{a.description}</p>}
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Footer con acciones */}
        <div className="flex items-center justify-between pt-4 border-t border-[#1E2330]">
          <div className="flex gap-2">
            <Button variant="secondary" size="sm" onClick={duplicateDoc} disabled={saving}>
              <Copy size={11} /> Duplicar
            </Button>
            <a href={`/documents/${doc.id}`} target="_blank" rel="noreferrer">
              <Button variant="secondary" size="sm">
                <ExternalLink size={11} /> Abrir completo
              </Button>
            </a>
          </div>
          <Button variant="secondary" onClick={onClose}>Cerrar</Button>
        </div>
      </div>
    </Modal>
  )
}

function StatusBadge({ status }: { status: string }) {
  const tone = STATUS_TONES[status.toLowerCase()] || 'gray'
  const variant = (tone === 'emerald' ? 'success' : tone === 'red' ? 'danger' : tone === 'orange' ? 'warning' : tone === 'blue' ? 'info' : 'default') as 'success' | 'danger' | 'warning' | 'info' | 'default'
  return <Badge variant={variant} size="sm">{status}</Badge>
}

function KpiBox({ label, value, tone = 'gray' }: { label: string; value: string; tone?: 'gray' | 'emerald' }) {
  const colors = {
    gray: 'text-[#F0F2F5]',
    emerald: 'text-emerald-400',
  }[tone]
  return (
    <div className="rounded-lg border border-[#1E2330] bg-[#0F1218] p-3">
      <p className="text-[10px] uppercase text-[#6B7280]">{label}</p>
      <p className={`text-base font-bold font-mono ${colors} mt-1`}>{value}</p>
    </div>
  )
}
