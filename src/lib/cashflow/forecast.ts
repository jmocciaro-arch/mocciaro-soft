/**
 * Cash Flow Forecast Engine
 *
 * Construye proyección a 30/60/90 días basada en:
 *   - Facturas emitidas pendientes de cobro (tt_documents)
 *   - Órdenes de compra pendientes de pago (tt_purchase_orders)
 *   - Historial de cobros (tt_bank_statements) para calcular % de cobro esperado
 *
 * Usado por /api/cashflow/forecast
 */

import { SupabaseClient } from '@supabase/supabase-js'

export interface WeekBucket {
  week_label: string      // 'Semana 1', 'Semana 2', etc.
  week_start: string      // ISO date
  week_end: string
  inflow: number
  outflow: number
  net: number
  running_balance: number
}

export interface CashFlowForecast {
  company_id: string
  currency: string
  horizon_days: 30 | 60 | 90
  as_of: string
  // Resumen
  total_inflow: number
  total_outflow: number
  net_cashflow: number
  opening_balance: number
  projected_closing: number
  // Detalle
  inflow_invoices_pending: number
  inflow_invoices_likely: number
  outflow_purchases: number
  outflow_recurring: number
  // Semana a semana
  weeks: WeekBucket[]
  // Alertas
  weeks_negative: number
  min_balance: number
  min_balance_week: string
}

interface InvoiceRow {
  id: string
  total: number | string
  currency: string
  invoice_date: string | null
  metadata: Record<string, unknown> | null
  client_id: string | null
}

interface PORow {
  id: string
  total: number | string
  currency: string
  expected_delivery: string | null
  created_at: string
}

export async function buildForecast(
  supabase: SupabaseClient,
  companyId: string,
  horizonDays: 30 | 60 | 90 = 90,
  currency = 'EUR'
): Promise<CashFlowForecast> {
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const horizonEnd = new Date(today.getTime() + horizonDays * 86400000)
  const todayStr = today.toISOString().slice(0, 10)

  // ─── 1. Facturas pendientes de cobro ─────────────────────────────────────
  const { data: invoices } = await supabase
    .from('tt_documents')
    .select('id, total, currency, invoice_date, metadata, client_id')
    .eq('company_id', companyId)
    .eq('type', 'factura')
    .in('status', ['emitida', 'autorizada', 'pendiente_cobro'])

  const invoiceRows = (invoices || []) as InvoiceRow[]

  // Calcular tasa de cobro histórica (últimos 90 días)
  const cutoff90 = new Date(today.getTime() - 90 * 86400000).toISOString()
  const { count: totalEmitidas } = await supabase
    .from('tt_documents')
    .select('*', { count: 'exact', head: true })
    .eq('company_id', companyId)
    .eq('type', 'factura')
    .gte('invoice_date', cutoff90)

  const { count: totalCobradas } = await supabase
    .from('tt_documents')
    .select('*', { count: 'exact', head: true })
    .eq('company_id', companyId)
    .eq('type', 'factura')
    .eq('status', 'cobrada')
    .gte('invoice_date', cutoff90)

  const collectionRate = totalEmitidas && totalEmitidas > 0
    ? Math.min(1, (totalCobradas || 0) / totalEmitidas)
    : 0.75  // default 75% si no hay historial

  // ─── 2. Órdenes de compra pendientes ──────────────────────────────────────
  const { data: purchaseOrders } = await supabase
    .from('tt_purchase_orders')
    .select('id, total, currency, expected_delivery, created_at')
    .eq('company_id', companyId)
    .in('status', ['sent', 'partial', 'confirmed'])

  const poRows = (purchaseOrders || []) as PORow[]

  // ─── 3. Gastos recurrentes estimados (promedio mensual últimos 3 meses) ───
  const cutoff3m = new Date(today.getTime() - 90 * 86400000).toISOString()
  const { data: recentPOs } = await supabase
    .from('tt_purchase_orders')
    .select('total, created_at')
    .eq('company_id', companyId)
    .eq('status', 'received')
    .gte('created_at', cutoff3m)

  const recurringMonthly = recentPOs && recentPOs.length > 0
    ? recentPOs.reduce((s, r) => s + Number(r.total || 0), 0) / 3
    : 0

  // ─── 4. Construir buckets semanales ──────────────────────────────────────
  const totalWeeks = Math.ceil(horizonDays / 7)
  const weeks: WeekBucket[] = []
  let runningBalance = 0  // sin balance inicial (sería de bank statements real)

  let totalInflow = 0
  let totalOutflow = 0
  let totalInflowLikely = 0
  let totalInflowPending = 0

  for (let w = 0; w < totalWeeks; w++) {
    const weekStart = new Date(today.getTime() + w * 7 * 86400000)
    const weekEnd = new Date(Math.min(
      weekStart.getTime() + 7 * 86400000 - 1,
      horizonEnd.getTime()
    ))
    const wsStr = weekStart.toISOString().slice(0, 10)
    const weStr = weekEnd.toISOString().slice(0, 10)

    // Facturas esperadas cobrar esta semana
    let weekInflow = 0
    for (const inv of invoiceRows) {
      const emDate = new Date(inv.invoice_date || new Date())
      const payDays = (inv.metadata as Record<string, unknown> | null)?.payment_days as number || 30
      const expectedDate = new Date(emDate.getTime() + payDays * 86400000)
      if (expectedDate >= weekStart && expectedDate <= weekEnd) {
        weekInflow += Number(inv.total || 0) * collectionRate
        totalInflowPending += Number(inv.total || 0)
        totalInflowLikely += Number(inv.total || 0) * collectionRate
      }
    }

    // OC pendientes de pago esta semana
    let weekOutflow = 0
    for (const po of poRows) {
      const delivDate = po.expected_delivery
        ? new Date(po.expected_delivery)
        : new Date(new Date(po.created_at).getTime() + 30 * 86400000)
      if (delivDate >= weekStart && delivDate <= weekEnd) {
        weekOutflow += Number(po.total || 0)
      }
    }

    // Gastos recurrentes proporcionales
    const weekDays = Math.round((weekEnd.getTime() - weekStart.getTime()) / 86400000) + 1
    weekOutflow += (recurringMonthly / 30) * weekDays

    const net = weekInflow - weekOutflow
    runningBalance += net
    totalInflow += weekInflow
    totalOutflow += weekOutflow

    weeks.push({
      week_label: `Sem ${w + 1}`,
      week_start: wsStr,
      week_end: weStr,
      inflow: Math.round(weekInflow * 100) / 100,
      outflow: Math.round(weekOutflow * 100) / 100,
      net: Math.round(net * 100) / 100,
      running_balance: Math.round(runningBalance * 100) / 100,
    })
  }

  // Alertas
  const negativeWeeks = weeks.filter(w => w.running_balance < 0)
  const minBucket = weeks.reduce(
    (min, w) => w.running_balance < min.running_balance ? w : min,
    weeks[0] || { running_balance: 0, week_label: '-' }
  )

  return {
    company_id: companyId,
    currency,
    horizon_days: horizonDays,
    as_of: todayStr,
    total_inflow: Math.round(totalInflow * 100) / 100,
    total_outflow: Math.round(totalOutflow * 100) / 100,
    net_cashflow: Math.round((totalInflow - totalOutflow) * 100) / 100,
    opening_balance: 0,
    projected_closing: Math.round(runningBalance * 100) / 100,
    inflow_invoices_pending: Math.round(totalInflowPending * 100) / 100,
    inflow_invoices_likely: Math.round(totalInflowLikely * 100) / 100,
    outflow_purchases: Math.round(poRows.reduce((s, r) => s + Number(r.total || 0), 0) * 100) / 100,
    outflow_recurring: Math.round(recurringMonthly * horizonDays / 30 * 100) / 100,
    weeks,
    weeks_negative: negativeWeeks.length,
    min_balance: minBucket?.running_balance ?? 0,
    min_balance_week: minBucket?.week_label ?? '-',
  }
}
