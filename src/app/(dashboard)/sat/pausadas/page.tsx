'use client'

import '@/components/sat/buscatools-theme.css'
import { usePausedWorkflows } from '@/hooks/use-paused-workflow'
import { useToast } from '@/components/ui/toast'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { KPICard } from '@/components/ui/kpi-card'
import { PAUSE_REASONS_FULL } from '@/lib/sat/fein-data'
import { Pause, Play, Trash2 } from 'lucide-react'

export default function PausadasPage() {
  const { paused, loading, resume, discard } = usePausedWorkflows()
  const { addToast } = useToast()

  const reasonLabel = (key: string) => {
    const r = PAUSE_REASONS_FULL.find((x) => x.key === key)
    return r ? `${r.icon} ${r.label}` : key
  }

  const handleResume = async (ticketId: string, number: string) => {
    try {
      await resume(ticketId)
      addToast({ type: 'success', title: 'Ficha reanudada', message: `${number} — Abrí la hoja desde SAT` })
    } catch (e: any) {
      addToast({ type: 'error', title: 'Error', message: e.message })
    }
  }

  const handleDiscard = async (ticketId: string, number: string) => {
    if (!confirm(`¿Descartar la pausa de ${number}? El ticket queda activo pero sin snapshot guardado.`)) return
    try {
      await discard(ticketId)
      addToast({ type: 'success', title: 'Pausa descartada' })
    } catch (e: any) {
      addToast({ type: 'error', title: 'Error', message: e.message })
    }
  }

  return (
    <div className="sat-theme space-y-6">
      <div>
        <h1 className="text-2xl font-bold" style={{ color: 'var(--sat-tx)' }}>Fichas pausadas</h1>
        <p className="text-sm mt-1" style={{ color: 'var(--sat-tx2)' }}>Reparaciones en espera — retomá cuando estés listo</p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <KPICard label="Total pausadas" value={paused.length} icon={<Pause size={22} />} color="#F59E0B" />
      </div>

      {loading ? (
        <Card><div className="text-center py-16 text-sm" style={{ color: 'var(--sat-tx2)' }}>Cargando...</div></Card>
      ) : paused.length === 0 ? (
        <Card>
          <div className="text-center py-16">
            <Pause size={48} className="mx-auto mb-3 opacity-30" style={{ color: 'var(--sat-tx3)' }} />
            <p style={{ color: 'var(--sat-tx2)' }}>No hay fichas pausadas</p>
          </div>
        </Card>
      ) : (
        <div className="space-y-3">
          {paused.map((p) => {
            const ticket = p.tt_sat_tickets
            const cliente = ticket?.tt_clients?.name || '–'
            return (
              <Card key={p.ticket_id}>
                <div className="flex items-start justify-between gap-4">
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-1">
                      <span style={{ fontFamily: 'var(--sat-mo)', color: 'var(--sat-or)', fontWeight: 700 }}>
                        {ticket?.number || '–'}
                      </span>
                      <span className="bd b-amber">⏸ Pausada</span>
                      <span className="text-xs" style={{ color: 'var(--sat-tx3)' }}>
                        Paso {(p.current_step ?? 0) + 1}/5
                      </span>
                    </div>
                    <div className="text-sm mb-1" style={{ color: 'var(--sat-tx) ' }}>{cliente}</div>
                    <div className="text-sm" style={{ color: 'var(--sat-tx2)' }}>{ticket?.description || ''}</div>
                    <div className="mt-2 text-sm" style={{ color: 'var(--sat-am)' }}>
                      {reasonLabel(p.reason)}
                    </div>
                    {p.detail && (
                      <div className="mt-1 text-xs italic" style={{ color: 'var(--sat-tx3)' }}>{p.detail}</div>
                    )}
                    <div className="mt-2 text-xs" style={{ color: 'var(--sat-tx3)' }}>
                      Pausada: {new Date(p.paused_at).toLocaleString('es-AR')}
                    </div>
                  </div>
                  <div className="flex flex-col gap-2">
                    <Button size="sm" onClick={() => handleResume(p.ticket_id, ticket?.number || '')}>
                      <Play size={14} /> Reanudar
                    </Button>
                    <Button size="sm" variant="ghost" onClick={() => handleDiscard(p.ticket_id, ticket?.number || '')}>
                      <Trash2 size={14} /> Descartar
                    </Button>
                  </div>
                </div>
              </Card>
            )
          })}
        </div>
      )}
    </div>
  )
}
