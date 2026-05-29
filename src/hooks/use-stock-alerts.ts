'use client'

/**
 * Hook compartido para contar productos con stock bajo el mínimo.
 *
 * tt_stock NO tiene company_id propio — el filtro multi-empresa debería
 * hacerse vía warehouse_id, pero en este KPI traemos solo (quantity, min_quantity)
 * para minimizar payload y agregamos en cliente. Filtramos min_quantity > 0
 * del lado del servidor para no traer filas irrelevantes.
 *
 * Si en algún momento se crea el RPC `count_stock_alerts(p_company_ids uuid[])`,
 * este hook se puede actualizar para usarlo y devolver el conteo directo.
 */

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'

export interface StockAlertsResult {
  count: number
  loading: boolean
  error: boolean
}

export function useStockAlerts(): StockAlertsResult {
  const [count, setCount] = useState(0)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(false)

  useEffect(() => {
    let alive = true
    async function load() {
      try {
        const supabase = createClient()
        // Filtramos min_quantity > 0 server-side; agregamos en cliente porque
        // supabase-js no permite comparar columnas entre sí (quantity < min_quantity).
        const { data, error: e } = await supabase
          .from('tt_stock')
          .select('quantity, min_quantity')
          .gt('min_quantity', 0)

        if (e) throw e

        const alerts = (data || []).filter((item: { quantity: number | null; min_quantity: number | null }) => {
          const minQty = item.min_quantity ?? 0
          return minQty > 0 && (item.quantity || 0) < minQty
        })
        if (alive) setCount(alerts.length)
      } catch {
        if (alive) setError(true)
      } finally {
        if (alive) setLoading(false)
      }
    }
    load()
    return () => { alive = false }
  }, [])

  return { count, loading, error }
}
