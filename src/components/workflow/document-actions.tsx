'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Modal } from '@/components/ui/modal'
import { Input } from '@/components/ui/input'
import { Select } from '@/components/ui/select'
import { useToast } from '@/components/ui/toast'
import { SendDocumentModal } from './send-document-modal'
import { GenerateDeliveryNoteModal } from './generate-delivery-note-modal'
import {
  quoteToOrder,
  orderToDeliveryNote,
  orderToInvoice,
  deliveryNoteToInvoice,
  registerPayment,
  updateDocumentStatus,
  type DeliveryItem,
} from '@/lib/document-workflow'
import { createClient } from '@/lib/supabase/client'
import { formatCurrency } from '@/lib/utils'
import {
  Mail, FileText, CheckCircle, XCircle, Package,
  Truck, CreditCard, DollarSign, Printer, Loader2,
  RotateCcw, Trash2,
} from 'lucide-react'

type Row = Record<string, unknown>

export type DocumentActionType = 'coti' | 'pedido' | 'delivery_note' | 'factura'

interface DocumentActionsProps {
  document: Row
  documentType: DocumentActionType
  source: 'local' | 'tt_documents'
  clientName?: string
  clientEmail?: string
  clientId?: string
  onAction: (action: string, result?: Row) => void
}

// ---------------------------------------------------------------
// Botones disponibles segun tipo + estado
// ---------------------------------------------------------------
function getAvailableActions(type: DocumentActionType, status: string): string[] {
  const s = (status || '').toLowerCase()

  switch (type) {
    case 'coti': {
      if (s === 'draft' || s === 'borrador') return ['send', 'pdf', 'accept', 'reject', 'generate_order']
      if (s === 'sent' || s === 'enviada') return ['accept', 'reject', 'reopen', 'generate_order']
      if (s === 'accepted' || s === 'aceptada') return ['generate_order', 'reopen']
      if (s === 'rejected' || s === 'rechazada') return ['reopen']
      if (s === 'closed') return ['pdf', 'reopen']
      return ['send', 'pdf', 'accept', 'generate_order', 'reopen']
    }
    case 'pedido': {
      if (s === 'open' || s === 'accepted' || s === 'confirmado') return ['send', 'generate_delivery', 'invoice_direct', 'reopen']
      if (s === 'partially_delivered') return ['send', 'generate_delivery', 'invoice_direct']
      if (s === 'fully_delivered') return ['invoice_direct']
      return ['send', 'reopen']
    }
    case 'delivery_note': {
      if (s === 'pending' || s === 'open') return ['generate_invoice', 'reopen']
      if (s === 'closed') return ['reopen']
      return ['generate_invoice']
    }
    case 'factura': {
      if (s === 'draft' || s === 'pending') return ['send', 'pdf', 'register_payment']
      if (s === 'partial') return ['send', 'register_payment']
      if (s === 'paid' || s === 'collected') return ['send', 'pdf']
      return ['send', 'pdf', 'register_payment']
    }
    default:
      return []
  }
}

// ---------------------------------------------------------------
// Componente principal
// ---------------------------------------------------------------
export function DocumentActions({
  document,
  documentType,
  source,
  clientName,
  clientEmail,
  clientId,
  onAction,
}: DocumentActionsProps) {
  const { addToast } = useToast()
  const [loading, setLoading] = useState<string | null>(null)
  const [showSendModal, setShowSendModal] = useState(false)
  const [showRejectModal, setShowRejectModal] = useState(false)
  const [showDeliveryModal, setShowDeliveryModal] = useState(false)
  const [showMultiOCDeliveryModal, setShowMultiOCDeliveryModal] = useState(false)
  const [showPaymentModal, setShowPaymentModal] = useState(false)

  // Reject modal state
  const [rejectReason, setRejectReason] = useState('')

  // Delivery modal state
  const [deliveryLines, setDeliveryLines] = useState<DeliveryItem[]>([])

  // Payment modal state
  const [paymentAmount, setPaymentAmount] = useState('')
  const [paymentMethod, setPaymentMethod] = useState('transferencia')
  const [paymentRef, setPaymentRef] = useState('')
  const [paymentDate, setPaymentDate] = useState(new Date().toISOString().split('T')[0])

  const docId = document.id as string
  const status = ((document.status as string) || '').toLowerCase()
  const available = getAvailableActions(documentType, status)
  const total = (document.total as number) || 0
  const currency = ((document.currency as string) || 'EUR') as 'EUR' | 'ARS' | 'USD'
  const docNumber = (document.doc_number as string) || (document.system_code as string) || (document.number as string) || (document.display_ref as string) || '-'

  // Es la accion principal? (boton naranja grande)
  const primaryAction = (() => {
    if (documentType === 'coti' && (status === 'accepted' || status === 'aceptada')) return 'generate_order'
    if (documentType === 'coti' && (status === 'draft' || status === 'borrador')) return 'send'
    if (documentType === 'pedido') return 'generate_delivery'
    if (documentType === 'delivery_note') return 'generate_invoice'
    if (documentType === 'factura') return 'register_payment'
    return null
  })()

  if (available.length === 0) return null

  // ---------------------------------------------------------------
  // Handlers
  // ---------------------------------------------------------------

  const handleSend = () => setShowSendModal(true)

  const handlePdf = () => {
    // Build professional filename: 2026-04-12-COT-2026-0001-TorqueTools_SL-Cliente_Nombre-EUR_7005,90-OC12345
    const date = new Date().toISOString().split('T')[0]
    const ref = docNumber.replace(/\s+/g, '-')
    const company = ((document.company_name as string) || (document.metadata as Row)?.company_name as string || 'Empresa').replace(/\s+/g, '_')
    const client = (clientName || 'Cliente').replace(/\s+/g, '_').substring(0, 60)
    const curr = ((document.currency as string) || 'EUR').toUpperCase()
    const amount = String(total.toFixed(2)).replace('.', ',')
    const ocRef = (document.metadata as Row)?.client_reference as string || ''
    let filename = `${date}-${ref}-${company}-${client}-${curr}_${amount}`
    if (ocRef) filename += `-${ocRef.replace(/\s+/g, '')}`

    const originalTitle = document.title || window.document.title
    window.document.title = filename
    window.print()
    // Restore after print dialog
    setTimeout(() => { window.document.title = originalTitle as string }, 1000)
  }

  const handleAccept = async () => {
    setLoading('accept')
    try {
      const table = source === 'local' ? 'tt_quotes' : 'tt_documents'
      await updateDocumentStatus(docId, 'accepted', table)
      addToast({ type: 'success', title: 'Cotizacion aceptada' })
      onAction('accepted')
    } catch (err) {
      addToast({ type: 'error', title: 'Error', message: (err as Error).message })
    } finally {
      setLoading(null)
    }
  }

  const handleReject = async () => {
    setLoading('reject')
    try {
      const table = source === 'local' ? 'tt_quotes' : 'tt_documents'
      await updateDocumentStatus(docId, 'rejected', table)
      addToast({ type: 'success', title: 'Cotizacion rechazada', message: rejectReason || undefined })
      setShowRejectModal(false)
      setRejectReason('')
      onAction('rejected')
    } catch (err) {
      addToast({ type: 'error', title: 'Error', message: (err as Error).message })
    } finally {
      setLoading(null)
    }
  }

  const handleGenerateOrder = async () => {
    setLoading('generate_order')
    try {
      const result = await quoteToOrder(docId, source)
      addToast({
        type: 'success',
        title: 'Pedido generado',
        message: result.orderNumber,
      })
      onAction('order_created', result as unknown as Row)
    } catch (err) {
      addToast({ type: 'error', title: 'Error generando pedido', message: (err as Error).message })
    } finally {
      setLoading(null)
    }
  }

  const openDeliveryModal = async () => {
    // If we have a clientId, use the multi-OC modal
    if (clientId) {
      setShowMultiOCDeliveryModal(true)
      return
    }

    // Fallback to simple modal
    const supabase = createClient()
    const { data } = await supabase
      .from('tt_so_items')
      .select('*')
      .eq('sales_order_id', docId)
      .order('sort_order')

    setDeliveryLines(
      (data || []).map((it: Row) => ({
        id: it.id as string,
        description: (it.description as string) || '',
        ordered: (it.qty_ordered as number) || (it.quantity as number) || 0,
        delivered: (it.qty_delivered as number) || 0,
        toDeliver: Math.max(0, ((it.qty_ordered as number) || (it.quantity as number) || 0) - ((it.qty_delivered as number) || 0)),
      }))
    )
    setShowDeliveryModal(true)
  }

  const handleGenerateDelivery = async () => {
    setLoading('generate_delivery')
    try {
      const result = await orderToDeliveryNote(docId, deliveryLines, source)
      addToast({
        type: 'success',
        title: 'Remito generado',
        message: result.deliveryNoteNumber,
      })
      setShowDeliveryModal(false)
      onAction('delivery_note_created', result as unknown as Row)
    } catch (err) {
      addToast({ type: 'error', title: 'Error generando remito', message: (err as Error).message })
    } finally {
      setLoading(null)
    }
  }

  const handleInvoiceDirect = async () => {
    setLoading('invoice_direct')
    try {
      const result = await orderToInvoice(docId, source)
      addToast({
        type: 'success',
        title: 'Factura generada',
        message: result.invoiceNumber,
      })
      onAction('invoice_created', result as unknown as Row)
    } catch (err) {
      addToast({ type: 'error', title: 'Error generando factura', message: (err as Error).message })
    } finally {
      setLoading(null)
    }
  }

  const handleGenerateInvoice = async () => {
    setLoading('generate_invoice')
    try {
      const result = await deliveryNoteToInvoice(docId, source)
      addToast({
        type: 'success',
        title: 'Factura generada',
        message: result.invoiceNumber,
      })
      onAction('invoice_created', result as unknown as Row)
    } catch (err) {
      addToast({ type: 'error', title: 'Error generando factura', message: (err as Error).message })
    } finally {
      setLoading(null)
    }
  }

  const handleRegisterPayment = async () => {
    setLoading('register_payment')
    try {
      const amt = parseFloat(paymentAmount)
      if (!amt || amt <= 0) throw new Error('Ingresa un monto valido')
      await registerPayment(docId, amt, paymentMethod, paymentRef, paymentDate)
      addToast({
        type: 'success',
        title: 'Cobro registrado',
        message: `${formatCurrency(amt, currency)} via ${paymentMethod}`,
      })
      setShowPaymentModal(false)
      setPaymentAmount('')
      setPaymentRef('')
      onAction('payment_registered')
    } catch (err) {
      addToast({ type: 'error', title: 'Error registrando cobro', message: (err as Error).message })
    } finally {
      setLoading(null)
    }
  }

  const handleSendDone = async () => {
    // Marcar como enviada
    if (documentType === 'coti' && (status === 'draft' || status === 'borrador')) {
      try {
        const table = source === 'local' ? 'tt_quotes' : 'tt_documents'
        await updateDocumentStatus(docId, 'sent', table)
        addToast({ type: 'success', title: 'Cotizacion marcada como enviada' })
        onAction('sent')
      } catch {
        // No bloquear si falla el update de status
      }
    }
    setShowSendModal(false)
  }

  // Reopen handler — vuelve a borrador/draft
  const handleReopen = async () => {
    setLoading('reopen')
    try {
      const table = source === 'local' ? (documentType === 'coti' ? 'tt_quotes' : 'tt_sales_orders') : 'tt_documents'
      await updateDocumentStatus(docId, 'draft', table)
      addToast({ type: 'success', title: 'Documento reabierto', message: 'Estado cambiado a borrador' })
      onAction('reopened')
    } catch (err) {
      addToast({ type: 'error', title: 'Error', message: (err as Error).message })
    } finally { setLoading(null) }
  }

  // Delete handler — con motivo obligatorio
  const [showDeleteModal, setShowDeleteModal] = useState(false)
  const [deleteReason, setDeleteReason] = useState('')

  const handleDelete = async () => {
    if (!deleteReason.trim()) { addToast({ type: 'warning', title: 'Ingresa el motivo de eliminacion' }); return }
    setLoading('delete')
    try {
      const supabase = createClient()
      // Log the deletion with reason before deleting
      await supabase.from('tt_activity_log').insert({
        entity_type: 'document', entity_id: docId,
        action: 'deleted',
        detail: `Documento ${docNumber} eliminado. Motivo: ${deleteReason}`,
      })
      // Mark as cancelled (soft delete) instead of hard delete
      const table = source === 'local' ? (documentType === 'coti' ? 'tt_quotes' : 'tt_sales_orders') : 'tt_documents'
      await supabase.from(table).update({ status: 'cancelled', notes: `ELIMINADO: ${deleteReason}` }).eq('id', docId)
      addToast({ type: 'success', title: 'Documento eliminado', message: deleteReason })
      setShowDeleteModal(false)
      onAction('deleted')
    } catch (err) {
      addToast({ type: 'error', title: 'Error', message: (err as Error).message })
    } finally { setLoading(null) }
  }

  // ---------------------------------------------------------------
  // Render buttons
  // ---------------------------------------------------------------
  const actionConfig: Record<string, { label: string; icon: React.ReactNode; handler: () => void }> = {
    send: { label: 'Enviar', icon: <Mail size={14} />, handler: handleSend },
    pdf: { label: 'Generar PDF', icon: <Printer size={14} />, handler: handlePdf },
    accept: { label: 'Marcar Aceptada', icon: <CheckCircle size={14} />, handler: handleAccept },
    reject: { label: 'Marcar Rechazada', icon: <XCircle size={14} />, handler: () => setShowRejectModal(true) },
    reopen: { label: 'Reabrir (Borrador)', icon: <RotateCcw size={14} />, handler: handleReopen },
    generate_order: { label: 'Generar Pedido', icon: <Package size={14} />, handler: handleGenerateOrder },
    generate_delivery: { label: 'Generar Remito', icon: <Truck size={14} />, handler: openDeliveryModal },
    invoice_direct: { label: 'Facturar directo', icon: <CreditCard size={14} />, handler: handleInvoiceDirect },
    generate_invoice: { label: 'Generar Factura', icon: <FileText size={14} />, handler: handleGenerateInvoice },
    register_payment: { label: 'Registrar Cobro', icon: <DollarSign size={14} />, handler: () => { setPaymentAmount(String(total)); setShowPaymentModal(true) } },
  }

  return (
    <>
      {/* Action buttons bar */}
      <div className="flex flex-wrap gap-2 p-4 bg-[#141820] rounded-xl border border-[#2A3040] print:hidden">
        <div className="flex items-center gap-2 mr-2">
          <div className="w-1.5 h-1.5 rounded-full bg-[#FF6600]" />
          <span className="text-xs font-semibold text-[#6B7280] uppercase tracking-wide">Acciones</span>
        </div>
        {available.map((actionKey) => {
          const config = actionConfig[actionKey]
          if (!config) return null
          const isPrimary = actionKey === primaryAction
          const isLoading = loading === actionKey
          return (
            <Button
              key={actionKey}
              variant={isPrimary ? 'primary' : 'outline'}
              size="sm"
              onClick={config.handler}
              loading={isLoading}
              disabled={loading !== null && !isLoading}
              className={isPrimary ? 'shadow-lg shadow-orange-500/20' : ''}
              data-doc-action={actionKey}
            >
              {!isLoading && config.icon}
              {config.label}
            </Button>
          )
        })}

        {/* Separator + Delete button */}
        <div className="ml-auto flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={() => setShowDeleteModal(true)} className="text-red-400 border-red-500/30 hover:bg-red-500/10">
            <Trash2 size={14} /> Eliminar
          </Button>
        </div>
      </div>

      {/* Delete confirmation modal */}
      <Modal isOpen={showDeleteModal} onClose={() => setShowDeleteModal(false)} title="Eliminar documento" size="md">
        <div className="space-y-4">
          <div className="p-3 rounded-lg bg-red-500/10 border border-red-500/20">
            <p className="text-sm text-red-400 font-medium">Estas por eliminar el documento {docNumber}</p>
            <p className="text-xs text-red-300/70 mt-1">El documento quedara marcado como CANCELADO con el motivo que indiques. Esta accion queda registrada en el historial.</p>
          </div>
          <div>
            <label className="block text-xs font-medium text-[#9CA3AF] mb-1.5">Motivo de eliminacion *</label>
            <textarea
              value={deleteReason}
              onChange={(e) => setDeleteReason(e.target.value)}
              placeholder="Ej: duplicado, error de carga, cliente cancelo..."
              rows={3}
              className="w-full rounded-lg bg-[#0F1218] border border-[#2A3040] px-3 py-2 text-sm text-[#F0F2F5] placeholder:text-[#4B5563] focus:outline-none focus:border-red-500/50"
            />
          </div>
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={() => setShowDeleteModal(false)}>Cancelar</Button>
            <Button variant="primary" onClick={handleDelete} loading={loading === 'delete'} className="bg-red-600 hover:bg-red-700">
              <Trash2 size={14} /> Confirmar eliminacion
            </Button>
          </div>
        </div>
      </Modal>

      {/* Send Modal */}
      <SendDocumentModal
        isOpen={showSendModal}
        onClose={() => setShowSendModal(false)}
        documentType={documentType}
        documentNumber={docNumber}
        clientName={clientName || 'Cliente'}
        clientEmail={clientEmail}
        total={total}
        currency={currency}
        onSent={handleSendDone}
      />

      {/* Reject Modal */}
      <Modal isOpen={showRejectModal} onClose={() => setShowRejectModal(false)} title="Rechazar cotizacion" size="sm">
        <div className="space-y-4">
          <p className="text-sm text-[#9CA3AF]">Indica el motivo del rechazo (opcional)</p>
          <Input
            label="Motivo"
            value={rejectReason}
            onChange={(e) => setRejectReason(e.target.value)}
            placeholder="Precio, plazo, competencia..."
          />
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="secondary" size="sm" onClick={() => setShowRejectModal(false)}>
              Cancelar
            </Button>
            <Button
              variant="danger"
              size="sm"
              onClick={handleReject}
              loading={loading === 'reject'}
            >
              <XCircle size={14} /> Rechazar
            </Button>
          </div>
        </div>
      </Modal>

      {/* Delivery Modal */}
      <Modal isOpen={showDeliveryModal} onClose={() => setShowDeliveryModal(false)} title="Generar Remito/Albaran" size="lg">
        <div className="space-y-4">
          <p className="text-sm text-[#6B7280]">Indica las cantidades a entregar para cada item</p>
          {deliveryLines.map((line, idx) => (
            <div key={line.id} className="flex items-center gap-3 p-3 rounded-lg bg-[#0F1218]">
              <div className="flex-1">
                <p className="text-sm text-[#F0F2F5]">{line.description || `Item ${idx + 1}`}</p>
                <p className="text-xs text-[#6B7280]">
                  Pedido: {line.ordered} | Entregado: {line.delivered} | Pendiente: {line.ordered - line.delivered}
                </p>
              </div>
              <Input
                type="number"
                value={line.toDeliver}
                onChange={(e) => {
                  const updated = [...deliveryLines]
                  updated[idx] = {
                    ...updated[idx],
                    toDeliver: Math.max(0, Math.min(Number(e.target.value), line.ordered - line.delivered)),
                  }
                  setDeliveryLines(updated)
                }}
                className="w-24"
              />
            </div>
          ))}
          {deliveryLines.length === 0 && (
            <div className="text-center py-6 text-[#6B7280] text-sm">
              <Loader2 className="animate-spin mx-auto mb-2" size={20} />
              Cargando items...
            </div>
          )}
          <div className="flex justify-end gap-2 pt-4 border-t border-[#1E2330]">
            <Button variant="secondary" onClick={() => setShowDeliveryModal(false)}>
              Cancelar
            </Button>
            <Button onClick={handleGenerateDelivery} loading={loading === 'generate_delivery'}>
              <Truck size={16} /> Confirmar Remito
            </Button>
          </div>
        </div>
      </Modal>

      {/* Multi-OC Delivery Modal */}
      {clientId && (
        <GenerateDeliveryNoteModal
          isOpen={showMultiOCDeliveryModal}
          onClose={() => setShowMultiOCDeliveryModal(false)}
          clientId={clientId}
          clientName={clientName || 'Cliente'}
          currentOrderId={docId}
          currentOrderSource={source}
          onCreated={(result) => {
            onAction('delivery_note_created', result as unknown as Row)
          }}
        />
      )}

      {/* Payment Modal */}
      <Modal isOpen={showPaymentModal} onClose={() => setShowPaymentModal(false)} title="Registrar Cobro" size="md">
        <div className="space-y-4">
          <div className="p-3 rounded-lg bg-[#0F1218] border border-[#1E2330]">
            <div className="flex items-center justify-between">
              <span className="text-sm text-[#6B7280]">Total factura</span>
              <span className="text-sm font-bold text-[#FF6600]">
                {formatCurrency(total, currency)}
              </span>
            </div>
          </div>

          <Input
            label="Monto cobrado"
            type="number"
            value={paymentAmount}
            onChange={(e) => setPaymentAmount(e.target.value)}
            placeholder="0.00"
          />

          <Input
            label="Fecha de pago"
            type="date"
            value={paymentDate}
            onChange={(e) => setPaymentDate(e.target.value)}
          />

          <Select
            label="Forma de pago"
            options={[
              { value: 'transferencia', label: 'Transferencia bancaria' },
              { value: 'tarjeta', label: 'Tarjeta de credito/debito' },
              { value: 'efectivo', label: 'Efectivo' },
              { value: 'cheque', label: 'Cheque' },
              { value: 'paypal', label: 'PayPal' },
            ]}
            value={paymentMethod}
            onChange={(e) => setPaymentMethod(e.target.value)}
          />

          <Input
            label="Referencia bancaria"
            value={paymentRef}
            onChange={(e) => setPaymentRef(e.target.value)}
            placeholder="Numero de transferencia, cheque, etc."
          />

          <div className="flex justify-end gap-2 pt-4 border-t border-[#1E2330]">
            <Button variant="secondary" onClick={() => setShowPaymentModal(false)}>
              Cancelar
            </Button>
            <Button
              onClick={handleRegisterPayment}
              loading={loading === 'register_payment'}
            >
              <DollarSign size={16} /> Registrar Cobro
            </Button>
          </div>
        </div>
      </Modal>
    </>
  )
}
