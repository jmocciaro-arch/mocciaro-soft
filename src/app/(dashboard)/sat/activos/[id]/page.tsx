'use client'

import { useState, useEffect, useCallback } from 'react'
import { useParams, useRouter } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { KPICard } from '@/components/ui/kpi-card'
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from '@/components/ui/table'
import { useToast } from '@/components/ui/toast'
import { fmtNumber } from '@/lib/sat/currency-converter'
import { normalizeModel } from '@/lib/sat/fein-data'
import {
  ArrowLeft, Plus, Wrench, Calendar, CheckCircle, AlertTriangle,
  Cpu, Cog, FileText, Download, Camera, Eye, X, Play, Image as ImageIcon, History
} from 'lucide-react'
import { MediaCapture, type MediaItem as Photo } from '@/components/sat/media-capture'
import { Modal } from '@/components/ui/modal'
import { SATWorkflow } from '@/components/sat/sat-workflow'

type Row = Record<string, unknown>

export default function AssetDetailPage() {
  const params = useParams()
  const router = useRouter()
  const { addToast } = useToast()
  const assetId = params.id as string

  const [asset, setAsset] = useState<Row | null>(null)
  const [modelSpecs, setModelSpecs] = useState<Row | null>(null)
  const [history, setHistory] = useState<Row[]>([])
  const [openTickets, setOpenTickets] = useState<Row[]>([])
  const [loading, setLoading] = useState(true)
  const [detailService, setDetailService] = useState<Row | null>(null)
  const [workflowTicket, setWorkflowTicket] = useState<Row | null>(null)
  const [showPhotos, setShowPhotos] = useState(false)
  const [cancelingTicket, setCancelingTicket] = useState<Row | null>(null)
  const [cancelReason, setCancelReason] = useState('')
  const [cancelDetail, setCancelDetail] = useState('')

  const load = useCallback(async () => {
    if (!assetId) return
    setLoading(true)
    const sb = createClient()

    // Activo + cliente
    const { data: a } = await sb
      .from('tt_sat_assets')
      .select('*, tt_clients(id, name, city, state, phone, email)')
      .eq('id', assetId)
      .maybeSingle()
    setAsset(a as Row | null)

    // Specs del modelo FEIN
    if (a?.model) {
      const code = normalizeModel(a.model as string)
      const { data: specs } = await sb
        .from('tt_fein_models')
        .select('*')
        .eq('model_code', code)
        .maybeSingle()
      setModelSpecs(specs as Row | null)
    }

    // Historial
    const { data: hist } = await sb
      .from('tt_sat_service_history')
      .select('*')
      .eq('asset_id', assetId)
      .order('fecha', { ascending: false })
    setHistory((hist || []) as Row[])

    // Tickets abiertos
    const { data: tickets } = await sb
      .from('tt_sat_tickets')
      .select('id, number, status, priority, description, created_at')
      .eq('serial_number', (a as Row | null)?.serial_number || '')
      .in('status', ['open', 'in_progress', 'waiting_parts'])
      .order('created_at', { ascending: false })
    setOpenTickets((tickets || []) as Row[])

    setLoading(false)
  }, [assetId])

  useEffect(() => { load() }, [load])

  const handleNewTicket = async () => {
    if (!asset) return
    const sb = createClient()
    const yr = new Date().getFullYear().toString().slice(-2)
    const mo = (new Date().getMonth() + 1).toString().padStart(2, '0')
    const seq = Math.floor(Math.random() * 9999).toString().padStart(4, '0')
    const number = `SAT-${yr}${mo}-${seq}`

    // Pre-popular la hoja de mantenimiento con los datos del activo
    const clientName = (asset.tt_clients as Row | null)?.name as string
      || (asset.client_name_raw as string)
      || ''
    const DEFAULT_PARTS = [
      'Carcasa / Cuerpo exterior', 'Motor / Mecanismo principal', 'Embrague / Clutch',
      'Engranajes / Transmisión', 'Gatillo / Selector', 'Conexiones eléctricas / Mangueras',
      'Cabezal / Mandril / Cuadrante', 'Accesorios / Reductores',
    ]
    const preloadedWorkflow = {
      ticket_id: null,
      process_instance_id: null,
      current_step: 0,
      diagnostico: {
        asset_serial: (asset.serial_number as string) || (asset.ref as string) || '',
        asset_description: `${asset.brand || ''} ${asset.model || ''} — ${asset.internal_id || asset.ref}`.trim(),
        client_id: (asset.client_id as string) || '',
        client_name: clientName,
        brand: (asset.brand as string) || '',
        model: (asset.model as string) || '',
        reported_issue: '',
        inspection_grid: DEFAULT_PARTS.map((name) => ({ name, status: 'NA', notes: '' })),
        initial_notes: '',
        photos_in: [],
      },
      cotizacion: {
        items: [], labor_hours: 0, labor_rate: 0, labor_currency: 'EUR',
        discount_percent: 0, notes: '', total_parts: 0, total_labor: 0, total: 0,
      },
      reparacion: {
        work_performed: '', post_repair_grid: DEFAULT_PARTS.map((name) => ({ name, status: 'NA', notes: '' })),
        start_time: '', end_time: '', total_minutes: 0, technician_notes: '', parts_used: [],
      },
      torque: {
        target_torque: 0, tolerance_percent: 5, unit: 'Nm',
        measurements: Array.from({ length: 10 }, (_, i) => ({ index: i + 1, value: null })),
        mean: null, std_dev: null, cv: null, cp: null, cpk: null, efficiency: null, result: null,
      },
      cierre: {
        final_status: 'reparado', warranty_until: '', delivery_notes: '',
        signature_tech: '', signature_client: '', saved_to_history: false, photos_out: [],
      },
      pause: { is_paused: false, reason: '', paused_at: null, paused_by: null, free_text: '', snapshot: null },
    }

    const { data: created, error } = await sb
      .from('tt_sat_tickets')
      .insert({
        number,
        client_id: asset.client_id || null,
        serial_number: asset.serial_number || asset.ref,
        priority: 'normal',
        status: 'open',
        description: `Mantenimiento ${asset.brand || ''} ${asset.model || ''} — ${asset.internal_id || asset.ref}`,
        metadata: { asset_id: asset.id, sat_workflow: preloadedWorkflow },
      } as any)
      .select('id, number')
      .single()

    if (error || !created) {
      addToast({ type: 'error', title: 'Error', message: error?.message || 'No se pudo crear' })
      return
    }

    addToast({ type: 'success', title: 'Hoja creada', message: number })
    setWorkflowTicket({ id: (created as { id: string }).id, number: (created as { number: string }).number })
  }

  const handleContinueTicket = async (ticket: Row) => {
    setWorkflowTicket(ticket)
  }

  const handleWorkflowClose = () => {
    setWorkflowTicket(null)
    load()
  }

  // Cancelar directamente un ticket abierto sin entrar al workflow
  const doCancelTicket = async () => {
    if (!cancelingTicket) return
    if (!cancelReason && !cancelDetail.trim()) {
      addToast({ type: 'warning', title: 'Indicá un motivo para cancelar' })
      return
    }
    const sb = createClient()
    const { data: t } = await sb.from('tt_sat_tickets').select('metadata').eq('id', cancelingTicket.id as string).single()
    const currentMeta = (t?.metadata as Record<string, unknown>) || {}
    const { error } = await sb.from('tt_sat_tickets').update({
      status: 'cancelled',
      metadata: {
        ...currentMeta,
        cancel_reason: cancelReason,
        cancel_detail: cancelDetail,
        cancelled_at: new Date().toISOString(),
      },
    }).eq('id', cancelingTicket.id as string)
    if (error) {
      addToast({ type: 'error', title: 'Error', message: error.message })
      return
    }
    await sb.from('tt_activity_log').insert({
      entity_type: 'sat_ticket',
      entity_id: cancelingTicket.id as string,
      action: 'workflow_cancelled',
      description: `Hoja cancelada: ${cancelReason}${cancelDetail ? ' — ' + cancelDetail : ''}`,
    })
    addToast({ type: 'success', title: 'Ticket cancelado', message: (cancelingTicket.number as string) || '' })
    setCancelingTicket(null)
    setCancelReason('')
    setCancelDetail('')
    load()
  }

  if (loading) {
    return <div className="text-center py-16 text-sm" style={{ color: 'var(--sat-tx2)' }}>Cargando...</div>
  }

  if (!asset) {
    return (
      <div className="text-center py-16">
        <AlertTriangle size={48} className="mx-auto mb-3" style={{ color: 'var(--sat-rd)' }} />
        <p style={{ color: 'var(--sat-tx)' }}>Activo no encontrado</p>
        <Link href="/sat/activos">
          <Button variant="secondary" className="mt-4"><ArrowLeft size={14} /> Volver a activos</Button>
        </Link>
      </div>
    )
  }

  const cliente = (asset.tt_clients as Row | null)?.name as string || asset.client_name_raw as string || '—'
  const aprobados = history.filter((h) => h.estado_final === 'APROBADA').length
  const reprobados = history.filter((h) => h.estado_final === 'REPROBADA').length

  const handlePhotosChange = async (photos: Photo[]) => {
    const sb = createClient()
    const { error } = await sb
      .from('tt_sat_assets')
      .update({ photos: photos as unknown as Row[] })
      .eq('id', assetId)
    if (error) {
      addToast({ type: 'error', title: 'Error al guardar fotos', message: error.message })
      return
    }
    setAsset((a) => a ? { ...a, photos } : a)
  }
  const photos = (asset.photos as Photo[]) || []

  return (
    <div className="space-y-6">
      {/* Modal hoja de mantenimiento — pantalla completa */}
      {workflowTicket && (
        <Modal
          isOpen={true}
          onClose={handleWorkflowClose}
          title={`Hoja de mantenimiento — ${(workflowTicket.number as string) || ''}`}
          size="full"
        >
          <SATWorkflow
            ticketId={workflowTicket.id as string}
            ticketNumber={(workflowTicket.number as string) || ''}
            onClose={handleWorkflowClose}
            onComplete={handleWorkflowClose}
          />
        </Modal>
      )}

      {/* Modal fotos pantalla completa */}
      {showPhotos && (
        <Modal isOpen={true} onClose={() => setShowPhotos(false)} title="📷 Fotos del equipo" size="xl">
          <MediaCapture
            media={photos}
            onChange={handlePhotosChange}
            pathPrefix={`assets/${assetId}`}
            maxItems={20}
            subtitle="Fotos y videos del equipo — sacá foto con la cámara o cargá archivos"
          />
        </Modal>
      )}

      {/* Header compacto + acciones grandes */}
      <div className="space-y-4">
        <div className="flex items-center gap-2">
          <Link href="/sat/activos">
            <Button variant="ghost" size="sm"><ArrowLeft size={14} /> Activos</Button>
          </Link>
        </div>

        {/* Card principal con datos + acciones */}
        <Card className="p-5">
          <div className="flex items-start justify-between gap-6 flex-wrap">
            <div className="flex-1 min-w-[280px]">
              <h1 className="text-2xl font-bold mb-1" style={{ color: 'var(--sat-tx)' }}>
                <span style={{ fontFamily: 'var(--sat-mo)', color: 'var(--sat-or)' }}>{asset.ref as string}</span>
                {asset.internal_id ? (
                  <span className="ml-3" style={{ color: 'var(--sat-tx2)', fontSize: 16 }}>
                    {asset.internal_id as string}
                  </span>
                ) : null}
              </h1>
              <div className="text-sm mb-1" style={{ color: 'var(--sat-tx)' }}>
                <strong style={{ color: 'var(--sat-bl)' }}>{asset.brand as string}</strong>  ·  {asset.model as string}
              </div>
              <div className="text-sm" style={{ color: 'var(--sat-tx2)' }}>
                Cliente: <strong style={{ color: 'var(--sat-tx)' }}>{cliente}</strong>
                {asset.serial_number ? <> · Serie <span style={{ fontFamily: 'var(--sat-mo)' }}>{asset.serial_number as string}</span></> : null}
              </div>
            </div>

            {/* Botones grandes de acción */}
            <div className="flex flex-col sm:flex-row gap-2">
              <button
                onClick={handleNewTicket}
                style={{
                  background: 'var(--sat-or)', color: 'var(--sat-dk)',
                  padding: '12px 20px', borderRadius: 10, fontWeight: 700, fontSize: 15,
                  border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 8,
                  minWidth: 210,
                }}
              >
                <Play size={18} fill="currentColor" /> Iniciar mantenimiento
              </button>
              <button
                onClick={() => setShowPhotos(true)}
                style={{
                  background: 'var(--sat-dk3)', color: 'var(--sat-tx)',
                  padding: '12px 18px', borderRadius: 10, fontWeight: 600, fontSize: 14,
                  border: '1px solid var(--sat-br2)', cursor: 'pointer',
                  display: 'flex', alignItems: 'center', gap: 8,
                }}
              >
                <ImageIcon size={16} /> Fotos ({photos.length})
              </button>
            </div>
          </div>

          {/* Tickets abiertos inline */}
          {openTickets.length > 0 && (
            <div className="mt-4 pt-4" style={{ borderTop: '1px solid var(--sat-br)' }}>
              <div className="text-xs mb-2 font-semibold uppercase tracking-wider" style={{ color: 'var(--sat-am)' }}>
                ⚠ Tickets abiertos para este equipo ({openTickets.length})
              </div>
              <div className="flex flex-wrap gap-2">
                {openTickets.map((t) => (
                  <div key={t.id as string} className="flex items-center gap-0" style={{ background: 'var(--sat-am-d)', border: '1px solid var(--sat-am)', borderRadius: 8 }}>
                    <button
                      onClick={() => handleContinueTicket(t)}
                      className="text-xs flex items-center gap-1.5 px-3 py-1.5"
                      style={{ color: 'var(--sat-am)', cursor: 'pointer', background: 'transparent', border: 'none' }}
                    >
                      <Play size={12} fill="currentColor" /> Continuar {t.number as string}
                    </button>
                    <button
                      onClick={() => setCancelingTicket(t)}
                      className="px-2 py-1.5"
                      style={{
                        borderLeft: '1px solid rgba(245,158,11,0.3)',
                        color: 'var(--sat-rd)', background: 'transparent', cursor: 'pointer',
                      }}
                      title="Cancelar este ticket"
                    >
                      <X size={12} />
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}
        </Card>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
        <KPICard label="Servicios" value={history.length} icon={<Wrench size={22} />} />
        <KPICard label="Aprobados" value={aprobados} icon={<CheckCircle size={22} />} color="#10B981" />
        <KPICard label="Reprobados" value={reprobados} icon={<AlertTriangle size={22} />} color="#EF4444" />
        <KPICard label="Tickets abiertos" value={openTickets.length} icon={<FileText size={22} />} color="#F59E0B" />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Datos del activo */}
        <Card>
          <div className="flex items-center gap-2 mb-3" style={{ color: 'var(--sat-or)' }}>
            <Cpu size={18} /><h3 className="text-sm font-semibold uppercase tracking-wider">Datos del equipo</h3>
          </div>
          <dl className="space-y-2 text-sm">
            {[
              ['Ref', asset.ref],
              ['ID interno', asset.internal_id],
              ['N° Serie', asset.serial_number],
              ['Marca', asset.brand],
              ['Modelo', asset.model],
              ['Cliente', cliente],
              ['Ciudad', asset.city],
              ['Provincia', asset.province],
              ['Garantía inicio', asset.warranty_start],
              ['Garantía fin', asset.warranty_end],
            ].map(([label, val]) => (
              <div key={label as string} className="flex justify-between gap-3 border-b pb-1" style={{ borderColor: 'var(--sat-br)' }}>
                <dt style={{ color: 'var(--sat-tx3)' }}>{label as string}</dt>
                <dd className="text-right" style={{ color: 'var(--sat-tx)' }}>
                  {(val as string) || '—'}
                </dd>
              </div>
            ))}
          </dl>
        </Card>

        {/* Specs del modelo */}
        <Card>
          <div className="flex items-center gap-2 mb-3" style={{ color: 'var(--sat-bl)' }}>
            <Cog size={18} /><h3 className="text-sm font-semibold uppercase tracking-wider">Especificaciones técnicas</h3>
          </div>
          {modelSpecs ? (
            <dl className="space-y-2 text-sm">
              <SpecRow label="Par" value={`${modelSpecs.par_min || '–'}–${modelSpecs.par_max || '–'} ${modelSpecs.par_unit || 'Nm'}`} accent />
              <SpecRow label="Velocidad" value={`${modelSpecs.vel_min || '–'}–${modelSpecs.vel_max || '–'} ${modelSpecs.vel_unit || 'rpm'}`} />
              <SpecRow label="Vel. fábrica" value={`${modelSpecs.vel_fabrica || '–'} ${modelSpecs.vel_unit || 'rpm'}`} />
              <SpecRow label="Peso" value={`${modelSpecs.peso || '–'} ${modelSpecs.peso_unit || 'kg'}`} />
              <SpecRow label="Interfaz" value={(modelSpecs.interfaz as string) || '–'} />
              <SpecRow label="Precisión" value={(modelSpecs.precision as string) || '–'} success />
              <SpecRow label="N° pedido" value={(modelSpecs.nro_pedido as string) || '–'} />
              {!!modelSpecs.uso && (
                <div className="mt-3 pt-3 text-xs italic border-t" style={{ color: 'var(--sat-tx3)', borderColor: 'var(--sat-br)' }}>
                  {modelSpecs.uso as string}
                </div>
              )}
            </dl>
          ) : (
            <p className="text-sm" style={{ color: 'var(--sat-tx3)' }}>
              Sin especificaciones para este modelo. <Link href="/sat/modelos" className="underline">Ver catálogo</Link>
            </p>
          )}
        </Card>

      </div>

      {/* Historial */}
      <Card className="p-0 overflow-hidden">
        <div className="p-4 border-b flex items-center gap-2" style={{ borderColor: 'var(--sat-br)', color: 'var(--sat-gn)' }}>
          <Calendar size={18} />
          <h3 className="text-sm font-semibold uppercase tracking-wider">Historial de servicios ({history.length})</h3>
        </div>
        {history.length === 0 ? (
          <div className="text-center py-12">
            <Wrench size={48} className="mx-auto mb-3 opacity-30" style={{ color: 'var(--sat-tx3)' }} />
            <p style={{ color: 'var(--sat-tx2)' }}>Sin servicios previos</p>
            <p className="text-xs mt-1" style={{ color: 'var(--sat-tx3)' }}>Creá una nueva ficha para comenzar el seguimiento</p>
          </div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>N°</TableHead>
                <TableHead>Fecha</TableHead>
                <TableHead>Tipo</TableHead>
                <TableHead>Técnico</TableHead>
                <TableHead>Cp</TableHead>
                <TableHead>Cpk</TableHead>
                <TableHead>Tiempo</TableHead>
                <TableHead>Total</TableHead>
                <TableHead>Estado</TableHead>
                <TableHead>PDF</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {history.map((h) => {
                const torque = (h.torque_measurements as Record<string, unknown>) || {}
                const tipoVar = ((h.tipo as string) || '').toUpperCase() === 'PREVENTIVO' ? 'info' : 'warning'
                const estVar = h.estado_final === 'APROBADA' ? 'success' : h.estado_final === 'REPROBADA' ? 'danger' : 'default'
                return (
                  <TableRow key={h.id as string} onClick={() => setDetailService(h)}>
                    <TableCell><span style={{ fontFamily: 'var(--sat-mo)', textAlign: 'center' }}>{(h.service_number as number) || '—'}</span></TableCell>
                    <TableCell>
                      <span
                        style={{ fontFamily: 'var(--sat-mo)', fontSize: 13, color: 'var(--sat-or)', cursor: 'pointer', textDecoration: 'underline', textDecorationStyle: 'dotted' }}
                        title="Ver detalle completo"
                      >{(h.fecha as string) || '—'}</span>
                    </TableCell>
                    <TableCell><Badge variant={tipoVar as any}>{(h.tipo as string) || '—'}</Badge></TableCell>
                    <TableCell><span style={{ fontSize: 13 }}>{(h.tecnico as string) || '—'}</span></TableCell>
                    <TableCell><span style={{ fontFamily: 'var(--sat-mo)', fontSize: 13, color: 'var(--sat-bl)' }}>{(torque.cp as number)?.toFixed?.(3) ?? '—'}</span></TableCell>
                    <TableCell><span style={{ fontFamily: 'var(--sat-mo)', fontSize: 13, color: 'var(--sat-bl)' }}>{(torque.cpk as number)?.toFixed?.(3) ?? '—'}</span></TableCell>
                    <TableCell><span style={{ fontSize: 13 }}>{h.tiempo_horas ? `${h.tiempo_horas}h` : '—'}</span></TableCell>
                    <TableCell><span style={{ fontFamily: 'var(--sat-mo)', color: 'var(--sat-or)' }}>{h.cot_total ? `$ ${fmtNumber(h.cot_total as number)}` : '—'}</span></TableCell>
                    <TableCell><Badge variant={estVar as any}>{(h.estado_final as string) || '—'}</Badge></TableCell>
                    <TableCell>
                      <div className="flex gap-1" onClick={(e) => e.stopPropagation()}>
                        <Button size="sm" variant="ghost" onClick={() => setDetailService(h)} title="Ver detalle"><Eye size={14} /></Button>
                        <Link href={`/sat/historico/${h.id}/pdf`} title="Generar PDF">
                          <Button size="sm" variant="ghost"><Download size={14} /></Button>
                        </Link>
                        {h.pdf_url ? (
                          <a href={h.pdf_url as string} target="_blank" rel="noreferrer" title={`PDF original (${h.ntt_number as string || 'legacy'})`}>
                            <Button size="sm" variant="ghost">📄</Button>
                          </a>
                        ) : null}
                      </div>
                    </TableCell>
                  </TableRow>
                )
              })}
            </TableBody>
          </Table>
        )}
      </Card>

      {/* Modal de detalle del servicio */}
      {detailService && (
        <ServiceDetailModal service={detailService} asset={asset} onClose={() => setDetailService(null)} />
      )}

      {/* Modal de cancelación de ticket */}
      {cancelingTicket && (
        <Modal
          isOpen={true}
          onClose={() => { setCancelingTicket(null); setCancelReason(''); setCancelDetail('') }}
          title={`🗑 Cancelar ticket ${cancelingTicket.number as string}`}
          size="md"
        >
          <div className="space-y-4">
            <div className="p-3 rounded-lg" style={{ background: 'rgba(239, 68, 68, 0.08)', border: '1px solid rgba(239, 68, 68, 0.3)' }}>
              <p className="text-sm" style={{ color: '#F87171' }}>
                ⚠ Al cancelar, el ticket queda archivado con motivo y NO se puede editar más. Queda el registro en el log de actividad para auditoría.
              </p>
            </div>
            <div>
              <label className="block text-sm font-medium mb-1.5" style={{ color: '#9CA3AF' }}>Motivo *</label>
              <div className="space-y-2">
                {[
                  'Abierta por error',
                  'Duplicada — ya hay otra hoja activa',
                  'Cliente canceló el servicio',
                  'Equipo retirado sin reparar',
                  'Otro motivo',
                ].map((r) => (
                  <button
                    key={r}
                    type="button"
                    onClick={() => setCancelReason(r)}
                    className="w-full text-left px-4 py-2 rounded-lg border transition-all text-sm"
                    style={{
                      background: cancelReason === r ? 'rgba(239, 68, 68, 0.1)' : '#0F1218',
                      borderColor: cancelReason === r ? 'rgba(239, 68, 68, 0.5)' : '#1E2330',
                      color: cancelReason === r ? '#F87171' : '#D1D5DB',
                    }}
                  >
                    {r}
                  </button>
                ))}
              </div>
            </div>
            <div>
              <label className="block text-sm font-medium mb-1.5" style={{ color: '#9CA3AF' }}>Detalle (opcional)</label>
              <textarea
                value={cancelDetail}
                onChange={(e) => setCancelDetail(e.target.value)}
                className="w-full h-20 rounded-lg px-3 py-2 text-sm resize-none focus:outline-none"
                style={{ background: '#1E2330', border: '1px solid #2A3040', color: '#F0F2F5' }}
                placeholder="Ej: La abrí sin querer, ya estaba la SAT-XXXX..."
              />
            </div>
            <div className="flex justify-end gap-3 pt-2 border-t" style={{ borderColor: '#1E2330' }}>
              <Button variant="secondary" onClick={() => { setCancelingTicket(null); setCancelReason(''); setCancelDetail('') }}>Volver</Button>
              <Button variant="danger" onClick={doCancelTicket}>
                🗑 Confirmar cancelación
              </Button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  )
}

function ServiceDetailModal({ service, asset, onClose }: { service: Row; asset: Row; onClose: () => void }) {
  const torque = (service.torque_measurements as Record<string, unknown>) || {}
  const partes = (service.partes as { antes?: Record<string, string>; despues?: Record<string, string> }) || {}
  const fotosIn = (service.photos_in as Array<{ url: string; caption?: string }>) || []
  const fotosOut = (service.photos_out as Array<{ url: string; caption?: string }>) || []
  const medicionesTorque = (torque.tgt as Array<number | null>) || []
  const tipoVar = ((service.tipo as string) || '').toUpperCase() === 'PREVENTIVO' ? 'info' : 'warning'
  const estVar = service.estado_final === 'APROBADA' ? 'success' : service.estado_final === 'REPROBADA' ? 'danger' : 'default'

  const hayPartes = Object.keys(partes.antes || {}).length > 0 || Object.keys(partes.despues || {}).length > 0
  const hayTorque = torque.nom || torque.mean || (torque.cpk !== null && torque.cpk !== undefined)

  return (
    <Modal isOpen={true} onClose={onClose} title="" size="xl">
      <div className="space-y-4">
        {/* Header del servicio */}
        <div className="flex items-start justify-between gap-3 pb-3 border-b" style={{ borderColor: 'var(--sat-br)' }}>
          <div>
            <div className="flex items-center gap-2 mb-1 flex-wrap">
              <span style={{ fontFamily: 'var(--sat-mo)', color: 'var(--sat-or)', fontSize: 14, fontWeight: 700 }}>
                Servicio N° {service.service_number as number}
              </span>
              <Badge variant={tipoVar as any}>{(service.tipo as string) || '—'}</Badge>
              <Badge variant={estVar as any}>{(service.estado_final as string) || '—'}</Badge>
              {service.ntt_number ? (
                <Badge variant="default">NTT: {service.ntt_number as string}</Badge>
              ) : null}
            </div>
            <div className="text-sm" style={{ color: 'var(--sat-tx2)' }}>
              <strong>Fecha:</strong> {service.fecha as string}  ·  <strong>Técnico:</strong> {service.tecnico as string || '—'}
              {service.tiempo_horas ? <> · <strong>Tiempo:</strong> {service.tiempo_horas as number}h</> : null}
            </div>
            <div className="text-xs mt-1" style={{ color: 'var(--sat-tx3)' }}>
              {(asset?.ref as string)}  ·  {(asset?.internal_id as string)}  ·  Serie {(asset?.serial_number as string) || '—'}
            </div>
          </div>
          <div className="flex gap-2 flex-shrink-0">
            <Link href={`/sat/historico/${service.id as string}/pdf`} target="_blank">
              <Button size="sm" variant="secondary"><Download size={14} /> PDF generado</Button>
            </Link>
            {service.pdf_url ? (
              <a href={service.pdf_url as string} target="_blank" rel="noreferrer">
                <Button size="sm" variant="secondary">📄 NTT original</Button>
              </a>
            ) : null}
          </div>
        </div>

        {/* OBSERVACIONES — lo que describe el trabajo */}
        <div>
          <div className="text-sm font-semibold uppercase tracking-wider mb-2" style={{ color: 'var(--sat-or)' }}>
            📝 Descripción del trabajo
          </div>
          <div
            className="text-sm whitespace-pre-wrap p-3 rounded-lg"
            style={{ background: 'var(--sat-dk3)', border: '1px solid var(--sat-br)', color: 'var(--sat-tx)', lineHeight: 1.6 }}
          >
            {(service.obs as string) || 'Sin observaciones registradas'}
          </div>
        </div>

        {/* PARTES antes/después */}
        {hayPartes && (
          <div>
            <div className="text-sm font-semibold uppercase tracking-wider mb-2" style={{ color: 'var(--sat-bl)' }}>
              🔧 Inspección de partes
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <div className="text-xs mb-1" style={{ color: 'var(--sat-tx3)' }}>Al ingreso</div>
                <ul className="text-xs space-y-0.5 p-2 rounded" style={{ background: 'var(--sat-dk3)' }}>
                  {Object.entries(partes.antes || {}).length === 0 ? (
                    <li style={{ color: 'var(--sat-tx3)' }}>—</li>
                  ) : (
                    Object.entries(partes.antes || {}).map(([k, v]) => (
                      <li key={k} className="flex justify-between">
                        <span className="capitalize" style={{ color: 'var(--sat-tx2)' }}>{k}</span>
                        <span style={{ color: v === 'OK' ? 'var(--sat-gn)' : v === 'NOK' ? 'var(--sat-rd)' : 'var(--sat-tx3)', fontWeight: 600 }}>{v}</span>
                      </li>
                    ))
                  )}
                </ul>
              </div>
              <div>
                <div className="text-xs mb-1" style={{ color: 'var(--sat-tx3)' }}>Post-reparación</div>
                <ul className="text-xs space-y-0.5 p-2 rounded" style={{ background: 'var(--sat-dk3)' }}>
                  {Object.entries(partes.despues || {}).length === 0 ? (
                    <li style={{ color: 'var(--sat-tx3)' }}>—</li>
                  ) : (
                    Object.entries(partes.despues || {}).map(([k, v]) => (
                      <li key={k} className="flex justify-between">
                        <span className="capitalize" style={{ color: 'var(--sat-tx2)' }}>{k}</span>
                        <span style={{ color: v === 'OK' ? 'var(--sat-gn)' : v === 'NOK' ? 'var(--sat-rd)' : 'var(--sat-tx3)', fontWeight: 600 }}>{v}</span>
                      </li>
                    ))
                  )}
                </ul>
              </div>
            </div>
          </div>
        )}

        {/* TORQUE */}
        {hayTorque ? (
          <div>
            <div className="text-sm font-semibold uppercase tracking-wider mb-2" style={{ color: 'var(--sat-gn)' }}>
              ⚙️ Certificación de torque
            </div>
            <div className="grid grid-cols-3 sm:grid-cols-6 gap-2 text-xs">
              <Metric label="LCI" val={torque.lci as number} unit={torque.unit as string} />
              <Metric label="Nominal" val={torque.nom as number} unit={torque.unit as string} highlight />
              <Metric label="LCS" val={torque.lcs as number} unit={torque.unit as string} />
              <Metric label="Promedio" val={torque.mean as number} />
              <Metric label="Cp" val={torque.cp as number} ok={(torque.cp as number) >= 1.33} />
              <Metric label="Cpk" val={torque.cpk as number} ok={(torque.cpk as number) >= 1.33} />
            </div>
            {medicionesTorque.filter((v) => v !== null && v !== undefined).length > 0 && (
              <div className="mt-2">
                <div className="text-xs mb-1" style={{ color: 'var(--sat-tx3)' }}>10 mediciones</div>
                <div className="grid grid-cols-5 sm:grid-cols-10 gap-1 text-xs">
                  {medicionesTorque.map((v, i) => (
                    <div key={i} className="text-center p-1 rounded" style={{ background: 'var(--sat-dk3)', fontFamily: 'var(--sat-mo)' }}>
                      {v !== null && v !== undefined ? (v as number).toFixed(2) : '—'}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        ) : null}

        {/* COTIZACIÓN */}
        {service.cot_total ? (
          <div className="flex items-center justify-between p-3 rounded-lg" style={{ background: 'var(--sat-or-d)', border: '1px solid var(--sat-or)' }}>
            <span className="text-xs font-semibold uppercase" style={{ color: 'var(--sat-or)' }}>Total cotizado</span>
            <span style={{ fontFamily: 'var(--sat-mo)', fontSize: 18, fontWeight: 700, color: 'var(--sat-or)' }}>
              $ {fmtNumber(service.cot_total as number)}
            </span>
          </div>
        ) : null}

        {/* FOTOS */}
        {(fotosIn.length > 0 || fotosOut.length > 0) && (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {fotosIn.length > 0 && (
              <div>
                <div className="text-xs font-semibold mb-2" style={{ color: 'var(--sat-or)' }}>📷 Ingreso ({fotosIn.length})</div>
                <div className="grid grid-cols-3 gap-2">
                  {fotosIn.map((p, i) => (
                    <a key={i} href={p.url} target="_blank" rel="noreferrer">
                      <img src={p.url} alt="" className="w-full aspect-square object-cover rounded" style={{ border: '1px solid var(--sat-br)' }} />
                    </a>
                  ))}
                </div>
              </div>
            )}
            {fotosOut.length > 0 && (
              <div>
                <div className="text-xs font-semibold mb-2" style={{ color: 'var(--sat-gn)' }}>📷 Egreso ({fotosOut.length})</div>
                <div className="grid grid-cols-3 gap-2">
                  {fotosOut.map((p, i) => (
                    <a key={i} href={p.url} target="_blank" rel="noreferrer">
                      <img src={p.url} alt="" className="w-full aspect-square object-cover rounded" style={{ border: '1px solid var(--sat-br)' }} />
                    </a>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </Modal>
  )
}

function Metric({ label, val, unit, highlight, ok }: { label: string; val: number | null; unit?: string; highlight?: boolean; ok?: boolean }) {
  const color = highlight ? 'var(--sat-or)' : ok === true ? 'var(--sat-gn)' : ok === false ? 'var(--sat-am)' : 'var(--sat-tx)'
  return (
    <div className="p-2 rounded" style={{ background: 'var(--sat-dk3)', border: '1px solid var(--sat-br)' }}>
      <div style={{ fontSize: 10, color: 'var(--sat-tx3)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.3 }}>{label}</div>
      <div style={{ fontFamily: 'var(--sat-mo)', fontSize: 14, fontWeight: 700, color }}>
        {val === null || val === undefined || isNaN(val as number) ? '—' : (val as number).toFixed(unit ? 2 : 3)}
        {unit && val !== null && val !== undefined ? <span style={{ fontSize: 10, color: 'var(--sat-tx3)', marginLeft: 3 }}>{unit}</span> : null}
      </div>
    </div>
  )
}

function SpecRow({ label, value, accent, success }: { label: string; value: string; accent?: boolean; success?: boolean }) {
  const color = accent ? 'var(--sat-or)' : success ? 'var(--sat-gn)' : 'var(--sat-tx)'
  return (
    <div className="flex justify-between gap-3 border-b pb-1" style={{ borderColor: 'var(--sat-br)' }}>
      <dt style={{ color: 'var(--sat-tx3)' }}>{label}</dt>
      <dd className="text-right font-semibold" style={{ color, fontFamily: 'var(--sat-mo)' }}>{value}</dd>
    </div>
  )
}
