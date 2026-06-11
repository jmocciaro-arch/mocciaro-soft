/**
 * MercadoLibre OAuth — helpers de conexión por empresa (Fase 1).
 *
 * Flujo: Authorization Code (confidential client con client_secret, sin PKCE).
 * El access_token dura ~6 hs; el refresh_token es single-use (cada refresh
 * devuelve uno nuevo) y dura ~6 meses.
 *
 * STORAGE: los tokens se guardan por canal en tt_channels.config->'ml'. La
 * lectura/escritura va siempre por admin client (service_role) desde endpoints
 * server. El endpoint GET /api/admin/channels NO selecciona la columna config,
 * así que el token no se expone por la app.
 *
 * DEUDA (anotada): hoy el token queda en config SIN cifrar. La policy RLS
 * permisiva `authenticated_all` de tt_* permitiría a un logueado leerlo con
 * query directa — mismo riesgo que los tokens de Gmail en tt_system_params.
 * Cuando se aplique el cifrado pgcrypto (PLAN-REFACTOR §0.7 / migración v58),
 * mover persistMlTokens/readMlChannelConfig a fn_write/read_oauth_token sin
 * cambiar el shape público de este módulo.
 */

import { createHmac, timingSafeEqual } from 'crypto'
import type { SupabaseClient } from '@supabase/supabase-js'

/** Host de autorización por país del seller. AR por default (primera empresa). */
const ML_AUTH_HOST = process.env.ML_AUTH_HOST ?? 'auth.mercadolibre.com.ar'
const ML_API_BASE = 'https://api.mercadolibre.com'

export interface MlOAuthConfig {
  clientId: string
  clientSecret: string
  redirectUri: string
}

/** Lee la config de env. Throw si falta alguna — el caller la convierte en 500 legible. */
export function getMlOAuthConfig(): MlOAuthConfig {
  const clientId = process.env.ML_CLIENT_ID
  const clientSecret = process.env.ML_CLIENT_SECRET
  const redirectUri = process.env.ML_REDIRECT_URI
  if (!clientId || !clientSecret || !redirectUri) {
    throw new Error(
      'Faltan env vars de MercadoLibre (ML_CLIENT_ID / ML_CLIENT_SECRET / ML_REDIRECT_URI). ' +
      'Cargalas en Vercel → Settings → Environment Variables.',
    )
  }
  return { clientId, clientSecret, redirectUri }
}

/**
 * Respuesta cruda de POST /oauth/token (authorization_code y refresh_token).
 * refresh_token SOLO viene si la app tiene el scope offline_access habilitado
 * en el DevCenter — el callback lo valida y corta con error explícito si falta.
 */
export interface MlTokenResponse {
  access_token: string
  token_type: string
  expires_in: number
  scope: string
  user_id: number
  refresh_token?: string
}

/** Tokens listos para persistir una conexión: refresh_token garantizado. */
export type MlTokensConnected = MlTokenResponse & { refresh_token: string }

/** Lo que persistimos en tt_channels.config->'ml'. */
export interface MlStoredConfig {
  access_token: string
  refresh_token: string
  expires_at: string // ISO; cuándo expira el access_token
  scope: string
  ml_user_id: number
  nickname: string | null
  connected_at: string
  connected_by: string // tt_users.id
}

// ─── State firmado (anti-CSRF + transporta el channel_id al callback) ───
// Clave HMAC: reusamos el service_role key (server-only) para no agregar env vars.

interface StatePayload {
  cid: string // channel_id
  co: string // company_id
  ts: number
}

function stateKey(): string {
  const k = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!k) throw new Error('SUPABASE_SERVICE_ROLE_KEY no configurada (necesaria para firmar el state OAuth)')
  return k
}

function b64url(buf: Buffer): string {
  return buf.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

export function signState(payload: StatePayload): string {
  const body = b64url(Buffer.from(JSON.stringify(payload)))
  const sig = b64url(createHmac('sha256', stateKey()).update(body).digest())
  return `${body}.${sig}`
}

/** Verifica firma y frescura (10 min). Devuelve el payload o null si es inválido. */
export function verifyState(token: string | null): StatePayload | null {
  if (!token) return null
  const [body, sig] = token.split('.')
  if (!body || !sig) return null
  const expected = b64url(createHmac('sha256', stateKey()).update(body).digest())
  const a = Buffer.from(sig)
  const b = Buffer.from(expected)
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null
  try {
    const payload = JSON.parse(Buffer.from(body.replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString()) as StatePayload
    if (!payload.cid || !payload.co || !payload.ts) return null
    if (Date.now() - payload.ts > 10 * 60 * 1000) return null // expirado
    return payload
  } catch {
    return null
  }
}

// ─── OAuth ───

export function buildAuthorizeUrl(state: string): string {
  const { clientId, redirectUri } = getMlOAuthConfig()
  const params = new URLSearchParams({
    response_type: 'code',
    client_id: clientId,
    redirect_uri: redirectUri,
    state,
  })
  return `https://${ML_AUTH_HOST}/authorization?${params.toString()}`
}

async function postToken(params: Record<string, string>): Promise<MlTokenResponse> {
  const res = await fetch(`${ML_API_BASE}/oauth/token`, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded', accept: 'application/json' },
    body: new URLSearchParams(params).toString(),
  })
  const json = (await res.json()) as MlTokenResponse & { error?: string; message?: string }
  if (!res.ok) {
    throw new Error(`MercadoLibre /oauth/token ${res.status}: ${json.error ?? ''} ${json.message ?? ''}`.trim())
  }
  return json
}

export function exchangeCodeForTokens(code: string): Promise<MlTokenResponse> {
  const { clientId, clientSecret, redirectUri } = getMlOAuthConfig()
  return postToken({
    grant_type: 'authorization_code',
    client_id: clientId,
    client_secret: clientSecret,
    code,
    redirect_uri: redirectUri,
  })
}

export function refreshTokens(refreshToken: string): Promise<MlTokenResponse> {
  const { clientId, clientSecret } = getMlOAuthConfig()
  return postToken({
    grant_type: 'refresh_token',
    client_id: clientId,
    client_secret: clientSecret,
    refresh_token: refreshToken,
  })
}

/** Trae el nickname del seller para mostrarlo en la UI. Best-effort. */
export async function fetchMlNickname(accessToken: string): Promise<string | null> {
  try {
    const res = await fetch(`${ML_API_BASE}/users/me`, {
      headers: { authorization: `Bearer ${accessToken}` },
    })
    if (!res.ok) return null
    const json = (await res.json()) as { nickname?: string }
    return json.nickname ?? null
  } catch {
    return null
  }
}

// ─── Persistencia en tt_channels.config->'ml' ───

function buildStored(tok: MlTokensConnected, nickname: string | null, connectedBy: string): MlStoredConfig {
  return {
    access_token: tok.access_token,
    refresh_token: tok.refresh_token,
    expires_at: new Date(Date.now() + tok.expires_in * 1000).toISOString(),
    scope: tok.scope,
    ml_user_id: tok.user_id,
    nickname,
    connected_at: new Date().toISOString(),
    connected_by: connectedBy,
  }
}

/**
 * Persistencia de CONEXIÓN INICIAL (solo desde el callback OAuth): guarda
 * tokens en config->'ml' (merge sobre la config existente) y marca el canal
 * como conectado: enabled=true, status='active'. Para renovar tokens usar
 * persistRefreshedTokens — esta función pisa el estado del canal a propósito.
 */
export async function persistMlTokens(
  admin: SupabaseClient,
  channelId: string,
  tok: MlTokensConnected,
  nickname: string | null,
  connectedBy: string,
): Promise<void> {
  const { data: current } = await admin.from('tt_channels').select('config').eq('id', channelId).single()
  const config = { ...((current?.config as Record<string, unknown>) ?? {}), ml: buildStored(tok, nickname, connectedBy) }
  const { error } = await admin
    .from('tt_channels')
    .update({ config, enabled: true, status: 'active', last_sync_at: null, updated_at: new Date().toISOString() })
    .eq('id', channelId)
  if (error) throw new Error(`No se pudieron guardar los tokens de ML: ${error.message}`)
}

/**
 * Persistencia de REFRESH: actualiza solo los tokens dentro de config->'ml'.
 * NO toca enabled/status/last_sync_at ni connected_at/connected_by — el
 * refresh corre en background (~cada 6 hs) y no debe revertir decisiones del
 * admin (canal deshabilitado/pausado) ni romper el bookkeeping de sync.
 */
export async function persistRefreshedTokens(
  admin: SupabaseClient,
  channelId: string,
  stored: MlStoredConfig,
  refreshed: MlTokenResponse,
): Promise<void> {
  const { data: current } = await admin.from('tt_channels').select('config').eq('id', channelId).single()
  const ml: MlStoredConfig = {
    ...stored,
    access_token: refreshed.access_token,
    // ML rota el refresh_token (single-use); si la respuesta no trae uno nuevo, conservamos el anterior.
    refresh_token: refreshed.refresh_token ?? stored.refresh_token,
    expires_at: new Date(Date.now() + refreshed.expires_in * 1000).toISOString(),
    scope: refreshed.scope,
  }
  const config = { ...((current?.config as Record<string, unknown>) ?? {}), ml }
  const { error } = await admin
    .from('tt_channels')
    .update({ config, updated_at: new Date().toISOString() })
    .eq('id', channelId)
  if (error) throw new Error(`No se pudo persistir el refresh de tokens ML: ${error.message}`)
}

export async function readMlChannelConfig(admin: SupabaseClient, channelId: string): Promise<MlStoredConfig | null> {
  const { data } = await admin.from('tt_channels').select('config').eq('id', channelId).single()
  const ml = (data?.config as Record<string, unknown> | undefined)?.ml
  return (ml as MlStoredConfig | undefined) ?? null
}

/**
 * Devuelve un access_token válido, refrescando si está por expirar (margen 5 min).
 * Persiste la rotación vía persistRefreshedTokens (sin tocar estado del canal).
 * Para la Fase 2 (sync). Devuelve null si el canal está deshabilitado o no
 * tiene conexión — un canal apagado por el admin nunca refresca en background.
 */
export async function getValidAccessToken(admin: SupabaseClient, channelId: string): Promise<string | null> {
  const { data } = await admin.from('tt_channels').select('enabled, config').eq('id', channelId).single()
  if (!data?.enabled) return null
  const stored = ((data.config as Record<string, unknown> | null)?.ml as MlStoredConfig | undefined) ?? null
  if (!stored) return null
  const expiresSoon = new Date(stored.expires_at).getTime() - Date.now() < 5 * 60 * 1000
  if (!expiresSoon) return stored.access_token
  const refreshed = await refreshTokens(stored.refresh_token)
  await persistRefreshedTokens(admin, channelId, stored, refreshed)
  return refreshed.access_token
}
