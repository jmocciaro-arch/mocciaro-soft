import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { aiQuery } from '@/lib/ai'
import { google } from 'googleapis'
import { getGmailTokens, setGmailTokens } from '@/lib/gmail-tokens'

export const runtime = 'nodejs'

/**
 * POST /api/webhooks/gmail
 * Body: { messageId: string, companyId?: string }
 *
 * Recibe un Gmail message ID, analiza el email con Gemini AI,
 * crea leads automáticamente y genera alertas.
 */

interface GmailAnalysis {
  is_lead: boolean
  name: string
  company: string
  email: string
  phone: string
  product_interest: string
  urgency: 'baja' | 'media' | 'alta'
  score: number
  reason: string
  is_oc: boolean
}

async function getOAuth2Client() {
  const oauth2Client = new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET,
    process.env.GOOGLE_REDIRECT_URI
  )
  const tokens = await getGmailTokens()
  if (!tokens) {
    throw new Error('Gmail no conectado. Visitar /api/auth/google para autorizar.')
  }
  oauth2Client.setCredentials(tokens)
  oauth2Client.on('tokens', (newTokens) => {
    void (async () => {
      try {
        const existing = (await getGmailTokens()) || {}
        await setGmailTokens({ ...existing, ...newTokens })
      } catch { /* non-blocking */ }
    })()
  })
  return oauth2Client
}

function extractTextFromPayload(payload: Record<string, unknown>): string {
  if (!payload) return ''
  const mimeType = payload.mimeType as string | undefined
  const body = payload.body as { data?: string } | undefined
  const parts = payload.parts as Array<Record<string, unknown>> | undefined

  if (mimeType === 'text/plain' && body?.data) {
    return Buffer.from(body.data, 'base64').toString('utf-8')
  }
  if (parts) {
    for (const part of parts) {
      const partMime = part.mimeType as string | undefined
      const partBody = part.body as { data?: string } | undefined
      if (partMime === 'text/plain' && partBody?.data) {
        return Buffer.from(partBody.data, 'base64').toString('utf-8')
      }
    }
    for (const part of parts) {
      const nested = extractTextFromPayload(part)
      if (nested) return nested
    }
  }
  return ''
}

function checkOCInAttachments(payload: Record<string, unknown>): boolean {
  const parts = payload.parts as Array<Record<string, unknown>> | undefined
  if (!parts) return false
  const ocRegex = /\b(oc|orden|purchase.?order|po[-_]?\d)\b/i
  for (const part of parts) {
    const filename = (part.filename as string | undefined) || ''
    if (filename && ocRegex.test(filename)) return true
    // Recursivo
    if (checkOCInAttachments(part)) return true
  }
  return false
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json() as { messageId?: string; companyId?: string }
    const { messageId, companyId } = body

    if (!messageId) {
      return NextResponse.json({ error: 'messageId requerido' }, { status: 400 })
    }

    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
      { auth: { persistSession: false } }
    )

    // Verificar si ya fue procesado
    const { data: existing } = await supabase
      .from('tt_email_log')
      .select('id')
      .eq('gmail_message_id', messageId)
      .maybeSingle()

    if (existing) {
      return NextResponse.json({ created: false, reason: 'Email ya procesado' })
    }

    // Leer el email via Gmail API
    let fromEmail = ''
    let fromName = ''
    let subject = ''
    let bodyText = ''
    let isOC = false

    try {
      const auth = await getOAuth2Client()
      const gmail = google.gmail({ version: 'v1', auth })

      const { data: msg } = await gmail.users.messages.get({
        userId: 'me',
        id: messageId,
        format: 'full',
      })

      const headers = msg.payload?.headers || []
      for (const h of headers) {
        if (h.name === 'From') {
          const match = h.value?.match(/^"?([^"<]*)"?\s*<([^>]+)>/)
          if (match) {
            fromName = match[1].trim().replace(/^"|"$/g, '')
            fromEmail = match[2].trim()
          } else {
            fromEmail = h.value || ''
          }
        }
        if (h.name === 'Subject') subject = h.value || ''
      }

      bodyText = extractTextFromPayload(msg.payload as Record<string, unknown> || {})
      isOC = checkOCInAttachments(msg.payload as Record<string, unknown> || {})
    } catch (gmailErr) {
      console.warn('[gmail-webhook] Gmail API no disponible, usando datos del body:', gmailErr)
      // Fallback: usar datos que vengan en el body
      fromEmail = body.companyId ? 'desconocido@email.com' : 'desconocido@email.com'
      bodyText = 'Email sin contenido disponible'
    }

    // Analizar con Gemini AI
    const systemPrompt = `Sos el asistente de ventas de Mocciaro — distribuidor de herramientas industriales.
Analizá emails entrantes y determiná si son leads comerciales.
Respondé SIEMPRE con JSON estricto, sin markdown ni texto extra.`

    const userPrompt = `Analizá este email y devolvé JSON con este formato exacto:
{
  "is_lead": true/false,
  "name": "nombre del remitente",
  "company": "empresa del remitente",
  "email": "${fromEmail}",
  "phone": "teléfono si aparece",
  "product_interest": "productos o servicios que menciona",
  "urgency": "baja|media|alta",
  "score": 0-100,
  "reason": "por qué es o no es un lead",
  "is_oc": ${isOC}
}

Email a analizar:
De: ${fromName} <${fromEmail}>
Asunto: ${subject}
Cuerpo:
${bodyText.slice(0, 2000)}`

    let analysis: GmailAnalysis = {
      is_lead: false,
      name: fromName,
      company: '',
      email: fromEmail,
      phone: '',
      product_interest: '',
      urgency: 'baja',
      score: 0,
      reason: 'Sin análisis',
      is_oc: isOC,
    }

    try {
      const aiResult = await aiQuery(systemPrompt, userPrompt, 'gemini')
      const cleaned = aiResult.replace(/```json\n?|\n?```/g, '').trim()
      analysis = { ...analysis, ...JSON.parse(cleaned) }
    } catch (aiErr) {
      console.error('[gmail-webhook] Error AI:', aiErr)
      // Continuar con análisis básico
    }

    let leadId: string | undefined

    // Si es un lead, crear en tt_leads
    if (analysis.is_lead) {
      const effectiveCompanyId = companyId || process.env.DEFAULT_COMPANY_ID

      const temperature =
        analysis.score >= 70 ? 'hot' :
        analysis.score >= 40 ? 'warm' : 'cold'

      const { data: newLead, error: leadErr } = await supabase
        .from('tt_leads')
        .insert({
          company_id: effectiveCompanyId,
          name: analysis.name || fromName,
          company_name: analysis.company || '',
          email: analysis.email || fromEmail,
          phone: analysis.phone || '',
          source: 'email_auto',
          status: 'new',
          ai_score: analysis.score,
          ai_temperature: temperature,
          ai_tags: analysis.product_interest ? [analysis.product_interest] : [],
          ai_suggested_action: `Urgencia: ${analysis.urgency}. ${analysis.reason}`,
          ai_analysis_at: new Date().toISOString(),
          metadata: {
            gmail_message_id: messageId,
            subject,
            urgency: analysis.urgency,
            is_oc: analysis.is_oc,
          },
        })
        .select('id')
        .single()

      if (leadErr) {
        console.error('[gmail-webhook] Error creando lead:', leadErr)
      } else {
        leadId = newLead?.id
      }
    }

    // Crear alerta si es lead o si es OC
    if (analysis.is_lead || analysis.is_oc) {
      const effectiveCompanyId = companyId || process.env.DEFAULT_COMPANY_ID

      await supabase.from('tt_generated_alerts').insert({
        company_id: effectiveCompanyId,
        type: analysis.is_oc ? 'oc_recibida' : 'lead_nuevo',
        severity: analysis.urgency === 'alta' ? 'high' : 'medium',
        title: analysis.is_oc
          ? `OC recibida de ${fromName || fromEmail}`
          : `Nuevo lead: ${analysis.name || fromEmail}`,
        message: analysis.reason,
        metadata: {
          gmail_message_id: messageId,
          lead_id: leadId,
          email: fromEmail,
          score: analysis.score,
          subject,
        },
      })
    }

    // Loguear el email procesado
    await supabase.from('tt_email_log').insert({
      company_id: companyId || process.env.DEFAULT_COMPANY_ID,
      to_email: fromEmail,
      subject: subject || '(sin asunto)',
      body: bodyText.slice(0, 500),
      channel: 'email',
      status: 'received',
      gmail_message_id: messageId,
      metadata: {
        processed_at: new Date().toISOString(),
        is_lead: analysis.is_lead,
        is_oc: analysis.is_oc,
        lead_id: leadId,
      },
    })

    return NextResponse.json({
      created: analysis.is_lead,
      leadId,
      score: analysis.score,
      reason: analysis.reason,
      is_oc: analysis.is_oc,
    })
  } catch (err) {
    console.error('[gmail-webhook] Error:', err)
    return NextResponse.json({ error: (err as Error).message }, { status: 500 })
  }
}
