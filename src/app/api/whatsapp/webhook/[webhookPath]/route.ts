// ============================================================================
// Webhook publico de WhatsApp Cloud API (Meta)
//
//  GET  /api/whatsapp/webhook/<webhook_path>
//       Verificacion inicial de Meta: responde hub.challenge si el token coincide.
//
//  POST /api/whatsapp/webhook/<webhook_path>
//       Recepcion de eventos: mensajes entrantes + status updates de salientes.
//       Verifica firma X-Hub-Signature-256 con el app_secret de la empresa.
//
// Cada empresa tiene su propio webhook_path (unique) -> ruteo multi-tenant.
// ============================================================================

import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/whatsapp/admin'
import { findAccountByWebhookPath } from '@/lib/whatsapp/select-account'
import { verifyMetaSignature, handleWebhookVerify } from '@/lib/whatsapp/verify'
import { getMediaUrl } from '@/lib/whatsapp/client'
import type { WebhookPayload, WhatsAppMessageStatus, WhatsAppMessageType } from '@/lib/whatsapp/types'

export const runtime = 'nodejs'
export const maxDuration = 20

// ----------------------------------------------------------------------------
// GET: verify
// ----------------------------------------------------------------------------
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ webhookPath: string }> },
) {
  const { webhookPath } = await params
  const supabase = createAdminClient()
  const account = await findAccountByWebhookPath(supabase, webhookPath)
  if (!account) {
    return new NextResponse('not found', { status: 404 })
  }

  const verification = handleWebhookVerify(req.nextUrl.searchParams, account.webhook_verify_token)
  if (!verification.ok) {
    return new NextResponse(verification.reason, { status: 403 })
  }

  return new NextResponse(verification.challenge, {
    status: 200,
    headers: { 'Content-Type': 'text/plain' },
  })
}

// ----------------------------------------------------------------------------
// POST: receive messages + status updates
// ----------------------------------------------------------------------------
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ webhookPath: string }> },
) {
  const { webhookPath } = await params

  // Leemos el raw body ANTES de parsear (para la firma)
  const rawBody = await req.text()

  const supabase = createAdminClient()
  const account = await findAccountByWebhookPath(supabase, webhookPath)
  if (!account) {
    return new NextResponse('not found', { status: 404 })
  }

  // Verificar firma de Meta (X-Hub-Signature-256)
  const sig = req.headers.get('x-hub-signature-256')
  const validSig = verifyMetaSignature(rawBody, sig, account.app_secret)
  if (!validSig) {
    // Meta reintentara — devolvemos 401 para log pero en prod podriamos 200
    // para evitar tormenta de reintentos si nuestro secret esta mal cargado.
    console.warn('[whatsapp-webhook] Firma invalida', { webhookPath })
    return new NextResponse('invalid signature', { status: 401 })
  }

  let payload: WebhookPayload
  try {
    payload = JSON.parse(rawBody)
  } catch {
    return new NextResponse('invalid json', { status: 400 })
  }

  // Procesar entries + changes + messages/statuses
  for (const entry of payload.entry || []) {
    for (const change of entry.changes || []) {
      const value = change.value
      if (!value) continue

      // Mensajes entrantes
      if (value.messages && value.messages.length > 0) {
        for (const msg of value.messages) {
          await handleIncomingMessage(supabase, account, msg, value.metadata?.display_phone_number)
        }
      }

      // Status updates de mensajes salientes
      if (value.statuses && value.statuses.length > 0) {
        for (const st of value.statuses) {
          await handleStatusUpdate(supabase, st)
        }
      }
    }
  }

  // Meta requiere 200 OK rapido (<5s) para no reintentar
  return NextResponse.json({ ok: true })
}

// ----------------------------------------------------------------------------
// Handlers
// ----------------------------------------------------------------------------
async function handleIncomingMessage(
  supabase: ReturnType<typeof createAdminClient>,
  account: { id: string; company_id: string; phone_number: string; access_token: string },
  msg: {
    from: string; id: string; timestamp: string; type: WhatsAppMessageType
    text?: { body: string }
    image?: { id: string; mime_type: string; caption?: string }
    document?: { id: string; mime_type: string; filename?: string; caption?: string }
    audio?: { id: string; mime_type: string }
    video?: { id: string; mime_type: string; caption?: string }
  },
  accountPhone: string | undefined,
) {
  let mediaUrl: string | null = null
  let mediaMime: string | null = null
  let caption: string | null = null
  let body: string | null = null

  // Extraer contenido segun tipo
  if (msg.type === 'text' && msg.text) {
    body = msg.text.body
  } else if (msg.type === 'image' && msg.image) {
    mediaMime = msg.image.mime_type
    caption = msg.image.caption || null
    const m = await getMediaUrl(msg.image.id, account.access_token)
    mediaUrl = m?.url || null
  } else if (msg.type === 'document' && msg.document) {
    mediaMime = msg.document.mime_type
    caption = msg.document.caption || null
    const m = await getMediaUrl(msg.document.id, account.access_token)
    mediaUrl = m?.url || null
  } else if (msg.type === 'audio' && msg.audio) {
    mediaMime = msg.audio.mime_type
    const m = await getMediaUrl(msg.audio.id, account.access_token)
    mediaUrl = m?.url || null
  } else if (msg.type === 'video' && msg.video) {
    mediaMime = msg.video.mime_type
    caption = msg.video.caption || null
    const m = await getMediaUrl(msg.video.id, account.access_token)
    mediaUrl = m?.url || null
  }

  // Intentar matchear con un cliente existente por telefono
  const { data: maybeClient } = await supabase
    .from('tt_clients')
    .select('id')
    .eq('company_id', account.company_id)
    .or(`phone.eq.+${msg.from},whatsapp.eq.+${msg.from},phone.eq.${msg.from},whatsapp.eq.${msg.from}`)
    .limit(1)
    .maybeSingle()

  await supabase.from('tt_whatsapp_messages').insert({
    company_id: account.company_id,
    account_id: account.id,
    direction: 'inbound',
    wa_message_id: msg.id,
    from_phone: msg.from,
    to_phone: accountPhone || account.phone_number,
    message_type: msg.type,
    body,
    media_url: mediaUrl,
    media_mime_type: mediaMime,
    media_caption: caption,
    status: 'received',
    status_updated_at: new Date(parseInt(msg.timestamp) * 1000).toISOString(),
    client_id: maybeClient?.id || null,
    metadata: {},
    raw_payload: msg as unknown as Record<string, unknown>,
  })
}

async function handleStatusUpdate(
  supabase: ReturnType<typeof createAdminClient>,
  status: {
    id: string
    status: 'sent' | 'delivered' | 'read' | 'failed'
    timestamp: string
    errors?: Array<{ code: number; title: string; message?: string }>
  },
) {
  const patch: Record<string, unknown> = {
    status: status.status as WhatsAppMessageStatus,
    status_updated_at: new Date(parseInt(status.timestamp) * 1000).toISOString(),
  }
  if (status.errors && status.errors[0]) {
    patch.error_code = String(status.errors[0].code)
    patch.error_message = status.errors[0].title + (status.errors[0].message ? `: ${status.errors[0].message}` : '')
  }

  await supabase
    .from('tt_whatsapp_messages')
    .update(patch)
    .eq('wa_message_id', status.id)
}
