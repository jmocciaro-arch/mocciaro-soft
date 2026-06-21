import { getAdminClient } from '@/lib/supabase/admin'

/**
 * Resolución de precio por producto/cliente (server-side).
 *
 * Réplica de la lógica del cotizador (src/app/(dashboard)/cotizador/page.tsx
 * resolvePrice, L558-565): precio especial > descuento de cliente > tarifa
 * (lista de precios del cliente) > precio de catálogo.
 */

export type PriceSource = 'especial' | 'dto_cliente' | 'tarifa' | 'catalogo'

export interface ResolvedPrice {
  price: number
  source: PriceSource
  discount: number
}

export interface ClientPricing {
  /** product_id -> { special_price, discount_pct } de tt_client_prices */
  specials: Map<string, { special_price: number | null; discount_pct: number }>
  /** product_id -> price de la lista de precios del cliente (tt_price_list_items) */
  priceList: Map<string, number>
}

/** Vacío: sin cliente o sin condiciones particulares -> siempre cae a catálogo. */
export function emptyClientPricing(): ClientPricing {
  return { specials: new Map(), priceList: new Map() }
}

/**
 * Elige el mejor precio para un producto (puro, testeable).
 * Mismo orden de prioridad que el cotizador.
 */
export function pickPrice(productId: string, catalogPrice: number, pricing: ClientPricing): ResolvedPrice {
  const special = pricing.specials.get(productId)
  if (special?.special_price != null) {
    return { price: special.special_price, source: 'especial', discount: special.discount_pct }
  }
  if (special?.discount_pct) {
    return { price: catalogPrice * (1 - special.discount_pct / 100), source: 'dto_cliente', discount: special.discount_pct }
  }
  const plPrice = pricing.priceList.get(productId)
  if (plPrice != null) {
    return { price: plPrice, source: 'tarifa', discount: 0 }
  }
  return { price: catalogPrice, source: 'catalogo', discount: 0 }
}

/** Carga las condiciones de precio del cliente (especiales + lista de precios). */
export async function loadClientPricing(clientId: string | null | undefined): Promise<ClientPricing> {
  if (!clientId) return emptyClientPricing()
  const supabase = getAdminClient()

  const { data: specials } = await supabase
    .from('tt_client_prices')
    .select('product_id, special_price, discount_pct')
    .eq('client_id', clientId)

  const specialsMap = new Map<string, { special_price: number | null; discount_pct: number }>()
  for (const sp of (specials ?? []) as Array<{ product_id: string; special_price: number | null; discount_pct: number | null }>) {
    specialsMap.set(sp.product_id, { special_price: sp.special_price, discount_pct: sp.discount_pct ?? 0 })
  }

  const priceListMap = new Map<string, number>()
  const { data: client } = await supabase
    .from('tt_clients')
    .select('price_list_id')
    .eq('id', clientId)
    .maybeSingle()
  const priceListId = (client as { price_list_id: string | null } | null)?.price_list_id
  if (priceListId) {
    const { data: plItems } = await supabase
      .from('tt_price_list_items')
      .select('product_id, price')
      .eq('price_list_id', priceListId)
    for (const pli of (plItems ?? []) as Array<{ product_id: string; price: number }>) {
      priceListMap.set(pli.product_id, pli.price)
    }
  }

  return { specials: specialsMap, priceList: priceListMap }
}
