'use client'

/**
 * Card de "OC del cliente" para mostrar en el detalle de un pedido.
 * Llama a /api/sales-orders/[id]/client-po-context y renderiza:
 *   - Número de OC del cliente.
 *   - Status (matched, validated, converted...).
 *   - Confidence del OCR IA.
 *   - Botones para ver PDF original y abrir el detalle de la OC.
 *   - Discrepancias si hay.
 *
 * Si no hay OC vinculada, no se renderiza nada (return null).
 *
 * También expone un callback onContext(ctx) para que el parent pueda
 * usar la info (ej. marcar el step "OC Cliente" del workflow bar).
 */

import { useEffect, useState, useCallback } from 'react'
import { FileText, ExternalLink, CheckCircle2, AlertTriangle, Loader2, Hash } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'

export interface ClientPOContext {
  has_client_po: boolean
  oc_parsed_id?: string
  oc_number?: string
  oc_status?: string
  oc_pdf_url?: string | null
  oc_pdf_name?: string | null
  oc_confidence?: number | null
  oc_document_id?: string | null
  matched_quote_id?: string
  items_count?: number
  discrepancies_count?: number
  pedido_number?: string | null
  parsed_at?: string
}

interface Props {
  salesOrderId: string
  onContext?: (ctx: ClientPOContext) => void
}

const STATUS_LABEL: Record<string, string> = {
  uploaded: 'Subida',
  parsed: 'Parseada por IA',
  matched: 'Matcheada con cotización',
  validated: 'Validada',
  converted: 'Convertida a pedido',
}

const STATUS_TONE: Record<string, 'info' | 'warning' | 'success' | 'default'> = {
  uploaded: 'info',
  parsed: 'info',
  matched: 'warning',
  validated: 'warning',
  converted: 'success',
}

export function ClientPOCard({ salesOrderId, onContext }: Props) {
  const [ctx, setCtx] = useState<ClientPOContext | null>(null)
  const [loading, setLoading] = useState(true)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch(`/api/sales-orders/${salesOrderId}/client-po-context`)
      if (!res.ok) {
        setCtx(null)
        return
      }
      const data = (await res.json()) as ClientPOContext
      setCtx(data)
      onContext?.(data)
    } catch {
      setCtx(null)
    } finally {
      setLoading(false)
    }
  }, [salesOrderId, onContext])

  useEffect(() => { void load() }, [load])

  if (loading) {
    return (
      <div className="rounded-lg border border-[#1E2330] bg-[#0F1218] p-3 flex items-center gap-2">
        <Loader2 size={14} className="animate-spin text-[#FF6600]" />
        <span className="text-xs text-[#9CA3AF]">Buscando OC del cliente...</span>
      </div>
    )
  }

  if (!ctx || !ctx.has_client_po) return null

  const statusTone = STATUS_TONE[ctx.oc_status || ''] || 'default'
  const statusLabel = STATUS_LABEL[ctx.oc_status || ''] || ctx.oc_status || 'Activa'
  const hasDiscrepancies = (ctx.discrepancies_count || 0) > 0
  const confidencePct = ctx.oc_confidence != null ? Math.round((ctx.oc_confidence || 0) * 100) : null

  return (
    <div className="rounded-lg border-2 border-[#FF6600]/30 bg-gradient-to-br from-[#FF6600]/5 to-[#0F1218] p-4 space-y-3">
      {/* Header */}
      <div className="flex items-start justify-between flex-wrap gap-2">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-lg bg-[#FF6600]/10 border border-[#FF6600]/30 flex items-center justify-center shrink-0">
            <FileText size={18} className="text-[#FF6600]" />
          </div>
          <div>
            <p className="text-[10px] uppercase tracking-wider text-[#FF6600] font-semibold">
              Orden de compra del cliente
            </p>
            <div className="flex items-center gap-2 flex-wrap mt-1">
              <h3 className="text-base font-bold text-[#F0F2F5] font-mono">
                <Hash size={12} className="inline" />{ctx.oc_number}
              </h3>
              <Badge variant={statusTone} size="sm">{statusLabel}</Badge>
              {hasDiscrepancies && (
                <Badge variant="warning" size="sm">
                  <AlertTriangle size={10} className="inline" /> {ctx.discrepancies_count} discrepancias
                </Badge>
              )}
            </div>
          </div>
        </div>
        <div className="flex gap-2 shrink-0">
          {ctx.oc_pdf_url && (
            <a href={ctx.oc_pdf_url} target="_blank" rel="noopener noreferrer">
              <Button variant="secondary" size="sm">
                <ExternalLink size={11} /> Ver PDF original
              </Button>
            </a>
          )}
          <a href={`/ventas/importar-oc?focus=${ctx.oc_parsed_id}`}>
            <Button variant="secondary" size="sm">
              <FileText size={11} /> Detalles de OC
            </Button>
          </a>
        </div>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
        <Mini label="Items" value={String(ctx.items_count ?? 0)} />
        <Mini label="Confianza IA" value={confidencePct != null ? `${confidencePct}%` : '—'} tone={confidencePct != null && confidencePct >= 90 ? 'good' : 'default'} />
        <Mini
          label="Discrepancias"
          value={String(ctx.discrepancies_count ?? 0)}
          tone={hasDiscrepancies ? 'warn' : 'good'}
        />
        <Mini label="Subida" value={ctx.parsed_at ? new Date(ctx.parsed_at).toLocaleDateString('es-AR') : '—'} />
      </div>

      <div className="flex items-center gap-2 text-[11px] text-[#9CA3AF]">
        <CheckCircle2 size={12} className="text-emerald-500" />
        <span>
          Este pedido fue generado a partir de la OC del cliente. Los items y el total ya fueron
          conciliados con la cotización <code className="text-[10px] bg-[#1E2330] px-1 rounded">{ctx.matched_quote_id?.slice(0, 8)}...</code>
        </span>
      </div>
    </div>
  )
}

function Mini({ label, value, tone = 'default' }: { label: string; value: string; tone?: 'default' | 'good' | 'warn' }) {
  const toneClass = {
    default: 'text-[#F0F2F5]',
    good: 'text-emerald-400',
    warn: 'text-amber-400',
  }[tone]
  return (
    <div className="rounded bg-[#0A0D12] border border-[#1E2330] px-2 py-1.5">
      <p className="text-[9px] uppercase text-[#6B7280]">{label}</p>
      <p className={`text-sm font-mono font-semibold ${toneClass}`}>{value}</p>
    </div>
  )
}
