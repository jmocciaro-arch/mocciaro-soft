'use client'

/**
 * SkuGlossary — Tab "Glosario SKU" en la ficha del cliente.
 *
 * Muestra el mapeo SKU del cliente → producto del catálogo (tt_sku_aliases).
 * El usuario puede:
 *   - Ver los aliases ya aprendidos (vienen automáticos cuando importás OC)
 *   - Vincular un nuevo SKU manualmente
 *   - Borrar un alias que esté mal
 */

import { useCallback, useEffect, useState } from 'react'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Modal } from '@/components/ui/modal'
import { Badge } from '@/components/ui/badge'
import { useToast } from '@/components/ui/toast'
import { EmptyState } from '@/components/ui/empty-state'
import { Skeleton } from '@/components/ui/skeleton'
import { formatCurrency, formatDate } from '@/lib/utils'
import { BookText, Plus, Trash2, Search, Link2, Sparkles, CheckCircle } from 'lucide-react'

interface MatchedProduct {
  id: string
  sku: string
  name: string
  brand: string | null
  price_eur: number | null
}

interface GlossaryEntry {
  id: string
  external_sku: string
  product: MatchedProduct
  source: string | null
  notes: string | null
  created_at: string
}

interface Props {
  clientId: string
  companyId: string
}

export function SkuGlossary({ clientId, companyId }: Props) {
  const { addToast } = useToast()
  const [entries, setEntries] = useState<GlossaryEntry[]>([])
  const [loading, setLoading] = useState(true)
  const [showLink, setShowLink] = useState(false)
  const [filter, setFilter] = useState('')

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch(`/api/sku-aliases?client_id=${encodeURIComponent(clientId)}`)
      const j = await res.json()
      setEntries(j.data || [])
    } catch (err) {
      addToast({ type: 'error', title: 'Error cargando glosario', message: (err as Error).message })
    } finally {
      setLoading(false)
    }
  }, [clientId, addToast])

  useEffect(() => { void load() }, [load])

  const handleDelete = async (aliasId: string, externalSKU: string) => {
    if (!confirm(`¿Borrar el alias "${externalSKU}"?`)) return
    const res = await fetch(`/api/sku-aliases?alias_id=${encodeURIComponent(aliasId)}`, { method: 'DELETE' })
    if (res.ok) {
      addToast({ type: 'success', title: 'Alias borrado' })
      void load()
    } else {
      addToast({ type: 'error', title: 'No se pudo borrar' })
    }
  }

  const filtered = entries.filter((e) => {
    if (!filter.trim()) return true
    const q = filter.trim().toLowerCase()
    return (
      e.external_sku.toLowerCase().includes(q) ||
      e.product.sku.toLowerCase().includes(q) ||
      e.product.name.toLowerCase().includes(q)
    )
  })

  const sourceLabel = (s: string | null): { label: string; variant: 'default' | 'info' | 'success' | 'warning' } => {
    switch (s) {
      case 'oc_import': return { label: 'Importado OC', variant: 'info' }
      case 'manual': return { label: 'Manual', variant: 'success' }
      case 'merge': return { label: 'Fusión', variant: 'warning' }
      default: return { label: s || '-', variant: 'default' }
    }
  }

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h3 className="text-sm font-semibold text-[#F0F2F5] flex items-center gap-2">
            <BookText size={16} className="text-[#FF6600]" />
            Glosario de SKU del cliente
          </h3>
          <p className="text-xs text-[#9CA3AF] mt-1 max-w-2xl">
            Cuando este cliente usa sus propios códigos en las OC, el sistema aprende a vincularlos
            con nuestros productos. Cada match aprendido se aplica automáticamente en futuras OC.
          </p>
        </div>
        <Button variant="primary" size="sm" onClick={() => setShowLink(true)}>
          <Plus size={14} /> Vincular SKU
        </Button>
      </div>

      {/* Filtro */}
      {entries.length > 0 && (
        <div className="flex items-center gap-2">
          <Search size={14} className="text-[#6B7280]" />
          <input
            type="text"
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            placeholder="Filtrar por SKU del cliente, nuestro SKU o producto..."
            className="flex-1 bg-[#0F1218] border border-[#1E2330] rounded-md px-3 py-1.5 text-sm text-[#F0F2F5] placeholder:text-[#6B7280] outline-none focus:border-[#FF6600]/50"
          />
          <div className="text-xs text-[#6B7280]">{filtered.length} de {entries.length}</div>
        </div>
      )}

      {/* Lista */}
      {loading ? (
        <Card>
          <div className="space-y-2">
            {Array.from({ length: 5 }).map((_, i) => (
              <Skeleton key={i} className="h-10 w-full" />
            ))}
          </div>
        </Card>
      ) : entries.length === 0 ? (
        <EmptyState
          icon={<BookText size={48} />}
          title="Sin aliases todavía"
          description="Cuando importes una OC de este cliente desde el Cotizador, los códigos del cliente se vinculan automáticamente con tu catálogo. También podés vincular manualmente."
          action={<Button variant="primary" onClick={() => setShowLink(true)}><Plus size={14} /> Vincular el primer SKU</Button>}
        />
      ) : (
        <Card className="overflow-hidden p-0">
          <table className="w-full text-sm">
            <thead className="bg-[#0F1218] border-b border-[#1E2330] text-[#9CA3AF] text-xs uppercase">
              <tr>
                <th className="px-4 py-3 text-left">SKU Cliente</th>
                <th className="px-4 py-3 text-center w-12"></th>
                <th className="px-4 py-3 text-left">Nuestro SKU</th>
                <th className="px-4 py-3 text-left">Producto</th>
                <th className="px-4 py-3 text-right">Precio</th>
                <th className="px-4 py-3 text-left w-24">Origen</th>
                <th className="px-4 py-3 text-left w-28">Aprendido</th>
                <th className="px-4 py-3 text-right w-12"></th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((e) => {
                const src = sourceLabel(e.source)
                return (
                  <tr key={e.id} className="border-b border-[#1E2330] hover:bg-[#1C2230] transition-colors">
                    <td className="px-4 py-2.5 font-mono text-[#FF6600] font-semibold">{e.external_sku}</td>
                    <td className="px-4 py-2.5 text-center"><Link2 size={14} className="inline text-[#6B7280]" /></td>
                    <td className="px-4 py-2.5 font-mono text-[#F0F2F5]">{e.product.sku}</td>
                    <td className="px-4 py-2.5 text-[#F0F2F5]">
                      <div className="flex flex-col">
                        <span>{e.product.name}</span>
                        {e.product.brand && <span className="text-xs text-[#6B7280]">{e.product.brand}</span>}
                      </div>
                    </td>
                    <td className="px-4 py-2.5 text-right text-[#F0F2F5]">
                      {e.product.price_eur != null ? formatCurrency(e.product.price_eur) : '-'}
                    </td>
                    <td className="px-4 py-2.5">
                      <Badge variant={src.variant} size="sm">{src.label}</Badge>
                    </td>
                    <td className="px-4 py-2.5 text-xs text-[#9CA3AF]">{formatDate(e.created_at)}</td>
                    <td className="px-4 py-2.5 text-right">
                      <button
                        onClick={() => handleDelete(e.id, e.external_sku)}
                        className="p-1.5 rounded hover:bg-red-500/20 text-[#6B7280] hover:text-red-400 transition-colors"
                        title="Borrar alias"
                      >
                        <Trash2 size={14} />
                      </button>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </Card>
      )}

      {/* Modal vincular nuevo SKU */}
      {showLink && (
        <LinkSkuModal
          clientId={clientId}
          companyId={companyId}
          onClose={() => setShowLink(false)}
          onSaved={() => { setShowLink(false); void load() }}
        />
      )}
    </div>
  )
}

// ────────────────────────────────────────────────────────────────────
// Modal: vincular SKU del cliente → producto del catálogo
// ────────────────────────────────────────────────────────────────────

interface LinkProps {
  clientId: string
  companyId: string
  onClose: () => void
  onSaved: () => void
}

function LinkSkuModal({ clientId, companyId, onClose, onSaved }: LinkProps) {
  const { addToast } = useToast()
  const [externalSKU, setExternalSKU] = useState('')
  const [productSearch, setProductSearch] = useState('')
  const [results, setResults] = useState<MatchedProduct[]>([])
  const [selected, setSelected] = useState<MatchedProduct | null>(null)
  const [searching, setSearching] = useState(false)
  const [saving, setSaving] = useState(false)
  const [notes, setNotes] = useState('')

  // Búsqueda live en catálogo — solo si no hay producto seleccionado.
  // Cuando el user clickea un resultado, `selected` queda con el producto y
  // dejamos de buscar (evita re-buscar el texto del display y romper el state).
  useEffect(() => {
    if (selected) return                    // ya hay selección: no buscar más
    const q = productSearch.trim()
    if (q.length < 2) { setResults([]); return }
    setSearching(true)
    const t = setTimeout(async () => {
      try {
        const res = await fetch(`/api/products/search?q=${encodeURIComponent(q)}&limit=10`)
        if (res.ok) {
          const j = await res.json()
          const list = j.items || j.data || []
          setResults(list.map((p: Record<string, unknown>) => ({
            id: p.id as string,
            sku: p.sku as string,
            name: p.name as string,
            brand: (p.brand as string | null) ?? null,
            price_eur: (p.price_eur as number | null) ?? null,
          })))
        } else {
          const res2 = await fetch('/api/sku-aliases/match', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ items: [{ codigo: q, descripcion: q }] }),
          })
          if (res2.ok) {
            const j2 = await res2.json()
            const m = j2.matches?.[0]
            setResults(m?.product ? [m.product] : [])
          } else {
            setResults([])
          }
        }
      } catch {
        setResults([])
      } finally {
        setSearching(false)
      }
    }, 300)
    return () => clearTimeout(t)
  }, [productSearch, selected])

  // Si el usuario empieza a tipear de nuevo en el campo de búsqueda, limpiamos la selección.
  const handleSearchChange = (newValue: string) => {
    if (selected && newValue !== `${selected.sku} — ${selected.name}`) {
      setSelected(null)
    }
    setProductSearch(newValue)
  }

  const handleSave = async () => {
    if (!externalSKU.trim() || !selected) {
      addToast({ type: 'warning', title: 'Completá SKU del cliente y elegí un producto' })
      return
    }
    setSaving(true)
    const res = await fetch('/api/sku-aliases', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        company_id: companyId,
        client_id: clientId,
        external_sku: externalSKU.trim(),
        product_id: selected.id,
        source: 'manual',
        notes: notes || null,
      }),
    })
    if (res.ok) {
      addToast({ type: 'success', title: '✓ Alias guardado' })
      onSaved()
    } else {
      const j = await res.json().catch(() => ({}))
      addToast({ type: 'error', title: 'Error', message: j.error || 'No se pudo guardar' })
    }
    setSaving(false)
  }

  return (
    <Modal isOpen onClose={onClose} title="Vincular SKU del cliente con producto" size="lg">
      <div className="space-y-4">
        {/* SKU del cliente */}
        <Input
          label="SKU / Código del cliente *"
          value={externalSKU}
          onChange={(e) => setExternalSKU(e.target.value)}
          placeholder="Ej: ATR-001"
        />

        {/* Buscar producto en catálogo */}
        <div>
          <label className="block text-xs font-medium text-[#9CA3AF] mb-1">
            Buscar producto del catálogo *
          </label>
          <div className="relative">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-[#6B7280]" />
            <input
              type="text"
              value={productSearch}
              onChange={(e) => handleSearchChange(e.target.value)}
              placeholder="Escribí SKU o nombre del producto..."
              className="w-full pl-9 pr-3 py-2 bg-[#0F1218] border border-[#1E2330] rounded-md text-sm text-[#F0F2F5] placeholder:text-[#6B7280] outline-none focus:border-[#FF6600]/50"
            />
          </div>

          {/* Resultados */}
          {(searching || results.length > 0) && (
            <div className="mt-2 rounded-md border border-[#1E2330] bg-[#0B0E13] max-h-60 overflow-y-auto">
              {searching ? (
                <div className="px-3 py-2 text-xs text-[#6B7280]">Buscando…</div>
              ) : results.length === 0 ? (
                <div className="px-3 py-2 text-xs text-[#6B7280]">Sin resultados</div>
              ) : (
                results.map((p) => {
                  const isSelected = selected?.id === p.id
                  return (
                    <button
                      key={p.id}
                      onClick={() => { setSelected(p); setProductSearch(`${p.sku} — ${p.name}`); setResults([]) }}
                      className={`w-full text-left px-3 py-2 hover:bg-[#1E2330] transition-colors ${isSelected ? 'bg-[#FF6600]/10' : ''}`}
                    >
                      <div className="flex items-center gap-2">
                        <span className="font-mono text-xs text-[#FF6600] font-semibold">{p.sku}</span>
                        <span className="text-sm text-[#F0F2F5] truncate">{p.name}</span>
                        {p.brand && <span className="text-xs text-[#6B7280]">{p.brand}</span>}
                      </div>
                    </button>
                  )
                })
              )}
            </div>
          )}
        </div>

        {/* Selección activa */}
        {selected && (
          <div className="p-3 rounded-md bg-[#FF6600]/5 border border-[#FF6600]/30 flex items-center gap-2">
            <CheckCircle size={16} className="text-[#FF6600] shrink-0" />
            <div className="flex-1 text-sm">
              <span className="font-mono text-[#FF6600] font-semibold">{selected.sku}</span>
              <span className="text-[#F0F2F5] ml-2">{selected.name}</span>
            </div>
            <button onClick={() => setSelected(null)} className="text-xs text-[#6B7280] hover:text-[#F0F2F5]">Cambiar</button>
          </div>
        )}

        {/* Notas opcionales */}
        <Input
          label="Notas (opcional)"
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          placeholder="Ej: Equivalencia confirmada con compras"
        />

        {/* Acciones */}
        <div className="flex justify-end gap-2 pt-3 border-t border-[#1E2330]">
          <Button variant="secondary" onClick={onClose}>Cancelar</Button>
          <Button variant="primary" onClick={handleSave} loading={saving} disabled={!externalSKU.trim() || !selected}>
            <Sparkles size={14} /> Guardar alias
          </Button>
        </div>
      </div>
    </Modal>
  )
}
