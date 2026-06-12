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
    // CompanySelector en el TopBar — selector con data-testid
    await expect(page.getByTestId('company-selector')).toBeVisible({ timeout: 10000 })
  })

  test('listado de cotizaciones carga sin error #310', async ({ page }) => {
    await page.goto('/cotizador')
    // Botón "Guardadas" cambia a vista de listado
    const guardadas = page.getByRole('button', { name: /^guardadas$/i }).first()
    if (await guardadas.isVisible().catch(() => false)) {
      await guardadas.click()
      // No debe aparecer pantalla de crash
      const errorText = page.getByText(/This page couldn|Reload to try/i)
      await expect(errorText).not.toBeVisible()
    }
  })

  test('listado de clientes carga sin error', async ({ page }) => {
    await page.goto('/clientes')
    // La página renderiza algo (tabla, card grid, o "Sin clientes")
    // Aceptamos cualquiera de los containers. Con seed hay 5 clientes por empresa.
    await page.waitForLoadState('networkidle', { timeout: 15000 })
    const hasContent = await page.locator('table, [class*="grid"], [class*="card"]').first().isVisible().catch(() => false)
    expect(hasContent).toBe(true)
  })

  test('listado de compras carga sin error (BUG3 — proveedores)', async ({ page }) => {
    await page.goto('/compras')
    await page.waitForLoadState('networkidle', { timeout: 15000 })
    // Aceptamos página vacía o con datos. Lo crítico: NO debe romper.
    const hasError = await page.getByText(/Error|Failed to load/i).first().isVisible().catch(() => false)
    expect(hasError).toBe(false)
    // Si hay filas con OCs, "Sin proveedor" no debería aparecer en TODAS
    const totalRows = await page.locator('table tbody tr').count()
    if (totalRows > 0) {
      const sinProveedor = await page.getByText('Sin proveedor').count()
      expect(sinProveedor, 'Demasiadas OCs sin proveedor visible').toBeLessThan(totalRows)
    }
  })
})
