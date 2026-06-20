'use client'

import { useState, useMemo, useEffect } from 'react'
import { Package, Wrench, Sparkles, Plus, Percent, Pencil, Trash2 } from 'lucide-react'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import {
  Table, TableHeader, TableBody, TableRow, TableHead, TableCell,
} from '@/components/ui/table'
import { SearchBar } from '@/components/ui/search-bar'
import { KPICard } from '@/components/ui/kpi-card'
import { Modal } from '@/components/ui/modal'
import { useToast } from '@/components/ui/toast'
import { useSpareParts, type SparePart } from '@/hooks/use-spare-parts'
import { MODELOS_FEIN } from '@/lib/sat/fein-data'
import { fmtNumber } from '@/lib/sat/currency-converter'
import '@/components/sat/buscatools-theme.css'

type FormState = {
  id?: string
  sku: string
  descripcion: string
  codigo: string
  pos: string
  tipo: SparePart['tipo']
  modelos: string[]
  precio_eur: number
  precio_venta: number
}

const EMPTY_FORM: FormState = {
  sku: '', descripcion: '', codigo: '', pos: '',
  tipo: 'repuesto', modelos: [], precio_eur: 0, precio_venta: 0,
}

export default function SatRepuestosPage() {
  const [search, setSearch] = useState('')
  const [modelo, setModelo] = useState<string>('')
  const { parts, loading, save, remove, bulkAdjust } = useSpareParts({
    search,
    model: modelo || undefined,
  })
  const { addToast } = useToast()
  const isAdmin = true

  const [showForm, setShowForm] = useState(false)
  const [form, setForm] = useState<FormState>(EMPTY_FORM)
  const [saving, setSaving] = useState(false)

  const [showBulk, setShowBulk] = useState(false)
  const [bulkPct, setBulkPct] = useState(10)
  const [bulkDir, setBulkDir] = useState<'up' | 'down'>('up')
  const [bulkSaving, setBulkSaving] = useState(false)

  const [confirmDel, setConfirmDel] = useState<{ id: string; desc: string } | null>(null)
  const [deleting, setDeleting] = useState(false)

  const kpis = useMemo(() => ({
    total: parts.filter((p) => p.tipo === 'repuesto').length,
    accesorios: parts.filter((p) => p.tipo === 'accesorio').length,
    custom: parts.filter((p) => p.is_custom).length,
  }), [parts])

  const openNuevo = () => { setForm(EMPTY_FORM); setShowForm(true) }
  const openEditar = (p: SparePart) => {
    setForm({
      id: p.id,
      sku: p.sku,
      descripcion: p.descripcion,
      codigo: p.codigo || '',
      pos: p.pos || '',
      tipo: p.tipo,
      modelos: p.modelos || [],
      precio_eur: p.precio_eur,
      precio_venta: p.precio_venta,
    })
    setShowForm(true)
  }

  const handleSave = async () => {
    if (!form.sku.trim() || !form.descripcion.trim()) {
      addToast({ type: 'warning', title: 'SKU y descripción son obligatorios' })
      return
    }
    setSaving(true)
    try {
      await save({
        id: form.id,
        sku: form.sku.trim(),
        descripcion: form.descripcion.trim(),
        codigo: form.codigo.trim() || null,
        pos: form.pos.trim() || null,
        tipo: form.tipo,
        modelos: form.modelos,
        precio_eur: Number(form.precio_eur) || 0,
        precio_venta: Number(form.precio_venta) || 0,
      })
      addToast({ type: 'success', title: form.id ? 'Repuesto actualizado' : 'Repuesto creado' })
      setShowForm(false)
    } catch (e) {
      addToast({ type: 'error', title: 'Error', message: (e as Error)?.message || '' })
    } finally {
      setSaving(false)
    }
  }

  const handleDelete = async () => {
    if (!confirmDel) return
    setDeleting(true)
    try {
      await remove(confirmDel.id)
      addToast({ type: 'success', title: 'Eliminado', message: confirmDel.desc })
      setConfirmDel(null)
    } catch (e) {
      addToast({ type: 'error', title: 'Error', message: (e as Error)?.message || '' })
    } finally {
      setDeleting(false)
    }
  }

  const handleBulk = async () => {
    if (!bulkPct || bulkPct <= 0) {
      addToast({ type: 'warning', title: 'Indicá un porcentaje > 0' })
      return
    }
    setBulkSaving(true)
    try {
      const n = await bulkAdjust(bulkPct, bulkDir)
      addToast({
        type: 'success',
        title: 'Ajuste aplicado',
        message: `${n} precios ${bulkDir === 'up' ? '+' : '-'}${bulkPct}%`,
      })
      setShowBulk(false)
    } catch (e) {
      addToast({ type: 'error', title: 'Error', message: (e as Error)?.message || '' })
    } finally {
      setBulkSaving(false)
    }
  }

  const toggleModelo = (m: string) => {
    setForm((f) => ({
      ...f,
      modelos: f.modelos.includes(m) ? f.modelos.filter((x) => x !== m) : [...f.modelos, m],
    }))
  }

  return (
    <div className="sat-theme">
      <div className="p-6 space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-white">Catálogo de repuestos</h1>
            <p className="text-sm text-zinc-400">Repuestos, accesorios y consumibles FEIN</p>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => setShowBulk(true)} className="sat-btn">
              <Percent className="w-4 h-4 mr-2" />Ajuste masivo
            </Button>
            <Button onClick={openNuevo} className="sat-btn">
              <Plus className="w-4 h-4 mr-2" />Nuevo repuesto
            </Button>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="sat-kpi c-or">
            <KPICard label="Total repuestos" value={kpis.total} icon={<Package className="w-5 h-5" />} color="#FF6600" />
          </div>
          <div className="sat-kpi c-bl">
            <KPICard label="Total accesorios" value={kpis.accesorios} icon={<Wrench className="w-5 h-5" />} color="#3B82F6" />
          </div>
          <div className="sat-kpi c-pu">
            <KPICard label="Custom" value={kpis.custom} icon={<Sparkles className="w-5 h-5" />} color="#A855F7" />
          </div>
        </div>

        <Card className="p-4 bg-zinc-900 border-zinc-800">
          <div className="flex flex-col md:flex-row gap-3 mb-4">
            <SearchBar value={search} onChange={setSearch} placeholder="Buscar por código o descripción..." className="flex-1" />
            <select
              value={modelo}
              onChange={(e) => setModelo(e.target.value)}
              className="bg-zinc-800 border border-zinc-700 text-white rounded-md px-3 py-2 text-sm"
            >
              <option value="">Todos los modelos</option>
              {MODELOS_FEIN.map((m) => <option key={m} value={m}>{m}</option>)}
            </select>
          </div>

          <div className="sat-table overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>POS</TableHead>
                  <TableHead>Código</TableHead>
                  <TableHead>Descripción</TableHead>
                  <TableHead>Modelos</TableHead>
                  {isAdmin && <TableHead className="text-right">€ EUR</TableHead>}
                  <TableHead className="text-right">$ ARS</TableHead>
                  <TableHead className="text-center">Acciones</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {loading ? (
                  <TableRow><TableCell className="text-center py-8 text-zinc-500">Cargando...</TableCell></TableRow>
                ) : parts.length === 0 ? (
                  <TableRow><TableCell className="text-center py-8 text-zinc-500">Sin repuestos</TableCell></TableRow>
                ) : parts.map((p) => (
                  <TableRow key={p.id}>
                    <TableCell className="font-mono text-xs text-orange-400">{p.pos || '-'}</TableCell>
                    <TableCell className="font-mono text-xs">{p.codigo || p.sku}</TableCell>
                    <TableCell>
                      {p.descripcion}
                      {p.is_custom && <Badge variant="default" className="ml-2">custom</Badge>}
                    </TableCell>
                    <TableCell className="text-xs text-zinc-400">{(p.modelos || []).join(', ')}</TableCell>
                    {isAdmin && <TableCell className="text-right font-mono text-xs">{fmtNumber(p.precio_eur || 0)}</TableCell>}
                    <TableCell className="text-right font-mono text-xs text-orange-400">{fmtNumber(p.precio_venta || 0)}</TableCell>
                    <TableCell className="text-center">
                      <div className="flex gap-1 justify-center">
                        <Button size="sm" variant="outline" onClick={() => openEditar(p)} title="Editar">
                          <Pencil className="w-3 h-3" />
                        </Button>
                        <Button size="sm" variant="outline" onClick={() => setConfirmDel({ id: p.id, desc: p.descripcion })} title="Eliminar">
                          <Trash2 className="w-3 h-3" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </Card>
      </div>

      <Modal isOpen={showForm} onClose={() => setShowForm(false)} title={form.id ? 'Editar repuesto' : 'Nuevo repuesto'} size="lg">
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div className="fg full">
              <label>SKU *</label>
              <input className="sat-input" value={form.sku} onChange={(e) => setForm({ ...form, sku: e.target.value })} placeholder="ej. REP.31912132010_ASM18-12_p10" disabled={!!form.id} />
            </div>
            <div className="fg full">
              <label>Código FEIN</label>
              <input className="sat-input" value={form.codigo} onChange={(e) => setForm({ ...form, codigo: e.target.value })} placeholder="31912132010" />
            </div>
          </div>
          <div className="fg full">
            <label>Descripción *</label>
            <input className="sat-input" value={form.descripcion} onChange={(e) => setForm({ ...form, descripcion: e.target.value })} placeholder="Carcasa de motor" />
          </div>
          <div className="grid grid-cols-3 gap-3">
            <div className="fg full">
              <label>POS</label>
              <input className="sat-input" value={form.pos} onChange={(e) => setForm({ ...form, pos: e.target.value })} placeholder="10" />
            </div>
            <div className="fg full">
              <label>Tipo</label>
              <select className="sat-input" value={form.tipo} onChange={(e) => setForm({ ...form, tipo: e.target.value as SparePart['tipo'] })}>
                <option value="repuesto">Repuesto</option>
                <option value="accesorio">Accesorio</option>
                <option value="consumible">Consumible</option>
                <option value="otro">Otro</option>
              </select>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="fg full">
              <label>Precio EUR</label>
              <input type="number" step="0.01" className="sat-input" value={form.precio_eur} onChange={(e) => setForm({ ...form, precio_eur: Number(e.target.value) })} />
            </div>
            <div className="fg full">
              <label>Precio ARS</label>
              <input type="number" step="0.01" className="sat-input" value={form.precio_venta} onChange={(e) => setForm({ ...form, precio_venta: Number(e.target.value) })} />
            </div>
          </div>
          <div className="fg full">
            <label>Modelos compatibles</label>
            <div className="flex flex-wrap gap-2 mt-1">
              {MODELOS_FEIN.map((m) => (
                <button
                  key={m}
                  type="button"
                  onClick={() => toggleModelo(m)}
                  className="px-3 py-1 rounded-md text-xs font-semibold border transition-colors"
                  style={{
                    background: form.modelos.includes(m) ? 'var(--sat-or-d)' : 'transparent',
                    color: form.modelos.includes(m) ? 'var(--sat-or)' : 'var(--sat-tx2)',
                    borderColor: form.modelos.includes(m) ? 'var(--sat-or)' : 'var(--sat-br2)',
                  }}
                >
                  {m}
                </button>
              ))}
            </div>
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="outline" onClick={() => setShowForm(false)} disabled={saving}>Cancelar</Button>
            <Button onClick={handleSave} disabled={saving}>{saving ? 'Guardando...' : 'Guardar'}</Button>
          </div>
        </div>
      </Modal>

      <Modal isOpen={showBulk} onClose={() => setShowBulk(false)} title="Ajuste masivo de precios" size="md">
        <div className="space-y-4">
          <p className="text-sm" style={{ color: 'var(--sat-tx2)' }}>
            Aplicar a los <strong style={{ color: 'var(--sat-or)' }}>{parts.length}</strong> repuestos filtrados.
          </p>
          <div className="grid grid-cols-2 gap-3">
            <div className="fg full">
              <label>Porcentaje (%)</label>
              <input type="number" step="0.1" min="0" max="100" className="sat-input" value={bulkPct} onChange={(e) => setBulkPct(Number(e.target.value))} />
            </div>
            <div className="fg full">
              <label>Dirección</label>
              <select className="sat-input" value={bulkDir} onChange={(e) => setBulkDir(e.target.value as 'up' | 'down')}>
                <option value="up">Aumentar (+)</option>
                <option value="down">Disminuir (-)</option>
              </select>
            </div>
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="outline" onClick={() => setShowBulk(false)} disabled={bulkSaving}>Cancelar</Button>
            <Button onClick={handleBulk} disabled={bulkSaving}>{bulkSaving ? 'Aplicando...' : 'Aplicar'}</Button>
          </div>
        </div>
      </Modal>

      <Modal isOpen={!!confirmDel} onClose={() => setConfirmDel(null)} title="Confirmar eliminación" size="sm">
        <div className="space-y-4">
          <p style={{ color: 'var(--sat-tx)' }}>
            ¿Eliminar el repuesto <strong>{confirmDel?.desc}</strong>?
          </p>
          <p className="text-xs" style={{ color: 'var(--sat-tx3)' }}>Esta acción no se puede deshacer.</p>
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => setConfirmDel(null)} disabled={deleting}>Cancelar</Button>
            <Button onClick={handleDelete} disabled={deleting} style={{ background: 'var(--sat-rd)' }}>
              {deleting ? 'Eliminando...' : 'Eliminar'}
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  )
}
