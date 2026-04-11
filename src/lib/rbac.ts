import { createClient } from '@/lib/supabase/client'

export interface UserPermissions {
  roles: string[]
  permissions: Set<string>
  teams: string[]
  isSuper: boolean
}

// Cache permissions for the session
let cachedPermissions: UserPermissions | null = null
let cachedUserId: string | null = null

export async function getUserPermissions(userId: string): Promise<UserPermissions> {
  if (cachedPermissions && cachedUserId === userId) return cachedPermissions

  const supabase = createClient()

  // Get user's roles
  const { data: userRoles } = await supabase
    .from('tt_user_roles')
    .select('role:tt_roles(name)')
    .eq('user_id', userId)

  const roles = (userRoles || []).map((ur: Record<string, unknown>) => (ur.role as Record<string, unknown>)?.name as string).filter(Boolean)

  // Get role IDs for permission lookup
  const { data: roleData } = await supabase
    .from('tt_roles')
    .select('id, name')
    .in('name', roles.length > 0 ? roles : ['__none__'])

  const roleIds = (roleData || []).map((r: Record<string, unknown>) => r.id as string)

  // Get permissions for these roles
  let permissions = new Set<string>()
  if (roleIds.length > 0) {
    const { data: rolePerms } = await supabase
      .from('tt_role_permissions')
      .select('permission:tt_permissions(name)')
      .in('role_id', roleIds)

    permissions = new Set(
      (rolePerms || []).map((rp: Record<string, unknown>) => (rp.permission as Record<string, unknown>)?.name as string).filter(Boolean)
    )
  }

  // Get user's teams
  const { data: userTeams } = await supabase
    .from('tt_user_teams')
    .select('team:tt_teams(name)')
    .eq('user_id', userId)

  const teams = (userTeams || []).map((ut: Record<string, unknown>) => (ut.team as Record<string, unknown>)?.name as string).filter(Boolean)

  const isSuper = roles.includes('super_admin')

  cachedPermissions = { roles, permissions, teams, isSuper }
  cachedUserId = userId
  return cachedPermissions
}

export function hasPermission(perms: UserPermissions, permission: string): boolean {
  if (perms.isSuper) return true
  return perms.permissions.has(permission)
}

export function hasAnyPermission(perms: UserPermissions, permissionList: string[]): boolean {
  if (perms.isSuper) return true
  return permissionList.some(p => perms.permissions.has(p))
}

export function hasRole(perms: UserPermissions, role: string): boolean {
  return perms.roles.includes(role)
}

export function clearPermissionCache() {
  cachedPermissions = null
  cachedUserId = null
}
