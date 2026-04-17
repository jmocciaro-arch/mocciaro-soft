/**
 * PARSEO DE PDF DE FACTURA CON IA
 *
 * Estrategia: Gemini primero (rápido y más barato), Claude como fallback.
 * El PDF se convierte a base64 y se envía al modelo con un prompt estructurado
 * que pide un JSON con los campos de la factura argentina.
 */

import type { ExtractedInvoiceData } from './invoice-types'

const SYSTEM_PROMPT = `Sos un experto en lectura de facturas argentinas (AFIP).
Extraés los datos de la factura en JSON estricto.
Respondés SIEMPRE con un único objeto JSON, sin texto extra, sin bloques \`\`\`json.
Si un campo no se encuentra, omitirlo (no inventar).
Fechas en formato ISO YYYY-MM-DD.
Montos numéricos sin separadores de miles, usando punto decimal.`

const USER_PROMPT = `Extraé los datos de esta factura en el siguiente esquema JSON:

{
  "tipo": "Factura A|B|C | Nota Crédito A|B|C",
  "punto_venta": "0001",
  "numero": "00001234",
  "numero_completo": "0001-00001234",
  "fecha": "YYYY-MM-DD",
  "cae": "12345678901234",
  "cae_vto": "YYYY-MM-DD",
  "emisor_razon_social": "",
  "emisor_cuit": "",
  "emisor_domicilio": "",
  "cliente_razon_social": "",
  "cliente_cuit": "",
  "cliente_condicion_iva": "Responsable Inscripto|Monotributo|Consumidor Final|Exento",
  "items": [{"descripcion":"","cantidad":1,"precio_unitario":0,"subtotal":0,"iva_pct":21}],
  "subtotal": 0,
  "iva_21": 0,
  "iva_105": 0,
  "total": 0,
  "moneda": "ARS|USD|EUR",
  "condicion_venta": "Contado|Cuenta Corriente",
  "confidence": 0.95
}`

// =====================================================
// GEMINI: soporta PDF nativo via inline_data
// =====================================================

async function parseWithGemini(pdfBase64: string): Promise<ExtractedInvoiceData | null> {
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
          contents: [
            {
              role: 'user',
              parts: [
                { text: USER_PROMPT },
                { inline_data: { mime_type: 'application/pdf', data: pdfBase64 } },
              ],
            },
          ],
          generationConfig: {
            temperature: 0.1,
            maxOutputTokens: 4096,
            responseMimeType: 'application/json',
          },
        }),
      }
    )

    if (!res.ok) {
      console.error('Gemini parse error:', res.status, await res.text())
      return null
    }

    const data = await res.json()
    const content = data.candidates?.[0]?.content?.parts?.[0]?.text
    if (!content) return null

    const parsed = JSON.parse(content) as ExtractedInvoiceData
    parsed.provider_used = 'gemini'
    return parsed
  } catch (err) {
    console.error('Gemini parse exception:', err)
    return null
  }
}

// =====================================================
// CLAUDE: soporta PDF como document content block
// =====================================================

async function parseWithClaude(pdfBase64: string): Promise<ExtractedInvoiceData | null> {
  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey) return null

  try {
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 4096,
        system: SYSTEM_PROMPT,
        messages: [
          {
            role: 'user',
            content: [
              {
                type: 'document',
                source: { type: 'base64', media_type: 'application/pdf', data: pdfBase64 },
              },
              { type: 'text', text: USER_PROMPT },
            ],
          },
        ],
      }),
    })

    if (!res.ok) {
      console.error('Claude parse error:', res.status, await res.text())
      return null
    }

    const data = await res.json()
    const text = data.content?.[0]?.text
    if (!text) return null

    // Claude a veces envuelve el JSON en texto extra; extraer el primer {...}
    const jsonMatch = text.match(/\{[\s\S]*\}/)
    const jsonStr = jsonMatch ? jsonMatch[0] : text
    const parsed = JSON.parse(jsonStr) as ExtractedInvoiceData
    parsed.provider_used = 'claude'
    return parsed
  } catch (err) {
    console.error('Claude parse exception:', err)
    return null
  }
}

// =====================================================
// API PRINCIPAL: Gemini → Claude fallback
// =====================================================

export async function parseInvoicePDF(
  pdfBuffer: Buffer | Uint8Array
): Promise<{ data: ExtractedInvoiceData | null; error?: string }> {
  const pdfBase64 = Buffer.from(pdfBuffer).toString('base64')

  // Intento 1: Gemini
  const geminiResult = await parseWithGemini(pdfBase64)
  if (geminiResult && (geminiResult.numero || geminiResult.cae || geminiResult.total)) {
    return { data: geminiResult }
  }

  // Intento 2: Claude fallback
  const claudeResult = await parseWithClaude(pdfBase64)
  if (claudeResult) {
    return { data: claudeResult }
  }

  return {
    data: null,
    error: 'No se pudo extraer información del PDF con ninguno de los proveedores de IA.',
  }
}
