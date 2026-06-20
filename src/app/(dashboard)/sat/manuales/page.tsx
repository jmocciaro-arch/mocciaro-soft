'use client'

import { useState, useEffect, useMemo, useCallback } from 'react'
import { FileText, Book, Wrench, File, Plus, ExternalLink, Pencil, Trash2 } from 'lucide-react'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { SearchBar } from '@/components/ui/search-bar'
import { Modal } from '@/components/ui/modal'
import { useToast } from '@/components/ui/toast'
import { createClient } from '@/lib/supabase/client'
import { MODELOS_FEIN } from '@/lib/sat/fein-data'
import '@/components/sat/buscatools-theme.css'

type Tipo = 'manual' | 'catalogo' | 'instructivo' | 'otro'

interface SatManual {
  id: string
  titulo: string
  descripcion: string | null
  tipo: Tipo | string
  modelos: string[] | null
  url: string
  created_at: string
}

type FormState = {
  id?: string
  titulo: string
  descripcion: string
  tipo: Tipo
  modelos: string[]
  url: string
}

const EMPTY: FormState = { titulo: '', descripcion: '', tipo: 'manual', modelos: [], url: '' }

const iconForTipo = (tipo: string) => {
  switch (tipo) {
    case 'manual': return <Book className="w-5 h-5" />
    case 'catalogo': return <FileText className="w-5 h-5" />
    case 'instructivo': return <Wrench className="w-5 h-5" />
    default: return <File className="w-5 h-5" />
  }
}

export default function SatManualesPage() {
  const [manuales, setManuales] = useState<SatManual[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [modelo, setModelo] = useState<string>('')
  const { addToast } = useToast()

  const [showForm, setShowForm] = useState(false)
  const [form, setForm] = useState<FormState>(EMPTY)
  const [saving, setSaving] = useState(false)

  const [confirmDel, setConfirmDel] = useState<SatManual | null>(null)
  const [deleting, setDeleting] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    const sb = createClient()
    const { data, error } = await sb
      .from('tt_sat_manuals')
      .select('*')
      .order('created_at', { ascending: false })
    if (!error && data) setManuales(data as SatManual[])
    setLoading(false)
  }, [])

  useEffect(() => { load() }, [load])

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    return manuales.filter((m) => {
      if (modelo && !(m.modelos || []).includes(modelo)) return false
      if (!q) return true
      return (
        m.titulo?.toLowerCase().includes(q) ||
        m.descripcion?.toLowerCase().includes(q) ||
        (m.modelos || []).some((mm) => mm.toLowerCase().includes(q))
      )
    })
  }, [manuales, search, modelo])

  const openNuevo = () => { setForm(EMPTY); setShowForm(true) }
  const openEditar = (m: SatManual) => {
    setForm({
      id: m.id,
      titulo: m.titulo,
      descripcion: m.descripcion || '',
      tipo: (m.tipo as Tipo) || 'manual',
      modelos: m.modelos || [],
      url: m.url,
    })
    setShowForm(true)
  }

  const handleSave = async () => {
    if (!form.titulo.trim() || !form.url.trim()) {
      addToast({ type: 'warning', title: 'Título y URL son obligatorios' })
      return
    }
    setSaving(true)
    try {
      const sb = createClient()
      const row = {
        titulo: form.titulo.trim(),
        descripcion: form.descripcion.trim() || null,
        tipo: form.tipo,
        modelos: form.modelos.length ? form.modelos : null,
        url: form.url.trim(),
      }
      if (form.id) {
        const { error } = await sb.from('tt_sat_manuals').update(row).eq('id', form.id)
        if (error) throw error
      } else {
        const { error } = await sb.from('tt_sat_manuals').insert(row)
        if (error) throw error
      }
      addToast({ type: 'success', title: form.id ? 'Manual actualizado' : 'Manual creado' })
      setShowForm(false)
      await load()
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
      const sb = createClient()
      const { error } = await sb.from('tt_sat_manuals').delete().eq('id', confirmDel.id)
      if (error) throw error
      addToast({ type: 'success', title: 'Eliminado', message: confirmDel.titulo })
      setConfirmDel(null)
      await load()
    } catch (e) {
      addToast({ type: 'error', title: 'Error', message: (e as Error)?.message || '' })
    } finally {
      setDeleting(false)
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
            <h1 className="text-2xl font-bold text-white">Manuales SAT</h1>
            <p className="text-sm text-zinc-400">Documentación técnica, catálogos e instructivos</p>
          </div>
          <Button onClick={openNuevo} className="sat-btn">
            <Plus className="w-4 h-4 mr-2" />Nuevo manual
          </Button>
        </div>

        <Card className="p-4 bg-zinc-900 border-zinc-800">
          <div className="flex flex-col md:flex-row gap-3">
            <SearchBar value={search} onChange={setSearch} placeholder="Buscar manual..." className="flex-1" />
            <select
              value={modelo}
              onChange={(e) => setModelo(e.target.value)}
              className="bg-zinc-800 border border-zinc-700 text-white rounded-md px-3 py-2 text-sm"
            >
              <option value="">Todos los modelos</option>
              {MODELOS_FEIN.map((m) => <option key={m} value={m}>{m}</option>)}
            </select>
          </div>
        </Card>

        {loading ? (
          <div className="text-center text-zinc-500 py-12">Cargando...</div>
        ) : filtered.length === 0 ? (
          <div className="text-center text-zinc-500 py-12">Sin manuales</div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {filtered.map((m) => (
              <Card key={m.id} className="p-5 bg-zinc-900 border-zinc-800 sat-kpi c-or flex flex-col">
                <div className="flex items-start gap-3 mb-3">
                  <div className="text-orange-400">{iconForTipo(m.tipo)}</div>
                  <div className="flex-1">
                    <h3 className="font-semibold text-white">{m.titulo}</h3>
                    <Badge variant="default" className="mt-1 text-xs">{m.tipo}</Badge>
                  </div>
                  <div className="flex gap-1">
                    <Button size="sm" variant="outline" onClick={() => openEditar(m)} title="Editar">
                      <Pencil className="w-3 h-3" />
                    </Button>
                    <Button size="sm" variant="outline" onClick={() => setConfirmDel(m)} title="Eliminar">
                      <Trash2 className="w-3 h-3" />
                    </Button>
                  </div>
                </div>

                {m.modelos && m.modelos.length > 0 && (
                  <div className="flex flex-wrap gap-1 mb-3">
                    {m.modelos.map((md) => (
                      <Badge key={md} variant="default" className="text-xs">{md}</Badge>
                    ))}
                  </div>
                )}

                {m.descripcion && <p className="text-sm text-zinc-400 mb-4 flex-1">{m.descripcion}</p>}

                <Button onClick={() => window.open(m.url, '_blank')} className="sat-btn w-full">
                  <ExternalLink className="w-4 h-4 mr-2" />Abrir PDF
                </Button>
              </Card>
            ))}
          </div>
        )}
      </div>

      <Modal isOpen={showForm} onClose={() => setShowForm(false)} title={form.id ? 'Editar manual' : 'Nuevo manual'} size="lg">
        <div className="space-y-4">
          <div className="fg full">
            <label>Título *</label>
            <input className="sat-input" value={form.titulo} onChange={(e) => setForm({ ...form, titulo: e.target.value })} placeholder="Manual FEIN ASM18-12" />
          </div>
          <div className="fg full">
            <label>Descripción</label>
            <textarea className="sat-input" value={form.descripcion} onChange={(e) => setForm({ ...form, descripcion: e.target.value })} rows={3} placeholder="Documento técnico oficial..." />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="fg full">
              <label>Tipo</label>
              <select className="sat-input" value={form.tipo} onChange={(e) => setForm({ ...form, tipo: e.target.value as Tipo })}>
                <option value="manual">Manual</option>
                <option value="catalogo">Catálogo</option>
                <option value="instructivo">Instructivo</option>
                <option value="otro">Otro</option>
              </select>
            </div>
            <div className="fg full">
              <label>URL del PDF *</label>
              <input className="sat-input" value={form.url} onChange={(e) => setForm({ ...form, url: e.target.value })} placeholder="https://..." />
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

      <Modal isOpen={!!confirmDel} onClose={() => setConfirmDel(null)} title="Confirmar eliminación" size="sm">
        <div className="space-y-4">
          <p style={{ color: 'var(--sat-tx)' }}>
            ¿Eliminar el manual <strong>{confirmDel?.titulo}</strong>?
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
