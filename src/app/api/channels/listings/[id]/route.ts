import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { getAdminClient } from '@/lib/supabase/admin'
import { requireAuth, userHasCompanyAccess } from '@/lib/auth/require-admin'
import { userHasRbacPermission } from '@/lib/auth/rbac-server'
import { getValidAccessToken, updateMlItem, type MlItemEdit } from '@/lib/channels/mercadolibre'

export const runtime = 'nodejs'

type Ctx = { params: Promise<{ id: string }> }

// Al menos un campo; precio/stock no negativos.
const editSchema = z.object({
  price: z.number().nonnegative().optional(),
  stock: z.number().int().nonnegative().optional(),
  status: z.enum(['active', 'paused']).optional(),
  title: z.string().trim().min(1).max(180).optional(),
}).refine(d => Object.keys(d).length > 0, { message: 'No hay cambios' })

/**
 * PATCH /api/channels/listings/:id — edita una publicación: empuja el cambio a
 * MercadoLibre (PUT /items) y recién entonces actualiza la fila local. Si ML
 * rechaza, NO se toca la base. Requiere manage_channels + acceso a la empresa.
 */
export async function PATCH(req: NextRequest, { params }: Ctx) {
  const auth = await requireAuth()
  if (!auth.ok) return auth.response
  const { id } = await params

  let raw: unknown
  try { raw = await req.json() } catch { return NextResponse.json({ error: 'JSON inválido' }, { status: 400 }) }
  const parsed = editSchema.safeParse(raw)
  if (!parsed.success) {
    return NextResponse.json({ error: 'Validación falló', issues: z.treeifyError(parsed.error) }, { status: 400 })
  }

  const admin = getAdminClient()
  const allowed = await userHasRbacPermission(admin, auth.ttUserId, auth.role, 'manage_channels')
  if (!allowed) return NextResponse.json({ error: 'Falta el permiso manage_channels' }, { status: 403 })

  const { data: listing } = await admin
    .from('tt_channel_listings')
    .select('id, channel_id, company_id, external_id, channel:tt_channels(code)')
    .eq('id', id)
    .maybeSingle()
  if (!listing) return NextResponse.json({ error: 'Publicación no encontrada' }, { status: 404 })
  if (!listing.external_id) {
    return NextResponse.json({ error: 'Esta publicación no está vinculada a MercadoLibre' }, { status: 409 })
  }
  const channelCode = Array.isArray(listing.channel) ? listing.channel[0]?.code : (listing.channel as { code?: string } | null)?.code
  if (channelCode !== 'mercadolibre') {
    return NextResponse.json({ error: 'Solo se pueden editar publicaciones de MercadoLibre' }, { status: 409 })
  }

  const canAccess = await userHasCompanyAccess(auth.ttUserId, auth.role, listing.company_id as string)
  if (!canAccess) return NextResponse.json({ error: 'Sin acceso a esa empresa' }, { status: 403 })

  const token = await getValidAccessToken(admin, listing.channel_id as string)
  if (!token) return NextResponse.json({ error: 'El canal no está conectado a MercadoLibre' }, { status: 409 })

  const { price, stock, status, title } = parsed.data
  const edit: MlItemEdit = {}
  if (price !== undefined) edit.price = price
  if (stock !== undefined) edit.available_quantity = stock
  if (status !== undefined) edit.status = status
  if (title !== undefined) edit.title = title

  try {
    await updateMlItem(token, listing.external_id as string, edit)
  } catch (e) {
    return NextResponse.json({ error: `MercadoLibre rechazó el cambio: ${(e as Error).message}` }, { status: 502 })
  }

  // ML aceptó: reflejamos en la base (status local usa el mismo dominio).
  const patch: Record<string, unknown> = { updated_at: new Date().toISOString(), last_sync_at: new Date().toISOString(), sync_error: null }
  if (price !== undefined) patch.price = price
  if (stock !== undefined) patch.stock_published = stock
  if (status !== undefined) patch.status = status
  if (title !== undefined) patch.title = title

  const { data, error } = await admin
    .from('tt_channel_listings')
    .update(patch)
    .eq('id', id)
    .select('id, title, price, currency, stock_published, status, last_sync_at')
    .single()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ success: true, data })
}
