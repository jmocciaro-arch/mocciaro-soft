'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'

export function WidgetWelcome() {
  const [stats, setStats] = useState({ products: 0, clients: 0, quotes: 0 })
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    async function load() {
      try {
        const supabase = createClient()
        const now = new Date()
        const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1).toISOString()

        const [p, c, qLocal, qDoc] = await Promise.all([
          supabase.from('tt_products').select('*', { count: 'exact', head: true }),
          supabase.from('tt_clients').select('*', { count: 'exact', head: true }),
          supabase.from('tt_quotes').select('*', { count: 'exact', head: true }).gte('created_at', startOfMonth),
          supabase.from('tt_documents').select('*', { count: 'exact', head: true }).eq('type', 'coti').gte('created_at', startOfMonth),
        ])

        setStats({
          products: p.count ?? 0,
          clients: c.count ?? 0,
          quotes: (qLocal.count ?? 0) + (qDoc.count ?? 0),
        })
      } catch {
        // silently fail
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [])

  const now = new Date()
  const hour = now.getHours()
  const greeting = hour < 12 ? 'Buenos dias' : hour < 19 ? 'Buenas tardes' : 'Buenas noches'
  const dateStr = now.toLocaleDateString('es-AR', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  })

  return (
    <div className="flex flex-col justify-between h-full">
      <div>
        <h2 className="text-xl font-bold text-[#F0F2F5]">{greeting}, Juan</h2>
        <p className="text-xs text-[#6B7280] mt-0.5 capitalize">{dateStr}</p>
        <p className="text-[11px] text-[#4B5563] mt-1">Mocciaro Soft &middot; Administrador</p>
      </div>

      {!loading && (
        <div className="flex gap-4 mt-3">
          <div className="text-center">
            <p className="text-lg font-bold text-[#FF6600]">{stats.products}</p>
            <p className="text-[10px] text-[#6B7280]">Productos</p>
          </div>
          <div className="text-center">
            <p className="text-lg font-bold text-[#3B82F6]">{stats.clients}</p>
            <p className="text-[10px] text-[#6B7280]">Clientes</p>
          </div>
          <div className="text-center">
            <p className="text-lg font-bold text-[#10B981]">{stats.quotes}</p>
            <p className="text-[10px] text-[#6B7280]">Cotiz. mes</p>
          </div>
        </div>
      )}
    </div>
  )
}
