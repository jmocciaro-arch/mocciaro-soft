/**
 * Full-cycle E2E test — Fase 0.1 del PLAN-REFACTOR
 *
 * Cubre el happy path completo del flujo comercial:
 *   login → cotización → emitir → derivar a pedido → emitir →
 *   derivar a albarán → emitir → derivar a factura → emitir →
 *   registrar cobro → status `paid`
 *
 * Mismo test corre en empresa A y empresa B en paralelo.
 *
 * REQUIERE:
 * - DB con seed reproducible (`npm run seed:test` antes).
 * - Credenciales E2E_USER_A_EMAIL / E2E_USER_B_EMAIL en .env.local
 *   con sus respectivas passwords.
 * - E2E_BASE_URL apuntando a staging (no a producción real).
 *
 * STATUS: ESQUELETO. Los `test.skip()` quedan hasta que se complete:
 *   1. seed:test reproducible
 *   2. helpers de auth + selectors estables
 *   3. data-testid en componentes clave
 */

import { test, expect, type Page } from '@playwright/test'

const COMPANIES = [
  {
    name: 'Empresa A — TORQUETOOLS',
    email: process.env.E2E_USER_A_EMAIL,
    password: process.env.E2E_USER_A_PASSWORD,
  },
  {
    name: 'Empresa B — BUSCATOOLS',
    email: process.env.E2E_USER_B_EMAIL,
    password: process.env.E2E_USER_B_PASSWORD,
  },
] as const

const HAS_CREDENTIALS = COMPANIES.every((c) => c.email && c.password)

test.describe('Full sales cycle (cotización → cobro)', () => {
  test.beforeAll(() => {
    if (!HAS_CREDENTIALS) {
      console.warn('[full-cycle] Skipping suite: faltan credenciales E2E_USER_*')
    }
  })

  for (const company of COMPANIES) {
    test.describe(company.name, () => {
      test.skip(!HAS_CREDENTIALS, 'Falta seed + credenciales E2E')

      test('login → quote → sales_order → delivery_note → invoice → paid', async ({ page }) => {
        await login(page, company.email!, company.password!)

        // 1. Crear cotización
        const quoteCode = await createQuote(page, {
          clientName: 'Cliente Seed 1',
          items: [
            { sku: 'SEED-001', qty: 5, unit_price: 100 },
            { sku: 'SEED-002', qty: 3, unit_price: 250 },
          ],
        })
        expect(quoteCode).toMatch(/^[A-Z]+-/)

        // 2. Emitir
        await issueDocument(page, quoteCode)
        await expect(page.getByTestId('doc-status')).toContainText(/issued|emitido/i)

        // 3. Derivar a pedido
        const orderCode = await deriveDocument(page, quoteCode, 'sales_order')
        await issueDocument(page, orderCode)

        // 4. Derivar a albarán
        const deliveryCode = await deriveDocument(page, orderCode, 'delivery_note')
        await issueDocument(page, deliveryCode)
        await expect(page.getByTestId('doc-status')).toContainText(/delivered|entregado/i)

        // 5. Derivar a factura
        const invoiceCode = await deriveDocument(page, deliveryCode, 'invoice')
        await issueDocument(page, invoiceCode)

        // 6. Registrar cobro completo
        await registerPayment(page, invoiceCode, /* amount: total */)
        await expect(page.getByTestId('doc-status')).toContainText(/paid|cobrado/i)
      })
    })
  }
})

// ─────────────────────────────────────────────────────────────────────
// Helpers — implementar en Fase 0.1 (selectores estables vía data-testid)
// ─────────────────────────────────────────────────────────────────────

async function login(page: Page, email: string, password: string) {
  await page.goto('/login')
  await page.getByLabel(/correo|email/i).fill(email)
  await page.getByLabel(/contraseña|password/i).fill(password)
  await page.getByRole('button', { name: /entrar|login|iniciar/i }).click()
  await page.waitForURL(/\/(dashboard|cotizador|inicio)/, { timeout: 15000 })
}

async function createQuote(
  page: Page,
  _opts: { clientName: string; items: Array<{ sku: string; qty: number; unit_price: number }> }
): Promise<string> {
  // TODO: implementar — abrir /cotizador → Nueva → seleccionar cliente →
  //       agregar items → guardar draft → leer code del header
  throw new Error('TODO: implementar createQuote helper en Fase 0.1')
}

async function issueDocument(page: Page, _docCode: string) {
  // TODO: navegar al detalle, click "Emitir", confirmar modal, esperar status
  throw new Error('TODO: implementar issueDocument helper en Fase 0.1')
}

async function deriveDocument(page: Page, _fromCode: string, _toType: string): Promise<string> {
  // TODO: click "Derivar" → seleccionar tipo destino → confirmar → leer code nuevo
  throw new Error('TODO: implementar deriveDocument helper en Fase 0.1')
}

async function registerPayment(page: Page, _invoiceCode: string) {
  // TODO: abrir factura → tab "Pagos" → "Registrar pago" → completar → guardar
  throw new Error('TODO: implementar registerPayment helper en Fase 0.1')
}
