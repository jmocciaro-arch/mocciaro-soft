'use client'

import { useEffect, useState, useCallback, useMemo, Suspense } from 'react'
import Link from 'next/link'
import { useRouter, usePathname, useSearchParams } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { useCompanyContext } from '@/lib/company-context'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { KPICard } from '@/components/ui/kpi-card'
import { SegmentedControl } from '@/components/ui/segmented-control'
import { FilterChips, type FilterChip } from '@/components/ui/filter-chips'
import { EmptyState } from '@/components/ui/empty-state'
import { DailySummaryCard } from '@/components/ai/daily-summary-card'
import {
  DollarSign, FileText, Sparkles,
  AlertTriangle, RefreshCw, BarChart3,
  Mail, Paperclip, ExternalLink, Activity,
} from 'lucide-react'
import { formatRelative } from '@/lib/utils'
import { useChannelsGate } from '@/hooks/use-channels-gate'
import { useExecutiveKpis } from '@/hooks/use-executive-kpis'
import {
  periodWindow, isPeriodKey, DEFAULT_PERIOD, PERIOD_OPTIONS, PERIOD_LABELS,
  type PeriodKey,
} from '@/lib/dashboard/periods'
import {
  kpiFacturacion, kpiPipeline, kpiPendienteCobro, kpiOrdenesMarketplace,
  kpiOcEnCurso, stockAlerts, trendFrom, appliesChannelDimming,
  buildActivity, filterActivity, ESTADO_OPTIONS,
  type ChannelFilter, type EstadoFilter, type EstadoBucket,
} from '@/lib/dashboard/executive-kpis'

interface EmailItem {
  id: string
  from: { name: string; email: string }
  subject: string
  snippet: string
  date: string
  isRead: boolean
  hasAttachments: boolean
}

interface EmailsData {
  connected: boolean
  emails: EmailItem[]
  unreadCount: number
}

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

const SELECT_CLS = 'bg-[#141820] border border-[#2A3040] rounded-lg px-2.5 py-1.5 text-xs font-semibold text-[#F0F2F5] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#FF6600]'
const FILTER_LBL = 'text-[10.5px] uppercase tracking-wider font-bold text-[#6B7280]'

const ESTADO_BADGE: Record<EstadoBucket, 'success' | 'info' | 'danger'> = {
  cobrado: 'success',
  abierto: 'info',
  atencion: 'danger',
}

function timeLabel(ts: string): string {
  const d = new Date(ts)
  const sameDay = d.toDateString() === new Date().toDateString()
  return sameDay
    ? d.toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' })
    : d.toLocaleDateString('es-AR', { day: '2-digit', month: 'short' })
}

export default function DashboardEjecutivoPage() {
  // useSearchParams exige un boundary de Suspense (mismo patrón que catálogo)
  return (
    <Suspense fallback={<div className="p-6"><div className="h-24 rounded-lg animate-pulse" style={{ background: '#1E2330' }} /></div>}>
      <DashboardEjecutivo />
    </Suspense>
  )
}

function DashboardEjecutivo() {
  const { activeCompanyIds, activeCompany } = useCompanyContext()
  const supabase = createClient()
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const [stats, setStats] = useState<Stats | null>(null)
  const [loading, setLoading] = useState(true)
  const [emailsData, setEmailsData] = useState<EmailsData>({ connected: true, emails: [], unreadCount: 0 })
  const [emailsLoading, setEmailsLoading] = useState(true)

  // ---- Filtros del dashboard (spec §2.1): período en URL, canal/estado en estado local ----
  const pParam = searchParams.get('p')
  const period: PeriodKey = isPeriodKey(pParam) ? pParam : DEFAULT_PERIOD
  const [canal, setCanal] = useState<ChannelFilter>('todos')
  const [estado, setEstado] = useState<EstadoFilter>('todos')
  const gate = useChannelsGate()
  const { raw, loading: kpisLoading, refetch } = useExecutiveKpis(period)

  const setPeriod = useCallback((p: PeriodKey) => {
    const sp = new URLSearchParams(searchParams.toString())
    sp.set('p', p)
    router.replace(`${pathname}?${sp.toString()}`, { scroll: false })
  }, [searchParams, router, pathname])

  // Si cambia la empresa activa y el canal elegido ya no está habilitado, volver a "todos"
  useEffect(() => {
    if (canal !== 'todos' && canal !== 'directo' && !gate.enabledChannels.some(c => c.id === canal)) {
      setCanal('todos')
    }
  }, [gate.enabledChannels, canal])

  const channelLabels = useMemo(
    () => Object.fromEntries(gate.enabledChannels.map(c => [c.id, c.label])),
    [gate.enabledChannels],
  )

  const kpis = useMemo(() => {
    if (!raw) return null
    const win = periodWindow(period)
    return {
      fact: kpiFacturacion(raw.invoices, raw.channelOrders, canal, win),
      pipe: kpiPipeline(raw.openQuotes, canal),
      pend: kpiPendienteCobro(raw.unpaidInvoices, raw.unsettledOrders, canal),
      ord: kpiOrdenesMarketplace(raw.channelOrders, canal, win, channelLabels),
      oc: kpiOcEnCurso(raw.purchaseOrders),
      alerts: stockAlerts(raw.stock),
      activity: buildActivity(raw.events, raw.channelOrders, channelLabels),
    }
  }, [raw, period, canal, channelLabels])

  const visibleActivity = useMemo(
    () => (kpis ? filterActivity(kpis.activity, canal, estado) : []),
    [kpis, canal, estado],
  )

  const dimming = appliesChannelDimming(canal)
  const canalLabel = canal === 'directo' ? 'Directo' : channelLabels[canal]
  const isMarketplaceFilter = canal !== 'todos' && canal !== 'directo'

  const chips: FilterChip[] = useMemo(() => {
    const out: FilterChip[] = []
    if (canal !== 'todos') out.push({ key: 'canal', label: canalLabel ?? 'Canal' })
    if (estado !== 'todos') out.push({ key: 'estado', label: ESTADO_OPTIONS.find(o => o.value === estado)?.label ?? estado })
    return out
  }, [canal, estado, canalLabel])

  const removeChip = useCallback((key: string) => {
    if (key === 'canal') setCanal('todos')
    if (key === 'estado') setEstado('todos')
  }, [])
  const clearFilters = useCallback(() => { setCanal('todos'); setEstado('todos') }, [])

  const loadEmails = useCallback(async () => {
    setEmailsLoading(true)
    try {
      const res = await fetch('/api/emails/recent')
      if (res.ok) {
        const data = await res.json()
        setEmailsData(data)
      }
    } catch {
      // silently fail — widget just shows empty
    } finally {
      setEmailsLoading(false)
    }
  }, [])

  useEffect(() => { void loadEmails() }, [loadEmails])

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
      supabase.from('tt_documents').select('total, currency').in('company_id', activeCompanyIds).eq('doc_type', 'factura').in('status', ['emitida','autorizada','pendiente_cobro']),
      supabase.from('tt_documents').select('total, currency, invoice_date').in('company_id', activeCompanyIds).eq('doc_type', 'factura').in('status', ['emitida','autorizada','pendiente_cobro']).lt('invoice_date', new Date(Date.now() - 30*86400000).toISOString()),
      supabase.from('tt_documents').select('total, currency').in('company_id', activeCompanyIds).eq('doc_type', 'factura').eq('status', 'cobrada').gte('updated_at', monthStart),
      supabase.from('tt_documents').select('total, currency').in('company_id', activeCompanyIds).eq('doc_type', 'factura').eq('status', 'cobrada').gte('updated_at', lastMonthStart).lte('updated_at', lastMonthEnd),
      supabase.from('tt_documents').select('total, currency, client:tt_clients(name)').in('company_id', activeCompanyIds).eq('doc_type', 'factura').in('status', ['cobrada','emitida','autorizada']).gte('invoice_date', monthStart).order('total', { ascending: false }).limit(100),
      supabase.from('tt_documents').select('status').in('company_id', activeCompanyIds).eq('doc_type', 'factura'),
    ])

    // Agrupar top clients
    type TopClientRow = { total: number | null; currency: string | null; client: { name: string | null } | null }
    const clientTotals = new Map<string, { total: number; currency: string }>()
    for (const d of ((topClientsRes.data || []) as unknown as TopClientRow[])) {
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
    for (const inv of ((invPendRes.data || []) as unknown as { total: number | null; invoice_date: string | null }[])) {
      const d = inv.invoice_date ? new Date(inv.invoice_date) : new Date()
      const days = Math.floor((Date.now() - d.getTime()) / 86400000)
      const total = Number(inv.total || 0)
      if (days <= 30) aging.d0_30 += total
      else if (days <= 60) aging.d31_60 += total
      else if (days <= 90) aging.d61_90 += total
      else aging.d90plus += total
    }

    // Status counts
    const invByStatus: Record<string, number> = {}
    for (const d of ((invByStatusRes.data || []) as { status: string }[])) {
      invByStatus[d.status] = (invByStatus[d.status] || 0) + 1
    }

    const sum = (rows: { total: number | null }[]) => rows.reduce((s, r) => s + Number(r.total || 0), 0)

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
      currency: (activeCompany as { currency?: string } | null)?.currency || 'EUR',
    })
    setLoading(false)
    // supabase (createClient) es estable entre renders; las deps reales son empresa activa
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeCompanyIds, activeCompany])

  useEffect(() => { void load() }, [load])

  const companyCurrency = (activeCompany as { currency?: string } | null)?.currency || 'EUR'

  function fmt(v: number, cur = stats?.currency || companyCurrency) {
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
        <Button variant="secondary" onClick={() => { void load(); void refetch() }} disabled={loading || kpisLoading}>
          <RefreshCw className={`w-4 h-4 mr-1 ${(loading || kpisLoading) ? 'animate-spin' : ''}`} /> Refrescar
        </Button>
      </div>

      {/* Barra de filtros (spec §2.1) */}
      <div className="flex items-center gap-3 flex-wrap rounded-xl bg-[#141820] border border-[#1E2330] px-3 py-2" role="group" aria-label="Filtros del dashboard">
        <span className={FILTER_LBL}>Período</span>
        <SegmentedControl options={PERIOD_OPTIONS} value={period} onChange={setPeriod} ariaLabel="Período del dashboard" />
        {/* El filtro de canal solo se renderiza si el gating §1 pasa completo */}
        {gate.functional && (
          <>
            <label htmlFor="f-canal" className={FILTER_LBL}>Canal</label>
            <select id="f-canal" className={SELECT_CLS} value={canal} onChange={e => setCanal(e.target.value)}>
              <option value="todos">Todos</option>
              <option value="directo">Directo</option>
              {gate.enabledChannels.map(c => <option key={c.id} value={c.id}>{c.label}</option>)}
            </select>
          </>
        )}
        <label htmlFor="f-estado" className={FILTER_LBL}>Estado</label>
        <select id="f-estado" className={SELECT_CLS} value={estado} onChange={e => setEstado(e.target.value as EstadoFilter)}>
          {ESTADO_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
        </select>
        <FilterChips chips={chips} onRemove={removeChip} onClear={clearFilters} />
      </div>

      {/* KPIs con filtros (spec §2.2) */}
      {kpisLoading || !kpis ? (
        <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-3">
          {[1, 2, 3, 4, 5, 6].map(i => <div key={i} className="h-28 rounded-xl animate-pulse" style={{ background: '#1E2330' }} />)}
        </div>
      ) : (
        <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-3">
          <KPICard
            label="Facturación"
            value={fmt(kpis.fact.value)}
            trend={trendFrom(kpis.fact.value, kpis.fact.prev)}
            sparkline={kpis.fact.spark}
            sparklineColor="#10b981"
            subtitle={PERIOD_LABELS[period] + (canal !== 'todos' && canalLabel ? ` · ${canalLabel}` : '')}
          />
          <KPICard
            label="Pipeline abierto"
            value={fmt(kpis.pipe.value)}
            subtitle={isMarketplaceFilter ? 'las cotizaciones son del canal directo' : `${kpis.pipe.count} cotizaciones`}
          />
          <KPICard
            label="Pendiente cobro"
            value={fmt(kpis.pend.value)}
            subtitle={isMarketplaceFilter
              ? `${kpis.pend.count} sin liquidar`
              : <span className={kpis.pend.overdue > 0 ? 'text-red-400' : undefined}>{kpis.pend.overdue} vencidas</span>}
          />
          <KPICard
            label="OC en curso"
            value={kpis.oc.count}
            muted={dimming}
            subtitle={dimming ? 'no aplica filtro de canal' : `${fmt(kpis.oc.committed)} comprometido`}
          />
          <KPICard
            label="Órdenes marketplace"
            value={kpis.ord.value}
            trend={trendFrom(kpis.ord.value, kpis.ord.prev)}
            sparkline={kpis.ord.spark}
            sparklineColor="#FF6600"
            subtitle={kpis.ord.mix}
          />
          <KPICard
            label="Alertas stock"
            value={kpis.alerts.low}
            muted={dimming}
            subtitle={dimming
              ? 'no aplica filtro de canal'
              : <span className={kpis.alerts.critical > 0 ? 'text-red-400' : undefined}>{kpis.alerts.critical} críticos</span>}
          />
        </div>
      )}

      {/* Actividad reciente (spec §2.3) + resumen IA */}
      <div className="grid grid-cols-1 xl:grid-cols-[2.2fr_1fr] gap-3 items-start">
        <Card className="p-0 overflow-hidden">
          <div className="flex items-center gap-2 px-4 py-2.5 border-b border-[#1E2330]">
            <Activity size={14} className="text-[#6B7280]" />
            <strong className="text-[12.5px]">Actividad reciente</strong>
            {kpis && kpis.activity.length > 0 && (
              <span className="text-[11px] text-[#6B7280] font-mono ml-auto">{visibleActivity.length} de {kpis.activity.length}</span>
            )}
          </div>
          {kpisLoading || !kpis ? (
            <div className="p-4 space-y-2">
              {[1, 2, 3, 4, 5].map(i => <div key={i} className="h-7 rounded animate-pulse" style={{ background: '#1E2330' }} />)}
            </div>
          ) : kpis.activity.length === 0 ? (
            <EmptyState
              className="border-0 rounded-none"
              icon={<Activity size={36} />}
              title="Sin actividad reciente"
              description="Cuando se emitan documentos o entren órdenes de canal, los últimos movimientos van a aparecer acá."
            />
          ) : visibleActivity.length === 0 ? (
            <div className="px-4 py-8 text-center text-xs text-[#9CA3AF]">
              Ninguna actividad coincide con los filtros activos.{' '}
              <button type="button" onClick={clearFilters} className="underline hover:text-[#F0F2F5]">Limpiar filtros</button>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-[12.5px]">
                <thead>
                  <tr className="text-left text-[10.5px] uppercase tracking-wider text-[#6B7280] border-b border-[#1E2330]">
                    <th className="px-3 py-2 font-bold">Hora</th>
                    <th className="px-3 py-2 font-bold">Documento</th>
                    <th className="px-3 py-2 font-bold">Tercero</th>
                    <th className="px-3 py-2 font-bold text-right">Importe</th>
                    <th className="px-3 py-2 font-bold">Estado</th>
                    <th className="px-3 py-2 font-bold">Origen</th>
                  </tr>
                </thead>
                <tbody>
                  {visibleActivity.map(item => (
                    <tr key={item.id} className="border-b border-[#1E2330]/60 last:border-0 hover:bg-[#1E2330]/40">
                      <td className="px-3 py-1.5 font-mono text-[11.5px] text-[#9CA3AF] whitespace-nowrap">{timeLabel(item.ts)}</td>
                      <td className="px-3 py-1.5 font-mono whitespace-nowrap">{item.code}</td>
                      <td className="px-3 py-1.5 max-w-[180px] truncate">{item.party}</td>
                      <td className="px-3 py-1.5 font-mono text-right whitespace-nowrap">{item.total != null ? fmt(item.total, item.currency ?? undefined) : '—'}</td>
                      <td className="px-3 py-1.5"><Badge variant={ESTADO_BADGE[item.estado]}>{item.status}</Badge></td>
                      <td className="px-3 py-1.5"><Badge variant={item.channelKey === 'directo' ? 'default' : 'orange'}>{item.origin}</Badge></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>
        <DailySummaryCard />
      </div>

      {loading || !stats ? (
        <div className="grid grid-cols-4 gap-3">
          {[1, 2, 3, 4].map(i => <div key={i} className="h-24 rounded-lg animate-pulse" style={{ background: '#1E2330' }} />)}
        </div>
      ) : (
        <>
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

          {/* Emails de clientes */}
          <Card className="p-4">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <Mail className="w-5 h-5" style={{ color: '#FF6600' }} />
                <strong>Emails de clientes</strong>
                {emailsData.unreadCount > 0 && (
                  <Badge className="text-xs bg-[#FF6600] text-white hover:bg-[#FF6600]/90 border-0">
                    {emailsData.unreadCount} nuevos
                  </Badge>
                )}
              </div>
              <div className="flex items-center gap-2">
                {emailsData.connected && (
                  <Button variant="ghost" size="sm" onClick={loadEmails} disabled={emailsLoading}>
                    <RefreshCw className={`w-3.5 h-3.5 ${emailsLoading ? 'animate-spin' : ''}`} />
                  </Button>
                )}
              </div>
            </div>

            {!emailsData.connected ? (
              <div className="flex flex-col items-center justify-center py-8 gap-3">
                <Mail className="w-10 h-10 opacity-30" />
                <p className="text-sm opacity-60">Gmail no conectado</p>
                <Link href="/api/auth/google">
                  <Button variant="secondary" size="sm" style={{ borderColor: '#FF6600', color: '#FF6600' }}>
                    <ExternalLink className="w-3.5 h-3.5 mr-1" /> Conectar Gmail
                  </Button>
                </Link>
              </div>
            ) : emailsLoading ? (
              <div className="space-y-3">
                {[1, 2, 3, 4].map((i) => (
                  <div key={i} className="h-16 rounded-lg animate-pulse" style={{ background: '#1E2330' }} />
                ))}
              </div>
            ) : emailsData.emails.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-8">
                <Mail className="w-10 h-10 opacity-20" />
                <p className="text-sm opacity-60 mt-2">Sin emails recientes</p>
              </div>
            ) : (
              <div className="overflow-y-auto space-y-1" style={{ maxHeight: 400 }}>
                {emailsData.emails.map((email) => (
                  <a
                    key={email.id}
                    href={`https://mail.google.com/mail/u/0/#inbox/${email.id}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-start gap-3 p-2.5 rounded-lg hover:bg-[#1E2330] transition-colors group cursor-pointer"
                    style={{ background: email.isRead ? 'transparent' : '#1E233050' }}
                  >
                    {/* Unread indicator */}
                    <div className="pt-1.5 shrink-0">
                      {!email.isRead ? (
                        <div className="w-2.5 h-2.5 rounded-full" style={{ background: '#3b82f6' }} />
                      ) : (
                        <div className="w-2.5 h-2.5 rounded-full" style={{ background: '#2A3040' }} />
                      )}
                    </div>

                    {/* Content */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between gap-2">
                        <div className="flex items-center gap-2 min-w-0">
                          <span
                            className="text-sm truncate"
                            style={{
                              color: '#F0F2F5',
                              fontWeight: email.isRead ? 400 : 600,
                            }}
                          >
                            {email.from.name || email.from.email}
                          </span>
                          {email.from.name && (
                            <span className="text-xs truncate opacity-40 hidden sm:inline">
                              {email.from.email}
                            </span>
                          )}
                        </div>
                        <div className="flex items-center gap-1.5 shrink-0">
                          {email.hasAttachments && (
                            <Paperclip className="w-3.5 h-3.5 opacity-40" />
                          )}
                          <span className="text-[11px] opacity-50 whitespace-nowrap">
                            {formatRelative(email.date)}
                          </span>
                        </div>
                      </div>
                      <div
                        className="text-sm truncate mt-0.5"
                        style={{
                          color: email.isRead ? '#F0F2F580' : '#F0F2F5CC',
                          fontWeight: email.isRead ? 400 : 500,
                        }}
                      >
                        {email.subject}
                      </div>
                      <div
                        className="text-xs mt-0.5 line-clamp-2"
                        style={{ color: '#F0F2F550' }}
                      >
                        {email.snippet}
                      </div>
                    </div>

                    {/* Open arrow */}
                    <ExternalLink
                      className="w-3.5 h-3.5 opacity-0 group-hover:opacity-40 transition-opacity shrink-0 mt-1"
                    />
                  </a>
                ))}
              </div>
            )}
          </Card>

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
