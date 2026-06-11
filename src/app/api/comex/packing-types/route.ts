import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { getAdminClient } from '@/lib/supabase/admin'
import { requireAuth } from '@/lib/auth/require-admin'
import { userHasRbacPermission } from '@/lib/auth/rbac-server'

export const runtime = 'nodejs'

const COLS = 'id, kind, code, label, length_cm, width_cm, height_cm, max_height_cm, tare_weight_kg, max_payload_kg, active, updated_at'

const packingSchema = z.object({
  kind: z.enum(['pallet', 'caja', 'sobre', 'otro']),
  code: z.string().trim().min(1).max(40),
  label: z.string().trim().min(1).max(120),
  length_cm: z.number().positive(),
  width_cm: z.number().positive(),
  height_cm: z.number().positive().nullable().optional(),
  max_height_cm: z.number().positive().nullable().optional(),
  tare_weight_kg: z.number().nonnegative().default(0),
  max_payload_kg: z.number().positive().nullable().optional(),
  active: z.boolean().default(true),
})

/** GET — lista de tipos de packing (catálogo global). Requiere view_comex. */
export async function GET() {
  const auth = await requireAuth()
  if (!auth.ok) return auth.response
  const admin = getAdminClient()
  if (!(await userHasRbacPermission(admin, auth.ttUserId, auth.role, 'view_comex'))) {
    return NextResponse.json({ error: 'Falta el permiso view_comex' }, { status: 403 })
  }
  const { data, error } = await admin.from('tt_packing_types').select(COLS).order('kind').order('label')
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ data })
}

/** POST — alta de un tipo de packing. Requiere manage_comex. */
export async function POST(req: NextRequest) {
  const auth = await requireAuth()
  if (!auth.ok) return auth.response
  const admin = getAdminClient()
  if (!(await userHasRbacPermission(admin, auth.ttUserId, auth.role, 'manage_comex'))) {
    return NextResponse.json({ error: 'Falta el permiso manage_comex' }, { status: 403 })
  }
  let body: unknown
  try { body = await req.json() } catch { return NextResponse.json({ error: 'JSON inválido' }, { status: 400 }) }
  const parsed = packingSchema.safeParse(body)
  if (!parsed.success) return NextResponse.json({ error: 'Validación falló', issues: z.treeifyError(parsed.error) }, { status: 400 })

  const { data, error } = await admin.from('tt_packing_types').insert(parsed.data).select(COLS).single()
  if (error) {
    const msg = error.code === '23505' ? `Ya existe un packing con el código "${parsed.data.code}"` : error.message
    return NextResponse.json({ error: msg }, { status: error.code === '23505' ? 409 : 500 })
  }
  return NextResponse.json({ success: true, data })
}
