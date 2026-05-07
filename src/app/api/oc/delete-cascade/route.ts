import { NextRequest, NextResponse } from 'next/server'
import { createClient as createServiceClient } from '@supabase/supabase-js'
import { createClient } from '@/lib/supabase/server'

export const runtime = 'nodejs'

/**
 * POST /api/oc/delete-cascade
 * Body: { ocId: string, reason: string }
 *
 * Borra la OC + toda la cadena downstream:
 *   tt_oc_parsed (soft) → tt_documents OC (cancel) → cotización (cancel)
 *   → pedido/albarán/factura (cancel) → tt_document_items (hard)
 *   → tt_document_links (hard) → PDF en storage `client-pos` (hard)
 *
 * Solo admin / super_admin. Snapshot completo en tt_oc_audit_log antes
 * de tocar nada, así es recuperable manualmente si hace falta.
 */
export async function POST(req: NextRequest) {
  try {
    const { ocId, reason } = await req.json()
    if (!ocId) return NextResponse.json({ error: 'ocId requerido' }, { status: 400 })
    if (!reason || !reason.trim()) {
      return NextResponse.json({ error: 'Motivo obligatorio' }, { status: 400 })
    }

    // Auth + admin gate
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
      return NextResponse.json({
        error: 'El borrado en cascada solo lo puede hacer un administrador.',
      }, { status: 403 })
    }

    const supabase = createServiceClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
      { auth: { persistSession: false } }
    )

    // 1) Cargar OC parseada con FK al doc OC y al quote matcheado
    const { data: ocp, error: ocpErr } = await supabase
      .from('tt_oc_parsed')
      .select('*')
      .eq('id', ocId)
      .single()
    if (ocpErr || !ocp) {
      return NextResponse.json({ error: 'OC no encontrada' }, { status: 404 })
    }
    if (ocp.deletion_status === 'deleted') {
      return NextResponse.json({ error: 'La OC ya está eliminada' }, { status: 409 })
    }

    // 2) Construir el set de tt_documents involucrados, recorriendo links
    const docIds = new Set<string>()
    if (ocp.document_id) docIds.add(ocp.document_id) // el doc tipo orden_compra
    if (ocp.matched_quote_id) docIds.add(ocp.matched_quote_id) // la cotización generada/matcheada

    // BFS por tt_document_links: descendientes del quote matcheado
    const queue: string[] = ocp.matched_quote_id ? [ocp.matched_quote_id] : []
    const seen = new Set<string>(queue)
    while (queue.length > 0) {
      const parent = queue.shift()!
      const { data: children } = await supabase
        .from('tt_document_links')
        .select('child_id')
        .eq('parent_id', parent)
      for (const c of children || []) {
        const cid = (c as { child_id: string }).child_id
        if (cid && !seen.has(cid)) {
          seen.add(cid)
          docIds.add(cid)
          queue.push(cid)
        }
      }
    }

    const allDocIds = Array.from(docIds)

    // 3) Snapshot pre-cascade (auditoría — todo lo que vamos a tocar)
    const [docsSnap, itemsSnap, linksSnap] = await Promise.all([
      allDocIds.length > 0
        ? supabase.from('tt_documents').select('*').in('id', allDocIds)
        : Promise.resolve({ data: [] }),
      allDocIds.length > 0
        ? supabase.from('tt_document_items').select('*').in('document_id', allDocIds)
        : Promise.resolve({ data: [] }),
      allDocIds.length > 0
        ? supabase
            .from('tt_document_links')
            .select('*')
            .or(`parent_id.in.(${allDocIds.join(',')}),child_id.in.(${allDocIds.join(',')})`)
        : Promise.resolve({ data: [] }),
    ])

    const snapshot = {
      oc_parsed: ocp,
      documents: docsSnap.data || [],
      items: itemsSnap.data || [],
      links: linksSnap.data || [],
      doc_ids: allDocIds,
      reason: reason.trim(),
    }

    await supabase.from('tt_oc_audit_log').insert({
      oc_parsed_id: ocId,
      action: 'cascade_delete_started',
      performed_by: ttUser.id,
      reason: reason.trim(),
      snapshot,
    })

    // 4) Borrar items y links (hard delete — son dependientes)
    let itemsDeleted = 0
    let linksDeleted = 0
    if (allDocIds.length > 0) {
      const { count: ic } = await supabase
        .from('tt_document_items')
        .delete({ count: 'exact' })
        .in('document_id', allDocIds)
      itemsDeleted = ic || 0

      // Borrar links donde alguno de los lados sea uno de los docs
      const { count: lc } = await supabase
        .from('tt_document_links')
        .delete({ count: 'exact' })
        .or(`parent_id.in.(${allDocIds.join(',')}),child_id.in.(${allDocIds.join(',')})`)
      linksDeleted = lc || 0
    }

    // 5) Cancelar tt_documents (soft) — status='cancelled' + marca en metadata
    const cancelMeta = {
      cancelled_by_oc_cascade: {
        oc_parsed_id: ocId,
        oc_legal_number: ocp.parsed_items ? null : null, // info viene del doc OC ya snapshotteado
        reason: reason.trim(),
        cancelled_by: ttUser.id,
        cancelled_at: new Date().toISOString(),
      },
    }
    let docsCancelled = 0
    for (const docId of allDocIds) {
      const existing = (docsSnap.data || []).find((d: Record<string, unknown>) => d.id === docId) as Record<string, unknown> | undefined
      const prevMeta = (existing?.metadata as Record<string, unknown> | null) || {}
      const { error: cancelErr } = await supabase
        .from('tt_documents')
        .update({
          status: 'cancelled',
          metadata: { ...prevMeta, ...cancelMeta },
        })
        .eq('id', docId)
      if (!cancelErr) docsCancelled++
    }

    // 6) Borrar PDF en storage (bucket privado client-pos)
    let pdfDeleted = false
    if (ocp.file_url) {
      const path = extractStoragePath(ocp.file_url, 'client-pos')
      if (path) {
        const { error: rmErr } = await supabase.storage.from('client-pos').remove([path])
        if (!rmErr) pdfDeleted = true
      }
    }

    // 7) Soft-delete del tt_oc_parsed
    const { error: ocpDelErr } = await supabase
      .from('tt_oc_parsed')
      .update({
        deletion_status: 'deleted',
        deletion_reviewed_by: ttUser.id,
        deletion_reviewed_at: new Date().toISOString(),
        deletion_reason: reason.trim(),
        deletion_review_notes: 'cascade',
      })
      .eq('id', ocId)
    if (ocpDelErr) {
      return NextResponse.json({ error: ocpDelErr.message }, { status: 500 })
    }

    // 8) Audit final
    const result = {
      docs_cancelled: docsCancelled,
      docs_target_count: allDocIds.length,
      items_deleted: itemsDeleted,
      links_deleted: linksDeleted,
      pdf_deleted: pdfDeleted,
      doc_ids: allDocIds,
    }
    await supabase.from('tt_oc_audit_log').insert({
      oc_parsed_id: ocId,
      action: 'cascade_delete_completed',
      performed_by: ttUser.id,
      reason: reason.trim(),
      snapshot: result,
    })

    return NextResponse.json({
      ok: true,
      message: `OC eliminada en cascada: ${docsCancelled} documentos cancelados, ${itemsDeleted} líneas y ${linksDeleted} vínculos borrados${pdfDeleted ? ', PDF removido' : ''}.`,
      ...result,
    })
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 500 })
  }
}

/**
 * Extrae el path del archivo en storage desde una URL pública o firmada.
 * Acepta `/object/public/<bucket>/<path>` y `/object/sign/<bucket>/<path>?token=...`.
 */
function extractStoragePath(fileUrl: string, bucket: string): string | null {
  try {
    const u = new URL(fileUrl)
    const marker = `/${bucket}/`
    const idx = u.pathname.indexOf(marker)
    if (idx === -1) return null
    return decodeURIComponent(u.pathname.slice(idx + marker.length))
  } catch {
    return null
  }
}
