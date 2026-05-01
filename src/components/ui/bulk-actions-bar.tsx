'use client'

/**
 * Barra flotante de acciones masivas (estilo Gmail / Salesforce / Linear).
 * Aparece cuando hay items seleccionados y permite ejecutar acciones bulk.
 */

import { ReactNode } from 'react'
import { CheckSquare, Square, X, Download, Trash2, Tag, UserCheck } from 'lucide-react'

export interface BulkAction {
  id: string
  label: string
  icon?: ReactNode
  variant?: 'default' | 'danger' | 'primary'
  onClick: () => void
  disabled?: boolean
}

interface Props {
  selectedCount: number
  totalCount: number
  onClear: () => void
  onSelectAll: () => void
  actions: BulkAction[]
}

export function BulkActionsBar({ selectedCount, totalCount, onClear, onSelectAll, actions }: Props) {
  if (selectedCount === 0) return null

  return (
    <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 animate-fade-in">
      <div className="flex items-center gap-2 px-4 py-3 rounded-xl bg-[#0F1218] border border-[#FF6600]/40 shadow-2xl shadow-orange-500/20 backdrop-blur-sm">
        {/* Counter + Select all */}
        <div className="flex items-center gap-2 pr-3 border-r border-[#1E2330]">
          <CheckSquare size={14} className="text-[#FF6600]" />
          <span className="text-sm font-semibold text-[#F0F2F5]">
            {selectedCount} seleccionado{selectedCount > 1 ? 's' : ''}
          </span>
          {selectedCount < totalCount && (
            <button
              onClick={onSelectAll}
              className="text-[10px] text-[#FF6600] hover:text-[#FF8833] uppercase font-bold ml-1"
            >
              Seleccionar todos ({totalCount})
            </button>
          )}
        </div>

        {/* Acciones */}
        <div className="flex items-center gap-1">
          {actions.map(a => (
            <button
              key={a.id}
              onClick={a.onClick}
              disabled={a.disabled}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all disabled:opacity-50 disabled:cursor-not-allowed ${
                a.variant === 'danger'  ? 'bg-red-500/10 text-red-400 hover:bg-red-500/20 border border-red-500/30' :
                a.variant === 'primary' ? 'bg-[#FF6600] text-white hover:bg-[#E55A00]' :
                'bg-[#1E2330] text-[#9CA3AF] hover:bg-[#2A3040] hover:text-[#F0F2F5] border border-[#2A3040]'
              }`}
            >
              {a.icon} {a.label}
            </button>
          ))}
        </div>

        {/* Cerrar */}
        <button
          onClick={onClear}
          className="ml-2 w-7 h-7 rounded-lg hover:bg-[#1E2330] flex items-center justify-center text-[#6B7280] hover:text-[#F0F2F5]"
          title="Limpiar selección (Esc)"
        >
          <X size={14} />
        </button>
      </div>
    </div>
  )
}

/** Checkbox componente reutilizable para listas con selección bulk */
export function BulkCheckbox({ checked, onChange, indeterminate = false }: {
  checked: boolean
  onChange: (checked: boolean) => void
  indeterminate?: boolean
}) {
  return (
    <button
      role="checkbox"
      aria-checked={indeterminate ? 'mixed' : checked}
      onClick={(e) => { e.stopPropagation(); onChange(!checked) }}
      className={`w-4 h-4 rounded border flex items-center justify-center transition ${
        checked || indeterminate
          ? 'bg-[#FF6600] border-[#FF6600]'
          : 'bg-transparent border-[#3A4050] hover:border-[#FF6600]'
      }`}
    >
      {indeterminate ? (
        <span className="w-2 h-0.5 bg-white rounded" />
      ) : checked ? (
        <CheckSquare size={11} className="text-white" />
      ) : null}
    </button>
  )
}

// Acciones predefinidas comunes
export const COMMON_BULK_ACTIONS = {
  export: (onClick: () => void): BulkAction => ({
    id: 'export', label: 'Exportar', icon: <Download size={12} />, onClick,
  }),
  delete: (onClick: () => void): BulkAction => ({
    id: 'delete', label: 'Eliminar', icon: <Trash2 size={12} />, variant: 'danger', onClick,
  }),
  tag: (onClick: () => void): BulkAction => ({
    id: 'tag', label: 'Etiquetar', icon: <Tag size={12} />, onClick,
  }),
  assign: (onClick: () => void): BulkAction => ({
    id: 'assign', label: 'Asignar vendedor', icon: <UserCheck size={12} />, onClick,
  }),
}
