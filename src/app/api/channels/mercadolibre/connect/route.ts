import { NextRequest, NextResponse } from 'next/server'
import { getAdminClient } from '@/lib/supabase/admin'
import { requireAuth, userHasCompanyAccess } from '@/lib/auth/require-admin'
import { userHasRbacPermission } from '@/lib/auth/rbac-server'
import { buildAuthorizeUrl, signState, getMlOAuthConfig } from '@/lib/channels/mercadolibre'

export const runtime = 'nodejs'

/**
 * GET /api/channels/mercadolibre/connect?channel_id=:id
 * Arranca el OAuth de MercadoLibre para un canal concreto (una empresa).
 * Valida sesión + manage_channels + acceso a la empresa, firma el state con el
 * channel_id y redirige a la pantalla de autorización de ML.
 */
export async function GET(req: NextRequest) {
  const auth = await requireAuth()
  if (!auth.ok) return auth.response

  const channelId = req.nextUrl.searchParams.get('channel_id')
  if (!channelId) {
    return NextResponse.json({ error: 'Falta channel_id' }, { status: 400 })
  }

  const admin = getAdminClient()

  const allowed = await userHasRbacPermission(admin, auth.ttUserId, auth.role, 'manage_channels')
  if (!allowed) return NextResponse.json({ error: 'Falta el permiso manage_channels' }, { status: 403 })

  const { data: channel, error } = await admin
    .from('tt_channels')
    .select('id, company_id, code')
    .eq('id', channelId)
    .maybeSingle()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  if (!channel) return NextResponse.json({ error: 'Canal no encontrado' }, { status: 404 })
  if (channel.code !== 'mercadolibre') {
    return NextResponse.json({ error: 'Este canal no es MercadoLibre' }, { status: 400 })
  }

  const canAccess = await userHasCompanyAccess(auth.ttUserId, auth.role, channel.company_id as string)
  if (!canAccess) return NextResponse.json({ error: 'Sin acceso a esa empresa' }, { status: 403 })

  // Falla temprano y legible si faltan las env vars (en vez de redirigir a ML con client_id vacío).
  try {
    getMlOAuthConfig()
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 })
  }

  const state = signState({ cid: channel.id as string, co: channel.company_id as string, ts: Date.now() })
  return NextResponse.redirect(buildAuthorizeUrl(state))
}
