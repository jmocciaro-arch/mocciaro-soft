'use client'

import { useMemo, useState } from 'react'
import { Modal } from '@/components/ui/modal'
import { Button } from '@/components/ui/button'
import { Select } from '@/components/ui/select'
import { useToast } from '@/components/ui/toast'
import { ALLOWED_DERIVATIONS, type DocType } from '@/lib/schemas/documents'
import { deriveDocument, type DocumentDetail } from '@/lib/documents/client'
import { docTypeLabel } from './status-badge'

interface Props {
  isOpen: boolean
  onClose: () => void
  detail: DocumentDetail
  onSuccess: () => void
}

export function DeriveModal({ isOpen, onClose, detail, onSuccess }: Props) {
  const { addToast } = useToast()
  const { document: doc, lines } = detail

  const targets = useMemo(() => ALLOWED_DERIVATIONS[doc.doc_type] ?? [], [doc.doc_type])

  const [targetType, setTargetType] = useState<DocType | ''>(targets[0]?.target ?? '')
  const [mode, setMode] = useState<'full' | 'selected'>('full')
  const [selectedLines, setSelectedLines] = useState<Record<string, boolean>>({})
  const [copyCounterparty, setCopyCounterparty] = useState(true)
  const [notes, setNotes] = useState('')
  const [submitting, setSubmitting] = useState(false)

  const toggleLine = (id: string) =>
    setSelectedLines((s) => ({ ...s, [id]: !s[id] }))

  const selectedIds = Object.entries(selectedLines).filter(([, v]) => v).map(([k]) => k)

  const handleSubmit = async () => {
    if (!targetType) { addToast({ type: 'warning', title: 'Elegí un tipo destino' }); return }
    if (mode === 'selected' && selectedIds.length === 0) {
      addToast({ type: 'warning', title: 'Seleccioná al menos una línea' })
      return
    }
    setSubmitting(true)
    try {
      const r = await deriveDocument(doc.id, {
        target_type: targetType,
        mode,
        line_ids: mode === 'selected' ? selectedIds : undefined,
        copy_counterparty: copyCounterparty,
        notes: notes.trim() || undefined,
      })
      addToast({
        type: 'success',
        title: 'Documento derivado',
        message: `${r.lines_copied} líneas copiadas · ${r.relation}`,
      })
      onSuccess()
      if (typeof window !== 'undefined') {
        window.location.href = `/documents/${r.document_id}`
      }
    } catch (e) {
      addToast({ type: 'error', title: 'Error al derivar', message: e instanceof Error ? e.message : '' })
    } finally {
      setSubmitting(false)
    }
  }

  if (targets.length === 0) {
    return (
      <Modal isOpen={isOpen} onClose={onClose} title="Derivar documento" size="sm">
        <div className="p-6 space-y-4">
          <p className="text-sm text-[#9CA3AF]">
            Este tipo de documento no admite derivaciones.
          </p>
          <div className="flex justify-end"><Button variant="ghost" onClick={onClose}>Cerrar</Button></div>
        </div>
      </Modal>
    )
  }

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Derivar documento" size="lg">
      <div className="p-6 space-y-4 overflow-auto">
        <Select
          label="Tipo de documento destino"
          value={targetType}
          onChange={(e) => setTargetType(e.target.value as DocType)}
          options={targets.map(({ target, relation }) => ({
            value: target,
            label: `${docTypeLabel(target)} (${relation})`,
          }))}
        />

        <div>
          <label className="block text-sm font-medium text-[#9CA3AF] mb-1.5">Modo</label>
          <div className="flex gap-3">
            <label className="flex items-center gap-2 text-sm text-[#F0F2F5] cursor-pointer">
              <input type="radio" checked={mode === 'full'} onChange={() => setMode('full')} />
              Copiar todas las líneas
            </label>
            <label className="flex items-center gap-2 text-sm text-[#F0F2F5] cursor-pointer">
              <input type="radio" checked={mode === 'selected'} onChange={() => setMode('selected')} />
              Seleccionar líneas
            </label>
          </div>
        </div>

        {mode === 'selected' && (
          <div className="rounded-lg border border-[#2A3040] bg-[#0F1218] max-h-56 overflow-auto">
            <table className="w-full text-sm">
              <thead className="text-[#6B7280] text-[11px] uppercase tracking-wide">
                <tr>
                  <th className="p-2 w-8"></th>
                  <th className="p-2 text-left">#</th>
                  <th className="p-2 text-left">Producto</th>
                  <th className="p-2 text-right">Cant.</th>
                  <th className="p-2 text-right">Pendiente</th>
                </tr>
              </thead>
              <tbody>
                {lines.map((l) => {
                  const pending = Math.max(0, Number(l.quantity) - Number(l.quantity_invoiced || 0) - Number(l.quantity_delivered || 0))
                  return (
                    <tr key={l.id} className="border-t border-[#1E2330] text-[#F0F2F5]">
                      <td className="p-2">
                        <input type="checkbox" checked={!!selectedLines[l.id]} onChange={() => toggleLine(l.id)} />
                      </td>
                      <td className="p-2">{l.line_number}</td>
                      <td className="p-2">{l.product_name}</td>
                      <td className="p-2 text-right">{l.quantity} {l.unit}</td>
                      <td className="p-2 text-right text-[#9CA3AF]">{pending}</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}

        <label className="flex items-center gap-2 text-sm text-[#F0F2F5] cursor-pointer">
          <input type="checkbox" checked={copyCounterparty} onChange={(e) => setCopyCounterparty(e.target.checked)} />
          Copiar contraparte del documento origen
        </label>

        <div>
          <label className="block text-sm font-medium text-[#9CA3AF] mb-1.5">Notas (opcional)</label>
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            rows={2}
            className="w-full rounded-lg bg-[#1E2330] border border-[#2A3040] px-3 py-2 text-sm text-[#F0F2F5] focus:outline-none focus:ring-2 focus:ring-orange-500/50"
          />
        </div>

        <div className="flex justify-end gap-2 pt-2">
          <Button variant="ghost" onClick={onClose} disabled={submitting}>Cancelar</Button>
          <Button variant="primary" onClick={handleSubmit} loading={submitting}>Derivar</Button>
        </div>
      </div>
    </Modal>
  )
}
