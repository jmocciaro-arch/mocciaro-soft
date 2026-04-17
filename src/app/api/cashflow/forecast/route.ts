/**
 * GET /api/cashflow/forecast?company_id=...&horizon=30|60|90&currency=EUR
 *
 * Construye el forecast de cash flow para la empresa.
 * Opcionalmente guarda un snapshot en tt_cashflow_snapshots.
 */

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { buildForecast } from '@/lib/cashflow/forecast'

export const runtime = 'nodejs'
export const maxDuration = 60

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const companyId = searchParams.get('company_id')
  const horizonParam = searchParams.get('horizon')
  const currency = searchParams.get('currency') || 'EUR'
  const save = searchParams.get('save') === '1'

  if (!companyId) {
    return NextResponse.json({ error: 'company_id requerido' }, { status: 400 })
  }

  const horizon = ([30, 60, 90].includes(Number(horizonParam)) ? Number(horizonParam) : 90) as 30 | 60 | 90

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } }
  )

  try {
    const forecast = await buildForecast(supabase, companyId, horizon, currency)

    // Guardar snapshot si se pide
    if (save) {
      await supabase.from('tt_cashflow_snapshots').upsert({
        company_id: companyId,
        snapshot_date: forecast.as_of,
        horizon_days: horizon,
        currency,
        inflow_invoices_pending: forecast.inflow_invoices_pending,
        inflow_invoices_likely: forecast.inflow_invoices_likely,
        inflow_other: 0,
        outflow_purchases: forecast.outflow_purchases,
        outflow_recurring: forecast.outflow_recurring,
        outflow_other: 0,
        net_cashflow: forecast.net_cashflow,
        opening_balance: forecast.opening_balance,
        projected_closing: forecast.projected_closing,
        data: { weeks: forecast.weeks },
      }, { onConflict: 'company_id,snapshot_date,horizon_days,currency' })
    }

    return NextResponse.json({ ok: true, forecast })
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 500 })
  }
}
