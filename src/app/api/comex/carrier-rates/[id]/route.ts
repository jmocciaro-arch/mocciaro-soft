import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { requireComex, loadCarrierChecked, type ComexCtx } from '@/lib/comex/guards'

export const runtime = 'nodejs'

type Ctx = { params: Promise<{ id: string }> }

const patchSchema = z.object({
  weight_from_kg: z.number().nonnegative().optional(),
  weight_to_kg: z.number().positive().optional(),
  price: z.number().nonnegative().optional(),
  per_kg_over: z.number().nonnegative().nullable().optional(),
  currency: z.string().trim().length(3).optional(),
}).refine(d => Object.keys(d).length > 0, { message: 'Sin cambios' })

async function loadRateChecked(ctx: ComexCtx, rateId: string) {
  const { data: rate, error } = await ctx.admin
    .from('tt_carrier_rates').select('id, carrier_id, weight_from_kg, weight_to_kg').eq('id', rateId).maybeSingle()
  if (error) return { ok: false as const, response: NextResponse.json({ error: error.message }, { status: 500 }) }
  if (!rate) return { ok: false as const, response: NextResponse.json({ error: 'Tarifa no encontrada' }, { status: 404 }) }
  const carrier = await loadCarrierChecked(ctx, rate.carrier_id as string)
  if (!carrier.ok) return carrier
  return { ok: true as const, rate }
}

export async function PATCH(req: NextRequest, { params }: Ctx) {
  const ctx = await requireComex('manage_comex')
  if (!ctx.ok) return ctx.response
  const { id } = await params
  const loaded = await loadRateChecked(ctx, id)
  if (!loaded.ok) return loaded.response

  let body: unknown
  try { body = await req.json() } catch { return NextResponse.json({ error: 'JSON inválido' }, { status: 400 }) }
  const parsed = patchSchema.safeParse(body)
  if (!parsed.success) return NextResponse.json({ error: 'Validación falló', issues: z.treeifyError(parsed.error) }, { status: 400 })

  // El CHECK weight_to > weight_from también debe valer combinando lo nuevo con lo existente.
  const from = parsed.data.weight_from_kg ?? Number(loaded.rate.weight_from_kg)
  const to = parsed.data.weight_to_kg ?? Number(loaded.rate.weight_to_kg)
  if (to <= from) return NextResponse.json({ error: 'El "hasta kg" debe ser mayor que el "desde kg"' }, { status: 400 })

  const { data, error } = await ctx.admin
    .from('tt_carrier_rates')
    .update({ ...parsed.data, updated_at: new Date().toISOString() })
    .eq('id', id)
    .select('id, carrier_id, zone_id, weight_from_kg, weight_to_kg, price, per_kg_over, currency')
    .single()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ success: true, data })
}

export async function DELETE(_req: NextRequest, { params }: Ctx) {
  const ctx = await requireComex('manage_comex')
  if (!ctx.ok) return ctx.response
  const { id } = await params
  const loaded = await loadRateChecked(ctx, id)
  if (!loaded.ok) return loaded.response

  const { error } = await ctx.admin.from('tt_carrier_rates').delete().eq('id', id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ success: true })
}
