import type { NextRequest } from 'next/server'
import { getAdminClient } from '@/lib/supabase/admin'
import { generateAlertsForCompany } from '@/lib/alerts/generate-alerts'
import { withCronLogging } from '@/lib/observability/with-cron-logging'

export const runtime = 'nodejs'
export const maxDuration = 300

/**
 * POST/GET /api/cron/alerts
 * Schedule: 0 8 * * * (08:00 UTC).
 * Genera alertas para todas las empresas activas.
 *
 * Envuelto en withCronLogging() — Fase 0.6:
 * - Verifica CRON_SECRET automáticamente.
 * - Logea start/success/failed en tt_cron_runs.
 * - Captura errores con stack trace.
 */
const handler = async (_req: NextRequest) => {
  const supabase = getAdminClient()

  const { data: companies } = await supabase
    .from('tt_companies')
    .select('id, name')
    .eq('active', true)

  const results: Array<Record<string, unknown>> = []
  for (const c of (companies || []) as Array<{ id: string; name: string }>) {
    try {
      const r = await generateAlertsForCompany(supabase, c.id)
      results.push({ company: c.name, ...r })
    } catch (e) {
      results.push({ company: c.name, error: (e as Error).message })
    }
  }

  return { companies_processed: results.length, results }
}

export const POST = withCronLogging('alerts', handler)
export const GET = withCronLogging('alerts', handler)
