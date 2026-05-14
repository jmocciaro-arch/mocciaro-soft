#!/usr/bin/env tsx
/**
 * Importa precios masivamente desde un CSV a tt_products.
 *
 * El CSV debe tener al menos columna `sku`. Opcionalmente cualquiera de:
 *   - price_eur, cost_eur, price_usd, price_ars, price_min
 *
 * Solo actualiza productos activos con SKU que matchee. NO crea productos.
 *
 * USO:
 *   SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... \
 *     npx tsx scripts/import-prices-from-csv.ts /path/al/precios.csv
 *
 *   # dry-run por default. Para aplicar:
 *   npx tsx scripts/import-prices-from-csv.ts precios.csv --apply
 *
 * Formato CSV esperado (cualquier orden, headers obligatorios):
 *   sku,price_eur,cost_eur,price_usd,price_ars,price_min
 *   TC.QSP50N3,228.00,180.00,250.00,,
 */

import { createClient } from '@supabase/supabase-js'
import { readFileSync } from 'node:fs'

const PRICE_COLS = ['price_eur', 'cost_eur', 'price_usd', 'price_ars', 'price_min'] as const

function parseCsv(text: string): Record<string, string>[] {
  const lines = text.replace(/^﻿/, '').split(/\r?\n/).filter((l) => l.trim().length > 0)
  if (lines.length === 0) return []
  const headers = lines[0].split(',').map((h) => h.trim().toLowerCase())
  return lines.slice(1).map((line) => {
    // Parser simple CSV (no maneja comillas con comas adentro, OK para este caso)
    const vals = line.split(',')
    const row: Record<string, string> = {}
    headers.forEach((h, i) => { row[h] = (vals[i] || '').trim() })
    return row
  })
}

function toNum(s: string | undefined): number | null {
  if (!s) return null
  const n = parseFloat(s.replace(',', '.'))
  return isNaN(n) ? null : n
}

async function main() {
  const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  const csvPath = process.argv[2]
  const apply = process.argv.includes('--apply')

  if (!url || !key) {
    console.error('❌ Faltan SUPABASE_URL o SUPABASE_SERVICE_ROLE_KEY en env.')
    process.exit(1)
  }
  if (!csvPath || csvPath.startsWith('--')) {
    console.error('❌ Falta path al CSV. Uso: npx tsx scripts/import-prices-from-csv.ts /path/precios.csv [--apply]')
    process.exit(1)
  }

  const sb = createClient(url, key, { auth: { persistSession: false } })

  console.log(`📂 Leyendo ${csvPath}...`)
  const rows = parseCsv(readFileSync(csvPath, 'utf-8'))
  console.log(`   ${rows.length} filas en el CSV.`)

  if (rows.length === 0) {
    console.log('Nada para procesar.')
    return
  }

  // Validar headers
  if (!('sku' in rows[0])) {
    console.error('❌ El CSV debe tener columna "sku".')
    process.exit(1)
  }
  const priceColsInCsv = PRICE_COLS.filter((c) => c in rows[0])
  if (priceColsInCsv.length === 0) {
    console.error(`❌ El CSV no tiene ninguna columna de precio. Esperaba alguna de: ${PRICE_COLS.join(', ')}`)
    process.exit(1)
  }
  console.log(`   Columnas de precio en CSV: ${priceColsInCsv.join(', ')}`)

  // Traemos los productos para matchear por SKU
  console.log(`\n🔎 Buscando productos en DB por SKU...`)
  const skus = rows.map((r) => r.sku).filter(Boolean)
  const productBySku = new Map<string, { id: string; sku: string }>()
  const chunk = 500
  for (let i = 0; i < skus.length; i += chunk) {
    const slice = skus.slice(i, i + chunk)
    const { data } = await sb.from('tt_products').select('id, sku').in('sku', slice).eq('active', true)
    for (const p of (data || []) as Array<{ id: string; sku: string }>) {
      productBySku.set(p.sku, p)
    }
  }
  console.log(`   ${productBySku.size} de ${skus.length} SKUs encontrados.`)

  const updates: Array<{ id: string; sku: string; patch: Record<string, number> }> = []
  const noMatch: string[] = []

  for (const r of rows) {
    const prod = productBySku.get(r.sku)
    if (!prod) { noMatch.push(r.sku); continue }
    const patch: Record<string, number> = {}
    for (const col of priceColsInCsv) {
      const n = toNum(r[col])
      if (n !== null && n > 0) patch[col] = n
    }
    if (Object.keys(patch).length > 0) updates.push({ id: prod.id, sku: r.sku, patch })
  }

  console.log(`\n📊 Plan:`)
  console.log(`   Productos a actualizar: ${updates.length}`)
  console.log(`   SKUs sin match en DB: ${noMatch.length}`)
  if (noMatch.length > 0 && noMatch.length <= 20) {
    console.log(`   Sin match:`, noMatch.slice(0, 20).join(', '))
  }
  if (updates.length > 0) {
    console.log(`   Primeros 5 cambios:`)
    for (const u of updates.slice(0, 5)) {
      console.log(`      ${u.sku} →`, u.patch)
    }
  }

  if (!apply) {
    console.log(`\n💡 Para aplicar: agregá --apply al final del comando.`)
    return
  }

  console.log(`\n⚙ Aplicando ${updates.length} updates...`)
  let ok = 0, errs = 0
  for (const u of updates) {
    try {
      const { error } = await sb.from('tt_products').update(u.patch).eq('id', u.id)
      if (error) throw error
      ok++
      if (ok % 200 === 0) console.log(`   ... ${ok}/${updates.length}`)
    } catch (err) {
      errs++
      console.error(`   ✗ ${u.sku}:`, (err as Error).message)
    }
  }
  console.log(`\n✅ Actualizados: ${ok}, errores: ${errs}.`)
}

main().catch((e) => { console.error('💥', e); process.exit(1) })
