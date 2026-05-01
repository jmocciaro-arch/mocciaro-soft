'use client'

import { useEffect, useState, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useCompanyFilter } from '@/hooks/use-company-filter'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { OCParserModal } from '@/components/ai/oc-parser-modal'
import { OCDetailModal } from '@/components/ai/oc-detail-modal'
import { DocumentProcessBar } from '@/components/workflow/document-process-bar'
import { buildSteps } from '@/lib/workflow-definitions'
import { Upload, FileText, Sparkles, RefreshCw } from 'lucide-react'

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
}

interface Quote {
  id: string
  legal_number?: string
  system_code?: string
  client_id?: string
  total?: number
}

export default function ImportarOCPage() {
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
    setQuotes((qs as Quote[]) || [])

    // OCs parseadas recientes (excluimos las eliminadas; las con solicitud pendiente sí se muestran)
    const { data: ocData } = await supabase
      .from('tt_oc_parsed')
      .select(`*, document:tt_documents!tt_oc_parsed_document_id_fkey ( legal_number, total, client_id )`)
      .neq('deletion_status', 'deleted')
      .order('created_at', { ascending: false })
      .limit(30)
    setOcs((ocData as OC[]) || [])

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

  return (
    <div className="space-y-4">
      {/* ══════════════════════════════════════════════════════════════
          REGLA FUNDAMENTAL: Barra sticky con código + stepper + alertas
          ══════════════════════════════════════════════════════════════ */}
      <DocumentProcessBar
        code="IMPORT-OC"
        badge={{
          label: hasOrder ? 'Convertido' : hasValidated ? 'Validado' : hasParsed ? 'Parseado' : hasUploaded ? 'Subido' : 'Pendiente',
          variant: hasOrder ? 'success' : hasValidated ? 'info' : hasParsed ? 'warning' : 'default',
        }}
        entity={
          <span>
            Importación de Órdenes de Compra del cliente · {ocs.length} OC{ocs.length !== 1 ? 's' : ''} cargada{ocs.length !== 1 ? 's' : ''}
            {selectedQuoteId && <> · Cotización seleccionada para match</>}
          </span>
        }
        alerts={[
          ...(pendingDiscrepancies > 0 ? [{ type: 'warning' as const, message: `${pendingDiscrepancies} discrepancia${pendingDiscrepancies !== 1 ? 's' : ''} de alta severidad pendiente${pendingDiscrepancies !== 1 ? 's' : ''} de revisión` }] : []),
          ...(!selectedQuoteId && ocs.length === 0 ? [{ type: 'info' as const, message: 'Seleccioná una cotización de referencia antes de subir la OC' }] : []),
        ]}
        steps={buildSteps('client_po', currentOCStep)}
        actions={[
          { label: 'Subir OC', onClick: () => setParserOpen(true), icon: 'play', variant: 'primary' },
        ]}
      />

      <div className="p-6 space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Sparkles className="w-6 h-6 text-orange-500" /> Importar OC del cliente
          </h1>
          <p className="text-sm opacity-60">
            Subí el PDF de la OC → IA extrae items y detecta discrepancias con la cotización
          </p>
        </div>
        <Button onClick={() => setParserOpen(true)}>
          <Upload className="w-4 h-4 mr-1" /> Subir OC
        </Button>
      </div>

      <Card className="p-3">
        <label className="text-xs opacity-70 mb-1 block">Cotización a comparar (opcional)</label>
        <select
          value={selectedQuoteId}
          onChange={(e) => setSelectedQuoteId(e.target.value)}
          className="w-full rounded-md bg-[#1E2330] border border-[#2A3040] px-3 py-2 text-sm"
        >
          <option value="">Sin cotización — solo parsear</option>
          {quotes.map((q) => (
            <option key={q.id} value={q.id}>
              {q.legal_number || q.system_code} — ${Number(q.total || 0).toLocaleString('es-AR')}
            </option>
          ))}
        </select>
        {selectedQuoteId && (
          <div className="text-xs mt-2 opacity-70">
            ✓ Al parsear la OC, la IA comparará items y detectará discrepancias de cantidad/precio
          </div>
        )}
      </Card>

      <Card className="p-0 overflow-hidden">
        <div className="p-3 border-b flex items-center justify-between" style={{ borderColor: '#2A3040' }}>
          <strong>OCs importadas ({ocs.length})</strong>
          <Button size="sm" variant="secondary" onClick={load}>
            <RefreshCw className="w-3 h-3 mr-1" /> Refrescar
          </Button>
        </div>
        {loading ? (
          <div className="p-8 text-center opacity-60">Cargando...</div>
        ) : ocs.length === 0 ? (
          <div className="p-8 text-center opacity-60">
            Sin OCs todavía — subí la primera
          </div>
        ) : (
          <div className="divide-y" style={{ borderColor: '#2A3040' }}>
            {ocs.map((oc) => {
              const highDisc = (oc.ai_discrepancies || []).filter((d) => d.severity === 'high').length
              return (
                <div
                  key={oc.id}
                  className="p-3 cursor-pointer hover:bg-[#1A1F2E] transition-colors"
                  onClick={() => setDetailOcId(oc.id)}
                  title="Click para ver detalle de la OC"
                >
                  <div className="flex items-start gap-3">
                    <FileText className="w-5 h-5 opacity-60 mt-1" />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <strong>{oc.document?.legal_number || oc.file_name || 'OC sin número'}</strong>
                        {oc.document?.total ? (
                          <span className="text-xs opacity-60">${Number(oc.document.total).toLocaleString('es-AR')}</span>
                        ) : null}
                        {oc.ai_provider && <Badge variant="default">🤖 {oc.ai_provider}</Badge>}
                        {oc.confidence_score != null && (
                          <Badge variant="default">
                            {Math.round(oc.confidence_score * 100)}% conf.
                          </Badge>
                        )}
                        {highDisc > 0 && (
                          <Badge variant="danger">🔴 {highDisc} discrepancias</Badge>
                        )}
                        {oc.status && <Badge>{oc.status}</Badge>}
                        {oc.deletion_status === 'deletion_requested' && (
                          <Badge variant="warning">⚠️ Eliminación solicitada</Badge>
                        )}
                      </div>
                      <div className="text-xs opacity-60 mt-1">
                        {oc.parsed_at ? new Date(oc.parsed_at).toLocaleString('es-AR') : '—'}
                        {oc.file_name && ` · ${oc.file_name}`}
                      </div>
                      {oc.ai_discrepancies && oc.ai_discrepancies.length > 0 && (
                        <div className="text-xs mt-1 opacity-80">
                          {oc.ai_discrepancies.slice(0, 2).map((d, i) => (
                            <div key={i}>
                              {d.severity === 'high' ? '🔴' : d.severity === 'medium' ? '🟠' : '🟡'}{' '}
                              {d.detail}
                            </div>
                          ))}
                          {oc.ai_discrepancies.length > 2 && (
                            <div className="opacity-60">... y {oc.ai_discrepancies.length - 2} más</div>
                          )}
                        </div>
                      )}
                    </div>
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
