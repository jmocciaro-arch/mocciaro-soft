'use client'

/**
 * ThemeToggle — dropdown completo de apariencia con 3 ejes:
 *   1) Tema (dark | light | bright | gray)
 *   2) Tamaño de texto (sm | normal | lg | xl)
 *   3) Color de acento (orange | blue | green | purple | rose | teal)
 *
 * Persiste en localStorage (theme, textSize, accent). Aplica los 3
 * como atributos en <html> (data-theme, data-text-size, data-accent)
 * para que los overrides en globals.css trabajen sin tocar componentes.
 * El layout raíz inyecta scripts bloqueantes en <head> para evitar FOUC.
 */

import { useEffect, useRef, useState } from 'react'
import { Moon, Sun, Sparkles, CloudFog, Check, ChevronDown, Type } from 'lucide-react'

type Theme = 'dark' | 'light' | 'bright' | 'gray'
type TextSize = 'sm' | 'normal' | 'lg' | 'xl'
type Accent = 'orange' | 'blue' | 'green' | 'purple' | 'rose' | 'teal'

const THEMES: Array<{ id: Theme; label: string; desc: string; icon: typeof Moon }> = [
  { id: 'dark',   label: 'Oscuro',    desc: 'Tema por defecto, fondo negro',     icon: Moon     },
  { id: 'light',  label: 'Claro',     desc: 'Estilo STEL Order, header negro',   icon: Sun      },
  { id: 'bright', label: 'Brillante', desc: 'Todo blanco, sin zonas oscuras',    icon: Sparkles },
  { id: 'gray',   label: 'Gris',      desc: 'Gris medio, baja fatiga visual',    icon: CloudFog },
]

const SIZES: Array<{ id: TextSize; label: string }> = [
  { id: 'sm',     label: 'S'  },
  { id: 'normal', label: 'M'  },
  { id: 'lg',     label: 'L'  },
  { id: 'xl',     label: 'XL' },
]

const ACCENTS: Array<{ id: Accent; label: string; color: string }> = [
  { id: 'orange', label: 'Naranja', color: '#FF6600' },
  { id: 'blue',   label: 'Azul',    color: '#2563EB' },
  { id: 'green',  label: 'Verde',   color: '#16A34A' },
  { id: 'purple', label: 'Violeta', color: '#9333EA' },
  { id: 'rose',   label: 'Rosa',    color: '#E11D48' },
  { id: 'teal',   label: 'Turquesa',color: '#0D9488' },
]

function getInitial<T extends string>(attr: string, valid: readonly T[], fallback: T): T {
  if (typeof document === 'undefined') return fallback
  const v = document.documentElement.getAttribute(attr) as T | null
  if (v && (valid as readonly string[]).includes(v)) return v
  return fallback
}

export function ThemeToggle({ compact = false }: { compact?: boolean }) {
  const [theme, setTheme] = useState<Theme>('dark')
  const [textSize, setTextSize] = useState<TextSize>('normal')
  const [accent, setAccent] = useState<Accent>('orange')
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    setTheme(getInitial<Theme>('data-theme', THEMES.map(t => t.id), 'dark'))
    setTextSize(getInitial<TextSize>('data-text-size', SIZES.map(s => s.id), 'normal'))
    setAccent(getInitial<Accent>('data-accent', ACCENTS.map(a => a.id), 'orange'))
  }, [])

  useEffect(() => {
    if (!open) return
    const onClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    const onEsc = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false) }
    document.addEventListener('mousedown', onClick)
    document.addEventListener('keydown', onEsc)
    return () => {
      document.removeEventListener('mousedown', onClick)
      document.removeEventListener('keydown', onEsc)
    }
  }, [open])

  const applyTheme = (next: Theme) => {
    setTheme(next)
    document.documentElement.setAttribute('data-theme', next)
    try { localStorage.setItem('theme', next) } catch {}
  }

  const applySize = (next: TextSize) => {
    setTextSize(next)
    document.documentElement.setAttribute('data-text-size', next)
    try { localStorage.setItem('textSize', next) } catch {}
  }

  const applyAccent = (next: Accent) => {
    setAccent(next)
    document.documentElement.setAttribute('data-accent', next)
    try { localStorage.setItem('accent', next) } catch {}
  }

  const current = THEMES.find(t => t.id === theme) ?? THEMES[0]
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
        title={`Apariencia (${current.label})`}
        aria-label="Configurar apariencia"
        aria-haspopup="dialog"
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
          role="dialog"
          aria-label="Configuración de apariencia"
          className="absolute right-0 mt-1 w-72 rounded-lg border border-[#2A3040] bg-[#0F1218] shadow-xl z-50 overflow-hidden animate-fade-in"
        >
          {/* Tema */}
          <div className="px-3 pt-2.5 pb-1 text-[10px] uppercase tracking-wide text-[#6B7280] font-semibold">Tema</div>
          {THEMES.map(opt => {
            const Icon = opt.icon
            const active = opt.id === theme
            return (
              <button
                key={opt.id}
                type="button"
                onClick={() => applyTheme(opt.id)}
                className={
                  'w-full flex items-start gap-2.5 px-3 py-2 text-left transition-colors ' +
                  (active
                    ? 'bg-[#FF6600]/10 text-[#FF6600]'
                    : 'text-[#D1D5DB] hover:bg-[#1A1F2E] hover:text-[#F0F2F5]')
                }
              >
                <Icon size={15} className="mt-0.5 shrink-0" />
                <div className="flex-1 min-w-0">
                  <div className="text-xs font-medium flex items-center gap-1.5">
                    {opt.label}
                    {active && <Check size={11} />}
                  </div>
                  <div className="text-[10px] text-[#6B7280] mt-0.5">{opt.desc}</div>
                </div>
              </button>
            )
          })}

          {/* Tamaño de texto */}
          <div className="px-3 pt-3 pb-1 text-[10px] uppercase tracking-wide text-[#6B7280] font-semibold border-t border-[#1E2330]">
            <span className="inline-flex items-center gap-1.5"><Type size={11} /> Tamaño de texto</span>
          </div>
          <div className="px-3 pb-2 flex gap-1">
            {SIZES.map(s => {
              const active = s.id === textSize
              return (
                <button
                  key={s.id}
                  type="button"
                  onClick={() => applySize(s.id)}
                  className={
                    'flex-1 px-2 py-1.5 rounded-md text-xs font-medium border transition-colors ' +
                    (active
                      ? 'bg-[#FF6600]/15 text-[#FF6600] border-[#FF6600]/40'
                      : 'bg-[#1A1F2E] text-[#D1D5DB] border-[#2A3040] hover:bg-[#1E2330]')
                  }
                  title={`Tamaño ${s.label}`}
                >
                  {s.label}
                </button>
              )
            })}
          </div>

          {/* Color de acento */}
          <div className="px-3 pt-2 pb-1 text-[10px] uppercase tracking-wide text-[#6B7280] font-semibold border-t border-[#1E2330]">
            Color de acento
          </div>
          <div className="px-3 pb-3 grid grid-cols-6 gap-1.5">
            {ACCENTS.map(a => {
              const active = a.id === accent
              return (
                <button
                  key={a.id}
                  type="button"
                  onClick={() => applyAccent(a.id)}
                  className={
                    'aspect-square rounded-md border-2 transition-all flex items-center justify-center ' +
                    (active ? 'ring-2 ring-offset-2 ring-offset-[#0F1218] ring-white/30 scale-105' : 'hover:scale-105')
                  }
                  style={{ backgroundColor: a.color, borderColor: active ? a.color : 'transparent' }}
                  title={a.label}
                  aria-label={`Acento ${a.label}`}
                >
                  {active && <Check size={12} className="text-white drop-shadow" />}
                </button>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}
