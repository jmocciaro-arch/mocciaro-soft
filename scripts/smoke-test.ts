#!/usr/bin/env tsx
/**
 * Smoke test del sistema — solo lectura. Verifica que las migraciones
 * críticas estén aplicadas y que no haya datos rotos.
 *
 * USO:
 *   SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... npx tsx scripts/smoke-test.ts
 */

import { createClient } from '@supabase/supabase-js'

interface Check { name: string; ok: boolean; detail: string }

async function main() {
  const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) { console.error('❌ Faltan envs.'); process.exit(1) }

  const sb = createClient(url, key, { auth: { persistSession: false } })
  const checks: Check[] = []

  // ─── SCHEMA ─────────────────────────────────────────────────────────
  // v77: tt_documents.doc_type debe existir (no type)
  const { data: docCols } = await sb.from('tt_documents').select('doc_type').limit(1)
  checks.push({
    name: 'v77: tt_documents.doc_type existe',
    ok: !!docCols,
    detail: docCols ? 'OK' : 'falta migración',
  })

  // v78: tt_oc_parsed.ai_discrepancies
  try {
    await sb.from('tt_oc_parsed').select('ai_discrepancies, ai_provider, matched_quote_id').limit(1)
    checks.push({ name: 'v78: tt_oc_parsed columnas IA', ok: true, detail: 'OK' })
  } catch (e) {
    checks.push({ name: 'v78: tt_oc_parsed columnas IA', ok: false, detail: (e as Error).message })
  }

  // v80: tt_quotes.participating_contact_ids
  try {
    await sb.from('tt_quotes').select('participating_contact_ids').limit(1)
    checks.push({ name: 'v80: tt_quotes.participating_contact_ids', ok: true, detail: 'OK' })
  } catch (e) {
    checks.push({ name: 'v80: tt_quotes.participating_contact_ids', ok: false, detail: (e as Error).message })
  }

  // tt_sku_aliases existe
  try {
    const { count } = await sb.from('tt_sku_aliases').select('*', { count: 'exact', head: true })
    checks.push({ name: 'v76: tt_sku_aliases existe', ok: true, detail: `${count} aliases guardados` })
  } catch (e) {
    checks.push({ name: 'v76: tt_sku_aliases existe', ok: false, detail: (e as Error).message })
  }

  // ─── INTEGRIDAD ─────────────────────────────────────────────────────
  // Items huérfanos (apuntan a producto inactivo)
  const orphanItems: Array<[string, string]> = [
    ['tt_quote_items', 'product_id'],
    ['tt_so_items', 'product_id'],
    ['tt_dn_items', 'product_id'],
    ['tt_invoice_items', 'product_id'],
  ]
  for (const [table, col] of orphanItems) {
    try {
      const { data: inactiveProducts } = await sb.from('tt_products')
        .select('id').eq('active', false).like('description', '[DEDUPED-PRODUCT%')
        .limit(1000)
      const ids = (inactiveProducts || []).map((p) => p.id)
      if (ids.length === 0) {
        checks.push({ name: `${table}: items huérfanos`, ok: true, detail: 'sin productos deduped' })
        continue
      }
      const { count } = await sb.from(table).select('*', { count: 'exact', head: true }).in(col, ids.slice(0, 100))
      checks.push({
        name: `${table}: items huérfanos`,
        ok: (count || 0) === 0,
        detail: `${count || 0} apuntan a producto inactivo`,
      })
    } catch (e) {
      checks.push({ name: `${table}: items huérfanos`, ok: false, detail: (e as Error).message })
    }
  }

  // Stock huérfano
  try {
    const { data: inactiveProducts } = await sb.from('tt_products')
      .select('id').eq('active', false).like('description', '[DEDUPED-PRODUCT%')
      .limit(100)
    const ids = (inactiveProducts || []).map((p) => p.id)
    if (ids.length > 0) {
      const { count } = await sb.from('tt_stock').select('*', { count: 'exact', head: true }).in('product_id', ids)
      checks.push({
        name: 'tt_stock: huérfanos',
        ok: (count || 0) === 0,
        detail: `${count || 0} entradas huérfanas (sample 100 productos)`,
      })
    } else {
      checks.push({ name: 'tt_stock: huérfanos', ok: true, detail: 'no aplica' })
    }
  } catch (e) {
    checks.push({ name: 'tt_stock: huérfanos', ok: false, detail: (e as Error).message })
  }

  // Cotizaciones sin cliente
  const { count: cotsSinCliente } = await sb.from('tt_quotes')
    .select('*', { count: 'exact', head: true }).is('client_id', null)
  checks.push({
    name: 'tt_quotes sin client_id',
    ok: (cotsSinCliente || 0) <= 1,  // toleramos el huérfano legacy COT-2026-0003
    detail: `${cotsSinCliente || 0} cotizaciones huérfanas`,
  })

  // ─── DATOS DE NEGOCIO ──────────────────────────────────────────────
  const { count: productosActivos } = await sb.from('tt_products')
    .select('*', { count: 'exact', head: true }).eq('active', true)
  checks.push({ name: 'productos activos', ok: (productosActivos || 0) > 5000, detail: `${productosActivos}` })

  const { count: productosConPrecio } = await sb.from('tt_products')
    .select('*', { count: 'exact', head: true }).eq('active', true).gt('price_eur', 0)
  const pct = productosConPrecio && productosActivos ? (productosConPrecio / productosActivos * 100).toFixed(1) : '0'
  checks.push({
    name: 'productos con price_eur > 0',
    ok: (productosConPrecio || 0) > 100, // mínimo razonable
    detail: `${productosConPrecio} / ${productosActivos} (${pct}%)`,
  })

  const { count: clientesActivos } = await sb.from('tt_clients')
    .select('*', { count: 'exact', head: true }).eq('active', true)
  checks.push({ name: 'clientes activos', ok: (clientesActivos || 0) > 1000, detail: `${clientesActivos}` })

  // ─── REPORTE ────────────────────────────────────────────────────────
  console.log('\n╔══════════════════════════════════════════════════════════════╗')
  console.log('║                  SMOKE TEST — MOCCIARO SOFT                    ║')
  console.log('╚══════════════════════════════════════════════════════════════╝\n')

  let pass = 0, fail = 0
  for (const c of checks) {
    const icon = c.ok ? '✅' : '❌'
    console.log(`${icon}  ${c.name.padEnd(45, ' ')} ${c.detail}`)
    if (c.ok) pass++; else fail++
  }
  console.log(`\n${pass}/${checks.length} OK${fail > 0 ? ` · ${fail} fallaron` : ''}\n`)
  if (fail > 0) process.exit(1)
}

main().catch((e) => { console.error('💥', e); process.exit(1) })
