import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { getAdminClient } from '@/lib/supabase/admin'
import { requireAdmin, requireAuth, userHasCompanyAccess } from '@/lib/auth/require-admin'
import { documentCreateSchema, DOC_TYPE_DIRECTION, type DocType } from '@/lib/schemas/documents'
import { addEvent } from '@/lib/documents/engine'

// GET /api/documents?company_id=&doc_type=&status=&limit=&offset=
export async function GET(req: NextRequest) {
  const auth = await requireAuth()
  if (!auth.ok) return auth.response

  const { searchParams } = new URL(req.url)
  const companyId = searchParams.get('company_id')
  const docType = searchParams.get('doc_type')
  const status = searchParams.get('status')
  const limit = Math.min(200, Number(searchParams.get('limit') ?? '50'))
  const offset = Number(searchParams.get('offset') ?? '0')

  const admin = getAdminClient()
  let query = admin
    .from('tt_documents')
    .select('id, company_id, doc_type, direction, doc_code, doc_number, doc_year, doc_date, status, counterparty_name, currency_code, total, created_at, issued_at', { count: 'exact' })
    .order('created_at', { ascending: false })
    .range(offset, offset + limit - 1)

  if (companyId) {
    const canAccess = await userHasCompanyAccess(auth.ttUserId, auth.role, companyId)
    if (!canAccess) return NextResponse.json({ error: 'Sin acceso a esa empresa' }, { status: 403 })
    query = query.eq('company_id', companyId)
  } else if (!['admin', 'super_admin', 'superadmin'].includes(auth.role)) {
    // No admin sin company_id: restringir a sus empresas
    const { data: access } = await admin
      .from('tt_user_companies').select('company_id').eq('user_id', auth.ttUserId)
    const ids = (access ?? []).map((r) => r.company_id as string)
    if (ids.length === 0) return NextResponse.json({ data: [], count: 0 })
    query = query.in('company_id', ids)
  }
  if (docType) query = query.eq('doc_type', docType)
  if (status) query = query.eq('status', status)

  const { data, error, count } = await query
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ data, count })
}

// POST /api/documents — crea draft
export async function POST(req: NextRequest) {
  const guard = await requireAdmin()
  if (!guard.ok) return guard.response

  let body: unknown
  try { body = await req.json() } catch {
    return NextResponse.json({ error: 'JSON inválido' }, { status: 400 })
  }
  const parsed = documentCreateSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: 'Validación falló', issues: z.treeifyError(parsed.error) }, { status: 400 })
  }

  const input = parsed.data
  const admin = getAdminClient()

  // Verificar que la moneda esté habilitada en la empresa
  const { data: cur } = await admin
    .from('tt_company_currencies')
    .select('currency_code')
    .eq('company_id', input.company_id)
    .eq('currency_code', input.currency_code)
    .maybeSingle()
  if (!cur) {
    return NextResponse.json({ error: `Moneda ${input.currency_code} no habilitada para la empresa` }, { status: 400 })
  }

  const direction = input.direction ?? DOC_TYPE_DIRECTION[input.doc_type as DocType]

  const { data: doc, error } = await admin
    .from('tt_documents')
    .insert({
      company_id: input.company_id,
      doc_type: input.doc_type,
      direction,
      doc_date: input.doc_date ?? new Date().toISOString().slice(0, 10),
      valid_until: input.valid_until ?? null,
      due_date: input.due_date ?? null,
      counterparty_type: input.counterparty_type ?? null,
      counterparty_id: input.counterparty_id ?? null,
      counterparty_name: input.counterparty_name ?? null,
      counterparty_tax_id: input.counterparty_tax_id ?? null,
      counterparty_email: input.counterparty_email || null,
      counterparty_address: input.counterparty_address ?? null,
      currency_code: input.currency_code,
      exchange_rate: input.exchange_rate ?? 1,
      external_ref: input.external_ref ?? null,
      customer_po_number: input.customer_po_number ?? null,
      notes: input.notes ?? null,
      internal_notes: input.internal_notes ?? null,
      metadata: input.metadata ?? {},
      status: 'draft',
      created_by: guard.ttUserId,
      updated_by: guard.ttUserId,
    })
    .select()
    .single()
  if (error || !doc) return NextResponse.json({ error: error?.message ?? 'Error creando doc' }, { status: 500 })

  await addEvent(admin, {
    documentId: doc.id as string,
    eventType: 'created',
    actorId: guard.ttUserId,
    toStatus: 'draft',
    payload: { doc_type: input.doc_type, direction },
  })

  return NextResponse.json({ success: true, data: doc }, { status: 201 })
}
