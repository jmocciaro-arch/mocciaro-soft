import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { getAdminClient } from '@/lib/supabase/admin'
import { requireAdmin, requireAuth, userHasCompanyAccess } from '@/lib/auth/require-admin'
import { documentConfigUpsertSchema, DOC_TYPES, renderDocumentCode, type DocType } from '@/lib/schemas/documents'

type Ctx = { params: Promise<{ companyId: string; docType: string }> }

export async function GET(_req: NextRequest, { params }: Ctx) {
  const auth = await requireAuth()
  if (!auth.ok) return auth.response
  const { companyId, docType } = await params

  if (!(DOC_TYPES as readonly string[]).includes(docType)) {
    return NextResponse.json({ error: `doc_type inválido: ${docType}` }, { status: 400 })
  }
  const canAccess = await userHasCompanyAccess(auth.ttUserId, auth.role, companyId)
  if (!canAccess) return NextResponse.json({ error: 'Sin acceso' }, { status: 403 })

  const admin = getAdminClient()
  const { data, error } = await admin
    .from('tt_document_configs')
    .select('*')
    .eq('company_id', companyId)
    .eq('doc_type', docType)
    .maybeSingle()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // Preview del renderDocumentCode con valores de ejemplo para UI futura
  const { data: company } = await admin.from('tt_companies').select('code_prefix, name').eq('id', companyId).maybeSingle()
  const template = data?.name_template ?? '{date:YYYY} {date:MM} {date:DD} {type}-{prefix}.{year}.{number:6}'
  const preview = renderDocumentCode(template, {
    docType: docType as DocType,
    prefix: data?.prefix_override ?? company?.code_prefix ?? null,
    docDate: new Date(),
    number: 123,
    year: new Date().getFullYear(),
    counterparty: 'ACME',
    currency: 'EUR',
    companyName: company?.name ?? '',
    numberPadding: data?.number_padding ?? 6,
  })

  return NextResponse.json({ data, preview })
}

export async function PUT(req: NextRequest, { params }: Ctx) {
  const guard = await requireAdmin()
  if (!guard.ok) return guard.response
  const { companyId, docType } = await params

  if (!(DOC_TYPES as readonly string[]).includes(docType)) {
    return NextResponse.json({ error: `doc_type inválido: ${docType}` }, { status: 400 })
  }

  let body: unknown
  try { body = await req.json() } catch {
    return NextResponse.json({ error: 'JSON inválido' }, { status: 400 })
  }
  const parsed = documentConfigUpsertSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: 'Validación falló', issues: z.treeifyError(parsed.error) }, { status: 400 })
  }

  const admin = getAdminClient()
  const { data: existing } = await admin
    .from('tt_document_configs').select('id').eq('company_id', companyId).eq('doc_type', docType).maybeSingle()

  let result
  if (existing) {
    result = await admin.from('tt_document_configs').update(parsed.data).eq('id', existing.id).select().single()
  } else {
    result = await admin.from('tt_document_configs').insert({ company_id: companyId, doc_type: docType, ...parsed.data }).select().single()
  }
  if (result.error) return NextResponse.json({ error: result.error.message }, { status: 500 })
  return NextResponse.json({ success: true, data: result.data })
}
