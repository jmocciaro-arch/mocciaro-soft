// ============================================================================
// POST /api/whatsapp/test-connection
// Body: { account_id } OR { access_token, phone_number_id }
// Prueba la conexion contra Meta Graph API y actualiza verification_status
// ============================================================================

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { testConnection } from '@/lib/whatsapp/client'
import type { WhatsAppAccount } from '@/lib/whatsapp/types'

export const runtime = 'nodejs'

export async function POST(req: NextRequest) {
  const body = await req.json()
  const supabase = await createClient()

  let accessToken: string | undefined
  let phoneNumberId: string | undefined
  let accountId: string | undefined = body.account_id

  if (accountId) {
    const { data, error } = await supabase
      .from('tt_company_whatsapp_accounts')
      .select('*')
      .eq('id', accountId)
      .maybeSingle()
    if (error || !data) {
      return NextResponse.json({ error: error?.message || 'Cuenta no encontrada' }, { status: 404 })
    }
    const account = data as WhatsAppAccount
    accessToken = account.access_token
    phoneNumberId = account.phone_number_id
  } else {
    accessToken = body.access_token
    phoneNumberId = body.phone_number_id
    if (!accessToken || !phoneNumberId) {
      return NextResponse.json(
        { error: 'Pasa account_id o (access_token + phone_number_id)' },
        { status: 400 },
      )
    }
  }

  const result = await testConnection({
    access_token: accessToken!,
    phone_number_id: phoneNumberId!,
  })

  // Si hay account_id, actualizar verification_status
  if (accountId) {
    await supabase
      .from('tt_company_whatsapp_accounts')
      .update({
        verification_status: result.ok ? 'verified' : 'error',
        last_verified_at: new Date().toISOString(),
        last_error: result.ok ? null : (result.error ?? 'Error desconocido'),
      })
      .eq('id', accountId)
  }

  return NextResponse.json(result, { status: result.ok ? 200 : 400 })
}
