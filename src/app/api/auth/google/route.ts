import { NextResponse } from 'next/server'
import { google } from 'googleapis'
import crypto from 'crypto'
import { requireAdmin } from '@/lib/auth/require-admin'

function signState(payload: string): string {
  const secret = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.GOOGLE_CLIENT_SECRET || ''
  const sig = crypto.createHmac('sha256', secret).update(payload).digest('hex').slice(0, 24)
  // base64url(payload).sig
  return `${Buffer.from(payload).toString('base64url')}.${sig}`
}

export async function GET() {
  // Solo admins conectan Gmail — la cuenta es organizacional
  const guard = await requireAdmin()
  if (!guard.ok) return guard.response

  const oauth2Client = new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET,
    process.env.GOOGLE_REDIRECT_URI
  )

  // state: user id + nonce + ts, firmado → callback valida
  const nonce = crypto.randomBytes(16).toString('hex')
  const payload = JSON.stringify({ u: guard.ttUserId, n: nonce, t: Date.now() })
  const state = signState(payload)

  const url = oauth2Client.generateAuthUrl({
    access_type: 'offline',
    prompt: 'consent',
    state,
    scope: [
      'https://www.googleapis.com/auth/gmail.readonly',
      'https://www.googleapis.com/auth/gmail.send',
      // Fix 6 (sesión 11) — calendar.events para exportar eventos del ERP a Google Calendar
      'https://www.googleapis.com/auth/calendar.events',
    ],
  })

  return NextResponse.redirect(url)
}
