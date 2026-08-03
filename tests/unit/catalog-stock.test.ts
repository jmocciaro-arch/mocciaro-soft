import { describe, it, expect } from 'vitest'
import { tokenizeQuery, looksLikeCatalogQuery, formatCatalogContext } from '@/lib/assistant/catalog-stock'

describe('tokenizeQuery', () => {
  it('descarta stopwords y conserva términos de producto', () => {
    expect(tokenizeQuery('qué puntas PH2 tenemos en stock')).toEqual(['puntas', 'ph2'])
  })

  it('normaliza acentos y mayúsculas', () => {
    expect(tokenizeQuery('Balanceadores TECNA')).toEqual(['balanceadores', 'tecna'])
  })

  it('devuelve vacío si solo hay relleno', () => {
    expect(tokenizeQuery('hay stock de los que tenemos')).toEqual([])
  })
})

describe('looksLikeCatalogQuery', () => {
  it('detecta preguntas de inventario', () => {
    expect(looksLikeCatalogQuery('qué puntas PH2 tenemos en stock')).toBe(true)
    expect(looksLikeCatalogQuery('hay torx T25?')).toBe(true)
    expect(looksLikeCatalogQuery('mostrame balanceadores')).toBe(true)
  })

  it('NO dispara en saludos ni en pedidos de crear documentos (eso es PR2)', () => {
    expect(looksLikeCatalogQuery('hola, cómo va todo')).toBe(false)
    expect(looksLikeCatalogQuery('creá una factura para Acme')).toBe(false)
  })
})

describe('formatCatalogContext', () => {
  it('arma el bloque con SKUs y marca el conteo con stock', () => {
    const ctx = formatCatalogContext('PH2', [
      { sku: 'SP.VPPH2/50', name: 'Punta Phillips PH2 50mm', brand: 'SPEEDRILL', modelo: null, price: 3, stock: 12 },
      { sku: 'AP.PH2/25', name: 'Punta Phillips PH2 25mm', brand: 'APEX', modelo: null, price: 4, stock: 0 },
    ])
    expect(ctx).toContain('INVENTARIO QUE MATCHEA "PH2"')
    expect(ctx).toContain('2 productos, 1 con stock')
    expect(ctx).toContain('SP.VPPH2/50')
    expect(ctx).toContain('stock 12')
  })

  it('avisa cuando no hay coincidencias', () => {
    const ctx = formatCatalogContext('xyz', [])
    expect(ctx).toContain('no hay productos en el catálogo que matcheen')
  })
})
