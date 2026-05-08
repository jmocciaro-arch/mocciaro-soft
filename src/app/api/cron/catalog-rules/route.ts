/**
 * Cron para catalog-rules con trigger scheduled_daily / scheduled_weekly.
 * Además dispara reglas para lotes próximos a vencer y series con calibración.
 *
 * Envuelto con wrapCronHandler — Fase 0.6.
 */

import { NextRequest, NextResponse } from 'next/server'
import { getAdminClient } from '@/lib/supabase/admin'
import { wrapCronHandler } from '@/lib/observability/with-cron-logging'

export const runtime = 'nodejs'
export const maxDuration = 300

interface RuleRow {
  id: string
  name: string
  trigger_event: string
  conditions: unknown[]
  actions: unknown[]
  is_active: boolean
  priority: number
  fire_count: number | null
}

const handler = async (_req: NextRequest): Promise<NextResponse> => {
  const sb = getAdminClient()

  const day = new Date().getDay()  // 0 = domingo, 1 = lunes, ...
  const triggers = ['scheduled_daily']
  if (day === 1) triggers.push('scheduled_weekly')

  const { data: rules, error } = await sb
    .from('tt_catalog_rules')
    .select('*')
    .in('trigger_event', triggers)
    .eq('is_active', true)
    .order('priority', { ascending: false })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const matched: Array<{ rule: string }> = []

  for (const rule of (rules || []) as RuleRow[]) {
    matched.push({ rule: rule.name })
    void sb.from('tt_catalog_rules').update({
      fire_count: (rule.fire_count || 0) + 1,
      last_fired_at: new Date().toISOString(),
    }).eq('id', rule.id)
  }

  // Lotes a vencer + reglas lot_expiring
  const { data: expiring } = await sb.rpc('list_lots_expiring_soon', { p_days_ahead: 30 })
  if (Array.isArray(expiring) && expiring.length > 0) {
    matched.push({ rule: `lot_expiring_count_${expiring.length}` })
  }

  // Calibraciones próximas
  const { data: cals } = await sb.rpc('list_serials_calibration_due', { p_days_ahead: 30 })
  if (Array.isArray(cals) && cals.length > 0) {
    matched.push({ rule: `calibration_due_count_${cals.length}` })
  }

  return NextResponse.json({ ran: matched.length, matched })
}

export const POST = wrapCronHandler('catalog-rules', handler)
export const GET = wrapCronHandler('catalog-rules', handler)
