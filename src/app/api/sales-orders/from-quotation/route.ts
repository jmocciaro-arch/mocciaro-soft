/**
 * POST /api/sales-orders/from-quotation
 *
 * Wrapper thin que recibe { source_doc_id } y llama a quoteToOrder().
 * Detecta automáticamente si el source está en tt_documents o tt_quotes
 * (legacy) y pasa el `source` correcto.
 *
 * Reusa toda la lógica de document-workflow.ts: validación payment_terms,
 * reserva de stock, copy de items, idempotencia por quote_id.
 */
import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { quoteToOrder } from '@/lib/document-workflow'
import { createClient as createServerClient } from '@/lib/supabase/server'
import { requireAuth } from '@/lib/auth/require-admin'
import { logger } from '@/lib/observability/logger'

export const runtime = 'nodejs'

const bodySchema = z.object({
  source_doc_id: z.string().uuid(),
})

export async function POST(req: NextRequest) {
  try {
    const raw = (await req.json().catch(() => null)) as unknown
    const parsed = bodySchema.safeParse(raw)
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Body inválido', details: parsed.error.flatten() },
        { status: 400 }
      )
    }
    const { source_doc_id } = parsed.data

    const guard = await requireAuth()
    if (!guard.ok) return guard.response

    // Detectar source: primero tt_documents, después tt_quotes (legacy)
    const sb = await createServerClient()
    const { data: docRow } = await sb
      .from('tt_documents')
      .select('id, doc_type, company_id, status')
      .eq('id', source_doc_id)
      .maybeSingle()

    let source: 'local' | 'tt_documents'
    let companyId: string | null = null

    if (docRow && ['presupuesto', 'quotation'].includes(String(docRow.doc_type))) {
      source = 'tt_documents'
      companyId = (docRow.company_id as string) ?? null
    } else {
      const { data: legacy } = await sb
        .from('tt_quotes')
        .select('id, company_id')
        .eq('id', source_doc_id)
        .maybeSingle()
      if (!legacy) {
        return NextResponse.json({ error: 'Cotización no encontrada' }, { status: 404 })
      }
      source = 'local'
      companyId = (legacy.company_id as string) ?? null
    }

    // Llamar quoteToOrder — ya valida payment_terms, reserva stock, etc.
    // Pasamos el server client (con cookies del user) para respetar RLS en tt_documents.
    const result = await quoteToOrder(source_doc_id, source, sb as unknown as Parameters<typeof quoteToOrder>[2])

    return NextResponse.json({
      sales_order_id: result.orderId,
      number: result.orderNumber,
      company_id: companyId,
      redirect_to: `/documentos/${result.orderId}`,
    })
  } catch (err) {
    logger.error('[POST /api/sales-orders/from-quotation] error:', err)
    return NextResponse.json({ error: (err as Error).message }, { status: 500 })
  }
}
