import { NextResponse } from 'next/server'
import { getEnv } from '@/lib/env'

export async function GET() {
  const gemini = getEnv('GEMINI_API_KEY')
  const anthropic = getEnv('ANTHROPIC_API_KEY')
  return NextResponse.json({
    gemini: gemini ? `SET (${gemini.slice(0, 8)}...)` : 'MISSING',
    anthropic: anthropic ? `SET (${anthropic.slice(0, 8)}...)` : 'MISSING',
    gemini_via_process: process.env.GEMINI_API_KEY ? 'SET' : 'MISSING',
    anthropic_via_process: process.env.ANTHROPIC_API_KEY ? 'SET' : 'MISSING',
    supabase_url: process.env.NEXT_PUBLIC_SUPABASE_URL ? 'SET' : 'MISSING',
    service_role: getEnv('SUPABASE_SERVICE_ROLE_KEY') ? 'SET' : 'MISSING',
  })
}
