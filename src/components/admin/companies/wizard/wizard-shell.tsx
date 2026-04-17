'use client'

import { useState, type ReactNode } from 'react'
import { Button } from '@/components/ui/button'

export type WizardStep = {
  id: string
  label: string
  render: () => ReactNode
  /** Si devuelve false, no deja avanzar */
  canAdvance?: () => boolean
  /** Si está bloqueado hasta que la empresa se cree (pasos 2-6) */
  requiresCompanyId?: boolean
}

type Props = {
  steps: WizardStep[]
  companyId: string | null
  onCancel?: () => void
  onComplete?: () => void
}

export function WizardShell({ steps, companyId, onCancel, onComplete }: Props) {
  const [idx, setIdx] = useState(0)
  const step = steps[idx]
  const isLast = idx === steps.length - 1
  const blocked = step.requiresCompanyId && !companyId

  const goNext = () => {
    if (step.canAdvance && !step.canAdvance()) return
    if (isLast) { onComplete?.(); return }
    setIdx((i) => Math.min(i + 1, steps.length - 1))
  }

  return (
    <div className="flex flex-col h-full">
      {/* Stepper */}
      <div className="flex items-center gap-2 border-b px-4 py-3 overflow-x-auto">
        {steps.map((s, i) => (
          <button
            key={s.id}
            type="button"
            disabled={s.requiresCompanyId && !companyId}
            onClick={() => setIdx(i)}
            className={[
              'px-3 py-1.5 text-sm rounded-full whitespace-nowrap',
              i === idx
                ? 'bg-orange-500 text-white'
                : i < idx
                  ? 'bg-orange-100 text-orange-700'
                  : 'bg-gray-100 text-gray-600',
              s.requiresCompanyId && !companyId ? 'opacity-40 cursor-not-allowed' : 'cursor-pointer',
            ].join(' ')}
          >
            {i + 1}. {s.label}
          </button>
        ))}
      </div>

      {/* Body */}
      <div className="flex-1 overflow-y-auto p-6">
        {blocked ? (
          <div className="text-sm text-gray-500 italic">
            Creá primero la empresa en el paso 1 para habilitar este paso.
          </div>
        ) : (
          step.render()
        )}
      </div>

      {/* Footer */}
      <div className="flex items-center justify-between border-t px-4 py-3 bg-gray-50">
        <Button variant="secondary" onClick={onCancel}>Cancelar</Button>
        <div className="flex items-center gap-2">
          <Button
            variant="secondary"
            disabled={idx === 0}
            onClick={() => setIdx((i) => Math.max(i - 1, 0))}
          >
            Anterior
          </Button>
          <Button disabled={blocked} onClick={goNext}>
            {isLast ? 'Finalizar' : 'Siguiente'}
          </Button>
        </div>
      </div>
    </div>
  )
}
