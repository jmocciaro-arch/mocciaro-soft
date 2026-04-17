'use client'

import { useMemo } from 'react'
import {
  FileText, FilePlus, Pencil, Trash2, Send, CheckCircle2, XCircle,
  Ban, Printer, Mail, ArrowRightCircle, ArrowLeftCircle, Hash, Package,
} from 'lucide-react'
import type { DocumentEventRow } from '@/lib/documents/client'
import { cn } from '@/lib/utils'

// ---- Metadata visual por tipo de evento ----
const EVENT_META: Record<string, { icon: typeof FileText; label: string; color: string }> = {
  created:         { icon: FilePlus,        label: 'Creado',              color: 'text-blue-400' },
  status_changed:  { icon: Pencil,          label: 'Cambio de estado',    color: 'text-amber-400' },
  line_added:      { icon: Package,         label: 'Línea agregada',      color: 'text-emerald-400' },
  line_updated:    { icon: Pencil,          label: 'Línea modificada',    color: 'text-amber-400' },
  line_removed:    { icon: Trash2,          label: 'Línea eliminada',     color: 'text-red-400' },
  issued:          { icon: Send,            label: 'Emitido',             color: 'text-emerald-400' },
  numbered:        { icon: Hash,            label: 'Numerado',            color: 'text-emerald-400' },
  sent:            { icon: Mail,            label: 'Enviado',             color: 'text-blue-400' },
  accepted:        { icon: CheckCircle2,    label: 'Aceptado',            color: 'text-emerald-400' },
  rejected:        { icon: XCircle,         label: 'Rechazado',           color: 'text-red-400' },
  derived_out:     { icon: ArrowRightCircle,label: 'Derivado',            color: 'text-orange-400' },
  derived_in:      { icon: ArrowLeftCircle, label: 'Creado por derivación', color: 'text-orange-400' },
  cancelled:       { icon: Ban,             label: 'Cancelado',           color: 'text-red-400' },
  voided:          { icon: Ban,             label: 'Anulado',             color: 'text-red-400' },
  pdf_generated:   { icon: Printer,         label: 'PDF generado',        color: 'text-gray-400' },
  email_sent:      { icon: Mail,            label: 'Email enviado',       color: 'text-blue-400' },
}

function eventDescription(ev: DocumentEventRow): string {
  if (ev.event_type === 'status_changed' && ev.from_status && ev.to_status) {
    return `${ev.from_status} → ${ev.to_status}`
  }
  if (ev.event_type === 'numbered') {
    const n = ev.payload?.number
    const c = ev.payload?.code
    return c ? `${c}` : n ? `Nº ${n}` : ''
  }
  if (ev.event_type === 'line_added') {
    const n = ev.payload?.product_name
    return typeof n === 'string' ? n : ''
  }
  if (ev.event_type === 'line_updated') {
    const fields = ev.payload?.fields
    return Array.isArray(fields) ? `Campos: ${fields.join(', ')}` : ''
  }
  if (ev.event_type === 'derived_out' || ev.event_type === 'derived_in') {
    const rel = ev.payload?.relation_type
    return typeof rel === 'string' ? rel : ''
  }
  if (ev.event_type === 'pdf_generated') {
    const f = ev.payload?.filename
    return typeof f === 'string' ? f : ''
  }
  if (ev.notes) return ev.notes
  return ''
}

function formatRelative(iso: string): string {
  const d = new Date(iso)
  const diff = Date.now() - d.getTime()
  if (diff < 60_000)    return 'ahora'
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)} min`
  if (diff < 86_400_000)return `${Math.floor(diff / 3_600_000)} h`
  return d.toLocaleDateString('es-AR', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })
}

export function DocumentTimeline({ events }: { events: DocumentEventRow[] }) {
  const sorted = useMemo(
    () => [...events].sort((a, b) => b.created_at.localeCompare(a.created_at)),
    [events],
  )

  if (sorted.length === 0) {
    return (
      <div className="text-sm text-[#6B7280] text-center py-6">
        Sin actividad registrada.
      </div>
    )
  }

  return (
    <ol className="relative border-l border-[#2A3040] pl-5 space-y-3">
      {sorted.map((ev) => {
        const meta = EVENT_META[ev.event_type] ?? { icon: FileText, label: ev.event_type, color: 'text-gray-400' }
        const Icon = meta.icon
        const desc = eventDescription(ev)

        return (
          <li key={ev.id} className="relative">
            <span className="absolute -left-[29px] top-0.5 h-5 w-5 rounded-full bg-[#141820] border border-[#2A3040] flex items-center justify-center">
              <Icon className={cn('h-3 w-3', meta.color)} />
            </span>
            <div className="flex items-baseline justify-between gap-2">
              <div className="text-sm text-[#F0F2F5] font-medium">{meta.label}</div>
              <div className="text-[10px] text-[#6B7280] whitespace-nowrap" title={new Date(ev.created_at).toISOString()}>
                {formatRelative(ev.created_at)}
              </div>
            </div>
            {desc && <div className="text-xs text-[#9CA3AF] mt-0.5 break-words">{desc}</div>}
          </li>
        )
      })}
    </ol>
  )
}
