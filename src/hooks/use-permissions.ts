'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import { getUserPermissions, hasPermission, hasAnyPermission, type UserPermissions } from '@/lib/rbac'

export function usePermissions() {
  const [permissions, setPermissions] = useState<UserPermissions | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    async function load() {
      try {
        const supabase = createClient()
        const { data: { user } } = await supabase.auth.getUser()
        if (!user) { setLoading(false); return }

        // Get tt_users record
        const { data: ttUser } = await supabase
          .from('tt_users')
          .select('id')
          .eq('auth_id', user.id)
          .single()

        if (!ttUser) { setLoading(false); return }

        const perms = await getUserPermissions(ttUser.id)
        setPermissions(perms)
      } catch {
        // Silently handle errors - user may not be logged in
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [])

  return {
    permissions,
    loading,
    can: (perm: string) => permissions ? hasPermission(permissions, perm) : false,
    canAny: (perms: string[]) => permissions ? hasAnyPermission(permissions, perms) : false,
    hasRole: (role: string) => permissions?.roles.includes(role) || false,
    isSuper: permissions?.isSuper || false,
  }
}
