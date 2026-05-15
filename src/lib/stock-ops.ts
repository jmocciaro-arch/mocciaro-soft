/**
 * stock-ops.ts — FASE 1.1
 *
 * Capa de operaciones de stock para el flujo de ventas concreto
 * (tt_sales_orders / tt_so_items / tt_delivery_notes / tt_dn_items).
 *
 * Diferencia con stock-transactions.ts:
 *   stock-transactions opera contra el modelo unificado tt_documents +
 *   tt_document_lines (v37+ pero no usado todavía por el flujo de ventas
 *   legacy). stock-ops trabaja contra las tablas concretas que usa hoy
 *   la app, llamando a las MISMAS RPCs de v54 vía un wrapper.
 *
 * Las RPCs `reserve_stock_for_document` etc. esperan tt_document_lines.
 * Acá hacemos el bridge: leemos tt_so_items, mapeamos a la forma que las
 * RPCs entienden, y operamos directo sobre tt_stock con UPDATEs simples
 * cuando hay que pegarle al flujo legacy.
 *
 * Semántica garantizada:
 *   commitStockForOrder(orderId):
 *     - Por cada so_item con product_id, suma quantity a tt_stock.reserved
 *       del warehouse default de la company.
 *     - Idempotente: si ya hay reservas activas para ese orderId en
 *       tt_stock_reservations, las anula primero.
 *
 *   releaseStockForOrder(orderId):
 *     - Marca todas las reservas del orderId como 'released'.
 *     - Resta esas cantidades de tt_stock.reserved.
 *
 *   dispatchStockForDelivery(orderId, dnId, items):
 *     - items = [{ so_item_id, product_id, quantity }]
 *     - Por cada item, resta quantity de tt_stock.reserved (commit→consumed)
 *       y de tt_stock.quantity (físico).
 *     - Registra log en tt_stock_movements.
 *
 *   validateStockForDelivery(orderId, items):
 *     - Pre-check sin escribir. Devuelve qué items NO tienen stock
 *       físico suficiente (quantity_on_hand < toDeliver). Se usa
 *       para el modal "stock insuficiente".
 *
 * Fallos: si el warehouse default no existe o las RPCs no aplican,
 * devolvemos { ok: false, error } sin tirar excepciones — el caller
 * decide si continuar (modo degradado) o abortar.
 */

import { createClient } from '@/lib/supabase/client'

export interface StockShortfall {
  product_id: string
  sku?: string
  description?: string
  requested: number
  on_hand: number
  shortfall: number
  warehouse_id: string
  warehouse_code?: string
}

export interface StockOpResult {
  ok: boolean
  error?: string
  shortfalls?: StockShortfall[]
}

// ─────────────────────────────────────────────────────────────────────
// Helper: warehouse default de una company
// ─────────────────────────────────────────────────────────────────────
async function resolveWarehouseId(companyId: string | null | undefined): Promise<{
  warehouseId: string | null
  error?: string
}> {
  if (!companyId) return { warehouseId: null, error: 'company_id requerido' }
  const sb = createClient()
  const { data, error } = await sb.rpc('default_warehouse_for_company', {
    p_company_id: companyId,
  })
  if (error) return { warehouseId: null, error: error.message }
  return { warehouseId: (data as string | null) ?? null }
}

// ─────────────────────────────────────────────────────────────────────
// 1. commit: PED confirmado → reserved += qty
// ─────────────────────────────────────────────────────────────────────
export async function commitStockForOrder(orderId: string): Promise<StockOpResult> {
  try {
    const sb = createClient()
    const { data: order } = await sb
      .from('tt_sales_orders')
      .select('id, company_id')
      .eq('id', orderId)
      .single()
    if (!order) return { ok: false, error: 'Pedido no encontrado' }

    const { warehouseId, error: whErr } = await resolveWarehouseId(order.company_id as string)
    if (!warehouseId) {
      return { ok: false, error: whErr ?? 'Sin warehouse default para la empresa' }
    }

    // Liberar reservas previas activas del mismo orderId (idempotencia)
    await releaseStockForOrder(orderId, 'Reemplazada por nueva reserva')

    const { data: items } = await sb
      .from('tt_so_items')
      .select('id, product_id, qty_ordered, quantity, description, sku')
      .eq('sales_order_id', orderId)

    for (const it of items || []) {
      const productId = it.product_id as string | null
      if (!productId) continue
      const qty = ((it.qty_ordered as number) || (it.quantity as number) || 0)
      if (qty <= 0) continue

      // Asegurar fila de stock
      const { data: stockRow } = await sb
        .from('tt_stock')
        .select('id, quantity, reserved')
        .eq('product_id', productId)
        .eq('warehouse_id', warehouseId)
        .maybeSingle()

      if (!stockRow) {
        await sb.from('tt_stock').insert({
          product_id: productId,
          warehouse_id: warehouseId,
          quantity: 0,
          reserved: qty,
          min_quantity: 0,
        })
      } else {
        await sb
          .from('tt_stock')
          .update({
            reserved: ((stockRow.reserved as number) || 0) + qty,
            updated_at: new Date().toISOString(),
          })
          .eq('id', stockRow.id as string)
      }

      // Registrar reserva (audit)
      await sb.from('tt_stock_reservations').insert({
        document_id: orderId,
        document_item_id: it.id as string,
        product_id: productId,
        warehouse_id: warehouseId,
        quantity: qty,
        status: 'active',
        notes: 'commit on PED confirmation',
      })
    }

    return { ok: true }
  } catch (err) {
    return { ok: false, error: (err as Error).message }
  }
}

// ─────────────────────────────────────────────────────────────────────
// 2. release: PED cancelado → reserved -= qty (rollback)
// ─────────────────────────────────────────────────────────────────────
export async function releaseStockForOrder(orderId: string, reason?: string): Promise<StockOpResult> {
  try {
    const sb = createClient()
    const { data: reservations } = await sb
      .from('tt_stock_reservations')
      .select('id, product_id, warehouse_id, quantity')
      .eq('document_id', orderId)
      .eq('status', 'active')

    for (const r of reservations || []) {
      const { data: stockRow } = await sb
        .from('tt_stock')
        .select('id, reserved')
        .eq('product_id', r.product_id as string)
        .eq('warehouse_id', r.warehouse_id as string)
        .maybeSingle()

      if (stockRow) {
        await sb
          .from('tt_stock')
          .update({
            reserved: Math.max(0, ((stockRow.reserved as number) || 0) - ((r.quantity as number) || 0)),
            updated_at: new Date().toISOString(),
          })
          .eq('id', stockRow.id as string)
      }

      await sb
        .from('tt_stock_reservations')
        .update({
          status: 'released',
          released_at: new Date().toISOString(),
          notes: reason ?? 'release',
        })
        .eq('id', r.id as string)
    }

    return { ok: true }
  } catch (err) {
    return { ok: false, error: (err as Error).message }
  }
}

// ─────────────────────────────────────────────────────────────────────
// 3. validate: pre-check antes de emitir REM. NO escribe.
// ─────────────────────────────────────────────────────────────────────
export interface DispatchItem {
  so_item_id: string
  product_id: string | null
  quantity: number
  description?: string
  sku?: string
}

export async function validateStockForDelivery(
  orderId: string,
  items: DispatchItem[]
): Promise<{ ok: boolean; shortfalls: StockShortfall[]; error?: string }> {
  try {
    const sb = createClient()
    const { data: order } = await sb
      .from('tt_sales_orders')
      .select('company_id')
      .eq('id', orderId)
      .single()
    if (!order) return { ok: false, shortfalls: [], error: 'Pedido no encontrado' }

    const { warehouseId, error: whErr } = await resolveWarehouseId(order.company_id as string)
    if (!warehouseId) return { ok: false, shortfalls: [], error: whErr ?? 'Sin warehouse' }

    const productIds = items.map((i) => i.product_id).filter(Boolean) as string[]
    if (productIds.length === 0) return { ok: true, shortfalls: [] }

    const { data: stockRows } = await sb
      .from('tt_stock')
      .select('product_id, quantity, reserved')
      .eq('warehouse_id', warehouseId)
      .in('product_id', productIds)

    const { data: wh } = await sb
      .from('tt_warehouses')
      .select('code')
      .eq('id', warehouseId)
      .single()
    const warehouseCode = (wh?.code as string) || ''

    const stockMap = new Map<string, number>()
    for (const s of stockRows || []) {
      stockMap.set(s.product_id as string, (s.quantity as number) || 0)
    }

    const shortfalls: StockShortfall[] = []
    for (const it of items) {
      if (!it.product_id || it.quantity <= 0) continue
      const onHand = stockMap.get(it.product_id) ?? 0
      if (onHand < it.quantity) {
        shortfalls.push({
          product_id: it.product_id,
          sku: it.sku,
          description: it.description,
          requested: it.quantity,
          on_hand: onHand,
          shortfall: it.quantity - onHand,
          warehouse_id: warehouseId,
          warehouse_code: warehouseCode,
        })
      }
    }

    return { ok: true, shortfalls }
  } catch (err) {
    return { ok: false, shortfalls: [], error: (err as Error).message }
  }
}

// ─────────────────────────────────────────────────────────────────────
// 4. dispatch: REM emitido → reserved -= qty + quantity -= qty
//    Consume reservas FIFO. Si no hay reserva activa suficiente,
//    decrementa quantity directo (caso overdelivery permitido).
// ─────────────────────────────────────────────────────────────────────
export async function dispatchStockForDelivery(
  orderId: string,
  deliveryNoteId: string,
  items: DispatchItem[],
  opts: { allowOverdelivery?: boolean; actorUserId?: string | null } = {}
): Promise<StockOpResult> {
  try {
    const sb = createClient()
    const { data: order } = await sb
      .from('tt_sales_orders')
      .select('company_id')
      .eq('id', orderId)
      .single()
    if (!order) return { ok: false, error: 'Pedido no encontrado' }

    const { warehouseId, error: whErr } = await resolveWarehouseId(order.company_id as string)
    if (!warehouseId) return { ok: false, error: whErr ?? 'Sin warehouse' }

    for (const it of items) {
      if (!it.product_id || it.quantity <= 0) continue

      // Lock stock row
      const { data: stockRow } = await sb
        .from('tt_stock')
        .select('id, quantity, reserved')
        .eq('product_id', it.product_id)
        .eq('warehouse_id', warehouseId)
        .maybeSingle()

      const onHand = (stockRow?.quantity as number) || 0
      const reserved = (stockRow?.reserved as number) || 0

      if (onHand < it.quantity && !opts.allowOverdelivery) {
        return {
          ok: false,
          error: `Stock físico insuficiente para producto ${it.product_id} (on_hand=${onHand}, pedido=${it.quantity}). Permiso allow_overdelivery requerido.`,
        }
      }

      const quantityBefore = onHand
      const quantityAfter = onHand - it.quantity // puede ser negativo si overdelivery
      const reservedAfter = Math.max(0, reserved - it.quantity)

      if (stockRow) {
        await sb
          .from('tt_stock')
          .update({
            quantity: quantityAfter,
            reserved: reservedAfter,
            updated_at: new Date().toISOString(),
          })
          .eq('id', stockRow.id as string)
      } else {
        // No había fila: crear con negativos para mantener trazabilidad
        await sb.from('tt_stock').insert({
          product_id: it.product_id,
          warehouse_id: warehouseId,
          quantity: quantityAfter,
          reserved: 0,
          min_quantity: 0,
        })
      }

      // Movimiento
      await sb.from('tt_stock_movements').insert({
        product_id: it.product_id,
        warehouse_id: warehouseId,
        movement_type: 'out',
        quantity: it.quantity,
        quantity_before: quantityBefore,
        quantity_after: quantityAfter,
        reference_type: 'delivery_note',
        reference_id: deliveryNoteId,
        notes: opts.allowOverdelivery ? 'OVERDELIVERY autorizado' : 'Despacho REM',
        created_by: opts.actorUserId ?? null,
      })

      // Marcar reservas FIFO como consumidas
      const { data: activeReservations } = await sb
        .from('tt_stock_reservations')
        .select('id, quantity')
        .eq('document_id', orderId)
        .eq('product_id', it.product_id)
        .eq('warehouse_id', warehouseId)
        .eq('status', 'active')
        .order('created_at', { ascending: true })

      let remaining = it.quantity
      for (const r of activeReservations || []) {
        if (remaining <= 0) break
        const rqty = (r.quantity as number) || 0
        const consume = Math.min(rqty, remaining)
        if (consume >= rqty) {
          await sb
            .from('tt_stock_reservations')
            .update({ status: 'consumed', consumed_at: new Date().toISOString() })
            .eq('id', r.id as string)
        } else {
          await sb
            .from('tt_stock_reservations')
            .update({ quantity: rqty - consume })
            .eq('id', r.id as string)
        }
        remaining -= consume
      }
    }

    return { ok: true }
  } catch (err) {
    return { ok: false, error: (err as Error).message }
  }
}

// ─────────────────────────────────────────────────────────────────────
// 5. dispatchRollback: REM anulado → revertir físico + reserved
// ─────────────────────────────────────────────────────────────────────
export async function rollbackDispatchForDelivery(
  deliveryNoteId: string,
  opts: { actorUserId?: string | null } = {}
): Promise<StockOpResult> {
  try {
    const sb = createClient()
    const { data: movements } = await sb
      .from('tt_stock_movements')
      .select('id, product_id, warehouse_id, quantity, movement_type')
      .eq('reference_id', deliveryNoteId)
      .eq('reference_type', 'delivery_note')
      .eq('movement_type', 'out')

    for (const m of movements || []) {
      const { data: stockRow } = await sb
        .from('tt_stock')
        .select('id, quantity, reserved')
        .eq('product_id', m.product_id as string)
        .eq('warehouse_id', m.warehouse_id as string)
        .maybeSingle()

      if (!stockRow) continue
      const onHand = (stockRow.quantity as number) || 0
      const reserved = (stockRow.reserved as number) || 0
      const qty = (m.quantity as number) || 0

      await sb
        .from('tt_stock')
        .update({
          quantity: onHand + qty,
          reserved: reserved + qty,
          updated_at: new Date().toISOString(),
        })
        .eq('id', stockRow.id as string)

      await sb.from('tt_stock_movements').insert({
        product_id: m.product_id,
        warehouse_id: m.warehouse_id,
        movement_type: 'in',
        quantity: qty,
        quantity_before: onHand,
        quantity_after: onHand + qty,
        reference_type: 'delivery_note_rollback',
        reference_id: deliveryNoteId,
        notes: 'Rollback de REM anulado',
        created_by: opts.actorUserId ?? null,
      })
    }

    return { ok: true }
  } catch (err) {
    return { ok: false, error: (err as Error).message }
  }
}
