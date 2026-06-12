// ============================================================================
// POST /api/documents/[id]/share-link
//
// Crea (o reutiliza) un share link público para el documento. El cliente
// recibe la URL /doc/view/[id]?token=... y puede ver el doc sin login.
//
// Body:
//   { expires_days?: number, password?: string|null, companyId?: string }
//
// Respuesta:
//   { id, token, url, expires_at }
// ============================================================================

import { NextRequest, NextResponse } from 'next/server'
import { getAdminClient } from '@/lib/supabase/admin'
import { requireAuth, userHasCompanyAccess } from '@/lib/auth/require-admin'
import { generateShareToken, calcExpiresAt, buildShareUrl } from '@/lib/share-links'
import { getEnv } from '@/lib/env'

export const runtime = 'nodejs'

type Ctx = { params: Promise<{ id: string }> }

interface Body {
  expires_days?: number
  password?: string | null
  companyId?: string | null
}

export async function POST(req: NextRequest, { params }: Ctx) {
  const auth = await requireAuth()
  if (!auth.ok) return auth.response

  const { id } = await params

  let body: Body
  try {
    body = await req.json()
  } catch {
    body = {}
  }

  const admin = getAdminClient()

  // Verificar doc + acceso
  const { data: doc } = await admin
    .from('tt_documents')
    .select('id, company_id, client_id')
    .eq('id', id)
    .maybeSingle()
  if (!doc) return NextResponse.json({ error: 'Documento no encontrado' }, { status: 404 })

  const companyId = (body.companyId ?? doc.company_id) as string | null
  if (companyId) {
    const can = await userHasCompanyAccess(auth.ttUserId, auth.role, companyId)
    if (!can) return NextResponse.json({ error: 'Sin acceso a esta empresa' }, { status: 403 })
  }

  const token = generateShareToken()
  const expiresAt = calcExpiresAt(body.expires_days ?? 30)

  const { data: inserted, error } = await admin
    .from('tt_document_share_links')
    .insert({
      document_id: id,
      company_id: doc.company_id,
      client_id: doc.client_id,
      token,
      expires_at: expiresAt,
      password: body.password || null,
      created_by: auth.ttUserId,
    })
    .select('id, token, expires_at')
    .single()

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  const origin =
    getEnv('NEXT_PUBLIC_APP_URL') ||
    req.nextUrl.origin ||
    'http://localhost:3000'
  const url = buildShareUrl(origin, id, inserted.token)

  return NextResponse.json({
    id: inserted.id,
    token: inserted.token,
    expires_at: inserted.expires_at,
    url,
  })
}
