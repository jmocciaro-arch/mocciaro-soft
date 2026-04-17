import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { getAdminClient } from '@/lib/supabase/admin'
import {
  fiscalProfileUpsertSchema,
  fiscalFieldDescriptorSchema,
  validateFiscalData,
  validateTaxIdRegex,
  type FiscalFieldDescriptor,
} from '@/lib/schemas/companies'
import { requireAdmin } from '@/lib/auth/require-admin'

// PUT /api/companies/:id/fiscal-profile — solo admin
export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const guard = await requireAdmin()
  if (!guard.ok) return guard.response

  const { id: companyId } = await params

  let body: unknown
  try { body = await req.json() } catch {
    return NextResponse.json({ error: 'JSON inválido' }, { status: 400 })
  }

  const parsed = fiscalProfileUpsertSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Validación base falló', issues: z.treeifyError(parsed.error) },
      { status: 400 }
    )
  }

  const admin = getAdminClient()

  const { data: schema, error: schemaErr } = await admin
    .from('tt_country_fiscal_schemas')
    .select('fields, tax_id_regex, country_name')
    .eq('country_code', parsed.data.country_code)
    .single()

  if (schemaErr || !schema) {
    return NextResponse.json({ error: `País ${parsed.data.country_code} no soportado` }, { status: 400 })
  }

  // Validación regex tax_id
  if (parsed.data.tax_id) {
    const taxCheck = validateTaxIdRegex(parsed.data.tax_id, schema.tax_id_regex, schema.country_name)
    if (!taxCheck.ok) {
      return NextResponse.json({ error: taxCheck.message, field: 'tax_id' }, { status: 400 })
    }
  } else if (parsed.data.is_complete) {
    return NextResponse.json({ error: 'tax_id es obligatorio para marcar completo' }, { status: 400 })
  }

  const descriptorsParsed = z.array(fiscalFieldDescriptorSchema).safeParse(schema.fields)
  if (!descriptorsParsed.success) {
    return NextResponse.json({ error: 'Schema de país corrupto' }, { status: 500 })
  }

  const descriptors: FiscalFieldDescriptor[] = descriptorsParsed.data
  const check = validateFiscalData(parsed.data.data, descriptors)

  if (parsed.data.is_complete && !check.ok) {
    return NextResponse.json(
      { error: 'No se puede marcar completo con errores', fiscal_errors: check.errors },
      { status: 400 }
    )
  }

  const { data: existing } = await admin
    .from('tt_company_fiscal_profiles')
    .select('id')
    .eq('company_id', companyId)
    .maybeSingle()

  const payload = {
    company_id: companyId,
    country_code: parsed.data.country_code,
    tax_id: parsed.data.tax_id,
    tax_id_type: parsed.data.tax_id_type,
    data: check.cleaned,
    is_complete: parsed.data.is_complete ?? false,
    last_validated_at: new Date().toISOString(),
  }

  let row
  if (existing) {
    const { data, error } = await admin
      .from('tt_company_fiscal_profiles')
      .update(payload)
      .eq('id', existing.id)
      .select()
      .single()
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    row = data
  } else {
    const { data, error } = await admin
      .from('tt_company_fiscal_profiles')
      .insert(payload)
      .select()
      .single()
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    row = data
  }

  if (parsed.data.tax_id) {
    await admin
      .from('tt_companies')
      .update({ tax_id: parsed.data.tax_id, tax_id_type: parsed.data.tax_id_type })
      .eq('id', companyId)
  }

  return NextResponse.json({
    success: true,
    data: row,
    warnings: check.ok ? null : check.errors,
  })
}
