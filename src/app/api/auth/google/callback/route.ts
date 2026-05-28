import { NextRequest, NextResponse } from 'next/server'
import { google } from 'googleapis'
import { createClient } from '@supabase/supabase-js'
import { setGmailTokens } from '@/lib/gmail-tokens'
import crypto from 'node:crypto'

export const runtime = 'nodejs'

function verifyState(state: string | null): { ok: true; userId: string } | { ok: false; reason: string } {
  if (!state) return { ok: false, reason: 'state missing' }
  const parts = state.split('.')
  if (parts.length !== 2) return { ok: false, reason: 'state malformed' }
  const [b64, sig] = parts

  const secret = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.GOOGLE_CLIENT_SECRET || ''
  let payload: string
  try {
    payload = Buffer.from(b64, 'base64url').toString('utf-8')
  } catch {
    return { ok: false, reason: 'state decode failed' }
  }
  const expected = crypto.createHmac('sha256', secret).update(payload).digest('hex').slice(0, 24)
  if (expected !== sig) return { ok: false, reason: 'state sig mismatch' }

  try {
    const { u, t } = JSON.parse(payload) as { u: string; t: number }
    // Validez: 15 minutos
    if (Date.now() - t > 15 * 60 * 1000) return { ok: false, reason: 'state expired' }
    if (!u) return { ok: false, reason: 'state missing user' }
    return { ok: true, userId: u }
  } catch {
    return { ok: false, reason: 'state json failed' }
  }
}

export async function GET(request: NextRequest) {
  const code = request.nextUrl.searchParams.get('code')
  const state = request.nextUrl.searchParams.get('state')
  if (!code) return NextResponse.json({ error: 'No authorization code' }, { status: 400 })

  const stateCheck = verifyState(state)
  if (!stateCheck.ok) {
    return NextResponse.json({ error: `state inválido: ${stateCheck.reason}` }, { status: 401 })
  }

  try {
    const oauth2Client = new google.auth.OAuth2(
      process.env.GOOGLE_CLIENT_ID,
      process.env.GOOGLE_CLIENT_SECRET,
      process.env.GOOGLE_REDIRECT_URI
    )

    const { tokens } = await oauth2Client.getToken(code)

    // Persistir en Supabase (filesystem read-only en Vercel)
    await setGmailTokens(tokens)

    // Audit best-effort
    try {
      const supabase = createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.SUPABASE_SERVICE_ROLE_KEY!,
        { auth: { persistSession: false } }
      )
      await supabase.from('tt_activity_log').insert({
        entity_type: 'system',
        entity_id: '00000000-0000-0000-0000-000000000000',
        action: 'google_oauth_connected',
        description: `Gmail OAuth tokens persisted (user ${stateCheck.userId})`,
        actor_id: stateCheck.userId,
      })
    } catch { /* non-blocking */ }

    return NextResponse.redirect(new URL('/clientes?gmail=connected', request.url))
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 500 })
  }
}
