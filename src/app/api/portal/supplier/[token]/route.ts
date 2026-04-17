import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { persistSession: false } }
)

/**
 * GET /api/portal/supplier/[token]
 *
 * Portal público para proveedores — acceso solo con token válido.
 * Devuelve: datos del proveedor, OCs recibidas, recepciones, facturas
 * pendientes de pago, estado de pagos.
 */
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ token: string }> }
) {
  const { token } = await params

  if (!token) {
    return NextResponse.json({ error: 'Token requerido' }, { status: 400 })
  }

  // 1) Validar token en tt_supplier_portal_tokens
  const { data: portalToken, error: tokenError } = await supabaseAdmin
    .from('tt_supplier_portal_tokens')
    .select('id, supplier_id, company_id, expires_at')
    .eq('token', token)
    .eq('is_active', true)
    .single()

  if (tokenError || !portalToken) {
    return NextResponse.json({ error: 'Token inválido o expirado' }, { status: 401 })
  }

  if (portalToken.expires_at && new Date(portalToken.expires_at) < new Date()) {
    return NextResponse.json({ error: 'Token expirado' }, { status: 401 })
  }

  // 2) Actualizar last_used_at
  await supabaseAdmin
    .from('tt_supplier_portal_tokens')
    .update({ last_used_at: new Date().toISOString() })
    .eq('id', portalToken.id)

  const supplierId = portalToken.supplier_id as string

  // 3) Obtener datos del proveedor
  const { data: supplier } = await supabaseAdmin
    .from('tt_suppliers')
    .select('id, name, legal_name, tax_id, email, phone, country, category')
    .eq('id', supplierId)
    .single()

  // 4) Obtener documentos del proveedor en paralelo
  const [posRes, invoicesRes, paymentsRes] = await Promise.all([
    // Ordenes de compra enviadas al proveedor
    supabaseAdmin
      .from('tt_purchase_orders')
      .select('id, po_number, status, total, currency, created_at, expected_delivery, notes')
      .eq('supplier_id', supplierId)
      .order('created_at', { ascending: false })
      .limit(30),

    // Facturas de compra pendientes
    supabaseAdmin
      .from('tt_purchase_invoices')
      .select('id, number, status, total, currency, due_date, created_at, supplier_invoice_number')
      .eq('supplier_id', supplierId)
      .neq('status', 'paid')
      .order('due_date', { ascending: true })
      .limit(20),

    // Pagos realizados
    supabaseAdmin
      .from('tt_purchase_payments')
      .select('id, amount, currency, payment_date, payment_method, bank_reference')
      .eq('supplier_id', supplierId)
      .order('payment_date', { ascending: false })
      .limit(20),
  ])

  return NextResponse.json({
    supplier,
    documents: {
      purchase_orders: posRes.data ?? [],
      pending_invoices: invoicesRes.data ?? [],
      payments: paymentsRes.data ?? [],
    },
    generated_at: new Date().toISOString(),
  })
}
