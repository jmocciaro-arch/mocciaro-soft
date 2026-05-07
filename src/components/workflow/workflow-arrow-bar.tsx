'use client'

import { useState, useEffect, useRef } from 'react'
import { createPortal } from 'react-dom'
import { cn } from '@/lib/utils'

export interface WorkflowStep {
  key: string
  label: string
  icon: string
  status: 'completed' | 'current' | 'partial' | 'blocked' | 'pending'
  documentRef?: string
  documentId?: string
  date?: string
  tooltip?: string
}

interface WorkflowArrowBarProps {
  steps: WorkflowStep[]
  onStepClick?: (step: WorkflowStep) => void
}

const statusConfig = {
  completed: { bg: '#00C853', bgLight: 'rgba(0,200,83,0.15)', text: '#00C853', indicator: '✓', border: '#00C853' },
  current:   { bg: '#4285F4', bgLight: 'rgba(66,133,244,0.15)', text: '#4285F4', indicator: '●', border: '#4285F4' },
  partial:   { bg: '#FFB300', bgLight: 'rgba(255,179,0,0.15)', text: '#FFB300', indicator: '◐', border: '#FFB300' },
  blocked:   { bg: '#FF3D00', bgLight: 'rgba(255,61,0,0.15)', text: '#FF3D00', indicator: '⚠', border: '#FF3D00' },
  pending:   { bg: '#2A3040', bgLight: 'rgba(42,48,64,0.4)',  text: '#6B7280', indicator: '○', border: '#2A3040' },
}

interface HoverState {
  index: number
  top: number  // viewport-relative coordinate of the step bottom edge
  left: number // viewport-relative center of the step
}

export function WorkflowArrowBar({ steps, onStepClick }: WorkflowArrowBarProps) {
  const [hovered, setHovered] = useState<HoverState | null>(null)
  const [mounted, setMounted] = useState(false)

  // Portal sólo en cliente (evita SSR mismatch).
  useEffect(() => { setMounted(true) }, [])

  // Si la ventana se redimensiona o el usuario hace scroll, soltamos el hover
  // para no quedarnos con coordenadas obsoletas.
  useEffect(() => {
    if (!hovered) return
    const reset = () => setHovered(null)
    window.addEventListener('scroll', reset, true)
    window.addEventListener('resize', reset)
    return () => {
      window.removeEventListener('scroll', reset, true)
      window.removeEventListener('resize', reset)
    }
  }, [hovered])

  const handleMouseEnter = (index: number) => (e: React.MouseEvent<HTMLDivElement>) => {
    const rect = e.currentTarget.getBoundingClientRect()
    setHovered({
      index,
      top: rect.bottom,
      left: rect.left + rect.width / 2,
    })
  }

  const activeStep = hovered ? steps[hovered.index] : null
  const activeConfig = activeStep ? statusConfig[activeStep.status] : null

  return (
    <div className="w-full overflow-x-auto pb-2">
      <div className="flex items-center gap-0 min-w-max px-2 py-3">
        {steps.map((step, index) => {
          const config = statusConfig[step.status]
          const isHovered = hovered?.index === index
          const isLast = index === steps.length - 1

          return (
            <div key={step.key} className="flex items-center">
              {/* Arrow step */}
              <div
                className="relative cursor-pointer"
                onMouseEnter={handleMouseEnter(index)}
                onMouseLeave={() => setHovered(null)}
                onClick={() => onStepClick?.(step)}
              >
                {/* Arrow shape using clip-path */}
                <div
                  className={cn(
                    'relative flex items-center gap-2 px-5 py-3 transition-all duration-200',
                    isHovered && 'scale-[1.03]'
                  )}
                  style={{
                    background: isHovered ? config.bg : config.bgLight,
                    clipPath: index === 0
                      ? 'polygon(0 0, calc(100% - 14px) 0, 100% 50%, calc(100% - 14px) 100%, 0 100%)'
                      : 'polygon(14px 0, calc(100% - 14px) 0, 100% 50%, calc(100% - 14px) 100%, 0 100%, 14px 50%)',
                    minWidth: '140px',
                    borderTop: `2px solid ${config.border}`,
                    borderBottom: `2px solid ${config.border}`,
                  }}
                >
                  {/* Icon + indicator */}
                  <div className="flex items-center gap-2 pl-1">
                    <span className="text-lg">{step.icon}</span>
                    <span
                      className={cn(
                        'text-xs font-bold',
                        step.status === 'current' && 'animate-pulse'
                      )}
                      style={{ color: isHovered ? '#fff' : config.text }}
                    >
                      {config.indicator}
                    </span>
                  </div>

                  {/* Label */}
                  <div className="flex flex-col min-w-0">
                    <span
                      className="text-xs font-semibold truncate"
                      style={{ color: isHovered ? '#fff' : config.text }}
                    >
                      {step.label}
                    </span>
                    {step.documentRef && (
                      <span
                        className="text-[10px] truncate opacity-70"
                        style={{ color: isHovered ? '#fff' : config.text }}
                      >
                        {step.documentRef}
                      </span>
                    )}
                  </div>
                </div>
              </div>

              {/* Connector line */}
              {!isLast && (
                <div className="w-2 h-[2px] bg-[#2A3040] shrink-0" />
              )}
            </div>
          )
        })}
      </div>

      {/* Tooltip renderizado en portal con position:fixed para escapar el
          overflow-x-auto del contenedor (clippeaba el tooltip antes). */}
      {mounted && hovered && activeStep && activeConfig && (activeStep.tooltip || activeStep.date) &&
        createPortal(
          <div
            role="tooltip"
            className="pointer-events-none animate-fade-in"
            style={{
              position: 'fixed',
              top: hovered.top + 8,
              left: hovered.left,
              transform: 'translateX(-50%)',
              zIndex: 9999,
            }}
          >
            <div className="bg-[#1C2230] border border-[#2A3040] rounded-lg px-3 py-2 shadow-xl min-w-[180px] max-w-[280px]">
              {activeStep.tooltip && (
                <p className="text-xs text-[#F0F2F5]">{activeStep.tooltip}</p>
              )}
              {activeStep.documentRef && (
                <p className="text-[10px] text-[#6B7280] mt-1">
                  Ref: {activeStep.documentRef}
                </p>
              )}
              {activeStep.date && (
                <p className="text-[10px] text-[#6B7280]">
                  Fecha: {activeStep.date}
                </p>
              )}
              <p className="text-[10px] mt-1 font-medium" style={{ color: activeConfig.text }}>
                {activeStep.status === 'completed' && 'Completado'}
                {activeStep.status === 'current' && 'En proceso'}
                {activeStep.status === 'partial' && 'Parcial'}
                {activeStep.status === 'blocked' && 'Bloqueado'}
                {activeStep.status === 'pending' && 'Pendiente'}
              </p>
            </div>
          </div>,
          document.body
        )}
    </div>
  )
}
