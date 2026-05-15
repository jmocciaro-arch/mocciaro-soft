/**
 * SKU ALIASES — historial de vinculación SKU del cliente → producto
 * ==================================================================
 *
 * Cuando un cliente nos manda una OC con sus propios códigos de producto
 * (ej. el cliente NORDEX llama "8727" a un torcómetro que en nuestro
 * catálogo es "TT-TQ-50N3"), guardamos ese mapeo en tt_sku_aliases.
 *
 * La próxima vez que ese cliente nos mande "8727", el matcher
 * lo encuentra automáticamente y aparece en verde.
 *
 * Prioridad de matcheo:
 *   1) Alias específico para el cliente actual
 *   2) Alias global (sin client_id) — útil para SKUs estándar de industria
 *   3) SKU exacto en tt_products
 */

import { createClient } from '@/lib/supabase/client'

export interface SkuAlias {
  id: string
  company_id: string
  client_id: string | null
  external_sku: string
  product_id: string
  source: 'manual' | 'import' | 'ai'
  notes: string | null
  created_at: string
}

/**
 * Busca matches por aliases para una lista de SKUs externos.
 *
 * Devuelve un Map: external_sku (UPPERCASE.trim) → { product_id, alias_id }.
 * Prioriza aliases del cliente sobre aliases globales.
 */
export async function lookupAliasesForSkus(opts: {
  companyId: string
  clientId?: string | null
  externalSkus: string[]
}): Promise<Map<string, { productId: string; aliasId: string; scope: 'client' | 'global' }>> {
  const { companyId, clientId, externalSkus } = opts
  const out = new Map<string, { productId: string; aliasId: string; scope: 'client' | 'global' }>()
  const normalized = Array.from(new Set(externalSkus.map((s) => s.trim()).filter(Boolean)))
  if (normalized.length === 0) return out

  const sb = createClient()
  // Una sola query trae tanto los del cliente como los globales (client_id IS NULL).
  // Después en JS damos prioridad al del cliente.
  let q = sb.from('tt_sku_aliases')
    .select('id, client_id, external_sku, product_id')
    .eq('company_id', companyId)
    .in('external_sku', normalized)
  if (clientId) {
    q = q.or(`client_id.eq.${clientId},client_id.is.null`)
  } else {
    q = q.is('client_id', null)
  }
  const { data, error } = await q
  if (error || !data) return out

  // Procesar: si hay match con client_id, gana; sino guardamos el global
  for (const row of data as Array<Pick<SkuAlias, 'id' | 'client_id' | 'external_sku' | 'product_id'>>) {
    const key = row.external_sku.toUpperCase().trim()
    const isClient = !!row.client_id
    const existing = out.get(key)
    if (!existing || (isClient && existing.scope === 'global')) {
      out.set(key, {
        productId: row.product_id,
        aliasId: row.id,
        scope: isClient ? 'client' : 'global',
      })
    }
  }
  return out
}

/**
 * Guarda (o actualiza) un alias. Idempotente sobre (company, client, external_sku).
 *
 * @returns el alias guardado o null si falló.
 */
export async function saveAlias(opts: {
  companyId: string
  clientId: string | null  // null = global
  externalSku: string
  productId: string
  source?: SkuAlias['source']
  notes?: string | null
}): Promise<SkuAlias | null> {
  const sb = createClient()
  const cleanSku = opts.externalSku.trim()
  if (!cleanSku) return null

  // UPSERT por unique (company, client, external_sku)
  const { data, error } = await sb.from('tt_sku_aliases')
    .upsert({
      company_id: opts.companyId,
      client_id: opts.clientId,
      external_sku: cleanSku,
      product_id: opts.productId,
      source: opts.source || 'manual',
      notes: opts.notes ?? null,
    }, { onConflict: 'company_id,client_id,external_sku' })
    .select()
    .single()
  if (error) {
    console.error('saveAlias error:', error)
    return null
  }
  return data as SkuAlias
}

/** Lista todos los aliases (para la pantalla de admin). */
export async function listAliases(opts?: {
  companyId?: string
  clientId?: string | null
}): Promise<Array<SkuAlias & { product?: { sku: string; name: string }; client?: { name: string; legal_name: string | null } | null }>> {
  const sb = createClient()
  let q = sb.from('tt_sku_aliases').select('*, product:tt_products(sku, name), client:tt_clients(name, legal_name)')
  if (opts?.companyId) q = q.eq('company_id', opts.companyId)
  if (opts?.clientId !== undefined) {
    if (opts.clientId === null) q = q.is('client_id', null)
    else q = q.eq('client_id', opts.clientId)
  }
  const { data } = await q.order('created_at', { ascending: false }).limit(500)
  return (data || []) as Array<SkuAlias & { product?: { sku: string; name: string }; client?: { name: string; legal_name: string | null } | null }>
}

/** Elimina un alias por id. */
export async function deleteAlias(aliasId: string): Promise<boolean> {
  const sb = createClient()
  const { error } = await sb.from('tt_sku_aliases').delete().eq('id', aliasId)
  return !error
}
