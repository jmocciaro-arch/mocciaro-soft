import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { requireAdmin } from '@/lib/auth/require-admin'
import { documentDeriveSchema } from '@/lib/schemas/documents'
import { deriveDocument } from '@/lib/documents/engine'

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
  return NextResponse.json(
    { success: true, document_id: result.documentId, relation: result.relation },
    { status: 201 }
  )
}
