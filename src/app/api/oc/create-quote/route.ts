import { NextRequest, NextResponse } from 'next/server'
import { createClient as createServiceClient } from '@supabase/supabase-js'
import type { ParsedOCItem } from '@/lib/ai/parse-oc-pdf'

export const runtime = 'nodejs'

/**
 * POST /api/oc/create-quote
 * Body: { ocId: string }
 *
 * Crea una cotización nueva a partir de los items de una OC.
 * Útil cuando el cliente manda una OC directa sin haber pedido cotización previa.
 * Copia items a tt_document_items, auto-matchea la OC con la cotización nueva.
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

    // Traer OC con documento asociado
    const { data: oc, error: ocErr } = await supabase
      .from('tt_oc_parsed')
      .select(`
        id, parsed_items, document_id, matched_quote_id,
        document:tt_documents!tt_oc_parsed_document_id_fkey (
          id, legal_number, client_id, company_id, currency, total
        )
      `)
      .eq('id', ocId)
      .single()
    if (ocErr || !oc) return NextResponse.json({ error: 'OC no encontrada' }, { status: 404 })
    if (!oc.document) return NextResponse.json({ error: 'OC sin documento asociado' }, { status: 400 })

    if (oc.matched_quote_id) {
      return NextResponse.json({
        error: 'La OC ya tiene una cotización asociada. Primero des-matcheala si querés crear otra.',
      }, { status: 409 })
    }

    const doc = oc.document as unknown as {
      id: string
      legal_number?: string
      client_id?: string
      company_id?: string
      currency?: string
      total?: number
    }
    const items = (oc.parsed_items || []) as ParsedOCItem[]

    if (items.length === 0) {
      return NextResponse.json({ error: 'La OC no tiene items parseados' }, { status: 400 })
    }

    // Crear la cotización
    const timestamp = Date.now()
    const quoteCode = `COT-${timestamp}`
    const total = items.reduce((sum, it) => sum + (it.cantidad || 0) * (it.precio_unitario || 0), 0)

    const { data: quoteDoc, error: insErr } = await supabase
      .from('tt_documents')
      .insert({
        type: 'cotizacion',
        system_code: quoteCode,
        legal_number: doc.legal_number ? `COT-desde-OC-${doc.legal_number}` : null,
        client_id: doc.client_id,
        company_id: doc.company_id,
        total: total > 0 ? total : (doc.total ?? 0),
        currency: doc.currency || 'ARS',
        status: 'draft',
        metadata: {
          source: 'oc_import',
          source_oc_id: ocId,
          source_oc_legal: doc.legal_number,
          note: 'Cotización generada automáticamente desde OC del cliente',
        },
      })
      .select('id, system_code, legal_number')
      .single()

    if (insErr || !quoteDoc) {
      return NextResponse.json({ error: insErr?.message || 'Error creando cotización' }, { status: 500 })
    }

    // Copiar items
    let itemsCreated = 0
    if (items.length > 0) {
      const itemsToInsert = items.map((item, idx) => ({
        document_id: quoteDoc.id,
        line_number: item.linea ?? idx + 1,
        sku: item.codigo || null,
        description: item.descripcion,
        quantity: item.cantidad,
        unit_price: item.precio_unitario ?? 0,
        subtotal: (item.cantidad || 0) * (item.precio_unitario || 0),
      }))
      const { error: itemsErr, count } = await supabase
        .from('tt_document_items')
        .insert(itemsToInsert, { count: 'exact' })
      if (!itemsErr) itemsCreated = count ?? itemsToInsert.length
    }

    // Auto-matchear la OC con la cotización recién creada
    await supabase
      .from('tt_oc_parsed')
      .update({
        matched_quote_id: quoteDoc.id,
        status: 'validated',
        ai_discrepancies: [],  // no hay discrepancias porque la cotización salió de la OC
      })
      .eq('id', ocId)

    // Link Cotización → OC
    await supabase.from('tt_document_links').insert({
      parent_id: quoteDoc.id,
      child_id: doc.id,
      relation_type: 'orden_compra',
    }).single().then(() => {}, () => {})

    return NextResponse.json({
      ok: true,
      quoteId: quoteDoc.id,
      quoteCode: quoteDoc.system_code,
      legalNumber: quoteDoc.legal_number,
      itemsCreated,
      total,
    })
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 500 })
  }
}
