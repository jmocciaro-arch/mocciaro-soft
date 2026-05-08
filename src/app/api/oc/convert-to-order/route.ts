import { NextRequest, NextResponse } from 'next/server'
import { createClient as createServiceClient } from '@supabase/supabase-js'
import type { ParsedOCItem } from '@/lib/ai/parse-oc-pdf'

export const runtime = 'nodejs'

/**
 * POST /api/oc/convert-to-order
 * Body: { ocId: string }
 *
 * Crea un nuevo documento tipo 'pedido' (sales order) a partir de la OC parseada,
 * con items copiados y link parent=OC → child=Pedido.
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

    const doc = oc.document as unknown as {
      id: string
      legal_number?: string
      client_id?: string
      company_id?: string
      currency?: string
      total?: number
    }
    const items = (oc.parsed_items || []) as ParsedOCItem[]

    // Chequear si ya existe un pedido creado desde esta OC
    const { data: existing } = await supabase
      .from('tt_document_relations')
      .select('child_id, tt_documents:child_id (type, system_code, legal_number)')
      .eq('parent_id', doc.id)
      .eq('relation_type', 'pedido')
      .limit(1)
    if (existing && existing.length > 0) {
      const childDoc = (existing[0] as unknown as { tt_documents?: { system_code?: string } }).tt_documents
      return NextResponse.json({
        error: `Esta OC ya fue convertida en pedido ${childDoc?.system_code || ''}`,
      }, { status: 409 })
    }

    // Crear el pedido (tt_documents tipo 'pedido')
    const timestamp = Date.now()
    const orderCode = `PED-${timestamp}`
    const total = items.reduce((sum, it) => sum + (it.cantidad || 0) * (it.precio_unitario || 0), 0)

    const { data: orderDoc, error: insErr } = await supabase
      .from('tt_documents')
      .insert({
        doc_type: 'pedido',
        system_code: orderCode,
        legal_number: doc.legal_number ? `PED-${doc.legal_number}` : null,
        client_id: doc.client_id,
        company_id: doc.company_id,
        total: total > 0 ? total : (doc.total ?? 0),
        currency: doc.currency || 'ARS',
        status: 'draft',
        metadata: { source_oc_id: ocId, source_oc_legal: doc.legal_number },
      })
      .select('id, system_code, legal_number')
      .single()

    if (insErr || !orderDoc) {
      return NextResponse.json({ error: insErr?.message || 'Error creando pedido' }, { status: 500 })
    }

    // Copiar items a tt_document_lines.
    // La columna correcta para orden de líneas es `sort_order` (no `line_number`).
    let itemsCreated = 0
    if (items.length > 0) {
      const itemsToInsert = items.map((item, idx) => ({
        document_id: orderDoc.id,
        sort_order: item.linea ?? idx + 1,
        sku: item.codigo || null,
        description: item.descripcion,
        quantity: item.cantidad,
        unit_price: item.precio_unitario ?? 0,
        subtotal: (item.cantidad || 0) * (item.precio_unitario || 0),
      }))
      const { error: itemsErr, count } = await supabase
        .from('tt_document_lines')
        .insert(itemsToInsert, { count: 'exact' })
      if (itemsErr) {
        return NextResponse.json(
          {
            error: `Pedido creado pero los items fallaron: ${itemsErr.message}`,
            orderId: orderDoc.id,
            orderCode: orderDoc.system_code,
            itemsCreated: 0,
          },
          { status: 500 }
        )
      }
      itemsCreated = count ?? itemsToInsert.length
    }

    // Link OC → Pedido
    await supabase.from('tt_document_relations').insert({
      parent_id: doc.id,
      child_id: orderDoc.id,
      relation_type: 'pedido',
    })

    // Si la OC venía de una cotización, linkear también Cotización → Pedido
    if (oc.matched_quote_id) {
      await supabase.from('tt_document_relations').insert({
        parent_id: oc.matched_quote_id,
        child_id: orderDoc.id,
        relation_type: 'pedido',
      }).single().then(() => {}, () => {}) // ignore errors (link puede ya existir)
    }

    // Actualizar estado de la OC
    await supabase
      .from('tt_oc_parsed')
      .update({ status: 'converted' })
      .eq('id', ocId)

    return NextResponse.json({
      ok: true,
      orderId: orderDoc.id,
      orderCode: orderDoc.system_code,
      legalNumber: orderDoc.legal_number,
      itemsCreated,
    })
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 500 })
  }
}
