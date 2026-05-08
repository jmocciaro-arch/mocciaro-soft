/**
 * GET  /api/fx/rates           → rates actuales (último día disponible)
 * POST /api/fx/rates           → fetch desde dolarapi.com + ECB y guarda en tt_fx_rates
 *
 * El POST lo llama el cron de Vercel (0 10 * * *) y también puede llamarse manualmente.
 */

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { fetchAllRates } from '@/lib/fx/fetch-rates'
import { wrapCronHandler } from '@/lib/observability/with-cron-logging'

export const runtime = 'nodejs'
export const maxDuration = 60

function getServiceClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } }
  )
}

// ── GET: devuelve los rates más recientes ────────────────────────────────────
export async function GET(_req: NextRequest) {
  const supabase = getServiceClient()

  const { data, error } = await supabase
    .from('tt_fx_rates')
    .select('*')
    .order('date', { ascending: false })
    .limit(50)

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  // Agrupar por tipo de cambio (último rate por par)
  const latest: Record<string, (typeof data)[0]> = {}
  for (const r of data || []) {
    const key = `${r.base_currency}_${r.target_currency}`
    if (!latest[key]) latest[key] = r
  }

  return NextResponse.json({
    ok: true,
    rates: Object.values(latest),
    fetched_at: new Date().toISOString(),
  })
}

// ── POST: fetch desde APIs externas y guarda ─────────────────────────────────
const fxPostHandler = async (_req: NextRequest): Promise<NextResponse> => {
  const supabase = getServiceClient()
  const today = new Date().toISOString().slice(0, 10)

  try {
    const rates = await fetchAllRates(today)

    if (rates.length === 0) {
      return NextResponse.json({ ok: false, error: 'No se pudieron obtener cotizaciones' }, { status: 502 })
    }

    const { error: upsertError } = await supabase
      .from('tt_fx_rates')
      .upsert(rates, { onConflict: 'date,base_currency,target_currency' })

    if (upsertError) {
      return NextResponse.json({ error: upsertError.message }, { status: 500 })
    }

    return NextResponse.json({
      ok: true,
      saved: rates.length,
      date: today,
      rates: rates.map(r => `${r.base_currency}→${r.target_currency}: ${r.rate}`),
    })
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 500 })
  }
}

export const POST = wrapCronHandler('fx-rates', fxPostHandler)
