'use client'

import { useState } from 'react'
import { Modal } from '@/components/ui/modal'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { useToast } from '@/components/ui/toast'
import { issueDocument } from '@/lib/documents/client'

interface Props {
  isOpen: boolean
  onClose: () => void
  documentId: string
  defaultDate: string
  onSuccess: () => void
}

export function IssueModal({ isOpen, onClose, documentId, defaultDate, onSuccess }: Props) {
  const { addToast } = useToast()
  const [docDate, setDocDate] = useState(defaultDate)
  const [submitting, setSubmitting] = useState(false)

  const handleSubmit = async () => {
    setSubmitting(true)
    try {
      const r = await issueDocument(documentId, { doc_date: docDate })
      addToast({
        type: 'success',
        title: 'Documento emitido',
        message: `${r.code} · Nº ${r.number}`,
      })
      onSuccess()
    } catch (e) {
      addToast({ type: 'error', title: 'Error al emitir', message: e instanceof Error ? e.message : '' })
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Emitir documento" size="sm">
      <div className="p-6 space-y-4">
        <p className="text-sm text-[#9CA3AF]">
          Se asignará un número correlativo y el documento quedará bloqueado. Esta acción no se puede deshacer.
        </p>

        <Input
          type="date"
          label="Fecha del documento"
          value={docDate}
          onChange={(e) => setDocDate(e.target.value)}
        />

        <div className="flex justify-end gap-2 pt-2">
          <Button variant="ghost" onClick={onClose} disabled={submitting}>Cancelar</Button>
          <Button variant="primary" onClick={handleSubmit} loading={submitting}>Emitir</Button>
        </div>
      </div>
    </Modal>
  )
}
