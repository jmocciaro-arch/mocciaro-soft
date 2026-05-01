/**
 * POST /api/supplier-offers/save
 *
 * Guarda una cotización de proveedor (luego de que el usuario la revisó).
 * - Inserta cabecera en tt_supplier_offers.
 * - Inserta items en tt_supplier_offer_items.
 * - Para items con is_new_product=true → crea producto en tt_products con cost_eur=unit_price.
 * - Para items existentes con update_cost=true → actualiza tt_products.cost_eur (el trigger
 *   record_price_change registra automáticamente en tt_price_history con source_type='manual';
 *   acá lo "re-etiquetamos" insertando un registro con source_type='pdf_offer' y source_id=offer.id).
 *
 * Body JSON:
 * {
 *   offer: {
 *     supplier_id, supplier_name, offer_number, offer_date, valid_until, currency,
 *     subtotal, tax_rate, tax_amount, total, payment_terms, incoterm, notes,
 *     status, source_type, pdf_url, ai_extracted, company_id
 *   },
 *   items: [
 *     {
 *       product_id, sku, supplier_sku, description, quantity, unit_price,
 *       discount_pct, subtotal, is_new_product, matched_by, notes, sort_order,
 *       update_cost?: boolean,           // si true → actualizar cost_eur del producto
 *       new_product?: {                  // requerido si is_new_product=true
 *         sku, name, brand, description, category, price_eur?
 *       }
 *     }
 *   ]
 * }
 */
import { NextRequest, NextResponse } from 'next/server'
import { createClient as createServiceClient } from '@supabase/supabase-js'

export const runtime = 'nodejs'
export const maxDuration = 60

interface SaveOfferBody {
  offer: {
    supplier_id?: string | null
    supplier_name: string
    offer_number?: string | null
    offer_date?: string | null
    valid_until?: string | null
    currency?: string | null
    subtotal?: number | null
    tax_rate?: number | null
    tax_amount?: number | null
    total?: number | null
    payment_terms?: string | null
    incoterm?: string | null
    notes?: string | null
    status?: 'pending' | 'reviewed' | 'accepted' | 'rejected' | 'expired'
    source_type?: 'pdf' | 'excel' | 'email' | 'manual'
    pdf_url?: string | null
    source_url?: string | null
    ai_extracted?: Record<string, unknown> | null
    company_id?: string | null
  }
  items: Array<{
    product_id?: string | null
    sku?: string | null
    supplier_sku?: string | null
    description: string
    quantity?: number | null
    unit_price?: number | null
    discount_pct?: number | null
    subtotal?: number | null
    is_new_product?: boolean
    matched_by?: string | null
    notes?: string | null
    sort_order?: number | null
    update_cost?: boolean
    new_product?: {
      sku: string
      name: string
      brand?: string | null
      description?: string | null
      category?: string | null
      price_eur?: number | null
      weight_kg?: number | null
    }
  }>
}

export async function POST(req: NextRequest) {
  let body: SaveOfferBody
  try {
    body = (await req.json()) as SaveOfferBody
  } catch {
    return NextResponse.json({ error: 'JSON inválido' }, { status: 400 })
  }

  if (!body?.offer || !Array.isArray(body.items)) {
    return NextResponse.json({ error: 'offer e items son requeridos' }, { status: 400 })
  }

  const offerInput = body.offer
  if (!offerInput.supplier_name || !offerInput.supplier_name.trim()) {
    return NextResponse.json({ error: 'offer.supplier_name es requerido' }, { status: 400 })
  }

  const supabase = createServiceClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } }
  )

  try {
    // 1) Insertar cabecera
    const { data: offer, error: offerErr } = await supabase
      .from('tt_supplier_offers')
      .insert({
        supplier_id: offerInput.supplier_id ?? null,
        supplier_name: offerInput.supplier_name.trim(),
        offer_number: offerInput.offer_number ?? null,
        offer_date: offerInput.offer_date ?? new Date().toISOString().slice(0, 10),
        valid_until: offerInput.valid_until ?? null,
        currency: offerInput.currency || 'EUR',
        subtotal: offerInput.subtotal ?? 0,
        tax_rate: offerInput.tax_rate ?? 0,
        tax_amount: offerInput.tax_amount ?? 0,
        total: offerInput.total ?? 0,
        payment_terms: offerInput.payment_terms ?? null,
        incoterm: offerInput.incoterm ?? null,
        notes: offerInput.notes ?? null,
        status: offerInput.status || 'pending',
        source_type: offerInput.source_type || 'pdf',
        pdf_url: offerInput.pdf_url ?? null,
        source_url: offerInput.source_url ?? null,
        ai_extracted: offerInput.ai_extracted ?? {},
        company_id: offerInput.company_id ?? null,
      })
      .select('id')
      .single()

    if (offerErr || !offer) {
      console.error('[supplier-offers save] offer insert error:', offerErr)
      return NextResponse.json(
        { error: `No se pudo crear la oferta: ${offerErr?.message || 'desconocido'}` },
        { status: 500 }
      )
    }

    const offerId = offer.id as string
    const currency = (offerInput.currency || 'EUR').toUpperCase()

    // 2) Procesar items: crear productos nuevos primero (para tener product_id en cada item)
    const itemRows: Array<Record<string, unknown>> = []
    const priceHistoryRows: Array<Record<string, unknown>> = []
    const newProductRows: Array<{ id: string; sku: string }> = []

    let createdProducts = 0
    let updatedCosts = 0

    for (let idx = 0; idx < body.items.length; idx++) {
      const it = body.items[idx]
      let productId: string | null = it.product_id ?? null
      const qty = Number(it.quantity ?? 1) || 1
      const unitPrice = Number(it.unit_price ?? 0) || 0
      const discountPct = Number(it.discount_pct ?? 0) || 0
      const computedSubtotal =
        it.subtotal != null ? Number(it.subtotal) : Number((qty * unitPrice * (1 - discountPct / 100)).toFixed(2))

      // a) Producto nuevo → crearlo
      if (it.is_new_product && !productId) {
        const np = it.new_product
        if (!np?.sku || !np?.name) {
          // No tenemos datos suficientes para crear el producto: lo dejamos como item suelto sin product_id
          itemRows.push({
            offer_id: offerId,
            product_id: null,
            sku: it.sku ?? null,
            supplier_sku: it.supplier_sku ?? null,
            description: it.description,
            quantity: qty,
            unit_price: unitPrice,
            discount_pct: discountPct,
            subtotal: computedSubtotal,
            is_new_product: true,
            matched_by: it.matched_by ?? null,
            notes: it.notes ?? '[no se creó producto: faltan sku/name]',
            sort_order: it.sort_order ?? idx,
          })
          continue
        }

        const { data: createdProd, error: prodErr } = await supabase
          .from('tt_products')
          .insert({
            sku: np.sku,
            name: np.name,
            description: np.description ?? it.description ?? null,
            brand: np.brand || 'SIN MARCA',
            category_name: np.category ?? null,
            cost_eur: unitPrice,
            price_eur: np.price_eur ?? null,
            price_currency: currency,
            weight_kg: np.weight_kg ?? null,
            is_active: true,
          })
          .select('id, sku')
          .single()

        if (prodErr || !createdProd) {
          // Si falló por SKU duplicado, intentar match por SKU existente
          const { data: existing } = await supabase
            .from('tt_products')
            .select('id, sku')
            .eq('sku', np.sku)
            .maybeSingle()
          if (existing) {
            productId = existing.id as string
          } else {
            console.warn('[supplier-offers save] failed to create product', np.sku, prodErr?.message)
          }
        } else {
          productId = createdProd.id as string
          createdProducts++
          newProductRows.push({ id: productId, sku: createdProd.sku as string })

          // El producto recién creado: registrar primer precio en historial como source_type='pdf_offer'
          priceHistoryRows.push({
            product_id: productId,
            supplier_id: offerInput.supplier_id ?? null,
            supplier_name: offerInput.supplier_name,
            price_type: 'cost',
            old_price: null,
            new_price: unitPrice,
            variation_pct: null,
            currency,
            source_type: 'pdf_offer',
            source_id: offerId,
            notes: `Alta de producto desde oferta ${offerInput.offer_number || offerId}`,
            valid_from: offerInput.offer_date ?? new Date().toISOString().slice(0, 10),
            valid_until: offerInput.valid_until ?? null,
          })
        }
      }

      // b) Producto existente con flag update_cost → actualizar cost_eur
      if (productId && it.update_cost) {
        const { data: oldProd } = await supabase
          .from('tt_products')
          .select('cost_eur')
          .eq('id', productId)
          .maybeSingle()

        const oldCost = oldProd?.cost_eur != null ? Number(oldProd.cost_eur) : null

        const { error: updErr } = await supabase
          .from('tt_products')
          .update({ cost_eur: unitPrice })
          .eq('id', productId)

        if (!updErr) {
          updatedCosts++
          // Insertar registro adicional con source_type='pdf_offer' y source_id=offerId.
          // (El trigger ya insertó uno con source_type='manual'; este sobreescribe la trazabilidad.)
          const variationPct =
            oldCost != null && oldCost > 0
              ? Number((((unitPrice - oldCost) / oldCost) * 100).toFixed(2))
              : null
          priceHistoryRows.push({
            product_id: productId,
            supplier_id: offerInput.supplier_id ?? null,
            supplier_name: offerInput.supplier_name,
            price_type: 'cost',
            old_price: oldCost,
            new_price: unitPrice,
            variation_pct: variationPct,
            currency,
            source_type: 'pdf_offer',
            source_id: offerId,
            notes: `Actualización por oferta ${offerInput.offer_number || offerId}`,
            valid_from: offerInput.offer_date ?? new Date().toISOString().slice(0, 10),
            valid_until: offerInput.valid_until ?? null,
          })
        } else {
          console.warn('[supplier-offers save] update cost failed', productId, updErr.message)
        }
      }

      // c) Insertar item de la oferta
      itemRows.push({
        offer_id: offerId,
        product_id: productId,
        sku: it.sku ?? null,
        supplier_sku: it.supplier_sku ?? null,
        description: it.description,
        quantity: qty,
        unit_price: unitPrice,
        discount_pct: discountPct,
        subtotal: computedSubtotal,
        is_new_product: !!it.is_new_product,
        matched_by: it.matched_by ?? null,
        notes: it.notes ?? null,
        sort_order: it.sort_order ?? idx,
      })
    }

    // 3) Insertar items en bulk
    if (itemRows.length > 0) {
      const { error: itemsErr } = await supabase.from('tt_supplier_offer_items').insert(itemRows)
      if (itemsErr) {
        console.error('[supplier-offers save] items insert error:', itemsErr)
        return NextResponse.json(
          {
            error: `Oferta creada (${offerId}) pero falló inserción de items: ${itemsErr.message}`,
            offer_id: offerId,
          },
          { status: 207 }
        )
      }
    }

    // 4) Insertar registros de price_history en bulk
    if (priceHistoryRows.length > 0) {
      const { error: phErr } = await supabase.from('tt_price_history').insert(priceHistoryRows)
      if (phErr) {
        // No es crítico: la oferta y los items ya están guardados.
        console.warn('[supplier-offers save] price_history insert error:', phErr.message)
      }
    }

    return NextResponse.json({
      ok: true,
      offer_id: offerId,
      stats: {
        total_items: itemRows.length,
        new_products_created: createdProducts,
        costs_updated: updatedCosts,
        price_history_records: priceHistoryRows.length,
      },
      new_products: newProductRows,
    })
  } catch (err) {
    console.error('[supplier-offers save] exception:', err)
    return NextResponse.json(
      { error: (err as Error).message || 'Error inesperado' },
      { status: 500 }
    )
  }
}
