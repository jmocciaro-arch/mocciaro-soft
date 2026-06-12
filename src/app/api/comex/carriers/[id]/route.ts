import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { requireComex, loadCarrierChecked } from '@/lib/comex/guards'

export const runtime = 'nodejs'

type Ctx = { params: Promise<{ id: string }> }

const patchSchema = z.object({
  code: z.string().trim().min(1).max(30).optional(),
  name: z.string().trim().min(1).max(80).optional(),
  volumetric_divisor: z.number().int().positive().optional(),
  active: z.boolean().optional(),
}).refine(d => Object.keys(d).length > 0, { message: 'Sin cambios' })

/** PATCH /api/comex/carriers/:id — edición (company_id no se cambia). */
export async function PATCH(req: NextRequest, { params }: Ctx) {
  const ctx = await requireComex('manage_comex')
  if (!ctx.ok) return ctx.response
  const { id } = await params

  const carrier = await loadCarrierChecked(ctx, id)
  if (!carrier.ok) return carrier.response

  let body: unknown
  try { body = await req.json() } catch { return NextResponse.json({ error: 'JSON inválido' }, { status: 400 }) }
  const parsed = patchSchema.safeParse(body)
  if (!parsed.success) return NextResponse.json({ error: 'Validación falló', issues: z.treeifyError(parsed.error) }, { status: 400 })

  const { data, error } = await ctx.admin
    .from('tt_carriers')
    .update({ ...parsed.data, updated_at: new Date().toISOString() })
    .eq('id', id)
    .select('id, company_id, code, name, volumetric_divisor, active')
    .single()
  if (error) {
    const msg = error.code === '23505' ? 'Ya existe un courier con ese código en la empresa' : error.message
    return NextResponse.json({ error: msg }, { status: error.code === '23505' ? 409 : 500 })
  }
  return NextResponse.json({ success: true, data })
}

/** DELETE /api/comex/carriers/:id — borra el courier y, en cascada, zonas/tarifas. */
export async function DELETE(_req: NextRequest, { params }: Ctx) {
  const ctx = await requireComex('manage_comex')
  if (!ctx.ok) return ctx.response
  const { id } = await params

  const carrier = await loadCarrierChecked(ctx, id)
  if (!carrier.ok) return carrier.response

  const { error } = await ctx.admin.from('tt_carriers').delete().eq('id', id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ success: true })
}
