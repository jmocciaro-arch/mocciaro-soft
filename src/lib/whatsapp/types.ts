// ============================================================================
// WhatsApp Business Cloud API — types compartidos
// ============================================================================

export type WhatsAppVerificationStatus = 'pending' | 'verified' | 'error'

export interface WhatsAppAccount {
  id: string
  company_id: string
  display_name: string
  phone_number: string
  phone_number_id: string
  whatsapp_business_account_id: string
  business_name: string | null
  access_token: string
  access_token_last4: string | null
  app_secret: string
  webhook_verify_token: string
  webhook_path: string
  is_default: boolean
  active: boolean
  verification_status: WhatsAppVerificationStatus
  last_verified_at: string | null
  last_error: string | null
  created_by: string | null
  created_at: string
  updated_at: string
}

/** Vista segura para UI (sin tokens completos). */
export interface WhatsAppAccountPublic {
  id: string
  company_id: string
  display_name: string
  phone_number: string
  phone_number_id: string
  whatsapp_business_account_id: string
  business_name: string | null
  access_token_last4: string | null
  webhook_path: string
  webhook_url: string
  is_default: boolean
  active: boolean
  verification_status: WhatsAppVerificationStatus
  last_verified_at: string | null
  last_error: string | null
  created_at: string
  updated_at: string
}

export type WhatsAppMessageDirection = 'inbound' | 'outbound'
export type WhatsAppMessageStatus = 'queued' | 'sent' | 'delivered' | 'read' | 'failed' | 'received'
export type WhatsAppMessageType =
  | 'text' | 'image' | 'document' | 'audio' | 'video'
  | 'template' | 'location' | 'sticker' | 'button' | 'interactive'

export interface WhatsAppMessage {
  id: string
  company_id: string
  account_id: string | null
  direction: WhatsAppMessageDirection
  wa_message_id: string | null
  from_phone: string
  to_phone: string
  message_type: WhatsAppMessageType
  template_name: string | null
  template_language: string | null
  template_params: Record<string, unknown> | null
  body: string | null
  media_url: string | null
  media_mime_type: string | null
  media_caption: string | null
  status: WhatsAppMessageStatus
  status_updated_at: string | null
  error_code: string | null
  error_message: string | null
  client_id: string | null
  lead_id: string | null
  related_entity_type: string | null
  related_entity_id: string | null
  sent_by: string | null
  metadata: Record<string, unknown>
  raw_payload: Record<string, unknown> | null
  created_at: string
}

// ----------------------------------------------------------------------------
// Payloads para envio
// ----------------------------------------------------------------------------
export interface SendTextInput {
  type: 'text'
  to: string
  body: string
  preview_url?: boolean
}

export interface SendTemplateInput {
  type: 'template'
  to: string
  template_name: string
  language: string                 // 'es_ES', 'es_AR', 'en_US', etc.
  components?: MetaTemplateComponent[]
}

export interface SendMediaInput {
  type: 'image' | 'document' | 'audio' | 'video'
  to: string
  media_url: string
  caption?: string                 // solo image/document/video
  filename?: string                // solo document
}

export type SendInput = SendTextInput | SendTemplateInput | SendMediaInput

export interface MetaTemplateComponent {
  type: 'header' | 'body' | 'button' | 'footer'
  parameters?: Array<{
    type: 'text' | 'currency' | 'date_time' | 'image' | 'document' | 'video'
    text?: string
    currency?: { fallback_value: string; code: string; amount_1000: number }
    date_time?: { fallback_value: string }
    image?: { link: string }
    document?: { link: string; filename?: string }
    video?: { link: string }
  }>
  sub_type?: 'quick_reply' | 'url'
  index?: number
}

// ----------------------------------------------------------------------------
// Respuesta de Meta Graph API
// ----------------------------------------------------------------------------
export interface MetaSendResponse {
  messaging_product: 'whatsapp'
  contacts: Array<{ input: string; wa_id: string }>
  messages: Array<{ id: string; message_status?: string }>
}

export interface MetaError {
  error: {
    message: string
    type: string
    code: number
    error_subcode?: number
    fbtrace_id?: string
  }
}

// ----------------------------------------------------------------------------
// Payload webhook entrante (simplificado)
// ----------------------------------------------------------------------------
export interface WebhookPayload {
  object: 'whatsapp_business_account'
  entry: Array<{
    id: string               // WABA id
    changes: Array<{
      value: {
        messaging_product: 'whatsapp'
        metadata: { display_phone_number: string; phone_number_id: string }
        contacts?: Array<{ profile: { name: string }; wa_id: string }>
        messages?: Array<WebhookIncomingMessage>
        statuses?: Array<WebhookStatusUpdate>
      }
      field: string
    }>
  }>
}

export interface WebhookIncomingMessage {
  from: string
  id: string
  timestamp: string
  type: WhatsAppMessageType
  text?: { body: string }
  image?: { id: string; mime_type: string; sha256: string; caption?: string }
  document?: { id: string; mime_type: string; sha256: string; filename?: string; caption?: string }
  audio?: { id: string; mime_type: string; sha256: string; voice?: boolean }
  video?: { id: string; mime_type: string; sha256: string; caption?: string }
  button?: { text: string; payload: string }
  interactive?: { type: string; button_reply?: { id: string; title: string }; list_reply?: { id: string; title: string } }
  context?: { from: string; id: string }
}

export interface WebhookStatusUpdate {
  id: string                 // wa_message_id
  status: 'sent' | 'delivered' | 'read' | 'failed'
  timestamp: string
  recipient_id: string
  errors?: Array<{ code: number; title: string; message?: string }>
}
