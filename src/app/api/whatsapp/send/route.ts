import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { sendWhatsApp } from '@/lib/whatsapp/send-whatsapp'
import { createClient as createServerClient } from '@/lib/supabase/server'

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

interface SendWhatsAppBody {
  companyId: string
  to: string
  templateName?: string
  documentUrl?: string
  message?: string
}

// POST /api/whatsapp/send — autenticado
export async function POST(req: NextRequest) {
  // Verificar auth
  const supabase = await createServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  }

  let body: SendWhatsAppBody
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Cuerpo inválido' }, { status: 400 })
  }

  const { companyId, to, documentUrl, message } = body

  if (!companyId || !to) {
    return NextResponse.json(
      { error: 'companyId y to son requeridos' },
      { status: 400 }
    )
  }

  // Obtener config de WhatsApp de la empresa
  const { data: company, error: companyError } = await supabaseAdmin
    .from('tt_companies')
    .select('whatsapp_phone_id, whatsapp_token, whatsapp_enabled, name')
    .eq('id', companyId)
    .single()

  if (companyError || !company) {
    return NextResponse.json({ error: 'Empresa no encontrada' }, { status: 404 })
  }

  if (!company.whatsapp_enabled) {
    return NextResponse.json(
      { error: 'WhatsApp no está habilitado para esta empresa' },
      { status: 400 }
    )
  }

  if (!company.whatsapp_phone_id || !company.whatsapp_token) {
    return NextResponse.json(
      { error: 'Configuración de WhatsApp incompleta' },
      { status: 400 }
    )
  }

  let result
  if (documentUrl) {
    result = await sendWhatsApp({
      type: 'document',
      to,
      documentUrl,
      caption: message ?? `Documento de ${company.name}`,
      filename: 'documento.pdf',
      phoneNumberId: company.whatsapp_phone_id,
      token: company.whatsapp_token,
    })
  } else if (message) {
    result = await sendWhatsApp({
      type: 'text',
      to,
      text: message,
      phoneNumberId: company.whatsapp_phone_id,
      token: company.whatsapp_token,
    })
  } else {
    return NextResponse.json(
      { error: 'Se requiere message o documentUrl' },
      { status: 400 }
    )
  }

  if (!result.success) {
    return NextResponse.json({ error: result.error }, { status: 500 })
  }

  return NextResponse.json({ success: true, messageId: result.messageId })
}
