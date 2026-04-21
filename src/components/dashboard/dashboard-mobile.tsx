'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import {
  Plus, Search, Users, Package, ShoppingCart, Wrench,
  FileText, Truck, CreditCard, AlertTriangle, ArrowRight,
} from 'lucide-react'
import { createClient } from '@/lib/supabase/client'

interface Stats {
  products: number
  clients: number
  quotesMonth: number
  pendingDeliveries: number
  pendingCollection: number
  stockAlerts: number
}

interface RecentQuote {
  id: string
  number: string | null
  client_name: string
  total: number
  currency: string
  created_at: string
  status: string
}

export function DashboardMobile() {
  const router = useRouter()
  const [stats, setStats] = useState<Stats>({
    products: 0, clients: 0, quotesMonth: 0,
    pendingDeliveries: 0, pendingCollection: 0, stockAlerts: 0,
  })
  const [quotes, setQuotes] = useState<RecentQuote[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    async function load() {
      try {
        const supabase = createClient()
        const now = new Date()
        const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1).toISOString()

        const [pRes, cRes, qRes, qDocRes, recentQ, ordersRes, collRes] = await Promise.all([
          supabase.from('tt_products').select('*', { count: 'exact', head: true }),
          supabase.from('tt_clients').select('*', { count: 'exact', head: true }),
          supabase.from('tt_quotes').select('*', { count: 'exact', head: true }).gte('created_at', startOfMonth),
          supabase.from('tt_documents').select('*', { count: 'exact', head: true }).eq('type', 'coti').gte('created_at', startOfMonth),
          supabase.from('tt_quotes').select('id,number,total,currency,created_at,status,client:tt_clients(name)').order('created_at', { ascending: false }).limit(5),
          supabase.from('tt_sales_orders').select('*', { count: 'exact', head: true }).eq('status', 'open'),
          supabase.from('tt_documents').select('total,paid_amount').eq('type', 'factura').neq('status', 'cobrada'),
        ])

        const pendingCollection = (collRes.data || []).reduce((sum, d: { total: number | null; paid_amount: number | null }) =>
          sum + ((d.total || 0) - (d.paid_amount || 0)), 0)

        setStats({
          products: pRes.count ?? 0,
          clients: cRes.count ?? 0,
          quotesMonth: (qRes.count ?? 0) + (qDocRes.count ?? 0),
          pendingDeliveries: ordersRes.count ?? 0,
          pendingCollection,
          stockAlerts: 0,
        })

        setQuotes((recentQ.data || []).map((q: {
          id: string; number: string | null; total: number; currency: string;
          created_at: string; status: string; client: { name: string } | { name: string }[] | null;
        }) => ({
          id: q.id,
          number: q.number,
          total: q.total,
          currency: q.currency,
          created_at: q.created_at,
          status: q.status,
          client_name: (Array.isArray(q.client) ? q.client[0]?.name : q.client?.name) || 'Sin cliente',
        })))
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

  const actions = [
    { label: 'Nueva cotizacion', icon: Plus, href: '/cotizador', color: '#FF6600', primary: true },
    { label: 'Buscar producto', icon: Search, href: '/catalogo', color: '#3B82F6' },
    { label: 'Nuevo pedido', icon: ShoppingCart, href: '/ventas?tab=pedidos', color: '#8B5CF6' },
    { label: 'Ver stock', icon: Package, href: '/stock', color: '#F59E0B' },
    { label: 'Clientes', icon: Users, href: '/clientes', color: '#10B981' },
    { label: 'Ticket SAT', icon: Wrench, href: '/sat', color: '#EF4444' },
  ]

  const statusColors: Record<string, string> = {
    borrador: 'bg-slate-500/20 text-slate-400',
    draft: 'bg-slate-500/20 text-slate-400',
    enviada: 'bg-blue-500/20 text-blue-400',
    aceptada: 'bg-green-500/20 text-green-400',
    rechazada: 'bg-red-500/20 text-red-400',
  }

  return (
    <div className="space-y-5">
      {/* Saludo compacto */}
      <div>
        <h1 className="text-2xl font-bold text-[#F0F2F5]">{greeting}, Juan 👋</h1>
        <p className="text-sm text-[#6B7280] mt-0.5">{now.toLocaleDateString('es-AR', { weekday: 'long', day: 'numeric', month: 'long' })}</p>
      </div>

      {/* KPIs horizontales compactos — scroll si hay muchos */}
      <div className="grid grid-cols-3 gap-2">
        <div className="bg-[#141820] border border-[#1E2330] rounded-xl p-3">
          <div className="text-2xl font-bold text-[#FF6600]">
            {loading ? '—' : stats.products.toLocaleString('es-AR')}
          </div>
          <div className="text-[11px] text-[#6B7280] mt-0.5">Productos</div>
        </div>
        <div className="bg-[#141820] border border-[#1E2330] rounded-xl p-3">
          <div className="text-2xl font-bold text-blue-400">
            {loading ? '—' : stats.clients.toLocaleString('es-AR')}
          </div>
          <div className="text-[11px] text-[#6B7280] mt-0.5">Clientes</div>
        </div>
        <div className="bg-[#141820] border border-[#1E2330] rounded-xl p-3">
          <div className="text-2xl font-bold text-green-400">
            {loading ? '—' : stats.quotesMonth.toLocaleString('es-AR')}
          </div>
          <div className="text-[11px] text-[#6B7280] mt-0.5">Cotiz. mes</div>
        </div>
      </div>

      {/* Alertas de cobranzas pendientes */}
      {!loading && stats.pendingCollection > 0 && (
        <Link
          href="/cobros"
          className="flex items-center gap-3 p-4 rounded-xl bg-amber-500/10 border border-amber-500/30 hover:bg-amber-500/15 transition-colors"
        >
          <div className="p-2 rounded-lg bg-amber-500/20">
            <AlertTriangle size={22} className="text-amber-400" />
          </div>
          <div className="flex-1 min-w-0">
            <div className="text-sm font-semibold text-amber-400">Cobranzas pendientes</div>
            <div className="text-lg font-bold text-[#F0F2F5]">
              {stats.pendingCollection.toLocaleString('es-AR', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 })}
            </div>
          </div>
          <ArrowRight size={18} className="text-amber-400" />
        </Link>
      )}

      {/* Acciones rapidas — grid 2x3 con botones grandes */}
      <div>
        <h2 className="text-sm font-semibold text-[#F0F2F5] mb-3 uppercase tracking-wider">Acciones rapidas</h2>
        <div className="grid grid-cols-2 gap-3">
          {actions.map(a => {
            const Icon = a.icon
            return (
              <button
                key={a.label}
                onClick={() => router.push(a.href)}
                className={`flex items-center gap-3 p-4 rounded-xl border transition-all active:scale-95 ${
                  a.primary
                    ? 'bg-[#FF6600] border-[#FF6600] text-white shadow-lg shadow-orange-500/25'
                    : 'bg-[#141820] border-[#1E2330] text-[#F0F2F5] hover:border-[#2A3040]'
                }`}
              >
                <div
                  className={`p-2 rounded-lg ${a.primary ? 'bg-white/20' : ''}`}
                  style={!a.primary ? { backgroundColor: `${a.color}20` } : undefined}
                >
                  <Icon size={22} style={{ color: a.primary ? '#fff' : a.color }} />
                </div>
                <span className="text-sm font-medium text-left leading-tight flex-1">
                  {a.label}
                </span>
              </button>
            )
          })}
        </div>
      </div>

      {/* Ultimas cotizaciones — cards compactas */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-sm font-semibold text-[#F0F2F5] uppercase tracking-wider">Ultimas cotizaciones</h2>
          <Link href="/cotizador" className="text-xs text-[#FF6600] font-medium">
            Ver todas →
          </Link>
        </div>
        {loading ? (
          <div className="space-y-2">
            {[...Array(3)].map((_, i) => (
              <div key={i} className="h-20 bg-[#141820] border border-[#1E2330] rounded-xl animate-pulse" />
            ))}
          </div>
        ) : quotes.length === 0 ? (
          <div className="p-6 bg-[#141820] border border-[#1E2330] rounded-xl text-center">
            <FileText size={28} className="mx-auto text-[#6B7280] mb-2" />
            <p className="text-sm text-[#6B7280]">Sin cotizaciones aun</p>
            <Link href="/cotizador" className="text-xs text-[#FF6600] font-medium mt-2 inline-block">
              Crear la primera →
            </Link>
          </div>
        ) : (
          <div className="space-y-2">
            {quotes.map(q => {
              const statusClass = statusColors[q.status] || 'bg-slate-500/20 text-slate-400'
              const date = new Date(q.created_at).toLocaleDateString('es-AR', { day: '2-digit', month: 'short' })
              return (
                <Link
                  key={q.id}
                  href={`/cotizador?id=${q.id}`}
                  className="block p-4 rounded-xl bg-[#141820] border border-[#1E2330] hover:border-[#2A3040] transition-colors"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-bold text-[#F0F2F5]">{q.number || 'Sin numero'}</span>
                        <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-semibold ${statusClass}`}>
                          {q.status}
                        </span>
                      </div>
                      <div className="text-xs text-[#9CA3AF] mt-1 truncate">{q.client_name}</div>
                    </div>
                    <div className="text-right shrink-0">
                      <div className="text-sm font-bold text-[#F0F2F5]">
                        {q.total.toLocaleString('es-AR', { style: 'currency', currency: q.currency || 'EUR', maximumFractionDigits: 0 })}
                      </div>
                      <div className="text-[11px] text-[#6B7280] mt-0.5">{date}</div>
                    </div>
                  </div>
                </Link>
              )
            })}
          </div>
        )}
      </div>

      {/* Atajos secundarios */}
      <div className="grid grid-cols-3 gap-2">
        <Link href="/ventas?tab=albaranes" className="flex flex-col items-center gap-1 p-3 rounded-xl bg-[#141820] border border-[#1E2330]">
          <Truck size={20} className="text-cyan-400" />
          <span className="text-[11px] text-[#9CA3AF]">Albaranes</span>
        </Link>
        <Link href="/ventas?tab=facturas" className="flex flex-col items-center gap-1 p-3 rounded-xl bg-[#141820] border border-[#1E2330]">
          <CreditCard size={20} className="text-emerald-400" />
          <span className="text-[11px] text-[#9CA3AF]">Facturas</span>
        </Link>
        <Link href="/compras?tab=pedidos" className="flex flex-col items-center gap-1 p-3 rounded-xl bg-[#141820] border border-[#1E2330]">
          <ShoppingCart size={20} className="text-violet-400" />
          <span className="text-[11px] text-[#9CA3AF]">Compras</span>
        </Link>
      </div>
    </div>
  )
}
