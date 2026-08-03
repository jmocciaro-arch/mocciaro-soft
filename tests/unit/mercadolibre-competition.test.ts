import { describe, it, expect, afterEach, vi } from 'vitest'
import { analyzeListingCompetition } from '@/lib/channels/mercadolibre-competition'

/**
 * Lógica de competencia ML — casos de negocio que la API real no garantiza por
 * sí sola: ganador implícito cuando hay un único vendedor, ranking/gap de precio
 * cuando perdés el Buy Box, y degradado limpio para publicaciones no catalogadas.
 *
 * fetch se mockea por URL (la más específica gana) para no pegarle a ML.
 */

const TOKEN = 'fake-token'
const EXT = 'MLA1' // item propio
const CPID = 'MLAP1' // catalog_product_id
const MY_USER = 100

type Route = { status?: number; body: unknown }

function stubFetch(routes: Record<string, Route>) {
  // Orden por longitud de key desc: '/products/CPID/items' gana sobre '/products/CPID'.
  const keys = Object.keys(routes).sort((a, b) => b.length - a.length)
  const fn = vi.fn(async (url: string) => {
    const key = keys.find(k => url.includes(k))
    const r = key ? routes[key] : undefined
    const status = r?.status ?? (r ? 200 : 404)
    return {
      ok: status >= 200 && status < 300,
      status,
      json: async () => r?.body ?? {},
      text: async () => JSON.stringify(r?.body ?? {}),
    } as Response
  })
  vi.stubGlobal('fetch', fn)
  return fn
}

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('analyzeListingCompetition', () => {
  it('publicación no catalogada → in_catalog false, sin competencia', async () => {
    stubFetch({
      [`/items/${EXT}?`]: { body: { title: 'Algo', price: 150, currency_id: 'ARS', catalog_listing: false, catalog_product_id: null } },
    })
    const a = await analyzeListingCompetition(TOKEN, EXT, MY_USER)
    expect(a.in_catalog).toBe(false)
    expect(a.competitors_count).toBe(0)
    expect(a.offers).toEqual([])
    expect(a.winner).toBeNull()
    expect(a.my_price).toBe(150)
  })

  it('único vendedor (vos) → ganás por descarte sin pedir nickname', async () => {
    const fetchFn = stubFetch({
      [`/items/${EXT}?`]: { body: { title: 'X', price: 150, currency_id: 'ARS', catalog_listing: true, catalog_product_id: CPID } },
      [`/products/${CPID}`]: { body: { name: 'Producto X', buy_box_winner: null } },
      [`/products/${CPID}/items`]: { body: { paging: { total: 1 }, results: [
        { item_id: EXT, seller_id: MY_USER, price: 150, currency_id: 'ARS', listing_type_id: 'gold_special', shipping: { free_shipping: true } },
      ] } },
    })
    const a = await analyzeListingCompetition(TOKEN, EXT, MY_USER)
    expect(a.in_catalog).toBe(true)
    expect(a.competitors_count).toBe(1)
    expect(a.i_win_buy_box).toBe(true)
    expect(a.winner?.item_id).toBe(EXT)
    expect(a.winner?.is_mine).toBe(true)
    expect(a.my_price_rank).toBe(1)
    // No se pide nickname cuando el ganador sos vos.
    expect(fetchFn.mock.calls.some(c => String(c[0]).includes('/users/'))).toBe(false)
  })

  it('perdés el Buy Box → ganador es otro, gap y ranking de precio correctos', async () => {
    stubFetch({
      [`/items/${EXT}?`]: { body: { title: 'X', price: 150, currency_id: 'ARS', sold_quantity: 2, catalog_listing: true, catalog_product_id: CPID } },
      [`/products/${CPID}`]: { body: { name: 'Producto X', buy_box_winner: { item_id: 'MLA-OTRO', seller_id: 200, price: 120 } } },
      [`/products/${CPID}/items`]: { body: { paging: { total: 3 }, results: [
        { item_id: EXT, seller_id: MY_USER, price: 150, currency_id: 'ARS', listing_type_id: 'gold_special', shipping: { free_shipping: true } },
        { item_id: 'MLA-OTRO', seller_id: 200, price: 120, currency_id: 'ARS', listing_type_id: 'gold_pro', shipping: { free_shipping: true } },
        { item_id: 'MLA-3', seller_id: 300, price: 180, currency_id: 'ARS', listing_type_id: 'gold_special', shipping: { free_shipping: false } },
      ] } },
      '/users/200': { body: { nickname: 'COMPETIDOR_X' } },
    })
    const a = await analyzeListingCompetition(TOKEN, EXT, MY_USER)
    expect(a.i_win_buy_box).toBe(false)
    expect(a.winner?.item_id).toBe('MLA-OTRO')
    expect(a.winner?.seller_nickname).toBe('COMPETIDOR_X')
    expect(a.price_gap_to_winner).toBe(30) // 150 - 120
    expect(a.price_min).toBe(120)
    expect(a.price_max).toBe(180)
    expect(a.price_avg).toBe(150)
    expect(a.my_price_rank).toBe(2) // un solo competidor más barato (120)
    // Ofertas ordenadas por precio ascendente.
    expect(a.offers.map(o => o.price)).toEqual([120, 150, 180])
  })

  it('catálogo sin ofertas activas (404 "No winners found") → degrada sin tirar', async () => {
    stubFetch({
      [`/items/${EXT}?`]: { body: { title: 'X', price: 150, currency_id: 'ARS', catalog_listing: true, catalog_product_id: CPID } },
      [`/products/${CPID}`]: { body: { name: 'Producto X', buy_box_winner: null } },
      [`/products/${CPID}/items`]: { status: 404, body: { message: 'No winners found' } },
    })
    const a = await analyzeListingCompetition(TOKEN, EXT, MY_USER)
    expect(a.in_catalog).toBe(true)
    expect(a.competitors_count).toBe(0)
    expect(a.i_win_buy_box).toBeNull()
    expect(a.winner).toBeNull()
  })
})
