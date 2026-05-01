import { NextRequest, NextResponse } from 'next/server'
import { createClient as createServiceClient } from '@supabase/supabase-js'
import { detectOCDiscrepancies, type ParsedOCItem } from '@/lib/ai/parse-oc-pdf'

export const runtime = 'nodejs'

/**
 * POST /api/oc/match
 * Body: { ocId: string, quoteDocumentId: string | null }
 *
 * Re-matchea una OC con una cotización (o la des-matchea pasando null).
 * Recalcula discrepancias y actualiza la fila de tt_oc_parsed.
 */
export async function POST(req: NextRequest) {
  try {
    const { ocId, quoteDocumentId } = await req.json()
    if (!ocId) return NextResponse.json({ error: 'ocId requerido' }, { status: 400 })

    const supabase = createServiceClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
      { auth: { persistSession: false } }
    )

    // Traer la OC con sus items parseados
    const { data: oc, error: ocErr } = await supabase
      .from('tt_oc_parsed')
      .select('id, parsed_items, document_id')
      .eq('id', ocId)
      .single()
    if (ocErr || !oc) return NextResponse.json({ error: 'OC no encontrada' }, { status: 404 })

    const ocItems = (oc.parsed_items || []) as ParsedOCItem[]

    let discrepancies: ReturnType<typeof detectOCDiscrepancies> = []
    if (quoteDocumentId) {
      // Traer items de la cotización
      const { data: qItems } = await supabase
        .from('tt_document_items')
        .select('sku, description, quantity, unit_price')
        .eq('document_id', quoteDocumentId)

      if (qItems?.length) {
        discrepancies = detectOCDiscrepancies(
          ocItems,
          qItems as Array<{ sku?: string; description?: string; quantity: number; unit_price: number }>
        )
      }
    }

    const newStatus = !quoteDocumentId
      ? 'parsed'
      : discrepancies.some(d => d.severity === 'high')
        ? 'needs_review'
        : 'validated'

    const { error: updErr } = await supabase
      .from('tt_oc_parsed')
      .update({
        matched_quote_id: quoteDocumentId || null,
        ai_discrepancies: discrepancies,
        status: newStatus,
      })
      .eq('id', ocId)
    if (updErr) return NextResponse.json({ error: updErr.message }, { status: 500 })

    // Crear/actualizar link tt_document_links
    if (quoteDocumentId && oc.document_id) {
      // Borrar link anterior si existía
      await supabase
        .from('tt_document_links')
        .delete()
        .eq('child_id', oc.document_id)
        .eq('relation_type', 'orden_compra')
      // Insertar nuevo link
      await supabase.from('tt_document_links').insert({
        parent_id: quoteDocumentId,
        child_id: oc.document_id,
        relation_type: 'orden_compra',
      })
    } else if (!quoteDocumentId && oc.document_id) {
      // Des-matchear: borrar link
      await supabase
        .from('tt_document_links')
        .delete()
        .eq('child_id', oc.document_id)
        .eq('relation_type', 'orden_compra')
    }

    return NextResponse.json({ ok: true, discrepancies, status: newStatus })
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 500 })
  }
}
