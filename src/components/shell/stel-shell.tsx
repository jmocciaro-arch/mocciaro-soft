'use client'

/**
 * StelShell — layout principal estilo StelOrder.
 *   ┌─────────────────────────────────────────┐
 *   │  TopNav (negra)                         │ 56px
 *   ├──────────┬──────────────────────────────┤
 *   │ Sub-     │                              │
 *   │ sidebar  │   Contenido                  │
 *   │ (blanca) │   (fondo #F2F2F2)            │
 *   └──────────┴──────────────────────────────┘
 *
 * Mobile: TopNav scrollable horizontal + bottom-nav fija + drawer sub-sidebar.
 */

import { usePathname } from 'next/navigation'
import Link from 'next/link'
import { Suspense, useEffect, useState, useCallback } from 'react'
import { Menu, Plus } from 'lucide-react'
import { TopNav } from './top-nav'
import { SubSidebar, SubSidebarMobile } from './sub-sidebar'
import { mobileBottomSections, findActiveSection } from './nav-tree'
import { useSidebar } from '@/components/ui/sidebar'
import { createClient } from '@/lib/supabase/client'
import { cn } from '@/lib/utils'

export function StelShell({ children, userName }: { children: React.ReactNode; userName?: string }) {
  const { setMobileOpen } = useSidebar()
  const badges = useBadgeCounts()

  // Header de fallback durante el SSG (mantiene la altura para evitar layout shift).
  const navFallback = <div className="h-14 bg-[#0F0F0F]" />
  const sidebarFallback = <div className="hidden lg:block w-[220px] shrink-0 bg-white border-r border-[#E5E5E5]" />

  return (
    <div className="min-h-screen bg-[#F2F2F2]" data-stel-shell>
      <Suspense fallback={navFallback}>
        <TopNav userName={userName} onMobileMenu={() => setMobileOpen(true)} />
      </Suspense>

      <div className="flex">
        <Suspense fallback={sidebarFallback}>
          <SubSidebar badges={badges} />
        </Suspense>
        <main className="flex-1 min-w-0 pb-24 lg:pb-6">
          <div className="p-4 lg:p-6">{children}</div>
        </main>
      </div>

      <Suspense fallback={null}>
        <SubSidebarMobile badges={badges} />
      </Suspense>
      <BottomNavMobile />
    </div>
  )
}

/**
 * Bottom nav mobile estilo StelOrder — 4 secciones principales + botón
 * central "Más" (FAB) que abre el drawer con sub-items + secciones extra.
 */
function BottomNavMobile() {
  const pathname = usePathname() || '/'
  const { mobileOpen, setMobileOpen } = useSidebar()
  const active = findActiveSection(pathname)

  return (
    <nav className="fixed bottom-0 left-0 right-0 z-40 bg-white border-t border-[#E5E5E5] lg:hidden safe-area-pb print:hidden shadow-[0_-2px_8px_rgba(0,0,0,0.04)]">
      <div className="flex items-stretch justify-around px-1 pt-1.5 pb-1">
        {mobileBottomSections.slice(0, 2).map(item => {
          const Icon = item.icon
          const isActive = active?.id === item.id
          return (
            <Link
              key={item.id}
              href={item.href}
              className={cn(
                'flex flex-col items-center justify-center gap-0.5 px-2 py-1 rounded-md transition-colors min-w-[56px]',
                isActive ? 'text-[#FF6600]' : 'text-[#6B7280]'
              )}
            >
              <Icon size={22} strokeWidth={isActive ? 2.4 : 2} />
              <span className="text-[10px] font-medium leading-tight">{item.label}</span>
            </Link>
          )
        })}

        {/* FAB central — botón Nuevo */}
        <Link
          href="/cotizador?new=1"
          className="flex flex-col items-center justify-center -mt-6 w-14 h-14 rounded-full bg-[#FF6600] text-white shadow-lg shadow-[#FF6600]/30 hover:bg-[#E55A00] transition-colors"
          aria-label="Nuevo"
        >
          <Plus size={26} strokeWidth={2.5} />
        </Link>

        {mobileBottomSections.slice(2).map(item => {
          const Icon = item.icon
          const isActive = active?.id === item.id
          return (
            <Link
              key={item.id}
              href={item.href}
              className={cn(
                'flex flex-col items-center justify-center gap-0.5 px-2 py-1 rounded-md transition-colors min-w-[56px]',
                isActive ? 'text-[#FF6600]' : 'text-[#6B7280]'
              )}
            >
              <Icon size={22} strokeWidth={isActive ? 2.4 : 2} />
              <span className="text-[10px] font-medium leading-tight">{item.label}</span>
            </Link>
          )
        })}

        {/* Botón "Más" — abre drawer con sub-sidebar */}
        <button
          type="button"
          onClick={() => setMobileOpen(!mobileOpen)}
          className={cn(
            'flex flex-col items-center justify-center gap-0.5 px-2 py-1 rounded-md transition-colors min-w-[56px]',
            mobileOpen ? 'text-[#FF6600]' : 'text-[#6B7280]'
          )}
          aria-label="Más opciones"
        >
          <Menu size={22} strokeWidth={mobileOpen ? 2.4 : 2} />
          <span className="text-[10px] font-medium leading-tight">Más</span>
        </button>
      </div>
    </nav>
  )
}

/**
 * Cuenta de badges (presupuestos draft, pedidos abiertos, etc.) para mostrar
 * en la sub-sidebar. Se refresca cada minuto.
 */
function useBadgeCounts() {
  const [badges, setBadges] = useState<Record<string, number>>({})

  const fetchBadges = useCallback(async () => {
    try {
      const sb = createClient()
      const [quotesRes, poRes, soRes, satRes] = await Promise.all([
        sb.from('tt_quotes').select('*', { count: 'exact', head: true }).eq('status', 'draft'),
        sb.from('tt_purchase_orders').select('*', { count: 'exact', head: true }).in('status', ['sent', 'partial']),
        sb.from('tt_sales_orders').select('*', { count: 'exact', head: true }).eq('status', 'open'),
        sb.from('tt_sat_tickets').select('*', { count: 'exact', head: true }).in('status', ['open', 'in_progress']),
      ])
      setBadges({
        quotes_draft: quotesRes.count || 0,
        po_pending: poRes.count || 0,
        so_open: soRes.count || 0,
        sat_open: satRes.count || 0,
      })
    } catch {
      // silent
    }
  }, [])

  useEffect(() => {
    fetchBadges()
    const id = setInterval(fetchBadges, 60_000)
    return () => clearInterval(id)
  }, [fetchBadges])

  return badges
}
