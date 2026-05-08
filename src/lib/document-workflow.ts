/**
 * document-workflow.ts
 * Funciones server-side para transiciones de documentos en el pipeline:
 * Cotizacion -> Pedido -> Albaran/Remito -> Factura -> Cobro
 */

import { createClient } from '@/lib/supabase/client'

type Row = Record<string, unknown>

// ---------------------------------------------------------------
// Generar numero de documento secuencial: COT-2026-0001, PED-2026-0001, etc.
// ---------------------------------------------------------------
export async function generateDocNumber(prefix: string): Promise<string> {
  const supabase = createClient()
  const year = new Date().getFullYear()
  const pattern = `${prefix}-${year}-%`

  let maxNum = 0

  // Buscar en tt_documents
  const { data: docData } = await supabase
    .from('tt_documents')
    .select('system_code')
    .like('system_code', pattern)
    .order('system_code', { ascending: false })
    .limit(1)

  if (docData?.[0]) {
    const match = (docData[0].system_code as string).match(/(\d+)$/)
    if (match) maxNum = parseInt(match[1])
  }

  // Para COT, tambien chequear tt_quotes
  if (prefix === 'COT') {
    const { data: localQ } = await supabase
      .from('tt_quotes')
      .select('number')
      .like('number', pattern)
      .order('number', { ascending: false })
      .limit(1)
    if (localQ?.[0]) {
      const m = (localQ[0].number as string).match(/(\d+)$/)
      if (m) maxNum = Math.max(maxNum, parseInt(m[1]))
    }
  }

  // Para PED, tambien chequear tt_sales_orders
  if (prefix === 'PED') {
    const { data: localSO } = await supabase
      .from('tt_sales_orders')
      .select('doc_number')
      .like('doc_number', pattern)
      .order('doc_number', { ascending: false })
      .limit(1)
    if (localSO?.[0]) {
      const m = (localSO[0].doc_number as string).match(/(\d+)$/)
      if (m) maxNum = Math.max(maxNum, parseInt(m[1]))
    }
  }

  // Para REM, tambien chequear tt_delivery_notes
  if (prefix === 'REM') {
    const { data: localDN } = await supabase
      .from('tt_delivery_notes')
      .select('doc_number')
      .like('doc_number', pattern)
      .order('doc_number', { ascending: false })
      .limit(1)
    if (localDN?.[0]) {
      const m = (localDN[0].doc_number as string).match(/(\d+)$/)
      if (m) maxNum = Math.max(maxNum, parseInt(m[1]))
    }
  }

  // Para FAC, tambien chequear tt_invoices
  if (prefix === 'FAC') {
    const { data: localInv } = await supabase
      .from('tt_invoices')
      .select('doc_number')
      .like('doc_number', pattern)
      .order('doc_number', { ascending: false })
      .limit(1)
    if (localInv?.[0]) {
      const m = (localInv[0].doc_number as string).match(/(\d+)$/)
      if (m) maxNum = Math.max(maxNum, parseInt(m[1]))
    }
  }

  return `${prefix}-${year}-${String(maxNum + 1).padStart(4, '0')}`
}

// ---------------------------------------------------------------
// Actualizar status de un documento
// ---------------------------------------------------------------
export async function updateDocumentStatus(
  docId: string,
  newStatus: string,
  table: 'tt_quotes' | 'tt_documents' | 'tt_sales_orders' | 'tt_delivery_notes' | 'tt_invoices'
): Promise<void> {
  const supabase = createClient()
  const updateData: Row = { status: newStatus }
  if (newStatus === 'closed' || newStatus === 'rejected') {
    updateData.closed_at = new Date().toISOString()
  }
  const { error } = await supabase.from(table).update(updateData).eq('id', docId)
  if (error) throw error

  await supabase.from('tt_activity_log').insert({
    entity_type: 'document',
    entity_id: docId,
    action: 'status_changed',
    detail: `Estado cambiado a ${newStatus}`,
  })
}

// ---------------------------------------------------------------
// Cotizacion -> Pedido de Venta
// ---------------------------------------------------------------
export async function quoteToOrder(
  quoteId: string,
  source: 'local' | 'tt_documents'
): Promise<{ orderId: string; orderNumber: string }> {
  const supabase = createClient()
  const orderNumber = await generateDocNumber('PED')

  let quoteData: Row | null = null
  let quoteItems: Row[] = []

  if (source === 'local') {
    const { data: q } = await supabase.from('tt_quotes').select('*').eq('id', quoteId).single()
    const { data: items } = await supabase.from('tt_quote_items').select('*').eq('quote_id', quoteId).order('sort_order')
    quoteData = q
    quoteItems = items || []
  } else {
    const { data: q } = await supabase.from('tt_documents').select('*').eq('id', quoteId).single()
    const { data: items } = await supabase.from('tt_document_lines').select('*').eq('document_id', quoteId).order('sort_order')
    quoteData = q
    quoteItems = items || []
  }

  if (!quoteData) throw new Error('Cotizacion no encontrada')

  // Get default company_id
  let companyId = quoteData.company_id as string | null
  if (!companyId) {
    // Fallback: get first company
    const { data: firstCo } = await supabase.from('tt_companies').select('id').limit(1).single()
    companyId = firstCo?.id as string || null
  }

  // Crear pedido en tt_sales_orders (tabla local)
  const { data: order, error } = await supabase
    .from('tt_sales_orders')
    .insert({
      company_id: companyId,
      client_id: quoteData.client_id || null,
      quote_id: source === 'local' ? quoteId : null,
      number: orderNumber,
      currency: (quoteData.currency as string) || 'EUR',
      status: 'confirmado',
      subtotal: (quoteData.subtotal as number) || 0,
      tax_amount: (quoteData.tax_amount as number) || 0,
      total: (quoteData.total as number) || 0,
      notes: (quoteData.notes as string) || '',
    })
    .select()
    .single()

  if (error || !order) throw error || new Error('Error creando pedido')

  // Copiar items
  const soItems = quoteItems.map((item, idx) => ({
    sales_order_id: order.id,
    product_id: item.product_id || null,
    description: (item.description as string) || '',
    sku: (item.sku as string) || '',
    qty_ordered: (item.quantity as number) || (item.units as number) || 0,
    unit_price: (item.unit_price as number) || (item.item_base_price as number) || 0,
    discount_pct: (item.discount_pct as number) || (item.discount_percent as number) || 0,
    subtotal: (item.subtotal as number) || (item.line_total as number) || 0,
    sort_order: idx,
  }))

  if (soItems.length > 0) {
    await supabase.from('tt_so_items').insert(soItems)
  }

  // Cerrar la cotizacion
  if (source === 'local') {
    await supabase.from('tt_quotes').update({ status: 'accepted' }).eq('id', quoteId)
  } else {
    await supabase.from('tt_documents').update({ status: 'closed' }).eq('id', quoteId)
  }

  // Log
  await supabase.from('tt_activity_log').insert({
    entity_type: 'document',
    entity_id: order.id as string,
    action: 'created',
    detail: `Pedido ${orderNumber} generado desde cotizacion`,
  })

  return { orderId: order.id as string, orderNumber }
}

// ---------------------------------------------------------------
// Pedido -> Albaran/Remito
// ---------------------------------------------------------------
export interface DeliveryItem {
  id: string
  description: string
  ordered: number
  delivered: number
  toDeliver: number
}

export async function orderToDeliveryNote(
  orderId: string,
  items: DeliveryItem[],
  source: 'local' | 'tt_documents'
): Promise<{ deliveryNoteId: string; deliveryNoteNumber: string }> {
  const supabase = createClient()
  const dnNumber = await generateDocNumber('REM')

  // Cargar datos del pedido
  let orderData: Row | null = null
  if (source === 'local') {
    const { data } = await supabase.from('tt_sales_orders').select('*').eq('id', orderId).single()
    orderData = data
  } else {
    const { data } = await supabase.from('tt_documents').select('*').eq('id', orderId).single()
    orderData = data
  }

  if (!orderData) throw new Error('Pedido no encontrado')

  // Calcular total del remito
  const totalDelivered = items.reduce((sum, it) => sum + it.toDeliver, 0)
  if (totalDelivered === 0) throw new Error('Selecciona al menos un item para entregar')

  // Crear remito
  const { data: dn, error } = await supabase
    .from('tt_delivery_notes')
    .insert({
      company_id: orderData.company_id || null,
      client_id: orderData.client_id,
      sales_order_id: orderId,
      doc_number: dnNumber,
      status: 'pending',
      total: (orderData.total as number) || 0,
    })
    .select()
    .single()

  if (error || !dn) throw error || new Error('Error creando remito')

  // Crear items del remito y actualizar cantidades entregadas
  for (const item of items) {
    if (item.toDeliver > 0) {
      await supabase.from('tt_dn_items').insert({
        delivery_note_id: dn.id,
        so_item_id: item.id,
        quantity: item.toDeliver,
        description: item.description,
      })
      // Actualizar qty_delivered en so_items
      await supabase
        .from('tt_so_items')
        .update({ qty_delivered: item.delivered + item.toDeliver })
        .eq('id', item.id)
    }
  }

  // Verificar si todo fue entregado
  const { data: soItemsCheck } = await supabase
    .from('tt_so_items')
    .select('qty_ordered, quantity, qty_delivered')
    .eq('sales_order_id', orderId)

  const allDelivered = (soItemsCheck || []).every(
    (it: Row) =>
      ((it.qty_delivered as number) || 0) >=
      ((it.qty_ordered as number) || (it.quantity as number) || 0)
  )

  // Actualizar status del pedido
  if (source === 'local') {
    await supabase
      .from('tt_sales_orders')
      .update({ status: allDelivered ? 'fully_delivered' : 'partially_delivered' })
      .eq('id', orderId)
  } else {
    await supabase
      .from('tt_documents')
      .update({ status: allDelivered ? 'fully_delivered' : 'partially_delivered' })
      .eq('id', orderId)
  }

  // Log
  await supabase.from('tt_activity_log').insert({
    entity_type: 'document',
    entity_id: dn.id as string,
    action: 'created',
    detail: `Remito ${dnNumber} generado desde pedido`,
  })

  return { deliveryNoteId: dn.id as string, deliveryNoteNumber: dnNumber }
}

// ---------------------------------------------------------------
// Albaran/Remito -> Factura
// ---------------------------------------------------------------
export async function deliveryNoteToInvoice(
  deliveryNoteId: string,
  source: 'local' | 'tt_documents'
): Promise<{ invoiceId: string; invoiceNumber: string }> {
  const supabase = createClient()
  const invNumber = await generateDocNumber('FAC')

  let dnData: Row | null = null
  if (source === 'local') {
    const { data } = await supabase.from('tt_delivery_notes').select('*').eq('id', deliveryNoteId).single()
    dnData = data
  } else {
    const { data } = await supabase.from('tt_documents').select('*').eq('id', deliveryNoteId).single()
    dnData = data
  }

  if (!dnData) throw new Error('Albaran no encontrado')

  // Buscar el pedido original para obtener montos
  let orderData: Row | null = null
  const soId = dnData.sales_order_id as string | null
  if (soId) {
    const { data } = await supabase.from('tt_sales_orders').select('*').eq('id', soId).single()
    orderData = data
  }

  const total = (orderData?.total as number) || (dnData.total as number) || 0
  const subtotal = (orderData?.subtotal as number) || total
  const taxAmount = (orderData?.tax_amount as number) || 0

  // Crear factura
  const { data: inv, error } = await supabase
    .from('tt_invoices')
    .insert({
      company_id: dnData.company_id || null,
      client_id: dnData.client_id,
      sales_order_id: soId,
      delivery_note_id: deliveryNoteId,
      doc_number: invNumber,
      type: 'sale',
      status: 'draft',
      currency: (orderData?.currency as string) || 'EUR',
      subtotal,
      tax_amount: taxAmount,
      total,
    })
    .select()
    .single()

  if (error || !inv) throw error || new Error('Error creando factura')

  // Cerrar albaran
  if (source === 'local') {
    await supabase.from('tt_delivery_notes').update({ status: 'closed' }).eq('id', deliveryNoteId)
  } else {
    await supabase.from('tt_documents').update({ status: 'closed' }).eq('id', deliveryNoteId)
  }

  // Log
  await supabase.from('tt_activity_log').insert({
    entity_type: 'document',
    entity_id: inv.id as string,
    action: 'created',
    detail: `Factura ${invNumber} generada desde albaran`,
  })

  return { invoiceId: inv.id as string, invoiceNumber: invNumber }
}

// ---------------------------------------------------------------
// Pedido -> Factura directa (sin remito)
// ---------------------------------------------------------------
export async function orderToInvoice(
  orderId: string,
  source: 'local' | 'tt_documents'
): Promise<{ invoiceId: string; invoiceNumber: string }> {
  const supabase = createClient()
  const invNumber = await generateDocNumber('FAC')

  let orderData: Row | null = null
  if (source === 'local') {
    const { data } = await supabase.from('tt_sales_orders').select('*').eq('id', orderId).single()
    orderData = data
  } else {
    const { data } = await supabase.from('tt_documents').select('*').eq('id', orderId).single()
    orderData = data
  }

  if (!orderData) throw new Error('Pedido no encontrado')

  const { data: inv, error } = await supabase
    .from('tt_invoices')
    .insert({
      company_id: orderData.company_id || null,
      client_id: orderData.client_id,
      sales_order_id: orderId,
      doc_number: invNumber,
      type: 'sale',
      status: 'draft',
      currency: (orderData.currency as string) || 'EUR',
      subtotal: (orderData.subtotal as number) || 0,
      tax_amount: (orderData.tax_amount as number) || 0,
      total: (orderData.total as number) || 0,
    })
    .select()
    .single()

  if (error || !inv) throw error || new Error('Error creando factura')

  // Actualizar status del pedido
  if (source === 'local') {
    await supabase.from('tt_sales_orders').update({ status: 'fully_invoiced' }).eq('id', orderId)
  } else {
    await supabase.from('tt_documents').update({ status: 'fully_invoiced' }).eq('id', orderId)
  }

  await supabase.from('tt_activity_log').insert({
    entity_type: 'document',
    entity_id: inv.id as string,
    action: 'created',
    detail: `Factura ${invNumber} generada directamente desde pedido`,
  })

  return { invoiceId: inv.id as string, invoiceNumber: invNumber }
}

// ---------------------------------------------------------------
// Registrar cobro/pago
// ---------------------------------------------------------------
export async function registerPayment(
  invoiceId: string,
  amount: number,
  method: string,
  reference: string,
  paymentDate?: string
): Promise<{ paymentId: string }> {
  const supabase = createClient()

  // Obtener datos de la factura
  const { data: inv } = await supabase.from('tt_invoices').select('total, status').eq('id', invoiceId).single()
  if (!inv) throw new Error('Factura no encontrada')

  const { data: payment, error } = await supabase
    .from('tt_payments')
    .insert({
      invoice_id: invoiceId,
      amount,
      method,
      reference: reference || null,
      payment_date: paymentDate || new Date().toISOString().split('T')[0],
      status: 'completed',
    })
    .select()
    .single()

  if (error || !payment) throw error || new Error('Error registrando cobro')

  // Verificar si esta totalmente cobrada
  const { data: payments } = await supabase
    .from('tt_payments')
    .select('amount')
    .eq('invoice_id', invoiceId)
    .eq('status', 'completed')

  const totalPaid = (payments || []).reduce((sum: number, p: Row) => sum + ((p.amount as number) || 0), 0)
  const invTotal = (inv.total as number) || 0
  const fullyPaid = totalPaid >= invTotal

  await supabase
    .from('tt_invoices')
    .update({ status: fullyPaid ? 'paid' : 'partial' })
    .eq('id', invoiceId)

  await supabase.from('tt_activity_log').insert({
    entity_type: 'document',
    entity_id: invoiceId,
    action: 'payment_registered',
    detail: `Cobro de ${amount} registrado via ${method}${fullyPaid ? ' - Factura cobrada' : ''}`,
  })

  return { paymentId: payment.id as string }
}
