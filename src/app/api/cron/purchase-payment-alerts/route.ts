import type { NextRequest } from 'next/server'
import { getAdminClient } from '@/lib/supabase/admin'
import { withCronLogging } from '@/lib/observability/with-cron-logging'

export const runtime = 'nodejs'
export const maxDuration = 300

/**
 * GET/POST /api/cron/purchase-payment-alerts
 * Schedule: 0 8 * * * (08:00 UTC).
 *
 * Detecta facturas de compra (tt_purchase_invoices) cuyo due_date cae en la
 * ventana [hoy-7d, hoy+3d] y genera alertas en tt_generated_alerts.
 *
 * - severity = 'danger' si la factura ya está vencida (due_date < hoy).
 * - severity = 'warning' si vence en los próximos 3 días.
 *
 * Considera "pendientes" todas las facturas con status NOT IN ('paid', 'cancelled').
 *
 * El wrapper withCronLogging() ya valida CRON_SECRET y loguea en tt_cron_runs.
 */
const handler = async (_req: NextRequest) => {
  const supabase = getAdminClient()

  const today = new Date()
  const today0 = new Date(today.getFullYear(), today.getMonth(), today.getDate())
  const minDate = new Date(today0.getTime() - 7 * 86400000).toISOString().slice(0, 10)
  const maxDate = new Date(today0.getTime() + 3 * 86400000).toISOString().slice(0, 10)
  const todayStr = today0.toISOString().slice(0, 10)

  const { data: invoices, error: invErr } = await supabase
    .from('tt_purchase_invoices')
    .select('id, number, supplier_invoice_number, total, currency, due_date, status, supplier:tt_suppliers(id, name, legal_name, company_id)')
    .not('due_date', 'is', null)
    .gte('due_date', minDate)
    .lte('due_date', maxDate)
    .not('status', 'in', '(paid,cancelled)')

  if (invErr) throw invErr

  let processed = 0
  let inserted = 0
  let skipped = 0
  const errors: string[] = []

  for (const inv of (invoices || []) as Array<Record<string, unknown>>) {
    processed++
    try {
      const dueDate = inv.due_date as string
      const supplier = (inv.supplier as Record<string, unknown> | null) || null
      const companyId = (supplier?.company_id as string) || null
      if (!companyId) {
        skipped++
        continue
      }

      const isOverdue = dueDate < todayStr
      const severity = isOverdue ? 'danger' : 'warning'
      const supplierName = (supplier?.legal_name as string) || (supplier?.name as string) || 'Proveedor s/nombre'
      const totalNum = Number(inv.total || 0)
      const currency = (inv.currency as string) || 'EUR'
      const invNumber = (inv.supplier_invoice_number as string) || (inv.number as string) || inv.id

      const dueDateObj = new Date(dueDate)
      const diffDays = Math.round((dueDateObj.getTime() - today0.getTime()) / 86400000)
      const msg = diffDays === 0
        ? 'vence HOY'
        : diffDays > 0
          ? `vence en ${diffDays} día${diffDays > 1 ? 's' : ''}`
          : `vencida hace ${Math.abs(diffDays)} día${Math.abs(diffDays) > 1 ? 's' : ''}`

      const dedupKey = `purchpay-${inv.id}-${diffDays}`

      const { error: insErr } = await supabase
        .from('tt_generated_alerts')
        .upsert({
          company_id: companyId,
          type: 'purchase_payment',
          entity_type: 'purchase_invoice',
          entity_id: inv.id as string,
          title: `Factura compra ${invNumber} ${msg}`,
          body: `${supplierName} · ${currency} ${totalNum.toLocaleString('es-AR')} · Vto ${dueDate}`,
          severity,
          dedup_key: dedupKey,
        }, {
          onConflict: 'company_id,dedup_key',
          ignoreDuplicates: true,
        })

      if (insErr) {
        errors.push(`invoice ${inv.id}: ${insErr.message}`)
      } else {
        inserted++
      }
    } catch (e) {
      errors.push(`invoice ${inv.id}: ${(e as Error).message}`)
    }
  }

  return { processed, inserted, skipped, errors }
}

export const GET = withCronLogging('purchase-payment-alerts', handler)
export const POST = withCronLogging('purchase-payment-alerts', handler)
