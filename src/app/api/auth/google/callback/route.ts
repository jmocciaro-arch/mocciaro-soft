import { NextRequest, NextResponse } from 'next/server'
import { google } from 'googleapis'
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

export async function GET(request: NextRequest) {
  const code = request.nextUrl.searchParams.get('code')

  if (!code) {
    return NextResponse.json({ error: 'No authorization code' }, { status: 400 })
  }

  try {
    const oauth2Client = new google.auth.OAuth2(
      process.env.GOOGLE_CLIENT_ID,
      process.env.GOOGLE_CLIENT_SECRET,
      process.env.GOOGLE_REDIRECT_URI
    )

    const { tokens } = await oauth2Client.getToken(code)

    // Store tokens in Supabase (tt_system_config or a simple key-value)
    // For now, store in a system config approach
    await supabase.from('tt_activity_log').insert({
      entity_type: 'system',
      entity_id: '00000000-0000-0000-0000-000000000000',
      action: 'google_oauth_connected',
      description: 'Gmail OAuth tokens stored',
    })

    // Store tokens as JSON in a file (simple approach for single-user)
    // In production, store encrypted in DB
    const fs = await import('fs')
    const path = await import('path')
    const tokenPath = path.join(process.cwd(), '.gmail-tokens.json')
    fs.writeFileSync(tokenPath, JSON.stringify(tokens, null, 2))

    // Redirect back to the app
    return NextResponse.redirect(new URL('/clientes?gmail=connected', request.url))
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 500 })
  }
}
