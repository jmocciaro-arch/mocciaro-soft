'use client'

/**
 * Panel de reservas de stock para un documento (típicamente un pedido).
 * Muestra:
 *   - Resumen de items (pedidos / reservados / shortfall) por línea.
 *   - Lista detallada de reservas activas + consumidas + liberadas.
 *   - Stock disponible actual en el warehouse.
 *
 * Si v54 no está aplicada o no hay reservas, se renderiza vacío sin
 * crashear (la API devuelve warning).
 */

import { useEffect, useState, useCallback } from 'react'
import { Loader2, Package, CheckCircle2, AlertTriangle, RefreshCw, XCircle } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'

interface DocumentItemRow {
  item_id: string
  product_id: string | null
  sku: string | null
  name: string | null
  requested: number
  reserved: number
  shortfall: number
  available_now: number
}

interface ReservationRow {
  id: string
  product_id: string
  product_sku: string | null
  product_name: string | null
  warehouse_code: string | null
  warehouse_name: string | null
  quantity: number
  status: 'active' | 'consumed' | 'released' | 'cancelled'
  notes: string | null
  consumed_at: string | null
  released_at: string | null
  created_at: string
  stock_quantity: number | null
  stock_available: number | null
}

interface PanelData {
  reservations: ReservationRow[]
  summary: { active: number; consumed: number; released: number; cancelled: number }
  document_items: DocumentItemRow[]
  warning?: string
}

const STATUS_LABEL: Record<string, string> = {
  active: 'Activa',
  consumed: 'Consumida',
  released: 'Liberada',
  cancelled: 'Cancelada',
}
const STATUS_TONE: Record<string, 'success' | 'info' | 'warning' | 'default'> = {
  active: 'success',
  consumed: 'info',
  released: 'warning',
  cancelled: 'default',
}

interface Props {
  documentId: string
  documentType?: string
  /** Si true, renderiza un botón para refrescar manualmente (default true) */
  showRefresh?: boolean
}

export function StockReservationsPanel({ documentId, documentType, showRefresh = true }: Props) {
  const [data, setData] = useState<PanelData | null>(null)
  const [loading, setLoading] = useState(true)
  const [showHistory, setShowHistory] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch(`/api/documents/${documentId}/stock-reservations`)
      const j = await res.json()
      if (res.ok) setData(j as PanelData)
      else setData(null)
    } finally {
      setLoading(false)
    }
  }, [documentId])

  useEffect(() => { void load() }, [load])

  // Solo aplicable a pedidos (los albaranes ya consumieron las reservas)
  const isApplicable =
    documentType === 'pedido' ||
    documentType === 'sales_order' ||
    documentType === 'orden_venta' ||
    !documentType // si no se sabe el tipo, mostrar igual

  if (!isApplicable) return null

  if (loading) {
    return (
      <div className="rounded-lg border border-[#1E2330] bg-[#0F1218] p-4 flex items-center gap-3">
        <Loader2 size={16} className="animate-spin text-[#FF6600]" />
        <span className="text-sm text-[#9CA3AF]">Cargando reservas de stock...</span>
      </div>
    )
  }

  if (!data) return null

  const hasNoReservations = data.summary.active + data.summary.consumed + data.summary.released + data.summary.cancelled === 0
  const hasShortfall = data.document_items.some((it) => it.shortfall > 0)
  const totalRequested = data.document_items.reduce((s, it) => s + it.requested, 0)
  const totalReserved = data.document_items.reduce((s, it) => s + it.reserved, 0)

  // Si la migración v54 no está aplicada, mostrar warning suave
  if (data.warning) {
    return (
      <div className="rounded-lg border border-amber-500/30 bg-amber-500/5 p-3">
        <div className="flex items-center gap-2">
          <AlertTriangle size={14} className="text-amber-400" />
          <span className="text-xs text-amber-300">Sistema de reservas no disponible: {data.warning}</span>
        </div>
      </div>
    )
  }

  return (
    <div className="rounded-lg border border-[#1E2330] bg-[#0F1218] p-4 space-y-3">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div className="flex items-center gap-2">
          <Package size={14} className="text-[#FF6600]" />
          <span className="text-xs font-semibold uppercase tracking-wider text-[#FF6600]">
            Reservas de stock
          </span>
        </div>
        {showRefresh && (
          <Button variant="secondary" size="sm" onClick={load}>
            <RefreshCw size={11} /> Refrescar
          </Button>
        )}
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
        <Kpi label="Solicitado" value={totalRequested} tone="default" />
        <Kpi label="Reservado" value={totalReserved} tone="success" />
        <Kpi
          label="Faltante"
          value={Math.max(0, totalRequested - totalReserved)}
          tone={hasShortfall ? 'danger' : 'default'}
        />
        <Kpi label="Reservas activas" value={data.summary.active} tone="info" />
      </div>

      {/* Tabla de items con shortfall */}
      {data.document_items.length > 0 && (
        <div className="rounded border border-[#1E2330] bg-[#0A0D12] overflow-hidden">
          <table className="w-full text-xs">
            <thead className="bg-[#141820] border-b border-[#1E2330] text-[10px] uppercase text-[#6B7280]">
              <tr>
                <th className="px-2 py-1.5 text-left">SKU</th>
                <th className="px-2 py-1.5 text-left">Producto</th>
                <th className="px-2 py-1.5 text-right">Pedido</th>
                <th className="px-2 py-1.5 text-right">Reservado</th>
                <th className="px-2 py-1.5 text-right">Falta</th>
                <th className="px-2 py-1.5 text-right">Disponible</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#1E2330]">
              {data.document_items.map((it) => (
                <tr key={it.item_id} className={it.shortfall > 0 ? 'bg-red-500/5' : ''}>
                  <td className="px-2 py-1.5 font-mono text-[#FF6600]">{it.sku || '—'}</td>
                  <td className="px-2 py-1.5 text-[#F0F2F5] truncate max-w-[280px]">{it.name || '—'}</td>
                  <td className="px-2 py-1.5 text-right font-mono">{it.requested}</td>
                  <td className="px-2 py-1.5 text-right font-mono text-emerald-400">{it.reserved}</td>
                  <td className="px-2 py-1.5 text-right font-mono">
                    {it.shortfall > 0 ? (
                      <span className="text-red-400 font-semibold">{it.shortfall}</span>
                    ) : (
                      <CheckCircle2 size={12} className="inline text-emerald-500" />
                    )}
                  </td>
                  <td className="px-2 py-1.5 text-right font-mono text-[#9CA3AF]">{it.available_now}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Mensaje si no hay reservas (pedido aún sin confirmar o legacy) */}
      {hasNoReservations && (
        <div className="rounded border border-dashed border-[#2A3040] bg-[#0A0D12] p-3 text-center">
          <p className="text-xs text-[#6B7280]">
            Sin reservas activas. Las reservas se crean automáticamente al
            derivar este documento desde una cotización.
          </p>
        </div>
      )}

      {/* Toggle historial completo */}
      {data.reservations.length > 0 && (
        <div>
          <button
            onClick={() => setShowHistory((v) => !v)}
            className="text-xs text-[#FF6600] hover:text-[#FF8833]"
          >
            {showHistory ? 'Ocultar' : 'Mostrar'} historial de reservas ({data.reservations.length})
          </button>
        </div>
      )}

      {showHistory && data.reservations.length > 0 && (
        <div className="rounded border border-[#1E2330] bg-[#0A0D12] divide-y divide-[#1E2330]">
          {data.reservations.map((r) => (
            <div key={r.id} className="p-2 flex items-center justify-between gap-3">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="font-mono text-xs text-[#FF6600]">{r.product_sku || '?'}</span>
                  <span className="text-xs text-[#F0F2F5] truncate">{r.product_name || '—'}</span>
                  <Badge variant={STATUS_TONE[r.status] || 'default'} size="sm">
                    {STATUS_LABEL[r.status] || r.status}
                  </Badge>
                </div>
                <div className="text-[10px] text-[#6B7280] mt-0.5 flex items-center gap-2">
                  <span>{r.warehouse_code || r.warehouse_name || 'sin almacén'}</span>
                  <span>·</span>
                  <span>{new Date(r.created_at).toLocaleString('es-AR')}</span>
                  {r.notes && <><span>·</span><span className="italic">{r.notes}</span></>}
                </div>
              </div>
              <div className="text-right shrink-0">
                <p className="text-sm font-mono font-semibold text-emerald-400">{r.quantity}</p>
                {r.stock_available != null && (
                  <p className="text-[10px] text-[#6B7280]">disp: {r.stock_available}</p>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

function Kpi({ label, value, tone }: { label: string; value: number; tone: 'default' | 'success' | 'info' | 'danger' }) {
  const toneClass = {
    default: 'text-[#F0F2F5]',
    success: 'text-emerald-400',
    info: 'text-blue-400',
    danger: 'text-red-400',
  }[tone]
  const Icon = tone === 'danger' ? XCircle : tone === 'success' ? CheckCircle2 : Package
  return (
    <div className="rounded bg-[#141820] border border-[#1E2330] p-2">
      <div className="flex items-center gap-1 text-[10px] uppercase text-[#6B7280]">
        <Icon size={10} />
        {label}
      </div>
      <p className={`text-lg font-bold font-mono ${toneClass} mt-0.5`}>{value}</p>
    </div>
  )
}
