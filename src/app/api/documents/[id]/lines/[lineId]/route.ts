import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { getAdminClient } from '@/lib/supabase/admin'
import { requireAdmin } from '@/lib/auth/require-admin'
import { documentLineUpdateSchema, computeLineMoney } from '@/lib/schemas/documents'
import { addEvent } from '@/lib/documents/engine'

type Ctx = { params: Promise<{ id: string; lineId: string }> }

export async function PATCH(req: NextRequest, { params }: Ctx) {
  const guard = await requireAdmin()
  if (!guard.ok) return guard.response
  const { id, lineId } = await params

  let body: unknown
  try { body = await req.json() } catch {
    return NextResponse.json({ error: 'JSON inválido' }, { status: 400 })
  }
  const parsed = documentLineUpdateSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: 'Validación falló', issues: z.treeifyError(parsed.error) }, { status: 400 })
  }

  const admin = getAdminClient()
  const { data: doc } = await admin.from('tt_documents').select('status, locked').eq('id', id).maybeSingle()
  if (!doc) return NextResponse.json({ error: 'Documento no encontrado' }, { status: 404 })
  if (doc.locked || doc.status !== 'draft') {
    return NextResponse.json({ error: 'No se pueden editar líneas de un doc emitido' }, { status: 409 })
  }

  // Si cambian campos de cálculo, recomputar money
  const { data: current } = await admin.from('tt_document_lines').select('*').eq('id', lineId).eq('document_id', id).single()
  if (!current) return NextResponse.json({ error: 'Línea no encontrada' }, { status: 404 })

  const merged = { ...current, ...parsed.data }
  const money = computeLineMoney({
    quantity: Number(merged.quantity),
    unit_price: Number(merged.unit_price),
    discount_pct: Number(merged.discount_pct ?? 0),
    discount_amount: Number(parsed.data.discount_amount ?? 0),   // pct-derived se recomputa, manual viene del patch
    tax_rate: Number(merged.tax_rate ?? 0),
  })

  const { data, error } = await admin
    .from('tt_document_lines')
    .update({
      ...parsed.data,
      discount_amount: money.discount_amount,
      tax_amount: money.tax_amount,
      subtotal: money.subtotal,
      total: money.total,
    })
    .eq('id', lineId)
    .eq('document_id', id)
    .select()
    .single()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // Totales los recomputa el trigger tg_tt_document_lines_totals_upd (v38).
  await addEvent(admin, {
    documentId: id, eventType: 'line_updated', actorId: guard.ttUserId,
    payload: { line_id: lineId, fields: Object.keys(parsed.data) },
  })

  return NextResponse.json({ success: true, data })
}

export async function DELETE(_req: NextRequest, { params }: Ctx) {
  const guard = await requireAdmin()
  if (!guard.ok) return guard.response
  const { id, lineId } = await params

  const admin = getAdminClient()
  const { data: doc } = await admin.from('tt_documents').select('status, locked').eq('id', id).maybeSingle()
  if (!doc) return NextResponse.json({ error: 'Documento no encontrado' }, { status: 404 })
  if (doc.locked || doc.status !== 'draft') {
    return NextResponse.json({ error: 'No se pueden eliminar líneas de un doc emitido' }, { status: 409 })
  }

  const { error } = await admin.from('tt_document_lines').delete().eq('id', lineId).eq('document_id', id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // Totales los recomputa el trigger tg_tt_document_lines_totals_del (v38).
  await addEvent(admin, { documentId: id, eventType: 'line_removed', actorId: guard.ttUserId, payload: { line_id: lineId } })
  return NextResponse.json({ success: true })
}
