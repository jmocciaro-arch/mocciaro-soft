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
        // Try tt_alerts first; if table doesn't exist, fallback to stock alerts
        const { data, error: e } = await supabase
          .from('tt_alerts')
          .select('id, title, message, severity, created_at, link')
          .eq('status', 'active')
          .order('created_at', { ascending: false })
          .limit(10)

        if (e) {
          // Fallback: generate alerts from stock (items below min_quantity)
          const { data: stockAlerts } = await supabase
            .from('tt_stock')
            .select('id, quantity, min_quantity, product:tt_products(name, sku)')
            .gt('min_quantity', 0)
            .limit(10)
          const generated: Alert[] = (stockAlerts || [])
            .filter((s: Record<string, unknown>) => (s.quantity as number) <= (s.min_quantity as number))
            .map((s: Record<string, unknown>) => {
              const prod = s.product as Record<string, unknown> | null
              return {
                id: s.id as string,
                title: `Stock bajo: ${prod?.name || prod?.sku || 'Producto'}`,
                message: `Cantidad: ${s.quantity} (minimo: ${s.min_quantity})`,
                severity: (s.quantity as number) === 0 ? 'critical' : 'high',
                created_at: new Date().toISOString(),
                link: '/stock',
              }
            })
          setAlerts(generated)
        } else {
          setAlerts((data as Alert[]) || [])
        }
      } catch {
        setAlerts([]) // Graceful fallback, no error state
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
