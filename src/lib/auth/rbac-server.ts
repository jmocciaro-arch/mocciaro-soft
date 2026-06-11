import { getAdminClient } from '@/lib/supabase/admin'

type Admin = ReturnType<typeof getAdminClient>

export const ADMIN_ROLES = ['admin', 'super_admin', 'superadmin']

/**
 * Chequeo RBAC server-side para endpoints: rol legacy admin, o el permiso
 * vía tt_user_roles → tt_role_permissions → tt_permissions (mismo modelo que
 * src/lib/rbac.ts, pero con el admin client para no depender de RLS).
 */
export async function userHasRbacPermission(
  admin: Admin,
  ttUserId: string,
  role: string,
  permission: string,
): Promise<boolean> {
  if (ADMIN_ROLES.includes(role)) return true
  const { data: userRoles } = await admin
    .from('tt_user_roles').select('role_id').eq('user_id', ttUserId)
  const roleIds = ((userRoles ?? []) as { role_id: string }[]).map(r => r.role_id)
  if (roleIds.length === 0) return false
  const { data } = await admin
    .from('tt_role_permissions')
    .select('permission:tt_permissions!inner(name)')
    .in('role_id', roleIds)
    .eq('permission.name', permission)
    .limit(1)
  return (data?.length ?? 0) > 0
}

/** IDs de empresas accesibles: todas para roles admin, si no las de tt_user_companies. */
export async function accessibleCompanyIds(
  admin: Admin,
  ttUserId: string,
  role: string,
): Promise<string[] | 'all'> {
  if (ADMIN_ROLES.includes(role)) return 'all'
  const { data } = await admin
    .from('tt_user_companies').select('company_id').eq('user_id', ttUserId)
  return ((data ?? []) as { company_id: string }[]).map(r => r.company_id)
}
