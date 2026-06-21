import { getAdminClient } from '@/lib/supabase/admin'

/**
 * Consulta de catálogo + stock para el asistente IA (read-only).
 *
 * Resuelve el caso "qué puntas PH2 tenemos en stock": busca productos que matcheen
 * el texto del usuario CRUZANDO TODAS las marcas/modelos (sobre tt_products.search_text)
 * y les anexa el stock real de la(s) empresa(s) accesibles (tt_stock vía warehouses).
 *
 * No usa IA: tokeniza el texto y hace match AND sobre search_text (mismo enfoque que
 * el fallback fuzzy de /api/products/smart-search). El asistente narra el resultado.
 */

export interface CatalogStockItem {
  sku: string
  name: string
  brand: string | null
  modelo: string | null
  price: number | null
  stock: number
}

// Palabras de relleno que no aportan a la búsqueda de producto.
const STOPWORDS = new Set([
  'de', 'la', 'el', 'en', 'que', 'tenemos', 'tenes', 'tienen', 'hay', 'tengo',
  'disponible', 'disponibles', 'stock', 'para', 'un', 'una', 'unos', 'unas',
  'con', 'los', 'las', 'del', 'al', 'me', 'decis', 'deci', 'mostrame', 'mostra',
  'cuanto', 'cuantos', 'cuantas', 'cual', 'cuales', 'queda', 'quedan', 'sobre',
])

function normalize(s: string): string {
  return (s || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
}

/** Tokeniza el texto del usuario en términos útiles para buscar producto. */
export function tokenizeQuery(query: string): string[] {
  return normalize(query)
    .replace(/[^a-z0-9/.\s-]/g, ' ')
    .split(/\s+/)
    .map((t) => t.trim())
    .filter((t) => t.length >= 2 && !STOPWORDS.has(t))
}

/**
 * Heurística: ¿el mensaje parece una consulta de catálogo/stock?
 * Dispara con palabras de inventario o con familias/medidas de producto.
 */
export function looksLikeCatalogQuery(text: string): boolean {
  const t = normalize(text)
  const stockWords = /\b(stock|inventario|disponib|hay|ten[e]s|tenemos|tienen|queda[n]?|cuant[oa]s?)\b/
  // Stems con borde solo a la izquierda → toleran plurales/variantes (balanceadores, puntas, hexagonal…)
  const productWords = /\b(ph\d|pz\d|t\d{1,3}|torx|phillip|pozidri|allen|hexagon|hex|punta|bit|llave|vaso|dado|balanceador|equilibrador|atornillador|destornillador|embocadura|adaptador|extension|nutsetter)/
  return stockWords.test(t) || productWords.test(t)
}

/**
 * Busca productos que matcheen el texto y les anexa el stock de las empresas accesibles.
 * @param accessibleCompanyIds empresas cuyas warehouses cuentan para el stock (de withCompanyFilter)
 */
export async function searchCatalogWithStock(opts: {
  query: string
  accessibleCompanyIds: string[]
  limit?: number
}): Promise<CatalogStockItem[]> {
  const { query, accessibleCompanyIds, limit = 40 } = opts
  const tokens = tokenizeQuery(query).slice(0, 6)
  if (tokens.length === 0) return []

  const supabase = getAdminClient()

  // 1) Productos que matchean TODOS los tokens en search_text (cruza todas las marcas).
  let q = supabase
    .from('tt_products')
    .select('id, sku, name, brand, modelo, price_eur')
    .eq('active', true)
  for (const tok of tokens) {
    q = q.ilike('search_text', `%${tok}%`)
  }
  const { data: products } = await q.limit(limit)
  const rows = (products ?? []) as Array<{
    id: string; sku: string; name: string; brand: string | null; modelo: string | null; price_eur: number | null
  }>
  if (rows.length === 0) return []

  const productIds = rows.map((p) => p.id)

  // 2) Warehouses de las empresas accesibles (tt_stock no tiene company_id directo).
  const { data: warehouses } = await supabase
    .from('tt_warehouses')
    .select('id')
    .in('company_id', accessibleCompanyIds.length > 0 ? accessibleCompanyIds : ['00000000-0000-0000-0000-000000000000'])
  const whIds = (warehouses ?? []).map((w) => w.id as string)

  // 3) Stock agregado por product_id sobre esas warehouses.
  const stockByProduct = new Map<string, number>()
  if (whIds.length > 0) {
    const { data: stockRows } = await supabase
      .from('tt_stock')
      .select('product_id, quantity')
      .in('product_id', productIds)
      .in('warehouse_id', whIds)
    for (const row of (stockRows ?? []) as Array<{ product_id: string; quantity: number | null }>) {
      stockByProduct.set(row.product_id, (stockByProduct.get(row.product_id) ?? 0) + (row.quantity ?? 0))
    }
  }

  // 4) Merge + orden: primero con stock, luego por marca/modelo.
  return rows
    .map((p) => ({
      sku: p.sku,
      name: p.name,
      brand: p.brand,
      modelo: p.modelo,
      price: p.price_eur,
      stock: stockByProduct.get(p.id) ?? 0,
    }))
    .sort((a, b) => (b.stock - a.stock) || (a.brand || '').localeCompare(b.brand || ''))
}

/** Formatea los resultados como bloque de contexto para el system prompt. */
export function formatCatalogContext(query: string, items: CatalogStockItem[]): string {
  if (items.length === 0) {
    return `\n=== INVENTARIO: no hay productos en el catálogo que matcheen "${query}". ===\n` +
      'Decile al usuario que no encontraste coincidencias y sugerile reformular (marca, medida o tipo).\n'
  }
  const withStock = items.filter((i) => i.stock > 0).length
  const lines = items.map((i) => {
    const price = typeof i.price === 'number' ? `USD ${i.price}` : 's/precio'
    const marca = i.brand || 's/marca'
    const modelo = i.modelo ? ` ${i.modelo}` : ''
    return `  • ${i.sku} — ${i.name}${modelo} — ${marca} — stock ${i.stock} — ${price}`
  })
  return (
    `\n=== INVENTARIO QUE MATCHEA "${query}" (${items.length} productos, ${withStock} con stock, cruzando TODAS las marcas/modelos) ===\n` +
    lines.join('\n') +
    `\n=== FIN INVENTARIO. Respondé SOLO con estos datos: no inventes productos, SKUs ni cantidades. ` +
    `Priorizá los que tienen stock > 0, agrupá por marca si ayuda, y aclará si algo está en 0. ===\n`
  )
}
