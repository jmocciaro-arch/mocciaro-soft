#!/usr/bin/env tsx
/**
 * Dedup masivo de tt_clients basado en tax_id normalizado.
 *
 * La migración de StelOrder creó 657 filas duplicadas (38% de la base):
 * mismo tax_id repetido 2-4 veces, donde cada fila copia un contacto distinto
 * como `name`. Este script:
 *
 *   1) Agrupa filas activas por tax_id normalizado (sin espacios/puntos/guiones).
 *   2) Elige una fila "canónica" (la que más parece la empresa real).
 *   3) Crea contactos en tt_client_contacts a partir de las filas perdedoras
 *      (siempre que no exista ya un contacto con el mismo email/nombre).
 *   4) Re-apunta FKs (tt_quotes, tt_documents, tt_opportunities,
 *      tt_sales_orders, tt_invoices, tt_payments, tt_client_contacts,
 *      tt_purchase_invoices si aplica) a la fila canónica.
 *   5) Marca las filas perdedoras como inactive=false con motivo en notes
 *      (NO las borra, para poder revertir si algo se rompe).
 *
 * USO:
 *   SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... npx tsx scripts/dedupe-clients.ts
 *   # con --apply para aplicar (pide confirmación interactiva)
 *
 * SAFETY:
 *   - Sin --apply, solo lectura + CSV con el plan completo.
 *   - Con --apply, requiere escribir "DEDUPE-APLICAR".
 *   - Las filas perdedoras NO se borran (active=false + nota explicativa),
 *     para que puedas revertir manualmente si detectás un error.
 *   - Operación es idempotente: si la corrés dos veces sobre la misma DB
 *     la segunda no hace nada.
 */

import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { writeFileSync, mkdirSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { createInterface } from 'node:readline/promises'

const SUFIJOS_RX = /\b(SA|SRL|SAS|SL|S\.A\.|S\.R\.L\.|S\.A\.S\.|LLC|INC|LTD|BV|GMBH|OY|AB|PLC|CIA|LIMITED|SOCIEDAD|GROUP|HOLDING|CORP)\b/i
const OUTPUT_CSV = resolve(__dirname, '..', 'out', 'dedupe-plan.csv')
const DEDUPE_TAG = '[DEDUPED] '

interface ClientRow {
  id: string
  name: string
  legal_name: string | null
  tax_id: string | null
  email: string | null
  phone: string | null
  active: boolean
  notes: string | null
  created_at: string
}

function normalizarTaxId(t: string | null): string {
  return (t || '').replace(/[\s.\-]/g, '').toUpperCase()
}

function scoreCliente(c: ClientRow): number {
  let s = 0
  if (c.legal_name && SUFIJOS_RX.test(c.legal_name)) s += 5
  if (c.legal_name && c.legal_name !== c.name) s += 2
  if (c.tax_id && /\d{6,}/.test(c.tax_id)) s += 1
  if (c.email) s += 1
  if (c.phone) s += 1
  // Más antigua gana en empate: prefiere registros consolidados
  s += Math.max(0, 1 - new Date(c.created_at).getTime() / Date.now())
  return s
}

interface Group {
  taxKey: string
  winner: ClientRow
  losers: ClientRow[]
}

// Tablas que tienen FK a tt_clients.client_id (verificadas en schema)
const FK_TABLES: Array<{ table: string; column: string }> = [
  { table: 'tt_quotes', column: 'client_id' },
  { table: 'tt_documents', column: 'client_id' },
  { table: 'tt_opportunities', column: 'client_id' },
  { table: 'tt_sales_orders', column: 'client_id' },
  { table: 'tt_invoices', column: 'client_id' },
  { table: 'tt_payments', column: 'client_id' },
  { table: 'tt_client_contacts', column: 'client_id' },
  { table: 'tt_sat_tickets', column: 'client_id' },
]

async function fetchAll(sb: SupabaseClient): Promise<ClientRow[]> {
  const all: ClientRow[] = []
  let offset = 0
  const pageSize = 1000
  for (;;) {
    const { data, error } = await sb
      .from('tt_clients')
      .select('id, name, legal_name, tax_id, email, phone, active, notes, created_at')
      .eq('active', true)
      .not('tax_id', 'is', null)
      .order('created_at', { ascending: true })
      .range(offset, offset + pageSize - 1)
    if (error) throw error
    if (!data || data.length === 0) break
    all.push(...(data as ClientRow[]))
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

  console.log('🔎 Leyendo tt_clients activos con tax_id...')
  const clients = await fetchAll(sb)
  console.log(`   ${clients.length} filas.`)

  // Agrupar
  const groups = new Map<string, ClientRow[]>()
  for (const c of clients) {
    const key = normalizarTaxId(c.tax_id)
    if (!key) continue
    if (!groups.has(key)) groups.set(key, [])
    groups.get(key)!.push(c)
  }

  const dupGroups: Group[] = []
  for (const [taxKey, rows] of groups) {
    if (rows.length < 2) continue
    const sorted = [...rows].sort((a, b) => scoreCliente(b) - scoreCliente(a))
    dupGroups.push({ taxKey, winner: sorted[0], losers: sorted.slice(1) })
  }

  console.log(`\n📊 Grupos con duplicados: ${dupGroups.length}`)
  console.log(`   Filas a desactivar (merge): ${dupGroups.reduce((s, g) => s + g.losers.length, 0)}`)

  // Top 10 a consola
  console.log('\nTop 10 grupos más grandes:')
  for (const g of [...dupGroups].sort((a, b) => b.losers.length - a.losers.length).slice(0, 10)) {
    console.log(`  tax=${g.taxKey} (${g.losers.length + 1} filas) → winner: "${g.winner.legal_name || g.winner.name}" (${g.winner.id.slice(0, 8)}...)`)
    for (const l of g.losers) {
      console.log(`     loser: "${l.legal_name || l.name}" / "${l.name}" / ${l.email || '-'} (${l.id.slice(0, 8)}...)`)
    }
  }

  // CSV
  mkdirSync(dirname(OUTPUT_CSV), { recursive: true })
  const header = 'tax_id_norm,winner_id,winner_legal_name,winner_name,loser_id,loser_legal_name,loser_name,loser_email\n'
  const rows: string[] = []
  for (const g of dupGroups) {
    for (const l of g.losers) {
      rows.push([g.taxKey, g.winner.id, g.winner.legal_name || '', g.winner.name,
        l.id, l.legal_name || '', l.name, l.email || '']
        .map((v) => { const s = String(v).replace(/"/g, '""'); return /[",\n]/.test(s) ? `"${s}"` : s })
        .join(','))
    }
  }
  writeFileSync(OUTPUT_CSV, header + rows.join('\n') + '\n')
  console.log(`\n📝 Plan completo en: ${OUTPUT_CSV}`)

  if (!apply) {
    console.log(`\n💡 Para aplicar (merge contactos + re-apuntar FKs + desactivar losers):`)
    console.log(`   npx tsx scripts/dedupe-clients.ts --apply`)
    return
  }

  console.log(`\n⚠️  Modo --apply: vas a modificar ${dupGroups.reduce((s, g) => s + g.losers.length, 0)} clientes.`)
  console.log(`   Sin borrar nada: las filas perdedoras quedan active=false + nota.`)
  const rl = createInterface({ input: process.stdin, output: process.stdout })
  const ans = await rl.question(`\n   Escribí "DEDUPE-APLICAR" para confirmar: `)
  rl.close()
  if (ans.trim() !== 'DEDUPE-APLICAR') { console.log('❌ Cancelado.'); return }

  let merged = 0, contactsAdded = 0, fksRepointed = 0, errs = 0
  for (const g of dupGroups) {
    for (const loser of g.losers) {
      try {
        // 1) Crear contacto a partir del loser si no existe ya en el winner
        const { data: existing } = await sb.from('tt_client_contacts')
          .select('id, email, name')
          .eq('client_id', g.winner.id)
        const yaExiste = (existing || []).some((c: { email?: string | null; name?: string | null }) => {
          if (loser.email && c.email && c.email.toLowerCase() === loser.email.toLowerCase()) return true
          if (loser.name && c.name && c.name.toLowerCase() === loser.name.toLowerCase()) return true
          return false
        })
        if (!yaExiste && (loser.name || loser.email)) {
          const { error: e1 } = await sb.from('tt_client_contacts').insert({
            client_id: g.winner.id,
            name: loser.name || loser.email || 'Contacto',
            email: loser.email,
            phone: loser.phone,
            is_primary: (existing?.length || 0) === 0,
          })
          if (!e1) contactsAdded++
        }

        // 2) Re-apuntar FKs (cada tabla por separado para que un error no aborte todo)
        for (const fk of FK_TABLES) {
          const { error: e2, count } = await sb.from(fk.table)
            .update({ [fk.column]: g.winner.id }, { count: 'exact' })
            .eq(fk.column, loser.id)
          if (e2) console.error(`  ⚠ ${fk.table}.${fk.column}: ${e2.message}`)
          else fksRepointed += count || 0
        }

        // 3) Desactivar loser
        const newNotes = `${DEDUPE_TAG}merged_into=${g.winner.id} at ${new Date().toISOString()}${loser.notes ? ` | ${loser.notes}` : ''}`
        const { error: e3 } = await sb.from('tt_clients')
          .update({ active: false, notes: newNotes })
          .eq('id', loser.id)
        if (e3) { errs++; console.error(`  ✗ loser ${loser.id}: ${e3.message}`); continue }
        merged++
      } catch (err) {
        errs++
        console.error(`  💥 ${loser.id}:`, (err as Error).message)
      }
    }
  }

  console.log(`\n✅ Mergeados: ${merged}, contactos creados: ${contactsAdded}, FKs reapuntadas: ${fksRepointed}, errores: ${errs}.`)
  console.log(`\nPara revertir un cliente puntual, en SQL Editor de Supabase:`)
  console.log(`   UPDATE tt_clients SET active=true, notes=NULL WHERE id='<loser_id>';`)
  console.log(`   (las FKs apuntan al winner — habría que reapuntarlas manualmente si querés desmerger)`)
}

main().catch((e) => { console.error('💥', e); process.exit(1) })
