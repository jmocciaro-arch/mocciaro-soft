'use client'

import { usePermissions } from '@/hooks/use-permissions'
import { Lock } from 'lucide-react'

interface PermissionGuardProps {
  permission?: string
  permissions?: string[]
  requireAll?: boolean
  children: React.ReactNode
  fallback?: React.ReactNode
}

export function PermissionGuard({ permission, permissions, requireAll = false, children, fallback }: PermissionGuardProps) {
  const { can, canAny, loading, isSuper } = usePermissions()

  if (loading) return null
  if (isSuper) return <>{children}</>

  let allowed = false
  if (permission) {
    allowed = can(permission)
  } else if (permissions) {
    allowed = requireAll ? permissions.every(p => can(p)) : canAny(permissions)
  }

  if (!allowed) {
    return fallback ? <>{fallback}</> : (
      <div className="flex flex-col items-center justify-center py-20 text-[#4B5563]">
        <Lock size={40} className="mb-4" />
        <p className="text-lg font-medium">Acceso restringido</p>
        <p className="text-sm mt-1">No tenes permisos para ver esta seccion</p>
      </div>
    )
  }

  return <>{children}</>
}
