import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { getEnv } from '@/lib/env'
import { withCompanyFilter, ensureCompanyAccess } from '@/lib/auth/with-company-filter'
import { looksLikeCatalogQuery, searchCatalogWithStock, formatCatalogContext } from '@/lib/assistant/catalog-stock'
import { extractProposedAction } from '@/lib/assistant/parse-action'

export const runtime = 'nodejs'
export const maxDuration = 60

interface Msg { role: 'user' | 'assistant'; content: string }

/**
 * POST /api/assistant/chat
 * Body: { messages: Msg[], companyId?: string, page?: string }
 *
 * Asistente IA del ERP Mocciaro Soft con contexto de datos reales.
 * Inyecta stats de la empresa activa y responde con Gemini (fallback Claude).
 */
export async function POST(req: NextRequest) {
  try {
    const { messages, companyId, page } = await req.json()
    if (!Array.isArray(messages) || messages.length === 0) {
      return NextResponse.json({ error: 'messages requerido' }, { status: 400 })
    }

    // Seguridad: autenticar al usuario y, si viene companyId, validar acceso a esa empresa.
    // Antes este endpoint usaba service_role con el companyId del body SIN chequear acceso
    // (un usuario podía leer datos de cualquier empresa pasando otro companyId).
    const guard = await withCompanyFilter()
    if (!guard.ok) return guard.response
    if (companyId) {
      const access = ensureCompanyAccess(guard, companyId)
      if (!access.ok) return access.response
    }

    // 1) Cargar contexto del ERP
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
      { auth: { persistSession: false } }
    )

    let erpContext = ''
    if (companyId) {
      const [company, leadsCount, hotLeads, opps, overdueInvoices, recentLeads, topClients] = await Promise.all([
        supabase.from('tt_companies').select('name, trade_name, legal_name, tax_id, country, code_prefix').eq('id', companyId).single(),
        supabase.from('tt_leads').select('*', { count: 'exact', head: true }).eq('company_id', companyId),
        supabase.from('tt_leads').select('name, company_name, ai_score, ai_tags, status').eq('company_id', companyId).eq('ai_temperature', 'hot').order('ai_score', { ascending: false }).limit(5),
        supabase.from('tt_opportunities').select('title, stage, value, currency, probability').eq('company_id', companyId).order('created_at', { ascending: false }).limit(5),
        supabase.from('tt_documents').select('legal_number, total, currency, invoice_date, client:tt_clients(name)').eq('company_id', companyId).eq('doc_type', 'factura').in('status', ['emitida', 'autorizada', 'pendiente_cobro']).order('invoice_date', { ascending: true }).limit(5),
        supabase.from('tt_leads').select('name, company_name, ai_score, ai_temperature, status, created_at').eq('company_id', companyId).order('created_at', { ascending: false }).limit(5),
        supabase.from('tt_clients').select('name, email, phone').eq('company_id', companyId).limit(10),
      ])

      const c = company.data as {
        name: string; trade_name: string | null; legal_name: string | null
        tax_id: string | null; country: string | null; code_prefix: string | null
      } | null
      // supabase infiere el embed client:tt_clients(name) como array; en una relación
      // to-one el runtime devuelve objeto. Casteamos a la forma real que usa el template.
      const overdueRows = (overdueInvoices.data ?? []) as unknown as Array<{
        legal_number: string | null; total: number | null; currency: string | null
        invoice_date: string | null; client: { name: string } | null
      }>
      erpContext = `\n=== CONTEXTO DEL ERP (datos reales) ===
Empresa activa: ${c?.trade_name || c?.name} ${c?.country ? '('+c.country+')' : ''}
Razón social: ${c?.legal_name || '—'}
Prefijo docs: ${c?.code_prefix || '—'}
CUIT/NIF: ${c?.tax_id || '—'}

Leads totales: ${leadsCount.count || 0}
Leads HOT (top 5 por score):
${(hotLeads.data || []).map((l: { name: string; company_name: string | null; ai_score: number | null; ai_tags: string[] | null }) => `  - ${l.name}${l.company_name ? ' @ '+l.company_name : ''} — score ${l.ai_score} — ${(l.ai_tags||[]).join(', ')}`).join('\n') || '  (ninguno)'}

Leads recientes:
${(recentLeads.data || []).map((l: { name: string; ai_temperature: string | null; status: string | null }) => `  - ${l.name} (${l.ai_temperature || 'sin analizar'}) — ${l.status}`).join('\n') || '  (ninguno)'}

Oportunidades recientes (top 5):
${(opps.data || []).map((o: { title: string; stage: string | null; value: number | null; currency: string | null; probability: number | null }) => `  - ${o.title} — ${o.stage} — ${o.currency} ${o.value} — ${o.probability}%`).join('\n') || '  (ninguna)'}

Facturas pendientes de cobro (top 5):
${overdueRows.map((f) => `  - ${f.legal_number || '—'} — ${f.currency} ${f.total} — ${f.client?.name || 's/cliente'} — ${f.invoice_date}`).join('\n') || '  (ninguna)'}

Clientes en esta empresa: ${topClients.data?.length || 0}
`
    }

    // Consulta de catálogo/stock: si el último mensaje parece pregunta de inventario,
    // buscamos productos cruzando TODAS las marcas/modelos + stock real y lo inyectamos.
    let catalogContext = ''
    const lastUser = [...messages].reverse().find((m: Msg) => m.role === 'user')
    if (lastUser && looksLikeCatalogQuery(lastUser.content)) {
      const companyScope = companyId ? [companyId] : guard.accessibleCompanyIds
      const items = await searchCatalogWithStock({ query: lastUser.content, accessibleCompanyIds: companyScope })
      catalogContext = formatCatalogContext(lastUser.content, items)
    }

    const systemPrompt = `Sos el asistente IA del ERP Mocciaro Soft. Ayudás a Juan Manuel Mocciaro a operar el sistema.
${erpContext}

INSTRUCCIONES:
- Respondé en español rioplatense (usar "vos")
- Sé breve y directo, usá listas/tablas cuando tenga sentido
- Si te preguntan stats o cosas de datos, usá SOLO la info de arriba (no inventes números)
- Si te preguntan por stock, inventario o qué productos hay, usá SOLO el bloque "INVENTARIO" de abajo (si aparece). No inventes productos, SKUs ni cantidades. Cruzá todas las marcas/modelos y priorizá lo que tiene stock > 0.
- Si no tenés la info, decí "no tengo ese dato cargado, probá en /admin/diagnostico o refrescá"
- Podés redactar emails con tono profesional argentino, incluyendo saludo y firma "Saludos, Equipo Mocciaro"
- Podés explicar cómo usar módulos:
  * /crm/leads → alta de leads + análisis IA
  * /crm → pipeline de oportunidades
  * /cotizador → crear cotizaciones
  * /ventas/importar-oc → importar OC de cliente con IA
  * /ventas?tab=facturas → facturas
  * /cobros → conciliación bancaria con IA
  * /sat → servicio técnico
  * /admin/diagnostico → health check del sistema
- Para mandar emails u otras acciones que NO sean cotizaciones, no las ejecutás: sugerí los pasos en la UI o generá el draft que pueda copiar.

CREAR COTIZACIÓN BORRADOR (acción que SÍ podés proponer):
Cuando el usuario te pida armar/crear una cotización o presupuesto para un cliente (ej "armame una coti para Mirgor con 5 PH2 de 50"), además de tu respuesta en texto, agregá al FINAL un bloque EXACTAMENTE así:
\`\`\`action
{"type":"crear_borrador_cotizacion","client_hint":"<cliente como lo dijo>","currency":"EUR","items":[{"sku":"<SKU EXACTO del inventario o null>","description":"<descripción>","quantity":<n>}]}
\`\`\`
Reglas del bloque:
- Usá SOLO SKUs que aparezcan en el bloque INVENTARIO o que ya hayas mencionado en la charla. Si no estás seguro del SKU, poné "sku":null y describí bien el producto. NUNCA inventes SKUs.
- Si no especificó cantidad, asumí 1. Si NO mencionó cliente, NO emitas el bloque: preguntale para qué cliente es.
- El bloque NO crea nada por sí solo: el usuario lo revisa y confirma en una tarjeta. En el texto, confirmá brevemente qué preparaste.
${page ? `\nEl usuario está viendo: ${page}` : ''}
${catalogContext}`

    // 2) Intentar Gemini primero
    let reply = ''
    let provider: 'gemini' | 'claude' = 'gemini'

    const geminiKey = getEnv('GEMINI_API_KEY')
    if (geminiKey) {
      try {
        const res = await fetch(
          `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${geminiKey}`,
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              system_instruction: { parts: [{ text: systemPrompt }] },
              contents: messages.map((m: Msg) => ({
                role: m.role === 'assistant' ? 'model' : 'user',
                parts: [{ text: m.content }],
              })),
              generationConfig: { temperature: 0.3, maxOutputTokens: 2048 },
            }),
          }
        )
        if (res.ok) {
          const data = await res.json()
          reply = data.candidates?.[0]?.content?.parts?.[0]?.text || ''
          if (reply) provider = 'gemini'
        } else {
          console.log(`Gemini falló con status ${res.status}, usando Claude como fallback`)
        }
      } catch (geminiErr) {
        console.log('Gemini error, fallback a Claude:', geminiErr)
      }
    }

    // 3) Fallback Claude si Gemini falló
    if (!reply) {
      const anthropicKey = getEnv('ANTHROPIC_API_KEY')
      if (!anthropicKey) {
        return NextResponse.json({ error: 'Ninguna IA configurada (GEMINI_API_KEY/ANTHROPIC_API_KEY)' }, { status: 500 })
      }
      try {
        const res = await fetch('https://api.anthropic.com/v1/messages', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-api-key': anthropicKey,
            'anthropic-version': '2023-06-01',
          },
          body: JSON.stringify({
            model: 'claude-sonnet-4-20250514',
            max_tokens: 2048,
            system: systemPrompt,
            messages: messages.map((m: Msg) => ({ role: m.role, content: m.content })),
          }),
        })
        if (res.ok) {
          const data = await res.json()
          reply = data.content?.[0]?.text || ''
          provider = 'claude'
        }
      } catch { /* fallthrough */ }
    }

    if (!reply) {
      return NextResponse.json({ error: 'No se obtuvo respuesta de ninguna IA' }, { status: 500 })
    }

    // Extraer la acción propuesta (crear cotización borrador) si el modelo la emitió.
    const { reply: cleanReply, action: proposedAction } = extractProposedAction(reply)
    if (proposedAction && companyId && !proposedAction.client_id && proposedAction.client_hint) {
      // Resolución best-effort del cliente por nombre (ilike, sin fuzzy). El usuario
      // confirma/corrige en la tarjeta; si no hay match, el borrador se crea sin cliente.
      const { data: match } = await supabase
        .from('tt_clients')
        .select('id, name')
        .eq('company_id', companyId)
        .ilike('name', `%${proposedAction.client_hint}%`)
        .limit(1)
        .maybeSingle()
      if (match) {
        const m = match as { id: string; name: string }
        proposedAction.client_id = m.id
        proposedAction.client_name = m.name
      }
    }

    return NextResponse.json({ reply: cleanReply, provider, proposed_action: proposedAction ?? undefined })
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 500 })
  }
}
