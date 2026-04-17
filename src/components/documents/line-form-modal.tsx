'use client'

import { useEffect, useState } from 'react'
import { Modal } from '@/components/ui/modal'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { useToast } from '@/components/ui/toast'
import { addLine, updateLine, type DocumentLineRow, type LineInput } from '@/lib/documents/client'

interface Props {
  isOpen: boolean
  onClose: () => void
  documentId: string
  line?: DocumentLineRow | null                // si viene, edita; si no, crea
  onSuccess: () => void
}

function emptyInput(): LineInput {
  return {
    product_name: '',
    product_sku: '',
    description: '',
    quantity: 1,
    unit: 'u',
    unit_price: 0,
    discount_pct: 0,
    discount_amount: 0,
    tax_rate: 21,
  }
}

export function LineFormModal({ isOpen, onClose, documentId, line, onSuccess }: Props) {
  const { addToast } = useToast()
  const [form, setForm] = useState<LineInput>(emptyInput())
  const [submitting, setSubmitting] = useState(false)

  useEffect(() => {
    if (!isOpen) return
    if (line) {
      setForm({
        product_name: line.product_name,
        product_sku: line.product_sku ?? '',
        description: line.description ?? '',
        quantity: Number(line.quantity),
        unit: line.unit,
        unit_price: Number(line.unit_price),
        discount_pct: Number(line.discount_pct),
        discount_amount: Number(line.discount_amount),
        tax_rate: Number(line.tax_rate),
      })
    } else {
      setForm(emptyInput())
    }
  }, [isOpen, line])

  const update = <K extends keyof LineInput>(k: K, v: LineInput[K]) =>
    setForm((f) => ({ ...f, [k]: v }))

  const handleSubmit = async () => {
    if (!form.product_name.trim()) {
      addToast({ type: 'warning', title: 'Nombre de producto requerido' })
      return
    }
    if (!(form.quantity > 0)) {
      addToast({ type: 'warning', title: 'Cantidad debe ser positiva' })
      return
    }
    setSubmitting(true)
    try {
      const payload: LineInput = {
        ...form,
        product_sku: form.product_sku || undefined,
        description: form.description || undefined,
      }
      if (line) {
        await updateLine(documentId, line.id, payload)
        addToast({ type: 'success', title: 'Línea actualizada' })
      } else {
        await addLine(documentId, payload)
        addToast({ type: 'success', title: 'Línea agregada' })
      }
      onSuccess()
    } catch (e) {
      addToast({ type: 'error', title: 'Error', message: e instanceof Error ? e.message : '' })
    } finally {
      setSubmitting(false)
    }
  }

  // Preview en vivo del total (cálculo idéntico al server-side)
  const gross = Number((form.quantity * (form.unit_price ?? 0)).toFixed(2))
  const pctDisc = Number(((gross * (form.discount_pct ?? 0)) / 100).toFixed(2))
  const totalDisc = Number((((form.discount_amount ?? 0)) + pctDisc).toFixed(2))
  const subtotal = Math.max(0, Number((gross - totalDisc).toFixed(2)))
  const tax = Number(((subtotal * (form.tax_rate ?? 0)) / 100).toFixed(2))
  const total = Number((subtotal + tax).toFixed(2))

  return (
    <Modal isOpen={isOpen} onClose={onClose} title={line ? 'Editar línea' : 'Agregar línea'} size="lg">
      <div className="p-6 space-y-3 overflow-auto">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <div className="md:col-span-2">
            <Input
              label="Nombre / descripción corta"
              value={form.product_name}
              onChange={(e) => update('product_name', e.target.value)}
              autoFocus
            />
          </div>
          <Input
            label="SKU (opcional)"
            value={form.product_sku ?? ''}
            onChange={(e) => update('product_sku', e.target.value)}
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-[#9CA3AF] mb-1.5">Descripción larga (opcional)</label>
          <textarea
            value={form.description ?? ''}
            onChange={(e) => update('description', e.target.value)}
            rows={2}
            className="w-full rounded-lg bg-[#1E2330] border border-[#2A3040] px-3 py-2 text-sm text-[#F0F2F5] focus:outline-none focus:ring-2 focus:ring-orange-500/50"
          />
        </div>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <Input
            label="Cantidad"
            type="number"
            step="any"
            value={form.quantity}
            onChange={(e) => update('quantity', Number(e.target.value))}
          />
          <Input
            label="Unidad"
            value={form.unit ?? 'u'}
            onChange={(e) => update('unit', e.target.value)}
          />
          <Input
            label="Precio unitario"
            type="number"
            step="any"
            value={form.unit_price ?? 0}
            onChange={(e) => update('unit_price', Number(e.target.value))}
          />
          <Input
            label="IVA %"
            type="number"
            step="any"
            value={form.tax_rate ?? 0}
            onChange={(e) => update('tax_rate', Number(e.target.value))}
          />
        </div>

        <div className="grid grid-cols-2 gap-3">
          <Input
            label="Descuento %"
            type="number"
            step="any"
            value={form.discount_pct ?? 0}
            onChange={(e) => update('discount_pct', Number(e.target.value))}
          />
          <Input
            label="Descuento $ manual"
            type="number"
            step="any"
            value={form.discount_amount ?? 0}
            onChange={(e) => update('discount_amount', Number(e.target.value))}
          />
        </div>

        <div className="rounded-lg bg-[#0F1218] border border-[#1E2330] p-3 text-xs text-[#9CA3AF] grid grid-cols-4 gap-2">
          <div>Bruto<br /><span className="text-[#F0F2F5] text-sm font-semibold">{gross.toFixed(2)}</span></div>
          <div>Desc<br /><span className="text-[#F0F2F5] text-sm font-semibold">{totalDisc.toFixed(2)}</span></div>
          <div>Subtotal<br /><span className="text-[#F0F2F5] text-sm font-semibold">{subtotal.toFixed(2)}</span></div>
          <div>Total<br /><span className="text-orange-400 text-sm font-semibold">{total.toFixed(2)}</span></div>
        </div>

        <div className="flex justify-end gap-2 pt-2">
          <Button variant="ghost" onClick={onClose} disabled={submitting}>Cancelar</Button>
          <Button variant="primary" onClick={handleSubmit} loading={submitting}>
            {line ? 'Guardar' : 'Agregar'}
          </Button>
        </div>
      </div>
    </Modal>
  )
}
