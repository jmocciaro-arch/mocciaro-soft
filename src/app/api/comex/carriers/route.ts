import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { requireComex, companiesFor, checkCompany } from '@/lib/comex/guards'

export const runtime = 'nodejs'

const COLS = 'id, company_id, code, name, volumetric_divisor, active, updated_at, company:tt_companies(name)'

const carrierSchema = z.object({
  company_id: z.string().uuid(),
  code: z.string().trim().min(1).max(30),
  name: z.string().trim().min(1).max(80),
  volumetric_divisor: z.number().int().positive().default(5000),
  active: z.boolean().default(true),
})

/** GET /api/comex/carriers — couriers de las empresas accesibles. view_comex. */
export async function GET() {
  const ctx = await requireComex('view_comex')
  if (!ctx.ok) return ctx.response

  let query = ctx.admin.from('tt_carriers').select(COLS).order('company_id').order('name')
  const accessible = await companiesFor(ctx)
  if (accessible !== 'all') {
    if (accessible.length === 0) return NextResponse.json({ data: [] })
    query = query.in('company_id', accessible)
  }
  const { data, error } = await query
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ data })
}

/** POST /api/comex/carriers — alta. manage_comex + acceso a la empresa. */
export async function POST(req: NextRequest) {
  const ctx = await requireComex('manage_comex')
  if (!ctx.ok) return ctx.response

  let body: unknown
  try { body = await req.json() } catch { return NextResponse.json({ error: 'JSON inválido' }, { status: 400 }) }
  const parsed = carrierSchema.safeParse(body)
  if (!parsed.success) return NextResponse.json({ error: 'Validación falló', issues: z.treeifyError(parsed.error) }, { status: 400 })

  const denied = await checkCompany(ctx, parsed.data.company_id)
  if (denied) return denied

  const { data, error } = await ctx.admin.from('tt_carriers').insert(parsed.data).select(COLS).single()
  if (error) {
    const msg = error.code === '23505' ? `Ya existe un courier "${parsed.data.code}" en esa empresa` : error.message
    return NextResponse.json({ error: msg }, { status: error.code === '23505' ? 409 : 500 })
  }
  return NextResponse.json({ success: true, data })
}
