import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

// GET /api/portal/[token] — público con token
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ token: string }> }
) {
  const { token } = await params

  if (!token) {
    return NextResponse.json({ error: 'Token requerido' }, { status: 400 })
  }

  // Validar token
  const { data: portalToken, error: tokenError } = await supabaseAdmin
    .from('tt_client_portal_tokens')
    .select('*, tt_clients(id, name, email, company_name)')
    .eq('token', token)
    .eq('is_active', true)
    .single()

  if (tokenError || !portalToken) {
    return NextResponse.json({ error: 'Token inválido o expirado' }, { status: 401 })
  }

  // Verificar expiración
  if (portalToken.expires_at && new Date(portalToken.expires_at) < new Date()) {
    return NextResponse.json({ error: 'Token expirado' }, { status: 401 })
  }

  // Actualizar last_used_at
  await supabaseAdmin
    .from('tt_client_portal_tokens')
    .update({ last_used_at: new Date().toISOString() })
    .eq('id', portalToken.id)

  const clientId = portalToken.client_id
  const companyId = portalToken.company_id

  // Obtener documentos del cliente en paralelo
  const [quotesRes, ordersRes, invoicesRes, deliveryRes] = await Promise.all([
    supabaseAdmin
      .from('tt_quotes')
      .select('id, code, status, total_amount, currency, created_at, pdf_url')
      .eq('client_id', clientId)
      .eq('company_id', companyId)
      .order('created_at', { ascending: false })
      .limit(20),
    supabaseAdmin
      .from('tt_sales_orders')
      .select('id, code, status, total_amount, currency, created_at, pdf_url')
      .eq('client_id', clientId)
      .eq('company_id', companyId)
      .order('created_at', { ascending: false })
      .limit(20),
    supabaseAdmin
      .from('tt_invoices')
      .select('id, code, status, total_amount, currency, created_at, pdf_url, due_date')
      .eq('client_id', clientId)
      .eq('company_id', companyId)
      .order('created_at', { ascending: false })
      .limit(20),
    supabaseAdmin
      .from('tt_delivery_notes')
      .select('id, code, status, created_at, pdf_url')
      .eq('client_id', clientId)
      .eq('company_id', companyId)
      .order('created_at', { ascending: false })
      .limit(20),
  ])

  return NextResponse.json({
    client: portalToken.tt_clients,
    documents: {
      quotes: quotesRes.data ?? [],
      orders: ordersRes.data ?? [],
      invoices: invoicesRes.data ?? [],
      deliveryNotes: deliveryRes.data ?? [],
    },
  })
}
