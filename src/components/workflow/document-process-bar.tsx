'use client'

/**
 * DOCUMENT PROCESS BAR — REGLA FUNDAMENTAL DEL ERP
 * =================================================
 * Toda pantalla de documento (Cotización, Pedido, Albarán, Factura, OC, Lead,
 * Cobro, SAT, etc) DEBE tener esta barra sticky arriba con:
 *   1) Código del documento + badge de estado
 *   2) Alertas/avisos relevantes al paso actual
 *   3) Stepper visual con pasos del workflow (completed/current/pending/skipped)
 *   4) Acciones principales (Guardar / Cancelar / X)
 *
 * Estilo: StelOrder light (fondo blanco, sombra inferior, naranja para
 * el código y estado actual).
 */

import { ReactNode } from 'react'
import { CheckCircle2, AlertTriangle, X, Save, Play } from 'lucide-react'

export type StepStatus = 'completed' | 'current' | 'pending' | 'skipped' | 'blocked'

export interface ProcessStep {
  id: string
  label: string
  status: StepStatus
  optional?: boolean
  onClick?: () => void
  hint?: string
}

export interface ProcessAlert {
  type: 'info' | 'warning' | 'error' | 'success'
  message: string
  action?: { label: string; onClick: () => void }
}

export interface ProcessAction {
  label: string
  onClick: () => void
  variant?: 'primary' | 'secondary' | 'danger' | 'ghost'
  icon?: 'save' | 'x' | 'play' | 'check'
  disabled?: boolean
}

interface Props {
  code: string
  title?: string
  badge?: { label: string; variant?: 'default' | 'warning' | 'danger' | 'success' | 'info' }
  entity?: ReactNode
  alerts?: ProcessAlert[]
  steps: ProcessStep[]
  actions?: ProcessAction[]
  onClose?: () => void
  offsetTop?: number
}

export function DocumentProcessBar({
  code, title, badge, entity, alerts = [], steps, actions = [], onClose, offsetTop = 0,
}: Props) {
  return (
    <div
      className="sticky z-40 bg-white border-b border-[#E5E5E5] shadow-[0_1px_3px_rgba(0,0,0,0.04)]"
      style={{ top: offsetTop }}
    >
      {/* Línea superior: código + badge + entity + acciones */}
      <div className="flex items-start gap-3 px-4 py-2.5">
        <div className="flex items-center gap-2 min-w-0 flex-1">
          <span className="font-mono font-bold text-sm text-[#FF6600]">
            {code}
          </span>
          {badge && <BadgeChip {...badge} />}
          {title && <span className="text-sm font-semibold text-[#1F2937] truncate">— {title}</span>}
        </div>
        <div className="flex items-center gap-1.5 shrink-0">
          {actions.map((a, i) => (
            <ActionButton key={i} {...a} />
          ))}
          {onClose && (
            <button
              type="button"
              onClick={onClose}
              className="p-1.5 rounded hover:bg-[#F5F5F5] text-[#9CA3AF] hover:text-[#1F2937] transition-colors"
              title="Cerrar"
            >
              <X className="w-4 h-4" />
            </button>
          )}
        </div>
      </div>

      {/* Entity info */}
      {entity && (
        <div className="px-4 pb-2 text-xs text-[#6B7280]">{entity}</div>
      )}

      {/* Alerts */}
      {alerts.length > 0 && (
        <div className="px-4 pb-2 space-y-1">
          {alerts.map((alert, i) => (
            <AlertRow key={i} {...alert} />
          ))}
        </div>
      )}

      {/* Stepper */}
      <div className="px-4 pb-2.5">
        <div className="flex items-center gap-1 overflow-x-auto">
          {steps.map((step, i) => (
            <StepPill key={step.id} step={step} index={i + 1} isLast={i === steps.length - 1} />
          ))}
        </div>
      </div>
    </div>
  )
}

function BadgeChip({ label, variant = 'default' }: { label: string; variant?: string }) {
  const variants: Record<string, string> = {
    default: 'bg-[#F3F4F6] text-[#374151]',
    warning: 'bg-[#FFEDD5] text-[#9A3412]',
    danger:  'bg-[#FEE2E2] text-[#991B1B]',
    success: 'bg-[#D1FAE5] text-[#065F46]',
    info:    'bg-[#DBEAFE] text-[#1E40AF]',
  }
  return (
    <span className={`text-[11px] px-2 py-0.5 rounded-full font-semibold ${variants[variant] || variants.default}`}>
      {label}
    </span>
  )
}

function AlertRow({ type, message, action }: ProcessAlert) {
  const variants: Record<string, { cls: string; icon: string }> = {
    warning: { cls: 'bg-[#FFF7ED] text-[#9A3412] border-[#FED7AA]', icon: '⚠' },
    error:   { cls: 'bg-[#FEF2F2] text-[#991B1B] border-[#FECACA]', icon: '✗' },
    info:    { cls: 'bg-[#EFF6FF] text-[#1E40AF] border-[#BFDBFE]', icon: 'ℹ' },
    success: { cls: 'bg-[#ECFDF5] text-[#065F46] border-[#A7F3D0]', icon: '✓' },
  }
  const v = variants[type]
  return (
    <div className={`flex items-center gap-2 px-2.5 py-1.5 rounded-md text-xs border ${v.cls}`}>
      <span>{v.icon}</span>
      <span className="flex-1">{message}</span>
      {action && (
        <button
          type="button"
          onClick={action.onClick}
          className="underline font-semibold hover:opacity-80"
        >
          {action.label} →
        </button>
      )}
    </div>
  )
}

function StepPill({ step, index, isLast }: { step: ProcessStep; index: number; isLast: boolean }) {
  const variants: Record<StepStatus, string> = {
    completed: 'bg-[#D1FAE5] text-[#065F46] border-[#A7F3D0]',
    current:   'bg-[#FF6600] text-white border-[#FF6600] shadow-sm',
    pending:   'bg-white text-[#6B7280] border-[#E5E5E5]',
    skipped:   'bg-white text-[#9CA3AF] border-[#E5E5E5] opacity-60',
    blocked:   'bg-[#FEE2E2] text-[#991B1B] border-[#FECACA]',
  }
  const clickable = Boolean(step.onClick)

  return (
    <>
      <button
        type="button"
        data-testid={`workflow-step-${step.id}`}
        data-status={step.status}
        onClick={step.onClick}
        disabled={!clickable}
        title={step.hint}
        className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full transition-all shrink-0 text-[11px] border ${variants[step.status]}`}
        style={{
          fontWeight: step.status === 'current' ? 700 : 500,
          cursor: clickable ? 'pointer' : 'default',
        }}
      >
        <span
          className={`w-4 h-4 rounded-full flex items-center justify-center text-[9px] font-bold ${
            step.status === 'current' ? 'bg-white text-[#FF6600]' : 'border border-current'
          }`}
        >
          {step.status === 'completed' ? (
            <CheckCircle2 className="w-3 h-3" strokeWidth={3} />
          ) : step.status === 'blocked' ? (
            <AlertTriangle className="w-2.5 h-2.5" />
          ) : (
            <span>{index}</span>
          )}
        </span>
        <span style={{ textTransform: 'uppercase', letterSpacing: 0.3 }}>
          {step.label}
        </span>
        {step.optional && <span className="text-[9px] opacity-60">(opc)</span>}
      </button>
      {!isLast && (
        <span className="shrink-0 w-3 h-px bg-[#E5E5E5]" />
      )}
    </>
  )
}

function ActionButton({ label, onClick, variant = 'secondary', icon, disabled }: ProcessAction) {
  const icons: Record<string, ReactNode> = {
    save:  <Save className="w-3.5 h-3.5 mr-1" />,
    x:     <X className="w-3.5 h-3.5 mr-1" />,
    play:  <Play className="w-3.5 h-3.5 mr-1" />,
    check: <CheckCircle2 className="w-3.5 h-3.5 mr-1" />,
  }
  const variants: Record<string, string> = {
    primary:   'bg-[#FF6600] hover:bg-[#E55A00] text-white shadow-sm',
    secondary: 'bg-white border border-[#E5E5E5] text-[#1F2937] hover:bg-[#F8F8F8]',
    danger:    'bg-[#DC2626] hover:bg-[#B91C1C] text-white shadow-sm',
    ghost:     'bg-transparent text-[#374151] hover:bg-[#F5F5F5]',
  }
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={`inline-flex items-center px-3 py-1.5 rounded-md text-xs font-semibold transition-colors disabled:opacity-50 disabled:cursor-not-allowed ${variants[variant]}`}
    >
      {icon && icons[icon]}
      {label}
    </button>
  )
}
