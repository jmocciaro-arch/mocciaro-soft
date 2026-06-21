'use client'

import { useState, useMemo } from 'react'
import Link from 'next/link'
import { Package, Wrench, History, Plus, ChevronRight, Users, Tag, ClipboardList, Pencil } from 'lucide-react'

const ASSET_CHANGE_REASONS: Array<{ value: string; label: string; hint: string }> = [
  { value: 'PARTE_DE_PAGO',   label: 'Parte de pago',     hint: 'Equipo recibido como parte de pago de otro' },
  { value: 'VENTA_A_CLIENTE', label: 'Venta a cliente',   hint: 'Equipo vendido a otro cliente' },
  { value: 'STOCK',           label: 'Pasa a stock',      hint: 'Queda en stock interno de la empresa' },
  { value: 'BACK_UP',         label: 'Back up',           hint: 'Reservado como respaldo / backup' },
  { value: 'DADO_DE_BAJA',    label: 'Dado de baja',      hint: 'Equipo dado de baja del parque' },
  { value: 'OTRO',            label: 'Otro',              hint: 'Especificar en el detalle' },
]
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
    id: '' as string,
    ref: '' as string,
    brand: 'FEIN', model: '', internal_id: '', serial_number: '',
    client_id: '', city: '', province: '', notes: '',
    reason: '' as string,        // solo se usa en edición (motivo del cambio)
    details: '' as string,       // solo se usa en edición (detalle libre)
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
      id: '', ref: '',
      brand: 'FEIN', model: '', internal_id: '', serial_number: '',
      client_id: '', city: '', province: '', notes: '',
      reason: '', details: '',
    })
    setShowNuevoActivo(true)
  }

  const handleEditarActivo = (a: any) => {
    setNuevoActivo({
      id: a.id,
      ref: a.ref || '',
      brand: a.brand || '',
      model: a.model || '',
      internal_id: a.internal_id || '',
      serial_number: a.serial_number || '',
      client_id: a.client_id || '',
      city: a.city || '',
      province: a.province || '',
      notes: a.notes || '',
      reason: '',     // reason se elige al editar, no se hereda
      details: '',
    })
    setShowNuevoActivo(true)
  }

  const guardarNuevoActivo = async () => {
    if (!nuevoActivo.brand || !nuevoActivo.model) {
      addToast({ type: 'warning', title: 'Marca y modelo son obligatorios' })
      return
    }
    const isEdit = !!nuevoActivo.id
    setSavingActivo(true)
    try {
      const sb = createClient()
      const clienteSeleccionado = clientes.find((c) => c.id === nuevoActivo.client_id)

      const baseFields = {
        internal_id: nuevoActivo.internal_id || null,
        serial_number: nuevoActivo.serial_number || null,
        brand: nuevoActivo.brand,
        model: nuevoActivo.model,
        model_normalized: nuevoActivo.model.replace(/\s+/g, '').replace(/-PC$/i, '').toUpperCase(),
        client_id: nuevoActivo.client_id || null,
        client_name_raw: clienteSeleccionado?.name || null,
        city: nuevoActivo.city || null,
        province: nuevoActivo.province || null,
        notes: nuevoActivo.notes || null,
      }

      if (isEdit) {
        const { error } = await sb.from('tt_sat_assets')
          .update(baseFields as any)
          .eq('id', nuevoActivo.id)
        if (error) {
          addToast({ type: 'error', title: 'Error', message: error.message })
          return
        }
        // Si el user puso un motivo / detalle, lo enganchamos al evento que
        // el trigger acaba de crear (último evento de este asset).
        if (nuevoActivo.reason || nuevoActivo.details) {
          const { data: lastEvent } = await sb
            .from('tt_sat_asset_events')
            .select('id')
            .eq('asset_id', nuevoActivo.id)
            .order('performed_at', { ascending: false })
            .limit(1)
            .maybeSingle()
          if (lastEvent?.id) {
            await sb.from('tt_sat_asset_events').update({
              reason: nuevoActivo.reason || null,
              details: nuevoActivo.details || null,
            }).eq('id', lastEvent.id)
          }
        }
        addToast({ type: 'success', title: 'Activo actualizado', message: nuevoActivo.ref })
      } else {
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

        const { data: co } = await sb.from('tt_companies').select('id').ilike('name', '%torquetools%').limit(1)
        const companyId = (co as Array<{ id: string }> | null)?.[0]?.id
        if (!companyId) {
          addToast({ type: 'error', title: 'No se encontró empresa TorqueTools' })
          return
        }

        const { error } = await sb.from('tt_sat_assets').insert({
          ref,
          ...baseFields,
          company_id: companyId,
          country: 'AR',
          is_new: true,
        } as any)
        if (error) {
          addToast({ type: 'error', title: 'Error', message: error.message })
          return
        }
        addToast({ type: 'success', title: 'Activo creado', message: ref })
      }
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
                        <div className="flex gap-1 justify-center">
                          <Button size="sm" variant="secondary" onClick={() => handleEditarActivo(a)} title="Editar activo">
                            <Pencil size={14} />
                          </Button>
                          <Link href={`/sat/activos/${a.id}`}>
                            <Button size="sm" variant="secondary">Ver <ChevronRight size={14} /></Button>
                          </Link>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        </Card>
      </div>

      {/* Modal nuevo/editar activo */}
      <Modal
        isOpen={showNuevoActivo}
        onClose={() => setShowNuevoActivo(false)}
        title={nuevoActivo.id ? `Editar activo · ${nuevoActivo.ref}` : '+ Nuevo activo'}
        size="lg"
      >
        <div className="space-y-4">
          <p className="text-xs" style={{ color: '#6B7280' }}>
            {nuevoActivo.id
              ? 'Cambiá el cliente para transferir el activo (parte de pago, venta a otro cliente, etc.)'
              : 'La referencia se genera automáticamente (ACTxxxxx)'}
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
            <label className="block text-sm font-medium mb-1.5" style={{ color: '#9CA3AF' }}>Notas (persistentes del activo)</label>
            <textarea
              value={nuevoActivo.notes}
              onChange={(e) => setNuevoActivo({ ...nuevoActivo, notes: e.target.value })}
              rows={2}
              className="w-full rounded-lg px-3 py-2 text-sm outline-none resize-none"
              style={{ background: '#1E2330', border: '1px solid #2A3040', color: '#F0F2F5' }}
            />
          </div>

          {/* Motivo del cambio — solo en edición */}
          {nuevoActivo.id && (
            <div
              className="space-y-3 p-3 rounded-lg"
              style={{ background: 'rgba(249,115,22,0.05)', border: '1px solid rgba(249,115,22,0.25)' }}
            >
              <div>
                <label className="block text-sm font-medium mb-2" style={{ color: '#FB923C' }}>
                  Motivo del cambio (queda en la línea de tiempo)
                </label>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                  {ASSET_CHANGE_REASONS.map((r) => {
                    const active = nuevoActivo.reason === r.value
                    return (
                      <button
                        key={r.value}
                        type="button"
                        onClick={() => setNuevoActivo({ ...nuevoActivo, reason: active ? '' : r.value })}
                        title={r.hint}
                        className="text-left px-3 py-2 rounded-md text-xs font-semibold border transition-all"
                        style={{
                          background: active ? 'rgba(249,115,22,0.15)' : '#1E2330',
                          color: active ? '#FB923C' : '#9CA3AF',
                          borderColor: active ? '#F97316' : '#2A3040',
                        }}
                      >
                        {active ? '✓ ' : ''}{r.label}
                      </button>
                    )
                  })}
                </div>
              </div>
              <div>
                <label className="block text-xs font-medium mb-1.5" style={{ color: '#9CA3AF' }}>
                  Detalle del cambio (opcional, queda en la timeline)
                </label>
                <textarea
                  value={nuevoActivo.details}
                  onChange={(e) => setNuevoActivo({ ...nuevoActivo, details: e.target.value })}
                  rows={2}
                  placeholder="Ej: Recibido como parte de pago de Whirlpool por venta de ASW18-60-PC nuevo. Negociado por Juan."
                  className="w-full rounded-lg px-3 py-2 text-sm outline-none resize-none"
                  style={{ background: '#1E2330', border: '1px solid #2A3040', color: '#F0F2F5' }}
                />
              </div>
            </div>
          )}

          <div className="flex justify-end gap-2 pt-3" style={{ borderTop: '1px solid #1E2330' }}>
            <Button variant="secondary" onClick={() => setShowNuevoActivo(false)}>Cancelar</Button>
            <Button onClick={guardarNuevoActivo} loading={savingActivo}>
              {nuevoActivo.id ? 'Guardar cambios' : 'Crear activo'}
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  )
}
