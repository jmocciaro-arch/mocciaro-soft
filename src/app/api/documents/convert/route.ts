import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

export const runtime = 'nodejs'

/**
 * POST /api/documents/convert
 * Body: { sourceDocId, targetType: 'pedido'|'delivery_note'|'factura', companyId }
 *
 * Convierte un documento en otro tipo, copiando cliente, items y condiciones.
 * Crea el link en tt_document_relations.
 * Si targetType === 'pedido', también verifica stock.
 */

type TargetType = 'pedido' | 'delivery_note' | 'factura'

interface ConvertBody {
  sourceDocId: string
  targetType: TargetType
  companyId: string
}

// Mapa de status inicial según tipo destino
const INITIAL_STATUS: Record<TargetType, string> = {
  pedido: 'open',
  delivery_note: 'pending',
  factura: 'draft',
}

// Prefijos para código provisional
const TYPE_PREFIX: Record<TargetType, string> = {
  pedido: 'PED',
  delivery_note: 'ALB',
  factura: 'FAC',
}

// Tipo de relación para tt_document_relations
const RELATION_TYPE: Record<TargetType, string> = {
  pedido: 'pedido',
  delivery_note: 'albaran',
  factura: 'factura',
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json() as ConvertBody
    const { sourceDocId, targetType, companyId } = body

    if (!sourceDocId || !targetType || !companyId) {
      return NextResponse.json(
        { error: 'sourceDocId, targetType y companyId son requeridos' },
        { status: 400 }
      )
    }

    const validTypes: TargetType[] = ['pedido', 'delivery_note', 'factura']
    if (!validTypes.includes(targetType)) {
      return NextResponse.json(
        { error: `targetType inválido. Opciones: ${validTypes.join(', ')}` },
        { status: 400 }
      )
    }

    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
      { auth: { persistSession: false } }
    )

    // ── 1. Obtener documento fuente + items ──────────────────────
    const { data: sourceDoc, error: sourceErr } = await supabase
      .from('tt_documents')
      .select('*')
      .eq('id', sourceDocId)
      .maybeSingle()

    if (sourceErr || !sourceDoc) {
      return NextResponse.json(
        { error: 'Documento fuente no encontrado' },
        { status: 404 }
      )
    }

    const { data: sourceItems, error: itemsErr } = await supabase
      .from('tt_document_lines')
      .select('*')
      .eq('document_id', sourceDocId)
      .order('sort_order', { ascending: true })

    if (itemsErr) {
      return NextResponse.json({ error: itemsErr.message }, { status: 500 })
    }

    // ── 2. Generar código provisional para el nuevo documento ───
    // Intentar via RPC next_document_code, fallback a timestamp
    let newCode = `${TYPE_PREFIX[targetType]}-${new Date().getFullYear()}-${Date.now().toString().slice(-5)}`
    try {
      const { data: codeData } = await supabase.rpc('next_document_code', {
        p_company_id: companyId,
        p_type: targetType,
      })
      if (codeData) newCode = codeData as string
    } catch {
      // Usar el código provisional generado arriba
    }

    // ── 3. Crear el nuevo documento ─────────────────────────────
    const newDocData = {
      doc_type: targetType,
      system_code: newCode,
      display_ref: newCode,
      company_id: companyId,
      client_id: sourceDoc.client_id,
      currency: sourceDoc.currency,
      status: INITIAL_STATUS[targetType],
      incoterm: sourceDoc.incoterm,
      payment_terms: sourceDoc.payment_terms,
      delivery_date: sourceDoc.delivery_date,
      shipping_address: sourceDoc.shipping_address,
      notes: sourceDoc.notes,
      tax_rate: sourceDoc.tax_rate,
      subject_iva: sourceDoc.subject_iva,
      subject_irpf: sourceDoc.subject_irpf,
      tariff: sourceDoc.tariff,
      agent: sourceDoc.agent,
      created_by: sourceDoc.created_by,
      subtotal: sourceDoc.subtotal,
      tax_amount: sourceDoc.tax_amount,
      total: sourceDoc.total,
      metadata: {
        ...((sourceDoc.metadata as Record<string, unknown>) || {}),
        converted_from: sourceDocId,
        converted_from_type: sourceDoc.doc_type,
        converted_at: new Date().toISOString(),
      },
    }

    const { data: newDoc, error: insertErr } = await supabase
      .from('tt_documents')
      .insert(newDocData)
      .select('id, system_code, display_ref')
      .single()

    if (insertErr || !newDoc) {
      return NextResponse.json(
        { error: insertErr?.message || 'Error creando documento' },
        { status: 500 }
      )
    }

    // ── 4. Copiar items ─────────────────────────────────────────
    if (sourceItems && sourceItems.length > 0) {
      const newItems = sourceItems.map((item: Record<string, unknown>) => ({
        document_id: newDoc.id,
        sku: item.sku,
        description: item.description,
        quantity: item.quantity,
        unit_price: item.unit_price,
        unit_cost: item.unit_cost,
        discount_pct: item.discount_pct,
        subtotal: item.subtotal,
        sort_order: item.sort_order,
        notes: item.notes,
        product_id: item.product_id,
        is_section: item.is_section,
        section_label: item.section_label,
      }))

      const { error: itemInsertErr } = await supabase
        .from('tt_document_lines')
        .insert(newItems)

      if (itemInsertErr) {
        console.error('[convert] Error copiando items:', itemInsertErr)
      }
    }

    // ── 5. Crear link en tt_document_relations ──────────────────────
    await supabase.from('tt_document_relations').insert({
      parent_id: sourceDocId,
      child_id: newDoc.id,
      relation_type: RELATION_TYPE[targetType],
    })

    // ── 6. Actualizar status del doc fuente si corresponde ──────
    if (sourceDoc.doc_type === 'coti' && targetType === 'pedido') {
      await supabase
        .from('tt_documents')
        .update({ status: 'accepted' })
        .eq('id', sourceDocId)
        .eq('status', 'sent') // solo si estaba en "enviada"
    }

    // ── 7. Verificar stock si es pedido ─────────────────────────
    let stockAlert: { insufficient: boolean; items: unknown[] } | undefined

    if (targetType === 'pedido' && sourceItems?.length) {
      const itemsToCheck = (sourceItems as Array<{
        sku?: string
        product_id?: string
        quantity?: number
        is_section?: boolean
      }>)
        .filter((i) => !i.is_section && (i.sku || i.product_id))
        .map((i) => ({ sku: i.sku || i.product_id || '', quantity: i.quantity || 1 }))

      if (itemsToCheck.length > 0) {
        try {
          const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'
          const stockRes = await fetch(`${baseUrl}/api/stock/check-availability`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ items: itemsToCheck }),
          })
          if (stockRes.ok) {
            const stockData = await stockRes.json() as { available: boolean; items: unknown[] }
            if (!stockData.available) {
              stockAlert = { insufficient: true, items: stockData.items }

              // Crear alerta de stock insuficiente
              await supabase.from('tt_generated_alerts').insert({
                company_id: companyId,
                type: 'stock_insuficiente',
                severity: 'high',
                title: `Stock insuficiente para ${newCode}`,
                message: `El pedido ${newCode} tiene items sin stock suficiente.`,
                metadata: { document_id: newDoc.id, stock_check: stockData },
              })
            }
          }
        } catch (stockErr) {
          console.warn('[convert] Error verificando stock:', stockErr)
        }
      }
    }

    return NextResponse.json({
      newDocId: newDoc.id,
      newCode: newDoc.system_code || newDoc.display_ref,
      stockAlert,
    })
  } catch (err) {
    console.error('[convert] Error:', err)
    return NextResponse.json({ error: (err as Error).message }, { status: 500 })
  }
}
