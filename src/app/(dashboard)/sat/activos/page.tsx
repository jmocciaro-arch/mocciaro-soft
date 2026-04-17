'use client'

import { useState, useMemo } from 'react'
import Link from 'next/link'
import { Package, Wrench, History, Plus, ChevronRight, Users, Tag, ClipboardList } from 'lucide-react'
import { fuzzyFilter } from '@/lib/sat/fuzzy-match'
import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'
import { useEffect } from 'react'
import { Modal } from '@/components/ui/modal'
import { ClientCombobox } from '@/components/sat/client-combobox'
import { useCompanyFilter } from '@/hooks/use-company-filter'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import {
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
} from '@/components/ui/table'
import { SearchBar } from '@/components/ui/search-bar'
import { KPICard } from '@/components/ui/kpi-card'
import { useToast } from '@/components/ui/toast'
import { useSatAssets } from '@/hooks/use-sat-assets'
import '@/components/sat/buscatools-theme.css'

export default function SatActivosPage() {
  const { assets, loading, reload } = useSatAssets()
  const { addToast } = useToast()
  const router = useRouter()
  const [search, setSearch] = useState('')
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [creating, setCreating] = useState(false)
  const [showNuevoActivo, setShowNuevoActivo] = useState(false)
  const [clientes, setClientes] = useState<Array<{ id: string; name: string; city?: string | null }>>([])
  const [nuevoActivo, setNuevoActivo] = useState({
    brand: 'FEIN', model: '', internal_id: '', serial_number: '',
    client_id: '', city: '', province: '', notes: '',
  })
  const [savingActivo, setSavingActivo] = useState(false)
  const { } = useCompanyFilter()

  // Cargar clientes para el modal
  useEffect(() => {
    (async () => {
      const sb = createClient()
      const { data } = await sb
        .from('tt_clients')
        .select('id, name, city')
        .eq('active', true)
        .order('name')
        .limit(5000)
      // Dedup por nombre
      const seen = new Set<string>()
      const deduped = (data || []).filter((c) => {
        const k = ((c.name as string) || '').toLowerCase().trim()
        if (seen.has(k)) return false
        seen.add(k)
        return true
      }) as Array<{ id: string; name: string; city?: string | null }>
      setClientes(deduped)
    })()
  }, [])

  const filtered = useMemo(() => {
    if (!search.trim()) return assets
    return fuzzyFilter(assets, search, (a) => [
      a.ref, a.internal_id, a.serial_number, a.brand,
      a.model, a.model_normalized,
      a.tt_clients?.name, a.client_name_raw, a.city, a.province,
    ])
  }, [assets, search])

  const kpis = useMemo(() => {
    const total = assets.length
    const marcas = new Set(assets.map((a) => (a.brand || '').toUpperCase()).filter(Boolean))
    const clientes = new Set(assets.map((a) => a.tt_clients?.name || a.client_name_raw).filter(Boolean))
    return { total, marcas: marcas.size, clientes: clientes.size, historial: 0 }
  }, [assets])

  const handleNuevoActivo = () => {
    setNuevoActivo({
      brand: 'FEIN', model: '', internal_id: '', serial_number: '',
      client_id: '', city: '', province: '', notes: '',
    })
    setShowNuevoActivo(true)
  }

  const guardarNuevoActivo = async () => {
    if (!nuevoActivo.brand || !nuevoActivo.model) {
      addToast({ type: 'warning', title: 'Marca y modelo son obligatorios' })
      return
    }
    setSavingActivo(true)
    try {
      const sb = createClient()
      // Generar ref auto (siguiente ACTXXXXX)
      const { data: maxRef } = await sb
        .from('tt_sat_assets')
        .select('ref')
        .ilike('ref', 'ACT%')
        .order('ref', { ascending: false })
        .limit(1)
      let nextNum = 400
      if (maxRef && maxRef.length) {
        const n = parseInt(((maxRef[0].ref as string) || '').replace(/\D/g, ''))
        if (!isNaN(n)) nextNum = n + 1
      }
      const ref = `ACT${String(nextNum).padStart(5, '0')}`

      // Obtener company de TorqueTools
      const { data: co } = await sb.from('tt_companies').select('id').ilike('name', '%torquetools%').limit(1)
      const companyId = (co as Array<{ id: string }> | null)?.[0]?.id

      if (!companyId) {
        addToast({ type: 'error', title: 'No se encontró empresa TorqueTools' })
        setSavingActivo(false)
        return
      }

      const clienteSeleccionado = clientes.find((c) => c.id === nuevoActivo.client_id)

      const { error } = await sb.from('tt_sat_assets').insert({
        ref,
        internal_id: nuevoActivo.internal_id || null,
        serial_number: nuevoActivo.serial_number || null,
        brand: nuevoActivo.brand,
        model: nuevoActivo.model,
        model_normalized: nuevoActivo.model.replace(/\s+/g, '').replace(/-PC$/i, '').toUpperCase(),
        client_id: nuevoActivo.client_id || null,
        client_name_raw: clienteSeleccionado?.name || null,
        company_id: companyId,
        city: nuevoActivo.city || null,
        province: nuevoActivo.province || null,
        country: 'AR',
        is_new: true,
        notes: nuevoActivo.notes || null,
      } as any)

      if (error) {
        addToast({ type: 'error', title: 'Error', message: error.message })
        setSavingActivo(false)
        return
      }
      addToast({ type: 'success', title: 'Activo creado', message: ref })
      setShowNuevoActivo(false)
      reload()
    } finally {
      setSavingActivo(false)
    }
  }

  const toggleSelect = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id); else next.add(id)
      return next
    })
  }

  const selectAll = () => {
    if (selected.size === filtered.length) setSelected(new Set())
    else setSelected(new Set(filtered.map((a) => a.id)))
  }

  const crearHojaMantenimiento = async () => {
    if (selected.size === 0) return
    // Tomar la lista de activos seleccionados y validar que sean del mismo cliente
    const selectedAssets = assets.filter((a) => selected.has(a.id))
    const clientNames = new Set(
      selectedAssets.map((a) => a.tt_clients?.name || a.client_name_raw).filter(Boolean)
    )
    if (clientNames.size > 1) {
      if (!confirm(`Hay ${clientNames.size} clientes distintos en la selección. ¿Querés crear una hoja de igual forma? (se agruparán todos bajo la misma NTT)`)) return
    }
    setCreating(true)
    try {
      const sb = createClient()
      // Generar NTT number
      const yr = new Date().getFullYear().toString().slice(-2)
      const mo = (new Date().getMonth() + 1).toString().padStart(2, '0')
      const seq = Math.floor(Math.random() * 9999).toString().padStart(4, '0')
      const nttNumber = `NTT-${yr}${mo}-${seq}`
      const clientId = selectedAssets[0].client_id || null

      // Crear 1 ticket por activo, todos agrupados con el mismo ntt_number en metadata
      const rows = selectedAssets.map((a) => ({
        number: `${nttNumber}-${a.internal_id || a.ref}`,
        client_id: a.client_id || clientId,
        serial_number: a.serial_number || a.ref,
        priority: 'normal',
        status: 'open',
        description: `Mantenimiento ${a.brand || 'FEIN'} ${a.model || ''} — ${a.internal_id || a.ref}`,
        metadata: { ntt_number: nttNumber, asset_id: a.id },
      }))

      const { error } = await sb.from('tt_sat_tickets').insert(rows as any)
      if (error) {
        addToast({ type: 'error', title: 'Error', message: error.message })
        return
      }
      addToast({ type: 'success', title: `Hoja ${nttNumber} creada`, message: `${selectedAssets.length} equipo(s) incluidos` })
      setSelected(new Set())
      router.push(`/sat/hojas/${nttNumber}`)
    } finally {
      setCreating(false)
    }
  }

  return (
    <div className="sat-theme">
      <div className="p-6 space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-white">Activos</h1>
            <p className="text-sm text-zinc-400">
              Parque instalado — tildá equipos para agruparlos en una hoja de mantenimiento
            </p>
          </div>
          <div className="flex gap-2">
            {selected.size > 0 && (
              <Button onClick={crearHojaMantenimiento} disabled={creating} className="sat-btn-pr">
                <ClipboardList className="w-4 h-4 mr-2" />
                {creating ? 'Creando...' : `Crear hoja de mantenimiento (${selected.size})`}
              </Button>
            )}
            <Button className="sat-btn" variant="secondary" onClick={handleNuevoActivo}>
              <Plus className="w-4 h-4 mr-2" />
              Nuevo activo
            </Button>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <div className="sat-kpi c-or">
            <KPICard
              label="Total activos"
              value={kpis.total}
              icon={<Package className="w-5 h-5" />}
              color="#FF6600"
            />
          </div>
          <div className="sat-kpi c-bl">
            <KPICard
              label="Marcas"
              value={kpis.marcas}
              icon={<Tag className="w-5 h-5" />}
              color="#3B82F6"
            />
          </div>
          <div className="sat-kpi c-gn">
            <KPICard
              label="Clientes"
              value={kpis.clientes}
              icon={<Users className="w-5 h-5" />}
              color="#10B981"
            />
          </div>
          <div className="sat-kpi c-pu">
            <KPICard
              label="Seleccionados"
              value={selected.size}
              icon={<ClipboardList className="w-5 h-5" />}
              color="#A855F7"
            />
          </div>
        </div>

        <Card className="p-4 bg-zinc-900 border-zinc-800">
          <div className="flex flex-col md:flex-row gap-3 mb-4">
            <SearchBar
              value={search}
              onChange={setSearch}
              placeholder="Buscar por marca, modelo, serie, cliente, ciudad, ID... (ej. 'simpa asm' o '18-3')"
              className="flex-1"
            />
            {filtered.length > 0 && (
              <Button variant="secondary" onClick={selectAll} className="sat-btn">
                {selected.size === filtered.length ? 'Deseleccionar todo' : `Seleccionar ${filtered.length}`}
              </Button>
            )}
          </div>

          <div className="sat-table overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-8"> </TableHead>
                  <TableHead>Ref</TableHead>
                  <TableHead>ID</TableHead>
                  <TableHead>Modelo</TableHead>
                  <TableHead>Serie</TableHead>
                  <TableHead>Cliente</TableHead>
                  <TableHead>Ciudad</TableHead>
                  <TableHead className="text-center">Acción</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {loading ? (
                  <TableRow>
                    <TableCell className="text-center py-8 text-zinc-500">
                      Cargando...
                    </TableCell>
                  </TableRow>
                ) : filtered.length === 0 ? (
                  <TableRow>
                    <TableCell className="text-center py-8 text-zinc-500">
                      Sin activos
                    </TableCell>
                  </TableRow>
                ) : (
                  filtered.map((a) => (
                    <TableRow key={a.id}>
                      <TableCell>
                        <input
                          type="checkbox"
                          checked={selected.has(a.id)}
                          onChange={() => toggleSelect(a.id)}
                          className="accent-orange-500 w-4 h-4 cursor-pointer"
                        />
                      </TableCell>
                      <TableCell className="font-mono text-xs text-orange-400">
                        <Link href={`/sat/activos/${a.id}`} className="hover:underline">{a.ref}</Link>
                      </TableCell>
                      <TableCell className="font-mono text-xs text-zinc-400">
                        {a.internal_id || '-'}
                      </TableCell>
                      <TableCell>
                        <Badge variant="default">{a.model || '-'}</Badge>
                      </TableCell>
                      <TableCell className="font-mono text-xs">
                        {a.serial_number || '-'}
                      </TableCell>
                      <TableCell>
                        {a.tt_clients?.name || a.client_name_raw || '-'}
                      </TableCell>
                      <TableCell>{a.city || '-'}</TableCell>
                      <TableCell className="text-center">
                        <Link href={`/sat/activos/${a.id}`}>
                          <Button size="sm" variant="secondary">Ver <ChevronRight size={14} /></Button>
                        </Link>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        </Card>
      </div>

      {/* Modal nuevo activo */}
      <Modal isOpen={showNuevoActivo} onClose={() => setShowNuevoActivo(false)} title="+ Nuevo activo" size="lg">
        <div className="space-y-4">
          <p className="text-xs" style={{ color: '#6B7280' }}>
            La referencia se genera automáticamente (ACTxxxxx)
          </p>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-medium mb-1.5" style={{ color: '#9CA3AF' }}>Marca *</label>
              <input
                type="text"
                value={nuevoActivo.brand}
                onChange={(e) => setNuevoActivo({ ...nuevoActivo, brand: e.target.value })}
                placeholder="FEIN, Ingersoll Rand, Estic..."
                className="w-full rounded-lg px-3 py-2 text-sm outline-none"
                style={{ background: '#1E2330', border: '1px solid #2A3040', color: '#F0F2F5' }}
              />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1.5" style={{ color: '#9CA3AF' }}>Modelo *</label>
              <input
                type="text"
                value={nuevoActivo.model}
                onChange={(e) => setNuevoActivo({ ...nuevoActivo, model: e.target.value })}
                placeholder="ASM18-8-PC, QE8 Series..."
                className="w-full rounded-lg px-3 py-2 text-sm outline-none"
                style={{ background: '#1E2330', border: '1px solid #2A3040', color: '#F0F2F5' }}
              />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1.5" style={{ color: '#9CA3AF' }}>ID interno cliente</label>
              <input
                type="text"
                value={nuevoActivo.internal_id}
                onChange={(e) => setNuevoActivo({ ...nuevoActivo, internal_id: e.target.value })}
                placeholder="W001, P024, BB004..."
                className="w-full rounded-lg px-3 py-2 text-sm outline-none"
                style={{ background: '#1E2330', border: '1px solid #2A3040', color: '#F0F2F5' }}
              />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1.5" style={{ color: '#9CA3AF' }}>N° de serie</label>
              <input
                type="text"
                value={nuevoActivo.serial_number}
                onChange={(e) => setNuevoActivo({ ...nuevoActivo, serial_number: e.target.value })}
                placeholder="2024 09 000054"
                className="w-full rounded-lg px-3 py-2 text-sm outline-none"
                style={{ background: '#1E2330', border: '1px solid #2A3040', color: '#F0F2F5' }}
              />
            </div>
          </div>

          <ClientCombobox
            label="Cliente"
            value={nuevoActivo.client_id || null}
            onChange={(id) => setNuevoActivo({ ...nuevoActivo, client_id: id || '' })}
            clients={clientes}
            placeholder="Buscar cliente..."
          />

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-medium mb-1.5" style={{ color: '#9CA3AF' }}>Ciudad</label>
              <input
                type="text"
                value={nuevoActivo.city}
                onChange={(e) => setNuevoActivo({ ...nuevoActivo, city: e.target.value })}
                className="w-full rounded-lg px-3 py-2 text-sm outline-none"
                style={{ background: '#1E2330', border: '1px solid #2A3040', color: '#F0F2F5' }}
              />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1.5" style={{ color: '#9CA3AF' }}>Provincia</label>
              <input
                type="text"
                value={nuevoActivo.province}
                onChange={(e) => setNuevoActivo({ ...nuevoActivo, province: e.target.value })}
                className="w-full rounded-lg px-3 py-2 text-sm outline-none"
                style={{ background: '#1E2330', border: '1px solid #2A3040', color: '#F0F2F5' }}
              />
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium mb-1.5" style={{ color: '#9CA3AF' }}>Notas</label>
            <textarea
              value={nuevoActivo.notes}
              onChange={(e) => setNuevoActivo({ ...nuevoActivo, notes: e.target.value })}
              rows={2}
              className="w-full rounded-lg px-3 py-2 text-sm outline-none resize-none"
              style={{ background: '#1E2330', border: '1px solid #2A3040', color: '#F0F2F5' }}
            />
          </div>

          <div className="flex justify-end gap-2 pt-3" style={{ borderTop: '1px solid #1E2330' }}>
            <Button variant="secondary" onClick={() => setShowNuevoActivo(false)}>Cancelar</Button>
            <Button onClick={guardarNuevoActivo} loading={savingActivo}>Crear activo</Button>
          </div>
        </div>
      </Modal>
    </div>
  )
}
