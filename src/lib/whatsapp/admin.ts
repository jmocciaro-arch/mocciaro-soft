// ============================================================================
// Cliente Supabase admin (service_role) — uso exclusivo server-side.
// Bypassea RLS para el webhook publico y operaciones de sistema.
// ============================================================================
import { createClient } from '@supabase/supabase-js'

export function createAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) throw new Error('Supabase env vars ausentes')
  return createClient(url, key, { auth: { persistSession: false } })
}

/**
 * Extrae los ultimos 4 caracteres de un token para mostrar en UI sin
 * exponer el token completo.
 */
export function last4(token: string): string {
  const clean = (token || '').trim()
  return clean.length > 4 ? clean.slice(-4) : '****'
}

/**
 * Construye la URL publica del webhook para una cuenta.
 */
export function buildWebhookUrl(webhookPath: string): string {
  const base = process.env.NEXT_PUBLIC_APP_URL
    || process.env.VERCEL_URL
    || 'https://mocciaro-soft.vercel.app'
  const host = base.startsWith('http') ? base : `https://${base}`
  return `${host}/api/whatsapp/webhook/${webhookPath}`
}
