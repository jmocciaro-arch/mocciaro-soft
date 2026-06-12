import { NextRequest, NextResponse } from 'next/server'
import { createClient as createServiceClient } from '@supabase/supabase-js'
import { requireAdmin, userHasCompanyAccess } from '@/lib/auth/require-admin'
import { withCompanyFilter, ensureCompanyAccess } from '@/lib/auth/with-company-filter'

export const runtime = 'nodejs'

/**
 * POST /api/stock/seed
 * Body: { companyId: string }
 *
 * Inicializa filas en tt_stock=0 para todos los productos activos × todos
 * los warehouses activos de la empresa indicada. Idempotente: si la fila
 * ya existe, no la pisa (ON CONFLICT DO NOTHING).
 *
 * Llama al RPC seed_stock_for_company creado en migration v53.
 *
 * Retorna {rows_inserted, products_count, warehouses_count, ...summary}.
 */
export async function POST(req: NextRequest) {
  try {
    // Auth + admin gate (operación destructiva masiva)
    const guard = await requireAdmin()
    if (!guard.ok) return guard.response

    const { companyId } = await req.json()
    if (!companyId) {
      return NextResponse.json({ error: 'companyId requerido' }, { status: 400 })
    }

    if (!(await userHasCompanyAccess(guard.ttUserId, guard.role, companyId))) {
      return NextResponse.json({ error: 'Sin acceso a esta empresa' }, { status: 403 })
    }

    const supabase = createServiceClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
      { auth: { persistSession: false } }
    )

    const { data: seed, error: seedErr } = await supabase.rpc('seed_stock_for_company', {
      p_company_id: companyId,
    })
    if (seedErr) {
      return NextResponse.json({ error: seedErr.message }, { status: 500 })
    }

    const { data: summary } = await supabase.rpc('stock_summary_for_company', {
      p_company_id: companyId,
    })

    return NextResponse.json({
      ok: true,
      seed: Array.isArray(seed) ? seed[0] : seed,
      summary: Array.isArray(summary) ? summary[0] : summary,
    })
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 500 })
  }
}

/**
 * GET /api/stock/seed?companyId=...
 * Devuelve solo el summary (no inserta nada). Para que el botón sepa si
 * tiene sentido ofrecer "Inicializar".
 */
export async function GET(req: NextRequest) {
  try {
    const guard = await withCompanyFilter()
    if (!guard.ok) return guard.response

    const companyId = req.nextUrl.searchParams.get('companyId')
    const access = ensureCompanyAccess(guard, companyId)
    if (!access.ok) return access.response

    const supabase = createServiceClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
      { auth: { persistSession: false } }
    )
    const { data, error } = await supabase.rpc('stock_summary_for_company', {
      p_company_id: companyId,
    })
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ ok: true, summary: Array.isArray(data) ? data[0] : data })
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 500 })
  }
}
