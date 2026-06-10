'use client'

import { useState, useEffect, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useCompanyFilter } from '@/hooks/use-company-filter'
import { periodWindow, type PeriodKey } from '@/lib/dashboard/periods'
import {
  ISSUED_INVOICE_STATUSES, UNPAID_INVOICE_STATUSES, OPEN_QUOTE_STATUSES,
  type InvoiceLite, type ChannelOrderLite, type QuoteLite, type StockLite,
  type ActivityEventRow,
} from '@/lib/dashboard/executive-kpis'

export interface ExecutiveKpisRaw {
  /** Facturas emitidas/cobradas dentro de la ventana de sparkline (8 períodos). */
  invoices: InvoiceLite[]
  /** Facturas impagas (point-in-time, sin recorte de fecha). */
  unpaidInvoices: InvoiceLite[]
  /** Cotizaciones abiertas (point-in-time). */
  openQuotes: QuoteLite[]
  /** Órdenes de canal dentro de la ventana de sparkline, recientes primero. */
  channelOrders: ChannelOrderLite[]
  /** Órdenes de canal sin liquidar (point-in-time). */
  unsettledOrders: ChannelOrderLite[]
  /** OCs a proveedores en curso (point-in-time). */
  purchaseOrders: { total: number | null }[]
  /** Stock con mínimo definido, de los almacenes de la empresa activa. */
  stock: StockLite[]
  /** Últimos eventos de documentos para la tabla de actividad. */
  events: ActivityEventRow[]
}

const CHANNEL_ORDER_COLS = 'id, channel_id, external_order_id, total, currency, status, received_at, document_id, buyer'
const INVOICE_COLS = 'id, total, status, invoice_date, created_at'
const PO_CLOSED = '("recibida","received","cerrada","closed","cancelada","cancelled")'

/**
 * Datos crudos del dashboard ejecutivo. Se refetchea al cambiar período o
 * empresa activa; los filtros de canal/estado se aplican en cliente sobre
 * estos datos (ver @/lib/dashboard/executive-kpis).
 */
export function useExecutiveKpis(period: PeriodKey) {
  const { filterByCompany, companyKey } = useCompanyFilter()
  const [raw, setRaw] = useState<ExecutiveKpisRaw | null>(null)
  const [loading, setLoading] = useState(true)

  const load = useCallback(async () => {
    setLoading(true)
    const sb = createClient()
    const sparkISO = periodWindow(period).sparkFrom.toISOString()

    const [invRes, unpaidRes, quotesRes, ordersRes, unsettledRes, poRes, whRes, eventsRes] = await Promise.all([
      filterByCompany(
        sb.from('tt_documents').select(INVOICE_COLS)
          .eq('doc_type', 'factura').in('status', ISSUED_INVOICE_STATUSES).gte('invoice_date', sparkISO),
      ),
      filterByCompany(
        sb.from('tt_documents').select(INVOICE_COLS)
          .eq('doc_type', 'factura').in('status', UNPAID_INVOICE_STATUSES),
      ),
      filterByCompany(
        sb.from('tt_documents').select('id, total')
          .eq('doc_type', 'cotizacion').in('status', OPEN_QUOTE_STATUSES),
      ),
      filterByCompany(
        sb.from('tt_channel_orders').select(CHANNEL_ORDER_COLS)
          .gte('received_at', sparkISO).order('received_at', { ascending: false }),
      ),
      // Sin liquidar: no cancelada y sin documento nativo (dominio v91 sin estado de liquidación)
      filterByCompany(
        sb.from('tt_channel_orders').select(CHANNEL_ORDER_COLS)
          .neq('status', 'cancelled').is('document_id', null),
      ),
      filterByCompany(
        sb.from('tt_purchase_orders').select('id, total').not('status', 'in', PO_CLOSED),
      ),
      filterByCompany(sb.from('tt_warehouses').select('id').eq('active', true)),
      filterByCompany(
        sb.from('tt_document_events')
          .select('id, event_type, created_at, to_status, document:tt_documents(doc_code, counterparty_name, total, currency, status, doc_type)')
          .order('created_at', { ascending: false }).limit(30),
      ),
    ])

    // El stock no tiene company_id: se filtra vía los almacenes de la empresa
    const warehouseIds = ((whRes.data ?? []) as { id: string }[]).map(w => w.id)
    let stock: StockLite[] = []
    if (warehouseIds.length > 0) {
      const { data } = await sb
        .from('tt_stock').select('quantity, min_quantity, reserved')
        .gt('min_quantity', 0).in('warehouse_id', warehouseIds)
      stock = (data ?? []) as StockLite[]
    }

    setRaw({
      invoices: (invRes.data ?? []) as InvoiceLite[],
      unpaidInvoices: (unpaidRes.data ?? []) as InvoiceLite[],
      openQuotes: (quotesRes.data ?? []) as QuoteLite[],
      channelOrders: (ordersRes.data ?? []) as ChannelOrderLite[],
      unsettledOrders: (unsettledRes.data ?? []) as ChannelOrderLite[],
      purchaseOrders: (poRes.data ?? []) as { total: number | null }[],
      stock,
      events: (eventsRes.data ?? []) as unknown as ActivityEventRow[],
    })
    setLoading(false)
    // filterByCompany cambia de identidad por render; companyKey es la dep estable (mismo patrón que calendario)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [period, companyKey])

  useEffect(() => { void load() }, [load])

  return { raw, loading, refetch: load }
}
