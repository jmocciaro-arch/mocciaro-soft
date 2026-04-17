import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

export const runtime = 'nodejs'

/**
 * POST /api/stock/check-availability
 * Body: { items: [{ sku: string, quantity: number }], warehouseId?: string }
 *
 * Verifica disponibilidad de stock para cada item.
 * Usa tt_stock (quantity) con join a tt_products por sku.
 * Si hay faltante, sugiere crear una OC de compra.
 */

interface CheckItem {
  sku: string
  quantity: number
}

interface ItemResult {
  sku: string
  requested: number
  available: number
  shortage: number
  status: 'ok' | 'partial' | 'unavailable'
}

interface CheckBody {
  items: CheckItem[]
  warehouseId?: string
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json() as CheckBody
    const { items, warehouseId } = body

    if (!items || !Array.isArray(items) || items.length === 0) {
      return NextResponse.json(
        { error: 'items requerido (array de { sku, quantity })' },
        { status: 400 }
      )
    }

    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
      { auth: { persistSession: false } }
    )

    const skus = items.map((i) => i.sku).filter(Boolean)

    // Buscar productos por SKU
    const { data: products } = await supabase
      .from('tt_products')
      .select('id, sku')
      .in('sku', skus)

    const productIdBySku = new Map<string, string>(
      (products || []).map((p: { id: string; sku: string }) => [p.sku, p.id])
    )
    const productIds = Array.from(productIdBySku.values())

    // Obtener stock de tt_stock
    let stockQuery = supabase
      .from('tt_stock')
      .select('product_id, quantity, warehouse_id')
      .in('product_id', productIds)

    if (warehouseId) {
      stockQuery = stockQuery.eq('warehouse_id', warehouseId)
    }

    const { data: stockData } = await stockQuery

    // Agregar stock por product_id
    const stockByProductId = new Map<string, number>()
    for (const row of stockData || []) {
      const stockRow = row as { product_id: string; quantity: number }
      const current = stockByProductId.get(stockRow.product_id) || 0
      stockByProductId.set(stockRow.product_id, current + (stockRow.quantity || 0))
    }

    // Construir resultado por SKU
    const results: ItemResult[] = items.map((item) => {
      const productId = productIdBySku.get(item.sku)
      const available = productId ? (stockByProductId.get(productId) || 0) : 0
      const shortage = Math.max(0, item.quantity - available)

      let status: 'ok' | 'partial' | 'unavailable' = 'ok'
      if (available === 0) status = 'unavailable'
      else if (shortage > 0) status = 'partial'

      return {
        sku: item.sku,
        requested: item.quantity,
        available,
        shortage,
        status,
      }
    })

    const allAvailable = results.every((r) => r.shortage === 0)
    const totalShortage = results.reduce((acc, r) => acc + r.shortage, 0)
    const itemsWithShortage = results.filter((r) => r.shortage > 0)

    return NextResponse.json({
      available: allAvailable,
      total_shortage: totalShortage,
      items: results,
      suggestion: !allAvailable
        ? `Hay ${itemsWithShortage.length} item(s) con stock insuficiente. Se recomienda crear una OC de compra.`
        : undefined,
    })
  } catch (err) {
    console.error('[stock/check-availability] Error:', err)
    return NextResponse.json({ error: (err as Error).message }, { status: 500 })
  }
}
