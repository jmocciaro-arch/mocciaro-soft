import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { getAdminClient } from '@/lib/supabase/admin'
import { bankAccountCreateSchema } from '@/lib/schemas/companies'
import { requireAdmin, requireAuth, userHasCompanyAccess } from '@/lib/auth/require-admin'

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireAuth()
  if (!auth.ok) return auth.response
  const { id } = await params
  const canAccess = await userHasCompanyAccess(auth.ttUserId, auth.role, id)
  if (!canAccess) return NextResponse.json({ error: 'Sin acceso' }, { status: 403 })

  const admin = getAdminClient()
  const { data, error } = await admin
    .from('tt_company_bank_accounts')
    .select('*')
    .eq('company_id', id)
    .order('is_primary', { ascending: false })
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ data })
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const guard = await requireAdmin()
  if (!guard.ok) return guard.response
  const { id } = await params
  let body: unknown
  try { body = await req.json() } catch {
    return NextResponse.json({ error: 'JSON inválido' }, { status: 400 })
  }
  const parsed = bankAccountCreateSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: 'Validación falló', issues: z.treeifyError(parsed.error) }, { status: 400 })
  }
  const admin = getAdminClient()
  const { data, error } = await admin
    .from('tt_company_bank_accounts')
    .insert({ company_id: id, ...parsed.data })
    .select()
    .single()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ success: true, data }, { status: 201 })
}
