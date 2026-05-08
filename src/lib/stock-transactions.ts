/**
 * Stock transaccional — wrapper sobre las RPCs creadas en migration v54.
 *
 * Estas funciones son la interfaz para reservar / liberar / consumir
 * stock desde el código de aplicación (handlers de pedidos y albaranes).
 *
 * NO se invocan automáticamente todavía. La activación gradual es
 * responsabilidad de los handlers (quoteToOrder, orderToDeliveryNote,
 * etc.) — un próximo PR conectará el flujo. Esto es la infraestructura.
 *
 * Tolerancia a fallas: si la migración v54 todavía no se aplicó en
 * producción, las RPCs no existen y todas las funciones devuelven
 * `{ ok: false, error: '...' }` sin crashear el flujo del usuario.
 */
import { createClient } from '@/lib/supabase/client'

export interface ReserveRow {
  product_id: string
  warehouse_id: string
  requested_qty: number
  reserved_qty: number
  available_qty: number
  shortfall: number
}

export interface ReserveResult {
  ok: boolean
  rows?: ReserveRow[]
  error?: string
  /** True si algún ítem quedó sin reserva completa */
  hasShortfall?: boolean
}

/**
 * Reserva stock para un documento (típicamente un pedido).
 * Idempotente: si ya había reservas activas, las cancela y crea nuevas.
 *
 * @param strict si true, falla si no hay stock suficiente. Default false.
 */
export async function reserveStockForDocument(
  documentId: string,
  options: { strict?: boolean } = {}
): Promise<ReserveResult> {
  try {
    const sb = createClient()
    const { data, error } = await sb.rpc('reserve_stock_for_document', {
      p_document_id: documentId,
      p_strict: options.strict ?? false,
    })
    if (error) return { ok: false, error: error.message }
    const rows = (data as ReserveRow[]) || []
    const hasShortfall = rows.some((r) => r.shortfall > 0)
    return { ok: true, rows, hasShortfall }
  } catch (err) {
    return { ok: false, error: (err as Error).message }
  }
}

/**
 * Libera todas las reservas activas de un documento.
 * Usar al cancelar un pedido o convertir cotización rechazada.
 */
export async function releaseStockForDocument(
  documentId: string,
  reason?: string
): Promise<{ ok: boolean; releasedCount?: number; error?: string }> {
  try {
    const sb = createClient()
    const { data, error } = await sb.rpc('release_stock_for_document', {
      p_document_id: documentId,
      p_reason: reason || null,
    })
    if (error) return { ok: false, error: error.message }
    return { ok: true, releasedCount: data as number }
  } catch (err) {
    return { ok: false, error: (err as Error).message }
  }
}

export interface ConsumeItem {
  product_id: string
  quantity: number
}

export interface ConsumeRow {
  product_id: string
  warehouse_id: string
  consumed_qty: number
  remaining_reservation: number | null
}

export interface ConsumeResult {
  ok: boolean
  rows?: ConsumeRow[]
  error?: string
}

/**
 * Consume las reservas de un documento padre (típicamente al despachar
 * un albarán a partir de un pedido). Decrementa quantity y reserved
 * del stock por cada ítem entregado.
 *
 * @param sourceDocumentId el pedido origen (que tiene las reservas).
 * @param items array de {product_id, quantity} a consumir.
 */
export async function consumeStockForDelivery(
  sourceDocumentId: string,
  items: ConsumeItem[]
): Promise<ConsumeResult> {
  try {
    const sb = createClient()
    const { data, error } = await sb.rpc('consume_stock_for_delivery', {
      p_source_document_id: sourceDocumentId,
      p_items: items,
    })
    if (error) return { ok: false, error: error.message }
    return { ok: true, rows: (data as ConsumeRow[]) || [] }
  } catch (err) {
    return { ok: false, error: (err as Error).message }
  }
}

/**
 * Pre-check sin escribir nada: ¿hay stock suficiente para confirmar
 * un pedido? Devuelve la lista de productos con disponibilidad real.
 *
 * Útil para mostrar warnings al usuario antes de confirmar.
 */
export async function checkStockAvailability(
  documentId: string
): Promise<{
  ok: boolean
  rows: Array<{ product_id: string; requested: number; available: number; shortfall: number }>
  hasShortfall: boolean
  error?: string
}> {
  try {
    const sb = createClient()

    // Leer items del doc + warehouse_id (o default de la company)
    const { data: doc } = await sb
      .from('tt_documents')
      .select('id, company_id, warehouse_id, items:tt_document_lines(id, product_id, quantity)')
      .eq('id', documentId)
      .single()

    if (!doc) return { ok: false, rows: [], hasShortfall: false, error: 'Documento no encontrado' }

    let warehouseId = (doc as Record<string, unknown>).warehouse_id as string | null
    if (!warehouseId) {
      const { data: wh } = await sb
        .from('tt_warehouses')
        .select('id')
        .eq('company_id', (doc as Record<string, unknown>).company_id as string)
        .eq('active', true)
        .order('code', { ascending: true })
        .limit(1)
      warehouseId = wh?.[0]?.id as string | undefined ?? null
    }

    if (!warehouseId) {
      return { ok: false, rows: [], hasShortfall: false, error: 'Sin warehouse default' }
    }

    const items = ((doc as Record<string, unknown>).items as Array<{
      product_id: string | null
      quantity: number
    }>) || []

    const productIds = items.map((i) => i.product_id).filter(Boolean) as string[]
    if (productIds.length === 0) {
      return { ok: true, rows: [], hasShortfall: false }
    }

    const { data: stockRows } = await sb
      .from('tt_stock')
      .select('product_id, quantity, reserved')
      .in('product_id', productIds)
      .eq('warehouse_id', warehouseId)

    const stockMap = new Map<string, { quantity: number; reserved: number }>()
    for (const s of stockRows || []) {
      stockMap.set(s.product_id as string, {
        quantity: (s.quantity as number) || 0,
        reserved: (s.reserved as number) || 0,
      })
    }

    const rows = items
      .filter((i): i is { product_id: string; quantity: number } => !!i.product_id)
      .map((i) => {
        const s = stockMap.get(i.product_id)
        const available = s ? Math.max(0, s.quantity - s.reserved) : 0
        const requested = i.quantity || 0
        return {
          product_id: i.product_id,
          requested,
          available,
          shortfall: Math.max(0, requested - available),
        }
      })

    return {
      ok: true,
      rows,
      hasShortfall: rows.some((r) => r.shortfall > 0),
    }
  } catch (err) {
    return { ok: false, rows: [], hasShortfall: false, error: (err as Error).message }
  }
}
