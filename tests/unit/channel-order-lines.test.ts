import { describe, it, expect } from 'vitest'
import { parseRawItems, orderToDocumentLines } from '@/lib/channels/order-lines'

describe('parseRawItems', () => {
  it('interpreta items bien formados del raw', () => {
    const items = parseRawItems({
      items: [
        { sku: 'URYU-UL50', title: 'URYU UL-50 atornillador', quantity: 2, unit_price: 206450 },
        { title: 'Sin SKU', quantity: 1, unit_price: 100 },
      ],
    })
    expect(items).toEqual([
      { sku: 'URYU-UL50', name: 'URYU UL-50 atornillador', quantity: 2, unitPrice: 206450 },
      { sku: null, name: 'Sin SKU', quantity: 1, unitPrice: 100 },
    ])
  })

  it('descarta items inválidos sin romper (lenient)', () => {
    const items = parseRawItems({
      items: [
        { title: '', quantity: 1, unit_price: 10 },       // sin título
        { title: 'Cantidad cero', quantity: 0 },          // qty <= 0
        { title: 'Cantidad rara', quantity: 'x' },        // qty no numérica
        null,
        'basura',
        { title: 'Precio raro', quantity: 1, unit_price: 'x' }, // precio inválido → 0
      ],
    })
    expect(items).toEqual([{ sku: null, name: 'Precio raro', quantity: 1, unitPrice: 0 }])
  })

  it('raw sin items, null o no-objeto → vacío', () => {
    expect(parseRawItems(null)).toEqual([])
    expect(parseRawItems({})).toEqual([])
    expect(parseRawItems({ items: 'no-array' })).toEqual([])
    expect(parseRawItems('texto')).toEqual([])
  })
})

describe('orderToDocumentLines', () => {
  it('usa los items del raw cuando existen', () => {
    const lines = orderToDocumentLines({
      raw: { items: [{ title: 'Producto', quantity: 3, unit_price: 50 }] },
      total: 150,
      externalOrderId: '88412',
      channelLabel: 'MercadoLibre',
    })
    expect(lines).toHaveLength(1)
    expect(lines[0].quantity).toBe(3)
  })

  it('sin items interpretables → línea única con el total (nunca documento vacío)', () => {
    const lines = orderToDocumentLines({
      raw: null,
      total: 412900,
      externalOrderId: '88412',
      channelLabel: 'MercadoLibre',
    })
    expect(lines).toEqual([
      { sku: null, name: 'Orden MercadoLibre 88412', quantity: 1, unitPrice: 412900 },
    ])
  })

  it('total null → línea con precio 0 (sin inventar importes)', () => {
    const lines = orderToDocumentLines({ raw: {}, total: null, externalOrderId: 'X', channelLabel: null })
    expect(lines[0].unitPrice).toBe(0)
    expect(lines[0].name).toBe('Orden de canal X')
  })
})
