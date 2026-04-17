import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { generateAlertsForCompany } from '@/lib/alerts/generate-alerts'

export const runtime = 'nodejs'
export const maxDuration = 300

/**
 * POST /api/cron/alerts
 * Ejecutable manualmente o por Vercel cron (schedule: 0 8 * * *).
 * Genera alertas para todas las empresas activas.
 *
 * Protegido con CRON_SECRET o por Authorization: Bearer <secret>.
 */
export async function POST(req: NextRequest) {
  const authHeader = req.headers.get('authorization')
  const cronSecret = process.env.CRON_SECRET
  if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } }
  )

  const { data: companies } = await supabase
    .from('tt_companies')
    .select('id, name')
    .eq('active', true)

  const results = []
  for (const c of (companies || []) as any[]) {
    try {
      const r = await generateAlertsForCompany(supabase, c.id)
      results.push({ company: c.name, ...r })
    } catch (e) {
      results.push({ company: c.name, error: (e as Error).message })
    }
  }

  return NextResponse.json({ ok: true, results })
}

export const GET = POST  // permitir GET desde Vercel cron
