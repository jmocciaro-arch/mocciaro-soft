import { cn } from '@/lib/utils'
import { TrendingUp, TrendingDown } from 'lucide-react'
import { Sparkline } from './sparkline'

interface KPICardProps {
  label: string
  value: string | number
  change?: number
  changeLabel?: string
  icon?: React.ReactNode
  color?: string
  className?: string
  /** Texto secundario debajo del valor (alternativa libre a change/changeLabel). */
  subtitle?: React.ReactNode
  /** Chip de tendencia vs período anterior (▲/▼/=). null = sin base de comparación. */
  trend?: { dir: 'up' | 'down' | 'flat'; label: string } | null
  /** Buckets de la sparkline. null/undefined = ocultarla (sin datos suficientes). */
  sparkline?: number[] | null
  sparklineColor?: string
  /** El KPI no aplica al filtro activo (ej. filtro de canal): se atenúa. */
  muted?: boolean
}

const TREND_STYLES = {
  up: 'bg-emerald-500/15 text-emerald-400',
  down: 'bg-red-500/15 text-red-400',
  flat: 'bg-[#1E2330] text-[#9CA3AF]',
} as const

export function KPICard({
  label, value, change, changeLabel, icon, color = '#FF6600', className,
  subtitle, trend, sparkline, sparklineColor, muted,
}: KPICardProps) {
  const isPositive = change !== undefined && change >= 0

  return (
    <div
      className={cn(
        'relative rounded-xl bg-[#141820] border border-[#1E2330] p-5 hover:border-[#2A3040] transition-all duration-200',
        muted && 'opacity-50',
        className
      )}
    >
      {trend && (
        <span
          className={cn(
            'absolute top-3 right-3 text-[10.5px] font-bold px-2 py-0.5 rounded-full',
            TREND_STYLES[trend.dir]
          )}
        >
          {trend.label}
        </span>
      )}
      <div className="flex items-start justify-between">
        <div className="flex-1">
          <p className="text-sm text-[#6B7280] mb-1">{label}</p>
          <p className="text-2xl font-bold text-[#F0F2F5]">{value}</p>
          {change !== undefined && (
            <div className="flex items-center gap-1 mt-2">
              {isPositive ? (
                <TrendingUp size={14} className="text-emerald-400" />
              ) : (
                <TrendingDown size={14} className="text-red-400" />
              )}
              <span
                className={cn(
                  'text-xs font-medium',
                  isPositive ? 'text-emerald-400' : 'text-red-400'
                )}
              >
                {isPositive ? '+' : ''}
                {change}%
              </span>
              {changeLabel && (
                <span className="text-xs text-[#4B5563] ml-1">{changeLabel}</span>
              )}
            </div>
          )}
          {subtitle && <div className="text-xs text-[#9CA3AF] mt-1.5">{subtitle}</div>}
        </div>
        {icon && (
          <div
            className="p-3 rounded-xl"
            style={{ backgroundColor: `${color}15` }}
          >
            <div style={{ color }}>{icon}</div>
          </div>
        )}
      </div>
      {sparkline && sparkline.length >= 2 && (
        <Sparkline values={sparkline} stroke={sparklineColor ?? color} />
      )}
    </div>
  )
}
