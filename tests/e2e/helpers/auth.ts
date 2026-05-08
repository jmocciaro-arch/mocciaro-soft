/**
 * Helpers de autenticación para tests E2E.
 *
 * Login programático contra Supabase Auth + persiste cookies en el
 * BrowserContext de Playwright. Requiere usuarios creados por
 * `npm run seed:test` (E2E_USER_A_*, E2E_USER_B_*).
 */

import type { Page, BrowserContext } from '@playwright/test'

export async function login(page: Page, email: string, password: string) {
  await page.goto('/login')

  // Esperar a que se renderice el form (acepta varios labels comunes)
  const emailInput = page.locator('input[type="email"], input[name="email"]').first()
  await emailInput.waitFor({ state: 'visible', timeout: 10000 })
  await emailInput.fill(email)

  const passInput = page.locator('input[type="password"], input[name="password"]').first()
  await passInput.fill(password)

  // Click en cualquier botón de submit del form de login
  await page
    .locator('button[type="submit"], button:has-text(/entrar|login|iniciar/i)')
    .first()
    .click()

  // El layout dashboard redirige a /dashboard, /cotizador o /inicio según rol
  await page.waitForURL(/\/(dashboard|cotizador|inicio|admin)/, { timeout: 20000 })
}

export async function logout(page: Page) {
  // Botón de logout suele estar en el sidebar o en el avatar dropdown
  await page.evaluate(() => {
    document.cookie.split(';').forEach((c) => {
      document.cookie = c.replace(/^ +/, '').replace(/=.*/, '=;expires=Thu, 01 Jan 1970 00:00:00 GMT;path=/')
    })
  })
  await page.goto('/login')
}

export async function ensureAuthenticated(context: BrowserContext, page: Page) {
  const cookies = await context.cookies()
  const hasSb = cookies.some((c) => c.name.includes('sb-'))
  if (!hasSb) {
    throw new Error('No hay sesión activa. Llamá login() primero o usá storageState fixture.')
  }
  await page.goto('/dashboard')
}
