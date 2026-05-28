import { NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/auth/require-admin'

export const runtime = 'nodejs'

/**
 * GET /api/debug-env
 * Solo accesible en dev/preview. En production se exige requireAdmin().
 * Nunca devolvemos los valores reales — solo SET/NOT SET y largo.
 */
export async function GET() {
  // En production: requiere admin
  if (process.env.NODE_ENV === 'production') {
    const guard = await requireAdmin()
    if (!guard.ok) return guard.response
  }

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
