'use client'

/**
 * ThemeToggle — botón para alternar entre tema oscuro y tema claro (gris medio).
 *
 * - Persiste en localStorage bajo la key `theme` ("dark" | "light").
 * - Aplica el atributo `data-theme` al <html> para que los CSS overrides en
 *   globals.css cambien los colores del UI sin tocar miles de archivos.
 * - El layout raíz inyecta un script bloqueante en <head> para evitar FOUC,
 *   así el atributo ya está presente antes del primer paint.
 */

import { useEffect, useState } from 'react'
import { Sun, Moon } from 'lucide-react'

type Theme = 'dark' | 'light'

function getInitialTheme(): Theme {
  if (typeof document === 'undefined') return 'dark'
  const attr = document.documentElement.getAttribute('data-theme')
  if (attr === 'light' || attr === 'dark') return attr
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

  const isLight = theme === 'light'

  return (
    <button
      onClick={() => apply(isLight ? 'dark' : 'light')}
      className={
        compact
          ? 'inline-flex items-center justify-center w-8 h-8 rounded-md border border-[#2A3040] text-[#9CA3AF] hover:text-[#F0F2F5] hover:bg-[#1E2330] transition-colors'
          : 'inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-md border border-[#2A3040] text-xs text-[#9CA3AF] hover:text-[#F0F2F5] hover:bg-[#1E2330] transition-colors'
      }
      title={isLight ? 'Cambiar a tema oscuro' : 'Cambiar a tema claro (gris)'}
      aria-label={isLight ? 'Cambiar a tema oscuro' : 'Cambiar a tema claro'}
    >
      {isLight ? <Moon size={14} /> : <Sun size={14} />}
      {!compact && <span>{isLight ? 'Oscuro' : 'Gris'}</span>}
    </button>
  )
}
