import { NextRequest, NextResponse } from 'next/server'
import { getAdminClient } from '@/lib/supabase/admin'
import { requireAuth, userHasCompanyAccess } from '@/lib/auth/require-admin'
import { userHasRbacPermission } from '@/lib/auth/rbac-server'

export const runtime = 'nodejs'

const ORDER_COLS = 'id, channel_id, company_id, external_order_id, total, currency, status, received_at, document_id, buyer, document:tt_documents(system_code)'
const LISTING_COLS = 'id, channel_id, company_id, title, price, currency, stock_published, status, last_sync_at, sync_error, product:tt_products(sku)'

/**
 * GET /api/channels?company_id=a,b&include=orders,unsettled,listings&since=ISO
 *
 * Lecturas del módulo Canales para la(s) empresa(s) activa(s) del selector.
 * Va por admin client porque la RLS de tt_channels/tt_channel_* es
 * company-scoped vía current_company_id() (la empresa DEFAULT del usuario),
 * y el selector de empresa activa vive en el cliente: desde el browser un
 * usuario con varias empresas quedaría clavado a la default. Acá el acceso
 * se valida explícitamente por empresa + permiso view_channels.
 */
export async function GET(req: NextRequest) {
  const auth = await requireAuth()
  if (!auth.ok) return auth.response
  const admin = getAdminClient()

  // Condición A del gating §1, revalidada server-side
  const allowed = await userHasRbacPermission(admin, auth.ttUserId, auth.role, 'view_channels')
  if (!allowed) return NextResponse.json({ error: 'Falta el permiso view_channels' }, { status: 403 })

  const { searchParams } = new URL(req.url)
  const companyIds = (searchParams.get('company_id') ?? '')
    .split(',').map(s => s.trim()).filter(Boolean)
  if (companyIds.length === 0) {
    return NextResponse.json({ error: 'company_id requerido' }, { status: 400 })
  }
  for (const companyId of companyIds) {
    const canAccess = await userHasCompanyAccess(auth.ttUserId, auth.role, companyId)
    if (!canAccess) return NextResponse.json({ error: 'Sin acceso a esa empresa' }, { status: 403 })
  }

  const include = new Set((searchParams.get('include') ?? '').split(',').map(s => s.trim()).filter(Boolean))
  const since = searchParams.get('since')

  const { data: channels, error: chErr } = await admin
    .from('tt_channels')
    .select('id, company_id, code, label, status, last_sync_at')
    .in('company_id', companyIds)
    .eq('enabled', true)
    .order('label')
  if (chErr) return NextResponse.json({ error: chErr.message }, { status: 500 })

  const payload: Record<string, unknown> = { channels: channels ?? [] }

  if (include.has('orders')) {
    let q = admin.from('tt_channel_orders').select(ORDER_COLS)
      .in('company_id', companyIds)
      .order('received_at', { ascending: false })
      .limit(500)
    if (since) q = q.gte('received_at', since)
    const { data, error } = await q
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    payload.orders = data ?? []
  }

  if (include.has('unsettled')) {
    // Sin liquidar: no cancelada y sin documento nativo (ver lib/dashboard/executive-kpis)
    const { data, error } = await admin.from('tt_channel_orders').select(ORDER_COLS)
      .in('company_id', companyIds)
      .neq('status', 'cancelled')
      .is('document_id', null)
      .limit(1000)
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    payload.unsettled = data ?? []
  }

  if (include.has('listings')) {
    const { data, error } = await admin.from('tt_channel_listings').select(LISTING_COLS)
      .in('company_id', companyIds)
      .order('updated_at', { ascending: false })
      .limit(200)
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    payload.listings = data ?? []
  }

  return NextResponse.json(payload)
}
