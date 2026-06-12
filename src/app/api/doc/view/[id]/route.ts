// ============================================================================
// GET /api/doc/view/[id]?token=...
//
// Resuelve un share-link y devuelve los datos del documento + HTML renderizado
// para la página pública /doc/view/[id].
//
// NO requiere autenticación de usuario — solo el token válido y no expirado.
// ============================================================================

import { NextRequest, NextResponse } from 'next/server'
import { getAdminClient } from '@/lib/supabase/admin'
import { renderDocumentHTML } from '@/lib/documents/render'

export const runtime = 'nodejs'

type Ctx = { params: Promise<{ id: string }> }

export async function GET(req: NextRequest, { params }: Ctx) {
  const { id } = await params
  const token = req.nextUrl.searchParams.get('token')
  const password = req.nextUrl.searchParams.get('password') ?? null

  if (!token) {
    return NextResponse.json({ error: 'Token requerido' }, { status: 400 })
  }

  const admin = getAdminClient()

  // 1) Validar token contra tt_document_share_links
  const { data: share, error: shareErr } = await admin
    .from('tt_document_share_links')
    .select('id, document_id, expires_at, revoked, password')
    .eq('token', token)
    .maybeSingle()

  if (shareErr || !share) {
    return NextResponse.json({ error: 'Link inválido' }, { status: 404 })
  }
  if (share.revoked) {
    return NextResponse.json({ error: 'Link revocado' }, { status: 410 })
  }
  if (share.expires_at && new Date(share.expires_at).getTime() < Date.now()) {
    return NextResponse.json({ error: 'Link expirado' }, { status: 410 })
  }
  if (share.document_id !== id) {
    return NextResponse.json({ error: 'Link no corresponde a este documento' }, { status: 403 })
  }
  if (share.password && share.password !== password) {
    return NextResponse.json({ error: 'Contraseña requerida', requires_password: true }, { status: 401 })
  }

  // 2) Cargar resumen del doc
  const { data: doc } = await admin
    .from('tt_documents')
    .select(`
      id, doc_type, display_ref, system_code, status, currency, subtotal,
      tax_amount, tax_rate, total, notes, created_at, valid_until,
      client:tt_clients(id, name, legal_name, email),
      company:tt_companies(id, name, trade_name, legal_name, logo_url, brand_color, secondary_color)
    `)
    .eq('id', id)
    .maybeSingle()

  if (!doc) {
    return NextResponse.json({ error: 'Documento no encontrado' }, { status: 404 })
  }

  // 3) Renderizar HTML A4
  const rendered = await renderDocumentHTML(id)
  const html = 'error' in rendered ? null : rendered.html

  // 4) Tracking: ip + ua + count atomic
  const ip =
    req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
    req.headers.get('x-real-ip') ||
    null
  const ua = req.headers.get('user-agent') ?? null

  try {
    await admin.rpc('tt_increment_share_link_open', {
      p_token: token,
      p_ip: ip,
      p_ua: ua,
    })
  } catch (err) {
    // best-effort
    console.warn('[doc/view] increment failed:', err)
  }

  return NextResponse.json({
    doc,
    html,
    share_link_id: share.id,
  })
}
