'use client'

import { useState, type ReactNode } from 'react'
import { useRouter } from 'next/navigation'
import { GripVertical, Settings, Minimize2, Maximize2, X, ArrowUpRight } from 'lucide-react'
import { cn } from '@/lib/utils'

interface WidgetWrapperProps {
  title: string
  editing: boolean
  minimized?: boolean
  onRemove?: () => void
  onMinimize?: () => void
  children: ReactNode
  className?: string
  /** Si está, la card del dashboard navega a esta URL al click (fuera de modo edición) */
  href?: string
}

export function WidgetWrapper({
  title,
  editing,
  minimized = false,
  onRemove,
  onMinimize,
  children,
  className,
  href,
}: WidgetWrapperProps) {
  const router = useRouter()
  const [showSettings, setShowSettings] = useState(false)
  // Navegable solo si tiene href Y no estamos editando el layout (sino se confunde con drag)
  const isNavigable = !!href && !editing

  // Navegación programática (no usamos <Link> porque react-grid-layout
  // intercepta mousedown para iniciar drag y cancela el click del <a>).
  // onMouseUp dispara después del mousedown del rgl, así llega al onClick.
  const handleNavClick = (e: React.MouseEvent) => {
    if (!isNavigable) return
    const t = e.target as HTMLElement
    // Respeta clicks sobre botones/links/inputs internos
    if (t.closest('button, a, input, select, textarea, [role="button"]')) return
    // Si el usuario está arrastrando (rgl agrega .react-draggable-dragging), no navegar
    if (t.closest('.react-draggable-dragging')) return
    e.preventDefault()
    router.push(href!)
  }

  return (
    <div
      onClick={handleNavClick}
      className={cn(
        'h-full rounded-xl bg-[#141820] border border-[#1E2330] overflow-hidden flex flex-col group/widget',
        'transition-all duration-200',
        editing && 'hover:border-[#2A3040] hover:shadow-lg hover:shadow-black/20',
        isNavigable && 'hover:border-[#FF6600]/50 hover:shadow-lg hover:shadow-[#FF6600]/5 cursor-pointer',
        className
      )}
      role={isNavigable ? 'link' : undefined}
      tabIndex={isNavigable ? 0 : undefined}
      onKeyDown={isNavigable ? (e) => { if (e.key === 'Enter') router.push(href!) } : undefined}
    >
      {/* Header bar */}
      <div className={cn(
        'flex items-center gap-2 px-3 py-2 border-b border-[#1E2330] shrink-0',
        minimized ? 'border-b-0' : ''
      )}>
        {/* Drag handle - solo visible en modo edicion */}
        {editing && (
          <div className="drag-handle cursor-grab active:cursor-grabbing text-[#4B5563] hover:text-[#FF6600] transition-colors">
            <GripVertical size={16} />
          </div>
        )}

        <span className="text-sm font-medium text-[#9CA3AF] flex-1 truncate select-none flex items-center gap-1.5">
          {title}
          {isNavigable && (
            <ArrowUpRight
              size={12}
              className="text-[#4B5563] opacity-0 group-hover/widget:opacity-100 group-hover/widget:text-[#FF6600] transition-all"
              aria-hidden
            />
          )}
        </span>

        <div className={cn(
          'flex items-center gap-1',
          editing ? 'opacity-100' : 'opacity-0 group-hover:opacity-100 transition-opacity'
        )}>
          {editing && (
            <>
              <button
                onClick={(e) => {
                  e.stopPropagation()
                  setShowSettings(!showSettings)
                }}
                className="p-1 rounded hover:bg-[#1E2330] text-[#4B5563] hover:text-[#9CA3AF] transition-colors"
                title="Configuracion"
              >
                <Settings size={14} />
              </button>
              <button
                onClick={(e) => {
                  e.stopPropagation()
                  onMinimize?.()
                }}
                className="p-1 rounded hover:bg-[#1E2330] text-[#4B5563] hover:text-[#9CA3AF] transition-colors"
                title={minimized ? 'Expandir' : 'Minimizar'}
              >
                {minimized ? <Maximize2 size={14} /> : <Minimize2 size={14} />}
              </button>
              <button
                onClick={(e) => {
                  e.stopPropagation()
                  onRemove?.()
                }}
                className="p-1 rounded hover:bg-[#1E2330] text-[#4B5563] hover:text-red-400 transition-colors"
                title="Quitar widget"
              >
                <X size={14} />
              </button>
            </>
          )}
        </div>
      </div>

      {/* Content — la navegación se maneja con onClick en el wrapper raíz
          (router.push) porque react-grid-layout intercepta mousedown y
          cancela el click natural de un <a>. */}
      {!minimized && (
        <div className="flex-1 overflow-auto p-3">
          {children}
        </div>
      )}
    </div>
  )
}

// Loading skeleton para widgets
export function WidgetSkeleton() {
  return (
    <div className="h-full rounded-xl bg-[#141820] border border-[#1E2330] p-4 animate-pulse">
      <div className="h-3 w-24 bg-[#1E2330] rounded mb-4" />
      <div className="h-8 w-32 bg-[#1E2330] rounded mb-2" />
      <div className="h-3 w-20 bg-[#1E2330] rounded" />
    </div>
  )
}

// Error state para widgets
export function WidgetError({ message }: { message?: string }) {
  return (
    <div className="flex flex-col items-center justify-center h-full text-[#4B5563] py-6">
      <div className="w-10 h-10 rounded-full bg-red-500/10 flex items-center justify-center mb-2">
        <X size={18} className="text-red-400" />
      </div>
      <p className="text-xs text-center">{message || 'Error al cargar datos'}</p>
    </div>
  )
}
