/**
 * Análisis de competencia / ranking de una publicación de MercadoLibre.
 *
 * CONTEXTO API (verificado en vivo contra la cuenta del seller, 2026-06-14):
 * ML cerró el buscador general por keyword (`/sites/MLA/search`) y los más
 * vendidos (`/highlights`) — devuelven 403 para apps de terceros. Por eso NO se
 * puede medir la posición exacta de una publicación en una búsqueda. Lo que ML
 * sí deja abierto con el token del seller es el mundo del Catálogo, que para
 * productos catalogados es la métrica que más mueve la aguja: quién gana el
 * Buy Box y a qué precio.
 *
 * Endpoints usados (todos requieren Bearer del seller):
 *   GET /items/{id}              → detalle propio (catalog_listing, precio…)
 *   GET /products/{cpid}         → producto de catálogo + buy_box_winner
 *   GET /products/{cpid}/items   → TODOS los vendedores que compiten + precios
 *   GET /users/{id}              → nickname del ganador (best-effort, 1 request)
 *
 * Es "foto del día": no persiste nada. El histórico (snapshots + tendencias)
 * queda para la Fase B con un cron.
 */

const ML_API_BASE = 'https://api.mercadolibre.com'

/** Una oferta compitiendo por el mismo producto de catálogo. */
export interface CompetitorOffer {
  item_id: string
  seller_id: number
  /** La publicación es del propio seller (se marca "Vos" en la UI). */
  is_mine: boolean
  /** Gana el Buy Box (se lleva la venta del catálogo). */
  is_winner: boolean
  price: number | null
  currency: string | null
  listing_type_id: string | null
  free_shipping: boolean
  /** Solo se resuelve para el ganador (1 request); el resto queda null. */
  seller_nickname: string | null
}

/** Resultado completo del análisis de una publicación. */
export interface CompetitionAnalysis {
  item_id: string
  title: string | null
  my_price: number | null
  currency: string | null
  my_sold_quantity: number | null
  /** Si la publicación está en Catálogo de ML. Si es false, el resto va vacío. */
  in_catalog: boolean
  catalog_product_id: string | null
  catalog_name: string | null
  /** true=ganás, false=no ganás, null=no se pudo determinar un ganador. */
  i_win_buy_box: boolean | null
  winner: CompetitorOffer | null
  /** my_price - winner.price. Positivo = estás más caro que el ganador. */
  price_gap_to_winner: number | null
  competitors_count: number
  price_min: number | null
  price_avg: number | null
  price_max: number | null
  /** Posición de tu precio entre los competidores (1 = el más barato). */
  my_price_rank: number | null
  /** Ofertas ordenadas por precio ascendente (nulls al final). */
  offers: CompetitorOffer[]
}

// ─── Tipos crudos de la API de ML (solo los campos que consumimos) ───

interface MlItemDetail {
  title?: string
  price?: number
  currency_id?: string
  sold_quantity?: number
  catalog_listing?: boolean
  catalog_product_id?: string | null
}

interface MlBuyBoxWinner {
  item_id?: string
  seller_id?: number
  price?: number
}

interface MlCatalogProduct {
  name?: string
  buy_box_winner?: MlBuyBoxWinner | null
}

interface MlCatalogItemResult {
  item_id: string
  seller_id: number
  price?: number
  currency_id?: string
  listing_type_id?: string
  shipping?: { free_shipping?: boolean }
}

interface MlCatalogItems {
  paging?: { total?: number }
  results?: MlCatalogItemResult[]
}

function mlFetch(accessToken: string, path: string): Promise<Response> {
  return fetch(`${ML_API_BASE}${path}`, { headers: { authorization: `Bearer ${accessToken}` } })
}

/** Nickname de un vendedor. Best-effort: cualquier fallo devuelve null. */
async function fetchSellerNickname(accessToken: string, sellerId: number): Promise<string | null> {
  try {
    const res = await mlFetch(accessToken, `/users/${sellerId}`)
    if (!res.ok) return null
    const json = (await res.json()) as { nickname?: string }
    return json.nickname ?? null
  } catch {
    return null
  }
}

/**
 * Analiza la competencia de una publicación catalogada de ML.
 *
 * @param externalId  item_id de ML (ej. MLA2720490674)
 * @param myMlUserId  ml_user_id del seller, para marcar cuál oferta es propia
 * @throws si /items falla (sin eso no hay análisis posible). Los endpoints de
 *         catálogo degradan a "sin datos" en vez de tirar (404 "No winners
 *         found" = catálogo sin ofertas activas, no es error).
 */
export async function analyzeListingCompetition(
  accessToken: string,
  externalId: string,
  myMlUserId: number,
): Promise<CompetitionAnalysis> {
  const itemRes = await mlFetch(
    accessToken,
    `/items/${externalId}?attributes=title,price,currency_id,sold_quantity,catalog_listing,catalog_product_id`,
  )
  if (!itemRes.ok) {
    throw new Error(`ML /items/${externalId} ${itemRes.status}: ${await itemRes.text()}`)
  }
  const item = (await itemRes.json()) as MlItemDetail

  const base = {
    item_id: externalId,
    title: item.title ?? null,
    my_price: item.price ?? null,
    currency: item.currency_id ?? null,
    my_sold_quantity: item.sold_quantity ?? null,
  }

  // Publicación libre (no catalogada): ML no expone competencia por API.
  if (!item.catalog_listing || !item.catalog_product_id) {
    return {
      ...base,
      in_catalog: false,
      catalog_product_id: null,
      catalog_name: null,
      i_win_buy_box: null,
      winner: null,
      price_gap_to_winner: null,
      competitors_count: 0,
      price_min: null,
      price_avg: null,
      price_max: null,
      my_price_rank: null,
      offers: [],
    }
  }

  const cpid = item.catalog_product_id

  // Nombre del catálogo + ganador declarado por ML (puede venir null).
  let catalogName: string | null = null
  let declaredWinnerItemId: string | null = null
  const prodRes = await mlFetch(accessToken, `/products/${cpid}`)
  if (prodRes.ok) {
    const prod = (await prodRes.json()) as MlCatalogProduct
    catalogName = prod.name ?? null
    declaredWinnerItemId = prod.buy_box_winner?.item_id ?? null
  }

  // Todos los competidores del catálogo (primera página, hasta 100 — suficiente
  // para el benchmark; la paginación completa queda para Fase B si hiciera falta).
  const offers: CompetitorOffer[] = []
  const itemsRes = await mlFetch(accessToken, `/products/${cpid}/items`)
  if (itemsRes.ok) {
    const data = (await itemsRes.json()) as MlCatalogItems
    for (const r of data.results ?? []) {
      offers.push({
        item_id: r.item_id,
        seller_id: r.seller_id,
        is_mine: r.seller_id === myMlUserId,
        is_winner: false, // se resuelve abajo
        price: r.price ?? null,
        currency: r.currency_id ?? null,
        listing_type_id: r.listing_type_id ?? null,
        free_shipping: r.shipping?.free_shipping ?? false,
        seller_nickname: null,
      })
    }
  } else if (itemsRes.status !== 404) {
    throw new Error(`ML /products/${cpid}/items ${itemsRes.status}: ${await itemsRes.text()}`)
  }

  // Ganador efectivo: el declarado por ML; si no lo hay pero existe una sola
  // oferta, esa gana por descarte (caso típico de catálogo con un único seller).
  let winnerItemId = declaredWinnerItemId
  if (!winnerItemId && offers.length === 1) winnerItemId = offers[0].item_id
  for (const o of offers) o.is_winner = winnerItemId != null && o.item_id === winnerItemId

  // Saber a quién le perdés justifica 1 request extra (solo si el ganador no sos vos).
  const winnerOffer = offers.find(o => o.is_winner) ?? null
  if (winnerOffer && !winnerOffer.is_mine) {
    winnerOffer.seller_nickname = await fetchSellerNickname(accessToken, winnerOffer.seller_id)
  }

  const priced = offers.map(o => o.price).filter((p): p is number => p != null)
  const priceMin = priced.length ? Math.min(...priced) : null
  const priceMax = priced.length ? Math.max(...priced) : null
  const priceAvg = priced.length ? priced.reduce((a, b) => a + b, 0) / priced.length : null

  const myOffer = offers.find(o => o.is_mine) ?? null
  const myPriceForRank = myOffer?.price ?? null
  const myPriceRank = myPriceForRank != null
    ? priced.filter(p => p < myPriceForRank).length + 1
    : null

  const hasWinner = offers.some(o => o.is_winner)
  const iWinBuyBox = hasWinner ? offers.some(o => o.is_mine && o.is_winner) : null
  const priceGap = myPriceForRank != null && winnerOffer?.price != null
    ? myPriceForRank - winnerOffer.price
    : null

  // Orden por precio asc para la tabla; las ofertas sin precio van al final.
  const sortedOffers = [...offers].sort((a, b) => {
    if (a.price == null) return 1
    if (b.price == null) return -1
    return a.price - b.price
  })

  return {
    ...base,
    in_catalog: true,
    catalog_product_id: cpid,
    catalog_name: catalogName,
    i_win_buy_box: iWinBuyBox,
    winner: winnerOffer,
    price_gap_to_winner: priceGap,
    competitors_count: offers.length,
    price_min: priceMin,
    price_avg: priceAvg,
    price_max: priceMax,
    my_price_rank: myPriceRank,
    offers: sortedOffers,
  }
}
