/**
 * Badge — estilo StelOrder.
 *
 * Píldora redondeada con colores pastel:
 *  - success: verde (Cobrada, Cerrado, Activo)
 *  - warning: amarillo (Pendiente)
 *  - danger:  rojo (Vencido, Cancelado)
 *  - info:    azul (En curso, Borrador)
 *  - orange:  naranja Mocciaro/StelOrder (destacado)
 *  - default: gris neutro
 */

import { cn } from '@/lib/utils'

interface BadgeProps {
  children: React.ReactNode
  variant?: 'default' | 'success' | 'warning' | 'danger' | 'info' | 'orange'
  size?: 'sm' | 'md'
  className?: string
}

const variants = {
  default: 'bg-[#F3F4F6] text-[#374151]',
  success: 'bg-[#D1FAE5] text-[#065F46]',
  warning: 'bg-[#FEF3C7] text-[#92400E]',
  danger:  'bg-[#FEE2E2] text-[#991B1B]',
  info:    'bg-[#DBEAFE] text-[#1E40AF]',
  orange:  'bg-[#FFEDD5] text-[#9A3412]',
}

export function Badge({ children, variant = 'default', size = 'sm', className }: BadgeProps) {
  return (
    <span
      className={cn(
        'inline-flex items-center rounded-full font-semibold whitespace-nowrap',
        size === 'sm' ? 'px-2 py-0.5 text-[10px]' : 'px-2.5 py-1 text-xs',
        variants[variant],
        className
      )}
    >
      {children}
    </span>
  )
}
