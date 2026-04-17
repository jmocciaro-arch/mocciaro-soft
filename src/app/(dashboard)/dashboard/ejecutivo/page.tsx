'use client'

import { useEffect, useState, useCallback } from 'react'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import { useCompanyContext } from '@/lib/company-context'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { DailySummaryCard } from '@/components/ai/daily-summary-card'
import {
  TrendingUp, TrendingDown, DollarSign, FileText, Target, Sparkles,
  AlertTriangle, CheckCircle2, Clock, Users, RefreshCw, BarChart3,
} from 'lucide-react'

interface Stats {
  leadsTotal: number
  leadsHot: number
  opportunitiesOpen: number
  quotesOpen: number
  ordersOpen: number
  invoicesPending: number
  invoicesOverdue: number
  invoicesCollectedMonth: number
  totalMonth: number
  totalLastMonth: number
  topClients: Array<{ name: string; total: number; currency: string }>
  invoicesByStatus: Record<string, number>
  agingBuckets: { d0_30: number; d31_60: number; d61_90: number; d90plus: number }
  currency: string
}

export default function DashboardEjecutivoPage() {
  const { activeCompanyIds, activeCompany } = useCompanyContext()
  const supabase = createClient()
  const [stats, setStats] = useState<Stats | null>(null)
  const [loading, setLoading] = useState(true)

  const load = useCallback(async () => {
    if (activeCompanyIds.length === 0) return
    setLoading(true)
    const now = new Date()
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString()
    const lastMonthStart = new Date(now.getFullYear(), now.getMonth() - 1, 1).toISOString()
    const lastMonthEnd = new Date(now.getFullYear(), now.getMonth(), 0, 23, 59, 59).toISOString()

    const [
      leadsRes, leadsHotRes, oppsRes, quotesRes, ordersRes,
      invPendRes, invOverdueRes, invMonthRes, invLastMonthRes,
      topClientsRes, invByStatusRes,
    ] = await Promise.all([
      supabase.from('tt_leads').select('*', { count: 'exact', head: true }).in('company_id', activeCompanyIds),
      supabase.from('tt_leads').select('*', { count: 'exact', head: true }).in('company_id', activeCompanyIds).eq('ai_temperature', 'hot'),
      supabase.from('tt_opportunities').select('*', { count: 'exact', head: true }).in('company_id', activeCompanyIds).not('stage', 'in', '(ganado,perdido)'),
      supabase.from('tt_quotes').select('*', { count: 'exact', head: true }).in('company_id', activeCompanyIds).in('status', ['draft','borrador','sent','enviada','pending']),
      supabase.from('tt_sales_orders').select('*', { count: 'exact', head: true }).in('company_id', activeCompanyIds).eq('status', 'open'),
      supabase.from('tt_documents').select('total, currency').in('company_id', activeCompanyIds).eq('type', 'factura').in('status', ['emitida','autorizada','pendiente_cobro']),
      supabase.from('tt_documents').select('total, currency, invoice_date').in('company_id', activeCompanyIds).eq('type', 'factura').in('status', ['emitida','autorizada','pendiente_cobro']).lt('invoice_date', new Date(Date.now() - 30*86400000).toISOString()),
      supabase.from('tt_documents').select('total, currency').in('company_id', activeCompanyIds).eq('type', 'factura').eq('status', 'cobrada').gte('updated_at', monthStart),
      supabase.from('tt_documents').select('total, currency').in('company_id', activeCompanyIds).eq('type', 'factura').eq('status', 'cobrada').gte('updated_at', lastMonthStart).lte('updated_at', lastMonthEnd),
      supabase.from('tt_documents').select('total, currency, client:tt_clients(name)').in('company_id', activeCompanyIds).eq('type', 'factura').in('status', ['cobrada','emitida','autorizada']).gte('invoice_date', monthStart).order('total', { ascending: false }).limit(100),
      supabase.from('tt_documents').select('status').in('company_id', activeCompanyIds).eq('type', 'factura'),
    ])

    // Agrupar top clients
    const clientTotals = new Map<string, { total: number; currency: string }>()
    for (const d of (topClientsRes.data || []) as any[]) {
      const name = d.client?.name || 'Sin cliente'
      const c = clientTotals.get(name) || { total: 0, currency: d.currency || 'EUR' }
      c.total += Number(d.total || 0)
      clientTotals.set(name, c)
    }
    const topClients = Array.from(clientTotals.entries())
      .sort((a, b) => b[1].total - a[1].total)
      .slice(0, 5)
      .map(([name, v]) => ({ name, ...v }))

    // Aging
    const aging = { d0_30: 0, d31_60: 0, d61_90: 0, d90plus: 0 }
    for (const inv of (invPendRes.data || []) as any[]) {
      const d = (inv as any).invoice_date ? new Date((inv as any).invoice_date) : new Date()
      const days = Math.floor((Date.now() - d.getTime()) / 86400000)
      const total = Number(inv.total || 0)
      if (days <= 30) aging.d0_30 += total
      else if (days <= 60) aging.d31_60 += total
      else if (days <= 90) aging.d61_90 += total
      else aging.d90plus += total
    }

    // Status counts
    const invByStatus: Record<string, number> = {}
    for (const d of (invByStatusRes.data || []) as any[]) {
      invByStatus[d.status] = (invByStatus[d.status] || 0) + 1
    }

    const sum = (rows: any[]) => (rows || []).reduce((s, r) => s + Number(r.total || 0), 0)

    setStats({
      leadsTotal: leadsRes.count || 0,
      leadsHot: leadsHotRes.count || 0,
      opportunitiesOpen: oppsRes.count || 0,
      quotesOpen: quotesRes.count || 0,
      ordersOpen: ordersRes.count || 0,
      invoicesPending: invPendRes.data?.length || 0,
      invoicesOverdue: invOverdueRes.data?.length || 0,
      invoicesCollectedMonth: invMonthRes.data?.length || 0,
      totalMonth: sum(invMonthRes.data || []),
      totalLastMonth: sum(invLastMonthRes.data || []),
      topClients,
      invoicesByStatus: invByStatus,
      agingBuckets: aging,
      currency: (activeCompany as any)?.currency || 'EUR',
    })
    setLoading(false)
  }, [activeCompanyIds, activeCompany])

  useEffect(() => { void load() }, [load])

  const mom = stats && stats.totalLastMonth > 0
    ? ((stats.totalMonth - stats.totalLastMonth) / stats.totalLastMonth) * 100
    : null

  function fmt(v: number, cur = stats?.currency || 'EUR') {
    return `${cur === 'EUR' ? '€' : cur === 'ARS' ? '$' : '$'}${v.toLocaleString('es-AR', { maximumFractionDigits: 0 })}`
  }

  return (
    <div className="p-6 space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <BarChart3 className="w-6 h-6" /> Dashboard Ejecutivo
          </h1>
          <p className="text-sm opacity-60">
            {activeCompany?.name || 'Todas las empresas'} · {new Date().toLocaleDateString('es-AR', { dateStyle: 'full' })}
          </p>
        </div>
        <Button variant="secondary" onClick={load} disabled={loading}>
          <RefreshCw className={`w-4 h-4 mr-1 ${loading ? 'animate-spin' : ''}`} /> Refrescar
        </Button>
      </div>

      {loading || !stats ? (
        <div className="grid grid-cols-4 gap-3">
          {[1,2,3,4,5,6,7,8].map(i => <div key={i} className="h-24 rounded-lg animate-pulse" style={{ background: '#1E2330' }} />)}
        </div>
      ) : (
        <>
          {/* KPIs principales */}
          <div className="grid grid-cols-4 gap-3">
            <KPI
              icon={<DollarSign />}
              label="Cobrado este mes"
              value={fmt(stats.totalMonth)}
              subtitle={mom != null ? <span style={{ color: mom >= 0 ? '#10b981' : '#ef4444' }}>{mom >= 0 ? '↑' : '↓'} {Math.abs(mom).toFixed(1)}% vs mes anterior</span> : undefined}
              color="#10b981"
            />
            <KPI
              icon={<Clock />}
              label="Por cobrar"
              value={String(stats.invoicesPending)}
              subtitle={`${stats.invoicesOverdue} vencidas`}
              color={stats.invoicesOverdue > 0 ? '#ef4444' : '#f97316'}
              href="/ventas?tab=facturas"
            />
            <KPI
              icon={<Sparkles />}
              label="Leads HOT"
              value={String(stats.leadsHot)}
              subtitle={`de ${stats.leadsTotal} total`}
              color="#ef4444"
              href="/crm/leads"
            />
            <KPI
              icon={<Target />}
              label="Pipeline abierto"
              value={String(stats.opportunitiesOpen)}
              subtitle={`${stats.quotesOpen} cotizaciones · ${stats.ordersOpen} pedidos`}
              color="#f97316"
              href="/crm?tab=pipeline"
            />
          </div>

          {/* Aging + Top clientes */}
          <div className="grid grid-cols-2 gap-3">
            <Card className="p-4">
              <div className="flex items-center justify-between mb-3">
                <strong>Aging de cuentas por cobrar</strong>
                <Link href="/ventas?tab=facturas" className="text-xs underline opacity-60">Ver todas →</Link>
              </div>
              <div className="grid grid-cols-4 gap-2">
                <AgingBucket label="0-30 días" value={stats.agingBuckets.d0_30} fmt={fmt} color="#10b981" />
                <AgingBucket label="31-60" value={stats.agingBuckets.d31_60} fmt={fmt} color="#f59e0b" />
                <AgingBucket label="61-90" value={stats.agingBuckets.d61_90} fmt={fmt} color="#f97316" />
                <AgingBucket label="+90 días" value={stats.agingBuckets.d90plus} fmt={fmt} color="#ef4444" />
              </div>
            </Card>

            <Card className="p-4">
              <div className="flex items-center justify-between mb-3">
                <strong>Top 5 clientes del mes</strong>
                <Link href="/clientes" className="text-xs underline opacity-60">Ver todos →</Link>
              </div>
              {stats.topClients.length === 0 ? (
                <div className="text-sm opacity-60 text-center py-4">Sin facturas este mes</div>
              ) : (
                <div className="space-y-2">
                  {stats.topClients.map((c, i) => {
                    const max = stats.topClients[0].total
                    const pct = (c.total / max) * 100
                    return (
                      <div key={c.name}>
                        <div className="flex justify-between text-xs mb-1">
                          <span className="truncate">#{i + 1} {c.name}</span>
                          <strong>{fmt(c.total, c.currency)}</strong>
                        </div>
                        <div className="h-1.5 rounded-full" style={{ background: '#2A3040' }}>
                          <div className="h-full rounded-full" style={{ width: `${pct}%`, background: 'linear-gradient(90deg,#f97316,#ef4444)' }} />
                        </div>
                      </div>
                    )
                  })}
                </div>
              )}
            </Card>
          </div>

          {/* Pipeline flow */}
          <Card className="p-4">
            <div className="flex items-center justify-between mb-3">
              <strong>Flujo de ventas</strong>
              <span className="text-xs opacity-60">de lead hasta cobro</span>
            </div>
            <div className="flex items-center gap-2 overflow-x-auto">
              <FlowStep label="Leads" value={stats.leadsTotal} href="/crm/leads" color="#3b82f6" />
              <Arrow />
              <FlowStep label="Hot" value={stats.leadsHot} href="/crm/leads" color="#ef4444" />
              <Arrow />
              <FlowStep label="Oportunidades" value={stats.opportunitiesOpen} href="/crm" color="#f97316" />
              <Arrow />
              <FlowStep label="Cotizaciones" value={stats.quotesOpen} href="/cotizador" color="#f59e0b" />
              <Arrow />
              <FlowStep label="Pedidos" value={stats.ordersOpen} href="/ventas?tab=pedidos" color="#a78bfa" />
              <Arrow />
              <FlowStep label="Por cobrar" value={stats.invoicesPending} href="/ventas?tab=facturas" color="#f97316" />
              <Arrow />
              <FlowStep label="Cobradas mes" value={stats.invoicesCollectedMonth} href="/cobros" color="#10b981" />
            </div>
          </Card>

          {/* Resumen ejecutivo IA */}
          <DailySummaryCard />

          {/* Accesos rápidos */}
          <Card className="p-4">
            <strong className="block mb-3">Accesos rápidos</strong>
            <div className="grid grid-cols-5 gap-2">
              <QuickLink label="Nueva cotización" icon={<FileText />} href="/cotizador" />
              <QuickLink label="Nuevo lead" icon={<Sparkles />} href="/crm/leads" />
              <QuickLink label="Importar OC" icon={<FileText />} href="/ventas/importar-oc" />
              <QuickLink label="Subir extracto" icon={<DollarSign />} href="/cobros" />
              <QuickLink label="Diagnóstico" icon={<AlertTriangle />} href="/admin/diagnostico" />
            </div>
          </Card>
        </>
      )}
    </div>
  )
}

function KPI({ icon, label, value, subtitle, color, href }: {
  icon: React.ReactNode; label: string; value: string; subtitle?: React.ReactNode; color: string; href?: string
}) {
  const content = (
    <Card className="p-3 h-full hover:opacity-90 cursor-pointer">
      <div className="flex items-start justify-between">
        <div>
          <div className="text-xs opacity-60">{label}</div>
          <div className="text-2xl font-bold mt-1" style={{ color }}>{value}</div>
          {subtitle && <div className="text-xs mt-1">{subtitle}</div>}
        </div>
        <div style={{ color }}>{icon}</div>
      </div>
    </Card>
  )
  return href ? <Link href={href}>{content}</Link> : content
}

function AgingBucket({ label, value, fmt, color }: { label: string; value: number; fmt: (v: number) => string; color: string }) {
  return (
    <div className="text-center p-2 rounded" style={{ background: '#1E2330' }}>
      <div className="text-[10px] opacity-60 uppercase">{label}</div>
      <div className="font-bold text-sm mt-1" style={{ color }}>{fmt(value)}</div>
    </div>
  )
}

function FlowStep({ label, value, href, color }: { label: string; value: number; href: string; color: string }) {
  return (
    <Link href={href} className="shrink-0 px-3 py-2 rounded-lg text-center hover:opacity-80" style={{ background: '#1E2330', border: `1px solid ${color}40`, minWidth: 90 }}>
      <div className="text-[10px] opacity-60 uppercase">{label}</div>
      <div className="text-xl font-bold" style={{ color }}>{value}</div>
    </Link>
  )
}

function Arrow() {
  return <span className="opacity-40 text-xl shrink-0">→</span>
}

function QuickLink({ label, icon, href }: { label: string; icon: React.ReactNode; href: string }) {
  return (
    <Link
      href={href}
      className="p-3 rounded-lg text-center hover:bg-[#1E2330] flex flex-col items-center gap-1"
      style={{ background: '#151821', border: '1px solid #2A3040' }}
    >
      <div className="opacity-70">{icon}</div>
      <div className="text-xs">{label}</div>
    </Link>
  )
}
