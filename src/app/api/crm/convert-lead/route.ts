import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

export const runtime = 'nodejs'

/**
 * POST /api/crm/convert-lead
 * Body: {
 *   leadId,
 *   clientId?,              // si no viene, se crea cliente con los datos del lead
 *   createClient?: boolean, // true para crear cliente nuevo
 *   assignedTo?: string,
 *   stage?: string,
 *   probability?: number,
 * }
 *
 * Convierte un tt_lead en tt_opportunity:
 *  1) (Opcional) Crea cliente en tt_clients si no existe
 *  2) Crea tt_opportunities con los datos + IA copiada
 *  3) Linkea tt_leads.converted_opportunity_id
 *  4) Marca lead como 'qualified'
 */
export async function POST(req: NextRequest) {
  try {
    const {
      leadId,
      clientId: providedClientId,
      createClient: shouldCreateClient,
      assignedTo,
      stage = 'lead',
      probability = 40,
    } = await req.json()
    if (!leadId) return NextResponse.json({ error: 'leadId requerido' }, { status: 400 })

    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
      { auth: { persistSession: false } }
    )

    // 1) Cargar lead
    const { data: lead, error: leadErr } = await supabase
      .from('tt_leads')
      .select('*')
      .eq('id', leadId)
      .single()
    if (leadErr || !lead) return NextResponse.json({ error: 'Lead no encontrado' }, { status: 404 })

    if (lead.converted_opportunity_id) {
      return NextResponse.json({ error: 'El lead ya fue convertido', opportunityId: lead.converted_opportunity_id }, { status: 400 })
    }

    // 2) Cliente: usar el provisto, crear nuevo, o dejar sin cliente
    let clientId: string | null = providedClientId || lead.converted_client_id || null
    if (!clientId && shouldCreateClient) {
      const { data: client, error: cliErr } = await supabase
        .from('tt_clients')
        .insert({
          name: lead.company_name || lead.name,
          email: lead.email,
          phone: lead.phone,
          company_id: lead.company_id,
        })
        .select('id')
        .single()
      if (cliErr) return NextResponse.json({ error: 'No se pudo crear cliente: ' + cliErr.message }, { status: 500 })
      clientId = client.id

      await supabase.from('tt_leads').update({ converted_client_id: clientId }).eq('id', leadId)
    }

    // 3) Crear oportunidad copiando datos + IA
    const needs = (lead.ai_needs || {}) as Record<string, unknown>
    const productsInterested = Array.isArray(needs.productos) ? (needs.productos as string[]).join(', ') : null
    const urgencyMap: Record<string, string> = { alta: 'alta', baja: 'baja', media: 'media' }

    const { data: opp, error: oppErr } = await supabase
      .from('tt_opportunities')
      .insert({
        title: `[Lead ${lead.code || lead.name}] ${lead.company_name || lead.name}`,
        client_id: clientId,
        company_id: lead.company_id,
        assigned_to: assignedTo || lead.assigned_to || null,
        stage,
        value: lead.estimated_value || 0,
        currency: lead.currency || 'ARS',
        probability,
        source: lead.source,
        notes: lead.raw_message,
        product_interest: productsInterested,
        urgency: urgencyMap[String(needs.urgencia || '')] || null,
        // Copiar análisis IA
        ai_score: lead.ai_score,
        ai_temperature: lead.ai_temperature,
        ai_tags: lead.ai_tags,
        ai_suggested_action: lead.ai_suggested_action,
        ai_suggested_email: lead.ai_suggested_email,
        ai_needs: lead.ai_needs,
        ai_analysis_at: lead.ai_analysis_at,
        ai_provider: lead.ai_provider,
        source_lead_id: leadId,
      })
      .select('id, code, title')
      .single()

    if (oppErr) return NextResponse.json({ error: 'No se pudo crear oportunidad: ' + oppErr.message }, { status: 500 })

    // 4) Marcar lead como convertido
    await supabase
      .from('tt_leads')
      .update({
        status: 'qualified',
        converted_opportunity_id: opp.id,
        converted_client_id: clientId,
        converted_at: new Date().toISOString(),
      })
      .eq('id', leadId)

    return NextResponse.json({
      ok: true,
      opportunityId: opp.id,
      opportunityCode: opp.code,
      clientId,
    })
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 500 })
  }
}
