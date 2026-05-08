import { NextRequest, NextResponse } from 'next/server'
import { createClient as createServiceClient } from '@supabase/supabase-js'
import { createClient } from '@/lib/supabase/server'

export const runtime = 'nodejs'

/**
 * GET /api/sales-orders/:id/client-po-context
 *
 * Dado el id de un pedido (en `tt_sales_orders` legacy o en `tt_documents`
 * unificado), busca si tiene una OC del cliente vinculada y devuelve el
 * contexto para que la UI pueda mostrar una card de OC + marcar el step
 * "OC Cliente" del workflow como completado.
 *
 * La vinculación pedido↔OC NO es directa hoy:
 *   pedido.quote_id  →  cotización (tt_documents)
 *                      →  tt_oc_parsed.matched_quote_id
 *
 * Si encontramos OC matcheada al mismo quote_id, devolvemos sus datos.
 *
 * Response:
 * {
 *   has_client_po: bool,
 *   oc_parsed_id, oc_number, oc_status, oc_pdf_url, oc_confidence,
 *   matched_quote_id, items_count,
 *   discrepancies_count
 * }
 */
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params

    const supabaseAuth = await createClient()
    const { data: { user } } = await supabaseAuth.auth.getUser()
    if (!user) return NextResponse.json({ error: 'No autenticado' }, { status: 401 })

    const supabase = createServiceClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
      { auth: { persistSession: false } }
    )

    // 1. Resolver el quote_id del pedido. Probar primero tt_sales_orders
    //    (legacy), después tt_documents (unificado).
    let quoteId: string | null = null
    let pedidoNumber: string | null = null

    const { data: legacySO } = await supabase
      .from('tt_sales_orders')
      .select('id, number, quote_id, company_id')
      .eq('id', id)
      .maybeSingle()

    if (legacySO) {
      quoteId = legacySO.quote_id as string | null
      pedidoNumber = legacySO.number as string | null
    } else {
      const { data: doc } = await supabase
        .from('tt_documents')
        .select('id, type, system_code, legal_number, metadata')
        .eq('id', id)
        .maybeSingle()
      if (doc) {
        pedidoNumber = (doc.legal_number as string) || (doc.system_code as string) || null
        // En tt_documents la cotización origen vive en metadata o en
        // tt_document_relations. Probar ambos.
        const meta = (doc.metadata as Record<string, unknown>) || {}
        quoteId = (meta.quote_id as string) || (meta.source_quote_id as string) || null
        if (!quoteId) {
          const { data: link } = await supabase
            .from('tt_document_relations')
            .select('parent_id, relation_type, source_document_id, target_document_id')
            .or(`child_id.eq.${id},target_document_id.eq.${id}`)
            .limit(1)
            .maybeSingle()
          if (link) {
            quoteId = (link.parent_id as string) || (link.source_document_id as string) || null
          }
        }
      }
    }

    if (!quoteId) {
      return NextResponse.json({ has_client_po: false, reason: 'sin quote_id' })
    }

    // 2. Buscar OC del cliente con matched_quote_id == quoteId.
    const { data: oc } = await supabase
      .from('tt_oc_parsed')
      .select(`
        id, status, deletion_status, confidence_score, file_url, file_name,
        matched_quote_id, ai_discrepancies, document_id, parsed_at,
        document:tt_documents!tt_oc_parsed_document_id_fkey(legal_number, system_code, metadata)
      `)
      .eq('matched_quote_id', quoteId)
      .neq('deletion_status', 'deleted')
      .order('parsed_at', { ascending: false })
      .limit(1)
      .maybeSingle()

    if (!oc) {
      return NextResponse.json({
        has_client_po: false,
        quote_id: quoteId,
        pedido_number: pedidoNumber,
      })
    }

    // 3. Items count desde el doc OC asociado
    let itemsCount = 0
    if (oc.document_id) {
      const { count } = await supabase
        .from('tt_document_lines')
        .select('id', { count: 'exact', head: true })
        .eq('document_id', oc.document_id)
      itemsCount = count || 0
    }

    const docMeta = ((oc as Record<string, unknown>).document as Record<string, unknown> | null)
    const ocLegalNumber =
      (docMeta?.legal_number as string) ||
      (docMeta?.system_code as string) ||
      (((docMeta?.metadata as Record<string, unknown> | null)?.parsed_oc as Record<string, unknown> | null)?.numero_oc as string) ||
      'sin número'

    const discrepancies = (oc.ai_discrepancies as unknown[] | null) || []

    return NextResponse.json({
      has_client_po: true,
      oc_parsed_id: oc.id as string,
      oc_number: ocLegalNumber,
      oc_status: oc.status as string,
      oc_pdf_url: oc.file_url as string | null,
      oc_pdf_name: oc.file_name as string | null,
      oc_confidence: oc.confidence_score as number | null,
      oc_document_id: oc.document_id as string | null,
      matched_quote_id: oc.matched_quote_id as string,
      items_count: itemsCount,
      discrepancies_count: discrepancies.length,
      pedido_number: pedidoNumber,
      parsed_at: oc.parsed_at as string,
    })
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 500 })
  }
}
