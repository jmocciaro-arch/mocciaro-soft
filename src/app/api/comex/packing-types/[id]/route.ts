import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { getAdminClient } from '@/lib/supabase/admin'
import { requireAuth } from '@/lib/auth/require-admin'
import { userHasRbacPermission } from '@/lib/auth/rbac-server'

export const runtime = 'nodejs'

type Ctx = { params: Promise<{ id: string }> }

const COLS = 'id, kind, code, label, length_cm, width_cm, height_cm, max_height_cm, tare_weight_kg, max_payload_kg, active, updated_at'

const patchSchema = z.object({
  kind: z.enum(['pallet', 'caja', 'sobre', 'otro']).optional(),
  code: z.string().trim().min(1).max(40).optional(),
  label: z.string().trim().min(1).max(120).optional(),
  length_cm: z.number().positive().optional(),
  width_cm: z.number().positive().optional(),
  height_cm: z.number().positive().nullable().optional(),
  max_height_cm: z.number().positive().nullable().optional(),
  tare_weight_kg: z.number().nonnegative().optional(),
  max_payload_kg: z.number().positive().nullable().optional(),
  active: z.boolean().optional(),
}).refine(d => Object.keys(d).length > 0, { message: 'Sin cambios' })

async function guard() {
  const auth = await requireAuth()
  if (!auth.ok) return { ok: false as const, response: auth.response }
  const admin = getAdminClient()
  if (!(await userHasRbacPermission(admin, auth.ttUserId, auth.role, 'manage_comex'))) {
    return { ok: false as const, response: NextResponse.json({ error: 'Falta el permiso manage_comex' }, { status: 403 }) }
  }
  return { ok: true as const, admin }
}

/** PATCH — edita un tipo de packing. */
export async function PATCH(req: NextRequest, { params }: Ctx) {
  const g = await guard()
  if (!g.ok) return g.response
  const { id } = await params
  let body: unknown
  try { body = await req.json() } catch { return NextResponse.json({ error: 'JSON inválido' }, { status: 400 }) }
  const parsed = patchSchema.safeParse(body)
  if (!parsed.success) return NextResponse.json({ error: 'Validación falló', issues: z.treeifyError(parsed.error) }, { status: 400 })

  const { data, error } = await g.admin
    .from('tt_packing_types')
    .update({ ...parsed.data, updated_at: new Date().toISOString() })
    .eq('id', id).select(COLS).single()
  if (error) {
    const msg = error.code === '23505' ? 'Ya existe un packing con ese código' : error.message
    return NextResponse.json({ error: msg }, { status: error.code === '23505' ? 409 : 500 })
  }
  return NextResponse.json({ success: true, data })
}

/** DELETE — baja de un tipo de packing. */
export async function DELETE(_req: NextRequest, { params }: Ctx) {
  const g = await guard()
  if (!g.ok) return g.response
  const { id } = await params
  const { error } = await g.admin.from('tt_packing_types').delete().eq('id', id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ success: true })
}
