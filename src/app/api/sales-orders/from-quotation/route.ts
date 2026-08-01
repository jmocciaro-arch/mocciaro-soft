/**
 * POST /api/sales-orders/from-quotation
 * Body: { source_doc_id: string }
 *
 * Convierte una cotización guardada en un pedido (tt_documents doc_type='pedido').
 *
 * Este endpoint FALTABA: el panel "Próximo paso" del cotizador ya ofrecía la
 * acción "Convertir a pedido" y /api/next-steps/execute la ruteaba acá, pero
 * la ruta nunca se creó — el usuario clickeaba y recibía "convert falló (404)",
 * quedándose sin forma de avanzar después de guardar una cotización.
 *
 * Reusa quoteToOrder() (la misma función del botón "Generar Pedido" de
 * /ventas) en vez de duplicar la lógica, pasándole el server client para
 * respetar RLS y las cookies del usuario.
 */

import { NextRequest, NextResponse } from 'next/server'
import { createClient as createServerClient } from '@/lib/supabase/server'
import { getAdminClient } from '@/lib/supabase/admin'
import { withCompanyFilter } from '@/lib/auth/with-company-filter'
import { quoteToOrder } from '@/lib/document-workflow'

export const runtime = 'nodejs'

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json().catch(() => null)) as { source_doc_id?: string } | null
    const sourceDocId = body?.source_doc_id
    if (!sourceDocId) {
      return NextResponse.json({ error: 'source_doc_id requerido' }, { status: 400 })
    }

    const guard = await withCompanyFilter()
    if (!guard.ok) return guard.response

    // Validar que la cotización existe y es de una empresa accesible por el user.
    // Se lee con admin porque las políticas RLS de tt_documents conviven con un
    // "ALL USING true" — el chequeo real de empresa lo hace assertAccess.
    const admin = getAdminClient()
    const { data: quote } = await admin
      .from('tt_documents')
      .select('id, company_id, doc_type, status')
      .eq('id', sourceDocId)
      .maybeSingle()

    if (!quote) {
      return NextResponse.json({ error: 'Cotización no encontrada' }, { status: 404 })
    }
    if (!guard.assertAccess((quote.company_id as string | null) ?? null)) {
      return NextResponse.json({ error: 'Acceso denegado a esta cotización' }, { status: 403 })
    }

    const supabase = await createServerClient()
    const { orderId, orderNumber } = await quoteToOrder(
      sourceDocId,
      'tt_documents',
      supabase as unknown as Parameters<typeof quoteToOrder>[2]
    )

    return NextResponse.json({
      sales_order_id: orderId,
      number: orderNumber,
      redirect_to: `/ventas?tab=pedidos&highlight=${orderId}`,
    })
  } catch (err) {
    // quoteToOrder lanza errores de negocio con mensajes accionables
    // (cliente sin condiciones comerciales, cotización sin empresa, etc.).
    // Se devuelven como 400 para que el panel los muestre tal cual al usuario.
    return NextResponse.json({ error: (err as Error).message }, { status: 400 })
  }
}
