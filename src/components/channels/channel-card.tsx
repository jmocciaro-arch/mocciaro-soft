import { cn, formatRelative } from '@/lib/utils'
import { Badge } from '@/components/ui/badge'
import type { EnabledChannel } from '@/lib/channels/gate'
import { CHANNEL_VISUAL, CHANNEL_STATUS_LABELS, CHANNEL_STATUS_BADGE } from '@/lib/channels/constants'

export interface ChannelStats {
  listings: number
  ordersToday: number
  pending: number
  /** % de listings sincronizados sin error. null = sin listings → mostrar "—". */
  syncPct: number | null
}

/**
 * Tarjeta de canal (spec §3.1): contadores, % stock sync, última sync y
 * estado con indicador. Alibaba lleva siempre el badge "Semi-manual"
 * (sin API pública de seller — flujo export/import).
 */
export function ChannelCard({ channel, stats }: { channel: EnabledChannel; stats: ChannelStats }) {
  const visual = CHANNEL_VISUAL[channel.code] ?? {
    initials: channel.label.slice(0, 2).toUpperCase(), bg: '#2A3040', fg: '#F0F2F5',
  }
  const isActive = channel.status === 'active'

  return (
    <div className="rounded-xl bg-[#141820] border border-[#1E2330] p-4 hover:border-[#2A3040] transition-colors">
      <div className="flex items-center gap-2.5">
        <span
          className="w-7 h-7 rounded-md grid place-items-center text-[11px] font-extrabold shrink-0"
          style={{ background: visual.bg, color: visual.fg }}
          aria-hidden="true"
        >
          {visual.initials}
        </span>
        <strong className="text-[13px] truncate">{channel.label}</strong>
        <span className="ml-auto flex items-center gap-1.5 shrink-0">
          {channel.code === 'alibaba' && <Badge variant="default">Semi-manual</Badge>}
          <Badge variant={CHANNEL_STATUS_BADGE[channel.status] ?? 'default'}>
            {CHANNEL_STATUS_LABELS[channel.status] ?? channel.status}
          </Badge>
        </span>
      </div>

      <dl className="grid grid-cols-2 gap-2 mt-3">
        <Stat value={stats.listings} label="Listings" />
        <Stat value={stats.ordersToday} label="Órdenes hoy" />
        <Stat value={stats.pending} label="Pendientes" />
        <Stat value={stats.syncPct == null ? '—' : `${stats.syncPct}%`} label="Stock sync" />
      </dl>

      <div className="flex items-center gap-2 mt-3 text-[11px] text-[#9CA3AF]">
        <span
          className={cn(
            'w-2 h-2 rounded-full shrink-0',
            isActive ? 'bg-emerald-400 animate-pulse motion-reduce:animate-none' : 'bg-[#4B5563]',
          )}
          aria-hidden="true"
        />
        {channel.last_sync_at
          ? `Última sync ${formatRelative(channel.last_sync_at)}`
          : 'Sin sincronización todavía'}
      </div>
    </div>
  )
}

function Stat({ value, label }: { value: string | number; label: string }) {
  return (
    <div>
      <dt className="sr-only">{label}</dt>
      <dd className="font-mono font-bold text-[15px] text-[#F0F2F5]">{value}</dd>
      <div className="text-[10px] uppercase tracking-wider text-[#6B7280]">{label}</div>
    </div>
  )
}
