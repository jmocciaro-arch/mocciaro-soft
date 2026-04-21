// ============================================================================
// GET  /api/whatsapp/accounts           Lista las cuentas del usuario
// POST /api/whatsapp/accounts           Crea una nueva cuenta (admin)
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

// ----------------------------------------------------------------------------
// GET /api/whatsapp/accounts?company_id=...
// ----------------------------------------------------------------------------
export async function GET(req: NextRequest) {
  const supabase = await createClient()
  const companyId = req.nextUrl.searchParams.get('company_id')

  let query = supabase.from('tt_company_whatsapp_accounts').select('*').order('created_at', { ascending: true })
  if (companyId) query = query.eq('company_id', companyId)

  const { data, error } = await query
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const rows = (data as WhatsAppAccount[]).map(toPublic)
  return NextResponse.json({ accounts: rows })
}

// ----------------------------------------------------------------------------
// POST /api/whatsapp/accounts
// Body: { company_id, display_name, phone_number, phone_number_id,
//         whatsapp_business_account_id, access_token, app_secret,
//         webhook_verify_token, webhook_path, business_name?, is_default? }
// ----------------------------------------------------------------------------
export async function POST(req: NextRequest) {
  const supabase = await createClient()
  const body = await req.json()

  const required = [
    'company_id', 'display_name', 'phone_number', 'phone_number_id',
    'whatsapp_business_account_id', 'access_token', 'app_secret',
    'webhook_verify_token', 'webhook_path',
  ]
  for (const k of required) {
    if (!body[k]) return NextResponse.json({ error: `Campo requerido: ${k}` }, { status: 400 })
  }

  // Validar webhook_path: slug simple
  if (!/^[a-z0-9][a-z0-9\-_]{2,63}$/i.test(body.webhook_path)) {
    return NextResponse.json(
      { error: 'webhook_path invalido (solo a-z, 0-9, "-", "_", 3-64 chars)' },
      { status: 400 },
    )
  }

  const insertData = {
    company_id: body.company_id,
    display_name: body.display_name,
    phone_number: body.phone_number,
    phone_number_id: body.phone_number_id,
    whatsapp_business_account_id: body.whatsapp_business_account_id,
    business_name: body.business_name || null,
    access_token: body.access_token,
    access_token_last4: last4(body.access_token),
    app_secret: body.app_secret,
    webhook_verify_token: body.webhook_verify_token,
    webhook_path: body.webhook_path,
    is_default: !!body.is_default,
    active: true,
    verification_status: 'pending' as const,
  }

  // Si marcan is_default=true, destildar los otros de la misma empresa
  if (insertData.is_default) {
    await supabase
      .from('tt_company_whatsapp_accounts')
      .update({ is_default: false })
      .eq('company_id', insertData.company_id)
  }

  const { data, error } = await supabase
    .from('tt_company_whatsapp_accounts')
    .insert(insertData)
    .select('*')
    .single()

  if (error) {
    if (error.code === '23505') {
      return NextResponse.json({ error: 'webhook_path ya en uso, eleg otro' }, { status: 409 })
    }
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ account: toPublic(data as WhatsAppAccount) }, { status: 201 })
}
