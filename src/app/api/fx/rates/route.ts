/**
 * GET  /api/fx/rates           → rates actuales (último día disponible)
 * GET  /api/fx/rates?cron=1     → fetch desde dolarapi.com + ECB y guarda (lo dispara el cron de Vercel)
 * POST /api/fx/rates           → mismo fetch+guardado, para disparo manual
 *
 * Los cron jobs de Vercel disparan siempre GET (nunca POST), por eso el
 * guardado tiene que ser alcanzable por GET con el marcador ?cron=1
 * (mismo patrón que /api/ai/daily-summary?cron=1). Sin esto el cron pegaba
 * en el GET de solo-lectura y tt_fx_rates quedaba congelada.
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
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  // Los cron de Vercel disparan GET (no POST): con ?cron=1 enrutamos al
  // fetch+guardado (valida CRON_SECRET y loguea en tt_cron_runs).
  if (searchParams.get('cron') === '1') {
    return fxCronHandler(req)
  }

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

// Handler compartido (fetch+guardado) con logging a tt_cron_runs y validación de CRON_SECRET.
// Alcanzable por GET ?cron=1 (cron de Vercel) y por POST (disparo manual con el secret).
const fxCronHandler = wrapCronHandler('fx-rates', fxPostHandler)

export const POST = fxCronHandler
