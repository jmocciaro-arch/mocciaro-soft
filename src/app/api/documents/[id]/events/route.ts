import { NextRequest, NextResponse } from 'next/server'
import { getAdminClient } from '@/lib/supabase/admin'
import { requireAuth, userHasCompanyAccess } from '@/lib/auth/require-admin'

type Ctx = { params: Promise<{ id: string }> }

// GET /api/documents/:id/events — trazabilidad completa
export async function GET(req: NextRequest, { params }: Ctx) {
  const auth = await requireAuth()
  if (!auth.ok) return auth.response
  const { id } = await params

  const admin = getAdminClient()
  const { data: doc } = await admin.from('tt_documents').select('company_id').eq('id', id).maybeSingle()
  if (!doc) return NextResponse.json({ error: 'Documento no encontrado' }, { status: 404 })
  const canAccess = await userHasCompanyAccess(auth.ttUserId, auth.role, doc.company_id as string)
  if (!canAccess) return NextResponse.json({ error: 'Sin acceso' }, { status: 403 })

  const { searchParams } = new URL(req.url)
  const limit = Math.min(500, Number(searchParams.get('limit') ?? '100'))

  // tt_users tiene full_name + short_name (no `name`). El join nombrado
  // requiere el FK con nombre exacto (ver migration-v65).
  const { data, error } = await admin
    .from('tt_document_events')
    .select('*, actor:tt_users!tt_document_events_actor_id_fkey(id, full_name, short_name, email)')
    .eq('document_id', id)
    .order('created_at', { ascending: false })
    .limit(limit)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ data })
}
