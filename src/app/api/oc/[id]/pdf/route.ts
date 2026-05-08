import { NextRequest, NextResponse } from 'next/server'
import { getAdminClient } from '@/lib/supabase/admin'
import { withCompanyFilter } from '@/lib/auth/with-company-filter'

export const runtime = 'nodejs'

/**
 * GET /api/oc/[id]/pdf
 *
 * Genera un signed URL fresco al PDF original de la OC almacenado en
 * el bucket privado `client-pos` y redirige a esa URL. El bucket se
 * mantiene privado: el acceso queda mediado por este endpoint.
 *
 * Sustituye el uso directo de `getPublicUrl()` (que devolvía 404
 * "Bucket not found" porque el bucket no es público).
 */
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    if (!id) return NextResponse.json({ error: 'ocId requerido' }, { status: 400 })

    const guard = await withCompanyFilter()
    if (!guard.ok) return guard.response

    const supabase = getAdminClient()

    const { data: oc, error: ocErr } = await supabase
      .from('tt_oc_parsed')
      .select('id, file_url, file_name, company_id')
      .eq('id', id)
      .single()

    if (ocErr || !oc) {
      return NextResponse.json({ error: 'OC no encontrada' }, { status: 404 })
    }
    if (!guard.assertAccess((oc as { company_id: string | null }).company_id)) {
      return NextResponse.json({ error: 'Acceso denegado a esta OC' }, { status: 403 })
    }
    if (!oc.file_url) {
      return NextResponse.json({ error: 'OC sin PDF original adjunto' }, { status: 404 })
    }

    // Extraer el path dentro del bucket desde la URL guardada.
    // Soporta tanto URLs públicas (legacy) como signed URLs.
    // Formato esperado: .../object/(public|sign)/client-pos/<path>?...
    const path = extractStoragePath(oc.file_url, 'client-pos')
    if (!path) {
      return NextResponse.json(
        { error: 'No se pudo derivar el path del PDF en storage', file_url: oc.file_url },
        { status: 500 }
      )
    }

    // Signed URL válido por 1 hora (suficiente para abrir y leer el PDF)
    const { data: signed, error: signErr } = await supabase.storage
      .from('client-pos')
      .createSignedUrl(path, 60 * 60)

    if (signErr || !signed?.signedUrl) {
      return NextResponse.json(
        { error: signErr?.message || 'No se pudo firmar el PDF' },
        { status: 500 }
      )
    }

    return NextResponse.redirect(signed.signedUrl, { status: 302 })
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 500 })
  }
}

/**
 * Extrae el path dentro del bucket desde una URL de Supabase Storage.
 * Acepta URLs públicas (`/object/public/<bucket>/<path>`) y firmadas
 * (`/object/sign/<bucket>/<path>?token=...`).
 */
function extractStoragePath(fileUrl: string, bucket: string): string | null {
  try {
    const u = new URL(fileUrl)
    const marker = `/${bucket}/`
    const idx = u.pathname.indexOf(marker)
    if (idx === -1) return null
    return decodeURIComponent(u.pathname.slice(idx + marker.length))
  } catch {
    return null
  }
}
