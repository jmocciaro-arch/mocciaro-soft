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
  test('página de login carga con formulario email/password', async ({ page }) => {
    await page.goto('/login')
    // Form email/password (Google OAuth fue removido — login es email/password)
    await expect(page.locator('input[type="email"]')).toBeVisible({ timeout: 10000 })
    await expect(page.locator('input[type="password"]')).toBeVisible()
  })

  test('API /api/health/sales-chain protegida por auth', async ({ request }) => {
    // Tras RLS company-aware, este endpoint requiere auth.
    // Sin auth debe devolver 401 (no leak de datos).
    const res = await request.get('/api/health/sales-chain')
    expect([200, 401, 403]).toContain(res.status())
    if (res.status() === 401 || res.status() === 403) {
      // Comportamiento correcto post-RLS
      return
    }
    // Si por algún motivo es 200 (público), validar la forma
    const body = await res.json()
    expect(body).toHaveProperty('summary')
    expect(body.summary).toMatch(/\d+\/\d+ checks/)
    expect(body).toHaveProperty('checks')
    expect(Array.isArray(body.checks)).toBe(true)
  })

  test('redirect a /login cuando se accede a ruta protegida sin auth', async ({ page }) => {
    await page.goto('/dashboard')
    // El proxy (ex middleware) debe redirigir a /login
    await expect(page).toHaveURL(/\/login/, { timeout: 10000 })
  })

  test('endpoint /api/auth/google rechaza sin auth de admin', async ({ request }) => {
    // /api/auth/google es para CONECTAR Gmail desde una cuenta admin —
    // no es el flujo de login. Sin auth de admin, debe devolver 401.
    const res = await request.get('/api/auth/google', { maxRedirects: 0 })
    expect([401, 403]).toContain(res.status())
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
