import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { google } from 'googleapis'
import * as fs from 'fs'
import * as path from 'path'

export const runtime = 'nodejs'

/**
 * GET /api/cron/check-emails
 * Cron job que corre cada 15 minutos.
 * Busca emails nuevos no leídos, filtra remitentes desconocidos
 * y los manda al webhook /api/webhooks/gmail para procesarlos.
 */

function getOAuth2Client() {
  const oauth2Client = new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET,
    process.env.GOOGLE_REDIRECT_URI
  )
  const tokenPath = path.join(process.cwd(), '.gmail-tokens.json')
  if (!fs.existsSync(tokenPath)) {
    throw new Error('Gmail no conectado.')
  }
  const tokens = JSON.parse(fs.readFileSync(tokenPath, 'utf-8'))
  oauth2Client.setCredentials(tokens)
  oauth2Client.on('tokens', (newTokens) => {
    const existing = JSON.parse(fs.readFileSync(tokenPath, 'utf-8'))
    fs.writeFileSync(tokenPath, JSON.stringify({ ...existing, ...newTokens }, null, 2))
  })
  return oauth2Client
}

export async function GET(req: NextRequest) {
  // Verificar token de cron (Vercel lo provee automáticamente)
  const authHeader = req.headers.get('authorization')
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}` && process.env.NODE_ENV !== 'development') {
    return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  }

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } }
  )

  const results = {
    checked: 0,
    processed: 0,
    leads_created: 0,
    errors: [] as string[],
  }

  try {
    // Obtener clientes conocidos (emails registrados)
    const { data: knownClients } = await supabase
      .from('tt_clients')
      .select('email')
      .not('email', 'is', null)

    const knownEmails = new Set(
      (knownClients || [])
        .map((c: { email: string | null }) => c.email?.toLowerCase())
        .filter(Boolean)
    )

    // Obtener emails ya procesados en los últimos 30 min
    const thirtyMinAgo = new Date(Date.now() - 30 * 60 * 1000).toISOString()
    const { data: processedLogs } = await supabase
      .from('tt_email_log')
      .select('gmail_message_id')
      .not('gmail_message_id', 'is', null)
      .gte('created_at', thirtyMinAgo)

    const processedIds = new Set(
      (processedLogs || [])
        .map((l: { gmail_message_id: string | null }) => l.gmail_message_id)
        .filter(Boolean)
    )

    // Buscar emails recientes en Gmail
    let auth
    try {
      auth = getOAuth2Client()
    } catch {
      return NextResponse.json({
        ...results,
        message: 'Gmail no conectado. Skipping.',
      })
    }

    const gmail = google.gmail({ version: 'v1', auth })

    // Buscar emails no leídos de los últimos 15 minutos
    const fifteenMinAgo = Math.floor((Date.now() - 15 * 60 * 1000) / 1000)
    const query = `is:unread after:${fifteenMinAgo} -from:me`

    const { data: msgList } = await gmail.users.messages.list({
      userId: 'me',
      q: query,
      maxResults: 20,
    })

    if (!msgList.messages || msgList.messages.length === 0) {
      return NextResponse.json({ ...results, message: 'Sin emails nuevos' })
    }

    results.checked = msgList.messages.length

    // Procesar cada email
    for (const msg of msgList.messages) {
      if (!msg.id) continue

      // Saltar si ya fue procesado
      if (processedIds.has(msg.id)) continue

      // Obtener headers para verificar el remitente
      try {
        const { data: fullMsg } = await gmail.users.messages.get({
          userId: 'me',
          id: msg.id,
          format: 'metadata',
          metadataHeaders: ['From'],
        })

        const fromHeader = fullMsg.payload?.headers?.find(h => h.name === 'From')?.value || ''
        const emailMatch = fromHeader.match(/[\w.+%-]+@[\w.-]+\.\w+/)
        const senderEmail = emailMatch?.[0]?.toLowerCase() || ''

        // Solo procesar si el remitente no es un cliente conocido
        if (senderEmail && knownEmails.has(senderEmail)) {
          continue
        }

        // Llamar al webhook para procesar
        const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'
        const webhookRes = await fetch(`${baseUrl}/api/webhooks/gmail`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ messageId: msg.id }),
        })

        if (webhookRes.ok) {
          const webhookData = await webhookRes.json() as { created: boolean; leadId?: string }
          results.processed++
          if (webhookData.created) results.leads_created++
        }
      } catch (msgErr) {
        results.errors.push(`Error procesando ${msg.id}: ${(msgErr as Error).message}`)
      }
    }

    return NextResponse.json({
      ...results,
      message: `Procesados ${results.processed} emails, ${results.leads_created} leads creados`,
    })
  } catch (err) {
    console.error('[check-emails cron] Error:', err)
    return NextResponse.json(
      { error: (err as Error).message, ...results },
      { status: 500 }
    )
  }
}
