import { NextRequest, NextResponse } from 'next/server'
import { getAdminClient } from '@/lib/supabase/admin'
import { requireAuth, userHasCompanyAccess } from '@/lib/auth/require-admin'
import { addEvent } from '@/lib/documents/engine'
import { orderToDocumentLines, type ParsedOrderItem } from '@/lib/channels/order-lines'
import { userHasRbacPermission } from '@/lib/auth/rbac-server'

export const runtime = 'nodejs'

type Ctx = { params: Promise<{ id: string }> }

function buyerNameOf(buyer: unknown): string {
  if (buyer && typeof buyer === 'object') {
    const b = buyer as Record<string, unknown>
    for (const key of ['name', 'nickname', 'full_name']) {
      const v = b[key]
      if (typeof v === 'string' && v.length > 0) return v
    }
  }
  return 'Comprador de canal'
}

/**
 * POST /api/channel-orders/:id/create-document — spec §3.2.
 *
 * Convierte una orden de canal en un pedido nativo replicando el flujo
 * EXISTENTE de /api/oc/convert-to-order (el que corre contra el esquema
 * real de producción: system_code `PED-{timestamp}`, líneas con
 * sort_order/sku/description, eventos de trazabilidad):
 *   1. tt_documents draft (doc_type 'pedido') + evento 'created'
 *   2. tt_document_lines desde raw.items (o línea única con el total)
 *   3. reserve_stock_for_document (RPC, modo no estricto)
 *   4. tt_channel_orders.document_id = doc (received → reserved)
 *
 * NOTA: el "documents engine" del repo (fn_issue_document, doc_code,
 * counterparty_*) NO existe en la base de producción — verificado
 * 2026-06-10. No usar ese camino hasta que se migre.
 *
 * Requiere permiso manage_channel_orders + acceso a la empresa de la orden.
 */
export async function POST(_req: NextRequest, { params }: Ctx) {
  const auth = await requireAuth()
  if (!auth.ok) return auth.response
  const { id } = await params
  const admin = getAdminClient()

  const allowed = await userHasRbacPermission(admin, auth.ttUserId, auth.role, 'manage_channel_orders')
  if (!allowed) {
    return NextResponse.json({ error: 'Falta el permiso manage_channel_orders' }, { status: 403 })
  }

  const { data: order, error: orderErr } = await admin
    .from('tt_channel_orders')
    .select('id, company_id, channel_id, external_order_id, buyer, total, currency, status, document_id, raw, channel:tt_channels(code, label)')
    .eq('id', id)
    .maybeSingle()
  if (orderErr) return NextResponse.json({ error: orderErr.message }, { status: 500 })
  if (!order) return NextResponse.json({ error: 'Orden de canal no encontrada' }, { status: 404 })
  if (order.document_id) {
    return NextResponse.json(
      { error: 'La orden ya tiene un documento vinculado', document_id: order.document_id },
      { status: 409 },
    )
  }

  const canAccess = await userHasCompanyAccess(auth.ttUserId, auth.role, order.company_id as string)
  if (!canAccess) return NextResponse.json({ error: 'Sin acceso a esa empresa' }, { status: 403 })

  // El embed many-to-one viene como objeto en runtime, pero el client sin tipos lo infiere como array
  const channelRaw = order.channel as unknown
  const channel = (Array.isArray(channelRaw) ? channelRaw[0] ?? null : channelRaw) as { code: string; label: string } | null

  const items: ParsedOrderItem[] = orderToDocumentLines({
    raw: order.raw,
    total: order.total as number | null,
    externalOrderId: order.external_order_id as string,
    channelLabel: channel?.label ?? null,
  })
  const total = items.reduce((sum, item) => sum + item.quantity * item.unitPrice, 0)

  // 1) Pedido draft — mismo patrón que /api/oc/convert-to-order
  const systemCode = `PED-${Date.now()}`
  const { data: orderDoc, error: docErr } = await admin
    .from('tt_documents')
    .insert({
      doc_type: 'pedido',
      system_code: systemCode,
      company_id: order.company_id,
      currency: (order.currency as string | null) || 'ARS',
      total: total > 0 ? total : Number(order.total ?? 0),
      status: 'draft',
      notes: `Orden ${channel?.label ?? 'de canal'} ${order.external_order_id} · ${buyerNameOf(order.buyer)}`,
      metadata: {
        source: 'channel_order',
        channel_order_id: order.id,
        channel_id: order.channel_id,
        channel_code: channel?.code ?? null,
        external_order_id: order.external_order_id,
        buyer: order.buyer ?? null,
      },
    })
    .select('id, system_code')
    .single()
  if (docErr || !orderDoc) {
    return NextResponse.json({ error: docErr?.message ?? 'Error creando pedido' }, { status: 500 })
  }
  const documentId = orderDoc.id as string

  // 2) Líneas (sort_order/sku/description — esquema real de tt_document_lines)
  let sortOrder = 0
  for (const item of items) {
    sortOrder++
    let productId: string | null = null
    if (item.sku) {
      const { data: product } = await admin
        .from('tt_products').select('id').eq('sku', item.sku).maybeSingle()
      productId = (product?.id as string | undefined) ?? null
    }
    const { error: lineErr } = await admin.from('tt_document_lines').insert({
      document_id: documentId,
      sort_order: sortOrder,
      product_id: productId,
      sku: item.sku,
      description: item.name,
      quantity: item.quantity,
      unit_price: item.unitPrice,
      subtotal: item.quantity * item.unitPrice,
    })
    if (lineErr) {
      return NextResponse.json(
        { error: `Pedido ${systemCode} creado pero falló la línea ${sortOrder}: ${lineErr.message}`, document_id: documentId },
        { status: 500 },
      )
    }
  }

  await addEvent(admin, {
    documentId,
    eventType: 'created',
    actorId: auth.ttUserId,
    payload: {
      source: 'channel_order',
      channel: channel?.code ?? null,
      channel_order_id: order.id,
      external_order_id: order.external_order_id,
      items_count: items.length,
      total,
    },
    notes: `Pedido generado desde orden ${channel?.label ?? 'de canal'} ${order.external_order_id}`,
  })

  // 3) Reserva de stock (RPC existente en producción). Modo no estricto:
  //    el faltante se informa, no bloquea (decisión "strict" pendiente, CLAUDE.md §8)
  const { data: reserveData, error: reserveErr } = await admin.rpc('reserve_stock_for_document', {
    p_document_id: documentId,
    p_strict: false,
  })
  const reserveRows = ((reserveData ?? []) as { shortfall: number }[])
  const hasShortfall = reserveRows.some(r => Number(r.shortfall) > 0)

  // 4) Vincular la orden al documento (received → reserved, dominio v91)
  const orderPatch: Record<string, unknown> = { document_id: documentId, updated_at: new Date().toISOString() }
  if (order.status === 'received') orderPatch.status = 'reserved'
  const { error: linkErr } = await admin
    .from('tt_channel_orders').update(orderPatch).eq('id', order.id)
  if (linkErr) {
    return NextResponse.json(
      { error: `Pedido ${systemCode} creado pero no se pudo vincular la orden: ${linkErr.message}` },
      { status: 500 },
    )
  }

  await addEvent(admin, {
    documentId,
    eventType: 'channel_order_linked',
    actorId: auth.ttUserId,
    payload: {
      channel_order_id: order.id,
      external_order_id: order.external_order_id,
      channel: channel?.code ?? null,
      stock_reserved: !reserveErr,
      stock_shortfall: hasShortfall,
    },
  })

  return NextResponse.json({
    success: true,
    document_id: documentId,
    doc_code: orderDoc.system_code as string,
    stock: { reserved: !reserveErr, shortfall: hasShortfall, error: reserveErr?.message ?? null },
  }, { status: 201 })
}
