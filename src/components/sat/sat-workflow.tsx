'use client'

import { useState, useCallback, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Modal } from '@/components/ui/modal'
import { useToast } from '@/components/ui/toast'
import {
  ChevronLeft, ChevronRight, Pause, Play, Save, Loader2,
  CheckCircle, X, AlertTriangle
} from 'lucide-react'
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
  const [pauseFreeText, setPauseFreeText] = useState('')

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
    addToast({ type: 'info', title: 'Workflow pausado', message: pauseReason || pauseFreeText })
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

    addToast({ type: 'success', title: 'Workflow reanudado' })
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

    // Log activity
    await sb.from('tt_activity_log').insert({
      entity_type: 'sat_ticket',
      entity_id: ticketId,
      action: 'workflow_completed',
      description: `Workflow SAT completado: ${data.cierre.final_status} — ${data.torque.result || 'sin torque'}`,
    })

    setSaving(false)
    addToast({ type: 'success', title: 'Workflow completado', message: `Ticket ${ticketNumber} resuelto` })
    onComplete?.()
  }

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center py-20">
        <Loader2 size={32} className="animate-spin text-[#FF6600]" />
        <p className="text-sm text-[#6B7280] mt-3">Cargando workflow...</p>
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
          <Button variant="ghost" size="sm" onClick={onClose}>
            <X size={14} />
          </Button>
        </div>
      </div>

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

      {/* Step Content */}
      <div className="min-h-[400px]">
        {currentStep === 0 && (
          <StepDiagnostico
            data={data.diagnostico}
            onChange={(d) => setData(prev => ({ ...prev, diagnostico: d }))}
            readOnly={data.pause.is_paused}
          />
        )}
        {currentStep === 1 && (
          <StepCotizacion
            data={data.cotizacion}
            onChange={(d) => setData(prev => ({ ...prev, cotizacion: d }))}
            readOnly={data.pause.is_paused}
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
            diagnostico={data.diagnostico}
            cotizacion={data.cotizacion}
            reparacion={data.reparacion}
            torque={data.torque}
          />
        )}
      </div>

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
                <CheckCircle size={14} /> Completar workflow
              </Button>
            )}
          </div>
        </div>
      )}

      {/* Pause Modal */}
      <Modal isOpen={showPauseModal} onClose={() => setShowPauseModal(false)} title="Pausar workflow" size="md">
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
    </div>
  )
}
