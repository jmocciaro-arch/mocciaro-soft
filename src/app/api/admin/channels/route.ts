import { NextResponse } from 'next/server'
import { getAdminClient } from '@/lib/supabase/admin'
import { requireAuth } from '@/lib/auth/require-admin'
import { userHasRbacPermission, accessibleCompanyIds } from '@/lib/auth/rbac-server'

export const runtime = 'nodejs'

/**
 * GET /api/admin/channels — todos los canales por empresa para la tab
 * Admin → Canales (spec §4). Requiere manage_channels.
 *
 * Va por admin client porque la RLS de tt_channels es company-scoped vía
 * current_company_id() (empresa default del usuario), y esta pantalla
 * administra los canales de TODAS las empresas accesibles.
 */
export async function GET() {
  const auth = await requireAuth()
  if (!auth.ok) return auth.response
  const admin = getAdminClient()

  const allowed = await userHasRbacPermission(admin, auth.ttUserId, auth.role, 'manage_channels')
  if (!allowed) return NextResponse.json({ error: 'Falta el permiso manage_channels' }, { status: 403 })

  let query = admin
    .from('tt_channels')
    .select('id, company_id, code, label, enabled, status, last_sync_at, company:tt_companies(name)')
    .order('company_id').order('label')

  const accessible = await accessibleCompanyIds(admin, auth.ttUserId, auth.role)
  if (accessible !== 'all') {
    if (accessible.length === 0) return NextResponse.json({ data: [] })
    query = query.in('company_id', accessible)
  }

  const { data, error } = await query
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ data })
}
