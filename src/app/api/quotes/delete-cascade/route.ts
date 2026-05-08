import { NextRequest, NextResponse } from 'next/server'
import { getAdminClient } from '@/lib/supabase/admin'
import { withCompanyFilter } from '@/lib/auth/with-company-filter'

export const runtime = 'nodejs'

/**
 * POST /api/quotes/delete-cascade
 * Body: { id: string, source: 'local' | 'tt_documents', reason: string }
 *
 * Borra una cotización + toda la cadena downstream:
 *   - Si source = 'local': cotización en tt_quotes + tt_quote_items.
 *   - Si source = 'tt_documents': tt_documents + tt_document_lines + tt_document_relations
 *     + downstream (pedidos/albaranes/facturas) por BFS.
 *
 * Snapshot completo en tt_activity_log antes de tocar nada para auditoría
 * y eventual recuperación manual.
 *
 * Solo admin / super_admin. Igual patrón que /api/oc/delete-cascade.
 */
export async function POST(req: NextRequest) {
  try {
    const { id, source, reason } = await req.json()
    if (!id) return NextResponse.json({ error: 'id requerido' }, { status: 400 })
    if (source !== 'local' && source !== 'tt_documents') {
      return NextResponse.json({ error: 'source debe ser "local" o "tt_documents"' }, { status: 400 })
    }
    if (!reason || !reason.trim()) {
      return NextResponse.json({ error: 'Motivo obligatorio' }, { status: 400 })
    }

    // Auth + admin gate + company access
    const guard = await withCompanyFilter()
    if (!guard.ok) return guard.response
    if (!guard.isAdmin) {
      return NextResponse.json({
        error: 'El borrado en cascada solo lo puede hacer un administrador.',
      }, { status: 403 })
    }

    const supabase = getAdminClient()

    // ─────────────────────────────────────────────────────────────────
    // CASO A: cotización legacy en tt_quotes (cascade a sales_orders)
    // ─────────────────────────────────────────────────────────────────
    if (source === 'local') {
      const { data: quote, error: qErr } = await supabase
        .from('tt_quotes')
        .select('*')
        .eq('id', id)
        .single()
      if (qErr || !quote) {
        return NextResponse.json({ error: 'Cotización no encontrada' }, { status: 404 })
      }

      if (!guard.assertAccess((quote as { company_id: string | null }).company_id)) {
        return NextResponse.json({ error: 'Acceso denegado a esta cotización' }, { status: 403 })
      }

      const { data: items } = await supabase
        .from('tt_quote_items')
        .select('*')
        .eq('quote_id', id)

      // Buscar sales_orders downstream que apunten a esta quote
      const { data: salesOrders } = await supabase
        .from('tt_sales_orders')
        .select('*')
        .eq('quote_id', id)

      const snapshot = {
        source: 'tt_quotes',
        quote,
        items: items || [],
        sales_orders: salesOrders || [],
        reason: reason.trim(),
      }

      await supabase.from('tt_activity_log').insert({
        entity_type: 'quote',
        entity_id: id,
        action: 'cascade_delete',
        detail: { snapshot, performed_by: guard.ttUserId, reason: reason.trim() },
      })

      // Hard delete en orden de dependencias:
      // 1. items de cada sales_order
      // 2. sales_orders
      // 3. tt_quote_items
      // 4. tt_quotes
      let soItemsDel = 0
      if (salesOrders && salesOrders.length > 0) {
        const soIds = salesOrders.map((so: { id: string }) => so.id)
        const { count } = await supabase
          .from('tt_sales_order_items')
          .delete({ count: 'exact' })
          .in('order_id', soIds)
        soItemsDel = count || 0

        const { error: soDelErr } = await supabase
          .from('tt_sales_orders')
          .delete()
          .in('id', soIds)
        if (soDelErr) {
          return NextResponse.json({
            error: `No se pudieron borrar sales_orders downstream: ${soDelErr.message}`,
          }, { status: 500 })
        }
      }

      const { count: itemsDel } = await supabase
        .from('tt_quote_items')
        .delete({ count: 'exact' })
        .eq('quote_id', id)

      const { error: delErr } = await supabase
        .from('tt_quotes')
        .delete()
        .eq('id', id)
      if (delErr) {
        return NextResponse.json({ error: delErr.message }, { status: 500 })
      }

      return NextResponse.json({
        ok: true,
        message: `Cotización legacy eliminada. ${itemsDel || 0} líneas, ${salesOrders?.length || 0} pedidos derivados (${soItemsDel} líneas) removidos.`,
        items_deleted: itemsDel || 0,
        sales_orders_deleted: salesOrders?.length || 0,
        sales_order_items_deleted: soItemsDel,
      })
    }

    // ─────────────────────────────────────────────────────────────────
    // CASO B: cotización unificada en tt_documents (con cascade downstream)
    // ─────────────────────────────────────────────────────────────────
    const { data: docRoot, error: docErr } = await supabase
      .from('tt_documents')
      .select('*')
      .eq('id', id)
      .single()
    if (docErr || !docRoot) {
      return NextResponse.json({ error: 'Documento no encontrado' }, { status: 404 })
    }

    if (!guard.assertAccess((docRoot as { company_id: string | null }).company_id)) {
      return NextResponse.json({ error: 'Acceso denegado a este documento' }, { status: 403 })
    }

    // BFS por tt_document_relations: la cotización + todos sus descendientes
    const docIds = new Set<string>([id])
    const queue: string[] = [id]
    while (queue.length > 0) {
      const parent = queue.shift()!
      const { data: children } = await supabase
        .from('tt_document_relations')
        .select('child_id')
        .eq('parent_id', parent)
      for (const c of children || []) {
        const cid = (c as { child_id: string }).child_id
        if (cid && !docIds.has(cid)) {
          docIds.add(cid)
          queue.push(cid)
        }
      }
    }

    const allDocIds = Array.from(docIds)

    // Snapshot pre-cascade
    const [docsSnap, itemsSnap, linksSnap] = await Promise.all([
      supabase.from('tt_documents').select('*').in('id', allDocIds),
      supabase.from('tt_document_lines').select('*').in('document_id', allDocIds),
      supabase
        .from('tt_document_relations')
        .select('*')
        .or(`parent_id.in.(${allDocIds.join(',')}),child_id.in.(${allDocIds.join(',')})`),
    ])

    const snapshot = {
      source: 'tt_documents',
      doc_ids: allDocIds,
      documents: docsSnap.data || [],
      items: itemsSnap.data || [],
      links: linksSnap.data || [],
      reason: reason.trim(),
    }

    await supabase.from('tt_activity_log').insert({
      entity_type: 'document',
      entity_id: id,
      action: 'cascade_delete_started',
      detail: { snapshot, performed_by: guard.ttUserId, reason: reason.trim() },
    })

    // Hard delete items y links
    const { count: itemsDel } = await supabase
      .from('tt_document_lines')
      .delete({ count: 'exact' })
      .in('document_id', allDocIds)

    const { count: linksDel } = await supabase
      .from('tt_document_relations')
      .delete({ count: 'exact' })
      .or(`parent_id.in.(${allDocIds.join(',')}),child_id.in.(${allDocIds.join(',')})`)

    // Hard delete documents (la cotización + downstream).
    // Para preservar trazabilidad de docs no-cot que tengan otras conexiones,
    // por ahora eliminamos todos los del set. Si alguna factura era compartida
    // con otra cadena, el snapshot permite recuperarla.
    const { count: docsDel } = await supabase
      .from('tt_documents')
      .delete({ count: 'exact' })
      .in('id', allDocIds)

    const result = {
      docs_deleted: docsDel || 0,
      docs_target_count: allDocIds.length,
      items_deleted: itemsDel || 0,
      links_deleted: linksDel || 0,
      doc_ids: allDocIds,
    }

    await supabase.from('tt_activity_log').insert({
      entity_type: 'document',
      entity_id: id,
      action: 'cascade_delete_completed',
      detail: { result, performed_by: guard.ttUserId, reason: reason.trim() },
    })

    return NextResponse.json({
      ok: true,
      message: `Cotización + cadena eliminadas: ${docsDel || 0} documentos, ${itemsDel || 0} líneas, ${linksDel || 0} vínculos.`,
      ...result,
    })
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 500 })
  }
}
