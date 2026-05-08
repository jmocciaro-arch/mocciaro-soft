import { NextRequest, NextResponse } from 'next/server'
import { getAdminClient } from '@/lib/supabase/admin'
import { withCompanyFilter } from '@/lib/auth/with-company-filter'

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

    const guard = await withCompanyFilter()
    if (!guard.ok) return guard.response

    const supabase = getAdminClient()

    // Chequear estado actual + acceso a company
    const { data: oc } = await supabase
      .from('tt_oc_parsed')
      .select('deletion_status, company_id')
      .eq('id', ocId)
      .single()
    if (!oc) return NextResponse.json({ error: 'OC no encontrada' }, { status: 404 })

    if (!guard.assertAccess((oc as { company_id: string | null }).company_id)) {
      return NextResponse.json({ error: 'Acceso denegado a esta OC' }, { status: 403 })
    }
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
        deletion_requested_by: guard.ttUserId,
        deletion_requested_at: new Date().toISOString(),
        deletion_reason: reason.trim(),
      })
      .eq('id', ocId)
    if (updErr) return NextResponse.json({ error: updErr.message }, { status: 500 })

    await supabase.from('tt_oc_audit_log').insert({
      oc_parsed_id: ocId,
      action: 'deletion_requested',
      performed_by: guard.ttUserId,
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
