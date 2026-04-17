import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { getAdminClient } from '@/lib/supabase/admin'
import { companyCreateSchema, validateTaxIdRegex } from '@/lib/schemas/companies'
import { requireAdmin, requireAuth } from '@/lib/auth/require-admin'

// -----------------------------------------------------------------------------
// GET /api/companies
// - authenticated: ve solo empresas a las que tiene acceso (tt_user_companies)
// - admin/super_admin: ve todas
// -----------------------------------------------------------------------------
export async function GET() {
  const auth = await requireAuth()
  if (!auth.ok) return auth.response

  const admin = getAdminClient()
  const isAdmin = ['admin', 'super_admin', 'superadmin'].includes(auth.role)

  const base = admin
    .from('tt_companies')
    .select('id, name, trade_name, legal_name, country, default_currency, currency, code_prefix, company_type, legal_form, is_active')
    .order('name')

  if (isAdmin) {
    const { data, error } = await base
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ data })
  }

  // No-admin: filtrar por acceso
  const { data: access } = await admin
    .from('tt_user_companies')
    .select('company_id')
    .eq('user_id', auth.ttUserId)

  const ids = (access ?? []).map((r) => r.company_id as string)
  if (ids.length === 0) return NextResponse.json({ data: [] })

  const { data, error } = await base.in('id', ids)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ data })
}

// -----------------------------------------------------------------------------
// POST /api/companies — solo admin/super_admin
// Valida tax_id contra el regex del país ANTES de insertar.
// -----------------------------------------------------------------------------
export async function POST(req: NextRequest) {
  const guard = await requireAdmin()
  if (!guard.ok) return guard.response

  let body: unknown
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'JSON inválido' }, { status: 400 })
  }

  const parsed = companyCreateSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Validación falló', issues: z.treeifyError(parsed.error) },
      { status: 400 }
    )
  }

  const input = parsed.data
  const admin = getAdminClient()

  // Cargar schema del país para obtener el regex
  const { data: countrySchema, error: schemaErr } = await admin
    .from('tt_country_fiscal_schemas')
    .select('country_code, country_name, tax_id_regex, tax_id_label')
    .eq('country_code', input.country)
    .maybeSingle()

  if (schemaErr || !countrySchema) {
    return NextResponse.json(
      { error: `País ${input.country} no soportado` },
      { status: 400 }
    )
  }

  // Validar tax_id contra regex
  const regexCheck = validateTaxIdRegex(input.tax_id, countrySchema.tax_id_regex, countrySchema.country_name)
  if (!regexCheck.ok) {
    return NextResponse.json(
      { error: regexCheck.message, field: 'tax_id' },
      { status: 400 }
    )
  }

  // Unicidad
  if (input.code_prefix) {
    const { data: dup } = await admin
      .from('tt_companies')
      .select('id')
      .eq('code_prefix', input.code_prefix)
      .maybeSingle()
    if (dup) {
      return NextResponse.json({ error: `code_prefix '${input.code_prefix}' ya en uso` }, { status: 409 })
    }
  }
  const { data: dupTax } = await admin
    .from('tt_companies')
    .select('id')
    .eq('tax_id', input.tax_id)
    .maybeSingle()
  if (dupTax) {
    return NextResponse.json({ error: `tax_id '${input.tax_id}' ya registrado` }, { status: 409 })
  }

  const computedPrefix = input.code_prefix
    ?? (input.trade_name ?? input.name).replace(/[^A-Za-z]/g, '').slice(0, 2).toUpperCase()

  const companyPayload = {
    name: input.name,
    trade_name: input.trade_name,
    legal_name: input.legal_name,
    tax_id: input.tax_id,
    tax_id_type: input.tax_id_type,
    country: input.country,
    legal_form: input.legal_form,
    primary_activity: input.primary_activity,
    secondary_activities: input.secondary_activities ?? [],
    establishment_date: input.establishment_date,
    fiscal_year_start: input.fiscal_year_start ?? '01-01',
    timezone: input.timezone ?? 'Europe/Madrid',
    default_currency: input.default_currency,
    currency: input.default_currency,
    secondary_currencies: input.secondary_currencies ?? [],
    code_prefix: computedPrefix,
    brand_color: input.brand_color ?? '#F97316',
    logo_url: input.logo_url,
    email_main: input.email_main,
    email_billing: input.email_billing,
    email_notifications: input.email_notifications,
    phone: input.phone,
    website: input.website,
    company_type: input.company_type ?? 'internal',
    is_active: input.is_active ?? true,
  }

  const { data: company, error: insertErr } = await admin
    .from('tt_companies')
    .insert(companyPayload)
    .select('id')
    .single()

  if (insertErr || !company) {
    return NextResponse.json(
      { error: `Error creando empresa: ${insertErr?.message}` },
      { status: 500 }
    )
  }

  const companyId = company.id as string

  const { error: fpErr } = await admin
    .from('tt_company_fiscal_profiles')
    .insert({
      company_id: companyId,
      country_code: input.country,
      tax_id: input.tax_id,
      tax_id_type: input.tax_id_type,
      data: {},
      is_complete: false,
    })
  if (fpErr) {
    return NextResponse.json(
      { error: `Empresa creada pero fiscal_profile falló: ${fpErr.message}`, company_id: companyId },
      { status: 500 }
    )
  }

  await admin
    .from('tt_company_currencies')
    .insert({
      company_id: companyId,
      currency_code: input.default_currency,
      is_default: true,
      is_active: true,
      priority: 0,
    })

  if (input.secondary_currencies && input.secondary_currencies.length > 0) {
    const rows = input.secondary_currencies.map((code, idx) => ({
      company_id: companyId,
      currency_code: code,
      is_default: false,
      is_active: true,
      priority: idx + 1,
    }))
    await admin.from('tt_company_currencies').insert(rows)
  }

  // Dar acceso automático al creador a la empresa recién creada.
  await admin.from('tt_user_companies').insert({
    user_id: guard.ttUserId,
    company_id: companyId,
    is_default: false,
    can_sell: true,
    can_buy: true,
  }).select().maybeSingle()

  return NextResponse.json({ success: true, id: companyId }, { status: 201 })
}
