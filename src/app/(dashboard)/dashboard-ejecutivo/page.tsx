'use client'

/**
 * Dashboard Ejecutivo — KPIs reales del negocio con comparativa MoM/YoY.
 * Estilo Salesforce / Stripe / HubSpot.
 */

import { useEffect, useState, useCallback, useMemo } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Card } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  TrendingUp, TrendingDown, DollarSign, Users, Package, FileText,
  Receipt, ShoppingCart, AlertTriangle, RefreshCw, BarChart3, ArrowUp, ArrowDown,
  Target, Activity, Clock,
} from 'lucide-react'

interface KpiData {
  current: number
  previous: number
  count_current: number
  count_previous: number
}

interface DashboardData {
  facturado: KpiData
  cotizado: KpiData
  pedidos: KpiData
  clientes_activos: number
  clientes_nuevos: number
  productos_total: number
  ocs_pendientes: number
  deuda_vencida: number
  deuda_total: number
  topClientsByInvoiced: Array<{ id: string; name: string; total: number }>
  topProductsBySold: Array<{ sku: string; name: string; count: number }>
  recentActivity: Array<{ action: string; description: string; created_at: string }>
}

const PERIODS = [
  { id: '7d',   label: '7 días',  days: 7 },
  { id: '30d',  label: '30 días', days: 30 },
  { id: '90d',  label: '90 días', days: 90 },
  { id: '1y',   label: '1 año',   days: 365 },
]

export default function DashboardEjecutivo() {
  const [data, setData] = useState<DashboardData | null>(null)
  const [loading, setLoading] = useState(true)
  const [period, setPeriod] = useState<'7d' | '30d' | '90d' | '1y'>('30d')

  const load = useCallback(async () => {
    setLoading(true)
    const sb = createClient()
    const days = PERIODS.find(p => p.id === period)?.days || 30
    const now = new Date()
    const fromCurrent = new Date(now.getTime() - days * 24 * 3600e3).toISOString()
    const fromPrevious = new Date(now.getTime() - 2 * days * 24 * 3600e3).toISOString()

    // Facturado actual y anterior
    const [facCur, facPrev, cotCur, cotPrev, pedCur, pedPrev,
           clientes, clientesNuevos, productos, ocsPend, deudas, topClientes, topProductos, recentAct] = await Promise.all([
      sb.from('tt_documents').select('total').eq('doc_type', 'factura').gte('created_at', fromCurrent),
      sb.from('tt_documents').select('total').eq('doc_type', 'factura').gte('created_at', fromPrevious).lt('created_at', fromCurrent),
      sb.from('tt_documents').select('total').eq('doc_type', 'cotizacion').gte('created_at', fromCurrent),
      sb.from('tt_documents').select('total').eq('doc_type', 'cotizacion').gte('created_at', fromPrevious).lt('created_at', fromCurrent),
      sb.from('tt_documents').select('total').eq('doc_type', 'pedido').gte('created_at', fromCurrent),
      sb.from('tt_documents').select('total').eq('doc_type', 'pedido').gte('created_at', fromPrevious).lt('created_at', fromCurrent),
      sb.from('tt_clients').select('id', { count: 'exact', head: true }).eq('active', true),
      sb.from('tt_clients').select('id', { count: 'exact', head: true }).gte('created_at', fromCurrent),
      sb.from('tt_products').select('id', { count: 'exact', head: true }).eq('active', true),
      sb.from('tt_oc_parsed').select('id', { count: 'exact', head: true }).neq('deletion_status', 'deleted').eq('status', 'pending'),
      sb.from('tt_documents').select('total, status, created_at').eq('doc_type', 'factura').not('status', 'in', '("paid","pagada","closed")'),
      sb.from('tt_documents')
        .select('client_id, total, client:tt_clients(name)')
        .eq('doc_type', 'factura')
        .gte('created_at', fromCurrent)
        .not('client_id', 'is', null)
        .limit(1000),
      sb.from('tt_document_lines')
        .select('sku, description, quantity')
        .gte('created_at', fromCurrent)
        .not('sku', 'is', null)
        .limit(2000),
      sb.from('tt_activity_log').select('action, description, created_at').order('created_at', { ascending: false }).limit(10),
    ])

    const sum = (rows: Array<{ total: number | null }> | null | undefined) =>
      (rows || []).reduce((s, r) => s + Number(r.total || 0), 0)

    // Top clientes por facturación
    const byClient: Record<string, { id: string; name: string; total: number }> = {}
    for (const r of (topClientes.data || []) as unknown as Array<{ client_id: string; total: number; client: { name: string }[] | { name: string } | null }>) {
      const key = r.client_id
      const clientName = Array.isArray(r.client) ? r.client[0]?.name : r.client?.name
      if (!byClient[key]) byClient[key] = { id: key, name: clientName || '?', total: 0 }
      byClient[key].total += Number(r.total || 0)
    }
    const topClientsByInvoiced = Object.values(byClient).sort((a, b) => b.total - a.total).slice(0, 10)

    // Top productos por cantidad vendida
    const byProduct: Record<string, { sku: string; name: string; count: number }> = {}
    for (const r of (topProductos.data || []) as Array<{ sku: string; description: string; quantity: number }>) {
      const key = r.sku
      if (!byProduct[key]) byProduct[key] = { sku: r.sku, name: r.description, count: 0 }
      byProduct[key].count += Number(r.quantity || 0)
    }
    const topProductsBySold = Object.values(byProduct).sort((a, b) => b.count - a.count).slice(0, 10)

    // Deuda vencida (>30 días sin pagar)
    const ahora = Date.now()
    const deudaVencida = ((deudas.data || []) as Array<{ total: number; created_at: string }>)
      .filter(d => (ahora - new Date(d.created_at).getTime()) > 30 * 24 * 3600e3)
      .reduce((s, d) => s + Number(d.total || 0), 0)
    const deudaTotal = sum(deudas.data as Array<{ total: number | null }> | null)

    setData({
      facturado:        { current: sum(facCur.data), previous: sum(facPrev.data), count_current: facCur.data?.length || 0, count_previous: facPrev.data?.length || 0 },
      cotizado:         { current: sum(cotCur.data), previous: sum(cotPrev.data), count_current: cotCur.data?.length || 0, count_previous: cotPrev.data?.length || 0 },
      pedidos:          { current: sum(pedCur.data), previous: sum(pedPrev.data), count_current: pedCur.data?.length || 0, count_previous: pedPrev.data?.length || 0 },
      clientes_activos: clientes.count || 0,
      clientes_nuevos:  clientesNuevos.count || 0,
      productos_total:  productos.count || 0,
      ocs_pendientes:   ocsPend.count || 0,
      deuda_vencida:    deudaVencida,
      deuda_total:      deudaTotal,
      topClientsByInvoiced,
      topProductsBySold,
      recentActivity:   (recentAct.data || []) as Array<{ action: string; description: string; created_at: string }>,
    })
    setLoading(false)
  }, [period])

  useEffect(() => { void load() }, [load])

  const conversionRate = useMemo(() => {
    if (!data) return 0
    if (!data.cotizado.count_current) return 0
    return (data.pedidos.count_current / data.cotizado.count_current) * 100
  }, [data])

  if (loading || !data) {
    return <div className="text-center py-12 text-[#6B7280]">Cargando dashboard...</div>
  }

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold text-[#F0F2F5] flex items-center gap-2">
            <BarChart3 size={22} className="text-[#FF6600]" /> Dashboard Ejecutivo
          </h1>
          <p className="text-sm text-[#6B7280] mt-1">KPIs en tiempo real con comparativa al período anterior.</p>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex items-center rounded-lg border border-[#1E2330] bg-[#0F1218] overflow-hidden">
            {PERIODS.map(p => (
              <button
                key={p.id}
                onClick={() => setPeriod(p.id as '7d' | '30d' | '90d' | '1y')}
                className={`px-3 py-1.5 text-xs font-semibold transition ${
                  period === p.id ? 'bg-[#FF6600] text-white' : 'text-[#9CA3AF] hover:text-[#F0F2F5]'
                }`}
              >
                {p.label}
              </button>
            ))}
          </div>
          <Button variant="secondary" size="sm" onClick={load}>
            <RefreshCw size={12} /> Refrescar
          </Button>
        </div>
      </div>

      {/* KPI grid principal — 4 columnas */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <KPICard
          label="Facturado"
          value={`$${data.facturado.current.toLocaleString('es-AR', { maximumFractionDigits: 0 })}`}
          previous={data.facturado.previous}
          current={data.facturado.current}
          icon={<Receipt size={16} />}
          tone="emerald"
          sub={`${data.facturado.count_current} facturas`}
        />
        <KPICard
          label="Cotizado"
          value={`$${data.cotizado.current.toLocaleString('es-AR', { maximumFractionDigits: 0 })}`}
          previous={data.cotizado.previous}
          current={data.cotizado.current}
          icon={<FileText size={16} />}
          tone="blue"
          sub={`${data.cotizado.count_current} cotizaciones`}
        />
        <KPICard
          label="Pedidos"
          value={`$${data.pedidos.current.toLocaleString('es-AR', { maximumFractionDigits: 0 })}`}
          previous={data.pedidos.previous}
          current={data.pedidos.current}
          icon={<ShoppingCart size={16} />}
          tone="violet"
          sub={`${data.pedidos.count_current} pedidos`}
        />
        <KPICard
          label="Conversión"
          value={`${conversionRate.toFixed(1)}%`}
          icon={<Target size={16} />}
          tone="orange"
          sub="Pedidos / Cotizaciones"
          static
        />
      </div>

      {/* Secundarios */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <SecondaryKPI
          icon={<Users size={14} />}
          label="Clientes activos"
          value={data.clientes_activos.toLocaleString('es-AR')}
          sub={data.clientes_nuevos > 0 ? `+${data.clientes_nuevos} nuevos` : 'sin nuevos'}
        />
        <SecondaryKPI
          icon={<Package size={14} />}
          label="Productos en catálogo"
          value={data.productos_total.toLocaleString('es-AR')}
        />
        <SecondaryKPI
          icon={<AlertTriangle size={14} />}
          label="OCs pendientes"
          value={data.ocs_pendientes.toString()}
          tone={data.ocs_pendientes > 0 ? 'orange' : 'gray'}
        />
        <SecondaryKPI
          icon={<DollarSign size={14} />}
          label="Deuda vencida"
          value={`$${data.deuda_vencida.toLocaleString('es-AR', { maximumFractionDigits: 0 })}`}
          sub={`Total pendiente: $${data.deuda_total.toLocaleString('es-AR', { maximumFractionDigits: 0 })}`}
          tone={data.deuda_vencida > 0 ? 'red' : 'gray'}
        />
      </div>

      {/* Top clientes + Top productos */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Card className="p-0 overflow-hidden">
          <div className="p-3 border-b border-[#1E2330]">
            <strong className="text-sm text-[#F0F2F5] flex items-center gap-2">
              <Users size={14} className="text-[#FF6600]" /> Top 10 clientes por facturación
            </strong>
            <p className="text-[10px] text-[#6B7280] mt-0.5">Período: {PERIODS.find(p => p.id === period)?.label}</p>
          </div>
          {data.topClientsByInvoiced.length === 0 ? (
            <div className="p-6 text-center text-[#6B7280] text-sm">Sin facturación en el período</div>
          ) : (
            <div className="divide-y divide-[#1E2330]">
              {data.topClientsByInvoiced.map((c, i) => {
                const pct = (c.total / data.topClientsByInvoiced[0].total) * 100
                return (
                  <div key={c.id} className="p-3 hover:bg-[#141820]">
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-xs text-[#6B7280] font-mono w-5">#{i + 1}</span>
                      <span className="flex-1 text-sm text-[#F0F2F5] truncate">{c.name}</span>
                      <span className="text-sm font-bold font-mono text-emerald-400">${c.total.toLocaleString('es-AR', { maximumFractionDigits: 0 })}</span>
                    </div>
                    <div className="mt-1 h-1 rounded-full bg-[#1E2330] overflow-hidden">
                      <div className="h-full bg-emerald-400 rounded-full" style={{ width: `${pct}%` }} />
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </Card>

        <Card className="p-0 overflow-hidden">
          <div className="p-3 border-b border-[#1E2330]">
            <strong className="text-sm text-[#F0F2F5] flex items-center gap-2">
              <Package size={14} className="text-[#FF6600]" /> Top 10 productos vendidos
            </strong>
            <p className="text-[10px] text-[#6B7280] mt-0.5">Por cantidad de unidades</p>
          </div>
          {data.topProductsBySold.length === 0 ? (
            <div className="p-6 text-center text-[#6B7280] text-sm">Sin ventas en el período</div>
          ) : (
            <div className="divide-y divide-[#1E2330]">
              {data.topProductsBySold.map((p, i) => {
                const pct = (p.count / data.topProductsBySold[0].count) * 100
                return (
                  <div key={p.sku} className="p-3 hover:bg-[#141820]">
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-xs text-[#6B7280] font-mono w-5">#{i + 1}</span>
                      <div className="flex-1 min-w-0">
                        <p className="text-xs font-mono text-[#FF6600]">{p.sku}</p>
                        <p className="text-xs text-[#9CA3AF] truncate">{p.name}</p>
                      </div>
                      <span className="text-sm font-bold font-mono text-blue-400">{p.count.toLocaleString('es-AR')}</span>
                    </div>
                    <div className="mt-1 h-1 rounded-full bg-[#1E2330] overflow-hidden">
                      <div className="h-full bg-blue-400 rounded-full" style={{ width: `${pct}%` }} />
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </Card>
      </div>

      {/* Activity reciente */}
      <Card className="p-0 overflow-hidden">
        <div className="p-3 border-b border-[#1E2330] flex items-center justify-between">
          <strong className="text-sm text-[#F0F2F5] flex items-center gap-2">
            <Activity size={14} className="text-[#FF6600]" /> Última actividad del sistema
          </strong>
          <a href="/actividad" className="text-xs text-[#FF6600] hover:text-[#FF8833]">Ver todo →</a>
        </div>
        {data.recentActivity.length === 0 ? (
          <div className="p-6 text-center text-[#6B7280] text-sm">Sin actividad reciente</div>
        ) : (
          <div className="divide-y divide-[#1E2330]">
            {data.recentActivity.map((a, i) => (
              <div key={i} className="p-3 flex items-center gap-3 hover:bg-[#141820]">
                <Badge variant="default" size="sm">{a.action}</Badge>
                <span className="flex-1 text-xs text-[#D1D5DB] truncate">{a.description || '—'}</span>
                <span className="text-[10px] text-[#6B7280] flex items-center gap-1 shrink-0">
                  <Clock size={10} /> {new Date(a.created_at).toLocaleString('es-AR')}
                </span>
              </div>
            ))}
          </div>
        )}
      </Card>
    </div>
  )
}

// ================================================================
// SUBCOMPONENTES
// ================================================================

function KPICard({ label, value, current, previous, icon, tone, sub, static: isStatic }: {
  label: string
  value: string
  current?: number
  previous?: number
  icon: React.ReactNode
  tone: 'emerald' | 'blue' | 'violet' | 'orange'
  sub?: string
  static?: boolean
}) {
  const variation = isStatic ? null : previous && previous > 0
    ? ((current! - previous) / previous) * 100
    : null
  const isUp = (variation ?? 0) > 0

  const colors = {
    emerald: { border: 'border-emerald-500/30', text: 'text-emerald-400', bg: 'bg-emerald-500/10' },
    blue:    { border: 'border-blue-500/30',    text: 'text-blue-400',    bg: 'bg-blue-500/10' },
    violet:  { border: 'border-violet-500/30',  text: 'text-violet-400',  bg: 'bg-violet-500/10' },
    orange:  { border: 'border-orange-500/30',  text: 'text-orange-400',  bg: 'bg-orange-500/10' },
  }[tone]

  return (
    <div className={`rounded-xl border ${colors.border} bg-[#0F1218] p-4 hover:scale-[1.02] transition`}>
      <div className="flex items-center justify-between">
        <div className={`w-9 h-9 rounded-lg ${colors.bg} flex items-center justify-center ${colors.text}`}>
          {icon}
        </div>
        {variation !== null && (
          <span className={`text-[10px] font-bold flex items-center gap-0.5 ${
            isUp ? 'text-emerald-400' : 'text-red-400'
          }`}>
            {isUp ? <ArrowUp size={10} /> : <ArrowDown size={10} />}
            {Math.abs(variation).toFixed(1)}%
          </span>
        )}
      </div>
      <p className="text-[10px] uppercase tracking-wider text-[#6B7280] mt-3">{label}</p>
      <p className={`text-2xl font-bold ${colors.text} mt-1 font-mono`}>{value}</p>
      {sub && <p className="text-[10px] text-[#4B5563] mt-1">{sub}</p>}
    </div>
  )
}

function SecondaryKPI({ icon, label, value, sub, tone = 'gray' }: {
  icon: React.ReactNode
  label: string
  value: string
  sub?: string
  tone?: 'gray' | 'orange' | 'red'
}) {
  const colors = {
    gray: { text: 'text-[#F0F2F5]', icon: 'text-[#6B7280]' },
    orange: { text: 'text-orange-400', icon: 'text-orange-400' },
    red: { text: 'text-red-400', icon: 'text-red-400' },
  }[tone]
  return (
    <div className="rounded-lg border border-[#1E2330] bg-[#0F1218] p-3">
      <div className={`flex items-center gap-1.5 text-[10px] uppercase tracking-wider ${colors.icon}`}>
        {icon} {label}
      </div>
      <p className={`text-lg font-bold ${colors.text} mt-1 font-mono`}>{value}</p>
      {sub && <p className="text-[10px] text-[#4B5563]">{sub}</p>}
    </div>
  )
}
