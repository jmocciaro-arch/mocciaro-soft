import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { parseOCPDF, detectOCDiscrepancies, type ParsedOC } from '@/lib/ai/parse-oc-pdf'

export const runtime = 'nodejs'
export const maxDuration = 60

/** Normaliza un fragmento para nombre de archivo: sin acentos, MAYÚSCULAS, espacios → '-'. */
function fileNamePart(raw: string | null | undefined, fallback: string, maxLen = 30): string {
  const cleaned = (raw ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '') // acentos fuera (diacríticos combinantes tras NFD)
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, maxLen)
    .replace(/-+$/g, '')
  return cleaned || fallback
}

/**
 * Nombre canónico con el que la OC queda guardada en el sistema:
 *   fecha_CLIENTE_OC-numero_MONEDA_monto_PROVEEDOR.pdf
 * donde "proveedor" es la empresa nuestra que recibe la OC.
 * Ej: 2026-07-07_ACEROS-DEL-PLATA_OC-4521_USD_12450.00_TORQUETOOLS.pdf
 */
function buildOCFileName(parsed: ParsedOC, computedTotal: number, companyName: string | null): string {
  // Fecha de la propia OC si el parser la devolvió en ISO; si no, hoy.
  const fecha = /^\d{4}-\d{2}-\d{2}$/.test(parsed.fecha ?? '')
    ? (parsed.fecha as string)
    : new Date().toISOString().slice(0, 10)
  const cliente = fileNamePart(parsed.emisor_razon_social, 'CLIENTE')
  const numero = fileNamePart(parsed.numero_oc, 'SN', 20)
  const moneda = fileNamePart(parsed.moneda, 'ARS', 5)
  const monto = computedTotal.toFixed(2)
  const proveedor = fileNamePart(companyName, 'EMPRESA')
  return `${fecha}_${cliente}_OC-${numero}_${moneda}_${monto}_${proveedor}.pdf`
}

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

    // Total: SIEMPRE la suma de items, no el total que reporta la IA (puede
    // alucinar). Se usa acá para el nombre canónico y más abajo para el doc.
    const computedTotal = (result.data.items || []).reduce(
      (sum, it) => sum + (it.cantidad || 0) * (it.precio_unitario || 0),
      0
    )

    // Nombre canónico del archivo: la OC queda guardada en el sistema
    // renombrada como fecha_cliente_OC-numero_moneda_monto_proveedor.pdf
    // (proveedor = la empresa nuestra que recibe la OC). El nombre original
    // se conserva en metadata para trazabilidad.
    let companyName: string | null = null
    if (companyId) {
      const { data: companyRow } = await supabase
        .from('tt_companies')
        .select('name')
        .eq('id', companyId)
        .maybeSingle()
      companyName = companyRow?.name ?? null
    }
    const canonicalFileName = buildOCFileName(result.data, computedTotal, companyName)

    // Subir el PDF a Storage (bucket privado 'client-pos').
    // pdf_storage_path se devuelve al frontend para que después de guardar la
    // cotización el endpoint /api/oc/attach-to-quote lo mueva al bucket
    // 'document-attachments' y lo registre como attachment con category='oc_cliente'.
    let pdfUrl: string | null = null
    let pdfStoragePath: string | null = null
    if (companyId) {
      // Date.now() en el path evita colisiones si la misma OC se sube dos veces;
      // el nombre visible para el usuario es canonicalFileName (sin timestamp).
      const path = `${companyId}/${Date.now()}_${canonicalFileName}`
      const { error: upErr } = await supabase.storage
        .from('client-pos')
        .upload(path, buf, { contentType: 'application/pdf' })
      if (!upErr) {
        pdfStoragePath = path
        const { data: pub } = supabase.storage.from('client-pos').getPublicUrl(path)
        // publicUrl es solo de referencia (el bucket es privado, el download
        // real necesita signed URL o usa el endpoint de attachments).
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
        // Normalizar nullables de la DB al shape que espera detectOCDiscrepancies
        const quoteItems = items.map((it) => ({
          sku: it.sku ?? undefined,
          description: it.description ?? undefined,
          quantity: Number(it.quantity) || 0,
          unit_price: Number(it.unit_price) || 0,
        }))
        discrepancies = detectOCDiscrepancies(result.data.items, quoteItems)
      }
    }

    // Guardar en tt_oc_parsed
    let ocParsedId: string | undefined
    if (createDocument) {
      // Guardamos el total reportado por la IA en metadata por trazabilidad
      // y para detectar mismatches contra computedTotal (calculado arriba).
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
            // Trazabilidad del archivo: nombre con el que llegó vs. cómo quedó guardado
            original_file_name: file.name,
            canonical_file_name: canonicalFileName,
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
          file_name: canonicalFileName,
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
      // pdf_storage_path + pdf_file_name: para que el cotizador llame a
      // /api/oc/attach-to-quote después de guardar la cotización y persistir
      // el PDF como attachment con category='oc_cliente'. pdf_file_name es el
      // nombre canónico: attach-to-quote lo usa como nombre visible del
      // attachment y para su check de idempotencia.
      pdf_storage_path: pdfStoragePath,
      pdf_file_name: pdfStoragePath ? canonicalFileName : null,
      ocParsedId,
      documentCreated: createDocument,
    })
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 500 })
  }
}
