'use client'

import { useEffect, useState, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { useCompanyFilter } from '@/hooks/use-company-filter'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { OCParserModal } from '@/components/ai/oc-parser-modal'
import { OCDetailModal } from '@/components/ai/oc-detail-modal'
import { DocumentProcessBar } from '@/components/workflow/document-process-bar'
import { buildSteps } from '@/lib/workflow-definitions'
import { Upload, FileText, Sparkles, RefreshCw, ArrowRight, CheckCircle2, AlertCircle, Clock, Inbox, Eye } from 'lucide-react'

interface OC {
  id: string
  document_id?: string
  file_name?: string
  parsed_at?: string
  parsed_by?: string
  confidence_score?: number
  status?: string
  ai_provider?: string
  ai_discrepancies?: Array<{ severity: 'low' | 'medium' | 'high'; detail: string }>
  matched_quote_id?: string
  deletion_status?: 'active' | 'deletion_requested' | 'deleted'
  deletion_reason?: string | null
  document?: { legal_number?: string; total?: number; client_id?: string }
  // Enriquecido al cargar — link al pedido generado desde esta OC
  order_doc_id?: string
  order_code?: string
  // Enriquecido — datos de la cotización matcheada
  quote_code?: string
}

interface Quote {
  id: string
  legal_number?: string
  system_code?: string
  client_id?: string
  total?: number
}

export default function ImportarOCPage() {
  const router = useRouter()
  const supabase = createClient()
  const { filterByCompany, activeCompanyId } = useCompanyFilter()
  const [ocs, setOcs] = useState<OC[]>([])
  const [quotes, setQuotes] = useState<Quote[]>([])
  const [selectedQuoteId, setSelectedQuoteId] = useState<string>('')
  const [parserOpen, setParserOpen] = useState(false)
  const [detailOcId, setDetailOcId] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  const load = useCallback(async () => {
    setLoading(true)
    // Cotizaciones abiertas
    const qQ = supabase
      .from('tt_documents')
      .select('id, legal_number, system_code, client_id, total')
      .eq('type', 'cotizacion')
      .order('created_at', { ascending: false })
      .limit(50)
    const { data: qs } = await filterByCompany(qQ)
    const quotesList = (qs as Quote[]) || []
    setQuotes(quotesList)

    // OCs parseadas recientes (excluimos las eliminadas; las con solicitud pendiente sí se muestran)
    const { data: ocData } = await supabase
      .from('tt_oc_parsed')
      .select(`*, document:tt_documents!tt_oc_parsed_document_id_fkey ( legal_number, total, client_id )`)
      .neq('deletion_status', 'deleted')
      .order('created_at', { ascending: false })
      .limit(30)
    const ocsList = (ocData as OC[]) || []

    // Enriquecer cada OC con: pedido vinculado (si existe) y código de cotización matcheada
    const ocDocIds = ocsList.map((o) => o.document_id).filter((x): x is string => !!x)
    let orderLinks: Record<string, { id: string; code?: string }> = {}
    if (ocDocIds.length > 0) {
      const { data: links } = await supabase
        .from('tt_document_links')
        .select(`child_id, parent_id, tt_documents:child_id ( id, system_code, legal_number, type )`)
        .in('parent_id', ocDocIds)
        .eq('relation_type', 'pedido')
      type LinkRow = {
        parent_id: string
        child_id: string
        tt_documents?: { id?: string; system_code?: string; legal_number?: string }
      }
      orderLinks = ((links as unknown as LinkRow[]) || []).reduce((acc, l) => {
        if (l.parent_id && l.child_id) {
          acc[l.parent_id] = {
            id: l.tt_documents?.id || l.child_id,
            code: l.tt_documents?.legal_number || l.tt_documents?.system_code,
          }
        }
        return acc
      }, {} as Record<string, { id: string; code?: string }>)
    }

    const quotesById = new Map(
      quotesList.map((q) => [q.id, q.legal_number || q.system_code || ''])
    )

    setOcs(
      ocsList.map((oc) => {
        const ord = oc.document_id ? orderLinks[oc.document_id] : undefined
        return {
          ...oc,
          order_doc_id: ord?.id,
          order_code: ord?.code,
          quote_code: oc.matched_quote_id ? quotesById.get(oc.matched_quote_id) : undefined,
        }
      })
    )

    setLoading(false)
  }, [activeCompanyId])

  useEffect(() => { void load() }, [load])

  // Determinar el paso actual del workflow basado en el estado de las OCs
  const hasUploaded = ocs.length > 0
  const hasParsed = ocs.some((oc) => oc.status === 'parsed' || oc.parsed_at)
  const hasMatched = ocs.some((oc) => oc.matched_quote_id)
  const hasValidated = ocs.some((oc) => oc.status === 'validated')
  const hasOrder = ocs.some((oc) => oc.status === 'converted' || oc.document_id)

  const currentOCStep = hasOrder ? 'order'
    : hasValidated ? 'validated'
    : hasMatched ? 'matched'
    : hasParsed ? 'parsed'
    : hasUploaded ? 'uploaded'
    : 'uploaded'

  const pendingDiscrepancies = ocs.reduce((sum, oc) => sum + ((oc.ai_discrepancies || []).filter(d => d.severity === 'high').length), 0)

  // Targets para navegación desde el stepper. La regla: cada paso del workflow
  // tiene una "OC representativa" (la más reciente que llegó a ese paso) y se
  // navega a su detalle o a la entidad relacionada (cotización, pedido).
  const latestParsed = ocs.find((o) => o.parsed_at || o.status === 'parsed')
  const latestMatched = ocs.find((o) => o.matched_quote_id)
  const latestValidated = ocs.find((o) => o.status === 'validated')
  const latestWithOrder = ocs.find((o) => o.order_doc_id)

  const stepOverrides: Record<string, { onClick?: () => void; hint?: string }> = {
    uploaded: {
      hint: hasUploaded ? `${ocs.length} cargada${ocs.length !== 1 ? 's' : ''}` : 'subir PDF',
      onClick: () => {
        if (!hasUploaded) setParserOpen(true)
        else window.scrollTo({ top: document.body.scrollHeight, behavior: 'smooth' })
      },
    },
    parsed: latestParsed
      ? { onClick: () => setDetailOcId(latestParsed.id), hint: 'ver detalle parseado' }
      : {},
    matched: latestMatched?.matched_quote_id
      ? {
          onClick: () => router.push(`/documentos/${latestMatched.matched_quote_id}`),
          hint: latestMatched.quote_code ? `→ ${latestMatched.quote_code}` : 'ver cotización',
        }
      : {},
    validated: latestValidated
      ? { onClick: () => setDetailOcId(latestValidated.id), hint: 'ver OC validada' }
      : {},
    order: latestWithOrder?.order_doc_id
      ? {
          onClick: () => router.push(`/documentos/${latestWithOrder.order_doc_id}`),
          hint: latestWithOrder.order_code ? `→ ${latestWithOrder.order_code}` : 'ver pedido',
        }
      : {},
  }

  return (
    <div className="space-y-4">
      {/* ══════════════════════════════════════════════════════════════
          REGLA FUNDAMENTAL: Barra sticky con código + stepper + alertas
          ══════════════════════════════════════════════════════════════ */}
      <DocumentProcessBar
        code="OC del cliente"
        badge={{
          label: hasOrder ? 'Convertida en pedido' : hasValidated ? 'Validada' : hasMatched ? 'Matcheada' : hasParsed ? 'Parseada por IA' : hasUploaded ? 'Subida' : 'Sin OCs',
          variant: hasOrder ? 'success' : hasValidated ? 'info' : hasMatched ? 'warning' : hasParsed ? 'warning' : 'default',
        }}
        entity={
          <span>
            {ocs.length === 0
              ? 'Subí el PDF de la OC del cliente para arrancar'
              : <>{ocs.length} OC{ocs.length !== 1 ? 's' : ''} carga{ocs.length !== 1 ? 'das' : 'da'}{selectedQuoteId && <> · cotización seleccionada para match</>}</>
            }
          </span>
        }
        alerts={[
          ...(pendingDiscrepancies > 0 ? [{ type: 'warning' as const, message: `${pendingDiscrepancies} discrepancia${pendingDiscrepancies !== 1 ? 's' : ''} de alta severidad pendiente${pendingDiscrepancies !== 1 ? 's' : ''} de revisión` }] : []),
          ...(!selectedQuoteId && ocs.length === 0 ? [{ type: 'info' as const, message: 'Seleccioná una cotización de referencia antes de subir la OC' }] : []),
        ]}
        steps={buildSteps('client_po', currentOCStep, stepOverrides)}
        actions={[
          { label: 'Subir OC', onClick: () => setParserOpen(true), icon: 'play', variant: 'primary' },
        ]}
      />

      <div className="p-4 sm:p-6 space-y-5 max-w-[1100px] mx-auto">
      {/* HEADER */}
      <div>
        <div className="flex items-center gap-2 text-[#FF6600] text-xs uppercase tracking-wider font-semibold">
          <Sparkles size={14} /> Cliente → Pedido (vía OC)
        </div>
        <h1 className="text-2xl font-bold text-[#F0F2F5] mt-1">Importar OC del cliente</h1>
        <p className="text-sm text-[#9CA3AF] mt-1">
          Cuando un cliente te manda su orden de compra en PDF, subila acá. La IA extrae los items,
          los compara contra una cotización tuya, y te deja crear el pedido con un click.
        </p>
      </div>

      {/* PASO 1 — Subir OC (card grande, prominente) */}
      <Card className="p-0 overflow-hidden border-2 border-dashed border-[#2A3040] hover:border-[#FF6600]/40 transition-colors">
        <button
          onClick={() => setParserOpen(true)}
          className="w-full p-6 sm:p-8 flex flex-col sm:flex-row items-center gap-4 text-left"
        >
          <div className="w-14 h-14 rounded-xl bg-[#FF6600]/10 border border-[#FF6600]/30 flex items-center justify-center shrink-0">
            <Upload size={26} className="text-[#FF6600]" />
          </div>
          <div className="flex-1">
            <p className="text-sm uppercase tracking-wider text-[#FF6600] font-semibold">Paso 1</p>
            <h2 className="text-lg font-bold text-[#F0F2F5]">Subí el PDF de la OC del cliente</h2>
            <p className="text-xs text-[#9CA3AF] mt-1">
              La IA va a extraer los items, montos y fechas de entrega automáticamente.
              Soporta PDF de hasta 30 MB. Aceptamos OCs en español, inglés, alemán y portugués.
            </p>
          </div>
          <Button>
            <Upload size={14} /> Subir OC
          </Button>
        </button>
      </Card>

      {/* PASO 2 — Selector de cotización a comparar (opcional) */}
      <Card className="p-4">
        <div className="flex items-start gap-3">
          <div className="w-9 h-9 rounded-lg bg-[#1E2330] border border-[#2A3040] flex items-center justify-center text-sm font-bold text-[#9CA3AF]">2</div>
          <div className="flex-1">
            <p className="text-sm font-semibold text-[#F0F2F5]">Cotización a comparar <span className="text-[10px] text-[#6B7280] font-normal">(opcional, recomendado)</span></p>
            <p className="text-xs text-[#9CA3AF] mt-0.5 mb-2">
              Si la OC viene de una cotización tuya, elegila para que la IA detecte discrepancias de cantidad o precio.
            </p>
            <select
              value={selectedQuoteId}
              onChange={(e) => setSelectedQuoteId(e.target.value)}
              className="w-full rounded-md bg-[#1E2330] border border-[#2A3040] px-3 py-2 text-sm text-[#F0F2F5]"
            >
              <option value="">— Sin cotización (solo parsear) —</option>
              {quotes.map((q) => (
                <option key={q.id} value={q.id}>
                  {q.legal_number || q.system_code} — €{Number(q.total || 0).toLocaleString('es-AR')}
                </option>
              ))}
            </select>
            {selectedQuoteId && (
              <p className="text-[11px] text-emerald-400 mt-2 flex items-center gap-1">
                <CheckCircle2 size={11} /> Al parsear, la IA comparará items y detectará discrepancias
              </p>
            )}
          </div>
        </div>
      </Card>

      {/* PASO 3 — Lista de OCs importadas con estado claro */}
      <Card className="p-0 overflow-hidden">
        <div className="p-4 border-b border-[#1E2330] flex items-center justify-between flex-wrap gap-2">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-lg bg-[#1E2330] border border-[#2A3040] flex items-center justify-center text-sm font-bold text-[#9CA3AF]">3</div>
            <div>
              <p className="text-sm font-semibold text-[#F0F2F5]">OCs importadas</p>
              <p className="text-[11px] text-[#6B7280]">{ocs.length} carga{ocs.length !== 1 ? 's' : 'da'}</p>
            </div>
          </div>
          <Button size="sm" variant="secondary" onClick={load}>
            <RefreshCw size={11} /> Refrescar
          </Button>
        </div>

        {loading ? (
          <div className="p-12 text-center text-[#6B7280] text-sm">
            <RefreshCw size={28} className="mx-auto mb-2 animate-spin opacity-50" />
            Cargando OCs...
          </div>
        ) : ocs.length === 0 ? (
          <div className="p-12 text-center">
            <Inbox size={36} className="mx-auto mb-3 text-[#3A4050]" />
            <p className="text-sm text-[#9CA3AF]">Todavía no subiste ninguna OC del cliente.</p>
            <p className="text-xs text-[#6B7280] mt-1">Empezá con el botón "Subir OC" de arriba.</p>
          </div>
        ) : (
          <div className="divide-y divide-[#1E2330]">
            {ocs.map((oc) => {
              const highDisc = (oc.ai_discrepancies || []).filter((d) => d.severity === 'high').length
              const isConverted = oc.status === 'converted' || !!oc.order_doc_id
              const isMatched = !!oc.matched_quote_id && !isConverted
              const isPending = !isConverted && !isMatched
              const stateInfo = isConverted
                ? { icon: CheckCircle2, label: 'Convertida en pedido', tone: 'success' as const, color: 'text-emerald-400 border-emerald-500/30 bg-emerald-500/5' }
                : isMatched
                ? { icon: Clock, label: 'Matcheada — pendiente convertir', tone: 'warning' as const, color: 'text-amber-400 border-amber-500/30 bg-amber-500/5' }
                : { icon: AlertCircle, label: 'Pendiente match con cotización', tone: 'info' as const, color: 'text-blue-400 border-blue-500/30 bg-blue-500/5' }
              const StateIcon = stateInfo.icon

              return (
                <div
                  key={oc.id}
                  className="p-4 hover:bg-[#1A1F2E] transition-colors group cursor-pointer"
                  onClick={() => setDetailOcId(oc.id)}
                >
                  <div className="flex items-start gap-3">
                    {/* Estado visual prominente */}
                    <div className={`w-10 h-10 rounded-lg border flex items-center justify-center shrink-0 ${stateInfo.color}`}>
                      <StateIcon size={18} />
                    </div>

                    <div className="flex-1 min-w-0">
                      {/* Línea 1: ref, total, badges técnicos */}
                      <div className="flex items-center gap-2 flex-wrap">
                        <strong className="text-[#F0F2F5] font-mono">
                          {oc.document?.legal_number || oc.file_name || 'OC sin número'}
                        </strong>
                        {oc.document?.total != null && (
                          <span className="text-sm font-mono text-emerald-400">
                            €{Number(oc.document.total).toLocaleString('es-AR', { minimumFractionDigits: 2 })}
                          </span>
                        )}
                        {oc.ai_provider && <Badge variant="default" size="sm">{oc.ai_provider}</Badge>}
                        {oc.confidence_score != null && (
                          <Badge variant="default" size="sm">{Math.round(oc.confidence_score * 100)}% conf.</Badge>
                        )}
                        {highDisc > 0 && (
                          <Badge variant="danger" size="sm">{highDisc} discrepancia{highDisc !== 1 ? 's' : ''}</Badge>
                        )}
                        {oc.deletion_status === 'deletion_requested' && (
                          <Badge variant="warning" size="sm">Eliminación pendiente</Badge>
                        )}
                      </div>

                      {/* Línea 2: estado prominente */}
                      <p className={`text-xs mt-1.5 ${stateInfo.color.split(' ')[0]} font-medium`}>
                        {stateInfo.label}
                      </p>

                      {/* Línea 3: meta */}
                      <p className="text-[11px] text-[#6B7280] mt-1">
                        {oc.parsed_at ? `Subida ${new Date(oc.parsed_at).toLocaleString('es-AR')}` : '—'}
                        {oc.file_name && ` · ${oc.file_name}`}
                      </p>

                      {/* Línea 4: chips de docs vinculados (cotización + pedido) */}
                      {(oc.matched_quote_id || oc.order_doc_id) && (
                        <div className="flex items-center gap-2 mt-3 flex-wrap" onClick={(e) => e.stopPropagation()}>
                          {oc.matched_quote_id && (
                            <button
                              type="button"
                              onClick={() => router.push(`/documentos/${oc.matched_quote_id}`)}
                              className="inline-flex items-center gap-1.5 text-xs px-2.5 py-1 rounded border border-emerald-500/30 text-emerald-400 hover:bg-emerald-500/10 transition-colors"
                            >
                              Cotización: <strong>{oc.quote_code || '—'}</strong> <ArrowRight size={11} />
                            </button>
                          )}
                          {oc.order_doc_id && (
                            <button
                              type="button"
                              onClick={() => router.push(`/documentos/${oc.order_doc_id}`)}
                              className="inline-flex items-center gap-1.5 text-xs px-2.5 py-1 rounded border border-[#FF6600]/40 text-[#FF6600] hover:bg-[#FF6600]/10 transition-colors font-semibold"
                            >
                              Ir al pedido: <strong>{oc.order_code || '—'}</strong> <ArrowRight size={11} />
                            </button>
                          )}
                        </div>
                      )}

                      {/* Discrepancias resumidas */}
                      {oc.ai_discrepancies && oc.ai_discrepancies.length > 0 && (
                        <div className="text-xs mt-2 space-y-0.5">
                          {oc.ai_discrepancies.slice(0, 2).map((d, i) => (
                            <p key={i} className="text-[#9CA3AF]">
                              <span className={d.severity === 'high' ? 'text-red-400' : d.severity === 'medium' ? 'text-amber-400' : 'text-yellow-500'}>●</span>{' '}
                              {d.detail}
                            </p>
                          ))}
                          {oc.ai_discrepancies.length > 2 && (
                            <p className="text-[11px] text-[#6B7280] italic">
                              ... y {oc.ai_discrepancies.length - 2} más (click para ver todas)
                            </p>
                          )}
                        </div>
                      )}
                    </div>

                    {/* Hover: ícono "abrir detalle" */}
                    <Eye size={16} className="text-[#6B7280] opacity-0 group-hover:opacity-100 transition-opacity shrink-0 mt-1" />
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </Card>

      {activeCompanyId && (
        <OCParserModal
          open={parserOpen}
          onClose={() => setParserOpen(false)}
          companyId={activeCompanyId}
          quoteDocumentId={selectedQuoteId || undefined}
          onParsed={() => { setParserOpen(false); void load() }}
        />
      )}

      {/* Modal de detalle/conciliación de OC */}
      <OCDetailModal
        ocId={detailOcId}
        onClose={() => setDetailOcId(null)}
        onUpdated={() => void load()}
      />
      </div>
    </div>
  )
}
