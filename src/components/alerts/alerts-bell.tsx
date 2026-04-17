'use client'

import { useEffect, useState, useRef } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useCompanyContext } from '@/lib/company-context'
import { Bell, X, Check } from 'lucide-react'

interface Alert {
  id: string
  type: string
  title: string
  body?: string
  severity: 'info' | 'warning' | 'danger' | 'success'
  created_at: string
  read_at?: string | null
  dismissed_at?: string | null
  entity_type?: string
  entity_id?: string
}

export function AlertsBell() {
  const { activeCompanyIds } = useCompanyContext()
  const supabase = createClient()
  const [open, setOpen] = useState(false)
  const [alerts, setAlerts] = useState<Alert[]>([])
  const ref = useRef<HTMLDivElement>(null)

  async function load() {
    if (activeCompanyIds.length === 0) return
    const { data } = await supabase
      .from('tt_generated_alerts')
      .select('*')
      .in('company_id', activeCompanyIds)
      .is('dismissed_at', null)
      .order('created_at', { ascending: false })
      .limit(30)
    setAlerts((data as Alert[]) || [])
  }

  useEffect(() => {
    void load()
    const t = setInterval(load, 60000)  // refrescar cada 60s
    return () => clearInterval(t)

  }, [activeCompanyIds.length])

  useEffect(() => {
    function onOutside(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', onOutside)
    return () => document.removeEventListener('mousedown', onOutside)
  }, [])

  const unreadCount = alerts.filter((a) => !a.read_at).length

  async function dismiss(id: string) {
    await supabase.from('tt_generated_alerts').update({ dismissed_at: new Date().toISOString() }).eq('id', id)
    setAlerts((a) => a.filter((x) => x.id !== id))
  }

  async function markAllRead() {
    if (alerts.length === 0) return
    const ids = alerts.filter((a) => !a.read_at).map((a) => a.id)
    if (!ids.length) return
    await supabase.from('tt_generated_alerts').update({ read_at: new Date().toISOString() }).in('id', ids)
    setAlerts((a) => a.map((x) => ({ ...x, read_at: x.read_at || new Date().toISOString() })))
  }

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => { setOpen(!open); if (!open && unreadCount > 0) markAllRead() }}
        className="relative p-2 rounded hover:bg-white/5"
        title="Alertas"
      >
        <Bell className="w-5 h-5 opacity-80" />
        {unreadCount > 0 && (
          <span
            className="absolute -top-0.5 -right-0.5 rounded-full flex items-center justify-center text-[10px] font-bold"
            style={{
              background: '#ef4444', color: 'white',
              width: 18, height: 18, minWidth: 18,
            }}
          >
            {unreadCount > 9 ? '9+' : unreadCount}
          </span>
        )}
      </button>

      {open && (
        <div
          className="absolute right-0 mt-2 rounded-lg shadow-2xl border overflow-hidden z-50"
          style={{ background: '#0F1218', borderColor: '#2A3040', width: 380, maxHeight: 500 }}
        >
          <div className="flex items-center justify-between px-3 py-2 border-b" style={{ borderColor: '#2A3040' }}>
            <strong className="text-sm">Alertas ({alerts.length})</strong>
            {alerts.length > 0 && (
              <button type="button" onClick={markAllRead} className="text-xs underline opacity-60 hover:opacity-100">
                Marcar todas leídas
              </button>
            )}
          </div>

          <div className="overflow-y-auto" style={{ maxHeight: 440 }}>
            {alerts.length === 0 ? (
              <div className="p-6 text-center opacity-60 text-sm">
                ✓ No hay alertas pendientes
              </div>
            ) : (
              alerts.map((a) => {
                const colors: any = {
                  danger: { bg: 'rgba(239,68,68,0.08)', color: '#ef4444', border: 'rgba(239,68,68,0.3)' },
                  warning: { bg: 'rgba(249,115,22,0.08)', color: '#f97316', border: 'rgba(249,115,22,0.3)' },
                  info: { bg: 'rgba(59,130,246,0.08)', color: '#3b82f6', border: 'rgba(59,130,246,0.3)' },
                  success: { bg: 'rgba(16,185,129,0.08)', color: '#10b981', border: 'rgba(16,185,129,0.3)' },
                }
                const c = colors[a.severity] || colors.info
                return (
                  <div
                    key={a.id}
                    className="px-3 py-2 border-b text-sm flex items-start gap-2"
                    style={{ borderColor: '#2A3040', background: !a.read_at ? c.bg : 'transparent' }}
                  >
                    <span className="text-lg" style={{ color: c.color }}>
                      {a.severity === 'danger' ? '🔴' : a.severity === 'warning' ? '🟠' : a.severity === 'success' ? '✓' : 'ℹ'}
                    </span>
                    <div className="flex-1 min-w-0">
                      <div className="font-semibold text-xs">{a.title}</div>
                      {a.body && <div className="text-xs opacity-70 mt-0.5">{a.body}</div>}
                      <div className="text-[10px] opacity-40 mt-1">{new Date(a.created_at).toLocaleString('es-AR')}</div>
                    </div>
                    <button
                      type="button"
                      onClick={() => dismiss(a.id)}
                      className="p-1 opacity-60 hover:opacity-100"
                      title="Descartar"
                    >
                      <X className="w-3 h-3" />
                    </button>
                  </div>
                )
              })
            )}
          </div>
        </div>
      )}
    </div>
  )
}
