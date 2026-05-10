/**
 * Full-cycle E2E test — Fase 0.1 del PLAN-REFACTOR
 *
 * Cubre el happy path completo del flujo comercial:
 *   login → cotización → emitir → derivar a pedido → emitir →
 *   derivar a albarán → emitir → derivar a factura → emitir →
 *   registrar cobro → status `paid`
 *
 * Mismo test corre para 2 empresas en paralelo (diferentes user accounts).
 *
 * REQUIERE:
 * - DB con seed reproducible (`npm run seed:test` antes).
 * - Credenciales E2E_USER_A_* y E2E_USER_B_* en .env.local.
 * - E2E_BASE_URL apuntando a staging (no producción).
 *
 * Si falta seed o credenciales, los tests se skipean y log warning.
 */

import { test, expect } from '@playwright/test'
import { login } from './helpers/auth'
import {
  createQuote,
  issueDocument,
  deriveDocument,
  registerPayment,
} from './helpers/document-flow'

const COMPANIES = [
  {
    name: 'Empresa A — TORQUETOOLS-TEST',
    email: process.env.E2E_USER_A_EMAIL,
    password: process.env.E2E_USER_A_PASSWORD,
    seedClient: 'Cliente Seed A1',
  },
  {
    name: 'Empresa B — BUSCATOOLS-TEST',
    email: process.env.E2E_USER_B_EMAIL,
    password: process.env.E2E_USER_B_PASSWORD,
    seedClient: 'Cliente Seed B1',
  },
] as const

const HAS_CREDENTIALS = COMPANIES.every((c) => c.email && c.password)

test.describe('Full sales cycle (cotización → cobro)', () => {
  test.beforeAll(() => {
    if (!HAS_CREDENTIALS) {
      console.warn('[full-cycle] Skipping suite: faltan credenciales E2E_USER_A_*/B_*')
    }
  })

  for (const company of COMPANIES) {
    test.describe(company.name, () => {
      test.skip(!HAS_CREDENTIALS, 'Falta seed + credenciales E2E')

      test('login → quote → sales_order → delivery_note → invoice → paid', async ({ page }) => {
        // 1. Login
        await login(page, company.email!, company.password!)

        // 2. Crear cotización
        const quoteCode = await createQuote(page, {
          clientName: company.seedClient,
          productSkus: ['SEED-001', 'SEED-002'],
        })
        expect(quoteCode).toMatch(/^[A-Z]+/)

        // 3. Emitir cotización
        await issueDocument(page)

        // 4. Derivar a pedido
        const orderCode = await deriveDocument(page, 'sales_order')
        expect(orderCode).toMatch(/^[A-Z]+/)
        await issueDocument(page)

        // 5. Derivar a albarán
        const deliveryCode = await deriveDocument(page, 'delivery_note')
        expect(deliveryCode).toMatch(/^[A-Z]+/)
        await issueDocument(page)
        await expect(page.getByTestId('doc-status')).toContainText(/delivered|entregad/i)

        // 6. Derivar a factura
        const invoiceCode = await deriveDocument(page, 'invoice')
        expect(invoiceCode).toMatch(/^[A-Z]+/)
        await issueDocument(page)

        // 7. Registrar cobro completo
        await registerPayment(page, { method: 'transfer' })
        await expect(page.getByTestId('doc-status')).toContainText(/paid|cobrad|pagad/i)
      })
    })
  }
})
