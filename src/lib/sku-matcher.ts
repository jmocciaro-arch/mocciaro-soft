/**
 * sku-matcher.ts
 *
 * Match entre el SKU/código que usa el CLIENTE en sus órdenes de compra
 * y el SKU REAL del catálogo (tt_products).
 *
 * Tabla soporte: tt_sku_aliases
 *   (client_id, external_sku) → product_id
 *
 * Estrategia de match (en orden):
 *   1. Match exacto en tt_sku_aliases (cliente + código exacto)
 *   2. Match exacto en tt_products.sku
 *   3. Fuzzy en tt_products.sku usando trigram (índice GIN ya creado en Fase 0)
 *   4. Fuzzy en tt_products.name
 *
 * El resultado incluye `confidence` (0-1) y `source` para que la UI sepa si
 * pedir confirmación al usuario o aceptar el match automáticamente.
 */

import type { SupabaseClient } from '@supabase/supabase-js'

export type MatchSource = 'alias' | 'sku_exact' | 'sku_fuzzy' | 'name_fuzzy' | 'none'

export interface MatchedProduct {
  id: string
  sku: string
  name: string
  brand: string | null
  price_eur: number | null
}

export interface MatchResult {
  externalSKU: string
  product: MatchedProduct | null
  confidence: number
  source: MatchSource
}

/**
 * Matchea UN código del cliente contra el catálogo.
 *
 * @param sb        cliente Supabase (server con service_role o client con RLS)
 * @param clientId  id del cliente (tt_clients.id) — opcional pero recomendado
 *                  para usar el glosario aprendido
 * @param externalSKU  código tal como viene en la OC del cliente
 * @param productName  descripción del item — usado como fallback fuzzy
 */
export async function matchClientSKU(
  sb: SupabaseClient,
  opts: { clientId?: string | null; externalSKU: string; productName?: string }
): Promise<MatchResult> {
  const externalSKU = (opts.externalSKU || '').trim()
  if (!externalSKU) {
    return { externalSKU, product: null, confidence: 0, source: 'none' }
  }

  // ─── 1. Match en tt_sku_aliases (alias aprendido para este cliente) ───
  if (opts.clientId) {
    const { data: alias } = await sb
      .from('tt_sku_aliases')
      .select('product_id, product:tt_products(id, sku, name, brand, price_eur)')
      .eq('client_id', opts.clientId)
      .eq('external_sku', externalSKU)
      .maybeSingle()
    if (alias?.product) {
      const product = alias.product as unknown as MatchedProduct
      return { externalSKU, product, confidence: 1, source: 'alias' }
    }
  }

  // ─── 2. Match exacto en tt_products.sku ───
  const { data: exact } = await sb
    .from('tt_products')
    .select('id, sku, name, brand, price_eur')
    .eq('sku', externalSKU)
    .eq('active', true)
    .maybeSingle()
  if (exact) {
    return { externalSKU, product: exact as MatchedProduct, confidence: 0.95, source: 'sku_exact' }
  }

  // ─── 3. Fuzzy en tt_products.sku usando trigram ───
  // ilike con % aprovecha el índice GIN trigram (idx_products_sku_trgm)
  const { data: skuFuzzy } = await sb
    .from('tt_products')
    .select('id, sku, name, brand, price_eur')
    .ilike('sku', `%${externalSKU}%`)
    .eq('active', true)
    .limit(1)
  if (skuFuzzy && skuFuzzy[0]) {
    return { externalSKU, product: skuFuzzy[0] as MatchedProduct, confidence: 0.7, source: 'sku_fuzzy' }
  }

  // ─── 4. Fuzzy en name usando descripción del item ───
  const name = (opts.productName || '').trim()
  if (name && name.length >= 4) {
    const { data: nameFuzzy } = await sb
      .from('tt_products')
      .select('id, sku, name, brand, price_eur')
      .ilike('name', `%${name.slice(0, 30)}%`)
      .eq('active', true)
      .limit(1)
    if (nameFuzzy && nameFuzzy[0]) {
      return { externalSKU, product: nameFuzzy[0] as MatchedProduct, confidence: 0.5, source: 'name_fuzzy' }
    }
  }

  return { externalSKU, product: null, confidence: 0, source: 'none' }
}

/**
 * Batch: matchea N items de una OC en paralelo.
 */
export async function matchBatch(
  sb: SupabaseClient,
  opts: {
    clientId?: string | null
    items: Array<{ codigo?: string | null; descripcion?: string | null }>
  }
): Promise<MatchResult[]> {
  const promises = opts.items.map((it) =>
    matchClientSKU(sb, {
      clientId: opts.clientId,
      externalSKU: it.codigo || '',
      productName: it.descripcion || '',
    })
  )
  return Promise.all(promises)
}

/**
 * Guarda (o actualiza) un alias para que la próxima vez sea match exacto.
 *
 * @param source  'manual' (usuario vinculó) | 'oc_import' (auto desde OC) | 'merge'
 */
export async function saveSkuAlias(
  sb: SupabaseClient,
  opts: {
    companyId: string
    clientId: string
    externalSKU: string
    productId: string
    source?: string
    notes?: string
  }
): Promise<{ ok: boolean; error?: string }> {
  const { error } = await sb
    .from('tt_sku_aliases')
    .upsert(
      {
        company_id: opts.companyId,
        client_id: opts.clientId,
        external_sku: opts.externalSKU.trim(),
        product_id: opts.productId,
        source: opts.source || 'manual',
        notes: opts.notes || null,
      },
      { onConflict: 'client_id,external_sku' }
    )
  if (error) return { ok: false, error: error.message }
  return { ok: true }
}

/**
 * Lista todos los aliases de un cliente — para la UI del glosario.
 */
export async function getClientGlossary(
  sb: SupabaseClient,
  clientId: string
): Promise<
  Array<{
    id: string
    external_sku: string
    product: MatchedProduct
    source: string | null
    notes: string | null
    created_at: string
  }>
> {
  const { data, error } = await sb
    .from('tt_sku_aliases')
    .select('id, external_sku, source, notes, created_at, product:tt_products(id, sku, name, brand, price_eur)')
    .eq('client_id', clientId)
    .order('external_sku')
  if (error || !data) return []
  return data.map((r) => ({
    id: r.id as string,
    external_sku: r.external_sku as string,
    product: r.product as unknown as MatchedProduct,
    source: (r.source as string | null) || null,
    notes: (r.notes as string | null) || null,
    created_at: r.created_at as string,
  }))
}

/**
 * Borra un alias (usuario lo marcó como erróneo).
 */
export async function deleteSkuAlias(
  sb: SupabaseClient,
  aliasId: string
): Promise<{ ok: boolean; error?: string }> {
  const { error } = await sb.from('tt_sku_aliases').delete().eq('id', aliasId)
  if (error) return { ok: false, error: error.message }
  return { ok: true }
}
