import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { requireComex, loadCarrierChecked } from '@/lib/comex/guards'

export const runtime = 'nodejs'

const COLS = 'id, carrier_id, code, label, country_codes, active, updated_at'

const zoneSchema = z.object({
  carrier_id: z.string().uuid(),
  code: z.string().trim().min(1).max(30),
  label: z.string().trim().min(1).max(80),
  // ISO-2 en mayúsculas; el front manda el array ya parseado del input de texto
  country_codes: z.array(z.string().trim().toUpperCase().length(2)).default([]),
  active: z.boolean().default(true),
})

/** GET /api/comex/carrier-zones?carrier_id= — zonas del courier. view_comex. */
export async function GET(req: NextRequest) {
  const ctx = await requireComex('view_comex')
  if (!ctx.ok) return ctx.response
  const carrierId = req.nextUrl.searchParams.get('carrier_id')
  if (!carrierId) return NextResponse.json({ error: 'Falta carrier_id' }, { status: 400 })

  const carrier = await loadCarrierChecked(ctx, carrierId)
  if (!carrier.ok) return carrier.response

  const { data, error } = await ctx.admin
    .from('tt_carrier_zones').select(COLS).eq('carrier_id', carrierId).order('code')
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ data })
}

/** POST /api/comex/carrier-zones — alta. manage_comex + acceso vía carrier. */
export async function POST(req: NextRequest) {
  const ctx = await requireComex('manage_comex')
  if (!ctx.ok) return ctx.response

  let body: unknown
  try { body = await req.json() } catch { return NextResponse.json({ error: 'JSON inválido' }, { status: 400 }) }
  const parsed = zoneSchema.safeParse(body)
  if (!parsed.success) return NextResponse.json({ error: 'Validación falló', issues: z.treeifyError(parsed.error) }, { status: 400 })

  const carrier = await loadCarrierChecked(ctx, parsed.data.carrier_id)
  if (!carrier.ok) return carrier.response

  const { data, error } = await ctx.admin.from('tt_carrier_zones').insert(parsed.data).select(COLS).single()
  if (error) {
    const msg = error.code === '23505' ? `Ya existe la zona "${parsed.data.code}" en ese courier` : error.message
    return NextResponse.json({ error: msg }, { status: error.code === '23505' ? 409 : 500 })
  }
  return NextResponse.json({ success: true, data })
}
