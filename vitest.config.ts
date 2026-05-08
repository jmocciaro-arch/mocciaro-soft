import { defineConfig } from 'vitest/config'
import { resolve } from 'node:path'

/**
 * Vitest config para tests unitarios. NO incluye tests E2E (esos
 * corren con Playwright, ver playwright.config.ts).
 */
export default defineConfig({
  test: {
    include: ['tests/unit/**/*.{test,spec}.ts'],
    environment: 'node',
    globals: false,
    reporters: process.env.CI ? ['default', 'github-actions'] : 'default',
    coverage: {
      provider: 'v8',
      reporter: ['text', 'lcov'],
      include: ['src/lib/**/*.ts'],
      exclude: ['src/lib/**/*.test.ts'],
    },
  },
  resolve: {
    alias: {
      '@': resolve(__dirname, 'src'),
    },
  },
})
