/**
 * POST /api/quotations/duplicate
 *
 * Body: { source_doc_id: uuid, target_client_id: uuid }
 *
 * Clona una cotización (de tt_documents o tt_quotes legacy) para otro cliente.
 * - Copia head + items.
 * - Status nuevo = 'borrador'/'draft'.
 * - system_code/number nuevo via generateDocNumber('COT').
 * - Devuelve { new_doc_id, redirect_to }.
 */
import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { createClient as createServerClient } from '@/lib/supabase/server'
import { requireAuth, userHasCompanyAccess } from '@/lib/auth/require-admin'
import { generateDocNumber } from '@/lib/document-workflow'
import { logger } from '@/lib/observability/logger'

export const runtime = 'nodejs'

const bodySchema = z.object({
  source_doc_id: z.string().uuid(),
  target_client_id: z.string().uuid(),
})

type Row = Record<string, unknown>

export async function POST(req: NextRequest) {
  try {
    const raw = (await req.json().catch(() => null)) as unknown
    const parsed = bodySchema.safeParse(raw)
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Body inválido', details: parsed.error.flatten() },
        { status: 400 }
      )
    }
    const { source_doc_id, target_client_id } = parsed.data

    const guard = await requireAuth()
    if (!guard.ok) return guard.response
    const { ttUserId, role } = guard

    const sb = await createServerClient()

    // ── Detectar source ──────────────────────────────────────────────────────
    const { data: docHead } = await sb
      .from('tt_documents')
      .select(
        'id, doc_type, subtype, flow_role, company_id, client_id, currency, exchange_rate, subtotal, tax_rate, tax_amount, total, incoterm, payment_terms, notes, metadata, billing_mode'
      )
      .eq('id', source_doc_id)
      .maybeSingle()

    let isLegacy = false
    let head: Row | null = docHead as Row | null
    if (!head || !['presupuesto', 'quotation'].includes(String(head.doc_type))) {
      const { data: legacy } = await sb
        .from('tt_quotes')
        .select(
          'id, company_id, client_id, currency, exchange_rate, subtotal, tax_amount, total, tax_rate, incoterm, payment_terms, notes'
        )
        .eq('id', source_doc_id)
        .maybeSingle()
      if (!legacy) {
        return NextResponse.json({ error: 'Cotización no encontrada' }, { status: 404 })
      }
      head = legacy as Row
      isLegacy = true
    }

    const companyId = head.company_id as string | null
    if (!companyId) {
      return NextResponse.json(
        { error: 'Cotización origen sin company_id' },
        { status: 400 }
      )
    }
    if (!(await userHasCompanyAccess(ttUserId, role, companyId))) {
      return NextResponse.json({ error: 'Sin acceso a esta empresa' }, { status: 403 })
    }

    // ── Verificar que el cliente destino pertenezca a la misma empresa ───────
    const { data: targetClient } = await sb
      .from('tt_clients')
      .select('id, company_id, name')
      .eq('id', target_client_id)
      .maybeSingle()
    if (!targetClient) {
      return NextResponse.json({ error: 'Cliente destino no encontrado' }, { status: 404 })
    }
    if (targetClient.company_id !== companyId) {
      return NextResponse.json(
        { error: 'El cliente destino pertenece a otra empresa' },
        { status: 400 }
      )
    }

    // ── Cargar items del source ──────────────────────────────────────────────
    let items: Row[] = []
    if (isLegacy) {
      const { data: it } = await sb
        .from('tt_quote_items')
        .select(
          'product_id, sku, description, quantity, unit_price, discount_pct, subtotal, notes, sort_order'
        )
        .eq('quote_id', source_doc_id)
        .order('sort_order')
      items = (it ?? []) as Row[]
    } else {
      const { data: it } = await sb
        .from('tt_document_lines')
        .select(
          'product_id, sku, description, quantity, unit_price, discount_pct, subtotal, notes, sort_order, warehouse_id, internal_description'
        )
        .eq('document_id', source_doc_id)
        .order('sort_order')
      items = (it ?? []) as Row[]
    }

    // ── Generar número nuevo + insertar head ─────────────────────────────────
    const newCode = await generateDocNumber('COT')

    const newHead: Row = {
      doc_type: isLegacy ? 'quotation' : (head.doc_type as string) ?? 'quotation',
      subtype: (head.subtype as string | null) ?? null,
      flow_role: (head.flow_role as string | null) ?? null,
      system_code: newCode,
      display_ref: null,
      company_id: companyId,
      client_id: target_client_id,
      user_id: ttUserId,
      assigned_to: ttUserId,
      status: 'borrador',
      billing_mode: (head.billing_mode as string | null) ?? null,
      currency: (head.currency as string | null) ?? 'EUR',
      exchange_rate: (head.exchange_rate as number | null) ?? 1,
      subtotal: (head.subtotal as number | null) ?? 0,
      tax_rate: (head.tax_rate as number | null) ?? 21,
      tax_amount: (head.tax_amount as number | null) ?? 0,
      total: (head.total as number | null) ?? 0,
      incoterm: (head.incoterm as string | null) ?? null,
      payment_terms: (head.payment_terms as string | null) ?? null,
      notes: (head.notes as string | null) ?? null,
      metadata: {
        ...(head.metadata as Record<string, unknown> | null ?? {}),
        duplicated_from: source_doc_id,
        duplicated_at: new Date().toISOString(),
        duplicated_source: isLegacy ? 'tt_quotes' : 'tt_documents',
      },
    }

    const { data: created, error: insErr } = await sb
      .from('tt_documents')
      .insert(newHead)
      .select('id')
      .single()

    if (insErr || !created) {
      return NextResponse.json(
        { error: `Error creando cotización: ${insErr?.message ?? 'sin datos'}` },
        { status: 500 }
      )
    }

    const newDocId = created.id as string

    // ── Insertar items ───────────────────────────────────────────────────────
    if (items.length > 0) {
      const newLines = items.map((it, idx) => ({
        document_id: newDocId,
        product_id: (it.product_id as string | null) ?? null,
        sku: (it.sku as string | null) ?? null,
        description: (it.description as string | null) ?? '',
        internal_description: (it.internal_description as string | null) ?? null,
        quantity: (it.quantity as number) ?? 0,
        unit_price: (it.unit_price as number) ?? 0,
        discount_pct: (it.discount_pct as number) ?? 0,
        subtotal: (it.subtotal as number) ?? 0,
        notes: (it.notes as string | null) ?? null,
        sort_order: (it.sort_order as number | null) ?? idx,
        warehouse_id: (it.warehouse_id as string | null) ?? null,
      }))

      const { error: linesErr } = await sb.from('tt_document_lines').insert(newLines)
      if (linesErr) {
        logger.warn('[quotations/duplicate] items insert failed:', linesErr.message)
        // No revertir el head — el usuario podrá agregar items manualmente
      }
    }

    return NextResponse.json({
      new_doc_id: newDocId,
      system_code: newCode,
      redirect_to: `/documentos/${newDocId}`,
    })
  } catch (err) {
    logger.error('[POST /api/quotations/duplicate] error:', err)
    return NextResponse.json({ error: (err as Error).message }, { status: 500 })
  }
}
