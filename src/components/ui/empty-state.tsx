import type { ReactNode } from 'react'
import { cn } from '@/lib/utils'

interface EmptyStateProps {
  icon?: ReactNode
  title: string
  description?: string
  action?: ReactNode
  className?: string
}

/**
 * EmptyState — pantalla amigable cuando una lista está vacía.
 *
 * Lo contrario a "tabla en blanco que parece bugueada". Da contexto +
 * invita a crear el primer recurso.
 *
 * Ejemplo:
 *   <EmptyState
 *     icon={<Users size={48} />}
 *     title="No tenés clientes todavía"
 *     description="Creá tu primer cliente para empezar a cotizar."
 *     action={<Button onClick={openCreate}>+ Nuevo cliente</Button>}
 *   />
 */
export function EmptyState({ icon, title, description, action, className }: EmptyStateProps) {
  return (
    <div
      className={cn(
        'flex flex-col items-center justify-center text-center py-12 px-6 rounded-lg border border-dashed border-[#2A3040] bg-[#0F1218]/40',
        className
      )}
    >
      {icon && (
        <div className="text-[#3A4050] mb-4">
          {icon}
        </div>
      )}
      <h3 className="text-base font-semibold text-[#F0F2F5] mb-1">{title}</h3>
      {description && (
        <p className="text-sm text-[#9CA3AF] max-w-md mb-6">{description}</p>
      )}
      {action && <div>{action}</div>}
    </div>
  )
}
