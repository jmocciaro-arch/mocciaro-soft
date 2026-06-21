'use client'

import { Card } from '@/components/ui/card'
import {
  History, Plus, Users, Building2, Wrench, FileText, Edit3,
} from 'lucide-react'

type Row = Record<string, unknown>

interface AssetEvent {
  id: string
  event_type: string
  changed_fields: string[] | null
  old_values: Record<string, unknown> | null
  new_values: Record<string, unknown> | null
  notes: string | null
  performed_by_name: string | null
  source: string | null
  performed_at: string
}

interface Props {
  events: Row[]
}

const EVENT_META: Record<string, { label: string; icon: React.ReactNode; color: string }> = {
  created:         { label: 'Alta del activo',     icon: <Plus size={14} />,    color: 'var(--sat-or)' },
  client_changed:  { label: 'Cambio de cliente',   icon: <Users size={14} />,   color: 'var(--sat-bl)' },
  company_changed: { label: 'Cambio de empresa',   icon: <Building2 size={14} />, color: 'var(--sat-pu)' },
  service:         { label: 'Servicio realizado',  icon: <Wrench size={14} />,  color: 'var(--sat-gn)' },
  updated:         { label: 'Datos actualizados',  icon: <Edit3 size={14} />,   color: 'var(--sat-am)' },
  note:            { label: 'Nota',                icon: <FileText size={14} />, color: 'var(--sat-tx2)' },
}

const FIELD_LABELS: Record<string, string> = {
  client_id: 'Cliente',
  client_name_raw: 'Cliente',
  company_id: 'Empresa',
  brand: 'Marca',
  model: 'Modelo',
  serial_number: 'N° serie',
  internal_id: 'ID interno',
  city: 'Ciudad',
  province: 'Provincia',
  notes: 'Notas',
}

function fmtVal(v: unknown): string {
  if (v === null || v === undefined || v === '') return '—'
  if (typeof v === 'object') return JSON.stringify(v)
  return String(v)
}

function fmtDate(iso: string): string {
  try {
    const d = new Date(iso)
    return d.toLocaleString('es-AR', { dateStyle: 'short', timeStyle: 'short' })
  } catch { return iso }
}

export function AssetTimeline({ events }: Props) {
  return (
    <Card className="p-0 overflow-hidden">
      <div className="p-4 border-b flex items-center gap-2" style={{ borderColor: 'var(--sat-br)', color: 'var(--sat-tl)' }}>
        <History size={18} />
        <h3 className="text-sm font-semibold uppercase tracking-wider">
          Línea de tiempo del activo ({events.length})
        </h3>
      </div>

      {events.length === 0 ? (
        <div className="text-center py-12">
          <History size={48} className="mx-auto mb-3 opacity-30" style={{ color: 'var(--sat-tx3)' }} />
          <p style={{ color: 'var(--sat-tx2)' }}>Sin movimientos registrados</p>
        </div>
      ) : (
        <div className="p-4">
          <ol className="relative border-l ml-2" style={{ borderColor: 'var(--sat-br2)' }}>
            {(events as unknown as AssetEvent[]).map((e) => {
              const meta = EVENT_META[e.event_type] || EVENT_META.updated
              const fields = e.changed_fields || []
              const oldV = e.old_values || {}
              const newV = e.new_values || {}
              const who = e.performed_by_name || (e.source === 'backfill' ? 'Sistema' : 'Anónimo')
              const when = fmtDate(e.performed_at)

              // Para client_changed: extraer nombre legible
              const isClientChange = fields.includes('client_id') || e.event_type === 'client_changed'
              const oldClient = isClientChange ? (oldV.client_name_raw ?? oldV.client_id) : null
              const newClient = isClientChange ? (newV.client_name_raw ?? newV.client_id) : null

              return (
                <li key={e.id as string} className="mb-5 ml-5">
                  {/* Punto de la timeline */}
                  <span
                    className="absolute flex items-center justify-center w-7 h-7 rounded-full -left-3.5 ring-4"
                    style={{ background: 'var(--sat-dk3)', color: meta.color, boxShadow: `0 0 0 2px var(--sat-dk2)` }}
                  >
                    {meta.icon}
                  </span>

                  <div className="flex items-baseline gap-2 flex-wrap mb-1">
                    <span className="text-sm font-semibold" style={{ color: meta.color }}>
                      {meta.label}
                    </span>
                    <span className="text-xs" style={{ color: 'var(--sat-tx3)' }}>·</span>
                    <span className="text-xs" style={{ color: 'var(--sat-tx2)', fontFamily: 'var(--sat-mo)' }}>
                      {when}
                    </span>
                    <span className="text-xs" style={{ color: 'var(--sat-tx3)' }}>·</span>
                    <span className="text-xs" style={{ color: 'var(--sat-tx2)' }}>por {who}</span>
                  </div>

                  {/* Detalle según tipo */}
                  {e.event_type === 'created' && (
                    <p className="text-xs mt-1" style={{ color: 'var(--sat-tx2)' }}>
                      Activo dado de alta. {e.notes ? <span className="italic">— {String(e.notes)}</span> : null}
                    </p>
                  )}

                  {isClientChange && (
                    <div className="text-xs mt-1 flex items-center gap-2 flex-wrap" style={{ color: 'var(--sat-tx2)' }}>
                      <span className="px-2 py-0.5 rounded" style={{ background: 'var(--sat-rd-d)', color: 'var(--sat-rd)' }}>
                        {fmtVal(oldClient)}
                      </span>
                      <span>→</span>
                      <span className="px-2 py-0.5 rounded" style={{ background: 'var(--sat-gn-d)', color: 'var(--sat-gn)' }}>
                        {fmtVal(newClient)}
                      </span>
                    </div>
                  )}

                  {!isClientChange && e.event_type === 'updated' && fields.length > 0 && (
                    <ul className="text-xs mt-1 space-y-0.5" style={{ color: 'var(--sat-tx2)' }}>
                      {fields.map((f) => (
                        <li key={f} className="flex items-center gap-2 flex-wrap">
                          <span style={{ color: 'var(--sat-tx3)' }}>{FIELD_LABELS[f] || f}:</span>
                          <span className="line-through opacity-70">{fmtVal(oldV[f])}</span>
                          <span>→</span>
                          <span style={{ color: 'var(--sat-tx)' }}>{fmtVal(newV[f])}</span>
                        </li>
                      ))}
                    </ul>
                  )}

                  {e.event_type === 'note' && e.notes && (
                    <p className="text-xs mt-1 italic" style={{ color: 'var(--sat-tx2)' }}>
                      {String(e.notes)}
                    </p>
                  )}
                </li>
              )
            })}
          </ol>
        </div>
      )}
    </Card>
  )
}
