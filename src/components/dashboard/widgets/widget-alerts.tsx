'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { Bell, AlertCircle, Info, AlertTriangle } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { formatRelative } from '@/lib/utils'
import { WidgetSkeleton, WidgetError } from '../widget-wrapper'

interface Alert {
  id: string
  title: string
  message: string | null
  severity: string
  created_at: string
  link?: string | null
}

const severityConfig: Record<string, { icon: React.ReactNode; color: string; bg: string }> = {
  critical: { icon: <AlertCircle size={14} />, color: 'text-red-400', bg: 'bg-red-500/10' },
  high: { icon: <AlertTriangle size={14} />, color: 'text-amber-400', bg: 'bg-amber-500/10' },
  medium: { icon: <Info size={14} />, color: 'text-blue-400', bg: 'bg-blue-500/10' },
  low: { icon: <Info size={14} />, color: 'text-[#6B7280]', bg: 'bg-[#1E2330]' },
}

export function WidgetAlerts() {
  const router = useRouter()
  const [alerts, setAlerts] = useState<Alert[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(false)

  useEffect(() => {
    async function load() {
      try {
        const supabase = createClient()
        const { data, error: e } = await supabase
          .from('tt_alerts')
          .select('id, title, message, severity, created_at, link')
          .eq('status', 'active')
          .order('created_at', { ascending: false })
          .limit(10)

        if (e) throw e
        setAlerts((data as Alert[]) || [])
      } catch {
        setError(true)
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [])

  if (loading) return <WidgetSkeleton />
  if (error) return <WidgetError />

  if (alerts.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-full text-[#4B5563] py-6">
        <Bell size={28} className="mb-2" />
        <p className="text-xs">No hay alertas activas</p>
        <p className="text-[10px] mt-0.5">Todo tranqui por aca</p>
      </div>
    )
  }

  return (
    <div className="space-y-2">
      {alerts.map(alert => {
        const sev = severityConfig[alert.severity] || severityConfig.low
        return (
          <div
            key={alert.id}
            className="p-2.5 rounded-lg bg-[#0F1218] border border-[#1E2330] hover:border-[#2A3040] transition-all cursor-pointer"
            onClick={() => {
              if (alert.link) router.push(alert.link)
            }}
          >
            <div className="flex items-start gap-2">
              <div className={`p-1.5 rounded-lg ${sev.bg} ${sev.color} shrink-0 mt-0.5`}>
                {sev.icon}
              </div>
              <div className="flex-1 min-w-0">
                <p className={`text-xs font-medium ${sev.color}`}>{alert.title}</p>
                {alert.message && (
                  <p className="text-[11px] text-[#6B7280] mt-0.5 line-clamp-2">{alert.message}</p>
                )}
                <p className="text-[10px] text-[#4B5563] mt-1">{formatRelative(alert.created_at)}</p>
              </div>
            </div>
          </div>
        )
      })}
    </div>
  )
}
