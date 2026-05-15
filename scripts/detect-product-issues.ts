#!/usr/bin/env tsx
/**
 * Reporte de calidad de datos del catálogo de productos.
 *
 * Detecta:
 *   1) Duplicados con typo: productos con nombres parecidos (sin espacios,
 *      sin acentos, sin mayúsculas) que NO matchearon en el dedup exacto.
 *   2) Productos sin precio_eur (o price_eur=0).
 *   3) Productos sin marca.
 *   4) Productos sin descripción.
 *
 * SIEMPRE solo lectura. Genera 4 CSVs en out/.
 *
 * USO:
 *   SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... npx tsx scripts/detect-product-issues.ts
 */

import { createClient } from '@supabase/supabase-js'
import { writeFileSync, mkdirSync } from 'node:fs'
import { dirname, resolve } from 'node:path'

const OUT_DIR = resolve(__dirname, '..', 'out')

interface Product {
  id: string
  sku: string
  name: string
  brand: string | null
  description: string | null
  price_eur: number | null
  cost_eur: number | null
  image_url: string | null
}

/** Normalización agresiva: lowercase, sin acentos, sin espacios extras, sin signos */
function aggressiveNorm(s: string): string {
  return s
    .toLowerCase()
    .normalize('NFD').replace(/[̀-ͯ]/g, '') // remove accents
    .replace(/[^\w\s]/g, ' ') // signos a espacio
    .replace(/\s+/g, ' ')
    .trim()
}

/** Distancia Levenshtein (1 si difieren en 1 char). Pequeña pero suficiente */
function lev(a: string, b: string): number {
  if (a === b) return 0
  if (a.length === 0) return b.length
  if (b.length === 0) return a.length
  let v0: number[] = new Array(b.length + 1).fill(0).map((_, i) => i)
  let v1: number[] = new Array(b.length + 1).fill(0)
  for (let i = 0; i < a.length; i++) {
    v1[0] = i + 1
    for (let j = 0; j < b.length; j++) {
      const cost = a[i] === b[j] ? 0 : 1
      v1[j + 1] = Math.min(v1[j] + 1, v0[j + 1] + 1, v0[j] + cost)
    }
    const tmp = v0; v0 = v1; v1 = tmp
  }
  return v0[b.length]
}

function csv(header: string, rows: (string | number | null)[][]) {
  const escape = (v: string | number | null) => {
    if (v === null || v === undefined) return ''
    const s = String(v).replace(/"/g, '""')
    return /[",\n]/.test(s) ? `"${s}"` : s
  }
  return header + '\n' + rows.map((r) => r.map(escape).join(',')).join('\n') + '\n'
}

async function main() {
  const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) {
    console.error('❌ Faltan SUPABASE_URL o SUPABASE_SERVICE_ROLE_KEY en env.')
    process.exit(1)
  }
  const sb = createClient(url, key, { auth: { persistSession: false } })

  mkdirSync(OUT_DIR, { recursive: true })

  console.log('🔎 Leyendo productos activos...')
  const all: Product[] = []
  let offset = 0
  for (;;) {
    const { data } = await sb.from('tt_products')
      .select('id, sku, name, brand, description, price_eur, cost_eur, image_url')
      .eq('active', true).range(offset, offset + 999)
    if (!data || data.length === 0) break
    all.push(...(data as Product[]))
    if (data.length < 1000) break
    offset += 1000
  }
  console.log(`   ${all.length} productos.\n`)

  // ===========================================================
  // 1) Productos sin precio
  // ===========================================================
  const noPrice = all.filter((p) => !p.price_eur || p.price_eur <= 0)
  console.log(`💰 Productos sin precio (price_eur=0 o NULL): ${noPrice.length}`)
  writeFileSync(resolve(OUT_DIR, 'products-no-price.csv'),
    csv('id,sku,name,brand,price_eur,cost_eur',
      noPrice.map((p) => [p.id, p.sku, p.name, p.brand, p.price_eur, p.cost_eur])))

  // ===========================================================
  // 2) Productos sin marca
  // ===========================================================
  const noBrand = all.filter((p) => !p.brand || !p.brand.trim())
  console.log(`🏷️  Productos sin marca: ${noBrand.length}`)
  writeFileSync(resolve(OUT_DIR, 'products-no-brand.csv'),
    csv('id,sku,name,price_eur', noBrand.map((p) => [p.id, p.sku, p.name, p.price_eur])))

  // ===========================================================
  // 3) Productos sin descripción
  // ===========================================================
  const noDesc = all.filter((p) => !p.description || p.description.trim().length < 5)
  console.log(`📝 Productos sin descripción (<5 chars): ${noDesc.length}`)
  writeFileSync(resolve(OUT_DIR, 'products-no-description.csv'),
    csv('id,sku,name,brand', noDesc.map((p) => [p.id, p.sku, p.name, p.brand])))

  // ===========================================================
  // 4) Duplicados con typo (Levenshtein <= 2)
  // ===========================================================
  console.log(`🔬 Buscando duplicados con typo (puede tardar)...`)
  const byNorm = new Map<string, Product[]>()
  for (const p of all) {
    const k = aggressiveNorm(p.name)
    if (k.length < 5) continue
    if (!byNorm.has(k)) byNorm.set(k, [])
    byNorm.get(k)!.push(p)
  }
  // Dedup exacto con normalización agresiva (NO matcheados por el dedup anterior)
  const typoDups: Array<{ key: string; products: Product[] }> = []
  for (const [k, prods] of byNorm) {
    if (prods.length >= 2) typoDups.push({ key: k, products: prods })
  }

  // Casi-duplicados: nombres distintos pero con Levenshtein <=2 entre keys
  // Para no explotar O(n²), agrupamos por primer 10 chars y comparamos dentro
  const buckets = new Map<string, string[]>()
  for (const k of byNorm.keys()) {
    if (byNorm.get(k)!.length !== 1) continue // ya está en typoDups
    const prefix = k.slice(0, 8)
    if (!buckets.has(prefix)) buckets.set(prefix, [])
    buckets.get(prefix)!.push(k)
  }
  const nearDups: Array<{ keyA: string; keyB: string; products: Product[] }> = []
  for (const keys of buckets.values()) {
    if (keys.length < 2) continue
    for (let i = 0; i < keys.length; i++) {
      for (let j = i + 1; j < keys.length; j++) {
        const d = lev(keys[i], keys[j])
        if (d > 0 && d <= 2) {
          nearDups.push({
            keyA: keys[i], keyB: keys[j],
            products: [...(byNorm.get(keys[i]) || []), ...(byNorm.get(keys[j]) || [])],
          })
        }
      }
    }
  }

  console.log(`   Grupos con normalización idéntica que NO se dedupearon: ${typoDups.length}`)
  console.log(`   Pares casi-idénticos (Lev ≤ 2): ${nearDups.length}`)

  const typoRows: (string | number | null)[][] = []
  for (const g of typoDups) {
    for (const p of g.products) typoRows.push([g.key, p.id, p.sku, p.name, p.brand])
  }
  writeFileSync(resolve(OUT_DIR, 'products-typo-duplicates.csv'),
    csv('normalized_key,id,sku,name,brand', typoRows))

  const nearRows: (string | number | null)[][] = []
  for (const np of nearDups) {
    for (const p of np.products) nearRows.push([`${np.keyA} ≈ ${np.keyB}`, p.id, p.sku, p.name, p.brand])
  }
  writeFileSync(resolve(OUT_DIR, 'products-near-duplicates.csv'),
    csv('similar_pair,id,sku,name,brand', nearRows))

  // ===========================================================
  // SUMARIO
  // ===========================================================
  console.log(`\n📊 RESUMEN`)
  console.log(`   Total productos activos: ${all.length}`)
  console.log(`   Sin precio:               ${noPrice.length} (${(noPrice.length / all.length * 100).toFixed(1)}%)`)
  console.log(`   Sin marca:                ${noBrand.length} (${(noBrand.length / all.length * 100).toFixed(1)}%)`)
  console.log(`   Sin descripción:          ${noDesc.length} (${(noDesc.length / all.length * 100).toFixed(1)}%)`)
  console.log(`   Duplicados con typo:      ${typoDups.length} grupos`)
  console.log(`   Pares casi-idénticos:     ${nearDups.length}`)
  console.log(`\n📁 CSVs generados en: ${OUT_DIR}/`)
  console.log(`   products-no-price.csv`)
  console.log(`   products-no-brand.csv`)
  console.log(`   products-no-description.csv`)
  console.log(`   products-typo-duplicates.csv`)
  console.log(`   products-near-duplicates.csv`)
}

main().catch((e) => { console.error('💥', e); process.exit(1) })
