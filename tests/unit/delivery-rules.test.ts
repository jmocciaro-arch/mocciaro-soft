/**
 * Tests unitarios de src/lib/delivery-rules.ts — FASE 1.5
 *
 * Cubre las reglas duras del flow de entregas parciales y overdelivery.
 */
import { describe, it, expect } from 'vitest'
import {
  checkOverdelivery,
  evaluateDeliveryProposal,
  isOrderFullyDelivered,
} from '@/lib/delivery-rules'

describe('checkOverdelivery()', () => {
  it('toDeliver dentro del pending → sin overdelivery', () => {
    const r = checkOverdelivery(
      [{ id: 'a', ordered: 10, delivered: 3 }],
      [{ id: 'a', toDeliver: 5 }]
    )
    expect(r).toEqual([])
  })

  it('toDeliver excede pending → overdelivery con excess correcto', () => {
    const r = checkOverdelivery(
      [{ id: 'a', ordered: 10, delivered: 8 }],
      [{ id: 'a', toDeliver: 5 }]
    )
    expect(r).toEqual([
      { id: 'a', ordered: 10, delivered: 8, toDeliver: 5, pending: 2, excess: 3 },
    ])
  })

  it('toDeliver exactamente igual a pending → sin overdelivery', () => {
    const r = checkOverdelivery(
      [{ id: 'a', ordered: 10, delivered: 7 }],
      [{ id: 'a', toDeliver: 3 }]
    )
    expect(r).toEqual([])
  })

  it('PED ya entregado completo y se pide más → overdelivery total', () => {
    const r = checkOverdelivery(
      [{ id: 'a', ordered: 10, delivered: 10 }],
      [{ id: 'a', toDeliver: 2 }]
    )
    expect(r[0].excess).toBe(2)
    expect(r[0].pending).toBe(0)
  })

  it('múltiples líneas: sólo reporta las que exceden', () => {
    const r = checkOverdelivery(
      [
        { id: 'a', ordered: 10, delivered: 0 },
        { id: 'b', ordered: 5, delivered: 3 },
      ],
      [
        { id: 'a', toDeliver: 5 },
        { id: 'b', toDeliver: 4 },
      ]
    )
    expect(r).toHaveLength(1)
    expect(r[0].id).toBe('b')
    expect(r[0].excess).toBe(2)
  })

  it('línea en proposal sin match en orderLines → ignorada', () => {
    const r = checkOverdelivery(
      [{ id: 'a', ordered: 10, delivered: 0 }],
      [{ id: 'X', toDeliver: 100 }]
    )
    expect(r).toEqual([])
  })
})

describe('evaluateDeliveryProposal()', () => {
  it('proposal con cantidades negativas → rechazada', () => {
    const r = evaluateDeliveryProposal({
      orderLines: [{ id: 'a', ordered: 5, delivered: 0 }],
      proposal: [{ id: 'a', toDeliver: -1 }],
      hasOverdeliveryPermission: true,
    })
    expect(r.allowed).toBe(false)
    expect(r.reason).toMatch(/negativas/)
  })

  it('proposal toda en cero → rechazada', () => {
    const r = evaluateDeliveryProposal({
      orderLines: [{ id: 'a', ordered: 5, delivered: 0 }],
      proposal: [{ id: 'a', toDeliver: 0 }],
      hasOverdeliveryPermission: false,
    })
    expect(r.allowed).toBe(false)
    expect(r.reason).toMatch(/al menos un ítem/)
  })

  it('proposal sin overdelivery → permitida sin permiso', () => {
    const r = evaluateDeliveryProposal({
      orderLines: [{ id: 'a', ordered: 10, delivered: 2 }],
      proposal: [{ id: 'a', toDeliver: 5 }],
      hasOverdeliveryPermission: false,
    })
    expect(r.allowed).toBe(true)
    expect(r.overdeliveryLines).toEqual([])
  })

  it('overdelivery sin permiso → rechazada con líneas listadas', () => {
    const r = evaluateDeliveryProposal({
      orderLines: [{ id: 'a', ordered: 10, delivered: 8 }],
      proposal: [{ id: 'a', toDeliver: 5 }],
      hasOverdeliveryPermission: false,
    })
    expect(r.allowed).toBe(false)
    expect(r.overdeliveryLines).toHaveLength(1)
    expect(r.reason).toMatch(/allow_overdelivery/)
  })

  it('overdelivery con permiso pero sin motivo → rechazada', () => {
    const r = evaluateDeliveryProposal({
      orderLines: [{ id: 'a', ordered: 10, delivered: 8 }],
      proposal: [{ id: 'a', toDeliver: 5 }],
      hasOverdeliveryPermission: true,
    })
    expect(r.allowed).toBe(false)
    expect(r.reason).toMatch(/motivo/i)
  })

  it('overdelivery con permiso + motivo corto → rechazada', () => {
    const r = evaluateDeliveryProposal({
      orderLines: [{ id: 'a', ordered: 10, delivered: 8 }],
      proposal: [{ id: 'a', toDeliver: 5 }],
      hasOverdeliveryPermission: true,
      overdeliveryReason: 'ok',
    })
    expect(r.allowed).toBe(false)
  })

  it('overdelivery con permiso + motivo OK → permitida', () => {
    const r = evaluateDeliveryProposal({
      orderLines: [{ id: 'a', ordered: 10, delivered: 8 }],
      proposal: [{ id: 'a', toDeliver: 5 }],
      hasOverdeliveryPermission: true,
      overdeliveryReason: 'Adelantamos entrega con stock de Pompeya',
    })
    expect(r.allowed).toBe(true)
    expect(r.overdeliveryLines).toHaveLength(1)
  })
})

describe('isOrderFullyDelivered()', () => {
  it('línea única entregada completa → true', () => {
    expect(isOrderFullyDelivered([{ id: 'a', ordered: 5, delivered: 5 }])).toBe(true)
  })

  it('línea única entregada en exceso → true', () => {
    expect(isOrderFullyDelivered([{ id: 'a', ordered: 5, delivered: 7 }])).toBe(true)
  })

  it('una línea pendiente → false', () => {
    expect(
      isOrderFullyDelivered([
        { id: 'a', ordered: 5, delivered: 5 },
        { id: 'b', ordered: 3, delivered: 2 },
      ])
    ).toBe(false)
  })

  it('todas pendientes → false', () => {
    expect(
      isOrderFullyDelivered([
        { id: 'a', ordered: 5, delivered: 0 },
      ])
    ).toBe(false)
  })

  it('lista vacía → false (no hay nada que entregar)', () => {
    expect(isOrderFullyDelivered([])).toBe(false)
  })
})
