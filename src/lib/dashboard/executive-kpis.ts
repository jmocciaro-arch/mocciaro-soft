/**
 * Lógica de KPIs del dashboard ejecutivo con filtro de canal
 * (SPEC-dashboard-canales.md §2.2) y tabla de actividad (§2.3).
 *
 * Mapeo de la spec al modelo real de datos:
 *   - "tt_invoices"        → tt_documents con doc_type='factura'
 *   - "tt_quotes abiertas" → tt_documents con doc_type='cotizacion' en estado abierto
 *   - "tt_purchase_orders" → tt_purchase_orders (compras a proveedores)
 *
 * Regla anti doble conteo: una orden de canal con document_id ya generó
 * documento nativo, así que su importe vive en tt_documents. Para el filtro
 * "todos" se suman facturas + órdenes facturadas SIN documento; para
 * "directo" se excluyen las facturas vinculadas a órdenes de canal.
 *
 * Todo puro: recibe filas ya traídas y devuelve valores. Sin React/Supabase.
 */

import {
  bucketize, hasSparkData, sumBetween, countBetween,
  type DatedValue, type PeriodWindow,
} from './periods'

// ---------------------------------------------------------------------------
// Filtros
// ---------------------------------------------------------------------------

/** 'todos' | 'directo' | id de canal (tt_channels.id). */
export type ChannelFilter = 'todos' | 'directo' | string
export type EstadoBucket = 'cobrado' | 'abierto' | 'atencion'
export type EstadoFilter = 'todos' | EstadoBucket

export const ESTADO_OPTIONS: { value: EstadoFilter; label: string }[] = [
  { value: 'todos', label: 'Todos' },
  { value: 'cobrado', label: 'Pagada / Entregado' },
  { value: 'abierto', label: 'Abierto / En curso' },
  { value: 'atencion', label: 'Requiere atención' },
]

/** OC en curso y Alertas stock no aplican al filtro de canal: se atenúan. */
export function appliesChannelDimming(filter: ChannelFilter): boolean {
  return filter !== 'todos'
}

// ---------------------------------------------------------------------------
// Estados (dominio observado en producción + convención de canales)
// ---------------------------------------------------------------------------

export const OPEN_QUOTE_STATUSES = ['draft', 'borrador', 'sent', 'enviada', 'pending']
export const UNPAID_INVOICE_STATUSES = ['emitida', 'autorizada', 'pendiente_cobro']
export const ISSUED_INVOICE_STATUSES = [...UNPAID_INVOICE_STATUSES, 'cobrada']

/** La orden de canal cuenta como facturación: el comprador ya pagó o se despachó. */
export const CHANNEL_ORDER_BILLED_STATUSES = ['pagada', 'facturada', 'despachada', 'despachado', 'entregada', 'entregado', 'liquidada', 'cobrada']
/** Liquidada = el marketplace ya transfirió la plata. Hasta entonces, pendiente de cobro. */
export const CHANNEL_ORDER_SETTLED_STATUSES = ['liquidada', 'cobrada']
export const CHANNEL_ORDER_CANCELLED_STATUSES = ['cancelada', 'cancelled', 'anulada']

const COBRADO_STATUSES = new Set([
  'cobrada', 'cobrado', 'pagada', 'pagado', 'paid', 'liquidada',
  'entregada', 'entregado', 'delivered', 'despachada', 'despachado',
  'cerrada', 'cerrado', 'closed', 'completada', 'completado',
])
const ATENCION_STATUSES = new Set([
  'vencida', 'vencido', 'sin_stock', 'error', 'rechazada', 'rechazado',
  'cancelada', 'cancelado', 'cancelled', 'anulada', 'disputa',
  'accion_requerida', 'requiere_atencion',
])

/** Mapea un estado libre al bucket del filtro Estado (§2.1). */
export function estadoBucketFor(status: string | null | undefined): EstadoBucket {
  const s = (status ?? '').toLowerCase()
  if (COBRADO_STATUSES.has(s)) return 'cobrado'
  if (ATENCION_STATUSES.has(s)) return 'atencion'
  return 'abierto'
}

// ---------------------------------------------------------------------------
// Tipos de filas (subconjuntos de columnas que trae el hook)
// ---------------------------------------------------------------------------

export interface InvoiceLite {
  id: string
  total: number | null
  status: string
  invoice_date: string | null
  created_at: string
}

export interface ChannelOrderLite {
  id: string
  channel_id: string
  external_order_id: string
  total: number | null
  currency: string | null
  status: string
  received_at: string
  document_id: string | null
  buyer: unknown
}

export interface QuoteLite { total: number | null }
export interface StockLite { quantity: number; min_quantity: number; reserved: number }

const invoiceDate = (inv: InvoiceLite) => inv.invoice_date ?? inv.created_at
const isCancelled = (o: ChannelOrderLite) => CHANNEL_ORDER_CANCELLED_STATUSES.includes(o.status)
const isBilled = (o: ChannelOrderLite) =>
  !isCancelled(o) && (o.document_id !== null || CHANNEL_ORDER_BILLED_STATUSES.includes(o.status))
const isUnsettled = (o: ChannelOrderLite) =>
  !isCancelled(o) && !CHANNEL_ORDER_SETTLED_STATUSES.includes(o.status)

function channelDocIds(orders: ChannelOrderLite[]): Set<string> {
  const ids = new Set<string>()
  for (const o of orders) if (o.document_id) ids.add(o.document_id)
  return ids
}

// ---------------------------------------------------------------------------
// KPIs
// ---------------------------------------------------------------------------

export interface KpiMoney {
  value: number
  prev: number
  /** null = sin datos suficientes → la sparkline se oculta. */
  spark: number[] | null
}

/** Facturación: recalcula con filtro de canal (facturas + órdenes facturadas). */
export function kpiFacturacion(
  invoices: InvoiceLite[],
  orders: ChannelOrderLite[],
  filter: ChannelFilter,
  win: PeriodWindow,
): KpiMoney {
  let rows: DatedValue[]
  if (filter === 'todos') {
    const fromInvoices = invoices.map(i => ({ date: invoiceDate(i), value: Number(i.total || 0) }))
    const fromOrders = orders
      .filter(o => isBilled(o) && o.document_id === null)
      .map(o => ({ date: o.received_at, value: Number(o.total || 0) }))
    rows = [...fromInvoices, ...fromOrders]
  } else if (filter === 'directo') {
    const linked = channelDocIds(orders)
    rows = invoices.filter(i => !linked.has(i.id)).map(i => ({ date: invoiceDate(i), value: Number(i.total || 0) }))
  } else {
    rows = orders
      .filter(o => o.channel_id === filter && isBilled(o))
      .map(o => ({ date: o.received_at, value: Number(o.total || 0) }))
  }
  const spark = bucketize(rows, win)
  return {
    value: sumBetween(rows, win.from, win.to),
    prev: sumBetween(rows, win.prevFrom, win.from),
    spark: hasSparkData(spark) ? spark : null,
  }
}

/** Pipeline: cotizaciones abiertas. Las cotizaciones son del canal directo → marketplace = 0. */
export function kpiPipeline(openQuotes: QuoteLite[], filter: ChannelFilter): { value: number; count: number } {
  if (filter !== 'todos' && filter !== 'directo') return { value: 0, count: 0 }
  return {
    value: openQuotes.reduce((s, q) => s + Number(q.total || 0), 0),
    count: openQuotes.length,
  }
}

/** Pendiente cobro: facturas impagas; con canal: órdenes sin liquidar por el marketplace. */
export function kpiPendienteCobro(
  unpaidInvoices: InvoiceLite[],
  unsettledOrders: ChannelOrderLite[],
  filter: ChannelFilter,
  now: Date = new Date(),
): { value: number; count: number; overdue: number } {
  const overdueLimit = now.getTime() - 30 * 86_400_000
  if (filter === 'todos' || filter === 'directo') {
    const linked = channelDocIds(unsettledOrders)
    const invoices = filter === 'directo'
      ? unpaidInvoices.filter(i => !linked.has(i.id))
      : unpaidInvoices
    let value = invoices.reduce((s, i) => s + Number(i.total || 0), 0)
    let count = invoices.length
    if (filter === 'todos') {
      // Órdenes sin liquidar que todavía no generaron factura nativa
      const pending = unsettledOrders.filter(o => isUnsettled(o) && o.document_id === null)
      value += pending.reduce((s, o) => s + Number(o.total || 0), 0)
      count += pending.length
    }
    const overdue = invoices.filter(i => new Date(invoiceDate(i)).getTime() < overdueLimit).length
    return { value, count, overdue }
  }
  const pending = unsettledOrders.filter(o => o.channel_id === filter && isUnsettled(o))
  return {
    value: pending.reduce((s, o) => s + Number(o.total || 0), 0),
    count: pending.length,
    overdue: 0,
  }
}

/** Órdenes marketplace: count de tt_channel_orders por período/canal. Directo = 0. */
export function kpiOrdenesMarketplace(
  orders: ChannelOrderLite[],
  filter: ChannelFilter,
  win: PeriodWindow,
  channelLabels: Record<string, string>,
): KpiMoney & { mix: string } {
  if (filter === 'directo') return { value: 0, prev: 0, spark: null, mix: 'sin órdenes en este canal' }
  const source = orders.filter(o => !isCancelled(o) && (filter === 'todos' || o.channel_id === filter))
  const rows: DatedValue[] = source.map(o => ({ date: o.received_at, value: 1 }))
  const spark = bucketize(rows, win)

  let mix: string
  if (filter === 'todos') {
    const byChannel = new Map<string, number>()
    for (const o of source) {
      const t = new Date(o.received_at).getTime()
      if (t >= win.from.getTime() && t <= win.to.getTime()) {
        byChannel.set(o.channel_id, (byChannel.get(o.channel_id) || 0) + 1)
      }
    }
    mix = Array.from(byChannel.entries())
      .sort((a, b) => b[1] - a[1])
      .map(([id, n]) => `${channelLabels[id] ?? 'Canal'} ${n}`)
      .join(' · ') || 'sin órdenes en el período'
  } else {
    mix = channelLabels[filter] ?? 'Canal'
  }

  return {
    value: countBetween(rows, win.from, win.to),
    prev: countBetween(rows, win.prevFrom, win.from),
    spark: hasSparkData(spark) ? spark : null,
    mix,
  }
}

/** OC en curso: compras abiertas a proveedores (el hook ya filtra estados cerrados). */
export function kpiOcEnCurso(purchaseOrders: { total: number | null }[]): { count: number; committed: number } {
  return {
    count: purchaseOrders.length,
    committed: purchaseOrders.reduce((s, po) => s + Number(po.total || 0), 0),
  }
}

/**
 * Alertas de stock contra mínimos (solo filas con mínimo definido).
 * Bajo mínimo: quantity <= min_quantity. Crítico: además, el disponible
 * (quantity - reserved) está agotado.
 */
export function stockAlerts(rows: StockLite[]): { low: number; critical: number } {
  let low = 0
  let critical = 0
  for (const r of rows) {
    if (r.min_quantity > 0 && r.quantity <= r.min_quantity) {
      low++
      if (r.quantity - r.reserved <= 0) critical++
    }
  }
  return { low, critical }
}

/** Trend chip vs período anterior. Sin base de comparación → null (no inventar). */
export function trendFrom(current: number, prev: number): { dir: 'up' | 'down' | 'flat'; label: string } | null {
  if (prev <= 0) return null
  const pct = ((current - prev) / prev) * 100
  if (Math.abs(pct) < 1) return { dir: 'flat', label: '=' }
  return { dir: pct > 0 ? 'up' : 'down', label: `${pct > 0 ? '▲' : '▼'} ${Math.abs(pct).toFixed(0)}%` }
}

// ---------------------------------------------------------------------------
// Tabla de actividad (§2.3): unión tt_document_events + tt_channel_orders
// ---------------------------------------------------------------------------

export interface ActivityEventRow {
  id: string
  event_type: string
  created_at: string
  to_status: string | null
  document: {
    doc_code: string | null
    counterparty_name: string | null
    total: number | null
    currency: string | null
    status: string | null
    doc_type: string
  } | null
}

export interface ActivityItem {
  id: string
  ts: string
  code: string
  party: string
  total: number | null
  currency: string | null
  status: string
  estado: EstadoBucket
  origin: string
  /** 'directo' o tt_channels.id — para el filtro de canal en cliente. */
  channelKey: 'directo' | string
}

function buyerName(buyer: unknown): string {
  if (buyer && typeof buyer === 'object') {
    const b = buyer as Record<string, unknown>
    for (const key of ['name', 'nickname', 'full_name']) {
      const v = b[key]
      if (typeof v === 'string' && v.length > 0) return v
    }
  }
  return 'Comprador'
}

export function buildActivity(
  events: ActivityEventRow[],
  orders: ChannelOrderLite[],
  channelLabels: Record<string, string>,
  limit = 30,
): ActivityItem[] {
  const fromEvents: ActivityItem[] = events
    .filter(e => e.document !== null)
    .map(e => ({
      id: `ev-${e.id}`,
      ts: e.created_at,
      code: e.document?.doc_code ?? e.document?.doc_type ?? '—',
      party: e.document?.counterparty_name ?? '—',
      total: e.document?.total ?? null,
      currency: e.document?.currency ?? null,
      status: e.to_status ?? e.document?.status ?? e.event_type,
      estado: estadoBucketFor(e.to_status ?? e.document?.status),
      origin: 'Directo',
      channelKey: 'directo',
    }))
  const fromOrders: ActivityItem[] = orders.map(o => ({
    id: `ch-${o.id}`,
    ts: o.received_at,
    code: o.external_order_id,
    party: buyerName(o.buyer),
    total: o.total,
    currency: o.currency,
    status: o.status,
    estado: estadoBucketFor(o.status),
    origin: channelLabels[o.channel_id] ?? 'Canal',
    channelKey: o.channel_id,
  }))
  return [...fromEvents, ...fromOrders]
    .sort((a, b) => b.ts.localeCompare(a.ts))
    .slice(0, limit)
}

/** Filtro en cliente por canal y estado, para el contador "X de N". */
export function filterActivity(items: ActivityItem[], canal: ChannelFilter, estado: EstadoFilter): ActivityItem[] {
  return items.filter(i =>
    (canal === 'todos' || i.channelKey === canal) &&
    (estado === 'todos' || i.estado === estado),
  )
}
