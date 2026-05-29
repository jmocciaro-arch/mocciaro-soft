/**
 * Helpers para `tt_product_variants` y `tt_product_variant_attributes` (v50).
 *
 * Una variante es un combo de atributos (talle/color/voltaje/etc.) sobre un
 * producto base. El `combination_hash` se calcula como SHA-256 de un JSON
 * con keys ordenadas — sirve para evitar duplicados y para hacer lookup rápido.
 *
 * Defensivo: si la migración v50 no se aplicó, las funciones loguean warning
 * y devuelven [] / null sin tirar excepción.
 */

import { createClient } from '@/lib/supabase/client'

export interface ProductVariant {
  id: string
  product_id: string
  sku: string
  ean: string | null
  manufacturer_code: string | null
  supplier_code: string | null
  barcode: string | null
  combination_hash: string
  price_eur: number | null
  price_usd: number | null
  price_ars: number | null
  cost_eur: number | null
  weight_kg: number | null
  image_url: string | null
  is_active: boolean
  lifecycle_status: string | null
  attributes: Record<string, string>
}

interface VariantRow {
  id: string
  product_id: string
  sku: string
  ean: string | null
  manufacturer_code: string | null
  supplier_code: string | null
  barcode: string | null
  combination_hash: string
  price_eur: number | null
  price_usd: number | null
  price_ars: number | null
  cost_eur: number | null
  weight_kg: number | null
  image_url: string | null
  is_active: boolean
  lifecycle_status: string | null
}

interface VariantAttrRow {
  variant_id: string
  attribute: string
  value: string
}

/** SHA-256 hex del JSON con keys ordenadas. Browser-compatible. */
export async function computeCombinationHash(attrs: Record<string, string>): Promise<string> {
  const ordered: Record<string, string> = {}
  for (const k of Object.keys(attrs).sort()) {
    ordered[k.trim().toLowerCase()] = (attrs[k] ?? '').toString().trim().toLowerCase()
  }
  const json = JSON.stringify(ordered)

  // En el browser
  if (typeof window !== 'undefined' && typeof crypto !== 'undefined' && crypto.subtle) {
    const buf = new TextEncoder().encode(json)
    const hash = await crypto.subtle.digest('SHA-256', buf)
    return Array.from(new Uint8Array(hash)).map(b => b.toString(16).padStart(2, '0')).join('')
  }

  // Fallback Node — usar import dinámico para no romper el bundle del browser
  const nodeCrypto = await import('crypto')
  return nodeCrypto.createHash('sha256').update(json).digest('hex')
}

export async function listVariants(productId: string): Promise<ProductVariant[]> {
  const sb = createClient()
  const { data: variants, error: vErr } = await sb
    .from('tt_product_variants')
    .select('*')
    .eq('product_id', productId)
    .order('created_at', { ascending: true })

  if (vErr) {
    console.warn('listVariants falló:', vErr.message)
    return []
  }
  if (!variants || variants.length === 0) return []

  const ids = (variants as VariantRow[]).map(v => v.id)
  const { data: attrs, error: aErr } = await sb
    .from('tt_product_variant_attributes')
    .select('variant_id, attribute, value')
    .in('variant_id', ids)

  if (aErr) {
    console.warn('listVariants attrs falló:', aErr.message)
  }

  const attrsByVariant = new Map<string, Record<string, string>>()
  for (const a of (attrs || []) as VariantAttrRow[]) {
    if (!attrsByVariant.has(a.variant_id)) attrsByVariant.set(a.variant_id, {})
    attrsByVariant.get(a.variant_id)![a.attribute] = a.value
  }

  return (variants as VariantRow[]).map(v => ({
    ...v,
    attributes: attrsByVariant.get(v.id) || {},
  }))
}

/** Crea o actualiza una variante. Devuelve su id. */
export async function saveVariant(
  v: Partial<ProductVariant> & { product_id: string; attributes: Record<string, string> }
): Promise<string | null> {
  const sb = createClient()
  const hash = v.combination_hash || (await computeCombinationHash(v.attributes))

  const payload: Partial<VariantRow> = {
    product_id: v.product_id,
    sku: (v.sku || '').trim(),
    ean: v.ean ?? null,
    manufacturer_code: v.manufacturer_code ?? null,
    supplier_code: v.supplier_code ?? null,
    barcode: v.barcode ?? null,
    combination_hash: hash,
    price_eur: v.price_eur ?? null,
    price_usd: v.price_usd ?? null,
    price_ars: v.price_ars ?? null,
    cost_eur: v.cost_eur ?? null,
    weight_kg: v.weight_kg ?? null,
    image_url: v.image_url ?? null,
    is_active: v.is_active ?? true,
    lifecycle_status: v.lifecycle_status ?? 'activo',
  }

  let id = v.id ?? null
  if (id) {
    const { error } = await sb.from('tt_product_variants').update(payload).eq('id', id)
    if (error) {
      console.warn('saveVariant update falló:', error.message)
      return null
    }
  } else {
    const { data, error } = await sb
      .from('tt_product_variants')
      .insert(payload)
      .select('id')
      .single()
    if (error || !data) {
      console.warn('saveVariant insert falló:', error?.message)
      return null
    }
    id = (data as { id: string }).id
  }

  // Sincronizar attributes — borrar los viejos y reinsertar
  if (id) {
    await sb.from('tt_product_variant_attributes').delete().eq('variant_id', id)
    const rows = Object.entries(v.attributes)
      .filter(([k, val]) => k.trim() && (val ?? '').toString().trim())
      .map(([attribute, value]) => ({
        variant_id: id!,
        attribute: attribute.trim().toLowerCase(),
        value: value.toString().trim(),
      }))
    if (rows.length > 0) {
      const { error } = await sb.from('tt_product_variant_attributes').insert(rows)
      if (error) console.warn('saveVariant attrs insert falló:', error.message)
    }
  }

  return id
}

export async function deleteVariant(id: string): Promise<void> {
  const sb = createClient()
  const { error } = await sb.from('tt_product_variants').delete().eq('id', id)
  if (error) console.warn('deleteVariant falló:', error.message)
}

/** Producto cartesiano: dado N ejes, genera todos los combos. */
function cartesian(axes: { attribute: string; values: string[] }[]): Record<string, string>[] {
  if (axes.length === 0) return []
  const result: Record<string, string>[] = [{}]
  for (const axis of axes) {
    const next: Record<string, string>[] = []
    for (const acc of result) {
      for (const val of axis.values) {
        if (!val.trim()) continue
        next.push({ ...acc, [axis.attribute.trim().toLowerCase()]: val.trim() })
      }
    }
    if (next.length === 0) return []
    result.length = 0
    result.push(...next)
  }
  return result
}

/**
 * Genera todos los combos faltantes para un producto.
 * Devuelve `{ created, skipped }` — skipped son los que ya existían.
 */
export async function generateVariantMatrix(
  productId: string,
  axes: { attribute: string; values: string[] }[]
): Promise<{ created: number; skipped: number }> {
  const sb = createClient()
  const combos = cartesian(axes)
  if (combos.length === 0) return { created: 0, skipped: 0 }

  // Traer hashes existentes
  const { data: existing, error: eErr } = await sb
    .from('tt_product_variants')
    .select('combination_hash')
    .eq('product_id', productId)
  if (eErr) {
    console.warn('generateVariantMatrix lookup falló:', eErr.message)
    return { created: 0, skipped: 0 }
  }
  const existingHashes = new Set(((existing || []) as { combination_hash: string }[]).map(r => r.combination_hash))

  // Necesitamos el SKU base para autogenerar SKUs de variante
  const { data: prodData } = await sb.from('tt_products').select('sku').eq('id', productId).single()
  const baseSku = (prodData as { sku?: string } | null)?.sku || 'VAR'

  let created = 0
  let skipped = 0

  for (const combo of combos) {
    const hash = await computeCombinationHash(combo)
    if (existingHashes.has(hash)) { skipped++; continue }

    // SKU autogenerado: BASE-VAL1-VAL2 (sanitizado)
    const skuSuffix = Object.values(combo).map(v => v.replace(/[^a-zA-Z0-9]/g, '').toUpperCase()).join('-')
    const variantSku = `${baseSku}-${skuSuffix}`

    const id = await saveVariant({
      product_id: productId,
      sku: variantSku,
      attributes: combo,
      combination_hash: hash,
      is_active: true,
      lifecycle_status: 'activo',
    })
    if (id) created++
  }

  return { created, skipped }
}

/** Lookup por atributos — RPC del backend. */
export async function findVariantByAttrs(
  productId: string,
  attrs: Record<string, string>
): Promise<string | null> {
  const sb = createClient()
  const { data, error } = await sb.rpc('find_variant_by_attrs', {
    p_product_id: productId,
    p_attrs: attrs,
  })
  if (error) {
    console.warn('findVariantByAttrs falló:', error.message)
    return null
  }
  return (data as string | null) ?? null
}
