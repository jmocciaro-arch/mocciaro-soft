/**
 * Generador de alertas automáticas.
 *
 * Se ejecuta desde /api/cron/alerts (diariamente 8am).
 * Detecta situaciones que requieren atención y genera registros en tt_generated_alerts.
 */

import { SupabaseClient } from '@supabase/supabase-js'

export interface AlertResult {
  companyId: string
  generated: number
  invoice_due: number
  quote_expiry: number
  lead_cold: number
  stock_low: number
  cashflow_warnings: number
  aging_critical: number
  errors: string[]
}

export async function generateAlertsForCompany(
  supabase: SupabaseClient,
  companyId: string
): Promise<AlertResult> {
  const result: AlertResult = {
    companyId, generated: 0,
    invoice_due: 0, quote_expiry: 0, lead_cold: 0, stock_low: 0,
    cashflow_warnings: 0, aging_critical: 0,
    errors: [],
  }

  const today = new Date()
  const today0 = new Date(today.getFullYear(), today.getMonth(), today.getDate())

  // 1) Facturas por vencer — avisa a 7/3/1/0 días
  try {
    const { data: invoices } = await supabase
      .from('tt_documents')
      .select('id, legal_number, total, currency, invoice_date, client:tt_clients(name), metadata')
      .eq('company_id', companyId)
      .eq('doc_type', 'factura')
      .in('status', ['emitida', 'autorizada', 'pendiente_cobro'])

    for (const inv of (invoices || []) as any[]) {
      // Calcular vencimiento según payment_terms del metadata o 30 días default
      const paymentDays = inv.metadata?.payment_days || 30
      const emissionDate = new Date(inv.invoice_date || inv.metadata?.stelorder_raw?.date || today)
      const dueDate = new Date(emissionDate.getTime() + paymentDays * 86400000)
      const diffDays = Math.round((dueDate.getTime() - today0.getTime()) / 86400000)

      for (const threshold of [7, 3, 1, 0, -7, -30]) {
        if (diffDays === threshold) {
          const dedup = `invdue-${inv.id}-${threshold}`
          const severity: any = threshold <= 0 ? 'danger' : threshold <= 3 ? 'warning' : 'info'
          const msg = threshold === 0 ? 'vence HOY'
            : threshold > 0 ? `vence en ${threshold} día${threshold > 1 ? 's' : ''}`
            : `vencida hace ${Math.abs(threshold)} día${Math.abs(threshold) > 1 ? 's' : ''}`

          await upsertAlert(supabase, {
            company_id: companyId,
            type: 'invoice_due',
            entity_type: 'document',
            entity_id: inv.id,
            title: `Factura ${inv.legal_number} ${msg}`,
            body: `${inv.client?.name || 'Cliente s/nombre'} · ${inv.currency} ${Number(inv.total).toLocaleString('es-AR')}`,
            severity,
            dedup_key: dedup,
          })
          result.invoice_due++
          result.generated++
        }
      }
    }
  } catch (e) {
    result.errors.push(`invoice_due: ${(e as Error).message}`)
  }

  // 2) Cotizaciones por vencer (valid_until)
  try {
    const { data: quotes } = await supabase
      .from('tt_quotes')
      .select('id, quote_number, total, currency, valid_until, client:tt_clients(name)')
      .eq('company_id', companyId)
      .in('status', ['draft', 'borrador', 'pending', 'sent', 'enviada'])
      .not('valid_until', 'is', null)

    for (const q of (quotes || []) as any[]) {
      const valid = new Date(q.valid_until)
      const diffDays = Math.round((valid.getTime() - today0.getTime()) / 86400000)
      for (const threshold of [3, 1, 0]) {
        if (diffDays === threshold) {
          await upsertAlert(supabase, {
            company_id: companyId,
            type: 'quote_expiry',
            entity_type: 'document',
            entity_id: q.id,
            title: `Cotización ${q.quote_number} ${threshold === 0 ? 'vence HOY' : `vence en ${threshold} día(s)`}`,
            body: `${q.client?.name || 'Cliente s/nombre'} · ${q.currency} ${Number(q.total || 0).toLocaleString('es-AR')}`,
            severity: threshold === 0 ? 'warning' : 'info',
            dedup_key: `qexp-${q.id}-${threshold}`,
          })
          result.quote_expiry++
          result.generated++
        }
      }
    }
  } catch (e) {
    result.errors.push(`quote_expiry: ${(e as Error).message}`)
  }

  // 3) Leads hot sin contactar hace X días
  try {
    const { data: settings } = await supabase
      .from('tt_alert_settings')
      .select('lead_cold_days')
      .eq('company_id', companyId)
      .maybeSingle()
    const coldDays = settings?.lead_cold_days || 2

    const cutoff = new Date(today0.getTime() - coldDays * 86400000)
    const { data: leads } = await supabase
      .from('tt_leads')
      .select('id, name, company_name, ai_score, ai_temperature, updated_at')
      .eq('company_id', companyId)
      .eq('ai_temperature', 'hot')
      .in('status', ['new', 'contacted'])
      .lt('updated_at', cutoff.toISOString())

    for (const l of (leads || []) as any[]) {
      await upsertAlert(supabase, {
        company_id: companyId,
        type: 'lead_cold',
        entity_type: 'lead',
        entity_id: l.id,
        title: `Lead HOT sin contactar: ${l.name}`,
        body: `${l.company_name || 's/empresa'} · score ${l.ai_score}% · inactivo hace ${coldDays}+ días`,
        severity: 'warning',
        dedup_key: `cold-${l.id}-${today0.toISOString().slice(0, 10)}`,
      })
      result.lead_cold++
      result.generated++
    }
  } catch (e) {
    result.errors.push(`lead_cold: ${(e as Error).message}`)
  }

  // 4) Stock bajo mínimo
  try {
    const { data: products } = await supabase
      .from('tt_products')
      .select('id, sku, name, specs')
      .eq('active', true)

    for (const p of (products || []) as any[]) {
      const stock = Number(p.specs?.stock || 0)
      const min = Number(p.specs?.stock_min || 0)
      if (min > 0 && stock <= min) {
        await upsertAlert(supabase, {
          company_id: companyId,
          type: 'stock_low',
          entity_type: 'product',
          entity_id: p.id,
          title: `Stock bajo: ${p.name}`,
          body: `SKU ${p.sku} · stock actual ${stock}, mínimo ${min}`,
          severity: stock === 0 ? 'danger' : 'warning',
          dedup_key: `stock-${p.id}-${today0.toISOString().slice(0, 10)}`,
        })
        result.stock_low++
        result.generated++
      }
    }
  } catch (e) {
    result.errors.push(`stock_low: ${(e as Error).message}`)
  }

  // 5) Alertas de aging crítico (+90 días sin cobrar)
  try {
    const { data: overdueInvoices } = await supabase
      .from('tt_documents')
      .select('id, legal_number, total, currency, invoice_date, client:tt_clients(name), metadata')
      .eq('company_id', companyId)
      .eq('doc_type', 'factura')
      .in('status', ['emitida', 'autorizada', 'pendiente_cobro'])

    const now = new Date()
    for (const inv of (overdueInvoices || []) as any[]) {
      const emDate = new Date(inv.invoice_date || now)
      const payDays = inv.metadata?.payment_days || 30
      const dueDate = new Date(emDate.getTime() + payDays * 86400000)
      const daysOverdue = Math.round((now.getTime() - dueDate.getTime()) / 86400000)

      if (daysOverdue >= 90) {
        await upsertAlert(supabase, {
          company_id: companyId,
          type: 'aging_critical',
          entity_type: 'document',
          entity_id: inv.id,
          title: `Deuda crítica: ${inv.client?.name || 'Cliente'} — ${daysOverdue}d en mora`,
          body: `Factura ${inv.legal_number} · ${inv.currency} ${Number(inv.total).toLocaleString('es-AR')} · Vto hace ${daysOverdue} días`,
          severity: 'danger',
          dedup_key: `aging-crit-${inv.id}-${today0.toISOString().slice(0, 7)}`,  // mensual
        })
        result.aging_critical++
        result.generated++
      }
    }
  } catch (e) {
    result.errors.push(`aging_critical: ${(e as Error).message}`)
  }

  // 6) Alerta de cash flow negativo (basado en facturas pendientes vs OC)
  try {
    const { data: openInvoicesData } = await supabase
      .from('tt_documents')
      .select('total')
      .eq('company_id', companyId)
      .eq('doc_type', 'factura')
      .in('status', ['emitida', 'autorizada', 'pendiente_cobro'])

    const { data: openPOData } = await supabase
      .from('tt_purchase_orders')
      .select('total')
      .eq('company_id', companyId)
      .in('status', ['sent', 'partial', 'confirmed'])

    const totalAR = (openInvoicesData || []).reduce((s: number, r: any) => s + Number(r.total || 0), 0)
    const totalAP = (openPOData || []).reduce((s: number, r: any) => s + Number(r.total || 0), 0)

    if (totalAP > totalAR * 1.5 && totalAP > 0) {
      await upsertAlert(supabase, {
        company_id: companyId,
        type: 'cashflow_warning',
        entity_type: 'company',
        entity_id: null,
        title: 'Alerta cash flow: egresos superan ingresos esperados',
        body: `Facturas por cobrar: ${totalAR.toLocaleString('es-AR')} · OC pendientes: ${totalAP.toLocaleString('es-AR')} · Ratio: ${(totalAP / Math.max(totalAR, 1)).toFixed(1)}x`,
        severity: 'warning',
        dedup_key: `cashflow-warn-${companyId}-${today0.toISOString().slice(0, 10)}`,
      })
      result.cashflow_warnings++
      result.generated++
    }
  } catch (e) {
    result.errors.push(`cashflow_warning: ${(e as Error).message}`)
  }

  return result
}

async function upsertAlert(supabase: SupabaseClient, alert: any) {
  await supabase.from('tt_generated_alerts').upsert(alert, {
    onConflict: 'company_id,dedup_key',
    ignoreDuplicates: true,
  })
}
