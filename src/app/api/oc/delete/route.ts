import { NextRequest, NextResponse } from 'next/server'
import { createClient as createServiceClient } from '@supabase/supabase-js'
import { createClient } from '@/lib/supabase/server'

export const runtime = 'nodejs'

/**
 * POST /api/oc/delete
 * Body: { ocId: string, reason: string }
 *
 * Borra (soft-delete) una OC. Solo admins.
 * Marca deletion_status='deleted' + active=false, registra razón en audit log.
 */
export async function POST(req: NextRequest) {
  try {
    const { ocId, reason } = await req.json()
    if (!ocId) return NextResponse.json({ error: 'ocId requerido' }, { status: 400 })
    if (!reason || !reason.trim()) {
      return NextResponse.json({ error: 'Motivo obligatorio' }, { status: 400 })
    }

    // Validar que el usuario esté autenticado y sea admin
    const supabaseAuth = await createClient()
    const { data: { user } } = await supabaseAuth.auth.getUser()
    if (!user) return NextResponse.json({ error: 'No autenticado' }, { status: 401 })

    const { data: ttUser } = await supabaseAuth
      .from('tt_users')
      .select('id')
      .eq('auth_id', user.id)
      .single()
    if (!ttUser) return NextResponse.json({ error: 'Usuario no encontrado' }, { status: 401 })

    // Chequear rol admin
    const { data: roles } = await supabaseAuth
      .from('tt_user_roles')
      .select('role:tt_roles(name)')
      .eq('user_id', ttUser.id)
    const roleNames = (roles || []).map((r: Record<string, unknown>) => (r.role as Record<string, unknown>)?.name as string)
    const isAdmin = roleNames.includes('admin') || roleNames.includes('super_admin')
    if (!isAdmin) {
      return NextResponse.json({
        error: 'Solo administradores pueden borrar OCs. Usá "Solicitar eliminación" si no sos admin.',
      }, { status: 403 })
    }

    // Usar service role para el update + audit
    const supabase = createServiceClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
      { auth: { persistSession: false } }
    )

    // Snapshot antes de borrar (audit)
    const { data: snapshot } = await supabase
      .from('tt_oc_parsed')
      .select('*')
      .eq('id', ocId)
      .single()

    // Soft-delete: marcar como deleted
    const { error: updErr } = await supabase
      .from('tt_oc_parsed')
      .update({
        deletion_status: 'deleted',
        deletion_reviewed_by: ttUser.id,
        deletion_reviewed_at: new Date().toISOString(),
        deletion_reason: reason.trim(),
      })
      .eq('id', ocId)
    if (updErr) return NextResponse.json({ error: updErr.message }, { status: 500 })

    // Log de audit
    await supabase.from('tt_oc_audit_log').insert({
      oc_parsed_id: ocId,
      action: 'deleted',
      performed_by: ttUser.id,
      reason: reason.trim(),
      snapshot,
    })

    return NextResponse.json({ ok: true, message: 'OC eliminada correctamente' })
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 500 })
  }
}
