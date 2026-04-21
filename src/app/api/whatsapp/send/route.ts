// ============================================================================
// POST /api/whatsapp/send
// Envia un mensaje WhatsApp. Soporta DOS formatos de entrada:
//
//  [NUEVO - multi-cuenta]
//    { company_id, account_id?, to, type:'text'|'template'|'image'|..., ... }
//
//  [LEGACY - compat con componentes existentes]
//    { companyId, to, documentUrl?, message? }
//
// Elige la cuenta desde tt_company_whatsapp_accounts (nueva tabla). Si no
// hay ninguna configurada, cae al metodo legacy (tt_companies.whatsapp_*).
// Registra en tt_whatsapp_messages con el resultado.
// ============================================================================

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/whatsapp/admin'
import {
  sendWhatsApp as sendViaMeta,
  normalizePhone,
  WhatsAppApiError,
} from '@/lib/whatsapp/client'
import { selectAccount } from '@/lib/whatsapp/select-account'
import type { SendInput, WhatsAppMessageType } from '@/lib/whatsapp/types'
// Legacy helper (se mantiene para compat)
import { sendWhatsApp as sendLegacy } from '@/lib/whatsapp/send-whatsapp'

export const runtime = 'nodejs'
export const maxDuration = 30

interface NewBody {
  company_id: string
  account_id?: string
  to: string
  type: WhatsAppMessageType
  body?: string
  preview_url?: boolean
  template_name?: string
  language?: string
  components?: Array<Record<string, unknown>>
  media_url?: string
  caption?: string
  filename?: string
  client_id?: string
  lead_id?: string
  related_entity_type?: string
  related_entity_id?: string
  metadata?: Record<string, unknown>
}

interface LegacyBody {
  companyId: string
  to: string
  templateName?: string
  documentUrl?: string
  message?: string
}

type AnyBody = Partial<NewBody> & Partial<LegacyBody>

/**
 * Detecta si el body viene en formato legacy (camelCase companyId).
 */
function isLegacyBody(b: AnyBody): b is LegacyBody {
  return !!b.companyId && !b.company_id
}

export async function POST(req: NextRequest) {
  let raw: AnyBody
  try {
    raw = await req.json()
  } catch {
    return NextResponse.json({ error: 'JSON invalido' }, { status: 400 })
  }

  if (!raw.to) return NextResponse.json({ error: 'to requerido' }, { status: 400 })

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  let userId: string | null = null
  const { data: ttUser } = await supabase
    .from('tt_users')
    .select('id')
    .eq('auth_id', user.id)
    .maybeSingle()
  userId = ttUser?.id ?? null

  // ------------------------------------------------------------
  // Normalizar a formato NUEVO
  // ------------------------------------------------------------
  let body: NewBody
  if (isLegacyBody(raw)) {
    // Legacy → new
    body = {
      company_id: raw.companyId!,
      to: raw.to!,
      type: raw.documentUrl ? 'document' : 'text',
      body: raw.message,
      media_url: raw.documentUrl,
      caption: raw.message,
      filename: raw.documentUrl ? 'documento.pdf' : undefined,
    }
  } else {
    if (!raw.company_id) return NextResponse.json({ error: 'company_id requerido' }, { status: 400 })
    if (!raw.type) return NextResponse.json({ error: 'type requerido' }, { status: 400 })
    body = raw as NewBody
  }

  // ------------------------------------------------------------
  // Selecciona cuenta del NUEVO modelo (tt_company_whatsapp_accounts)
  // ------------------------------------------------------------
  const account = await selectAccount(supabase, {
    company_id: body.company_id,
    account_id: body.account_id,
  })

  // ------------------------------------------------------------
  // Camino NUEVO: usa la cuenta multi-empresa
  // ------------------------------------------------------------
  if (account) {
    let input: SendInput
    if (body.type === 'text') {
      if (!body.body) return NextResponse.json({ error: 'body requerido para text' }, { status: 400 })
      input = { type: 'text', to: body.to, body: body.body, preview_url: body.preview_url }
    } else if (body.type === 'template') {
      if (!body.template_name || !body.language) {
        return NextResponse.json({ error: 'template_name y language requeridos' }, { status: 400 })
      }
      input = {
        type: 'template',
        to: body.to,
        template_name: body.template_name,
        language: body.language,
        components: body.components as never,
      }
    } else if (['image', 'document', 'audio', 'video'].includes(body.type)) {
      if (!body.media_url) return NextResponse.json({ error: 'media_url requerido' }, { status: 400 })
      input = {
        type: body.type as 'image' | 'document' | 'audio' | 'video',
        to: body.to,
        media_url: body.media_url,
        caption: body.caption,
        filename: body.filename,
      }
    } else {
      return NextResponse.json({ error: `Tipo no soportado: ${body.type}` }, { status: 400 })
    }

    try {
      const result = await sendViaMeta(input, {
        access_token: account.access_token,
        phone_number_id: account.phone_number_id,
      })
      const waId = result.messages?.[0]?.id ?? null

      const { data: msgRow } = await supabase
        .from('tt_whatsapp_messages')
        .insert({
          company_id: body.company_id,
          account_id: account.id,
          direction: 'outbound',
          wa_message_id: waId,
          from_phone: account.phone_number,
          to_phone: normalizePhone(body.to),
          message_type: body.type,
          template_name: body.template_name ?? null,
          template_language: body.language ?? null,
          template_params: body.components ? { components: body.components } : null,
          body: body.body ?? null,
          media_url: body.media_url ?? null,
          media_caption: body.caption ?? null,
          status: 'sent',
          status_updated_at: new Date().toISOString(),
          client_id: body.client_id ?? null,
          lead_id: body.lead_id ?? null,
          related_entity_type: body.related_entity_type ?? null,
          related_entity_id: body.related_entity_id ?? null,
          sent_by: userId,
          metadata: body.metadata ?? {},
          raw_payload: result as unknown as Record<string, unknown>,
        })
        .select('id')
        .single()

      return NextResponse.json({
        ok: true,
        success: true,                       // compat legacy
        messageId: waId,                     // compat legacy
        wa_message_id: waId,
        internal_id: msgRow?.id,
        account_used: {
          id: account.id,
          display_name: account.display_name,
          phone_number: account.phone_number,
        },
      })
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      const code = err instanceof WhatsAppApiError ? err.code : null

      await supabase.from('tt_whatsapp_messages').insert({
        company_id: body.company_id,
        account_id: account.id,
        direction: 'outbound',
        from_phone: account.phone_number,
        to_phone: normalizePhone(body.to),
        message_type: body.type,
        body: body.body ?? null,
        status: 'failed',
        status_updated_at: new Date().toISOString(),
        error_code: code != null ? String(code) : null,
        error_message: msg,
        sent_by: userId,
        metadata: body.metadata ?? {},
      })

      return NextResponse.json(
        { ok: false, success: false, error: msg, meta_code: code },
        { status: 500 },
      )
    }
  }

  // ------------------------------------------------------------
  // Camino LEGACY: no hay cuenta en el nuevo modelo -> tt_companies.whatsapp_*
  // ------------------------------------------------------------
  const admin = createAdminClient()
  const { data: company } = await admin
    .from('tt_companies')
    .select('whatsapp_phone_id, whatsapp_token, whatsapp_enabled, name')
    .eq('id', body.company_id)
    .maybeSingle()

  if (!company || !company.whatsapp_enabled || !company.whatsapp_phone_id || !company.whatsapp_token) {
    return NextResponse.json(
      { error: 'No hay cuentas WhatsApp configuradas para esta empresa. Configurala en /admin/whatsapp.' },
      { status: 404 },
    )
  }

  let legacyResult
  if (body.type === 'document' && body.media_url) {
    legacyResult = await sendLegacy({
      type: 'document',
      to: body.to,
      documentUrl: body.media_url,
      caption: body.caption ?? body.body ?? `Documento de ${company.name}`,
      filename: body.filename ?? 'documento.pdf',
      phoneNumberId: company.whatsapp_phone_id,
      token: company.whatsapp_token,
    })
  } else if (body.body) {
    legacyResult = await sendLegacy({
      type: 'text',
      to: body.to,
      text: body.body,
      phoneNumberId: company.whatsapp_phone_id,
      token: company.whatsapp_token,
    })
  } else {
    return NextResponse.json({ error: 'Se requiere body o media_url' }, { status: 400 })
  }

  if (!legacyResult.success) {
    return NextResponse.json({ error: legacyResult.error, success: false }, { status: 500 })
  }
  return NextResponse.json({ success: true, ok: true, messageId: legacyResult.messageId })
}
