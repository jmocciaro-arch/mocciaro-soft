import { NextRequest, NextResponse } from 'next/server'
import { getAdminClient } from '@/lib/supabase/admin'

// GET /api/companies/country-schemas
// GET /api/companies/country-schemas?country=ES  → solo uno
export async function GET(req: NextRequest) {
  const admin = getAdminClient()
  const { searchParams } = new URL(req.url)
  const country = searchParams.get('country')?.toUpperCase()

  if (country) {
    const { data, error } = await admin
      .from('tt_country_fiscal_schemas')
      .select('*')
      .eq('country_code', country)
      .maybeSingle()
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    if (!data) return NextResponse.json({ error: 'País no soportado' }, { status: 404 })
    return NextResponse.json({ data })
  }

  const { data, error } = await admin
    .from('tt_country_fiscal_schemas')
    .select('country_code, country_name, tax_authority, tax_id_label, currency_default')
    .order('country_name')
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ data })
}
