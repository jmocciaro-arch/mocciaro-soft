'use client'

import { useEffect, useState } from 'react'
import { Database, RefreshCw, Check } from 'lucide-react'
import { listMeta, onCacheEvent, type CacheMeta } from '@/lib/cache/entity-cache'
import { prefetchAll } from '@/lib/cache/fetchers'
import { useCompanyContext } from '@/lib/company-context'

function relTime(ms: number): string {
  const s = Math.floor(ms / 1000)
  if (s < 60) return 'recién'
  const m = Math.floor(s / 60)
  if (m < 60) return `${m}m`
  const h = Math.floor(m / 60)
  if (h < 24) return `${h}h`
  return `${Math.floor(h / 24)}d`
}

export function CacheStatusBadge() {
  const [meta, setMeta] = useState<CacheMeta[]>([])
  const [refreshing, setRefreshing] = useState(false)
  const [open, setOpen] = useState(false)
  const { activeCompanyId, activeCompanyIds, isMultiMode } = useCompanyContext()

  useEffect(() => {
    let mounted = true
    listMeta().then((m) => { if (mounted) setMeta(m) })
    const off = onCacheEvent(async (ev) => {
      if (ev.kind === 'refreshing') {
        setRefreshing(true)
      } else if (ev.kind === 'updated' || ev.kind === 'error') {
        setRefreshing(false)
        const m = await listMeta()
        if (mounted) setMeta(m)
      }
    })
    return () => { mounted = false; off() }
  }, [])

  // Re-render relativo cada minuto
  const [, force] = useState(0)
  useEffect(() => {
    const i = setInterval(() => force((x) => x + 1), 60_000)
    return () => clearInterval(i)
  }, [])

  const oldest = meta.length > 0 ? Math.min(...meta.map((m) => m.fetchedAt)) : 0
  const age = oldest ? Date.now() - oldest : null
  const total = meta.reduce((acc, m) => acc + m.count, 0)

  async function refreshNow() {
    setRefreshing(true)
    const ids = isMultiMode ? activeCompanyIds : (activeCompanyId ? [activeCompanyId] : [])
    try {
      await prefetchAll({ companyIds: ids, force: true })
    } finally {
      setRefreshing(false)
      setMeta(await listMeta())
    }
  }

  return (
    <div className="relative">
      <button
        onClick={() => setOpen((v) => !v)}
        className="flex items-center gap-1.5 px-2 py-1 rounded-md text-xs text-[#9CA3AF] hover:text-[#F0F2F5] hover:bg-[#1F2530] transition"
        title="Cache local"
      >
        {refreshing ? <RefreshCw size={12} className="animate-spin" /> : <Database size={12} />}
        <span className="hidden md:inline">
          {refreshing ? 'Sincronizando…' : age != null ? `Cache · ${relTime(age)}` : 'Sin cache'}
        </span>
      </button>
      {open && (
        <div className="absolute right-0 mt-2 w-72 rounded-lg border border-[#1E2330] bg-[#0F1218] shadow-xl z-50 p-3">
          <div className="flex items-center justify-between mb-2">
            <div className="text-sm font-medium text-[#F0F2F5]">Cache local</div>
            <button
              onClick={refreshNow}
              disabled={refreshing}
              className="flex items-center gap-1 text-xs px-2 py-1 rounded bg-[#FF6600] hover:bg-[#E65C00] text-white disabled:opacity-50"
            >
              <RefreshCw size={12} className={refreshing ? 'animate-spin' : ''} />
              Refrescar
            </button>
          </div>
          <div className="text-[11px] text-[#6B7280] mb-2">
            {total.toLocaleString('es-AR')} registros guardados
          </div>
          <div className="space-y-1">
            {meta.length === 0 && (
              <div className="text-xs text-[#6B7280]">Aún no se descargó nada.</div>
            )}
            {meta.map((m) => {
              const a = Date.now() - m.fetchedAt
              const stale = a > m.ttlMs
              return (
                <div key={m.key} className="flex items-center justify-between text-xs">
                  <span className="text-[#D1D5DB]">{m.entity}</span>
                  <span className="flex items-center gap-1">
                    <span className="text-[#6B7280]">{m.count.toLocaleString('es-AR')}</span>
                    <span className={stale ? 'text-[#F59E0B]' : 'text-[#10B981]'}>
                      {stale ? '⏱' : <Check size={10} />}
                    </span>
                    <span className="text-[#6B7280] tabular-nums">{relTime(a)}</span>
                  </span>
                </div>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}
