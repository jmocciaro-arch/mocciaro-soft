/**
 * POST /api/supplier-offers/apply-excel-update
 *
 * Aplica una actualización masiva de precios desde Excel.
 * - Crea un registro "paraguas" en tt_supplier_offers con source_type='excel' que sirve
 *   como source_id para todos los registros de tt_price_history.
 * - Para cada fila:
 *    - Si product_id existe → UPDATE tt_products.cost_eur (y opcionalmente price_eur).
 *      El trigger record_price_change crea un registro automático con source_type='manual';
 *      acá ADEMÁS insertamos uno explícito con source_type='excel_update' para trazabilidad.
 *    - Si no existe Y create_missing=true → crea el producto.
 * - Calcula resumen: variación promedio, máxima suba, máxima baja.
 *
 * Body JSON:
 * {
 *   supplier_id?: string,
 *   supplier_name?: string,         // si no viene supplier_id
 *   company_id?: string,
 *   currency?: string,              // default 'EUR'
 *   notes?: string,
 *   source_url?: string,            // ruta al excel original (opcional)
 *   create_missing?: boolean,       // default false
 *   update_field?: 'cost' | 'price' | 'both', // default 'cost'
 *   rows: [
 *     {
 *       sku: string,
 *       description?: string,
 *       brand?: string,
 *       cost?: number,
 *       price?: number,
 *       product_id?: string | null,    // si viene del parse-excel; sino se busca por sku
 *     }
 *   ]
 * }
 */
import { NextRequest, NextResponse } from 'next/server'
import { createClient as createServiceClient } from '@supabase/supabase-js'

export const runtime = 'nodejs'
export const maxDuration = 120

interface ApplyRow {
  sku: string
  description?: string | null
  brand?: string | null
  cost?: number | null
  price?: number | null
  product_id?: string | null
}

interface ApplyBody {
  supplier_id?: string | null
  supplier_name?: string | null
  company_id?: string | null
  currency?: string | null
  notes?: string | null
  source_url?: string | null
  create_missing?: boolean
  update_field?: 'cost' | 'price' | 'both'
  rows: ApplyRow[]
}

interface RowResult {
  sku: string
  product_id: string | null
  action: 'updated' | 'created' | 'skipped' | 'error' | 'no_change'
  old_cost: number | null
  new_cost: number | null
  cost_variation_pct: number | null
  old_price: number | null
  new_price: number | null
  price_variation_pct: number | null
  message?: string
}

export async function POST(req: NextRequest) {
  let body: ApplyBody
  try {
    body = (await req.json()) as ApplyBody
  } catch {
    return NextResponse.json({ error: 'JSON inválido' }, { status: 400 })
  }

  if (!body || !Array.isArray(body.rows) || body.rows.length === 0) {
    return NextResponse.json({ error: 'rows es requerido y no puede estar vacío' }, { status: 400 })
  }

  const supabase = createServiceClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } }
  )

  const currency = (body.currency || 'EUR').toUpperCase()
  const updateField = body.update_field || 'cost'
  const createMissing = !!body.create_missing

  try {
    // 1) Resolver supplier_name si vino sólo el id
    let supplierName = body.supplier_name?.trim() || null
    const supplierId = body.supplier_id || null
    if (supplierId && !supplierName) {
      const { data: sup } = await supabase
        .from('tt_suppliers')
        .select('id, name')
        .eq('id', supplierId)
        .maybeSingle()
      if (sup) supplierName = (sup as { name: string }).name
    }
    if (!supplierName) {
      supplierName = 'Actualización Excel sin proveedor'
    }

    // 2) Crear oferta paraguas (source_type='excel') para tener un source_id estable
    const { data: offer, error: offerErr } = await supabase
      .from('tt_supplier_offers')
      .insert({
        supplier_id: supplierId,
        supplier_name: supplierName,
        offer_number: null,
        offer_date: new Date().toISOString().slice(0, 10),
        valid_until: null,
        currency,
        subtotal: 0,
        total: 0,
        notes: body.notes || `Actualización masiva de precios desde Excel (${body.rows.length} filas)`,
        status: 'reviewed',
        source_type: 'excel',
        source_url: body.source_url ?? null,
        company_id: body.company_id ?? null,
        ai_extracted: { update_field: updateField, create_missing: createMissing, row_count: body.rows.length },
      })
      .select('id')
      .single()

    if (offerErr || !offer) {
      console.error('[supplier-offers apply-excel-update] offer insert error:', offerErr)
      return NextResponse.json(
        { error: `No se pudo crear la oferta paraguas: ${offerErr?.message || 'desconocido'}` },
        { status: 500 }
      )
    }
    const offerId = offer.id as string

    // 3) Resolver product_id para filas que no lo traen, en batch
    const skusToLookup = Array.from(
      new Set(
        body.rows
          .filter((r) => !r.product_id && r.sku)
          .map((r) => r.sku.trim())
          .filter((s) => s.length > 0)
      )
    )

    const productCache: Record<
      string,
      { id: string; sku: string; cost_eur: number | null; price_eur: number | null } | null
    > = {}

    if (skusToLookup.length > 0) {
      const BATCH = 200
      for (let i = 0; i < skusToLookup.length; i += BATCH) {
        const slice = skusToLookup.slice(i, i + BATCH)
        const { data, error } = await supabase
          .from('tt_products')
          .select('id, sku, cost_eur, price_eur')
          .in('sku', slice)
        if (error) {
          console.warn('[apply-excel-update] product batch lookup error:', error.message)
          continue
        }
        if (data) {
          for (const p of data) {
            if (p.sku) productCache[p.sku] = p
          }
        }
      }
    }

    // 4) Procesar cada fila
    const results: RowResult[] = []
    const priceHistoryRows: Array<Record<string, unknown>> = []
    const offerItemRows: Array<Record<string, unknown>> = []

    let updatedCount = 0
    let createdCount = 0
    let skippedCount = 0
    let errorCount = 0
    let noChangeCount = 0
    const variations: number[] = []

    for (let idx = 0; idx < body.rows.length; idx++) {
      const row = body.rows[idx]
      const sku = (row.sku || '').trim()
      if (!sku) {
        skippedCount++
        results.push({
          sku: '',
          product_id: null,
          action: 'skipped',
          old_cost: null,
          new_cost: null,
          cost_variation_pct: null,
          old_price: null,
          new_price: null,
          price_variation_pct: null,
          message: 'SKU vacío',
        })
        continue
      }

      const newCost = row.cost != null ? Number(row.cost) : null
      const newPrice = row.price != null ? Number(row.price) : null
      const wantsCost = updateField === 'cost' || updateField === 'both'
      const wantsPrice = updateField === 'price' || updateField === 'both'

      if ((wantsCost && newCost == null) && (wantsPrice && newPrice == null)) {
        skippedCount++
        results.push({
          sku,
          product_id: row.product_id ?? null,
          action: 'skipped',
          old_cost: null,
          new_cost: null,
          cost_variation_pct: null,
          old_price: null,
          new_price: null,
          price_variation_pct: null,
          message: 'Sin valores nuevos para actualizar',
        })
        continue
      }

      // Buscar producto
      type ProductLite = { id: string; sku: string; cost_eur: number | null; price_eur: number | null }
      let prod: ProductLite | null = row.product_id ? null : productCache[sku] ?? null

      if (row.product_id && !prod) {
        const { data: byId } = await supabase
          .from('tt_products')
          .select('id, sku, cost_eur, price_eur')
          .eq('id', row.product_id)
          .maybeSingle()
        if (byId) prod = byId as ProductLite
      }

      // Producto no existe
      if (!prod) {
        if (!createMissing) {
          skippedCount++
          results.push({
            sku,
            product_id: null,
            action: 'skipped',
            old_cost: null,
            new_cost: newCost,
            cost_variation_pct: null,
            old_price: null,
            new_price: newPrice,
            price_variation_pct: null,
            message: 'Producto no encontrado (create_missing=false)',
          })
          continue
        }

        // Crear producto nuevo
        const { data: created, error: createErr } = await supabase
          .from('tt_products')
          .insert({
            sku,
            name: row.description || sku,
            description: row.description ?? null,
            brand: row.brand || 'SIN MARCA',
            cost_eur: newCost ?? 0,
            price_eur: newPrice ?? null,
            price_currency: currency,
            is_active: true,
          })
          .select('id, sku, cost_eur, price_eur')
          .single()

        if (createErr || !created) {
          errorCount++
          results.push({
            sku,
            product_id: null,
            action: 'error',
            old_cost: null,
            new_cost: newCost,
            cost_variation_pct: null,
            old_price: null,
            new_price: newPrice,
            price_variation_pct: null,
            message: `No se pudo crear: ${createErr?.message || 'desconocido'}`,
          })
          continue
        }

        const productId = created.id as string
        createdCount++

        // Histórico de alta
        if (newCost != null) {
          priceHistoryRows.push({
            product_id: productId,
            supplier_id: supplierId,
            supplier_name: supplierName,
            price_type: 'cost',
            old_price: null,
            new_price: newCost,
            variation_pct: null,
            currency,
            source_type: 'excel_update',
            source_id: offerId,
            notes: `Alta automática desde Excel (${supplierName})`,
            valid_from: new Date().toISOString().slice(0, 10),
            valid_until: null,
          })
        }
        if (newPrice != null) {
          priceHistoryRows.push({
            product_id: productId,
            supplier_id: supplierId,
            supplier_name: supplierName,
            price_type: 'price_eur',
            old_price: null,
            new_price: newPrice,
            variation_pct: null,
            currency,
            source_type: 'excel_update',
            source_id: offerId,
            notes: `Alta automática desde Excel (${supplierName})`,
            valid_from: new Date().toISOString().slice(0, 10),
            valid_until: null,
          })
        }

        offerItemRows.push({
          offer_id: offerId,
          product_id: productId,
          sku,
          description: row.description || sku,
          quantity: 1,
          unit_price: newCost ?? 0,
          discount_pct: 0,
          subtotal: newCost ?? 0,
          is_new_product: true,
          matched_by: 'sku',
          notes: 'Creado por actualización Excel',
          sort_order: idx,
        })

        results.push({
          sku,
          product_id: productId,
          action: 'created',
          old_cost: null,
          new_cost: newCost,
          cost_variation_pct: null,
          old_price: null,
          new_price: newPrice,
          price_variation_pct: null,
        })
        continue
      }

      // Producto existe → preparar update
      const oldCost = prod.cost_eur != null ? Number(prod.cost_eur) : null
      const oldPrice = prod.price_eur != null ? Number(prod.price_eur) : null
      const update: Record<string, unknown> = {}
      let costChanged = false
      let priceChanged = false

      if (wantsCost && newCost != null && (oldCost == null || Math.abs(oldCost - newCost) > 0.0001)) {
        update.cost_eur = newCost
        costChanged = true
      }
      if (wantsPrice && newPrice != null && (oldPrice == null || Math.abs(oldPrice - newPrice) > 0.0001)) {
        update.price_eur = newPrice
        priceChanged = true
      }

      if (Object.keys(update).length === 0) {
        noChangeCount++
        results.push({
          sku,
          product_id: prod.id,
          action: 'no_change',
          old_cost: oldCost,
          new_cost: newCost,
          cost_variation_pct: 0,
          old_price: oldPrice,
          new_price: newPrice,
          price_variation_pct: 0,
        })
        continue
      }

      const { error: updErr } = await supabase
        .from('tt_products')
        .update(update)
        .eq('id', prod.id)

      if (updErr) {
        errorCount++
        results.push({
          sku,
          product_id: prod.id,
          action: 'error',
          old_cost: oldCost,
          new_cost: newCost,
          cost_variation_pct: null,
          old_price: oldPrice,
          new_price: newPrice,
          price_variation_pct: null,
          message: `Update fallido: ${updErr.message}`,
        })
        continue
      }

      updatedCount++

      // Refrescar cache (por si vinieran filas duplicadas)
      productCache[sku] = {
        id: prod.id,
        sku,
        cost_eur: costChanged ? newCost : prod.cost_eur,
        price_eur: priceChanged ? newPrice : prod.price_eur,
      }

      // Calcular variaciones
      let costVar: number | null = null
      let priceVar: number | null = null
      if (costChanged && oldCost != null && oldCost > 0 && newCost != null) {
        costVar = Number((((newCost - oldCost) / oldCost) * 100).toFixed(2))
        variations.push(costVar)
      }
      if (priceChanged && oldPrice != null && oldPrice > 0 && newPrice != null) {
        priceVar = Number((((newPrice - oldPrice) / oldPrice) * 100).toFixed(2))
      }

      // Insertar en price_history (con source_type='excel_update' para trazabilidad)
      if (costChanged && newCost != null) {
        priceHistoryRows.push({
          product_id: prod.id,
          supplier_id: supplierId,
          supplier_name: supplierName,
          price_type: 'cost',
          old_price: oldCost,
          new_price: newCost,
          variation_pct: costVar,
          currency,
          source_type: 'excel_update',
          source_id: offerId,
          notes: `Actualización masiva desde Excel (${supplierName})`,
          valid_from: new Date().toISOString().slice(0, 10),
          valid_until: null,
        })
      }
      if (priceChanged && newPrice != null) {
        priceHistoryRows.push({
          product_id: prod.id,
          supplier_id: supplierId,
          supplier_name: supplierName,
          price_type: 'price_eur',
          old_price: oldPrice,
          new_price: newPrice,
          variation_pct: priceVar,
          currency,
          source_type: 'excel_update',
          source_id: offerId,
          notes: `Actualización masiva desde Excel (${supplierName})`,
          valid_from: new Date().toISOString().slice(0, 10),
          valid_until: null,
        })
      }

      offerItemRows.push({
        offer_id: offerId,
        product_id: prod.id,
        sku,
        description: row.description || sku,
        quantity: 1,
        unit_price: newCost ?? oldCost ?? 0,
        discount_pct: 0,
        subtotal: newCost ?? oldCost ?? 0,
        is_new_product: false,
        matched_by: 'sku',
        notes: costChanged && priceChanged ? 'Costo y precio actualizados' : costChanged ? 'Costo actualizado' : 'Precio actualizado',
        sort_order: idx,
      })

      results.push({
        sku,
        product_id: prod.id,
        action: 'updated',
        old_cost: oldCost,
        new_cost: costChanged ? newCost : oldCost,
        cost_variation_pct: costVar,
        old_price: oldPrice,
        new_price: priceChanged ? newPrice : oldPrice,
        price_variation_pct: priceVar,
      })
    }

    // 5) Insertar price_history en bulk (en chunks por si son muchos)
    if (priceHistoryRows.length > 0) {
      const CHUNK = 500
      for (let i = 0; i < priceHistoryRows.length; i += CHUNK) {
        const slice = priceHistoryRows.slice(i, i + CHUNK)
        const { error: phErr } = await supabase.from('tt_price_history').insert(slice)
        if (phErr) {
          console.warn('[apply-excel-update] price_history insert error:', phErr.message)
          // no abortamos: las actualizaciones del producto ya están aplicadas
        }
      }
    }

    // 6) Insertar items de la oferta paraguas
    if (offerItemRows.length > 0) {
      const CHUNK = 500
      for (let i = 0; i < offerItemRows.length; i += CHUNK) {
        const slice = offerItemRows.slice(i, i + CHUNK)
        const { error: oiErr } = await supabase.from('tt_supplier_offer_items').insert(slice)
        if (oiErr) {
          console.warn('[apply-excel-update] offer_items insert error:', oiErr.message)
        }
      }
    }

    // 7) Resumen estadístico de variaciones de costo
    const summary = {
      avg_variation_pct: variations.length > 0
        ? Number((variations.reduce((a, b) => a + b, 0) / variations.length).toFixed(2))
        : 0,
      max_increase_pct: variations.length > 0 ? Math.max(...variations) : 0,
      max_decrease_pct: variations.length > 0 ? Math.min(...variations) : 0,
      median_variation_pct:
        variations.length > 0
          ? (() => {
              const sorted = [...variations].sort((a, b) => a - b)
              const m = Math.floor(sorted.length / 2)
              return sorted.length % 2
                ? sorted[m]
                : Number(((sorted[m - 1] + sorted[m]) / 2).toFixed(2))
            })()
          : 0,
      total_with_variation: variations.length,
    }

    return NextResponse.json({
      ok: true,
      offer_id: offerId,
      stats: {
        total_rows: body.rows.length,
        updated: updatedCount,
        created: createdCount,
        no_change: noChangeCount,
        skipped: skippedCount,
        errors: errorCount,
      },
      variations: summary,
      results,
    })
  } catch (err) {
    console.error('[supplier-offers apply-excel-update] exception:', err)
    return NextResponse.json(
      { error: (err as Error).message || 'Error inesperado' },
      { status: 500 }
    )
  }
}
