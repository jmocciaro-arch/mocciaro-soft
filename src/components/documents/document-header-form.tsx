'use client'

import { useEffect, useState } from 'react'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Select } from '@/components/ui/select'
import { useToast } from '@/components/ui/toast'
import { updateDocument, type DocumentRow } from '@/lib/documents/client'
import { COUNTERPARTY_TYPES } from '@/lib/schemas/documents'
import { Lock, Save } from 'lucide-react'

interface Props {
  doc: DocumentRow
  onSaved: () => void
}

// Subset de campos editables en la cabecera. El server acepta más, pero en el
// editor dejamos solo los que el usuario razonablemente ajusta en un draft.
interface HeaderFormState {
  doc_date: string
  counterparty_type: string
  counterparty_name: string
  counterparty_tax_id: string
  counterparty_email: string
  counterparty_address: string
  currency_code: string
  exchange_rate: string          // string para permitir input vacío
  valid_until: string
  due_date: string
  external_ref: string
  customer_po_number: string
  notes: string
  internal_notes: string
}

function toForm(doc: DocumentRow): HeaderFormState {
  return {
    doc_date: doc.doc_date ?? '',
    counterparty_type: doc.counterparty_type ?? '',
    counterparty_name: doc.counterparty_name ?? '',
    counterparty_tax_id: doc.counterparty_tax_id ?? '',
    counterparty_email: doc.counterparty_email ?? '',
    counterparty_address: doc.counterparty_address ?? '',
    currency_code: doc.currency_code ?? 'ARS',
    exchange_rate: String(doc.exchange_rate ?? 1),
    valid_until: doc.valid_until ?? '',
    due_date: doc.due_date ?? '',
    external_ref: doc.external_ref ?? '',
    customer_po_number: doc.customer_po_number ?? '',
    notes: doc.notes ?? '',
    internal_notes: doc.internal_notes ?? '',
  }
}

export function DocumentHeaderForm({ doc, onSaved }: Props) {
  const { addToast } = useToast()
  const [form, setForm] = useState<HeaderFormState>(() => toForm(doc))
  const [saving, setSaving] = useState(false)
  const [dirty, setDirty] = useState(false)

  // Reset cuando cambia el doc (después de save, cancel, etc.)
  useEffect(() => {
    setForm(toForm(doc))
    setDirty(false)
  }, [doc])

  const locked = doc.locked || doc.status !== 'draft'

  const update = <K extends keyof HeaderFormState>(k: K, v: HeaderFormState[K]) => {
    setForm((f) => ({ ...f, [k]: v }))
    setDirty(true)
  }

  const handleSave = async () => {
    if (locked) return
    setSaving(true)
    try {
      // Normalizamos strings vacíos → undefined para no pisar con ''.
      // exchange_rate siempre va; si vacío, 1 por default.
      const payload = {
        doc_date: form.doc_date || undefined,
        counterparty_type: (form.counterparty_type || undefined) as
          | 'customer' | 'supplier' | 'internal' | 'other' | undefined,
        counterparty_name: form.counterparty_name || undefined,
        counterparty_tax_id: form.counterparty_tax_id || undefined,
        counterparty_email: form.counterparty_email || undefined,
        counterparty_address: form.counterparty_address || undefined,
        currency_code: form.currency_code || undefined,
        exchange_rate: form.exchange_rate ? Number(form.exchange_rate) : undefined,
        valid_until: form.valid_until || undefined,
        due_date: form.due_date || undefined,
        external_ref: form.external_ref || undefined,
        customer_po_number: form.customer_po_number || undefined,
        notes: form.notes || undefined,
        internal_notes: form.internal_notes || undefined,
      }
      await updateDocument(doc.id, payload)
      addToast({ type: 'success', title: 'Cabecera actualizada' })
      setDirty(false)
      onSaved()
    } catch (e) {
      addToast({ type: 'error', title: 'Error guardando', message: e instanceof Error ? e.message : '' })
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="space-y-4">
      {locked && (
        <div className="flex items-center gap-2 rounded-lg border border-[#2A3040] bg-[#0F1218] px-3 py-2 text-xs text-[#9CA3AF]">
          <Lock className="h-3.5 w-3.5" />
          Cabecera bloqueada — el documento no está en estado <code className="text-[#F0F2F5]">draft</code>.
        </div>
      )}

      {/* Fechas + moneda */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Input
          type="date"
          label="Fecha"
          value={form.doc_date}
          onChange={(e) => update('doc_date', e.target.value)}
          disabled={locked}
        />
        <Input
          type="date"
          label="Válido hasta"
          value={form.valid_until}
          onChange={(e) => update('valid_until', e.target.value)}
          disabled={locked}
        />
        <Input
          type="date"
          label="Vencimiento"
          value={form.due_date}
          onChange={(e) => update('due_date', e.target.value)}
          disabled={locked}
        />
        <Input
          label="Moneda"
          value={form.currency_code}
          onChange={(e) => update('currency_code', e.target.value.toUpperCase())}
          maxLength={3}
          disabled={locked}
        />
      </div>

      {/* Contraparte */}
      <div className="rounded-lg border border-[#1E2330] bg-[#0F1218] p-3 space-y-3">
        <div className="text-[11px] font-semibold uppercase tracking-wider text-[#6B7280]">Contraparte</div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <Select
            label="Tipo"
            value={form.counterparty_type}
            onChange={(e) => update('counterparty_type', e.target.value)}
            disabled={locked}
            placeholder="Sin definir"
            options={COUNTERPARTY_TYPES.map((t) => ({ value: t, label: t }))}
          />
          <div className="md:col-span-2">
            <Input
              label="Nombre"
              value={form.counterparty_name}
              onChange={(e) => update('counterparty_name', e.target.value)}
              disabled={locked}
            />
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <Input
            label="CUIT / Tax ID"
            value={form.counterparty_tax_id}
            onChange={(e) => update('counterparty_tax_id', e.target.value)}
            disabled={locked}
          />
          <Input
            type="email"
            label="Email"
            value={form.counterparty_email}
            onChange={(e) => update('counterparty_email', e.target.value)}
            disabled={locked}
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-[#9CA3AF] mb-1.5">Dirección</label>
          <textarea
            value={form.counterparty_address}
            onChange={(e) => update('counterparty_address', e.target.value)}
            rows={2}
            disabled={locked}
            className="w-full rounded-lg bg-[#1E2330] border border-[#2A3040] px-3 py-2 text-sm text-[#F0F2F5] focus:outline-none focus:ring-2 focus:ring-orange-500/50 disabled:opacity-60 disabled:cursor-not-allowed"
          />
        </div>
      </div>

      {/* Referencias */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        <Input
          label="Ref. externa"
          value={form.external_ref}
          onChange={(e) => update('external_ref', e.target.value)}
          disabled={locked}
        />
        <Input
          label="Nº OC cliente"
          value={form.customer_po_number}
          onChange={(e) => update('customer_po_number', e.target.value)}
          disabled={locked}
        />
        <Input
          type="number"
          step="any"
          label="Cotización (exchange_rate)"
          value={form.exchange_rate}
          onChange={(e) => update('exchange_rate', e.target.value)}
          disabled={locked}
        />
      </div>

      {/* Notas */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <div>
          <label className="block text-sm font-medium text-[#9CA3AF] mb-1.5">Notas (visibles en PDF)</label>
          <textarea
            value={form.notes}
            onChange={(e) => update('notes', e.target.value)}
            rows={3}
            disabled={locked}
            className="w-full rounded-lg bg-[#1E2330] border border-[#2A3040] px-3 py-2 text-sm text-[#F0F2F5] focus:outline-none focus:ring-2 focus:ring-orange-500/50 disabled:opacity-60 disabled:cursor-not-allowed"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-[#9CA3AF] mb-1.5">Notas internas (no se imprimen)</label>
          <textarea
            value={form.internal_notes}
            onChange={(e) => update('internal_notes', e.target.value)}
            rows={3}
            disabled={locked}
            className="w-full rounded-lg bg-[#1E2330] border border-[#2A3040] px-3 py-2 text-sm text-[#F0F2F5] focus:outline-none focus:ring-2 focus:ring-orange-500/50 disabled:opacity-60 disabled:cursor-not-allowed"
          />
        </div>
      </div>

      {/* Save bar */}
      {!locked && (
        <div className="flex items-center justify-end gap-2 pt-1">
          <span className={dirty ? 'text-xs text-amber-400' : 'text-xs text-[#6B7280]'}>
            {dirty ? 'Cambios sin guardar' : 'Todo sincronizado'}
          </span>
          <Button variant="primary" size="sm" onClick={handleSave} loading={saving} disabled={!dirty}>
            <Save className="h-4 w-4" />
            Guardar cabecera
          </Button>
        </div>
      )}
    </div>
  )
}
