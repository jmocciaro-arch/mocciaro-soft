/**
 * Gmail OAuth tokens — almacenamiento en Supabase con cifrado en reposo.
 *
 * EVOLUCIÓN:
 *   v1: filesystem (.gmail-tokens.json) — fallaba en serverless.
 *   v2: tt_system_params.value (text plano) — funcionaba pero leak risk.
 *   v3 (este, post migration v58): tt_system_params.value_encrypted (bytea
 *       cifrado con pgcrypto). Lectura via fn_read_oauth_token RPC.
 *
 * COMPATIBILIDAD: si la migration v58 NO se aplicó todavía, este código
 * detecta el error y hace fallback a la lectura plain text de v2. Eso
 * asegura que la app no se rompa durante el rollout. Después de aplicar
 * v58 + drop de plain text, el fallback queda no-usado.
 */

import { createClient } from '@supabase/supabase-js'
import type { Credentials } from 'google-auth-library'

const KEY = 'gmail_tokens'

type GmailTokens = Credentials

function getServiceClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } }
  )
}

/**
 * Lee tokens. Intenta primero RPC fn_read_oauth_token (v58 cifrada).
 * Si la RPC no existe (migration no aplicada), hace fallback a plain text.
 */
export async function getGmailTokens(): Promise<GmailTokens | null> {
  const supabase = getServiceClient()

  // Intento 1: RPC cifrada (post v58)
  try {
    const { data: encrypted, error: rpcErr } = await supabase.rpc('fn_read_oauth_token', { p_key: KEY })
    if (!rpcErr && encrypted) {
      try {
        return JSON.parse(encrypted as unknown as string) as GmailTokens
      } catch {
        return null
      }
    }
    // Si rpcErr y el mensaje sugiere que la función no existe, caemos al fallback.
    if (rpcErr && !/does not exist|undefined function|not found/i.test(rpcErr.message)) {
      // Otro tipo de error (ej. clave de cifrado no configurada) — tratamos como no-tokens.
      console.warn('[gmail-tokens] fn_read_oauth_token error:', rpcErr.message)
      return null
    }
  } catch (e) {
    console.warn('[gmail-tokens] excepción llamando RPC, fallback a plain:', (e as Error).message)
  }

  // Intento 2: plain text (legacy, pre v58 o migration aún sin propagar)
  try {
    const { data, error } = await supabase
      .from('tt_system_params')
      .select('value')
      .eq('key', KEY)
      .maybeSingle()
    if (error || !data) return null
    const v = data.value
    if (!v) return null
    if (typeof v === 'string') {
      try { return JSON.parse(v) as GmailTokens } catch { return null }
    }
    return v as GmailTokens
  } catch {
    return null
  }
}

/**
 * Guarda tokens. Intenta primero RPC fn_write_oauth_token (cifrada).
 * Si no existe, hace fallback a UPSERT plain text.
 */
export async function setGmailTokens(tokens: GmailTokens): Promise<void> {
  const supabase = getServiceClient()
  const json = JSON.stringify(tokens)

  // Intento 1: RPC cifrada
  const { error: rpcErr } = await supabase.rpc('fn_write_oauth_token', { p_key: KEY, p_value: json })
  if (!rpcErr) return

  if (!/does not exist|undefined function|not found/i.test(rpcErr.message)) {
    // Error real — propagar.
    throw new Error(`fn_write_oauth_token falló: ${rpcErr.message}`)
  }

  // Intento 2: fallback plain text (legacy)
  const { error } = await supabase
    .from('tt_system_params')
    .upsert(
      {
        key: KEY,
        value: json,
        description: 'Tokens OAuth de Gmail (gmail.readonly + gmail.send) — pendiente de cifrado v58',
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'key' }
    )
  if (error) throw new Error(`No se pudieron guardar tokens Gmail (plain): ${error.message}`)
}

export async function clearGmailTokens(): Promise<void> {
  const supabase = getServiceClient()
  // Borra ambos: cifrado (v58) y plain (legacy)
  await supabase.from('tt_system_params').delete().eq('key', KEY)
}
