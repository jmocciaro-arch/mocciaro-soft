import { createClient } from '@supabase/supabase-js'

/**
 * Cliente Supabase con service role key. Salta RLS.
 * USAR SOLO en route handlers server-side. Nunca exponer en client.
 */
export function getAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY

  if (!url || !key) {
    throw new Error('SUPABASE_URL o SERVICE_ROLE_KEY no configurados')
  }

  return createClient(url, key, {
    auth: { autoRefreshToken: false, persistSession: false },
  })
}
