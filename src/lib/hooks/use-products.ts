'use client'

import { useSupabase } from './use-supabase'

interface ProductRow {
  id: string
  sku: string
  name: string
  brand: string | null
  category: string | null
  price_eur: number | null
  cost_eur: number | null
  active: boolean | null
  product_type: string
}

/**
 * Lista de productos del catálogo (compartido entre todas las companies).
 * Cache largo — el catálogo cambia con poca frecuencia.
 */
export function useProducts(opts: { search?: string; limit?: number } = {}) {
  const { search, limit = 500 } = opts
  return useSupabase<ProductRow[]>(
    ['products', search ?? '', limit],
    async (sb) => {
      let q = sb
        .from('tt_products')
        .select('id, sku, name, brand, category, price_eur, cost_eur, active, product_type')
        .eq('active', true)
        .order('name')
        .limit(limit)
      if (search && search.trim().length > 0) {
        // Usa el índice GIN trigram en name (creado en Fase 0)
        q = q.ilike('name', `%${search.trim()}%`)
      }
      return q
    },
    { dedupingInterval: 30_000 } // catálogo cambia poco — dedup 30s
  )
}
