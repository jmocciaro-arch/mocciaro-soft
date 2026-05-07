import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { requireAdmin } from '@/lib/auth/require-admin'
import { documentCancelSchema } from '@/lib/schemas/documents'
import { transitionStatus } from '@/lib/documents/engine'
import { releaseStockForDocument } from '@/lib/stock-transactions'

type Ctx = { params: Promise<{ id: string }> }

export async function POST(req: NextRequest, { params }: Ctx) {
  const guard = await requireAdmin()
  if (!guard.ok) return guard.response
  const { id } = await params

  let body: unknown
  try { body = await req.json() } catch {
    return NextResponse.json({ error: 'JSON inválido' }, { status: 400 })
  }
  const parsed = documentCancelSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: 'Validación falló', issues: z.treeifyError(parsed.error) }, { status: 400 })
  }

  const result = await transitionStatus({
    documentId: id,
    toStatus: 'cancelled',
    actorId: guard.ttUserId,
    notes: parsed.data.reason,
  })
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status })

  // Liberar reservas de stock si las había (best-effort, no aborta cancel).
  let stockHook: Record<string, unknown> | null = null
  try {
    const r = await releaseStockForDocument(id, parsed.data.reason || 'cancelled')
    stockHook = {
      kind: 'release',
      ok: r.ok,
      released: r.releasedCount || 0,
      error: r.error,
    }
  } catch (err) {
    stockHook = { ok: false, error: (err as Error).message }
  }

  return NextResponse.json({ success: true, stock_hook: stockHook })
}
