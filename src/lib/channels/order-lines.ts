/**
 * Conversión de una orden de canal en líneas de documento (spec §3.2).
 * Puro y lenient: el raw de cada marketplace varía; lo que no se puede
 * interpretar se descarta y siempre hay fallback a una línea con el total.
 */

export interface ParsedOrderItem {
  sku: string | null
  name: string
  quantity: number
  unitPrice: number
}

/** Líneas desde tt_channel_orders.raw.items ({ sku?, title, quantity, unit_price }). */
export function parseRawItems(raw: unknown): ParsedOrderItem[] {
  if (!raw || typeof raw !== 'object') return []
  const items = (raw as Record<string, unknown>).items
  if (!Array.isArray(items)) return []
  const out: ParsedOrderItem[] = []
  for (const entry of items) {
    if (!entry || typeof entry !== 'object') continue
    const item = entry as Record<string, unknown>
    const name = typeof item.title === 'string' && item.title.length > 0 ? item.title : null
    const quantity = Number(item.quantity)
    const unitPrice = Number(item.unit_price)
    if (!name || !Number.isFinite(quantity) || quantity <= 0) continue
    out.push({
      sku: typeof item.sku === 'string' && item.sku.length > 0 ? item.sku : null,
      name,
      quantity,
      unitPrice: Number.isFinite(unitPrice) ? unitPrice : 0,
    })
  }
  return out
}

/**
 * Líneas definitivas para el documento: items del raw o, si no hay nada
 * interpretable, una línea única con el total de la orden.
 */
export function orderToDocumentLines(args: {
  raw: unknown
  total: number | null
  externalOrderId: string
  channelLabel: string | null
}): ParsedOrderItem[] {
  const parsed = parseRawItems(args.raw)
  if (parsed.length > 0) return parsed
  return [{
    sku: null,
    name: `Orden ${args.channelLabel ?? 'de canal'} ${args.externalOrderId}`,
    quantity: 1,
    unitPrice: Number(args.total ?? 0),
  }]
}
