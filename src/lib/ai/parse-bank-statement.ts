/**
 * PARSE BANK STATEMENT + MATCH PAYMENTS
 *
 * 1) Parsea extracto bancario PDF/CSV → líneas estructuradas
 * 2) Intenta matchear cada línea con facturas pendientes
 * 3) IA asiste en las líneas que no matchean por algoritmo exacto
 */

export interface ParsedBankLine {
  line_number?: number
  date: string        // ISO YYYY-MM-DD
  description: string
  reference?: string
  amount: number      // positivo=crédito (cobro), negativo=débito (pago)
  balance?: number
  type?: 'credit' | 'debit' | 'fee' | 'interest' | 'other'
}

export interface ParsedBankStatement {
  bank_name?: string
  account_number?: string
  currency: string
  period_from?: string
  period_to?: string
  opening_balance?: number
  closing_balance?: number
  lines: ParsedBankLine[]
  confidence: number
  provider_used?: 'gemini' | 'claude'
}

const SYSTEM_PROMPT = `Sos un experto en extractos bancarios argentinos (Galicia, Santander, HSBC, Macro, BBVA, etc).
Extraés cada línea del extracto en JSON estricto, sin markdown ni texto extra.
Montos: positivos=ingresos/créditos, negativos=gastos/débitos.`

const USER_PROMPT = `Extraé TODAS las líneas del extracto en este formato JSON:

{
  "bank_name": "Banco XYZ",
  "account_number": "123-456-789",
  "currency": "ARS|USD|EUR",
  "period_from": "YYYY-MM-DD",
  "period_to": "YYYY-MM-DD",
  "opening_balance": 0,
  "closing_balance": 0,
  "lines": [
    {
      "line_number": 1,
      "date": "YYYY-MM-DD",
      "description": "Detalle del movimiento completo",
      "reference": "Nº comprobante, CBU, etc (si aparece)",
      "amount": 12345.67,
      "balance": 98765.43,
      "type": "credit|debit|fee|interest|other"
    }
  ],
  "confidence": 0.95
}`

async function parseWithGemini(pdfBase64: string): Promise<ParsedBankStatement | null> {
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
          generationConfig: { temperature: 0.1, maxOutputTokens: 8192, responseMimeType: 'application/json' },
        }),
      }
    )
    if (!res.ok) return null
    const data = await res.json()
    const content = data.candidates?.[0]?.content?.parts?.[0]?.text
    if (!content) return null
    const parsed = JSON.parse(content) as ParsedBankStatement
    parsed.provider_used = 'gemini'
    return parsed
  } catch {
    return null
  }
}

async function parseWithClaude(pdfBase64: string): Promise<ParsedBankStatement | null> {
  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey) return null
  try {
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-api-key': apiKey, 'anthropic-version': '2023-06-01' },
      body: JSON.stringify({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 8192,
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
    const parsed = JSON.parse(jsonMatch ? jsonMatch[0] : text) as ParsedBankStatement
    parsed.provider_used = 'claude'
    return parsed
  } catch {
    return null
  }
}

export async function parseBankStatement(pdfBuffer: Buffer | Uint8Array) {
  const b64 = Buffer.from(pdfBuffer).toString('base64')
  const gemini = await parseWithGemini(b64)
  if (gemini && gemini.lines?.length) return { data: gemini }
  const claude = await parseWithClaude(b64)
  if (claude) return { data: claude }
  return { data: null, error: 'No se pudo extraer el extracto con IA' }
}

// ===================================================================
// MATCHING con facturas pendientes
// ===================================================================

export interface OpenInvoice {
  document_id: string
  client_id?: string | null
  client_name?: string
  cuit?: string
  legal_number?: string
  invoice_number?: string
  invoice_date?: string
  total: number
  currency: string
  balance_due?: number
}

export interface MatchResult {
  line_index: number
  document_id?: string
  client_id?: string
  confidence: number     // 0-1
  method: 'amount_exact' | 'amount_close' | 'cuit_match' | 'reference_match' | 'ai_suggested' | 'unmatched'
  reason: string
}

/**
 * Matching determinístico rápido — ANTES de llamar a la IA.
 * Busca coincidencias exactas por:
 *   1) Nº de factura en description/reference
 *   2) CUIT en description/reference
 *   3) Monto exacto (solo si hay 1 única factura con ese monto)
 */
export function matchBankLinesDeterministic(
  lines: ParsedBankLine[],
  openInvoices: OpenInvoice[]
): MatchResult[] {
  const results: MatchResult[] = []

  lines.forEach((line, idx) => {
    if (line.amount <= 0) {
      results.push({ line_index: idx, confidence: 0, method: 'unmatched', reason: 'No es crédito' })
      return
    }

    const haystack = `${line.description} ${line.reference || ''}`.toLowerCase()

    // 1) Nº factura en descripción
    for (const inv of openInvoices) {
      const num = (inv.legal_number || inv.invoice_number || '').toLowerCase()
      if (num && num.length >= 4 && haystack.includes(num)) {
        results.push({
          line_index: idx,
          document_id: inv.document_id,
          client_id: inv.client_id || undefined,
          confidence: 0.95,
          method: 'reference_match',
          reason: `Nº factura ${num} encontrado en descripción`,
        })
        return
      }
    }

    // 2) CUIT en descripción
    for (const inv of openInvoices) {
      if (inv.cuit) {
        const cuitClean = inv.cuit.replace(/[^\d]/g, '')
        if (cuitClean.length >= 10 && haystack.replace(/[^\d]/g, '').includes(cuitClean)) {
          results.push({
            line_index: idx,
            document_id: inv.document_id,
            client_id: inv.client_id || undefined,
            confidence: 0.85,
            method: 'cuit_match',
            reason: `CUIT ${inv.cuit} encontrado en descripción`,
          })
          return
        }
      }
    }

    // 3) Monto exacto
    const exactAmountMatches = openInvoices.filter((inv) => Math.abs((inv.balance_due ?? inv.total) - line.amount) < 0.01)
    if (exactAmountMatches.length === 1) {
      const inv = exactAmountMatches[0]
      results.push({
        line_index: idx,
        document_id: inv.document_id,
        client_id: inv.client_id || undefined,
        confidence: 0.75,
        method: 'amount_exact',
        reason: `Monto exacto $${line.amount} (única factura con este monto)`,
      })
      return
    }

    // Sin match directo
    results.push({ line_index: idx, confidence: 0, method: 'unmatched', reason: 'Sin match directo' })
  })

  return results
}

/**
 * Para las líneas que no matchearon, le pide a la IA que sugiera.
 */
export async function matchBankLinesWithAI(
  unmatched: ParsedBankLine[],
  openInvoices: OpenInvoice[]
): Promise<Array<{ line_index: number; suggestions: Array<{ document_id: string; confidence: number; reason: string }> }>> {
  if (!unmatched.length || !openInvoices.length) return []

  const apiKey = process.env.GEMINI_API_KEY
  if (!apiKey) return []

  const prompt = `Sos un asistente de conciliación bancaria. Te paso movimientos de extracto sin matchear y facturas pendientes.
Para cada movimiento, sugerí la factura más probable (o ninguna si no hay match claro).
Responder JSON estricto.

MOVIMIENTOS (líneas no matcheadas):
${JSON.stringify(unmatched, null, 2)}

FACTURAS PENDIENTES:
${JSON.stringify(openInvoices, null, 2)}

Respondé:
{
  "matches": [
    {
      "line_index": 0,
      "suggestions": [
        { "document_id": "uuid", "confidence": 0.7, "reason": "por qué" }
      ]
    }
  ]
}`

  try {
    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${apiKey}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ role: 'user', parts: [{ text: prompt }] }],
          generationConfig: { temperature: 0.1, maxOutputTokens: 4096, responseMimeType: 'application/json' },
        }),
      }
    )
    if (!res.ok) return []
    const data = await res.json()
    const content = data.candidates?.[0]?.content?.parts?.[0]?.text
    const parsed = JSON.parse(content) as { matches: Array<{ line_index: number; suggestions: Array<{ document_id: string; confidence: number; reason: string }> }> }
    return parsed.matches || []
  } catch {
    return []
  }
}
