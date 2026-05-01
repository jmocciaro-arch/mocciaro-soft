import { NextResponse } from 'next/server'
import { createClient as createServiceClient } from '@supabase/supabase-js'
import { fetchBnaRates, fetchBluelyticsFallback } from '@/lib/bna-scraper'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

/**
 * POST /api/exchange-rates/update
 * Scrapea BNA, guarda cotizaciones del día en tt_exchange_rates.
 * Llamable manualmente desde el admin o por cron (Vercel cron / GitHub Actions).
 *
 * Header opcional: x-cron-secret (si CRON_SECRET está seteado)
 */
export async function POST(req: Request) {
  // Validar secret si está configurado (para cron jobs)
  const cronSecret = process.env.CRON_SECRET
  if (cronSecret) {
    const provided = req.headers.get('x-cron-secret') || new URL(req.url).searchParams.get('secret')
    if (provided !== cronSecret) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
  }

  // 1) Fetch BNA
  let data = await fetchBnaRates()

  // 2) Fallback bluelytics si BNA falla
  if (!data || data.rates.length === 0) {
    console.warn('[exchange-rates] BNA falló, usando Bluelytics')
    data = await fetchBluelyticsFallback()
  }

  if (!data || data.rates.length === 0) {
    return NextResponse.json({
      error: 'No se pudieron obtener cotizaciones',
    }, { status: 502 })
  }

  // 3) Persistir en DB con service role
  const supabase = createServiceClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  )

  const rows = data.rates.map(r => ({
    currency_code: r.currency_code,
    buy:  r.buy,
    sell: r.sell,
    source: 'BNA',
    rate_date: data.date,
  }))

  const { error } = await supabase
    .from('tt_exchange_rates')
    .upsert(rows, { onConflict: 'currency_code,rate_date,source' })

  if (error) {
    console.error('[exchange-rates] DB error:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({
    ok: true,
    date: data.date,
    rates_count: rows.length,
    currencies: rows.map(r => r.currency_code),
  })
}

/** GET también por conveniencia (cron.org / UptimeRobot) */
export const GET = POST
