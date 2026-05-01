import { NextRequest, NextResponse } from 'next/server'
import { createClient as createServiceClient } from '@supabase/supabase-js'
import { createClient } from '@/lib/supabase/server'

export const runtime = 'nodejs'

/**
 * POST /api/oc/review-deletion
 * Body: { ocId: string, approve: boolean, notes?: string }
 *
 * Admin aprueba o rechaza una solicitud de eliminación pendiente.
 * - approve=true → la OC queda eliminada (soft-delete)
 * - approve=false → se vuelve a 'active', queda registrado en el audit log
 */
export async function POST(req: NextRequest) {
  try {
    const { ocId, approve, notes } = await req.json()
    if (!ocId) return NextResponse.json({ error: 'ocId requerido' }, { status: 400 })
    if (typeof approve !== 'boolean') {
      return NextResponse.json({ error: 'approve debe ser boolean' }, { status: 400 })
    }

    // Auth + admin check
    const supabaseAuth = await createClient()
    const { data: { user } } = await supabaseAuth.auth.getUser()
    if (!user) return NextResponse.json({ error: 'No autenticado' }, { status: 401 })

    const { data: ttUser } = await supabaseAuth
      .from('tt_users')
      .select('id')
      .eq('auth_id', user.id)
      .single()
    if (!ttUser) return NextResponse.json({ error: 'Usuario no encontrado' }, { status: 401 })

    const { data: roles } = await supabaseAuth
      .from('tt_user_roles')
      .select('role:tt_roles(name)')
      .eq('user_id', ttUser.id)
    const roleNames = (roles || []).map((r: Record<string, unknown>) => (r.role as Record<string, unknown>)?.name as string)
    const isAdmin = roleNames.includes('admin') || roleNames.includes('super_admin')
    if (!isAdmin) {
      return NextResponse.json({ error: 'Solo admin puede revisar solicitudes' }, { status: 403 })
    }

    const supabase = createServiceClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
      { auth: { persistSession: false } }
    )

    // Obtener snapshot antes del cambio
    const { data: snapshot } = await supabase
      .from('tt_oc_parsed')
      .select('*')
      .eq('id', ocId)
      .single()
    if (!snapshot) return NextResponse.json({ error: 'OC no encontrada' }, { status: 404 })
    if (snapshot.deletion_status !== 'deletion_requested') {
      return NextResponse.json({
        error: `La OC no tiene solicitud pendiente (estado: ${snapshot.deletion_status})`,
      }, { status: 409 })
    }

    const newStatus = approve ? 'deleted' : 'active'
    const { error: updErr } = await supabase
      .from('tt_oc_parsed')
      .update({
        deletion_status: newStatus,
        deletion_reviewed_by: ttUser.id,
        deletion_reviewed_at: new Date().toISOString(),
        deletion_review_notes: notes?.trim() || null,
      })
      .eq('id', ocId)
    if (updErr) return NextResponse.json({ error: updErr.message }, { status: 500 })

    await supabase.from('tt_oc_audit_log').insert({
      oc_parsed_id: ocId,
      action: approve ? 'deletion_approved' : 'deletion_rejected',
      performed_by: ttUser.id,
      reason: snapshot.deletion_reason,
      notes: notes?.trim() || null,
      snapshot: approve ? snapshot : null,
    })

    return NextResponse.json({
      ok: true,
      message: approve
        ? 'Solicitud aprobada. OC eliminada.'
        : 'Solicitud rechazada. La OC vuelve a estado activo.',
    })
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 500 })
  }
}
