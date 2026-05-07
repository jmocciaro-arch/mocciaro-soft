import { NextResponse } from 'next/server'
import { createClient as createServerClient } from '@/lib/supabase/server'

/**
 * Wrapper server-side único de filtrado por company_id.
 *
 * Fase 0.2 del PLAN-REFACTOR. Hasta ahora cada endpoint /api/* hacía
 * su propio filtrado, lo que permitía que una línea olvidada filtrara
 * datos cross-company. Esta función centraliza el chequeo:
 *
 *   1. Identifica al usuario actual (cookie de sesión).
 *   2. Calcula el set de companies accesibles:
 *      - admin/super_admin: todas las activas.
 *      - resto: solo las de tt_user_companies.
 *   3. Devuelve un helper `applyFilter(query)` que agrega `.in('company_id', ...)` automáticamente.
 *   4. Devuelve `assertAccess(companyId)` para validar que un ID puntual
 *      está dentro del set accesible (útil para endpoints `/[id]`).
 *
 * USO en un endpoint:
 *
 *   export async function GET() {
 *     const guard = await withCompanyFilter()
 *     if (!guard.ok) return guard.response
 *     const { applyFilter, ttUserId } = guard
 *
 *     const sb = getAdminClient()
 *     let q = sb.from('tt_documents').select('id, doc_type, total')
 *     q = applyFilter(q)            // ← aplica .in('company_id', accessibleIds)
 *     const { data } = await q
 *     return NextResponse.json(data)
 *   }
 *
 *   // O para validar acceso a un ID puntual antes de leerlo:
 *
 *   export async function GET(_req, { params }) {
 *     const guard = await withCompanyFilter()
 *     if (!guard.ok) return guard.response
 *     const { id } = await params
 *     const sb = getAdminClient()
 *     const { data: doc } = await sb.from('tt_documents').select('company_id').eq('id', id).single()
 *     if (!doc) return NextResponse.json({ error: 'No encontrado' }, { status: 404 })
 *     if (!guard.assertAccess(doc.company_id)) {
 *       return NextResponse.json({ error: 'Acceso denegado' }, { status: 403 })
 *     }
 *     // ... resto del endpoint
 *   }
 *
 * NO hace bypass de RLS por sí solo — las tablas con RLS habilitada
 * siguen aplicando sus policies. Este wrapper es una capa adicional
 * para endpoints que usan service_role (que sí bypassea RLS).
 */

type SupabaseQuery = {
  in: (column: string, values: string[]) => SupabaseQuery
}

interface FilterContextOk {
  ok: true
  authId: string
  ttUserId: string
  role: string
  /** IDs de empresas accesibles (puede ser ['*'] si admin sin restricción). */
  accessibleCompanyIds: string[]
  /** true si el rol es admin/super_admin (ve todas las empresas). */
  isAdmin: boolean
  /**
   * Aplica `.in('company_id', accessibleCompanyIds)` a una query Supabase.
   * Si `column` no es company_id (ej: vista que tiene `org_id`), pasalo explícito.
   * NUNCA filtra por todo si la lista está vacía — agrega un UUID imposible para
   * garantizar 0 resultados (defense in depth).
   */
  applyFilter: <Q>(query: Q, column?: string) => Q
  /**
   * Verifica que `companyId` está dentro del set accesible.
   * Usar antes de devolver datos de un ID puntual.
   */
  assertAccess: (companyId: string | null | undefined) => boolean
}
type FilterContextFail = { ok: false; response: NextResponse }

const IMPOSSIBLE_COMPANY_ID = '00000000-0000-0000-0000-000000000000'

export async function withCompanyFilter(): Promise<FilterContextOk | FilterContextFail> {
  const sb = await createServerClient()

  const { data: userData } = await sb.auth.getUser()
  if (!userData?.user) {
    return { ok: false, response: NextResponse.json({ error: 'No autenticado' }, { status: 401 }) }
  }
  const authId = userData.user.id

  const { data: ttUser } = await sb
    .from('tt_users')
    .select('id, role, active')
    .eq('auth_id', authId)
    .maybeSingle()

  if (!ttUser || ttUser.active === false) {
    return { ok: false, response: NextResponse.json({ error: 'Usuario no habilitado' }, { status: 403 }) }
  }

  const role = (ttUser.role as string) ?? ''
  const ttUserId = ttUser.id as string
  const isAdmin = ['admin', 'super_admin', 'superadmin'].includes(role)

  let accessibleCompanyIds: string[]

  if (isAdmin) {
    const { data: allCompanies } = await sb
      .from('tt_companies')
      .select('id')
      .eq('active', true)
    accessibleCompanyIds = (allCompanies ?? []).map((c) => c.id as string)
  } else {
    const { data: ucs } = await sb
      .from('tt_user_companies')
      .select('company_id')
      .eq('user_id', ttUserId)
    accessibleCompanyIds = (ucs ?? []).map((u) => u.company_id as string)
  }

  // Defense in depth: lista vacía → UUID imposible para garantizar 0 resultados.
  const safeIds = accessibleCompanyIds.length > 0 ? accessibleCompanyIds : [IMPOSSIBLE_COMPANY_ID]

  const applyFilter = <Q>(query: Q, column = 'company_id'): Q => {
    return (query as unknown as SupabaseQuery).in(column, safeIds) as unknown as Q
  }

  const assertAccess = (companyId: string | null | undefined): boolean => {
    if (!companyId) return false
    if (isAdmin && safeIds.includes(companyId)) return true
    return accessibleCompanyIds.includes(companyId)
  }

  return {
    ok: true,
    authId,
    ttUserId,
    role,
    accessibleCompanyIds,
    isAdmin,
    applyFilter,
    assertAccess,
  }
}

/**
 * Helper para endpoints que reciben un company_id en el body/query y necesitan
 * validar acceso ANTES de hacer la operación.
 *
 * Ejemplo:
 *   const guard = await withCompanyFilter()
 *   if (!guard.ok) return guard.response
 *   const { searchParams } = new URL(req.url)
 *   const companyId = searchParams.get('company_id')
 *   const access = ensureCompanyAccess(guard, companyId)
 *   if (!access.ok) return access.response
 *   // ... seguir con companyId validado
 */
export function ensureCompanyAccess(
  guard: FilterContextOk,
  companyId: string | null | undefined
): { ok: true; companyId: string } | { ok: false; response: NextResponse } {
  if (!companyId) {
    return { ok: false, response: NextResponse.json({ error: 'company_id requerido' }, { status: 400 }) }
  }
  if (!guard.assertAccess(companyId)) {
    return { ok: false, response: NextResponse.json({ error: 'Acceso denegado a esta empresa' }, { status: 403 }) }
  }
  return { ok: true, companyId }
}
