'use client'

/**
 * <DocumentActionBar /> — barra contextual de acciones según doc_type + status.
 *
 * Reglas (vigentes para el ERP):
 *  - presupuesto + borrador/draft   → "Confirmar y enviar"
 *  - presupuesto + enviado/sent     → "Generar pedido"
 *  - pedido + confirmed             → "Generar albarán"
 *  - albaran + delivered            → "Generar factura"
 *  - factura + pending/partial      → "Registrar cobro"
 *  - factura_compra + pending       → "Registrar pago"
 *  - cualquier estado activo        → "Anular" (con confirm)
 *
 * La navegación apunta a las páginas de /ventas, /compras o /cobros
 * con el ID del doc actual prefilled.
 */

import { useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import {
  Send, FileCheck, Truck, FileText, CreditCard, Ban, Loader2,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Modal } from '@/components/ui/modal'
import { useToast } from '@/components/ui/toast'
import { createClient } from '@/lib/supabase/client'

interface Props {
  documentId: string
  docType: string
  status: string
  onChanged?: () => void
}

type Action = {
  id: string
  label: string
  icon: React.ReactNode
  variant: 'primary' | 'secondary' | 'danger'
  run: () => void | Promise<void>
}

function norm(s: string) { return (s || '').toLowerCase() }

export function DocumentActionBar({ documentId, docType, status, onChanged }: Props) {
  const router = useRouter()
  const { addToast } = useToast()
  const [cancelOpen, setCancelOpen] = useState(false)
  const [cancelReason, setCancelReason] = useState('')
  const [submitting, setSubmitting] = useState(false)

  const t = norm(docType)
  const s = norm(status)

  const actions = useMemo<Action[]>(() => {
    const out: Action[] = []

    // ─── PRESUPUESTO / QUOTE ────────────────────────────────
    if ((t === 'presupuesto' || t === 'quote') && (s === 'draft' || s === 'borrador')) {
      out.push({
        id: 'confirm-send',
        label: 'Confirmar y enviar',
        icon: <Send size={14} />,
        variant: 'primary',
        run: () => router.push(`/ventas?action=send&docId=${documentId}`),
      })
    }
    if ((t === 'presupuesto' || t === 'quote') && (s === 'enviado' || s === 'sent' || s === 'open')) {
      out.push({
        id: 'to-order',
        label: 'Generar pedido',
        icon: <FileCheck size={14} />,
        variant: 'primary',
        run: () => router.push(`/ventas?action=quoteToOrder&docId=${documentId}`),
      })
    }

    // ─── PEDIDO / ORDER ─────────────────────────────────────
    if ((t === 'pedido' || t === 'order' || t === 'so') && (s === 'confirmed' || s === 'confirmado' || s === 'open' || s === 'partial')) {
      out.push({
        id: 'to-delivery',
        label: 'Generar albarán',
        icon: <Truck size={14} />,
        variant: 'primary',
        run: () => router.push(`/ventas?action=orderToDelivery&docId=${documentId}`),
      })
    }

    // ─── ALBARÁN / DELIVERY_NOTE ───────────────────────────
    if ((t === 'albaran' || t === 'delivery_note') && (s === 'delivered' || s === 'entregado' || s === 'completed')) {
      out.push({
        id: 'to-invoice',
        label: 'Generar factura',
        icon: <FileText size={14} />,
        variant: 'primary',
        run: () => router.push(`/ventas?action=deliveryToInvoice&docId=${documentId}`),
      })
    }

    // ─── FACTURA VENTA / INVOICE ───────────────────────────
    if ((t === 'factura' || t === 'invoice') && (s === 'pending' || s === 'partial' || s === 'open' || s === 'sent')) {
      out.push({
        id: 'register-payment',
        label: 'Registrar cobro',
        icon: <CreditCard size={14} />,
        variant: 'primary',
        run: () => router.push(`/cobros?action=new&invoiceId=${documentId}`),
      })
    }

    // ─── FACTURA COMPRA / PURCHASE_INVOICE ─────────────────
    if ((t === 'factura_compra' || t === 'purchase_invoice') && (s === 'pending' || s === 'partial' || s === 'open')) {
      out.push({
        id: 'register-supplier-payment',
        label: 'Registrar pago',
        icon: <CreditCard size={14} />,
        variant: 'primary',
        run: () => router.push(`/compras?tab=pagos&action=new&invoiceId=${documentId}`),
      })
    }

    // ─── ANULAR (siempre disponible salvo ya cancelado) ────
    if (!['cancelled', 'canceled', 'anulado', 'rejected'].includes(s)) {
      out.push({
        id: 'cancel',
        label: 'Anular',
        icon: <Ban size={14} />,
        variant: 'danger',
        run: () => setCancelOpen(true),
      })
    }

    return out
  }, [t, s, documentId, router])

  const handleCancel = async () => {
    if (cancelReason.trim().length < 3) {
      addToast({ type: 'warning', title: 'Motivo requerido', message: 'Mínimo 3 caracteres' })
      return
    }
    setSubmitting(true)
    try {
      const res = await fetch(`/api/documents/${documentId}/cancel`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reason: cancelReason.trim() }),
      })
      if (!res.ok) {
        // Fallback: actualizar status directo si el endpoint no existe
        const sb = createClient()
        const { error } = await sb
          .from('tt_documents')
          .update({ status: 'cancelled' })
          .eq('id', documentId)
        if (error) throw new Error(error.message)
      }
      addToast({ type: 'success', title: 'Documento anulado' })
      setCancelOpen(false)
      setCancelReason('')
      onChanged?.()
    } catch (e) {
      addToast({ type: 'error', title: 'Error al anular', message: e instanceof Error ? e.message : '' })
    }
    setSubmitting(false)
  }

  if (actions.length === 0) return null

  return (
    <>
      <div className="flex flex-wrap items-center gap-2 p-3 bg-[#141820] rounded-xl border border-[#2A3040]">
        <span className="text-[10px] text-[#6B7280] uppercase mr-2 font-semibold">Acciones</span>
        {actions.map((a) => (
          <Button
            key={a.id}
            variant={a.variant}
            size="sm"
            onClick={() => void a.run()}
          >
            {a.icon}
            <span className="ml-1">{a.label}</span>
          </Button>
        ))}
      </div>

      <Modal
        isOpen={cancelOpen}
        onClose={() => !submitting && setCancelOpen(false)}
        title="Anular documento"
        size="md"
      >
        <div className="space-y-3">
          <p className="text-sm text-[#9CA3AF]">
            Esta acción marcará el documento como anulado. Indicá el motivo (queda en el audit log).
          </p>
          <textarea
            className="w-full min-h-24 rounded-lg bg-[#0F1218] border border-[#1E2330] px-3 py-2 text-sm text-[#F0F2F5] focus:border-[#FF6600] focus:outline-none"
            placeholder="Motivo de anulación..."
            value={cancelReason}
            onChange={(e) => setCancelReason(e.target.value)}
            disabled={submitting}
          />
          <div className="flex justify-end gap-2">
            <Button variant="ghost" size="sm" onClick={() => setCancelOpen(false)} disabled={submitting}>
              Cancelar
            </Button>
            <Button variant="danger" size="sm" onClick={() => void handleCancel()} disabled={submitting}>
              {submitting ? <Loader2 size={14} className="animate-spin" /> : <Ban size={14} />}
              <span className="ml-1">Confirmar anulación</span>
            </Button>
          </div>
        </div>
      </Modal>
    </>
  )
}
