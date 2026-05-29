/**
 * POST /api/products/smart-search
 *
 * Buscador de productos del catálogo con parseo semántico via IA.
 *
 * Resuelve el caso: el usuario escribe "TOHNICHI MOD.QSP200N4 PRO02114".
 * El buscador tradicional (ILIKE sobre search_text) no encuentra el producto
 * porque la descripción no está escrita exactamente igual en el catálogo.
 *
 * Estrategia v3 (después de feedback de Juan):
 *   - Matches EXACTOS (SKU, manufacturer_code) dominan con scores ≥150
 *   - Bonus suave por marca correcta (+25), SIN penalty por otras marcas
 *     (la IA puede equivocarse parseando — no destruimos resultados buenos)
 *   - NO trasladamos "todos los productos de marca X" como filler — eso
 *     metía 15 productos random de la marca aunque no tuvieran nada que ver
 *   - Keywords contribuyen poco (15 c/u), exactos pesan mucho más
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
- "CRPR009720 ATORNILLADOR ACOPLE 1/4 FEIN ASM18-12 PC 4-12 RANGO" → { "brand": "FEIN", "model": "ASM18-12", "internal_code": "CRPR009720", "keywords": ["atornillador", "acople", "1/4", "4-12"] }
- "Atornillador 1/4 8 puntas" → { "brand": null, "model": null, "internal_code": null, "keywords": ["atornillador", "1/4", "8 puntas"] }

Reglas:
- brand: solo marcas reales conocidas (FEIN, TOHNICHI, GEDORE, INGERSOLL RAND, APEX, MAKITA, BOSCH, etc). Si no estás seguro, null.
- model: código alfanumérico del fabricante (suele tener letras + números). Quitá MOD. y abreviaciones.
- internal_code: códigos del tipo PRO00808, CR20311, CRPR009720 que parecen códigos internos. Si la query empieza con uno, probablemente sea este.
- keywords: 3-6 palabras útiles para fuzzy match. Sin la marca/modelo/código (ya van en los otros campos). Incluí descripciones técnicas (rangos, medidas, "acople", "angular", etc).`

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
  const promises: PromiseLike<unknown>[] = []

  // ─── A) MATCHES EXACTOS DE CÓDIGOS (los más fuertes, scores ≥150) ───

  // SKU = código interno (CRPR009720 es el caso más común en OCs)
  if (parsed.internal_code) {
    promises.push(
      sb.from('tt_products').select(SELECT).eq('active', true).ilike('sku', parsed.internal_code).limit(5)
        .then(({ data }) => (data || []).forEach((p) => add(p as ProductRow, 200, '🎯 SKU exacto')))
    )
    // manufacturer_code y supplier_code
    promises.push(
      sb.from('tt_products').select(SELECT).eq('active', true).ilike('manufacturer_code', parsed.internal_code).limit(5)
        .then(({ data }) => (data || []).forEach((p) => add(p as ProductRow, 180, '🔢 Código fabricante exacto')))
    )
    promises.push(
      sb.from('tt_products').select(SELECT).eq('active', true).ilike('supplier_code', parsed.internal_code).limit(5)
        .then(({ data }) => (data || []).forEach((p) => add(p as ProductRow, 170, '🔢 Código proveedor exacto')))
    )
    // SKU CONTIENE el código (parcial) — solo cuando el código es distintivo (≥5 chars).
    // Códigos cortos como "8727" matchean falsos positivos: "08727", "187271", "98727X"
    // pueden ser productos sin nada que ver. Con ≥5 chars la probabilidad cae mucho.
    if (parsed.internal_code.length >= 5) {
      promises.push(
        sb.from('tt_products').select(SELECT).eq('active', true).ilike('sku', `%${parsed.internal_code}%`).limit(8)
          .then(({ data }) => (data || []).forEach((p) => add(p as ProductRow, 90, '🔢 SKU contiene código')))
      )
    }
  }

  // SKU = modelo (a veces el modelo del fabricante coincide con nuestro SKU)
  if (parsed.model) {
    promises.push(
      sb.from('tt_products').select(SELECT).eq('active', true).ilike('sku', parsed.model).limit(5)
        .then(({ data }) => (data || []).forEach((p) => add(p as ProductRow, 200, '🎯 SKU = modelo')))
    )
  }

  // ─── B) MARCA + MODELO (combo fuerte, ≥100) ───
  if (parsed.brand && parsed.model) {
    promises.push(
      sb.from('tt_products').select(SELECT).eq('active', true).ilike('brand', parsed.brand).ilike('modelo', `%${parsed.model}%`).limit(10)
        .then(({ data }) => (data || []).forEach((p) => add(p as ProductRow, 140, `🎯 ${parsed.brand} + modelo`)))
    )
    promises.push(
      sb.from('tt_products').select(SELECT).eq('active', true).ilike('brand', parsed.brand).ilike('sku', `%${parsed.model}%`).limit(10)
        .then(({ data }) => (data || []).forEach((p) => add(p as ProductRow, 130, `🎯 ${parsed.brand} + SKU con modelo`)))
    )
    promises.push(
      sb.from('tt_products').select(SELECT).eq('active', true).ilike('brand', parsed.brand).ilike('name', `%${parsed.model}%`).limit(10)
        .then(({ data }) => (data || []).forEach((p) => add(p as ProductRow, 120, `🎯 ${parsed.brand} + name con modelo`)))
    )
  }

  // ─── C) MODELO en cualquier marca (siempre, incluso con brand detectada) ───
  // Fix: antes solo corría con !parsed.brand. Pero si la DB tiene productos
  // con brand=null (caso TOHNICHI 13195: name="TOHNICHI QSP50N3 TORQUE WRENCH"
  // pero campo brand vacío), el sub-query brand+model los excluía. Ahora
  // siempre buscamos el modelo en name/modelo, con peso bajo si no hay brand
  // confirmada, alto si la marca coincide (lo agrega el bonus post-merge).
  if (parsed.model) {
    promises.push(
      sb.from('tt_products').select(SELECT).eq('active', true).ilike('modelo', `%${parsed.model}%`).limit(10)
        .then(({ data }) => (data || []).forEach((p) => add(p as ProductRow, 90, `📐 Modelo ${parsed.model}`)))
    )
    promises.push(
      sb.from('tt_products').select(SELECT).eq('active', true).ilike('name', `%${parsed.model}%`).limit(10)
        .then(({ data }) => (data || []).forEach((p) => add(p as ProductRow, 85, `📐 Name contiene ${parsed.model}`)))
    )
    promises.push(
      sb.from('tt_products').select(SELECT).eq('active', true).ilike('sku', `%${parsed.model}%`).limit(10)
        .then(({ data }) => (data || []).forEach((p) => add(p as ProductRow, 80, `📐 SKU contiene ${parsed.model}`)))
    )
  }

  // ─── D) KEYWORDS — contribución menor, solo keywords distintivas ───
  // Filtramos keywords muy cortas o numéricas/medidas comunes que generan ruido:
  //   "1/4", "8mm", "20", "50 NM" matchean miles de productos sin aportar señal.
  // Solo usamos keywords con ≥5 chars Y que tengan al menos una letra.
  if (parsed.keywords && parsed.keywords.length > 0) {
    const distinctiveKeywords = parsed.keywords
      .map((k) => k.trim())
      .filter((k) => k.length >= 5 && /[a-zA-Z]/.test(k))
      .slice(0, 3)
    for (const kw of distinctiveKeywords) {
      promises.push(
        sb.from('tt_products').select(SELECT).eq('active', true).ilike('name', `%${kw}%`).limit(6)
          .then(({ data }) => (data || []).forEach((p) => add(p as ProductRow, 15, `🔍 "${kw}"`)))
      )
    }
  }

  // ─── E) FALLBACK: solo si NO tenemos brand/model/code parseados ───
  // Antes corría siempre y traía ruido. Ahora solo cuando la IA no detectó
  // ningún componente estructural (búsqueda libre tipo "atornillador chico").
  if (!parsed.brand && !parsed.model && !parsed.internal_code) {
    promises.push(
      sb.from('tt_products').select(SELECT).eq('active', true).ilike('name', `%${query.slice(0, 50)}%`).limit(15)
        .then(({ data }) => (data || []).forEach((p) => add(p as ProductRow, 20, '🔍 Búsqueda libre')))
    )
  }

  await Promise.all(promises)

  // 3) Filtro por marca + bonus.
  //
  // Si la IA detectó marca con confianza (parsed.brand existe), filtramos
  // FUERA todos los productos con marca distinta. Es lo que pide la lógica
  // del usuario: "si dije TOHNICHI no me muestres INGERSOLL RAND".
  //
  // Excepciones (productos que SE MANTIENEN aunque la marca sea distinta):
  //   - Match exacto por SKU/código fabricante/código proveedor: el match
  //     es tan fuerte que probablemente la marca está mal cargada en DB
  //   - Brand del producto es null: no podemos saber su marca, lo dejamos
  //
  // Para los que pasan el filtro: bonus +25 si la marca coincide.
  if (parsed.brand) {
    const queryBrand = parsed.brand.toUpperCase().trim()
    const EXACT_MATCH_TAGS = ['🎯 SKU exacto', '🎯 SKU = modelo', '🔢 Código fabricante exacto', '🔢 Código proveedor exacto', '🔢 SKU contiene código']

    for (const [id, c] of candidates.entries()) {
      const productBrand = (c.brand || '').toUpperCase().trim()

      if (productBrand && productBrand !== queryBrand) {
        // Marca distinta — verificamos si tiene un match exacto que justifique mantenerlo
        const hasExactMatch = c.match_reasons.some((r) => EXACT_MATCH_TAGS.some((tag) => r.startsWith(tag)))
        if (!hasExactMatch) {
          candidates.delete(id)
          continue
        }
        // Tiene match exacto: lo mantenemos pero con badge de advertencia y score reducido
        c.score = Math.max(0, c.score - 30)
        c.match_reasons.push(`⚠️ Marca ${c.brand} (vos pediste ${parsed.brand})`)
      } else if (productBrand && productBrand === queryBrand) {
        // Marca correcta — bonus
        c.score += 25
        if (!c.match_reasons.some((r) => r.startsWith('🏷️ Marca'))) {
          c.match_reasons.unshift(`🏷️ Marca ${parsed.brand} correcta`)
        }
      }
      // productBrand vacío/null → lo dejamos pasar sin tocar el score
    }
  }

  // 4) Threshold de relevancia: descartamos productos que aparecieron solo por
  // razones débiles (1-2 keywords sin match estructural).
  //
  // Threshold dinámico:
  //   - Si hay productos con score ≥100 (matches exactos/fuertes), descartamos
  //     todo lo que tenga <40 (probablemente solo keyword genérica)
  //   - Si NO hay matches fuertes, mantenemos threshold mínimo de 20 para
  //     no devolver basura pura
  const allCandidates = Array.from(candidates.values())
  const maxScore = allCandidates.reduce((m, c) => Math.max(m, c.score), 0)
  const threshold = maxScore >= 100 ? 40 : 20

  const items = allCandidates
    .filter((c) => c.score >= threshold)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)

  return NextResponse.json({
    items,
    parsed,
    total: candidates.size,
  })
}
