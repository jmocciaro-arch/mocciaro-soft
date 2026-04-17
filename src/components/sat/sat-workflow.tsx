'use client'

import { useState, useCallback, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Modal } from '@/components/ui/modal'
import { useToast } from '@/components/ui/toast'
import {
  ChevronLeft, ChevronRight, Pause, Play, Save, Loader2,
  CheckCircle, X, AlertTriangle, Trash2, Cpu, Cog, History
} from 'lucide-react'
import Link from 'next/link'
import { normalizeModel } from '@/lib/sat/fein-data'
import { cn } from '@/lib/utils'
import { StepDiagnostico } from './steps/step-diagnostico'
import { StepCotizacion } from './steps/step-cotizacion'
import { StepReparacion } from './steps/step-reparacion'
import { StepTorque } from './steps/step-torque'
import { StepCierre } from './steps/step-cierre'
import {
  STEP_COLORS, PAUSE_REASONS, DEFAULT_INSPECTION_PARTS,
  type SATWorkflowData, type PauseState,
} from './sat-workflow-types'

type Row = Record<string, unknown>

interface AssetFullData {
  id: string
  ref: string
  internal_id: string | null
  serial_number: string | null
  brand: string | null
  model: string | null
  client_id: string | null
  tt_clients?: { name: string } | null
  city: string | null
  province: string | null
}

interface ModelSpecs {
  par_min: number | null
  par_max: number | null
  par_unit: string | null
  vel_min: number | null
  vel_max: number | null
  vel_unit: string | null
  peso: number | null
  peso_unit: string | null
  interfaz: string | null
  precision: string | null
}

interface HistSummary {
  count: number
  last_fecha: string | null
  last_tipo: string | null
}

interface SATWorkflowProps {
  ticketId: string
  ticketNumber: string
  onClose: () => void
  onComplete?: () => void
}

// =====================================================
// DEFAULT INITIAL STATE
// =====================================================

function createInitialState(ticketId: string): SATWorkflowData {
  return {
    ticket_id: ticketId,
    process_instance_id: null,
    current_step: 0,
    diagnostico: {
      asset_serial: '', asset_description: '', client_id: '', client_name: '',
      brand: '', model: '', reported_issue: '',
      inspection_grid: DEFAULT_INSPECTION_PARTS.map(p => ({ ...p })),
      initial_notes: '',
    },
    cotizacion: {
      items: [], labor_hours: 0, labor_rate: 0, labor_currency: 'EUR',
      discount_percent: 0, notes: '', total_parts: 0, total_labor: 0, total: 0,
    },
    reparacion: {
      work_performed: '', post_repair_grid: DEFAULT_INSPECTION_PARTS.map(p => ({ ...p })),
      start_time: '', end_time: '', total_minutes: 0, technician_notes: '',
      parts_used: [],
    },
    torque: {
      target_torque: 0, tolerance_percent: 5, unit: 'Nm',
      measurements: Array.from({ length: 10 }, (_, i) => ({ index: i + 1, value: null })),
      mean: null, std_dev: null, cv: null, cp: null, cpk: null,
      efficiency: null, result: null,
    },
    cierre: {
      final_status: 'reparado', warranty_until: '', delivery_notes: '',
      signature_tech: '', signature_client: '', saved_to_history: false,
    },
    pause: {
      is_paused: false, reason: '', paused_at: null, paused_by: null,
      free_text: '', snapshot: null,
    },
  }
}

// =====================================================
// STEP VALIDATION
// =====================================================

function validateStep(step: number, data: SATWorkflowData): string | null {
  switch (step) {
    case 0: {
      const d = data.diagnostico
      if (!d.client_id) return 'Selecciona un cliente'
      if (!d.asset_serial.trim()) return 'Ingresa el numero de serie'
      if (!d.reported_issue.trim()) return 'Describe el problema reportado'
      return null
    }
    case 1:
      // Cotización es opcional pero si hay items, deben tener descripción
      for (const item of data.cotizacion.items) {
        if (!item.description.trim()) return 'Completa la descripcion de todos los items'
      }
      return null
    case 2:
      if (!data.reparacion.work_performed.trim()) return 'Describe el trabajo realizado'
      return null
    case 3:
      if (data.torque.target_torque <= 0) return 'Configura el torque objetivo'
      const filled = data.torque.measurements.filter(m => m.value !== null && m.value > 0).length
      if (filled < 3) return 'Necesitas al menos 3 mediciones'
      return null
    case 4:
      if (!data.cierre.final_status) return 'Selecciona el estado final'
      if (!data.cierre.signature_tech.trim()) return 'Ingresa el nombre del tecnico'
      return null
    default:
      return null
  }
}

// =====================================================
// MAIN COMPONENT
// =====================================================

export function SATWorkflow({ ticketId, ticketNumber, onClose, onComplete }: SATWorkflowProps) {
  const { addToast } = useToast()
  const [data, setData] = useState<SATWorkflowData>(createInitialState(ticketId))
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [showPauseModal, setShowPauseModal] = useState(false)
  const [pauseReason, setPauseReason] = useState('')
  const [showCancelModal, setShowCancelModal] = useState(false)
  const [cancelReason, setCancelReason] = useState('')
  const [cancelDetail, setCancelDetail] = useState('')
  const [pauseFreeText, setPauseFreeText] = useState('')

  // ── Sidebar: datos del activo seleccionado ──
  const [assetData, setAssetData] = useState<AssetFullData | null>(null)
  const [modelSpecs, setModelSpecs] = useState<ModelSpecs | null>(null)
  const [histSummary, setHistSummary] = useState<HistSummary>({ count: 0, last_fecha: null, last_tipo: null })
  const [histList, setHistList] = useState<Array<{ id: string; fecha: string; tipo: string; tecnico: string | null; cp: number | null; cpk: number | null; pdf_url: string | null }>>([])

  const currentStep = data.current_step

  // ── Load existing workflow data from ticket metadata ──
  useEffect(() => {
    const load = async () => {
      setLoading(true)
      const sb = createClient()
      const { data: ticket } = await sb
        .from('tt_sat_tickets')
        .select('*, tt_clients(id, name)')
        .eq('id', ticketId)
        .single()

      if (ticket) {
        // Check if there's saved workflow data in metadata
        const meta = (ticket.metadata as Record<string, unknown>) || {}
        const savedWorkflow = meta.sat_workflow as SATWorkflowData | undefined

        if (savedWorkflow) {
          setData({ ...savedWorkflow, ticket_id: ticketId })
        } else {
          // Pre-fill from ticket
          const initial = createInitialState(ticketId)
          initial.diagnostico.client_id = (ticket.client_id as string) || ''
          initial.diagnostico.client_name = ((ticket.tt_clients as Row)?.name as string) || ''
          initial.diagnostico.asset_serial = (ticket.serial_number as string) || ''
          initial.diagnostico.reported_issue = (ticket.description as string) || ''
          setData(initial)
        }
      }
      setLoading(false)
    }
    load()
  }, [ticketId])

  // ── Cargar datos del activo para el sidebar ──
  useEffect(() => {
    const serial = data.diagnostico.asset_serial
    if (!serial || !serial.trim()) {
      setAssetData(null)
      setModelSpecs(null)
      setHistSummary({ count: 0, last_fecha: null, last_tipo: null })
      return
    }
    let cancelled = false
    ;(async () => {
      const sb = createClient()
      const { data: a } = await sb
        .from('tt_sat_assets')
        .select('id, ref, internal_id, serial_number, brand, model, client_id, tt_clients(name), city, province')
        .or(`serial_number.eq.${serial},ref.eq.${serial}`)
        .limit(1)
        .maybeSingle()
      if (cancelled || !a) return
      setAssetData(a as unknown as AssetFullData)

      // specs del modelo
      const aTyped = a as unknown as AssetFullData
      if (aTyped.model) {
        const code = normalizeModel(aTyped.model)
        if (code) {
          const { data: s } = await sb
            .from('tt_fein_models')
            .select('par_min, par_max, par_unit, vel_min, vel_max, vel_unit, peso, peso_unit, interfaz, precision')
            .eq('model_code', code)
            .maybeSingle()
          if (!cancelled) setModelSpecs((s as ModelSpecs | null) || null)
        }
      }

      // historial completo (hasta 10) + resumen
      const { data: hist, count } = await sb
        .from('tt_sat_service_history')
        .select('id, fecha, tipo, tecnico, torque_measurements, pdf_url', { count: 'exact' })
        .eq('asset_id', aTyped.id)
        .order('fecha', { ascending: false })
        .limit(10)
      if (!cancelled) {
        const rows = (hist || []).map((h: Record<string, unknown>) => {
          const torque = (h.torque_measurements as Record<string, unknown>) || {}
          return {
            id: h.id as string,
            fecha: h.fecha as string,
            tipo: (h.tipo as string) || '—',
            tecnico: (h.tecnico as string) || null,
            cp: (torque.cp as number | null) ?? null,
            cpk: (torque.cpk as number | null) ?? null,
            pdf_url: (h.pdf_url as string) || null,
          }
        })
        setHistList(rows)
        setHistSummary({
          count: count || 0,
          last_fecha: rows[0]?.fecha || null,
          last_tipo: rows[0]?.tipo || null,
        })
      }
    })()
    return () => { cancelled = true }
  }, [data.diagnostico.asset_serial])

  // ── Save workflow data to ticket metadata ──
  const saveProgress = useCallback(async (workflowData?: SATWorkflowData) => {
    const toSave = workflowData || data
    setSaving(true)
    const sb = createClient()

    // Get current metadata
    const { data: ticket } = await sb
      .from('tt_sat_tickets')
      .select('metadata')
      .eq('id', ticketId)
      .single()

    const currentMeta = (ticket?.metadata as Record<string, unknown>) || {}

    await sb
      .from('tt_sat_tickets')
      .update({
        metadata: { ...currentMeta, sat_workflow: toSave },
      })
      .eq('id', ticketId)

    setSaving(false)
    addToast({ type: 'success', title: 'Progreso guardado' })
  }, [data, ticketId, addToast])

  // ── Navigate steps ──
  const goToStep = (step: number) => {
    if (step < 0 || step > 4) return
    // Can navigate back freely, forward needs validation
    if (step > currentStep) {
      const err = validateStep(currentStep, data)
      if (err) {
        addToast({ type: 'warning', title: 'Datos incompletos', message: err })
        return
      }
    }
    setData(prev => ({ ...prev, current_step: step }))
  }

  const handleNext = () => {
    if (currentStep < 4) {
      goToStep(currentStep + 1)
      saveProgress({ ...data, current_step: currentStep + 1 })
    }
  }

  const handlePrev = () => {
    if (currentStep > 0) {
      goToStep(currentStep - 1)
    }
  }

  // ── Pause / Resume ──
  const handlePause = async () => {
    if (!pauseReason && !pauseFreeText.trim()) {
      addToast({ type: 'warning', title: 'Selecciona un motivo' })
      return
    }
    const pauseData: PauseState = {
      is_paused: true,
      reason: pauseReason || pauseFreeText,
      paused_at: new Date().toISOString(),
      paused_by: null,
      free_text: pauseFreeText,
      snapshot: { step: currentStep },
    }
    const updated = { ...data, pause: pauseData }
    setData(updated)
    await saveProgress(updated)

    // Update ticket status
    const sb = createClient()
    await sb.from('tt_sat_tickets').update({ status: 'waiting_parts' }).eq('id', ticketId)

    setShowPauseModal(false)
    setPauseReason('')
    setPauseFreeText('')
    addToast({ type: 'info', title: 'Hoja pausada', message: pauseReason || pauseFreeText })
  }

  const handleResume = async () => {
    const updated = {
      ...data,
      pause: { ...data.pause, is_paused: false },
    }
    setData(updated)
    await saveProgress(updated)

    const sb = createClient()
    await sb.from('tt_sat_tickets').update({ status: 'in_progress' }).eq('id', ticketId)

    addToast({ type: 'success', title: 'Hoja reanudada' })
  }

  // ── Cancel / Descartar ──
  const handleCancel = async () => {
    if (!cancelReason && !cancelDetail.trim()) {
      addToast({ type: 'warning', title: 'Indicá un motivo para cancelar' })
      return
    }
    const sb = createClient()
    const { data: ticket } = await sb.from('tt_sat_tickets').select('metadata').eq('id', ticketId).single()
    const currentMeta = (ticket?.metadata as Record<string, unknown>) || {}

    await sb.from('tt_sat_tickets').update({
      status: 'cancelled',
      metadata: {
        ...currentMeta,
        cancel_reason: cancelReason,
        cancel_detail: cancelDetail,
        cancelled_at: new Date().toISOString(),
      },
    }).eq('id', ticketId)

    // Log en activity
    await sb.from('tt_activity_log').insert({
      entity_type: 'sat_ticket',
      entity_id: ticketId,
      action: 'workflow_cancelled',
      description: `Hoja cancelada: ${cancelReason}${cancelDetail ? ' — ' + cancelDetail : ''}`,
    })

    addToast({ type: 'info', title: 'Hoja cancelada', message: cancelReason })
    setShowCancelModal(false)
    setCancelReason('')
    setCancelDetail('')
    onClose()
  }

  // ── Complete workflow ──
  const handleComplete = async () => {
    const err = validateStep(4, data)
    if (err) {
      addToast({ type: 'warning', title: 'Datos incompletos', message: err })
      return
    }

    setSaving(true)
    const sb = createClient()

    const finalData = {
      ...data,
      cierre: { ...data.cierre, saved_to_history: true },
    }

    // Save final workflow
    const { data: ticket } = await sb
      .from('tt_sat_tickets')
      .select('metadata')
      .eq('id', ticketId)
      .single()

    const currentMeta = (ticket?.metadata as Record<string, unknown>) || {}

    await sb
      .from('tt_sat_tickets')
      .update({
        status: 'resolved',
        resolution: `${data.cierre.final_status.toUpperCase()} — Torque: ${data.torque.result || 'N/A'} (Cpk: ${data.torque.cpk ?? 'N/A'})`,
        diagnosis: data.diagnostico.initial_notes || data.diagnostico.reported_issue,
        metadata: { ...currentMeta, sat_workflow: finalData, completed_at: new Date().toISOString() },
      })
      .eq('id', ticketId)

    // ═══ Guardar en histórico permanente (tt_sat_service_history) ═══
    try {
      // Resolver asset_id buscando por serial o ref
      let assetId: string | null = null
      if (data.diagnostico.asset_serial) {
        const { data: assetBySerial } = await sb
          .from('tt_sat_assets')
          .select('id')
          .or(`serial_number.eq.${data.diagnostico.asset_serial},ref.eq.${data.diagnostico.asset_serial}`)
          .limit(1)
          .maybeSingle()
        assetId = (assetBySerial as { id?: string } | null)?.id || null
      }

      // Contar servicios previos para numerar
      let serviceNumber = 1
      if (assetId) {
        const { count } = await sb
          .from('tt_sat_service_history')
          .select('id', { count: 'exact', head: true })
          .eq('asset_id', assetId)
        serviceNumber = (count || 0) + 1
      }

      // Armar JSONB partes: antes y despues
      const partesAntes: Record<string, string> = {}
      data.diagnostico.inspection_grid.forEach((p) => {
        if (p.status && p.status !== 'NA') partesAntes[p.name] = p.status
      })
      const partesDespues: Record<string, string> = {}
      data.reparacion.post_repair_grid.forEach((p) => {
        if (p.status && p.status !== 'NA') partesDespues[p.name] = p.status
      })

      const torqueJsonb = {
        lci: data.torque.target_torque
          ? data.torque.target_torque * (1 - data.torque.tolerance_percent / 100)
          : null,
        nom: data.torque.target_torque,
        lcs: data.torque.target_torque
          ? data.torque.target_torque * (1 + data.torque.tolerance_percent / 100)
          : null,
        unit: data.torque.unit,
        mean: data.torque.mean,
        std_dev: data.torque.std_dev,
        cp: data.torque.cp,
        cpk: data.torque.cpk,
        cv: data.torque.cv,
        efficiency: data.torque.efficiency,
        result: data.torque.result,
        tgt: data.torque.measurements.map((m) => m.value),
      }

      const estadoFinal =
        data.cierre.final_status === 'reparado' ? 'APROBADA'
        : data.cierre.final_status === 'irreparable' ? 'REPROBADA'
        : data.cierre.final_status === 'garantia' ? 'GARANTIA'
        : 'DEVUELTO'

      await sb.from('tt_sat_service_history').insert({
        asset_id: assetId,
        ticket_id: ticketId,
        service_number: serviceNumber,
        fecha: new Date().toISOString().split('T')[0],
        tecnico: data.cierre.signature_tech || null,
        tecnico_recepcion: data.cierre.signature_tech || null,
        tecnico_mant: data.cierre.signature_tech || null,
        tipo: (data.diagnostico.reported_issue || '').toLowerCase().includes('preventiv')
          ? 'PREVENTIVO' : 'CORRECTIVO',
        partes: { antes: partesAntes, despues: partesDespues },
        torque_measurements: torqueJsonb,
        cot_total: data.cotizacion.total || null,
        cot_estado: 'APROBADA',
        tiempo_horas: data.reparacion.total_minutes ? data.reparacion.total_minutes / 60 : null,
        estado_final: estadoFinal,
        obs: data.cierre.delivery_notes || data.reparacion.work_performed || null,
        photos_in: (data.diagnostico.photos_in || []) as unknown as Row[],
        photos_out: (data.cierre.photos_out || []) as unknown as Row[],
        saved_at: new Date().toISOString(),
      })
    } catch (histErr) {
      console.error('Error guardando en historial:', histErr)
      // no bloquear el cierre del ticket si falla el historial
    }

    // Log activity
    await sb.from('tt_activity_log').insert({
      entity_type: 'sat_ticket',
      entity_id: ticketId,
      action: 'workflow_completed',
      description: `Hoja de mantenimiento completada: ${data.cierre.final_status} — ${data.torque.result || 'sin torque'}`,
    })

    setSaving(false)
    addToast({ type: 'success', title: 'Hoja completada', message: `Ticket ${ticketNumber} resuelto y guardado en histórico` })
    onComplete?.()
  }

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center py-20">
        <Loader2 size={32} className="animate-spin text-[#FF6600]" />
        <p className="text-sm text-[#6B7280] mt-3">Cargando hoja de mantenimiento...</p>
      </div>
    )
  }

  return (
    <div className="space-y-0">
      {/* ── Top Bar: info + actions (estilo BuscaTools) ── */}
      <div className="flex items-center justify-between px-4 py-2 border-b border-[#2A3040] bg-[#0F1218]">
        <div className="flex items-center gap-3">
          <span className="font-mono text-sm font-bold text-[#FF6600]">{ticketNumber}</span>
          {data.pause.is_paused
            ? <Badge variant="warning" size="md">⏸ Pausado</Badge>
            : <span className="text-xs text-[#6B7280]">Paso {currentStep + 1}/5</span>
          }
        </div>
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="sm" onClick={() => saveProgress()}>
            <Save size={14} /> {saving ? 'Guardando...' : 'Guardar'}
          </Button>
          {!data.pause.is_paused && (
            <Button variant="outline" size="sm" onClick={() => setShowPauseModal(true)}>
              <Pause size={14} /> Pausar
            </Button>
          )}
          <Button variant="ghost" size="sm" onClick={() => setShowCancelModal(true)} style={{ color: '#EF4444' }}>
            <Trash2 size={14} /> Cancelar
          </Button>
          <Button variant="ghost" size="sm" onClick={onClose}>
            <X size={14} />
          </Button>
        </div>
      </div>

      {/* ── Banner equipo — muestra datos prominentes del activo seleccionado ── */}
      {(data.diagnostico.asset_serial || data.diagnostico.brand || data.diagnostico.model || data.diagnostico.client_name) && (
        <div className="px-4 py-3 border-b border-[#2A3040]" style={{ background: 'linear-gradient(90deg, rgba(249,115,22,0.08) 0%, transparent 50%)' }}>
          <div className="flex items-center gap-4 flex-wrap">
            <div className="flex items-center gap-2">
              <span className="w-2 h-2 rounded-full" style={{ background: '#F97316' }}></span>
              <span className="text-xs uppercase tracking-wider font-semibold" style={{ color: '#F97316' }}>Equipo</span>
            </div>
            <div className="flex items-center gap-4 flex-wrap text-sm">
              {data.diagnostico.brand && (
                <span><span className="text-[#6B7280] text-xs">Marca:</span> <strong className="text-[#3B82F6]">{data.diagnostico.brand}</strong></span>
              )}
              {data.diagnostico.model && (
                <span><span className="text-[#6B7280] text-xs">Modelo:</span> <strong className="text-[#F0F2F5]">{data.diagnostico.model}</strong></span>
              )}
              {data.diagnostico.asset_serial && (
                <span><span className="text-[#6B7280] text-xs">Serie:</span> <strong className="font-mono text-xs text-[#F0F2F5]">{data.diagnostico.asset_serial}</strong></span>
              )}
              {data.diagnostico.client_name && (
                <span><span className="text-[#6B7280] text-xs">Cliente:</span> <strong className="text-[#F0F2F5]">{data.diagnostico.client_name}</strong></span>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Pause Banner */}
      {data.pause.is_paused && (
        <div className="flex items-center justify-between px-4 py-3 bg-amber-500/10 border-b border-amber-500/20">
          <div className="flex items-center gap-3">
            <AlertTriangle size={16} className="text-amber-400" />
            <p className="text-xs text-amber-400">
              <span className="font-medium">Pausado:</span> {data.pause.reason}
              {data.pause.free_text && ` — ${data.pause.free_text}`}
            </p>
          </div>
          <Button variant="secondary" size="sm" onClick={handleResume}>
            <Play size={14} /> Reanudar
          </Button>
        </div>
      )}

      {/* ── Numbered Tabs Stepper (estilo BuscaTools) ── */}
      <div className="flex border-b border-[#2A3040] bg-[#0F1218]/50">
        {STEP_COLORS.map((sc, idx) => {
          const isActive = idx === currentStep
          const isCompleted = idx < currentStep
          const isClickable = idx <= currentStep
          return (
            <button
              key={sc.name}
              type="button"
              disabled={!isClickable}
              onClick={() => isClickable && goToStep(idx)}
              className={cn(
                'flex-1 flex items-center justify-center gap-2 py-3 text-xs font-bold uppercase tracking-wider transition-all border-b-2 relative',
                isActive && 'border-[#FF6600] text-[#FF6600] bg-[#FF6600]/5',
                isCompleted && 'border-transparent text-[#10B981] hover:bg-[#1E2330]/50 cursor-pointer',
                !isActive && !isCompleted && 'border-transparent text-[#4B5563] cursor-default',
              )}
            >
              {/* Number circle */}
              <span
                className={cn(
                  'w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold shrink-0',
                  isActive && 'bg-[#FF6600] text-white',
                  isCompleted && 'bg-[#10B981] text-white',
                  !isActive && !isCompleted && 'bg-[#2A3040] text-[#6B7280]',
                )}
              >
                {isCompleted ? '✓' : idx + 1}
              </span>
              <span className="hidden sm:inline">{sc.name}</span>
            </button>
          )
        })}
      </div>

      {/* ── Step Content: Layout 2 columnas (sidebar + contenido) ── */}
      <div
        className="sat-wf-layout"
        style={{
          display: 'grid',
          gap: 16,
          padding: 16,
          background: '#0A0D12',
        }}
      >
        {/* Aside izquierdo — info del activo */}
        <aside className="sat-wf-aside" style={{ alignSelf: 'start' }}>
          {assetData ? (
            <div style={{ background: '#111318', border: '1px solid rgba(255,255,255,0.06)', borderRadius: 12, overflow: 'hidden', position: 'sticky', top: 8 }}>
              <div style={{ background: 'rgba(249,115,22,0.12)', padding: '10px 14px', borderBottom: '1px solid rgba(249,115,22,0.3)' }}>
                <div style={{ fontFamily: 'ui-monospace, monospace', color: '#F97316', fontSize: 13, fontWeight: 700 }}>
                  {assetData.model || '—'}
                </div>
              </div>
              <dl style={{ padding: '12px 14px', display: 'flex', flexDirection: 'column', gap: 8, fontSize: 13, margin: 0 }}>
                <InfoRow label="REFERENCIA" value={assetData.ref} accent />
                <InfoRow label="IDENTIFICADOR" value={assetData.internal_id} mono />
                <InfoRow label="N° SERIE" value={assetData.serial_number} mono />
                <InfoRow label="CLIENTE" value={assetData.tt_clients?.name} bold />
                <InfoRow label="CIUDAD" value={[assetData.city, assetData.province].filter(Boolean).join(', ')} />
                <InfoRow label="SERVICIOS PREVIOS" value={String(histSummary.count)} highlight={histSummary.count > 0} />
                {histSummary.last_fecha && (
                  <InfoRow label="ÚLTIMO SERVICIO" value={`${histSummary.last_fecha} (${histSummary.last_tipo || '—'})`} />
                )}
              </dl>
              {modelSpecs && (
                <div style={{ borderTop: '1px solid rgba(255,255,255,0.06)', padding: '12px 14px' }}>
                  <div style={{ fontSize: 11, fontWeight: 700, color: '#6B7280', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 6 }}>
                    Specs técnicas
                  </div>
                  <dl style={{ display: 'flex', flexDirection: 'column', gap: 6, fontSize: 12, margin: 0 }}>
                    {modelSpecs.par_min !== null && modelSpecs.par_max !== null && (
                      <InfoRow label="Par" value={`${modelSpecs.par_min}–${modelSpecs.par_max} ${modelSpecs.par_unit || 'Nm'}`} accent />
                    )}
                    {modelSpecs.vel_min !== null && modelSpecs.vel_max !== null && (
                      <InfoRow label="Velocidad" value={`${modelSpecs.vel_min}–${modelSpecs.vel_max} ${modelSpecs.vel_unit || 'rpm'}`} />
                    )}
                    {modelSpecs.peso !== null && (
                      <InfoRow label="Peso" value={`${modelSpecs.peso} ${modelSpecs.peso_unit || 'kg'}`} />
                    )}
                    {modelSpecs.interfaz && <InfoRow label="Interfaz" value={modelSpecs.interfaz} />}
                    {modelSpecs.precision && <InfoRow label="Precisión" value={modelSpecs.precision} success />}
                  </dl>
                </div>
              )}

              {/* Servicios previos */}
              <div style={{ borderTop: '1px solid rgba(255,255,255,0.06)', padding: '12px 14px' }}>
                <div style={{ fontSize: 11, fontWeight: 700, color: '#6B7280', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 8 }}>
                  Servicios previos ({histList.length})
                </div>
                {histList.length === 0 ? (
                  <div style={{ fontSize: 12, color: '#4B5563', fontStyle: 'italic' }}>Primer servicio registrado</div>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 6, maxHeight: 240, overflowY: 'auto' }}>
                    {histList.map((h) => {
                      const tipoColor = h.tipo.toLowerCase().includes('corr') ? '#F59E0B' : '#3B82F6'
                      const cpkColor = h.cpk !== null && h.cpk >= 1.33 ? '#10B981' : h.cpk !== null ? '#F59E0B' : '#6B7280'
                      return (
                        <a
                          key={h.id}
                          href={h.pdf_url || undefined}
                          target={h.pdf_url ? '_blank' : undefined}
                          rel="noreferrer"
                          style={{
                            display: 'block',
                            background: 'rgba(255,255,255,0.02)',
                            border: '1px solid rgba(255,255,255,0.06)',
                            borderRadius: 6,
                            padding: '6px 8px',
                            textDecoration: 'none',
                            cursor: h.pdf_url ? 'pointer' : 'default',
                          }}
                          onMouseOver={(e) => { if (h.pdf_url) e.currentTarget.style.background = 'rgba(249,115,22,0.08)' }}
                          onMouseOut={(e) => { if (h.pdf_url) e.currentTarget.style.background = 'rgba(255,255,255,0.02)' }}
                        >
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 6 }}>
                            <span style={{ fontFamily: 'ui-monospace, monospace', fontSize: 11, color: '#F0F2F5', fontWeight: 600 }}>
                              {h.fecha}
                            </span>
                            <span style={{ fontSize: 10, color: tipoColor, fontWeight: 700, textTransform: 'uppercase' }}>
                              {h.tipo.slice(0, 4)}
                            </span>
                          </div>
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 6, marginTop: 2 }}>
                            <span style={{ fontSize: 10, color: '#9CA3AF' }}>{h.tecnico || '—'}</span>
                            {h.cpk !== null && (
                              <span style={{ fontSize: 10, fontFamily: 'ui-monospace, monospace', color: cpkColor, fontWeight: 600 }}>
                                Cpk {h.cpk.toFixed(2)}
                              </span>
                            )}
                          </div>
                        </a>
                      )
                    })}
                  </div>
                )}
              </div>
            </div>
          ) : (
            <div style={{ padding: 14, background: '#111318', border: '1px solid rgba(255,255,255,0.06)', borderRadius: 12, color: '#6B7280', fontSize: 13 }}>
              Seleccioná un equipo en la sección 1 del diagnóstico
            </div>
          )}
        </aside>

        {/* Contenido derecho */}
        <div className="min-h-[400px]">
          {currentStep === 0 && (
            <StepDiagnostico
              data={data.diagnostico}
              onChange={(d) => setData(prev => ({ ...prev, diagnostico: d }))}
              readOnly={data.pause.is_paused}
              ticketId={ticketId}
            />
          )}
          {currentStep === 1 && (
            <StepCotizacion
              data={data.cotizacion}
              onChange={(d) => setData(prev => ({ ...prev, cotizacion: d }))}
              readOnly={data.pause.is_paused}
              modelCompat={data.diagnostico.model || assetData?.model || null}
            />
          )}
          {currentStep === 2 && (
            <StepReparacion
              data={data.reparacion}
              onChange={(d) => setData(prev => ({ ...prev, reparacion: d }))}
              readOnly={data.pause.is_paused}
            />
          )}
          {currentStep === 3 && (
            <StepTorque
              data={data.torque}
              onChange={(d) => setData(prev => ({ ...prev, torque: d }))}
              readOnly={data.pause.is_paused}
            />
          )}
          {currentStep === 4 && (
            <StepCierre
              data={data.cierre}
              onChange={(d) => setData(prev => ({ ...prev, cierre: d }))}
              readOnly={data.pause.is_paused}
              ticketId={ticketId}
              diagnostico={data.diagnostico}
              cotizacion={data.cotizacion}
              reparacion={data.reparacion}
              torque={data.torque}
            />
          )}
        </div>
      </div>

      {/* Media query responsive para el layout 2 columnas */}
      <style jsx>{`
        .sat-wf-layout {
          grid-template-columns: 1fr;
        }
        @media (min-width: 768px) {
          .sat-wf-layout {
            grid-template-columns: minmax(260px, 320px) 1fr;
          }
        }
      `}</style>

      {/* ── Bottom Navigation ── */}
      {!data.pause.is_paused && (
        <div className="flex items-center justify-between px-4 py-3 border-t border-[#2A3040] bg-[#0F1218]">
          <div>
            {currentStep > 0 && (
              <Button variant="secondary" onClick={handlePrev}>
                <ChevronLeft size={14} /> Anterior
              </Button>
            )}
          </div>
          <div className="flex items-center gap-3">
            <span className="text-xs text-[#6B7280]">
              Herramienta: <span className="text-[#FF6600] font-mono font-bold">{ticketNumber}</span>
            </span>
            {currentStep < 4 ? (
              <Button onClick={handleNext}>
                {STEP_COLORS[currentStep].name} ok → {STEP_COLORS[currentStep + 1]?.name || 'Fin'}
                <ChevronRight size={14} />
              </Button>
            ) : (
              <Button onClick={handleComplete} loading={saving}>
                <CheckCircle size={14} /> Completar hoja de mantenimiento
              </Button>
            )}
          </div>
        </div>
      )}

      {/* Pause Modal */}
      <Modal isOpen={showPauseModal} onClose={() => setShowPauseModal(false)} title="Pausar hoja de mantenimiento" size="md">
        <div className="space-y-4">
          <p className="text-sm text-[#9CA3AF]">Selecciona el motivo de la pausa:</p>
          <div className="space-y-2">
            {PAUSE_REASONS.map((reason) => (
              <button
                key={reason}
                onClick={() => setPauseReason(reason)}
                className={`w-full text-left px-4 py-3 rounded-lg border transition-all text-sm ${
                  pauseReason === reason
                    ? 'bg-amber-500/10 border-amber-500/30 text-amber-400'
                    : 'bg-[#0F1218] border-[#1E2330] text-[#D1D5DB] hover:border-[#2A3040]'
                }`}
              >
                {reason}
              </button>
            ))}
          </div>
          <div>
            <label className="block text-sm font-medium text-[#9CA3AF] mb-1.5">Nota adicional (opcional)</label>
            <textarea
              value={pauseFreeText}
              onChange={(e) => setPauseFreeText(e.target.value)}
              className="w-full h-20 rounded-lg bg-[#1E2330] border border-[#2A3040] px-3 py-2 text-sm text-[#F0F2F5] placeholder:text-[#4B5563] focus:outline-none focus:ring-2 focus:ring-amber-500/50 resize-none"
              placeholder="Detalle adicional..."
            />
          </div>
          <div className="flex justify-end gap-3 pt-2 border-t border-[#1E2330]">
            <Button variant="secondary" onClick={() => setShowPauseModal(false)}>Cancelar</Button>
            <Button variant="primary" onClick={handlePause}>
              <Pause size={14} /> Confirmar pausa
            </Button>
          </div>
        </div>
      </Modal>

      {/* Cancel / Descartar Modal */}
      <Modal isOpen={showCancelModal} onClose={() => setShowCancelModal(false)} title="🗑 Cancelar hoja de mantenimiento" size="md">
        <div className="space-y-4">
          <div className="p-3 rounded-lg" style={{ background: 'rgba(239, 68, 68, 0.08)', border: '1px solid rgba(239, 68, 68, 0.3)' }}>
            <p className="text-sm" style={{ color: '#F87171' }}>
              ⚠ Al cancelar, la hoja queda archivada con motivo y NO se puede editar más. Queda el registro en el log de actividad para auditoría.
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
            <Button variant="secondary" onClick={() => setShowCancelModal(false)}>Volver</Button>
            <Button variant="danger" onClick={handleCancel}>
              <Trash2 size={14} /> Confirmar cancelación
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  )
}

// =====================================================
// HELPER: InfoRow para sidebar
// =====================================================
function InfoRow({
  label, value, accent, mono, bold, highlight, success,
}: {
  label: string
  value: string | null | undefined
  accent?: boolean
  mono?: boolean
  bold?: boolean
  highlight?: boolean
  success?: boolean
}) {
  const color = accent ? '#F97316' : success ? '#10B981' : highlight ? '#3B82F6' : '#F0F2F5'
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'start', gap: 8 }}>
      <dt style={{ fontSize: 11, color: '#6B7280', textTransform: 'uppercase', letterSpacing: 0.4, fontWeight: 600, flexShrink: 0 }}>
        {label}
      </dt>
      <dd style={{
        fontSize: 13,
        color,
        fontWeight: bold ? 700 : 500,
        fontFamily: mono ? 'ui-monospace, monospace' : 'inherit',
        textAlign: 'right',
        wordBreak: 'break-word',
        margin: 0,
      }}>
        {value || '—'}
      </dd>
    </div>
  )
}
