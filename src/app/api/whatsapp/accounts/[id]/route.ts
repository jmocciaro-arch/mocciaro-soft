// ============================================================================
// PATCH  /api/whatsapp/accounts/[id]   Edita credenciales/estado de una cuenta
// DELETE /api/whatsapp/accounts/[id]   Borra la cuenta
// ============================================================================

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { last4, buildWebhookUrl } from '@/lib/whatsapp/admin'
import type { WhatsAppAccount, WhatsAppAccountPublic } from '@/lib/whatsapp/types'

export const runtime = 'nodejs'

function toPublic(row: WhatsAppAccount): WhatsAppAccountPublic {
  return {
    id: row.id,
    company_id: row.company_id,
    display_name: row.display_name,
    phone_number: row.phone_number,
    phone_number_id: row.phone_number_id,
    whatsapp_business_account_id: row.whatsapp_business_account_id,
    business_name: row.business_name,
    access_token_last4: row.access_token_last4,
    webhook_path: row.webhook_path,
    webhook_url: buildWebhookUrl(row.webhook_path),
    is_default: row.is_default,
    active: row.active,
    verification_status: row.verification_status,
    last_verified_at: row.last_verified_at,
    last_error: row.last_error,
    created_at: row.created_at,
    updated_at: row.updated_at,
  }
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params
  const supabase = await createClient()
  const body = await req.json()

  // Solo permitir campos editables
  const patch: Record<string, unknown> = {}
  const editable = [
    'display_name', 'phone_number', 'phone_number_id',
    'whatsapp_business_account_id', 'business_name',
    'access_token', 'app_secret', 'webhook_verify_token',
    'is_default', 'active',
  ]
  for (const k of editable) if (k in body) patch[k] = body[k]

  // Si cambia el token, actualizar last4
  if (typeof patch.access_token === 'string') {
    patch.access_token_last4 = last4(patch.access_token as string)
  }

  // Si la vuelven default, resetear las otras
  if (patch.is_default === true) {
    const { data: cur } = await supabase
      .from('tt_company_whatsapp_accounts')
      .select('company_id')
      .eq('id', id)
      .maybeSingle()
    if (cur?.company_id) {
      await supabase
        .from('tt_company_whatsapp_accounts')
        .update({ is_default: false })
        .eq('company_id', cur.company_id)
        .neq('id', id)
    }
  }

  const { data, error } = await supabase
    .from('tt_company_whatsapp_accounts')
    .update(patch)
    .eq('id', id)
    .select('*')
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ account: toPublic(data as WhatsAppAccount) })
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params
  const supabase = await createClient()

  const { error } = await supabase
    .from('tt_company_whatsapp_accounts')
    .delete()
    .eq('id', id)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
