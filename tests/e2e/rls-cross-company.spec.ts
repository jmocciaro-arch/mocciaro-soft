/**
 * RLS cross-company E2E test — Fase 0.2 del PLAN-REFACTOR
 *
 * Verifica que un usuario de empresa A NO puede leer ni modificar
 * recursos de empresa B vía ningún endpoint /api/*.
 *
 * Si algún endpoint olvida filtrar por company_id → este test detecta
 * el data leak antes de llegar a producción.
 *
 * REQUIERE:
 * - DB con seed: 2 empresas, 1 user por empresa, 1 documento por empresa.
 * - Credenciales E2E_USER_A_* y E2E_USER_B_* en .env.local.
 *
 * EL TEST DEBE FALLAR (ROJO) ANTES DE FASE 1, porque hoy NO existe
 * wrapper único `withCompanyFilter()` server. Si pasa de entrada,
 * algo está mal en el seed o el test.
 *
 * STATUS: ESQUELETO. La lista de endpoints a auditar la genera el
 * helper `discoverEndpoints()` en CI; por ahora hardcodeamos un
 * subset crítico.
 */

import { test, expect, type APIRequestContext } from '@playwright/test'

interface SeedContext {
  empresaA: { userId: string; companyId: string; documentId: string; clientId: string }
  empresaB: { userId: string; companyId: string; documentId: string; clientId: string }
}

const HAS_CREDENTIALS = !!(
  process.env.E2E_USER_A_EMAIL &&
  process.env.E2E_USER_A_PASSWORD &&
  process.env.E2E_USER_B_EMAIL &&
  process.env.E2E_USER_B_PASSWORD
)

// Endpoints críticos que SIEMPRE deben filtrar por company_id.
// Lista no exhaustiva — completar al cubrir 100% en Fase 0.2.
const CRITICAL_ENDPOINTS = [
  // GET — leer recurso de otra empresa
  { method: 'GET', path: (ctx: SeedContext) => `/api/documents/${ctx.empresaB.documentId}` },
  { method: 'GET', path: (ctx: SeedContext) => `/api/documents/${ctx.empresaB.documentId}/lines` },
  { method: 'GET', path: (ctx: SeedContext) => `/api/documents/${ctx.empresaB.documentId}/events` },
  { method: 'GET', path: (ctx: SeedContext) => `/api/documents/${ctx.empresaB.documentId}/pdf` },
  { method: 'GET', path: (ctx: SeedContext) => `/api/clients/${ctx.empresaB.clientId}` },
  { method: 'GET', path: (ctx: SeedContext) => `/api/companies/${ctx.empresaB.companyId}/documents` },

  // PATCH/POST — modificar recurso de otra empresa
  { method: 'PATCH', path: (ctx: SeedContext) => `/api/documents/${ctx.empresaB.documentId}` },
  { method: 'POST', path: (ctx: SeedContext) => `/api/documents/${ctx.empresaB.documentId}/issue` },
  { method: 'POST', path: (ctx: SeedContext) => `/api/documents/${ctx.empresaB.documentId}/cancel` },
  { method: 'POST', path: (ctx: SeedContext) => `/api/documents/${ctx.empresaB.documentId}/derive` },

  // DELETE
  { method: 'DELETE', path: (ctx: SeedContext) => `/api/documents/${ctx.empresaB.documentId}` },
] as const

test.describe('RLS cross-company isolation', () => {
  test.skip(!HAS_CREDENTIALS, 'Falta seed + credenciales E2E')

  let ctx: SeedContext
  let userARequest: APIRequestContext

  test.beforeAll(async ({ playwright, baseURL }) => {
    ctx = await loadSeedContext()
    userARequest = await playwright.request.newContext({
      baseURL,
      extraHTTPHeaders: await loginAndGetHeaders(
        playwright,
        baseURL!,
        process.env.E2E_USER_A_EMAIL!,
        process.env.E2E_USER_A_PASSWORD!
      ),
    })
  })

  test.afterAll(async () => {
    await userARequest?.dispose()
  })

  for (const endpoint of CRITICAL_ENDPOINTS) {
    test(`User A cannot ${endpoint.method} resource of empresa B`, async () => {
      const path = endpoint.path(ctx)
      const response = await userARequest.fetch(path, {
        method: endpoint.method,
        data:
          endpoint.method === 'PATCH' || endpoint.method === 'POST'
            ? { dummy: 'should-not-apply' }
            : undefined,
      })

      // Debe responder 401, 403 o 404. NUNCA 200.
      expect(
        [401, 403, 404].includes(response.status()),
        `Endpoint ${endpoint.method} ${path} respondió ${response.status()} (debería ser 401/403/404). DATA LEAK potencial.`
      ).toBe(true)

      // Si por algún motivo respondió 200, el body NO debe contener el documento de empresa B.
      if (response.status() === 200) {
        const body = await response.text()
        expect(body).not.toContain(ctx.empresaB.documentId)
      }
    })
  }

  test('Mass-listing endpoints no filtran por company_id correctamente', async () => {
    // GET /api/documents debería retornar SOLO docs de empresa A
    const r = await userARequest.get('/api/documents?limit=100')
    expect(r.ok()).toBe(true)
    const data = await r.json() as { id: string; company_id: string }[]
    const fromOtherCompany = data.filter((d) => d.company_id !== ctx.empresaA.companyId)
    expect(
      fromOtherCompany.length,
      `Listado /api/documents devolvió ${fromOtherCompany.length} docs de OTRAS empresas`
    ).toBe(0)
  })
})

// ─────────────────────────────────────────────────────────────────────
// Helpers — implementar en Fase 0.2
// ─────────────────────────────────────────────────────────────────────

async function loadSeedContext(): Promise<SeedContext> {
  // TODO: leer IDs de seed desde tests/e2e/fixtures/seed-context.json
  //       que genera npm run seed:test
  throw new Error('TODO: implementar loadSeedContext en Fase 0.2 (lee fixtures del seed)')
}

async function loginAndGetHeaders(
  _playwright: unknown,
  _baseURL: string,
  _email: string,
  _password: string
): Promise<Record<string, string>> {
  // TODO: hacer login programático contra Supabase Auth, devolver
  //       cookies/Authorization que después se pasan en cada fetch
  throw new Error('TODO: implementar loginAndGetHeaders en Fase 0.2')
}
