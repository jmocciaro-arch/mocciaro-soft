import { NextResponse } from 'next/server'
import { createClient as createServerClient } from '@/lib/supabase/server'

/**
 * Guards para endpoints de companies.
 * Lee la cookie de sesión, consulta tt_users.role y devuelve 401/403 si no
 * corresponde. El endpoint sigue usando getAdminClient() para la cascada
 * (defense in depth: guard + RLS).
 */

type AdminOk = {
  ok: true
  authId: string
  ttUserId: string
  role: 'admin' | 'super_admin' | 'superadmin'
}
type GuardFail = { ok: false; response: NextResponse }

export async function requireAdmin(): Promise<AdminOk | GuardFail> {
  const sb = await createServerClient()
  const { data: userData } = await sb.auth.getUser()

  if (!userData?.user) {
    return { ok: false, response: NextResponse.json({ error: 'No autenticado' }, { status: 401 }) }
  }

  const authId = userData.user.id

  const { data: tt, error } = await sb
    .from('tt_users')
    .select('id, role, active')
    .eq('auth_id', authId)
    .maybeSingle()

  if (error || !tt) {
    return { ok: false, response: NextResponse.json({ error: 'Usuario sin registro en tt_users' }, { status: 403 }) }
  }

  if (tt.active === false) {
    return { ok: false, response: NextResponse.json({ error: 'Usuario inactivo' }, { status: 403 }) }
  }

  const role = tt.role as string
  if (!['admin', 'super_admin', 'superadmin'].includes(role)) {
    return { ok: false, response: NextResponse.json({ error: 'Permisos insuficientes' }, { status: 403 }) }
  }

  return { ok: true, authId, ttUserId: tt.id as string, role: role as AdminOk['role'] }
}

type AuthOk = { ok: true; authId: string; ttUserId: string; role: string }

export async function requireAuth(): Promise<AuthOk | GuardFail> {
  const sb = await createServerClient()
  const { data: userData } = await sb.auth.getUser()

  if (!userData?.user) {
    return { ok: false, response: NextResponse.json({ error: 'No autenticado' }, { status: 401 }) }
  }

  const authId = userData.user.id

  const { data: tt } = await sb
    .from('tt_users')
    .select('id, role, active')
    .eq('auth_id', authId)
    .maybeSingle()

  if (!tt || tt.active === false) {
    return { ok: false, response: NextResponse.json({ error: 'Usuario no habilitado' }, { status: 403 }) }
  }

  return { ok: true, authId, ttUserId: tt.id as string, role: (tt.role as string) ?? '' }
}

/**
 * Verifica que el usuario tenga acceso a esta empresa.
 * Admin/super_admin ven todas; el resto solo las empresas en tt_user_companies.
 */
export async function userHasCompanyAccess(ttUserId: string, role: string, companyId: string): Promise<boolean> {
  if (['admin', 'super_admin', 'superadmin'].includes(role)) return true

  const sb = await createServerClient()
  const { data } = await sb
    .from('tt_user_companies')
    .select('id')
    .eq('user_id', ttUserId)
    .eq('company_id', companyId)
    .maybeSingle()

  return !!data
}
