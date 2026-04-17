import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

interface FormField {
  name: string
  label: string
  type: string
  required?: boolean
}

interface FormConfig {
  id: string
  company_id: string
  name: string
  slug: string
  fields: FormField[]
  auto_score: boolean
  auto_sequence_id: string | null
  redirect_url: string | null
}

async function scoreLeadWithAI(leadData: Record<string, string>): Promise<{
  score: number
  temperature: 'hot' | 'warm' | 'cold'
  tags: string[]
  suggested_action: string
}> {
  const prompt = `Analizá este lead y devolvé un JSON con: score (0-100), temperature ("hot"|"warm"|"cold"), tags (array de strings), suggested_action (string).
Lead: ${JSON.stringify(leadData)}
Respondé SOLO con JSON válido, sin markdown.`

  // Intentar Gemini primero
  try {
    const geminiKey = process.env.GEMINI_API_KEY
    if (geminiKey) {
      const res = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${geminiKey}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            contents: [{ parts: [{ text: prompt }] }],
            generationConfig: { temperature: 0.3 },
          }),
        }
      )
      if (res.ok) {
        const data = await res.json() as { candidates?: { content?: { parts?: { text?: string }[] } }[] }
        const text = data.candidates?.[0]?.content?.parts?.[0]?.text ?? ''
        const clean = text.replace(/```json\n?|\n?```/g, '').trim()
        return JSON.parse(clean)
      }
    }
  } catch { /* fallback */ }

  // Fallback Claude
  try {
    const claudeKey = process.env.ANTHROPIC_API_KEY
    if (claudeKey) {
      const res = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': claudeKey,
          'anthropic-version': '2023-06-01',
        },
        body: JSON.stringify({
          model: 'claude-3-haiku-20240307',
          max_tokens: 200,
          messages: [{ role: 'user', content: prompt }],
        }),
      })
      if (res.ok) {
        const data = await res.json() as { content?: { text?: string }[] }
        const text = data.content?.[0]?.text ?? ''
        const clean = text.replace(/```json\n?|\n?```/g, '').trim()
        return JSON.parse(clean)
      }
    }
  } catch { /* fallback */ }

  // Default si no hay AI
  return {
    score: 50,
    temperature: 'warm',
    tags: ['form-submission'],
    suggested_action: 'Contactar al lead',
  }
}

// POST /api/forms/[slug]/submit — público
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ slug: string }> }
) {
  const { slug } = await params

  // Obtener config del formulario
  const { data: form, error: formError } = await supabaseAdmin
    .from('tt_public_forms')
    .select('*')
    .eq('slug', slug)
    .eq('is_active', true)
    .single()

  if (formError || !form) {
    return NextResponse.json({ error: 'Formulario no encontrado' }, { status: 404 })
  }

  const formConfig = form as FormConfig

  // Parsear body
  let body: Record<string, string> = {}
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Cuerpo inválido' }, { status: 400 })
  }

  // Validar campos requeridos
  const requiredFields = (formConfig.fields as FormField[]).filter((f) => f.required)
  for (const field of requiredFields) {
    if (!body[field.name]?.trim()) {
      return NextResponse.json(
        { error: `El campo "${field.label}" es requerido` },
        { status: 400 }
      )
    }
  }

  // Extraer campos clave del lead
  const leadName = body.name || body.nombre || body.full_name || 'Sin nombre'
  const leadEmail = body.email || body.correo || ''
  const leadPhone = body.phone || body.telefono || body.celular || ''
  const leadCompany = body.company || body.empresa || ''
  const rawMessage = JSON.stringify(body)

  // Score con IA
  let aiScore = 50
  let aiTemperature: 'hot' | 'warm' | 'cold' = 'warm'
  let aiTags: string[] = ['form-submission']
  let aiSuggestedAction = 'Contactar al lead'

  if (formConfig.auto_score) {
    try {
      const aiResult = await scoreLeadWithAI(body)
      aiScore = aiResult.score
      aiTemperature = aiResult.temperature
      aiTags = aiResult.tags
      aiSuggestedAction = aiResult.suggested_action
    } catch { /* mantener defaults */ }
  }

  // Crear lead en tt_leads
  const { data: lead, error: leadError } = await supabaseAdmin
    .from('tt_leads')
    .insert({
      company_id: formConfig.company_id,
      name: leadName,
      email: leadEmail || null,
      phone: leadPhone || null,
      company_name: leadCompany || null,
      source: 'form',
      status: 'new',
      raw_message: rawMessage,
      ai_score: aiScore,
      ai_temperature: aiTemperature,
      ai_tags: aiTags,
      ai_suggested_action: aiSuggestedAction,
      ai_analysis_at: new Date().toISOString(),
      ai_provider: 'auto',
    })
    .select('id')
    .single()

  if (leadError) {
    console.error('[form/submit] Error creando lead:', leadError)
    return NextResponse.json({ error: 'Error procesando el formulario' }, { status: 500 })
  }

  // Incrementar contador de submissions
  // Incrementar contador de submissions (best-effort)
  try {
    await supabaseAdmin
      .from('tt_public_forms')
      .update({ submissions_count: ((form as unknown as { submissions_count: number }).submissions_count ?? 0) + 1 })
      .eq('id', formConfig.id)
  } catch { /* no crítico */ }

  // Enrolar en secuencia si está configurado
  if (formConfig.auto_sequence_id && leadEmail) {
    await supabaseAdmin.from('tt_email_enrollments').insert({
      sequence_id: formConfig.auto_sequence_id,
      entity_type: 'lead',
      entity_id: lead.id,
      email: leadEmail,
      current_step: 0,
      status: 'active',
      next_send_at: new Date().toISOString(),
      metadata: { source: 'form', form_slug: slug },
    })
  }

  return NextResponse.json({
    success: true,
    leadId: lead.id,
    redirect: formConfig.redirect_url || null,
  })
}
