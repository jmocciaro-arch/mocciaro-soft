/**
 * Gmail OAuth tokens — almacenamiento en Supabase.
 *
 * ANTES: se guardaban en `.gmail-tokens.json` en process.cwd(). Eso
 * funcionaba en local pero NO en serverless (Vercel/Lambda) porque el
 * filesystem es read-only. El callback OAuth crasheaba con
 * "EROFS: read-only file system" y los tokens nunca se persistían.
 *
 * AHORA: tt_system_params (key='gmail_tokens', value jsonb).
 *
 * Esto sigue siendo single-user (un solo set de tokens para toda la app).
 * Si en el futuro se quiere multi-cuenta, hay que crear tabla dedicada
 * con company_id o user_id como discriminator.
 */
import { createClient } from '@supabase/supabase-js'

const KEY = 'gmail_tokens'

// Reusamos el tipo `Credentials` de googleapis para evitar mismatches
// con setCredentials() y getToken().
import type { Credentials } from 'google-auth-library'
type GmailTokens = Credentials

function getServiceClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } }
  )
}

export async function getGmailTokens(): Promise<GmailTokens | null> {
  try {
    const supabase = getServiceClient()
    const { data, error } = await supabase
      .from('tt_system_params')
      .select('value')
      .eq('key', KEY)
      .maybeSingle()
    if (error || !data) return null
    return (data.value as GmailTokens) || null
  } catch {
    return null
  }
}

export async function setGmailTokens(tokens: GmailTokens): Promise<void> {
  const supabase = getServiceClient()
  const { error } = await supabase
    .from('tt_system_params')
    .upsert(
      {
        key: KEY,
        value: tokens,
        description: 'Tokens OAuth de Gmail (gmail.readonly + gmail.send)',
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'key' }
    )
  if (error) throw new Error(`No se pudieron guardar tokens Gmail: ${error.message}`)
}

export async function clearGmailTokens(): Promise<void> {
  const supabase = getServiceClient()
  await supabase.from('tt_system_params').delete().eq('key', KEY)
}
