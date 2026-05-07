#!/usr/bin/env tsx
/**
 * Seed reproducible para tests E2E — Fase 0.1 del PLAN-REFACTOR.
 *
 * Crea en una DB limpia (staging o local):
 *   - 2 empresas (A: TORQUETOOLS-TEST, B: BUSCATOOLS-TEST)
 *   - 5 clientes por empresa
 *   - 10 productos compartidos por SKU
 *   - 3 usuarios con distintos roles (admin, ventas, lectura)
 *   - 1 cotización draft de ejemplo por empresa (para tests cross-company)
 *
 * Escribe los IDs generados a `tests/e2e/fixtures/seed-context.json`
 * para que los specs E2E los carguen sin hardcodearlos.
 *
 * REQUIERE en .env.local:
 *   SUPABASE_URL                — URL del proyecto staging (NUNCA prod)
 *   SUPABASE_SERVICE_ROLE_KEY   — service role para bypass de RLS
 *
 * USO:
 *   npm run seed:test
 *
 * SAFETY:
 *   - Aborta si SUPABASE_URL apunta al proyecto de producción.
 *   - Idempotente: si ya existe, actualiza en vez de duplicar.
 *
 * STATUS: ESQUELETO. Las funciones de creación están como TODO; el
 * flujo (entrada/salida y safety check) sí está implementado.
 */

import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { writeFileSync, mkdirSync } from 'node:fs'
import { dirname, resolve } from 'node:path'

// Tipo permisivo para los stubs — implementación real tipará con
// el schema generado.
type SupabaseLike = SupabaseClient

const PROD_URL_FRAGMENT = 'wsjfbchxspylslosdleb' // proyecto producción real
const FIXTURE_PATH = resolve(__dirname, '..', 'tests', 'e2e', 'fixtures', 'seed-context.json')

interface SeedContext {
  empresaA: { userId: string; companyId: string; documentId: string; clientId: string }
  empresaB: { userId: string; companyId: string; documentId: string; clientId: string }
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

  console.log('🌱 Seed test arrancando contra:', url)

  // 1. Empresas
  const empresaA = await upsertCompany(supabase, { code: 'TT-TEST', name: 'TORQUETOOLS-TEST' })
  const empresaB = await upsertCompany(supabase, { code: 'BT-TEST', name: 'BUSCATOOLS-TEST' })

  // 2. Productos (compartidos por SKU)
  await upsertProducts(supabase, [
    { sku: 'SEED-001', name: 'Producto seed 001', unit_price: 100 },
    { sku: 'SEED-002', name: 'Producto seed 002', unit_price: 250 },
    { sku: 'SEED-003', name: 'Producto seed 003', unit_price: 75.5 },
    // ... completar a 10 en Fase 0.1
  ])

  // 3. Clientes por empresa (5 c/u)
  const clientA = await upsertClient(supabase, empresaA.id, { name: 'Cliente Seed 1' })
  const clientB = await upsertClient(supabase, empresaB.id, { name: 'Cliente Seed 1' })

  // 4. Usuarios (admin + ventas + lectura) — usa Supabase Auth admin API
  const userA = await upsertUser(supabase, empresaA.id, {
    email: process.env.E2E_USER_A_EMAIL || 'e2e-a@mocciaro.test',
    password: process.env.E2E_USER_A_PASSWORD || 'changeme-A',
    role: 'admin',
  })
  const userB = await upsertUser(supabase, empresaB.id, {
    email: process.env.E2E_USER_B_EMAIL || 'e2e-b@mocciaro.test',
    password: process.env.E2E_USER_B_PASSWORD || 'changeme-B',
    role: 'admin',
  })

  // 5. 1 cotización draft por empresa (para tests cross-company)
  const docA = await createDraftQuote(supabase, empresaA.id, clientA.id)
  const docB = await createDraftQuote(supabase, empresaB.id, clientB.id)

  // 6. Guardar contexto
  const ctx: SeedContext = {
    empresaA: { userId: userA.id, companyId: empresaA.id, documentId: docA.id, clientId: clientA.id },
    empresaB: { userId: userB.id, companyId: empresaB.id, documentId: docB.id, clientId: clientB.id },
    generatedAt: new Date().toISOString(),
  }

  mkdirSync(dirname(FIXTURE_PATH), { recursive: true })
  writeFileSync(FIXTURE_PATH, JSON.stringify(ctx, null, 2))
  console.log('✅ Seed listo. Contexto guardado en:', FIXTURE_PATH)
}

// ─────────────────────────────────────────────────────────────────────
// Helpers — implementar en Fase 0.1
// ─────────────────────────────────────────────────────────────────────

interface CompanyRow { id: string; code: string; name: string }
interface ClientRow { id: string; name: string }
interface UserRow { id: string; email: string }
interface DocRow { id: string }

async function upsertCompany(_db: SupabaseLike, _opts: { code: string; name: string }): Promise<CompanyRow> {
  // TODO: SELECT por code, si no existe INSERT, devolver { id, code, name }
  throw new Error('TODO Fase 0.1: implementar upsertCompany')
}

async function upsertProducts(_db: SupabaseLike, _items: Array<{ sku: string; name: string; unit_price: number }>): Promise<void> {
  // TODO: ON CONFLICT (sku) DO UPDATE
  throw new Error('TODO Fase 0.1: implementar upsertProducts')
}

async function upsertClient(_db: SupabaseLike, _companyId: string, _opts: { name: string }): Promise<ClientRow> {
  throw new Error('TODO Fase 0.1: implementar upsertClient')
}

async function upsertUser(_db: SupabaseLike, _companyId: string, _opts: { email: string; password: string; role: string }): Promise<UserRow> {
  // TODO: supabase.auth.admin.createUser + insertar en tt_user_companies
  throw new Error('TODO Fase 0.1: implementar upsertUser')
}

async function createDraftQuote(_db: SupabaseLike, _companyId: string, _clientId: string): Promise<DocRow> {
  // TODO: INSERT en tt_documents (doc_type=quote, status=draft) con counterparty
  throw new Error('TODO Fase 0.1: implementar createDraftQuote')
}

main().catch((err) => {
  console.error('❌ Seed falló:', err)
  process.exit(1)
})
