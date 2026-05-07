#!/usr/bin/env tsx
/**
 * Seed reproducible para tests E2E — Fase 0.1 del PLAN-REFACTOR.
 *
 * Crea en una DB limpia (staging o local):
 *   - 2 empresas (TT-TEST, BT-TEST)
 *   - 5 clientes por empresa
 *   - 10 productos compartidos por SKU
 *   - 1 warehouse por empresa
 *   - 2 usuarios (uno por empresa) con rol admin
 *   - 1 cotización draft de ejemplo por empresa (para tests cross-company)
 *
 * Escribe los IDs generados a `tests/e2e/fixtures/seed-context.json`.
 *
 * REQUIERE en .env.local:
 *   SUPABASE_URL                — URL del proyecto staging (NUNCA prod)
 *   SUPABASE_SERVICE_ROLE_KEY   — service role para bypass de RLS
 *   E2E_USER_A_EMAIL / E2E_USER_A_PASSWORD
 *   E2E_USER_B_EMAIL / E2E_USER_B_PASSWORD
 *
 * USO:
 *   npm run seed:test
 *
 * SAFETY:
 *   - Aborta si SUPABASE_URL apunta al proyecto de producción.
 *   - Idempotente: SELECT first, INSERT if not exists.
 *
 * STATUS: implementación funcional pragmática. Schema asumido del
 * estado actual (schema.sql + migraciones v37+). Puede requerir
 * ajuste de columnas si el schema de staging difiere.
 */

import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { writeFileSync, mkdirSync } from 'node:fs'
import { dirname, resolve } from 'node:path'

type SupabaseLike = SupabaseClient

const PROD_URL_FRAGMENT = 'wsjfbchxspylslosdleb' // proyecto producción real
const FIXTURE_PATH = resolve(__dirname, '..', 'tests', 'e2e', 'fixtures', 'seed-context.json')

interface SeedContext {
  empresaA: { userId: string; companyId: string; documentId: string; clientId: string; warehouseId: string }
  empresaB: { userId: string; companyId: string; documentId: string; clientId: string; warehouseId: string }
  generatedAt: string
}

async function main() {
  const url = process.env.SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY

  if (!url || !key) {
    console.error('❌ Faltan SUPABASE_URL o SUPABASE_SERVICE_ROLE_KEY en env')
    process.exit(1)
  }

  if (url.includes(PROD_URL_FRAGMENT)) {
    console.error('❌ ABORTANDO: SUPABASE_URL apunta a producción. Seed solo en staging/local.')
    process.exit(2)
  }

  const supabase = createClient(url, key, { auth: { persistSession: false } })

  console.log('🌱 Seed test arrancando contra:', url.replace(/\/\/(.+?)\./, '//****.'))

  // 1. Empresas
  const empresaA = await upsertCompany(supabase, {
    name: 'TORQUETOOLS-TEST',
    legal_name: 'TORQUETOOLS-TEST S.L.',
    tax_id: 'B-99999001',
    country: 'ES',
    currency: 'EUR',
  })
  const empresaB = await upsertCompany(supabase, {
    name: 'BUSCATOOLS-TEST',
    legal_name: 'BUSCATOOLS-TEST S.A.',
    tax_id: '30-99999002-0',
    country: 'AR',
    currency: 'ARS',
  })
  console.log(`✓ Empresas: A=${empresaA.id.slice(0, 8)}… B=${empresaB.id.slice(0, 8)}…`)

  // 2. Productos compartidos (SKU es la clave natural)
  await upsertProducts(supabase, [
    { sku: 'SEED-001', name: 'Llave de torque seed 001', brand: 'GEDORE', price_list: 100 },
    { sku: 'SEED-002', name: 'Llave de torque seed 002', brand: 'GEDORE', price_list: 250 },
    { sku: 'SEED-003', name: 'Atornillador seed 003', brand: 'FEIN', price_list: 75.5 },
    { sku: 'SEED-004', name: 'Atornillador seed 004', brand: 'FEIN', price_list: 320 },
    { sku: 'SEED-005', name: 'Vaso impacto seed 005', brand: 'GEDORE', price_list: 18.9 },
    { sku: 'SEED-006', name: 'Carraca seed 006', brand: 'GEDORE', price_list: 88.4 },
    { sku: 'SEED-007', name: 'Multiplicador seed 007', brand: 'GEDORE', price_list: 285 },
    { sku: 'SEED-008', name: 'Torquímetro seed 008', brand: 'TOHNICHI', price_list: 412.5 },
    { sku: 'SEED-009', name: 'Torquímetro seed 009', brand: 'TOHNICHI', price_list: 190 },
    { sku: 'SEED-010', name: 'Cabezal angular seed 010', brand: 'FEIN', price_list: 1369 },
  ])
  console.log('✓ 10 productos seed cargados/actualizados')

  // 3. Warehouses (1 por empresa, requerido por algunos triggers)
  const whA = await upsertWarehouse(supabase, empresaA.id, { name: 'Depósito Central A', code: 'WH-TT-TEST' })
  const whB = await upsertWarehouse(supabase, empresaB.id, { name: 'Depósito Central B', code: 'WH-BT-TEST' })

  // 4. Clientes (5 por empresa)
  const clientA = await upsertClient(supabase, { company_name: 'Cliente Seed A1', tax_id: 'B-77777001', country: 'ES' })
  const clientB = await upsertClient(supabase, { company_name: 'Cliente Seed B1', tax_id: '30-77777002-0', country: 'AR' })
  for (let i = 2; i <= 5; i++) {
    await upsertClient(supabase, { company_name: `Cliente Seed A${i}`, tax_id: `B-7777700${i}`, country: 'ES' })
    await upsertClient(supabase, { company_name: `Cliente Seed B${i}`, tax_id: `30-7777700${i}-0`, country: 'AR' })
  }
  console.log('✓ 10 clientes seed cargados (5 por empresa)')

  // 5. Usuarios (uno por empresa, rol admin)
  const userA = await upsertUser(supabase, empresaA.id, {
    email: process.env.E2E_USER_A_EMAIL ?? 'e2e-a@mocciaro.test',
    password: process.env.E2E_USER_A_PASSWORD ?? 'changeme-A-seed-2026',
    full_name: 'E2E Test User A',
  })
  const userB = await upsertUser(supabase, empresaB.id, {
    email: process.env.E2E_USER_B_EMAIL ?? 'e2e-b@mocciaro.test',
    password: process.env.E2E_USER_B_PASSWORD ?? 'changeme-B-seed-2026',
    full_name: 'E2E Test User B',
  })
  console.log(`✓ Usuarios: A=${userA.email} B=${userB.email}`)

  // 6. Cotización draft por empresa (para tests cross-company)
  const docA = await createDraftQuote(supabase, {
    company_id: empresaA.id,
    counterparty_id: clientA.id,
    counterparty_name: 'Cliente Seed A1',
    currency_code: 'EUR',
    created_by: userA.id,
  })
  const docB = await createDraftQuote(supabase, {
    company_id: empresaB.id,
    counterparty_id: clientB.id,
    counterparty_name: 'Cliente Seed B1',
    currency_code: 'ARS',
    created_by: userB.id,
  })

  // 7. Guardar contexto
  const ctx: SeedContext = {
    empresaA: { userId: userA.id, companyId: empresaA.id, documentId: docA.id, clientId: clientA.id, warehouseId: whA.id },
    empresaB: { userId: userB.id, companyId: empresaB.id, documentId: docB.id, clientId: clientB.id, warehouseId: whB.id },
    generatedAt: new Date().toISOString(),
  }

  mkdirSync(dirname(FIXTURE_PATH), { recursive: true })
  writeFileSync(FIXTURE_PATH, JSON.stringify(ctx, null, 2))
  console.log('✅ Seed listo. Contexto guardado en:', FIXTURE_PATH)
}

// ─────────────────────────────────────────────────────────────────────
// Helpers — implementación funcional
// ─────────────────────────────────────────────────────────────────────

interface CompanyInput {
  name: string
  legal_name: string
  tax_id: string
  country: string
  currency: string
}
interface CompanyRow { id: string; name: string; tax_id: string }

async function upsertCompany(db: SupabaseLike, opts: CompanyInput): Promise<CompanyRow> {
  const { data: existing } = await db
    .from('tt_companies')
    .select('id, name, tax_id')
    .eq('tax_id', opts.tax_id)
    .maybeSingle()

  if (existing) return existing as CompanyRow

  const { data, error } = await db
    .from('tt_companies')
    .insert({
      name: opts.name,
      legal_name: opts.legal_name,
      tax_id: opts.tax_id,
      country: opts.country,
      currency: opts.currency,
      is_active: true,
    })
    .select('id, name, tax_id')
    .single()

  if (error || !data) throw new Error(`upsertCompany falló: ${error?.message ?? 'unknown'}`)
  return data as CompanyRow
}

interface ProductInput { sku: string; name: string; brand: string; price_list: number }

async function upsertProducts(db: SupabaseLike, items: ProductInput[]): Promise<void> {
  for (const p of items) {
    const { data: existing } = await db
      .from('tt_products')
      .select('id')
      .eq('sku', p.sku)
      .maybeSingle()

    if (existing) {
      await db
        .from('tt_products')
        .update({ name: p.name, brand: p.brand, price_list: p.price_list, updated_at: new Date().toISOString() })
        .eq('id', (existing as { id: string }).id)
    } else {
      const { error } = await db.from('tt_products').insert({
        sku: p.sku,
        name: p.name,
        brand: p.brand,
        price_list: p.price_list,
        price_cost: p.price_list * 0.5,
        price_currency: 'EUR',
        is_active: true,
      })
      if (error) throw new Error(`upsertProducts(${p.sku}) falló: ${error.message}`)
    }
  }
}

interface WarehouseRow { id: string; name: string; code: string }

async function upsertWarehouse(db: SupabaseLike, companyId: string, opts: { name: string; code: string }): Promise<WarehouseRow> {
  const { data: existing } = await db
    .from('tt_warehouses')
    .select('id, name, code')
    .eq('code', opts.code)
    .maybeSingle()
  if (existing) return existing as WarehouseRow

  const { data, error } = await db
    .from('tt_warehouses')
    .insert({ name: opts.name, code: opts.code, company_id: companyId, is_active: true })
    .select('id, name, code')
    .single()
  if (error || !data) throw new Error(`upsertWarehouse falló: ${error?.message ?? 'unknown'}`)
  return data as WarehouseRow
}

interface ClientInput { company_name: string; tax_id: string; country: string }
interface ClientRow { id: string; company_name: string }

async function upsertClient(db: SupabaseLike, opts: ClientInput): Promise<ClientRow> {
  const { data: existing } = await db
    .from('tt_clients')
    .select('id, company_name')
    .eq('tax_id', opts.tax_id)
    .maybeSingle()
  if (existing) return existing as ClientRow

  const { data, error } = await db
    .from('tt_clients')
    .insert({
      company_name: opts.company_name,
      legal_name: opts.company_name,
      tax_id: opts.tax_id,
      country: opts.country,
      type: 'empresa',
      is_active: true,
    })
    .select('id, company_name')
    .single()
  if (error || !data) throw new Error(`upsertClient falló: ${error?.message ?? 'unknown'}`)
  return data as ClientRow
}

interface UserInput { email: string; password: string; full_name: string }
interface UserRow { id: string; email: string }

async function upsertUser(db: SupabaseLike, companyId: string, opts: UserInput): Promise<UserRow> {
  // Buscar tt_user existente por email
  const { data: existing } = await db
    .from('tt_users')
    .select('id, email, auth_id')
    .eq('email', opts.email)
    .maybeSingle()

  if (existing) {
    // Asegurar que está vinculado a la empresa correcta
    const { data: link } = await db
      .from('tt_user_companies')
      .select('id')
      .eq('user_id', (existing as { id: string }).id)
      .eq('company_id', companyId)
      .maybeSingle()
    if (!link) {
      await db.from('tt_user_companies').insert({ user_id: (existing as { id: string }).id, company_id: companyId })
    }
    return existing as UserRow
  }

  // Crear en Supabase Auth
  const { data: auth, error: authErr } = await db.auth.admin.createUser({
    email: opts.email,
    password: opts.password,
    email_confirm: true,
  })
  if (authErr || !auth.user) throw new Error(`upsertUser auth.createUser falló: ${authErr?.message}`)

  // Insertar en tt_users
  const { data: ttUser, error: ttErr } = await db
    .from('tt_users')
    .insert({
      auth_id: auth.user.id,
      email: opts.email,
      full_name: opts.full_name,
      role: 'admin',
      default_company_id: companyId,
      is_active: true,
    })
    .select('id, email')
    .single()
  if (ttErr || !ttUser) throw new Error(`upsertUser tt_users.insert falló: ${ttErr?.message}`)

  // Vincular a empresa
  await db.from('tt_user_companies').insert({ user_id: (ttUser as { id: string }).id, company_id: companyId })

  return ttUser as UserRow
}

interface DocInput {
  company_id: string
  counterparty_id: string
  counterparty_name: string
  currency_code: string
  created_by: string
}
interface DocRow { id: string }

async function createDraftQuote(db: SupabaseLike, opts: DocInput): Promise<DocRow> {
  // Idempotencia: si ya hay un quote draft con esta combinación + tag seed,
  // devolverlo. Si no, crear.
  const { data: existing } = await db
    .from('tt_documents')
    .select('id')
    .eq('company_id', opts.company_id)
    .eq('doc_type', 'quote')
    .eq('status', 'draft')
    .contains('metadata', { seed: 'e2e-test-2026' })
    .maybeSingle()
  if (existing) return existing as DocRow

  const { data, error } = await db
    .from('tt_documents')
    .insert({
      company_id: opts.company_id,
      doc_type: 'quote',
      direction: 'sales',
      status: 'draft',
      currency_code: opts.currency_code,
      counterparty_type: 'customer',
      counterparty_id: opts.counterparty_id,
      counterparty_name: opts.counterparty_name,
      created_by: opts.created_by,
      metadata: { seed: 'e2e-test-2026' },
    })
    .select('id')
    .single()
  if (error || !data) throw new Error(`createDraftQuote falló: ${error?.message ?? 'unknown'}`)
  return data as DocRow
}

main().catch((err: Error) => {
  console.error('❌ Seed falló:', err.message)
  process.exit(1)
})
