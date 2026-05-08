import { NextRequest, NextResponse } from 'next/server'
import { getAdminClient } from '@/lib/supabase/admin'
import { requireAuth, userHasCompanyAccess } from '@/lib/auth/require-admin'

type Ctx = { params: Promise<{ id: string }> }

/**
 * GET /api/clients/:id/products — trazabilidad: productos comprados por el cliente
 *
 * Devuelve una fila por cada (cliente, producto) con totales agregados:
 * - docs_count, quotes_count, orders_count, invoices_count, deliveries_count
 * - total_quantity, total_subtotal
 * - avg_unit_price, min_unit_price, max_unit_price, last_unit_price
 * - first_purchase_at, last_purchase_at
 *
 * Lee de la vista v_client_product_history (ver migration-v63).
 */
export async function GET(req: NextRequest, { params }: Ctx) {
  const auth = await requireAuth()
  if (!auth.ok) return auth.response

  const { id: clientId } = await params
  const admin = getAdminClient()

  // Validar que el cliente existe y traer su company_id para chequeo de acceso
  const { data: client, error: clientErr } = await admin
    .from('tt_clients')
    .select('id, company_id, name, legal_name, tax_id')
    .eq('id', clientId)
    .maybeSingle()
  if (clientErr) return NextResponse.json({ error: clientErr.message }, { status: 500 })
  if (!client) return NextResponse.json({ error: 'Cliente no encontrado' }, { status: 404 })

  const canAccess = await userHasCompanyAccess(auth.ttUserId, auth.role, client.company_id as string)
  if (!canAccess) return NextResponse.json({ error: 'Sin acceso' }, { status: 403 })

  // Parámetros de query
  const { searchParams } = new URL(req.url)
  const limit = Math.min(500, Number(searchParams.get('limit') ?? '200'))
  const sortBy = (searchParams.get('sort') || 'last_purchase_at') as
    | 'last_purchase_at'
    | 'first_purchase_at'
    | 'total_quantity'
    | 'total_subtotal'
    | 'docs_count'
  const order = (searchParams.get('order') || 'desc').toLowerCase() === 'asc'
  const search = searchParams.get('q')?.trim()

  let query = admin
    .from('v_client_product_history')
    .select('*')
    .eq('client_id', clientId)

  if (search) {
    // Filtra por SKU o nombre (coalesce ya hecho en la vista como product_name)
    query = query.or(`sku.ilike.%${search}%,product_name.ilike.%${search}%`)
  }

  const { data, error } = await query
    .order(sortBy, { ascending: order })
    .limit(limit)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({
    client: { id: client.id, name: client.name, legal_name: client.legal_name, tax_id: client.tax_id },
    data: data || [],
    meta: { count: (data || []).length, sortBy, order: order ? 'asc' : 'desc', limit, search: search ?? null },
  })
}
