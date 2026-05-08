import { NextRequest, NextResponse } from 'next/server'
import { getAdminClient } from '@/lib/supabase/admin'
import { withCompanyFilter } from '@/lib/auth/with-company-filter'

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

    const guard = await withCompanyFilter()
    if (!guard.ok) return guard.response
    if (!guard.isAdmin) {
      return NextResponse.json({ error: 'Solo admin puede revisar solicitudes' }, { status: 403 })
    }

    const supabase = getAdminClient()

    // Obtener snapshot antes del cambio
    const { data: snapshot } = await supabase
      .from('tt_oc_parsed')
      .select('*')
      .eq('id', ocId)
      .single()
    if (!snapshot) return NextResponse.json({ error: 'OC no encontrada' }, { status: 404 })

    if (!guard.assertAccess((snapshot as { company_id: string | null }).company_id)) {
      return NextResponse.json({ error: 'Acceso denegado a esta OC' }, { status: 403 })
    }
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
        deletion_reviewed_by: guard.ttUserId,
        deletion_reviewed_at: new Date().toISOString(),
        deletion_review_notes: notes?.trim() || null,
      })
      .eq('id', ocId)
    if (updErr) return NextResponse.json({ error: updErr.message }, { status: 500 })

    await supabase.from('tt_oc_audit_log').insert({
      oc_parsed_id: ocId,
      action: approve ? 'deletion_approved' : 'deletion_rejected',
      performed_by: guard.ttUserId,
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
