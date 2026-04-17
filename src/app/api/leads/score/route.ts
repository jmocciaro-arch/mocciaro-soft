import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { scoreLead } from '@/lib/ai/score-lead'

export const runtime = 'nodejs'

/**
 * POST /api/leads/score
 * Body: { leadId?, input: LeadScoreInput, persist?: true }
 *
 * Si leadId viene y persist=true, actualiza el lead en DB con ai_*
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const { leadId, input, persist = true } = body

    if (!input?.rawMessage) {
      return NextResponse.json({ error: 'input.rawMessage requerido' }, { status: 400 })
    }

    const result = await scoreLead(input)
    if (!result.data) return NextResponse.json({ error: result.error || 'Sin resultado' }, { status: 500 })

    if (leadId && persist) {
      const supabase = createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.SUPABASE_SERVICE_ROLE_KEY!,
        { auth: { persistSession: false } }
      )
      await supabase
        .from('tt_leads')
        .update({
          ai_score: result.data.score,
          ai_temperature: result.data.temperature,
          ai_tags: result.data.tags,
          ai_suggested_action: result.data.suggested_action,
          ai_suggested_email: result.data.suggested_email,
          ai_needs: result.data.needs,
          ai_analysis_at: new Date().toISOString(),
          ai_provider: result.data.provider_used,
        })
        .eq('id', leadId)
    }

    return NextResponse.json(result.data)
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 500 })
  }
}
