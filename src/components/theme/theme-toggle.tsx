'use client'

/**
 * ThemeToggle — selector cíclico entre 4 temas:
 *   dark   → Oscuro (default)
 *   light  → Claro STEL (header negro, resto blanco)
 *   bright → Brillante (todo blanco, sin zonas oscuras)
 *   gray   → Gris medio
 *
 * Persiste en localStorage.theme. Aplica data-theme al <html> para que
 * los overrides en globals.css cambien los colores sin tocar componentes.
 * El layout raíz inyecta un script bloqueante en <head> para evitar FOUC.
 */

import { useEffect, useState } from 'react'
import { Moon, Sun, Sparkles, CloudFog } from 'lucide-react'

type Theme = 'dark' | 'light' | 'bright' | 'gray'

const THEMES: Theme[] = ['dark', 'light', 'bright', 'gray']

const META: Record<Theme, { label: string; icon: typeof Moon; next: Theme }> = {
  dark:   { label: 'Oscuro',    icon: Moon,     next: 'light'  },
  light:  { label: 'Claro',     icon: Sun,      next: 'bright' },
  bright: { label: 'Brillante', icon: Sparkles, next: 'gray'   },
  gray:   { label: 'Gris',      icon: CloudFog, next: 'dark'   },
}

function getInitialTheme(): Theme {
  if (typeof document === 'undefined') return 'dark'
  const attr = document.documentElement.getAttribute('data-theme') as Theme | null
  if (attr && THEMES.includes(attr)) return attr
  return 'dark'
}

export function ThemeToggle({ compact = false }: { compact?: boolean }) {
  const [theme, setTheme] = useState<Theme>('dark')

  useEffect(() => {
    setTheme(getInitialTheme())
  }, [])

  const apply = (next: Theme) => {
    setTheme(next)
    document.documentElement.setAttribute('data-theme', next)
    try {
      localStorage.setItem('theme', next)
    } catch {}
  }

  const current = META[theme]
  const Icon = current.icon

  return (
    <button
      onClick={() => apply(current.next)}
      className={
        compact
          ? 'inline-flex items-center justify-center w-8 h-8 rounded-md border border-[#2A3040] text-[#9CA3AF] hover:text-[#F0F2F5] hover:bg-[#1E2330] transition-colors'
          : 'inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-md border border-[#2A3040] text-xs text-[#9CA3AF] hover:text-[#F0F2F5] hover:bg-[#1E2330] transition-colors'
      }
      title={`Tema actual: ${current.label} — clic para pasar a ${META[current.next].label}`}
      aria-label={`Cambiar tema (actual: ${current.label})`}
    >
      <Icon size={14} />
      {!compact && <span>{current.label}</span>}
    </button>
  )
}
