import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

interface SummaryResponse {
  summary: string
  highlights: string[]
  actions: string[]
  concerns: string[]
  provider: string
  date: string
  fromCache: boolean
}

// GET /api/ai/daily-summary?companyId=xxx&cron=1
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const companyId = searchParams.get('companyId')
    const isCron = searchParams.get('cron') === '1'
    const forceRefresh = searchParams.get('refresh') === '1'

    if (!companyId && !isCron) {
      return NextResponse.json({ error: 'companyId requerido' }, { status: 400 })
    }

    const today = new Date().toISOString().split('T')[0]

    // If cron, process all companies
    if (isCron && !companyId) {
      const { data: companies } = await supabase
        .from('tt_companies')
        .select('id, name')
        .eq('active', true)

      const results = []
      for (const company of (companies || []) as Array<{ id: string; name: string }>) {
        try {
          const result = await generateSummary(company.id, company.name, today)
          results.push({ companyId: company.id, ...result })
        } catch (e) {
          results.push({ companyId: company.id, error: (e as Error).message })
        }
      }
      return NextResponse.json({ cron: true, results })
    }

    if (!companyId) {
      return NextResponse.json({ error: 'companyId requerido' }, { status: 400 })
    }

    // Check cache
    if (!forceRefresh) {
      const { data: cached } = await supabase
        .from('tt_ai_summaries')
        .select('*')
        .eq('company_id', companyId)
        .eq('date', today)
        .single()

      if (cached) {
        return NextResponse.json({
          summary: cached.summary,
          highlights: cached.highlights,
          actions: cached.actions,
          concerns: cached.concerns,
          provider: cached.ai_provider,
          date: today,
          fromCache: true,
        } as SummaryResponse)
      }
    }

    // Get company name
    const { data: company } = await supabase
      .from('tt_companies')
      .select('name, currency')
      .eq('id', companyId)
      .single()

    const companyName = (company as { name: string; currency?: string } | null)?.name || 'la empresa'

    const result = await generateSummary(companyId, companyName, today)
    return NextResponse.json(result)
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 500 })
  }
}

async function generateSummary(
  companyId: string,
  companyName: string,
  today: string
): Promise<SummaryResponse> {
  const now = new Date()
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString()
  const weekStart = new Date(Date.now() - 7 * 86400000).toISOString()

  // Gather all data in parallel
  const [
    newLeadsToday,
    hotLeads,
    convertedLeads,
    quotesOpen,
    quotesSent,
    quotesExpired,
    ordersCreated,
    ordersShipped,
    invoicesEmitted,
    invoicesCollected,
    invoicesOverdue,
    invoicesOverdue30,
    totalCobradoMes,
    agentTasks,
  ] = await Promise.all([
    supabase.from('tt_leads').select('*', { count: 'exact', head: true }).eq('company_id', companyId).gte('created_at', today),
    supabase.from('tt_leads').select('*', { count: 'exact', head: true }).eq('company_id', companyId).eq('ai_temperature', 'hot'),
    supabase.from('tt_leads').select('*', { count: 'exact', head: true }).eq('company_id', companyId).not('converted_at', 'is', null).gte('converted_at', weekStart),
    supabase.from('tt_quotes').select('total, currency').eq('company_id', companyId).in('status', ['draft', 'borrador', 'sent', 'enviada']),
    supabase.from('tt_quotes').select('*', { count: 'exact', head: true }).eq('company_id', companyId).eq('status', 'sent').gte('updated_at', weekStart),
    supabase.from('tt_quotes').select('*', { count: 'exact', head: true }).eq('company_id', companyId).eq('status', 'expired').gte('updated_at', weekStart),
    supabase.from('tt_sales_orders').select('*', { count: 'exact', head: true }).eq('company_id', companyId).gte('created_at', weekStart),
    supabase.from('tt_sales_orders').select('*', { count: 'exact', head: true }).eq('company_id', companyId).eq('status', 'shipped').gte('updated_at', weekStart),
    supabase.from('tt_documents').select('total, currency').eq('company_id', companyId).eq('doc_type', 'factura').gte('invoice_date', monthStart),
    supabase.from('tt_documents').select('total, currency').eq('company_id', companyId).eq('doc_type', 'factura').eq('status', 'cobrada').gte('updated_at', monthStart),
    supabase.from('tt_documents').select('total, currency').eq('company_id', companyId).eq('doc_type', 'factura').in('status', ['emitida', 'autorizada', 'pendiente_cobro']),
    supabase.from('tt_documents').select('total, currency, invoice_date').eq('company_id', companyId).eq('doc_type', 'factura').in('status', ['emitida', 'autorizada', 'pendiente_cobro']).lt('invoice_date', new Date(Date.now() - 30 * 86400000).toISOString()),
    supabase.from('tt_documents').select('total, currency').eq('company_id', companyId).eq('doc_type', 'factura').eq('status', 'cobrada').gte('updated_at', monthStart),
    supabase.from('tt_agent_tasks').select('*', { count: 'exact', head: true }).eq('company_id', companyId).gte('created_at', today),
  ])

  const sumTotal = (rows: Array<{ total?: unknown; currency?: unknown }> | null) =>
    (rows || []).reduce((s, r) => s + Number(r.total || 0), 0)

  const data = {
    leads: {
      nuevosHoy: newLeadsToday.count || 0,
      hot: hotLeads.count || 0,
      convertidosSemana: convertedLeads.count || 0,
    },
    cotizaciones: {
      abiertas: quotesOpen.data?.length || 0,
      totalAbierto: sumTotal(quotesOpen.data || []),
      enviadasSemana: quotesSent.count || 0,
      expiradas: quotesExpired.count || 0,
    },
    pedidos: {
      creadosSemana: ordersCreated.count || 0,
      despachadosSemana: ordersShipped.count || 0,
    },
    facturacion: {
      emitidas: invoicesEmitted.data?.length || 0,
      totalEmitido: sumTotal(invoicesEmitted.data || []),
      cobradas: invoicesCollected.data?.length || 0,
      totalCobrado: sumTotal(invoicesCollected.data || []),
      pendientes: invoicesOverdue.data?.length || 0,
      totalPendiente: sumTotal(invoicesOverdue.data || []),
      vencidas30dias: invoicesOverdue30.data?.length || 0,
      totalVencido: sumTotal(invoicesOverdue30.data || []),
    },
    cobradoMes: sumTotal(totalCobradoMes.data || []),
    tareasAgente: agentTasks.count || 0,
  }

  // Build AI prompt
  const geminiApiKey = process.env.GEMINI_API_KEY
  const claudeApiKey = process.env.ANTHROPIC_API_KEY

  const promptData = JSON.stringify(data, null, 2)
  const systemPrompt = `Sos el director financiero de ${companyName}. Analizá estos datos del negocio y generá un resumen ejecutivo en español rioplatense.`

  const userPrompt = `Datos del día (${today}):
${promptData}

Generá un análisis ejecutivo con este formato JSON exacto:
{
  "summary": "Resumen del día en 3 líneas máximo, directo y concreto",
  "highlights": [
    "✅ algo positivo relevante",
    "⚠️ algo negativo o preocupante",
    "📊 dato importante neutro"
  ],
  "actions": [
    "Acción 1 prioritaria para mañana",
    "Acción 2",
    "Acción 3",
    "Acción 4",
    "Acción 5"
  ],
  "concerns": [
    "Tendencia preocupante 1",
    "Tendencia preocupante 2"
  ]
}

Usá voseo (vos, podés, tenés). Sé específico con números. No inventes datos que no estén en el JSON.
Respondé SOLO con el JSON.`

  let rawContent = ''
  let provider = 'gemini'

  // Try Gemini first
  if (geminiApiKey) {
    try {
      const geminiRes = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${geminiApiKey}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            system_instruction: { parts: [{ text: systemPrompt }] },
            contents: [{ role: 'user', parts: [{ text: userPrompt }] }],
            generationConfig: { maxOutputTokens: 2048, temperature: 0.3 },
          }),
        }
      )

      if (geminiRes.ok) {
        const geminiData = await geminiRes.json()
        rawContent = geminiData.candidates?.[0]?.content?.parts?.[0]?.text || ''
        provider = 'gemini'
      }
    } catch {
      // fallthrough to Claude
    }
  }

  // Fallback to Claude
  if (!rawContent && claudeApiKey) {
    try {
      const claudeRes = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': claudeApiKey,
          'anthropic-version': '2023-06-01',
        },
        body: JSON.stringify({
          model: 'claude-sonnet-4-20250514',
          max_tokens: 2048,
          system: systemPrompt,
          messages: [{ role: 'user', content: userPrompt }],
        }),
      })

      if (claudeRes.ok) {
        const claudeData = await claudeRes.json()
        rawContent = claudeData.content?.[0]?.text || ''
        provider = 'claude'
      }
    } catch {
      // AI unavailable
    }
  }

  // Parse response
  let parsed: {
    summary: string
    highlights: string[]
    actions: string[]
    concerns: string[]
  } = {
    summary: `Hoy ${companyName} tuvo ${data.leads.nuevosHoy} leads nuevos, ${data.facturacion.cobradas} cobros y ${data.facturacion.pendientes} facturas pendientes.`,
    highlights: [
      `📊 ${data.facturacion.cobradas} facturas cobradas este mes`,
      `⚠️ ${data.facturacion.vencidas30dias} facturas vencidas a +30 días`,
    ],
    actions: [
      'Revisar facturas vencidas',
      'Contactar leads hot sin actividad',
      'Verificar pedidos pendientes de despacho',
    ],
    concerns: [],
  }

  if (rawContent) {
    try {
      const jsonMatch = rawContent.match(/\{[\s\S]*\}/)
      if (jsonMatch) {
        const p = JSON.parse(jsonMatch[0]) as typeof parsed
        if (p.summary) parsed = p
      }
    } catch {
      // Use fallback
    }
  }

  // Save to cache (upsert)
  await supabase
    .from('tt_ai_summaries')
    .upsert(
      {
        company_id: companyId,
        date: today,
        summary: parsed.summary,
        highlights: parsed.highlights,
        actions: parsed.actions,
        concerns: parsed.concerns,
        raw_data: data,
        ai_provider: provider,
      },
      { onConflict: 'company_id,date' }
    )

  return {
    summary: parsed.summary,
    highlights: parsed.highlights,
    actions: parsed.actions,
    concerns: parsed.concerns,
    provider,
    date: today,
    fromCache: false,
  }
}
