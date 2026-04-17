'use client'

import '@/components/sat/buscatools-theme.css'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import {
  Wrench, Cpu, Box, Layers, BookOpen, Package, Pause, History, ClipboardList,
} from 'lucide-react'

const SAT_NAV = [
  { href: '/sat',            label: 'Dashboard',    icon: Wrench },
  { href: '/sat/activos',    label: 'Activos',      icon: Cpu },
  { href: '/sat/hojas',      label: 'Hojas',        icon: ClipboardList },
  { href: '/sat/repuestos',  label: 'Repuestos',    icon: Box },
  { href: '/sat/modelos',    label: 'Modelos',      icon: Layers },
  { href: '/sat/manuales',   label: 'Manuales',     icon: BookOpen },
  { href: '/sat/lotes',      label: 'Lotes',        icon: Package },
  { href: '/sat/pausadas',   label: 'Pausadas',     icon: Pause },
  { href: '/sat/historico',  label: 'Histórico',    icon: History },
]

export default function SatLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()

  return (
    <div className="sat-theme">
      {/* Subnav horizontal siempre visible, sticky debajo del TopBar (h-16=64px) */}
      <div
        className="sticky top-16 z-20 -mx-4 lg:-mx-6 px-4 lg:px-6 py-2 mb-4 backdrop-blur"
        style={{
          background: 'rgba(10, 12, 15, 0.92)',
          borderBottom: '1px solid var(--sat-br)',
        }}
      >
        <div className="flex flex-wrap gap-1 p-1 rounded-xl"
          style={{ background: 'var(--sat-dk2)', border: '1px solid var(--sat-br)' }}>
          {SAT_NAV.map((item) => {
            const active = pathname === item.href || (item.href !== '/sat' && pathname.startsWith(item.href))
            const Icon = item.icon
            return (
              <Link
                key={item.href}
                href={item.href}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors"
                style={{
                  color: active ? 'var(--sat-or)' : 'var(--sat-tx2)',
                  background: active ? 'var(--sat-or-d)' : 'transparent',
                  border: active ? '1px solid var(--sat-or)' : '1px solid transparent',
                }}
              >
                <Icon size={14} /> {item.label}
              </Link>
            )
          })}
        </div>
      </div>

      {children}
    </div>
  )
}
