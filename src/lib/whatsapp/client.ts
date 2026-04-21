// ============================================================================
// WhatsApp Business Cloud API — cliente HTTP
// Encapsula las llamadas a Meta Graph API v20.0.
// ============================================================================

import type {
  SendInput, MetaSendResponse, MetaError,
  MetaTemplateComponent,
} from './types'

const GRAPH_VERSION = 'v20.0'
const GRAPH_BASE = `https://graph.facebook.com/${GRAPH_VERSION}`

export interface SendOptions {
  access_token: string
  phone_number_id: string
}

export class WhatsAppApiError extends Error {
  code: number
  subcode?: number
  fbtrace_id?: string
  constructor(err: MetaError['error']) {
    super(err.message)
    this.name = 'WhatsAppApiError'
    this.code = err.code
    this.subcode = err.error_subcode
    this.fbtrace_id = err.fbtrace_id
  }
}

/**
 * Envia un mensaje via Meta Graph API.
 * Acepta texto, template, image, document, audio, video.
 */
export async function sendWhatsApp(
  input: SendInput,
  opts: SendOptions
): Promise<MetaSendResponse> {
  const url = `${GRAPH_BASE}/${opts.phone_number_id}/messages`
  const body = buildMetaBody(input)

  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${opts.access_token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  })

  const json = await res.json().catch(() => ({}))

  if (!res.ok) {
    const err = (json as MetaError).error
    if (err) throw new WhatsAppApiError(err)
    throw new Error(`Meta API HTTP ${res.status}: ${JSON.stringify(json)}`)
  }

  return json as MetaSendResponse
}

/**
 * Construye el payload JSON para /messages segun el tipo.
 */
function buildMetaBody(input: SendInput): Record<string, unknown> {
  const base = {
    messaging_product: 'whatsapp',
    recipient_type: 'individual',
    to: normalizePhone(input.to),
  }

  if (input.type === 'text') {
    return {
      ...base,
      type: 'text',
      text: { body: input.body, preview_url: input.preview_url ?? false },
    }
  }

  if (input.type === 'template') {
    const components: MetaTemplateComponent[] = input.components || []
    return {
      ...base,
      type: 'template',
      template: {
        name: input.template_name,
        language: { code: input.language },
        ...(components.length > 0 ? { components } : {}),
      },
    }
  }

  if (input.type === 'image') {
    return {
      ...base,
      type: 'image',
      image: { link: input.media_url, ...(input.caption ? { caption: input.caption } : {}) },
    }
  }

  if (input.type === 'document') {
    return {
      ...base,
      type: 'document',
      document: {
        link: input.media_url,
        ...(input.caption ? { caption: input.caption } : {}),
        ...(input.filename ? { filename: input.filename } : {}),
      },
    }
  }

  if (input.type === 'audio') {
    return { ...base, type: 'audio', audio: { link: input.media_url } }
  }

  if (input.type === 'video') {
    return {
      ...base,
      type: 'video',
      video: { link: input.media_url, ...(input.caption ? { caption: input.caption } : {}) },
    }
  }

  throw new Error(`Tipo de mensaje no soportado: ${(input as { type: string }).type}`)
}

/**
 * Normaliza un numero de telefono a formato E.164 sin "+".
 * Meta acepta "34600123456" o "+34600123456" — enviamos sin "+" por seguridad.
 */
export function normalizePhone(raw: string): string {
  const cleaned = raw.trim().replace(/[\s()\-.]/g, '')
  return cleaned.startsWith('+') ? cleaned.slice(1) : cleaned
}

/**
 * Test de conexion: llama a /phone_numbers de la WABA para verificar
 * que el access_token + phone_number_id funcionen.
 */
export async function testConnection(opts: {
  access_token: string
  phone_number_id: string
}): Promise<{ ok: boolean; data?: unknown; error?: string }> {
  try {
    const res = await fetch(
      `${GRAPH_BASE}/${opts.phone_number_id}?fields=id,display_phone_number,verified_name,quality_rating`,
      { headers: { 'Authorization': `Bearer ${opts.access_token}` } }
    )
    const json = await res.json().catch(() => ({}))
    if (!res.ok) {
      return { ok: false, error: (json as MetaError).error?.message || `HTTP ${res.status}` }
    }
    return { ok: true, data: json }
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) }
  }
}

/**
 * Descarga media de Meta (imagenes, docs recibidos en inbound).
 * Retorna URL temporal + mime_type.
 */
export async function getMediaUrl(
  mediaId: string,
  access_token: string
): Promise<{ url: string; mime_type: string } | null> {
  try {
    const meta = await fetch(`${GRAPH_BASE}/${mediaId}`, {
      headers: { 'Authorization': `Bearer ${access_token}` },
    })
    const metaJson = await meta.json().catch(() => ({})) as { url?: string; mime_type?: string }
    if (!meta.ok || !metaJson.url) return null
    return { url: metaJson.url, mime_type: metaJson.mime_type || 'application/octet-stream' }
  } catch {
    return null
  }
}
