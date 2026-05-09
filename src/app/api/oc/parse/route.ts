import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { parseOCPDF, detectOCDiscrepancies } from '@/lib/ai/parse-oc-pdf'

export const runtime = 'nodejs'
export const maxDuration = 60

/**
 * POST /api/oc/parse
 *
 * Multipart FormData:
 *   - file: PDF de la OC
 *   - quoteDocumentId?: string (cotización a comparar)
 *   - companyId: string
 *   - clientId?: string
 */
export async function POST(req: NextRequest) {
  try {
    const fd = await req.formData()
    const file = fd.get('file') as File | null
    const quoteDocumentId = fd.get('quoteDocumentId') as string | null
    const companyId = fd.get('companyId') as string | null
    const clientId = fd.get('clientId') as string | null
    const createDocument = fd.get('createDocument') === 'true'

    if (!file) return NextResponse.json({ error: 'file requerido' }, { status: 400 })
    if (file.type !== 'application/pdf') return NextResponse.json({ error: 'Solo PDF' }, { status: 400 })

    const buf = Buffer.from(await file.arrayBuffer())
    const result = await parseOCPDF(buf)
    if (!result.data) return NextResponse.json({ error: result.error }, { status: 500 })

    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
      { auth: { persistSession: false } }
    )

    // Opcional: subir el PDF a Storage
    let pdfUrl: string | null = null
    if (companyId) {
      const path = `${companyId}/${Date.now()}_${file.name.replace(/[^\w.-]/g, '_')}`
      const { error: upErr } = await supabase.storage
        .from('client-pos')
        .upload(path, buf, { contentType: 'application/pdf' })
      if (!upErr) {
        const { data: pub } = supabase.storage.from('client-pos').getPublicUrl(path)
        pdfUrl = pub.publicUrl
      }
    }

    // Discrepancias con cotización
    let discrepancies: ReturnType<typeof detectOCDiscrepancies> = []
    if (quoteDocumentId) {
      const { data: items } = await supabase
        .from('tt_document_lines')
        .select('sku, description, quantity, unit_price')
        .eq('document_id', quoteDocumentId)
      if (items?.length) {
        discrepancies = detectOCDiscrepancies(result.data.items, items as any)
      }
    }

    // Guardar en tt_oc_parsed
    let ocParsedId: string | undefined
    if (createDocument) {
      // Total: SIEMPRE confiamos en la suma de items, no en el total que
      // reporta la IA (puede alucinar). Guardamos el total reportado en
      // metadata por trazabilidad y para detectar mismatches.
      const computedTotal = (result.data.items || []).reduce(
        (sum, it) => sum + (it.cantidad || 0) * (it.precio_unitario || 0),
        0
      )
      const aiReportedTotal = result.data.total ?? 0
      const totalMismatch =
        aiReportedTotal > 0 && Math.abs(aiReportedTotal - computedTotal) > 0.01

      // Crear doc tipo OC en tt_documents
      const systemCode = `OC-${Date.now()}-${Math.floor(Math.random() * 1000)}`
      const { data: doc, error: docErr } = await supabase
        .from('tt_documents')
        .insert({
          doc_type: 'orden_compra',
          system_code: systemCode,
          legal_number: result.data.numero_oc,
          client_id: clientId,
          company_id: companyId,
          total: computedTotal,
          currency: result.data.moneda || 'ARS',
          status: 'pending_validation',
          metadata: {
            parsed_oc: result.data,
            ai_reported_total: aiReportedTotal,
            computed_total: computedTotal,
            total_mismatch: totalMismatch,
          },
        })
        .select('id')
        .single()
      if (docErr || !doc) {
        return NextResponse.json(
          { error: `No se pudo crear el documento OC: ${docErr?.message || 'unknown'}` },
          { status: 500 }
        )
      }

      const { data: ocp, error: ocpErr } = await supabase
        .from('tt_oc_parsed')
        .insert({
          document_id: doc.id,
          file_url: pdfUrl,
          file_name: file.name,
          parsed_at: new Date().toISOString(),
          parsed_by: result.data.provider_used || 'ai',
          parsed_items: result.data.items,
          confidence_score: result.data.confidence,
          status: discrepancies.some((d) => d.severity === 'high') ? 'needs_review' : 'validated',
          ai_provider: result.data.provider_used,
          ai_discrepancies: discrepancies,
          matched_quote_id: quoteDocumentId,
        })
        .select('id')
        .single()
      if (ocpErr || !ocp) {
        return NextResponse.json(
          {
            error: `Documento OC creado pero el registro tt_oc_parsed fallo: ${ocpErr?.message || 'unknown'}`,
            documentId: doc.id,
          },
          { status: 500 }
        )
      }
      ocParsedId = ocp.id

      // Link OC → cotización
      if (quoteDocumentId && doc?.id) {
        await supabase.from('tt_document_relations').insert({
          parent_id: quoteDocumentId,
          child_id: doc.id,
          relation_type: 'orden_compra',
        })
      }
    }

    return NextResponse.json({
      data: result.data,
      discrepancies,
      pdfUrl,
      ocParsedId,
      documentCreated: createDocument,
    })
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 500 })
  }
}
