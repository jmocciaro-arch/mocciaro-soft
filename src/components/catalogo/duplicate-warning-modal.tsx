'use client'

import { useMemo, useState } from 'react'
import { Modal } from '@/components/ui/modal'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { AlertTriangle, AlertOctagon, Info } from 'lucide-react'
import { formatCurrency } from '@/lib/utils'

export interface DuplicateCandidate {
  id: string
  sku: string
  name: string
  brand: string | null
  description: string | null
  ean: string | null
  barcode: string | null
  manufacturer_code: string | null
  supplier_code: string | null
  price_eur: number | null
  cost_eur: number | null
  image_url: string | null
  active: boolean
  lifecycle_status: string | null
  company_source: string | null
  score: number
  severity: 'fuerte' | 'medio' | 'debil'
  reasons: string[]
  total_doc_items: number
  total_stock: number
}

export interface DuplicateCheckResult {
  count: number
  max_score: number
  has_strong_match: boolean
  candidates: DuplicateCandidate[]
}

interface Props {
  open: boolean
  isEditing: boolean
  result: DuplicateCheckResult | null
  incomingSummary: { sku: string; name: string; brand?: string | null }
  onCancel: () => void
  onContinueAnyway: () => void
  onMergeInto: (targetId: string) => void
}

const SEVERITY_META: Record<DuplicateCandidate['severity'], {
  badge: 'success' | 'info' | 'warning' | 'orange' | 'danger'
  label: string
  Icon: typeof AlertTriangle
}> = {
  fuerte: { badge: 'danger',  label: 'Coincidencia fuerte', Icon: AlertOctagon },
  medio:  { badge: 'orange',  label: 'Posible duplicado',   Icon: AlertTriangle },
  debil:  { badge: 'warning', label: 'Similitud parcial',   Icon: Info },
}

export function DuplicateWarningModal({
  open,
  isEditing,
  result,
  incomingSummary,
  onCancel,
  onContinueAnyway,
  onMergeInto,
}: Props) {
  const [selectedTargetId, setSelectedTargetId] = useState<string | null>(null)

  const candidates = result?.candidates ?? []
  const hasStrongMatch = result?.has_strong_match ?? false

  const headerTitle = useMemo(() => {
    if (hasStrongMatch) return 'Producto potencialmente duplicado'
    return 'Encontramos productos similares'
  }, [hasStrongMatch])

  return (
    <Modal isOpen={open} onClose={onCancel} title={headerTitle} size="lg">
      <div className="space-y-4">
        <div className="rounded-md border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900 dark:border-amber-700/50 dark:bg-amber-900/20 dark:text-amber-100">
          <div className="font-medium mb-1">
            {hasStrongMatch
              ? 'El producto que estás intentando guardar coincide casi seguro con uno existente.'
              : 'Antes de guardar, revisá si alguno de estos ya es lo que buscabas.'}
          </div>
          <div className="text-xs opacity-80">
            Estás {isEditing ? 'editando' : 'creando'}:{' '}
            <span className="font-mono">{incomingSummary.sku || '(sin SKU)'}</span>
            {' — '}
            <span>{incomingSummary.name || '(sin nombre)'}</span>
            {incomingSummary.brand ? <> · marca <span className="font-medium">{incomingSummary.brand}</span></> : null}
          </div>
        </div>

        <div className="text-xs text-zinc-500 dark:text-zinc-400">
          {candidates.length} candidato{candidates.length === 1 ? '' : 's'} encontrado{candidates.length === 1 ? '' : 's'} ·
          score máximo {result?.max_score ?? 0}
        </div>

        <div className="space-y-2 max-h-[55vh] overflow-y-auto pr-1">
          {candidates.map((c) => {
            const meta = SEVERITY_META[c.severity]
            const Icon = meta.Icon
            const isSelected = selectedTargetId === c.id
            return (
              <button
                key={c.id}
                type="button"
                onClick={() => setSelectedTargetId(isSelected ? null : c.id)}
                className={[
                  'w-full text-left rounded-md border p-3 transition',
                  'hover:bg-zinc-50 dark:hover:bg-zinc-800/50',
                  isSelected
                    ? 'border-blue-500 ring-2 ring-blue-500/30 bg-blue-50/50 dark:bg-blue-900/20'
                    : 'border-zinc-200 dark:border-zinc-700',
                ].join(' ')}
              >
                <div className="flex items-start gap-3">
                  <Icon className={`w-4 h-4 mt-0.5 shrink-0 ${
                    c.severity === 'fuerte' ? 'text-red-600' :
                    c.severity === 'medio'  ? 'text-orange-600' :
                                              'text-amber-600'
                  }`} />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <Badge variant={meta.badge}>{meta.label}</Badge>
                      <span className="text-xs text-zinc-500 dark:text-zinc-400">score {c.score}</span>
                      {!c.active && <Badge variant="warning">Descatalogado</Badge>}
                    </div>
                    <div className="mt-1 font-medium text-sm break-words">
                      <span className="font-mono">{c.sku}</span>
                      {' — '}
                      {c.name}
                    </div>
                    <div className="mt-1 text-xs text-zinc-600 dark:text-zinc-400 flex flex-wrap gap-x-3 gap-y-0.5">
                      {c.brand && <span>Marca: <span className="font-medium">{c.brand}</span></span>}
                      {c.price_eur != null && c.price_eur > 0 && <span>Precio: {formatCurrency(c.price_eur, 'EUR')}</span>}
                      {c.ean && <span>EAN: <span className="font-mono">{c.ean}</span></span>}
                      {c.manufacturer_code && <span>Fab: <span className="font-mono">{c.manufacturer_code}</span></span>}
                      {c.total_doc_items > 0 && <span>{c.total_doc_items} doc{c.total_doc_items === 1 ? '' : 's'}</span>}
                      {c.total_stock !== 0 && <span>stock {c.total_stock}</span>}
                    </div>
                    <div className="mt-1.5 flex flex-wrap gap-1">
                      {c.reasons.map((r, i) => (
                        <Badge key={i} variant="info">{r}</Badge>
                      ))}
                    </div>
                  </div>
                </div>
              </button>
            )
          })}
        </div>

        <div className="flex flex-col sm:flex-row gap-2 justify-end pt-2 border-t border-zinc-200 dark:border-zinc-700">
          <Button variant="secondary" onClick={onCancel}>
            Cancelar
          </Button>
          <Button
            variant="primary"
            disabled={!selectedTargetId}
            onClick={() => selectedTargetId && onMergeInto(selectedTargetId)}
          >
            {isEditing ? 'Mergear con el seleccionado' : 'Abrir el seleccionado en su lugar'}
          </Button>
          <Button
            variant={hasStrongMatch ? 'secondary' : 'primary'}
            disabled={hasStrongMatch}
            onClick={onContinueAnyway}
            title={hasStrongMatch ? 'No se permite crear si hay coincidencia fuerte. Mergeá o cancelá.' : undefined}
          >
            {hasStrongMatch ? 'Bloqueado por coincidencia fuerte' : 'Guardar de todos modos'}
          </Button>
        </div>
      </div>
    </Modal>
  )
}
