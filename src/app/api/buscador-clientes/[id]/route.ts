import { NextRequest, NextResponse } from 'next/server'
import { getAdminClient } from '@/lib/supabase/admin'

export const runtime = 'nodejs'

/**
 * PATCH /api/buscador-clientes/[id]
 * Aprueba o revoca el acceso de un cliente del buscador público.
 * Body: { approved: boolean }
 * Requiere autenticación de admin (server-side, service role).
 */
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params

  let body: { approved?: boolean }
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Body inválido' }, { status: 400 })
  }

  if (typeof body.approved !== 'boolean') {
    return NextResponse.json(
      { error: 'El campo "approved" es requerido y debe ser boolean' },
      { status: 400 }
    )
  }

  const supabase = getAdminClient()

  const updatePayload: Record<string, unknown> = {
    approved: body.approved,
  }

  if (body.approved) {
    updatePayload.approved_at = new Date().toISOString()
  } else {
    updatePayload.approved_at = null
  }

  const { data, error } = await supabase
    .from('buscador_clientes')
    .update(updatePayload)
    .eq('id', id)
    .select('id, approved, approved_at')
    .maybeSingle()

  if (error) {
    console.error('[buscador-clientes PATCH]', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  if (!data) {
    return NextResponse.json({ error: 'Cliente no encontrado' }, { status: 404 })
  }

  return NextResponse.json(data)
}
