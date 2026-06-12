/**
 * E2E Playwright — Next-Step Suggester F1 (cotizaciones).
 *
 * Pre-requisitos:
 *  - E2E_USER_EMAIL + E2E_USER_PASSWORD seteados (típicamente jmocciaro@gmail.com)
 *  - E2E_QUOTATION_ID con un UUID de una cotización en estado "aceptada"
 *    (para que el chip sugerido sea "Convertir a pedido")
 *
 * Si falta cualquiera de esos vars el test se skipea con .skip.
 */
import { test, expect } from '@playwright/test'
import { login } from './helpers/auth'

const EMAIL = process.env.E2E_USER_EMAIL
const PASSWORD = process.env.E2E_USER_PASSWORD
const QUOTE_ID = process.env.E2E_QUOTATION_ID

const HAS_FIXTURES = !!(EMAIL && PASSWORD && QUOTE_ID)

test.describe('Next-Step Suggester — Cotización', () => {
  test.skip(
    !HAS_FIXTURES,
    'Falta E2E_USER_EMAIL / E2E_USER_PASSWORD / E2E_QUOTATION_ID — seedeá primero'
  )

  test('panel renderiza 4 chips funcionales + 2 placeholders + sugerencia', async ({
    page,
  }) => {
    await login(page, EMAIL!, PASSWORD!)
    await page.goto(`/documentos/${QUOTE_ID}`)

    // Esperar a que aparezca el panel
    const panel = page.locator('section[aria-label="Próximo paso"]')
    await expect(panel).toBeVisible({ timeout: 15000 })

    // 4 chips funcionales (preview, send, duplicate, convert)
    await expect(panel.getByRole('button', { name: /previsualizar/i })).toBeVisible()
    await expect(panel.getByRole('button', { name: /enviar por email/i })).toBeVisible()
    await expect(panel.getByRole('button', { name: /duplicar/i })).toBeVisible()
    await expect(panel.getByRole('button', { name: /convertir a pedido/i })).toBeVisible()

    // 2 placeholders disabled
    const followup = panel.getByRole('button', { name: /programar seguimiento/i })
    await expect(followup).toBeVisible()
    await expect(followup).toBeDisabled()

    const note = panel.getByRole('button', { name: /agregar nota/i })
    await expect(note).toBeVisible()
    await expect(note).toBeDisabled()
  })

  test('keyboard "1" dispara preview_pdf y abre PDF en nueva tab', async ({
    page,
    context,
  }) => {
    await login(page, EMAIL!, PASSWORD!)
    await page.goto(`/documentos/${QUOTE_ID}`)

    const panel = page.locator('section[aria-label="Próximo paso"]')
    await expect(panel).toBeVisible({ timeout: 15000 })

    const newTabPromise = context.waitForEvent('page')
    // Foco en el body para que el shortcut no termine en un input
    await page.locator('body').click()
    await page.keyboard.press('1')
    const newTab = await newTabPromise
    expect(newTab.url()).toContain(`/api/documents/${QUOTE_ID}/pdf`)
    await newTab.close()
  })
})
