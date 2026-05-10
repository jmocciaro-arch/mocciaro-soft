'use client'

import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { ArrowRight, AlertTriangle, CheckCircle2, Sparkles } from 'lucide-react'
import { getNextStep, type DocKind, type NextStepAction } from '@/lib/next-step'

type Doc = Record<string, unknown>

interface NextStepPanelProps {
  doc: Doc
  kind: DocKind
  onAction: (actionKey: string) => void
  /** Variante compacta (para sidebars) */
  compact?: boolean
  className?: string
}

const TONE_STYLES = {
  primary: {
    button: 'bg-[#FF6600] hover:bg-[#FF7711] text-white shadow-lg shadow-orange-500/30',
    panel: 'border-[#FF6600]/30 bg-gradient-to-br from-[#FF6600]/10 to-transparent',
    icon: 'text-[#FF6600]',
    label: 'text-[#FF6600]',
  },
  success: {
    button: 'bg-emerald-600 hover:bg-emerald-500 text-white shadow-lg shadow-emerald-500/30',
    panel: 'border-emerald-500/30 bg-gradient-to-br from-emerald-500/10 to-transparent',
    icon: 'text-emerald-400',
    label: 'text-emerald-400',
  },
  warning: {
    button: 'bg-amber-500 hover:bg-amber-400 text-black shadow-lg shadow-amber-500/30',
    panel: 'border-amber-500/30 bg-gradient-to-br from-amber-500/10 to-transparent',
    icon: 'text-amber-400',
    label: 'text-amber-400',
  },
  danger: {
    button: 'bg-red-600 hover:bg-red-500 text-white shadow-lg shadow-red-500/30',
    panel: 'border-red-500/30 bg-gradient-to-br from-red-500/10 to-transparent',
    icon: 'text-red-400',
    label: 'text-red-400',
  },
  neutral: {
    button: 'bg-[#1E2330] hover:bg-[#2A3040] text-[#F0F2F5] border border-[#2A3040]',
    panel: 'border-[#2A3040] bg-[#141820]',
    icon: 'text-[#9CA3AF]',
    label: 'text-[#9CA3AF]',
  },
} as const

export function NextStepPanel({ doc, kind, onAction, compact = false, className }: NextStepPanelProps) {
  const result = getNextStep(doc, kind)
  const tone = result.primary?.tone ?? 'neutral'
  const styles = TONE_STYLES[tone]

  // Estado "completado" — panel verde de cierre
  if (result.done && !result.primary) {
    return (
      <div className={cn(
        'rounded-xl border p-4 flex items-center gap-3',
        'border-blue-500/30 bg-gradient-to-br from-blue-500/10 to-transparent',
        className
      )}>
        <CheckCircle2 className="text-blue-400 shrink-0" size={28} />
        <div className="flex-1">
          <p className="text-xs font-semibold text-blue-400 uppercase tracking-wide">Proceso cerrado</p>
          <p className="text-sm text-[#F0F2F5] mt-0.5">{result.currentLabel}</p>
        </div>
        {result.secondary.map((sec) => (
          <Button key={sec.key} variant="outline" size="sm" onClick={() => onAction(sec.key)}>
            <sec.icon size={14} /> {sec.label}
          </Button>
        ))}
      </div>
    )
  }

  if (!result.primary) {
    return (
      <div className={cn('rounded-xl border border-[#2A3040] bg-[#141820] p-4', className)}>
        <p className="text-xs text-[#6B7280] uppercase tracking-wide">Estado actual</p>
        <p className="text-sm text-[#F0F2F5] mt-1">{result.currentLabel}</p>
      </div>
    )
  }

  const { primary } = result
  const PrimaryIcon = primary.icon

  return (
    <div className={cn(
      'rounded-xl border p-4 print:hidden',
      styles.panel,
      className
    )}>
      {/* Header */}
      <div className="flex items-center gap-2 mb-3">
        <Sparkles className={cn('shrink-0', styles.icon)} size={14} />
        <span className={cn('text-[10px] font-bold uppercase tracking-widest', styles.label)}>
          Siguiente paso sugerido
        </span>
        <span className="ml-auto text-[10px] text-[#6B7280] font-medium">
          {result.currentLabel}
        </span>
      </div>

      {/* Layout principal */}
      <div className={cn('flex gap-4', compact ? 'flex-col' : 'flex-col md:flex-row md:items-center')}>
        {/* Texto */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <PrimaryIcon size={18} className={styles.icon} />
            <h3 className="text-base font-semibold text-[#F0F2F5]">{primary.label}</h3>
          </div>
          <p className="text-xs text-[#9CA3AF] leading-relaxed">
            {primary.hint}
          </p>

          {/* Bloqueos */}
          {result.blockers.length > 0 && (
            <div className="mt-2 flex items-start gap-1.5 text-[11px] text-amber-300/90">
              <AlertTriangle size={12} className="shrink-0 mt-0.5" />
              <span>{result.blockers.join(' · ')}</span>
            </div>
          )}
        </div>

        {/* Botón gigante */}
        <button
          onClick={() => onAction(primary.key)}
          disabled={primary.blocked}
          className={cn(
            'group relative flex items-center justify-center gap-2 px-6 py-3 rounded-lg font-semibold text-sm transition-all',
            'disabled:opacity-50 disabled:cursor-not-allowed',
            'whitespace-nowrap',
            styles.button,
          )}
          title={primary.blocked ? primary.blockedReason : undefined}
        >
          <PrimaryIcon size={16} />
          <span>{primary.label}</span>
          <ArrowRight size={16} className="transition-transform group-hover:translate-x-0.5" />
        </button>
      </div>

      {/* Acciones secundarias */}
      {result.secondary.length > 0 && (
        <div className="mt-3 pt-3 border-t border-white/5 flex flex-wrap gap-1.5">
          <span className="text-[10px] font-medium text-[#6B7280] uppercase tracking-wide self-center mr-1">
            o también:
          </span>
          {result.secondary.map((sec) => (
            <SecondaryButton key={sec.key} action={sec} onClick={() => onAction(sec.key)} />
          ))}
        </div>
      )}
    </div>
  )
}

function SecondaryButton({ action, onClick }: { action: NextStepAction; onClick: () => void }) {
  const Icon = action.icon
  return (
    <button
      onClick={onClick}
      className="flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-medium text-[#9CA3AF] hover:text-[#F0F2F5] hover:bg-white/5 transition-colors"
      title={action.hint}
    >
      <Icon size={12} />
      {action.label}
    </button>
  )
}
