'use client'

import { useRouter } from 'next/navigation'
import { Plus, Search, Users, Package, ShoppingCart, AlertCircle } from 'lucide-react'

const actions = [
  { label: 'Nueva cotizacion', icon: Plus, href: '/cotizador', color: '#FF6600' },
  { label: 'Buscar producto', icon: Search, href: '/catalogo', color: '#3B82F6' },
  { label: 'Ver clientes', icon: Users, href: '/clientes', color: '#10B981' },
  { label: 'Ver stock', icon: Package, href: '/stock', color: '#F59E0B' },
  { label: 'Nuevo pedido', icon: ShoppingCart, href: '/ventas', color: '#8B5CF6' },
  { label: 'Nueva incidencia', icon: AlertCircle, href: '/sat', color: '#EF4444' },
]

export function WidgetQuickActions() {
  const router = useRouter()

  return (
    <div className="grid grid-cols-3 gap-2 h-full content-start">
      {actions.map(action => {
        const Icon = action.icon
        return (
          <button
            key={action.label}
            onClick={() => router.push(action.href)}
            className="flex flex-col items-center gap-1.5 p-3 rounded-lg bg-[#0F1218] border border-[#1E2330] hover:border-[#2A3040] hover:bg-[#1A1F2E] transition-all group"
          >
            <div
              className="p-2 rounded-lg transition-colors"
              style={{ backgroundColor: `${action.color}15` }}
            >
              <Icon size={16} style={{ color: action.color }} />
            </div>
            <span className="text-[10px] text-[#9CA3AF] group-hover:text-[#F0F2F5] text-center leading-tight transition-colors">
              {action.label}
            </span>
          </button>
        )
      })}
    </div>
  )
}
