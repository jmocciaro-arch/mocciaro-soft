'use client'

import { Modal } from '@/components/ui/modal'
import { Button } from '@/components/ui/button'

interface Props {
  open: boolean
  onClose: () => void
  url: string
  title?: string
}

/**
 * Vista previa embebida de un PDF de factura con iframe.
 */
export function InvoicePDFViewer({ open, onClose, url, title }: Props) {
  return (
    <Modal isOpen={open} onClose={onClose} title={title || 'Factura'} size="xl">
      <div className="space-y-3">
        <div style={{ height: '70vh', background: '#000', borderRadius: 8, overflow: 'hidden' }}>
          <iframe
            src={url}
            style={{ width: '100%', height: '100%', border: 'none' }}
            title={title || 'Factura PDF'}
          />
        </div>
        <div className="flex justify-end gap-2">
          <Button
            variant="secondary"
            onClick={() => window.open(url, '_blank', 'noopener,noreferrer')}
          >
            Abrir en pestaña nueva
          </Button>
          <Button onClick={onClose}>Cerrar</Button>
        </div>
      </div>
    </Modal>
  )
}
