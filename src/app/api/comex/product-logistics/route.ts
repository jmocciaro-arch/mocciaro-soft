import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { getAdminClient } from '@/lib/supabase/admin'
import { requireAuth } from '@/lib/auth/require-admin'
import { userHasRbacPermission } from '@/lib/auth/rbac-server'

export const runtime = 'nodejs'

const PAGE_SIZE = 30

/**
 * GET /api/comex/product-logistics?q=&page=0
 * Busca productos por SKU/nombre y trae sus datos físicos (left join al
 * satélite). Paginado: con 18k productos NUNCA se cargan todos. Requiere view_comex.
 */
export async function GET(req: NextRequest) {
  const auth = await requireAuth()
  if (!auth.ok) return auth.response
  const admin = getAdminClient()
  if (!(await userHasRbacPermission(admin, auth.ttUserId, auth.role, 'view_comex'))) {
    return NextResponse.json({ error: 'Falta el permiso view_comex' }, { status: 403 })
  }

  const qRaw = (req.nextUrl.searchParams.get('q') ?? '').trim()
  // Sanitizar: el texto va interpolado en el string de filtro de PostgREST (.or),
  // donde coma/paréntesis/asterisco/% son estructurales. Sin esto, un view_comex
  // podría inyectar términos OR y leer columnas sensibles de tt_products (corre
  // con admin client, RLS bypasseada). Los quitamos en vez de escapar: en una
  // búsqueda de SKU no aportan y así el filtro es siempre seguro y bien formado.
  const q = qRaw.replace(/[,()*%]/g, ' ').trim()
  const page = Math.max(0, Number(req.nextUrl.searchParams.get('page') ?? '0') || 0)
  const from = page * PAGE_SIZE

  let query = admin
    .from('tt_products')
    // count 'estimated': el total es solo para mostrar "N productos" y la paginación;
    // un COUNT(*) exacto sobre 18k filas en cada request/página es costo evitable.
    .select('id, sku, name, weight_kg, logistics:tt_product_logistics(net_weight_kg, gross_weight_kg, length_cm, width_cm, height_cm, volume_m3, default_packing_id, units_per_packing)', { count: 'estimated' })
    // Los servicios (gestoría, comisiones, fletes) no se despachan: no tienen peso/volumen.
    .neq('product_type', 'service')
    .order('sku')
    .range(from, from + PAGE_SIZE - 1)
  if (q) query = query.or(`sku.ilike.%${q}%,name.ilike.%${q}%`)

  const { data, error, count } = await query
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ data, page, page_size: PAGE_SIZE, total: count ?? 0 })
}

const upsertSchema = z.object({
  product_id: z.string().uuid(),
  net_weight_kg: z.number().nonnegative().nullable().optional(),
  gross_weight_kg: z.number().nonnegative().nullable().optional(),
  length_cm: z.number().nonnegative().nullable().optional(),
  width_cm: z.number().nonnegative().nullable().optional(),
  height_cm: z.number().nonnegative().nullable().optional(),
  default_packing_id: z.string().uuid().nullable().optional(),
  units_per_packing: z.number().int().positive().nullable().optional(),
})

/**
 * PATCH /api/comex/product-logistics — upsert de los datos físicos de UN producto
 * (por product_id, satélite 1:1). Requiere manage_comex.
 */
export async function PATCH(req: NextRequest) {
  const auth = await requireAuth()
  if (!auth.ok) return auth.response
  const admin = getAdminClient()
  if (!(await userHasRbacPermission(admin, auth.ttUserId, auth.role, 'manage_comex'))) {
    return NextResponse.json({ error: 'Falta el permiso manage_comex' }, { status: 403 })
  }
  let body: unknown
  try { body = await req.json() } catch { return NextResponse.json({ error: 'JSON inválido' }, { status: 400 }) }
  const parsed = upsertSchema.safeParse(body)
  if (!parsed.success) return NextResponse.json({ error: 'Validación falló', issues: z.treeifyError(parsed.error) }, { status: 400 })

  const row = { ...parsed.data, updated_at: new Date().toISOString() }
  const { data, error } = await admin
    .from('tt_product_logistics')
    .upsert(row, { onConflict: 'product_id' })
    .select('product_id, net_weight_kg, gross_weight_kg, length_cm, width_cm, height_cm, volume_m3, default_packing_id, units_per_packing')
    .single()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ success: true, data })
}
