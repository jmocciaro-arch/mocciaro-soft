import { NextRequest, NextResponse } from 'next/server'
import { createClient as createServiceClient } from '@supabase/supabase-js'
import { createClient } from '@/lib/supabase/server'

export const runtime = 'nodejs'

/**
 * POST /api/oc/request-deletion
 * Body: { ocId: string, reason: string }
 *
 * Cualquier usuario autenticado solicita eliminar una OC.
 * Marca deletion_status='deletion_requested'. Admin debe aprobar/rechazar.
 */
export async function POST(req: NextRequest) {
  try {
    const { ocId, reason } = await req.json()
    if (!ocId) return NextResponse.json({ error: 'ocId requerido' }, { status: 400 })
    if (!reason || !reason.trim()) {
      return NextResponse.json({ error: 'Motivo obligatorio' }, { status: 400 })
    }

    // Auth
    const supabaseAuth = await createClient()
    const { data: { user } } = await supabaseAuth.auth.getUser()
    if (!user) return NextResponse.json({ error: 'No autenticado' }, { status: 401 })

    const { data: ttUser } = await supabaseAuth
      .from('tt_users')
      .select('id')
      .eq('auth_id', user.id)
      .single()
    if (!ttUser) return NextResponse.json({ error: 'Usuario no encontrado' }, { status: 401 })

    const supabase = createServiceClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
      { auth: { persistSession: false } }
    )

    // Chequear estado actual
    const { data: oc } = await supabase
      .from('tt_oc_parsed')
      .select('deletion_status')
      .eq('id', ocId)
      .single()
    if (!oc) return NextResponse.json({ error: 'OC no encontrada' }, { status: 404 })
    if (oc.deletion_status === 'deleted') {
      return NextResponse.json({ error: 'La OC ya está eliminada' }, { status: 409 })
    }
    if (oc.deletion_status === 'deletion_requested') {
      return NextResponse.json({
        error: 'Ya hay una solicitud de eliminación pendiente para esta OC',
      }, { status: 409 })
    }

    // Marcar como solicitada
    const { error: updErr } = await supabase
      .from('tt_oc_parsed')
      .update({
        deletion_status: 'deletion_requested',
        deletion_requested_by: ttUser.id,
        deletion_requested_at: new Date().toISOString(),
        deletion_reason: reason.trim(),
      })
      .eq('id', ocId)
    if (updErr) return NextResponse.json({ error: updErr.message }, { status: 500 })

    await supabase.from('tt_oc_audit_log').insert({
      oc_parsed_id: ocId,
      action: 'deletion_requested',
      performed_by: ttUser.id,
      reason: reason.trim(),
    })

    return NextResponse.json({
      ok: true,
      message: 'Solicitud enviada. Un administrador debe aprobarla.',
    })
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 500 })
  }
}
