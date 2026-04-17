import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { scoreSupplier, type SupplierScoreInput } from '@/lib/ai/score-supplier'

export const runtime = 'nodejs'

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { persistSession: false } }
)

/**
 * POST /api/suppliers/score
 * Body: { supplierId: string, persist?: boolean }
 *
 * Calcula el AI score de un proveedor basado en su historial de OCs,
 * facturas, pagos e interacciones. Guarda en tt_suppliers si persist=true.
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const { supplierId, persist = true } = body as { supplierId: string; persist?: boolean }

    if (!supplierId) {
      return NextResponse.json({ error: 'supplierId requerido' }, { status: 400 })
    }

    // 1) Obtener datos del proveedor
    const { data: supplier, error: supplierError } = await supabaseAdmin
      .from('tt_suppliers')
      .select('id, name, category, country, notes')
      .eq('id', supplierId)
      .single()

    if (supplierError || !supplier) {
      return NextResponse.json({ error: 'Proveedor no encontrado' }, { status: 404 })
    }

    // 2) Obtener OCs del proveedor
    const { data: purchaseOrders } = await supabaseAdmin
      .from('tt_purchase_orders')
      .select('id, status, total, created_at, expected_delivery')
      .eq('supplier_id', supplierId)
      .order('created_at', { ascending: false })
      .limit(100)

    const pos = purchaseOrders || []
    const totalOrders = pos.length
    const onTimeOrders = pos.filter((po: Record<string, unknown>) => po.status === 'received' || po.status === 'closed').length
    const totalSpent = pos.reduce((s: number, po: Record<string, unknown>) => s + ((po.total as number) || 0), 0)
    const avgOrderValue = totalOrders > 0 ? totalSpent / totalOrders : 0

    // 3) Interacciones recientes
    const { data: interactions } = await supabaseAdmin
      .from('tt_supplier_interactions')
      .select('type, outcome, created_at')
      .eq('supplier_id', supplierId)
      .order('created_at', { ascending: false })
      .limit(10)

    const qualityIssues = (interactions || []).filter(
      (i: Record<string, unknown>) => i.type === 'quality_issue' || i.type === 'complaint'
    ).length

    const complaints = (interactions || []).filter(
      (i: Record<string, unknown>) => i.type === 'complaint'
    ).length

    const lastInteraction = (interactions || [])[0]?.created_at ?? null

    // 4) Construir input de scoring
    const input: SupplierScoreInput = {
      name: supplier.name as string,
      category: supplier.category as string | null,
      country: supplier.country as string | null,
      total_orders: totalOrders,
      on_time_orders: onTimeOrders,
      total_spent: totalSpent,
      avg_order_value: avgOrderValue,
      quality_issues: qualityIssues,
      complaints,
      last_interaction: lastInteraction,
      notes: supplier.notes as string | null,
      recent_interactions: (interactions || []).map((i: Record<string, unknown>) => ({
        type: i.type as string,
        outcome: i.outcome as string | undefined,
        date: i.created_at as string,
      })),
    }

    // 5) Llamar a AI
    const result = await scoreSupplier(input)
    if (!result.data) {
      return NextResponse.json({ error: result.error || 'Sin resultado de IA' }, { status: 500 })
    }

    // 6) Persistir si solicitado
    if (persist) {
      await supabaseAdmin
        .from('tt_suppliers')
        .update({
          ai_score: result.data.score,
          ai_tags: result.data.tags,
          ai_analysis: result.data.analysis,
          ai_profile: {
            delivery_score: result.data.delivery_score,
            quality_score: result.data.quality_score,
            price_score: result.data.price_score,
            reliability_score: result.data.reliability_score,
            on_time_rate: totalOrders > 0 ? onTimeOrders / totalOrders : null,
            total_spent_ytd: totalSpent,
            avg_po_value: avgOrderValue,
            last_analysis_summary: result.data.analysis,
            suggested_action: result.data.suggested_action,
          },
          ai_analysis_at: new Date().toISOString(),
          ai_provider: result.data.provider_used,
        })
        .eq('id', supplierId)
    }

    return NextResponse.json(result.data)
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 500 })
  }
}
