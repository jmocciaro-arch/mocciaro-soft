#!/usr/bin/env tsx
/**
 * Consolida el stock huérfano (apunta a productos deduped) al producto winner.
 *
 * Contexto: el script dedupe-products.ts marcó como active=false los duplicados
 * pero no siempre pudo mover el stock por el UNIQUE constraint
 * (product_id, warehouse_id). Quedaron ~8.475 entradas de stock apuntando
 * a productos inactivos.
 *
 * USO:
 *   SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... npx tsx scripts/consolidate-orphan-stock.ts
 *   # con --apply para aplicar (confirmación "STOCK-APLICAR")
 *
 * Optimizado: sólo 3 queries grandes (no 8475 seriales).
 */

import { createClient } from '@supabase/supabase-js'
import { writeFileSync, mkdirSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { createInterface } from 'node:readline/promises'

const OUTPUT_CSV = resolve(__dirname, '..', 'out', 'consolidate-stock-plan.csv')

async function main() {
  const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  const apply = process.argv.includes('--apply')

  if (!url || !key) {
    console.error('❌ Faltan SUPABASE_URL o SUPABASE_SERVICE_ROLE_KEY en env.')
    process.exit(1)
  }

  // Forzar flush de stdout inmediato (sino Node bufferiza)
  process.stdout.write('🔎 Conectando a Supabase...\n')

  const sb = createClient(url, key, { auth: { persistSession: false } })

  // 1) Traer productos deduped con sus winners parseados de description
  process.stdout.write('🔎 Leyendo productos deduped (active=false con tag)...\n')
  const dedupedById = new Map<string, string | null>()
  let offset = 0
  for (;;) {
    const { data, error } = await sb.from('tt_products')
      .select('id, description').eq('active', false)
      .like('description', '[DEDUPED-PRODUCT]%')
      .range(offset, offset + 999)
    if (error) throw error
    if (!data || data.length === 0) break
    for (const p of data) {
      const m = (p.description || '').match(/merged_into=([a-f0-9-]{36})/i)
      dedupedById.set(p.id as string, m?.[1] || null)
    }
    process.stdout.write(`   ... ${dedupedById.size} productos deduped\n`)
    if (data.length < 1000) break
    offset += 1000
  }
  process.stdout.write(`   Total deduped con tag: ${dedupedById.size}\n\n`)

  // 2) Traer todo el stock que apunta a esos productos
  process.stdout.write('🔎 Leyendo stock huérfano...\n')
  const orphans: Array<{ id: string; product_id: string; warehouse_id: string; quantity: number; reserved: number; winner_id: string | null }> = []
  const deletedIds = Array.from(dedupedById.keys())
  for (let i = 0; i < deletedIds.length; i += 100) {
    const slice = deletedIds.slice(i, i + 100)
    const { data, error } = await sb.from('tt_stock')
      .select('id, product_id, warehouse_id, quantity, reserved')
      .in('product_id', slice)
    if (error) throw error
    for (const r of (data || []) as Array<{ id: string; product_id: string; warehouse_id: string; quantity: number; reserved: number }>) {
      orphans.push({ ...r, winner_id: dedupedById.get(r.product_id) || null })
    }
  }
  process.stdout.write(`   ${orphans.length} entradas de stock huérfanas.\n`)

  const withWinner = orphans.filter((o) => o.winner_id)
  const noWinner = orphans.length - withWinner.length
  process.stdout.write(`   ${withWinner.length} con winner identificable.\n`)
  if (noWinner > 0) process.stdout.write(`   ⚠ ${noWinner} sin winner (se ignoran).\n\n`)

  // 3) Traer todo el stock de los winners para identificar conflicts (en batch)
  process.stdout.write('🔎 Leyendo stock de los winners para detectar conflictos...\n')
  const winnerIds = Array.from(new Set(withWinner.map((o) => o.winner_id!)))
  const winnerStock = new Map<string, string>() // key: winner_id + '__' + warehouse_id → stock_id
  for (let i = 0; i < winnerIds.length; i += 100) {
    const slice = winnerIds.slice(i, i + 100)
    const { data } = await sb.from('tt_stock')
      .select('id, product_id, warehouse_id, quantity, reserved')
      .in('product_id', slice)
    for (const r of (data || []) as Array<{ id: string; product_id: string; warehouse_id: string }>) {
      winnerStock.set(`${r.product_id}__${r.warehouse_id}`, r.id)
    }
  }
  process.stdout.write(`   Winners con stock: ${winnerStock.size} (product+warehouse pairs)\n\n`)

  // 4) Determinar acciones
  const actions: Array<{ orphan: typeof orphans[number]; action: 'update' | 'merge'; existing_winner_stock_id?: string }> = []
  for (const o of withWinner) {
    const key = `${o.winner_id}__${o.warehouse_id}`
    const existingId = winnerStock.get(key)
    if (existingId) {
      actions.push({ orphan: o, action: 'merge', existing_winner_stock_id: existingId })
    } else {
      actions.push({ orphan: o, action: 'update' })
      // Importante: actualizar el set de winner stock para que los próximos
      // hits al mismo winner+warehouse ya cuenten esta entrada
      winnerStock.set(key, o.id)
    }
  }

  const updates = actions.filter((a) => a.action === 'update').length
  const merges = actions.filter((a) => a.action === 'merge').length
  process.stdout.write(`📊 Plan:\n`)
  process.stdout.write(`   UPDATE (reapuntar product_id al winner): ${updates}\n`)
  process.stdout.write(`   MERGE (sumar qty al winner + borrar loser): ${merges}\n`)

  // CSV
  mkdirSync(dirname(OUTPUT_CSV), { recursive: true })
  const header = 'action,loser_stock_id,loser_product_id,winner_product_id,warehouse_id,quantity\n'
  const csvRows = actions.map((a) => [
    a.action,
    a.orphan.id,
    a.orphan.product_id,
    a.orphan.winner_id || '',
    a.orphan.warehouse_id,
    a.orphan.quantity,
  ].join(','))
  writeFileSync(OUTPUT_CSV, header + csvRows.join('\n') + '\n')
  process.stdout.write(`\n📝 Plan en: ${OUTPUT_CSV}\n`)

  if (!apply) {
    process.stdout.write(`\n💡 Para aplicar:\n`)
    process.stdout.write(`   npx tsx scripts/consolidate-orphan-stock.ts --apply\n`)
    return
  }

  const rl = createInterface({ input: process.stdin, output: process.stdout })
  const ans = await rl.question(`\n   Escribí "STOCK-APLICAR" para confirmar: `)
  rl.close()
  if (ans.trim() !== 'STOCK-APLICAR') { process.stdout.write('❌ Cancelado.\n'); return }

  process.stdout.write('\n⚙ Aplicando...\n')
  let okUpdates = 0, okMerges = 0, errs = 0
  for (const a of actions) {
    try {
      if (a.action === 'update') {
        const { error } = await sb.from('tt_stock').update({ product_id: a.orphan.winner_id }).eq('id', a.orphan.id)
        if (error) throw error
        okUpdates++
      } else {
        const { data: existing } = await sb.from('tt_stock')
          .select('quantity, reserved').eq('id', a.existing_winner_stock_id!).single()
        if (existing) {
          await sb.from('tt_stock').update({
            quantity: (existing.quantity || 0) + a.orphan.quantity,
            reserved: (existing.reserved || 0) + a.orphan.reserved,
          }).eq('id', a.existing_winner_stock_id!)
        }
        const { error } = await sb.from('tt_stock').delete().eq('id', a.orphan.id)
        if (error) throw error
        okMerges++
      }
      if ((okUpdates + okMerges) % 200 === 0) {
        process.stdout.write(`   ... ${okUpdates + okMerges}/${actions.length}\n`)
      }
    } catch (err) {
      errs++
      process.stdout.write(`   💥 stock ${a.orphan.id}: ${(err as Error).message}\n`)
    }
  }
  process.stdout.write(`\n✅ UPDATE: ${okUpdates}, MERGE: ${okMerges}, errores: ${errs}.\n`)
}

main().catch((e) => { console.error('💥', e); process.exit(1) })
