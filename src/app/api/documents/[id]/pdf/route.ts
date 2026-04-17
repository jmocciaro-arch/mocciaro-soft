import { NextRequest, NextResponse } from 'next/server'
import { getAdminClient } from '@/lib/supabase/admin'
import { requireAuth, userHasCompanyAccess } from '@/lib/auth/require-admin'
import { renderDocumentHTML } from '@/lib/documents/render'
import { htmlToPdf } from '@/lib/documents/pdf-adapter'
import { addEvent } from '@/lib/documents/engine'

export const runtime = 'nodejs'

type Ctx = { params: Promise<{ id: string }> }

// GET /api/documents/[id]/pdf — PDF A4 generado desde el mismo HTML que /html.
// Registra evento 'pdf_generated' al éxito.
// Query params:
//   ?locale=es-AR|es-ES|en-US       override de locale
//   ?inline=1                       Content-Disposition: inline (default: attachment)
export async function GET(req: NextRequest, { params }: Ctx) {
  const auth = await requireAuth()
  if (!auth.ok) return auth.response
  const { id } = await params

  const admin = getAdminClient()
  const { data: doc } = await admin
    .from('tt_documents').select('company_id').eq('id', id).maybeSingle()
  if (!doc) return NextResponse.json({ error: 'Documento no encontrado' }, { status: 404 })

  const canAccess = await userHasCompanyAccess(auth.ttUserId, auth.role, doc.company_id as string)
  if (!canAccess) return NextResponse.json({ error: 'Sin acceso' }, { status: 403 })

  const locale = req.nextUrl.searchParams.get('locale') ?? undefined
  const inline = req.nextUrl.searchParams.get('inline') === '1'

  const rendered = await renderDocumentHTML(id, { locale })
  if ('error' in rendered) return NextResponse.json({ error: rendered.error }, { status: rendered.status })

  const pdf = await htmlToPdf(rendered.html)
  if ('error' in pdf) {
    return NextResponse.json(
      { error: pdf.error, hint: pdf.hint },
      { status: pdf.status },
    )
  }

  // Evento de trazabilidad. Si falla, no bloqueamos la respuesta del PDF.
  try {
    await addEvent(admin, {
      documentId: id,
      eventType: 'pdf_generated',
      actorId: auth.ttUserId,
      payload: {
        filename: rendered.filename,
        engine: pdf.engine,
        locale: rendered.locale,
        size_bytes: pdf.pdf.length,
      },
    })
  } catch {
    // no-op: el evento es best-effort
  }

  const disposition = inline ? 'inline' : 'attachment'
  // Copia a un ArrayBuffer "puro" para satisfacer los types de BlobPart
  // (Buffer.buffer es ArrayBufferLike, lo que TS rechaza en versiones recientes).
  const ab = new ArrayBuffer(pdf.pdf.byteLength)
  new Uint8Array(ab).set(pdf.pdf)
  const blob = new Blob([ab], { type: 'application/pdf' })
  return new NextResponse(blob, {
    status: 200,
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': `${disposition}; filename="${rendered.filename}"`,
      'Content-Length': String(pdf.pdf.length),
      'Cache-Control': 'no-store',
    },
  })
}
