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
      .select('number')
      .like('number', pattern)
      .order('number', { ascending: false })
      .limit(1)
    if (localSO?.[0]) {
      const m = (localSO[0].number as string).match(/(\d+)$/)
      if (m) maxNum = Math.max(maxNum, parseInt(m[1]))
    }
  }

  // Para REM, tambien chequear tt_delivery_notes
  if (prefix === 'REM') {
    const { data: localDN } = await supabase
      .from('tt_delivery_notes')
      .select('number')
      .like('number', pattern)
      .order('number', { ascending: false })
      .limit(1)
    if (localDN?.[0]) {
      const m = (localDN[0].number as string).match(/(\d+)$/)
      if (m) maxNum = Math.max(maxNum, parseInt(m[1]))
    }
  }

  // Para FAC, tambien chequear tt_invoices
  if (prefix === 'FAC') {
    const { data: localInv } = await supabase
      .from('tt_invoices')
      .select('number')
      .like('number', pattern)
      .order('number', { ascending: false })
      .limit(1)
    if (localInv?.[0]) {
      const m = (localInv[0].number as string).match(/(\d+)$/)
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
  source: 'local' | 'tt_documents',
  // Cliente Supabase opcional. Para llamadas desde API routes pasar el server client
  // (con cookies del user) para respetar RLS. Si no se pasa, usa el client del browser.
  supabaseClient?: ReturnType<typeof createClient>
): Promise<{ orderId: string; orderNumber: string }> {
  const supabase = supabaseClient ?? createClient()

  // Idempotencia: si ya existe un pedido con este quote_id, devolvemos ese
  // en lugar de crear un duplicado. Esto previene que doble-click o
  // re-clicks accidentales generen pedidos PED-XXX duplicados.
  const { data: existingOrder } = await supabase
    .from('tt_sales_orders')
    .select('id, number')
    .eq('quote_id', quoteId)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()
  if (existingOrder?.id) {
    return {
      orderId: existingOrder.id as string,
      orderNumber: (existingOrder.number as string) || '',
    }
  }

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

  let insertedSoItems: Row[] = []
  if (soItems.length > 0) {
    const { data: ins, error: insErr } = await supabase
      .from('tt_so_items')
      .insert(soItems)
      .select()
    if (insErr) throw insErr
    insertedSoItems = ins || []
  }

  // ---------------------------------------------------------------
  // Reserva de stock: para cada item con product_id, registrar movimiento
  // 'reserve' y aumentar tt_stock.reserved.
  // ---------------------------------------------------------------
  if (insertedSoItems.length > 0 && companyId) {
    // Buscar warehouse primario de la company (primer activo)
    const { data: whs } = await supabase
      .from('tt_warehouses')
      .select('id')
      .eq('company_id', companyId)
      .eq('active', true)
      .order('created_at', { ascending: true })
      .limit(1)
    const primaryWarehouseId = (whs?.[0]?.id as string) || null

    if (primaryWarehouseId) {
      for (const it of insertedSoItems) {
        const productId = it.product_id as string | null
        const qty = (it.qty_ordered as number) || 0
        if (!productId || qty <= 0) continue

        // Insertar movimiento de reserva
        await supabase.from('tt_stock_movements').insert({
          product_id: productId,
          warehouse_id: primaryWarehouseId,
          movement_type: 'reserve',
          quantity: qty,
          document_id: order.id as string,
          document_item_id: it.id as string,
          reference: `Reserva por pedido ${orderNumber}`,
        })

        // Actualizar tt_stock.reserved (crear fila si no existe)
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
  /**
   * Números de serie de las unidades físicas que se están entregando en
   * esta línea (solo para productos con series cargadas en tt_product_serials).
   * Al entregar, cada serie pasa a ser activo del cliente con garantía de
   * 12 meses — ver assignSerialsToClient().
   */
  serialNumbers?: string[]
}

const WARRANTY_MONTHS = 12

/**
 * Al entregar unidades con serie, las pasa de "en_stock/interno" a
 * "vendido/cliente" y les carga warranty_until = hoy + 12 meses.
 * Series que no coincidan con una fila en_stock del producto se ignoran
 * (no rompe la entrega — la asociación de serie es best-effort).
 */
async function assignSerialsToClient(
  supabase: ReturnType<typeof createClient>,
  productId: string,
  clientId: string | null,
  serialNumbers: string[]
): Promise<void> {
  if (!clientId || serialNumbers.length === 0) return
  const warrantyUntil = new Date()
  warrantyUntil.setMonth(warrantyUntil.getMonth() + WARRANTY_MONTHS)

  for (const sn of serialNumbers) {
    const clean = sn.trim()
    if (!clean) continue
    await supabase
      .from('tt_product_serials')
      .update({
        status: 'vendido',
        current_owner_type: 'cliente',
        current_owner_id: clientId,
        warranty_until: warrantyUntil.toISOString().slice(0, 10),
      })
      .eq('product_id', productId)
      .eq('serial_number', clean)
  }
}

export async function orderToDeliveryNote(
  orderId: string,
  items: DeliveryItem[],
  source: 'local' | 'tt_documents'
): Promise<{ deliveryNoteId: string; deliveryNoteNumber: string }> {
  const supabase = createClient()

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

  // ---------------------------------------------------------------
  // Pre-validacion de stock: para cada item con product_id, verificar
  // que (quantity - reserved + reservado_por_este_pedido) >= toDeliver.
  // El stock reservado por ESTE pedido cuenta como disponible para entregar.
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

  // Cargar info de las líneas de origen para conocer product_id/sku/precio.
  // IMPORTANTE: cuando source==='tt_documents', `items[].id` son ids de
  // tt_document_lines, NO de tt_so_items (esa era la causa de que el stock
  // nunca se descontara y de que "entregado" siempre diera vacío para
  // pedidos del modelo nuevo — ver auditoría 2026-08-01).
  const lineIds = items.filter((it) => it.toDeliver > 0).map((it) => it.id)
  const lineInfo = new Map<string, { product_id: string | null; sku: string | null; unit_price: number; qty_ordered: number; qty_delivered: number }>()
  if (lineIds.length > 0) {
    if (source === 'local') {
      const { data: soRows } = await supabase
        .from('tt_so_items')
        .select('id, product_id, sku, unit_price, qty_ordered, qty_delivered')
        .in('id', lineIds)
      for (const r of (soRows || []) as Row[]) {
        lineInfo.set(r.id as string, {
          product_id: (r.product_id as string) || null,
          sku: (r.sku as string) || null,
          unit_price: (r.unit_price as number) || 0,
          qty_ordered: (r.qty_ordered as number) || 0,
          qty_delivered: (r.qty_delivered as number) || 0,
        })
      }
    } else {
      const { data: docLineRows } = await supabase
        .from('tt_document_lines')
        .select('id, product_id, sku, unit_price, quantity, qty_delivered')
        .in('id', lineIds)
      for (const r of (docLineRows || []) as Row[]) {
        lineInfo.set(r.id as string, {
          product_id: (r.product_id as string) || null,
          sku: (r.sku as string) || null,
          unit_price: (r.unit_price as number) || 0,
          qty_ordered: (r.quantity as number) || 0,
          qty_delivered: (r.qty_delivered as number) || 0,
        })
      }
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
      // El stock reservado por este mismo pedido (qty_ordered - qty_delivered)
      // ya esta contado en `reserved`. Lo agregamos como disponible para entregar.
      const reservedByThisOrder = Math.max(0, (info?.qty_ordered || 0) - (info?.qty_delivered || 0))
      const available = onHand - reserved + reservedByThisOrder
      if (available < item.toDeliver) {
        throw new Error(
          `Stock insuficiente para entregar ${item.toDeliver} de "${item.description}". Disponible: ${available}.`
        )
      }
    }
  }

  // =================================================================
  // Rama legacy: pedido en tt_sales_orders -> remito en tt_delivery_notes.
  // Sin cambios de comportamiento respecto a la version anterior.
  // =================================================================
  if (source === 'local') {
    const dnNumber = await generateDocNumber('REM')
    const { data: dn, error } = await supabase
      .from('tt_delivery_notes')
      .insert({
        company_id: orderData.company_id || null,
        client_id: orderData.client_id,
        sales_order_id: orderId,
        number: dnNumber,
        status: 'pending',
        total: (orderData.total as number) || 0,
      })
      .select()
      .single()

    if (error || !dn) throw error || new Error('Error creando remito')

    for (const item of items) {
      if (item.toDeliver <= 0) continue
      const { data: dnItem } = await supabase
        .from('tt_dn_items')
        .insert({
          delivery_note_id: dn.id,
          so_item_id: item.id,
          quantity: item.toDeliver,
          description: item.description,
        })
        .select()
        .single()

      await supabase
        .from('tt_so_items')
        .update({ qty_delivered: item.delivered + item.toDeliver })
        .eq('id', item.id)

      const info = lineInfo.get(item.id)
      const productId = info?.product_id || null
      if (primaryWarehouseId && productId) {
        await supabase.from('tt_stock_movements').insert({
          product_id: productId,
          warehouse_id: primaryWarehouseId,
          movement_type: 'egress',
          quantity: item.toDeliver,
          document_id: dn.id as string,
          document_item_id: (dnItem?.id as string) || null,
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

    const { data: soItemsCheck } = await supabase
      .from('tt_so_items')
      .select('qty_ordered, quantity, qty_delivered')
      .eq('sales_order_id', orderId)

    const allDelivered = (soItemsCheck || []).length > 0 && (soItemsCheck || []).every(
      (it: Row) =>
        ((it.qty_delivered as number) || 0) >=
        ((it.qty_ordered as number) || (it.quantity as number) || 0)
    )

    await supabase
      .from('tt_sales_orders')
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

  // =================================================================
  // Rama real: pedido en tt_documents -> remito tambien en tt_documents
  // (doc_type='albaran'), con sus lineas en tt_document_lines y el link
  // pedido->albaran en tt_document_relations (la tabla que lee toda la app).
  // =================================================================
  const albCode = `ALB-${Date.now()}`
  const albTotal = items.reduce((sum, it) => {
    if (it.toDeliver <= 0) return sum
    const info = lineInfo.get(it.id)
    return sum + it.toDeliver * (info?.unit_price || 0)
  }, 0)

  const { data: albaran, error: albErr } = await supabase
    .from('tt_documents')
    .insert({
      doc_type: 'albaran',
      system_code: albCode,
      client_id: orderData.client_id,
      company_id: companyId,
      currency: (orderData.currency as string) || 'ARS',
      total: albTotal,
      status: 'pending',
      metadata: { source_order_id: orderId },
    })
    .select('id, system_code')
    .single()

  if (albErr || !albaran) throw albErr || new Error('Error creando remito')

  let sortOrder = 0
  for (const item of items) {
    if (item.toDeliver <= 0) continue
    const info = lineInfo.get(item.id)
    sortOrder += 1

    await supabase.from('tt_document_lines').insert({
      document_id: albaran.id,
      sort_order: sortOrder,
      sku: info?.sku || null,
      description: item.description,
      quantity: item.toDeliver,
      unit_price: info?.unit_price || 0,
      subtotal: item.toDeliver * (info?.unit_price || 0),
      product_id: info?.product_id || null,
    })

    // Actualizar qty_delivered en la linea de origen del pedido (tt_document_lines)
    await supabase
      .from('tt_document_lines')
      .update({ qty_delivered: (info?.qty_delivered || 0) + item.toDeliver })
      .eq('id', item.id)

    const productId = info?.product_id || null
    if (productId) {
      // Consume la reserva activa de este pedido (si la hubiera) y descuenta stock
      await supabase.rpc('consume_stock_for_delivery', {
        p_source_document_id: orderId,
        p_items: [{ product_id: productId, quantity: item.toDeliver }],
      })
      if (primaryWarehouseId) {
        await supabase.from('tt_stock_movements').insert({
          product_id: productId,
          warehouse_id: primaryWarehouseId,
          movement_type: 'egress',
          quantity: item.toDeliver,
          document_id: albaran.id as string,
          reference: `Egreso por remito ${albCode}`,
        })
      }
      if (item.serialNumbers?.length) {
        await assignSerialsToClient(supabase, productId, (orderData.client_id as string) || null, item.serialNumbers)
      }
    }
  }

  // Link pedido -> albaran (misma tabla que usa el resto de la app)
  await supabase.from('tt_document_relations').insert({
    parent_id: orderId,
    child_id: albaran.id,
    relation_type: 'entrega',
  })

  // Verificar si todo el pedido fue entregado, releyendo las lineas reales
  const { data: linesCheck } = await supabase
    .from('tt_document_lines')
    .select('quantity, qty_delivered')
    .eq('document_id', orderId)

  const allDelivered = (linesCheck || []).length > 0 && (linesCheck || []).every(
    (l: Row) => ((l.qty_delivered as number) || 0) >= ((l.quantity as number) || 0)
  )

  await supabase
    .from('tt_documents')
    .update({ status: allDelivered ? 'fully_delivered' : 'partially_delivered' })
    .eq('id', orderId)

  await supabase.from('tt_document_events').insert([
    {
      document_id: albaran.id,
      event_type: 'created',
      payload: { source_order_id: orderId, items_count: items.filter((i) => i.toDeliver > 0).length },
      notes: 'Remito generado desde pedido',
    },
    {
      document_id: orderId,
      event_type: 'derived_out',
      related_document_id: albaran.id,
      payload: { relation_type: 'entrega', to_doc_id: albaran.id },
      notes: `Pedido entregado (parcial o total) mediante remito ${albaran.system_code}`,
    },
  ]).then(() => {}, (e) => {
    console.error('[orderToDeliveryNote] addEvent failed:', e)
  })

  return { deliveryNoteId: albaran.id as string, deliveryNoteNumber: albaran.system_code as string }
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

  // Validar condiciones comerciales del cliente (payment_terms_days + payment_method)
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
      number: invNumber,
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
      number: invNumber,
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
