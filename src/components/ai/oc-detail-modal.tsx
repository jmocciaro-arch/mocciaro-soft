'use client'

/**
 * OCDetailModal — conciliación completa de una OC del cliente.
 * Muestra items parseados, permite matchear con cotización tardíamente,
 * ver discrepancias y convertir a pedido.
 */

import { useEffect, useState } from 'react'
import { Modal } from '@/components/ui/modal'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { createClient } from '@/lib/supabase/client'
import { usePermissions } from '@/hooks/use-permissions'
import {
  FileText, RefreshCw, ShoppingCart, ExternalLink, CheckCircle2, AlertCircle,
  Package, DollarSign, FilePlus2, Sparkles, Trash2, ShieldAlert,
} from 'lucide-react'

interface OCItem {
  linea?: number
  codigo?: string
  descripcion: string
  cantidad: number
  precio_unitario?: number
  subtotal?: number
  fecha_entrega?: string
}

interface Discrepancy {
  type: string
  line?: number
  detail: string
  severity: 'low' | 'medium' | 'high'
  ocValue?: string | number
  quoteValue?: string | number
}

interface OCFull {
  id: string
  file_name?: string
  file_url?: string | null
  parsed_at?: string
  parsed_items?: OCItem[]
  confidence_score?: number
  status?: string
  ai_provider?: string
  ai_discrepancies?: Discrepancy[]
  matched_quote_id?: string | null
  document_id?: string
  deletion_status?: 'active' | 'deletion_requested' | 'deleted'
  deletion_requested_by?: string | null
  deletion_requested_at?: string | null
  deletion_reason?: string | null
  deletion_reviewed_by?: string | null
  deletion_reviewed_at?: string | null
  deletion_review_notes?: string | null
  document?: {
    legal_number?: string
    total?: number
    currency?: string
    client_id?: string
    metadata?: { parsed_oc?: Record<string, unknown> }
  }
}

interface Quote {
  id: string
  legal_number?: string
  system_code?: string
  total?: number
  currency?: string
}

interface Props {
  ocId: string | null
  onClose: () => void
  onUpdated?: () => void
}

export function OCDetailModal({ ocId, onClose, onUpdated }: Props) {
  const [oc, setOc] = useState<OCFull | null>(null)
  const [quotes, setQuotes] = useState<Quote[]>([])
  const [selectedQuoteId, setSelectedQuoteId] = useState('')
  const [loading, setLoading] = useState(false)
  const [busy, setBusy] = useState<string | null>(null)
  const [msg, setMsg] = useState<{ type: 'ok' | 'err'; text: string } | null>(null)
  const [showDeleteDialog, setShowDeleteDialog] = useState(false)
  const [showCascadeDialog, setShowCascadeDialog] = useState(false)
  const [cascadeConfirmed, setCascadeConfirmed] = useState(false)
  const [deleteReason, setDeleteReason] = useState('')
  const [reviewNotes, setReviewNotes] = useState('')

  const supabase = createClient()
  const { hasRole, isSuper } = usePermissions()
  const isAdmin = isSuper || hasRole('admin') || hasRole('super_admin')

  useEffect(() => {
    if (!ocId) { setOc(null); return }
    let cancelled = false
    async function load() {
      setLoading(true)
      const { data } = await supabase
        .from('tt_oc_parsed')
        .select(`*, document:tt_documents!tt_oc_parsed_document_id_fkey (legal_number, total, currency, client_id, metadata)`)
        .eq('id', ocId)
        .single()
      if (cancelled) return
      setOc(data as OCFull)
      setSelectedQuoteId((data as OCFull)?.matched_quote_id || '')

      // Cotizaciones disponibles para match (del mismo cliente si hay client_id)
      const clientId = (data as OCFull)?.document?.client_id
      let q = supabase
        .from('tt_documents')
        .select('id, legal_number, system_code, total, currency')
        .eq('type', 'cotizacion')
        .order('created_at', { ascending: false })
        .limit(50)
      if (clientId) q = q.eq('client_id', clientId)
      const { data: qs } = await q
      if (!cancelled) setQuotes((qs as Quote[]) || [])
      setLoading(false)
    }
    load()
    return () => { cancelled = true }
  }, [ocId, supabase])

  if (!ocId) return null

  const items: OCItem[] = oc?.parsed_items || (oc?.document?.metadata?.parsed_oc as { items?: OCItem[] })?.items || []
  const highDiscs = (oc?.ai_discrepancies || []).filter(d => d.severity === 'high')
  const medDiscs  = (oc?.ai_discrepancies || []).filter(d => d.severity === 'medium')
  const lowDiscs  = (oc?.ai_discrepancies || []).filter(d => d.severity === 'low')

  async function handleRematch() {
    if (!oc) return
    setBusy('match'); setMsg(null)
    try {
      const res = await fetch('/api/oc/match', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ocId: oc.id, quoteDocumentId: selectedQuoteId || null }),
      })
      const j = await res.json()
      if (!res.ok) throw new Error(j.error || 'Error')
      setMsg({ type: 'ok', text: `Re-matcheada: ${j.discrepancies?.length || 0} discrepancias detectadas` })
      // Refrescar
      const { data } = await supabase
        .from('tt_oc_parsed')
        .select(`*, document:tt_documents!tt_oc_parsed_document_id_fkey (legal_number, total, currency, client_id, metadata)`)
        .eq('id', oc.id).single()
      setOc(data as OCFull)
      onUpdated?.()
    } catch (e) {
      setMsg({ type: 'err', text: (e as Error).message })
    } finally {
      setBusy(null)
    }
  }

  async function reloadOC() {
    if (!oc) return
    const { data } = await supabase
      .from('tt_oc_parsed')
      .select(`*, document:tt_documents!tt_oc_parsed_document_id_fkey (legal_number, total, currency, client_id, metadata)`)
      .eq('id', oc.id).single()
    setOc(data as OCFull)
    setSelectedQuoteId((data as OCFull)?.matched_quote_id || '')
    onUpdated?.()
  }

  async function handleSubmitDeletion() {
    if (!oc) return
    if (!deleteReason.trim()) {
      setMsg({ type: 'err', text: 'El motivo es obligatorio' })
      return
    }
    const endpoint = isAdmin ? '/api/oc/delete' : '/api/oc/request-deletion'
    setBusy('delete'); setMsg(null)
    try {
      const res = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ocId: oc.id, reason: deleteReason.trim() }),
      })
      const j = await res.json()
      if (!res.ok) throw new Error(j.error || 'Error')
      setMsg({ type: 'ok', text: j.message || 'Acción completada' })
      setShowDeleteDialog(false)
      setDeleteReason('')
      await reloadOC()
      if (isAdmin) setTimeout(() => onClose(), 1500)  // cerrar el modal tras borrar
    } catch (e) {
      setMsg({ type: 'err', text: (e as Error).message })
    } finally {
      setBusy(null)
    }
  }

  async function handleCascadeDelete() {
    if (!oc) return
    if (!deleteReason.trim()) {
      setMsg({ type: 'err', text: 'El motivo es obligatorio' })
      return
    }
    if (!cascadeConfirmed) {
      setMsg({ type: 'err', text: 'Confirmá el checkbox para proceder' })
      return
    }
    setBusy('cascade')
    setMsg(null)
    try {
      const res = await fetch('/api/oc/delete-cascade', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ocId: oc.id, reason: deleteReason.trim() }),
      })
      const j = await res.json()
      if (!res.ok) throw new Error(j.error || 'Error en cascade delete')
      setMsg({ type: 'ok', text: j.message || 'OC eliminada en cascada' })
      setShowCascadeDialog(false)
      setCascadeConfirmed(false)
      setDeleteReason('')
      onUpdated?.()
      setTimeout(() => onClose(), 2000)
    } catch (e) {
      setMsg({ type: 'err', text: (e as Error).message })
    } finally {
      setBusy(null)
    }
  }

  async function handleReviewDeletion(approve: boolean) {
    if (!oc) return
    if (approve && !confirm('¿Confirmar eliminación de la OC? Esta acción queda registrada.')) return
    setBusy('review'); setMsg(null)
    try {
      const res = await fetch('/api/oc/review-deletion', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ocId: oc.id, approve, notes: reviewNotes.trim() || null }),
      })
      const j = await res.json()
      if (!res.ok) throw new Error(j.error || 'Error')
      setMsg({ type: 'ok', text: j.message })
      setReviewNotes('')
      await reloadOC()
      if (approve) setTimeout(() => onClose(), 1500)
    } catch (e) {
      setMsg({ type: 'err', text: (e as Error).message })
    } finally {
      setBusy(null)
    }
  }

  async function handleReparse() {
    if (!oc) return
    if (!confirm('¿Re-parsear esta OC con la IA? Se reemplazan los items detectados con una nueva extracción del PDF.')) return
    setBusy('reparse'); setMsg(null)
    try {
      const res = await fetch('/api/oc/reparse', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ocId: oc.id }),
      })
      const j = await res.json()
      if (!res.ok) throw new Error(j.error || 'Error')
      setMsg({ type: 'ok', text: `Re-parseada: ${j.items_count} items, total ${j.total?.toFixed(2)} (${j.provider})` })
      // Recargar
      const { data } = await supabase
        .from('tt_oc_parsed')
        .select(`*, document:tt_documents!tt_oc_parsed_document_id_fkey (legal_number, total, currency, client_id, metadata)`)
        .eq('id', oc.id).single()
      setOc(data as OCFull)
      onUpdated?.()
    } catch (e) {
      setMsg({ type: 'err', text: (e as Error).message })
    } finally {
      setBusy(null)
    }
  }

  async function handleCreateQuote() {
    if (!oc) return
    if (!confirm('¿Generar una cotización nueva con los items de esta OC? Se creará un documento tipo Cotización y se matcheará automáticamente.')) return
    setBusy('createQuote'); setMsg(null)
    try {
      const res = await fetch('/api/oc/create-quote', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ocId: oc.id }),
      })
      const j = await res.json()
      if (!res.ok) throw new Error(j.error || 'Error')
      setMsg({ type: 'ok', text: `Cotización ${j.quoteCode} creada con ${j.itemsCreated} items. Total: ${j.total.toFixed(2)}` })
      // Recargar
      const { data } = await supabase
        .from('tt_oc_parsed')
        .select(`*, document:tt_documents!tt_oc_parsed_document_id_fkey (legal_number, total, currency, client_id, metadata)`)
        .eq('id', oc.id).single()
      setOc(data as OCFull)
      setSelectedQuoteId((data as OCFull)?.matched_quote_id || '')
      onUpdated?.()
    } catch (e) {
      setMsg({ type: 'err', text: (e as Error).message })
    } finally {
      setBusy(null)
    }
  }

  async function handleConvertToOrder() {
    if (!oc) return
    if (!confirm('¿Convertir esta OC en un pedido? Se creará un nuevo documento tipo Pedido con los items.')) return
    setBusy('convert'); setMsg(null)
    try {
      const res = await fetch('/api/oc/convert-to-order', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ocId: oc.id }),
      })
      const j = await res.json()
      if (!res.ok) throw new Error(j.error || 'Error')
      setMsg({ type: 'ok', text: `Pedido ${j.orderCode} creado. Items: ${j.itemsCreated}` })
      onUpdated?.()
    } catch (e) {
      setMsg({ type: 'err', text: (e as Error).message })
    } finally {
      setBusy(null)
    }
  }

  const title = oc?.document?.legal_number
    ? `OC ${oc.document.legal_number}`
    : oc?.file_name || 'OC'

  const currency = oc?.document?.currency || 'ARS'
  const total = oc?.document?.total || 0

  return (
    <Modal isOpen={!!ocId} onClose={onClose} title={title} size="xl">
      {loading ? (
        <div className="py-12 text-center opacity-60">Cargando OC...</div>
      ) : !oc ? (
        <div className="py-12 text-center opacity-60">OC no encontrada</div>
      ) : (
        <div className="space-y-4">
          {/* Header: stats */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
            <Stat label="Items" value={String(items.length)} icon={<Package size={12} />} />
            <Stat label="Total" value={`${currency} ${Number(total).toLocaleString('es-AR', { minimumFractionDigits: 2 })}`} icon={<DollarSign size={12} />} />
            <Stat label="Confianza" value={`${Math.round((oc.confidence_score || 0) * 100)}%`} />
            <Stat label="Proveedor IA" value={oc.ai_provider || '—'} />
          </div>

          {/* Badges de estado */}
          <div className="flex items-center gap-2 flex-wrap">
            {oc.status && <Badge>{oc.status}</Badge>}
            {oc.matched_quote_id ? (
              <Badge variant="success">
                <CheckCircle2 size={12} /> Matcheada con cotización
              </Badge>
            ) : (
              <Badge variant="warning">Sin cotización</Badge>
            )}
            {highDiscs.length > 0 && <Badge variant="danger">🔴 {highDiscs.length} críticas</Badge>}
            {medDiscs.length > 0 && <Badge variant="warning">🟠 {medDiscs.length} medias</Badge>}
            {lowDiscs.length > 0 && <Badge variant="default">🟡 {lowDiscs.length} menores</Badge>}
          </div>

          {/* Aviso de auto-matcheo cuando la cotización salió desde la OC */}
          {oc.matched_quote_id && isCotFromOC(oc) && (
            <div className="rounded-lg px-3 py-2 text-xs bg-emerald-500/10 text-emerald-400 border border-emerald-500/30 flex items-start gap-2">
              <CheckCircle2 size={14} className="mt-0.5 shrink-0" />
              <div>
                <strong>Auto-matcheo:</strong> esta cotización se generó desde la misma OC, así que se matcheó automáticamente y no hay discrepancias. Si querés reemplazarla, des-matcheá abajo y elegí otra.
              </div>
            </div>
          )}

          {msg && (
            <div className={`rounded-lg px-3 py-2 text-xs border ${msg.type === 'ok' ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30' : 'bg-red-500/10 text-red-400 border-red-500/30'}`}>
              {msg.text}
            </div>
          )}

          {/* Banner: OC ya eliminada */}
          {oc.deletion_status === 'deleted' && (
            <div className="rounded-lg px-3 py-3 bg-red-500/10 text-red-300 border border-red-500/30">
              <div className="flex items-center gap-2 mb-1">
                <Trash2 size={14} />
                <strong>OC eliminada</strong>
              </div>
              <p className="text-xs opacity-90">
                Motivo: <em>{oc.deletion_reason || '(no especificado)'}</em>
                {oc.deletion_reviewed_at && (
                  <span className="ml-2 opacity-70">
                    · {new Date(oc.deletion_reviewed_at).toLocaleString('es-AR')}
                  </span>
                )}
              </p>
            </div>
          )}

          {/* Banner: solicitud de eliminación pendiente */}
          {oc.deletion_status === 'deletion_requested' && (
            <div className="rounded-lg px-3 py-3 bg-orange-500/10 text-orange-300 border border-orange-500/30 space-y-2">
              <div className="flex items-center gap-2">
                <ShieldAlert size={14} />
                <strong>Solicitud de eliminación pendiente</strong>
              </div>
              <p className="text-xs opacity-90">
                Motivo del solicitante: <em>{oc.deletion_reason || '(no especificado)'}</em>
                {oc.deletion_requested_at && (
                  <span className="ml-2 opacity-70">
                    · {new Date(oc.deletion_requested_at).toLocaleString('es-AR')}
                  </span>
                )}
              </p>
              {isAdmin ? (
                <div className="space-y-2 pt-1">
                  <textarea
                    value={reviewNotes}
                    onChange={(e) => setReviewNotes(e.target.value)}
                    placeholder="Notas de revisión (opcional)"
                    className="w-full h-16 rounded bg-[#1E2330] border border-[#2A3040] px-2 py-1 text-xs text-[#F0F2F5] resize-none"
                  />
                  <div className="flex gap-2">
                    <Button
                      size="sm"
                      variant="danger"
                      onClick={() => handleReviewDeletion(true)}
                      loading={busy === 'review'}
                      disabled={busy !== null}
                    >
                      Aprobar y eliminar
                    </Button>
                    <Button
                      size="sm"
                      variant="secondary"
                      onClick={() => handleReviewDeletion(false)}
                      loading={busy === 'review'}
                      disabled={busy !== null}
                    >
                      Rechazar solicitud
                    </Button>
                  </div>
                </div>
              ) : (
                <p className="text-xs italic opacity-80">Esperando aprobación de un administrador.</p>
              )}
            </div>
          )}

          {/* Diálogo inline para pedir motivo */}
          {showCascadeDialog && oc.deletion_status === 'active' && isAdmin && (
            <div className="rounded-lg px-3 py-3 bg-red-950/20 border-2 border-red-500/50 space-y-3">
              <div className="flex items-center gap-2 text-red-400">
                <ShieldAlert size={16} />
                <strong className="text-sm">Eliminar OC + cadena completa</strong>
              </div>
              <div className="text-xs text-[#D1D5DB] space-y-1.5">
                <p className="font-semibold text-red-300">Esta acción es destructiva e impacta:</p>
                <ul className="list-disc pl-5 space-y-0.5 text-[#9CA3AF]">
                  <li>La OC parseada (soft-delete, queda en audit log).</li>
                  <li>El documento OC en <code>tt_documents</code> (status → cancelled).</li>
                  <li>La cotización generada/matcheada (status → cancelled).</li>
                  <li>Pedidos, albaranes y facturas downstream encadenados (status → cancelled).</li>
                  <li>Todas las líneas (<code>tt_document_items</code>) y vínculos (<code>tt_document_links</code>): borrado duro.</li>
                  <li>El PDF original en storage (<code>client-pos</code>): borrado duro.</li>
                </ul>
                <p className="text-[#FF6600] mt-2">
                  Snapshot completo queda en <code>tt_oc_audit_log</code> antes de tocar nada — recuperable manualmente.
                </p>
              </div>
              <textarea
                value={deleteReason}
                onChange={(e) => setDeleteReason(e.target.value)}
                placeholder="Motivo de la eliminación (obligatorio)"
                autoFocus
                className="w-full h-20 rounded bg-[#1E2330] border border-red-500/30 px-2 py-1 text-sm text-[#F0F2F5] resize-none focus:outline-none focus:border-red-500"
              />
              <label className="flex items-start gap-2 text-xs text-[#D1D5DB] cursor-pointer">
                <input
                  type="checkbox"
                  checked={cascadeConfirmed}
                  onChange={(e) => setCascadeConfirmed(e.target.checked)}
                  className="mt-0.5"
                />
                <span>
                  Entiendo que esto cancela la cotización, los pedidos y todos los documentos derivados.
                  No se puede deshacer desde la UI.
                </span>
              </label>
              <div className="flex gap-2 justify-end">
                <Button
                  size="sm"
                  variant="secondary"
                  onClick={() => {
                    setShowCascadeDialog(false)
                    setCascadeConfirmed(false)
                    setDeleteReason('')
                  }}
                  disabled={busy !== null}
                >
                  Cancelar
                </Button>
                <Button
                  size="sm"
                  variant="danger"
                  onClick={handleCascadeDelete}
                  loading={busy === 'cascade'}
                  disabled={busy !== null || !deleteReason.trim() || !cascadeConfirmed}
                >
                  Eliminar todo en cascada
                </Button>
              </div>
            </div>
          )}

          {showDeleteDialog && oc.deletion_status === 'active' && (
            <div className="rounded-lg px-3 py-3 bg-[#141820] border border-red-500/30 space-y-2">
              <div className="flex items-center gap-2 text-red-400">
                <Trash2 size={14} />
                <strong className="text-sm">
                  {isAdmin ? 'Eliminar OC' : 'Solicitar eliminación'}
                </strong>
              </div>
              <p className="text-xs text-[#9CA3AF]">
                {isAdmin
                  ? 'Esta acción marca la OC como eliminada. Queda registrada en el audit log con tu motivo.'
                  : 'Tu solicitud quedará pendiente hasta que un administrador la apruebe o rechace.'}
              </p>
              <textarea
                value={deleteReason}
                onChange={(e) => setDeleteReason(e.target.value)}
                placeholder="Motivo de la eliminación (obligatorio)"
                autoFocus
                className="w-full h-20 rounded bg-[#1E2330] border border-[#2A3040] px-2 py-1 text-sm text-[#F0F2F5] resize-none focus:outline-none focus:border-red-500/50"
              />
              <div className="flex gap-2 justify-end">
                <Button
                  size="sm"
                  variant="secondary"
                  onClick={() => { setShowDeleteDialog(false); setDeleteReason('') }}
                  disabled={busy !== null}
                >
                  Cancelar
                </Button>
                <Button
                  size="sm"
                  variant="danger"
                  onClick={handleSubmitDeletion}
                  loading={busy === 'delete'}
                  disabled={busy !== null || !deleteReason.trim()}
                >
                  {isAdmin ? 'Eliminar ahora' : 'Enviar solicitud'}
                </Button>
              </div>
            </div>
          )}

          {/* Matcheo tardío con cotización */}
          <div className="rounded-lg border border-[#1E2330] bg-[#0F1218] p-3 space-y-2">
            <div className="flex items-center gap-2">
              <RefreshCw size={14} className="text-[#FF6600]" />
              <span className="text-xs font-semibold uppercase tracking-wider text-[#FF6600]">
                Conciliación con cotización
              </span>
            </div>

            {/* Opción 1: matchear con cotización existente */}
            <div>
              <p className="text-[10px] text-[#6B7280] mb-1">Opción 1 — Matchear con una cotización existente del cliente:</p>
              <div className="flex gap-2">
                <select
                  value={selectedQuoteId}
                  onChange={(e) => setSelectedQuoteId(e.target.value)}
                  className="flex-1 rounded-lg bg-[#1E2330] border border-[#2A3040] px-3 py-2 text-sm text-[#F0F2F5]"
                >
                  <option value="">— Sin cotización / des-matchear —</option>
                  {quotes.map(q => (
                    <option key={q.id} value={q.id}>
                      {q.legal_number || q.system_code} · {q.currency || 'ARS'} {Number(q.total || 0).toLocaleString('es-AR')}
                    </option>
                  ))}
                </select>
                <Button
                  onClick={handleRematch}
                  loading={busy === 'match'}
                  disabled={busy !== null}
                >
                  Matchear
                </Button>
              </div>
              {quotes.length === 0 && (
                <p className="text-[10px] text-[#6B7280] mt-1 italic">
                  No hay cotizaciones disponibles para este cliente.
                </p>
              )}
            </div>

            {/* Separador */}
            <div className="flex items-center gap-2 py-1">
              <div className="flex-1 h-px bg-[#1E2330]" />
              <span className="text-[9px] uppercase text-[#4B5563]">ó</span>
              <div className="flex-1 h-px bg-[#1E2330]" />
            </div>

            {/* Opción 2: generar cotización nueva */}
            <div>
              <p className="text-[10px] text-[#6B7280] mb-1">
                Opción 2 — El cliente mandó OC directa sin cotizar. Generá una cotización con los items de la OC:
              </p>
              <Button
                onClick={handleCreateQuote}
                loading={busy === 'createQuote'}
                disabled={busy !== null || !!oc.matched_quote_id || items.length === 0}
                variant="secondary"
                className="w-full"
                title={oc.matched_quote_id ? 'La OC ya tiene cotización matcheada. Des-matcheá primero.' : 'Crear una cotización nueva desde los items de esta OC'}
              >
                <FilePlus2 size={14} /> Generar cotización desde esta OC
              </Button>
            </div>
          </div>

          {/* Tabla de items */}
          <div>
            <p className="text-xs font-semibold uppercase tracking-wider text-[#6B7280] mb-2">
              Items de la OC ({items.length})
            </p>
            <div className="rounded-lg border border-[#1E2330] bg-[#0A0D12] overflow-hidden max-h-[400px] overflow-y-auto">
              <table className="w-full text-sm">
                <thead className="bg-[#0F1218] sticky top-0 z-10">
                  <tr className="text-[10px] uppercase tracking-wider text-[#6B7280]">
                    <th className="px-3 py-2 text-left w-10">#</th>
                    <th className="px-3 py-2 text-left">SKU</th>
                    <th className="px-3 py-2 text-left">Descripción</th>
                    <th className="px-3 py-2 text-right w-20">Cant</th>
                    <th className="px-3 py-2 text-right w-24">P.Unit</th>
                    <th className="px-3 py-2 text-right w-28">Subtotal</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#1E2330]">
                  {items.map((item, i) => {
                    const disc = (oc.ai_discrepancies || []).find(d => d.line === (item.linea ?? i + 1))
                    const rowColor = disc?.severity === 'high' ? 'bg-red-500/5' : disc?.severity === 'medium' ? 'bg-orange-500/5' : ''
                    return (
                      <tr key={i} className={`hover:bg-[#141820] ${rowColor}`}>
                        <td className="px-3 py-2 text-[#6B7280]">{item.linea ?? i + 1}</td>
                        <td className="px-3 py-2 font-mono text-xs text-[#FF6600]">{item.codigo || '—'}</td>
                        <td className="px-3 py-2 text-[#F0F2F5]">
                          <div>{item.descripcion}</div>
                          {disc && (
                            <div className="text-[10px] mt-0.5 flex items-center gap-1">
                              <span>{disc.severity === 'high' ? '🔴' : disc.severity === 'medium' ? '🟠' : '🟡'}</span>
                              <span className="opacity-80">{disc.detail}</span>
                            </div>
                          )}
                        </td>
                        <td className="px-3 py-2 text-right font-mono">{item.cantidad}</td>
                        <td className="px-3 py-2 text-right font-mono">{item.precio_unitario?.toFixed(2) ?? '—'}</td>
                        <td className="px-3 py-2 text-right font-mono font-semibold">
                          {((item.cantidad || 0) * (item.precio_unitario || 0)).toFixed(2)}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </div>

          {/* Discrepancias adicionales (extra_item que no tienen línea) */}
          {(oc.ai_discrepancies || []).filter(d => !d.line).length > 0 && (
            <div>
              <p className="text-xs font-semibold uppercase tracking-wider text-[#6B7280] mb-2">
                Otras discrepancias
              </p>
              <div className="space-y-1 text-xs">
                {(oc.ai_discrepancies || []).filter(d => !d.line).map((d, i) => (
                  <div key={i} className="flex items-start gap-2 p-2 rounded bg-[#0F1218] border border-[#1E2330]">
                    <AlertCircle size={12} className={d.severity === 'high' ? 'text-red-400' : d.severity === 'medium' ? 'text-orange-400' : 'text-yellow-400'} />
                    <span>{d.detail}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Actions */}
          <div className="flex justify-between items-center pt-3 border-t border-[#1E2330] flex-wrap gap-2">
            <div className="flex gap-2 flex-wrap">
              {oc.file_url && (
                <a href={`/api/oc/${oc.id}/pdf`} target="_blank" rel="noreferrer">
                  <Button variant="secondary" size="sm">
                    <ExternalLink size={14} /> Ver PDF original
                  </Button>
                </a>
              )}
              {oc.file_url && (
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={handleReparse}
                  loading={busy === 'reparse'}
                  disabled={busy !== null}
                  title="Re-ejecutar IA sobre el PDF para refrescar items"
                >
                  <Sparkles size={14} /> Re-parsear con IA
                </Button>
              )}
              {oc.deletion_status === 'active' && !showDeleteDialog && !showCascadeDialog && (
                <Button
                  variant="danger"
                  size="sm"
                  onClick={() => setShowDeleteDialog(true)}
                  disabled={busy !== null}
                  title={isAdmin ? 'Eliminar solo la OC (cotización y pedido quedan)' : 'Solicitar eliminación al administrador'}
                >
                  <Trash2 size={14} />
                  {isAdmin ? 'Eliminar OC' : 'Solicitar eliminación'}
                </Button>
              )}
              {isAdmin && oc.deletion_status === 'active' && !showDeleteDialog && !showCascadeDialog && (
                <Button
                  variant="danger"
                  size="sm"
                  onClick={() => setShowCascadeDialog(true)}
                  disabled={busy !== null}
                  title="Eliminar OC + cotización + pedido + items + vínculos + PDF (cadena completa)"
                  className="border border-red-500/60"
                >
                  <ShieldAlert size={14} />
                  Eliminar todo (cascada)
                </Button>
              )}
            </div>
            <div className="flex gap-2">
              <Button variant="secondary" onClick={onClose}>Cerrar</Button>
              {oc.deletion_status === 'active' && (
                <Button
                  onClick={handleConvertToOrder}
                  loading={busy === 'convert'}
                  disabled={busy !== null || highDiscs.length > 0}
                  title={highDiscs.length > 0 ? 'Resolvé las discrepancias críticas antes de convertir' : 'Convertir OC en Pedido'}
                >
                  <ShoppingCart size={14} /> Convertir en Pedido
                </Button>
              )}
            </div>
          </div>
        </div>
      )}
    </Modal>
  )
}

/** Detecta si la cotización matcheada se generó desde esta misma OC */
function isCotFromOC(oc: OCFull): boolean {
  // El legal_number de la cotización auto-generada empieza con "COT-desde-OC-"
  // o el system_code empieza con "COT-" y la metadata del doc principal trackea source_oc_id.
  // Como no tenemos esa info del quote aquí, usamos un shortcut: si no hay discrepancias y está validated, probablemente es auto-matcheo.
  // Para un check más robusto haríamos un fetch a tt_documents del matched_quote_id.
  return (
    !!oc.matched_quote_id &&
    (oc.ai_discrepancies?.length ?? 0) === 0 &&
    oc.status === 'validated'
  )
}

function Stat({ label, value, icon }: { label: string; value: string; icon?: React.ReactNode }) {
  return (
    <div className="p-2 rounded-lg bg-[#0F1218] border border-[#1E2330]">
      <div className="text-[10px] opacity-60 uppercase tracking-wider flex items-center gap-1">
        {icon} {label}
      </div>
      <div className="font-semibold mt-0.5 text-[#F0F2F5] truncate">{value}</div>
    </div>
  )
}
