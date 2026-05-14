#!/usr/bin/env tsx
/**
 * Dedup AGRESIVO SOLO en casos seguros — sin riesgo de falsos positivos.
 *
 * Caso "seguro": un grupo donde TODOS los SKUs son auto-generados
 * (PROXXXXX, COSTOXXXX, etc.). Esto significa que la migración de StelOrder
 * creó N copias del mismo producto sin un SKU "real" — definitivamente son
 * duplicados.
 *
 * Casos NO seguros (los excluye este script): cuando hay 1 SKU "real" y N
 * autos — la mejor decisión es manual.
 *
 * Mismo formato que dedupe-products.ts y dedupe-products-aggressive.ts.
 *
 * USO:
 *   SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... npx tsx scripts/dedupe-products-safe-only.ts
 *   # --apply confirmación "SAFE-APLICAR"
 */

import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { writeFileSync, mkdirSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { createInterface } from 'node:readline/promises'

const OUTPUT_CSV = resolve(__dirname, '..', 'out', 'dedupe-products-safe-plan.csv')
const DEDUPE_TAG = '[DEDUPED-PRODUCT-SAFE] '

interface ProductRow {
  id: string; sku: string; name: string; brand: string | null
  price_eur: number | null; cost_eur: number | null; price_min: number | null
  image_url: string | null; description: string | null; created_at: string
}

function isAutoSku(sku: string): boolean {
  if (!sku) return true
  if (/^(PRO|COSTO|GASTO|SVC|SRV)\d{3,}$/i.test(sku)) return true
  if (/^[A-Z]{3,6}\d{5,}$/.test(sku)) return true
  return false
}

function aggressiveNorm(s: string | null): string {
  return (s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^\w]/g, '').trim()
}

function score(p: ProductRow): number {
  let s = 0
  if ((p.price_eur || 0) > 0) s += 10
  if ((p.cost_eur || 0) > 0) s += 5
  if (p.image_url) s += 5
  if (p.description && p.description.length > 20) s += 3
  if (p.brand) s += 2
  s += Math.max(0, 1 - new Date(p.created_at).getTime() / Date.now())
  return s
}

const FK_TABLES = [
  ['tt_quote_items', 'product_id'],
  ['tt_so_items', 'product_id'],
  ['tt_dn_items', 'product_id'],
  ['tt_invoice_items', 'product_id'],
  ['tt_po_items', 'product_id'],
  ['tt_document_lines', 'product_id'],
  ['tt_stock', 'product_id'],
  ['tt_sku_aliases', 'product_id'],
] as const

async function fetchAll(sb: SupabaseClient): Promise<ProductRow[]> {
  const all: ProductRow[] = []
  let offset = 0
  for (;;) {
    const { data, error } = await sb.from('tt_products')
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
  if (!url || !key) { console.error('❌ Faltan envs.'); process.exit(1) }

  const sb = createClient(url, key, { auth: { persistSession: false } })
  process.stdout.write('🔎 Leyendo productos activos...\n')
  const products = await fetchAll(sb)
  process.stdout.write(`   ${products.length} productos.\n`)

  // Agrupar con norm agresiva
  const groups = new Map<string, ProductRow[]>()
  for (const p of products) {
    const k = aggressiveNorm(p.name)
    const b = aggressiveNorm(p.brand)
    if (k.length < 5 || k === b) continue
    const key = `${k}__${b}`
    if (!groups.has(key)) groups.set(key, [])
    groups.get(key)!.push(p)
  }

  // Filtrar SOLO grupos donde TODOS los SKUs son auto
  const safeGroups: Array<{ key: string; winner: ProductRow; losers: ProductRow[] }> = []
  for (const [key, rows] of groups) {
    if (rows.length < 2) continue
    if (!rows.every((r) => isAutoSku(r.sku))) continue // ← FILTRO CLAVE
    const sorted = [...rows].sort((a, b) => score(b) - score(a))
    safeGroups.push({ key, winner: sorted[0], losers: sorted.slice(1) })
  }

  const totalLosers = safeGroups.reduce((s, g) => s + g.losers.length, 0)
  process.stdout.write(`\n📊 Grupos 100% seguros (todos auto-SKU): ${safeGroups.length}\n`)
  process.stdout.write(`   Productos a desactivar: ${totalLosers}\n`)

  // CSV
  mkdirSync(dirname(OUTPUT_CSV), { recursive: true })
  const header = 'norm_key,winner_id,winner_sku,winner_name,loser_id,loser_sku\n'
  const csvRows: string[] = []
  for (const g of safeGroups) {
    for (const l of g.losers) {
      csvRows.push([g.key, g.winner.id, g.winner.sku, g.winner.name, l.id, l.sku]
        .map((v) => { const s = String(v).replace(/"/g, '""'); return /[",\n]/.test(s) ? `"${s}"` : s })
        .join(','))
    }
  }
  writeFileSync(OUTPUT_CSV, header + csvRows.join('\n') + '\n')
  process.stdout.write(`\n📝 Plan en: ${OUTPUT_CSV}\n`)

  if (!apply) {
    process.stdout.write(`\n💡 Para aplicar:\n   npx tsx scripts/dedupe-products-safe-only.ts --apply\n`)
    return
  }

  const rl = createInterface({ input: process.stdin, output: process.stdout })
  const ans = await rl.question(`\n   Escribí "SAFE-APLICAR" para confirmar: `)
  rl.close()
  if (ans.trim() !== 'SAFE-APLICAR') { process.stdout.write('❌ Cancelado.\n'); return }

  let merged = 0, fksRepointed = 0, errs = 0
  for (const g of safeGroups) {
    for (const loser of g.losers) {
      try {
        for (const [table, col] of FK_TABLES) {
          const { error, count } = await sb.from(table)
            .update({ [col]: g.winner.id }, { count: 'exact' })
            .eq(col, loser.id)
          if (!error) fksRepointed += count || 0
        }
        const newDesc = `${DEDUPE_TAG}merged_into=${g.winner.id} (${g.winner.sku}) at ${new Date().toISOString()}\n\n${loser.description || ''}`
        await sb.from('tt_products').update({ active: false, description: newDesc.slice(0, 5000) }).eq('id', loser.id)
        merged++
        if (merged % 100 === 0) process.stdout.write(`  ... ${merged}\n`)
      } catch (err) {
        errs++
        process.stdout.write(`  💥 ${loser.id}: ${(err as Error).message}\n`)
      }
    }
  }
  process.stdout.write(`\n✅ Mergeados: ${merged}, FKs: ${fksRepointed}, errores: ${errs}.\n`)
}

main().catch((e) => { console.error('💥', e); process.exit(1) })
