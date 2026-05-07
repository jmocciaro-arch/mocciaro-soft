import { NextRequest, NextResponse } from 'next/server'
import { createClient as createServiceClient } from '@supabase/supabase-js'
import { createClient } from '@/lib/supabase/server'

export const runtime = 'nodejs'

/**
 * GET /api/documents/:id/stock-reservations
 *
 * Devuelve las reservas de stock para un documento (típicamente un
 * pedido). Incluye datos del producto, warehouse y stock disponible
 * actual para que la UI pueda mostrar el estado completo.
 *
 * Response:
 * {
 *   reservations: [{ id, product_id, product_sku, product_name,
 *     warehouse_id, warehouse_name, quantity, status, available, ... }],
 *   summary: { active, consumed, released, cancelled },
 *   document_items: [{ product_id, product_sku, requested, reserved, shortfall }]
 * }
 */
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params

    const supabaseAuth = await createClient()
    const { data: { user } } = await supabaseAuth.auth.getUser()
    if (!user) return NextResponse.json({ error: 'No autenticado' }, { status: 401 })

    const supabase = createServiceClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
      { auth: { persistSession: false } }
    )

    // 1. Reservas del documento con joins
    const { data: reservations, error: rErr } = await supabase
      .from('tt_stock_reservations')
      .select(`
        id, document_item_id, product_id, warehouse_id, quantity, status,
        consumed_at, released_at, notes, created_at,
        product:tt_products(sku, name, brand),
        warehouse:tt_warehouses(code, name)
      `)
      .eq('document_id', id)
      .order('created_at', { ascending: true })

    if (rErr) {
      // Si la tabla no existe (v54 sin aplicar), devolver vacío sin error.
      if (rErr.message?.includes('does not exist') || rErr.code === 'PGRST205') {
        return NextResponse.json({
          reservations: [],
          summary: { active: 0, consumed: 0, released: 0, cancelled: 0 },
          document_items: [],
          warning: 'Migración v54 no aplicada (tt_stock_reservations no existe)',
        })
      }
      return NextResponse.json({ error: rErr.message }, { status: 500 })
    }

    // 2. Items del documento + stock disponible actual por línea
    const { data: docItems } = await supabase
      .from('tt_document_items')
      .select('id, product_id, sku, description, quantity, product:tt_products(sku, name)')
      .eq('document_id', id)
      .order('sort_order')

    // Resolver warehouse del documento
    const { data: doc } = await supabase
      .from('tt_documents')
      .select('id, company_id, warehouse_id')
      .eq('id', id)
      .single()

    let warehouseId = (doc as Record<string, unknown> | null)?.warehouse_id as string | null
    if (!warehouseId && doc) {
      const { data: wh } = await supabase
        .from('tt_warehouses')
        .select('id')
        .eq('company_id', (doc as Record<string, unknown>).company_id as string)
        .eq('active', true)
        .order('code', { ascending: true })
        .limit(1)
      warehouseId = (wh?.[0]?.id as string) || null
    }

    // Stock actual por producto en ese warehouse
    const productIds = (docItems || [])
      .map((it: { product_id: string | null }) => it.product_id)
      .filter(Boolean) as string[]
    let stockMap = new Map<string, { quantity: number; reserved: number }>()
    if (productIds.length > 0 && warehouseId) {
      const { data: stockRows } = await supabase
        .from('tt_stock')
        .select('product_id, quantity, reserved')
        .in('product_id', productIds)
        .eq('warehouse_id', warehouseId)
      stockMap = new Map(
        (stockRows || []).map((s: { product_id: string; quantity: number; reserved: number }) => [
          s.product_id,
          { quantity: s.quantity || 0, reserved: s.reserved || 0 },
        ])
      )
    }

    // 3. Reservas activas indexadas por producto para shortfall
    const activeByProduct = new Map<string, number>()
    for (const r of (reservations || []) as Array<{ product_id: string; quantity: number; status: string }>) {
      if (r.status === 'active') {
        activeByProduct.set(r.product_id, (activeByProduct.get(r.product_id) || 0) + (r.quantity || 0))
      }
    }

    const documentItems = (docItems || []).map((it: Record<string, unknown>) => {
      const productId = it.product_id as string | null
      const requested = (it.quantity as number) || 0
      const reserved = productId ? activeByProduct.get(productId) || 0 : 0
      const stock = productId ? stockMap.get(productId) : undefined
      const available = stock ? Math.max(0, stock.quantity - stock.reserved) : 0
      const product = it.product as Record<string, string> | null
      return {
        item_id: it.id as string,
        product_id: productId,
        sku: (it.sku as string) || product?.sku || null,
        name: product?.name || (it.description as string) || null,
        requested,
        reserved,
        shortfall: Math.max(0, requested - reserved),
        available_now: available,
      }
    })

    // 4. Summary por status
    const summary = { active: 0, consumed: 0, released: 0, cancelled: 0 }
    for (const r of (reservations || []) as Array<{ status: string }>) {
      const s = r.status as keyof typeof summary
      if (s in summary) summary[s] = (summary[s] || 0) + 1
    }

    // 5. Enriquecer reservations con stock disponible
    const enriched = (reservations || []).map((r: Record<string, unknown>) => {
      const product = r.product as Record<string, string> | null
      const wh = r.warehouse as Record<string, string> | null
      const productId = r.product_id as string
      const stock = stockMap.get(productId)
      return {
        id: r.id as string,
        product_id: productId,
        product_sku: product?.sku || null,
        product_name: product?.name || null,
        product_brand: product?.brand || null,
        warehouse_id: r.warehouse_id as string,
        warehouse_code: wh?.code || null,
        warehouse_name: wh?.name || null,
        quantity: r.quantity as number,
        status: r.status as string,
        notes: r.notes as string | null,
        consumed_at: r.consumed_at as string | null,
        released_at: r.released_at as string | null,
        created_at: r.created_at as string,
        stock_quantity: stock?.quantity ?? null,
        stock_reserved: stock?.reserved ?? null,
        stock_available: stock ? Math.max(0, stock.quantity - stock.reserved) : null,
      }
    })

    return NextResponse.json({
      reservations: enriched,
      summary,
      document_items: documentItems,
      warehouse_id: warehouseId,
    })
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 500 })
  }
}
