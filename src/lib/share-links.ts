// ============================================================================
// Helper para generar / validar share links del send-document-modal.
//
// Genera un token aleatorio (32 bytes hex) firmado simbólicamente — la fuerza
// real viene de que solo nosotros conocemos el secreto y de la unicidad de la
// fila en tt_document_share_links.
//
// Para futuro: se puede migrar a JWT con `jose` si hace falta auto-validación
// sin DB. Hoy todo pasa por tabla.
// ============================================================================

import { randomBytes, createHmac } from 'crypto'
import { getEnv } from '@/lib/env'

const TOKEN_BYTES = 24      // 24 bytes → 48 chars hex
const DEFAULT_TTL_DAYS = 30

/**
 * Genera un token shareable.
 * El token es aleatorio (no auto-firmado), la validación se hace por lookup
 * en tt_document_share_links + chequeo de expires_at + revoked.
 */
export function generateShareToken(): string {
  return randomBytes(TOKEN_BYTES).toString('hex')
}

/**
 * Firma HMAC de cualquier payload con SHARE_LINK_SECRET (o fallback a CRON_SECRET).
 * Solo para casos donde necesitamos verificar sin DB (ej: links signed alternativos).
 */
export function signPayload(payload: string): string {
  const secret =
    getEnv('SHARE_LINK_SECRET') ||
    getEnv('JWT_SECRET') ||
    getEnv('CRON_SECRET') ||
    'mocciaro-soft-default-share-secret-change-me'
  return createHmac('sha256', secret).update(payload).digest('hex')
}

/**
 * Calcula la fecha de expiración a partir de un string "7", "30", "0" (nunca).
 */
export function calcExpiresAt(daysStr: string | number): string | null {
  const days = typeof daysStr === 'string' ? parseInt(daysStr, 10) : daysStr
  if (!days || days <= 0) return null
  return new Date(Date.now() + days * 24 * 60 * 60 * 1000).toISOString()
}

/**
 * Calcula la TTL por defecto (30 días).
 */
export function defaultExpiresAt(): string {
  return new Date(Date.now() + DEFAULT_TTL_DAYS * 24 * 60 * 60 * 1000).toISOString()
}

/**
 * Construye la URL pública del share link.
 * Se pasa el origin desde el caller (browser) o desde request en server.
 */
export function buildShareUrl(origin: string, docId: string, token: string): string {
  const cleanOrigin = origin.replace(/\/$/, '')
  return `${cleanOrigin}/doc/view/${docId}?token=${token}`
}
