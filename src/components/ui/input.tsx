'use client'

/**
 * Input — estilo StelOrder.
 *
 * - Fondo blanco con borde gris claro #E5E5E5
 * - Focus: borde naranja #FF6600 + ring suave
 * - Label en gris oscuro #374151 (no en gris claro)
 * - Placeholder #9CA3AF
 */

import { forwardRef, type InputHTMLAttributes } from 'react'
import { cn } from '@/lib/utils'

interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  label?: string
  error?: string
  icon?: React.ReactNode
}

const Input = forwardRef<HTMLInputElement, InputProps>(
  ({ className, label, error, icon, id, ...props }, ref) => {
    const inputId = id || label?.toLowerCase().replace(/\s+/g, '-')

    return (
      <div className="w-full">
        {label && (
          <label htmlFor={inputId} className="block text-[13px] font-medium text-[#374151] mb-1.5">
            {label}
          </label>
        )}
        <div className="relative">
          {icon && (
            <div className="absolute left-3 top-1/2 -translate-y-1/2 text-[#9CA3AF]">
              {icon}
            </div>
          )}
          <input
            ref={ref}
            id={inputId}
            className={cn(
              'w-full h-9 rounded-md bg-white border border-[#E5E5E5] px-3 text-[13px] text-[#1F2937] placeholder:text-[#9CA3AF]',
              'focus:outline-none focus:ring-2 focus:ring-[#FF6600]/30 focus:border-[#FF6600]',
              'transition-colors duration-150',
              icon && 'pl-10',
              error && 'border-[#DC2626] focus:ring-[#DC2626]/30 focus:border-[#DC2626]',
              className
            )}
            {...props}
          />
        </div>
        {error && <p className="mt-1 text-xs text-[#DC2626]">{error}</p>}
      </div>
    )
  }
)

Input.displayName = 'Input'
export { Input }
