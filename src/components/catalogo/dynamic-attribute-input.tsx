'use client'

import { useState } from 'react'
import { Plus, X, Check } from 'lucide-react'
import type { CatalogAttribute, CatalogAttributeValue } from '@/hooks/use-catalog-presets'

interface Props {
  attribute: CatalogAttribute & { is_required: boolean }
  value: string | number | boolean | null
  onChange: (value: string | number | boolean | null) => void
  values: CatalogAttributeValue[]
  isAdmin: boolean
  onAddValue?: (attributeCode: string, newValue: string) => Promise<boolean>
}

/**
 * Renderiza el input apropiado según el tipo de atributo:
 * - select: dropdown con valores predefinidos + botón "+" si admin
 * - number: input numérico con unidad
 * - text: input de texto
 * - boolean: switch
 */
export function DynamicAttributeInput({ attribute, value, onChange, values, isAdmin, onAddValue }: Props) {
  const [addingNew, setAddingNew] = useState(false)
  const [newValue, setNewValue] = useState('')
  const [saving, setSaving] = useState(false)

  const handleAddValue = async () => {
    if (!newValue.trim() || !onAddValue) return
    setSaving(true)
    const ok = await onAddValue(attribute.code, newValue.trim())
    setSaving(false)
    if (ok) {
      onChange(newValue.trim())
      setNewValue('')
      setAddingNew(false)
    }
  }

  const label = (
    <div className="flex items-center justify-between mb-1.5">
      <label className="block text-sm font-medium text-[#9CA3AF]">
        {attribute.name}
        {attribute.unit && <span className="text-[10px] text-[#4B5563] ml-1">({attribute.unit})</span>}
        {attribute.is_required && <span className="text-red-400 ml-1">*</span>}
      </label>
      {isAdmin && attribute.type === 'select' && !addingNew && onAddValue && (
        <button
          type="button"
          onClick={() => setAddingNew(true)}
          className="text-[10px] font-semibold text-[#FF6600] hover:text-[#FF8833] flex items-center gap-1"
        >
          <Plus size={10} /> Nuevo
        </button>
      )}
    </div>
  )

  // Agregar nuevo valor (admin)
  if (addingNew) {
    return (
      <div>
        {label}
        <div className="flex gap-1.5">
          <input
            type="text"
            autoFocus
            value={newValue}
            onChange={(e) => setNewValue(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') { e.preventDefault(); handleAddValue() }
              if (e.key === 'Escape') { setAddingNew(false); setNewValue('') }
            }}
            placeholder={`Nuevo valor para ${attribute.name}...`}
            className="flex-1 h-10 rounded-lg bg-[#1E2330] border-2 border-[#FF6600]/50 px-3 text-sm text-[#F0F2F5] placeholder:text-[#4B5563] focus:outline-none focus:ring-2 focus:ring-orange-500/50 focus:border-orange-500"
          />
          <button
            type="button"
            onClick={handleAddValue}
            disabled={!newValue.trim() || saving}
            className="h-10 px-3 rounded-lg bg-[#FF6600] hover:bg-[#E55A00] text-white text-xs font-bold disabled:opacity-50"
          >
            <Check size={14} />
          </button>
          <button
            type="button"
            onClick={() => { setAddingNew(false); setNewValue('') }}
            className="h-10 px-3 rounded-lg bg-[#1E2330] hover:bg-[#2A3040] text-[#9CA3AF] text-xs"
          >
            <X size={14} />
          </button>
        </div>
      </div>
    )
  }

  // Select: dropdown con valores
  if (attribute.type === 'select') {
    return (
      <div>
        {label}
        <select
          value={value != null ? String(value) : ''}
          onChange={(e) => onChange(e.target.value || null)}
          className="w-full h-10 rounded-lg bg-[#1E2330] border border-[#2A3040] px-3 text-sm text-[#F0F2F5] focus:outline-none focus:ring-2 focus:ring-orange-500/50 focus:border-orange-500/50 appearance-none"
        >
          <option value="">— Seleccionar —</option>
          {values.map(v => (
            <option key={v.id} value={v.value}>{v.label || v.value}</option>
          ))}
        </select>
      </div>
    )
  }

  // Number: input numérico
  if (attribute.type === 'number' || attribute.type === 'range') {
    return (
      <div>
        {label}
        <div className="relative">
          <input
            type="number"
            step="any"
            value={value != null ? String(value) : ''}
            onChange={(e) => onChange(e.target.value ? parseFloat(e.target.value) : null)}
            placeholder="0"
            className="w-full h-10 rounded-lg bg-[#1E2330] border border-[#2A3040] px-3 pr-12 text-sm text-[#F0F2F5] placeholder:text-[#4B5563] focus:outline-none focus:ring-2 focus:ring-orange-500/50 focus:border-orange-500/50"
          />
          {attribute.unit && (
            <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-[#6B7280] pointer-events-none">
              {attribute.unit}
            </span>
          )}
        </div>
      </div>
    )
  }

  // Boolean: switch
  if (attribute.type === 'boolean') {
    const isOn = value === true || value === 'true' || value === 1 || value === '1'
    return (
      <div>
        {label}
        <div
          role="button"
          onClick={() => onChange(isOn ? null : true)}
          className={`w-full h-10 rounded-lg border px-3 flex items-center gap-3 cursor-pointer transition-all ${isOn ? 'border-emerald-500/50 bg-emerald-500/10' : 'border-[#2A3040] bg-[#1E2330]'}`}
        >
          <div className={`w-9 h-5 rounded-full relative ${isOn ? 'bg-emerald-500' : 'bg-[#2A3040]'}`}>
            <div className={`absolute top-0.5 w-4 h-4 rounded-full bg-white transition-all ${isOn ? 'left-[1.125rem]' : 'left-0.5'}`} />
          </div>
          <span className="text-sm text-[#F0F2F5]">{isOn ? 'Sí' : 'No'}</span>
        </div>
      </div>
    )
  }

  // Text (default)
  return (
    <div>
      {label}
      <input
        type="text"
        value={value != null ? String(value) : ''}
        onChange={(e) => onChange(e.target.value || null)}
        placeholder={`Ingresar ${attribute.name.toLowerCase()}...`}
        className="w-full h-10 rounded-lg bg-[#1E2330] border border-[#2A3040] px-3 text-sm text-[#F0F2F5] placeholder:text-[#4B5563] focus:outline-none focus:ring-2 focus:ring-orange-500/50 focus:border-orange-500/50"
      />
    </div>
  )
}
