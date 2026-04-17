'use client'

import { useState, useEffect, useCallback } from 'react'
import { useParams, useRouter } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import { Card } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { KPICard } from '@/components/ui/kpi-card'
import { Modal } from '@/components/ui/modal'
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from '@/components/ui/table'
import { useToast } from '@/components/ui/toast'
import { SATWorkflow } from '@/components/sat/sat-workflow'
import {
  ArrowLeft, ClipboardList, Play, Eye, Plus, Loader2,
  CheckCircle, Clock, AlertTriangle, Download,
} from 'lucide-react'

type Row = Record<string, unknown>

export default function HojaDetailPage() {
  const { ntt } = useParams() as { ntt: string }
  const router = useRouter()
  const { addToast } = useToast()
  const [tickets, setTickets] = useState<Row[]>([])
  const [loading, setLoading] = useState(true)
  const [workflowTicket, setWorkflowTicket] = useState<Row | null>(null)

  const load = useCallback(async () => {
    if (!ntt) return
    setLoading(true)
    const sb = createClient()
    const { data } = await sb
      .from('tt_sat_tickets')
      .select('*, tt_clients(name, city)')
      .order('created_at', { ascending: true })
      .limit(100)
    const filtered = (data || []).filter((t) => {
      const meta = (t.metadata as Record<string, unknown>) || {}
      return meta.ntt_number === ntt
    })
    setTickets(filtered as Row[])
    setLoading(false)
  }, [ntt])

  useEffect(() => { load() }, [load])

  const cliente = (tickets[0]?.tt_clients as Row)?.name as string || '—'
  const fechaMin = tickets.length ? (tickets[0].created_at as string || '').split('T')[0] : '—'
  const total = tickets.length
  const cerrados = tickets.filter((t) => ['resolved', 'closed'].includes(t.status as string)).length
  const enProgreso = tickets.filter((t) => ['in_progress', 'waiting_parts'].includes(t.status as string)).length
  const abiertos = tickets.filter((t) => t.status === 'open').length
  const pct = total > 0 ? Math.round((cerrados / total) * 100) : 0

  if (loading) {
    return <div className="sat-theme text-center py-16"><Loader2 className="animate-spin" style={{ color: 'var(--sat-or)' }} /></div>
  }

  if (tickets.length === 0) {
    return (
      <div className="sat-theme text-center py-16">
        <AlertTriangle size={48} className="mx-auto mb-3" style={{ color: 'var(--sat-rd)' }} />
        <p style={{ color: 'var(--sat-tx)' }}>Hoja {ntt} no encontrada</p>
        <Link href="/sat/hojas"><Button className="mt-4" variant="secondary"><ArrowLeft size={14} /> Volver a hojas</Button></Link>
      </div>
    )
  }

  return (
    <div className="sat-theme space-y-6">
      {/* Modal hoja de mantenimiento */}
      {workflowTicket && (
        <Modal
          isOpen={true}
          onClose={() => { setWorkflowTicket(null); load() }}
          title={`Hoja de mantenimiento — ${workflowTicket.number as string}`}
          size="full"
        >
          <SATWorkflow
            ticketId={workflowTicket.id as string}
            ticketNumber={(workflowTicket.number as string) || ''}
            onClose={() => { setWorkflowTicket(null); load() }}
            onComplete={() => { setWorkflowTicket(null); load() }}
          />
        </Modal>
      )}

      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <Link href="/sat/hojas"><Button size="sm" variant="ghost"><ArrowLeft size={14} /> Hojas</Button></Link>
          <h1 className="text-2xl font-bold mt-2" style={{ color: 'var(--sat-tx)' }}>
            <span style={{ fontFamily: 'var(--sat-mo)', color: 'var(--sat-or)' }}>{ntt}</span>
          </h1>
          <p className="text-sm mt-1" style={{ color: 'var(--sat-tx2)' }}>
            {cliente}  ·  {fechaMin}
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
        <KPICard label="Equipos" value={total} icon={<ClipboardList size={22} />} />
        <KPICard label="Abiertos" value={abiertos} icon={<AlertTriangle size={22} />} color="#3B82F6" />
        <KPICard label="En progreso" value={enProgreso} icon={<Clock size={22} />} color="#F59E0B" />
        <KPICard label="Cerrados" value={cerrados} icon={<CheckCircle size={22} />} color="#10B981" />
      </div>

      {/* Barra de progreso */}
      <Card>
        <div className="text-xs mb-2 flex justify-between" style={{ color: 'var(--sat-tx3)' }}>
          <span>Progreso de la hoja</span>
          <span style={{ fontFamily: 'var(--sat-mo)' }}>{cerrados} / {total} ({pct}%)</span>
        </div>
        <div className="h-3 rounded-full overflow-hidden" style={{ background: 'var(--sat-dk3)', border: '1px solid var(--sat-br)' }}>
          <div
            className="h-full transition-all"
            style={{ width: `${pct}%`, background: 'linear-gradient(90deg, var(--sat-or), var(--sat-gn))' }}
          />
        </div>
      </Card>

      <Card className="p-0 overflow-hidden">
        <div className="p-4 border-b" style={{ borderColor: 'var(--sat-br)' }}>
          <h3 className="text-sm font-semibold uppercase tracking-wider" style={{ color: 'var(--sat-or)' }}>
            Equipos en la hoja ({total})
          </h3>
        </div>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Ticket</TableHead>
              <TableHead>Equipo</TableHead>
              <TableHead>Serie</TableHead>
              <TableHead>Estado</TableHead>
              <TableHead>Prioridad</TableHead>
              <TableHead>Acción</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {tickets.map((t) => {
              const meta = (t.metadata as Record<string, unknown>) || {}
              const assetId = meta.asset_id as string | undefined
              const statusStr = t.status as string
              const stBadge =
                statusStr === 'resolved' || statusStr === 'closed' ? { v: 'success' as const, label: 'Cerrado' }
                : statusStr === 'in_progress' ? { v: 'warning' as const, label: 'En progreso' }
                : statusStr === 'waiting_parts' ? { v: 'warning' as const, label: 'Esperando repuestos' }
                : { v: 'info' as const, label: 'Pendiente' }
              const hasWorkflow = !!(meta.sat_workflow as Record<string, unknown>)

              // Color de fondo según estado: rojo = pendiente, amarillo = en proceso, verde = terminado
              const rowClass =
                ['resolved', 'closed'].includes(statusStr) ? 'bg-emerald-500/10'
                : ['in_progress', 'waiting_parts'].includes(statusStr) ? 'bg-amber-500/10'
                : 'bg-red-500/5 opacity-90'

              return (
                <TableRow key={t.id as string} className={rowClass}>
                  <TableCell>
                    <span style={{ fontFamily: 'var(--sat-mo)', fontSize: 12, color: 'var(--sat-or)' }}>
                      {t.number as string}
                    </span>
                  </TableCell>
                  <TableCell>
                    {assetId ? (
                      <Link href={`/sat/activos/${assetId}`} className="hover:underline" style={{ color: 'var(--sat-tx)' }}>
                        {(t.description as string) || '—'}
                      </Link>
                    ) : (
                      <span style={{ color: 'var(--sat-tx) ' }}>{(t.description as string) || '—'}</span>
                    )}
                  </TableCell>
                  <TableCell><span style={{ fontFamily: 'var(--sat-mo)', fontSize: 13 }}>{(t.serial_number as string) || '—'}</span></TableCell>
                  <TableCell><Badge variant={stBadge.v}>{stBadge.label}</Badge></TableCell>
                  <TableCell><span style={{ fontSize: 13 }}>{(t.priority as string) || 'normal'}</span></TableCell>
                  <TableCell>
                    <div className="flex gap-1">
                      <Button size="sm" onClick={() => setWorkflowTicket(t)}>
                        <Play size={14} /> {hasWorkflow ? 'Continuar' : 'Iniciar mantenimiento'}
                      </Button>
                      {assetId ? (
                        <Link href={`/sat/activos/${assetId}`}>
                          <Button size="sm" variant="secondary"><Eye size={14} /></Button>
                        </Link>
                      ) : null}
                    </div>
                  </TableCell>
                </TableRow>
              )
            })}
          </TableBody>
        </Table>
      </Card>
    </div>
  )
}
