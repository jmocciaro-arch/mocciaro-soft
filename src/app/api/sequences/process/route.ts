import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { sendEmail, renderTemplate } from '@/lib/email/send-email'

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

interface SequenceStep {
  delay_hours: number
  subject: string
  body_template: string
  channel: 'email' | 'whatsapp'
}

interface Enrollment {
  id: string
  sequence_id: string
  entity_type: string
  entity_id: string
  email: string
  current_step: number
  status: string
  next_send_at: string
  metadata: Record<string, unknown>
  tt_email_sequences: {
    company_id: string
    steps: SequenceStep[]
  }
}

// GET/POST /api/sequences/process — Cron endpoint (cada 15 minutos)
export async function GET(req: NextRequest) {
  // Verificar cron secret si está definido
  const cronSecret = process.env.CRON_SECRET
  if (cronSecret) {
    const authHeader = req.headers.get('authorization')
    if (authHeader !== `Bearer ${cronSecret}`) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
  }

  const now = new Date().toISOString()
  let processed = 0
  let failed = 0

  // Buscar enrollments activos que ya deben enviarse
  const { data: enrollments, error } = await supabaseAdmin
    .from('tt_email_enrollments')
    .select(`
      id,
      sequence_id,
      entity_type,
      entity_id,
      email,
      current_step,
      status,
      next_send_at,
      metadata,
      tt_email_sequences (
        company_id,
        steps
      )
    `)
    .eq('status', 'active')
    .lte('next_send_at', now)
    .limit(50)

  if (error) {
    console.error('[sequences/process] Error fetching enrollments:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  for (const enrollment of (enrollments as unknown as Enrollment[]) ?? []) {
    try {
      const seq = enrollment.tt_email_sequences
      if (!seq) continue

      const steps = seq.steps as SequenceStep[]
      const stepIndex = enrollment.current_step

      if (stepIndex >= steps.length) {
        // Secuencia completa
        await supabaseAdmin
          .from('tt_email_enrollments')
          .update({ status: 'completed' })
          .eq('id', enrollment.id)
        continue
      }

      const step = steps[stepIndex]

      // Obtener datos del entity para las variables
      const templateVars = await getEntityVars(
        enrollment.entity_type,
        enrollment.entity_id,
        seq.company_id
      )

      const subject = renderTemplate(step.subject, templateVars)
      const body = renderTemplate(step.body_template, templateVars)

      const result = await sendEmail({
        toEmail: enrollment.email,
        subject,
        body,
        companyId: seq.company_id,
        enrollmentId: enrollment.id,
        channel: step.channel ?? 'email',
      })

      const nextStep = stepIndex + 1
      const isLastStep = nextStep >= steps.length

      let nextSendAt: string | null = null
      if (!isLastStep) {
        const nextDelay = steps[nextStep].delay_hours
        const next = new Date()
        next.setHours(next.getHours() + nextDelay)
        nextSendAt = next.toISOString()
      }

      await supabaseAdmin
        .from('tt_email_enrollments')
        .update({
          current_step: nextStep,
          status: isLastStep ? 'completed' : 'active',
          last_sent_at: now,
          next_send_at: nextSendAt,
        })
        .eq('id', enrollment.id)

      if (result.success) {
        processed++
      } else {
        failed++
        await supabaseAdmin
          .from('tt_email_enrollments')
          .update({ status: 'failed' })
          .eq('id', enrollment.id)
      }
    } catch (err) {
      console.error('[sequences/process] Error processing enrollment', enrollment.id, err)
      failed++
    }
  }

  return NextResponse.json({
    ok: true,
    processed,
    failed,
    timestamp: now,
  })
}

async function getEntityVars(
  entityType: string,
  entityId: string,
  companyId: string
): Promise<Record<string, string>> {
  const defaults: Record<string, string> = {
    client_name: 'Cliente',
    company_name: 'Mocciaro Soft',
    document_url: '',
  }

  try {
    // Obtener nombre de la empresa
    const { data: company } = await supabaseAdmin
      .from('tt_companies')
      .select('name')
      .eq('id', companyId)
      .single()
    if (company) defaults.company_name = company.name

    if (entityType === 'lead') {
      const { data: lead } = await supabaseAdmin
        .from('tt_leads')
        .select('name, email, company_name')
        .eq('id', entityId)
        .single()
      if (lead) {
        defaults.client_name = lead.name
        defaults.lead_email = lead.email ?? ''
        defaults.lead_company = lead.company_name ?? ''
      }
    } else if (entityType === 'client') {
      const { data: client } = await supabaseAdmin
        .from('tt_clients')
        .select('name, email')
        .eq('id', entityId)
        .single()
      if (client) {
        defaults.client_name = client.name
        defaults.client_email = client.email ?? ''
      }
    }
  } catch { /* usar defaults */ }

  return defaults
}
