'use client'

import { useState } from 'react'
import Link from 'next/link'
import { ArrowLeft, Plus, Pencil, Trash2, Power, GripVertical, Save, X } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Modal } from '@/components/ui/modal'
import { useToast } from '@/components/ui/toast'
import { useAssetChangeReasons, type AssetChangeReason } from '@/hooks/use-asset-change-reasons'

const EMPTY: Partial<AssetChangeReason> = {
  id: undefined,
  value: '',
  label: '',
  hint: '',
  sort_order: 100,
  active: true,
  company_id: null,
}

export default function SatMotivosPage() {
  const { reasons, loading, reload } = useAssetChangeReasons({ onlyActive: false })
  const { addToast } = useToast()
  const supabase = createClient()

  const [showForm, setShowForm] = useState(false)
  const [form, setForm] = useState<Partial<AssetChangeReason>>(EMPTY)
  const [saving, setSaving] = useState(false)
  const [confirmDel, setConfirmDel] = useState<AssetChangeReason | null>(null)
  const [deleting, setDeleting] = useState(false)

  const openNuevo = () => { setForm({ ...EMPTY, sort_order: (reasons.length + 1) * 10 }); setShowForm(true) }
  const openEditar = (r: AssetChangeReason) => { setForm({ ...r }); setShowForm(true) }

  const handleSave = async () => {
    const label = (form.label || '').trim()
    const value = (form.value || '').trim().toUpperCase().replace(/[^A-Z0-9]+/g, '_').replace(/^_+|_+$/g, '')
    if (!label || !value) {
      addToast({ type: 'warning', title: 'Etiqueta y código son obligatorios' })
      return
    }
    setSaving(true)
    try {
      if (form.id) {
        const { error } = await supabase.from('tt_sat_change_reasons').update({
          value, label,
          hint: form.hint || null,
          sort_order: form.sort_order ?? 100,
          active: form.active !== false,
        }).eq('id', form.id)
        if (error) throw error
        addToast({ type: 'success', title: 'Motivo actualizado' })
      } else {
        const { error } = await supabase.from('tt_sat_change_reasons').insert({
          value, label,
          hint: form.hint || null,
          sort_order: form.sort_order ?? 100,
          active: true,
          company_id: null,  // global por default
        })
        if (error) throw error
        addToast({ type: 'success', title: 'Motivo creado' })
      }
      setShowForm(false)
      await reload()
    } catch (e) {
      addToast({ type: 'error', title: 'Error', message: (e as Error).message })
    } finally { setSaving(false) }
  }

  const toggleActive = async (r: AssetChangeReason) => {
    await supabase.from('tt_sat_change_reasons').update({ active: !r.active }).eq('id', r.id)
    await reload()
  }

  const handleDelete = async () => {
    if (!confirmDel) return
    setDeleting(true)
    try {
      const { error } = await supabase.from('tt_sat_change_reasons').delete().eq('id', confirmDel.id)
      if (error) throw error
      addToast({ type: 'success', title: 'Motivo eliminado' })
      setConfirmDel(null)
      await reload()
    } catch (e) {
      addToast({ type: 'error', title: 'Error', message: (e as Error).message })
    } finally { setDeleting(false) }
  }

  const moveSort = async (r: AssetChangeReason, delta: number) => {
    await supabase.from('tt_sat_change_reasons').update({ sort_order: r.sort_order + delta * 10 }).eq('id', r.id)
    await reload()
  }

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-start justify-between flex-wrap gap-3">
        <div>
          <Link href="/admin">
            <Button size="sm" variant="ghost"><ArrowLeft size={14} /> Admin</Button>
          </Link>
          <h1 className="text-2xl font-bold text-[#F0F2F5] mt-2">Motivos de cambio de activos SAT</h1>
          <p className="text-sm text-[#9CA3AF] mt-1">
            Catálogo editable de motivos que se muestran al editar un activo (transferencias, bajas, partes de pago, etc.).
          </p>
        </div>
        <Button onClick={openNuevo}><Plus size={14} /> Nuevo motivo</Button>
      </div>

      <Card className="p-0 overflow-hidden">
        {loading ? (
          <div className="p-10 text-center text-[#6B7280]">Cargando...</div>
        ) : reasons.length === 0 ? (
          <div className="p-10 text-center text-[#6B7280]">Sin motivos. Creá el primero.</div>
        ) : (
          <table className="w-full">
            <thead>
              <tr className="border-b border-[#1E2330] text-[10px] uppercase tracking-wider text-[#6B7280]">
                <th className="text-left px-4 py-2">Orden</th>
                <th className="text-left px-4 py-2">Etiqueta</th>
                <th className="text-left px-4 py-2">Código</th>
                <th className="text-left px-4 py-2">Ayuda</th>
                <th className="text-left px-4 py-2">Alcance</th>
                <th className="text-left px-4 py-2">Estado</th>
                <th className="text-center px-4 py-2">Acciones</th>
              </tr>
            </thead>
            <tbody>
              {reasons.map((r) => (
                <tr key={r.id} className="border-b border-[#1E2330]/50 hover:bg-[#0F1218]">
                  <td className="px-4 py-2">
                    <div className="flex items-center gap-1 text-xs text-[#6B7280] font-mono">
                      <GripVertical size={12} />
                      <span className="w-8 text-right">{r.sort_order}</span>
                      <div className="flex flex-col">
                        <button onClick={() => moveSort(r, -1)} className="text-[8px] hover:text-[#FF6600] leading-none">▲</button>
                        <button onClick={() => moveSort(r, 1)} className="text-[8px] hover:text-[#FF6600] leading-none">▼</button>
                      </div>
                    </div>
                  </td>
                  <td className="px-4 py-2 text-sm font-semibold text-[#F0F2F5]">{r.label}</td>
                  <td className="px-4 py-2 text-xs font-mono text-[#9CA3AF]">{r.value}</td>
                  <td className="px-4 py-2 text-xs text-[#6B7280] max-w-md truncate">{r.hint || '—'}</td>
                  <td className="px-4 py-2">
                    {r.company_id === null
                      ? <Badge variant="info">Global</Badge>
                      : <Badge variant="warning">Empresa</Badge>}
                  </td>
                  <td className="px-4 py-2">
                    {r.active
                      ? <Badge variant="success">Activo</Badge>
                      : <Badge variant="default">Inactivo</Badge>}
                  </td>
                  <td className="px-4 py-2 text-center">
                    <div className="flex gap-1 justify-center">
                      <Button size="sm" variant="ghost" onClick={() => openEditar(r)} title="Editar">
                        <Pencil size={13} />
                      </Button>
                      <Button size="sm" variant="ghost" onClick={() => toggleActive(r)} title={r.active ? 'Desactivar' : 'Activar'}>
                        <Power size={13} />
                      </Button>
                      <Button size="sm" variant="ghost" onClick={() => setConfirmDel(r)} title="Eliminar">
                        <Trash2 size={13} />
                      </Button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Card>

      {/* Modal alta/edición */}
      <Modal isOpen={showForm} onClose={() => setShowForm(false)} title={form.id ? 'Editar motivo' : 'Nuevo motivo'} size="md">
        <div className="space-y-4">
          <div>
            <label className="block text-xs uppercase tracking-wider text-[#9CA3AF] mb-1">Etiqueta visible *</label>
            <input
              type="text"
              value={form.label || ''}
              onChange={(e) => {
                const label = e.target.value
                const autoValue = label.toUpperCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^A-Z0-9]+/g, '_').replace(/^_+|_+$/g, '')
                setForm((f) => ({ ...f, label, value: f.value || autoValue }))
              }}
              placeholder="ej. Devolución del cliente"
              className="w-full rounded-lg px-3 py-2 text-sm outline-none"
              style={{ background: '#1E2330', border: '1px solid #2A3040', color: '#F0F2F5' }}
            />
          </div>
          <div>
            <label className="block text-xs uppercase tracking-wider text-[#9CA3AF] mb-1">Código (sin espacios, mayúsculas) *</label>
            <input
              type="text"
              value={form.value || ''}
              onChange={(e) => setForm((f) => ({ ...f, value: e.target.value.toUpperCase().replace(/[^A-Z0-9_]/g, '_') }))}
              placeholder="ej. DEVOLUCION"
              className="w-full rounded-lg px-3 py-2 text-sm outline-none font-mono"
              style={{ background: '#1E2330', border: '1px solid #2A3040', color: '#F0F2F5' }}
            />
            <p className="text-[10px] text-[#6B7280] mt-1">Se autogenera de la etiqueta. Una vez creado NO se debería cambiar.</p>
          </div>
          <div>
            <label className="block text-xs uppercase tracking-wider text-[#9CA3AF] mb-1">Texto de ayuda (tooltip)</label>
            <input
              type="text"
              value={form.hint || ''}
              onChange={(e) => setForm((f) => ({ ...f, hint: e.target.value }))}
              placeholder="ej. Cliente devolvió el equipo por garantía"
              className="w-full rounded-lg px-3 py-2 text-sm outline-none"
              style={{ background: '#1E2330', border: '1px solid #2A3040', color: '#F0F2F5' }}
            />
          </div>
          <div>
            <label className="block text-xs uppercase tracking-wider text-[#9CA3AF] mb-1">Orden de aparición</label>
            <input
              type="number"
              step="10"
              value={form.sort_order ?? 100}
              onChange={(e) => setForm((f) => ({ ...f, sort_order: Number(e.target.value) }))}
              className="w-full rounded-lg px-3 py-2 text-sm outline-none font-mono"
              style={{ background: '#1E2330', border: '1px solid #2A3040', color: '#F0F2F5' }}
            />
            <p className="text-[10px] text-[#6B7280] mt-1">Números bajos = aparecen primero. Usá múltiplos de 10 para insertar fácil.</p>
          </div>
          <div className="flex justify-end gap-2 pt-3 border-t border-[#1E2330]">
            <Button variant="secondary" onClick={() => setShowForm(false)} disabled={saving}>
              <X size={14} /> Cancelar
            </Button>
            <Button onClick={handleSave} loading={saving}>
              <Save size={14} /> Guardar
            </Button>
          </div>
        </div>
      </Modal>

      {/* Confirmar borrado */}
      <Modal isOpen={!!confirmDel} onClose={() => setConfirmDel(null)} title="Eliminar motivo" size="sm">
        <div className="space-y-4">
          <p className="text-sm text-[#F0F2F5]">
            ¿Eliminar el motivo <strong>{confirmDel?.label}</strong>?
          </p>
          <p className="text-xs text-[#6B7280]">
            Si hay eventos históricos que referencian este motivo, la etiqueta quedará en blanco en la timeline.
            En general, conviene <strong>desactivarlo</strong> en vez de borrarlo.
          </p>
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={() => setConfirmDel(null)} disabled={deleting}>Cancelar</Button>
            <Button onClick={handleDelete} loading={deleting} style={{ background: '#EF4444' }}>
              <Trash2 size={14} /> Eliminar
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  )
}
