'use client'

import { useState, useEffect, useCallback } from 'react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { useToast } from '@/components/ui/toast'
import { Loader2, Pencil, Trash2, Plus } from 'lucide-react'
import { PackingModal, type PackingType } from './packing-modal'

const KIND_LABEL: Record<string, string> = { pallet: 'Pallet', caja: 'Caja', sobre: 'Sobre', otro: 'Otro' }

function dims(p: PackingType): string {
  const parts = [p.length_cm, p.width_cm, p.height_cm].filter(v => v != null)
  return parts.length ? `${parts.join('×')} cm` : '—'
}

export function PackingTab({ canManage }: { canManage: boolean }) {
  const { addToast } = useToast()
  const [rows, setRows] = useState<PackingType[]>([])
  const [loading, setLoading] = useState(true)
  const [editing, setEditing] = useState<Partial<PackingType> | null>(null)
  const [deletingId, setDeletingId] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch('/api/comex/packing-types')
      const json = await res.json() as { data?: PackingType[]; error?: string }
      if (!res.ok) { addToast({ type: 'error', title: 'Error cargando packing', message: json.error }); setRows([]); return }
      setRows(json.data ?? [])
    } finally { setLoading(false) }
  }, [addToast])

  useEffect(() => { void load() }, [load])

  async function remove(p: PackingType) {
    if (!window.confirm(`¿Borrar el packing "${p.label}"?`)) return
    setDeletingId(p.id)
    try {
      const res = await fetch(`/api/comex/packing-types/${p.id}`, { method: 'DELETE' })
      const json = await res.json().catch(() => ({})) as { error?: string }
      if (!res.ok) { addToast({ type: 'error', title: 'No se pudo borrar', message: json.error }); return }
      addToast({ type: 'success', title: 'Packing borrado' })
      await load()
    } finally { setDeletingId(null) }
  }

  if (loading) return <div className="flex justify-center py-10"><Loader2 className="animate-spin text-[#FF6600]" size={28} /></div>

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <p className="text-[11px] text-[#6B7280]">Tipos de packing (pallets y cajas) con sus medidas. El motor de flete los usa para estimar bultos.</p>
        {canManage && <Button size="sm" onClick={() => setEditing({})}><Plus size={14} /> Nuevo packing</Button>}
      </div>

      {rows.length === 0 ? (
        <p className="text-sm text-[#6B7280] text-center py-10">No hay tipos de packing cargados todavía.</p>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-[#1E2330]">
          <table className="w-full text-sm">
            <thead className="bg-[#0F1218] text-[11px] uppercase tracking-wider text-[#6B7280]">
              <tr>
                <th className="text-left px-3 py-2">Tipo</th>
                <th className="text-left px-3 py-2">Código</th>
                <th className="text-left px-3 py-2">Nombre</th>
                <th className="text-left px-3 py-2">Medidas</th>
                <th className="text-right px-3 py-2">Tara</th>
                <th className="text-right px-3 py-2">Carga máx</th>
                {canManage && <th className="px-3 py-2"></th>}
              </tr>
            </thead>
            <tbody className="divide-y divide-[#1E2330]">
              {rows.map(p => (
                <tr key={p.id} className={p.active ? '' : 'opacity-50'}>
                  <td className="px-3 py-2"><Badge variant="orange" size="sm">{KIND_LABEL[p.kind] ?? p.kind}</Badge></td>
                  <td className="px-3 py-2 font-mono text-[12px]">{p.code}</td>
                  <td className="px-3 py-2">{p.label}</td>
                  <td className="px-3 py-2 text-[#9CA3AF]">{dims(p)}</td>
                  <td className="px-3 py-2 text-right font-mono">{p.tare_weight_kg ?? 0} kg</td>
                  <td className="px-3 py-2 text-right font-mono">{p.max_payload_kg != null ? `${p.max_payload_kg} kg` : '—'}</td>
                  {canManage && (
                    <td className="px-3 py-2">
                      <div className="flex justify-end gap-1.5">
                        <Button size="sm" variant="secondary" onClick={() => setEditing(p)}><Pencil size={13} /></Button>
                        <Button size="sm" variant="secondary" disabled={deletingId === p.id} onClick={() => void remove(p)}><Trash2 size={13} /></Button>
                      </div>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <PackingModal packing={editing} onClose={() => setEditing(null)} onSaved={() => void load()} />
    </div>
  )
}
