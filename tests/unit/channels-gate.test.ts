import { describe, it, expect } from 'vitest'
import { computeChannelsGate } from '@/lib/channels/gate'

/**
 * Gating del módulo Canales — SPEC-dashboard-canales.md §1.
 * Las 4 combinaciones A (permiso view_channels) × B (≥1 canal enabled
 * en la empresa activa) tienen que estar cubiertas.
 */
describe('computeChannelsGate', () => {
  it('sin A y sin B → módulo ausente', () => {
    const gate = computeChannelsGate(false, 0)
    expect(gate).toEqual({ showModule: false, isEmpty: false, functional: false })
  })

  it('con A y sin B → módulo visible con empty-state', () => {
    const gate = computeChannelsGate(true, 0)
    expect(gate).toEqual({ showModule: true, isEmpty: true, functional: false })
  })

  it('sin A y con B → módulo ausente (no deshabilitado: ausente)', () => {
    const gate = computeChannelsGate(false, 3)
    expect(gate).toEqual({ showModule: false, isEmpty: false, functional: false })
  })

  it('con A y con B → módulo visible y funcional', () => {
    const gate = computeChannelsGate(true, 1)
    expect(gate).toEqual({ showModule: true, isEmpty: false, functional: true })
  })

  it('empty-state y funcional son mutuamente excluyentes para cualquier count', () => {
    for (const count of [0, 1, 4, 16]) {
      for (const canView of [true, false]) {
        const gate = computeChannelsGate(canView, count)
        expect(gate.isEmpty && gate.functional).toBe(false)
        // Nada se muestra sin la condición A
        if (!canView) expect(gate.showModule || gate.isEmpty || gate.functional).toBe(false)
      }
    }
  })
})
