import { createClient } from '@supabase/supabase-js'

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

export interface SendEmailParams {
  toEmail: string
  subject: string
  body: string
  companyId: string
  enrollmentId?: string
  channel?: 'email' | 'whatsapp'
}

export interface SendEmailResult {
  success: boolean
  logId?: string
  error?: string
}

/**
 * Envía un email y lo loguea en tt_email_log.
 * Por ahora loguea en consola. Listo para conectar Gmail/SMTP.
 */
export async function sendEmail(params: SendEmailParams): Promise<SendEmailResult> {
  const { toEmail, subject, body, companyId, enrollmentId, channel = 'email' } = params

  // Log en consola (reemplazar con Nodemailer/Gmail API en producción)
  console.log('[sendEmail]', {
    to: toEmail,
    subject,
    channel,
    companyId,
  })

  // Guardar en tt_email_log
  const { data, error } = await supabaseAdmin
    .from('tt_email_log')
    .insert({
      enrollment_id: enrollmentId || null,
      company_id: companyId,
      to_email: toEmail,
      subject,
      body,
      channel,
      status: 'sent',
    })
    .select('id')
    .single()

  if (error) {
    console.error('[sendEmail] Error guardando log:', error)
    return { success: false, error: error.message }
  }

  return { success: true, logId: data.id }
}

/**
 * Reemplaza variables en una plantilla.
 * Variables disponibles: {{client_name}}, {{company_name}}, {{document_url}}, etc.
 */
export function renderTemplate(template: string, vars: Record<string, string>): string {
  return template.replace(/\{\{(\w+)\}\}/g, (_, key) => vars[key] ?? `{{${key}}}`)
}
