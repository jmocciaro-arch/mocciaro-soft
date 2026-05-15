'use client'

import { useMemo, useState } from 'react'
import Image from 'next/image'
import { Card } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Modal } from '@/components/ui/modal'
import {
  Crown, AlertTriangle, Image as ImageIcon, Layers,
  Building2, ShoppingCart, Boxes, Sparkles, Hash,
} from 'lucide-react'
import { formatCurrency, formatDate } from '@/lib/utils'

export interface DuplicateProduct {
  id: string
  sku: string
  name: string
  brand: string | null
  price_list: number | null
  price_cost: number | null
  image_url: string | null
  description: string | null
  is_active: boolean
  created_at: string
  ean: string | null
  manufacturer_code: string | null
  is_auto_sku: boolean
  total_doc_items: number
  total_stock: number
  usage_by_company: Record<string, { name: string; docs: number; stock_qty: number }>
}

export interface DuplicateGroup {
  group_key: string
  reason: 'ean' | 'manufacturer_code' | 'sku_norm' | 'name_norm' | 'name_fuzzy' | 'auto_sku_name'
  group_size: number
  products: DuplicateProduct[]
}

interface Props {
  group: DuplicateGroup
  onMerge: (masterId: string, duplicateIds: string[], reason: string) => Promise<void>
  busy?: boolean
}

const REASON_LABEL: Record<DuplicateGroup['reason'], { label: string; variant: 'success' | 'info' | 'warning' | 'orange' | 'danger' }> = {
  ean:                { label: 'EAN idéntico',          variant: 'success' },
  manufacturer_code:  { label: 'Cód. fabricante igual', variant: 'success' },
  sku_norm:           { label: 'SKU normalizado igual', variant: 'info'    },
  name_norm:          { label: 'Nombre idéntico',       variant: 'info'    },
  name_fuzzy:         { label: 'Nombre similar',        variant: 'warning' },
  auto_sku_name:      { label: 'Auto-SKU + nombre',     variant: 'orange'  },
}

/**
 * Heurística para sugerir maestro: el producto con más uso (doc_items) + datos completos.
 */
function suggestMaster(products: DuplicateProduct[]): string {
  let bestId = products[0].id
  let bestScore = -Infinity
  for (const p of products) {
    let score = p.total_doc_items * 10 + p.total_stock
    if (p.image_url) score += 20
    if (p.price_list && p.price_list > 0) score += 15
    if (p.price_cost && p.price_cost > 0) score += 10
    if (p.description && p.description.length > 20) score += 5
    if (!p.is_auto_sku) score += 30
    if (score > bestScore) { bestScore = score; bestId = p.id }
  }
  return bestId
}

export function DuplicateGroupCard({ group, onMerge, busy }: Props) {
  const suggested = useMemo(() => suggestMaster(group.products), [group.products])
  const [masterId, setMasterId] = useState<string>(suggested)
  const [selectedDups, setSelectedDups] = useState<Set<string>>(
    new Set(group.products.filter((p) => p.id !== suggested).map((p) => p.id))
  )
  const [confirm, setConfirm] = useState(false)
  const [expanded, setExpanded] = useState(false)

  const reason = REASON_LABEL[group.reason] ?? REASON_LABEL.name_fuzzy
  const totalDocs = group.products.reduce((s, p) => s + p.total_doc_items, 0)
  const totalStock = group.products.reduce((s, p) => s + p.total_stock, 0)

  // Empresas distintas tocadas por todos los miembros
  const companies = useMemo(() => {
    const m = new Map<string, { name: string; docs: number; stock_qty: number }>()
    for (const p of group.products) {
      for (const [cid, data] of Object.entries(p.usage_by_company)) {
        const prev = m.get(cid)
        m.set(cid, {
          name: data.name,
          docs: (prev?.docs ?? 0) + (data.docs ?? 0),
          stock_qty: (prev?.stock_qty ?? 0) + (data.stock_qty ?? 0),
        })
      }
    }
    return Array.from(m.entries()).sort((a, b) => b[1].docs - a[1].docs)
  }, [group.products])

  function toggleDup(id: string) {
    setSelectedDups((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  function pickMaster(id: string) {
    setMasterId(id)
    // El nuevo maestro deja de ser duplicado; los otros pasan a ser duplicados por defecto
    setSelectedDups(new Set(group.products.filter((p) => p.id !== id).map((p) => p.id)))
  }

  async function handleMerge() {
    setConfirm(false)
    await onMerge(masterId, Array.from(selectedDups), group.reason)
  }

  return (
    <Card className="border-l-4 border-l-[#FF6600]/60">
      {/* Header */}
      <div className="flex items-start justify-between gap-3 mb-3">
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant={reason.variant}>{reason.label}</Badge>
          <Badge variant="default">
            <Layers className="w-3 h-3 mr-1" />
            {group.group_size} productos
          </Badge>
          {totalDocs > 0 && (
            <Badge variant="info">
              <ShoppingCart className="w-3 h-3 mr-1" />
              {totalDocs} usos en docs
            </Badge>
          )}
          {totalStock > 0 && (
            <Badge variant="default">
              <Boxes className="w-3 h-3 mr-1" />
              {totalStock} en stock
            </Badge>
          )}
          {companies.length > 0 && (
            <Badge variant="orange">
              <Building2 className="w-3 h-3 mr-1" />
              {companies.length === 1
                ? `Solo ${companies[0][1].name}`
                : `${companies.length} empresas`}
            </Badge>
          )}
        </div>
        <Button
          size="sm"
          variant="primary"
          onClick={() => setConfirm(true)}
          disabled={busy || selectedDups.size === 0}
        >
          <Sparkles className="w-3.5 h-3.5" />
          Hermanar ({selectedDups.size})
        </Button>
      </div>

      {/* Pista de empresas: si todas las copias están en la misma empresa, no es importación cruzada */}
      {companies.length > 0 && (
        <div className="mb-3 flex flex-wrap gap-2">
          {companies.map(([cid, c]) => (
            <span
              key={cid}
              className="inline-flex items-center gap-1.5 text-xs px-2 py-0.5 rounded bg-[#FFF7ED] text-[#9A3412] border border-[#FED7AA]"
              title={`Empresa: ${c.name}`}
            >
              <Building2 className="w-3 h-3" />
              {c.name}: {c.docs} docs · {c.stock_qty} stock
            </span>
          ))}
        </div>
      )}

      {/* Lista de productos del grupo */}
      <div className="space-y-2">
        {group.products.map((p) => {
          const isMaster = p.id === masterId
          const isSelected = selectedDups.has(p.id)
          return (
            <div
              key={p.id}
              className={`flex items-center gap-3 p-2.5 rounded border transition-colors ${
                isMaster
                  ? 'border-[#FF6600] bg-[#FFF7ED]'
                  : isSelected
                    ? 'border-red-200 bg-red-50/40'
                    : 'border-[#E5E5E5] bg-white'
              }`}
            >
              {/* Thumb */}
              <div className="w-12 h-12 rounded bg-[#F3F4F6] flex items-center justify-center overflow-hidden flex-shrink-0">
                {p.image_url ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={p.image_url} alt={p.name} className="w-full h-full object-cover" />
                ) : (
                  <ImageIcon className="w-5 h-5 text-[#9CA3AF]" />
                )}
              </div>

              {/* Info */}
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="font-mono text-xs text-[#6B7280]">{p.sku}</span>
                  {p.is_auto_sku && (
                    <Badge variant="warning" size="sm">auto-SKU</Badge>
                  )}
                  {p.ean && (
                    <span className="text-[10px] font-mono text-[#9CA3AF]">EAN {p.ean}</span>
                  )}
                  {p.manufacturer_code && (
                    <span className="text-[10px] font-mono text-[#9CA3AF]">
                      <Hash className="inline w-3 h-3" />{p.manufacturer_code}
                    </span>
                  )}
                </div>
                <div className="text-sm font-medium text-[#1F2937] truncate">{p.name}</div>
                <div className="flex items-center gap-3 text-xs text-[#6B7280] mt-0.5">
                  {p.brand && <span>{p.brand}</span>}
                  {p.price_list != null && <span>PV: {formatCurrency(p.price_list)}</span>}
                  {p.price_cost != null && <span>C: {formatCurrency(p.price_cost)}</span>}
                  <span>Docs: {p.total_doc_items}</span>
                  <span>Stock: {p.total_stock}</span>
                  <span title={p.created_at}>Creado: {formatDate(p.created_at)}</span>
                </div>
              </div>

              {/* Acciones */}
              <div className="flex flex-col items-end gap-1 flex-shrink-0">
                {isMaster ? (
                  <Badge variant="orange">
                    <Crown className="w-3 h-3 mr-1" />
                    Maestro
                  </Badge>
                ) : (
                  <>
                    <button
                      onClick={() => pickMaster(p.id)}
                      className="text-[11px] text-[#FF6600] hover:underline"
                    >
                      Hacer maestro
                    </button>
                    <label className="flex items-center gap-1.5 text-[11px] text-[#6B7280]">
                      <input
                        type="checkbox"
                        checked={isSelected}
                        onChange={() => toggleDup(p.id)}
                        className="rounded"
                      />
                      Mergear
                    </label>
                  </>
                )}
              </div>
            </div>
          )
        })}
      </div>

      {/* Expand: ver uso por empresa por producto */}
      <button
        onClick={() => setExpanded((v) => !v)}
        className="mt-3 text-xs text-[#6B7280] hover:text-[#1F2937]"
      >
        {expanded ? '▼ Ocultar detalle por empresa' : '▶ Ver detalle de uso por empresa'}
      </button>
      {expanded && (
        <div className="mt-2 text-xs space-y-1.5 bg-[#F9FAFB] rounded p-3">
          {group.products.map((p) => {
            const entries = Object.entries(p.usage_by_company)
            return (
              <div key={p.id} className="flex items-start gap-2">
                <span className="font-mono text-[#6B7280] flex-shrink-0">{p.sku}</span>
                <span className="text-[#9CA3AF]">→</span>
                {entries.length === 0 ? (
                  <span className="text-[#9CA3AF] italic">sin uso registrado</span>
                ) : (
                  <div className="flex flex-wrap gap-1.5">
                    {entries.map(([cid, c]) => (
                      <span key={cid} className="px-1.5 py-0.5 rounded bg-white border border-[#E5E5E5]">
                        <b>{c.name}</b>: {c.docs} doc · {c.stock_qty} stk
                      </span>
                    ))}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}

      {/* Modal de confirmación */}
      <Modal isOpen={confirm} onClose={() => setConfirm(false)} title="Confirmar merge">
        <div className="space-y-3 text-sm">
          <div className="flex items-start gap-2 p-3 bg-amber-50 border border-amber-200 rounded text-amber-900">
            <AlertTriangle className="w-4 h-4 flex-shrink-0 mt-0.5" />
            <div>
              Vas a hermanar <b>{selectedDups.size}</b> producto(s) en el maestro.
              Los duplicados quedarán <b>archivados</b> con el prefijo <code>[DEDUPED]</code> en el nombre
              y todas sus referencias (items de docs, stock, alias) pasarán al maestro.
              Es <b>reversible</b> desde el historial de merges.
            </div>
          </div>
          <div className="text-xs space-y-1">
            <div><b>Maestro:</b> {group.products.find((p) => p.id === masterId)?.sku} — {group.products.find((p) => p.id === masterId)?.name}</div>
            <div className="text-[#6B7280]"><b>Duplicados:</b></div>
            <ul className="pl-4 list-disc text-[#6B7280]">
              {group.products.filter((p) => selectedDups.has(p.id)).map((p) => (
                <li key={p.id}><code>{p.sku}</code> — {p.name}</li>
              ))}
            </ul>
          </div>
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={() => setConfirm(false)}>Cancelar</Button>
            <Button variant="primary" onClick={handleMerge} loading={busy}>
              Confirmar merge
            </Button>
          </div>
        </div>
      </Modal>
    </Card>
  )
}
