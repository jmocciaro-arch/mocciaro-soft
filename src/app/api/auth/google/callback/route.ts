import { NextRequest, NextResponse } from 'next/server'
import { google } from 'googleapis'
import { createClient } from '@supabase/supabase-js'
import { setGmailTokens } from '@/lib/gmail-tokens'

export const runtime = 'nodejs'

export async function GET(request: NextRequest) {
  const code = request.nextUrl.searchParams.get('code')
  if (!code) return NextResponse.json({ error: 'No authorization code' }, { status: 400 })

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
        description: 'Gmail OAuth tokens persisted in tt_system_params',
      })
    } catch { /* non-blocking */ }

    return NextResponse.redirect(new URL('/clientes?gmail=connected', request.url))
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 500 })
  }
}
