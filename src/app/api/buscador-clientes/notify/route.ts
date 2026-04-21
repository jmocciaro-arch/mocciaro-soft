import { NextRequest, NextResponse } from 'next/server'
import { Resend } from 'resend'

export const runtime = 'nodejs'

const resend = new Resend(process.env.RESEND_API_KEY)

// CORS: permitir requests desde el buscador público de Speedrill
const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
}

/**
 * OPTIONS /api/buscador-clientes/notify
 * Preflight CORS para requests desde speedrill.com.ar
 */
export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: CORS_HEADERS })
}

/**
 * POST /api/buscador-clientes/notify
 * Envía email de notificación a info@torquetools.es cuando un nuevo cliente
 * se registra en el buscador público de Speedrill.
 *
 * Body: { full_name, email, company?, phone?, country? }
 */
export async function POST(req: NextRequest) {
  // Verificar que la API key esté configurada
  if (!process.env.RESEND_API_KEY) {
    console.error('[notify] RESEND_API_KEY no configurada')
    return NextResponse.json({ error: 'Email service not configured' }, { status: 503 })
  }

  let body: {
    full_name?: string
    email?: string
    company?: string
    phone?: string
    country?: string
  }

  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Body inválido' }, { status: 400 })
  }

  const { full_name, email, company, phone, country } = body

  if (!full_name || !email) {
    return NextResponse.json(
      { error: 'full_name y email son requeridos' },
      { status: 400 }
    )
  }

  const now = new Date().toLocaleString('es-AR', {
    timeZone: 'America/Argentina/Buenos_Aires',
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })

  const html = `
<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Nuevo registro en Speedrill Buscador</title>
</head>
<body style="margin:0;padding:0;background:#f5f5f5;font-family:Arial,Helvetica,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f5f5f5;padding:32px 0;">
    <tr>
      <td align="center">
        <table width="580" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:8px;overflow:hidden;box-shadow:0 2px 8px rgba(0,0,0,0.08);">

          <!-- Header -->
          <tr>
            <td style="background:#1a3a6b;padding:24px 32px;">
              <h1 style="margin:0;color:#ffffff;font-size:20px;font-weight:700;letter-spacing:-0.3px;">
                🔔 Nuevo cliente en el Buscador
              </h1>
              <p style="margin:6px 0 0;color:#a8c4e8;font-size:13px;">${now}</p>
            </td>
          </tr>

          <!-- Body -->
          <tr>
            <td style="padding:28px 32px;">
              <p style="margin:0 0 20px;color:#374151;font-size:15px;line-height:1.5;">
                Un nuevo usuario se registró en el buscador público de
                <strong>speedrill.com.ar/buscador/</strong> y está esperando aprobación.
              </p>

              <!-- Data table -->
              <table width="100%" cellpadding="0" cellspacing="0"
                style="border:1px solid #e5e7eb;border-radius:6px;overflow:hidden;margin-bottom:24px;">
                <tr style="background:#f9fafb;">
                  <td style="padding:10px 16px;color:#6b7280;font-size:12px;font-weight:600;
                              text-transform:uppercase;letter-spacing:0.5px;width:35%;">Campo</td>
                  <td style="padding:10px 16px;color:#6b7280;font-size:12px;font-weight:600;
                              text-transform:uppercase;letter-spacing:0.5px;">Valor</td>
                </tr>
                <tr style="border-top:1px solid #e5e7eb;">
                  <td style="padding:12px 16px;color:#6b7280;font-size:14px;">Nombre</td>
                  <td style="padding:12px 16px;color:#111827;font-size:14px;font-weight:600;">${full_name}</td>
                </tr>
                <tr style="border-top:1px solid #e5e7eb;background:#fafafa;">
                  <td style="padding:12px 16px;color:#6b7280;font-size:14px;">Email</td>
                  <td style="padding:12px 16px;color:#111827;font-size:14px;">
                    <a href="mailto:${email}" style="color:#1a3a6b;text-decoration:none;">${email}</a>
                  </td>
                </tr>
                ${company ? `
                <tr style="border-top:1px solid #e5e7eb;">
                  <td style="padding:12px 16px;color:#6b7280;font-size:14px;">Empresa</td>
                  <td style="padding:12px 16px;color:#111827;font-size:14px;">${company}</td>
                </tr>` : ''}
                ${phone ? `
                <tr style="border-top:1px solid #e5e7eb;${company ? '' : 'background:#fafafa;'}">
                  <td style="padding:12px 16px;color:#6b7280;font-size:14px;">Teléfono</td>
                  <td style="padding:12px 16px;color:#111827;font-size:14px;">${phone}</td>
                </tr>` : ''}
                ${country ? `
                <tr style="border-top:1px solid #e5e7eb;">
                  <td style="padding:12px 16px;color:#6b7280;font-size:14px;">País</td>
                  <td style="padding:12px 16px;color:#111827;font-size:14px;">${country}</td>
                </tr>` : ''}
              </table>

              <!-- CTA -->
              <table cellpadding="0" cellspacing="0">
                <tr>
                  <td style="border-radius:6px;background:#1a3a6b;">
                    <a href="https://cotizador-torquetools.vercel.app/buscador-clientes"
                       style="display:inline-block;padding:12px 24px;color:#ffffff;font-size:14px;
                              font-weight:600;text-decoration:none;letter-spacing:0.2px;">
                      Aprobar en el Panel →
                    </a>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td style="background:#f9fafb;padding:16px 32px;border-top:1px solid #e5e7eb;">
              <p style="margin:0;color:#9ca3af;font-size:12px;line-height:1.5;">
                Este email fue generado automáticamente por el sistema de registro del buscador de
                <a href="https://speedrill.com.ar" style="color:#6b7280;text-decoration:none;">Speedrill</a>.
                Para gestionar registros, accedé al
                <a href="https://cotizador-torquetools.vercel.app/buscador-clientes"
                   style="color:#1a3a6b;text-decoration:none;">panel de administración</a>.
              </p>
            </td>
          </tr>

        </table>
      </td>
    </tr>
  </table>
</body>
</html>
`

  try {
    const { data, error } = await resend.emails.send({
      from: 'Speedrill Buscador <noreply@speedrill.com.ar>',
      to: ['info@torquetools.es'],
      subject: `🔔 Nuevo registro: ${full_name}${company ? ` (${company})` : ''} — Speedrill Buscador`,
      html,
      replyTo: email,
    })

    if (error) {
      console.error('[notify] Resend error:', error)
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json({ ok: true, id: data?.id }, { headers: CORS_HEADERS })
  } catch (err) {
    console.error('[notify] Unexpected error:', err)
    return NextResponse.json({ error: 'Error enviando email' }, { status: 500, headers: CORS_HEADERS })
  }
}
