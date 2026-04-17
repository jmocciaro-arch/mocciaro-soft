'use client'

import { useState } from 'react'
import { Download, Eye, GitBranch, Send, Ban, Trash2, Copy } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { useToast } from '@/components/ui/toast'
import { htmlUrl, pdfUrl, deleteDocument, type DocumentDetail } from '@/lib/documents/client'
import { ALLOWED_DERIVATIONS } from '@/lib/schemas/documents'
import { IssueModal } from './issue-modal'
import { CancelModal } from './cancel-modal'
import { DeriveModal } from './derive-modal'

interface Props {
  detail: DocumentDetail
  onChanged: () => void               // callback tras acciones exitosas
}

export function DocumentToolbar({ detail, onChanged }: Props) {
  const { addToast } = useToast()
  const [issueOpen, setIssueOpen] = useState(false)
  const [cancelOpen, setCancelOpen] = useState(false)
  const [deriveOpen, setDeriveOpen] = useState(false)

  const doc = detail.document
  const isDraft = doc.status === 'draft' && !doc.locked
  const canDerive = (ALLOWED_DERIVATIONS[doc.doc_type] ?? []).length > 0
    && !['draft', 'cancelled', 'voided'].includes(doc.status)
  const canCancel = !['cancelled', 'voided'].includes(doc.status)
  const canDelete = isDraft

  const copyLink = () => {
    if (typeof window === 'undefined') return
    navigator.clipboard.writeText(window.location.href)
      .then(() => addToast({ type: 'success', title: 'Enlace copiado' }))
      .catch(() => addToast({ type: 'error', title: 'No se pudo copiar' }))
  }

  const onDelete = async () => {
    if (!confirm('¿Eliminar borrador? Esta acción no se puede deshacer.')) return
    try {
      await deleteDocument(doc.id)
      addToast({ type: 'success', title: 'Borrador eliminado' })
      // Navegación controlada por el caller vía onChanged
      onChanged()
      if (typeof window !== 'undefined') window.location.href = '/documents'
    } catch (e) {
      addToast({ type: 'error', title: 'Error eliminando', message: e instanceof Error ? e.message : '' })
    }
  }

  return (
    <>
      <div className="flex flex-wrap items-center gap-2">
        {isDraft && (
          <Button variant="primary" size="sm" onClick={() => setIssueOpen(true)}>
            <Send className="h-4 w-4" />
            Emitir
          </Button>
        )}

        {canDerive && (
          <Button variant="secondary" size="sm" onClick={() => setDeriveOpen(true)}>
            <GitBranch className="h-4 w-4" />
            Derivar
          </Button>
        )}

        <a href={pdfUrl(doc.id)} target="_blank" rel="noopener noreferrer">
          <Button variant="secondary" size="sm">
            <Download className="h-4 w-4" />
            PDF
          </Button>
        </a>

        <a href={htmlUrl(doc.id)} target="_blank" rel="noopener noreferrer">
          <Button variant="ghost" size="sm">
            <Eye className="h-4 w-4" />
            Preview HTML
          </Button>
        </a>

        <Button variant="ghost" size="sm" onClick={copyLink}>
          <Copy className="h-4 w-4" />
          Copiar link
        </Button>

        <div className="ml-auto flex items-center gap-2">
          {canCancel && !isDraft && (
            <Button variant="outline" size="sm" onClick={() => setCancelOpen(true)}>
              <Ban className="h-4 w-4" />
              Cancelar
            </Button>
          )}
          {canDelete && (
            <Button variant="danger" size="sm" onClick={onDelete}>
              <Trash2 className="h-4 w-4" />
              Eliminar
            </Button>
          )}
        </div>
      </div>

      <IssueModal
        isOpen={issueOpen}
        onClose={() => setIssueOpen(false)}
        documentId={doc.id}
        defaultDate={doc.doc_date}
        onSuccess={() => { setIssueOpen(false); onChanged() }}
      />

      <CancelModal
        isOpen={cancelOpen}
        onClose={() => setCancelOpen(false)}
        documentId={doc.id}
        onSuccess={() => { setCancelOpen(false); onChanged() }}
      />

      <DeriveModal
        isOpen={deriveOpen}
        onClose={() => setDeriveOpen(false)}
        detail={detail}
        onSuccess={() => { setDeriveOpen(false); onChanged() }}
      />
    </>
  )
}
