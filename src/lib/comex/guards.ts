import { NextResponse } from 'next/server'
import type { SupabaseClient } from '@supabase/supabase-js'
import { getAdminClient } from '@/lib/supabase/admin'
import { requireAuth, userHasCompanyAccess } from '@/lib/auth/require-admin'
import { userHasRbacPermission, accessibleCompanyIds } from '@/lib/auth/rbac-server'

export interface ComexCtx {
  ok: true
  admin: SupabaseClient
  ttUserId: string
  role: string
}
export type ComexGuardResult = ComexCtx | { ok: false; response: NextResponse }

/** Guard común de los endpoints Comex: sesión + permiso RBAC. */
export async function requireComex(permission: 'view_comex' | 'manage_comex'): Promise<ComexGuardResult> {
  const auth = await requireAuth()
  if (!auth.ok) return { ok: false, response: auth.response }
  const admin = getAdminClient()
  if (!(await userHasRbacPermission(admin, auth.ttUserId, auth.role, permission))) {
    return { ok: false, response: NextResponse.json({ error: `Falta el permiso ${permission}` }, { status: 403 }) }
  }
  return { ok: true, admin, ttUserId: auth.ttUserId, role: auth.role }
}

/** Empresas accesibles del usuario ('all' para roles admin). */
export function companiesFor(ctx: ComexCtx) {
  return accessibleCompanyIds(ctx.admin, ctx.ttUserId, ctx.role)
}

/** 403 si el usuario no accede a la empresa. */
export async function checkCompany(ctx: ComexCtx, companyId: string): Promise<NextResponse | null> {
  const can = await userHasCompanyAccess(ctx.ttUserId, ctx.role, companyId)
  return can ? null : NextResponse.json({ error: 'Sin acceso a esa empresa' }, { status: 403 })
}

/**
 * Carga un carrier y valida acceso a su empresa. Las zonas/tarifas heredan el
 * scoping por esta vía (zona → carrier → company).
 */
export async function loadCarrierChecked(ctx: ComexCtx, carrierId: string): Promise<
  { ok: true; carrier: { id: string; company_id: string } } | { ok: false; response: NextResponse }
> {
  const { data: carrier, error } = await ctx.admin
    .from('tt_carriers')
    .select('id, company_id')
    .eq('id', carrierId)
    .maybeSingle()
  // Un error de DB no es "no existe": devolver 500 evita enmascarar fallas transitorias.
  if (error) return { ok: false, response: NextResponse.json({ error: error.message }, { status: 500 }) }
  if (!carrier) return { ok: false, response: NextResponse.json({ error: 'Courier no encontrado' }, { status: 404 }) }
  const denied = await checkCompany(ctx, carrier.company_id as string)
  if (denied) return { ok: false, response: denied }
  return { ok: true, carrier: carrier as { id: string; company_id: string } }
}
