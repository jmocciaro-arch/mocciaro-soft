'use client'

import { useState } from 'react'
import { Modal } from '@/components/ui/modal'
import { cn } from '@/lib/utils'
import { WIDGET_REGISTRY, WIDGET_CATEGORIES, type WidgetDefinition } from './widget-registry'
import {
  Package, Users, FileText, Target, Truck, Receipt, Banknote,
  AlertTriangle, Activity, Bell, Calendar, BarChart3, TrendingUp,
  PieChart, Zap, Home, List, Settings, Plus
} from 'lucide-react'

const iconMap: Record<string, React.ReactNode> = {
  Package: <Package size={20} />,
  Users: <Users size={20} />,
  FileText: <FileText size={20} />,
  Target: <Target size={20} />,
  Truck: <Truck size={20} />,
  TruckIcon: <Truck size={20} />,
  Receipt: <Receipt size={20} />,
  Banknote: <Banknote size={20} />,
  AlertTriangle: <AlertTriangle size={20} />,
  Activity: <Activity size={20} />,
  Bell: <Bell size={20} />,
  Calendar: <Calendar size={20} />,
  BarChart3: <BarChart3 size={20} />,
  TrendingUp: <TrendingUp size={20} />,
  PieChart: <PieChart size={20} />,
  Zap: <Zap size={20} />,
  Home: <Home size={20} />,
  List: <List size={20} />,
  Settings: <Settings size={20} />,
}

interface WidgetPickerProps {
  isOpen: boolean
  onClose: () => void
  onAdd: (widget: WidgetDefinition) => void
  activeWidgetTypes: string[]
}

export function WidgetPicker({ isOpen, onClose, onAdd, activeWidgetTypes }: WidgetPickerProps) {
  const [selectedCategory, setSelectedCategory] = useState<string>('all')

  const filtered = selectedCategory === 'all'
    ? WIDGET_REGISTRY
    : WIDGET_REGISTRY.filter(w => w.category === selectedCategory)

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Agregar Widget" size="lg">
      {/* Category tabs */}
      <div className="flex gap-2 mb-5 flex-wrap">
        <button
          onClick={() => setSelectedCategory('all')}
          className={cn(
            'px-3 py-1.5 rounded-lg text-xs font-medium transition-colors',
            selectedCategory === 'all'
              ? 'bg-[#FF6600] text-white'
              : 'bg-[#1E2330] text-[#9CA3AF] hover:bg-[#2A3040]'
          )}
        >
          Todos
        </button>
        {WIDGET_CATEGORIES.map(cat => (
          <button
            key={cat.id}
            onClick={() => setSelectedCategory(cat.id)}
            className={cn(
              'px-3 py-1.5 rounded-lg text-xs font-medium transition-colors flex items-center gap-1.5',
              selectedCategory === cat.id
                ? 'bg-[#FF6600] text-white'
                : 'bg-[#1E2330] text-[#9CA3AF] hover:bg-[#2A3040]'
            )}
          >
            {iconMap[cat.icon] && <span className="scale-75">{iconMap[cat.icon]}</span>}
            {cat.label}
          </button>
        ))}
      </div>

      {/* Widget grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
        {filtered.map(widget => {
          const alreadyAdded = activeWidgetTypes.includes(widget.id)
          return (
            <button
              key={widget.id}
              onClick={() => {
                onAdd(widget)
                onClose()
              }}
              disabled={false}
              className={cn(
                'p-4 rounded-xl border text-left transition-all duration-200 group',
                'bg-[#0F1218] border-[#1E2330] hover:border-[#FF6600]/50 hover:bg-[#141820]',
                alreadyAdded && 'opacity-60'
              )}
            >
              <div className="flex items-start gap-3">
                <div className="p-2 rounded-lg bg-[#FF6600]/10 text-[#FF6600] shrink-0">
                  {iconMap[widget.icon] || <Package size={20} />}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-[#F0F2F5] mb-0.5">{widget.name}</p>
                  <p className="text-xs text-[#6B7280] line-clamp-2">{widget.description}</p>
                </div>
                <div className="shrink-0 opacity-0 group-hover:opacity-100 transition-opacity">
                  <Plus size={16} className="text-[#FF6600]" />
                </div>
              </div>
              {alreadyAdded && (
                <span className="text-[10px] text-[#FF6600] mt-2 block">Ya agregado (podes sumarlo otra vez)</span>
              )}
            </button>
          )
        })}
      </div>
    </Modal>
  )
}
