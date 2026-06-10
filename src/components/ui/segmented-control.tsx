'use client'

import { cn } from '@/lib/utils'

export interface SegmentedOption<T extends string> {
  value: T
  label: string
}

interface SegmentedControlProps<T extends string> {
  options: SegmentedOption<T>[]
  value: T
  onChange: (value: T) => void
  ariaLabel: string
  className?: string
}

/**
 * Control segmentado accesible (aria-pressed + focus visible).
 * Texto oscuro sobre el acento para mantener contraste AA en ambos temas.
 */
export function SegmentedControl<T extends string>({
  options, value, onChange, ariaLabel, className,
}: SegmentedControlProps<T>) {
  return (
    <div
      role="group"
      aria-label={ariaLabel}
      className={cn('inline-flex rounded-lg border border-[#2A3040] overflow-hidden', className)}
    >
      {options.map(option => {
        const selected = option.value === value
        return (
          <button
            key={option.value}
            type="button"
            aria-pressed={selected}
            onClick={() => onChange(option.value)}
            className={cn(
              'px-3 py-1.5 text-xs font-semibold border-r border-[#1E2330] last:border-r-0 transition-colors',
              'focus-visible:outline focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-[#FF6600]',
              selected
                ? 'bg-[#FF6600] text-black font-bold'
                : 'bg-[#141820] text-[#9CA3AF] hover:bg-[#1E2330] hover:text-[#F0F2F5]',
            )}
          >
            {option.label}
          </button>
        )
      })}
    </div>
  )
}
