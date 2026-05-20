'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { Settings2, Check, RotateCcw } from 'lucide-react'

export interface ColumnDef {
  key: string
  label: string
  group?: 'basic' | 'codes' | 'pricing' | 'stock' | 'physical' | 'meta' | 'spec'
  defaultOn?: boolean
}

interface Props {
  available: ColumnDef[]
  /** orden + visibilidad efectivo (lista de keys visibles, en orden) */
  value: string[]
  onChange: (next: string[]) => void
  defaultOn: string[]
}

const GROUP_LABEL: Record<NonNullable<ColumnDef['group']>, string> = {
  basic:    'Básicos',
  codes:    'Códigos',
  pricing:  'Precios',
  stock:    'Stock',
  physical: 'Físicos',
  meta:     'Metadatos',
  spec:     'Atributos de categoría',
}

export function ProductColumnSettings({ available, value, onChange, defaultOn }: Props) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  // Cerrar al hacer click afuera
  useEffect(() => {
    if (!open) return
    function handler(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [open])

  const grouped = useMemo(() => {
    const out: Record<string, ColumnDef[]> = {}
    for (const col of available) {
      const g = col.group ?? 'meta'
      if (!out[g]) out[g] = []
      out[g].push(col)
    }
    return out
  }, [available])

  const visibleSet = new Set(value)

  function toggle(key: string) {
    if (visibleSet.has(key)) {
      onChange(value.filter((k) => k !== key))
    } else {
      onChange([...value, key])
    }
  }

  function resetDefaults() {
    onChange(defaultOn)
  }

  const groupOrder: Array<NonNullable<ColumnDef['group']>> = ['basic', 'codes', 'pricing', 'stock', 'physical', 'meta', 'spec']

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen((v) => !v)}
        className="inline-flex items-center gap-1.5 h-9 px-3 rounded-md bg-white border border-[#E5E5E5] text-[#1F2937] hover:bg-[#F8F8F8] text-[13px] font-semibold"
        title="Configurar columnas visibles"
      >
        <Settings2 className="w-4 h-4" />
        Columnas ({value.length})
      </button>

      {open && (
        <div className="absolute right-0 mt-1 w-80 max-h-[70vh] overflow-y-auto z-50 rounded-md bg-white border border-[#E5E5E5] shadow-lg p-2">
          <div className="flex items-center justify-between px-2 py-1.5 mb-1 border-b border-[#F3F4F6]">
            <span className="text-xs font-semibold uppercase tracking-wide text-[#6B7280]">Columnas visibles</span>
            <button
              onClick={resetDefaults}
              className="inline-flex items-center gap-1 text-[11px] text-[#FF6600] hover:underline"
              title="Restaurar columnas por defecto"
            >
              <RotateCcw className="w-3 h-3" /> Restaurar
            </button>
          </div>

          {groupOrder.map((g) => {
            const cols = grouped[g]
            if (!cols || cols.length === 0) return null
            return (
              <div key={g} className="mb-1.5">
                <div className="px-2 py-1 text-[10px] font-bold uppercase tracking-wider text-[#9CA3AF]">{GROUP_LABEL[g]}</div>
                {cols.map((col) => {
                  const checked = visibleSet.has(col.key)
                  return (
                    <button
                      key={col.key}
                      onClick={() => toggle(col.key)}
                      className="w-full flex items-center gap-2 px-2 py-1.5 rounded text-sm text-[#1F2937] hover:bg-[#F8F8F8] text-left"
                    >
                      <div className={`w-4 h-4 rounded border flex items-center justify-center flex-shrink-0 ${
                        checked ? 'bg-[#FF6600] border-[#FF6600]' : 'border-[#D1D5DB]'
                      }`}>
                        {checked && <Check className="w-3 h-3 text-white" />}
                      </div>
                      <span className="flex-1">{col.label}</span>
                    </button>
                  )
                })}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
