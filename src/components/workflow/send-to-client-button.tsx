'use client'

import { useState, useEffect, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import { Modal } from '@/components/ui/modal'
import { Badge } from '@/components/ui/badge'
import { useToast } from '@/components/ui/toast'
import { Send, Mail, MessageCircle, Eye, Clock, CheckCircle, Loader2, ChevronDown, ChevronUp } from 'lucide-react'
import { formatRelative } from '@/lib/utils'

// ===============================================================
// TYPES
// ===============================================================

export type DocumentType = 'coti' | 'pedido' | 'delivery_note' | 'factura' | 'pap' | string

interface SendHistory {
  id: string
  sent_at: string
  channel: string
  to_email: string
  subject: string
  status: string
}

interface SendToClientButtonProps {
  documentId: string
  documentType: DocumentType
  clientEmail?: string
  clientPhone?: string
  companyId: string
  size?: 'sm' | 'md'
  className?: string
}

const TYPE_LABELS: Record<string, string> = {
  coti: 'Cotización',
  pedido: 'Pedido',
  delivery_note: 'Albarán',
  factura: 'Factura',
  pap: 'Pedido a Proveedor',
}

function generateDefaultSubject(docType: DocumentType, docRef: string): string {
  const label = TYPE_LABELS[docType] || docType
  return `${label} ${docRef} — TorqueTools`
}

function generateDefaultMessage(docType: DocumentType, docRef: string, clientName?: string): string {
  const label = TYPE_LABELS[docType] || docType
  const greeting = clientName ? `Estimado/a ${clientName},` : 'Estimado/a,'
  const docUrl = `[URL del documento]`

  const messages: Record<string, string> = {
    coti: `${greeting}\n\nAdjunto encontrás nuestra ${label} ${docRef} con los productos y condiciones solicitadas.\n\nQuedamos a tu disposición para cualquier consulta.\n\nSaludos,\nEquipo TorqueTools`,
    pedido: `${greeting}\n\nConfirmamos la recepción de tu Pedido ${docRef}.\n\nEstaremos procesando tu orden y te notificaremos cuando esté listo para envío.\n\nSaludos,\nEquipo TorqueTools`,
    delivery_note: `${greeting}\n\nAdjunto el Albarán ${docRef} correspondiente a tu pedido.\n\nPor favor confirmá la recepción de la mercadería.\n\nSaludos,\nEquipo TorqueTools`,
    factura: `${greeting}\n\nAdjunto la Factura ${docRef} para tu registro y pago.\n\nSi tenés alguna consulta no dudes en contactarnos.\n\nSaludos,\nEquipo TorqueTools`,
  }

  return messages[docType] || `${greeting}\n\nAdjunto el documento ${docRef}.\n\nSaludos,\nEquipo TorqueTools`
}

// ===============================================================
// COMPONENT
// ===============================================================

export function SendToClientButton({
  documentId,
  documentType,
  clientEmail,
  clientPhone,
  companyId,
  size = 'sm',
  className,
}: SendToClientButtonProps) {
  const { addToast } = useToast()
  const supabase = createClient()

  const [open, setOpen] = useState(false)
  const [channel, setChannel] = useState<'email' | 'whatsapp' | 'both'>('email')
  const [to, setTo] = useState(clientEmail || '')
  const [phone, setPhone] = useState(clientPhone || '')
  const [subject, setSubject] = useState('')
  const [message, setMessage] = useState('')
  const [sending, setSending] = useState(false)
  const [history, setHistory] = useState<SendHistory[]>([])
  const [showHistory, setShowHistory] = useState(false)
  const [docRef, setDocRef] = useState('')
  const [clientName, setClientName] = useState('')
  const [loadingAI, setLoadingAI] = useState(false)

  const loadDocAndHistory = useCallback(async () => {
    // Obtener datos del documento
    const { data: doc } = await supabase
      .from('tt_documents')
      .select('display_ref, system_code, client:tt_clients(name, email)')
      .eq('id', documentId)
      .maybeSingle()

    if (doc) {
      const ref = (doc.display_ref || doc.system_code || '') as string
      setDocRef(ref)

      const clientData = doc.client as { name?: string; email?: string } | null
      if (clientData?.name) setClientName(clientData.name)
      if (!to && clientData?.email) setTo(clientData.email)

      setSubject(generateDefaultSubject(documentType, ref))
      setMessage(generateDefaultMessage(documentType, ref, clientData?.name))
    }

    // Historial de envíos
    const { data: logs } = await supabase
      .from('tt_email_log')
      .select('id, created_at, channel, to_email, subject, status')
      .eq('document_id', documentId)
      .order('created_at', { ascending: false })
      .limit(10)

    if (logs) {
      setHistory(logs.map((l: {
        id: string
        created_at: string
        channel: string
        to_email: string
        subject: string
        status: string
      }) => ({
        id: l.id,
        sent_at: l.created_at,
        channel: l.channel,
        to_email: l.to_email,
        subject: l.subject,
        status: l.status,
      })))
    }
  }, [documentId, documentType, supabase, to])

  useEffect(() => {
    if (open) {
      loadDocAndHistory()
    }
  }, [open, loadDocAndHistory])

  const generateAIMessage = async () => {
    setLoadingAI(true)
    try {
      const res = await fetch('/api/ai/execute', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'generate_send_message',
          documentId,
          documentType,
          clientName,
          channel,
          companyId,
        }),
      })
      if (res.ok) {
        const data = await res.json() as { subject?: string; message?: string }
        if (data.subject) setSubject(data.subject)
        if (data.message) setMessage(data.message)
      }
    } catch {
      // Ignorar errores de AI — mantener el mensaje por defecto
    } finally {
      setLoadingAI(false)
    }
  }

  const handleSend = async () => {
    if (channel === 'email' && !to) {
      addToast({ type: 'error', title: 'Email requerido', message: 'Ingresá el email del destinatario' })
      return
    }
    if (channel === 'whatsapp' && !phone) {
      addToast({ type: 'error', title: 'WhatsApp requerido', message: 'Ingresá el número de WhatsApp' })
      return
    }
    if (channel === 'both' && (!to || !phone)) {
      addToast({ type: 'error', title: 'Datos incompletos', message: 'Ingresá email y WhatsApp' })
      return
    }

    setSending(true)
    try {
      const res = await fetch(`/api/documents/${documentId}/send`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ channel, to, phone, subject, message, companyId }),
      })

      const data = await res.json() as { sent: boolean; channels?: string[]; error?: string }

      if (!res.ok || !data.sent) {
        throw new Error(data.error || 'Error al enviar')
      }

      const channelNames = data.channels?.join(' y ') || channel
      addToast({ type: 'success', title: `Enviado por ${channelNames}` })
      setOpen(false)
      loadDocAndHistory()
    } catch (err) {
      addToast({ type: 'error', title: 'Error al enviar', message: (err as Error).message })
    } finally {
      setSending(false)
    }
  }

  const lastSend = history[0]

  return (
    <>
      <Button
        variant="outline"
        size={size}
        onClick={() => setOpen(true)}
        className={className}
        title="Enviar al cliente"
      >
        <Send size={14} />
        {lastSend ? (
          <span className="text-[10px] text-[#9CA3AF]">
            Enviado {formatRelative(lastSend.sent_at)}
          </span>
        ) : (
          'Enviar'
        )}
      </Button>

      <Modal
        isOpen={open}
        onClose={() => setOpen(false)}
        title="Enviar al cliente"
        size="xl"
      >
        <div className="flex flex-col gap-4 p-1">
          {/* PDF Preview */}
          <div className="bg-[#0B0E13] border border-[#2A3040] rounded-lg overflow-hidden">
            <div className="flex items-center justify-between px-3 py-2 border-b border-[#1E2330]">
              <span className="text-xs text-[#6B7280]">Vista previa del documento</span>
              <a
                href={`/api/documents/${documentId}/render`}
                target="_blank"
                rel="noreferrer"
                className="text-xs text-[#FF6600] hover:underline flex items-center gap-1"
              >
                <Eye size={12} /> Abrir en nueva pestaña
              </a>
            </div>
            <iframe
              src={`/api/documents/${documentId}/render`}
              className="w-full h-48 border-0"
              title="Vista previa"
            />
          </div>

          {/* Channel selector */}
          <div>
            <label className="block text-xs text-[#6B7280] mb-2">Canal de envío</label>
            <div className="flex gap-2">
              {(['email', 'whatsapp', 'both'] as const).map((ch) => (
                <button
                  key={ch}
                  onClick={() => setChannel(ch)}
                  className={`flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-medium border transition-colors ${
                    channel === ch
                      ? 'bg-[#FF6600]/15 border-[#FF6600]/40 text-[#FF6600]'
                      : 'bg-[#1C2230] border-[#2A3040] text-[#9CA3AF] hover:border-[#FF6600]/30'
                  }`}
                >
                  {ch === 'email' && <Mail size={13} />}
                  {ch === 'whatsapp' && <MessageCircle size={13} />}
                  {ch === 'both' && <><Mail size={13} /><MessageCircle size={13} /></>}
                  {ch === 'email' ? 'Email' : ch === 'whatsapp' ? 'WhatsApp' : 'Ambos'}
                </button>
              ))}
            </div>
          </div>

          {/* Destinatario */}
          {(channel === 'email' || channel === 'both') && (
            <div>
              <label className="block text-xs text-[#6B7280] mb-1">Email</label>
              <input
                type="email"
                value={to}
                onChange={(e) => setTo(e.target.value)}
                placeholder="cliente@empresa.com"
                className="w-full bg-[#1C2230] border border-[#2A3040] rounded-lg px-3 py-2 text-sm text-[#F0F2F5] placeholder-[#4B5563] focus:outline-none focus:border-[#FF6600]/50"
              />
            </div>
          )}

          {(channel === 'whatsapp' || channel === 'both') && (
            <div>
              <label className="block text-xs text-[#6B7280] mb-1">WhatsApp</label>
              <input
                type="tel"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                placeholder="+54 11 1234-5678"
                className="w-full bg-[#1C2230] border border-[#2A3040] rounded-lg px-3 py-2 text-sm text-[#F0F2F5] placeholder-[#4B5563] focus:outline-none focus:border-[#FF6600]/50"
              />
            </div>
          )}

          {/* Asunto (solo email) */}
          {(channel === 'email' || channel === 'both') && (
            <div>
              <label className="block text-xs text-[#6B7280] mb-1">Asunto</label>
              <input
                type="text"
                value={subject}
                onChange={(e) => setSubject(e.target.value)}
                className="w-full bg-[#1C2230] border border-[#2A3040] rounded-lg px-3 py-2 text-sm text-[#F0F2F5] focus:outline-none focus:border-[#FF6600]/50"
              />
            </div>
          )}

          {/* Mensaje */}
          <div>
            <div className="flex items-center justify-between mb-1">
              <label className="text-xs text-[#6B7280]">Mensaje</label>
              <button
                onClick={generateAIMessage}
                disabled={loadingAI}
                className="text-xs text-[#FF6600] hover:underline flex items-center gap-1 disabled:opacity-50"
              >
                {loadingAI ? <Loader2 size={11} className="animate-spin" /> : '✨'}
                Generar con IA
              </button>
            </div>
            <textarea
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              rows={5}
              className="w-full bg-[#1C2230] border border-[#2A3040] rounded-lg px-3 py-2 text-sm text-[#F0F2F5] focus:outline-none focus:border-[#FF6600]/50 resize-none"
            />
          </div>

          {/* Historial */}
          {history.length > 0 && (
            <div className="border border-[#2A3040] rounded-lg overflow-hidden">
              <button
                onClick={() => setShowHistory(!showHistory)}
                className="w-full flex items-center justify-between px-3 py-2 text-xs text-[#9CA3AF] hover:bg-[#1C2230] transition-colors"
              >
                <span className="flex items-center gap-1.5">
                  <Clock size={12} />
                  Historial de envíos ({history.length})
                </span>
                {showHistory ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
              </button>
              {showHistory && (
                <div className="border-t border-[#1E2330] divide-y divide-[#1E2330] max-h-40 overflow-y-auto">
                  {history.map((h) => (
                    <div key={h.id} className="flex items-center justify-between px-3 py-2 text-xs">
                      <div className="flex items-center gap-2 min-w-0">
                        {h.channel === 'email' ? (
                          <Mail size={11} className="text-[#6B7280] shrink-0" />
                        ) : (
                          <MessageCircle size={11} className="text-[#6B7280] shrink-0" />
                        )}
                        <span className="text-[#9CA3AF] truncate">{h.to_email}</span>
                      </div>
                      <div className="flex items-center gap-2 shrink-0 ml-2">
                        <Badge variant={h.status === 'sent' ? 'success' : 'warning'}>
                          {h.status === 'sent' ? (
                            <><CheckCircle size={9} className="mr-0.5" />Enviado</>
                          ) : h.status}
                        </Badge>
                        <span className="text-[#4B5563]">{formatRelative(h.sent_at)}</span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Actions */}
          <div className="flex justify-end gap-2 pt-1">
            <Button variant="ghost" size="sm" onClick={() => setOpen(false)}>
              Cancelar
            </Button>
            <Button variant="primary" size="sm" onClick={handleSend} loading={sending}>
              <Send size={14} />
              Enviar
            </Button>
          </div>
        </div>
      </Modal>
    </>
  )
}
