import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { requireAdmin } from '@/lib/auth/require-admin'
import { documentDeriveSchema } from '@/lib/schemas/documents'
import { deriveDocument } from '@/lib/documents/engine'
import { reserveStockForDocument, consumeStockForDelivery } from '@/lib/stock-transactions'
import { createClient as createServiceClient } from '@supabase/supabase-js'

type Ctx = { params: Promise<{ id: string }> }

// POST /api/documents/:id/derive
// Body: { target_type, mode: 'full'|'selected', line_ids?, line_quantities?, copy_counterparty?, notes? }
export async function POST(req: NextRequest, { params }: Ctx) {
  const guard = await requireAdmin()
  if (!guard.ok) return guard.response
  const { id } = await params

  let body: unknown
  try { body = await req.json() } catch {
    return NextResponse.json({ error: 'JSON inválido' }, { status: 400 })
  }
  const parsed = documentDeriveSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: 'Validación falló', issues: z.treeifyError(parsed.error) }, { status: 400 })
  }

  const result = await deriveDocument({
    sourceDocumentId: id,
    targetType: parsed.data.target_type,
    mode: parsed.data.mode,
    lineIds: parsed.data.line_ids,
    lineQuantities: parsed.data.line_quantities,
    copyCounterparty: parsed.data.copy_counterparty,
    actorId: guard.ttUserId,
    notes: parsed.data.notes,
  })

  if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status })

  // ── Stock workflow hooks (best-effort, no abortan si fallan) ───────
  // - target = pedido → reservar stock disponible (modo no-strict).
  // - target = albarán → consumir reservas del pedido origen (FIFO).
  let stockHook: Record<string, unknown> | null = null
  try {
    const targetType = parsed.data.target_type
    if (targetType === 'sales_order') {
      const r = await reserveStockForDocument(result.documentId!, { strict: false })
      stockHook = {
        kind: 'reserve',
        ok: r.ok,
        rows: r.rows?.length || 0,
        has_shortfall: !!r.hasShortfall,
        shortfalls: r.rows?.filter((x) => x.shortfall > 0) || [],
        error: r.error,
      }
    } else if (targetType === 'delivery_note') {
      const sb = createServiceClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.SUPABASE_SERVICE_ROLE_KEY!,
        { auth: { persistSession: false } }
      )
      const { data: items } = await sb
        .from('tt_document_lines')
        .select('product_id, quantity')
        .eq('document_id', result.documentId)
      const consumeItems = (items || [])
        .filter((it: { product_id: string | null; quantity: number | null }) =>
          !!it.product_id && (it.quantity || 0) > 0
        )
        .map((it: { product_id: string | null; quantity: number | null }) => ({
          product_id: it.product_id as string,
          quantity: it.quantity as number,
        }))
      const r = await consumeStockForDelivery(id, consumeItems)
      stockHook = {
        kind: 'consume',
        ok: r.ok,
        rows: r.rows?.length || 0,
        consumed_total: r.rows?.reduce((s, x) => s + x.consumed_qty, 0) || 0,
        error: r.error,
      }
    }
  } catch (err) {
    stockHook = { ok: false, error: (err as Error).message }
  }

  return NextResponse.json(
    {
      success: true,
      document_id: result.documentId,
      relation: result.relation,
      stock_hook: stockHook,
    },
    { status: 201 }
  )
}
