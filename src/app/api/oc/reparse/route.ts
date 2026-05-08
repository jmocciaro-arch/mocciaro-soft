import { NextRequest, NextResponse } from 'next/server'
import { getAdminClient } from '@/lib/supabase/admin'
import { withCompanyFilter } from '@/lib/auth/with-company-filter'
import { parseOCPDF } from '@/lib/ai/parse-oc-pdf'

export const runtime = 'nodejs'
export const maxDuration = 120

/**
 * POST /api/oc/reparse
 * Body: { ocId: string }
 *
 * Descarga el PDF original desde Storage, lo re-parsea con la config
 * actual (más tokens, mejor prompt) y actualiza los items.
 */
export async function POST(req: NextRequest) {
  try {
    const { ocId } = await req.json()
    if (!ocId) return NextResponse.json({ error: 'ocId requerido' }, { status: 400 })

    const guard = await withCompanyFilter()
    if (!guard.ok) return guard.response

    const supabase = getAdminClient()

    // Traer la OC + company_id para validar acceso
    const { data: oc, error: ocErr } = await supabase
      .from('tt_oc_parsed')
      .select('id, file_url, file_name, document_id, matched_quote_id, company_id')
      .eq('id', ocId)
      .single()
    if (ocErr || !oc) return NextResponse.json({ error: 'OC no encontrada' }, { status: 404 })

    if (!guard.assertAccess((oc as { company_id: string | null }).company_id)) {
      return NextResponse.json({ error: 'Acceso denegado a esta OC' }, { status: 403 })
    }
    if (!oc.file_url) return NextResponse.json({ error: 'OC sin PDF original adjunto' }, { status: 400 })

    // Descargar el PDF directamente desde Storage usando service role
    // (el bucket `client-pos` es privado, así que fetch al URL público falla con 404).
    const path = extractStoragePath(oc.file_url, 'client-pos')
    if (!path) {
      return NextResponse.json(
        { error: 'No se pudo derivar el path del PDF en storage', file_url: oc.file_url },
        { status: 500 }
      )
    }
    const { data: blob, error: dlErr } = await supabase.storage
      .from('client-pos')
      .download(path)
    if (dlErr || !blob) {
      return NextResponse.json(
        { error: `No se pudo descargar el PDF: ${dlErr?.message || 'unknown'}` },
        { status: 500 }
      )
    }
    const buf = Buffer.from(await blob.arrayBuffer())

    // Re-parsear
    const result = await parseOCPDF(buf)
    if (!result.data) {
      return NextResponse.json({ error: result.error || 'Error parseando' }, { status: 500 })
    }

    const parsed = result.data
    const newItemsCount = parsed.items?.length || 0
    // Suma real desde los items — fuente de verdad.
    const computedTotal = (parsed.items || []).reduce(
      (sum, it) => sum + (it.cantidad || 0) * (it.precio_unitario || 0),
      0
    )
    const aiReportedTotal = parsed.total ?? 0
    const totalMismatch =
      aiReportedTotal > 0 && Math.abs(aiReportedTotal - computedTotal) > 0.01

    // Actualizar la OC
    await supabase
      .from('tt_oc_parsed')
      .update({
        parsed_items: parsed.items || [],
        parsed_at: new Date().toISOString(),
        parsed_by: parsed.provider_used || 'ai',
        confidence_score: parsed.confidence,
        ai_provider: parsed.provider_used,
      })
      .eq('id', ocId)

    // Actualizar el documento asociado (total + metadata).
    // Usamos SIEMPRE la suma de items, ignorando el total que reporta la IA.
    if (oc.document_id) {
      await supabase
        .from('tt_documents')
        .update({
          total: computedTotal,
          currency: parsed.moneda || 'ARS',
          metadata: {
            parsed_oc: parsed,
            reparse_at: new Date().toISOString(),
            ai_reported_total: aiReportedTotal,
            computed_total: computedTotal,
            total_mismatch: totalMismatch,
          },
        })
        .eq('id', oc.document_id)
    }

    return NextResponse.json({
      ok: true,
      items_count: newItemsCount,
      total: computedTotal,
      ai_reported_total: aiReportedTotal,
      total_mismatch: totalMismatch,
      provider: parsed.provider_used,
      confidence: parsed.confidence,
    })
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
