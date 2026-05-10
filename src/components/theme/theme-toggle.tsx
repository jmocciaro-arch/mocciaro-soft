'use client'

/**
 * ThemeToggle — dropdown con 4 temas visibles:
 *   dark   → Oscuro
 *   light  → Claro STEL (header negro + resto blanco)
 *   bright → Brillante (todo claro)
 *   gray   → Gris medio
 *
 * Persiste en localStorage.theme. Aplica data-theme al <html> para que
 * los overrides en globals.css cambien los colores sin tocar componentes.
 * El layout raíz inyecta un script bloqueante en <head> para evitar FOUC.
 */

import { useEffect, useRef, useState } from 'react'
import { Moon, Sun, Sparkles, CloudFog, Check, ChevronDown } from 'lucide-react'

type Theme = 'dark' | 'light' | 'bright' | 'gray'

const OPTIONS: Array<{ id: Theme; label: string; desc: string; icon: typeof Moon }> = [
  { id: 'dark',   label: 'Oscuro',    desc: 'Tema por defecto, fondo negro',     icon: Moon     },
  { id: 'light',  label: 'Claro',     desc: 'Estilo STEL Order, header negro',   icon: Sun      },
  { id: 'bright', label: 'Brillante', desc: 'Todo blanco, sin zonas oscuras',    icon: Sparkles },
  { id: 'gray',   label: 'Gris',      desc: 'Gris medio, baja fatiga visual',    icon: CloudFog },
]

function getInitialTheme(): Theme {
  if (typeof document === 'undefined') return 'dark'
  const attr = document.documentElement.getAttribute('data-theme') as Theme | null
  if (attr && OPTIONS.some(o => o.id === attr)) return attr
  return 'dark'
}

export function ThemeToggle({ compact = false }: { compact?: boolean }) {
  const [theme, setTheme] = useState<Theme>('dark')
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    setTheme(getInitialTheme())
  }, [])

  useEffect(() => {
    if (!open) return
    const onClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    const onEsc = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false)
    }
    document.addEventListener('mousedown', onClick)
    document.addEventListener('keydown', onEsc)
    return () => {
      document.removeEventListener('mousedown', onClick)
      document.removeEventListener('keydown', onEsc)
    }
  }, [open])

  const apply = (next: Theme) => {
    setTheme(next)
    document.documentElement.setAttribute('data-theme', next)
    try {
      localStorage.setItem('theme', next)
    } catch {}
    setOpen(false)
  }

  const current = OPTIONS.find(o => o.id === theme) ?? OPTIONS[0]
  const CurrentIcon = current.icon

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen(v => !v)}
        className={
          compact
            ? 'inline-flex items-center justify-center w-8 h-8 rounded-md border border-[#2A3040] text-[#9CA3AF] hover:text-[#F0F2F5] hover:bg-[#1E2330] transition-colors'
            : 'inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-md border border-[#2A3040] text-xs text-[#9CA3AF] hover:text-[#F0F2F5] hover:bg-[#1E2330] transition-colors'
        }
        title={`Tema: ${current.label}`}
        aria-label="Seleccionar tema"
        aria-haspopup="listbox"
        aria-expanded={open}
      >
        <CurrentIcon size={14} />
        {!compact && (
          <>
            <span>{current.label}</span>
            <ChevronDown size={12} className={open ? 'rotate-180 transition-transform' : 'transition-transform'} />
          </>
        )}
      </button>

      {open && (
        <div
          role="listbox"
          className="absolute right-0 mt-1 w-56 rounded-lg border border-[#2A3040] bg-[#0F1218] shadow-xl z-50 overflow-hidden animate-fade-in"
        >
          {OPTIONS.map(opt => {
            const Icon = opt.icon
            const active = opt.id === theme
            return (
              <button
                key={opt.id}
                type="button"
                role="option"
                aria-selected={active}
                onClick={() => apply(opt.id)}
                className={
                  'w-full flex items-start gap-2.5 px-3 py-2.5 text-left transition-colors ' +
                  (active
                    ? 'bg-[#FF6600]/10 text-[#FF6600]'
                    : 'text-[#D1D5DB] hover:bg-[#1A1F2E] hover:text-[#F0F2F5]')
                }
              >
                <Icon size={16} className="mt-0.5 shrink-0" />
                <div className="flex-1 min-w-0">
                  <div className="text-xs font-medium flex items-center gap-1.5">
                    {opt.label}
                    {active && <Check size={12} />}
                  </div>
                  <div className="text-[10px] text-[#6B7280] mt-0.5">{opt.desc}</div>
                </div>
              </button>
            )
          })}
        </div>
      )}
    </div>
  )
}
