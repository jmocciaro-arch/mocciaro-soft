'use client'

import { useState, useMemo } from 'react'
import { Modal } from '@/components/ui/modal'
import { Button } from '@/components/ui/button'
import { useSpareParts, type SparePart } from '@/hooks/use-spare-parts'
import { fmtNumber } from '@/lib/sat/currency-converter'
import { fuzzyFilter } from '@/lib/sat/fuzzy-match'

interface Props {
  open: boolean
  onClose: () => void
  modelFilter?: string | null       // si viene, filtra por compatibilidad
  isAdmin?: boolean                  // admin ve EUR
  onPick: (part: SparePart) => void
}

/**
 * Modal que muestra repuestos filtrados por modelo con foto + precio.
 * Al hacer click en "+ Agregar" dispara onPick con el repuesto elegido.
 */
export function SparePartsPicker({ open, onClose, modelFilter, isAdmin, onPick }: Props) {
  const [search, setSearch] = useState('')
  const [showAll, setShowAll] = useState(false)  // toggle "solo modelo" / "todos"
  const effectiveModelFilter = showAll ? undefined : (modelFilter || undefined)
  const { parts, loading } = useSpareParts({ model: effectiveModelFilter })

  const filtered = useMemo(() => {
    if (!search.trim()) return parts
    return fuzzyFilter(parts, search, (p) => [p.descripcion, p.codigo, p.pos, p.sku, ...(p.modelos || [])])
  }, [parts, search])

  const titleText = modelFilter && !showAll
    ? `Repuestos y accesorios compatibles con ${modelFilter}`
    : 'Todos los repuestos y accesorios FEIN'

  return (
    <Modal
      isOpen={open}
      onClose={onClose}
      title={titleText}
      size="xl"
    >
      <div className="space-y-3">
        {modelFilter && (
          <div className="flex items-center gap-3 text-xs p-2 rounded-lg" style={{ background: 'rgba(249,115,22,0.08)', border: '1px solid rgba(249,115,22,0.2)' }}>
            <span style={{ color: 'var(--sat-or)' }}>
              {showAll
                ? `⚠ Mostrando TODOS los repuestos (filtro desactivado)`
                : `✓ Mostrando solo compatibles con ${modelFilter} (${parts.length})`}
            </span>
            <button
              type="button"
              onClick={() => setShowAll((v) => !v)}
              className="ml-auto px-2 py-1 rounded text-xs font-semibold"
              style={{
                background: showAll ? 'var(--sat-or)' : 'transparent',
                color: showAll ? 'var(--sat-dk)' : 'var(--sat-or)',
                border: '1px solid var(--sat-or)',
              }}
            >
              {showAll ? `← Volver a ${modelFilter}` : '→ Ver todos'}
            </button>
          </div>
        )}
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Buscar por descripcion, codigo o POS..."
          className="w-full rounded-lg bg-[#1E2330] border border-[#2A3040] px-3 py-2 text-sm text-[#F0F2F5] focus:outline-none focus:ring-2 focus:ring-orange-500/50"
        />

        <div style={{ maxHeight: 480, overflowY: 'auto' }}>
          <table className="sat-table" style={{ fontSize: 14 }}>
            <thead>
              <tr>
                <th style={{ width: 60 }}>POS</th>
                <th style={{ width: 120 }}>Codigo</th>
                <th style={{ width: 44 }}></th>
                <th>Descripcion</th>
                {isAdmin && <th style={{ textAlign: 'right', width: 80 }}>€ EUR</th>}
                <th style={{ textAlign: 'right', width: 90 }}>$ Venta</th>
                <th style={{ width: 90 }}></th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={isAdmin ? 7 : 6} style={{ padding: 24, textAlign: 'center', color: 'var(--sat-tx3)' }}>Cargando...</td></tr>
              ) : filtered.length === 0 ? (
                <tr><td colSpan={isAdmin ? 7 : 6} style={{ padding: 24, textAlign: 'center', color: 'var(--sat-tx3)' }}>Sin resultados</td></tr>
              ) : filtered.map((p) => (
                <tr key={p.id}>
                  <td style={{ fontFamily: 'var(--sat-mo)', color: 'var(--sat-or)' }}>{p.pos || '–'}</td>
                  <td style={{ fontFamily: 'var(--sat-mo)', fontSize: 13, color: 'var(--sat-tx2)' }}>{p.codigo || '–'}</td>
                  <td style={{ textAlign: 'center' }}>
                    {p.img_url ? (
                      <img src={p.img_url} alt="" style={{ width: 32, height: 32, objectFit: 'contain', borderRadius: 4, border: '1px solid var(--sat-br)' }} />
                    ) : null}
                  </td>
                  <td>{p.descripcion}</td>
                  {isAdmin && <td style={{ textAlign: 'right', color: 'var(--sat-tx2)' }}>€ {fmtNumber(p.precio_eur || 0)}</td>}
                  <td style={{ textAlign: 'right', fontWeight: 700, color: 'var(--sat-gn)' }}>$ {fmtNumber(p.precio_venta || 0)}</td>
                  <td>
                    <Button size="sm" onClick={() => { onPick(p); onClose() }}>+ Agregar</Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="flex justify-end">
          <Button variant="secondary" onClick={onClose}>Cerrar</Button>
        </div>
      </div>
    </Modal>
  )
}
