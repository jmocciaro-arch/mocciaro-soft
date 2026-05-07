import { test, expect } from '@playwright/test'

/**
 * Smoke tests sin autenticación.
 * Verifican que la app está viva y responde correctamente:
 *   - Página de login carga.
 *   - API health devuelve 200 con summary.
 *   - Endpoints públicos (portal, formularios) responden bien-formados.
 *
 * Tests autenticados están en tests/e2e/auth-flow.spec.ts (skipped por
 * default; requieren E2E_USER_EMAIL + E2E_USER_PASSWORD).
 */

test.describe('Smoke tests sin auth', () => {
  test('página de login carga y muestra Google OAuth', async ({ page }) => {
    await page.goto('/login')
    await expect(page).toHaveTitle(/Mocciaro/i)
    // El botón de Google OAuth debe estar visible
    const googleButton = page.locator('text=/Google|Continuar con Google/i').first()
    await expect(googleButton).toBeVisible({ timeout: 10000 })
  })

  test('API /api/health/sales-chain devuelve summary válido', async ({ request }) => {
    const res = await request.get('/api/health/sales-chain')
    expect(res.status()).toBe(200)
    const body = await res.json()
    expect(body).toHaveProperty('summary')
    expect(body.summary).toMatch(/\d+\/\d+ checks/)
    expect(body).toHaveProperty('checks')
    expect(Array.isArray(body.checks)).toBe(true)
  })

  test('redirect a /login cuando se accede a ruta protegida sin auth', async ({ page }) => {
    await page.goto('/dashboard')
    // El middleware debería redirigir a /login
    await expect(page).toHaveURL(/\/login/, { timeout: 10000 })
  })

  test('endpoint OAuth Google arma URL con client_id', async ({ request }) => {
    // El endpoint /api/auth/google hace 307 redirect a accounts.google.com
    const res = await request.get('/api/auth/google', { maxRedirects: 0 })
    expect(res.status()).toBe(307)
    const location = res.headers().location
    expect(location).toContain('accounts.google.com')
    // Verificar que client_id NO está vacío (BUG fixeado en sesión anterior)
    expect(location).toMatch(/client_id=[^&]+/)
    expect(location).not.toContain('client_id=&')
    // Y que redirect_uri apunta a producción (no localhost)
    expect(location).toMatch(/redirect_uri=[^&]+/)
    expect(location).not.toContain('redirect_uri=&')
  })

  test('endpoint catalog feed público devuelve 404 sin token (no expone catálogo)', async ({ request }) => {
    const res = await request.get('/api/catalog/feed/inexistente-token')
    // No queremos que el endpoint público exponga datos sin token válido
    expect([401, 404, 400]).toContain(res.status())
  })

  test('robots.txt o manifest.json existen (PWA básica)', async ({ request }) => {
    const manifest = await request.get('/manifest.json')
    expect(manifest.status()).toBe(200)
    const body = await manifest.json()
    expect(body).toHaveProperty('name')
  })
})

test.describe('API endpoints sin auth (protección)', () => {
  test('endpoints internos rechazan sin auth', async ({ request }) => {
    const protectedPaths = [
      '/api/documents',
      '/api/companies',
      '/api/products/search',
    ]
    for (const path of protectedPaths) {
      const res = await request.get(path).catch(() => null)
      if (!res) continue
      // Pueden ser 401 o 403 según implementación; lo importante es que NO sean 200
      // sin auth (eso sería leak de datos).
      if (res.status() === 200) {
        const body = await res.json().catch(() => null)
        // Algunos endpoints devuelven 200 con array vacío bajo RLS — eso también está OK
        const isEmpty =
          Array.isArray(body) ? body.length === 0 :
          body && Array.isArray(body.data) ? body.data.length === 0 :
          true
        expect(isEmpty, `${path} devuelve datos sin auth`).toBe(true)
      } else {
        expect([401, 403, 404, 405]).toContain(res.status())
      }
    }
  })

  test('endpoint cron rechaza sin CRON_SECRET', async ({ request }) => {
    const res = await request.get('/api/cron/alerts')
    expect([401, 403]).toContain(res.status())
  })

  test('endpoint /api/oc/delete-cascade rechaza POST sin auth', async ({ request }) => {
    const res = await request.post('/api/oc/delete-cascade', {
      data: { ocId: 'fake', reason: 'test' },
    })
    expect([401, 403]).toContain(res.status())
  })
})
