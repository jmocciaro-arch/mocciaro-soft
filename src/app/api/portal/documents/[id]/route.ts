import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { getEnv } from '@/lib/env'

export const runtime = 'nodejs'

/**
 * GET /api/portal/documents/[id]?token=<portal_token>
 * Endpoint público — exige token de portal y valida pertenencia del documento
 * al cliente/empresa del token (defense in depth vs ID enumeration).
 */
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const token = req.nextUrl.searchParams.get('token')

  if (!token) {
    return NextResponse.json({ error: 'Token requerido' }, { status: 401 })
  }

  const supabase = createClient(
    getEnv('NEXT_PUBLIC_SUPABASE_URL')!,
    getEnv('SUPABASE_SERVICE_ROLE_KEY')!,
    { auth: { persistSession: false } }
  )

  // 1) Validar token de portal
  const { data: portalToken, error: tokenError } = await supabase
    .from('tt_client_portal_tokens')
    .select('id, client_id, company_id, is_active, expires_at')
    .eq('token', token)
    .eq('is_active', true)
    .maybeSingle()

  if (tokenError || !portalToken) {
    return NextResponse.json({ error: 'Token inválido' }, { status: 401 })
  }

  if (portalToken.expires_at && new Date(portalToken.expires_at as string) < new Date()) {
    return NextResponse.json({ error: 'Token expirado' }, { status: 401 })
  }

  // 2) Query base (sin columnas opcionales que pueden no existir)
  const { data: doc, error } = await supabase
    .from('tt_documents')
    .select(`
      id, system_code, doc_type, status, currency, subtotal, tax_amount, total,
      notes, invoice_date, incoterm, payment_terms, metadata, company_id, client_id,
      company:tt_companies ( name, trade_name, legal_name, brand_color, logo_url, phone, email_main, website ),
      client:tt_clients ( name, legal_name, tax_id, email )
    `)
    .eq('id', id)
    .maybeSingle()

  if (error || !doc) {
    return NextResponse.json({ error: 'Documento no encontrado' }, { status: 404 })
  }

  // 3) Defense in depth: el doc DEBE pertenecer al cliente/empresa del token
  if (doc.client_id !== portalToken.client_id || doc.company_id !== portalToken.company_id) {
    return NextResponse.json({ error: 'Documento no encontrado' }, { status: 404 })
  }

  // 4) Update last_used_at (best-effort)
  await supabase
    .from('tt_client_portal_tokens')
    .update({ last_used_at: new Date().toISOString() })
    .eq('id', portalToken.id)

  // Intentar leer columnas de shipping (pueden no existir si v36 no está aplicada)
  let shipping: Record<string, unknown> = {}
  try {
    const { data: shippingData } = await supabase
      .from('tt_documents')
      .select('shipping_carrier, shipping_tracking_number, shipping_tracking_url, shipping_weight_kg, shipping_packages')
      .eq('id', id)
      .maybeSingle()
    if (shippingData) shipping = shippingData as Record<string, unknown>
  } catch { /* columnas no existen aún */ }

  // Fallback: datos de shipping desde metadata
  const md = (doc.metadata || {}) as Record<string, unknown>

  return NextResponse.json({
    ...doc,
    ...shipping,
    shipping_carrier: shipping.shipping_carrier || md.carrier || md.shipping,
    shipping_tracking_number: shipping.shipping_tracking_number || md.tracking_number,
    items: (doc.metadata as Record<string, unknown>)?.lines || [],
  })
}
