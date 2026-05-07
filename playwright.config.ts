import { defineConfig, devices } from '@playwright/test'

/**
 * Playwright config para tests E2E del ERP Mocciaro Soft.
 *
 * Tests por default corren contra la URL configurada en
 * E2E_BASE_URL. Default: producción
 * (https://cotizador-torquetools.vercel.app).
 *
 * Para correr local:
 *   1. npm run dev (en otra terminal)
 *   2. E2E_BASE_URL=http://localhost:3000 npm run test:e2e
 *
 * Para correr contra producción (smoke tests anónimos):
 *   npm run test:e2e
 *
 * Tests con auth (los que están skipped) requieren E2E_USER_EMAIL +
 * E2E_USER_PASSWORD en .env.local.
 */
export default defineConfig({
  testDir: './tests/e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: [['list'], ['html', { open: 'never' }]],
  use: {
    baseURL: process.env.E2E_BASE_URL || 'https://cotizador-torquetools.vercel.app',
    trace: 'on-first-retry',
    locale: 'es-AR',
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
})
