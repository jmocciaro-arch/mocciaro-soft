'use client'

import { useState, useEffect, createContext, useContext, useCallback } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import {
  LayoutDashboard, FileText, Package, Users, Warehouse, Target,
  ShoppingCart, Receipt, Wrench, Calendar, Mail, Settings,
  ChevronLeft, ChevronRight, Menu, X, LogOut, ClipboardList,
  Truck, CreditCard, Building2
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { createClient } from '@/lib/supabase/client'

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

const navItems = [
  { label: 'Dashboard', href: '/', icon: LayoutDashboard },
  { label: 'CRM / Leads', href: '/crm?tab=pipeline', icon: Target },
  { label: 'Cotizador', href: '/cotizador', icon: FileText, badgeKey: 'quotes_draft' },
  { label: 'Pedidos', href: '/ventas?tab=pedidos', icon: ClipboardList, badgeKey: 'so_open' },
  { label: 'Albaranes', href: '/ventas?tab=albaranes', icon: Truck },
  { label: 'Facturas', href: '/ventas?tab=facturas', icon: CreditCard },
  { label: 'Compras', href: '/compras?tab=pedidos', icon: ShoppingCart, badgeKey: 'po_pending' },
  { label: 'Stock', href: '/stock', icon: Warehouse },
  { label: 'Proveedores', href: '/compras?tab=proveedores', icon: Building2 },
  { label: 'Clientes', href: '/clientes', icon: Users },
  { label: 'Catalogo', href: '/catalogo', icon: Package },
  { label: 'SAT', href: '/sat', icon: Wrench, badgeKey: 'sat_open' },
  { label: 'Admin', href: '/admin', icon: Settings },
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

  const isActive = (href: string) => {
    const basePath = href.split('?')[0]
    if (basePath === '/') return pathname === '/'
    return pathname.startsWith(basePath)
  }

  return (
    <>
      {/* Mobile overlay */}
      {mobileOpen && (
        <div
          className="fixed inset-0 bg-black/50 z-40 lg:hidden"
          onClick={() => setMobileOpen(false)}
        />
      )}

      {/* Sidebar */}
      <aside
        className={cn(
          'fixed top-0 left-0 z-50 h-full bg-[#0A0D12] border-r border-[#1E2330] flex flex-col transition-all duration-300',
          collapsed ? 'w-[72px]' : 'w-[260px]',
          // Mobile
          'lg:translate-x-0',
          mobileOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'
        )}
      >
        {/* Logo */}
        <div className="flex items-center gap-3 px-4 h-16 border-b border-[#1E2330] shrink-0">
          <div className="w-9 h-9 rounded-lg bg-[#FF6600] flex items-center justify-center shrink-0">
            <span className="text-white font-bold text-sm">TT</span>
          </div>
          {!collapsed && (
            <div className="overflow-hidden">
              <h1 className="text-[#F0F2F5] font-bold text-sm leading-tight truncate">TorqueTools</h1>
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
          {navItems.map((item) => {
            const Icon = item.icon
            const active = isActive(item.href)
            return (
              <Link
                key={item.label}
                href={item.href}
                onClick={() => setMobileOpen(false)}
                className={cn(
                  'flex items-center gap-3 px-3 py-2.5 rounded-lg transition-all duration-200 group relative',
                  active
                    ? 'bg-[#FF6600]/10 text-[#FF6600]'
                    : 'text-[#6B7280] hover:text-[#D1D5DB] hover:bg-[#141820]'
                )}
              >
                {active && (
                  <div className="absolute left-0 top-1/2 -translate-y-1/2 w-[3px] h-6 bg-[#FF6600] rounded-r-full" />
                )}
                <Icon size={20} className="shrink-0" />
                {!collapsed && (
                  <span className="text-sm font-medium truncate flex-1">{item.label}</span>
                )}
                {!collapsed && (item as { badgeKey?: string }).badgeKey && badges[(item as { badgeKey?: string }).badgeKey!] > 0 && (
                  <span className="ml-auto px-1.5 py-0.5 text-[10px] font-bold rounded-full bg-[#FF6600] text-white min-w-[20px] text-center">
                    {badges[(item as { badgeKey?: string }).badgeKey!]}
                  </span>
                )}
                {collapsed && (
                  <div className="absolute left-full ml-2 px-2 py-1 bg-[#1E2330] text-[#F0F2F5] text-xs rounded-md opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all whitespace-nowrap z-50 shadow-xl border border-[#2A3040]">
                    {item.label}
                  </div>
                )}
              </Link>
            )
          })}
        </nav>

        {/* Collapse toggle (desktop) */}
        <div className="hidden lg:block px-2 py-3 border-t border-[#1E2330]">
          <button
            onClick={() => setCollapsed(!collapsed)}
            className="flex items-center gap-3 px-3 py-2.5 rounded-lg text-[#6B7280] hover:text-[#D1D5DB] hover:bg-[#141820] transition-all w-full"
          >
            {collapsed ? <ChevronRight size={20} /> : <ChevronLeft size={20} />}
            {!collapsed && <span className="text-sm">Contraer</span>}
          </button>
        </div>
      </aside>
    </>
  )
}

export function MobileNav() {
  const pathname = usePathname()
  const mobileItems = navItems.slice(0, 5)

  const isActive = (href: string) => {
    const basePath = href.split('?')[0]
    if (basePath === '/') return pathname === '/'
    return pathname.startsWith(basePath)
  }

  return (
    <nav className="fixed bottom-0 left-0 right-0 z-40 bg-[#0A0D12] border-t border-[#1E2330] lg:hidden safe-area-pb">
      <div className="flex items-center justify-around px-2 py-1">
        {mobileItems.map((item) => {
          const Icon = item.icon
          const active = isActive(item.href)
          return (
            <Link
              key={item.label}
              href={item.href}
              className={cn(
                'flex flex-col items-center gap-0.5 px-3 py-2 rounded-lg transition-colors min-w-[60px]',
                active ? 'text-[#FF6600]' : 'text-[#6B7280]'
              )}
            >
              <Icon size={20} />
              <span className="text-[10px] font-medium">{item.label}</span>
            </Link>
          )
        })}
      </div>
    </nav>
  )
}

export function TopBar({ userName }: { userName?: string }) {
  const { setMobileOpen } = useSidebar()

  return (
    <header className="h-16 bg-[#0A0D12]/80 backdrop-blur-xl border-b border-[#1E2330] flex items-center justify-between px-4 lg:px-6 sticky top-0 z-30">
      <div className="flex items-center gap-3">
        <button
          onClick={() => setMobileOpen(true)}
          className="p-2 rounded-lg hover:bg-[#1E2330] text-[#6B7280] lg:hidden"
        >
          <Menu size={20} />
        </button>
      </div>

      <div className="flex items-center gap-3">
        <div className="text-right hidden sm:block">
          <p className="text-sm font-medium text-[#F0F2F5]">{userName || 'Usuario'}</p>
          <p className="text-[10px] text-[#6B7280]">TorqueTools</p>
        </div>
        <div className="w-9 h-9 rounded-full bg-[#FF6600] flex items-center justify-center text-white text-sm font-bold">
          {userName?.charAt(0)?.toUpperCase() || 'U'}
        </div>
      </div>
    </header>
  )
}
