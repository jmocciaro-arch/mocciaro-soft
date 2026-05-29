/**
 * Tests unitarios de suggestPrimary() — Next-Step Suggester F1.
 *
 * Cubre el mapeo status → action_code para los estados soportados,
 * tanto en español como en inglés, y el default.
 */
import { describe, it, expect } from 'vitest'
import { suggestPrimary } from '@/lib/next-steps/suggest'

describe('suggestPrimary', () => {
  it('draft (EN) → preview_pdf', () => {
    expect(suggestPrimary('draft')).toBe('preview_pdf')
  })

  it('borrador (ES) → preview_pdf', () => {
    expect(suggestPrimary('borrador')).toBe('preview_pdf')
  })

  it('sent / enviado → send_email', () => {
    expect(suggestPrimary('sent')).toBe('send_email')
    expect(suggestPrimary('enviado')).toBe('send_email')
  })

  it('viewed / visto → send_email', () => {
    expect(suggestPrimary('viewed')).toBe('send_email')
    expect(suggestPrimary('visto')).toBe('send_email')
  })

  it('accepted / aceptada / ganado → convert_to_sales_order', () => {
    expect(suggestPrimary('accepted')).toBe('convert_to_sales_order')
    expect(suggestPrimary('aceptada')).toBe('convert_to_sales_order')
    expect(suggestPrimary('ganado')).toBe('convert_to_sales_order')
  })

  it('default (status desconocido / null / vacío) → preview_pdf', () => {
    expect(suggestPrimary('xxxxx')).toBe('preview_pdf')
    expect(suggestPrimary(null)).toBe('preview_pdf')
    expect(suggestPrimary(undefined)).toBe('preview_pdf')
    expect(suggestPrimary('')).toBe('preview_pdf')
  })

  it('case-insensitive y trim', () => {
    expect(suggestPrimary('  ACCEPTED  ')).toBe('convert_to_sales_order')
    expect(suggestPrimary('Borrador')).toBe('preview_pdf')
  })
})
