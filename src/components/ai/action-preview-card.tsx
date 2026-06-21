'use client'

import { useState } from 'react'
import { Check, X, Trash2, FileText, ExternalLink } from 'lucide-react'
import type { ProposedQuoteAction } from '@/lib/schemas/assistant-quote'

interface EditableItem {
  sku: string | null
  description: string
  quantity: number
  unit_price: number | null // null = lo resuelve el server (tarifa > lista > catálogo)
  discount_pct: number
}

interface Props {
  action: ProposedQuoteAction
  companyId: string | undefined
  onCreated?: (r: { document_id: string; system_code: string }) => void
}

type Status = 'idle' | 'creating' | 'created' | 'dismissed' | 'error'

const BORDER = '#2A3040'
const SURFACE = '#151821'
const ACCENT = '#f97316'

export function ActionPreviewCard({ action, companyId, onCreated }: Props) {
  const [items, setItems] = useState<EditableItem[]>(() =>
    action.items.map((i) => ({
      sku: i.sku ?? null,
      description: i.description,
      quantity: i.quantity,
      unit_price: i.unit_price ?? null,
      discount_pct: i.discount_pct ?? 0,
    })),
  )
  const [status, setStatus] = useState<Status>('idle')
  const [error, setError] = useState('')
  const [result, setResult] = useState<{ document_id: string; system_code: string } | null>(null)

  const pricedTotal = items.reduce(
    (s, i) => s + (i.unit_price != null ? i.quantity * i.unit_price * (1 - i.discount_pct / 100) : 0),
    0,
  )
  const hasPending = items.some((i) => i.unit_price == null)
  const clientLabel = action.client_name || action.client_hint
  const clientResolved = !!action.client_id

  function update(idx: number, patch: Partial<EditableItem>) {
    setItems((prev) => prev.map((it, i) => (i === idx ? { ...it, ...patch } : it)))
  }
  function removeRow(idx: number) {
    setItems((prev) => prev.filter((_, i) => i !== idx))
  }

  async function confirm() {
    if (!companyId) { setError('No hay empresa activa para emitir el borrador.'); setStatus('error'); return }
    if (items.length === 0) { setError('Agregá al menos un ítem.'); setStatus('error'); return }
    setStatus('creating'); setError('')
    try {
      const res = await fetch('/api/assistant/create-quote', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          company_id: companyId,
          client_id: action.client_id ?? null,
          currency: action.currency,
          items: items.map((i) => ({
            sku: i.sku ?? undefined,
            description: i.description,
            quantity: i.quantity,
            unit_price: i.unit_price, // null -> el server resuelve la tarifa
            discount_pct: i.discount_pct,
          })),
        }),
      })
      const j = await res.json()
      if (!res.ok) throw new Error(j.error || 'No se pudo crear el borrador')
      const r = { document_id: j.document_id as string, system_code: j.system_code as string }
      setResult(r)
      setStatus('created')
      onCreated?.(r)
    } catch (e) {
      setError((e as Error).message); setStatus('error')
    }
  }

  if (status === 'dismissed') {
    return <div className="mt-2 text-[11px] opacity-50">Borrador descartado.</div>
  }

  if (status === 'created' && result) {
    return (
      <div className="mt-2 rounded-xl p-3 text-sm" style={{ background: SURFACE, border: `1px solid ${ACCENT}` }}>
        <div className="flex items-center gap-2 font-semibold" style={{ color: ACCENT }}>
          <Check className="w-4 h-4" /> Borrador {result.system_code} creado
        </div>
        <a
          href={`/documentos/${result.document_id}`}
          className="mt-2 inline-flex items-center gap-1 text-xs underline"
          style={{ color: ACCENT }}
        >
          Abrir cotización <ExternalLink className="w-3 h-3" />
        </a>
      </div>
    )
  }

  const inputStyle: React.CSSProperties = {
    background: '#1E2330', border: `1px solid ${BORDER}`, borderRadius: 6,
    color: '#F0F2F5', fontSize: 12, padding: '4px 6px', outline: 'none',
  }

  return (
    <div className="mt-2 rounded-xl p-3 text-sm" style={{ background: SURFACE, border: `1px solid ${BORDER}` }}>
      <div className="flex items-center gap-2 mb-2 font-semibold" style={{ color: ACCENT }}>
        <FileText className="w-4 h-4" /> Cotización borrador
      </div>

      <div className="text-[11px] mb-2 opacity-80">
        Cliente:{' '}
        {clientLabel
          ? <span style={{ color: clientResolved ? '#F0F2F5' : '#FBBF24' }}>
              {clientLabel}{clientResolved ? '' : ' (no encontrado — se crea sin cliente)'}
            </span>
          : <span style={{ color: '#FBBF24' }}>sin especificar</span>}
        {' · '}{action.currency}
      </div>

      <div className="space-y-1.5">
        {items.map((it, idx) => (
          <div key={idx} className="flex items-center gap-1.5">
            <input
              value={it.description}
              onChange={(e) => update(idx, { description: e.target.value })}
              style={{ ...inputStyle, flex: 1 }}
              placeholder="Descripción"
            />
            <input
              type="number" min={1} value={it.quantity}
              onChange={(e) => update(idx, { quantity: Math.max(1, Number(e.target.value) || 1) })}
              style={{ ...inputStyle, width: 48, textAlign: 'right' }}
              title="Cantidad"
            />
            <input
              type="number" min={0} step="0.01"
              value={it.unit_price ?? ''}
              onChange={(e) => update(idx, { unit_price: e.target.value === '' ? null : Number(e.target.value) })}
              style={{ ...inputStyle, width: 72, textAlign: 'right' }}
              placeholder="auto"
              title="Precio unitario (vacío = tarifa del cliente)"
            />
            <button
              type="button" onClick={() => removeRow(idx)}
              className="p-1 rounded hover:bg-white/10" title="Quitar"
            >
              <Trash2 className="w-3.5 h-3.5 opacity-60" />
            </button>
          </div>
        ))}
      </div>

      <div className="flex items-center justify-between mt-2 text-xs">
        <span className="opacity-60">{hasPending ? 'Total parcial (faltan precios que resuelve el sistema)' : 'Total'}</span>
        <span className="font-bold">{action.currency} {pricedTotal.toFixed(2)}{hasPending ? '+' : ''}</span>
      </div>

      {status === 'error' && <div className="mt-2 text-[11px]" style={{ color: '#F87171' }}>✗ {error}</div>}

      <div className="flex gap-2 mt-3">
        <button
          type="button" onClick={confirm} disabled={status === 'creating'}
          className="flex-1 flex items-center justify-center gap-1 py-1.5 rounded-lg text-xs font-semibold"
          style={{ background: `linear-gradient(135deg, ${ACCENT}, #ef4444)`, color: 'white', opacity: status === 'creating' ? 0.6 : 1 }}
        >
          <Check className="w-3.5 h-3.5" /> {status === 'creating' ? 'Creando…' : 'Confirmar borrador'}
        </button>
        <button
          type="button" onClick={() => setStatus('dismissed')} disabled={status === 'creating'}
          className="flex items-center justify-center gap-1 px-3 py-1.5 rounded-lg text-xs"
          style={{ background: 'transparent', color: '#9CA3AF', border: `1px solid ${BORDER}` }}
        >
          <X className="w-3.5 h-3.5" /> Descartar
        </button>
      </div>
    </div>
  )
}
