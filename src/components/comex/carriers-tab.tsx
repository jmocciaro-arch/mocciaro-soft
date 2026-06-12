'use client'

import { useState, useEffect, useCallback } from 'react'
import { Modal } from '@/components/ui/modal'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { useToast } from '@/components/ui/toast'
import { useCompanyFilter } from '@/hooks/use-company-filter'
import { useCompanyContext } from '@/lib/company-context'
import { Loader2, Pencil, Trash2, Plus } from 'lucide-react'

export interface Carrier {
  id: string
  company_id: string
  code: string
  name: string
  volumetric_divisor: number
  active: boolean
  company: { name: string } | { name: string }[] | null
}

export function carrierCompanyName(c: Carrier): string {
  const co = c.company
  if (!co) return 'Empresa'
  return Array.isArray(co) ? (co[0]?.name ?? 'Empresa') : co.name
}

const INPUT = 'w-full bg-surface border border-border-hover rounded-lg px-3 py-2 text-sm text-foreground focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary'
const LABEL = 'block text-[11px] uppercase tracking-wider font-bold text-muted mb-1'

export function CarriersTab({ canManage }: { canManage: boolean }) {
  const { addToast } = useToast()
  const { defaultCompanyId } = useCompanyFilter()
  const { activeCompany } = useCompanyContext()
  const [rows, setRows] = useState<Carrier[]>([])
  const [loading, setLoading] = useState(true)
  const [editing, setEditing] = useState<Partial<Carrier> | null>(null)
  const [busyId, setBusyId] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch('/api/comex/carriers')
      const json = await res.json() as { data?: Carrier[]; error?: string }
      if (!res.ok) { addToast({ type: 'error', title: 'Error cargando couriers', message: json.error }); setRows([]); return }
      setRows(json.data ?? [])
    } finally { setLoading(false) }
  }, [addToast])

  useEffect(() => { void load() }, [load])

  async function remove(c: Carrier) {
    if (!window.confirm(`¿Borrar "${c.name}"? Se borran también sus zonas y tarifas.`)) return
    setBusyId(c.id)
    try {
      const res = await fetch(`/api/comex/carriers/${c.id}`, { method: 'DELETE' })
      const json = await res.json().catch(() => ({})) as { error?: string }
      if (!res.ok) { addToast({ type: 'error', title: 'No se pudo borrar', message: json.error }); return }
      addToast({ type: 'success', title: 'Courier borrado' })
      await load()
    } finally { setBusyId(null) }
  }

  if (loading) return <div className="flex justify-center py-10"><Loader2 className="animate-spin text-primary" size={28} /></div>

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <p className="text-[11px] text-muted">Transportistas con su divisor volumétrico (cm³/kg). Las tarifas son por empresa: el alta se hace en la empresa activa ({activeCompany?.name ?? '—'}).</p>
        {canManage && <Button size="sm" onClick={() => setEditing({})}><Plus size={14} /> Nuevo courier</Button>}
      </div>

      {rows.length === 0 ? (
        <p className="text-sm text-muted text-center py-10">Sin couriers. Cargá DHL, UPS, FEDEX o el que uses.</p>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-border">
          <table className="w-full text-sm">
            <thead className="bg-surface text-[11px] uppercase tracking-wider text-muted">
              <tr>
                <th className="text-left px-3 py-2">Empresa</th>
                <th className="text-left px-3 py-2">Código</th>
                <th className="text-left px-3 py-2">Nombre</th>
                <th className="text-right px-3 py-2">Divisor vol.</th>
                <th className="text-left px-3 py-2">Estado</th>
                {canManage && <th className="px-3 py-2"></th>}
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {rows.map(c => (
                <tr key={c.id} className={c.active ? '' : 'opacity-50'}>
                  <td className="px-3 py-2 text-muted-light">{carrierCompanyName(c)}</td>
                  <td className="px-3 py-2 font-mono text-[12px]">{c.code}</td>
                  <td className="px-3 py-2">{c.name}</td>
                  <td className="px-3 py-2 text-right font-mono">{c.volumetric_divisor}</td>
                  <td className="px-3 py-2"><Badge variant={c.active ? 'success' : 'default'} size="sm">{c.active ? 'Activo' : 'Inactivo'}</Badge></td>
                  {canManage && (
                    <td className="px-3 py-2">
                      <div className="flex justify-end gap-1.5">
                        <Button size="sm" variant="secondary" onClick={() => setEditing(c)}><Pencil size={13} /></Button>
                        <Button size="sm" variant="secondary" disabled={busyId === c.id} onClick={() => void remove(c)}><Trash2 size={13} /></Button>
                      </div>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <CarrierModal carrier={editing} companyId={defaultCompanyId} onClose={() => setEditing(null)} onSaved={() => void load()} />
    </div>
  )
}

function CarrierModal({ carrier, companyId, onClose, onSaved }: {
  carrier: Partial<Carrier> | null
  companyId: string | null
  onClose: () => void
  onSaved: () => void
}) {
  const { addToast } = useToast()
  const [f, setF] = useState({ code: '', name: '', volumetric_divisor: '5000', active: true })
  const [saving, setSaving] = useState(false)
  const isEdit = !!carrier?.id

  useEffect(() => {
    if (!carrier) return
    setF({
      code: carrier.code ?? '',
      name: carrier.name ?? '',
      volumetric_divisor: carrier.volumetric_divisor?.toString() ?? '5000',
      active: carrier.active ?? true,
    })
  }, [carrier])

  async function save() {
    if (!f.code.trim() || !f.name.trim()) { addToast({ type: 'warning', title: 'Código y nombre son obligatorios' }); return }
    const divisor = Number(f.volumetric_divisor)
    if (!Number.isInteger(divisor) || divisor <= 0) { addToast({ type: 'warning', title: 'Divisor volumétrico inválido' }); return }
    if (!isEdit && !companyId) { addToast({ type: 'warning', title: 'No hay empresa activa' }); return }

    const payload: Record<string, unknown> = { code: f.code.trim().toUpperCase(), name: f.name.trim(), volumetric_divisor: divisor, active: f.active }
    if (!isEdit) payload.company_id = companyId

    setSaving(true)
    try {
      const url = isEdit ? `/api/comex/carriers/${carrier!.id}` : '/api/comex/carriers'
      const res = await fetch(url, { method: isEdit ? 'PATCH' : 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) })
      const json = await res.json().catch(() => ({})) as { error?: string }
      if (!res.ok) { addToast({ type: 'error', title: 'No se pudo guardar', message: json.error }); return }
      addToast({ type: 'success', title: isEdit ? 'Courier actualizado' : 'Courier creado' })
      onSaved(); onClose()
    } catch (e) {
      addToast({ type: 'error', title: 'No se pudo conectar', message: (e as Error).message })
    } finally { setSaving(false) }
  }

  return (
    <Modal isOpen={carrier !== null} onClose={onClose} title={isEdit ? 'Editar courier' : 'Nuevo courier'} size="sm">
      <div className="space-y-3">
        <div className="grid grid-cols-2 gap-2">
          <div>
            <label className={LABEL}>Código</label>
            <input className={INPUT} value={f.code} onChange={e => setF({ ...f, code: e.target.value })} placeholder="DHL" />
          </div>
          <div>
            <label className={LABEL}>Divisor volumétrico</label>
            <input type="number" min="1" className={INPUT} value={f.volumetric_divisor} onChange={e => setF({ ...f, volumetric_divisor: e.target.value })} />
          </div>
        </div>
        <div>
          <label className={LABEL}>Nombre</label>
          <input className={INPUT} value={f.name} onChange={e => setF({ ...f, name: e.target.value })} placeholder="DHL Express" />
        </div>
        <label className="flex items-center gap-2 text-sm cursor-pointer select-none">
          <input type="checkbox" checked={f.active} onChange={e => setF({ ...f, active: e.target.checked })} className="accent-[#FF6600] w-4 h-4" />
          Activo
        </label>
        <div className="flex justify-end gap-2 pt-2">
          <Button variant="secondary" onClick={onClose}>Cancelar</Button>
          <Button onClick={save} disabled={saving}>{saving ? 'Guardando…' : isEdit ? 'Guardar' : 'Crear'}</Button>
        </div>
      </div>
    </Modal>
  )
}
