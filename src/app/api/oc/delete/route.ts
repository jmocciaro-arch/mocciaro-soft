import { NextRequest, NextResponse } from 'next/server'
import { getAdminClient } from '@/lib/supabase/admin'
import { withCompanyFilter } from '@/lib/auth/with-company-filter'

export const runtime = 'nodejs'

/**
 * POST /api/oc/delete
 * Body: { ocId: string, reason: string }
 *
 * Borra (soft-delete) una OC. Solo admins.
 * Marca deletion_status='deleted' + active=false, registra razón en audit log.
 *
 * SECURITY (Fase 0.2):
 * - withCompanyFilter() valida usuario admin/super_admin.
 * - assertAccess(oc.company_id) impide borrar OC de otra empresa.
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

    if (!guard.isAdmin) {
      return NextResponse.json({
        error: 'Solo administradores pueden borrar OCs. Usá "Solicitar eliminación" si no sos admin.',
      }, { status: 403 })
    }

    const supabase = getAdminClient()

    // Snapshot antes de borrar (audit) + chequeo de acceso
    const { data: snapshot } = await supabase
      .from('tt_oc_parsed')
      .select('*')
      .eq('id', ocId)
      .single()

    if (!snapshot) return NextResponse.json({ error: 'OC no encontrada' }, { status: 404 })

    if (!guard.assertAccess((snapshot as { company_id: string | null }).company_id)) {
      return NextResponse.json({ error: 'Acceso denegado a esta OC' }, { status: 403 })
    }

    // Soft-delete: marcar como deleted
    const { error: updErr } = await supabase
      .from('tt_oc_parsed')
      .update({
        deletion_status: 'deleted',
        deletion_reviewed_by: guard.ttUserId,
        deletion_reviewed_at: new Date().toISOString(),
        deletion_reason: reason.trim(),
      })
      .eq('id', ocId)
    if (updErr) return NextResponse.json({ error: updErr.message }, { status: 500 })

    // Log de audit
    await supabase.from('tt_oc_audit_log').insert({
      oc_parsed_id: ocId,
      action: 'deleted',
      performed_by: guard.ttUserId,
      reason: reason.trim(),
      snapshot,
    })

    return NextResponse.json({ ok: true, message: 'OC eliminada correctamente' })
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 500 })
  }
}
