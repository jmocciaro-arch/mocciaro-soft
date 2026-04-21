// ============================================================================
// Verificacion de firma X-Hub-Signature-256 (HMAC-SHA256 con App Secret)
// ============================================================================
import crypto from 'crypto'

/**
 * Verifica que el payload entrante corresponda con la firma.
 * Meta envia: X-Hub-Signature-256: sha256=<hmac>
 *
 * @param rawBody  El body crudo del request (string o Buffer, sin parsear JSON)
 * @param signatureHeader  El valor del header X-Hub-Signature-256 (ej "sha256=abc...")
 * @param appSecret  App Secret de la app de Meta (NO el access token)
 */
export function verifyMetaSignature(
  rawBody: string | Buffer,
  signatureHeader: string | null | undefined,
  appSecret: string,
): boolean {
  if (!signatureHeader || !signatureHeader.startsWith('sha256=')) return false
  const expectedSig = signatureHeader.slice('sha256='.length)

  const hmac = crypto.createHmac('sha256', appSecret)
  hmac.update(rawBody)
  const computed = hmac.digest('hex')

  // timing-safe comparison
  const a = Buffer.from(expectedSig, 'hex')
  const b = Buffer.from(computed, 'hex')
  if (a.length !== b.length) return false
  try {
    return crypto.timingSafeEqual(a, b)
  } catch {
    return false
  }
}

/**
 * Genera el token de verificacion inicial que Meta pide al registrar el webhook.
 * Devuelve el hub.challenge si hub.verify_token coincide con el esperado.
 */
export function handleWebhookVerify(
  query: URLSearchParams,
  expectedToken: string,
): { ok: true; challenge: string } | { ok: false; reason: string } {
  const mode = query.get('hub.mode')
  const token = query.get('hub.verify_token')
  const challenge = query.get('hub.challenge')

  if (mode !== 'subscribe') return { ok: false, reason: 'hub.mode invalido' }
  if (!token || token !== expectedToken) return { ok: false, reason: 'verify_token no coincide' }
  if (!challenge) return { ok: false, reason: 'hub.challenge ausente' }

  return { ok: true, challenge }
}
