import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { getEnv } from '@/lib/env'

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
        supabase.from('tt_documents').select('legal_number, total, currency, invoice_date, client:tt_clients(name)').eq('company_id', companyId).eq('type', 'factura').in('status', ['emitida', 'autorizada', 'pendiente_cobro']).order('invoice_date', { ascending: true }).limit(5),
        supabase.from('tt_leads').select('name, company_name, ai_score, ai_temperature, status, created_at').eq('company_id', companyId).order('created_at', { ascending: false }).limit(5),
        supabase.from('tt_clients').select('name, email, phone').eq('company_id', companyId).limit(10),
      ])

      const c = company.data as any
      erpContext = `\n=== CONTEXTO DEL ERP (datos reales) ===
Empresa activa: ${c?.trade_name || c?.name} ${c?.country ? '('+c.country+')' : ''}
Razón social: ${c?.legal_name || '—'}
Prefijo docs: ${c?.code_prefix || '—'}
CUIT/NIF: ${c?.tax_id || '—'}

Leads totales: ${leadsCount.count || 0}
Leads HOT (top 5 por score):
${(hotLeads.data || []).map((l: any) => `  - ${l.name}${l.company_name ? ' @ '+l.company_name : ''} — score ${l.ai_score} — ${(l.ai_tags||[]).join(', ')}`).join('\n') || '  (ninguno)'}

Leads recientes:
${(recentLeads.data || []).map((l: any) => `  - ${l.name} (${l.ai_temperature || 'sin analizar'}) — ${l.status}`).join('\n') || '  (ninguno)'}

Oportunidades recientes (top 5):
${(opps.data || []).map((o: any) => `  - ${o.title} — ${o.stage} — ${o.currency} ${o.value} — ${o.probability}%`).join('\n') || '  (ninguna)'}

Facturas pendientes de cobro (top 5):
${(overdueInvoices.data || []).map((f: any) => `  - ${f.legal_number || '—'} — ${f.currency} ${f.total} — ${f.client?.name || 's/cliente'} — ${f.invoice_date}`).join('\n') || '  (ninguna)'}

Clientes en esta empresa: ${topClients.data?.length || 0}
`
    }

    const systemPrompt = `Sos el asistente IA del ERP Mocciaro Soft. Ayudás a Juan Manuel Mocciaro a operar el sistema.
${erpContext}

INSTRUCCIONES:
- Respondé en español rioplatense (usar "vos")
- Sé breve y directo, usá listas/tablas cuando tenga sentido
- Si te preguntan stats o cosas de datos, usá SOLO la info de arriba (no inventes números)
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
- Si te pide "crear X" o "mandar email a Y" — **NO lo hacés directamente**, sino que le sugerís los pasos en la UI o le generás el draft que puede copiar
${page ? `\nEl usuario está viendo: ${page}` : ''}`

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

    return NextResponse.json({ reply, provider })
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 500 })
  }
}
