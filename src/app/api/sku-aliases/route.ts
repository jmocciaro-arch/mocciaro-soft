/**
 * GET  /api/sku-aliases?client_id=...
 *      Lista el glosario de un cliente.
 *
 * POST /api/sku-aliases
 *      Body: { company_id, client_id, external_sku, product_id, source?, notes? }
 *      Crea o actualiza un alias (upsert por client_id + external_sku).
 *
 * DELETE /api/sku-aliases?alias_id=...
 *      Borra un alias.
 */

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { withCompanyFilter, ensureCompanyAccess } from '@/lib/auth/with-company-filter'
import { getClientGlossary, saveSkuAlias, deleteSkuAlias } from '@/lib/sku-matcher'

export const runtime = 'nodejs'

function adminClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } }
  )
}

export async function GET(req: NextRequest) {
  const guard = await withCompanyFilter()
  if (!guard.ok) return guard.response

  const { searchParams } = new URL(req.url)
  const clientId = searchParams.get('client_id')
  if (!clientId) {
    return NextResponse.json({ error: 'client_id requerido' }, { status: 400 })
  }

  const sb = adminClient()
  const glossary = await getClientGlossary(sb, clientId)
  return NextResponse.json({ data: glossary })
}

export async function POST(req: NextRequest) {
  const guard = await withCompanyFilter()
  if (!guard.ok) return guard.response

  const body = await req.json().catch(() => null)
  if (!body || !body.client_id || !body.external_sku || !body.product_id) {
    return NextResponse.json(
      { error: 'client_id, external_sku y product_id son requeridos' },
      { status: 400 }
    )
  }

  const sb = adminClient()

  // Resolver company_id REAL del cliente (tt_clients.company_id).
  // El frontend puede mandar un company_id sintético (GroupedCompany.id) que no
  // corresponde a tt_companies — confiamos en el del cliente para el RLS.
  const { data: clientRow } = await sb
    .from('tt_clients')
    .select('company_id')
    .eq('id', body.client_id)
    .maybeSingle()
  const resolvedCompanyId = (clientRow?.company_id as string | null) || body.company_id
  if (!resolvedCompanyId) {
    return NextResponse.json({ error: 'No se pudo resolver company_id del cliente' }, { status: 400 })
  }

  const access = ensureCompanyAccess(guard, resolvedCompanyId)
  if (!access.ok) return access.response

  const result = await saveSkuAlias(sb, {
    companyId: resolvedCompanyId,
    clientId: body.client_id,
    externalSKU: body.external_sku,
    productId: body.product_id,
    source: body.source || 'manual',
    notes: body.notes,
  })
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: 500 })
  return NextResponse.json({ ok: true })
}

export async function DELETE(req: NextRequest) {
  const guard = await withCompanyFilter()
  if (!guard.ok) return guard.response

  const { searchParams } = new URL(req.url)
  const aliasId = searchParams.get('alias_id')
  if (!aliasId) {
    return NextResponse.json({ error: 'alias_id requerido' }, { status: 400 })
  }

  const sb = adminClient()
  const result = await deleteSkuAlias(sb, aliasId)
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: 500 })
  return NextResponse.json({ ok: true })
}
