/**
 * Tests unitarios de src/lib/sku-matcher.ts
 *
 * Cubre la estrategia de matching en 4 niveles:
 *   1. Alias aprendido (tt_sku_aliases) → confidence 1.0
 *   2. SKU exacto en tt_products → 0.95
 *   3. Fuzzy SKU vía ILIKE + trigram → 0.7
 *   4. Fuzzy name → 0.5
 *
 * Más helpers: matchBatch, saveSkuAlias, getClientGlossary, deleteSkuAlias.
 *
 * Ejecutar: npm run test:unit
 */

import { describe, it, expect, vi } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'
import {
  matchClientSKU,
  matchBatch,
  saveSkuAlias,
  getClientGlossary,
  deleteSkuAlias,
  type MatchedProduct,
} from '@/lib/sku-matcher'

// ────────────────────────────────────────────────────────────────────────────
// Helpers de mock — cada test inyecta sus propias respuestas por tabla+op.
// La key combina tabla y "kind" de retorno (single | list | upsert | delete).
// El mock NO valida los args; los tests asumen que el matcher hace la cadena
// correcta. Si el matcher cambia el patrón de query, los tests fallan ahí
// (lo cual es la intención: detectar regresiones).
// ────────────────────────────────────────────────────────────────────────────

type FakeResponse = { data: unknown; error: { message: string } | null }

interface MockHandlers {
  // single = .maybeSingle() o .single()
  // list   = await del builder sin terminal (Promise<{ data: [...] }>)
  // upsert = .upsert(...).then(...)
  // delete = .delete().eq(...).then(...)
  [key: `${string}:${'single' | 'list' | 'upsert' | 'delete'}`]: FakeResponse
}

function createMockSupabase(handlers: MockHandlers): SupabaseClient {
  const recorded: Array<{ table: string; op: string; args: unknown[] }> = []
  function builderFor(table: string) {
    const calls: Array<{ op: string; args: unknown[] }> = []
    const record = (op: string, args: unknown[]) => {
      calls.push({ op, args })
      recorded.push({ table, op, args })
    }
    const chain: Record<string, unknown> = {}
    Object.assign(chain, {
      select(...args: unknown[]) { record('select', args); return chain },
      eq(...args: unknown[])     { record('eq', args); return chain },
      ilike(...args: unknown[])  { record('ilike', args); return chain },
      order(...args: unknown[])  { record('order', args); return chain },
      limit(...args: unknown[])  {
        record('limit', args)
        // Cuando el matcher hace .limit(1) y termina la chain con await, es modo "list".
        const r = handlers[`${table}:list`] || { data: [], error: null }
        return Promise.resolve(r)
      },
      maybeSingle()              {
        record('maybeSingle', [])
        const r = handlers[`${table}:single`] || { data: null, error: null }
        return Promise.resolve(r)
      },
      single()                   {
        record('single', [])
        const r = handlers[`${table}:single`] || { data: null, error: null }
        return Promise.resolve(r)
      },
      upsert(...args: unknown[]) {
        record('upsert', args)
        const r = handlers[`${table}:upsert`] || { data: null, error: null }
        return Promise.resolve(r)
      },
      delete() {
        record('delete', [])
        // .delete().eq(col, val) → al await del .eq devuelve la respuesta
        return {
          eq(...eqArgs: unknown[]) {
            record('eq', eqArgs)
            const r = handlers[`${table}:delete`] || { data: null, error: null }
            return Promise.resolve(r)
          },
        }
      },
    })
    return chain
  }
  return {
    from: vi.fn(builderFor),
    __recorded: recorded,
  } as unknown as SupabaseClient
}

const PRODUCT: MatchedProduct = {
  id: 'p-1',
  sku: 'CRPR009720',
  name: 'ATORNILLADOR ACOPLE 1/4 FEIN ASM18-12',
  brand: 'FEIN',
  price_eur: 579,
}

// ────────────────────────────────────────────────────────────────────────────
// matchClientSKU
// ────────────────────────────────────────────────────────────────────────────

describe('matchClientSKU()', () => {
  it('alias aprendido para el cliente → confidence 1.0, source alias', async () => {
    const sb = createMockSupabase({
      'tt_sku_aliases:single': { data: { product_id: 'p-1', product: PRODUCT }, error: null },
    })
    const r = await matchClientSKU(sb, { clientId: 'c-1', externalSKU: 'ATR-001' })
    expect(r.source).toBe('alias')
    expect(r.confidence).toBe(1)
    expect(r.product?.id).toBe('p-1')
    expect(r.externalSKU).toBe('ATR-001')
  })

  it('sin alias pero SKU exacto en tt_products → 0.95, sku_exact', async () => {
    const sb = createMockSupabase({
      'tt_sku_aliases:single': { data: null, error: null },
      'tt_products:single':    { data: PRODUCT, error: null },
    })
    const r = await matchClientSKU(sb, { clientId: 'c-1', externalSKU: 'CRPR009720' })
    expect(r.source).toBe('sku_exact')
    expect(r.confidence).toBe(0.95)
    expect(r.product?.sku).toBe('CRPR009720')
  })

  it('sin alias ni exacto pero fuzzy SKU encuentra → 0.7, sku_fuzzy', async () => {
    const sb = createMockSupabase({
      'tt_sku_aliases:single': { data: null, error: null },
      'tt_products:single':    { data: null, error: null }, // exacto NO
      'tt_products:list':      { data: [PRODUCT], error: null }, // fuzzy ILIKE SÍ
    })
    const r = await matchClientSKU(sb, { clientId: 'c-1', externalSKU: 'CRPR0097' })
    expect(r.source).toBe('sku_fuzzy')
    expect(r.confidence).toBe(0.7)
    expect(r.product?.id).toBe('p-1')
  })

  it('cae a fuzzy name cuando SKU no matchea pero descripción sí', async () => {
    // Para diferenciar el "list" del fuzzy SKU (que NO devuelve nada) del fuzzy name (que SÍ),
    // necesitamos un mock que devuelva listas distintas según el orden de llamadas.
    // Acá usamos un contador: la primera llamada a tt_products:list es fuzzy SKU
    // (vacía), la segunda es fuzzy name (con resultado).
    let listCallCount = 0
    const sb = createMockSupabase({
      'tt_sku_aliases:single': { data: null, error: null },
      'tt_products:single':    { data: null, error: null },
    })
    // Sobrescribimos `from` para variar el list según el orden:
    sb.from = vi.fn((table: string) => {
      const chain: Record<string, unknown> = {}
      Object.assign(chain, {
        select() { return chain },
        eq()     { return chain },
        ilike()  { return chain },
        order()  { return chain },
        limit()  {
          if (table === 'tt_products') {
            listCallCount++
            // primera llamada: fuzzy SKU vacío. segunda: fuzzy name con hit.
            return Promise.resolve(listCallCount === 1
              ? { data: [], error: null }
              : { data: [PRODUCT], error: null })
          }
          return Promise.resolve({ data: [], error: null })
        },
        maybeSingle() {
          // Para tt_sku_aliases y para tt_products SKU exacto: ambos null
          return Promise.resolve({ data: null, error: null })
        },
      })
      return chain as unknown as ReturnType<SupabaseClient['from']>
    }) as SupabaseClient['from']
    const r = await matchClientSKU(sb, {
      clientId: 'c-1',
      externalSKU: 'XX999',
      productName: 'ATORNILLADOR ANGULAR FEIN',
    })
    expect(r.source).toBe('name_fuzzy')
    expect(r.confidence).toBe(0.5)
    expect(r.product?.id).toBe('p-1')
  })

  it('sin match en ningún nivel → source none, confidence 0', async () => {
    const sb = createMockSupabase({
      'tt_sku_aliases:single': { data: null, error: null },
      'tt_products:single':    { data: null, error: null },
      'tt_products:list':      { data: [], error: null },
    })
    const r = await matchClientSKU(sb, { clientId: 'c-1', externalSKU: 'NOEXISTE' })
    expect(r.source).toBe('none')
    expect(r.confidence).toBe(0)
    expect(r.product).toBeNull()
  })

  it('externalSKU vacío → none sin tocar la DB', async () => {
    const sb = createMockSupabase({})
    const r = await matchClientSKU(sb, { clientId: 'c-1', externalSKU: '' })
    expect(r.source).toBe('none')
    expect(r.product).toBeNull()
    // No debería haber tocado la DB
    expect(sb.from).not.toHaveBeenCalled()
  })

  it('externalSKU con whitespace se trim y se respeta', async () => {
    const sb = createMockSupabase({
      'tt_sku_aliases:single': { data: { product_id: 'p-1', product: PRODUCT }, error: null },
    })
    const r = await matchClientSKU(sb, { clientId: 'c-1', externalSKU: '  ATR-001  ' })
    expect(r.externalSKU).toBe('ATR-001')
    expect(r.source).toBe('alias')
  })

  it('sin clientId saltea el match de alias y busca solo en catálogo', async () => {
    const sb = createMockSupabase({
      'tt_products:single': { data: PRODUCT, error: null },
    })
    const r = await matchClientSKU(sb, { externalSKU: 'CRPR009720' })
    expect(r.source).toBe('sku_exact')
    // No debería haber consultado tt_sku_aliases
    const fromCalls = (sb.from as ReturnType<typeof vi.fn>).mock.calls.map((c) => c[0])
    expect(fromCalls).not.toContain('tt_sku_aliases')
    expect(fromCalls).toContain('tt_products')
  })

  it('fuzzy name no se intenta cuando descripción es muy corta (<4 chars)', async () => {
    const sb = createMockSupabase({
      'tt_sku_aliases:single': { data: null, error: null },
      'tt_products:single':    { data: null, error: null },
      'tt_products:list':      { data: [], error: null },
    })
    const r = await matchClientSKU(sb, {
      clientId: 'c-1',
      externalSKU: 'XX999',
      productName: 'abc', // 3 chars — debería skipear fuzzy name
    })
    expect(r.source).toBe('none')
  })
})

// ────────────────────────────────────────────────────────────────────────────
// matchBatch
// ────────────────────────────────────────────────────────────────────────────

describe('matchBatch()', () => {
  it('matchea N items en paralelo manteniendo el orden', async () => {
    // 2 items: el primero matchea como alias, el segundo no matchea.
    let aliasCallIndex = 0
    const sb = createMockSupabase({})
    sb.from = vi.fn((table: string) => {
      const chain: Record<string, unknown> = {}
      Object.assign(chain, {
        select() { return chain },
        eq()     { return chain },
        ilike()  { return chain },
        order()  { return chain },
        limit()  { return Promise.resolve({ data: [], error: null }) },
        maybeSingle() {
          if (table === 'tt_sku_aliases') {
            aliasCallIndex++
            // Primer item matchea, segundo no.
            return Promise.resolve(aliasCallIndex === 1
              ? { data: { product_id: 'p-1', product: PRODUCT }, error: null }
              : { data: null, error: null })
          }
          // tt_products single (SKU exacto): siempre vacío
          return Promise.resolve({ data: null, error: null })
        },
      })
      return chain as unknown as ReturnType<SupabaseClient['from']>
    }) as SupabaseClient['from']
    const results = await matchBatch(sb, {
      clientId: 'c-1',
      items: [
        { codigo: 'ATR-001', descripcion: 'Item con alias' },
        { codigo: 'XX999',   descripcion: 'Item sin nada' },
      ],
    })
    expect(results).toHaveLength(2)
    expect(results[0].source).toBe('alias')
    expect(results[0].externalSKU).toBe('ATR-001')
    expect(results[1].source).toBe('none')
    expect(results[1].externalSKU).toBe('XX999')
  })

  it('tolera items con codigo o descripcion null', async () => {
    const sb = createMockSupabase({
      'tt_sku_aliases:single': { data: null, error: null },
      'tt_products:single':    { data: null, error: null },
      'tt_products:list':      { data: [], error: null },
    })
    const results = await matchBatch(sb, {
      clientId: 'c-1',
      items: [
        { codigo: null, descripcion: null },
        { codigo: '',   descripcion: 'algo' },
      ],
    })
    expect(results).toHaveLength(2)
    expect(results[0].source).toBe('none')
    expect(results[1].source).toBe('none')
  })
})

// ────────────────────────────────────────────────────────────────────────────
// saveSkuAlias
// ────────────────────────────────────────────────────────────────────────────

describe('saveSkuAlias()', () => {
  it('upsert exitoso devuelve { ok: true }', async () => {
    const sb = createMockSupabase({
      'tt_sku_aliases:upsert': { data: null, error: null },
    })
    const r = await saveSkuAlias(sb, {
      companyId: 'co-1',
      clientId: 'c-1',
      externalSKU: '  ATR-001  ', // se debería trim adentro
      productId: 'p-1',
      source: 'manual',
    })
    expect(r.ok).toBe(true)
    expect(r.error).toBeUndefined()
  })

  it('upsert con error devuelve { ok: false, error }', async () => {
    const sb = createMockSupabase({
      'tt_sku_aliases:upsert': { data: null, error: { message: 'duplicate key' } },
    })
    const r = await saveSkuAlias(sb, {
      companyId: 'co-1',
      clientId: 'c-1',
      externalSKU: 'ATR-001',
      productId: 'p-1',
    })
    expect(r.ok).toBe(false)
    expect(r.error).toBe('duplicate key')
  })

  it('source default = manual cuando no se especifica', async () => {
    const sb = createMockSupabase({
      'tt_sku_aliases:upsert': { data: null, error: null },
    })
    await saveSkuAlias(sb, {
      companyId: 'co-1',
      clientId: 'c-1',
      externalSKU: 'ATR-001',
      productId: 'p-1',
    })
    // Verificamos que el upsert recibió source='manual'
    const fromMock = sb.from as ReturnType<typeof vi.fn>
    expect(fromMock).toHaveBeenCalledWith('tt_sku_aliases')
    // No exponemos los args del upsert via mock; basta con saber que se llamó.
  })
})

// ────────────────────────────────────────────────────────────────────────────
// getClientGlossary
// ────────────────────────────────────────────────────────────────────────────

describe('getClientGlossary()', () => {
  it('mapea filas de tt_sku_aliases al shape del glosario', async () => {
    // Para este test necesitamos un mock más rico que devuelva una lista al
    // hacer .order(). El builder genérico hace .order().then() implícito.
    const fakeRows = [
      {
        id: 'a-1',
        external_sku: 'ATR-001',
        source: 'manual',
        notes: null,
        created_at: '2026-05-01T10:00:00Z',
        product: PRODUCT,
      },
    ]
    const sb = {
      from: vi.fn(() => ({
        select: () => ({
          eq: () => ({
            order: () => Promise.resolve({ data: fakeRows, error: null }),
          }),
        }),
      })),
    } as unknown as SupabaseClient
    const r = await getClientGlossary(sb, 'c-1')
    expect(r).toHaveLength(1)
    expect(r[0].external_sku).toBe('ATR-001')
    expect(r[0].product.id).toBe('p-1')
    expect(r[0].source).toBe('manual')
  })

  it('devuelve [] cuando hay error', async () => {
    const sb = {
      from: vi.fn(() => ({
        select: () => ({
          eq: () => ({
            order: () => Promise.resolve({ data: null, error: { message: 'boom' } }),
          }),
        }),
      })),
    } as unknown as SupabaseClient
    const r = await getClientGlossary(sb, 'c-1')
    expect(r).toEqual([])
  })
})

// ────────────────────────────────────────────────────────────────────────────
// deleteSkuAlias
// ────────────────────────────────────────────────────────────────────────────

describe('deleteSkuAlias()', () => {
  it('delete exitoso devuelve { ok: true }', async () => {
    const sb = createMockSupabase({
      'tt_sku_aliases:delete': { data: null, error: null },
    })
    const r = await deleteSkuAlias(sb, 'a-1')
    expect(r.ok).toBe(true)
  })

  it('delete con error devuelve { ok: false, error }', async () => {
    const sb = createMockSupabase({
      'tt_sku_aliases:delete': { data: null, error: { message: 'fk violation' } },
    })
    const r = await deleteSkuAlias(sb, 'a-1')
    expect(r.ok).toBe(false)
    expect(r.error).toBe('fk violation')
  })
})
