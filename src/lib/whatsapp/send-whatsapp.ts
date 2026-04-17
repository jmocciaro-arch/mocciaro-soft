export interface WhatsAppTextMessage {
  type: 'text'
  to: string
  text: string
  phoneNumberId: string
  token: string
}

export interface WhatsAppDocumentMessage {
  type: 'document'
  to: string
  documentUrl: string
  caption?: string
  filename?: string
  phoneNumberId: string
  token: string
}

export type WhatsAppMessage = WhatsAppTextMessage | WhatsAppDocumentMessage

export interface WhatsAppResult {
  success: boolean
  messageId?: string
  error?: string
}

const BASE_URL = 'https://graph.facebook.com/v19.0'

/**
 * Envía un mensaje de texto o documento via Meta WhatsApp Cloud API.
 */
export async function sendWhatsApp(msg: WhatsAppMessage): Promise<WhatsAppResult> {
  const { phoneNumberId, token, to } = msg

  // Normalizar número: sacar +, espacios
  const normalizedTo = to.replace(/[\s+\-()]/g, '')

  let payload: Record<string, unknown>

  if (msg.type === 'text') {
    payload = {
      messaging_product: 'whatsapp',
      to: normalizedTo,
      type: 'text',
      text: { body: msg.text },
    }
  } else {
    payload = {
      messaging_product: 'whatsapp',
      to: normalizedTo,
      type: 'document',
      document: {
        link: msg.documentUrl,
        caption: msg.caption ?? '',
        filename: msg.filename ?? 'documento.pdf',
      },
    }
  }

  try {
    const res = await fetch(`${BASE_URL}/${phoneNumberId}/messages`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    })

    const data = await res.json() as { messages?: { id: string }[]; error?: { message: string } }

    if (!res.ok) {
      const errMsg = data.error?.message ?? `HTTP ${res.status}`
      console.error('[sendWhatsApp] Error:', errMsg)
      return { success: false, error: errMsg }
    }

    return { success: true, messageId: data.messages?.[0]?.id }
  } catch (err) {
    const errMsg = err instanceof Error ? err.message : 'Error desconocido'
    console.error('[sendWhatsApp] Exception:', errMsg)
    return { success: false, error: errMsg }
  }
}
