/**
 * OC PARSER — Parsea orden de compra del cliente y la matchea con una cotización.
 */

export interface ParsedOCItem {
  linea?: number
  codigo?: string
  descripcion: string
  cantidad: number
  precio_unitario?: number
  subtotal?: number
  iva_pct?: number
  fecha_entrega?: string
  observaciones?: string
}

export interface ParsedOC {
  numero_oc?: string
  fecha?: string
  emisor_razon_social?: string
  emisor_cuit?: string
  receptor_razon_social?: string
  receptor_cuit?: string
  condicion_pago?: string
  condicion_entrega?: string
  direccion_entrega?: string
  moneda?: string
  items: ParsedOCItem[]
  subtotal?: number
  iva?: number
  total?: number
  observaciones?: string
  confidence: number
  provider_used?: 'gemini' | 'claude'
}

export interface OCDiscrepancy {
  type: 'missing_item' | 'extra_item' | 'price_mismatch' | 'qty_mismatch' | 'description_mismatch'
  line?: number
  detail: string
  ocValue?: string | number
  quoteValue?: string | number
  severity: 'low' | 'medium' | 'high'
}

const SYSTEM_PROMPT = `Sos un experto en lectura de órdenes de compra (OC / Purchase Orders) argentinas.
Extraés los datos en JSON estricto, sin texto extra ni bloques markdown.
Si un campo no se encuentra, omitirlo. Fechas ISO YYYY-MM-DD.`

const USER_PROMPT = `Extraé los datos de esta orden de compra en el siguiente JSON:

{
  "numero_oc": "PO-2025-00123",
  "fecha": "YYYY-MM-DD",
  "emisor_razon_social": "Empresa que emite la OC (el cliente)",
  "emisor_cuit": "",
  "receptor_razon_social": "Empresa proveedora (nosotros)",
  "receptor_cuit": "",
  "condicion_pago": "Contado | 30 días | etc",
  "condicion_entrega": "FOB origen | CIF | etc",
  "direccion_entrega": "",
  "moneda": "ARS|USD|EUR",
  "items": [
    {
      "linea": 1,
      "codigo": "SKU",
      "descripcion": "",
      "cantidad": 1,
      "precio_unitario": 0,
      "subtotal": 0,
      "iva_pct": 21,
      "fecha_entrega": "YYYY-MM-DD"
    }
  ],
  "subtotal": 0,
  "iva": 0,
  "total": 0,
  "observaciones": "",
  "confidence": 0.95
}`

async function parseWithGemini(pdfBase64: string): Promise<ParsedOC | null> {
  const apiKey = process.env.GEMINI_API_KEY
  if (!apiKey) return null
  try {
    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${apiKey}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          system_instruction: { parts: [{ text: SYSTEM_PROMPT }] },
          contents: [{
            role: 'user',
            parts: [
              { text: USER_PROMPT },
              { inline_data: { mime_type: 'application/pdf', data: pdfBase64 } },
            ],
          }],
          generationConfig: { temperature: 0.1, maxOutputTokens: 4096, responseMimeType: 'application/json' },
        }),
      }
    )
    if (!res.ok) return null
    const data = await res.json()
    const content = data.candidates?.[0]?.content?.parts?.[0]?.text
    if (!content) return null
    const parsed = JSON.parse(content) as ParsedOC
    parsed.provider_used = 'gemini'
    return parsed
  } catch {
    return null
  }
}

async function parseWithClaude(pdfBase64: string): Promise<ParsedOC | null> {
  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey) return null
  try {
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-api-key': apiKey, 'anthropic-version': '2023-06-01' },
      body: JSON.stringify({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 4096,
        system: SYSTEM_PROMPT,
        messages: [{
          role: 'user',
          content: [
            { type: 'document', source: { type: 'base64', media_type: 'application/pdf', data: pdfBase64 } },
            { type: 'text', text: USER_PROMPT },
          ],
        }],
      }),
    })
    if (!res.ok) return null
    const data = await res.json()
    const text = data.content?.[0]?.text
    const jsonMatch = text?.match(/\{[\s\S]*\}/)
    const parsed = JSON.parse(jsonMatch ? jsonMatch[0] : text) as ParsedOC
    parsed.provider_used = 'claude'
    return parsed
  } catch {
    return null
  }
}

export async function parseOCPDF(pdfBuffer: Buffer | Uint8Array): Promise<{ data: ParsedOC | null; error?: string }> {
  const b64 = Buffer.from(pdfBuffer).toString('base64')
  const gemini = await parseWithGemini(b64)
  if (gemini && (gemini.items?.length || gemini.numero_oc)) return { data: gemini }
  const claude = await parseWithClaude(b64)
  if (claude) return { data: claude }
  return { data: null, error: 'No se pudo extraer la OC con ninguno de los proveedores de IA.' }
}

/**
 * Compara items de la OC con los de una cotización y reporta discrepancias.
 */
export function detectOCDiscrepancies(
  ocItems: ParsedOCItem[],
  quoteItems: Array<{ sku?: string; description?: string; quantity: number; unit_price: number }>
): OCDiscrepancy[] {
  const discrepancies: OCDiscrepancy[] = []

  // Match por SKU primero, descripción fuzzy después
  const matches = new Map<number, number>() // ocIdx → quoteIdx

  ocItems.forEach((ocItem, i) => {
    let matched = -1
    if (ocItem.codigo) {
      matched = quoteItems.findIndex((q) => q.sku && q.sku.toLowerCase() === ocItem.codigo!.toLowerCase())
    }
    if (matched === -1 && ocItem.descripcion) {
      matched = quoteItems.findIndex(
        (q) => q.description && q.description.toLowerCase().includes(ocItem.descripcion.toLowerCase().slice(0, 15))
      )
    }
    if (matched !== -1) matches.set(i, matched)
  })

  // 1) Items de la OC que no están en la cotización
  ocItems.forEach((ocItem, i) => {
    if (!matches.has(i)) {
      discrepancies.push({
        type: 'missing_item',
        line: ocItem.linea ?? i + 1,
        detail: `OC pide "${ocItem.descripcion}" (cant ${ocItem.cantidad}) pero no está en la cotización`,
        ocValue: ocItem.descripcion,
        severity: 'high',
      })
    } else {
      const q = quoteItems[matches.get(i)!]
      if (Math.abs(ocItem.cantidad - q.quantity) > 0.001) {
        discrepancies.push({
          type: 'qty_mismatch',
          line: ocItem.linea ?? i + 1,
          detail: `Cant diferente: OC=${ocItem.cantidad} vs Cot=${q.quantity}`,
          ocValue: ocItem.cantidad,
          quoteValue: q.quantity,
          severity: 'medium',
        })
      }
      if (ocItem.precio_unitario != null && Math.abs(ocItem.precio_unitario - q.unit_price) > 0.01) {
        discrepancies.push({
          type: 'price_mismatch',
          line: ocItem.linea ?? i + 1,
          detail: `Precio diferente: OC=${ocItem.precio_unitario} vs Cot=${q.unit_price}`,
          ocValue: ocItem.precio_unitario,
          quoteValue: q.unit_price,
          severity: 'high',
        })
      }
    }
  })

  // 2) Items cotizados que no están en la OC
  const matchedQuoteIdx = new Set(matches.values())
  quoteItems.forEach((q, i) => {
    if (!matchedQuoteIdx.has(i)) {
      discrepancies.push({
        type: 'extra_item',
        detail: `La cotización incluía "${q.description}" pero no está en la OC`,
        quoteValue: q.description,
        severity: 'low',
      })
    }
  })

  return discrepancies
}
