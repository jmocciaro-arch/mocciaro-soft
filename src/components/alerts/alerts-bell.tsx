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
          className="absolute right-0 mt-2 rounded-md shadow-xl overflow-hidden z-50 bg-white border border-[#E5E5E5]"
          style={{ width: 380, maxHeight: 500 }}
        >
          <div className="flex items-center justify-between px-3 py-2 border-b border-[#F0F0F0] bg-[#F9FAFB]">
            <strong className="text-sm text-[#1F2937]">Alertas ({alerts.length})</strong>
            {alerts.length > 0 && (
              <button type="button" onClick={markAllRead} className="text-xs text-[#FF6600] hover:underline font-semibold">
                Marcar todas leídas
              </button>
            )}
          </div>

          <div className="overflow-y-auto" style={{ maxHeight: 440 }}>
            {alerts.length === 0 ? (
              <div className="p-6 text-center text-[#9CA3AF] text-sm">
                ✓ No hay alertas pendientes
              </div>
            ) : (
              alerts.map((a) => {
                const unreadBg: Record<string, string> = {
                  danger:  'bg-[#FEF2F2]',
                  warning: 'bg-[#FFF7ED]',
                  info:    'bg-[#EFF6FF]',
                  success: 'bg-[#ECFDF5]',
                }
                const icon = a.severity === 'danger' ? '🔴' : a.severity === 'warning' ? '🟠' : a.severity === 'success' ? '✓' : 'ℹ'
                return (
                  <div
                    key={a.id}
                    className={`px-3 py-2 border-b border-[#F0F0F0] text-sm flex items-start gap-2 ${!a.read_at ? (unreadBg[a.severity] || 'bg-[#EFF6FF]') : 'bg-white'}`}
                  >
                    <span className="text-lg">{icon}</span>
                    <div className="flex-1 min-w-0">
                      <div className="font-semibold text-xs text-[#1F2937]">{a.title}</div>
                      {a.body && <div className="text-xs text-[#6B7280] mt-0.5">{a.body}</div>}
                      <div className="text-[10px] text-[#9CA3AF] mt-1">{new Date(a.created_at).toLocaleString('es-AR')}</div>
                    </div>
                    <button
                      type="button"
                      onClick={() => dismiss(a.id)}
                      className="p-1 text-[#9CA3AF] hover:text-[#1F2937]"
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
