/**
 * GET /api/archivo/attachments?companyId=...&category=...&q=...
 *
 * Listado cross-módulo de tt_document_attachments para la biblioteca
 * central (/archivo). Los attachments no tienen company_id propio: el
 * scope multi-empresa se resuelve join-eando contra el documento padre
 * en tt_documents (única fuente en uso hoy — document_type 'quote', etc.).
 *
 * Adjuntos cuyo padre no está en tt_documents (sat_ticket, lead...) quedan
 * fuera de esta vista v1; se listan desde su módulo de origen.
 */

import { NextRequest, NextResponse } from 'next/server'
import { getAdminClient } from '@/lib/supabase/admin'
import { withCompanyFilter, ensureCompanyAccess } from '@/lib/auth/with-company-filter'

export const runtime = 'nodejs'

const MAX_ROWS = 300

export async function GET(req: NextRequest) {
  const guard = await withCompanyFilter()
  if (!guard.ok) return guard.response

  const { searchParams } = new URL(req.url)
  const companyId = searchParams.get('companyId')
  const category = searchParams.get('category')
  const q = (searchParams.get('q') ?? '').trim().toLowerCase()

  if (!companyId) {
    return NextResponse.json({ error: 'companyId requerido' }, { status: 400 })
  }
  const access = ensureCompanyAccess(guard, companyId)
  if (!access.ok) return access.response

  const admin = getAdminClient()

  // 1. Adjuntos más recientes (el filtro de empresa se aplica en el paso 2)
  let query = admin
    .from('tt_document_attachments')
    .select('id, document_id, document_type, category, name, description, mime_type, size_bytes, storage_path, external_url, created_at')
    .order('created_at', { ascending: false })
    .limit(MAX_ROWS)
  if (category) query = query.eq('category', category)

  const { data: attachments, error: attErr } = await query
  if (attErr) return NextResponse.json({ error: attErr.message }, { status: 500 })
  if (!attachments?.length) return NextResponse.json({ data: [] })

  // 2. Padres en tt_documents → filtra por empresa y aporta contexto
  const parentIds = [...new Set(attachments.map((a) => a.document_id).filter(Boolean))]
  const { data: parents, error: parErr } = await admin
    .from('tt_documents')
    .select('id, company_id, doc_type, system_code, legal_number')
    .in('id', parentIds)
    .eq('company_id', companyId)
  if (parErr) return NextResponse.json({ error: parErr.message }, { status: 500 })

  const parentById = new Map((parents ?? []).map((p) => [p.id as string, p]))

  let rows = attachments
    .filter((a) => parentById.has(a.document_id as string))
    .map((a) => {
      const parent = parentById.get(a.document_id as string)!
      return {
        ...a,
        parent_doc_type: parent.doc_type as string,
        parent_system_code: (parent.system_code ?? parent.legal_number ?? '') as string,
      }
    })

  if (q) {
    rows = rows.filter((r) =>
      `${r.name} ${r.description ?? ''} ${r.parent_system_code}`.toLowerCase().includes(q)
    )
  }

  return NextResponse.json({ data: rows })
}
