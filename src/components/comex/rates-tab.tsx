'use client'

import { useState, useEffect, useCallback } from 'react'
import { Modal } from '@/components/ui/modal'
import { Button } from '@/components/ui/button'
import { useToast } from '@/components/ui/toast'
import { Loader2, Pencil, Trash2, Plus } from 'lucide-react'
import { type Carrier, carrierCompanyName } from './carriers-tab'

interface Zone { id: string; code: string; label: string }
interface Rate {
  id: string
  carrier_id: string
  zone_id: string
  weight_from_kg: number
  weight_to_kg: number
  price: number
  per_kg_over: number | null
  currency: string
}

const INPUT = 'w-full bg-surface border border-border-hover rounded-lg px-3 py-2 text-sm text-foreground focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary'
const LABEL = 'block text-[11px] uppercase tracking-wider font-bold text-muted mb-1'

export function RatesTab({ canManage }: { canManage: boolean }) {
  const { addToast } = useToast()
  const [carriers, setCarriers] = useState<Carrier[]>([])
  const [carrierId, setCarrierId] = useState('')
  const [zones, setZones] = useState<Zone[]>([])
  const [zoneId, setZoneId] = useState('')
  const [rates, setRates] = useState<Rate[]>([])
  const [loading, setLoading] = useState(false)
  const [editing, setEditing] = useState<Partial<Rate> | null>(null)
  const [busyId, setBusyId] = useState<string | null>(null)

  useEffect(() => {
    void (async () => {
      const res = await fetch('/api/comex/carriers')
      const json = await res.json().catch(() => ({})) as { data?: Carrier[] }
      const list = (json.data ?? []).filter(c => c.active)
      setCarriers(list)
      if (list.length > 0) setCarrierId(prev => prev || list[0].id)
    })()
  }, [])

  useEffect(() => {
    if (!carrierId) { setZones([]); setZoneId(''); return }
    void (async () => {
      const res = await fetch(`/api/comex/carrier-zones?carrier_id=${carrierId}`)
      const json = await res.json().catch(() => ({})) as { data?: Zone[] }
      const list = json.data ?? []
      setZones(list)
      setZoneId(prev => (list.some(z => z.id === prev) ? prev : (list[0]?.id ?? '')))
    })()
  }, [carrierId])

  const loadRates = useCallback(async () => {
    if (!carrierId || !zoneId) { setRates([]); return }
    setLoading(true)
    try {
      const res = await fetch(`/api/comex/carrier-rates?carrier_id=${carrierId}&zone_id=${zoneId}`)
      const json = await res.json() as { data?: Rate[]; error?: string }
      if (!res.ok) { addToast({ type: 'error', title: 'Error cargando tarifas', message: json.error }); setRates([]); return }
      setRates(json.data ?? [])
    } finally { setLoading(false) }
  }, [carrierId, zoneId, addToast])

  useEffect(() => { void loadRates() }, [loadRates])

  async function remove(rate: Rate) {
    if (!window.confirm(`¿Borrar la banda ${rate.weight_from_kg}–${rate.weight_to_kg} kg?`)) return
    setBusyId(rate.id)
    try {
      const res = await fetch(`/api/comex/carrier-rates/${rate.id}`, { method: 'DELETE' })
      const json = await res.json().catch(() => ({})) as { error?: string }
      if (!res.ok) { addToast({ type: 'error', title: 'No se pudo borrar', message: json.error }); return }
      await loadRates()
    } finally { setBusyId(null) }
  }

  return (
    <div className="space-y-3">
      <div className="flex items-end gap-2 flex-wrap">
        <div className="min-w-[240px]">
          <label className={LABEL}>Courier</label>
          <select className={INPUT} value={carrierId} onChange={e => setCarrierId(e.target.value)}>
            {carriers.length === 0 && <option value="">— Primero cargá un courier —</option>}
            {carriers.map(c => <option key={c.id} value={c.id}>{c.name} · {carrierCompanyName(c)}</option>)}
          </select>
        </div>
        <div className="min-w-[200px]">
          <label className={LABEL}>Zona</label>
          <select className={INPUT} value={zoneId} onChange={e => setZoneId(e.target.value)}>
            {zones.length === 0 && <option value="">— Sin zonas —</option>}
            {zones.map(z => <option key={z.id} value={z.id}>{z.code} · {z.label}</option>)}
          </select>
        </div>
        {canManage && carrierId && zoneId && (
          <Button size="sm" onClick={() => setEditing({ carrier_id: carrierId, zone_id: zoneId })}><Plus size={14} /> Nueva banda</Button>
        )}
      </div>

      {loading ? (
        <div className="flex justify-center py-10"><Loader2 className="animate-spin text-primary" size={28} /></div>
      ) : rates.length === 0 ? (
        <p className="text-sm text-muted text-center py-10">
          {zoneId ? 'Sin bandas de peso. Replicá acá la tabla tarifaria del courier para esta zona.' : 'Elegí un courier y una zona (cargalas en sus solapas).'}
        </p>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-border">
          <table className="w-full text-sm">
            <thead className="bg-surface text-[11px] uppercase tracking-wider text-muted">
              <tr>
                <th className="text-right px-3 py-2">Desde (kg)</th>
                <th className="text-right px-3 py-2">Hasta (kg)</th>
                <th className="text-right px-3 py-2">Precio</th>
                <th className="text-right px-3 py-2">+ por kg extra</th>
                <th className="text-left px-3 py-2">Moneda</th>
                {canManage && <th className="px-3 py-2"></th>}
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {rates.map(r => (
                <tr key={r.id}>
                  <td className="px-3 py-2 text-right font-mono">{r.weight_from_kg}</td>
                  <td className="px-3 py-2 text-right font-mono">{r.weight_to_kg}</td>
                  <td className="px-3 py-2 text-right font-mono">{Number(r.price).toLocaleString('es-AR', { maximumFractionDigits: 2 })}</td>
                  <td className="px-3 py-2 text-right font-mono">{r.per_kg_over != null ? Number(r.per_kg_over).toLocaleString('es-AR', { maximumFractionDigits: 2 }) : '—'}</td>
                  <td className="px-3 py-2">{r.currency}</td>
                  {canManage && (
                    <td className="px-3 py-2">
                      <div className="flex justify-end gap-1.5">
                        <Button size="sm" variant="secondary" onClick={() => setEditing(r)}><Pencil size={13} /></Button>
                        <Button size="sm" variant="secondary" disabled={busyId === r.id} onClick={() => void remove(r)}><Trash2 size={13} /></Button>
                      </div>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <RateModal rate={editing} onClose={() => setEditing(null)} onSaved={() => void loadRates()} />
    </div>
  )
}

function RateModal({ rate, onClose, onSaved }: { rate: Partial<Rate> | null; onClose: () => void; onSaved: () => void }) {
  const { addToast } = useToast()
  const [f, setF] = useState({ from: '', to: '', price: '', perKg: '', currency: 'EUR' })
  const [saving, setSaving] = useState(false)
  const isEdit = !!rate?.id

  useEffect(() => {
    if (!rate) return
    setF({
      from: rate.weight_from_kg?.toString() ?? '',
      to: rate.weight_to_kg?.toString() ?? '',
      price: rate.price?.toString() ?? '',
      perKg: rate.per_kg_over?.toString() ?? '',
      currency: rate.currency ?? 'EUR',
    })
  }, [rate])

  async function save() {
    const from = Number(f.from); const to = Number(f.to); const price = Number(f.price)
    const perKg = f.perKg.trim() === '' ? null : Number(f.perKg)
    if (!Number.isFinite(from) || from < 0 || !Number.isFinite(to) || to <= from) {
      addToast({ type: 'warning', title: 'Banda de peso inválida', message: '"Hasta" debe ser mayor que "Desde".' }); return
    }
    if (!Number.isFinite(price) || price < 0) { addToast({ type: 'warning', title: 'Precio inválido' }); return }
    if (perKg !== null && (!Number.isFinite(perKg) || perKg < 0)) { addToast({ type: 'warning', title: '"Por kg extra" inválido' }); return }

    const payload: Record<string, unknown> = { weight_from_kg: from, weight_to_kg: to, price, per_kg_over: perKg, currency: f.currency }
    if (!isEdit) { payload.carrier_id = rate!.carrier_id; payload.zone_id = rate!.zone_id }

    setSaving(true)
    try {
      const url = isEdit ? `/api/comex/carrier-rates/${rate!.id}` : '/api/comex/carrier-rates'
      const res = await fetch(url, { method: isEdit ? 'PATCH' : 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) })
      const json = await res.json().catch(() => ({})) as { error?: string }
      if (!res.ok) { addToast({ type: 'error', title: 'No se pudo guardar', message: json.error }); return }
      addToast({ type: 'success', title: isEdit ? 'Banda actualizada' : 'Banda creada' })
      onSaved(); onClose()
    } catch (e) {
      addToast({ type: 'error', title: 'No se pudo conectar', message: (e as Error).message })
    } finally { setSaving(false) }
  }

  return (
    <Modal isOpen={rate !== null} onClose={onClose} title={isEdit ? 'Editar banda de tarifa' : 'Nueva banda de tarifa'} size="sm">
      <div className="space-y-3">
        <div className="grid grid-cols-2 gap-2">
          <div>
            <label className={LABEL}>Desde (kg)</label>
            <input type="number" min="0" step="0.1" className={INPUT} value={f.from} onChange={e => setF({ ...f, from: e.target.value })} />
          </div>
          <div>
            <label className={LABEL}>Hasta (kg)</label>
            <input type="number" min="0" step="0.1" className={INPUT} value={f.to} onChange={e => setF({ ...f, to: e.target.value })} />
          </div>
        </div>
        <div className="grid grid-cols-3 gap-2">
          <div>
            <label className={LABEL}>Precio</label>
            <input type="number" min="0" step="0.01" className={INPUT} value={f.price} onChange={e => setF({ ...f, price: e.target.value })} />
          </div>
          <div>
            <label className={LABEL}>+ por kg extra</label>
            <input type="number" min="0" step="0.01" className={INPUT} value={f.perKg} onChange={e => setF({ ...f, perKg: e.target.value })} placeholder="opcional" />
          </div>
          <div>
            <label className={LABEL}>Moneda</label>
            <select className={INPUT} value={f.currency} onChange={e => setF({ ...f, currency: e.target.value })}>
              {['EUR', 'USD', 'ARS'].map(c => <option key={c} value={c}>{c}</option>)}
            </select>
          </div>
        </div>
        <p className="text-[11px] text-muted">El &ldquo;+ por kg extra&rdquo; solo aplica a la última banda: lo que excede el &ldquo;hasta&rdquo; se cobra a ese precio por kg.</p>
        <div className="flex justify-end gap-2 pt-2">
          <Button variant="secondary" onClick={onClose}>Cancelar</Button>
          <Button onClick={save} disabled={saving}>{saving ? 'Guardando…' : isEdit ? 'Guardar' : 'Crear'}</Button>
        </div>
      </div>
    </Modal>
  )
}
