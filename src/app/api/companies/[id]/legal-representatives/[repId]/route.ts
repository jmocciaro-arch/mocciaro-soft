import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { getAdminClient } from '@/lib/supabase/admin'
import { legalRepUpdateSchema } from '@/lib/schemas/companies'
import { requireAdmin } from '@/lib/auth/require-admin'

type Ctx = { params: Promise<{ id: string; repId: string }> }

export async function PATCH(req: NextRequest, { params }: Ctx) {
  const guard = await requireAdmin()
  if (!guard.ok) return guard.response
  const { id, repId } = await params
  let body: unknown
  try { body = await req.json() } catch {
    return NextResponse.json({ error: 'JSON inválido' }, { status: 400 })
  }
  const parsed = legalRepUpdateSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: 'Validación falló', issues: z.treeifyError(parsed.error) }, { status: 400 })
  }
  const admin = getAdminClient()
  const { data, error } = await admin
    .from('tt_company_legal_representatives')
    .update(parsed.data)
    .eq('id', repId)
    .eq('company_id', id)
    .select()
    .single()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ success: true, data })
}

export async function DELETE(_req: NextRequest, { params }: Ctx) {
  const guard = await requireAdmin()
  if (!guard.ok) return guard.response
  const { id, repId } = await params
  const admin = getAdminClient()
  const { error } = await admin
    .from('tt_company_legal_representatives')
    .update({ is_active: false, end_date: new Date().toISOString().slice(0, 10) })
    .eq('id', repId)
    .eq('company_id', id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ success: true })
}
