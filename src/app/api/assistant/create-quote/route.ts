import { NextRequest, NextResponse } from 'next/server'
import { getAdminClient } from '@/lib/supabase/admin'
import { withCompanyFilter, ensureCompanyAccess } from '@/lib/auth/with-company-filter'
import { createQuoteDraftSchema } from '@/lib/schemas/assistant-quote'
import { loadClientPricing, pickPrice } from '@/lib/pricing/resolve-price'

export const runtime = 'nodejs'

/**
 * POST /api/assistant/create-quote
 *
 * Crea una cotización BORRADOR a partir de una acción confirmada por el usuario
 * (tarjeta de preview del asistente). Es reversible: doc_type='cotizacion',
 * status='draft' -> no numera fiscalmente ni mueve stock.
 *
 * Replica el insert canónico del cotizador (tt_documents + tt_document_lines con
 * columnas reales sku/sort_order). El precio sale de la tarifa del cliente si
 * existe, si no de la lista, si no del catálogo (resolve-price).
 */
export async function POST(req: NextRequest) {
  const guard = await withCompanyFilter()
  if (!guard.ok) return guard.response

  const parsed = createQuoteDraftSchema.safeParse(await req.json().catch(() => null))
  if (!parsed.success) {
    return NextResponse.json({ error: 'Payload inválido', issues: parsed.error.flatten() }, { status: 400 })
  }
  const input = parsed.data

  const access = ensureCompanyAccess(guard, input.company_id)
  if (!access.ok) return access.response

  const supabase = getAdminClient()

  // 1) Resolver productos por SKU (id + precio de catálogo) para anti-alucinación y pricing.
  const skus = input.items.map((i) => i.sku).filter((s): s is string => !!s)
  const productBySku = new Map<string, { id: string; price_eur: number | null }>()
  if (skus.length > 0) {
    const { data: products } = await supabase
      .from('tt_products')
      .select('id, sku, price_eur')
      .in('sku', skus)
      .eq('active', true)
    for (const p of (products ?? []) as Array<{ id: string; sku: string; price_eur: number | null }>) {
      productBySku.set(p.sku, { id: p.id, price_eur: p.price_eur })
    }
  }

  // 2) Condiciones de precio del cliente.
  const pricing = await loadClientPricing(input.client_id)

  // 3) Armar líneas con precio resuelto (precio explícito del asistente > tarifa/lista/catálogo).
  const lines = input.items.map((item, idx) => {
    const product = item.sku ? productBySku.get(item.sku) : undefined
    const productId = item.product_id ?? product?.id ?? null
    const catalogPrice = product?.price_eur ?? 0
    let unitPrice: number
    if (item.unit_price != null) {
      unitPrice = item.unit_price
    } else if (productId) {
      unitPrice = pickPrice(productId, catalogPrice, pricing).price
    } else {
      unitPrice = 0
    }
    const discount = item.discount_pct ?? 0
    const lineSubtotal = item.quantity * unitPrice * (1 - discount / 100)
    return { productId, item, idx, unitPrice, discount, lineSubtotal }
  })

  const subtotal = lines.reduce((s, l) => s + l.lineSubtotal, 0)
  const taxRate = input.tax_rate ?? 0
  const taxAmount = subtotal * (taxRate / 100)
  const total = subtotal + taxAmount

  const systemCode = `COT-AI-${Date.now()}`

  // 4) Documento BORRADOR (mismo shape que el cotizador; doc_type canónico).
  const { data: doc, error: docError } = await supabase
    .from('tt_documents')
    .insert({
      doc_type: 'cotizacion',
      subtype: 'standard',
      system_code: systemCode,
      display_ref: systemCode,
      company_id: input.company_id,
      client_id: input.client_id ?? null,
      user_id: guard.ttUserId,
      status: 'draft',
      notes: input.notes ?? null,
      currency: input.currency,
      subtotal,
      tax_rate: taxRate,
      tax_amount: taxAmount,
      total,
      metadata: { source: 'ai_assistant', created_via: 'chat' },
    })
    .select('id, system_code')
    .single()

  if (docError || !doc) {
    return NextResponse.json({ error: docError?.message ?? 'No se pudo crear el borrador' }, { status: 500 })
  }
  const docRow = doc as { id: string; system_code: string }

  // 5) Líneas (columnas reales: sku + sort_order, NO product_sku/line_number).
  const docLines = lines.map((l) => ({
    document_id: docRow.id,
    product_id: l.productId,
    sort_order: l.idx + 1,
    sku: l.item.sku ?? null,
    description: l.item.description,
    quantity: l.item.quantity,
    unit_price: l.unitPrice,
    discount_pct: l.discount,
    subtotal: l.lineSubtotal,
  }))
  const { error: linesError } = await supabase.from('tt_document_lines').insert(docLines)
  if (linesError) {
    return NextResponse.json(
      { error: `Borrador creado pero falló al cargar líneas: ${linesError.message}`, document_id: docRow.id },
      { status: 500 }
    )
  }

  return NextResponse.json(
    { success: true, document_id: docRow.id, system_code: docRow.system_code, total, currency: input.currency },
    { status: 201 }
  )
}
