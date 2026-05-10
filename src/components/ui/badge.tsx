import { cn } from '@/lib/utils'

interface BadgeProps {
  children: React.ReactNode
  variant?: 'default' | 'success' | 'warning' | 'danger' | 'info' | 'orange'
  size?: 'sm' | 'md'
  className?: string
}

/**
 * Badge — usa variables CSS semánticas (definidas en globals.css por tema)
 * para que los estados Pendiente/Cerrado/etc tengan contraste correcto en
 * los 4 temas (Oscuro, Claro, Brillante, Gris).
 */
const variants = {
  default: 'status-neutral',
  success: 'status-success',
  warning: 'status-warning',
  danger:  'status-danger',
  info:    'status-info',
  orange:  'bg-[#FF6600]/10 text-[#FF6600] border-[#FF6600]/30',
}

export function Badge({ children, variant = 'default', size = 'sm', className }: BadgeProps) {
  return (
    <span
      className={cn(
        'inline-flex items-center rounded-full border font-medium',
        size === 'sm' ? 'px-2 py-0.5 text-[10px]' : 'px-3 py-1 text-xs',
        variants[variant],
        className
      )}
    >
      {children}
    </span>
  )
}
