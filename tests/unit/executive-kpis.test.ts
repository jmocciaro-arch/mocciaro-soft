import { describe, it, expect } from 'vitest'
import { periodWindow } from '@/lib/dashboard/periods'
import {
  kpiFacturacion, kpiPipeline, kpiPendienteCobro, kpiOrdenesMarketplace,
  kpiOcEnCurso, stockAlerts, trendFrom, appliesChannelDimming,
  estadoBucketFor, buildActivity, filterActivity,
  type InvoiceLite, type ChannelOrderLite,
} from '@/lib/dashboard/executive-kpis'

const NOW = new Date('2026-06-10T15:00:00.000Z')
const DAY = 86_400_000
const WIN = periodWindow('d30', NOW)

const daysAgo = (n: number) => new Date(NOW.getTime() - n * DAY).toISOString()

function invoice(over: Partial<InvoiceLite> = {}): InvoiceLite {
  return { id: 'inv-1', total: 100, status: 'emitida', invoice_date: daysAgo(5), created_at: daysAgo(5), ...over }
}

function order(over: Partial<ChannelOrderLite> = {}): ChannelOrderLite {
  return {
    id: 'ord-1', channel_id: 'ml', external_order_id: '88412', total: 50, currency: 'ARS',
    status: 'shipped', received_at: daysAgo(3), document_id: null, buyer: { name: 'Comprador ML' },
    ...over,
  }
}

const LABELS = { ml: 'MercadoLibre', ebay: 'eBay' }

describe('kpiFacturacion (spec §2.2: recalcula con filtro de canal)', () => {
  const invoices = [
    invoice({ id: 'i1', total: 1000, invoice_date: daysAgo(5) }),
    invoice({ id: 'i2', total: 500, invoice_date: daysAgo(40) }), // período anterior
    invoice({ id: 'i-canal', total: 200, invoice_date: daysAgo(2) }), // generada desde una orden ML
  ]
  const orders = [
    order({ id: 'o1', total: 200, document_id: 'i-canal', status: 'shipped' }),
    order({ id: 'o2', total: 300, status: 'shipped' }), // facturada por el canal, sin documento nativo aún
    order({ id: 'o3', total: 999, status: 'cancelled' }),
    order({ id: 'o4', channel_id: 'ebay', total: 80, status: 'delivered' }),
  ]

  it('todos: facturas + órdenes facturadas sin documento (sin doble conteo)', () => {
    const r = kpiFacturacion(invoices, orders, 'todos', WIN)
    // 1000 + 200 (factura del canal) + 300 (o2 sin doc) + 80 (ebay) — o1 NO se suma aparte
    expect(r.value).toBe(1580)
    expect(r.prev).toBe(500)
  })

  it('directo: excluye las facturas vinculadas a órdenes de canal', () => {
    const r = kpiFacturacion(invoices, orders, 'directo', WIN)
    expect(r.value).toBe(1000)
  })

  it('canal específico: solo las órdenes facturadas de ese canal', () => {
    expect(kpiFacturacion(invoices, orders, 'ml', WIN).value).toBe(500) // o1 (200) + o2 (300)
    expect(kpiFacturacion(invoices, orders, 'ebay', WIN).value).toBe(80)
  })

  it('las canceladas nunca cuentan', () => {
    const r = kpiFacturacion([], [order({ status: 'cancelled', total: 999 })], 'ml', WIN)
    expect(r.value).toBe(0)
  })

  it('sin datos suficientes la sparkline es null, nunca inventada', () => {
    const r = kpiFacturacion([invoice({ total: 10 })], [], 'todos', WIN)
    expect(r.spark).toBeNull()
  })
})

describe('kpiPipeline (directo=cotizaciones, canal marketplace=0)', () => {
  const quotes = [{ total: 100 }, { total: 250 }]
  it('todos y directo suman cotizaciones abiertas', () => {
    expect(kpiPipeline(quotes, 'todos')).toEqual({ value: 350, count: 2 })
    expect(kpiPipeline(quotes, 'directo')).toEqual({ value: 350, count: 2 })
  })
  it('canal marketplace → 0', () => {
    expect(kpiPipeline(quotes, 'ml')).toEqual({ value: 0, count: 0 })
  })
})

describe('kpiPendienteCobro', () => {
  const unpaid = [
    invoice({ id: 'i1', total: 100, invoice_date: daysAgo(5) }),
    invoice({ id: 'i2', total: 200, invoice_date: daysAgo(45) }), // vencida (>30 días)
    invoice({ id: 'i-canal', total: 50, invoice_date: daysAgo(2) }),
  ]
  const unsettled = [
    order({ id: 'o1', total: 50, document_id: 'i-canal', status: 'shipped' }), // con doc nativo: el pendiente vive en la factura
    order({ id: 'o2', total: 70, status: 'shipped' }),
    order({ id: 'o3', channel_id: 'ebay', total: 30, status: 'preparing' }),
  ]

  it('todos: impagas + órdenes sin liquidar sin documento', () => {
    const r = kpiPendienteCobro(unpaid, unsettled, 'todos', NOW)
    expect(r.value).toBe(450) // 350 facturas + 70 + 30
    expect(r.overdue).toBe(1)
  })

  it('directo: solo facturas no vinculadas a canal', () => {
    expect(kpiPendienteCobro(unpaid, unsettled, 'directo', NOW).value).toBe(300)
  })

  it('canal: órdenes sin liquidar de ese canal', () => {
    const r = kpiPendienteCobro(unpaid, unsettled, 'ml', NOW)
    expect(r.value).toBe(70) // solo o2: o1 ya tiene documento nativo
    expect(r.count).toBe(1)
  })
})

describe('kpiOrdenesMarketplace', () => {
  const orders = [
    order({ id: 'o1', received_at: daysAgo(2) }),
    order({ id: 'o2', received_at: daysAgo(10) }),
    order({ id: 'o3', received_at: daysAgo(40) }), // período anterior
    order({ id: 'o4', channel_id: 'ebay', received_at: daysAgo(1) }),
    order({ id: 'o5', status: 'cancelled', received_at: daysAgo(1) }),
  ]

  it('todos: count del período con mix por canal', () => {
    const r = kpiOrdenesMarketplace(orders, 'todos', WIN, LABELS)
    expect(r.value).toBe(3)
    expect(r.prev).toBe(1)
    expect(r.mix).toBe('MercadoLibre 2 · eBay 1')
  })

  it('canal específico: solo ese canal', () => {
    expect(kpiOrdenesMarketplace(orders, 'ebay', WIN, LABELS).value).toBe(1)
  })

  it('directo: 0 órdenes', () => {
    const r = kpiOrdenesMarketplace(orders, 'directo', WIN, LABELS)
    expect(r.value).toBe(0)
    expect(r.spark).toBeNull()
  })
})

describe('OC en curso y Alertas stock se atenúan con filtro de canal', () => {
  it('appliesChannelDimming', () => {
    expect(appliesChannelDimming('todos')).toBe(false)
    expect(appliesChannelDimming('directo')).toBe(true)
    expect(appliesChannelDimming('ml')).toBe(true)
  })

  it('kpiOcEnCurso suma lo comprometido', () => {
    expect(kpiOcEnCurso([{ total: 100 }, { total: 50 }, { total: null }])).toEqual({ count: 3, committed: 150 })
  })

  it('stockAlerts: bajo mínimo y crítico (disponible agotado)', () => {
    const r = stockAlerts([
      { quantity: 4, min_quantity: 10, reserved: 2 },  // bajo
      { quantity: 2, min_quantity: 6, reserved: 2 },   // bajo + crítico (disponible 0)
      { quantity: 50, min_quantity: 10, reserved: 0 }, // ok
      { quantity: 0, min_quantity: 0, reserved: 0 },   // sin mínimo definido → no alerta
    ])
    expect(r).toEqual({ low: 2, critical: 1 })
  })
})

describe('trendFrom', () => {
  it('sin base de comparación → null (no inventar)', () => {
    expect(trendFrom(100, 0)).toBeNull()
  })
  it('sube, baja y plano', () => {
    expect(trendFrom(112, 100)).toEqual({ dir: 'up', label: '▲ 12%' })
    expect(trendFrom(88, 100)).toEqual({ dir: 'down', label: '▼ 12%' })
    expect(trendFrom(100.5, 100)).toEqual({ dir: 'flat', label: '=' })
  })
})

describe('actividad (§2.3): unión de eventos + órdenes de canal', () => {
  const events = [
    {
      id: 'e1', event_type: 'issued', created_at: daysAgo(1), to_status: 'emitida',
      document: { doc_code: 'FAC-2026-0891', counterparty_name: 'Mirgor', total: 12180, currency: 'USD', status: 'emitida', doc_type: 'factura' },
    },
    { id: 'e2', event_type: 'created', created_at: daysAgo(2), to_status: null, document: null }, // sin doc → fuera
  ]
  const orders = [order({ id: 'o1', received_at: daysAgo(0.5), status: 'shipped' })]

  it('mezcla, ordena descendente y etiqueta origen', () => {
    const items = buildActivity(events, orders, LABELS)
    expect(items).toHaveLength(2)
    expect(items[0].id).toBe('ch-o1')
    expect(items[0].origin).toBe('MercadoLibre')
    expect(items[0].party).toBe('Comprador ML')
    expect(items[1].code).toBe('FAC-2026-0891')
    expect(items[1].channelKey).toBe('directo')
  })

  it('filtra por canal y estado para el contador "X de N"', () => {
    const items = buildActivity(events, orders, LABELS)
    expect(filterActivity(items, 'ml', 'todos')).toHaveLength(1)
    expect(filterActivity(items, 'directo', 'todos')).toHaveLength(1)
    expect(filterActivity(items, 'todos', 'cobrado')).toHaveLength(1) // la orden despachada
    expect(filterActivity(items, 'todos', 'atencion')).toHaveLength(0)
  })

  it('estadoBucketFor mapea estados libres a los 3 buckets del filtro', () => {
    expect(estadoBucketFor('pagada')).toBe('cobrado')
    expect(estadoBucketFor('entregado')).toBe('cobrado')
    expect(estadoBucketFor('shipped')).toBe('cobrado')
    expect(estadoBucketFor('delivered')).toBe('cobrado')
    expect(estadoBucketFor('sin_stock')).toBe('atencion')
    expect(estadoBucketFor('action_required')).toBe('atencion')
    expect(estadoBucketFor('vencida')).toBe('atencion')
    expect(estadoBucketFor('preparing')).toBe('abierto')
    expect(estadoBucketFor('enviada')).toBe('abierto')
    expect(estadoBucketFor(null)).toBe('abierto')
  })
})
