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
 * Esta barra se mantiene FIJA al hacer scroll.
 */

import { ReactNode } from 'react'
import { CheckCircle2, AlertTriangle, X, Save, Play } from 'lucide-react'

export type StepStatus = 'completed' | 'current' | 'pending' | 'skipped' | 'blocked'

export interface ProcessStep {
  id: string
  label: string
  status: StepStatus
  optional?: boolean
  onClick?: () => void   // para navegación entre pasos si aplica
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
  code: string                    // Ej "COTI-TT-0004"
  title?: string                   // opcional (si se quiere ver junto al código)
  badge?: { label: string; variant?: 'default' | 'warning' | 'danger' | 'success' | 'info' }
  entity?: ReactNode               // info contextual (cliente, equipo, etc)
  alerts?: ProcessAlert[]
  steps: ProcessStep[]
  actions?: ProcessAction[]
  onClose?: () => void
  offsetTop?: number               // distancia al top (para layouts con topbar propio)
}

export function DocumentProcessBar({
  code, title, badge, entity, alerts = [], steps, actions = [], onClose, offsetTop = 0,
}: Props) {
  return (
    <div
      className="sticky z-40 border-b backdrop-blur"
      style={{
        top: offsetTop,
        background: 'rgba(15, 18, 24, 0.95)',
        borderColor: '#2A3040',
      }}
    >
      {/* Línea superior: código + badge + entity + acciones */}
      <div className="flex items-start gap-3 px-4 py-2.5">
        <div className="flex items-center gap-2 min-w-0 flex-1">
          <span className="font-mono font-bold text-sm" style={{ color: 'var(--sat-or, #f97316)' }}>
            {code}
          </span>
          {badge && <BadgeChip {...badge} />}
          {title && <span className="text-sm font-semibold truncate">— {title}</span>}
        </div>
        <div className="flex items-center gap-1.5 shrink-0">
          {actions.map((a, i) => (
            <ActionButton key={i} {...a} />
          ))}
          {onClose && (
            <button
              type="button"
              onClick={onClose}
              className="p-1.5 rounded hover:bg-white/10"
              title="Cerrar"
            >
              <X className="w-4 h-4 opacity-70" />
            </button>
          )}
        </div>
      </div>

      {/* Entity info (cliente, equipo, empresa, etc) */}
      {entity && (
        <div className="px-4 pb-2 text-xs opacity-80">{entity}</div>
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
            <StepPill key={step.id} step={step} index={i + 1} total={steps.length} isLast={i === steps.length - 1} />
          ))}
        </div>
      </div>
    </div>
  )
}

function BadgeChip({ label, variant = 'default' }: { label: string; variant?: string }) {
  const colors: Record<string, { bg: string; color: string; border: string }> = {
    default: { bg: 'rgba(107,114,128,0.2)', color: '#9CA3AF', border: 'rgba(107,114,128,0.4)' },
    warning: { bg: 'rgba(249,115,22,0.15)', color: '#f97316', border: 'rgba(249,115,22,0.4)' },
    danger: { bg: 'rgba(239,68,68,0.15)', color: '#ef4444', border: 'rgba(239,68,68,0.4)' },
    success: { bg: 'rgba(16,185,129,0.15)', color: '#10b981', border: 'rgba(16,185,129,0.4)' },
    info: { bg: 'rgba(59,130,246,0.15)', color: '#3b82f6', border: 'rgba(59,130,246,0.4)' },
  }
  const c = colors[variant] || colors.default
  return (
    <span
      className="text-[11px] px-2 py-0.5 rounded-full font-semibold"
      style={{ background: c.bg, color: c.color, border: `1px solid ${c.border}` }}
    >
      {label}
    </span>
  )
}

function AlertRow({ type, message, action }: ProcessAlert) {
  const colors: Record<string, { bg: string; color: string; border: string; icon: string }> = {
    warning: { bg: 'rgba(249,115,22,0.08)', color: '#f97316', border: 'rgba(249,115,22,0.3)', icon: '⚠' },
    error: { bg: 'rgba(239,68,68,0.08)', color: '#ef4444', border: 'rgba(239,68,68,0.3)', icon: '✗' },
    info: { bg: 'rgba(59,130,246,0.08)', color: '#3b82f6', border: 'rgba(59,130,246,0.3)', icon: 'ℹ' },
    success: { bg: 'rgba(16,185,129,0.08)', color: '#10b981', border: 'rgba(16,185,129,0.3)', icon: '✓' },
  }
  const c = colors[type]
  return (
    <div
      className="flex items-center gap-2 px-2.5 py-1.5 rounded-md text-xs"
      style={{ background: c.bg, color: c.color, border: `1px solid ${c.border}` }}
    >
      <span>{c.icon}</span>
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

function StepPill({ step, index, total, isLast }: { step: ProcessStep; index: number; total: number; isLast: boolean }) {
  const colors: Record<StepStatus, { bg: string; color: string; border: string }> = {
    completed: { bg: 'rgba(16,185,129,0.15)', color: '#10b981', border: 'rgba(16,185,129,0.4)' },
    current: { bg: 'rgba(249,115,22,0.2)', color: '#f97316', border: '#f97316' },
    pending: { bg: 'transparent', color: '#6B7280', border: 'rgba(107,114,128,0.3)' },
    skipped: { bg: 'transparent', color: '#4B5563', border: 'rgba(75,85,99,0.3)' },
    blocked: { bg: 'rgba(239,68,68,0.1)', color: '#ef4444', border: 'rgba(239,68,68,0.4)' },
  }
  const c = colors[step.status]
  const clickable = Boolean(step.onClick)

  return (
    <>
      <button
        type="button"
        onClick={step.onClick}
        disabled={!clickable}
        title={step.hint}
        className="flex items-center gap-1.5 px-2.5 py-1 rounded-full transition-all shrink-0"
        style={{
          background: c.bg,
          color: c.color,
          border: `1px solid ${c.border}`,
          fontWeight: step.status === 'current' ? 700 : 500,
          fontSize: 11,
          cursor: clickable ? 'pointer' : 'default',
          opacity: step.status === 'skipped' ? 0.5 : 1,
        }}
      >
        <span
          className="w-4 h-4 rounded-full flex items-center justify-center text-[9px] font-bold"
          style={{ background: step.status === 'current' ? '#f97316' : 'transparent', border: `1px solid ${c.color}` }}
        >
          {step.status === 'completed' ? (
            <CheckCircle2 className="w-3 h-3" style={{ color: c.color, strokeWidth: 3 }} />
          ) : step.status === 'blocked' ? (
            <AlertTriangle className="w-2.5 h-2.5" style={{ color: c.color }} />
          ) : (
            <span style={{ color: step.status === 'current' ? 'white' : c.color }}>{index}</span>
          )}
        </span>
        <span style={{ textTransform: 'uppercase', letterSpacing: 0.3 }}>
          {step.label}
        </span>
        {step.optional && <span className="text-[9px] opacity-60">(opc)</span>}
      </button>
      {!isLast && (
        <span className="opacity-30 shrink-0" style={{ width: 12, height: 1, background: '#6B7280' }} />
      )}
    </>
  )
}

function ActionButton({ label, onClick, variant = 'secondary', icon, disabled }: ProcessAction) {
  const icons: Record<string, ReactNode> = {
    save: <Save className="w-3.5 h-3.5 mr-1" />,
    x: <X className="w-3.5 h-3.5 mr-1" />,
    play: <Play className="w-3.5 h-3.5 mr-1" />,
    check: <CheckCircle2 className="w-3.5 h-3.5 mr-1" />,
  }
  const variants: Record<string, string> = {
    primary: '#f97316',
    secondary: '#2A3040',
    danger: '#ef4444',
    ghost: 'transparent',
  }
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="inline-flex items-center px-3 py-1.5 rounded-md text-xs font-semibold transition-opacity hover:opacity-80"
      style={{
        background: variant === 'primary' ? variants.primary : variants[variant],
        color: variant === 'primary' ? '#0A0C0F' : 'inherit',
        border: variant === 'ghost' ? '1px solid #2A3040' : 'none',
        opacity: disabled ? 0.5 : 1,
      }}
    >
      {icon && icons[icon]}
      {label}
    </button>
  )
}
