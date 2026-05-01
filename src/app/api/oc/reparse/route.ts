import { NextRequest, NextResponse } from 'next/server'
import { createClient as createServiceClient } from '@supabase/supabase-js'
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

    const supabase = createServiceClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
      { auth: { persistSession: false } }
    )

    // Traer la OC
    const { data: oc, error: ocErr } = await supabase
      .from('tt_oc_parsed')
      .select('id, file_url, file_name, document_id, matched_quote_id')
      .eq('id', ocId)
      .single()
    if (ocErr || !oc) return NextResponse.json({ error: 'OC no encontrada' }, { status: 404 })
    if (!oc.file_url) return NextResponse.json({ error: 'OC sin PDF original adjunto' }, { status: 400 })

    // Descargar el PDF
    const pdfRes = await fetch(oc.file_url)
    if (!pdfRes.ok) {
      return NextResponse.json({ error: `No se pudo descargar el PDF (HTTP ${pdfRes.status})` }, { status: 500 })
    }
    const buf = Buffer.from(await pdfRes.arrayBuffer())

    // Re-parsear
    const result = await parseOCPDF(buf)
    if (!result.data) {
      return NextResponse.json({ error: result.error || 'Error parseando' }, { status: 500 })
    }

    const parsed = result.data
    const newItemsCount = parsed.items?.length || 0
    const newTotal = (parsed.items || []).reduce(
      (sum, it) => sum + (it.cantidad || 0) * (it.precio_unitario || 0),
      0
    )

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

    // Actualizar el documento asociado (total + metadata)
    if (oc.document_id) {
      await supabase
        .from('tt_documents')
        .update({
          total: parsed.total || newTotal,
          currency: parsed.moneda || 'ARS',
          metadata: { parsed_oc: parsed, reparse_at: new Date().toISOString() },
        })
        .eq('id', oc.document_id)
    }

    return NextResponse.json({
      ok: true,
      items_count: newItemsCount,
      total: parsed.total || newTotal,
      provider: parsed.provider_used,
      confidence: parsed.confidence,
    })
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 500 })
  }
}
