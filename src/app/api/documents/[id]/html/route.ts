import { NextRequest, NextResponse } from 'next/server'
import { getAdminClient } from '@/lib/supabase/admin'
import { requireAuth, userHasCompanyAccess } from '@/lib/auth/require-admin'
import { renderDocumentHTML } from '@/lib/documents/render'

export const runtime = 'nodejs'

type Ctx = { params: Promise<{ id: string }> }

// GET /api/documents/[id]/html — devuelve el HTML renderizado (preview / print).
// Mismo motor que el endpoint /pdf, para que no haya divergencia visual.
export async function GET(req: NextRequest, { params }: Ctx) {
  const auth = await requireAuth()
  if (!auth.ok) return auth.response
  const { id } = await params

  // Verificar acceso vía company_id del documento
  const admin = getAdminClient()
  const { data: doc } = await admin
    .from('tt_documents').select('company_id').eq('id', id).maybeSingle()
  if (!doc) return NextResponse.json({ error: 'Documento no encontrado' }, { status: 404 })

  const canAccess = await userHasCompanyAccess(auth.ttUserId, auth.role, doc.company_id as string)
  if (!canAccess) return NextResponse.json({ error: 'Sin acceso' }, { status: 403 })

  const locale = req.nextUrl.searchParams.get('locale') ?? undefined
  const result = await renderDocumentHTML(id, { locale })
  if ('error' in result) return NextResponse.json({ error: result.error }, { status: result.status })

  return new NextResponse(result.html, {
    status: 200,
    headers: {
      'Content-Type': 'text/html; charset=utf-8',
      'Cache-Control': 'no-store',
    },
  })
}
