'use client'

import { useState, useEffect, useCallback } from 'react'
import { Modal } from '@/components/ui/modal'
import { Button } from '@/components/ui/button'
import { useToast } from '@/components/ui/toast'
import { Loader2, Pencil, Trash2, Plus } from 'lucide-react'
import { type Carrier, carrierCompanyName } from './carriers-tab'

interface Zone {
  id: string
  carrier_id: string
  code: string
  label: string
  country_codes: string[]
  active: boolean
}

const INPUT = 'w-full bg-surface border border-border-hover rounded-lg px-3 py-2 text-sm text-foreground focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary'
const LABEL = 'block text-[11px] uppercase tracking-wider font-bold text-muted mb-1'

/** "ar, CL uy" → ['AR','CL','UY'] (tolerante a comas/espacios, ISO-2). */
function parseCountries(raw: string): string[] | null {
  const codes = raw.split(/[\s,;]+/).map(s => s.trim().toUpperCase()).filter(Boolean)
  if (codes.some(c => !/^[A-Z]{2}$/.test(c))) return null
  return [...new Set(codes)]
}

export function ZonesTab({ canManage }: { canManage: boolean }) {
  const { addToast } = useToast()
  const [carriers, setCarriers] = useState<Carrier[]>([])
  const [carrierId, setCarrierId] = useState('')
  const [zones, setZones] = useState<Zone[]>([])
  const [loading, setLoading] = useState(false)
  const [editing, setEditing] = useState<Partial<Zone> | null>(null)
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

  const loadZones = useCallback(async (cid: string) => {
    if (!cid) { setZones([]); return }
    setLoading(true)
    try {
      const res = await fetch(`/api/comex/carrier-zones?carrier_id=${cid}`)
      const json = await res.json() as { data?: Zone[]; error?: string }
      if (!res.ok) { addToast({ type: 'error', title: 'Error cargando zonas', message: json.error }); setZones([]); return }
      setZones(json.data ?? [])
    } finally { setLoading(false) }
  }, [addToast])

  useEffect(() => { void loadZones(carrierId) }, [carrierId, loadZones])

  async function remove(zone: Zone) {
    if (!window.confirm(`¿Borrar la zona "${zone.label}"? Se borran también sus tarifas.`)) return
    setBusyId(zone.id)
    try {
      const res = await fetch(`/api/comex/carrier-zones/${zone.id}`, { method: 'DELETE' })
      const json = await res.json().catch(() => ({})) as { error?: string }
      if (!res.ok) { addToast({ type: 'error', title: 'No se pudo borrar', message: json.error }); return }
      addToast({ type: 'success', title: 'Zona borrada' })
      await loadZones(carrierId)
    } finally { setBusyId(null) }
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2 flex-wrap">
        <div className="min-w-[260px]">
          <label className={LABEL}>Courier</label>
          <select className={INPUT} value={carrierId} onChange={e => setCarrierId(e.target.value)}>
            {carriers.length === 0 && <option value="">— Primero cargá un courier —</option>}
            {carriers.map(c => <option key={c.id} value={c.id}>{c.name} · {carrierCompanyName(c)}</option>)}
          </select>
        </div>
        {canManage && carrierId && (
          <Button size="sm" className="mt-5" onClick={() => setEditing({ carrier_id: carrierId })}><Plus size={14} /> Nueva zona</Button>
        )}
      </div>

      {loading ? (
        <div className="flex justify-center py-10"><Loader2 className="animate-spin text-primary" size={28} /></div>
      ) : zones.length === 0 ? (
        <p className="text-sm text-muted text-center py-10">
          {carrierId ? 'Sin zonas para este courier. Creá las zonas tarifarias (ej. ZONA 1) y asignales países.' : 'Cargá un courier en la solapa Couriers.'}
        </p>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-border">
          <table className="w-full text-sm">
            <thead className="bg-surface text-[11px] uppercase tracking-wider text-muted">
              <tr>
                <th className="text-left px-3 py-2">Código</th>
                <th className="text-left px-3 py-2">Nombre</th>
                <th className="text-left px-3 py-2">Países (ISO-2)</th>
                {canManage && <th className="px-3 py-2"></th>}
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {zones.map(z => (
                <tr key={z.id} className={z.active ? '' : 'opacity-50'}>
                  <td className="px-3 py-2 font-mono text-[12px]">{z.code}</td>
                  <td className="px-3 py-2">{z.label}</td>
                  <td className="px-3 py-2 font-mono text-[12px] text-muted-light">{z.country_codes.join(', ') || '—'}</td>
                  {canManage && (
                    <td className="px-3 py-2">
                      <div className="flex justify-end gap-1.5">
                        <Button size="sm" variant="secondary" onClick={() => setEditing(z)}><Pencil size={13} /></Button>
                        <Button size="sm" variant="secondary" disabled={busyId === z.id} onClick={() => void remove(z)}><Trash2 size={13} /></Button>
                      </div>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <ZoneModal zone={editing} onClose={() => setEditing(null)} onSaved={() => void loadZones(carrierId)} />
    </div>
  )
}

function ZoneModal({ zone, onClose, onSaved }: { zone: Partial<Zone> | null; onClose: () => void; onSaved: () => void }) {
  const { addToast } = useToast()
  const [f, setF] = useState({ code: '', label: '', countries: '' })
  const [saving, setSaving] = useState(false)
  const isEdit = !!zone?.id

  useEffect(() => {
    if (!zone) return
    setF({ code: zone.code ?? '', label: zone.label ?? '', countries: (zone.country_codes ?? []).join(', ') })
  }, [zone])

  async function save() {
    if (!f.code.trim() || !f.label.trim()) { addToast({ type: 'warning', title: 'Código y nombre son obligatorios' }); return }
    const countries = parseCountries(f.countries)
    if (countries === null) { addToast({ type: 'warning', title: 'Países inválidos', message: 'Usá códigos ISO-2 separados por coma: AR, CL, UY' }); return }

    const payload: Record<string, unknown> = { code: f.code.trim().toUpperCase(), label: f.label.trim(), country_codes: countries }
    if (!isEdit) payload.carrier_id = zone!.carrier_id

    setSaving(true)
    try {
      const url = isEdit ? `/api/comex/carrier-zones/${zone!.id}` : '/api/comex/carrier-zones'
      const res = await fetch(url, { method: isEdit ? 'PATCH' : 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) })
      const json = await res.json().catch(() => ({})) as { error?: string }
      if (!res.ok) { addToast({ type: 'error', title: 'No se pudo guardar', message: json.error }); return }
      addToast({ type: 'success', title: isEdit ? 'Zona actualizada' : 'Zona creada' })
      onSaved(); onClose()
    } catch (e) {
      addToast({ type: 'error', title: 'No se pudo conectar', message: (e as Error).message })
    } finally { setSaving(false) }
  }

  return (
    <Modal isOpen={zone !== null} onClose={onClose} title={isEdit ? 'Editar zona' : 'Nueva zona'} size="sm">
      <div className="space-y-3">
        <div className="grid grid-cols-2 gap-2">
          <div>
            <label className={LABEL}>Código</label>
            <input className={INPUT} value={f.code} onChange={e => setF({ ...f, code: e.target.value })} placeholder="ZONA_1" />
          </div>
          <div>
            <label className={LABEL}>Nombre</label>
            <input className={INPUT} value={f.label} onChange={e => setF({ ...f, label: e.target.value })} placeholder="Sudamérica" />
          </div>
        </div>
        <div>
          <label className={LABEL}>Países (ISO-2, separados por coma)</label>
          <input className={INPUT} value={f.countries} onChange={e => setF({ ...f, countries: e.target.value })} placeholder="AR, CL, UY, PY" />
        </div>
        <div className="flex justify-end gap-2 pt-2">
          <Button variant="secondary" onClick={onClose}>Cancelar</Button>
          <Button onClick={save} disabled={saving}>{saving ? 'Guardando…' : isEdit ? 'Guardar' : 'Crear'}</Button>
        </div>
      </div>
    </Modal>
  )
}
