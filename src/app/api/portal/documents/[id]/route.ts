import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { getEnv } from '@/lib/env'

export const runtime = 'nodejs'

/**
 * GET /api/portal/documents/[id]
 * Endpoint PUBLICO — devuelve datos del documento para el portal del cliente.
 */
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params

  const supabase = createClient(
    getEnv('NEXT_PUBLIC_SUPABASE_URL')!,
    getEnv('SUPABASE_SERVICE_ROLE_KEY')!,
    { auth: { persistSession: false } }
  )

  // Query base (sin columnas opcionales que pueden no existir)
  const { data: doc, error } = await supabase
    .from('tt_documents')
    .select(`
      id, system_code, doc_type, status, currency, subtotal, tax_amount, total,
      notes, invoice_date, incoterm, payment_terms, metadata,
      company:tt_companies ( name, trade_name, legal_name, brand_color, logo_url, phone, email_main, website ),
      client:tt_clients ( name, legal_name, tax_id, email )
    `)
    .eq('id', id)
    .maybeSingle()

  if (error || !doc) {
    return NextResponse.json({ error: 'Documento no encontrado' }, { status: 404 })
  }

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
    items: (doc.metadata as any)?.lines || [],
  })
}
