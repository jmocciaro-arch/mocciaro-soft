'use client'

import { useState } from 'react'
import { Modal } from '@/components/ui/modal'
import { Button } from '@/components/ui/button'
import { useToast } from '@/components/ui/toast'
import { cancelDocument } from '@/lib/documents/client'

interface Props {
  isOpen: boolean
  onClose: () => void
  documentId: string
  onSuccess: () => void
}

export function CancelModal({ isOpen, onClose, documentId, onSuccess }: Props) {
  const { addToast } = useToast()
  const [reason, setReason] = useState('')
  const [submitting, setSubmitting] = useState(false)

  const handleSubmit = async () => {
    if (reason.trim().length < 3) {
      addToast({ type: 'warning', title: 'Motivo requerido', message: 'Mínimo 3 caracteres' })
      return
    }
    setSubmitting(true)
    try {
      await cancelDocument(documentId, reason.trim())
      addToast({ type: 'success', title: 'Documento cancelado' })
      onSuccess()
    } catch (e) {
      addToast({ type: 'error', title: 'Error al cancelar', message: e instanceof Error ? e.message : '' })
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Cancelar documento" size="sm">
      <div className="p-6 space-y-4">
        <p className="text-sm text-[#9CA3AF]">
          El documento pasará a estado <strong className="text-[#F0F2F5]">cancelled</strong> y quedará cerrado para futuras acciones.
        </p>

        <div>
          <label className="block text-sm font-medium text-[#9CA3AF] mb-1.5">Motivo</label>
          <textarea
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            rows={3}
            placeholder="Indicá el motivo de cancelación…"
            className="w-full rounded-lg bg-[#1E2330] border border-[#2A3040] px-3 py-2 text-sm text-[#F0F2F5] placeholder:text-[#4B5563] focus:outline-none focus:ring-2 focus:ring-orange-500/50"
          />
        </div>

        <div className="flex justify-end gap-2 pt-2">
          <Button variant="ghost" onClick={onClose} disabled={submitting}>Volver</Button>
          <Button variant="danger" onClick={handleSubmit} loading={submitting}>Cancelar documento</Button>
        </div>
      </div>
    </Modal>
  )
}
