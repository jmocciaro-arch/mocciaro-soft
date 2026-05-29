/**
 * POST /api/products/smart-search
 *
 * Buscador de productos del catálogo con parseo semántico via IA.
 *
 * Resuelve el caso: el usuario escribe "TOHNICHI MOD.QSP200N4 PRO02114".
 * El buscador tradicional (ILIKE sobre search_text) no encuentra el producto
 * porque la descripción no está escrita exactamente igual en el catálogo.
 *
 * Este endpoint:
 *   1. Llama a Claude (Haiku, cacheado) para desglozar la query en componentes:
 *      - brand: "TOHNICHI" (marca)
 *      - model: "QSP200N4" (modelo)
 *      - internal_code: "PRO02114" (código interno proveedor/fabricante)
 *      - keywords: ["torquímetro", "200 NM"] (palabras descriptivas)
 *   2. Hace múltiples sub-queries en tt_products combinándolas con scoring:
 *      - SKU exacto / manufacturer_code / supplier_code → 100
 *      - brand + modelo match → 85
 *      - brand + similitud fuzzy en name → 65
 *      - keywords en search_text → 30-50
 *   3. Devuelve top 20 con `match_reasons` explicando por qué cada producto
 *      apareció (para que la UI muestre "🎯 marca + modelo · 🔢 código interno").
 *
 * Body:
 *   { query: string, limit?: number }
 *
 * Response:
 *   { items: [{ ...product, score, match_reasons[] }], parsed: { brand, model, internal_code, keywords } }
 */

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { z } from 'zod'
import { callClaude } from '@/lib/ai/ai-helper'
import { withCompanyFilter } from '@/lib/auth/with-company-filter'
import { logger } from '@/lib/observability/logger'

export const runtime = 'nodejs'
export const maxDuration = 15

const bodySchema = z.object({
  query: z.string().min(2).max(500),
  limit: z.number().int().min(1).max(50).optional(),
})

// Schema del JSON que pedimos a la IA. Si no parsea, fallback a búsqueda fuzzy plana.
const parsedQuerySchema = z.object({
  brand: z.string().nullable().optional(),
  model: z.string().nullable().optional(),
  internal_code: z.string().nullable().optional(),
  keywords: z.array(z.string()).optional(),
})

type ParsedQuery = z.infer<typeof parsedQuerySchema>

interface ProductRow {
  id: string
  sku: string
  name: string
  brand: string | null
  modelo: string | null
  category: string | null
  manufacturer_code: string | null
  supplier_code: string | null
  price_eur: number | null
  image_url: string | null
  search_text: string | null
}

interface SmartProduct extends ProductRow {
  score: number
  match_reasons: string[]
}

function adminClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } }
  )
}

const SYSTEM_PROMPT = `Sos un parser de descripciones de productos industriales (herramientas, torquímetros, atornilladores, abrasivos, etc).

Te paso UN string con la descripción de un producto tal como aparece en una OC del cliente.
Tu tarea: extraer los componentes semánticos para que el sistema busque en su catálogo.

Devolvé SOLO un JSON con esta forma (sin comentarios, sin markdown):
{
  "brand": "MARCA en mayúsculas o null",
  "model": "código de modelo del fabricante (ej QSP200N4, ASW18-60) o null",
  "internal_code": "código interno del proveedor o codificación numérica larga (ej PRO02114, CR20306) o null",
  "keywords": ["palabras", "descriptivas", "útiles", "para", "fuzzy"]
}

Ejemplos:
- "TOHNICHI MOD.QSP200N4 PRO02114 40-200 NM" → { "brand": "TOHNICHI", "model": "QSP200N4", "internal_code": "PRO02114", "keywords": ["torquímetro", "40-200 NM"] }
- "FEIN ASW18-60PC ANGULAR 25 A 60 NM" → { "brand": "FEIN", "model": "ASW18-60PC", "internal_code": null, "keywords": ["atornillador", "angular", "25-60 NM"] }
- "Atornillador 1/4 8 puntas" → { "brand": null, "model": null, "internal_code": null, "keywords": ["atornillador", "1/4", "8 puntas"] }

Reglas:
- brand: solo marcas reales conocidas (FEIN, TOHNICHI, GEDORE, INGERSOLL RAND, APEX, etc). Si no estás seguro, null.
- model: código alfanumérico del fabricante (suele tener letras + números). Quitá MOD. y abreviaciones.
- internal_code: códigos del tipo PRO00808, CR20311, CRPR009720 que parecen códigos internos.
- keywords: 2-5 palabras útiles para fuzzy match. Sin la marca/modelo/código (ya van en los otros campos).`

async function parseQuery(query: string, userId: string | null, companyId: string | null): Promise<ParsedQuery> {
  // Si la query es muy corta o solo números/letras pegadas, devolver vacío y dejar fuzzy puro
  if (query.length < 6) return { keywords: [query] }

  const result = await callClaude({
    operation: 'product_smart_search_parse',
    systemPrompt: SYSTEM_PROMPT,
    userContent: [{ type: 'text', text: query }],
    cacheKeyInput: query,
    useCache: true,
    cacheSystemPrompt: true,
    maxTokens: 300,
    userId,
    companyId,
    referenceType: 'product_search',
  })

  if (result.error || !result.data) {
    logger.warn('[smart-search] IA no disponible, fallback fuzzy', { error: result.error })
    return { keywords: query.split(/\s+/).filter((w) => w.length >= 3) }
  }

  // Extraer JSON del texto (puede venir con markdown ```json fences)
  const raw = result.data.replace(/```json\s*|\s*```/g, '').trim()
  try {
    const parsed = parsedQuerySchema.parse(JSON.parse(raw))
    return parsed
  } catch (err) {
    logger.warn('[smart-search] parse JSON falló, fallback fuzzy', { raw, err })
    return { keywords: query.split(/\s+/).filter((w) => w.length >= 3) }
  }
}

export async function POST(req: NextRequest) {
  const guard = await withCompanyFilter()
  if (!guard.ok) return guard.response

  const body = bodySchema.safeParse(await req.json().catch(() => null))
  if (!body.success) {
    return NextResponse.json({ error: 'query requerida (2-500 chars)' }, { status: 400 })
  }

  const { query, limit = 20 } = body.data
  const sb = adminClient()

  // 1) IA parsea la query
  const parsed = await parseQuery(query, guard.ttUserId, null)

  // 2) Sub-queries paralelas
  // Cada una devuelve un set de productos con un score base. Después mergeamos
  // por id y sumamos scores + acumulamos razones.
  const candidates = new Map<string, SmartProduct>()

  function add(p: ProductRow, score: number, reason: string) {
    const existing = candidates.get(p.id)
    if (existing) {
      existing.score += score
      if (!existing.match_reasons.includes(reason)) existing.match_reasons.push(reason)
    } else {
      candidates.set(p.id, { ...p, score, match_reasons: [reason] })
    }
  }

  const SELECT = 'id, sku, name, brand, modelo, category, manufacturer_code, supplier_code, price_eur, image_url, search_text'

  // Tipo PromiseLike: el builder de Supabase devuelve un thenable, no un Promise estricto
  const promises: PromiseLike<unknown>[] = []

  // 2a) SKU exacto (case insensitive)
  if (parsed.internal_code) {
    promises.push(
      sb.from('tt_products').select(SELECT).eq('active', true).ilike('sku', parsed.internal_code).limit(5)
        .then(({ data }) => (data || []).forEach((p) => add(p as ProductRow, 100, '🎯 SKU coincide con código interno')))
    )
  }
  if (parsed.model) {
    promises.push(
      sb.from('tt_products').select(SELECT).eq('active', true).ilike('sku', parsed.model).limit(5)
        .then(({ data }) => (data || []).forEach((p) => add(p as ProductRow, 100, '🎯 SKU coincide con modelo')))
    )
  }

  // 2b) manufacturer_code o supplier_code = internal_code
  if (parsed.internal_code) {
    promises.push(
      sb.from('tt_products').select(SELECT).eq('active', true).ilike('manufacturer_code', parsed.internal_code).limit(5)
        .then(({ data }) => (data || []).forEach((p) => add(p as ProductRow, 95, '🔢 Código fabricante coincide')))
    )
    promises.push(
      sb.from('tt_products').select(SELECT).eq('active', true).ilike('supplier_code', parsed.internal_code).limit(5)
        .then(({ data }) => (data || []).forEach((p) => add(p as ProductRow, 90, '🔢 Código proveedor coincide')))
    )
  }

  // 2c) brand + modelo (combo fuerte)
  if (parsed.brand && parsed.model) {
    promises.push(
      sb.from('tt_products').select(SELECT).eq('active', true).ilike('brand', parsed.brand).ilike('modelo', `%${parsed.model}%`).limit(10)
        .then(({ data }) => (data || []).forEach((p) => add(p as ProductRow, 85, `🏷️ Marca ${parsed.brand} + modelo`)))
    )
    // También: brand + modelo en sku (común que el SKU contenga el modelo)
    promises.push(
      sb.from('tt_products').select(SELECT).eq('active', true).ilike('brand', parsed.brand).ilike('sku', `%${parsed.model}%`).limit(10)
        .then(({ data }) => (data || []).forEach((p) => add(p as ProductRow, 80, `🏷️ Marca ${parsed.brand} + SKU contiene modelo`)))
    )
  }

  // 2d) Solo brand → fuzzy en name
  if (parsed.brand) {
    promises.push(
      sb.from('tt_products').select(SELECT).eq('active', true).ilike('brand', parsed.brand).ilike('search_text', `%${query.slice(0, 30)}%`).limit(10)
        .then(({ data }) => (data || []).forEach((p) => add(p as ProductRow, 60, `🏷️ Marca ${parsed.brand} + texto similar`)))
    )
  }

  // 2e) Keywords en search_text — útil cuando IA no encontró marca/modelo
  if (parsed.keywords && parsed.keywords.length > 0) {
    for (const kw of parsed.keywords.slice(0, 3)) {
      if (kw.length < 3) continue
      promises.push(
        sb.from('tt_products').select(SELECT).eq('active', true).ilike('search_text', `%${kw}%`).limit(8)
          .then(({ data }) => (data || []).forEach((p) => add(p as ProductRow, 25, `🔍 Contiene "${kw}"`)))
      )
    }
  }

  // 2f) Fallback: query cruda en search_text (siempre, peso bajo)
  promises.push(
    sb.from('tt_products').select(SELECT).eq('active', true).ilike('search_text', `%${query.slice(0, 30)}%`).limit(10)
      .then(({ data }) => (data || []).forEach((p) => add(p as ProductRow, 15, '🔍 Texto similar')))
  )

  await Promise.all(promises)

  // 3) Ordenar por score y devolver top N
  const items = Array.from(candidates.values())
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)

  return NextResponse.json({
    items,
    parsed,
    total: candidates.size,
  })
}
