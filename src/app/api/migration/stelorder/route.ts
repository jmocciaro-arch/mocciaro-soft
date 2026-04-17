import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { StelOrderClient } from '@/lib/migration/stelorder-client'
import { PHASES } from '@/lib/migration/stelorder-phases'

export const runtime = 'nodejs'
export const maxDuration = 300  // 5 min max por fase

/**
 * GET /api/migration/stelorder?companyId=xxx
 *    Devuelve lista de fases + estado actual (último log por fase)
 *
 * POST /api/migration/stelorder
 *    Body: { companyId, phaseId, apiKey?: string }
 *    Ejecuta UNA fase y devuelve resultado
 *    (Si no viene apiKey, usa STELORDER_APIKEY_TORQUETOOLS del env)
 */

function admin() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } }
  )
}

export async function GET(req: NextRequest) {
  const companyId = req.nextUrl.searchParams.get('companyId')
  if (!companyId) return NextResponse.json({ error: 'companyId requerido' }, { status: 400 })

  const supabase = admin()
  const { data: logs } = await supabase
    .from('tt_migration_log')
    .select('phase, status, processed, inserted, errors, started_at, completed_at')
    .eq('company_id', companyId)
    .order('started_at', { ascending: false })

  // Último log por phase
  const lastByPhase = new Map<string, any>()
  for (const l of logs || []) {
    if (!lastByPhase.has(l.phase)) lastByPhase.set(l.phase, l)
  }

  return NextResponse.json({
    phases: PHASES.map((p) => ({
      id: p.id,
      label: p.label,
      entity: p.entity,
      lastRun: lastByPhase.get(p.id) || null,
    })),
  })
}

export async function POST(req: NextRequest) {
  try {
    const { companyId, phaseId, apiKey } = await req.json()
    if (!companyId || !phaseId) return NextResponse.json({ error: 'companyId y phaseId requeridos' }, { status: 400 })

    const phase = PHASES.find((p) => p.id === phaseId)
    if (!phase) return NextResponse.json({ error: `Fase no encontrada: ${phaseId}` }, { status: 404 })

    const key = apiKey || process.env.STELORDER_APIKEY_TORQUETOOLS
    if (!key) return NextResponse.json({ error: 'StelOrder API Key no configurada (env STELORDER_APIKEY_TORQUETOOLS)' }, { status: 400 })

    const supabase = admin()

    // 1) Crear log inicial
    const { data: log, error: logErr } = await supabase
      .from('tt_migration_log')
      .insert({
        source: 'stelorder',
        company_id: companyId,
        phase: phase.id,
        entity: phase.entity,
        status: 'running',
      })
      .select('id')
      .single()
    if (logErr) return NextResponse.json({ error: 'Error creando log: ' + logErr.message }, { status: 500 })

    const startedAt = Date.now()

    // 2) Ejecutar fase
    const stel = new StelOrderClient({ apiKey: key })
    let progress = { processed: 0, total: 0 }

    try {
      const result = await phase.fn({
        stel,
        supabase,
        companyId,
        logId: log.id,
        onProgress: (p, t) => { progress = { processed: p, total: t } },
      })

      const duration = Date.now() - startedAt
      await supabase
        .from('tt_migration_log')
        .update({
          status: result.errors > 0 ? 'partial' : 'completed',
          total_source: result.processed,
          processed: result.processed,
          inserted: result.inserted,
          updated: result.updated,
          skipped: result.skipped,
          errors: result.errors,
          error_log: result.errorLog,
          completed_at: new Date().toISOString(),
          duration_ms: duration,
        })
        .eq('id', log.id)

      return NextResponse.json({
        ok: true,
        phaseId: phase.id,
        result,
        durationMs: duration,
      })
    } catch (err) {
      await supabase
        .from('tt_migration_log')
        .update({
          status: 'failed',
          error_log: [{ error: (err as Error).message }],
          completed_at: new Date().toISOString(),
          duration_ms: Date.now() - startedAt,
          processed: progress.processed,
        })
        .eq('id', log.id)
      return NextResponse.json({ error: (err as Error).message }, { status: 500 })
    }
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 500 })
  }
}
