import { NextResponse } from 'next/server'
import { google } from 'googleapis'
import * as fs from 'fs'
import * as path from 'path'

function getOAuth2Client() {
  const oauth2Client = new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET,
    process.env.GOOGLE_REDIRECT_URI
  )

  const tokenPath = path.join(process.cwd(), '.gmail-tokens.json')
  if (!fs.existsSync(tokenPath)) {
    throw new Error('Gmail not connected')
  }

  const tokens = JSON.parse(fs.readFileSync(tokenPath, 'utf-8'))
  oauth2Client.setCredentials(tokens)

  oauth2Client.on('tokens', (newTokens) => {
    const existing = JSON.parse(fs.readFileSync(tokenPath, 'utf-8'))
    const merged = { ...existing, ...newTokens }
    fs.writeFileSync(tokenPath, JSON.stringify(merged, null, 2))
  })

  return oauth2Client
}

function isGmailConnected(): boolean {
  const tokenPath = path.join(process.cwd(), '.gmail-tokens.json')
  return fs.existsSync(tokenPath)
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
    if (!isGmailConnected()) {
      return NextResponse.json({
        connected: false,
        emails: [],
        unreadCount: 0,
      })
    }

    const auth = getOAuth2Client()
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
  } catch (error: any) {
    console.error('[emails/recent] Error:', error.message)

    // If token expired or invalid, indicate disconnected
    if (
      error.message?.includes('invalid_grant') ||
      error.message?.includes('Token has been expired') ||
      error.message?.includes('Gmail not connected')
    ) {
      return NextResponse.json({
        connected: false,
        emails: [],
        unreadCount: 0,
      })
    }

    return NextResponse.json(
      { error: 'Error al obtener emails', details: error.message },
      { status: 500 }
    )
  }
}

function checkHasAttachments(payload: any): boolean {
  if (!payload) return false
  if (payload.parts) {
    for (const part of payload.parts) {
      if (part.filename && part.filename.length > 0) return true
      if (part.parts && checkHasAttachments(part)) return true
    }
  }
  return false
}
