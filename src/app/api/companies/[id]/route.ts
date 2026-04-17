import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { getAdminClient } from '@/lib/supabase/admin'
import { companyUpdateSchema, validateTaxIdRegex } from '@/lib/schemas/companies'
import { requireAdmin, requireAuth, userHasCompanyAccess } from '@/lib/auth/require-admin'

// GET /api/companies/:id — detalle con satélites (chequea acceso del usuario)
export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireAuth()
  if (!auth.ok) return auth.response

  const { id } = await params
  const canAccess = await userHasCompanyAccess(auth.ttUserId, auth.role, id)
  if (!canAccess) {
    return NextResponse.json({ error: 'Sin acceso a esta empresa' }, { status: 403 })
  }

  const admin = getAdminClient()
  const [company, fiscal, addresses, banks, currencies, reps, docs] = await Promise.all([
    admin.from('tt_companies').select('*').eq('id', id).maybeSingle(),
    admin.from('tt_company_fiscal_profiles').select('*').eq('company_id', id).maybeSingle(),
    admin.from('tt_company_addresses').select('*').eq('company_id', id).order('kind'),
    admin.from('tt_company_bank_accounts').select('*').eq('company_id', id).order('is_primary', { ascending: false }),
    admin.from('tt_company_currencies').select('*').eq('company_id', id).order('priority'),
    admin.from('tt_company_legal_representatives').select('*').eq('company_id', id).order('appointment_date', { ascending: false }),
    admin.from('tt_company_documents').select('*').eq('company_id', id).eq('is_active', true).order('created_at', { ascending: false }),
  ])

  if (company.error || !company.data) {
    return NextResponse.json({ error: 'Empresa no encontrada' }, { status: 404 })
  }

  return NextResponse.json({
    company: company.data,
    fiscal_profile: fiscal.data,
    addresses: addresses.data ?? [],
    bank_accounts: banks.data ?? [],
    currencies: currencies.data ?? [],
    legal_representatives: reps.data ?? [],
    documents: docs.data ?? [],
  })
}

// PATCH — solo admin. Revalida regex si cambia tax_id o country.
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const guard = await requireAdmin()
  if (!guard.ok) return guard.response

  const { id } = await params

  let body: unknown
  try { body = await req.json() } catch {
    return NextResponse.json({ error: 'JSON inválido' }, { status: 400 })
  }

  const parsed = companyUpdateSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Validación falló', issues: z.treeifyError(parsed.error) },
      { status: 400 }
    )
  }

  const admin = getAdminClient()

  // Si el PATCH toca tax_id o country, revalidamos regex
  if (parsed.data.tax_id !== undefined || parsed.data.country !== undefined) {
    const { data: current } = await admin
      .from('tt_companies')
      .select('tax_id, country')
      .eq('id', id)
      .maybeSingle()

    const effectiveCountry = parsed.data.country ?? current?.country
    const effectiveTaxId = parsed.data.tax_id ?? current?.tax_id

    if (effectiveCountry && effectiveTaxId) {
      const { data: sch } = await admin
        .from('tt_country_fiscal_schemas')
        .select('country_name, tax_id_regex')
        .eq('country_code', effectiveCountry)
        .maybeSingle()
      if (sch) {
        const check = validateTaxIdRegex(effectiveTaxId, sch.tax_id_regex, sch.country_name)
        if (!check.ok) {
          return NextResponse.json({ error: check.message, field: 'tax_id' }, { status: 400 })
        }
      }
    }
  }

  const { data, error } = await admin
    .from('tt_companies')
    .update({ ...parsed.data, updated_at: new Date().toISOString() })
    .eq('id', id)
    .select()
    .single()

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
  return NextResponse.json({ success: true, data })
}
