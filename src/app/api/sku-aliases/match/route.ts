/**
 * POST /api/sku-aliases/match
 *
 * Body: {
 *   client_id?: string,
 *   items: [{ codigo, descripcion }, ...]
 * }
 *
 * Devuelve: { matches: MatchResult[] }
 *
 * Usado por el cotizador al importar OC: pasa los items extraídos por la IA
 * y recibe el matching de cada uno contra el catálogo.
 */

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { withCompanyFilter } from '@/lib/auth/with-company-filter'
import { matchBatch } from '@/lib/sku-matcher'

export const runtime = 'nodejs'
export const maxDuration = 30

export async function POST(req: NextRequest) {
  const guard = await withCompanyFilter()
  if (!guard.ok) return guard.response

  const body = await req.json().catch(() => null)
  if (!body || !Array.isArray(body.items)) {
    return NextResponse.json(
      { error: 'items[] requerido' },
      { status: 400 }
    )
  }

  const sb = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } }
  )

  const matches = await matchBatch(sb, {
    clientId: body.client_id || null,
    items: body.items,
  })

  return NextResponse.json({ matches })
}
