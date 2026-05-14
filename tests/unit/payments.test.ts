/**
 * Tests unitarios de src/lib/payments.ts
 *
 * Cubre `computeInvoicePaymentStatus` que es la función pura.
 * `registerInvoicePayment` y `listInvoicesWithPaymentStatus` requieren
 * Supabase real → quedan para tests de integración (E2E con Playwright).
 *
 * Ejecutar: npm run test:unit
 */
import { describe, it, expect } from 'vitest'
import { computeInvoicePaymentStatus } from '@/lib/payments'

describe('computeInvoicePaymentStatus()', () => {
  it('paid >= total → pagada', () => {
    expect(computeInvoicePaymentStatus({ total: 100, paid: 100 })).toBe('pagada')
    expect(computeInvoicePaymentStatus({ total: 100, paid: 120 })).toBe('pagada')
  })

  it('status="paid" → pagada (aunque paid esté desactualizado)', () => {
    expect(computeInvoicePaymentStatus({ total: 100, paid: 0, status: 'paid' })).toBe('pagada')
  })

  it('0 < paid < total → parcial', () => {
    expect(computeInvoicePaymentStatus({ total: 100, paid: 50 })).toBe('parcial')
  })

  it('paid=0, sin due_date → pendiente', () => {
    expect(computeInvoicePaymentStatus({ total: 100, paid: 0 })).toBe('pendiente')
  })

  it('paid=0, due_date < hoy → vencida', () => {
    const yesterday = new Date(Date.now() - 86_400_000).toISOString().slice(0, 10)
    expect(computeInvoicePaymentStatus({ total: 100, paid: 0, due_date: yesterday })).toBe('vencida')
  })

  it('paid=0, due_date > hoy → pendiente', () => {
    const tomorrow = new Date(Date.now() + 86_400_000).toISOString().slice(0, 10)
    expect(computeInvoicePaymentStatus({ total: 100, paid: 0, due_date: tomorrow })).toBe('pendiente')
  })

  it('paid=0, due_date = hoy → pendiente (no vencida hasta mañana)', () => {
    const today = new Date().toISOString().slice(0, 10)
    expect(computeInvoicePaymentStatus({ total: 100, paid: 0, due_date: today })).toBe('pendiente')
  })

  it('parcial + vencida → pagada gana sobre vencida (semántica)', () => {
    // Si tiene pago parcial, ya no decimos "vencida" — decimos "parcial".
    // El UI puede mostrar el badge vencida igual con el due_date, pero el
    // status semántico prioriza el progreso de cobro.
    const yesterday = new Date(Date.now() - 86_400_000).toISOString().slice(0, 10)
    expect(computeInvoicePaymentStatus({ total: 100, paid: 50, due_date: yesterday })).toBe('parcial')
  })
})
