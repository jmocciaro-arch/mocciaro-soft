'use client'

import { useState, useEffect, useCallback } from 'react'
import { Tabs } from '@/components/ui/tabs'
import { Card } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { useCompanyContext } from '@/lib/company-context'
import { formatCurrency } from '@/lib/utils'
import {
  TrendingUp, TrendingDown, RefreshCw, Brain, DollarSign,
  AlertTriangle, CheckCircle2, Clock, Banknote, BarChart3,
  ChevronDown, ChevronRight, Loader2, Calendar,
} from 'lucide-react'

// ─── Tipos locales ───────────────────────────────────────────────────────────

interface FXRate {
  id: string
  date: string
  base_currency: string
  target_currency: string
  rate: number
  source: string
}

interface WeekBucket {
  week_label: string
  week_start: string
  week_end: string
  inflow: number
  outflow: number
  net: number
  running_balance: number
}

interface ForecastData {
  company_id: string
  currency: string
  horizon_days: 30 | 60 | 90
  as_of: string
  total_inflow: number
  total_outflow: number
  net_cashflow: number
  opening_balance: number
  projected_closing: number
  inflow_invoices_pending: number
  inflow_invoices_likely: number
  outflow_purchases: number
  outflow_recurring: number
  weeks: WeekBucket[]
  weeks_negative: number
  min_balance: number
  min_balance_week: string
}

interface AgingRow {
  client_id: string
  client_name: string
  invoices: AgingInvoice[]
  bucket_0_30: number
  bucket_31_60: number
  bucket_61_90: number
  bucket_90_plus: number
  total_owed: number
  max_days_overdue: number
  last_payment_date: string | null
  ai_suggestion: string | null
  ai_suggestion_at: string | null
}

interface AgingInvoice {
  id: string
  legal_number: string | null
  total: number
  currency: string
  invoice_date: string
  expected_due: string
  days_overdue: number
  bucket: '0-30' | '31-60' | '61-90' | '+90'
}

interface AgingSummary {
  total_clients: number
  total_owed: number
  bucket_0_30: number
  bucket_31_60: number
  bucket_61_90: number
  bucket_90_plus: number
}

// ─── Labels y colores de tipos de cambio ────────────────────────────────────

const FX_LABELS: Record<string, { label: string; flag: string; color: string }> = {
  ARS_OFICIAL: { label: 'Dólar Oficial', flag: '🇦🇷', color: '#3b82f6' },
  ARS_BLUE: { label: 'Dólar Blue', flag: '🔵', color: '#8b5cf6' },
  ARS_MEP: { label: 'Dólar MEP', flag: '📊', color: '#06b6d4' },
  ARS_CCL: { label: 'Dólar CCL', flag: '💼', color: '#f59e0b' },
  USD: { label: 'EUR → USD', flag: '🇪🇺', color: '#10b981' },
  ARS_OFICIAL_EUR: { label: 'EUR → ARS Oficial', flag: '🇪🇺', color: '#6366f1' },
}

function getFXLabel(rate: FXRate) {
  if (rate.base_currency === 'EUR' && rate.target_currency === 'USD') {
    return { label: 'EUR / USD', flag: '🇪🇺', color: '#10b981' }
  }
  if (rate.base_currency === 'EUR' && rate.target_currency === 'ARS_OFICIAL') {
    return { label: 'EUR → ARS Oficial', flag: '🇦🇷🇪🇺', color: '#6366f1' }
  }
  return FX_LABELS[rate.target_currency] || { label: rate.target_currency, flag: '💱', color: '#9ca3af' }
}

// ─── Formateo ────────────────────────────────────────────────────────────────

function fmtARS(n: number) {
  return '$ ' + n.toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

function fmtUSD(n: number) {
  return 'US$ ' + n.toLocaleString('es-AR', { minimumFractionDigits: 4, maximumFractionDigits: 4 })
}

// ─── Componente principal ────────────────────────────────────────────────────

export default function FinanzasPage() {
  const { visibleCompanies } = useCompanyContext()
  const activeCompanyId = visibleCompanies[0]?.id || null

  const tabs = [
    { id: 'fx', label: 'Tipos de cambio', icon: <DollarSign size={16} /> },
    { id: 'aging', label: 'Aging / Cobranzas', icon: <Clock size={16} /> },
    { id: 'forecast', label: 'Cash Flow', icon: <BarChart3 size={16} /> },
  ]

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold text-[#F0F2F5] flex items-center gap-2">
          <Banknote className="w-6 h-6 text-[#f97316]" />
          Finanzas
        </h1>
        <p className="text-sm text-[#6B7280] mt-1">
          Tipos de cambio en vivo · Aging de cobranzas con IA · Forecast de cash flow
        </p>
      </div>

      <Tabs tabs={tabs} defaultTab="fx">
        {(activeTab) => (
          <>
            {activeTab === 'fx' && <FXTab />}
            {activeTab === 'aging' && <AgingTab companyId={activeCompanyId} />}
            {activeTab === 'forecast' && <ForecastTab companyId={activeCompanyId} />}
          </>
        )}
      </Tabs>
    </div>
  )
}

// ─── Tab 1: Tipos de cambio ──────────────────────────────────────────────────

function FXTab() {
  const [rates, setRates] = useState<FXRate[]>([])
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [lastFetch, setLastFetch] = useState<string | null>(null)

  const loadRates = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch('/api/fx/rates')
      if (res.ok) {
        const data = await res.json()
        setRates(data.rates || [])
        setLastFetch(data.fetched_at)
      }
    } finally {
      setLoading(false)
    }
  }, [])

  const fetchFresh = async () => {
    setRefreshing(true)
    try {
      await fetch('/api/fx/rates', { method: 'POST' })
      await loadRates()
    } finally {
      setRefreshing(false)
    }
  }

  useEffect(() => { void loadRates() }, [loadRates])

  const arsRates = rates.filter(r => r.base_currency === 'USD' && r.target_currency.startsWith('ARS'))
  const eurRates = rates.filter(r => r.base_currency === 'EUR')

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm text-[#6B7280]">
            {lastFetch
              ? `Última actualización: ${new Date(lastFetch).toLocaleTimeString('es-AR')}`
              : 'Cargando cotizaciones...'}
          </p>
        </div>
        <Button
          variant="secondary"
          size="sm"
          onClick={fetchFresh}
          loading={refreshing}
        >
          <RefreshCw className="w-3 h-3 mr-1" />
          Actualizar cotizaciones
        </Button>
      </div>

      {loading ? (
        <div className="flex items-center justify-center p-12">
          <Loader2 className="w-6 h-6 animate-spin text-[#f97316]" />
          <span className="ml-2 text-[#6B7280]">Cargando...</span>
        </div>
      ) : rates.length === 0 ? (
        <Card>
          <div className="text-center py-8 text-[#6B7280]">
            <DollarSign className="w-10 h-10 mx-auto mb-2 opacity-30" />
            <p>No hay cotizaciones cargadas todavía.</p>
            <p className="text-xs mt-1">Hacé clic en &quot;Actualizar cotizaciones&quot; para obtenerlas.</p>
          </div>
        </Card>
      ) : (
        <>
          {/* ARS / USD */}
          {arsRates.length > 0 && (
            <div>
              <h3 className="text-xs font-semibold text-[#6B7280] uppercase tracking-wider mb-2">
                Pesos argentinos por dólar
              </h3>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                {arsRates.map((rate) => {
                  const meta = getFXLabel(rate)
                  return (
                    <div
                      key={rate.id}
                      className="rounded-xl border p-4"
                      style={{ background: '#151821', borderColor: '#2A3040' }}
                    >
                      <div className="flex items-center gap-2 mb-2">
                        <span className="text-lg">{meta.flag}</span>
                        <span className="text-xs text-[#6B7280]">{meta.label}</span>
                      </div>
                      <div className="text-2xl font-bold" style={{ color: meta.color }}>
                        {fmtARS(rate.rate)}
                      </div>
                      <div className="text-[10px] text-[#6B7280] mt-1">
                        {rate.source} · {rate.date}
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          )}

          {/* EUR */}
          {eurRates.length > 0 && (
            <div>
              <h3 className="text-xs font-semibold text-[#6B7280] uppercase tracking-wider mb-2">
                Euro
              </h3>
              <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                {eurRates.map((rate) => {
                  const meta = getFXLabel(rate)
                  const isToARS = rate.target_currency.startsWith('ARS')
                  return (
                    <div
                      key={rate.id}
                      className="rounded-xl border p-4"
                      style={{ background: '#151821', borderColor: '#2A3040' }}
                    >
                      <div className="flex items-center gap-2 mb-2">
                        <span className="text-lg">{meta.flag}</span>
                        <span className="text-xs text-[#6B7280]">{meta.label}</span>
                      </div>
                      <div className="text-2xl font-bold" style={{ color: meta.color }}>
                        {isToARS ? fmtARS(rate.rate) : fmtUSD(rate.rate)}
                      </div>
                      <div className="text-[10px] text-[#6B7280] mt-1">
                        {rate.source} · {rate.date}
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          )}

          {/* Spread ARS (Blue vs Oficial) */}
          {(() => {
            const oficial = arsRates.find(r => r.target_currency === 'ARS_OFICIAL')
            const blue = arsRates.find(r => r.target_currency === 'ARS_BLUE')
            if (!oficial || !blue) return null
            const spread = ((blue.rate - oficial.rate) / oficial.rate) * 100
            return (
              <Card>
                <div className="flex items-center gap-4">
                  <div>
                    <p className="text-xs text-[#6B7280]">Brecha cambiaria (Blue vs Oficial)</p>
                    <p className="text-2xl font-bold" style={{ color: spread > 100 ? '#ef4444' : spread > 50 ? '#f59e0b' : '#10b981' }}>
                      +{spread.toFixed(1)}%
                    </p>
                  </div>
                  <div className="flex-1 text-sm text-[#9CA3AF]">
                    Oficial: {fmtARS(oficial.rate)} · Blue: {fmtARS(blue.rate)}
                  </div>
                  <Badge variant={spread > 100 ? 'danger' : spread > 50 ? 'warning' : 'success'}>
                    {spread > 100 ? 'Brecha alta' : spread > 50 ? 'Brecha moderada' : 'Brecha baja'}
                  </Badge>
                </div>
              </Card>
            )
          })()}
        </>
      )}
    </div>
  )
}

// ─── Tab 2: Aging ────────────────────────────────────────────────────────────

function AgingTab({ companyId }: { companyId: string | null }) {
  const [rows, setRows] = useState<AgingRow[]>([])
  const [summary, setSummary] = useState<AgingSummary | null>(null)
  const [loading, setLoading] = useState(false)
  const [expanded, setExpanded] = useState<Record<string, boolean>>({})
  const [aiLoading, setAiLoading] = useState<Record<string, boolean>>({})

  const loadAging = useCallback(async () => {
    if (!companyId) return
    setLoading(true)
    try {
      const res = await fetch(`/api/cashflow/aging?company_id=${companyId}`)
      if (res.ok) {
        const data = await res.json()
        setRows(data.rows || [])
        setSummary(data.summary || null)
      }
    } finally {
      setLoading(false)
    }
  }, [companyId])

  const loadAISuggestion = async (clientId: string) => {
    if (!companyId) return
    setAiLoading(prev => ({ ...prev, [clientId]: true }))
    try {
      const res = await fetch(`/api/cashflow/aging?company_id=${companyId}&client_id=${clientId}`)
      if (res.ok) {
        const data = await res.json()
        const updatedRow = data.rows?.find((r: AgingRow) => r.client_id === clientId)
        if (updatedRow) {
          setRows(prev => prev.map(r => r.client_id === clientId ? { ...r, ai_suggestion: updatedRow.ai_suggestion, ai_suggestion_at: updatedRow.ai_suggestion_at } : r))
        }
      }
    } finally {
      setAiLoading(prev => ({ ...prev, [clientId]: false }))
    }
  }

  useEffect(() => { void loadAging() }, [loadAging])

  const bucketColor = (bucket: string) => {
    if (bucket === '0-30') return '#10b981'
    if (bucket === '31-60') return '#f59e0b'
    if (bucket === '61-90') return '#f97316'
    return '#ef4444'
  }

  const bucketVariant = (bucket: string): 'success' | 'warning' | 'orange' | 'danger' => {
    if (bucket === '0-30') return 'success'
    if (bucket === '31-60') return 'warning'
    if (bucket === '61-90') return 'orange'
    return 'danger'
  }

  if (!companyId) {
    return (
      <Card>
        <p className="text-center text-[#6B7280] py-8">Seleccioná una empresa para ver el aging.</p>
      </Card>
    )
  }

  return (
    <div className="space-y-4">
      {/* Resumen */}
      {summary && (
        <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
          <div className="col-span-2 md:col-span-1 rounded-xl border p-4" style={{ background: '#151821', borderColor: '#2A3040' }}>
            <p className="text-xs text-[#6B7280]">Total a cobrar</p>
            <p className="text-xl font-bold text-[#f97316]">{formatCurrency(summary.total_owed, 'EUR')}</p>
            <p className="text-xs text-[#6B7280] mt-1">{summary.total_clients} clientes</p>
          </div>
          {[
            { label: '0–30 días', value: summary.bucket_0_30, color: '#10b981' },
            { label: '31–60 días', value: summary.bucket_31_60, color: '#f59e0b' },
            { label: '61–90 días', value: summary.bucket_61_90, color: '#f97316' },
            { label: '+90 días', value: summary.bucket_90_plus, color: '#ef4444' },
          ].map(b => (
            <div key={b.label} className="rounded-xl border p-4" style={{ background: '#151821', borderColor: '#2A3040' }}>
              <p className="text-xs text-[#6B7280]">{b.label}</p>
              <p className="text-lg font-bold" style={{ color: b.color }}>{formatCurrency(b.value, 'EUR')}</p>
            </div>
          ))}
        </div>
      )}

      {/* Tabla de clientes */}
      <Card className="p-0 overflow-hidden">
        <div className="p-3 border-b flex items-center justify-between" style={{ borderColor: '#2A3040' }}>
          <strong className="text-sm text-[#F0F2F5]">Detalle por cliente</strong>
          <Button size="sm" variant="secondary" onClick={loadAging} loading={loading}>
            <RefreshCw className="w-3 h-3 mr-1" /> Actualizar
          </Button>
        </div>

        {loading ? (
          <div className="flex items-center justify-center p-12">
            <Loader2 className="w-6 h-6 animate-spin text-[#f97316]" />
            <span className="ml-2 text-[#6B7280]">Calculando aging...</span>
          </div>
        ) : rows.length === 0 ? (
          <div className="text-center p-12 text-[#6B7280]">
            <CheckCircle2 className="w-10 h-10 mx-auto mb-2 text-[#10b981]" />
            <p>¡Sin facturas pendientes! Todo al día.</p>
          </div>
        ) : (
          <div className="divide-y" style={{ borderColor: '#2A3040' }}>
            {rows.map((row) => (
              <div key={row.client_id}>
                {/* Fila de cliente */}
                <button
                  onClick={() => setExpanded(prev => ({ ...prev, [row.client_id]: !prev[row.client_id] }))}
                  className="w-full text-left p-3 hover:bg-[#1A1F2E] transition-colors"
                >
                  <div className="flex items-center gap-3">
                    {expanded[row.client_id] ? <ChevronDown size={14} className="text-[#6B7280] shrink-0" /> : <ChevronRight size={14} className="text-[#6B7280] shrink-0" />}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <strong className="text-sm text-[#F0F2F5]">{row.client_name}</strong>
                        <Badge variant={row.max_days_overdue > 90 ? 'danger' : row.max_days_overdue > 60 ? 'orange' : row.max_days_overdue > 30 ? 'warning' : 'success'}>
                          {row.max_days_overdue}d mora máx.
                        </Badge>
                        <span className="text-xs text-[#6B7280]">{row.invoices.length} factura{row.invoices.length !== 1 ? 's' : ''}</span>
                      </div>
                      {row.last_payment_date && (
                        <p className="text-[10px] text-[#6B7280] mt-0.5">
                          Último pago: {new Date(row.last_payment_date).toLocaleDateString('es-AR')}
                        </p>
                      )}
                    </div>
                    {/* Barra de buckets */}
                    <div className="hidden md:flex items-center gap-2 text-xs">
                      {row.bucket_0_30 > 0 && <span style={{ color: '#10b981' }}>0-30: {formatCurrency(row.bucket_0_30, 'EUR')}</span>}
                      {row.bucket_31_60 > 0 && <span style={{ color: '#f59e0b' }}>31-60: {formatCurrency(row.bucket_31_60, 'EUR')}</span>}
                      {row.bucket_61_90 > 0 && <span style={{ color: '#f97316' }}>61-90: {formatCurrency(row.bucket_61_90, 'EUR')}</span>}
                      {row.bucket_90_plus > 0 && <span style={{ color: '#ef4444' }}>+90: {formatCurrency(row.bucket_90_plus, 'EUR')}</span>}
                    </div>
                    <div className="text-right shrink-0">
                      <p className="font-bold text-[#F0F2F5]">{formatCurrency(row.total_owed, 'EUR')}</p>
                    </div>
                  </div>
                </button>

                {/* Detalle expandido */}
                {expanded[row.client_id] && (
                  <div className="px-6 pb-4 space-y-3" style={{ background: '#0F1218' }}>
                    {/* Facturas */}
                    <div className="space-y-1 mt-2">
                      {row.invoices.map(inv => (
                        <div key={inv.id} className="flex items-center gap-3 py-1.5 border-b last:border-0 text-xs" style={{ borderColor: '#1E2330' }}>
                          <Badge variant={bucketVariant(inv.bucket)} size="sm">{inv.bucket}d</Badge>
                          <span className="text-[#9CA3AF] flex-1">{inv.legal_number || inv.id.slice(0, 8)}</span>
                          <span className="text-[#6B7280]">
                            <Calendar size={10} className="inline mr-1" />
                            Vto: {inv.expected_due}
                          </span>
                          <span style={{ color: bucketColor(inv.bucket) }} className="font-medium">
                            {formatCurrency(inv.total, inv.currency as 'EUR' | 'ARS' | 'USD')}
                          </span>
                          <span className="text-[#6B7280]">{inv.days_overdue}d</span>
                        </div>
                      ))}
                    </div>

                    {/* Sugerencia IA */}
                    <div className="rounded-lg border p-3" style={{ borderColor: '#2A3040', background: '#151821' }}>
                      {row.ai_suggestion ? (
                        <>
                          <div className="flex items-center gap-2 mb-2">
                            <Brain size={14} className="text-[#f97316]" />
                            <span className="text-xs font-semibold text-[#f97316]">Sugerencia IA</span>
                            {row.ai_suggestion_at && (
                              <span className="text-[10px] text-[#6B7280] ml-auto">
                                {new Date(row.ai_suggestion_at).toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' })}
                              </span>
                            )}
                          </div>
                          <p className="text-xs text-[#D1D5DB] leading-relaxed">{row.ai_suggestion}</p>
                        </>
                      ) : (
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-2 text-[#6B7280]">
                            <Brain size={14} />
                            <span className="text-xs">Obtener estrategia de cobro con IA</span>
                          </div>
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => loadAISuggestion(row.client_id)}
                            loading={aiLoading[row.client_id]}
                          >
                            <Brain size={12} className="mr-1" />
                            Analizar
                          </Button>
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </Card>
    </div>
  )
}

// ─── Tab 3: Cash Flow Forecast ───────────────────────────────────────────────

function ForecastTab({ companyId }: { companyId: string | null }) {
  const [forecast, setForecast] = useState<ForecastData | null>(null)
  const [loading, setLoading] = useState(false)
  const [horizon, setHorizon] = useState<30 | 60 | 90>(90)

  const loadForecast = useCallback(async (h: 30 | 60 | 90) => {
    if (!companyId) return
    setLoading(true)
    try {
      const res = await fetch(`/api/cashflow/forecast?company_id=${companyId}&horizon=${h}`)
      if (res.ok) {
        const data = await res.json()
        setForecast(data.forecast || null)
      }
    } finally {
      setLoading(false)
    }
  }, [companyId])

  useEffect(() => { void loadForecast(horizon) }, [loadForecast, horizon])

  const changeHorizon = (h: 30 | 60 | 90) => {
    setHorizon(h)
    void loadForecast(h)
  }

  if (!companyId) {
    return (
      <Card>
        <p className="text-center text-[#6B7280] py-8">Seleccioná una empresa para ver el forecast.</p>
      </Card>
    )
  }

  const maxBar = forecast
    ? Math.max(...forecast.weeks.map(w => Math.max(Math.abs(w.inflow), Math.abs(w.outflow))), 1)
    : 1

  return (
    <div className="space-y-4">
      {/* Selector de horizonte */}
      <div className="flex items-center gap-2">
        <span className="text-sm text-[#6B7280]">Horizonte:</span>
        {([30, 60, 90] as const).map(h => (
          <Button
            key={h}
            size="sm"
            variant={horizon === h ? 'primary' : 'secondary'}
            onClick={() => changeHorizon(h)}
          >
            {h} días
          </Button>
        ))}
      </div>

      {loading ? (
        <div className="flex items-center justify-center p-12">
          <Loader2 className="w-6 h-6 animate-spin text-[#f97316]" />
          <span className="ml-2 text-[#6B7280]">Calculando forecast...</span>
        </div>
      ) : !forecast ? null : (
        <>
          {/* KPIs */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <KPIBlock
              label="Ingresos esperados"
              value={formatCurrency(forecast.total_inflow, 'EUR')}
              sub={`${Math.round((forecast.inflow_invoices_likely / Math.max(forecast.inflow_invoices_pending, 1)) * 100)}% prob. cobro`}
              icon={<TrendingUp size={18} className="text-[#10b981]" />}
              color="#10b981"
            />
            <KPIBlock
              label="Egresos estimados"
              value={formatCurrency(forecast.total_outflow, 'EUR')}
              sub={`Compras + recurrentes`}
              icon={<TrendingDown size={18} className="text-[#ef4444]" />}
              color="#ef4444"
            />
            <KPIBlock
              label="Saldo neto"
              value={formatCurrency(forecast.net_cashflow, 'EUR')}
              sub={`Proyección ${horizon}d`}
              icon={forecast.net_cashflow >= 0 ? <CheckCircle2 size={18} className="text-[#10b981]" /> : <AlertTriangle size={18} className="text-[#ef4444]" />}
              color={forecast.net_cashflow >= 0 ? '#10b981' : '#ef4444'}
            />
            <KPIBlock
              label="Semanas en rojo"
              value={String(forecast.weeks_negative)}
              sub={forecast.weeks_negative > 0 ? `Mín. en ${forecast.min_balance_week}` : 'Sin semanas negativas'}
              icon={<AlertTriangle size={18} className={forecast.weeks_negative > 0 ? 'text-[#ef4444]' : 'text-[#10b981]'} />}
              color={forecast.weeks_negative > 0 ? '#ef4444' : '#10b981'}
            />
          </div>

          {/* Desglose */}
          <div className="grid grid-cols-2 gap-3">
            <Card>
              <h4 className="text-xs font-semibold text-[#6B7280] uppercase mb-2">Ingresos</h4>
              <div className="space-y-1 text-sm">
                <BreakdownRow label="Facturas pendientes" value={formatCurrency(forecast.inflow_invoices_pending, 'EUR')} color="#9CA3AF" />
                <BreakdownRow label="Cobro esperado (ajustado)" value={formatCurrency(forecast.inflow_invoices_likely, 'EUR')} color="#10b981" highlight />
              </div>
            </Card>
            <Card>
              <h4 className="text-xs font-semibold text-[#6B7280] uppercase mb-2">Egresos</h4>
              <div className="space-y-1 text-sm">
                <BreakdownRow label="Órdenes de compra" value={formatCurrency(forecast.outflow_purchases, 'EUR')} color="#9CA3AF" />
                <BreakdownRow label="Gastos recurrentes" value={formatCurrency(forecast.outflow_recurring, 'EUR')} color="#ef4444" highlight />
              </div>
            </Card>
          </div>

          {/* Gráfico de barras CSS */}
          <Card>
            <h4 className="text-sm font-semibold text-[#F0F2F5] mb-4">Flujo semana a semana</h4>
            <div className="space-y-2">
              {/* Leyenda */}
              <div className="flex gap-4 mb-4 text-xs text-[#6B7280]">
                <div className="flex items-center gap-1.5"><div className="w-3 h-3 rounded-sm bg-[#10b981]" /> Ingresos</div>
                <div className="flex items-center gap-1.5"><div className="w-3 h-3 rounded-sm bg-[#ef4444]" /> Egresos</div>
                <div className="flex items-center gap-1.5"><div className="w-3 h-3 rounded-sm bg-[#3b82f6]" /> Saldo acumulado</div>
              </div>

              {forecast.weeks.map((week) => {
                const inflowPct = Math.min(100, (week.inflow / maxBar) * 100)
                const outflowPct = Math.min(100, (week.outflow / maxBar) * 100)
                const isNegative = week.running_balance < 0
                return (
                  <div key={week.week_start} className="space-y-1">
                    <div className="flex items-center gap-2 text-xs text-[#6B7280]">
                      <span className="w-12 shrink-0">{week.week_label}</span>
                      <span className="text-[10px]">{week.week_start} → {week.week_end}</span>
                      <span className="ml-auto" style={{ color: isNegative ? '#ef4444' : '#10b981' }}>
                        {formatCurrency(week.running_balance, 'EUR')}
                      </span>
                    </div>
                    {/* Barra ingresos */}
                    <div className="flex items-center gap-2">
                      <span className="w-12 text-[10px] text-[#6B7280] shrink-0 text-right">
                        {formatCurrency(week.inflow, 'EUR').replace('€', '')}
                      </span>
                      <div className="flex-1 h-3 rounded-sm overflow-hidden" style={{ background: '#1E2330' }}>
                        <div
                          className="h-full rounded-sm transition-all duration-500"
                          style={{ width: `${inflowPct}%`, background: '#10b981' }}
                        />
                      </div>
                    </div>
                    {/* Barra egresos */}
                    <div className="flex items-center gap-2">
                      <span className="w-12 text-[10px] text-[#6B7280] shrink-0 text-right">
                        {formatCurrency(week.outflow, 'EUR').replace('€', '')}
                      </span>
                      <div className="flex-1 h-3 rounded-sm overflow-hidden" style={{ background: '#1E2330' }}>
                        <div
                          className="h-full rounded-sm transition-all duration-500"
                          style={{ width: `${outflowPct}%`, background: isNegative ? '#ef4444' : '#f59e0b' }}
                        />
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>
          </Card>

          {/* Alerta si hay semanas negativas */}
          {forecast.weeks_negative > 0 && (
            <div className="flex items-start gap-3 p-4 rounded-xl border" style={{ borderColor: '#ef4444', background: 'rgba(239,68,68,0.08)' }}>
              <AlertTriangle size={18} className="text-[#ef4444] shrink-0 mt-0.5" />
              <div>
                <p className="text-sm font-medium text-[#ef4444]">
                  {forecast.weeks_negative} semana{forecast.weeks_negative !== 1 ? 's' : ''} con saldo negativo
                </p>
                <p className="text-xs text-[#9CA3AF] mt-1">
                  El saldo más bajo proyectado es {formatCurrency(forecast.min_balance, 'EUR')} en {forecast.min_balance_week}.
                  Revisá las facturas pendientes de cobro y considerá adelantar cobros o diferir pagos.
                </p>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  )
}

// ─── Sub-componentes ─────────────────────────────────────────────────────────

function KPIBlock({ label, value, sub, icon, color }: {
  label: string
  value: string
  sub: string
  icon: React.ReactNode
  color: string
}) {
  return (
    <div className="rounded-xl border p-4" style={{ background: '#151821', borderColor: '#2A3040' }}>
      <div className="flex items-center justify-between mb-2">
        <p className="text-xs text-[#6B7280]">{label}</p>
        {icon}
      </div>
      <p className="text-xl font-bold" style={{ color }}>{value}</p>
      <p className="text-[10px] text-[#6B7280] mt-1">{sub}</p>
    </div>
  )
}

function BreakdownRow({ label, value, color, highlight }: {
  label: string
  value: string
  color: string
  highlight?: boolean
}) {
  return (
    <div className={`flex justify-between items-center py-1 ${highlight ? 'font-semibold' : ''}`}>
      <span className="text-[#9CA3AF] text-xs">{label}</span>
      <span style={{ color }} className="text-xs">{value}</span>
    </div>
  )
}
