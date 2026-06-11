import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { getAdminClient } from '@/lib/supabase/admin'
import { requireAuth, userHasCompanyAccess } from '@/lib/auth/require-admin'
import { userHasRbacPermission } from '@/lib/auth/rbac-server'
import { getValidAccessToken, readMlChannelConfig, fetchAllMlItemIds, fetchMlItemsByIds, ML_MULTIGET_CHUNK, type MlListing } from '@/lib/channels/mercadolibre'

export const runtime = 'nodejs'
// Traer todo el catálogo de ML + multiget puede tardar; el upsert es incremental
// (cada tanda se guarda) así que un corte no pierde lo previo, pero damos margen.
export const maxDuration = 300

// Multigets resueltos en paralelo por tanda antes de cada upsert.
const PARALLEL_MULTIGETS = 5

const bodySchema = z.object({ channel_id: z.string().uuid() })

/**
 * POST /api/channels/mercadolibre/sync-listings — espeja TODAS las
 * publicaciones de ML del canal en tt_channel_listings (upsert por
 * channel_id+external_id). Auto-vincula product_id por SKU contra el catálogo
 * global (tt_products.sku). Requiere manage_channels + acceso a la empresa.
 */
export async function POST(req: NextRequest) {
  const auth = await requireAuth()
  if (!auth.ok) return auth.response

  let body: unknown
  try { body = await req.json() } catch { return NextResponse.json({ error: 'JSON inválido' }, { status: 400 }) }
  const parsed = bodySchema.safeParse(body)
  if (!parsed.success) return NextResponse.json({ error: 'Falta channel_id' }, { status: 400 })

  const admin = getAdminClient()
  const allowed = await userHasRbacPermission(admin, auth.ttUserId, auth.role, 'manage_channels')
  if (!allowed) return NextResponse.json({ error: 'Falta el permiso manage_channels' }, { status: 403 })

  const { data: channel } = await admin
    .from('tt_channels')
    .select('id, company_id, code, enabled')
    .eq('id', parsed.data.channel_id)
    .maybeSingle()
  if (!channel || channel.code !== 'mercadolibre') {
    return NextResponse.json({ error: 'Canal de MercadoLibre no encontrado' }, { status: 404 })
  }
  if (!channel.enabled) return NextResponse.json({ error: 'El canal está deshabilitado' }, { status: 409 })

  const canAccess = await userHasCompanyAccess(auth.ttUserId, auth.role, channel.company_id as string)
  if (!canAccess) return NextResponse.json({ error: 'Sin acceso a esa empresa' }, { status: 403 })

  const stored = await readMlChannelConfig(admin, channel.id as string)
  const token = await getValidAccessToken(admin, channel.id as string)
  if (!token || !stored) {
    return NextResponse.json({ error: 'El canal no está conectado a MercadoLibre. Conectalo primero.' }, { status: 409 })
  }

  // 1) Todos los IDs primero (scan rápido). Si falla acá, no guardamos nada.
  let ids: string[]
  try {
    ids = await fetchAllMlItemIds(token, stored.ml_user_id)
  } catch (e) {
    return NextResponse.json({ error: `MercadoLibre no respondió: ${(e as Error).message}` }, { status: 502 })
  }

  // 2) Resolver detalle + upsert POR TANDA (incremental): un corte/timeout deja
  // lo ya procesado guardado, y el próximo sync (idempotente) completa el resto.
  const now = new Date().toISOString()
  let synced = 0
  let matched = 0
  const STEP = ML_MULTIGET_CHUNK * PARALLEL_MULTIGETS

  for (let i = 0; i < ids.length; i += STEP) {
    const groups: Promise<MlListing[]>[] = []
    for (let j = 0; j < PARALLEL_MULTIGETS; j++) {
      const slice = ids.slice(i + j * ML_MULTIGET_CHUNK, i + (j + 1) * ML_MULTIGET_CHUNK)
      if (slice.length) groups.push(fetchMlItemsByIds(token, slice))
    }
    let batch: MlListing[]
    try {
      batch = (await Promise.all(groups)).flat()
    } catch (e) {
      // Falla transitoria de ML a mitad: cortamos pero devolvemos lo ya guardado.
      return NextResponse.json({ success: false, partial: true, synced, matched_by_sku: matched, error: `MercadoLibre falló a mitad del sync: ${(e as Error).message}` }, { status: 502 })
    }
    if (batch.length === 0) continue

    // Auto-vínculo por SKU contra el catálogo global (tt_products no tiene company_id).
    const skus = [...new Set(batch.map(l => l.sku).filter((s): s is string => !!s))]
    const skuToProduct = new Map<string, string>()
    if (skus.length > 0) {
      const { data: products } = await admin.from('tt_products').select('id, sku').in('sku', skus)
      for (const p of products ?? []) if (p.sku) skuToProduct.set(p.sku as string, p.id as string)
    }

    const rows = batch.map(l => ({
      channel_id: channel.id,
      company_id: channel.company_id,
      product_id: l.sku ? (skuToProduct.get(l.sku) ?? null) : null,
      external_id: l.external_id,
      title: l.title,
      price: l.price,
      currency: l.currency,
      stock_published: l.stock_published,
      status: l.status,
      last_sync_at: now,
      sync_error: null,
      updated_at: now,
    }))

    const { error } = await admin.from('tt_channel_listings').upsert(rows, { onConflict: 'channel_id,external_id' })
    if (error) return NextResponse.json({ success: false, partial: synced > 0, error: `No se pudieron guardar las publicaciones: ${error.message}`, synced, matched_by_sku: matched }, { status: 500 })
    synced += rows.length
    matched += rows.filter(r => r.product_id !== null).length
  }

  return NextResponse.json({ success: true, synced, matched_by_sku: matched, last_sync_at: now })
}
