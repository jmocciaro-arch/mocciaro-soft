/**
 * OC PARSER — Parsea orden de compra del cliente y la matchea con una cotización.
 *
 * OPTIMIZACIONES:
 * - Haiku 4.5 por default (3x más barato que Sonnet)
 * - Prompt caching: el system prompt se cachea (-90% costo en llamadas repetidas)
 * - Response cache: si el mismo PDF se sube dos veces, no se re-llama a la IA
 * - Usage tracking: cada llamada se registra en tt_ai_usage para analizar costos
 */

import { callClaude, hashInput, logUsage, DEFAULT_MODEL } from './ai-helper'

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

const SYSTEM_PROMPT = `Sos un experto en lectura de órdenes de compra (OC / Purchase Orders) latinoamericanas y europeas.
Extraés los datos en JSON estricto, sin texto extra ni bloques markdown.
Si un campo no se encuentra, omitirlo. Fechas ISO YYYY-MM-DD.

REGLA CRÍTICA: TODOS los items de la OC deben estar en el JSON.
No resumas ni omitas líneas. Si la OC tiene 50 items, el array "items" debe tener 50 entradas.
No cortes por espacio ni por longitud — preferí JSON más largo antes que perder datos.`

const USER_PROMPT = `Extraé TODOS los datos de esta orden de compra en el siguiente JSON.

IMPORTANTE: la OC puede tener muchas páginas. Recorré todas y extraé CADA ítem sin excepción.
Cuenta los items mentalmente antes de empezar y asegurate de incluirlos todos.

{
  "numero_oc": "49683",
  "fecha": "YYYY-MM-DD",
  "emisor_razon_social": "Empresa que emite la OC (el cliente)",
  "emisor_cuit": "",
  "receptor_razon_social": "Empresa proveedora (nosotros)",
  "receptor_cuit": "",
  "condicion_pago": "Contado | 30 días | etc",
  "condicion_entrega": "FOB | CIF | EXW | etc",
  "direccion_entrega": "",
  "moneda": "ARS|USD|EUR",
  "items": [
    {
      "linea": 1,
      "codigo": "SKU o Artículo",
      "descripcion": "descripción completa",
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

async function parseWithGemini(pdfBase64: string): Promise<{ data: ParsedOC | null; error?: string }> {
  const apiKey = process.env.GEMINI_API_KEY
  if (!apiKey) return { data: null, error: 'GEMINI_API_KEY no configurada' }
  const t0 = Date.now()
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
          generationConfig: { temperature: 0.1, maxOutputTokens: 8192, responseMimeType: 'application/json' },
        }),
      }
    )
    if (!res.ok) {
      const text = await res.text()
      console.error('[Gemini] HTTP', res.status, text.slice(0, 500))
      return { data: null, error: `Gemini ${res.status}: ${text.slice(0, 200)}` }
    }
    const data = await res.json()
    const content = data.candidates?.[0]?.content?.parts?.[0]?.text
    if (!content) {
      console.error('[Gemini] Respuesta sin content:', JSON.stringify(data).slice(0, 300))
      return { data: null, error: 'Gemini devolvió respuesta vacía' }
    }
    const parsed = JSON.parse(content) as ParsedOC
    parsed.provider_used = 'gemini'
    // Log de uso (Gemini Flash es gratis hasta cierto quota, costo = 0)
    await logUsage({
      operation: 'oc_parse',
      provider: 'gemini',
      model: 'gemini-2.0-flash',
      costUsd: 0,
      durationMs: Date.now() - t0,
    })
    return { data: parsed }
  } catch (err) {
    console.error('[Gemini] Exception:', err)
    return { data: null, error: `Gemini excepción: ${(err as Error).message}` }
  }
}

async function parseWithClaude(pdfBase64: string): Promise<{ data: ParsedOC | null; error?: string }> {
  // Usa el wrapper callClaude que incluye:
  // - Haiku 4.5 por default (3x más barato que Sonnet)
  // - Prompt caching del system prompt (-90% costo en llamadas repetidas)
  // - Response cache por hash del PDF (skip total si ya fue parseado)
  // - Log automático en tt_ai_usage
  const result = await callClaude({
    operation: 'oc_parse',
    systemPrompt: SYSTEM_PROMPT,
    userContent: [
      { type: 'document', source: { type: 'base64', media_type: 'application/pdf', data: pdfBase64 } },
      { type: 'text', text: USER_PROMPT },
    ],
    cacheKeyInput: pdfBase64,       // hasheamos el PDF → el mismo PDF → mismo resultado
    model: DEFAULT_MODEL,           // Haiku 4.5
    maxTokens: 16384,                // suficiente para OCs de ~80 items
    useCache: true,                  // consultar cache de respuestas
    cacheSystemPrompt: true,         // usar prompt caching ephemeral (reduce 90% tokens de system)
    referenceType: 'oc_parse',
  })

  if (!result.data) return { data: null, error: result.error }

  const jsonMatch = result.data.match(/\{[\s\S]*\}/)
  if (!jsonMatch) {
    return { data: null, error: 'Claude no devolvió JSON válido' }
  }
  try {
    const parsed = JSON.parse(jsonMatch[0]) as ParsedOC
    parsed.provider_used = 'claude'
    return { data: parsed }
  } catch (err) {
    return { data: null, error: `Error parseando JSON de Claude: ${(err as Error).message}` }
  }
}

export async function parseOCPDF(pdfBuffer: Buffer | Uint8Array): Promise<{ data: ParsedOC | null; error?: string }> {
  const b64 = Buffer.from(pdfBuffer).toString('base64')
  const errors: string[] = []

  // Orden priorizado:
  // 1. Claude Haiku (con cache de respuestas — si el PDF ya se procesó, es instantáneo y gratis)
  //    Haiku es más barato que Sonnet ($1/M input vs $3/M) y suficiente para extracción de OCs
  // 2. Gemini como fallback si Claude no está disponible o falla
  const claude = await parseWithClaude(b64)
  if (claude.data) return { data: claude.data }
  if (claude.error) errors.push(`Claude: ${claude.error}`)

  const gemini = await parseWithGemini(b64)
  if (gemini.data && (gemini.data.items?.length || gemini.data.numero_oc)) {
    return { data: gemini.data }
  }
  if (gemini.error) errors.push(`Gemini: ${gemini.error}`)

  return {
    data: null,
    error: errors.length
      ? `No se pudo extraer la OC. Errores: ${errors.join(' | ')}`
      : 'No se pudo extraer la OC con ninguno de los proveedores de IA.',
  }
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
