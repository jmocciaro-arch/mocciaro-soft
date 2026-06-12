/**
 * document-workflow.ts
 * Funciones server-side para transiciones de documentos en el pipeline:
 * Cotizacion -> Pedido -> Albaran/Remito -> Factura -> Cobro
 *
 * REFACTOR FASE 2 (2026-05-25): migrado 100% a tt_documents + tt_document_lines.
 * Las tablas legacy (tt_quotes, tt_sales_orders, tt_delivery_notes, tt_invoices,
 * tt_quote_items, tt_so_items, tt_dn_items, tt_invoice_items) ya no se usan.
 *
 * Mantenemos los parámetros `source` y `table` por compat con callers viejos,
 * pero las funciones siempre operan sobre tt_documents.
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

  // Solo tt_documents (Fase 2 — legacy eliminado)
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

  return `${prefix}-${year}-${String(maxNum + 1).padStart(4, '0')}`
}

// ---------------------------------------------------------------
// Actualizar status de un documento
// ---------------------------------------------------------------
export async function updateDocumentStatus(
  docId: string,
  newStatus: string,
  // Param `table` mantenido por compat — ignorado. Siempre escribe a tt_documents.
  _table?: 'tt_quotes' | 'tt_documents' | 'tt_sales_orders' | 'tt_delivery_notes' | 'tt_invoices'
): Promise<void> {
  void _table
  const supabase = createClient()
  const updateData: Row = { status: newStatus }
  if (newStatus === 'closed' || newStatus === 'rejected') {
    updateData.closed_at = new Date().toISOString()
  }
  const { error } = await supabase.from('tt_documents').update(updateData).eq('id', docId)
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
  // Param `source` mantenido por compat — ignorado.
  _source?: 'local' | 'tt_documents',
  supabaseClient?: ReturnType<typeof createClient>
): Promise<{ orderId: string; orderNumber: string }> {
  void _source
  const supabase = supabaseClient ?? createClient()

  // Idempotencia: si ya existe un pedido con metadata.quote_id = quoteId,
  // devolverlo en lugar de crear duplicado.
  const { data: existingOrder } = await supabase
    .from('tt_documents')
    .select('id, system_code, display_ref')
    .eq('doc_type', 'pedido')
    .contains('metadata', { quote_id: quoteId })
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()
  if (existingOrder?.id) {
    return {
      orderId: existingOrder.id as string,
      orderNumber: ((existingOrder.display_ref || existingOrder.system_code) as string) || '',
    }
  }

  const orderNumber = await generateDocNumber('PED')

  const { data: quoteData } = await supabase
    .from('tt_documents')
    .select('*')
    .eq('id', quoteId)
    .single()
  const { data: items } = await supabase
    .from('tt_document_lines')
    .select('*')
    .eq('document_id', quoteId)
    .order('sort_order')
  const quoteItems: Row[] = items || []

  if (!quoteData) throw new Error('Cotizacion no encontrada')

  // Validar condiciones comerciales del cliente (payment_terms_days + payment_method)
  const clientIdForCheck = quoteData.client_id as string | null
  if (clientIdForCheck) {
    const { data: clientCheck } = await supabase
      .from('tt_clients')
      .select('payment_terms_days, payment_method, name')
      .eq('id', clientIdForCheck)
      .single()
    if (!clientCheck) throw new Error('Cliente de la cotizacion no encontrado')
    if (clientCheck.payment_terms_days == null || !clientCheck.payment_method) {
      throw new Error(
        `Cliente "${clientCheck.name}" sin condiciones comerciales. Cargá payment_terms_days y payment_method en /clientes antes de avanzar.`
      )
    }
  }

  // Get company_id estrictamente desde la cotización — NO fallback (multi-empresa).
  const companyId = quoteData.company_id as string | null
  if (!companyId) {
    throw new Error('Cotización sin company_id. No se puede generar pedido — cargá la cotización con empresa explícita.')
  }

  // Crear pedido en tt_documents
  const { data: order, error } = await supabase
    .from('tt_documents')
    .insert({
      doc_type: 'pedido',
      system_code: orderNumber,
      display_ref: orderNumber,
      company_id: companyId,
      client_id: quoteData.client_id || null,
      currency: (quoteData.currency as string) || 'EUR',
      status: 'confirmado',
      subtotal: (quoteData.subtotal as number) || 0,
      tax_amount: (quoteData.tax_amount as number) || 0,
      total: (quoteData.total as number) || 0,
      notes: (quoteData.notes as string) || '',
      metadata: { quote_id: quoteId },
    })
    .select()
    .single()

  if (error || !order) throw error || new Error('Error creando pedido')

  // Copiar items a tt_document_lines
  const docLines = quoteItems.map((item, idx) => ({
    document_id: order.id,
    product_id: item.product_id || null,
    description: (item.description as string) || '',
    sku: (item.sku as string) || '',
    quantity: (item.quantity as number) || 0,
    unit_price: (item.unit_price as number) || 0,
    discount_pct: (item.discount_pct as number) || 0,
    subtotal: (item.subtotal as number) || 0,
    sort_order: idx,
  }))

  let insertedLines: Row[] = []
  if (docLines.length > 0) {
    const { data: ins, error: insErr } = await supabase
      .from('tt_document_lines')
      .insert(docLines)
      .select()
    if (insErr) throw insErr
    insertedLines = ins || []
  }

  // Vincular pedido ↔ cotización
  await supabase.from('tt_document_relations').insert({
    parent_id: quoteId, child_id: order.id, relation_type: 'quote_to_order',
  })

  // ---------------------------------------------------------------
  // Reserva de stock: para cada item con product_id, registrar movimiento
  // 'reserve' y aumentar tt_stock.reserved.
  // ---------------------------------------------------------------
  if (insertedLines.length > 0 && companyId) {
    const { data: whs } = await supabase
      .from('tt_warehouses')
      .select('id')
      .eq('company_id', companyId)
      .eq('active', true)
      .order('created_at', { ascending: true })
      .limit(1)
    const primaryWarehouseId = (whs?.[0]?.id as string) || null

    if (primaryWarehouseId) {
      for (const it of insertedLines) {
        const productId = it.product_id as string | null
        const qty = (it.quantity as number) || 0
        if (!productId || qty <= 0) continue

        await supabase.from('tt_stock_movements').insert({
          product_id: productId,
          warehouse_id: primaryWarehouseId,
          movement_type: 'reserve',
          quantity: qty,
          document_id: order.id as string,
          document_item_id: it.id as string,
          reference: `Reserva por pedido ${orderNumber}`,
        })

        const { data: stockRow } = await supabase
          .from('tt_stock')
          .select('id, reserved, quantity')
          .eq('product_id', productId)
          .eq('warehouse_id', primaryWarehouseId)
          .maybeSingle()
        if (stockRow) {
          await supabase
            .from('tt_stock')
            .update({ reserved: ((stockRow.reserved as number) || 0) + qty })
            .eq('id', stockRow.id as string)
        } else {
          await supabase.from('tt_stock').insert({
            product_id: productId,
            warehouse_id: primaryWarehouseId,
            quantity: 0,
            reserved: qty,
          })
        }
      }
    }
  }

  // Cerrar la cotizacion
  await supabase.from('tt_documents').update({ status: 'closed' }).eq('id', quoteId)

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
  _source?: 'local' | 'tt_documents'
): Promise<{ deliveryNoteId: string; deliveryNoteNumber: string }> {
  void _source
  const supabase = createClient()
  const dnNumber = await generateDocNumber('REM')

  const { data: orderData } = await supabase
    .from('tt_documents')
    .select('*')
    .eq('id', orderId)
    .single()

  if (!orderData) throw new Error('Pedido no encontrado')

  const totalDelivered = items.reduce((sum, it) => sum + it.toDeliver, 0)
  if (totalDelivered === 0) throw new Error('Selecciona al menos un item para entregar')

  // ---------------------------------------------------------------
  // Pre-validacion de stock + lookup de product_ids
  // ---------------------------------------------------------------
  const companyId = orderData.company_id as string | null
  let primaryWarehouseId: string | null = null
  if (companyId) {
    const { data: whs } = await supabase
      .from('tt_warehouses')
      .select('id')
      .eq('company_id', companyId)
      .eq('active', true)
      .order('created_at', { ascending: true })
      .limit(1)
    primaryWarehouseId = (whs?.[0]?.id as string) || null
  }

  const lineIds = items.filter((it) => it.toDeliver > 0).map((it) => it.id)
  const lineInfo = new Map<string, { product_id: string | null; quantity: number; qty_delivered: number }>()
  if (lineIds.length > 0) {
    const { data: linesRows } = await supabase
      .from('tt_document_lines')
      .select('id, product_id, quantity, qty_delivered')
      .in('id', lineIds)
    for (const r of (linesRows || []) as Row[]) {
      lineInfo.set(r.id as string, {
        product_id: (r.product_id as string) || null,
        quantity: (r.quantity as number) || 0,
        qty_delivered: (r.qty_delivered as number) || 0,
      })
    }
  }

  if (primaryWarehouseId) {
    for (const item of items) {
      if (item.toDeliver <= 0) continue
      const info = lineInfo.get(item.id)
      const productId = info?.product_id || null
      if (!productId) continue
      const { data: stockRow } = await supabase
        .from('tt_stock')
        .select('quantity, reserved')
        .eq('product_id', productId)
        .eq('warehouse_id', primaryWarehouseId)
        .maybeSingle()
      const onHand = (stockRow?.quantity as number) || 0
      const reserved = (stockRow?.reserved as number) || 0
      const reservedByThisOrder = Math.max(0, (info?.quantity || 0) - (info?.qty_delivered || 0))
      const available = onHand - reserved + reservedByThisOrder
      if (available < item.toDeliver) {
        throw new Error(
          `Stock insuficiente para entregar ${item.toDeliver} de "${item.description}". Disponible: ${available}.`
        )
      }
    }
  }

  // Crear remito en tt_documents
  const { data: dn, error } = await supabase
    .from('tt_documents')
    .insert({
      doc_type: 'albaran',
      system_code: dnNumber,
      display_ref: dnNumber,
      company_id: orderData.company_id || null,
      client_id: orderData.client_id,
      status: 'pending',
      total: (orderData.total as number) || 0,
      metadata: { sales_order_id: orderId },
    })
    .select()
    .single()

  if (error || !dn) throw error || new Error('Error creando remito')

  // Crear líneas del remito + actualizar qty_delivered en líneas del pedido
  for (const item of items) {
    if (item.toDeliver > 0) {
      const { data: dnLine } = await supabase
        .from('tt_document_lines')
        .insert({
          document_id: dn.id,
          description: item.description,
          quantity: item.toDeliver,
          qty_delivered: item.toDeliver,
          metadata: { source_line_id: item.id },
        })
        .select()
        .single()
      await supabase
        .from('tt_document_lines')
        .update({ qty_delivered: item.delivered + item.toDeliver })
        .eq('id', item.id)

      // Movimiento de egress + descuento de stock + liberacion de reserva
      const info = lineInfo.get(item.id)
      const productId = info?.product_id || null
      if (primaryWarehouseId && productId) {
        await supabase.from('tt_stock_movements').insert({
          product_id: productId,
          warehouse_id: primaryWarehouseId,
          movement_type: 'egress',
          quantity: item.toDeliver,
          document_id: dn.id as string,
          document_item_id: (dnLine?.id as string) || null,
          reference: `Egreso por remito ${dnNumber}`,
        })

        const { data: stockRow } = await supabase
          .from('tt_stock')
          .select('id, quantity, reserved')
          .eq('product_id', productId)
          .eq('warehouse_id', primaryWarehouseId)
          .maybeSingle()
        if (stockRow) {
          const newQty = ((stockRow.quantity as number) || 0) - item.toDeliver
          const newReserved = Math.max(0, ((stockRow.reserved as number) || 0) - item.toDeliver)
          await supabase
            .from('tt_stock')
            .update({ quantity: newQty, reserved: newReserved })
            .eq('id', stockRow.id as string)
        }
      }
    }
  }

  // Vincular albarán ↔ pedido
  await supabase.from('tt_document_relations').insert({
    parent_id: orderId, child_id: dn.id, relation_type: 'order_to_delivery',
  })

  // Verificar si todo fue entregado
  const { data: linesCheck } = await supabase
    .from('tt_document_lines')
    .select('quantity, qty_delivered')
    .eq('document_id', orderId)

  const allDelivered = (linesCheck || []).every(
    (it: Row) => ((it.qty_delivered as number) || 0) >= ((it.quantity as number) || 0)
  )

  await supabase
    .from('tt_documents')
    .update({ status: allDelivered ? 'fully_delivered' : 'partially_delivered' })
    .eq('id', orderId)

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
  _source?: 'local' | 'tt_documents'
): Promise<{ invoiceId: string; invoiceNumber: string }> {
  void _source
  const supabase = createClient()
  const invNumber = await generateDocNumber('FAC')

  const { data: dnData } = await supabase
    .from('tt_documents')
    .select('*')
    .eq('id', deliveryNoteId)
    .single()

  if (!dnData) throw new Error('Albaran no encontrado')

  // Validar condiciones comerciales del cliente
  const clientIdForCheck = dnData.client_id as string | null
  if (clientIdForCheck) {
    const { data: clientCheck } = await supabase
      .from('tt_clients')
      .select('payment_terms_days, payment_method, name')
      .eq('id', clientIdForCheck)
      .single()
    if (!clientCheck) throw new Error('Cliente del albaran no encontrado')
    if (clientCheck.payment_terms_days == null || !clientCheck.payment_method) {
      throw new Error(
        `Cliente "${clientCheck.name}" sin condiciones comerciales. Cargá payment_terms_days y payment_method en /clientes antes de avanzar.`
      )
    }
  }

  // Buscar el pedido original via tt_document_relations o metadata.sales_order_id
  let orderData: Row | null = null
  const metadata = (dnData.metadata as Row) || {}
  const soId = (metadata.sales_order_id as string | null) || null
  if (soId) {
    const { data } = await supabase.from('tt_documents').select('*').eq('id', soId).single()
    orderData = data
  }

  const total = (orderData?.total as number) || (dnData.total as number) || 0
  const subtotal = (orderData?.subtotal as number) || total
  const taxAmount = (orderData?.tax_amount as number) || 0

  // Crear factura en tt_documents
  const { data: inv, error } = await supabase
    .from('tt_documents')
    .insert({
      doc_type: 'factura',
      system_code: invNumber,
      display_ref: invNumber,
      company_id: dnData.company_id || null,
      client_id: dnData.client_id,
      status: 'draft',
      currency: (orderData?.currency as string) || 'EUR',
      subtotal,
      tax_amount: taxAmount,
      total,
      metadata: { sales_order_id: soId, delivery_note_id: deliveryNoteId },
    })
    .select()
    .single()

  if (error || !inv) throw error || new Error('Error creando factura')

  // Vincular factura ↔ albarán
  await supabase.from('tt_document_relations').insert({
    parent_id: deliveryNoteId, child_id: inv.id, relation_type: 'delivery_to_invoice',
  })

  // Cerrar albaran
  await supabase.from('tt_documents').update({ status: 'closed' }).eq('id', deliveryNoteId)

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
  _source?: 'local' | 'tt_documents'
): Promise<{ invoiceId: string; invoiceNumber: string }> {
  void _source
  const supabase = createClient()
  const invNumber = await generateDocNumber('FAC')

  const { data: orderData } = await supabase
    .from('tt_documents')
    .select('*')
    .eq('id', orderId)
    .single()

  if (!orderData) throw new Error('Pedido no encontrado')

  const { data: inv, error } = await supabase
    .from('tt_documents')
    .insert({
      doc_type: 'factura',
      system_code: invNumber,
      display_ref: invNumber,
      company_id: orderData.company_id || null,
      client_id: orderData.client_id,
      status: 'draft',
      currency: (orderData.currency as string) || 'EUR',
      subtotal: (orderData.subtotal as number) || 0,
      tax_amount: (orderData.tax_amount as number) || 0,
      total: (orderData.total as number) || 0,
      metadata: { sales_order_id: orderId },
    })
    .select()
    .single()

  if (error || !inv) throw error || new Error('Error creando factura')

  // Vincular factura ↔ pedido
  await supabase.from('tt_document_relations').insert({
    parent_id: orderId, child_id: inv.id, relation_type: 'order_to_invoice',
  })

  await supabase.from('tt_documents').update({ status: 'fully_invoiced' }).eq('id', orderId)

  await supabase.from('tt_activity_log').insert({
    entity_type: 'document',
    entity_id: inv.id as string,
    action: 'created',
    detail: `Factura ${invNumber} generada directamente desde pedido`,
  })

  return { invoiceId: inv.id as string, invoiceNumber: invNumber }
}

// ---------------------------------------------------------------
// Registrar cobro/pago — siempre contra tt_documents (factura)
// ---------------------------------------------------------------
export async function registerPayment(
  invoiceId: string,
  amount: number,
  method: string,
  reference: string,
  paymentDate?: string
): Promise<{ paymentId: string }> {
  const supabase = createClient()

  const { data: inv } = await supabase
    .from('tt_documents')
    .select('total, status')
    .eq('id', invoiceId)
    .single()
  if (!inv) throw new Error('Factura no encontrada')

  const { data: payment, error } = await supabase
    .from('tt_payments')
    .insert({
      invoice_id: invoiceId,
      amount,
      payment_method: method,
      bank_reference: reference || null,
      payment_date: paymentDate || new Date().toISOString().split('T')[0],
    })
    .select()
    .single()

  if (error || !payment) throw error || new Error('Error registrando cobro')

  // Verificar si esta totalmente cobrada
  const { data: payments } = await supabase
    .from('tt_payments')
    .select('amount')
    .eq('invoice_id', invoiceId)

  const totalPaid = (payments || []).reduce((sum: number, p: Row) => sum + ((p.amount as number) || 0), 0)
  const invTotal = (inv.total as number) || 0
  const fullyPaid = totalPaid >= invTotal - 0.01

  await supabase
    .from('tt_documents')
    .update({
      status: fullyPaid ? 'paid' : 'partial',
      paid_amount: totalPaid,
      payment_count: payments?.length || 0,
    })
    .eq('id', invoiceId)

  await supabase.from('tt_activity_log').insert({
    entity_type: 'document',
    entity_id: invoiceId,
    action: 'payment_registered',
    detail: `Cobro de ${amount} registrado via ${method}${fullyPaid ? ' - Factura cobrada' : ''}`,
  })

  return { paymentId: payment.id as string }
}
