'use client'

/**
 * Admin · Consumo de IA
 * Muestra cuánto se gasta en APIs de IA (Claude, Gemini) por operación, modelo y día.
 */

import { useEffect, useState, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Card } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Sparkles, DollarSign, Zap, Package, RefreshCw, TrendingUp, TrendingDown,
} from 'lucide-react'

interface DailyUsage {
  day: string
  operation: string
  provider: string
  model: string | null
  request_count: number
  cache_hits: number
  total_input_tokens: number
  total_output_tokens: number
  total_cache_tokens: number
  total_cost_usd: number
  avg_duration_ms: number | null
}

interface RecentUsage {
  id: string
  operation: string
  provider: string
  model: string | null
  input_tokens: number
  output_tokens: number
  cache_read_tokens: number
  cache_hit: boolean
  cost_usd: number
  duration_ms: number | null
  created_at: string
  reference_type: string | null
}

interface CacheStats {
  total_entries: number
  total_hits: number
  total_saved_usd: number
  top_cached: Array<{ operation: string; hits: number; saved_usd: number }>
}

export default function AIUsagePage() {
  const [daily, setDaily] = useState<DailyUsage[]>([])
  const [recent, setRecent] = useState<RecentUsage[]>([])
  const [cacheStats, setCacheStats] = useState<CacheStats | null>(null)
  const [loading, setLoading] = useState(true)
  const [range, setRange] = useState<'7d' | '30d' | '90d'>('30d')

  const load = useCallback(async () => {
    setLoading(true)
    const sb = createClient()
    const daysAgo = range === '7d' ? 7 : range === '30d' ? 30 : 90
    const fromDate = new Date(Date.now() - daysAgo * 24 * 60 * 60 * 1000).toISOString()

    // Vista agregada por día
    const { data: dailyData } = await sb
      .from('tt_ai_usage_daily')
      .select('*')
      .gte('day', fromDate.slice(0, 10))
      .order('day', { ascending: false })
    setDaily((dailyData || []) as DailyUsage[])

    // Últimos 20 requests individuales
    const { data: recentData } = await sb
      .from('tt_ai_usage')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(20)
    setRecent((recentData || []) as RecentUsage[])

    // Cache stats
    const { data: cacheData } = await sb
      .from('tt_ai_cache')
      .select('operation, hit_count, cost_usd')
    if (cacheData) {
      const totalEntries = cacheData.length
      const totalHits = cacheData.reduce((s, c) => s + (c.hit_count || 0), 0)
      const totalSaved = cacheData.reduce((s, c) => s + ((c.hit_count || 0) * Number(c.cost_usd || 0)), 0)

      const byOp: Record<string, { hits: number; saved: number }> = {}
      for (const c of cacheData) {
        const op = c.operation as string
        if (!byOp[op]) byOp[op] = { hits: 0, saved: 0 }
        byOp[op].hits += c.hit_count || 0
        byOp[op].saved += (c.hit_count || 0) * Number(c.cost_usd || 0)
      }
      const topCached = Object.entries(byOp)
        .map(([op, v]) => ({ operation: op, hits: v.hits, saved_usd: v.saved }))
        .sort((a, b) => b.saved_usd - a.saved_usd)
        .slice(0, 5)

      setCacheStats({
        total_entries: totalEntries,
        total_hits: totalHits,
        total_saved_usd: totalSaved,
        top_cached: topCached,
      })
    }

    setLoading(false)
  }, [range])

  useEffect(() => { void load() }, [load])

  const totalCost = daily.reduce((s, d) => s + Number(d.total_cost_usd || 0), 0)
  const totalRequests = daily.reduce((s, d) => s + (d.request_count || 0), 0)
  const totalCacheHits = daily.reduce((s, d) => s + (d.cache_hits || 0), 0)
  const cacheHitRate = totalRequests > 0 ? (totalCacheHits / totalRequests) * 100 : 0

  return (
    <div className="space-y-6 p-6 animate-fade-in">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-[#F0F2F5] flex items-center gap-2">
          <Sparkles size={22} className="text-[#FF6600]" />
          Consumo de IA
        </h1>
        <p className="text-sm text-[#6B7280] mt-1">
          Seguimiento de costos reales de Claude (Anthropic) y Gemini (Google).
        </p>
      </div>

      {/* Range selector + refresh */}
      <div className="flex items-center gap-3">
        {(['7d', '30d', '90d'] as const).map(r => (
          <button
            key={r}
            onClick={() => setRange(r)}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition ${
              range === r
                ? 'bg-[#FF6600] text-white'
                : 'bg-[#141820] text-[#9CA3AF] hover:text-[#F0F2F5] border border-[#1E2330]'
            }`}
          >
            {r === '7d' ? 'Últimos 7 días' : r === '30d' ? 'Últimos 30 días' : 'Últimos 90 días'}
          </button>
        ))}
        <Button variant="secondary" size="sm" onClick={load}>
          <RefreshCw size={12} /> Refrescar
        </Button>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <KPI
          icon={<DollarSign size={16} className="text-emerald-400" />}
          label="Costo total"
          value={`US$ ${totalCost.toFixed(2)}`}
          tone="emerald"
        />
        <KPI
          icon={<Zap size={16} className="text-blue-400" />}
          label="Requests"
          value={totalRequests.toLocaleString('es-AR')}
          tone="blue"
        />
        <KPI
          icon={<Package size={16} className="text-violet-400" />}
          label="Cache hit rate"
          value={`${cacheHitRate.toFixed(1)}%`}
          sub={`${totalCacheHits} de ${totalRequests} evitados`}
          tone="violet"
        />
        <KPI
          icon={<TrendingDown size={16} className="text-orange-400" />}
          label="Ahorro por cache"
          value={`US$ ${(cacheStats?.total_saved_usd ?? 0).toFixed(2)}`}
          sub={`${cacheStats?.total_entries ?? 0} entradas cacheadas`}
          tone="orange"
        />
      </div>

      {/* Tabla diaria agregada */}
      <Card className="p-0 overflow-hidden">
        <div className="p-3 border-b border-[#1E2330]">
          <strong className="text-sm text-[#F0F2F5]">Consumo por día · operación · modelo</strong>
        </div>
        {loading ? (
          <div className="p-8 text-center text-[#6B7280]">Cargando...</div>
        ) : daily.length === 0 ? (
          <div className="p-8 text-center text-[#6B7280]">Sin consumo en el rango seleccionado</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-[#0A0D12] border-b border-[#1E2330]">
                <tr className="text-left text-[10px] uppercase tracking-wider text-[#6B7280]">
                  <th className="px-3 py-2">Día</th>
                  <th className="px-3 py-2">Operación</th>
                  <th className="px-3 py-2">Provider / Modelo</th>
                  <th className="px-3 py-2 text-right">Requests</th>
                  <th className="px-3 py-2 text-right">Cache hits</th>
                  <th className="px-3 py-2 text-right">Input tokens</th>
                  <th className="px-3 py-2 text-right">Output tokens</th>
                  <th className="px-3 py-2 text-right">Costo</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#1E2330]">
                {daily.map((d, i) => (
                  <tr key={i} className="hover:bg-[#141820]">
                    <td className="px-3 py-2 font-mono text-xs text-[#9CA3AF]">{d.day}</td>
                    <td className="px-3 py-2 text-[#F0F2F5]">{d.operation}</td>
                    <td className="px-3 py-2 text-[#9CA3AF]">
                      <Badge variant={d.provider === 'claude' ? 'warning' : 'info'} size="sm">
                        {d.provider}
                      </Badge>{' '}
                      <span className="text-[10px] font-mono">{d.model || '—'}</span>
                    </td>
                    <td className="px-3 py-2 text-right font-mono">{d.request_count}</td>
                    <td className="px-3 py-2 text-right font-mono text-violet-400">{d.cache_hits}</td>
                    <td className="px-3 py-2 text-right font-mono text-[#6B7280]">
                      {d.total_input_tokens.toLocaleString('es-AR')}
                    </td>
                    <td className="px-3 py-2 text-right font-mono text-[#6B7280]">
                      {d.total_output_tokens.toLocaleString('es-AR')}
                    </td>
                    <td className="px-3 py-2 text-right font-mono font-bold text-emerald-400">
                      ${Number(d.total_cost_usd || 0).toFixed(4)}
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="bg-[#0F1218] border-t-2 border-[#FF6600]/30 font-semibold">
                  <td colSpan={7} className="px-3 py-2 text-right text-[#9CA3AF]">TOTAL</td>
                  <td className="px-3 py-2 text-right font-mono text-[#FF6600]">US$ {totalCost.toFixed(4)}</td>
                </tr>
              </tfoot>
            </table>
          </div>
        )}
      </Card>

      {/* Últimos requests individuales */}
      <Card className="p-0 overflow-hidden">
        <div className="p-3 border-b border-[#1E2330]">
          <strong className="text-sm text-[#F0F2F5]">Últimos 20 requests</strong>
        </div>
        {recent.length === 0 ? (
          <div className="p-8 text-center text-[#6B7280]">Sin requests registrados</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-[#0A0D12]">
                <tr className="text-left text-[10px] uppercase tracking-wider text-[#6B7280]">
                  <th className="px-3 py-2">Hora</th>
                  <th className="px-3 py-2">Operación</th>
                  <th className="px-3 py-2">Provider</th>
                  <th className="px-3 py-2 text-right">Tokens</th>
                  <th className="px-3 py-2 text-right">Cache</th>
                  <th className="px-3 py-2 text-right">Duración</th>
                  <th className="px-3 py-2 text-right">Costo</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#1E2330]">
                {recent.map(r => (
                  <tr key={r.id} className="hover:bg-[#141820]">
                    <td className="px-3 py-2 font-mono text-[10px] text-[#6B7280]">
                      {new Date(r.created_at).toLocaleString('es-AR', { hour: '2-digit', minute: '2-digit', day: '2-digit', month: '2-digit' })}
                    </td>
                    <td className="px-3 py-2 text-[#F0F2F5]">{r.operation}</td>
                    <td className="px-3 py-2">
                      <Badge variant={r.provider === 'claude' ? 'warning' : 'info'} size="sm">{r.provider}</Badge>
                    </td>
                    <td className="px-3 py-2 text-right font-mono text-[10px] text-[#6B7280]">
                      {(r.input_tokens || 0) + (r.output_tokens || 0) > 0
                        ? `${r.input_tokens} ↑ · ${r.output_tokens} ↓`
                        : '—'}
                    </td>
                    <td className="px-3 py-2 text-right text-xs">
                      {r.cache_hit ? (
                        <span className="text-violet-400">⚡ hit</span>
                      ) : r.cache_read_tokens > 0 ? (
                        <span className="text-cyan-400">{r.cache_read_tokens} pc</span>
                      ) : (
                        <span className="text-[#4B5563]">—</span>
                      )}
                    </td>
                    <td className="px-3 py-2 text-right font-mono text-[10px] text-[#6B7280]">
                      {r.duration_ms ? `${r.duration_ms}ms` : '—'}
                    </td>
                    <td className="px-3 py-2 text-right font-mono font-semibold text-emerald-400">
                      ${Number(r.cost_usd || 0).toFixed(4)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {/* Nota explicativa */}
      <Card className="p-4 bg-[#FF6600]/5 border-[#FF6600]/20">
        <p className="text-xs text-[#9CA3AF]">
          <strong className="text-[#FF6600]">💡 Cómo se reduce el costo:</strong>{' '}
          (1) Usamos Claude <strong>Haiku 4.5</strong> en lugar de Sonnet (3× más barato con misma calidad para extracción).{' '}
          (2) <strong>Prompt caching</strong> ephemeral del system prompt (-90% tokens de sistema en llamadas repetidas).{' '}
          (3) <strong>Cache de respuestas</strong> por hash del input (si subís el mismo PDF 2 veces, es instantáneo y gratis).{' '}
          (4) Gemini 2.0 Flash como fallback gratuito hasta cuota diaria.
        </p>
      </Card>
    </div>
  )
}

function KPI({ icon, label, value, sub, tone }: {
  icon: React.ReactNode
  label: string
  value: string
  sub?: string
  tone?: 'emerald' | 'blue' | 'violet' | 'orange'
}) {
  const borderTone = {
    emerald: 'border-emerald-500/20',
    blue: 'border-blue-500/20',
    violet: 'border-violet-500/20',
    orange: 'border-orange-500/20',
  }[tone || 'emerald']

  return (
    <div className={`p-4 rounded-xl bg-[#0F1218] border ${borderTone}`}>
      <div className="flex items-center gap-2 text-[10px] uppercase tracking-wider text-[#6B7280]">
        {icon} {label}
      </div>
      <div className="text-2xl font-bold text-[#F0F2F5] mt-1 font-mono">{value}</div>
      {sub && <div className="text-[10px] text-[#4B5563] mt-0.5">{sub}</div>}
    </div>
  )
}
