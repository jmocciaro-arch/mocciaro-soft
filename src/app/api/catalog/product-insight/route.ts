// POST /api/catalog/product-insight
// Dado un query de producto, devuelve contexto completo para el asesor IA:
//   - Si está en catálogo: historial de clientes, co-ventas, historial de precios
//   - Si no está: análisis Claude basado en su conocimiento industrial

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createClient as createAdmin } from '@supabase/supabase-js'
import { getEnv } from '@/lib/env'

export const runtime = 'nodejs'
export const maxDuration = 30

interface LineRow {
  document_id: string
  unit_price: number
  quantity: number
}

interface DocRow {
  id: string
  created_at: string
  currency: string
  doc_type: string
  company_id: string
  client_id: string | null
}

interface ClientRow {
  id: string
  name: string
}

export async function POST(req: NextRequest) {
  try {
    const { query, companyId } = (await req.json()) as { query: string; companyId?: string }

    if (!query || typeof query !== 'string' || query.trim().length < 2) {
      return NextResponse.json({ error: 'query requerido (min 2 chars)' }, { status: 400 })
    }

    // Auth check — usuario debe estar logueado
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
      return NextResponse.json({ error: 'no_auth' }, { status: 401 })
    }

    const admin = createAdmin(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
      { auth: { persistSession: false } }
    )

    const q = query.trim()

    // 1. Buscar producto en catálogo
    const { data: exactMatch } = await admin
      .from('tt_products')
      .select('id, sku, name, brand, category, price_eur, price_usd, price_ars')
      .ilike('sku', q)
      .limit(1)
      .maybeSingle()

    const { data: fuzzyMatches } = await admin
      .from('tt_products')
      .select('id, sku, name, brand, category, price_eur, price_usd, price_ars')
      .or(`name.ilike.%${q}%,sku.ilike.%${q}%`)
      .limit(5)

    const catalogProduct = exactMatch ?? (fuzzyMatches && fuzzyMatches.length > 0 ? fuzzyMatches[0] : null)
    const catalogFound = !!catalogProduct

    type ClientRecord = { client_name: string; last_doc_date: string; purchase_count: number; last_price: number; currency: string }
    type CoProduct = { sku: string; description: string; co_count: number }
    type PricePoint = { date: string; unit_price: number; currency: string; client_name: string }

    let clients: ClientRecord[] = []
    let coProducts: CoProduct[] = []
    let priceHistory: PricePoint[] = []

    if (catalogFound && catalogProduct) {
      const sku = catalogProduct.sku as string

      // 2a. Líneas de documento con este SKU
      const { data: lines } = await admin
        .from('tt_document_lines')
        .select('document_id, unit_price, quantity')
        .ilike('sku', sku)
        .limit(80)

      if (lines && lines.length > 0) {
        const typedLines = lines as LineRow[]
        const docIds = [...new Set(typedLines.map((l) => l.document_id))]

        // 2b. Documentos de esas líneas (filtrar solo ventas)
        const { data: docs } = await admin
          .from('tt_documents')
          .select('id, created_at, currency, doc_type, company_id, client_id')
          .in('id', docIds)
          .in('doc_type', ['presupuesto', 'coti', 'albaran', 'factura', 'pedido'])

        if (docs && docs.length > 0) {
          const typedDocs = docs as DocRow[]

          // Filtrar por empresa si corresponde
          const filteredDocs = companyId
            ? typedDocs.filter((d) => d.company_id === companyId)
            : typedDocs

          const filteredDocIds = new Set(filteredDocs.map((d) => d.id))
          const filteredLines = typedLines.filter((l) => filteredDocIds.has(l.document_id))

          // 2c. Clientes
          const clientIds = [...new Set(filteredDocs.map((d) => d.client_id).filter(Boolean))] as string[]
          const clientNames: Map<string, string> = new Map()

          if (clientIds.length > 0) {
            const { data: clientRows } = await admin
              .from('tt_clients')
              .select('id, name')
              .in('id', clientIds)
            if (clientRows) {
              for (const c of clientRows as ClientRow[]) {
                clientNames.set(c.id, c.name)
              }
            }
          }

          // Mapa docId → doc
          const docMap = new Map(filteredDocs.map((d) => [d.id, d]))

          // Agrupar por cliente
          const byClient = new Map<string, { name: string; count: number; lastDate: string; lastPrice: number; currency: string }>()
          for (const line of filteredLines) {
            const doc = docMap.get(line.document_id)
            if (!doc) continue
            const clientId = doc.client_id ?? 'anon'
            const clientName = clientId !== 'anon' ? (clientNames.get(clientId) ?? 'Sin nombre') : 'Sin cliente'
            const existing = byClient.get(clientId)
            if (!existing || doc.created_at > existing.lastDate) {
              byClient.set(clientId, {
                name: clientName,
                count: (existing?.count ?? 0) + 1,
                lastDate: doc.created_at,
                lastPrice: line.unit_price ?? 0,
                currency: doc.currency ?? 'EUR',
              })
            } else {
              existing.count++
            }
          }

          clients = Array.from(byClient.values())
            .sort((a, b) => b.count - a.count)
            .slice(0, 8)
            .map((c) => ({
              client_name: c.name,
              last_doc_date: c.lastDate,
              purchase_count: c.count,
              last_price: c.lastPrice,
              currency: c.currency,
            }))

          // Historial de precios
          priceHistory = filteredLines
            .filter((l) => (l.unit_price ?? 0) > 0)
            .slice(0, 20)
            .map((l) => {
              const doc = docMap.get(l.document_id)
              const clientId = doc?.client_id ?? null
              return {
                date: (doc?.created_at ?? '').substring(0, 10),
                unit_price: l.unit_price ?? 0,
                currency: doc?.currency ?? 'EUR',
                client_name: clientId ? (clientNames.get(clientId) ?? '—') : '—',
              }
            })
            .sort((a, b) => a.date.localeCompare(b.date))

          // 2d. Co-productos en los mismos documentos
          if (filteredDocIds.size > 0) {
            const { data: coLines } = await admin
              .from('tt_document_lines')
              .select('sku, description')
              .in('document_id', [...filteredDocIds].slice(0, 30))
              .not('sku', 'ilike', sku)
              .limit(100)

            if (coLines) {
              const coMap = new Map<string, { desc: string; count: number }>()
              for (const cl of coLines as { sku: string | null; description: string | null }[]) {
                if (!cl.sku) continue
                const existing = coMap.get(cl.sku)
                coMap.set(cl.sku, {
                  desc: cl.description ?? cl.sku,
                  count: (existing?.count ?? 0) + 1,
                })
              }
              coProducts = Array.from(coMap.entries())
                .sort((a, b) => b[1].count - a[1].count)
                .slice(0, 8)
                .map(([coSku, val]) => ({ sku: coSku, description: val.desc, co_count: val.count }))
            }
          }
        }
      }
    }

    // 3. Prompt IA
    const geminiKey = getEnv('GEMINI_API_KEY')
    const anthropicKey = getEnv('ANTHROPIC_API_KEY')

    const systemPrompt = `Sos el asesor de producto del ERP Mocciaro Soft para el equipo de ventas de Torquetools/Buscatools.
Sos experto en herramientas industriales: torquímetros, atornilladores neumáticos y eléctricos (FEIN, FIAM, TOHNICHI, NORBAR, Mountz), balanceadores, roscadoras, punzonadoras, y accesorios industriales.
Respondé siempre en español rioplatense. Sé conciso, estructurado y útil para ventas.`

    const userPrompt = catalogFound && catalogProduct
      ? `El vendedor buscó el producto "${query}".

ENCONTRADO EN CATÁLOGO:
- SKU: ${catalogProduct.sku as string}
- Nombre: ${catalogProduct.name as string}
- Marca: ${(catalogProduct.brand as string | null) ?? '—'}
- Categoría: ${(catalogProduct.category as string | null) ?? '—'}
- Precio EUR: ${catalogProduct.price_eur ? `€${catalogProduct.price_eur as number}` : '—'}

${clients.length > 0 ? `CLIENTES QUE LO COMPRARON (${clients.length}):\n${clients.map((c) => `- ${c.client_name}: ${c.purchase_count} compra(s), último precio ${c.currency} ${c.last_price}`).join('\n')}` : 'Sin historial de ventas todavía.'}

${coProducts.length > 0 ? `SE VENDE FRECUENTEMENTE CON:\n${coProducts.map((p) => `- ${p.sku}: ${p.description} (${p.co_count} veces juntos)`).join('\n')}` : ''}

${priceHistory.length > 0 ? `ÚLTIMOS PRECIOS:\n${priceHistory.slice(-6).map((p) => `- ${p.date}: ${p.currency} ${p.unit_price} (${p.client_name})`).join('\n')}` : ''}

Generá un resumen útil para el vendedor: qué es el producto, a qué clientes interesaría, si el precio está estable o hubo saltos anómalos, y con qué otros productos conviene hacer bundle. Máximo 180 palabras.`
      : `El vendedor buscó "${query}" pero NO está en el catálogo de Mocciaro Soft.

Analizá el código/nombre y:
1. Describí qué tipo de producto es (1-2 líneas)
2. Indicá el fabricante/marca probable
3. Sugerí la URL oficial donde buscar información técnica
4. Sugerí si valdría la pena incorporarlo al catálogo según el perfil de Torquetools/Buscatools

Máximo 150 palabras.`

    let aiSummary = ''

    if (geminiKey) {
      try {
        const res = await fetch(
          `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${geminiKey}`,
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              system_instruction: { parts: [{ text: systemPrompt }] },
              contents: [{ role: 'user', parts: [{ text: userPrompt }] }],
              generationConfig: { temperature: 0.2, maxOutputTokens: 512 },
            }),
          }
        )
        if (res.ok) {
          const data = (await res.json()) as { candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }> }
          aiSummary = data.candidates?.[0]?.content?.parts?.[0]?.text ?? ''
        }
      } catch { /* fallback */ }
    }

    if (!aiSummary && anthropicKey) {
      try {
        const res = await fetch('https://api.anthropic.com/v1/messages', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-api-key': anthropicKey,
            'anthropic-version': '2023-06-01',
          },
          body: JSON.stringify({
            model: 'claude-haiku-4-5-20251001',
            max_tokens: 512,
            system: systemPrompt,
            messages: [{ role: 'user', content: userPrompt }],
          }),
        })
        if (res.ok) {
          const data = (await res.json()) as { content?: Array<{ text?: string }> }
          aiSummary = data.content?.[0]?.text ?? ''
        }
      } catch { /* no AI */ }
    }

    return NextResponse.json({
      catalogFound,
      product: catalogProduct ?? null,
      otherMatches: (fuzzyMatches ?? []).filter((p) => p.id !== catalogProduct?.id).slice(0, 3),
      clients,
      coProducts,
      priceHistory,
      aiSummary: aiSummary || (catalogFound
        ? 'No se pudo generar análisis IA. Revisá los datos de clientes y precios arriba.'
        : 'No se pudo analizar el producto. Buscalo directamente en el sitio del fabricante.'),
    })
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 500 })
  }
}
