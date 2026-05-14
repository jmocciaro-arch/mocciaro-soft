#!/usr/bin/env tsx
/**
 * Dedup AGRESIVO de tt_products: normalización sin espacios, sin acentos,
 * sin signos. Captura los 966 grupos que el dedup anterior (name+brand
 * EXACTOS) no detectó por diferencias mínimas como mayúsculas, espacios
 * dobles, acentos, etc.
 *
 * Mismo patrón que scripts/dedupe-products.ts pero más permisivo en el
 * agrupamiento. Igual respeta:
 *   - Excluir nombres muy cortos (<5 chars)
 *   - Excluir cuando name == brand (genéricos)
 *   - Preferir SKU "real" sobre PROXXXXX en el scoring
 *   - NO BORRA: marca losers como active=false con nota
 *
 * USO:
 *   SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... npx tsx scripts/dedupe-products-aggressive.ts
 *   # --apply para aplicar (confirmación "AGRESIVO-APLICAR")
 *
 * Recomendación: revisar el CSV antes de aplicar — la normalización
 * agresiva puede capturar falsos positivos (productos parecidos
 * que en realidad son distintos modelos).
 */

import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { writeFileSync, mkdirSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { createInterface } from 'node:readline/promises'

const OUTPUT_CSV = resolve(__dirname, '..', 'out', 'dedupe-products-aggressive-plan.csv')
const DEDUPE_TAG = '[DEDUPED-PRODUCT-AGG] '

interface ProductRow {
  id: string
  sku: string
  name: string
  brand: string | null
  price_eur: number | null
  cost_eur: number | null
  price_min: number | null
  image_url: string | null
  description: string | null
  created_at: string
}

function isAutoSku(sku: string): boolean {
  if (!sku) return true
  if (/^(PRO|COSTO|GASTO|SVC|SRV)\d{3,}$/i.test(sku)) return true
  if (/^[A-Z]{3,6}\d{5,}$/.test(sku)) return true
  return false
}

/** Normalización AGRESIVA: sin espacios, sin signos, sin acentos, lowercase */
function aggressiveNorm(s: string | null): string {
  return (s || '')
    .toLowerCase()
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[^\w]/g, '')
    .trim()
}

function scoreProduct(p: ProductRow): number {
  let s = 0
  if (!isAutoSku(p.sku)) s += 100
  if ((p.price_eur || 0) > 0) s += 10
  if ((p.cost_eur || 0) > 0) s += 5
  if ((p.price_min || 0) > 0) s += 3
  if (p.image_url) s += 5
  if (p.description && p.description.length > 20) s += 3
  if (p.brand) s += 2
  s += Math.max(0, 1 - new Date(p.created_at).getTime() / Date.now())
  return s
}

interface Group { key: string; winner: ProductRow; losers: ProductRow[] }

const FK_TABLES: Array<{ table: string; column: string }> = [
  { table: 'tt_quote_items', column: 'product_id' },
  { table: 'tt_so_items', column: 'product_id' },
  { table: 'tt_dn_items', column: 'product_id' },
  { table: 'tt_invoice_items', column: 'product_id' },
  { table: 'tt_po_items', column: 'product_id' },
  { table: 'tt_document_lines', column: 'product_id' },
  { table: 'tt_stock', column: 'product_id' },
  { table: 'tt_sku_aliases', column: 'product_id' },
]

async function fetchAll(sb: SupabaseClient): Promise<ProductRow[]> {
  const all: ProductRow[] = []
  let offset = 0
  for (;;) {
    const { data, error } = await sb
      .from('tt_products')
      .select('id, sku, name, brand, price_eur, cost_eur, price_min, image_url, description, created_at')
      .eq('active', true).order('created_at', { ascending: true }).range(offset, offset + 999)
    if (error) throw error
    if (!data || data.length === 0) break
    all.push(...(data as ProductRow[]))
    if (data.length < 1000) break
    offset += 1000
  }
  return all
}

async function main() {
  const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  const apply = process.argv.includes('--apply')

  if (!url || !key) { console.error('❌ Faltan SUPABASE_URL o SUPABASE_SERVICE_ROLE_KEY.'); process.exit(1) }

  const sb = createClient(url, key, { auth: { persistSession: false } })

  console.log('🔎 Leyendo tt_products activos...')
  const products = await fetchAll(sb)
  console.log(`   ${products.length} productos activos.`)

  const groups = new Map<string, ProductRow[]>()
  for (const p of products) {
    const nameNorm = aggressiveNorm(p.name)
    const brandNorm = aggressiveNorm(p.brand)
    if (nameNorm.length < 5) continue
    if (nameNorm === brandNorm) continue
    const key = `${nameNorm}__${brandNorm}`
    if (!groups.has(key)) groups.set(key, [])
    groups.get(key)!.push(p)
  }

  const dupGroups: Group[] = []
  for (const [key, rows] of groups) {
    if (rows.length < 2) continue
    const sorted = [...rows].sort((a, b) => scoreProduct(b) - scoreProduct(a))
    dupGroups.push({ key, winner: sorted[0], losers: sorted.slice(1) })
  }

  console.log(`\n📊 Grupos con duplicados (norm agresiva): ${dupGroups.length}`)
  console.log(`   Productos a desactivar: ${dupGroups.reduce((s, g) => s + g.losers.length, 0)}`)

  // CSV
  mkdirSync(dirname(OUTPUT_CSV), { recursive: true })
  const header = 'norm_key,winner_id,winner_sku,winner_name,winner_brand,loser_id,loser_sku,loser_name,loser_brand\n'
  const csvRows: string[] = []
  for (const g of dupGroups) {
    for (const l of g.losers) {
      csvRows.push([g.key, g.winner.id, g.winner.sku, g.winner.name, g.winner.brand || '',
        l.id, l.sku, l.name, l.brand || '']
        .map((v) => { const s = String(v).replace(/"/g, '""'); return /[",\n]/.test(s) ? `"${s}"` : s })
        .join(','))
    }
  }
  writeFileSync(OUTPUT_CSV, header + csvRows.join('\n') + '\n')
  console.log(`\n📝 Plan en: ${OUTPUT_CSV}`)
  console.log(`   ⚠ REVISÁ EL CSV antes de aplicar — la norm agresiva captura más casos pero también puede tener falsos positivos.`)

  if (!apply) {
    console.log(`\n💡 Para aplicar: agregá --apply al final del comando.`)
    return
  }

  const rl = createInterface({ input: process.stdin, output: process.stdout })
  const ans = await rl.question(`\n   Escribí "AGRESIVO-APLICAR" para confirmar: `)
  rl.close()
  if (ans.trim() !== 'AGRESIVO-APLICAR') { console.log('❌ Cancelado.'); return }

  let merged = 0, fksRepointed = 0, errs = 0
  for (const g of dupGroups) {
    for (const loser of g.losers) {
      try {
        for (const fk of FK_TABLES) {
          const { error: e, count } = await sb.from(fk.table)
            .update({ [fk.column]: g.winner.id }, { count: 'exact' })
            .eq(fk.column, loser.id)
          if (!e) fksRepointed += count || 0
        }
        const newDesc = `${DEDUPE_TAG}merged_into=${g.winner.id} (${g.winner.sku}) at ${new Date().toISOString()}\n\n${loser.description || ''}`
        await sb.from('tt_products').update({ active: false, description: newDesc.slice(0, 5000) }).eq('id', loser.id)
        merged++
        if (merged % 100 === 0) console.log(`  ... ${merged}`)
      } catch (err) {
        errs++
        console.error(`  💥 ${loser.id}:`, (err as Error).message)
      }
    }
  }
  console.log(`\n✅ Mergeados: ${merged}, FKs reapuntadas: ${fksRepointed}, errores: ${errs}.`)
}

main().catch((e) => { console.error('💥', e); process.exit(1) })
