'use client'

/**
 * Button — estilo StelOrder.
 *
 * Variantes:
 *  - primary:   naranja sólido, sombra leve, blanco
 *  - secondary: blanco con borde sutil, gris oscuro
 *  - ghost:     transparente, sin borde, hover bg gris muy claro
 *  - outline:   blanco con borde sutil (alias visual de secondary, mantenida por compat)
 *  - danger:    rojo sólido
 *
 * Estilo: rounded-md (6px) — más rectangular que el anterior rounded-lg.
 * Sombras: solo en primary, y solo cuando NO está deshabilitado.
 */

import { forwardRef, type ButtonHTMLAttributes } from 'react'
import { cn } from '@/lib/utils'

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'ghost' | 'danger' | 'outline'
  size?: 'sm' | 'md' | 'lg' | 'icon'
  loading?: boolean
}

const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant = 'primary', size = 'md', loading, disabled, children, ...props }, ref) => {
    const base =
      'inline-flex items-center justify-center gap-2 font-semibold rounded-md transition-colors duration-150 ' +
      'focus:outline-none focus-visible:ring-2 focus-visible:ring-[#FF6600]/40 focus-visible:ring-offset-1 ' +
      'disabled:opacity-50 disabled:cursor-not-allowed whitespace-nowrap'

    const variants = {
      primary:   'bg-[#FF6600] hover:bg-[#E55A00] active:bg-[#CC5200] text-white shadow-sm',
      secondary: 'bg-white hover:bg-[#F8F8F8] active:bg-[#F0F0F0] text-[#1F2937] border border-[#E5E5E5]',
      ghost:     'bg-transparent hover:bg-[#F5F5F5] text-[#374151]',
      outline:   'bg-white hover:bg-[#F8F8F8] text-[#1F2937] border border-[#E5E5E5]',
      danger:    'bg-[#DC2626] hover:bg-[#B91C1C] text-white shadow-sm',
    }

    const sizes = {
      sm:   'h-8 px-3 text-xs',
      md:   'h-9 px-3.5 text-[13px]',
      lg:   'h-10 px-5 text-sm',
      icon: 'h-9 w-9 p-0',
    }

    return (
      <button
        ref={ref}
        className={cn(base, variants[variant], sizes[size], className)}
        disabled={disabled || loading}
        {...props}
      >
        {loading && (
          <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24" fill="none">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
          </svg>
        )}
        {children}
      </button>
    )
  }
)

Button.displayName = 'Button'
export { Button }
export type { ButtonProps }
