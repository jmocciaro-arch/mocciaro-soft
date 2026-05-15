/**
 * Tests unitarios de src/lib/quote-versioning.ts
 *
 * Cubre `shouldWarnBeforeEdit` que es función pura. Las funciones que
 * llaman a Supabase RPC quedan para tests de integración.
 */
import { describe, it, expect } from 'vitest'
import { shouldWarnBeforeEdit } from '@/lib/quote-versioning'

describe('shouldWarnBeforeEdit()', () => {
  it('borrador sin snapshots → NO warn', () => {
    expect(shouldWarnBeforeEdit({ status: 'borrador', totalVersions: 0 })).toBe(false)
  })

  it('enviada sin snapshots → WARN', () => {
    expect(shouldWarnBeforeEdit({ status: 'enviada', totalVersions: 0 })).toBe(true)
  })

  it('aceptada → WARN', () => {
    expect(shouldWarnBeforeEdit({ status: 'aceptada', totalVersions: 1 })).toBe(true)
  })

  it('rechazada con snapshots → WARN (hubo histórico)', () => {
    expect(shouldWarnBeforeEdit({ status: 'rechazada', totalVersions: 2 })).toBe(true)
  })

  it('null status, sin versiones → NO warn', () => {
    expect(shouldWarnBeforeEdit({ status: null, totalVersions: 0 })).toBe(false)
  })
})
