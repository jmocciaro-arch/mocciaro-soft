import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { requireAdmin } from '@/lib/auth/require-admin'
import { documentIssueSchema } from '@/lib/schemas/documents'
import { issueDocument } from '@/lib/documents/engine'

type Ctx = { params: Promise<{ id: string }> }

// POST /api/documents/:id/issue — asigna número, renderiza code, bloquea
export async function POST(req: NextRequest, { params }: Ctx) {
  const guard = await requireAdmin()
  if (!guard.ok) return guard.response
  const { id } = await params

  let body: unknown = {}
  try { body = await req.json() } catch { /* body opcional */ }
  const parsed = documentIssueSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: 'Validación falló', issues: z.treeifyError(parsed.error) }, { status: 400 })
  }

  const result = await issueDocument({
    documentId: id,
    actorId: guard.ttUserId,
    docDate: parsed.data.doc_date,
  })

  if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status })
  return NextResponse.json({ success: true, number: result.number, code: result.code, year: result.year })
}
