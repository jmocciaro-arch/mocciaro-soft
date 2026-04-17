'use client'

import { useState, useCallback } from 'react'
import { Plus, Trash2, Package } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { SparePartsPicker } from '@/components/sat/spare-parts-picker'
import { TIPOS_COT, CURRENCY_SYMBOL, type Currency } from '@/lib/sat/fein-data'
import { convert, fmtNumber } from '@/lib/sat/currency-converter'
import type { SparePart } from '@/hooks/use-spare-parts'
import type { CotizacionData, CotizacionItem } from '../sat-workflow-types'
import { COT_STATUS, type CotStatus } from '@/lib/sat/fein-data'

interface StepCotizacionProps {
  data: CotizacionData
  onChange: (data: CotizacionData) => void
  readOnly?: boolean
  modelCompat?: string | null
}

function genId() {
  return Math.random().toString(36).slice(2, 10)
}

type ItemTipo = typeof TIPOS_COT[number]

// Extensión local para soportar "tipo". Se guarda como prefijo en description
function parseTipo(desc: string): { tipo: ItemTipo; rest: string } {
  for (const t of TIPOS_COT) {
    const prefix = `[${t}] `
    if (desc.startsWith(prefix)) return { tipo: t, rest: desc.slice(prefix.length) }
  }
  return { tipo: 'REPUESTO', rest: desc }
}

function buildDesc(tipo: ItemTipo, rest: string): string {
  return `[${tipo}] ${rest}`
}

const STATUS_VARIANTS: Record<CotStatus, 'default' | 'warning' | 'info' | 'success' | 'danger'> = {
  PENDIENTE: 'warning',
  ENVIADA: 'info',
  APROBADA: 'success',
  RECHAZADA: 'danger',
}

function recomputeTotals(d: CotizacionData): CotizacionData {
  const total_parts = d.items.reduce((s, it) => s + (it.subtotal || 0), 0)
  const total_labor = (d.labor_hours || 0) * (d.labor_rate || 0)
  const subtotal = total_parts + total_labor
  const total = subtotal - (subtotal * (d.discount_percent || 0)) / 100
  return { ...d, total_parts, total_labor, total }
}

export function StepCotizacion({ data, onChange, readOnly, modelCompat }: StepCotizacionProps) {
  const [pickerOpen, setPickerOpen] = useState(false)
  const [displayCurrency, setDisplayCurrency] = useState<Currency>(data.labor_currency as Currency)
  const [status, setStatus] = useState<CotStatus>('PENDIENTE')

  const update = useCallback((partial: Partial<CotizacionData>) => {
    onChange(recomputeTotals({ ...data, ...partial }))
  }, [data, onChange])

  // Cambio de moneda global: convierte precios de items y labor
  const switchCurrency = (next: Currency) => {
    if (next === displayCurrency) return
    const items = data.items.map((it) => {
      const newPrice = convert(it.unit_price || 0, it.currency, next)
      const quantity = it.quantity || 0
      return {
        ...it,
        currency: next,
        unit_price: newPrice,
        subtotal: Math.round(newPrice * quantity * 100) / 100,
      }
    })
    const newLaborRate = convert(data.labor_rate || 0, data.labor_currency, next)
    setDisplayCurrency(next)
    update({ items, labor_currency: next, labor_rate: newLaborRate })
  }

  const addEmptyItem = () => {
    const item: CotizacionItem = {
      id: genId(),
      description: buildDesc('REPUESTO', ''),
      part_number: '',
      quantity: 1,
      unit_price: 0,
      currency: displayCurrency,
      subtotal: 0,
    }
    update({ items: [...data.items, item] })
  }

  const addFromSparePart = (part: SparePart) => {
    const desc = [part.pos, part.descripcion, part.codigo].filter(Boolean).join(' · ')
    const price = convert(part.precio_venta || 0, 'USD', displayCurrency)
    const item: CotizacionItem = {
      id: genId(),
      description: buildDesc('REPUESTO', desc),
      part_number: part.codigo || '',
      quantity: 1,
      unit_price: price,
      currency: displayCurrency,
      subtotal: Math.round(price * 100) / 100,
    }
    update({ items: [...data.items, item] })
  }

  const removeItem = (id: string) => {
    update({ items: data.items.filter((it) => it.id !== id) })
  }

  const updateItem = (id: string, patch: Partial<CotizacionItem>) => {
    const items = data.items.map((it) => {
      if (it.id !== id) return it
      const next = { ...it, ...patch }
      next.subtotal = Math.round((next.quantity || 0) * (next.unit_price || 0) * 100) / 100
      return next
    })
    update({ items })
  }

  const updateItemTipo = (id: string, tipo: ItemTipo) => {
    const it = data.items.find((x) => x.id === id)
    if (!it) return
    const { rest } = parseTipo(it.description)
    updateItem(id, { description: buildDesc(tipo, rest) })
  }

  const updateItemText = (id: string, text: string) => {
    const it = data.items.find((x) => x.id === id)
    if (!it) return
    const { tipo } = parseTipo(it.description)
    updateItem(id, { description: buildDesc(tipo, text) })
  }

  const cycleStatus = () => {
    if (readOnly) return
    const idx = COT_STATUS.indexOf(status)
    const next = COT_STATUS[(idx + 1) % COT_STATUS.length]
    setStatus(next)
  }

  const sym = CURRENCY_SYMBOL[displayCurrency]

  return (
    <div className="space-y-4">
      {/* Header con estado + moneda */}
      <div
        style={{
          background: 'var(--sat-dk2)',
          border: '1px solid var(--sat-br)',
          borderRadius: 12,
          padding: 16,
        }}
        className="flex flex-wrap items-center justify-between gap-3"
      >
        <div className="flex items-center gap-3">
          <div className="sn sn-a" style={{ margin: 0 }}>Cotización</div>
          <button
            type="button"
            onClick={cycleStatus}
            disabled={readOnly}
            style={{ background: 'transparent', border: 'none', padding: 0, cursor: readOnly ? 'default' : 'pointer' }}
            title="Click para cambiar estado"
          >
            <Badge variant={STATUS_VARIANTS[status]} size="md">{status}</Badge>
          </button>
        </div>
        <div className="fg" style={{ margin: 0, minWidth: 140 }}>
          <label>Moneda visualización</label>
          <select
            value={displayCurrency}
            onChange={(e) => switchCurrency(e.target.value as Currency)}
            disabled={readOnly}
          >
            <option value="USD">USD $</option>
            <option value="EUR">€ EUR</option>
            <option value="ARS">ARS $</option>
          </select>
        </div>
      </div>

      {/* Ítems */}
      <div
        style={{
          background: 'var(--sat-dk2)',
          border: '1px solid var(--sat-br)',
          borderRadius: 12,
          padding: 16,
        }}
      >
        <div className="flex items-center justify-between" style={{ marginBottom: 12 }}>
          <div className="sn sn-a" style={{ margin: 0 }}>Ítems de cotización</div>
          {!readOnly && (
            <div className="flex gap-2">
              <button
                type="button"
                onClick={addEmptyItem}
                style={{
                  background: 'var(--sat-dk3)',
                  border: '1px solid var(--sat-br)',
                  color: 'var(--sat-tx)',
                  padding: '6px 12px',
                  borderRadius: 8,
                  fontSize: 13,
                  cursor: 'pointer',
                  display: 'inline-flex', alignItems: 'center', gap: 6,
                }}
              >
                <Plus size={14} /> Ítem vacío
              </button>
              <button
                type="button"
                onClick={() => setPickerOpen(true)}
                style={{
                  background: 'var(--sat-or)',
                  border: '1px solid var(--sat-or)',
                  color: '#111',
                  padding: '6px 12px',
                  borderRadius: 8,
                  fontSize: 13,
                  fontWeight: 700,
                  cursor: 'pointer',
                  display: 'inline-flex', alignItems: 'center', gap: 6,
                }}
              >
                <Package size={14} /> Repuesto
              </button>
            </div>
          )}
        </div>

        <div style={{ overflowX: 'auto' }}>
          <table className="sat-table" style={{ fontSize: 13, minWidth: 720 }}>
            <thead>
              <tr>
                <th style={{ width: 130 }}>Tipo</th>
                <th>Descripción</th>
                <th style={{ width: 120 }}>Part number</th>
                <th style={{ width: 70 }}>Cant</th>
                <th style={{ width: 100, textAlign: 'right' }}>Precio</th>
                <th style={{ width: 110, textAlign: 'right' }}>Subtotal</th>
                <th style={{ width: 50 }}></th>
              </tr>
            </thead>
            <tbody>
              {data.items.length === 0 ? (
                <tr>
                  <td colSpan={7} style={{ padding: 24, textAlign: 'center', color: 'var(--sat-tx3)' }}>
                    Sin ítems. Agregá uno con los botones de arriba.
                  </td>
                </tr>
              ) : (
                data.items.map((item) => {
                  const { tipo, rest } = parseTipo(item.description)
                  return (
                    <tr key={item.id}>
                      <td>
                        <select
                          value={tipo}
                          onChange={(e) => updateItemTipo(item.id, e.target.value as ItemTipo)}
                          disabled={readOnly}
                          style={{ width: '100%', padding: '4px 6px' }}
                        >
                          {TIPOS_COT.map((t) => <option key={t} value={t}>{t}</option>)}
                        </select>
                      </td>
                      <td>
                        <input
                          type="text"
                          value={rest}
                          onChange={(e) => updateItemText(item.id, e.target.value)}
                          readOnly={readOnly}
                          placeholder="Descripción..."
                          style={{ width: '100%', padding: '4px 8px' }}
                        />
                      </td>
                      <td>
                        <input
                          type="text"
                          value={item.part_number}
                          onChange={(e) => updateItem(item.id, { part_number: e.target.value })}
                          readOnly={readOnly}
                          placeholder="—"
                          style={{ width: '100%', padding: '4px 8px', fontFamily: 'var(--sat-mo)', fontSize: 12 }}
                        />
                      </td>
                      <td>
                        <input
                          type="number"
                          min={0}
                          step={1}
                          value={item.quantity || ''}
                          onChange={(e) => updateItem(item.id, { quantity: parseFloat(e.target.value) || 0 })}
                          readOnly={readOnly}
                          style={{ width: '100%', padding: '4px 8px' }}
                        />
                      </td>
                      <td>
                        <input
                          type="number"
                          min={0}
                          step={0.01}
                          value={item.unit_price || ''}
                          onChange={(e) => updateItem(item.id, { unit_price: parseFloat(e.target.value) || 0 })}
                          readOnly={readOnly}
                          style={{ width: '100%', padding: '4px 8px', textAlign: 'right' }}
                        />
                      </td>
                      <td style={{
                        textAlign: 'right',
                        fontFamily: 'var(--sat-mo)',
                        color: 'var(--sat-gn)',
                        fontWeight: 700,
                      }}>
                        {sym} {fmtNumber(item.subtotal || 0)}
                      </td>
                      <td style={{ textAlign: 'center' }}>
                        {!readOnly && (
                          <button
                            type="button"
                            onClick={() => removeItem(item.id)}
                            style={{
                              background: 'transparent',
                              border: 'none',
                              color: 'var(--sat-rd)',
                              cursor: 'pointer',
                              padding: 4,
                            }}
                            aria-label="Eliminar"
                          >
                            <Trash2 size={14} />
                          </button>
                        )}
                      </td>
                    </tr>
                  )
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Mano de obra + descuento */}
      <div
        style={{
          background: 'var(--sat-dk2)',
          border: '1px solid var(--sat-br)',
          borderRadius: 12,
          padding: 16,
        }}
      >
        <div className="sn sn-a" style={{ marginBottom: 10 }}>Mano de obra y descuento</div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          <div className="fg">
            <label>Horas</label>
            <input
              type="number"
              min={0}
              step={0.5}
              value={data.labor_hours || ''}
              onChange={(e) => update({ labor_hours: parseFloat(e.target.value) || 0 })}
              readOnly={readOnly}
            />
          </div>
          <div className="fg">
            <label>Tarifa / hora ({sym})</label>
            <input
              type="number"
              min={0}
              step={0.01}
              value={data.labor_rate || ''}
              onChange={(e) => update({ labor_rate: parseFloat(e.target.value) || 0 })}
              readOnly={readOnly}
            />
          </div>
          <div className="fg">
            <label>Moneda MO</label>
            <select
              value={data.labor_currency}
              onChange={(e) => switchCurrency(e.target.value as Currency)}
              disabled={readOnly}
            >
              <option value="USD">USD $</option>
              <option value="EUR">€ EUR</option>
              <option value="ARS">ARS $</option>
            </select>
          </div>
          <div className="fg">
            <label>Descuento %</label>
            <input
              type="number"
              min={0}
              max={100}
              step={0.5}
              value={data.discount_percent || ''}
              onChange={(e) => update({ discount_percent: parseFloat(e.target.value) || 0 })}
              readOnly={readOnly}
            />
          </div>
        </div>
        <div className="fg" style={{ marginTop: 12 }}>
          <label>Notas</label>
          <textarea
            value={data.notes}
            onChange={(e) => update({ notes: e.target.value })}
            readOnly={readOnly}
            placeholder="Condiciones, plazos, observaciones..."
            style={{ minHeight: 70, resize: 'vertical' }}
          />
        </div>
      </div>

      {/* Totales */}
      <div
        style={{
          background: 'var(--sat-dk2)',
          border: '1px solid var(--sat-br)',
          borderRadius: 12,
          padding: 16,
        }}
      >
        <div className="flex flex-col gap-2" style={{ fontSize: 14 }}>
          <div className="flex justify-between">
            <span style={{ color: 'var(--sat-tx3)' }}>Subtotal repuestos</span>
            <span style={{ fontFamily: 'var(--sat-mo)' }}>{sym} {fmtNumber(data.total_parts)}</span>
          </div>
          <div className="flex justify-between">
            <span style={{ color: 'var(--sat-tx3)' }}>Mano de obra ({data.labor_hours || 0}h)</span>
            <span style={{ fontFamily: 'var(--sat-mo)' }}>{sym} {fmtNumber(data.total_labor)}</span>
          </div>
          {(data.discount_percent || 0) > 0 && (
            <div className="flex justify-between" style={{ color: 'var(--sat-rd)' }}>
              <span>Descuento ({data.discount_percent}%)</span>
              <span style={{ fontFamily: 'var(--sat-mo)' }}>
                -{sym} {fmtNumber(((data.total_parts + data.total_labor) * (data.discount_percent || 0)) / 100)}
              </span>
            </div>
          )}
          <div
            className="flex justify-between"
            style={{
              borderTop: '1px solid var(--sat-br)',
              paddingTop: 8,
              marginTop: 4,
              fontSize: 18,
              fontWeight: 700,
              color: 'var(--sat-am)',
            }}
          >
            <span>TOTAL</span>
            <span style={{ fontFamily: 'var(--sat-mo)' }}>{sym} {fmtNumber(data.total)}</span>
          </div>
        </div>
      </div>

      {/* Spare Parts Picker modal */}
      <SparePartsPicker
        open={pickerOpen}
        onClose={() => setPickerOpen(false)}
        modelFilter={modelCompat || null}
        isAdmin={true}
        onPick={addFromSparePart}
      />
    </div>
  )
}
