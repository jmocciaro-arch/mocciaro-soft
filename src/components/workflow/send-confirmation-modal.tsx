'use client'

/**
 * SendConfirmationModal — FASE 0
 *
 * Reemplaza el auto-marca de "enviada" que hoy ocurre al click de
 * WhatsApp/Email/PDF. Después de que el usuario sale del flujo de
 * envío (abrió la ventana de WA, descargó el PDF, etc.), este modal
 * pregunta humanamente:
 *
 *   "¿Lo mandaste?  [Sí, ya lo mandé]  [No, todavía no]  [Cancelar]"
 *
 * Sólo "Sí" persiste el registro en tt_document_sends y dispara
 * onConfirmed(). Las otras dos opciones NO escriben nada.
 *
 * Esto es solución temporal hasta el webhook real de WhatsApp Cloud API
 * (definitiva, planificada como mejora post FASE 0).
 */

import { Modal } from '@/components/ui/modal'
import { Button } from '@/components/ui/button'
import { CheckCircle, XCircle, AlertTriangle } from 'lucide-react'

export interface SendConfirmationModalProps {
  isOpen: boolean
  onClose: () => void
  /**
   * Llamado SÓLO cuando el usuario confirma "Sí, ya lo mandé".
   * El caller es responsable de persistir tt_document_sends.
   */
  onConfirmed: () => void | Promise<void>
  /**
   * Llamado cuando el usuario dice "No, todavía no". Default: solo cierra.
   */
  onDeclined?: () => void
  /**
   * Detalle del envío para mostrarle al usuario qué está confirmando.
   */
  channel: 'whatsapp' | 'email' | 'pdf' | 'excel' | 'word' | 'text' | 'link' | 'html'
  documentLabel: string
  documentNumber: string
  recipientHint?: string
  /**
   * Si true, el botón Sí queda en loading durante onConfirmed().
   */
  confirming?: boolean
}

const CHANNEL_LABELS: Record<SendConfirmationModalProps['channel'], string> = {
  whatsapp: 'WhatsApp',
  email: 'Email',
  pdf: 'PDF',
  excel: 'Excel',
  word: 'Word',
  text: 'Texto plano',
  link: 'Link compartible',
  html: 'Email HTML',
}

export function SendConfirmationModal({
  isOpen,
  onClose,
  onConfirmed,
  onDeclined,
  channel,
  documentLabel,
  documentNumber,
  recipientHint,
  confirming = false,
}: SendConfirmationModalProps) {
  const channelName = CHANNEL_LABELS[channel] ?? channel

  async function handleYes() {
    await onConfirmed()
  }

  function handleNo() {
    onDeclined?.()
    onClose()
  }

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="¿Lo mandaste?" size="sm">
      <div className="space-y-4">
        <div className="flex items-start gap-3 p-3 bg-[#F59E0B]/10 border border-[#F59E0B]/30 rounded-lg">
          <AlertTriangle size={18} className="text-[#F59E0B] mt-0.5 shrink-0" />
          <div className="text-xs text-[#F0F2F5] leading-relaxed">
            Confirmá manualmente. El sistema no puede saber si efectivamente
            enviaste el {documentLabel} por {channelName}. Sólo registramos como
            enviado lo que vos confirmás acá.
          </div>
        </div>

        <div className="text-sm text-[#9CA3AF]">
          {documentLabel} <span className="text-[#F0F2F5] font-medium">{documentNumber}</span>
          {recipientHint && (
            <>
              {' '}→ <span className="text-[#F0F2F5]">{recipientHint}</span>
            </>
          )}
          <div className="text-xs text-[#6B7280] mt-1">Canal: {channelName}</div>
        </div>

        <div className="flex flex-col sm:flex-row gap-2 pt-2">
          <Button
            variant="primary"
            size="md"
            onClick={handleYes}
            loading={confirming}
            disabled={confirming}
            className="!bg-[#10B981] hover:!bg-[#059669] flex-1"
          >
            <CheckCircle size={16} /> Sí, ya lo mandé
          </Button>
          <Button
            variant="outline"
            size="md"
            onClick={handleNo}
            disabled={confirming}
            className="flex-1"
          >
            <XCircle size={16} /> No, todavía no
          </Button>
        </div>

        <button
          onClick={onClose}
          disabled={confirming}
          className="w-full text-xs text-[#6B7280] hover:text-[#9CA3AF] transition-colors disabled:opacity-50"
        >
          Cancelar
        </button>
      </div>
    </Modal>
  )
}
