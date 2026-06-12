import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { requireComex, loadCarrierChecked, type ComexCtx } from '@/lib/comex/guards'

export const runtime = 'nodejs'

type Ctx = { params: Promise<{ id: string }> }

const patchSchema = z.object({
  code: z.string().trim().min(1).max(30).optional(),
  label: z.string().trim().min(1).max(80).optional(),
  country_codes: z.array(z.string().trim().toUpperCase().length(2)).optional(),
  active: z.boolean().optional(),
}).refine(d => Object.keys(d).length > 0, { message: 'Sin cambios' })

/** Carga la zona y valida acceso vía su carrier. */
async function loadZoneChecked(ctx: ComexCtx, zoneId: string) {
  const { data: zone, error } = await ctx.admin
    .from('tt_carrier_zones').select('id, carrier_id').eq('id', zoneId).maybeSingle()
  if (error) return { ok: false as const, response: NextResponse.json({ error: error.message }, { status: 500 }) }
  if (!zone) return { ok: false as const, response: NextResponse.json({ error: 'Zona no encontrada' }, { status: 404 }) }
  const carrier = await loadCarrierChecked(ctx, zone.carrier_id as string)
  if (!carrier.ok) return carrier
  return { ok: true as const }
}

export async function PATCH(req: NextRequest, { params }: Ctx) {
  const ctx = await requireComex('manage_comex')
  if (!ctx.ok) return ctx.response
  const { id } = await params
  const zone = await loadZoneChecked(ctx, id)
  if (!zone.ok) return zone.response

  let body: unknown
  try { body = await req.json() } catch { return NextResponse.json({ error: 'JSON inválido' }, { status: 400 }) }
  const parsed = patchSchema.safeParse(body)
  if (!parsed.success) return NextResponse.json({ error: 'Validación falló', issues: z.treeifyError(parsed.error) }, { status: 400 })

  const { data, error } = await ctx.admin
    .from('tt_carrier_zones')
    .update({ ...parsed.data, updated_at: new Date().toISOString() })
    .eq('id', id)
    .select('id, carrier_id, code, label, country_codes, active')
    .single()
  if (error) {
    const msg = error.code === '23505' ? 'Ya existe una zona con ese código en el courier' : error.message
    return NextResponse.json({ error: msg }, { status: error.code === '23505' ? 409 : 500 })
  }
  return NextResponse.json({ success: true, data })
}

export async function DELETE(_req: NextRequest, { params }: Ctx) {
  const ctx = await requireComex('manage_comex')
  if (!ctx.ok) return ctx.response
  const { id } = await params
  const zone = await loadZoneChecked(ctx, id)
  if (!zone.ok) return zone.response

  const { error } = await ctx.admin.from('tt_carrier_zones').delete().eq('id', id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ success: true })
}
