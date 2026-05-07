/**
 * Stock workflow hooks — invocan los RPCs de stock transaccional en
 * los momentos clave del workflow de venta:
 *
 *   - Pedido creado/confirmado → reserva stock.
 *   - Pedido cancelado → libera reservas.
 *   - Albarán despachado → consume reservas (decrementa stock).
 *
 * Diseñados para ser tolerantes a fallas:
 *   - Si la migración v54 no se aplicó aún, los RPCs no existen y
 *     se devuelve {ok:false, error} sin abortar el flujo principal.
 *   - Errores se loggean pero no se re-lanzan; el handler caller decide
 *     si mostrar warning al user o ignorar.
 *   - Solo aplican a documentos en `tt_documents` (modelo unificado).
 *     Los pedidos creados en `tt_sales_orders` (legacy) NO disparan
 *     reservas — eso es Sprint 2 cuando se migre el cotizador.
 */
import {
  reserveStockForDocument,
  releaseStockForDocument,
  consumeStockForDelivery,
  type ConsumeItem,
} from './stock-transactions'
import { createClient } from './supabase/client'

interface HookResult {
  applied: boolean
  message?: string
  warning?: string
  /** Detalle por línea cuando hubo shortfall */
  shortfalls?: Array<{ product_id: string; requested: number; reserved: number; missing: number }>
}

/**
 * Detecta si un id corresponde a un doc en `tt_documents` (modelo
 * unificado). Si no, los hooks hacen no-op para no fallar.
 */
async function isUnifiedDocument(documentId: string): Promise<boolean> {
  try {
    const sb = createClient()
    const { data, error } = await sb
      .from('tt_documents')
      .select('id')
      .eq('id', documentId)
      .maybeSingle()
    return !error && !!data
  } catch {
    return false
  }
}

/**
 * Llamar después de crear/confirmar un pedido en `tt_documents`.
 * Reserva el stock disponible. Si hay shortfall, lo reporta pero no
 * aborta — la app decide si dejar pasar o exigir resolución.
 */
export async function onOrderConfirmed(documentId: string): Promise<HookResult> {
  if (!(await isUnifiedDocument(documentId))) {
    return { applied: false, message: 'Doc no está en tt_documents (modelo legacy), reserva omitida' }
  }
  const result = await reserveStockForDocument(documentId, { strict: false })
  if (!result.ok) {
    return { applied: false, warning: `No se pudo reservar stock: ${result.error}` }
  }
  if (result.hasShortfall) {
    const shortfalls = (result.rows || [])
      .filter((r) => r.shortfall > 0)
      .map((r) => ({
        product_id: r.product_id,
        requested: r.requested_qty,
        reserved: r.reserved_qty,
        missing: r.shortfall,
      }))
    return {
      applied: true,
      warning: `Stock reservado parcialmente: ${shortfalls.length} ítem(s) sin stock suficiente`,
      shortfalls,
    }
  }
  return {
    applied: true,
    message: `Stock reservado para ${result.rows?.length || 0} ítem(s)`,
  }
}

/**
 * Llamar al cancelar un pedido. Libera todas las reservas activas.
 */
export async function onOrderCancelled(
  documentId: string,
  reason?: string
): Promise<HookResult> {
  if (!(await isUnifiedDocument(documentId))) {
    return { applied: false, message: 'Doc no está en tt_documents, release omitida' }
  }
  const result = await releaseStockForDocument(documentId, reason)
  if (!result.ok) {
    return { applied: false, warning: `No se pudo liberar reservas: ${result.error}` }
  }
  return {
    applied: true,
    message: `${result.releasedCount || 0} reserva(s) liberada(s)`,
  }
}

/**
 * Llamar al despachar un albarán. Consume las reservas del pedido
 * origen (consume = decrementa quantity y reserved del stock).
 *
 * @param sourceOrderId el pedido del que sale el albarán.
 * @param items lo que se entrega [{product_id, quantity}].
 */
export async function onDeliveryDispatched(
  sourceOrderId: string,
  items: ConsumeItem[]
): Promise<HookResult> {
  if (!(await isUnifiedDocument(sourceOrderId))) {
    return { applied: false, message: 'Pedido origen no está en tt_documents, consume omitido' }
  }
  if (items.length === 0) {
    return { applied: false, message: 'Sin items para despachar' }
  }
  const result = await consumeStockForDelivery(sourceOrderId, items)
  if (!result.ok) {
    return { applied: false, warning: `No se pudo consumir stock: ${result.error}` }
  }
  return {
    applied: true,
    message: `${result.rows?.length || 0} consumo(s) registrado(s)`,
  }
}
