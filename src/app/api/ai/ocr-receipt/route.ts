import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

interface ReceiptItem {
  descripcion: string
  cantidad: number
  precio: number
}

interface ExtractedReceipt {
  proveedor: string | null
  fecha: string | null
  items: ReceiptItem[]
  subtotal: number | null
  iva: number | null
  total: number | null
  tipo_comprobante: string | null
  numero: string | null
  cuit_emisor: string | null
}

// POST /api/ai/ocr-receipt
// FormData: file (image/jpeg | image/png), companyId
export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData()
    const file = formData.get('file') as File | null
    const companyId = formData.get('companyId') as string | null

    if (!file) {
      return NextResponse.json({ error: 'file requerido' }, { status: 400 })
    }

    const apiKey = process.env.GEMINI_API_KEY
    if (!apiKey) {
      return NextResponse.json({ error: 'GEMINI_API_KEY no configurada' }, { status: 500 })
    }

    // Convert image to base64
    const arrayBuffer = await file.arrayBuffer()
    const base64 = Buffer.from(arrayBuffer).toString('base64')
    const mimeType = file.type || 'image/jpeg'

    const prompt = `Analizá esta imagen de un comprobante/ticket/factura y extraé todos los datos disponibles.

Respondé SOLO con un JSON con este formato exacto:
{
  "proveedor": "nombre del proveedor o null",
  "fecha": "fecha en formato YYYY-MM-DD o null",
  "items": [
    { "descripcion": "descripción del ítem", "cantidad": 1, "precio": 100.00 }
  ],
  "subtotal": 100.00,
  "iva": 21.00,
  "total": 121.00,
  "tipo_comprobante": "FACTURA A / TICKET / REMITO / etc o null",
  "numero": "número de comprobante o null",
  "cuit_emisor": "CUIT del emisor o null"
}

Si algún dato no está visible, dejalo como null.
Los números deben ser numéricos (no strings).
Respondé SOLO con el JSON, sin texto adicional.`

    const geminiRes = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${apiKey}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [
            {
              role: 'user',
              parts: [
                {
                  inline_data: {
                    mime_type: mimeType,
                    data: base64,
                  },
                },
                { text: prompt },
              ],
            },
          ],
          generationConfig: {
            maxOutputTokens: 1024,
            temperature: 0.1,
          },
        }),
      }
    )

    if (!geminiRes.ok) {
      const errText = await geminiRes.text()
      return NextResponse.json(
        { error: `Gemini API error ${geminiRes.status}: ${errText}` },
        { status: 502 }
      )
    }

    const geminiData = await geminiRes.json()
    const rawContent = geminiData.candidates?.[0]?.content?.parts?.[0]?.text || ''

    // Parse JSON response
    let extracted: ExtractedReceipt = {
      proveedor: null,
      fecha: null,
      items: [],
      subtotal: null,
      iva: null,
      total: null,
      tipo_comprobante: null,
      numero: null,
      cuit_emisor: null,
    }

    try {
      const jsonMatch = rawContent.match(/\{[\s\S]*\}/)
      if (jsonMatch) {
        extracted = JSON.parse(jsonMatch[0])
      }
    } catch {
      // Return raw if parse fails
    }

    // Optionally save as gasto document
    let docId: string | null = null
    if (companyId && extracted.total) {
      const { data: doc, error: docError } = await supabase
        .from('tt_documents')
        .insert({
          company_id: companyId,
          doc_type: 'gasto',
          status: 'borrador',
          description: extracted.proveedor
            ? `Gasto - ${extracted.proveedor}`
            : 'Gasto importado por OCR',
          total: extracted.total,
          subtotal: extracted.subtotal,
          tax_amount: extracted.iva,
          invoice_date: extracted.fecha || new Date().toISOString().split('T')[0],
          number: extracted.numero || null,
          ocr_extracted_data: extracted,
        })
        .select('id')
        .single()

      if (!docError && doc) {
        docId = doc.id as string
      }
    }

    return NextResponse.json({
      extracted,
      docId,
    })
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 500 })
  }
}
