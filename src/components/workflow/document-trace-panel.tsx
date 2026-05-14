'use client'

/**
 * DocumentTracePanel — FASE 1.3
 *
 * Panel lateral con el linaje completo del documento:
 *   COT ← PED ← REM[*] ← FAC[*] ← Pago[*]
 *
 * Pensado para embeber en la columna derecha de la vista detalle de
 * presupuestos/pedidos/albaranes/facturas.
 *
 * Click en cada nodo navega al documento correspondiente (la app
 * de /ventas se ocupa de mostrar el detalle según el doc_type).
 */

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { buildDocumentTrace, type DocumentTrace, type TraceNode } from '@/lib/document-trace'
import { formatCurrency, formatDate } from '@/lib/utils'
import {
  FileText, ClipboardList, Truck, FileCheck, CreditCard,
  ChevronRight, Loader2,
} from 'lucide-react'

export interface DocumentTracePanelProps {
  docId: string
  source: 'quote' | 'sales_order' | 'delivery_note' | 'invoice' | 'tt_documents'
  /** Optional: callback para navegar in-app sin hacer router.push. */
  onNodeClick?: (node: TraceNode) => void
}

const NODE_ICONS = {
  quote: FileText,
  order: ClipboardList,
  delivery: Truck,
  invoice: FileCheck,
  payment: CreditCard,
} as const

const NODE_COLORS = {
  quote: '#3B82F6',
  order: '#FF6600',
  delivery: '#8B5CF6',
  invoice: '#10B981',
  payment: '#F59E0B',
} as const

export function DocumentTracePanel({ docId, source, onNodeClick }: DocumentTracePanelProps) {
  const router = useRouter()
  const [trace, setTrace] = useState<DocumentTrace | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    buildDocumentTrace({ docId, source })
      .then((t) => {
        if (!cancelled) setTrace(t)
      })
      .catch(() => {
        if (!cancelled) setTrace(null)
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => { cancelled = true }
  }, [docId, source])

  function handleClick(node: TraceNode) {
    if (onNodeClick) {
      onNodeClick(node)
      return
    }
    // Default: navegar a /ventas con el tab correspondiente
    const tabMap: Record<string, string> = {
      tt_quotes: 'presupuestos',
      tt_sales_orders: 'pedidos',
      tt_delivery_notes: 'albaranes',
      tt_invoices: 'facturas',
      tt_payments: 'cobros',
    }
    const tab = tabMap[node.source] || 'presupuestos'
    router.push(`/ventas?tab=${tab}&highlight=${node.id}`)
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-8">
        <Loader2 className="animate-spin text-[#FF6600]" size={20} />
      </div>
    )
  }

  if (!trace) {
    return (
      <div className="text-xs text-[#6B7280] text-center py-4">
        No se pudo cargar la trazabilidad.
      </div>
    )
  }

  return (
    <div className="space-y-3">
      <div className="text-xs font-semibold text-[#9CA3AF] uppercase tracking-wider">
        Trazabilidad del documento
      </div>

      {/* Cotización */}
      {trace.quote && (
        <TraceItem
          icon={NODE_ICONS.quote}
          color={NODE_COLORS.quote}
          label="Cotización"
          ref={trace.quote.ref}
          status={trace.quote.status}
          date={trace.quote.created_at}
          subtitle={
            trace.quote.total
              ? formatCurrency(trace.quote.total, (trace.quote.currency as 'EUR' | 'ARS' | 'USD') || 'EUR')
              : undefined
          }
          onClick={() => trace.quote && handleClick(trace.quote)}
        />
      )}

      {trace.quote && trace.order && <Connector />}

      {/* Pedido */}
      {trace.order && (
        <TraceItem
          icon={NODE_ICONS.order}
          color={NODE_COLORS.order}
          label="Pedido"
          ref={trace.order.ref}
          status={trace.order.status}
          date={trace.order.created_at}
          subtitle={
            trace.order.total
              ? formatCurrency(trace.order.total, (trace.order.currency as 'EUR' | 'ARS' | 'USD') || 'EUR')
              : undefined
          }
          onClick={() => trace.order && handleClick(trace.order)}
        />
      )}

      {trace.order && trace.delivery_notes.length > 0 && <Connector />}

      {/* Remitos */}
      {trace.delivery_notes.length > 0 && (
        <div className="space-y-1.5">
          <div className="text-[10px] text-[#6B7280] pl-1">
            {trace.delivery_notes.length} remito(s)
          </div>
          {trace.delivery_notes.map((dn) => (
            <TraceItem
              key={dn.id}
              icon={NODE_ICONS.delivery}
              color={NODE_COLORS.delivery}
              label="Remito"
              ref={dn.ref}
              status={dn.status}
              date={dn.created_at}
              onClick={() => handleClick(dn)}
              compact
            />
          ))}
        </div>
      )}

      {trace.delivery_notes.length > 0 && trace.invoices.length > 0 && <Connector />}

      {/* Facturas */}
      {trace.invoices.length > 0 && (
        <div className="space-y-1.5">
          <div className="text-[10px] text-[#6B7280] pl-1">
            {trace.invoices.length} factura(s)
          </div>
          {trace.invoices.map((inv) => (
            <TraceItem
              key={inv.id}
              icon={NODE_ICONS.invoice}
              color={NODE_COLORS.invoice}
              label="Factura"
              ref={inv.ref}
              status={inv.status}
              date={inv.created_at}
              subtitle={
                inv.total !== null && inv.total !== undefined
                  ? `${formatCurrency(inv.total, (inv.currency as 'EUR' | 'ARS' | 'USD') || 'EUR')} ${
                      (inv.outstanding ?? 0) > 0
                        ? `— Pendiente ${formatCurrency(inv.outstanding ?? 0, (inv.currency as 'EUR' | 'ARS' | 'USD') || 'EUR')}`
                        : '— pagada'
                    }`
                  : undefined
              }
              onClick={() => handleClick(inv)}
              compact
            />
          ))}
        </div>
      )}

      {trace.invoices.length > 0 && trace.payments.length > 0 && <Connector />}

      {/* Cobros */}
      {trace.payments.length > 0 && (
        <div className="space-y-1.5">
          <div className="text-[10px] text-[#6B7280] pl-1">
            {trace.payments.length} cobro(s)
          </div>
          {trace.payments.map((p) => (
            <TraceItem
              key={p.id}
              icon={NODE_ICONS.payment}
              color={NODE_COLORS.payment}
              label="Cobro"
              ref={p.method || ''}
              status={null}
              date={p.payment_date}
              subtitle={p.amount ? formatCurrency(p.amount, 'EUR') : undefined}
              onClick={() => handleClick(p)}
              compact
            />
          ))}
        </div>
      )}

      {/* Empty state */}
      {!trace.quote &&
        !trace.order &&
        trace.delivery_notes.length === 0 &&
        trace.invoices.length === 0 && (
          <div className="text-xs text-[#6B7280] py-2">
            Sin documentos vinculados todavía.
          </div>
        )}
    </div>
  )
}

interface TraceItemProps {
  icon: typeof FileText
  color: string
  label: string
  ref: string
  status: string | null
  date: string | null | undefined
  subtitle?: string
  onClick: () => void
  compact?: boolean
}

function TraceItem({ icon: Icon, color, label, ref, status, date, subtitle, onClick, compact }: TraceItemProps) {
  return (
    <button
      onClick={onClick}
      className={`w-full flex items-center gap-3 ${compact ? 'p-2' : 'p-3'} bg-[#0B0E13] hover:bg-[#1C2230] border border-[#1E2330] rounded-lg text-left transition-colors group`}
    >
      <div
        className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0"
        style={{ backgroundColor: `${color}20` }}
      >
        <Icon size={14} style={{ color }} />
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className="text-[10px] uppercase tracking-wider text-[#6B7280]">{label}</span>
          {status && (
            <span
              className="text-[9px] font-semibold px-1.5 py-0.5 rounded-full"
              style={{ color, backgroundColor: `${color}15` }}
            >
              {status}
            </span>
          )}
        </div>
        <div className="text-sm font-medium text-[#F0F2F5] truncate">{ref || '—'}</div>
        {subtitle && (
          <div className="text-[10px] text-[#9CA3AF] truncate">{subtitle}</div>
        )}
        {date && (
          <div className="text-[10px] text-[#4B5563]">{formatDate(date)}</div>
        )}
      </div>
      <ChevronRight size={14} className="text-[#4B5563] group-hover:text-[#FF6600] shrink-0" />
    </button>
  )
}

function Connector() {
  return (
    <div className="flex justify-center -my-1">
      <div className="w-px h-3 bg-[#2A3040]" />
    </div>
  )
}
