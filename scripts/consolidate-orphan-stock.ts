#!/usr/bin/env tsx
/**
 * Consolida el stock huérfano (apunta a productos deduped) al producto winner.
 *
 * Contexto: el script dedupe-products.ts marca como active=false los duplicados
 * pero no siempre puede mover el stock asociado por el UNIQUE constraint
 * (product_id, warehouse_id). Quedaron ~8.475 entradas con product_id apuntando
 * a productos inactivos.
 *
 * Este script:
 *   1) Para cada producto inactivo con nota [DEDUPED-PRODUCT], extrae
 *      el winner del campo description (merged_into=UUID).
 *   2) Suma las cantidades del loser a la entrada del winner en el mismo
 *      warehouse (UPDATE acumulativo).
 *   3) Si el winner NO tiene entrada en ese warehouse, hace UPDATE del
 *      loser a winner (ya no hay conflicto unique).
 *   4) Si el winner SÍ tiene entrada, hace DELETE del loser (su qty se
 *      sumó al winner).
 *
 * USO:
 *   SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... npx tsx scripts/consolidate-orphan-stock.ts
 *   # con --apply para aplicar (pide confirmación)
 *
 * SAFETY: el dry-run reporta qué va a hacer SIN tocar nada.
 */

import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { writeFileSync, mkdirSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { createInterface } from 'node:readline/promises'

const OUTPUT_CSV = resolve(__dirname, '..', 'out', 'consolidate-stock-plan.csv')

interface StockRow {
  id: string
  product_id: string
  warehouse_id: string
  quantity: number
  reserved: number
  min_quantity: number | null
  loser_product_id: string  // = product_id, alias para claridad
  winner_product_id: string | null
}

async function fetchOrphanStock(sb: SupabaseClient): Promise<StockRow[]> {
  // Trae stock cuyo product_id está en productos inactivos deduped.
  // Extrae winner_id parseando la description ([DEDUPED-PRODUCT] merged_into=UUID).
  const all: StockRow[] = []
  let offset = 0
  const pageSize = 1000

  for (;;) {
    const { data, error } = await sb
      .from('tt_stock')
      .select('id, product_id, warehouse_id, quantity, reserved, min_quantity, product:tt_products!inner(id, active, description)')
      .eq('product.active', false)
      .like('product.description', '[DEDUPED-PRODUCT]%')
      .range(offset, offset + pageSize - 1)
    if (error) throw error
    if (!data || data.length === 0) break

    for (const row of data as Array<{ id: string; product_id: string; warehouse_id: string; quantity: number; reserved: number; min_quantity: number | null; product: { description: string } | { description: string }[] }>) {
      const prodDesc = Array.isArray(row.product) ? row.product[0]?.description : row.product?.description
      const match = (prodDesc || '').match(/merged_into=([a-f0-9-]{36})/i)
      const winnerId = match?.[1] || null
      all.push({
        id: row.id,
        product_id: row.product_id,
        warehouse_id: row.warehouse_id,
        quantity: row.quantity,
        reserved: row.reserved,
        min_quantity: row.min_quantity,
        loser_product_id: row.product_id,
        winner_product_id: winnerId,
      })
    }
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

  console.log('🔎 Leyendo stock huérfano...')
  const orphans = await fetchOrphanStock(sb)
  console.log(`   ${orphans.length} entradas de stock apuntando a productos deduped.`)

  const noWinner = orphans.filter((o) => !o.winner_product_id)
  const withWinner = orphans.filter((o) => o.winner_product_id)
  console.log(`   ${withWinner.length} con winner identificable (parseado de la descripción).`)
  if (noWinner.length > 0) console.log(`   ⚠ ${noWinner.length} sin winner detectado — se ignoran.`)

  // Para cada huérfano con winner, determinar acción:
  //   - "merge": ya existe stock del winner en ese warehouse → sumar y borrar loser
  //   - "update": no existe → reapuntar product_id del loser al winner
  console.log('\n🔍 Determinando acciones (UPDATE vs MERGE)...')
  const actions: Array<{ orphan: StockRow; action: 'update' | 'merge'; existing_winner_id?: string }> = []

  for (const o of withWinner) {
    const { data } = await sb.from('tt_stock')
      .select('id')
      .eq('product_id', o.winner_product_id!)
      .eq('warehouse_id', o.warehouse_id)
      .maybeSingle()
    if (data) {
      actions.push({ orphan: o, action: 'merge', existing_winner_id: data.id as string })
    } else {
      actions.push({ orphan: o, action: 'update' })
    }
  }

  const updates = actions.filter((a) => a.action === 'update').length
  const merges = actions.filter((a) => a.action === 'merge').length
  console.log(`\n📊 Plan:`)
  console.log(`   UPDATE (reapuntar product_id al winner): ${updates}`)
  console.log(`   MERGE (sumar qty al winner + borrar loser): ${merges}`)

  // CSV
  mkdirSync(dirname(OUTPUT_CSV), { recursive: true })
  const header = 'action,loser_stock_id,loser_product_id,winner_product_id,warehouse_id,quantity,existing_winner_stock_id\n'
  const csvRows = actions.map((a) => [
    a.action,
    a.orphan.id,
    a.orphan.loser_product_id,
    a.orphan.winner_product_id || '',
    a.orphan.warehouse_id,
    a.orphan.quantity,
    a.existing_winner_id || '',
  ].join(','))
  writeFileSync(OUTPUT_CSV, header + csvRows.join('\n') + '\n')
  console.log(`\n📝 Plan en: ${OUTPUT_CSV}`)

  if (!apply) {
    console.log(`\n💡 Para aplicar:`)
    console.log(`   npx tsx scripts/consolidate-orphan-stock.ts --apply`)
    return
  }

  const rl = createInterface({ input: process.stdin, output: process.stdout })
  const ans = await rl.question(`\n   Escribí "STOCK-APLICAR" para confirmar: `)
  rl.close()
  if (ans.trim() !== 'STOCK-APLICAR') { console.log('❌ Cancelado.'); return }

  console.log('\n⚙ Aplicando...')
  let okUpdates = 0, okMerges = 0, errs = 0
  for (const a of actions) {
    try {
      if (a.action === 'update') {
        const { error } = await sb.from('tt_stock')
          .update({ product_id: a.orphan.winner_product_id })
          .eq('id', a.orphan.id)
        if (error) throw error
        okUpdates++
      } else {
        // Sumar qty al winner_stock
        const { data: existing } = await sb.from('tt_stock')
          .select('quantity, reserved')
          .eq('id', a.existing_winner_id!)
          .single()
        if (existing) {
          await sb.from('tt_stock')
            .update({
              quantity: (existing.quantity || 0) + a.orphan.quantity,
              reserved: (existing.reserved || 0) + a.orphan.reserved,
            })
            .eq('id', a.existing_winner_id!)
        }
        // Borrar loser
        const { error } = await sb.from('tt_stock').delete().eq('id', a.orphan.id)
        if (error) throw error
        okMerges++
      }
      if ((okUpdates + okMerges) % 200 === 0) {
        console.log(`  ... procesados ${okUpdates + okMerges}/${actions.length}`)
      }
    } catch (err) {
      errs++
      console.error(`  💥 stock ${a.orphan.id}:`, (err as Error).message)
    }
  }

  console.log(`\n✅ UPDATE: ${okUpdates}, MERGE: ${okMerges}, errores: ${errs}.`)
}

main().catch((e) => { console.error('💥', e); process.exit(1) })
