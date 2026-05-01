/**
 * POST /api/supplier-offers/parse-pdf
 *
 * Recibe un PDF de cotización (oferta) de proveedor y la parsea con Claude (vision)
 * para extraer cabecera + items. Hace match contra tt_products por SKU.
 *
 * NO guarda — devuelve el JSON parseado para que el usuario lo revise primero.
 *
 * Multipart FormData:
 *   - file: PDF de la cotización del proveedor
 *   - supplier_id?: string (UUID — si ya se sabe a qué proveedor pertenece)
 *   - company_id?: string (UUID — para subir el PDF a storage en su silo)
 */
import { NextRequest, NextResponse } from 'next/server'
import { createClient as createServiceClient } from '@supabase/supabase-js'
import { callClaude, DEFAULT_MODEL } from '@/lib/ai/ai-helper'

export const runtime = 'nodejs'
export const maxDuration = 60

const SYSTEM_PROMPT = `Sos un experto en lectura de cotizaciones (ofertas / quotes / Angebote) de proveedores industriales.
Extraés los datos en JSON estricto, sin texto extra, sin markdown, sin comentarios.
Si un campo no se encuentra, omitirlo (NO inventar). Las fechas en formato ISO YYYY-MM-DD.

REGLAS CRÍTICAS:
1. TODOS los items de la cotización deben estar en el JSON. No resumas ni omitas líneas.
2. Si la cotización tiene N items, el array "items" debe tener N entradas exactas.
3. El "supplier_name" sale del membrete / encabezado / pie de página (NO del cliente).
4. Si ves columnas como "Code", "Art.Nr", "SKU", "Código", "Referencia" — eso es el SKU.
5. Si hay descuentos por línea (-5%, -10%), capturalos en discount_pct.
6. Detectá la moneda (EUR €, USD $, ARS $, GBP £).`

const USER_PROMPT = `Extraé TODOS los datos de esta cotización (oferta) de proveedor en el siguiente JSON:

{
  "supplier_name": "Nombre del proveedor (del membrete)",
  "supplier_tax_id": "CIF/CUIT/VAT del proveedor si está",
  "supplier_email": "email de contacto si aparece",
  "offer_number": "OFT-2026-0123 / OF.123 / Quote #...",
  "offer_date": "YYYY-MM-DD",
  "valid_until": "YYYY-MM-DD (validez de la oferta)",
  "currency": "EUR | USD | ARS | GBP",
  "payment_terms": "Contado | 30 días | 50% anticipo, 50% al envío | etc",
  "incoterm": "EXW | FOB | CIF | DDP | etc",
  "delivery_terms": "Entrega en 4 semanas / Stock disponible / etc",
  "subtotal": 0,
  "tax_rate": 21,
  "tax_amount": 0,
  "total": 0,
  "notes": "Observaciones / condiciones especiales",
  "items": [
    {
      "line": 1,
      "sku": "SKU/código del proveedor",
      "description": "descripción completa del item",
      "quantity": 1,
      "unit_price": 0,
      "discount_pct": 0,
      "subtotal": 0
    }
  ],
  "confidence": 0.95
}

IMPORTANTE: la cotización puede tener varias páginas. Recorré TODAS y extraé CADA ítem.`

interface ParsedOfferItem {
  line?: number
  sku?: string
  description: string
  quantity: number
  unit_price: number
  discount_pct?: number
  subtotal?: number
}

interface ParsedOffer {
  supplier_name?: string
  supplier_tax_id?: string
  supplier_email?: string
  offer_number?: string
  offer_date?: string
  valid_until?: string
  currency?: string
  payment_terms?: string
  incoterm?: string
  delivery_terms?: string
  subtotal?: number
  tax_rate?: number
  tax_amount?: number
  total?: number
  notes?: string
  items: ParsedOfferItem[]
  confidence?: number
}

interface MatchedItem extends ParsedOfferItem {
  product_id: string | null
  is_new_product: boolean
  matched_by: 'sku' | null
  matched_product?: {
    id: string
    sku: string
    name: string
    cost_eur: number | null
    price_eur: number | null
  }
}

export async function POST(req: NextRequest) {
  try {
    const fd = await req.formData()
    const file = fd.get('file') as File | null
    const supplierId = (fd.get('supplier_id') as string | null) || null
    const companyId = (fd.get('company_id') as string | null) || null

    if (!file) {
      return NextResponse.json({ error: 'file (PDF) es requerido' }, { status: 400 })
    }
    if (file.type !== 'application/pdf' && !file.name.toLowerCase().endsWith('.pdf')) {
      return NextResponse.json({ error: 'Solo se aceptan archivos PDF' }, { status: 400 })
    }

    const buf = Buffer.from(await file.arrayBuffer())
    if (buf.length === 0) {
      return NextResponse.json({ error: 'El PDF está vacío' }, { status: 400 })
    }
    // Anthropic limit ~32MB para document content; cortamos antes
    if (buf.length > 30 * 1024 * 1024) {
      return NextResponse.json(
        { error: 'PDF demasiado grande (>30MB). Subilo a Storage y pasame la URL en otro endpoint.' },
        { status: 400 }
      )
    }

    const pdfBase64 = buf.toString('base64')

    // 1) Llamar a Claude con vision/document
    const aiResult = await callClaude({
      operation: 'supplier_offer_pdf_parse',
      systemPrompt: SYSTEM_PROMPT,
      userContent: [
        { type: 'document', source: { type: 'base64', media_type: 'application/pdf', data: pdfBase64 } },
        { type: 'text', text: USER_PROMPT },
      ],
      cacheKeyInput: pdfBase64,
      model: DEFAULT_MODEL,
      maxTokens: 16384,
      useCache: true,
      cacheSystemPrompt: true,
      referenceType: 'supplier_offer',
      companyId,
    })

    if (!aiResult.data) {
      return NextResponse.json(
        { error: aiResult.error || 'No se pudo parsear el PDF con IA' },
        { status: 502 }
      )
    }

    // 2) Extraer JSON del texto (Claude a veces incluye explicación)
    const jsonMatch = aiResult.data.match(/\{[\s\S]*\}/)
    if (!jsonMatch) {
      return NextResponse.json(
        { error: 'La IA no devolvió JSON válido', raw: aiResult.data.slice(0, 500) },
        { status: 502 }
      )
    }

    let parsed: ParsedOffer
    try {
      parsed = JSON.parse(jsonMatch[0]) as ParsedOffer
    } catch (err) {
      return NextResponse.json(
        { error: `Error parseando JSON: ${(err as Error).message}`, raw: jsonMatch[0].slice(0, 500) },
        { status: 502 }
      )
    }

    if (!Array.isArray(parsed.items)) parsed.items = []

    // 3) Subir el PDF a Storage (bucket "supplier-offers", creado en migration v41)
    const supabase = createServiceClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
      { auth: { persistSession: false } }
    )

    let pdfUrl: string | null = null
    try {
      const safeName = file.name.replace(/[^\w.-]/g, '_')
      const folder = companyId || 'no-company'
      const path = `${folder}/${Date.now()}_${safeName}`
      const { error: upErr } = await supabase.storage
        .from('supplier-offers')
        .upload(path, buf, { contentType: 'application/pdf', upsert: false })
      if (!upErr) {
        const { data: signed } = await supabase.storage
          .from('supplier-offers')
          .createSignedUrl(path, 60 * 60 * 24 * 30) // 30 días
        pdfUrl = signed?.signedUrl ?? null
      } else {
        console.warn('[supplier-offers parse-pdf] storage upload error:', upErr.message)
      }
    } catch (err) {
      console.warn('[supplier-offers parse-pdf] storage exception:', (err as Error).message)
    }

    // 4) Match cada item contra tt_products por SKU (case-insensitive)
    const skus = parsed.items
      .map((it) => (it.sku || '').trim())
      .filter((s) => s.length > 0)

    const productsBySku: Record<string, { id: string; sku: string; name: string; cost_eur: number | null; price_eur: number | null }> = {}
    if (skus.length > 0) {
      // Buscamos en mayúsculas para match case-insensitive
      const { data: prods, error: prodErr } = await supabase
        .from('tt_products')
        .select('id, sku, name, cost_eur, price_eur')
        .in('sku', skus)
      if (!prodErr && prods) {
        for (const p of prods) {
          if (p.sku) productsBySku[p.sku.toLowerCase().trim()] = p
        }
      }
      // Si Postgres es case-sensitive y hay SKUs no encontrados, hacer un segundo round con ilike
      const remaining = skus.filter((s) => !productsBySku[s.toLowerCase().trim()])
      if (remaining.length > 0) {
        for (const sku of remaining) {
          const { data: prod } = await supabase
            .from('tt_products')
            .select('id, sku, name, cost_eur, price_eur')
            .ilike('sku', sku)
            .limit(1)
            .maybeSingle()
          if (prod) productsBySku[sku.toLowerCase().trim()] = prod
        }
      }
    }

    // 5) Si supplier_id viene en la request, traemos el supplier para devolver su nombre canónico
    let resolvedSupplier: { id: string; name: string } | null = null
    if (supplierId) {
      const { data: sup } = await supabase
        .from('tt_suppliers')
        .select('id, name')
        .eq('id', supplierId)
        .maybeSingle()
      if (sup) resolvedSupplier = sup as { id: string; name: string }
    }

    // 6) Construir items enriquecidos con match info
    const matchedItems: MatchedItem[] = parsed.items.map((it, idx) => {
      const skuKey = (it.sku || '').toLowerCase().trim()
      const matched = skuKey ? productsBySku[skuKey] : undefined
      return {
        line: it.line ?? idx + 1,
        sku: it.sku?.trim(),
        description: it.description,
        quantity: Number(it.quantity) || 1,
        unit_price: Number(it.unit_price) || 0,
        discount_pct: Number(it.discount_pct) || 0,
        subtotal:
          it.subtotal != null
            ? Number(it.subtotal)
            : Number(((it.quantity ?? 1) * (it.unit_price ?? 0) * (1 - (it.discount_pct ?? 0) / 100)).toFixed(2)),
        product_id: matched?.id ?? null,
        is_new_product: !matched,
        matched_by: matched ? 'sku' : null,
        matched_product: matched,
      }
    })

    const matchedCount = matchedItems.filter((m) => !m.is_new_product).length
    const newCount = matchedItems.length - matchedCount

    return NextResponse.json({
      ok: true,
      parsed: {
        supplier_id: resolvedSupplier?.id ?? null,
        supplier_name: resolvedSupplier?.name ?? parsed.supplier_name ?? null,
        supplier_tax_id: parsed.supplier_tax_id ?? null,
        supplier_email: parsed.supplier_email ?? null,
        offer_number: parsed.offer_number ?? null,
        offer_date: parsed.offer_date ?? null,
        valid_until: parsed.valid_until ?? null,
        currency: parsed.currency || 'EUR',
        payment_terms: parsed.payment_terms ?? null,
        incoterm: parsed.incoterm ?? null,
        delivery_terms: parsed.delivery_terms ?? null,
        subtotal: parsed.subtotal ?? null,
        tax_rate: parsed.tax_rate ?? null,
        tax_amount: parsed.tax_amount ?? null,
        total: parsed.total ?? null,
        notes: parsed.notes ?? null,
        items: matchedItems,
        confidence: parsed.confidence ?? null,
      },
      stats: {
        total_items: matchedItems.length,
        matched: matchedCount,
        new_products: newCount,
      },
      pdf_url: pdfUrl,
      ai: {
        cache_hit: aiResult.cacheHit,
        cost_usd: aiResult.costUsd,
        model: aiResult.model,
      },
      ai_extracted: parsed, // raw para guardar en JSONB cuando se haga save
    })
  } catch (err) {
    console.error('[supplier-offers parse-pdf] exception:', err)
    return NextResponse.json(
      { error: (err as Error).message || 'Error inesperado' },
      { status: 500 }
    )
  }
}
