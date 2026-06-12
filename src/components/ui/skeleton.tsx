import { cn } from '@/lib/utils'

/**
 * Skeleton base — placeholder animado mientras carga contenido.
 * Usar en lugar de spinners para una UX más fluida (la pantalla no parpadea).
 *
 * Ejemplo:
 *   <Skeleton className="h-4 w-32" />
 */
export function Skeleton({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn(
        'animate-pulse rounded-md bg-border',
        className
      )}
      {...props}
    />
  )
}

/**
 * Skeleton para filas de tabla — N filas con la misma estructura visual.
 */
export function SkeletonTableRows({ rows = 8, cols = 5 }: { rows?: number; cols?: number }) {
  return (
    <div className="w-full space-y-2">
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="flex gap-4 px-4 py-3 border-b border-border">
          {Array.from({ length: cols }).map((_, j) => (
            <Skeleton
              key={j}
              className={cn(
                'h-4',
                j === 0 ? 'w-32' : j === cols - 1 ? 'w-20 ml-auto' : 'flex-1'
              )}
            />
          ))}
        </div>
      ))}
    </div>
  )
}

/**
 * Skeleton para grid de tarjetas (clientes, productos).
 */
export function SkeletonCardGrid({ cards = 6 }: { cards?: number }) {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
      {Array.from({ length: cards }).map((_, i) => (
        <div
          key={i}
          className="p-4 rounded-lg border border-border bg-card space-y-3"
        >
          <Skeleton className="h-5 w-3/4" />
          <Skeleton className="h-3 w-1/2" />
          <div className="flex gap-2 pt-2">
            <Skeleton className="h-6 w-16 rounded-full" />
            <Skeleton className="h-6 w-20 rounded-full" />
          </div>
        </div>
      ))}
    </div>
  )
}

/**
 * Skeleton para una página típica con KPIs + tabla.
 */
export function SkeletonPage() {
  return (
    <div className="space-y-6">
      {/* KPIs row */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="p-4 rounded-lg border border-border bg-card">
            <Skeleton className="h-3 w-20 mb-2" />
            <Skeleton className="h-8 w-24" />
          </div>
        ))}
      </div>
      {/* Toolbar */}
      <div className="flex gap-3">
        <Skeleton className="h-10 flex-1 max-w-md" />
        <Skeleton className="h-10 w-32" />
      </div>
      {/* Table rows */}
      <SkeletonTableRows />
    </div>
  )
}
