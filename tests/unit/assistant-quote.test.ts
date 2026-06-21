import { describe, it, expect } from 'vitest'
import { pickPrice, emptyClientPricing, type ClientPricing } from '@/lib/pricing/resolve-price'
import { createQuoteDraftSchema } from '@/lib/schemas/assistant-quote'

describe('pickPrice', () => {
  const PID = '11111111-1111-4111-8111-111111111111'

  it('usa el precio especial del cliente si existe', () => {
    const pricing: ClientPricing = { specials: new Map([[PID, { special_price: 80, discount_pct: 0 }]]), priceList: new Map() }
    expect(pickPrice(PID, 100, pricing)).toEqual({ price: 80, source: 'especial', discount: 0 })
  })

  it('aplica descuento de cliente sobre el catálogo si no hay especial', () => {
    const pricing: ClientPricing = { specials: new Map([[PID, { special_price: null, discount_pct: 10 }]]), priceList: new Map() }
    expect(pickPrice(PID, 100, pricing)).toEqual({ price: 90, source: 'dto_cliente', discount: 10 })
  })

  it('usa la tarifa (lista de precios) si no hay condiciones especiales', () => {
    const pricing: ClientPricing = { specials: new Map(), priceList: new Map([[PID, 70]]) }
    expect(pickPrice(PID, 100, pricing)).toEqual({ price: 70, source: 'tarifa', discount: 0 })
  })

  it('cae al precio de catálogo si no hay nada', () => {
    expect(pickPrice(PID, 100, emptyClientPricing())).toEqual({ price: 100, source: 'catalogo', discount: 0 })
  })
})

describe('createQuoteDraftSchema', () => {
  const base = {
    company_id: '22222222-2222-4222-8222-222222222222',
    currency: 'EUR',
    items: [{ sku: 'SP.VPPH2/50', description: 'Punta Phillips PH2 50mm', quantity: 5 }],
  }

  it('acepta un payload válido y aplica discount_pct=0 por default', () => {
    const r = createQuoteDraftSchema.parse(base)
    expect(r.items[0].discount_pct).toBe(0)
    expect(r.tax_rate).toBe(0)
  })

  it('rechaza si no hay items', () => {
    expect(createQuoteDraftSchema.safeParse({ ...base, items: [] }).success).toBe(false)
  })

  it('rechaza quantity <= 0', () => {
    expect(createQuoteDraftSchema.safeParse({ ...base, items: [{ description: 'x', quantity: 0 }] }).success).toBe(false)
  })

  it('rechaza company_id que no es uuid', () => {
    expect(createQuoteDraftSchema.safeParse({ ...base, company_id: 'no-uuid' }).success).toBe(false)
  })
})
