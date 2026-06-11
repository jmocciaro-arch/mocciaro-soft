import { NextRequest, NextResponse } from 'next/server'
import { getAdminClient } from '@/lib/supabase/admin'
import { requireAuth, userHasCompanyAccess } from '@/lib/auth/require-admin'
import { issueDocument, addEvent } from '@/lib/documents/engine'
import { computeLineMoney } from '@/lib/schemas/documents'
import { orderToDocumentLines, type ParsedOrderItem } from '@/lib/channels/order-lines'

export const runtime = 'nodejs'

type Ctx = { params: Promise<{ id: string }> }
type Admin = ReturnType<typeof getAdminClient>

const ADMIN_ROLES = ['admin', 'super_admin', 'superadmin']

/**
 * Chequeo RBAC server-side: rol legacy admin, o el permiso vía
 * tt_user_roles → tt_role_permissions → tt_permissions (mismo modelo que
 * src/lib/rbac.ts pero con el admin client, para usar en endpoints).
 */
async function userHasRbacPermission(admin: Admin, ttUserId: string, role: string, permission: string): Promise<boolean> {
  if (ADMIN_ROLES.includes(role)) return true
  const { data: userRoles } = await admin
    .from('tt_user_roles').select('role_id').eq('user_id', ttUserId)
  const roleIds = ((userRoles ?? []) as { role_id: string }[]).map(r => r.role_id)
  if (roleIds.length === 0) return false
  const { data } = await admin
    .from('tt_role_permissions')
    .select('permission:tt_permissions!inner(name)')
    .in('role_id', roleIds)
    .eq('permission.name', permission)
    .limit(1)
  return (data?.length ?? 0) > 0
}

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
 * Convierte una orden de canal en documento nativo usando el flujo EXISTENTE:
 *   1. tt_documents draft (doc_type sales_order) + evento 'created'
 *   2. tt_document_lines desde raw.items (o línea única con el total)
 *   3. fn_issue_document → numeración atómica por secuencias + eventos
 *   4. reserve_stock_for_document (RPC v54, modo no estricto)
 *   5. tt_channel_orders.document_id = doc (received → reserved)
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

  // Misma validación de moneda que POST /api/documents
  const currency = (order.currency as string | null) ?? 'EUR'
  const { data: cur } = await admin
    .from('tt_company_currencies')
    .select('currency_code')
    .eq('company_id', order.company_id)
    .eq('currency_code', currency)
    .maybeSingle()
  if (!cur) {
    return NextResponse.json(
      { error: `Moneda ${currency} no habilitada para la empresa. Habilitala en Admin → Empresas.` },
      { status: 400 },
    )
  }

  // El embed many-to-one viene como objeto en runtime, pero el client sin tipos lo infiere como array
  const channelRaw = order.channel as unknown
  const channel = (Array.isArray(channelRaw) ? channelRaw[0] ?? null : channelRaw) as { code: string; label: string } | null

  // 1) Draft — flujo existente de creación de documentos
  const { data: doc, error: docErr } = await admin
    .from('tt_documents')
    .insert({
      company_id: order.company_id,
      doc_type: 'sales_order',
      direction: 'sales',
      doc_date: new Date().toISOString().slice(0, 10),
      counterparty_type: 'client',
      counterparty_name: buyerNameOf(order.buyer),
      currency_code: currency,
      exchange_rate: 1,
      external_ref: order.external_order_id,
      metadata: {
        channel_order_id: order.id,
        channel_id: order.channel_id,
        channel_code: channel?.code ?? null,
      },
      status: 'draft',
      created_by: auth.ttUserId,
      updated_by: auth.ttUserId,
    })
    .select('id')
    .single()
  if (docErr || !doc) {
    return NextResponse.json({ error: docErr?.message ?? 'Error creando documento' }, { status: 500 })
  }
  const documentId = doc.id as string

  await addEvent(admin, {
    documentId,
    eventType: 'created',
    actorId: auth.ttUserId,
    toStatus: 'draft',
    payload: { doc_type: 'sales_order', direction: 'sales', source: 'channel_order', channel: channel?.code ?? null },
  })

  // 2) Líneas: items del raw, o línea única con el total de la orden
  const items: ParsedOrderItem[] = orderToDocumentLines({
    raw: order.raw,
    total: order.total as number | null,
    externalOrderId: order.external_order_id as string,
    channelLabel: channel?.label ?? null,
  })

  let lineNumber = 0
  for (const item of items) {
    lineNumber++
    let productId: string | null = null
    if (item.sku) {
      const { data: product } = await admin
        .from('tt_products').select('id').eq('sku', item.sku).maybeSingle()
      productId = (product?.id as string | undefined) ?? null
    }
    const money = computeLineMoney({
      quantity: item.quantity,
      unit_price: item.unitPrice,
      discount_pct: 0,
      discount_amount: 0,
      tax_rate: 0,
    })
    const { error: lineErr } = await admin.from('tt_document_lines').insert({
      document_id: documentId,
      line_number: lineNumber,
      product_id: productId,
      product_sku: item.sku,
      product_name: item.name,
      quantity: item.quantity,
      unit: 'u',
      unit_price: item.unitPrice,
      discount_pct: 0,
      discount_amount: money.discount_amount,
      tax_rate: 0,
      tax_amount: money.tax_amount,
      subtotal: money.subtotal,
      total: money.total,
      attributes: {},
    })
    if (lineErr) {
      return NextResponse.json({ error: `Error creando línea ${lineNumber}: ${lineErr.message}` }, { status: 500 })
    }
  }

  // 3) Emisión: numeración atómica con secuencias (fn_issue_document)
  const issued = await issueDocument({ documentId, actorId: auth.ttUserId })
  if (!issued.ok) {
    return NextResponse.json({ error: issued.error }, { status: issued.status })
  }

  // 4) Reserva de stock (RPC v54). Modo no estricto: el faltante se informa,
  //    no bloquea (decisión "strict mode" pendiente en CLAUDE.md §8).
  const { data: reserveData, error: reserveErr } = await admin.rpc('reserve_stock_for_document', {
    p_document_id: documentId,
    p_strict: false,
  })
  const reserveRows = ((reserveData ?? []) as { shortfall: number }[])
  const hasShortfall = reserveRows.some(r => Number(r.shortfall) > 0)

  // 5) Vincular la orden al documento (received → reserved, dominio v91)
  const orderPatch: Record<string, unknown> = { document_id: documentId, updated_at: new Date().toISOString() }
  if (order.status === 'received') orderPatch.status = 'reserved'
  const { error: linkErr } = await admin
    .from('tt_channel_orders').update(orderPatch).eq('id', order.id)
  if (linkErr) {
    return NextResponse.json(
      { error: `Documento ${issued.code} creado pero no se pudo vincular la orden: ${linkErr.message}` },
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
    doc_code: issued.code,
    stock: { reserved: !reserveErr, shortfall: hasShortfall, error: reserveErr?.message ?? null },
  }, { status: 201 })
}
