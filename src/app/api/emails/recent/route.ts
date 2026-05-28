import { NextResponse } from 'next/server'
import { google } from 'googleapis'
import { getGmailTokens, setGmailTokens } from '@/lib/gmail-tokens'
import { requireAdmin } from '@/lib/auth/require-admin'

export const runtime = 'nodejs'

async function getOAuth2Client() {
  const oauth2Client = new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET,
    process.env.GOOGLE_REDIRECT_URI
  )

  const tokens = await getGmailTokens()
  if (!tokens) throw new Error('Gmail not connected')

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

async function isGmailConnected(): Promise<boolean> {
  const t = await getGmailTokens()
  return !!t && (!!t.access_token || !!t.refresh_token)
}

interface EmailItem {
  id: string
  from: { name: string; email: string }
  subject: string
  snippet: string
  date: string
  isRead: boolean
  hasAttachments: boolean
}

function parseFromHeader(header: string): { name: string; email: string } {
  const match = header.match(/^"?([^"<]*)"?\s*<([^>]+)>/)
  if (match) {
    return {
      name: match[1].trim().replace(/^"|"$/g, ''),
      email: match[2].trim(),
    }
  }
  const emailMatch = header.match(/[\w.-]+@[\w.-]+\.\w+/)
  if (emailMatch) {
    return { name: '', email: emailMatch[0] }
  }
  return { name: header.trim(), email: '' }
}

export async function GET() {
  try {
    const guard = await requireAdmin()
    if (!guard.ok) return guard.response

    if (!(await isGmailConnected())) {
      return NextResponse.json({
        connected: false,
        emails: [],
        unreadCount: 0,
      })
    }

    const auth = await getOAuth2Client()
    const gmail = google.gmail({ version: 'v1', auth })

    const query =
      '(subject:cotización OR subject:cotizacion OR subject:presupuesto OR subject:pedido OR subject:order OR subject:quote OR from:@*) newer_than:7d'

    const listRes = await gmail.users.messages.list({
      userId: 'me',
      q: query,
      maxResults: 20,
    })

    if (!listRes.data.messages || listRes.data.messages.length === 0) {
      return NextResponse.json({
        connected: true,
        emails: [],
        unreadCount: 0,
      })
    }

    const emails: EmailItem[] = []
    let unreadCount = 0

    const messagePromises = listRes.data.messages.map((msg) =>
      gmail.users.messages.get({
        userId: 'me',
        id: msg.id!,
        format: 'metadata',
        metadataHeaders: ['From', 'Subject', 'Date'],
      })
    )

    const messages = await Promise.all(messagePromises)

    for (const { data: fullMsg } of messages) {
      const headers = fullMsg.payload?.headers || []
      const fromHeader =
        headers.find((h) => h.name === 'From')?.value || ''
      const subject =
        headers.find((h) => h.name === 'Subject')?.value || '(sin asunto)'
      const dateHeader =
        headers.find((h) => h.name === 'Date')?.value || ''

      const from = parseFromHeader(fromHeader)
      const isRead = !(fullMsg.labelIds || []).includes('UNREAD')
      const hasAttachments = checkHasAttachments(fullMsg.payload)

      if (!isRead) unreadCount++

      emails.push({
        id: fullMsg.id || '',
        from,
        subject,
        snippet: fullMsg.snippet || '',
        date: dateHeader ? new Date(dateHeader).toISOString() : new Date().toISOString(),
        isRead,
        hasAttachments,
      })
    }

    // Sort by date descending
    emails.sort(
      (a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()
    )

    return NextResponse.json({
      connected: true,
      emails,
      unreadCount,
    })
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : String(error)
    console.error('[emails/recent] Error:', msg)

    // If token expired or invalid, indicate disconnected
    if (
      msg.includes('invalid_grant') ||
      msg.includes('Token has been expired') ||
      msg.includes('Gmail not connected')
    ) {
      return NextResponse.json({
        connected: false,
        emails: [],
        unreadCount: 0,
      })
    }

    return NextResponse.json(
      { error: 'Error al obtener emails', details: msg },
      { status: 500 }
    )
  }
}

type GmailPart = { filename?: string | null; parts?: GmailPart[] | null }

function checkHasAttachments(payload: GmailPart | null | undefined): boolean {
  if (!payload) return false
  const parts = payload.parts
  if (parts) {
    for (const part of parts) {
      if (part.filename && part.filename.length > 0) return true
      if (part.parts && checkHasAttachments(part)) return true
    }
  }
  return false
}
