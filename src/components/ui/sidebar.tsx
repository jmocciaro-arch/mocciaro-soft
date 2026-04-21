'use client'

import { useState, useEffect, createContext, useContext, useCallback } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import {
  LayoutDashboard, FileText, Package, Users, Warehouse, Target,
  ShoppingCart, Receipt, Wrench, Calendar, Mail, Settings,
  ChevronLeft, ChevronRight, Menu, X, LogOut, ClipboardList,
  Truck, CreditCard, Building2, BarChart3,
  Cpu, Box, Layers, BookOpen, Pause, History,
  Banknote, Sparkles, TrendingUp, GitBranch, FormInput, Bot,
  RefreshCw, Zap, Globe,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { createClient } from '@/lib/supabase/client'
import { usePermissions } from '@/hooks/use-permissions'
import { CompanySelector } from '@/components/ui/company-selector'
import { AlertsBell } from '@/components/alerts/alerts-bell'
import { SyncStatus } from '@/components/pwa/sync-status'

interface SidebarContextType {
  collapsed: boolean
  setCollapsed: (v: boolean) => void
  mobileOpen: boolean
  setMobileOpen: (v: boolean) => void
  badges: Record<string, number>
}

const SidebarContext = createContext<SidebarContextType>({
  collapsed: false,
  setCollapsed: () => {},
  mobileOpen: false,
  setMobileOpen: () => {},
  badges: {},
})

export const useSidebar = () => useContext(SidebarContext)

interface NavItem {
  label: string
  href: string
  icon: typeof LayoutDashboard
  badgeKey?: string
  requiredPermissions?: string[]
}

const navItems: NavItem[] = [
  { label: 'Dashboard', href: '/dashboard', icon: LayoutDashboard },
  { label: 'Dashboard ejecutivo', href: '/dashboard/ejecutivo', icon: BarChart3 },
  { label: 'Hub IA', href: '/ai-hub', icon: Sparkles },
  // ── CRM (un solo bloque con tabs: Leads IA | Pipeline | Actividades | Informes) ──
  { label: 'CRM', href: '/crm', icon: Target, requiredPermissions: ['view_crm'] },
  // ── Ventas (flujo de venta) ──
  { label: 'Cotizador', href: '/cotizador', icon: FileText, badgeKey: 'quotes_draft', requiredPermissions: ['create_quote', 'edit_quote', 'view_sales_reports'] },
  { label: 'Pedidos', href: '/ventas?tab=pedidos', icon: ClipboardList, badgeKey: 'so_open', requiredPermissions: ['create_order', 'approve_order', 'view_sales_reports'] },
  { label: 'Importar OC', href: '/ventas/importar-oc', icon: FileText, requiredPermissions: ['create_order'] },
  { label: 'Albaranes', href: '/ventas?tab=albaranes', icon: Truck, requiredPermissions: ['create_order', 'view_sales_reports'] },
  { label: 'Facturas', href: '/ventas?tab=facturas', icon: CreditCard, requiredPermissions: ['view_financials', 'create_invoice'] },
  { label: 'Recurrentes', href: '/ventas/recurrentes', icon: RefreshCw, requiredPermissions: ['create_invoice'] },
  { label: 'Cobros', href: '/cobros', icon: Banknote, requiredPermissions: ['view_financials'] },
  { label: 'Finanzas', href: '/finanzas', icon: TrendingUp, requiredPermissions: ['view_financials'] },
  { label: 'Compras', href: '/compras?tab=pedidos', icon: ShoppingCart, badgeKey: 'po_pending', requiredPermissions: ['create_purchase_order', 'view_suppliers'] },
  { label: 'Stock', href: '/stock', icon: Warehouse, requiredPermissions: ['view_stock'] },
  { label: 'Proveedores', href: '/compras?tab=proveedores', icon: Building2, requiredPermissions: ['view_suppliers'] },
  { label: 'Clientes', href: '/clientes', icon: Users, requiredPermissions: ['view_clients'] },
  { label: 'Catalogo', href: '/catalogo', icon: Package, requiredPermissions: ['view_catalog'] },
  { label: 'Buscador Web', href: '/buscador-clientes', icon: Globe, requiredPermissions: ['admin_users'] },
  { label: 'SAT', href: '/sat', icon: Wrench, badgeKey: 'sat_open', requiredPermissions: ['view_sat'] },
  { label: 'Gastos', href: '/gastos', icon: Receipt, requiredPermissions: ['view_financials'] },
  { label: 'Agente IA', href: '/dashboard/ejecutivo', icon: Bot },
  { label: 'Informes', href: '/informes', icon: BarChart3, requiredPermissions: ['view_sales_reports', 'view_financials'] },
  { label: 'Admin', href: '/admin', icon: Settings, requiredPermissions: ['admin_users'] },
  { label: 'Automatizaciones', href: '/admin/automatizaciones', icon: Zap, requiredPermissions: ['admin_users'] },
]

function useBadgeCounts() {
  const [badges, setBadges] = useState<Record<string, number>>({})

  const fetchBadges = useCallback(async () => {
    try {
      const supabase = createClient()
      const [quotesRes, poRes, soRes, satRes] = await Promise.all([
        supabase.from('tt_quotes').select('*', { count: 'exact', head: true }).eq('status', 'draft'),
        supabase.from('tt_purchase_orders').select('*', { count: 'exact', head: true }).in('status', ['sent', 'partial']),
        supabase.from('tt_sales_orders').select('*', { count: 'exact', head: true }).eq('status', 'open'),
        supabase.from('tt_sat_tickets').select('*', { count: 'exact', head: true }).in('status', ['open', 'in_progress']),
      ])
      setBadges({
        quotes_draft: quotesRes.count || 0,
        po_pending: poRes.count || 0,
        so_open: soRes.count || 0,
        sat_open: satRes.count || 0,
      })
    } catch {
      // Silently handle errors
    }
  }, [])

  useEffect(() => {
    fetchBadges()
    const interval = setInterval(fetchBadges, 60000) // Refresh every minute
    return () => clearInterval(interval)
  }, [fetchBadges])

  return badges
}

export function SidebarProvider({ children }: { children: React.ReactNode }) {
  const [collapsed, setCollapsed] = useState(false)
  const [mobileOpen, setMobileOpen] = useState(false)
  const badges = useBadgeCounts()

  return (
    <SidebarContext.Provider value={{ collapsed, setCollapsed, mobileOpen, setMobileOpen, badges }}>
      {children}
    </SidebarContext.Provider>
  )
}

export function Sidebar() {
  const pathname = usePathname()
  const { collapsed, setCollapsed, mobileOpen, setMobileOpen, badges } = useSidebar()
  const { canAny, isSuper, loading: permsLoading } = usePermissions()

  const isActive = (href: string) => {
    const basePath = href.split('?')[0]
    const hrefTab = new URLSearchParams(href.split('?')[1] || '').get('tab')
    if (basePath === '/dashboard') return pathname === '/dashboard' || pathname === '/'
    if (!pathname.startsWith(basePath)) return false
    if (hrefTab) {
      const currentTab = typeof window !== 'undefined' ? new URLSearchParams(window.location.search).get('tab') : null
      return currentTab === hrefTab
    }
    return pathname === basePath || pathname.startsWith(basePath + '/')
  }

  // Filter nav items based on permissions
  const visibleItems = navItems.filter(item => {
    if (!item.requiredPermissions) return true // Dashboard always visible
    if (permsLoading) return true // Show all while loading
    if (isSuper) return true // Super admin sees everything
    return canAny(item.requiredPermissions)
  })

  return (
    <>
      {/* Mobile overlay */}
      {mobileOpen && (
        <div
          className="fixed inset-0 bg-black/50 z-40 lg:hidden print:hidden"
          onClick={() => setMobileOpen(false)}
        />
      )}

      {/* Sidebar */}
      <aside
        className={cn(
          'fixed top-0 left-0 z-50 h-full bg-[#0A0D12] border-r border-[#1E2330] flex flex-col transition-all duration-300 print:hidden',
          collapsed ? 'w-[72px]' : 'w-[224px]',
          // Mobile
          'lg:translate-x-0',
          mobileOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'
        )}
      >
        {/* Logo */}
        <div className="flex items-center gap-3 px-4 h-16 border-b border-[#1E2330] shrink-0">
          <div className="w-9 h-9 rounded-lg bg-[#FF6600] flex items-center justify-center shrink-0">
            <span className="text-white font-bold text-lg italic" style={{ fontFamily: 'Georgia, serif' }}>M</span>
          </div>
          {!collapsed && (
            <div className="overflow-hidden">
              <h1 className="text-[#F0F2F5] font-bold text-sm leading-tight truncate">Mocciaro Soft</h1>
              <p className="text-[10px] text-[#6B7280] truncate">ERP / CRM</p>
            </div>
          )}
          {/* Mobile close */}
          <button
            onClick={() => setMobileOpen(false)}
            className="ml-auto p-1.5 rounded-lg hover:bg-[#1E2330] text-[#6B7280] lg:hidden"
          >
            <X size={18} />
          </button>
        </div>

        {/* Navigation */}
        <nav className="flex-1 overflow-y-auto py-3 px-2 space-y-0.5">
          {visibleItems.map((item) => {
            const Icon = item.icon
            const active = isActive(item.href)
            const isSatItem = item.href === '/sat'
            const satExpanded = isSatItem && !collapsed && pathname?.startsWith('/sat')
            return (
              <div key={item.label}>
                <Link
                  href={item.href}
                  onClick={() => setMobileOpen(false)}
                  className={cn(
                    'flex items-center gap-3 px-3 py-3 rounded-lg transition-all duration-200 group relative',
                    active
                      ? 'bg-[#FF6600]/15 text-[#FF6600] font-semibold'
                      : 'text-[#9CA3AF] hover:text-[#F0F2F5] hover:bg-[#141820]'
                  )}
                >
                  {active && (
                    <div className="absolute left-0 top-1/2 -translate-y-1/2 w-[4px] h-7 bg-[#FF6600] rounded-r-full" />
                  )}
                  <Icon size={22} className="shrink-0" />
                  {!collapsed && (
                    <span className="text-sm truncate flex-1">{item.label}</span>
                  )}
                  {!collapsed && (item as { badgeKey?: string }).badgeKey && badges[(item as { badgeKey?: string }).badgeKey!] > 0 && (
                    <span className="ml-auto px-2 py-0.5 text-[11px] font-bold rounded-full bg-[#FF6600] text-white min-w-[22px] text-center">
                      {badges[(item as { badgeKey?: string }).badgeKey!]}
                    </span>
                  )}
                  {collapsed && (
                    <div className="absolute left-full ml-2 px-2 py-1 bg-[#1E2330] text-[#F0F2F5] text-xs rounded-md opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all whitespace-nowrap z-50 shadow-xl border border-[#2A3040]">
                      {item.label}
                    </div>
                  )}
                </Link>

                {/* Subitems SAT expandidos cuando estamos en /sat/* */}
                {satExpanded && (
                  <div className="ml-6 mt-0.5 pl-3 border-l border-[#2A3040] space-y-0.5">
                    {[
                      { label: 'Activos', href: '/sat/activos', icon: Cpu },
                      { label: 'Hojas', href: '/sat/hojas', icon: ClipboardList },
                      { label: 'Repuestos', href: '/sat/repuestos', icon: Box },
                      { label: 'Modelos', href: '/sat/modelos', icon: Layers },
                      { label: 'Manuales', href: '/sat/manuales', icon: BookOpen },
                      { label: 'Lotes', href: '/sat/lotes', icon: Package },
                      { label: 'Pausadas', href: '/sat/pausadas', icon: Pause },
                      { label: 'Histórico', href: '/sat/historico', icon: History },
                    ].map((sub) => {
                      const SubIcon = sub.icon
                      const subActive = pathname === sub.href || pathname?.startsWith(sub.href + '/')
                      return (
                        <Link
                          key={sub.href}
                          href={sub.href}
                          onClick={() => setMobileOpen(false)}
                          className={cn(
                            'flex items-center gap-2.5 px-2.5 py-2 rounded text-xs transition-colors',
                            subActive
                              ? 'bg-[#FF6600]/10 text-[#FF6600] font-semibold'
                              : 'text-[#9CA3AF] hover:text-[#F0F2F5] hover:bg-[#141820]'
                          )}
                        >
                          <SubIcon size={18} className="shrink-0" />
                          <span className="truncate">{sub.label}</span>
                        </Link>
                      )
                    })}
                  </div>
                )}
              </div>
            )
          })}
        </nav>

        {/* Collapse toggle (desktop) */}
        <div className="hidden lg:block px-2 py-3 border-t border-[#1E2330]">
          <button
            onClick={() => setCollapsed(!collapsed)}
            className="flex items-center gap-3 px-3 py-3 rounded-lg text-[#9CA3AF] hover:text-[#F0F2F5] hover:bg-[#141820] transition-all w-full"
          >
            {collapsed ? <ChevronRight size={22} /> : <ChevronLeft size={22} />}
            {!collapsed && <span className="text-sm">Contraer</span>}
          </button>
        </div>
      </aside>
    </>
  )
}

// Items fijos para bottom nav mobile — 4 principales + "Más" que abre el drawer completo
const mobileBottomItems: Array<{ label: string; shortLabel: string; href: string; icon: typeof LayoutDashboard }> = [
  { label: 'Dashboard', shortLabel: 'Inicio', href: '/dashboard', icon: LayoutDashboard },
  { label: 'Cotizador', shortLabel: 'Ventas', href: '/cotizador', icon: FileText },
  { label: 'Compras', shortLabel: 'Compras', href: '/compras?tab=pedidos', icon: ShoppingCart },
  { label: 'SAT', shortLabel: 'SAT', href: '/sat', icon: Wrench },
]

export function MobileNav() {
  const pathname = usePathname()
  const { setMobileOpen, mobileOpen } = useSidebar()

  const isActive = (href: string) => {
    const basePath = href.split('?')[0]
    const hrefTab = new URLSearchParams(href.split('?')[1] || '').get('tab')
    if (basePath === '/dashboard') return pathname === '/dashboard' || pathname === '/'
    if (!pathname.startsWith(basePath)) return false
    if (hrefTab) {
      const currentTab = typeof window !== 'undefined' ? new URLSearchParams(window.location.search).get('tab') : null
      return currentTab === hrefTab
    }
    return pathname === basePath || pathname.startsWith(basePath + '/')
  }

  return (
    <nav className="fixed bottom-0 left-0 right-0 z-40 bg-[#0A0D12] border-t border-[#1E2330] lg:hidden safe-area-pb print:hidden">
      <div className="flex items-stretch justify-around px-2 pt-2 pb-1">
        {mobileBottomItems.map((item) => {
          const Icon = item.icon
          const active = isActive(item.href)
          return (
            <Link
              key={item.label}
              href={item.href}
              className={cn(
                'flex flex-col items-center justify-center gap-1 px-3 py-1 rounded-lg transition-colors min-w-[64px]',
                active ? 'text-[#FF6600]' : 'text-[#9CA3AF]'
              )}
            >
              <Icon size={24} strokeWidth={active ? 2.4 : 2} />
              <span className="text-[11px] font-medium leading-tight">{item.shortLabel}</span>
            </Link>
          )
        })}
        {/* Botón "Más" — abre el sidebar completo como drawer */}
        <button
          type="button"
          onClick={() => setMobileOpen(!mobileOpen)}
          className={cn(
            'flex flex-col items-center justify-center gap-1 px-3 py-1 rounded-lg transition-colors min-w-[64px]',
            mobileOpen ? 'text-[#FF6600]' : 'text-[#9CA3AF]'
          )}
          aria-label="Abrir menú completo"
        >
          <Menu size={24} strokeWidth={mobileOpen ? 2.4 : 2} />
          <span className="text-[11px] font-medium leading-tight">Más</span>
        </button>
      </div>
    </nav>
  )
}

// Mapeo pathname -> título de módulo (StelOrder-style breadcrumb)
function getModuleTitle(pathname: string): { section: string; title: string } {
  const map: Array<[RegExp | string, string, string]> = [
    [/^\/dashboard\/ejecutivo/, 'Dashboard', 'Dashboard ejecutivo'],
    [/^\/dashboard$/, 'Inicio', 'Mi Escritorio'],
    [/^\/ai-hub/, 'IA', 'Hub IA'],
    [/^\/crm/, 'Comercial', 'CRM'],
    [/^\/cotizador/, 'Ventas', 'Cotizador'],
    [/^\/ventas\/importar-oc/, 'Ventas', 'Importar OC'],
    [/^\/ventas\/recurrentes/, 'Ventas', 'Facturas recurrentes'],
    [/^\/ventas/, 'Ventas', 'Ventas'],
    [/^\/cobros/, 'Ventas', 'Cobros'],
    [/^\/finanzas/, 'Administración', 'Finanzas'],
    [/^\/compras/, 'Compras', 'Compras'],
    [/^\/stock/, 'Almacén', 'Stock'],
    [/^\/clientes/, 'Contactos', 'Clientes'],
    [/^\/catalogo/, 'Catálogo', 'Productos'],
    [/^\/buscador-clientes/, 'Contactos', 'Buscador web'],
    [/^\/buscador/, 'Catálogo', 'Buscador'],
    [/^\/sat\/([a-z]+)/, 'SAT', ''],
    [/^\/sat/, 'SAT', 'Servicio técnico'],
    [/^\/gastos/, 'Administración', 'Gastos'],
    [/^\/informes/, 'Administración', 'Informes'],
    [/^\/admin\/automatizaciones/, 'Administración', 'Automatizaciones'],
    [/^\/admin/, 'Administración', 'Admin'],
    [/^\/calendario/, 'SAT', 'Calendario'],
    [/^\/mail/, 'CRM', 'Mail'],
    [/^\/documentos/, 'Ventas', 'Documento'],
  ]
  for (const [pattern, section, title] of map) {
    if (pattern instanceof RegExp ? pattern.test(pathname) : pathname === pattern) {
      // Sub-rutas SAT: extraer el nombre de la sub-sección
      if (pattern instanceof RegExp && pattern.source.includes('sat\\/([a-z]+)') && !title) {
        const m = pathname.match(pattern)
        const sub = (m?.[1] || '').replace(/^./, c => c.toUpperCase())
        return { section, title: sub || 'Servicio técnico' }
      }
      return { section, title }
    }
  }
  return { section: 'Inicio', title: 'Mocciaro Soft' }
}

export function TopBar({ userName }: { userName?: string }) {
  const { setMobileOpen } = useSidebar()
  const pathname = usePathname()
  const { section, title } = getModuleTitle(pathname || '/')

  return (
    <header className="h-[72px] bg-[#0A0D12]/80 backdrop-blur-xl border-b border-[#1E2330] flex items-center justify-between px-4 lg:px-6 sticky top-0 z-30 print:hidden">
      <div className="flex items-center gap-3 min-w-0 flex-1">
        <button
          onClick={() => setMobileOpen(true)}
          className="p-2 rounded-lg hover:bg-[#1E2330] text-[#9CA3AF] lg:hidden"
        >
          <Menu size={22} />
        </button>
        {/* Breadcrumb + título del módulo */}
        <div className="min-w-0">
          <div className="text-[11px] text-[#6B7280] leading-tight truncate">
            {section}
          </div>
          <h1 className="text-lg font-bold text-[#F0F2F5] leading-tight truncate">
            {title}
          </h1>
        </div>
      </div>

      <div className="flex items-center gap-3">
        {/* Sync status (offline queue) */}
        <SyncStatus />

        {/* Cmd+K hint */}
        <button
          type="button"
          onClick={() => {
            const ev = new KeyboardEvent('keydown', { key: 'k', metaKey: true, ctrlKey: true, bubbles: true })
            window.dispatchEvent(ev)
          }}
          className="hidden md:flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-xs opacity-60 hover:opacity-100"
          style={{ background: '#1E2330', border: '1px solid #2A3040' }}
          title="Abrir buscador"
        >
          <span>Buscar</span>
          <kbd className="text-[10px] border px-1 rounded" style={{ borderColor: '#2A3040' }}>⌘K</kbd>
        </button>

        {/* Alertas */}
        <AlertsBell />

        {/* Company selector */}
        <CompanySelector />

        {/* User info */}
        <div className="text-right hidden sm:block">
          <p className="text-sm font-medium text-[#F0F2F5]">{userName || 'Usuario'}</p>
          <p className="text-[10px] text-[#6B7280]">Mocciaro Soft</p>
        </div>
        <div className="w-9 h-9 rounded-full bg-[#FF6600] flex items-center justify-center text-white text-sm font-bold">
          {userName?.charAt(0)?.toUpperCase() || 'U'}
        </div>
      </div>
    </header>
  )
}
