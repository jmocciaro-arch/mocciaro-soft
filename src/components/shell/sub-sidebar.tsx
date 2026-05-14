'use client'

/**
 * SubSidebar — barra blanca vertical izquierda que muestra los sub-items
 * de la sección activa del top-nav. Item activo: borde izquierdo naranja
 * + texto naranja bold (estilo StelOrder).
 *
 * Soporta dividers entre items (NavLeaf.dividerBefore = true) para separar
 * bloques dentro de una sección (ej: SAT separa flujo StelOrder vs módulos
 * técnicos de Mocciaro).
 *
 * Footer: Centro de ayuda · Chat · Novedades.
 * (Quitado: badge "Business + Mejorar".)
 */

import Link from 'next/link'
import { usePathname, useSearchParams } from 'next/navigation'
import { cn } from '@/lib/utils'
import { usePermissions } from '@/hooks/use-permissions'
import { useSidebar } from '@/components/ui/sidebar'
import { findActiveSection, type NavLeaf } from './nav-tree'
import { BookOpen, MessageCircle, Bell } from 'lucide-react'

function isActiveLeaf(pathname: string, search: string, href: string): boolean {
  const [hrefPath, hrefQs] = href.split('?')
  if (pathname !== hrefPath && !pathname.startsWith(hrefPath + '/')) return false
  if (!hrefQs) return pathname === hrefPath || pathname.startsWith(hrefPath + '/')
  const hrefParams = new URLSearchParams(hrefQs)
  const urlParams = new URLSearchParams(search)
  for (const [k, v] of hrefParams.entries()) {
    if (urlParams.get(k) !== v) return false
  }
  return true
}

function renderItems(
  items: NavLeaf[],
  pathname: string,
  search: string,
  badges: Record<string, number>,
  onNavigate?: () => void,
) {
  return items.map((item, idx) => {
    const Icon = item.icon
    const active = isActiveLeaf(pathname, search, item.href)
    const badgeCount = item.badgeKey ? badges[item.badgeKey] || 0 : 0
    return (
      <div key={item.href + item.label}>
        {item.dividerBefore && idx > 0 && (
          <div className="my-1.5 mx-5 border-t border-[#E5E5E5]" />
        )}
        <Link
          href={item.href}
          onClick={onNavigate}
          className={cn(
            'flex items-center gap-3 px-5 py-3 text-sm transition-colors relative group',
            active
              ? 'text-[#FF6600] font-bold bg-[#FFF5EE]'
              : 'text-[#1F2937] hover:bg-[#F8F8F8] font-medium'
          )}
        >
          {active && <span className="absolute left-0 top-0 bottom-0 w-[3px] bg-[#FF6600]" />}
          {Icon && (
            <Icon
              size={16}
              className={cn(
                'shrink-0',
                active ? 'text-[#FF6600]' : 'text-[#6B7280] group-hover:text-[#1F2937]'
              )}
            />
          )}
          <span className="flex-1 truncate">{item.label}</span>
          {badgeCount > 0 && (
            <span className="ml-auto px-1.5 py-0.5 text-[10px] font-bold rounded-full bg-[#FF6600] text-white min-w-[18px] text-center">
              {badgeCount}
            </span>
          )}
        </Link>
      </div>
    )
  })
}

export function SubSidebar({ badges }: { badges: Record<string, number> }) {
  const pathname = usePathname() || '/'
  const searchParams = useSearchParams()
  const search = searchParams?.toString() ? `?${searchParams.toString()}` : ''
  const { canAny, isSuper, loading } = usePermissions()

  const section = findActiveSection(pathname, search)
  if (!section?.children?.length) return null

  const visibleItems = section.children.filter(it => {
    if (!it.requiredPermissions) return true
    if (loading || isSuper) return true
    return canAny(it.requiredPermissions)
  })

  if (!visibleItems.length) return null

  return (
    <aside
      className="hidden lg:flex flex-col w-[220px] shrink-0 bg-white border-r border-[#E5E5E5] print:hidden"
      style={{ minHeight: 'calc(100vh - 56px)' }}
    >
      <nav className="flex-1 overflow-y-auto py-2">
        {renderItems(visibleItems, pathname, search, badges)}
      </nav>

      {/* Footer — Centro de ayuda, Chat, Novedades (sin badge Business) */}
      <div className="border-t border-[#E5E5E5] py-2">
        <FooterLink icon={BookOpen}      label="Centro de ayuda" onClick={() => window.dispatchEvent(new CustomEvent('open-help'))} />
        <FooterLink icon={MessageCircle} label="Chat"            onClick={() => window.dispatchEvent(new CustomEvent('open-help'))} />
        <FooterLink icon={Bell}          label="Novedades"       href="/admin?tab=novedades" />
      </div>
    </aside>
  )
}

function FooterLink({
  icon: Icon, label, href, onClick,
}: { icon: typeof BookOpen; label: string; href?: string; onClick?: () => void }) {
  const cls = 'flex items-center gap-2.5 px-5 py-2 text-xs text-[#6B7280] hover:text-[#FF6600] transition-colors w-full text-left'
  if (href) return <Link href={href} className={cls}><Icon size={14} />{label}</Link>
  return <button type="button" onClick={onClick} className={cls}><Icon size={14} />{label}</button>
}

/**
 * Mobile drawer.
 */
export function SubSidebarMobile({ badges }: { badges: Record<string, number> }) {
  const pathname = usePathname() || '/'
  const searchParams = useSearchParams()
  const search = searchParams?.toString() ? `?${searchParams.toString()}` : ''
  const { mobileOpen, setMobileOpen } = useSidebar()
  const { canAny, isSuper, loading } = usePermissions()

  const section = findActiveSection(pathname, search)
  const items = (section?.children || []).filter(it => {
    if (!it.requiredPermissions) return true
    if (loading || isSuper) return true
    return canAny(it.requiredPermissions)
  })

  if (!mobileOpen) return null

  return (
    <>
      <div className="fixed inset-0 bg-black/40 z-40 lg:hidden" onClick={() => setMobileOpen(false)} />
      <aside className="fixed top-0 left-0 z-50 h-full w-[280px] bg-white lg:hidden shadow-2xl flex flex-col">
        <div className="h-14 bg-[#0F0F0F] flex items-center px-5 text-white font-bold text-sm">
          {section?.label || 'Menú'}
        </div>
        <nav className="flex-1 overflow-y-auto py-2">
          {renderItems(items, pathname, search, badges, () => setMobileOpen(false))}
        </nav>
      </aside>
    </>
  )
}
