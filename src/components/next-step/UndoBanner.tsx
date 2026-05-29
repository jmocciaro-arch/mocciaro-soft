'use client'

/**
 * Banner verde con countdown — aparece después de ejecutar una acción exitosa.
 * En F1 "Deshacer" sólo cancela el redirect automático (no hace un undo real
 * del side-effect — eso vendrá en F3 con tt_scheduled_actions).
 */
import { useEffect, useState } from 'react'
import { Check, RotateCcw } from 'lucide-react'

export interface UndoBannerProps {
  message: string
  seconds: number
  onTimeout: () => void
  onCancel: () => void
}

export function UndoBanner({ message, seconds, onTimeout, onCancel }: UndoBannerProps) {
  const [left, setLeft] = useState(seconds)

  useEffect(() => {
    if (left <= 0) {
      onTimeout()
      return
    }
    const t = setTimeout(() => setLeft((s) => s - 1), 1000)
    return () => clearTimeout(t)
  }, [left, onTimeout])

  // Escape para cancelar
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onCancel()
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [onCancel])

  return (
    <div
      role="status"
      aria-live="polite"
      className="mt-2 flex items-center justify-between gap-3 rounded-md border border-[#2D7A3E] bg-[#0F2A1A] px-4 py-3"
    >
      <div className="flex items-center gap-2 text-[#86EFAC]">
        <Check size={16} />
        <span className="text-sm">
          <strong className="font-semibold">{message}</strong>. Redirigiendo en {left}s…
        </span>
      </div>
      <button
        type="button"
        onClick={onCancel}
        className="inline-flex items-center gap-1.5 rounded border border-[#2D7A3E] bg-transparent px-3 py-1.5 text-xs font-medium text-[#86EFAC] hover:bg-[#1A3A28] transition-colors"
      >
        <RotateCcw size={12} />
        Deshacer ({left}s)
      </button>
    </div>
  )
}
