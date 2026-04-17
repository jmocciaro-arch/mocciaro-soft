/**
 * Aging report + AI collection suggestions
 *
 * Calcula el aging de cuentas a cobrar (0-30, 31-60, 61-90, +90 días)
 * y usa Gemini (fallback Claude) para sugerir estrategias de cobro por cliente.
 *
 * Usado por /api/cashflow/aging
 */

import { SupabaseClient } from '@supabase/supabase-js'

export type AgingBucket = '0-30' | '31-60' | '61-90' | '+90'

export interface AgingRow {
  client_id: string
  client_name: string
  invoices: AgingInvoice[]
  // Totales por bucket
  bucket_0_30: number
  bucket_31_60: number
  bucket_61_90: number
  bucket_90_plus: number
  total_owed: number
  // Días máximos en mora
  max_days_overdue: number
  // Última factura pagada (para historial)
  last_payment_date: string | null
  // Sugerencia IA
  ai_suggestion: string | null
  ai_suggestion_at: string | null
}

export interface AgingInvoice {
  id: string
  legal_number: string | null
  total: number
  currency: string
  invoice_date: string
  expected_due: string
  days_overdue: number
  bucket: AgingBucket
}

interface DocRow {
  id: string
  legal_number: string | null
  total: number | string
  currency: string
  invoice_date: string | null
  metadata: Record<string, unknown> | null
  client_id: string | null
  client: { name: string } | null
}

function getBucket(daysOverdue: number): AgingBucket {
  if (daysOverdue <= 30) return '0-30'
  if (daysOverdue <= 60) return '31-60'
  if (daysOverdue <= 90) return '61-90'
  return '+90'
}

export async function buildAgingReport(
  supabase: SupabaseClient,
  companyId: string
): Promise<AgingRow[]> {
  const today = new Date()
  today.setHours(0, 0, 0, 0)

  // 1) Facturas pendientes de cobro
  const { data: docs } = await supabase
    .from('tt_documents')
    .select('id, legal_number, total, currency, invoice_date, metadata, client_id, client:tt_clients(name)')
    .eq('company_id', companyId)
    .eq('type', 'factura')
    .in('status', ['emitida', 'autorizada', 'pendiente_cobro'])
    .order('invoice_date', { ascending: true })

  // 2) Última fecha de cobro por cliente (para historial)
  const { data: paidDocs } = await supabase
    .from('tt_documents')
    .select('client_id, updated_at')
    .eq('company_id', companyId)
    .eq('type', 'factura')
    .eq('status', 'cobrada')
    .order('updated_at', { ascending: false })

  const lastPaymentByClient: Record<string, string> = {}
  for (const d of (paidDocs || [])) {
    const doc = d as { client_id: string | null; updated_at: string }
    if (doc.client_id && !lastPaymentByClient[doc.client_id]) {
      lastPaymentByClient[doc.client_id] = doc.updated_at
    }
  }

  // 3) Agrupar por cliente
  const clientMap: Record<string, AgingRow> = {}

  for (const rawDoc of (docs || []) as unknown as DocRow[]) {
    if (!rawDoc.client_id) continue

    const cid = rawDoc.client_id
    const clientName = rawDoc.client?.name || 'Cliente sin nombre'
    const total = Number(rawDoc.total || 0)

    const emDate = rawDoc.invoice_date ? new Date(rawDoc.invoice_date) : today
    const payDays = (rawDoc.metadata?.payment_days as number) || 30
    const dueDate = new Date(emDate.getTime() + payDays * 86400000)
    const daysOverdue = Math.max(0, Math.round((today.getTime() - dueDate.getTime()) / 86400000))
    const bucket = getBucket(daysOverdue)

    if (!clientMap[cid]) {
      clientMap[cid] = {
        client_id: cid,
        client_name: clientName,
        invoices: [],
        bucket_0_30: 0,
        bucket_31_60: 0,
        bucket_61_90: 0,
        bucket_90_plus: 0,
        total_owed: 0,
        max_days_overdue: 0,
        last_payment_date: lastPaymentByClient[cid] || null,
        ai_suggestion: null,
        ai_suggestion_at: null,
      }
    }

    const row = clientMap[cid]
    row.invoices.push({
      id: rawDoc.id,
      legal_number: rawDoc.legal_number,
      total,
      currency: rawDoc.currency,
      invoice_date: rawDoc.invoice_date || '',
      expected_due: dueDate.toISOString().slice(0, 10),
      days_overdue: daysOverdue,
      bucket,
    })

    row.total_owed += total
    row.max_days_overdue = Math.max(row.max_days_overdue, daysOverdue)

    if (bucket === '0-30') row.bucket_0_30 += total
    else if (bucket === '31-60') row.bucket_31_60 += total
    else if (bucket === '61-90') row.bucket_61_90 += total
    else row.bucket_90_plus += total
  }

  return Object.values(clientMap).sort((a, b) => b.total_owed - a.total_owed)
}

/**
 * Genera sugerencia IA de cobro para un cliente específico.
 * Gemini primero, Claude como fallback.
 */
export async function getAgingAISuggestion(client: AgingRow): Promise<string> {
  const currencyLabel = client.invoices[0]?.currency || 'EUR'
  const fmt = (n: number) => n.toLocaleString('es-AR', { minimumFractionDigits: 2 })

  const prompt = `Sos un especialista en cobranzas B2B para una empresa de herramientas industriales en Argentina/España.
Analizá esta situación y dá una sugerencia concreta y accionable en español rioplatense (voseo).

CLIENTE: ${client.client_name}
TOTAL ADEUDADO: ${currencyLabel} ${fmt(client.total_owed)}
DÍAS MÁXIMOS EN MORA: ${client.max_days_overdue} días
ÚLTIMO PAGO REGISTRADO: ${client.last_payment_date ? new Date(client.last_payment_date).toLocaleDateString('es-AR') : 'Sin historial'}

DETALLE DE FACTURAS:
${client.invoices.map(inv =>
  `  - Factura ${inv.legal_number || inv.id.slice(0, 8)}: ${currencyLabel} ${fmt(inv.total)} — ${inv.days_overdue}d en mora (vto: ${inv.expected_due})`
).join('\n')}

DISTRIBUCIÓN POR BUCKET:
  - Corriente (0-30d): ${currencyLabel} ${fmt(client.bucket_0_30)}
  - 31-60d: ${currencyLabel} ${fmt(client.bucket_31_60)}
  - 61-90d: ${currencyLabel} ${fmt(client.bucket_61_90)}
  - +90d (crítico): ${currencyLabel} ${fmt(client.bucket_90_plus)}

Respondé con 2-3 acciones específicas y ordenadas por prioridad. Sin bullets ni markdown. Máximo 200 palabras.`

  // Gemini primero
  try {
    const geminiKey = process.env.GEMINI_API_KEY
    if (geminiKey) {
      const res = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${geminiKey}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            contents: [{ role: 'user', parts: [{ text: prompt }] }],
            generationConfig: { maxOutputTokens: 300, temperature: 0.3 },
          }),
        }
      )
      if (res.ok) {
        const data = await res.json()
        const text = data.candidates?.[0]?.content?.parts?.[0]?.text
        if (text?.trim()) return text.trim()
      }
    }
  } catch {
    // fallback a Claude
  }

  // Claude fallback
  try {
    const claudeKey = process.env.ANTHROPIC_API_KEY
    if (claudeKey) {
      const res = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': claudeKey,
          'anthropic-version': '2023-06-01',
        },
        body: JSON.stringify({
          model: 'claude-sonnet-4-20250514',
          max_tokens: 300,
          messages: [{ role: 'user', content: prompt }],
        }),
      })
      if (res.ok) {
        const data = await res.json()
        const text = data.content?.[0]?.text
        if (text?.trim()) return text.trim()
      }
    }
  } catch {
    // sin IA
  }

  return 'No hay IA configurada. Contactar al cliente directamente para coordinar el pago.'
}
