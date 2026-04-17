/**
 * GET /api/cashflow/aging?company_id=...&with_ai=1
 *
 * Devuelve el aging report de cuentas a cobrar.
 * Con with_ai=1 agrega sugerencias IA por cliente (más lento, usa Gemini/Claude).
 */

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { buildAgingReport, getAgingAISuggestion } from '@/lib/cashflow/aging-ai'

export const runtime = 'nodejs'
export const maxDuration = 120

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const companyId = searchParams.get('company_id')
  const withAI = searchParams.get('with_ai') === '1'
  const clientId = searchParams.get('client_id')  // para AI de un solo cliente

  if (!companyId) {
    return NextResponse.json({ error: 'company_id requerido' }, { status: 400 })
  }

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } }
  )

  try {
    let rows = await buildAgingReport(supabase, companyId)

    // Totales del reporte
    const summary = {
      total_clients: rows.length,
      total_owed: rows.reduce((s, r) => s + r.total_owed, 0),
      bucket_0_30: rows.reduce((s, r) => s + r.bucket_0_30, 0),
      bucket_31_60: rows.reduce((s, r) => s + r.bucket_31_60, 0),
      bucket_61_90: rows.reduce((s, r) => s + r.bucket_61_90, 0),
      bucket_90_plus: rows.reduce((s, r) => s + r.bucket_90_plus, 0),
    }

    // Si se pide AI para un cliente específico
    if (clientId) {
      const clientRow = rows.find(r => r.client_id === clientId)
      if (clientRow) {
        clientRow.ai_suggestion = await getAgingAISuggestion(clientRow)
        clientRow.ai_suggestion_at = new Date().toISOString()
      }
    }
    // Si se pide AI para todos (hasta 5 primeros por performance)
    else if (withAI) {
      const top = rows.slice(0, 5)
      await Promise.all(
        top.map(async (row) => {
          row.ai_suggestion = await getAgingAISuggestion(row)
          row.ai_suggestion_at = new Date().toISOString()
        })
      )
      rows = [...top, ...rows.slice(5)]
    }

    return NextResponse.json({ ok: true, summary, rows })
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 500 })
  }
}
