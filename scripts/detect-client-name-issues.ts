#!/usr/bin/env tsx
/**
 * Detecta clientes en tt_clients donde el campo `name` parece ser una
 * persona física (contacto) en vez de la razón social de la empresa.
 *
 * Heurísticas (combinables, cada match suma confianza):
 *  1) `legal_name` existe y difiere de `name` → casi seguro `name` es contacto.
 *  2) `name` contiene 2-4 palabras capitalizadas y ningún sufijo societario
 *     (SA, SRL, SAS, SL, S.A., S.R.L., LLC, INC, LTD, BV, GMBH, OY, AB, PLC, CIA).
 *  3) `legal_name` SÍ contiene sufijo societario.
 *  4) Existe un contacto en tt_client_contacts cuyo nombre matchea fuzzy con `name`.
 *  5) `email` del cliente coincide con un email de contacto y NO con el de la empresa
 *     (p.ej. macuna@nordex.com.uy en el cliente cuyo dominio principal es nordex.com.uy).
 *
 * Output: tabla por consola + CSV `out/client-name-issues.csv` con
 *   id, current_name, legal_name, tax_id, suggested_name, suggested_contact, score, reasons
 *
 * USO:
 *   SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... npx tsx scripts/detect-client-name-issues.ts
 *   # con --apply para actualizar el name → legal_name y crear contacto
 *   SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... npx tsx scripts/detect-client-name-issues.ts --apply
 *
 * SAFETY:
 *   - Sin --apply, solo lectura + CSV.
 *   - Con --apply, requiere confirmación interactiva (escribir "APLICAR").
 *   - Solo modifica filas con score >= MIN_SCORE_TO_APPLY (default 3).
 */

import { createClient } from '@supabase/supabase-js'
import { writeFileSync, mkdirSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { createInterface } from 'node:readline/promises'

const SUFIJOS_SOCIETARIOS = [
  'SA', 'S.A.', 'S.A', 'SRL', 'S.R.L.', 'S.R.L', 'SAS', 'S.A.S.',
  'SL', 'S.L.', 'SL.', 'SLU', 'LLC', 'INC', 'INC.', 'LTD', 'LTD.',
  'BV', 'B.V.', 'GMBH', 'OY', 'AB', 'PLC', 'CIA', 'CIA.', 'COMPANY',
  'CORP', 'CORP.', 'LIMITED', 'GROUP', 'HOLDING', 'SOCIEDAD',
]

const MIN_SCORE_TO_APPLY = 3
const OUTPUT_CSV = resolve(__dirname, '..', 'out', 'client-name-issues.csv')

interface ClientRow {
  id: string
  name: string
  legal_name: string | null
  tax_id: string | null
  email: string | null
}

interface ClientContactRow {
  client_id: string
  name: string
  email: string | null
}

interface Issue {
  id: string
  current_name: string
  legal_name: string | null
  tax_id: string | null
  suggested_name: string
  suggested_contact_name: string | null
  suggested_contact_email: string | null
  score: number
  reasons: string[]
}

function tieneSufijoSocietario(s: string): boolean {
  const tokens = s.toUpperCase().replace(/[.,]/g, ' ').split(/\s+/)
  return tokens.some((t) => SUFIJOS_SOCIETARIOS.includes(t))
}

function pareceNombreDePersona(s: string): boolean {
  const palabras = s.trim().split(/\s+/)
  if (palabras.length < 2 || palabras.length > 4) return false
  if (tieneSufijoSocietario(s)) return false
  // Que cada palabra empiece con mayúscula y el resto sea letras
  return palabras.every((p) => /^[A-ZÁÉÍÓÚÑÜ][a-záéíóúñü'`-]+$/.test(p))
}

function normalizarParaComparar(s: string): string {
  return s
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9 ]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

function similitudFuzzy(a: string, b: string): number {
  const na = normalizarParaComparar(a)
  const nb = normalizarParaComparar(b)
  if (!na || !nb) return 0
  if (na === nb) return 1
  const ta = new Set(na.split(' '))
  const tb = new Set(nb.split(' '))
  let inter = 0
  ta.forEach((t) => { if (tb.has(t)) inter++ })
  return inter / Math.max(ta.size, tb.size)
}

async function main() {
  const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  const apply = process.argv.includes('--apply')

  if (!url || !key) {
    console.error('❌ Faltan SUPABASE_URL o SUPABASE_SERVICE_ROLE_KEY en env.')
    console.error('   Tip: cargá .env.local con `export $(cat .env.local | xargs)` o pasalos inline.')
    process.exit(1)
  }

  const sb = createClient(url, key, { auth: { persistSession: false } })

  console.log('🔎 Leyendo tt_clients...')
  const { data: clients, error } = await sb
    .from('tt_clients')
    .select('id, name, legal_name, tax_id, email')
    .order('name')
  if (error) { console.error('Error:', error.message); process.exit(1) }
  if (!clients || clients.length === 0) { console.log('Sin clientes.'); return }
  console.log(`   ${clients.length} clientes leídos.`)

  console.log('🔎 Leyendo tt_client_contacts...')
  const { data: contacts } = await sb
    .from('tt_client_contacts')
    .select('client_id, name, email')
  const contactsByClient = new Map<string, ClientContactRow[]>()
  for (const c of (contacts || []) as ClientContactRow[]) {
    if (!contactsByClient.has(c.client_id)) contactsByClient.set(c.client_id, [])
    contactsByClient.get(c.client_id)!.push(c)
  }
  console.log(`   ${contacts?.length || 0} contactos.`)

  const issues: Issue[] = []
  for (const c of clients as ClientRow[]) {
    const reasons: string[] = []
    let score = 0
    let suggestedContactName: string | null = null
    let suggestedContactEmail: string | null = null

    // Regla 1: legal_name existe y difiere
    if (c.legal_name && c.legal_name.trim() && c.legal_name.trim() !== c.name.trim()) {
      reasons.push(`legal_name existe ("${c.legal_name}") y difiere de name`)
      score += 2
    }
    // Regla 2: name parece persona
    if (pareceNombreDePersona(c.name)) {
      reasons.push(`name "${c.name}" tiene formato de persona`)
      score += 1
    }
    // Regla 3: legal_name tiene sufijo societario
    if (c.legal_name && tieneSufijoSocietario(c.legal_name)) {
      reasons.push(`legal_name tiene sufijo societario`)
      score += 1
    }
    // Regla 3b: name tiene sufijo societario → CASO BUENO (penaliza)
    if (tieneSufijoSocietario(c.name)) {
      reasons.push(`name ya tiene sufijo societario (probablemente OK)`)
      score -= 2
    }
    // Regla 4: contacto con nombre fuzzy parecido al name
    const cContacts = contactsByClient.get(c.id) || []
    const contactoMatch = cContacts.find((ct) => similitudFuzzy(ct.name, c.name) >= 0.6)
    if (contactoMatch) {
      reasons.push(`existe contacto con nombre similar: "${contactoMatch.name}"`)
      score += 1
      suggestedContactName = contactoMatch.name
      suggestedContactEmail = contactoMatch.email
    } else if (pareceNombreDePersona(c.name)) {
      // Sugerimos crear contacto con el name actual
      suggestedContactName = c.name
      suggestedContactEmail = c.email
    }
    // Regla 5: email del cliente parece personal (dominio común o local-part = nombre)
    if (c.email && pareceNombreDePersona(c.name)) {
      const localPart = c.email.split('@')[0]?.toLowerCase() || ''
      const tokens = normalizarParaComparar(c.name).split(' ')
      if (tokens.some((t) => t.length >= 3 && localPart.includes(t))) {
        reasons.push(`email "${c.email}" parece personal (contiene parte del nombre)`)
        score += 1
      }
    }

    if (score >= 2 && c.legal_name) {
      issues.push({
        id: c.id,
        current_name: c.name,
        legal_name: c.legal_name,
        tax_id: c.tax_id,
        suggested_name: c.legal_name,
        suggested_contact_name: suggestedContactName,
        suggested_contact_email: suggestedContactEmail,
        score,
        reasons,
      })
    }
  }

  issues.sort((a, b) => b.score - a.score)
  console.log(`\n📊 Detectados ${issues.length} clientes con "name" sospechoso (score ≥ 2).\n`)

  // Top 20 a consola
  for (const i of issues.slice(0, 20)) {
    console.log(`  [${i.score}] ${i.tax_id || '—'}  "${i.current_name}"  →  "${i.suggested_name}"`)
    if (i.suggested_contact_name) console.log(`        contacto sugerido: ${i.suggested_contact_name}${i.suggested_contact_email ? ` <${i.suggested_contact_email}>` : ''}`)
    for (const r of i.reasons) console.log(`        · ${r}`)
  }
  if (issues.length > 20) console.log(`  ... y ${issues.length - 20} más (ver CSV)`)

  // CSV
  mkdirSync(dirname(OUTPUT_CSV), { recursive: true })
  const header = 'id,current_name,legal_name,tax_id,suggested_name,suggested_contact_name,suggested_contact_email,score,reasons\n'
  const rows = issues.map((i) =>
    [i.id, i.current_name, i.legal_name || '', i.tax_id || '',
     i.suggested_name, i.suggested_contact_name || '', i.suggested_contact_email || '',
     i.score, i.reasons.join(' | ')]
      .map((v) => {
        const s = String(v).replace(/"/g, '""')
        return /[",\n]/.test(s) ? `"${s}"` : s
      }).join(',')
  ).join('\n')
  writeFileSync(OUTPUT_CSV, header + rows + '\n')
  console.log(`\n📝 CSV escrito en: ${OUTPUT_CSV}`)

  if (!apply) {
    console.log(`\n💡 Para aplicar los cambios (score >= ${MIN_SCORE_TO_APPLY}) correlo con --apply:`)
    console.log(`   npx tsx scripts/detect-client-name-issues.ts --apply`)
    return
  }

  const toApply = issues.filter((i) => i.score >= MIN_SCORE_TO_APPLY)
  console.log(`\n⚠️  Modo --apply: se van a actualizar ${toApply.length} filas (score >= ${MIN_SCORE_TO_APPLY}).`)
  console.log(`   - tt_clients.name ← legal_name`)
  console.log(`   - tt_client_contacts.insert (nombre del contacto sugerido) si no existe ya`)

  const rl = createInterface({ input: process.stdin, output: process.stdout })
  const answer = await rl.question(`\n   Escribí "APLICAR" para confirmar: `)
  rl.close()
  if (answer.trim() !== 'APLICAR') { console.log('❌ Cancelado.'); return }

  let updated = 0, contactsCreated = 0, errs = 0
  for (const i of toApply) {
    // Update name
    const { error: e1 } = await sb.from('tt_clients').update({ name: i.suggested_name }).eq('id', i.id)
    if (e1) { errs++; console.error(`  ✗ ${i.id}: ${e1.message}`); continue }
    updated++

    // Crear contacto si hay sugerencia y no existe ya
    if (i.suggested_contact_name) {
      const existentes = contactsByClient.get(i.id) || []
      const yaExiste = existentes.some((c) => similitudFuzzy(c.name, i.suggested_contact_name!) >= 0.8)
      if (!yaExiste) {
        const { error: e2 } = await sb.from('tt_client_contacts').insert({
          client_id: i.id,
          name: i.suggested_contact_name,
          email: i.suggested_contact_email,
          is_primary: existentes.length === 0,
        })
        if (e2) console.error(`  ⚠ contacto ${i.id}: ${e2.message}`)
        else contactsCreated++
      }
    }
  }
  console.log(`\n✅ Actualizados: ${updated}, contactos creados: ${contactsCreated}, errores: ${errs}.`)
}

main().catch((e) => { console.error('💥', e); process.exit(1) })
