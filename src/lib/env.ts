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
  if (fromProcess) return fromProcess
  // Fallback: read .env.local directly (workaround for local dev)
  const fromFile = loadEnvFile()[key]
  return fromFile || undefined
}
