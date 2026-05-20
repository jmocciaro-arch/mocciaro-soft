#!/usr/bin/env tsx
/**
 * Dedup masivo de tt_products por nombre+marca.
 *
 * La migración de StelOrder dejó ~2.979 filas duplicadas en exceso
 * (24% de los 12.325 productos): mismo nombre+marca con SKUs distintos.
 * El SKU "real" (ej. TC.QSP, TE.HEAVY.55) coexiste con SKUs
 * auto-generados (PRO00208, COSTO12345, etc.) que fueron creados
 * automáticamente por StelOrder.
 *
 * Este script:
 *   1) Agrupa filas activas por (name + brand) normalizado.
 *   2) Ignora productos donde el name = brand (nombres genéricos sin info).
 *   3) Elige una fila canónica (la que más parece el producto "real").
 *   4) Re-apunta FKs en todas las tablas que referencian tt_products.
 *   5) Marca losers como active=false con nota explicativa (NO borra,
 *      para que puedas revertir si detectás un error).
 *
 * USO:
 *   SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... npx tsx scripts/dedupe-products.ts
 *   # con --apply para aplicar (pide confirmación interactiva)
 *
 * SAFETY:
 *   - Sin --apply, solo lectura + CSV con el plan completo.
 *   - Con --apply, requiere escribir "DEDUPE-APLICAR".
 *   - Las filas perdedoras NO se borran (active=false + nota), reversible.
 *   - Idempotente: corrercorrer dos veces sobre la misma DB no hace nada.
 */

import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { writeFileSync, mkdirSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { createInterface } from 'node:readline/promises'

const OUTPUT_CSV = resolve(__dirname, '..', 'out', 'dedupe-products-plan.csv')
const DEDUPE_TAG = '[DEDUPED-PRODUCT] '

interface ProductRow {
  id: string
  sku: string
  name: string
  brand: string | null
  price_eur: number | null
  cost_eur: number | null
  price_min: number | null
  image_url: string | null
  product_type: string | null
  active: boolean
  description: string | null
  created_at: string
}

/** Heurística: SKU auto-generado de StelOrder. */
function isAutoSku(sku: string): boolean {
  if (!sku) return true
  if (/^(PRO|COSTO|GASTO|SVC|SRV)\d{3,}$/i.test(sku)) return true
  if (/^[A-Z]{3,6}\d{5,}$/.test(sku)) return true
  return false
}

function normalize(s: string | null): string {
  return (s || '').trim().toLowerCase().replace(/\s+/g, ' ')
}

function scoreProduct(p: ProductRow): number {
  let s = 0
  // Penaliza fuerte los SKU auto-generados
  if (!isAutoSku(p.sku)) s += 100
  if ((p.price_eur || 0) > 0) s += 10
  if ((p.cost_eur || 0) > 0) s += 5
  if ((p.price_min || 0) > 0) s += 3
  if (p.image_url) s += 5
  if (p.description && p.description.length > 20) s += 3
  if (p.brand) s += 2
  // Más antiguo gana en empate (más probable que tenga relaciones consolidadas)
  s += Math.max(0, 1 - new Date(p.created_at).getTime() / Date.now())
  return s
}

interface Group {
  key: string
  winner: ProductRow
  losers: ProductRow[]
}

// Tablas con FK a tt_products.product_id (verificadas en schema)
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
  const pageSize = 1000
  for (;;) {
    const { data, error } = await sb
      .from('tt_products')
      .select('id, sku, name, brand, price_eur, cost_eur, price_min, image_url, product_type, active, description, created_at')
      .eq('active', true)
      .order('created_at', { ascending: true })
      .range(offset, offset + pageSize - 1)
    if (error) throw error
    if (!data || data.length === 0) break
    all.push(...(data as ProductRow[]))
    if (data.length < pageSize) break
    offset += pageSize
  }
  return all
}

async function main() {
  const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  const apply = process.argv.includes('--apply')

  if (!url || !key) {
    console.error('❌ Faltan SUPABASE_URL o SUPABASE_SERVICE_ROLE_KEY en env.')
    process.exit(1)
  }

  const sb = createClient(url, key, { auth: { persistSession: false } })

  console.log('🔎 Leyendo tt_products activos...')
  const products = await fetchAll(sb)
  console.log(`   ${products.length} productos activos.`)

  // Agrupar por nombre+marca normalizado
  const groups = new Map<string, ProductRow[]>()
  for (const p of products) {
    const nameNorm = normalize(p.name)
    const brandNorm = normalize(p.brand)
    // Filtros: nombre debe tener al menos 5 chars Y ser distinto de la marca
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

  console.log(`\n📊 Grupos con duplicados: ${dupGroups.length}`)
  console.log(`   Productos a desactivar (merge): ${dupGroups.reduce((s, g) => s + g.losers.length, 0)}`)

  // Top 10 a consola
  console.log('\nTop 10 grupos más grandes:')
  for (const g of [...dupGroups].sort((a, b) => b.losers.length - a.losers.length).slice(0, 10)) {
    console.log(`  ${g.losers.length + 1}x  winner: "${g.winner.sku}" → "${g.winner.name.slice(0, 60)}" (${g.winner.brand || '—'})`)
    for (const l of g.losers.slice(0, 5)) {
      console.log(`         loser: "${l.sku}" (auto=${isAutoSku(l.sku)})`)
    }
    if (g.losers.length > 5) console.log(`         + ${g.losers.length - 5} más...`)
  }

  // CSV
  mkdirSync(dirname(OUTPUT_CSV), { recursive: true })
  const header = 'group_key,winner_id,winner_sku,winner_name,winner_brand,loser_id,loser_sku,loser_is_auto\n'
  const csvRows: string[] = []
  for (const g of dupGroups) {
    for (const l of g.losers) {
      csvRows.push([g.key, g.winner.id, g.winner.sku, g.winner.name, g.winner.brand || '',
        l.id, l.sku, String(isAutoSku(l.sku))]
        .map((v) => { const s = String(v).replace(/"/g, '""'); return /[",\n]/.test(s) ? `"${s}"` : s })
        .join(','))
    }
  }
  writeFileSync(OUTPUT_CSV, header + csvRows.join('\n') + '\n')
  console.log(`\n📝 Plan completo en: ${OUTPUT_CSV}`)
  console.log(`   (revisalo en Excel/Numbers antes de aplicar)`)

  if (!apply) {
    console.log(`\n💡 Para aplicar (re-apuntar FKs + desactivar losers):`)
    console.log(`   npx tsx scripts/dedupe-products.ts --apply`)
    return
  }

  console.log(`\n⚠️  Modo --apply: vas a modificar ${dupGroups.reduce((s, g) => s + g.losers.length, 0)} productos.`)
  console.log(`   Sin borrar nada: las filas perdedoras quedan active=false + nota.`)
  const rl = createInterface({ input: process.stdin, output: process.stdout })
  const ans = await rl.question(`\n   Escribí "DEDUPE-APLICAR" para confirmar: `)
  rl.close()
  if (ans.trim() !== 'DEDUPE-APLICAR') { console.log('❌ Cancelado.'); return }

  let merged = 0, fksRepointed = 0, errs = 0
  for (const g of dupGroups) {
    for (const loser of g.losers) {
      try {
        // 1) Re-apuntar FKs en cada tabla
        for (const fk of FK_TABLES) {
          const { error: e, count } = await sb.from(fk.table)
            .update({ [fk.column]: g.winner.id }, { count: 'exact' })
            .eq(fk.column, loser.id)
          if (e) console.error(`  ⚠ ${fk.table}.${fk.column}: ${e.message}`)
          else fksRepointed += count || 0
        }

        // 2) Desactivar loser con nota
        const newDesc = `${DEDUPE_TAG}merged_into=${g.winner.id} (${g.winner.sku}) at ${new Date().toISOString()}\n\n${loser.description || ''}`
        const { error: e3 } = await sb.from('tt_products')
          .update({ active: false, description: newDesc.slice(0, 5000) })
          .eq('id', loser.id)
        if (e3) { errs++; console.error(`  ✗ loser ${loser.id}: ${e3.message}`); continue }
        merged++

        if (merged % 100 === 0) console.log(`  ... procesados ${merged}/${dupGroups.reduce((s, g) => s + g.losers.length, 0)}`)
      } catch (err) {
        errs++
        console.error(`  💥 ${loser.id}:`, (err as Error).message)
      }
    }
  }

  console.log(`\n✅ Mergeados: ${merged}, FKs reapuntadas: ${fksRepointed}, errores: ${errs}.`)
  console.log(`\nPara revertir un producto puntual:`)
  console.log(`   UPDATE tt_products SET active=true WHERE id='<loser_id>';`)
}

main().catch((e) => { console.error('💥', e); process.exit(1) })
