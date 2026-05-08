import { NextRequest, NextResponse } from 'next/server'
import { getAdminClient } from '@/lib/supabase/admin'
import { requireAuth, userHasCompanyAccess } from '@/lib/auth/require-admin'

type Ctx = { params: Promise<{ id: string }> }

/**
 * GET /api/products/:id/clients — trazabilidad: clientes que compraron el producto
 *
 * Devuelve una fila por cada (producto, cliente) con totales agregados.
 * Útil para ranking de clientes por producto y "última venta a cada cliente".
 *
 * Lee de la vista v_product_client_history (ver migration-v63).
 */
export async function GET(req: NextRequest, { params }: Ctx) {
  const auth = await requireAuth()
  if (!auth.ok) return auth.response

  const { id: productId } = await params
  const admin = getAdminClient()

  // Validar que el producto existe
  const { data: product, error: prodErr } = await admin
    .from('tt_products')
    .select('id, sku, name, brand, company_id')
    .eq('id', productId)
    .maybeSingle()
  if (prodErr) return NextResponse.json({ error: prodErr.message }, { status: 500 })
  if (!product) return NextResponse.json({ error: 'Producto no encontrado' }, { status: 404 })

  // Si el producto tiene company_id (algunos productos son globales = NULL),
  // verificar acceso. Si es global (company_id NULL), cualquier usuario auth.
  if (product.company_id) {
    const canAccess = await userHasCompanyAccess(
      auth.ttUserId, auth.role, product.company_id as string
    )
    if (!canAccess) return NextResponse.json({ error: 'Sin acceso' }, { status: 403 })
  }

  // Parámetros de query
  const { searchParams } = new URL(req.url)
  const limit = Math.min(500, Number(searchParams.get('limit') ?? '200'))
  const sortBy = (searchParams.get('sort') || 'total_subtotal') as
    | 'last_purchase_at'
    | 'first_purchase_at'
    | 'total_quantity'
    | 'total_subtotal'
    | 'docs_count'
  const order = (searchParams.get('order') || 'desc').toLowerCase() === 'asc'
  const search = searchParams.get('q')?.trim()
  const companyFilter = searchParams.get('company_id')

  let query = admin
    .from('v_product_client_history')
    .select('*')
    .eq('product_id', productId)

  if (companyFilter) query = query.eq('company_id', companyFilter)
  if (search) query = query.or(`client_name.ilike.%${search}%,client_legal_name.ilike.%${search}%,client_tax_id.ilike.%${search}%`)

  const { data, error } = await query
    .order(sortBy, { ascending: order })
    .limit(limit)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({
    product: { id: product.id, sku: product.sku, name: product.name, brand: product.brand },
    data: data || [],
    meta: { count: (data || []).length, sortBy, order: order ? 'asc' : 'desc', limit, search: search ?? null },
  })
}
