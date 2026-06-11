'use client'

import { useState, useEffect } from 'react'
import { Modal } from '@/components/ui/modal'
import { Button } from '@/components/ui/button'
import { useToast } from '@/components/ui/toast'

export interface PackingType {
  id: string
  kind: 'pallet' | 'caja' | 'sobre' | 'otro'
  code: string
  label: string
  length_cm: number
  width_cm: number
  height_cm: number | null
  max_height_cm: number | null
  tare_weight_kg: number
  max_payload_kg: number | null
  active: boolean
}

interface Props {
  /** null = cerrado; {} = alta; objeto = edición. */
  packing: Partial<PackingType> | null
  onClose: () => void
  onSaved: () => void
}

const INPUT = 'w-full bg-[#0F1218] border border-[#2A3040] rounded-lg px-3 py-2 text-sm text-[#F0F2F5] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#FF6600]'
const LABEL = 'block text-[11px] uppercase tracking-wider font-bold text-[#6B7280] mb-1'
const KINDS: PackingType['kind'][] = ['pallet', 'caja', 'sobre', 'otro']

const numOrNull = (v: string): number | null => (v.trim() === '' ? null : Number(v))

export function PackingModal({ packing, onClose, onSaved }: Props) {
  const { addToast } = useToast()
  const [f, setF] = useState({ kind: 'caja', code: '', label: '', length_cm: '', width_cm: '', height_cm: '', max_height_cm: '', tare_weight_kg: '0', max_payload_kg: '' })
  const [saving, setSaving] = useState(false)
  const isEdit = !!packing?.id

  useEffect(() => {
    if (!packing) return
    setF({
      kind: packing.kind ?? 'caja',
      code: packing.code ?? '',
      label: packing.label ?? '',
      length_cm: packing.length_cm?.toString() ?? '',
      width_cm: packing.width_cm?.toString() ?? '',
      height_cm: packing.height_cm?.toString() ?? '',
      max_height_cm: packing.max_height_cm?.toString() ?? '',
      tare_weight_kg: packing.tare_weight_kg?.toString() ?? '0',
      max_payload_kg: packing.max_payload_kg?.toString() ?? '',
    })
  }, [packing])

  async function save() {
    if (!f.code.trim() || !f.label.trim()) { addToast({ type: 'warning', title: 'Código y nombre son obligatorios' }); return }
    if (!f.length_cm || !f.width_cm || Number(f.length_cm) <= 0 || Number(f.width_cm) <= 0) {
      addToast({ type: 'warning', title: 'Largo y ancho son obligatorios y positivos' }); return
    }
    const payload = {
      kind: f.kind, code: f.code.trim(), label: f.label.trim(),
      length_cm: Number(f.length_cm), width_cm: Number(f.width_cm),
      height_cm: numOrNull(f.height_cm), max_height_cm: numOrNull(f.max_height_cm),
      tare_weight_kg: Number(f.tare_weight_kg || '0'), max_payload_kg: numOrNull(f.max_payload_kg),
    }
    setSaving(true)
    try {
      const url = isEdit ? `/api/comex/packing-types/${packing!.id}` : '/api/comex/packing-types'
      const res = await fetch(url, { method: isEdit ? 'PATCH' : 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) })
      const json = await res.json().catch(() => ({})) as { error?: string }
      if (!res.ok) { addToast({ type: 'error', title: 'No se pudo guardar', message: json.error }); return }
      addToast({ type: 'success', title: isEdit ? 'Packing actualizado' : 'Packing creado' })
      onSaved(); onClose()
    } catch (e) {
      addToast({ type: 'error', title: 'No se pudo conectar', message: (e as Error).message })
    } finally { setSaving(false) }
  }

  return (
    <Modal isOpen={packing !== null} onClose={onClose} title={isEdit ? 'Editar packing' : 'Nuevo packing'} size="md">
      <div className="space-y-3">
        <div className="grid grid-cols-2 gap-2">
          <div>
            <label className={LABEL}>Tipo</label>
            <select className={INPUT} value={f.kind} onChange={e => setF({ ...f, kind: e.target.value })}>
              {KINDS.map(k => <option key={k} value={k}>{k}</option>)}
            </select>
          </div>
          <div>
            <label className={LABEL}>Código</label>
            <input className={INPUT} value={f.code} onChange={e => setF({ ...f, code: e.target.value })} placeholder="PALLET-EUR" />
          </div>
        </div>
        <div>
          <label className={LABEL}>Nombre</label>
          <input className={INPUT} value={f.label} onChange={e => setF({ ...f, label: e.target.value })} placeholder="Pallet europeo 120×80" />
        </div>
        <div className="grid grid-cols-3 gap-2">
          <div><label className={LABEL}>Largo (cm)</label><input type="number" min="0" className={INPUT} value={f.length_cm} onChange={e => setF({ ...f, length_cm: e.target.value })} /></div>
          <div><label className={LABEL}>Ancho (cm)</label><input type="number" min="0" className={INPUT} value={f.width_cm} onChange={e => setF({ ...f, width_cm: e.target.value })} /></div>
          <div><label className={LABEL}>Alto (cm)</label><input type="number" min="0" className={INPUT} value={f.height_cm} onChange={e => setF({ ...f, height_cm: e.target.value })} /></div>
        </div>
        <div className="grid grid-cols-3 gap-2">
          <div><label className={LABEL}>Alto máx (cm)</label><input type="number" min="0" className={INPUT} value={f.max_height_cm} onChange={e => setF({ ...f, max_height_cm: e.target.value })} /></div>
          <div><label className={LABEL}>Tara (kg)</label><input type="number" min="0" className={INPUT} value={f.tare_weight_kg} onChange={e => setF({ ...f, tare_weight_kg: e.target.value })} /></div>
          <div><label className={LABEL}>Carga máx (kg)</label><input type="number" min="0" className={INPUT} value={f.max_payload_kg} onChange={e => setF({ ...f, max_payload_kg: e.target.value })} /></div>
        </div>
        <div className="flex justify-end gap-2 pt-2">
          <Button variant="secondary" onClick={onClose}>Cancelar</Button>
          <Button onClick={save} disabled={saving}>{saving ? 'Guardando…' : isEdit ? 'Guardar' : 'Crear'}</Button>
        </div>
      </div>
    </Modal>
  )
}
