'use client'

import { useState } from 'react'
import { Modal } from '@/components/ui/modal'
import { Button } from '@/components/ui/button'
import type { ExtractedInvoiceData } from '@/lib/invoicing/invoice-types'

interface Props {
  open: boolean
  onClose: () => void
  data: ExtractedInvoiceData
  onConfirm: (edited: ExtractedInvoiceData) => void
}

/**
 * Modal para revisar y editar los datos extraídos por la IA antes de guardarlos.
 */
export function InvoiceConfirmModal({ open, onClose, data, onConfirm }: Props) {
  const [form, setForm] = useState<ExtractedInvoiceData>(data)

  function upd<K extends keyof ExtractedInvoiceData>(key: K, value: ExtractedInvoiceData[K]) {
    setForm((f) => ({ ...f, [key]: value }))
  }

  const confidence = typeof form.confidence === 'number' ? form.confidence : 0

  return (
    <Modal isOpen={open} onClose={onClose} title="Confirmar datos de la factura" size="lg">
      <div className="space-y-4">
        <div
          className="text-xs p-2 rounded-lg"
          style={{
            background: confidence >= 0.8 ? 'rgba(16,185,129,0.1)' : 'rgba(249,115,22,0.1)',
            border: `1px solid ${confidence >= 0.8 ? 'rgba(16,185,129,0.3)' : 'rgba(249,115,22,0.3)'}`,
          }}
        >
          {form.provider_used === 'gemini' ? '🟣 Gemini' : form.provider_used === 'claude' ? '🟠 Claude' : 'IA'}
          {' · '}
          Confianza: {(confidence * 100).toFixed(0)}%
          {confidence < 0.8 && ' — Revisá los campos antes de confirmar'}
        </div>

        <div className="grid grid-cols-2 gap-3 text-sm">
          <Field label="Tipo" value={form.tipo} onChange={(v) => upd('tipo', v)} />
          <Field label="Nº completo" value={form.numero_completo} onChange={(v) => upd('numero_completo', v)} />
          <Field label="Fecha" type="date" value={form.fecha} onChange={(v) => upd('fecha', v)} />
          <Field label="CAE" value={form.cae} onChange={(v) => upd('cae', v)} />
          <Field label="Vto. CAE" type="date" value={form.cae_vto} onChange={(v) => upd('cae_vto', v)} />
          <Field label="Moneda" value={form.moneda} onChange={(v) => upd('moneda', v)} />
        </div>

        <fieldset className="border rounded-lg p-3" style={{ borderColor: 'var(--sat-br, #2A3040)' }}>
          <legend className="text-xs font-semibold px-2">Emisor</legend>
          <div className="grid grid-cols-2 gap-3 text-sm">
            <Field label="Razón social" value={form.emisor_razon_social} onChange={(v) => upd('emisor_razon_social', v)} />
            <Field label="CUIT" value={form.emisor_cuit} onChange={(v) => upd('emisor_cuit', v)} />
          </div>
        </fieldset>

        <fieldset className="border rounded-lg p-3" style={{ borderColor: 'var(--sat-br, #2A3040)' }}>
          <legend className="text-xs font-semibold px-2">Cliente</legend>
          <div className="grid grid-cols-2 gap-3 text-sm">
            <Field label="Razón social" value={form.cliente_razon_social} onChange={(v) => upd('cliente_razon_social', v)} />
            <Field label="CUIT" value={form.cliente_cuit} onChange={(v) => upd('cliente_cuit', v)} />
            <Field label="Cond. IVA" value={form.cliente_condicion_iva} onChange={(v) => upd('cliente_condicion_iva', v)} />
          </div>
        </fieldset>

        <fieldset className="border rounded-lg p-3" style={{ borderColor: 'var(--sat-br, #2A3040)' }}>
          <legend className="text-xs font-semibold px-2">Totales</legend>
          <div className="grid grid-cols-4 gap-3 text-sm">
            <Field label="Subtotal" type="number" value={form.subtotal} onChange={(v) => upd('subtotal', Number(v) || undefined)} />
            <Field label="IVA 21%" type="number" value={form.iva_21} onChange={(v) => upd('iva_21', Number(v) || undefined)} />
            <Field label="IVA 10.5%" type="number" value={form.iva_105} onChange={(v) => upd('iva_105', Number(v) || undefined)} />
            <Field label="Total" type="number" value={form.total} onChange={(v) => upd('total', Number(v) || undefined)} />
          </div>
        </fieldset>

        {Array.isArray(form.items) && form.items.length > 0 && (
          <fieldset className="border rounded-lg p-3" style={{ borderColor: 'var(--sat-br, #2A3040)' }}>
            <legend className="text-xs font-semibold px-2">Items ({form.items.length})</legend>
            <div className="max-h-48 overflow-y-auto text-xs">
              {form.items.map((it, i) => (
                <div key={i} className="flex justify-between border-b py-1" style={{ borderColor: 'var(--sat-br, #2A3040)' }}>
                  <span className="truncate flex-1">{it.descripcion || '–'}</span>
                  <span className="opacity-60 mx-2">{it.cantidad} x {it.precio_unitario}</span>
                  <span className="font-semibold w-16 text-right">{it.subtotal}</span>
                </div>
              ))}
            </div>
          </fieldset>
        )}

        <div className="flex justify-end gap-2">
          <Button variant="secondary" onClick={onClose}>Cancelar</Button>
          <Button onClick={() => onConfirm(form)}>Confirmar y guardar factura</Button>
        </div>
      </div>
    </Modal>
  )
}

function Field({
  label, value, onChange, type = 'text',
}: { label: string; value?: string | number; onChange: (v: string) => void; type?: string }) {
  return (
    <label className="flex flex-col gap-1">
      <span className="text-xs opacity-70">{label}</span>
      <input
        type={type}
        value={value ?? ''}
        onChange={(e) => onChange(e.target.value)}
        className="rounded-md bg-[#1E2330] border border-[#2A3040] px-2 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-orange-500/50"
      />
    </label>
  )
}
