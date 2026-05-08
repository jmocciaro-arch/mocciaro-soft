'use client'

/**
 * Dashboard de observabilidad — Fase 0.6 del PLAN-REFACTOR.
 *
 * Muestra el estado de los cron jobs leyendo:
 *   - vw_cron_health (resumen últimas 24h, last_success, last_failure)
 *   - tt_cron_runs (últimas 50 corridas con duración + status)
 *
 * Solo visible para admin/super_admin (RLS lo enforce a nivel DB).
 *
 * STATUS: esqueleto. Requiere migración v59 aplicada para mostrar datos.
 * Si la tabla no existe, muestra mensaje "migración v59 pendiente".
 */

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { CheckCircle2, AlertTriangle, Clock, RefreshCw, Activity } from 'lucide-react'

interface CronHealth {
  cron_name: string
  runs_24h: number
  success_24h: number
  failed_24h: number
  timeout_24h: number
  last_success_at: string | null
  last_failure_at: string | null
  avg_duration_ms_7d: number | null
  consecutive_failures: number
}

interface CronRun {
  id: string
  cron_name: string
  endpoint: string
  status: 'started' | 'success' | 'failed' | 'timeout'
  started_at: string
  finished_at: string | null
  duration_ms: number | null
  error_message: string | null
  triggered_by: string
}

export default function ObservabilityPage() {
  const supabase = createClient()
  const [health, setHealth] = useState<CronHealth[]>([])
  const [runs, setRuns] = useState<CronRun[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const load = async () => {
    setLoading(true)
    setError(null)

    try {
      const [{ data: h, error: hErr }, { data: r, error: rErr }] = await Promise.all([
        supabase
          .from('vw_cron_health')
          .select('cron_name, runs_24h, success_24h, failed_24h, timeout_24h, last_success_at, last_failure_at, avg_duration_ms_7d, consecutive_failures')
          .order('cron_name'),
        supabase
          .from('tt_cron_runs')
          .select('id, cron_name, endpoint, status, started_at, finished_at, duration_ms, error_message, triggered_by')
          .order('started_at', { ascending: false })
          .limit(50),
      ])

      if (hErr || rErr) {
        const msg = hErr?.message ?? rErr?.message ?? 'unknown error'
        if (msg.includes('does not exist') || msg.includes('relation') || msg.includes('vw_cron_health')) {
          setError('Migración v59 (tt_cron_runs) no aplicada todavía. Ver supabase/migration-v59-cron-observability.sql.')
        } else {
          setError(msg)
        }
        return
      }

      setHealth((h ?? []) as CronHealth[])
      setRuns((r ?? []) as CronRun[])
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { void load() }, [])

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-[#FF6600] text-xs uppercase tracking-wider font-semibold flex items-center gap-2">
            <Activity size={14} /> Observabilidad
          </p>
          <h1 className="text-2xl font-bold text-[#F0F2F5] mt-1">Cron jobs · últimas 24h</h1>
          <p className="text-sm text-[#9CA3AF] mt-1">
            Estado de los 8 cron jobs definidos en <code className="bg-[#0B0E13] px-1.5 py-0.5 rounded text-xs">vercel.json</code>.
            Si un cron tiene <strong>2+ fallos consecutivos</strong> debería investigarse.
          </p>
        </div>
        <button
          onClick={() => void load()}
          className="px-3 py-1.5 rounded-md border border-[#2A3040] text-sm text-[#9CA3AF] hover:text-[#F0F2F5] hover:bg-[#1E2330] flex items-center gap-1.5"
        >
          <RefreshCw size={14} className={loading ? 'animate-spin' : ''} /> Refrescar
        </button>
      </div>

      {error && (
        <div className="rounded-lg border border-amber-500/30 bg-amber-500/5 p-4">
          <p className="flex items-start gap-2 text-sm text-amber-400">
            <AlertTriangle size={16} className="shrink-0 mt-0.5" />
            <span>{error}</span>
          </p>
        </div>
      )}

      {/* Cron health cards */}
      <section>
        <h2 className="text-sm font-semibold text-[#F0F2F5] uppercase tracking-wider mb-3">Estado por cron</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
          {health.length === 0 && !loading && !error && (
            <div className="col-span-full rounded-lg border border-[#2A3040] bg-[#141820] p-6 text-center text-sm text-[#6B7280]">
              Sin runs registradas en las últimas 24h. Esperá al próximo schedule o disparalos manual con CRON_SECRET.
            </div>
          )}
          {health.map((h) => {
            const tone = h.consecutive_failures >= 2 ? 'danger' : h.failed_24h > 0 ? 'warn' : 'good'
            const colors = {
              good: 'border-emerald-500/30 bg-emerald-500/5',
              warn: 'border-amber-500/30 bg-amber-500/5',
              danger: 'border-red-500/30 bg-red-500/5',
            }
            const Icon = tone === 'good' ? CheckCircle2 : tone === 'warn' ? Clock : AlertTriangle
            const iconColor = tone === 'good' ? 'text-emerald-400' : tone === 'warn' ? 'text-amber-400' : 'text-red-400'

            return (
              <div key={h.cron_name} className={`rounded-lg border ${colors[tone]} p-4`}>
                <div className="flex items-center justify-between">
                  <code className="text-sm font-mono font-bold text-[#F0F2F5]">{h.cron_name}</code>
                  <Icon size={18} className={iconColor} />
                </div>
                <div className="mt-2 grid grid-cols-3 gap-2 text-xs">
                  <Stat label="Runs 24h" value={h.runs_24h} />
                  <Stat label="OK" value={h.success_24h} tone={h.success_24h === h.runs_24h ? 'good' : 'default'} />
                  <Stat label="Fail" value={h.failed_24h + h.timeout_24h} tone={h.failed_24h + h.timeout_24h > 0 ? 'warn' : 'default'} />
                </div>
                <p className="text-[10px] text-[#6B7280] mt-3">
                  Última éxito: {h.last_success_at ? formatRel(h.last_success_at) : '—'}
                </p>
                {h.consecutive_failures > 0 && (
                  <p className="text-[10px] text-red-400 mt-1">
                    ⚠ {h.consecutive_failures} fallo{h.consecutive_failures > 1 ? 's' : ''} consecutivo{h.consecutive_failures > 1 ? 's' : ''} desde último éxito
                  </p>
                )}
                {h.avg_duration_ms_7d != null && (
                  <p className="text-[10px] text-[#6B7280] mt-1">
                    Avg duración 7d: {Math.round(h.avg_duration_ms_7d)}ms
                  </p>
                )}
              </div>
            )
          })}
        </div>
      </section>

      {/* Últimas 50 runs */}
      <section>
        <h2 className="text-sm font-semibold text-[#F0F2F5] uppercase tracking-wider mb-3">Últimas 50 corridas</h2>
        <div className="rounded-lg border border-[#2A3040] bg-[#141820] overflow-hidden">
          <table className="w-full text-xs">
            <thead className="border-b border-[#2A3040] text-[#6B7280] uppercase">
              <tr>
                <th className="text-left px-3 py-2">Cron</th>
                <th className="text-left px-3 py-2">Endpoint</th>
                <th className="text-left px-3 py-2">Trigger</th>
                <th className="text-left px-3 py-2">Iniciada</th>
                <th className="text-right px-3 py-2">Duración</th>
                <th className="text-center px-3 py-2">Status</th>
                <th className="text-left px-3 py-2">Error</th>
              </tr>
            </thead>
            <tbody>
              {runs.map((r) => (
                <tr key={r.id} className="border-b border-[#1E2330] last:border-0 hover:bg-[#1A1F2E]">
                  <td className="px-3 py-1.5 font-mono text-[#F0F2F5]">{r.cron_name}</td>
                  <td className="px-3 py-1.5 text-[#9CA3AF]">{r.endpoint}</td>
                  <td className="px-3 py-1.5 text-[#6B7280]">{r.triggered_by}</td>
                  <td className="px-3 py-1.5 text-[#9CA3AF]">{formatRel(r.started_at)}</td>
                  <td className="px-3 py-1.5 text-right font-mono">{r.duration_ms != null ? `${r.duration_ms}ms` : '—'}</td>
                  <td className="px-3 py-1.5 text-center">
                    <StatusPill status={r.status} />
                  </td>
                  <td className="px-3 py-1.5 text-red-400 max-w-xs truncate" title={r.error_message ?? undefined}>
                    {r.error_message ?? ''}
                  </td>
                </tr>
              ))}
              {runs.length === 0 && !loading && (
                <tr>
                  <td colSpan={7} className="text-center py-8 text-sm text-[#6B7280]">Sin runs todavía</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  )
}

function Stat({ label, value, tone = 'default' }: { label: string; value: number; tone?: 'default' | 'good' | 'warn' }) {
  const colors = {
    default: 'text-[#F0F2F5]',
    good: 'text-emerald-400',
    warn: 'text-amber-400',
  }
  return (
    <div>
      <p className="text-[9px] uppercase text-[#6B7280]">{label}</p>
      <p className={`text-sm font-mono font-semibold ${colors[tone]}`}>{value}</p>
    </div>
  )
}

function StatusPill({ status }: { status: CronRun['status'] }) {
  const map = {
    started: { label: 'Corriendo', cls: 'bg-blue-500/15 text-blue-400 border-blue-500/30' },
    success: { label: 'OK', cls: 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30' },
    failed: { label: 'Falló', cls: 'bg-red-500/15 text-red-400 border-red-500/30' },
    timeout: { label: 'Timeout', cls: 'bg-amber-500/15 text-amber-400 border-amber-500/30' },
  }
  const m = map[status]
  return <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold border ${m.cls}`}>{m.label}</span>
}

function formatRel(iso: string): string {
  const d = new Date(iso)
  const diffMs = Date.now() - d.getTime()
  const sec = Math.floor(diffMs / 1000)
  if (sec < 60) return `hace ${sec}s`
  const min = Math.floor(sec / 60)
  if (min < 60) return `hace ${min}min`
  const h = Math.floor(min / 60)
  if (h < 24) return `hace ${h}h`
  const days = Math.floor(h / 24)
  return `hace ${days}d`
}
