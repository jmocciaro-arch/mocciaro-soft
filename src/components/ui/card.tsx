/**
 * Card — estilo StelOrder.
 *
 * - Fondo blanco
 * - Sombra suave (no border)
 * - Borde inferior visible para sub-headers
 * - Hover: sombra ligeramente más fuerte
 */

import { cn } from '@/lib/utils'

interface CardProps {
  children: React.ReactNode
  className?: string
  hover?: boolean
  onClick?: () => void
}

export function Card({ children, className, hover, onClick }: CardProps) {
  return (
    <div
      className={cn(
        'rounded-lg bg-white p-5 shadow-[0_1px_3px_rgba(0,0,0,0.06),0_1px_2px_rgba(0,0,0,0.04)]',
        hover && 'hover:shadow-[0_4px_8px_rgba(0,0,0,0.08),0_2px_4px_rgba(0,0,0,0.04)] transition-shadow duration-200 cursor-pointer',
        onClick && 'cursor-pointer',
        className
      )}
      onClick={onClick}
    >
      {children}
    </div>
  )
}

export function CardHeader({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <div className={cn('flex items-center justify-between mb-4', className)}>
      {children}
    </div>
  )
}

export function CardTitle({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <h3 className={cn('text-base font-bold text-[#1F2937]', className)}>
      {children}
    </h3>
  )
}

export function CardContent({ children, className }: { children: React.ReactNode; className?: string }) {
  return <div className={cn(className)}>{children}</div>
}
