'use client'

import { useState, useEffect, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import { normalizeModel } from '@/lib/sat/fein-data'

/**
 * Catalogo de repuestos FEIN — vive en tt_products con category='Repuestos FEIN'.
 * Campos POS, codigo FEIN y modelos compatibles en specs JSONB.
 */

export interface SparePart {
  id: string
  sku: string
  codigo: string | null          // specs.codigo_fein
  pos: string | null             // specs.pos
  descripcion: string            // tt_products.name
  tipo: 'repuesto' | 'accesorio' | 'consumible' | 'otro'
  modelos: string[]              // specs.modelos_compatibles
  precio_eur: number             // tt_products.price_eur
  precio_venta: number           // tt_products.price_usd
  img_url: string | null
  is_custom: boolean
  active: boolean
}

export interface SparePartsFilters {
  search?: string
  model?: string
  tipo?: 'repuesto' | 'accesorio' | 'consumible' | 'otro'
  onlyActive?: boolean
}

const CATEGORY = 'Repuestos FEIN'

type ProductRow = {
  id: string
  sku: string
  name: string
  description: string | null
  brand: string | null
  category: string | null
  subcategory: string | null
  price_eur: number | null
  price_usd: number | null
  cost_eur: number | null
  image_url: string | null
  modelo: string | null
  specs: Record<string, unknown> | null
  active: boolean | null
}

function rowToSparePart(r: ProductRow): SparePart {
  const specs = (r.specs || {}) as Record<string, unknown>
  return {
    id: r.id,
    sku: r.sku,
    codigo: (specs.codigo_fein as string) || null,
    pos: (specs.pos as string) || null,
    descripcion: r.name,
    tipo: ((specs.tipo as SparePart['tipo']) || (r.subcategory as SparePart['tipo']) || 'repuesto'),
    modelos: ((specs.modelos_compatibles as string[]) || (r.modelo ? r.modelo.split(/,\s*/) : [])) as string[],
    precio_eur: r.price_eur ?? r.cost_eur ?? 0,
    precio_venta: r.price_usd ?? 0,
    img_url: r.image_url,
    is_custom: (specs.origen as string) !== 'fein_sat_migration',
    active: r.active !== false,
  }
}

export function useSpareParts(filters: SparePartsFilters = {}) {
  const [parts, setParts] = useState<SparePart[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    const sb = createClient()

    let q = sb
      .from('tt_products')
      .select('id, sku, name, description, brand, category, subcategory, price_eur, price_usd, cost_eur, image_url, modelo, specs, active')
      .eq('category', CATEGORY)

    if (filters.onlyActive !== false) q = q.eq('active', true)
    q = q.order('sku', { ascending: true }).limit(5000)

    const { data, error } = await q
    if (error) {
      setError(error.message)
      setParts([])
    } else {
      let list = (data || []).map((r) => rowToSparePart(r as ProductRow))
      if (filters.tipo) list = list.filter((p) => p.tipo === filters.tipo)
      if (filters.model) {
        const norm = normalizeModel(filters.model)
        list = list.filter((p) => (p.modelos || []).some((m) => normalizeModel(m) === norm))
      }
      if (filters.search) {
        const s = filters.search.toLowerCase()
        list = list.filter((p) =>
          [p.descripcion, p.codigo, p.pos, p.sku].some((v) => (v || '').toLowerCase().includes(s))
        )
      }
      setParts(list)
    }
    setLoading(false)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filters.search, filters.model, filters.tipo, filters.onlyActive])

  useEffect(() => { load() }, [load])

  const save = useCallback(async (part: Partial<SparePart>) => {
    const sb = createClient()
    const row = {
      sku: part.sku,
      name: part.descripcion,
      brand: 'FEIN',
      category: CATEGORY,
      subcategory: part.tipo || 'repuesto',
      price_eur: part.precio_eur ?? 0,
      cost_eur: part.precio_eur ?? 0,
      price_usd: part.precio_venta ?? 0,
      image_url: part.img_url || null,
      modelo: (part.modelos || []).join(', '),
      specs: {
        pos: part.pos,
        codigo_fein: part.codigo,
        modelos_compatibles: part.modelos || [],
        tipo: part.tipo || 'repuesto',
      } as any,
      active: part.active !== false,
    }
    if (part.id) {
      const { error } = await sb.from('tt_products').update(row as any).eq('id', part.id)
      if (error) throw error
    } else {
      const { error } = await sb.from('tt_products').insert(row as any)
      if (error) throw error
    }
    await load()
  }, [load])

  const remove = useCallback(async (id: string) => {
    const sb = createClient()
    const { error } = await sb.from('tt_products').delete().eq('id', id)
    if (error) throw error
    await load()
  }, [load])

  const bulkAdjust = useCallback(async (percent: number, direction: 'up' | 'down') => {
    const factor = direction === 'up' ? 1 + percent / 100 : 1 - percent / 100
    const sb = createClient()
    for (let i = 0; i < parts.length; i += 50) {
      const batch = parts.slice(i, i + 50)
      await Promise.all(
        batch.map((p) =>
          sb.from('tt_products')
            .update({ price_usd: Math.round(p.precio_venta * factor * 100) / 100 })
            .eq('id', p.id)
        )
      )
    }
    await load()
    return parts.length
  }, [parts, load])

  return { parts, loading, error, reload: load, save, remove, bulkAdjust }
}
