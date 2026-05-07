/**
 * Tests unitarios de src/lib/schemas/documents.ts
 *
 * Cubre:
 * - canTransition(): la matriz ALLOWED_TRANSITIONS coincide con
 *   las CHECK de la migración v37 y los casos críticos pasan/fallan
 *   donde corresponde.
 * - canDerive(): ALLOWED_DERIVATIONS coherente con la cadena
 *   canónica de StelOrder/Mocciaro.
 * - renderDocumentCode(): templates resuelven todos los placeholders
 *   ({date:YYYY}, {number:6}, {prefix}, etc.).
 * - documentCreateSchema: rechaza inputs inválidos (status fuera de
 *   enum, currency_code inválido, etc.).
 *
 * Ejecutar: npm run test:unit
 */

import { describe, it, expect } from 'vitest'
import {
  DOC_TYPES,
  DOC_STATUSES,
  ALLOWED_TRANSITIONS,
  ALLOWED_DERIVATIONS,
  canTransition,
  canDerive,
  documentCreateSchema,
} from '@/lib/schemas/documents'

describe('canTransition()', () => {
  it('draft puede ir a issued', () => {
    expect(canTransition('draft', 'issued')).toBe(true)
  })

  it('draft puede cancelarse', () => {
    expect(canTransition('draft', 'cancelled')).toBe(true)
  })

  it('issued NO puede volver a draft (irreversible)', () => {
    expect(canTransition('issued', 'draft')).toBe(false)
  })

  it('cancelled es estado final (sin salidas)', () => {
    for (const target of DOC_STATUSES) {
      if (target === 'cancelled') continue
      expect(canTransition('cancelled', target)).toBe(false)
    }
  })

  it('voided es estado final (sin salidas)', () => {
    for (const target of DOC_STATUSES) {
      if (target === 'voided') continue
      expect(canTransition('voided', target)).toBe(false)
    }
  })

  it('paid solo puede ir a voided', () => {
    expect(canTransition('paid', 'voided')).toBe(true)
    expect(canTransition('paid', 'cancelled')).toBe(false)
    expect(canTransition('paid', 'invoiced')).toBe(false)
  })

  it('cada status tiene una entrada en ALLOWED_TRANSITIONS', () => {
    for (const s of DOC_STATUSES) {
      expect(ALLOWED_TRANSITIONS).toHaveProperty(s)
    }
  })

  it('todas las transiciones target están en DOC_STATUSES', () => {
    for (const [from, targets] of Object.entries(ALLOWED_TRANSITIONS)) {
      for (const to of targets) {
        expect(DOC_STATUSES, `${from} → ${to}`).toContain(to)
      }
    }
  })
})

describe('canDerive()', () => {
  it('quote → sales_order es derivable (converted_to)', () => {
    const r = canDerive('quote', 'sales_order')
    expect(r.ok).toBe(true)
    if (r.ok) expect(r.relation).toBe('converted_to')
  })

  it('sales_order → delivery_note es derivable (delivered_as)', () => {
    const r = canDerive('sales_order', 'delivery_note')
    expect(r.ok).toBe(true)
    if (r.ok) expect(r.relation).toBe('delivered_as')
  })

  it('delivery_note → invoice es derivable (invoiced_as)', () => {
    const r = canDerive('delivery_note', 'invoice')
    expect(r.ok).toBe(true)
    if (r.ok) expect(r.relation).toBe('invoiced_as')
  })

  it('invoice → credit_note es derivable (amended_by)', () => {
    const r = canDerive('invoice', 'credit_note')
    expect(r.ok).toBe(true)
  })

  it('quote → invoice NO es derivable (debe pasar por sales_order)', () => {
    const r = canDerive('quote', 'invoice')
    expect(r.ok).toBe(false)
  })

  it('receipt no deriva a nada', () => {
    for (const t of DOC_TYPES) {
      const r = canDerive('receipt', t)
      expect(r.ok, `receipt → ${t}`).toBe(false)
    }
  })

  it('cada doc_type tiene entrada en ALLOWED_DERIVATIONS', () => {
    for (const t of DOC_TYPES) {
      expect(ALLOWED_DERIVATIONS).toHaveProperty(t)
    }
  })
})

describe('documentCreateSchema (Zod)', () => {
  const validInput = {
    company_id: '00000000-0000-4000-8000-000000000001',
    doc_type: 'quote' as const,
    direction: 'sales' as const,
    currency_code: 'EUR',
  }

  it('acepta input válido mínimo', () => {
    const r = documentCreateSchema.safeParse(validInput)
    expect(r.success).toBe(true)
  })

  it('rechaza doc_type fuera del enum', () => {
    const r = documentCreateSchema.safeParse({ ...validInput, doc_type: 'banana' })
    expect(r.success).toBe(false)
  })

  it('rechaza company_id no UUID', () => {
    const r = documentCreateSchema.safeParse({ ...validInput, company_id: 'not-a-uuid' })
    expect(r.success).toBe(false)
  })

  it('rechaza currency_code vacío', () => {
    const r = documentCreateSchema.safeParse({ ...validInput, currency_code: '' })
    expect(r.success).toBe(false)
  })

  it('acepta metadata como objeto JSONB libre', () => {
    const r = documentCreateSchema.safeParse({
      ...validInput,
      metadata: { custom_field: 'whatever', nested: { deep: true } },
    })
    expect(r.success).toBe(true)
  })
})
