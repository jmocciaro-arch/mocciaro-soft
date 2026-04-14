'use client'

import { Input } from '@/components/ui/input'
import { Select } from '@/components/ui/select'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Plus, Trash2, DollarSign } from 'lucide-react'
import { formatCurrency } from '@/lib/utils'
import type { CotizacionData, CotizacionItem } from '../sat-workflow-types'

interface StepCotizacionProps {
  data: CotizacionData
  onChange: (data: CotizacionData) => void
  readOnly?: boolean
}

const CURRENCIES = [
  { value: 'EUR', label: 'EUR (€)' },
  { value: 'USD', label: 'USD ($)' },
  { value: 'ARS', label: 'ARS ($)' },
]

function generateId() {
  return Math.random().toString(36).slice(2, 10)
}

export function StepCotizacion({ data, onChange, readOnly }: StepCotizacionProps) {
  const update = (partial: Partial<CotizacionData>) => {
    const next = { ...data, ...partial }
    // Recalculate totals
    next.total_parts = next.items.reduce((sum, it) => sum + it.subtotal, 0)
    next.total_labor = next.labor_hours * next.labor_rate
    const subtotal = next.total_parts + next.total_labor
    next.total = subtotal - (subtotal * next.discount_percent / 100)
    onChange(next)
  }

  const addItem = () => {
    const items = [...data.items, {
      id: generateId(),
      description: '',
      part_number: '',
      quantity: 1,
      unit_price: 0,
      currency: 'EUR' as const,
      subtotal: 0,
    }]
    update({ items })
  }

  const removeItem = (id: string) => {
    update({ items: data.items.filter(it => it.id !== id) })
  }

  const updateItem = (id: string, field: keyof CotizacionItem, value: string | number) => {
    const items = data.items.map(it => {
      if (it.id !== id) return it
      const updated = { ...it, [field]: value }
      updated.subtotal = updated.quantity * updated.unit_price
      return updated
    })
    update({ items })
  }

  return (
    <div className="space-y-6">
      {/* Spare Parts Table */}
      <Card>
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-sm font-semibold text-[#F59E0B] flex items-center gap-2">
            <DollarSign size={16} /> Repuestos y materiales
          </h3>
          {!readOnly && (
            <Button variant="secondary" size="sm" onClick={addItem}>
              <Plus size={14} /> Agregar item
            </Button>
          )}
        </div>

        {data.items.length === 0 ? (
          <div className="text-center py-8 text-[#6B7280] text-sm">
            Sin repuestos. Hace clic en &ldquo;Agregar item&rdquo; para sumar.
          </div>
        ) : (
          <div className="space-y-3">
            {data.items.map((item) => (
              <div
                key={item.id}
                className="grid grid-cols-12 gap-2 items-end p-3 rounded-lg bg-[#0F1218] border border-[#1E2330]"
              >
                <div className="col-span-12 md:col-span-3">
                  <label className="block text-[10px] text-[#6B7280] mb-1">Descripcion</label>
                  <input
                    value={item.description}
                    onChange={(e) => updateItem(item.id, 'description', e.target.value)}
                    className="w-full h-8 rounded bg-[#1E2330] border border-[#2A3040] px-2 text-xs text-[#F0F2F5] placeholder:text-[#4B5563] focus:outline-none focus:ring-1 focus:ring-orange-500/50"
                    placeholder="Nombre del repuesto"
                    readOnly={readOnly}
                  />
                </div>
                <div className="col-span-6 md:col-span-2">
                  <label className="block text-[10px] text-[#6B7280] mb-1">Part Number</label>
                  <input
                    value={item.part_number}
                    onChange={(e) => updateItem(item.id, 'part_number', e.target.value)}
                    className="w-full h-8 rounded bg-[#1E2330] border border-[#2A3040] px-2 text-xs text-[#F0F2F5] font-mono placeholder:text-[#4B5563] focus:outline-none focus:ring-1 focus:ring-orange-500/50"
                    placeholder="PN-000"
                    readOnly={readOnly}
                  />
                </div>
                <div className="col-span-3 md:col-span-1">
                  <label className="block text-[10px] text-[#6B7280] mb-1">Cant</label>
                  <input
                    type="number"
                    min={1}
                    value={item.quantity}
                    onChange={(e) => updateItem(item.id, 'quantity', parseInt(e.target.value) || 1)}
                    className="w-full h-8 rounded bg-[#1E2330] border border-[#2A3040] px-2 text-xs text-[#F0F2F5] focus:outline-none focus:ring-1 focus:ring-orange-500/50"
                    readOnly={readOnly}
                  />
                </div>
                <div className="col-span-3 md:col-span-2">
                  <label className="block text-[10px] text-[#6B7280] mb-1">Precio unit.</label>
                  <input
                    type="number"
                    min={0}
                    step={0.01}
                    value={item.unit_price || ''}
                    onChange={(e) => updateItem(item.id, 'unit_price', parseFloat(e.target.value) || 0)}
                    className="w-full h-8 rounded bg-[#1E2330] border border-[#2A3040] px-2 text-xs text-[#F0F2F5] focus:outline-none focus:ring-1 focus:ring-orange-500/50"
                    readOnly={readOnly}
                  />
                </div>
                <div className="col-span-4 md:col-span-2">
                  <label className="block text-[10px] text-[#6B7280] mb-1">Moneda</label>
                  <select
                    value={item.currency}
                    onChange={(e) => updateItem(item.id, 'currency', e.target.value)}
                    disabled={readOnly}
                    className="w-full h-8 rounded bg-[#1E2330] border border-[#2A3040] px-2 text-xs text-[#F0F2F5] focus:outline-none focus:ring-1 focus:ring-orange-500/50"
                  >
                    {CURRENCIES.map(c => <option key={c.value} value={c.value}>{c.label}</option>)}
                  </select>
                </div>
                <div className="col-span-6 md:col-span-1 flex items-center justify-between">
                  <span className="text-xs font-medium text-[#F59E0B]">
                    {formatCurrency(item.subtotal, item.currency as 'EUR' | 'USD' | 'ARS')}
                  </span>
                  {!readOnly && (
                    <button
                      onClick={() => removeItem(item.id)}
                      className="p-1 rounded hover:bg-red-500/10 text-red-400 transition-colors"
                    >
                      <Trash2 size={14} />
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </Card>

      {/* Labor */}
      <Card>
        <h3 className="text-sm font-semibold text-[#F59E0B] mb-4">Mano de obra</h3>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <Input
            label="Horas estimadas"
            type="number"
            min={0}
            step={0.5}
            value={data.labor_hours || ''}
            onChange={(e) => update({ labor_hours: parseFloat(e.target.value) || 0 })}
            readOnly={readOnly}
          />
          <Input
            label="Tarifa / hora"
            type="number"
            min={0}
            step={0.01}
            value={data.labor_rate || ''}
            onChange={(e) => update({ labor_rate: parseFloat(e.target.value) || 0 })}
            readOnly={readOnly}
          />
          <Select
            label="Moneda MO"
            options={CURRENCIES}
            value={data.labor_currency}
            onChange={(e) => update({ labor_currency: e.target.value as 'EUR' | 'USD' | 'ARS' })}
            disabled={readOnly}
          />
        </div>
      </Card>

      {/* Discount & Total */}
      <Card>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <Input
            label="Descuento (%)"
            type="number"
            min={0}
            max={100}
            value={data.discount_percent || ''}
            onChange={(e) => update({ discount_percent: parseFloat(e.target.value) || 0 })}
            readOnly={readOnly}
          />
          <div>
            <label className="block text-sm font-medium text-[#9CA3AF] mb-1.5">Notas</label>
            <textarea
              value={data.notes}
              onChange={(e) => update({ notes: e.target.value })}
              className="w-full h-20 rounded-lg bg-[#1E2330] border border-[#2A3040] px-3 py-2 text-sm text-[#F0F2F5] placeholder:text-[#4B5563] focus:outline-none focus:ring-2 focus:ring-orange-500/50 resize-none"
              placeholder="Condiciones, plazos de entrega..."
              readOnly={readOnly}
            />
          </div>
        </div>

        {/* Summary */}
        <div className="mt-4 pt-4 border-t border-[#1E2330] space-y-2">
          <div className="flex justify-between text-sm">
            <span className="text-[#9CA3AF]">Repuestos</span>
            <span className="text-[#F0F2F5]">{formatCurrency(data.total_parts, 'EUR')}</span>
          </div>
          <div className="flex justify-between text-sm">
            <span className="text-[#9CA3AF]">Mano de obra ({data.labor_hours}h)</span>
            <span className="text-[#F0F2F5]">{formatCurrency(data.total_labor, data.labor_currency)}</span>
          </div>
          {data.discount_percent > 0 && (
            <div className="flex justify-between text-sm">
              <span className="text-[#9CA3AF]">Descuento ({data.discount_percent}%)</span>
              <span className="text-red-400">-{formatCurrency((data.total_parts + data.total_labor) * data.discount_percent / 100, 'EUR')}</span>
            </div>
          )}
          <div className="flex justify-between text-base font-bold pt-2 border-t border-[#2A3040]">
            <span className="text-[#F59E0B]">Total estimado</span>
            <span className="text-[#F59E0B]">{formatCurrency(data.total, 'EUR')}</span>
          </div>
        </div>
      </Card>
    </div>
  )
}
