'use client'

import { useState, useEffect, useRef, useMemo } from 'react'
import { Search, X, ChevronDown, Check } from 'lucide-react'
import { fuzzyFilter } from '@/lib/sat/fuzzy-match'

export interface ClientOption {
  id: string
  name: string
  city?: string | null
}

interface Props {
  value: string | null
  onChange: (id: string | null, client?: ClientOption) => void
  clients: ClientOption[]
  placeholder?: string
  label?: string
  loading?: boolean
  disabled?: boolean
}

/**
 * Combobox con buscador para seleccionar un cliente.
 * Reemplaza el <Select> estandar cuando hay muchos clientes.
 */
export function ClientCombobox({ value, onChange, clients, placeholder = 'Buscar cliente...', label, loading, disabled }: Props) {
  const [open, setOpen] = useState(false)
  const [search, setSearch] = useState('')
  const containerRef = useRef<HTMLDivElement>(null)

  const selected = useMemo(
    () => clients.find((c) => c.id === value) || null,
    [clients, value]
  )

  const filtered = useMemo(() => {
    if (!search.trim()) return clients.slice(0, 50) // top 50 cuando no hay search
    return fuzzyFilter(clients, search, (c) => [c.name, c.city]).slice(0, 100)
  }, [clients, search])

  // Cerrar al hacer click fuera
  useEffect(() => {
    if (!open) return
    const onClick = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false)
      }
    }
    document.addEventListener('mousedown', onClick)
    return () => document.removeEventListener('mousedown', onClick)
  }, [open])

  const handleSelect = (c: ClientOption) => {
    onChange(c.id, c)
    setOpen(false)
    setSearch('')
  }

  const handleClear = (e: React.MouseEvent) => {
    e.stopPropagation()
    onChange(null)
    setSearch('')
  }

  return (
    <div ref={containerRef} className="relative">
      {label && (
        <label className="block text-sm font-medium mb-1.5" style={{ color: '#9CA3AF' }}>
          {label}
        </label>
      )}

      {/* Trigger */}
      <button
        type="button"
        onClick={() => !disabled && setOpen((v) => !v)}
        disabled={disabled}
        className="w-full flex items-center gap-2 rounded-lg px-3 py-2 text-sm transition-colors"
        style={{
          background: '#1E2330',
          border: '1px solid #2A3040',
          color: selected ? '#F0F2F5' : '#6B7280',
          cursor: disabled ? 'not-allowed' : 'pointer',
          opacity: disabled ? 0.6 : 1,
        }}
      >
        <span className="flex-1 text-left truncate">
          {loading ? 'Cargando...' : selected ? selected.name : placeholder}
        </span>
        {selected && !disabled && (
          <span
            onClick={handleClear}
            className="p-0.5 rounded hover:bg-black/20 cursor-pointer"
            role="button"
            tabIndex={0}
          >
            <X size={14} />
          </span>
        )}
        <ChevronDown size={14} className={open ? 'rotate-180 transition-transform' : 'transition-transform'} style={{ color: '#6B7280' }} />
      </button>

      {/* Dropdown */}
      {open && !disabled && (
        <div
          className="absolute top-full left-0 right-0 mt-1 z-50 rounded-lg overflow-hidden shadow-xl"
          style={{ background: '#0F1218', border: '1px solid #2A3040' }}
        >
          {/* Search input */}
          <div className="flex items-center gap-2 px-3 py-2 border-b" style={{ borderColor: '#1E2330' }}>
            <Search size={14} style={{ color: '#6B7280' }} />
            <input
              type="text"
              autoFocus
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Escribí para buscar..."
              className="flex-1 bg-transparent outline-none text-sm"
              style={{ color: '#F0F2F5' }}
              onKeyDown={(e) => {
                if (e.key === 'Escape') setOpen(false)
                if (e.key === 'Enter' && filtered.length > 0) handleSelect(filtered[0])
              }}
            />
            {search && (
              <button
                type="button"
                onClick={() => setSearch('')}
                className="p-0.5 rounded hover:bg-black/20"
                style={{ color: '#6B7280' }}
              >
                <X size={14} />
              </button>
            )}
          </div>

          {/* Options */}
          <div className="max-h-72 overflow-y-auto">
            {filtered.length === 0 ? (
              <div className="text-center py-6 text-sm" style={{ color: '#6B7280' }}>
                {search ? 'Sin resultados' : 'Sin clientes'}
              </div>
            ) : (
              filtered.map((c) => {
                const isSelected = c.id === value
                return (
                  <button
                    key={c.id}
                    type="button"
                    onClick={() => handleSelect(c)}
                    className="w-full flex items-center gap-2 px-3 py-2 text-sm text-left transition-colors hover:bg-black/20"
                    style={{
                      background: isSelected ? 'rgba(249, 115, 22, 0.1)' : 'transparent',
                      color: isSelected ? '#F97316' : '#D1D5DB',
                    }}
                  >
                    <span className="flex-1">
                      <span className="block truncate">{c.name}</span>
                      {c.city && (
                        <span className="block text-xs" style={{ color: '#6B7280' }}>{c.city}</span>
                      )}
                    </span>
                    {isSelected && <Check size={14} />}
                  </button>
                )
              })
            )}
          </div>

          {clients.length > 50 && !search && (
            <div className="text-xs text-center py-1.5 border-t" style={{ color: '#6B7280', borderColor: '#1E2330' }}>
              Mostrando primeros 50 — escribí para buscar entre {clients.length}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
