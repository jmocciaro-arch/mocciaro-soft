'use client'

import { useEffect, useState } from 'react'
import { formatRelative } from '@/lib/utils'
import {
  FileText,
  GitBranch,
  GitMerge,
  Send,
  CheckCircle2,
  XCircle,
  Edit3,
  Truck,
  Receipt,
  Lock,
  AlertCircle,
  Clock,
  User as UserIcon,
  Bot,
  Sparkles,
} from 'lucide-react'

interface DocumentEvent {
  id: string
  document_id: string
  event_type: string
  actor_id: string | null
  from_status: string | null
  to_status: string | null
  related_document_id: string | null
  payload: Record<string, unknown>
  notes: string | null
  created_at: string
  actor?: { id: string; name?: string; email?: string } | null
}

interface Props {
  documentId: string
  /** Limit de eventos a mostrar (default 50) */
  limit?: number
  /** Compacto = sin notas + sin actor + dot pequeño */
  compact?: boolean
  className?: string
}

const EVENT_ICON: Record<string, { icon: typeof FileText; color: string; label: string }> = {
  created:        { icon: FileText,     color: 'text-emerald-400 border-emerald-500/30 bg-emerald-500/5', label: 'Creado' },
  status_changed: { icon: GitBranch,    color: 'text-blue-400 border-blue-500/30 bg-blue-500/5',         label: 'Estado' },
  issued:         { icon: Lock,         color: 'text-orange-400 border-orange-500/30 bg-orange-500/5',   label: 'Emitido' },
  numbered:       { icon: FileText,     color: 'text-orange-400 border-orange-500/30 bg-orange-500/5',   label: 'Numerado' },
  sent:           { icon: Send,         color: 'text-sky-400 border-sky-500/30 bg-sky-500/5',            label: 'Enviado' },
  accepted:       { icon: CheckCircle2, color: 'text-emerald-400 border-emerald-500/30 bg-emerald-500/5', label: 'Aceptado' },
  rejected:       { icon: XCircle,      color: 'text-red-400 border-red-500/30 bg-red-500/5',            label: 'Rechazado' },
  derived_out:    { icon: GitBranch,    color: 'text-purple-400 border-purple-500/30 bg-purple-500/5',   label: 'Derivado a' },
  derived_in:     { icon: GitMerge,     color: 'text-purple-400 border-purple-500/30 bg-purple-500/5',   label: 'Derivado desde' },
  line_added:     { icon: Edit3,        color: 'text-[#9CA3AF] border-[#2A3040] bg-[#1E2330]',           label: 'Línea agregada' },
  line_updated:   { icon: Edit3,        color: 'text-[#9CA3AF] border-[#2A3040] bg-[#1E2330]',           label: 'Línea editada' },
  line_removed:   { icon: Edit3,        color: 'text-amber-400 border-amber-500/30 bg-amber-500/5',      label: 'Línea quitada' },
  delivered:      { icon: Truck,        color: 'text-emerald-400 border-emerald-500/30 bg-emerald-500/5', label: 'Entregado' },
  invoiced:       { icon: Receipt,      color: 'text-emerald-400 border-emerald-500/30 bg-emerald-500/5', label: 'Facturado' },
  paid:           { icon: CheckCircle2, color: 'text-emerald-400 border-emerald-500/30 bg-emerald-500/5', label: 'Cobrado' },
  cancelled:      { icon: XCircle,      color: 'text-red-400 border-red-500/30 bg-red-500/5',            label: 'Cancelado' },
  voided:         { icon: XCircle,      color: 'text-red-400 border-red-500/30 bg-red-500/5',            label: 'Anulado' },
  email_sent:     { icon: Send,         color: 'text-sky-400 border-sky-500/30 bg-sky-500/5',            label: 'Email enviado' },
  pdf_generated:  { icon: FileText,     color: 'text-[#9CA3AF] border-[#2A3040] bg-[#1E2330]',           label: 'PDF generado' },
}

function eventDescriptor(ev: DocumentEvent) {
  return EVENT_ICON[ev.event_type] ?? {
    icon: AlertCircle,
    color: 'text-[#9CA3AF] border-[#2A3040] bg-[#1E2330]',
    label: ev.event_type,
  }
}

export function DocumentEventsTimeline({ documentId, limit = 50, compact = false, className = '' }: Props) {
  const [events, setEvents] = useState<DocumentEvent[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    setError(null)

    fetch(`/api/documents/${documentId}/events?limit=${limit}`, { credentials: 'include' })
      .then(async (res) => {
        if (!res.ok) {
          const j = await res.json().catch(() => ({}))
          throw new Error(j.error || `HTTP ${res.status}`)
        }
        return res.json() as Promise<{ data: DocumentEvent[] }>
      })
      .then((j) => { if (!cancelled) setEvents(j.data || []) })
      .catch((e: Error) => { if (!cancelled) setError(e.message) })
      .finally(() => { if (!cancelled) setLoading(false) })

    return () => { cancelled = true }
  }, [documentId, limit])

  if (loading) {
    return (
      <div className={`p-6 text-center text-[#6B7280] text-xs ${className}`}>
        <Clock size={20} className="mx-auto mb-2 animate-spin opacity-50" />
        Cargando eventos…
      </div>
    )
  }

  if (error) {
    return (
      <div className={`p-4 rounded-lg border border-red-500/30 bg-red-500/5 text-sm text-red-400 ${className}`}>
        <AlertCircle size={14} className="inline mr-1.5" />
        Error al cargar eventos: {error}
      </div>
    )
  }

  if (!events || events.length === 0) {
    return (
      <div className={`p-6 text-center text-[#6B7280] text-xs ${className}`}>
        <Clock size={24} className="mx-auto mb-2 opacity-40" />
        Todavía no hay eventos para este documento.
      </div>
    )
  }

  return (
    <div className={`space-y-2 ${className}`}>
      <ol className="relative border-l border-[#2A3040] ml-3 space-y-3 pl-6">
        {events.map((ev) => {
          const desc = eventDescriptor(ev)
          const Icon = desc.icon
          const actor = ev.actor
          const actorLabel = actor?.name || actor?.email || (ev.actor_id ? 'Usuario' : 'Sistema')
          const isSystem = !ev.actor_id
          return (
            <li key={ev.id} className="relative">
              {/* Dot del timeline */}
              <span
                className={`absolute -left-[33px] flex items-center justify-center w-6 h-6 rounded-full border ${desc.color}`}
                title={desc.label}
              >
                <Icon size={12} />
              </span>

              {/* Contenido */}
              <div className="text-sm">
                <div className="flex items-center gap-2 flex-wrap">
                  <strong className="text-[#F0F2F5]">{desc.label}</strong>
                  {ev.event_type === 'status_changed' && ev.from_status && ev.to_status && (
                    <span className="text-[11px] text-[#9CA3AF] font-mono">
                      {ev.from_status} → {ev.to_status}
                    </span>
                  )}
                </div>

                {!compact && ev.notes && (
                  <p className="text-xs text-[#9CA3AF] mt-0.5">{ev.notes}</p>
                )}

                <div className="flex items-center gap-2 text-[11px] text-[#6B7280] mt-1">
                  <span className="inline-flex items-center gap-1" title={new Date(ev.created_at).toLocaleString('es-AR')}>
                    <Clock size={10} />
                    {formatRelative(ev.created_at)}
                  </span>
                  {!compact && (
                    <span className="inline-flex items-center gap-1">
                      {isSystem ? <Bot size={10} /> : <UserIcon size={10} />}
                      {actorLabel}
                      {isSystem && ev.payload?.source === 'oc_import' && (
                        <Sparkles size={10} className="text-[#FF6600]" />
                      )}
                    </span>
                  )}
                </div>
              </div>
            </li>
          )
        })}
      </ol>
    </div>
  )
}
