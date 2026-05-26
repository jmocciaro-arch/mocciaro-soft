/**
 * ENV HELPER — Workaround para Next.js 16 que a veces no carga
 * correctamente variables privadas de .env.local
 */

import { readFileSync } from 'fs'
import { join } from 'path'

let _cache: Record<string, string> | null = null

function loadEnvFile(): Record<string, string> {
  if (_cache) return _cache
  _cache = {}
  try {
    const envPath = join(process.cwd(), '.env.local')
    const content = readFileSync(envPath, 'utf8')
    for (const line of content.split('\n')) {
      const trimmed = line.trim()
      if (!trimmed || trimmed.startsWith('#')) continue
      const eqIdx = trimmed.indexOf('=')
      if (eqIdx === -1) continue
      const key = trimmed.substring(0, eqIdx).trim()
      const value = trimmed.substring(eqIdx + 1).trim()
      _cache[key] = value
    }
  } catch {
    // File not found in production (Vercel) — use process.env
  }
  return _cache
}

export function getEnv(key: string): string | undefined {
  // Try process.env first (works in Vercel production)
  const fromProcess = process.env[key]
  if (fromProcess && fromProcess.trim().length > 0) return fromProcess
  // Fallback: read .env.local directly (workaround for local dev — Claude Code
  // como agent runner sobrescribe ANTHROPIC_API_KEY con string vacío).
  const fromFile = loadEnvFile()[key]
  if (fromFile && fromFile.trim().length > 0) return fromFile
  // Último fallback: alias específicos (CLAUDE_KEY ↔ ANTHROPIC_API_KEY)
  if (key === 'ANTHROPIC_API_KEY') {
    const claudeKey = process.env.CLAUDE_KEY || loadEnvFile()['CLAUDE_KEY']
    if (claudeKey && claudeKey.trim().length > 0) return claudeKey
  }
  return undefined
}
