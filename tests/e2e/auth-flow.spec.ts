import { test, expect } from '@playwright/test'

/**
 * Tests autenticados de flujos críticos.
 *
 * Skipped por default — requieren credenciales en env vars:
 *   E2E_USER_EMAIL=...
 *   E2E_USER_PASSWORD=...
 *
 * NO usar credenciales de producción reales acá. Crear un usuario
 * dedicado de E2E en Supabase con permisos limitados.
 *
 * Para correr:
 *   E2E_USER_EMAIL=test@example.com E2E_USER_PASSWORD=... npm run test:e2e
 */

const E2E_EMAIL = process.env.E2E_USER_EMAIL
const E2E_PASSWORD = process.env.E2E_USER_PASSWORD
const skipAuth = !E2E_EMAIL || !E2E_PASSWORD

test.describe('Cadena de venta E2E (requiere auth)', () => {
  test.skip(skipAuth, 'Sin E2E_USER_EMAIL/E2E_USER_PASSWORD configurado')

  test.beforeEach(async ({ page }) => {
    await page.goto('/login')
    // Asumimos login con email/password (no Google OAuth en tests)
    const emailInput = page.locator('input[type="email"]')
    if (await emailInput.isVisible()) {
      await emailInput.fill(E2E_EMAIL!)
      await page.locator('input[type="password"]').fill(E2E_PASSWORD!)
      await page.locator('button[type="submit"]').click()
      await page.waitForURL(/\/dashboard|\/cotizador|\/$/, { timeout: 15000 })
    }
  })

  test('dashboard carga con company selector visible', async ({ page }) => {
    await page.goto('/dashboard')
    // CompanySelector en el TopBar
    await expect(page.locator('[data-testid="company-selector"], text=/Multi-empresa/i').first()).toBeVisible({ timeout: 10000 })
  })

  test('listado de cotizaciones carga sin error #310', async ({ page }) => {
    await page.goto('/cotizador')
    // Click "Guardadas"
    const guardadas = page.locator('text=Guardadas')
    if (await guardadas.isVisible()) {
      await guardadas.click()
      await expect(page).not.toHaveURL(/Reload|page couldn't load/)
      // No debe aparecer pantalla negra de crash
      const errorText = page.locator('text=/This page couldn|Reload to try/i')
      await expect(errorText).not.toBeVisible()
    }
  })

  test('listado de clientes carga al menos 1 fila', async ({ page }) => {
    await page.goto('/clientes')
    // Esperar la tabla con filas
    await page.waitForSelector('table tbody tr, .card-grid', { timeout: 15000 })
  })

  test('listado de compras carga proveedores correctamente (BUG3)', async ({ page }) => {
    await page.goto('/compras')
    await page.waitForSelector('table, .compra-row', { timeout: 15000 })
    // Si hay filas con OCs, "Sin proveedor" no debería aparecer en TODAS
    const sinProveedor = await page.locator('text=Sin proveedor').count()
    const totalRows = await page.locator('table tbody tr, .compra-row').count()
    if (totalRows > 0) {
      expect(sinProveedor, 'Demasiadas OCs sin proveedor visible').toBeLessThan(totalRows)
    }
  })
})
