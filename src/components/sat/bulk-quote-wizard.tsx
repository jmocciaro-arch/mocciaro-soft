'use client'

import { useState, useMemo, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { useSatAssets } from '@/hooks/use-sat-assets'
import { TIPOS_COT } from '@/lib/sat/fein-data'
import { fmtNumber } from '@/lib/sat/currency-converter'
import { useCompanyFilter } from '@/hooks/use-company-filter'
import { useToast } from '@/components/ui/toast'

type LoteItem = { tipo: string; desc: string; cant: number; precio: number }
type LoteData = { cliente: string; refs: string[]; items: Record<string, LoteItem[]> }

interface Props {
  initialData?: Partial<LoteData>
  onSaved?: (loteId: string) => void
  onCancel: () => void
}

/**
 * Wizard de 3 pasos para cotizacion por lotes multi-equipo:
 *   1) Seleccionar cliente + activos
 *   2) Agregar items por activo
 *   3) Resumen + guardar
 */
export function BulkQuoteWizard({ initialData, onSaved, onCancel }: Props) {
  const [step, setStep] = useState(0)
  const [data, setData] = useState<LoteData>({
    cliente: initialData?.cliente || '',
    refs: initialData?.refs || [],
    items: initialData?.items || {},
  })
  const [clientes, setClientes] = useState<Array<{ id: string; name: string }>>([])
  const { assets } = useSatAssets()
  const { activeCompanyId } = useCompanyFilter() as any
  const { addToast } = useToast()

  useEffect(() => {
    (async () => {
      const sb = createClient()
      const { data } = await sb.from('tt_clients').select('id, name').eq('active', true).order('name').limit(1000)
      setClientes(data || [])
    })()
  }, [])

  const clienteActivos = useMemo(() => {
    if (!data.cliente) return []
    return assets.filter((a) => (a.tt_clients?.name || a.client_name_raw) === data.cliente)
  }, [assets, data.cliente])

  const total = useMemo(() => {
    return Object.values(data.items).flat().reduce((s, i) => s + (i.cant || 0) * (i.precio || 0), 0)
  }, [data.items])

  const toggleRef = (ref: string) => {
    setData((d) => {
      const refs = d.refs.includes(ref) ? d.refs.filter((r) => r !== ref) : [...d.refs, ref]
      return { ...d, refs, items: { ...d.items, [ref]: d.items[ref] || [] } }
    })
  }

  const addItem = (ref: string) => {
    setData((d) => ({
      ...d,
      items: { ...d.items, [ref]: [...(d.items[ref] || []), { tipo: 'MANO DE OBRA', desc: '', cant: 1, precio: 0 }] },
    }))
  }

  const updItem = (ref: string, idx: number, field: keyof LoteItem, value: string | number) => {
    setData((d) => {
      const items = { ...d.items }
      const arr = [...(items[ref] || [])]
      arr[idx] = { ...arr[idx], [field]: value as any }
      items[ref] = arr
      return { ...d, items }
    })
  }

  const remItem = (ref: string, idx: number) => {
    setData((d) => {
      const items = { ...d.items }
      items[ref] = (items[ref] || []).filter((_, i) => i !== idx)
      return { ...d, items }
    })
  }

  const save = async () => {
    if (!data.cliente || data.refs.length === 0) {
      addToast({ type: 'warning', title: 'Faltan datos', message: 'Completa cliente y activos.' })
      return
    }
    const sb = createClient()
    const cliente = clientes.find((c) => c.name === data.cliente)
    const yr = new Date().getFullYear().toString().slice(-2)
    const mo = (new Date().getMonth() + 1).toString().padStart(2, '0')
    const seq = Math.floor(Math.random() * 9999).toString().padStart(4, '0')
    const loteId = `LOTE-${yr}${mo}-${seq}`

    // Resolver asset_ids a partir de refs
    const assetsByRef = new Map(assets.map((a) => [a.ref, a.id]))
    const asset_ids = data.refs.map((r) => assetsByRef.get(r)).filter(Boolean) as string[]

    const { error } = await sb.from('tt_sat_bulk_quotes').insert({
      lote_id: loteId,
      client_id: cliente?.id || null,
      asset_ids,
      items: data.items as any,
      status: 'pendiente',
      total_amount: total,
      currency: 'USD',
      company_id: activeCompanyId,
    } as any)
    if (error) {
      addToast({ type: 'error', title: 'Error', message: error.message })
      return
    }
    addToast({ type: 'success', title: 'Lote creado', message: loteId })
    onSaved?.(loteId)
  }

  return (
    <div className="space-y-4">
      {/* Stepper */}
      <div className="flex gap-2">
        {['Cliente + activos', 'Items por equipo', 'Resumen'].map((l, i) => (
          <div
            key={l}
            className={`flex-1 text-center py-2 rounded-lg text-sm font-semibold ${
              i === step ? 'bg-orange-500/10 text-orange-400 border border-orange-500' :
              i < step ? 'bg-green-500/10 text-green-400 border border-green-500/30' :
                         'bg-[#1E2330] text-[#6B7280] border border-[#2A3040]'
            }`}
          >
            {i + 1}. {l}
          </div>
        ))}
      </div>

      {step === 0 && (
        <Card>
          <div className="fg mb-3">
            <label>Cliente</label>
            <select value={data.cliente} onChange={(e) => setData((d) => ({ ...d, cliente: e.target.value, refs: [], items: {} }))}>
              <option value="">— elegir cliente —</option>
              {clientes.map((c) => <option key={c.id}>{c.name}</option>)}
            </select>
          </div>

          {data.cliente && (
            <>
              <div className="text-xs uppercase tracking-wide text-[#6B7280] font-bold mb-2">
                Seleccionar herramientas a cotizar ({clienteActivos.length} disponibles)
              </div>
              <div className="space-y-1 max-h-80 overflow-y-auto">
                {clienteActivos.map((a) => (
                  <label key={a.id} className="flex items-center gap-2 p-2 bg-[#1E2330] border border-[#2A3040] rounded-lg cursor-pointer text-sm">
                    <input
                      type="checkbox"
                      checked={data.refs.includes(a.ref)}
                      onChange={() => toggleRef(a.ref)}
                      className="accent-orange-500"
                    />
                    <span className="td-ref" style={{ fontFamily: 'var(--sat-mo)', color: 'var(--sat-or)' }}>{a.ref}</span>
                    <span className="text-[#D1D5DB]">{a.internal_id || '–'}</span>
                    <span style={{ fontFamily: 'var(--sat-mo)', color: 'var(--sat-bl)', fontSize: 13 }}>{a.model_normalized}</span>
                    <span className="text-xs text-[#6B7280]">{a.serial_number || ''}</span>
                  </label>
                ))}
              </div>
            </>
          )}
        </Card>
      )}

      {step === 1 && (
        <Card>
          <div className="space-y-4">
            {data.refs.map((ref) => {
              const a = assets.find((x) => x.ref === ref)
              const items = data.items[ref] || []
              return (
                <div key={ref} className="border border-[#2A3040] rounded-lg p-3 bg-[#1E2330]">
                  <div className="flex items-center justify-between mb-2">
                    <div>
                      <span style={{ fontFamily: 'var(--sat-mo)', color: 'var(--sat-or)', fontWeight: 600 }}>{ref}</span>
                      <span className="text-[#D1D5DB] ml-2">{a?.internal_id || ''}</span>
                      <span className="text-xs text-[#6B7280] ml-2">{a?.model_normalized}</span>
                    </div>
                  </div>
                  <table className="sat-table" style={{ fontSize: 13 }}>
                    <thead>
                      <tr>
                        <th style={{ width: 140 }}>Tipo</th>
                        <th>Descripcion</th>
                        <th style={{ width: 70 }}>Cant.</th>
                        <th style={{ width: 90 }}>Precio</th>
                        <th style={{ width: 90 }}>Total</th>
                        <th style={{ width: 40 }}></th>
                      </tr>
                    </thead>
                    <tbody>
                      {items.map((it, idx) => (
                        <tr key={idx}>
                          <td>
                            <select value={it.tipo} onChange={(e) => updItem(ref, idx, 'tipo', e.target.value)} style={{ width: '100%', padding: '3px 6px' }}>
                              {TIPOS_COT.map((t) => <option key={t}>{t}</option>)}
                            </select>
                          </td>
                          <td>
                            <input
                              value={it.desc}
                              onChange={(e) => updItem(ref, idx, 'desc', e.target.value)}
                              placeholder="Descripcion"
                              style={{ width: '100%', padding: '3px 6px' }}
                            />
                          </td>
                          <td>
                            <input
                              type="number" min="1" value={it.cant}
                              onChange={(e) => updItem(ref, idx, 'cant', Number(e.target.value))}
                              style={{ width: '100%', padding: '3px 6px' }}
                            />
                          </td>
                          <td>
                            <input
                              type="number" min="0" step="0.01" value={it.precio}
                              onChange={(e) => updItem(ref, idx, 'precio', Number(e.target.value))}
                              style={{ width: '100%', padding: '3px 6px' }}
                            />
                          </td>
                          <td style={{ fontFamily: 'var(--sat-mo)', color: 'var(--sat-or)' }}>$ {fmtNumber(it.cant * it.precio)}</td>
                          <td>
                            <button
                              type="button"
                              onClick={() => remItem(ref, idx)}
                              style={{ background: 'var(--sat-rd-d)', color: 'var(--sat-rd)', border: 'none', borderRadius: 4, padding: '2px 6px', cursor: 'pointer' }}
                            >✕</button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  <button
                    type="button"
                    onClick={() => addItem(ref)}
                    className="mt-2 text-sm text-orange-400 hover:text-orange-300 font-semibold"
                  >+ Agregar item</button>
                </div>
              )
            })}
          </div>
        </Card>
      )}

      {step === 2 && (
        <Card>
          <div className="text-sm text-[#9CA3AF] mb-3">
            Cliente: <strong className="text-[#F0F2F5]">{data.cliente}</strong> — {data.refs.length} equipo(s)
          </div>
          {data.refs.map((ref) => {
            const a = assets.find((x) => x.ref === ref)
            const items = data.items[ref] || []
            const sub = items.reduce((s, i) => s + i.cant * i.precio, 0)
            return (
              <div key={ref} className="mb-3 border border-[#2A3040] rounded-lg p-3 bg-[#1E2330]">
                <div className="flex items-center justify-between mb-1.5">
                  <span><strong style={{ color: 'var(--sat-or)', fontFamily: 'var(--sat-mo)' }}>{ref}</strong> — {a?.internal_id} <span className="text-xs text-[#6B7280]">{a?.model_normalized}</span></span>
                  <span style={{ color: 'var(--sat-or)', fontFamily: 'var(--sat-mo)' }}>$ {fmtNumber(sub)}</span>
                </div>
                {items.length === 0 ? (
                  <div className="text-xs text-[#6B7280]">Sin items</div>
                ) : (
                  <ul className="text-xs text-[#9CA3AF] space-y-0.5">
                    {items.map((it, i) => (
                      <li key={i}>{it.desc} ({it.tipo}) x{it.cant} — $ {fmtNumber(it.cant * it.precio)}</li>
                    ))}
                  </ul>
                )}
              </div>
            )
          })}
          <div className="mt-4 flex justify-between items-center p-3 bg-orange-500/10 border border-orange-500/30 rounded-lg">
            <span className="text-sm font-bold uppercase text-orange-400">Total lote</span>
            <span className="text-2xl font-bold text-orange-400" style={{ fontFamily: 'var(--sat-mo)' }}>$ {fmtNumber(total)}</span>
          </div>
        </Card>
      )}

      <div className="flex justify-between gap-2">
        <Button variant="secondary" onClick={onCancel}>Cancelar</Button>
        <div className="flex gap-2">
          {step > 0 && <Button variant="secondary" onClick={() => setStep((s) => s - 1)}>← Volver</Button>}
          {step < 2 ? (
            <Button onClick={() => setStep((s) => s + 1)} disabled={step === 0 && (!data.cliente || !data.refs.length)}>
              Siguiente →
            </Button>
          ) : (
            <Button onClick={save}>Guardar lote</Button>
          )}
        </div>
      </div>
    </div>
  )
}
