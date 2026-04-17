import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { getAdminClient } from '@/lib/supabase/admin'
import { requireAdmin, requireAuth, userHasCompanyAccess } from '@/lib/auth/require-admin'
import { documentUpdateSchema } from '@/lib/schemas/documents'
import { addEvent } from '@/lib/documents/engine'

type Ctx = { params: Promise<{ id: string }> }

// GET /api/documents/:id — cabecera + líneas + relaciones + eventos
export async function GET(_req: NextRequest, { params }: Ctx) {
  const auth = await requireAuth()
  if (!auth.ok) return auth.response
  const { id } = await params

  const admin = getAdminClient()
  const { data: doc, error } = await admin
    .from('tt_documents')
    .select('*')
    .eq('id', id)
    .maybeSingle()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  if (!doc) return NextResponse.json({ error: 'Documento no encontrado' }, { status: 404 })

  const canAccess = await userHasCompanyAccess(auth.ttUserId, auth.role, doc.company_id as string)
  if (!canAccess) return NextResponse.json({ error: 'Sin acceso' }, { status: 403 })

  const [lines, relOut, relIn, events] = await Promise.all([
    admin.from('tt_document_lines').select('*').eq('document_id', id).order('line_number'),
    admin.from('tt_document_relations').select('*, target:tt_documents!tt_document_relations_target_document_id_fkey(id, doc_type, doc_code, status, doc_date)')
      .eq('source_document_id', id),
    admin.from('tt_document_relations').select('*, source:tt_documents!tt_document_relations_source_document_id_fkey(id, doc_type, doc_code, status, doc_date)')
      .eq('target_document_id', id),
    admin.from('tt_document_events').select('*').eq('document_id', id).order('created_at', { ascending: false }).limit(50),
  ])

  return NextResponse.json({
    document: doc,
    lines: lines.data ?? [],
    relations_out: relOut.data ?? [],
    relations_in: relIn.data ?? [],
    events: events.data ?? [],
  })
}

// PATCH /api/documents/:id — editar. Solo en draft para campos comerciales.
export async function PATCH(req: NextRequest, { params }: Ctx) {
  const guard = await requireAdmin()
  if (!guard.ok) return guard.response
  const { id } = await params

  let body: unknown
  try { body = await req.json() } catch {
    return NextResponse.json({ error: 'JSON inválido' }, { status: 400 })
  }
  const parsed = documentUpdateSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: 'Validación falló', issues: z.treeifyError(parsed.error) }, { status: 400 })
  }

  const admin = getAdminClient()
  const { data: current } = await admin
    .from('tt_documents')
    .select('status, locked')
    .eq('id', id)
    .maybeSingle()
  if (!current) return NextResponse.json({ error: 'Documento no encontrado' }, { status: 404 })

  // Si está locked (emitido), solo permitimos notes/internal_notes/metadata
  if (current.locked || current.status !== 'draft') {
    const safe = ['notes', 'internal_notes', 'metadata']
    const keys = Object.keys(parsed.data)
    const forbidden = keys.filter((k) => !safe.includes(k))
    if (forbidden.length > 0) {
      return NextResponse.json(
        { error: `Documento emitido: solo puede editar ${safe.join(', ')}. Bloqueado: ${forbidden.join(', ')}` },
        { status: 409 }
      )
    }
  }

  const { data, error } = await admin
    .from('tt_documents')
    .update({ ...parsed.data, updated_by: guard.ttUserId })
    .eq('id', id)
    .select()
    .single()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  await addEvent(admin, {
    documentId: id,
    eventType: 'header_updated',
    actorId: guard.ttUserId,
    payload: { fields: Object.keys(parsed.data) },
  })

  return NextResponse.json({ success: true, data })
}

// DELETE /api/documents/:id — solo si está en draft
export async function DELETE(_req: NextRequest, { params }: Ctx) {
  const guard = await requireAdmin()
  if (!guard.ok) return guard.response
  const { id } = await params

  const admin = getAdminClient()
  const { data: doc } = await admin
    .from('tt_documents').select('status, locked').eq('id', id).maybeSingle()
  if (!doc) return NextResponse.json({ error: 'Documento no encontrado' }, { status: 404 })
  if (doc.locked || doc.status !== 'draft') {
    return NextResponse.json({ error: 'Solo drafts pueden eliminarse. Usá cancel para docs emitidos.' }, { status: 409 })
  }

  const { error } = await admin.from('tt_documents').delete().eq('id', id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ success: true })
}
