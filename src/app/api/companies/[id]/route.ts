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

// -----------------------------------------------------------------------------
// DELETE /api/companies/:id — eliminar empresa (solo admin)
//
// Modos:
//   ?mode=soft (default): UPDATE tt_companies SET active = false. Reversible.
//   ?mode=hard           : DELETE físico. Solo si la empresa NO tiene datos
//                          en tablas críticas. Si los tiene, devuelve 409 con
//                          el detalle por tabla.
//   ?mode=reactivate     : UPDATE active = true (deshacer soft delete).
//
// El query param `confirm` debe matchear exactamente el `name` de la empresa
// para hard delete (anti-fat-finger estilo GitHub).
// -----------------------------------------------------------------------------
const DEPENDENCY_TABLES: Array<{ table: string; column: string; label: string }> = [
  { table: 'tt_clients',                column: 'company_id',         label: 'clientes' },
  { table: 'tt_suppliers',              column: 'company_id',         label: 'proveedores' },
  { table: 'tt_documents',              column: 'company_id',         label: 'documentos' },
  { table: 'tt_purchase_orders',        column: 'company_id',         label: 'órdenes de compra' },
  { table: 'tt_purchase_credit_notes',  column: 'company_id',         label: 'notas de crédito de compra' },
  { table: 'tt_recurring_invoices',     column: 'company_id',         label: 'facturas recurrentes' },
  { table: 'tt_opportunities',          column: 'company_id',         label: 'oportunidades' },
  { table: 'tt_leads',                  column: 'company_id',         label: 'leads' },
  { table: 'tt_warehouses',             column: 'company_id',         label: 'almacenes' },
  { table: 'tt_price_lists',            column: 'company_id',         label: 'listas de precios' },
  { table: 'tt_supplier_offers',        column: 'company_id',         label: 'ofertas de proveedor' },
  { table: 'tt_users',                  column: 'company_id',         label: 'usuarios' },
  { table: 'tt_bank_statements',        column: 'company_id',         label: 'extractos bancarios' },
  { table: 'tt_automations',            column: 'company_id',         label: 'automatizaciones' },
  { table: 'tt_sat_tickets',            column: 'company_id',         label: 'tickets SAT' },
  { table: 'tt_documents',              column: 'company_id',         label: 'documentos' },
]

async function countDependencies(
  admin: ReturnType<typeof getAdminClient>,
  companyId: string,
): Promise<{ table: string; label: string; count: number }[]> {
  const results = await Promise.all(
    DEPENDENCY_TABLES.map(async ({ table, column, label }) => {
      const { count } = await admin
        .from(table)
        .select('*', { count: 'exact', head: true })
        .eq(column, companyId)
      return { table, label, count: count ?? 0 }
    }),
  )
  // Dedupe por tabla (tt_documents aparece duplicada en la lista de safety)
  const seen = new Set<string>()
  return results.filter(r => {
    if (seen.has(r.table)) return false
    seen.add(r.table)
    return r.count > 0
  })
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const guard = await requireAdmin()
  if (!guard.ok) return guard.response

  const { id } = await params
  const url = new URL(req.url)
  const mode = (url.searchParams.get('mode') ?? 'soft') as 'soft' | 'hard' | 'reactivate' | 'dry-run'
  const confirmName = url.searchParams.get('confirm') ?? ''

  const admin = getAdminClient()
  const { data: company, error: fetchErr } = await admin
    .from('tt_companies')
    .select('id, name, active')
    .eq('id', id)
    .maybeSingle()

  if (fetchErr) return NextResponse.json({ error: fetchErr.message }, { status: 500 })
  if (!company) return NextResponse.json({ error: 'Empresa no encontrada' }, { status: 404 })

  // ─────────── DRY-RUN (preview de dependencias para la UI) ───────────
  if (mode === 'dry-run') {
    const deps = await countDependencies(admin, id)
    return NextResponse.json({
      company: { id: company.id, name: company.name, active: company.active },
      dependencies: deps,
      can_hard_delete: deps.length === 0,
    })
  }

  // ─────────── REACTIVATE ───────────
  if (mode === 'reactivate') {
    const { error } = await admin
      .from('tt_companies')
      .update({ active: true, updated_at: new Date().toISOString() })
      .eq('id', id)
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ success: true, mode: 'reactivate', message: `Empresa "${company.name}" reactivada` })
  }

  // ─────────── SOFT DELETE ───────────
  if (mode === 'soft') {
    const { error } = await admin
      .from('tt_companies')
      .update({ active: false, updated_at: new Date().toISOString() })
      .eq('id', id)
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({
      success: true,
      mode: 'soft',
      message: `Empresa "${company.name}" desactivada. Los datos quedan intactos y podés reactivarla cuando quieras.`,
    })
  }

  // ─────────── HARD DELETE ───────────
  if (mode === 'hard') {
    // Anti-fat-finger: el cliente debe enviar el nombre exacto
    if (confirmName.trim() !== (company.name ?? '').trim()) {
      return NextResponse.json(
        { error: `Para borrado definitivo, el nombre confirmado debe coincidir exactamente con "${company.name}"` },
        { status: 400 },
      )
    }

    // Chequear dependencias
    const deps = await countDependencies(admin, id)
    if (deps.length > 0) {
      return NextResponse.json(
        {
          error: 'No se puede eliminar definitivamente: la empresa tiene datos asociados',
          dependencies: deps,
          suggestion: 'Usá modo "soft" para desactivar la empresa sin perder los datos históricos',
        },
        { status: 409 },
      )
    }

    // Empresa vacía: borrar en cascada las tablas hijas y la empresa
    // (las FK con CASCADE se borran solas; las que tienen SET NULL también ok;
    // borramos manualmente las que tienen NO ACTION y que ya confirmamos vacías)
    const cleanup = [
      admin.from('tt_company_addresses').delete().eq('company_id', id),
      admin.from('tt_company_bank_accounts').delete().eq('company_id', id),
      admin.from('tt_company_currencies').delete().eq('company_id', id),
      admin.from('tt_company_fiscal_profiles').delete().eq('company_id', id),
      admin.from('tt_company_legal_representatives').delete().eq('company_id', id),
      admin.from('tt_company_documents').delete().eq('company_id', id),
      admin.from('tt_user_companies').delete().eq('company_id', id),
    ]
    await Promise.all(cleanup)

    const { error: delErr } = await admin.from('tt_companies').delete().eq('id', id)
    if (delErr) {
      return NextResponse.json(
        { error: `Error eliminando empresa: ${delErr.message}` },
        { status: 500 },
      )
    }

    return NextResponse.json({
      success: true,
      mode: 'hard',
      message: `Empresa "${company.name}" eliminada definitivamente`,
    })
  }

  return NextResponse.json({ error: `Modo inválido: ${mode}` }, { status: 400 })
}
