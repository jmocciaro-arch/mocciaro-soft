'use client'

/**
 * TopNav — barra negra horizontal estilo StelOrder.
 *
 * Estructura:
 *   [Hamburguesa mobile] [Inicio Catálogo Clientes Ventas SAT Proyectos
 *    Facturación Compras Agenda Informes] | [⊞ Más] [Alertas] [Empresa]
 *    [Avatar Usuario ▾]
 *
 * - Item activo del top nav: fondo naranja #FF6600, texto blanco.
 * - "Más" abre dropdown con 2 bloques (Tus funcionalidades / Funcionalidades adicionales).
 * - Avatar abre dropdown de usuario (Mi perfil, Configuración, Cerrar sesión, etc.).
 * - Quitado: Club Amigo, ThemeToggle (solo tema claro).
 */

import Link from 'next/link'
import { useRouter, usePathname, useSearchParams } from 'next/navigation'
import { useState, useRef, useEffect } from 'react'
import { Grid3X3, ChevronDown, Menu, Check } from 'lucide-react'
import { cn } from '@/lib/utils'
import { usePermissions } from '@/hooks/use-permissions'
import { navSections, moreSection, userDropdown, findActiveSection, type NavLeaf, type UserDropdownItem } from './nav-tree'
import { CompanySelector } from '@/components/ui/company-selector'
import { AlertsBell } from '@/components/alerts/alerts-bell'
import { createClient } from '@/lib/supabase/client'

interface TopNavProps {
  userName?: string
  onMobileMenu?: () => void
}

export function TopNav({ userName, onMobileMenu }: TopNavProps) {
  const pathname = usePathname() || '/'
  const searchParams = useSearchParams()
  const router = useRouter()
  const { canAny, isSuper, loading } = usePermissions()

  const [moreOpen, setMoreOpen] = useState(false)
  const [userOpen, setUserOpen] = useState(false)
  const moreRef = useRef<HTMLDivElement>(null)
  const userRef = useRef<HTMLDivElement>(null)

  const searchString = searchParams?.toString() ? `?${searchParams.toString()}` : ''
  const active = findActiveSection(pathname, searchString)

  const canSeeLeaf = (it: { requiredPermissions?: string[] }) => {
    if (!it.requiredPermissions) return true
    if (loading || isSuper) return true
    return canAny(it.requiredPermissions)
  }

  const visibleSections = navSections.filter(canSeeLeaf)

  // Cierra dropdowns con click-outside y Escape
  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      if (moreOpen && moreRef.current && !moreRef.current.contains(e.target as Node)) setMoreOpen(false)
      if (userOpen && userRef.current && !userRef.current.contains(e.target as Node)) setUserOpen(false)
    }
    const onEsc = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { setMoreOpen(false); setUserOpen(false) }
    }
    document.addEventListener('mousedown', onClick)
    document.addEventListener('keydown', onEsc)
    return () => {
      document.removeEventListener('mousedown', onClick)
      document.removeEventListener('keydown', onEsc)
    }
  }, [moreOpen, userOpen])

  async function handleUserAction(item: UserDropdownItem) {
    setUserOpen(false)
    if ('href' in item) return // <Link> ya navega
    if (item.action === 'help') {
      window.dispatchEvent(new CustomEvent('open-help'))
    } else if (item.action === 'shortcuts') {
      window.dispatchEvent(new CustomEvent('open-shortcuts'))
    } else if (item.action === 'logout') {
      try {
        const sb = createClient()
        await sb.auth.signOut()
      } catch {/* silent */}
      router.push('/login')
    }
  }

  return (
    <header
      data-theme-scope="dark"
      className="h-14 bg-[#0F0F0F] flex items-center sticky top-0 z-40 print:hidden shadow-sm"
    >
      {/* Hamburguesa mobile */}
      <button
        onClick={onMobileMenu}
        className="p-3 text-white hover:bg-white/10 lg:hidden"
        aria-label="Abrir menú"
      >
        <Menu size={22} />
      </button>

      {/* Secciones principales */}
      <nav className="flex-1 flex items-stretch overflow-x-auto scrollbar-hide">
        {visibleSections.map(section => {
          const isActive = active?.id === section.id
          return (
            <Link
              key={section.id}
              href={section.href}
              className={cn(
                'flex items-center justify-center px-4 lg:px-5 h-full text-sm font-semibold whitespace-nowrap transition-colors',
                isActive
                  ? 'bg-[#FF6600] text-white'
                  : 'text-white/90 hover:bg-white/10'
              )}
            >
              {section.label}
            </Link>
          )
        })}
      </nav>

      {/* Separador */}
      <div className="hidden lg:block h-6 w-px bg-white/20 mx-2" />

      {/* Botón grilla "Más" */}
      <div ref={moreRef} className="relative">
        <button
          type="button"
          onClick={() => { setMoreOpen(v => !v); setUserOpen(false) }}
          className={cn(
            'h-14 px-3 flex items-center justify-center text-white/80 hover:text-white hover:bg-white/10 transition-colors',
            moreOpen && 'bg-white/10 text-white'
          )}
          aria-label="Más funcionalidades"
        >
          <Grid3X3 size={18} />
        </button>
        {moreOpen && (
          <div
            data-theme-scope="dark"
            className="absolute right-0 top-full mt-1 w-[420px] bg-white border border-[#E5E5E5] shadow-xl rounded-md overflow-hidden z-50 animate-fade-in"
          >
            {moreSection.groups.map((group, gi) => {
              const visibleItems = group.items.filter(canSeeLeaf)
              if (!visibleItems.length) return null
              return (
                <div key={group.title} className={gi > 0 ? 'border-t border-[#F0F0F0]' : ''}>
                  <div className="px-3 pt-2.5 pb-1.5 text-[10px] uppercase tracking-wide text-[#6B7280] font-semibold">
                    {group.title}
                  </div>
                  <div className="grid grid-cols-3 gap-1 p-2 pt-0">
                    {visibleItems.map(it => {
                      const Icon = it.icon
                      return (
                        <Link
                          key={it.label}
                          href={it.href}
                          onClick={() => setMoreOpen(false)}
                          className="flex flex-col items-center gap-1.5 p-3 rounded-md hover:bg-[#FFF5EE] hover:text-[#FF6600] text-[#374151] transition-colors text-center"
                        >
                          {Icon && (
                            <div className="w-10 h-10 rounded-md bg-[#F5F5F5] flex items-center justify-center">
                              <Icon size={20} />
                            </div>
                          )}
                          <span className="text-[11px] font-medium leading-tight line-clamp-2">{it.label}</span>
                        </Link>
                      )
                    })}
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>

      {/* Acciones (alertas, empresa) — sin Club Amigo, sin ThemeToggle */}
      <div className="hidden md:flex items-center gap-1 px-2 border-l border-white/10 ml-2 h-full">
        <AlertsBell />
        <CompanySelector />
      </div>

      {/* Dropdown usuario */}
      <div ref={userRef} className="relative h-full">
        <button
          type="button"
          onClick={() => { setUserOpen(v => !v); setMoreOpen(false) }}
          className={cn(
            'flex items-center gap-2 px-3 lg:px-4 h-full hover:bg-white/10 transition-colors border-l border-white/10',
            userOpen && 'bg-white/10'
          )}
          aria-haspopup="menu"
          aria-expanded={userOpen}
        >
          <div className="w-8 h-8 rounded-full bg-[#FF6600] flex items-center justify-center text-white text-xs font-bold">
            {userName?.charAt(0)?.toUpperCase() || 'U'}
          </div>
          <span className="hidden lg:inline text-white text-xs font-bold uppercase tracking-wide">
            {userName || 'Usuario'}
          </span>
          <ChevronDown size={14} className={cn('hidden lg:inline text-white/70 transition-transform', userOpen && 'rotate-180')} />
        </button>

        {userOpen && (
          <div
            data-theme-scope="dark"
            role="menu"
            className="absolute right-0 top-full mt-1 w-60 bg-white border border-[#E5E5E5] shadow-xl rounded-md overflow-hidden z-50 animate-fade-in py-1"
          >
            {userDropdown.map((item, idx) => {
              const Icon = item.icon
              const content = (
                <>
                  {Icon && <Icon size={14} className="text-[#6B7280] shrink-0" />}
                  <span className="flex-1">{item.label}</span>
                </>
              )
              const cls = 'w-full flex items-center gap-2.5 px-3.5 py-2 text-[13px] text-[#1F2937] hover:bg-[#FFF5EE] hover:text-[#FF6600] transition-colors text-left'

              return (
                <div key={item.label}>
                  {item.dividerBefore && <div className="my-1 border-t border-[#F0F0F0]" />}
                  {'href' in item ? (
                    <Link
                      href={item.href}
                      onClick={() => setUserOpen(false)}
                      className={cls}
                      role="menuitem"
                    >
                      {content}
                    </Link>
                  ) : (
                    <button
                      type="button"
                      onClick={() => handleUserAction(item)}
                      className={cls}
                      role="menuitem"
                    >
                      {content}
                    </button>
                  )}
                </div>
              )
            })}
          </div>
        )}
      </div>
    </header>
  )
}
