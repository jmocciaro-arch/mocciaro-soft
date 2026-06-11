import { NextRequest, NextResponse } from 'next/server'
import { getAdminClient } from '@/lib/supabase/admin'
import { requireAuth, userHasCompanyAccess } from '@/lib/auth/require-admin'
import { userHasRbacPermission } from '@/lib/auth/rbac-server'
import {
  verifyState,
  exchangeCodeForTokens,
  fetchMlNickname,
  persistMlTokens,
} from '@/lib/channels/mercadolibre'

export const runtime = 'nodejs'

/** Redirige a la tab de Canales con un flag de resultado para el toast. */
function back(req: NextRequest, status: 'connected' | 'error' | 'denied', detail?: string): NextResponse {
  const url = new URL('/admin?tab=canales', req.url)
  url.searchParams.set('ml', status)
  if (detail) url.searchParams.set('ml_detail', detail.slice(0, 140))
  return NextResponse.redirect(url)
}

/**
 * GET /api/channels/mercadolibre/callback?code=&state=
 * Vuelta del OAuth de ML. Verifica el state firmado, revalida sesión + permiso +
 * acceso a la empresa (defense in depth), canjea el code por tokens y los guarda
 * en el canal, dejándolo enabled + status='active'.
 */
export async function GET(req: NextRequest) {
  const sp = req.nextUrl.searchParams

  // El usuario canceló la autorización en ML.
  const oauthError = sp.get('error')
  if (oauthError) return back(req, 'denied', sp.get('error_description') ?? oauthError)

  const payload = verifyState(sp.get('state'))
  if (!payload) return back(req, 'error', 'State inválido o expirado')

  const code = sp.get('code')
  if (!code) return back(req, 'error', 'Sin código de autorización')

  const auth = await requireAuth()
  if (!auth.ok) return back(req, 'error', 'Sesión no válida')

  const admin = getAdminClient()

  const allowed = await userHasRbacPermission(admin, auth.ttUserId, auth.role, 'manage_channels')
  if (!allowed) return back(req, 'error', 'Falta el permiso manage_channels')

  const canAccess = await userHasCompanyAccess(auth.ttUserId, auth.role, payload.co)
  if (!canAccess) return back(req, 'error', 'Sin acceso a esa empresa')

  // El canal del state debe seguir siendo un mercadolibre de esa empresa.
  const { data: channel } = await admin
    .from('tt_channels')
    .select('id, company_id, code')
    .eq('id', payload.cid)
    .maybeSingle()
  if (!channel || channel.code !== 'mercadolibre' || channel.company_id !== payload.co) {
    return back(req, 'error', 'Canal no válido')
  }

  try {
    const tokens = await exchangeCodeForTokens(code)
    // ML solo manda refresh_token con el scope offline_access; sin él la
    // conexión moriría en silencio a las ~6 hs. Mejor cortar acá con causa clara.
    const { refresh_token: refreshToken } = tokens
    if (!refreshToken) {
      return back(req, 'error', 'ML no devolvió refresh_token: habilitá el scope offline_access de la app en el DevCenter')
    }
    const nickname = await fetchMlNickname(tokens.access_token)
    await persistMlTokens(admin, payload.cid, { ...tokens, refresh_token: refreshToken }, nickname, auth.ttUserId)
  } catch (e) {
    return back(req, 'error', (e as Error).message)
  }

  return back(req, 'connected')
}
