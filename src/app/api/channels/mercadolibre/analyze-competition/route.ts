import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { getAdminClient } from '@/lib/supabase/admin'
import { requireAuth, userHasCompanyAccess } from '@/lib/auth/require-admin'
import { userHasRbacPermission } from '@/lib/auth/rbac-server'
import { getValidAccessToken, readMlChannelConfig } from '@/lib/channels/mercadolibre'
import { analyzeListingCompetition } from '@/lib/channels/mercadolibre-competition'

export const runtime = 'nodejs'
// Hasta ~3 requests a ML por análisis (item + producto + items de catálogo) más
// 1 best-effort por el nickname del ganador. On-demand, una publicación por vez.
export const maxDuration = 30

const bodySchema = z.object({
  channel_id: z.string().uuid(),
  listing_id: z.string().uuid(),
})

/**
 * POST /api/channels/mercadolibre/analyze-competition — foto del día de la
 * competencia de UNA publicación catalogada: Buy Box (quién gana y por qué),
 * benchmark de precio y tu posición. No persiste nada. Requiere view_channels +
 * acceso a la empresa del canal (defense in depth: guard + RLS).
 */
export async function POST(req: NextRequest) {
  const auth = await requireAuth()
  if (!auth.ok) return auth.response

  let body: unknown
  try { body = await req.json() } catch { return NextResponse.json({ error: 'JSON inválido' }, { status: 400 }) }
  const parsed = bodySchema.safeParse(body)
  if (!parsed.success) return NextResponse.json({ error: 'Faltan channel_id y/o listing_id' }, { status: 400 })

  const admin = getAdminClient()
  const allowed = await userHasRbacPermission(admin, auth.ttUserId, auth.role, 'view_channels')
  if (!allowed) return NextResponse.json({ error: 'Falta el permiso view_channels' }, { status: 403 })

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

  // La publicación tiene que pertenecer a ESTE canal (evita analizar de otra empresa).
  const { data: listing } = await admin
    .from('tt_channel_listings')
    .select('id, channel_id, external_id')
    .eq('id', parsed.data.listing_id)
    .eq('channel_id', channel.id as string)
    .maybeSingle()
  if (!listing) return NextResponse.json({ error: 'Publicación no encontrada en este canal' }, { status: 404 })
  if (!listing.external_id) {
    return NextResponse.json(
      { error: 'Esta publicación no tiene ID de MercadoLibre (fue creada manual). Sincronizá primero.' },
      { status: 409 },
    )
  }

  const stored = await readMlChannelConfig(admin, channel.id as string)
  const token = await getValidAccessToken(admin, channel.id as string)
  if (!token || !stored) {
    return NextResponse.json({ error: 'El canal no está conectado a MercadoLibre. Conectalo primero.' }, { status: 409 })
  }

  try {
    const analysis = await analyzeListingCompetition(token, listing.external_id as string, stored.ml_user_id)
    return NextResponse.json({ success: true, analysis })
  } catch (e) {
    return NextResponse.json({ error: `MercadoLibre no respondió: ${(e as Error).message}` }, { status: 502 })
  }
}
