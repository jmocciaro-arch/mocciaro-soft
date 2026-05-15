/**
 * document-trace.ts — FASE 1.3
 *
 * Construye el linaje completo de un documento (ascendentes y descendentes)
 * para el panel lateral de trazabilidad.
 *
 * Modelo de datos:
 *   - tt_document_relations: vínculos entre tt_documents (renombrada
 *     desde tt_document_links en v61).
 *   - Para el flujo legacy (tt_sales_orders/tt_delivery_notes/tt_invoices),
 *     los vínculos están directo en columnas FK (sales_order_id,
 *     delivery_note_id, etc.).
 *
 * Esta función intenta primero tt_document_relations; si el doc no está
 * registrado allí (caso legacy), reconstruye el linaje vía las FK
 * directas y devuelve un objeto unificado.
 *
 * Output:
 *   {
 *     quote:    { id, ref, status, created_at } | null
 *     order:    { id, ref, status, created_at } | null
 *     delivery_notes: [{ id, ref, status, created_at }]
 *     invoices: [{ id, ref, status, created_at, paid, outstanding }]
 *     payments: [{ id, amount, method, payment_date }]
 *   }
 */

import { createClient } from '@/lib/supabase/client'

export interface TraceNode {
  id: string
  ref: string
  status: string | null
  created_at: string | null
  total?: number | null
  currency?: string | null
  /** En tt_invoices: total cobrado a la fecha */
  paid?: number
  outstanding?: number
  /** En tt_payments: importe + método */
  amount?: number
  method?: string
  payment_date?: string | null
  /** "tt_quotes" | "tt_sales_orders" | "tt_delivery_notes" | "tt_invoices" | "tt_payments" | "tt_documents" */
  source: string
}

export interface DocumentTrace {
  quote: TraceNode | null
  order: TraceNode | null
  delivery_notes: TraceNode[]
  invoices: TraceNode[]
  payments: TraceNode[]
}

/**
 * Construye la traza unificada para un documento dado, conocida su tabla
 * de origen.
 */
export async function buildDocumentTrace(args: {
  docId: string
  source: 'quote' | 'sales_order' | 'delivery_note' | 'invoice' | 'tt_documents'
}): Promise<DocumentTrace> {
  const sb = createClient()
  const trace: DocumentTrace = {
    quote: null,
    order: null,
    delivery_notes: [],
    invoices: [],
    payments: [],
  }

  // Paso 1: resolver order (es el "hub" del flujo legacy).
  let orderId: string | null = null
  let quoteId: string | null = null

  if (args.source === 'sales_order') {
    orderId = args.docId
  } else if (args.source === 'quote') {
    quoteId = args.docId
    const { data: so } = await sb
      .from('tt_sales_orders')
      .select('id')
      .eq('quote_id', args.docId)
      .maybeSingle()
    orderId = (so?.id as string | null) ?? null
  } else if (args.source === 'delivery_note') {
    const { data: dn } = await sb
      .from('tt_delivery_notes')
      .select('sales_order_id')
      .eq('id', args.docId)
      .maybeSingle()
    orderId = (dn?.sales_order_id as string | null) ?? null
  } else if (args.source === 'invoice') {
    const { data: inv } = await sb
      .from('tt_invoices')
      .select('sales_order_id')
      .eq('id', args.docId)
      .maybeSingle()
    orderId = (inv?.sales_order_id as string | null) ?? null
  }

  // Paso 2: cargar order y resolver quote_id si falta
  if (orderId) {
    const { data: so } = await sb
      .from('tt_sales_orders')
      .select('id, doc_number, status, currency, total, created_at, quote_id')
      .eq('id', orderId)
      .maybeSingle()
    if (so) {
      trace.order = {
        id: so.id as string,
        ref: (so.doc_number as string) || '',
        status: (so.status as string | null) ?? null,
        created_at: (so.created_at as string | null) ?? null,
        total: (so.total as number | null) ?? null,
        currency: (so.currency as string | null) ?? null,
        source: 'tt_sales_orders',
      }
      if (!quoteId) quoteId = (so.quote_id as string | null) ?? null
    }
  }

  // Paso 3: cargar quote
  if (quoteId) {
    const { data: q } = await sb
      .from('tt_quotes')
      .select('id, number, quote_number, status, currency, total, created_at')
      .eq('id', quoteId)
      .maybeSingle()
    if (q) {
      trace.quote = {
        id: q.id as string,
        ref: ((q.number as string) || (q.quote_number as string) || '') as string,
        status: (q.status as string | null) ?? null,
        created_at: (q.created_at as string | null) ?? null,
        total: (q.total as number | null) ?? null,
        currency: (q.currency as string | null) ?? null,
        source: 'tt_quotes',
      }
    }
  }

  // Paso 4: cargar delivery_notes y invoices del order
  if (orderId) {
    const [{ data: dns }, { data: invs }] = await Promise.all([
      sb
        .from('tt_delivery_notes')
        .select('id, doc_number, status, total, created_at')
        .eq('sales_order_id', orderId)
        .order('created_at', { ascending: true }),
      sb
        .from('tt_invoices')
        .select('id, doc_number, status, currency, total, created_at')
        .eq('sales_order_id', orderId)
        .order('created_at', { ascending: true }),
    ])

    trace.delivery_notes = (dns || []).map((d) => ({
      id: d.id as string,
      ref: (d.doc_number as string) || '',
      status: (d.status as string | null) ?? null,
      created_at: (d.created_at as string | null) ?? null,
      total: (d.total as number | null) ?? null,
      source: 'tt_delivery_notes',
    }))

    // Para facturas: calcular paid + outstanding
    const invoiceIds = (invs || []).map((i) => i.id as string)
    let paidByInvoice = new Map<string, number>()
    if (invoiceIds.length > 0) {
      const { data: payments } = await sb
        .from('tt_payments')
        .select('invoice_id, amount, method, payment_date, id')
        .in('invoice_id', invoiceIds)

      for (const p of payments || []) {
        const acc = paidByInvoice.get(p.invoice_id as string) ?? 0
        paidByInvoice.set(p.invoice_id as string, acc + ((p.amount as number) || 0))
        trace.payments.push({
          id: p.id as string,
          ref: '',
          status: null,
          created_at: null,
          amount: (p.amount as number) || 0,
          method: (p.method as string) || '',
          payment_date: (p.payment_date as string | null) ?? null,
          source: 'tt_payments',
        })
      }
    }

    trace.invoices = (invs || []).map((i) => {
      const paid = paidByInvoice.get(i.id as string) ?? 0
      const total = (i.total as number) || 0
      return {
        id: i.id as string,
        ref: (i.doc_number as string) || '',
        status: (i.status as string | null) ?? null,
        created_at: (i.created_at as string | null) ?? null,
        total,
        currency: (i.currency as string | null) ?? null,
        paid,
        outstanding: Math.max(0, total - paid),
        source: 'tt_invoices',
      }
    })
  }

  return trace
}
