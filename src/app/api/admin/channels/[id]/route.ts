import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { getAdminClient } from '@/lib/supabase/admin'
import { requireAuth, userHasCompanyAccess } from '@/lib/auth/require-admin'
import { userHasRbacPermission } from '@/lib/auth/rbac-server'

export const runtime = 'nodejs'

type Ctx = { params: Promise<{ id: string }> }

const toggleSchema = z.object({ enabled: z.boolean() })

/**
 * PATCH /api/admin/channels/:id — toggle de habilitación (spec §4).
 * Habilitar: enabled=true + status='onboarding' (si ya estaba 'active' no
 * se lo degrada). Deshabilitar: enabled=false, el status queda como está.
 * Requiere manage_channels + acceso a la empresa del canal.
 */
export async function PATCH(req: NextRequest, { params }: Ctx) {
  const auth = await requireAuth()
  if (!auth.ok) return auth.response
  const { id } = await params
  const admin = getAdminClient()

  const allowed = await userHasRbacPermission(admin, auth.ttUserId, auth.role, 'manage_channels')
  if (!allowed) return NextResponse.json({ error: 'Falta el permiso manage_channels' }, { status: 403 })

  let body: unknown
  try { body = await req.json() } catch {
    return NextResponse.json({ error: 'JSON inválido' }, { status: 400 })
  }
  const parsed = toggleSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: 'Validación falló', issues: z.treeifyError(parsed.error) }, { status: 400 })
  }

  const { data: channel, error: chErr } = await admin
    .from('tt_channels')
    .select('id, company_id, status, enabled')
    .eq('id', id)
    .maybeSingle()
  if (chErr) return NextResponse.json({ error: chErr.message }, { status: 500 })
  if (!channel) return NextResponse.json({ error: 'Canal no encontrado' }, { status: 404 })

  const canAccess = await userHasCompanyAccess(auth.ttUserId, auth.role, channel.company_id as string)
  if (!canAccess) return NextResponse.json({ error: 'Sin acceso a esa empresa' }, { status: 403 })

  const patch: Record<string, unknown> = parsed.data.enabled
    ? { enabled: true, status: channel.status === 'active' ? 'active' : 'onboarding', updated_at: new Date().toISOString() }
    : { enabled: false, updated_at: new Date().toISOString() }

  const { data, error } = await admin
    .from('tt_channels')
    .update(patch)
    .eq('id', id)
    .select('id, company_id, code, label, enabled, status')
    .single()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ success: true, data })
}
