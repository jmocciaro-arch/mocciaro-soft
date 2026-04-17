import { NextRequest, NextResponse } from 'next/server'
import { getAdminClient } from '@/lib/supabase/admin'
import { requireAdmin } from '@/lib/auth/require-admin'

type Ctx = { params: Promise<{ id: string; docId: string }> }

export async function DELETE(_req: NextRequest, { params }: Ctx) {
  const guard = await requireAdmin()
  if (!guard.ok) return guard.response
  const { id, docId } = await params
  const admin = getAdminClient()
  // Soft delete. El objeto físico en storage puede limpiarlo un cron posterior.
  const { error } = await admin
    .from('tt_company_documents')
    .update({ is_active: false })
    .eq('id', docId)
    .eq('company_id', id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ success: true })
}
