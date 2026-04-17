import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { getAdminClient } from '@/lib/supabase/admin'
import { requireAdmin } from '@/lib/auth/require-admin'
import { documentLineCreateSchema, computeLineMoney } from '@/lib/schemas/documents'
import { addEvent } from '@/lib/documents/engine'

type Ctx = { params: Promise<{ id: string }> }

// POST /api/documents/:id/lines — crea línea. Solo si doc está draft.
export async function POST(req: NextRequest, { params }: Ctx) {
  const guard = await requireAdmin()
  if (!guard.ok) return guard.response
  const { id } = await params

  let body: unknown
  try { body = await req.json() } catch {
    return NextResponse.json({ error: 'JSON inválido' }, { status: 400 })
  }
  const parsed = documentLineCreateSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: 'Validación falló', issues: z.treeifyError(parsed.error) }, { status: 400 })
  }

  const admin = getAdminClient()
  const { data: doc } = await admin
    .from('tt_documents').select('status, locked').eq('id', id).maybeSingle()
  if (!doc) return NextResponse.json({ error: 'Documento no encontrado' }, { status: 404 })
  if (doc.locked || doc.status !== 'draft') {
    return NextResponse.json({ error: 'No se pueden agregar líneas a un doc emitido' }, { status: 409 })
  }

  // line_number auto si no vino
  let lineNumber = parsed.data.line_number
  if (!lineNumber) {
    const { data: last } = await admin
      .from('tt_document_lines').select('line_number').eq('document_id', id)
      .order('line_number', { ascending: false }).limit(1).maybeSingle()
    lineNumber = (last?.line_number ?? 0) + 1
  }

  const money = computeLineMoney({
    quantity: parsed.data.quantity,
    unit_price: parsed.data.unit_price ?? 0,
    discount_pct: parsed.data.discount_pct ?? 0,
    discount_amount: parsed.data.discount_amount ?? 0,
    tax_rate: parsed.data.tax_rate ?? 0,
  })

  const { data, error } = await admin
    .from('tt_document_lines')
    .insert({
      document_id: id,
      line_number: lineNumber,
      product_id: parsed.data.product_id ?? null,
      product_sku: parsed.data.product_sku ?? null,
      product_name: parsed.data.product_name,
      description: parsed.data.description ?? null,
      quantity: parsed.data.quantity,
      unit: parsed.data.unit ?? 'u',
      unit_price: parsed.data.unit_price ?? 0,
      discount_pct: parsed.data.discount_pct ?? 0,
      discount_amount: money.discount_amount,
      tax_rate: parsed.data.tax_rate ?? 0,
      tax_amount: money.tax_amount,
      subtotal: money.subtotal,
      total: money.total,
      attributes: parsed.data.attributes ?? {},
      image_url: parsed.data.image_url || null,
      notes: parsed.data.notes ?? null,
      source_line_id: parsed.data.source_line_id ?? null,
    })
    .select()
    .single()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // Totales los recomputa el trigger tg_tt_document_lines_totals_ins (v38).
  await addEvent(admin, {
    documentId: id, eventType: 'line_added', actorId: guard.ttUserId,
    payload: { line_id: data.id, line_number: lineNumber, product_name: parsed.data.product_name },
  })

  return NextResponse.json({ success: true, data }, { status: 201 })
}
