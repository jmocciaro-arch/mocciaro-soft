'use client'

/**
 * Chip individual del Next-Step Suggester.
 *
 * Variantes:
 *  - normal     → border 1px gris, hover
 *  - suggested  → border 2px naranja (#FF6600) + sufijo ★
 *  - disabled   → opacity 0.5, cursor not-allowed, tooltip
 *  - loading    → spinner inline
 *  - done       → bg verde + label "✓ [resultado]"
 *  - error      → border rojo, click vuelve a normal
 */
import { Check, Loader2, AlertCircle } from 'lucide-react'

export type ChipVariant = 'normal' | 'suggested' | 'disabled' | 'loading' | 'done' | 'error'

export interface NextStepChipProps {
  label: string
  icon: string // class Tabler "ti-eye" etc.
  shortcut: string | null
  variant: ChipVariant
  tooltip?: string | null
  doneLabel?: string
  errorMessage?: string
  onClick?: () => void
  onErrorReset?: () => void
}

export function NextStepChip({
  label,
  icon,
  shortcut,
  variant,
  tooltip,
  doneLabel,
  errorMessage,
  onClick,
  onErrorReset,
}: NextStepChipProps) {
  const isDisabled = variant === 'disabled' || variant === 'loading'

  const base =
    'relative inline-flex items-center gap-2 rounded-md text-sm font-medium transition-colors select-none'
  const sizing =
    variant === 'suggested' ? 'border-2 px-[13px] py-[7px]' : 'border px-[14px] py-[8px]'

  const variantCls: Record<ChipVariant, string> = {
    normal:
      'border-[#2A3040] bg-[#141820] text-[#E5E7EB] hover:bg-[#1A1F2A] cursor-pointer',
    suggested:
      'border-[#FF6600] bg-[#141820] text-[#E5E7EB] hover:bg-[#1A1F2A] cursor-pointer',
    disabled: 'border-[#2A3040] bg-[#141820] text-[#6B7280] opacity-50 cursor-not-allowed',
    loading:
      'border-[#2A3040] bg-[#141820] text-[#9CA3AF] cursor-wait',
    done: 'border-[#2D7A3E] bg-[#0F2A1A] text-[#86EFAC] cursor-default',
    error: 'border-[#E24B4A] bg-[#2A1414] text-[#FCA5A5] cursor-pointer',
  }

  const handleClick = () => {
    if (variant === 'error' && onErrorReset) {
      onErrorReset()
      return
    }
    if (!isDisabled && onClick) onClick()
  }

  return (
    <button
      type="button"
      title={tooltip ?? errorMessage ?? undefined}
      disabled={isDisabled}
      onClick={handleClick}
      className={`${base} ${sizing} ${variantCls[variant]}`}
    >
      {/* Shortcut badge */}
      {shortcut && variant !== 'done' && variant !== 'error' && (
        <span className="absolute -top-[6px] -left-[6px] inline-flex h-[18px] w-[18px] items-center justify-center rounded-full bg-[#0B0D12] text-[10px] font-bold text-[#E5E7EB] border border-[#2A3040]">
          {shortcut}
        </span>
      )}

      {/* Icono */}
      {variant === 'loading' ? (
        <Loader2 size={16} className="animate-spin" />
      ) : variant === 'done' ? (
        <Check size={16} />
      ) : variant === 'error' ? (
        <AlertCircle size={16} />
      ) : (
        <i className={`ti ${icon} text-[16px] leading-none`} aria-hidden />
      )}

      {/* Label */}
      <span>
        {variant === 'done' ? `✓ ${doneLabel ?? label}` : label}
        {variant === 'suggested' && (
          <span className="ml-1 text-[#FF6600]" aria-label="sugerida">
            ★
          </span>
        )}
      </span>
    </button>
  )
}
