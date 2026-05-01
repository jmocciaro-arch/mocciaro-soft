import { NextResponse } from 'next/server'
export const runtime = 'nodejs'
export async function GET() {
  const keys = ['ANTHROPIC_API_KEY', 'CLAUDE_KEY', 'GEMINI_API_KEY', 'NEXT_PUBLIC_SUPABASE_URL']
  const info: Record<string, string> = {}
  for (const k of keys) {
    const v = process.env[k]
    info[k] = v ? `SET (${v.length} chars)` : 'NOT SET'
  }
  // También listar todas las env vars que empiezan con A, C, G (muestra)
  info._anth_like = Object.keys(process.env).filter(k => k.includes('ANTHROP') || k.includes('CLAUDE')).join(', ') || '(none)'
  return NextResponse.json(info)
}
