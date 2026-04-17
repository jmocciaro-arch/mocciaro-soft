'use client'

import { useState } from 'react'
import { MessageCircle, Check, AlertCircle, Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

interface WhatsAppSendButtonProps {
  companyId: string
  documentId: string
  clientPhone: string
  documentType: 'quote' | 'invoice' | 'order' | 'delivery_note'
  documentUrl?: string
  /** Texto extra para el mensaje (opcional) */
  caption?: string
  className?: string
}

type SendStatus = 'idle' | 'sending' | 'sent' | 'error'

export function WhatsAppSendButton({
  companyId,
  clientPhone,
  documentUrl,
  caption,
  className,
}: WhatsAppSendButtonProps) {
  const [status, setStatus] = useState<SendStatus>('idle')
  const [errorMsg, setErrorMsg] = useState<string | null>(null)

  async function handleSend() {
    if (!clientPhone) {
      setStatus('error')
      setErrorMsg('El cliente no tiene teléfono registrado')
      return
    }

    setStatus('sending')
    setErrorMsg(null)

    try {
      const res = await fetch('/api/whatsapp/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          companyId,
          to: clientPhone,
          documentUrl,
          message: caption ?? 'Te enviamos el documento adjunto. Cualquier consulta, estamos a tu disposición.',
        }),
      })

      const data = await res.json() as { success?: boolean; error?: string }

      if (data.success) {
        setStatus('sent')
        // Resetear después de 3 segundos
        setTimeout(() => setStatus('idle'), 3000)
      } else {
        setStatus('error')
        setErrorMsg(data.error ?? 'Error al enviar')
        setTimeout(() => { setStatus('idle'); setErrorMsg(null) }, 4000)
      }
    } catch {
      setStatus('error')
      setErrorMsg('Error de conexión')
      setTimeout(() => { setStatus('idle'); setErrorMsg(null) }, 4000)
    }
  }

  const buttonContent = {
    idle: (
      <>
        <MessageCircle size={14} />
        <span>WhatsApp</span>
      </>
    ),
    sending: (
      <>
        <Loader2 size={14} className="animate-spin" />
        <span>Enviando...</span>
      </>
    ),
    sent: (
      <>
        <Check size={14} />
        <span>Enviado</span>
      </>
    ),
    error: (
      <>
        <AlertCircle size={14} />
        <span>Error</span>
      </>
    ),
  }

  return (
    <div className="relative inline-flex flex-col items-start gap-1">
      <Button
        variant={status === 'sent' ? 'ghost' : 'secondary'}
        size="sm"
        onClick={handleSend}
        disabled={status === 'sending'}
        className={cn(
          'transition-all',
          status === 'sent' && 'text-green-400 hover:text-green-300',
          status === 'error' && 'text-red-400 hover:text-red-300',
          status === 'idle' && 'text-[#25D366] hover:text-[#128C7E]',
          className
        )}
        title={clientPhone ? `Enviar por WhatsApp a ${clientPhone}` : 'Sin teléfono registrado'}
      >
        {buttonContent[status]}
      </Button>
      {errorMsg && (
        <p className="text-[10px] text-red-400 max-w-[160px] leading-tight">{errorMsg}</p>
      )}
    </div>
  )
}
