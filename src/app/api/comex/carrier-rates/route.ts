import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { requireComex, loadCarrierChecked } from '@/lib/comex/guards'

export const runtime = 'nodejs'

const COLS = 'id, company_id, carrier_id, service_id, zone_id, weight_from_kg, weight_to_kg, price, per_kg_over, currency, updated_at'

const rateSchema = z.object({
  carrier_id: z.string().uuid(),
  zone_id: z.string().uuid(),
  weight_from_kg: z.number().nonnegative(),
  weight_to_kg: z.number().positive(),
  price: z.number().nonnegative(),
  per_kg_over: z.number().nonnegative().nullable().optional(),
  currency: z.string().trim().length(3).default('EUR'),
}).refine(d => d.weight_to_kg > d.weight_from_kg, { message: 'weight_to_kg debe ser mayor que weight_from_kg' })

/** GET /api/comex/carrier-rates?carrier_id=&zone_id= — bandas de tarifa. view_comex. */
export async function GET(req: NextRequest) {
  const ctx = await requireComex('view_comex')
  if (!ctx.ok) return ctx.response
  const carrierId = req.nextUrl.searchParams.get('carrier_id')
  const zoneId = req.nextUrl.searchParams.get('zone_id')
  if (!carrierId) return NextResponse.json({ error: 'Falta carrier_id' }, { status: 400 })

  const carrier = await loadCarrierChecked(ctx, carrierId)
  if (!carrier.ok) return carrier.response

  let query = ctx.admin.from('tt_carrier_rates').select(COLS).eq('carrier_id', carrierId).order('weight_from_kg')
  if (zoneId) query = query.eq('zone_id', zoneId)
  const { data, error } = await query
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ data })
}

/** POST /api/comex/carrier-rates — alta de banda. manage_comex + acceso vía carrier. */
export async function POST(req: NextRequest) {
  const ctx = await requireComex('manage_comex')
  if (!ctx.ok) return ctx.response

  let body: unknown
  try { body = await req.json() } catch { return NextResponse.json({ error: 'JSON inválido' }, { status: 400 }) }
  const parsed = rateSchema.safeParse(body)
  if (!parsed.success) return NextResponse.json({ error: 'Validación falló', issues: z.treeifyError(parsed.error) }, { status: 400 })

  const carrier = await loadCarrierChecked(ctx, parsed.data.carrier_id)
  if (!carrier.ok) return carrier.response

  // La zona debe pertenecer al mismo carrier (evita cruzar tarifas entre couriers).
  const { data: zone } = await ctx.admin
    .from('tt_carrier_zones').select('id, carrier_id').eq('id', parsed.data.zone_id).maybeSingle()
  if (!zone || zone.carrier_id !== parsed.data.carrier_id) {
    return NextResponse.json({ error: 'La zona no pertenece a ese courier' }, { status: 400 })
  }

  // company_id se deriva del carrier: una tarifa siempre es de la empresa del courier.
  const row = { ...parsed.data, company_id: carrier.carrier.company_id }
  const { data, error } = await ctx.admin.from('tt_carrier_rates').insert(row).select(COLS).single()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ success: true, data })
}
