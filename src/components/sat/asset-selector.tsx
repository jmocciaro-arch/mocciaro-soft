'use client'

import { useMemo, useState } from 'react'
import { useSatAssets } from '@/hooks/use-sat-assets'
import { fuzzyFilter } from '@/lib/sat/fuzzy-match'

interface Props {
  value: string | null
  onChange: (assetId: string | null) => void
  label?: string
}

/**
 * Selector de activos FEIN filtrable por cliente/modelo/id.
 * Muestra un dropdown tipo combobox con buscador.
 */
export function AssetSelector({ value, onChange, label = 'Herramienta' }: Props) {
  const [cliFilter, setCliFilter] = useState('')
  const [modFilter, setModFilter] = useState('')
  const [idFilter, setIdFilter] = useState('')
  const { assets, loading } = useSatAssets()

  const clientes = useMemo(() => {
    const set = new Set<string>()
    assets.forEach((a) => {
      const name = a.tt_clients?.name || a.client_name_raw
      if (name) set.add(name)
    })
    return Array.from(set).sort()
  }, [assets])

  const modelos = useMemo(() => {
    const set = new Set<string>()
    assets.forEach((a) => { if (a.model_normalized) set.add(a.model_normalized) })
    return Array.from(set).sort()
  }, [assets])

  const filtered = useMemo(() => {
    // 1) Por cliente exacto y modelo exacto (si elegidos)
    let list = assets.filter((a) => {
      const name = a.tt_clients?.name || a.client_name_raw || ''
      if (cliFilter && name !== cliFilter) return false
      if (modFilter && (a.model_normalized || '') !== modFilter) return false
      return true
    })
    // 2) Fuzzy tokenized search por ref/id/serie/modelo/cliente
    if (idFilter.trim()) {
      list = fuzzyFilter(list, idFilter, (a) => [
        a.ref, a.internal_id, a.serial_number, a.model, a.model_normalized,
        a.tt_clients?.name, a.client_name_raw,
      ])
    }
    return list
  }, [assets, cliFilter, modFilter, idFilter])

  return (
    <div className="space-y-2">
      <div className="sn sn-o">{label}</div>
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
        <div className="fg">
          <label>Cliente</label>
          <select value={cliFilter} onChange={(e) => setCliFilter(e.target.value)}>
            <option value="">Todos</option>
            {clientes.map((c) => <option key={c}>{c}</option>)}
          </select>
        </div>
        <div className="fg">
          <label>Modelo</label>
          <select value={modFilter} onChange={(e) => setModFilter(e.target.value)}>
            <option value="">Todos</option>
            {modelos.map((m) => <option key={m}>{m}</option>)}
          </select>
        </div>
        <div className="fg">
          <label>ID / serie</label>
          <input
            type="text"
            value={idFilter}
            onChange={(e) => setIdFilter(e.target.value)}
            placeholder="ID, serie, ref"
          />
        </div>
      </div>
      <div className="fg">
        <label>Seleccionar herramienta ({filtered.length} de {assets.length})</label>
        <select value={value || ''} onChange={(e) => onChange(e.target.value || null)}>
          <option value="">— elegir herramienta —</option>
          {loading ? (
            <option disabled>Cargando...</option>
          ) : (
            filtered.map((a) => {
              const name = a.tt_clients?.name || a.client_name_raw || 'Sin cliente'
              return (
                <option key={a.id} value={a.id}>
                  {a.ref} | {a.internal_id || '–'} | {a.model_normalized || '–'} | {name}
                  {a.is_new ? ' ★' : ''}
                </option>
              )
            })
          )}
        </select>
      </div>
    </div>
  )
}
