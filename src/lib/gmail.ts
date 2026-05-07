/**
 * GMAIL SERVICE — Search emails, extract contacts + signature data
 *
 * Uses Google OAuth2 tokens persisted in Supabase (tt_system_params).
 * Searches by domain, extracts contacts from From/To/CC headers,
 * then reads email bodies to extract signature data (position, phone, whatsapp).
 */

import { google } from 'googleapis'
import { getGmailTokens, setGmailTokens } from '@/lib/gmail-tokens'

export interface GmailContact {
  name: string
  email: string
  position: string
  phone: string
  whatsapp: string
  raw_signature: string
}

async function getOAuth2Client() {
  const oauth2Client = new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET,
    process.env.GOOGLE_REDIRECT_URI
  )

  const tokens = await getGmailTokens()
  if (!tokens) {
    throw new Error('Gmail not connected. Visit /api/auth/google to authorize.')
  }

  oauth2Client.setCredentials(tokens)

  // googleapis emite 'tokens' al refrescar — hay que persistir el merge.
  oauth2Client.on('tokens', (newTokens) => {
    void (async () => {
      try {
        const existing = (await getGmailTokens()) || {}
        await setGmailTokens({ ...existing, ...newTokens })
      } catch (err) {
        console.warn('[gmail] no se pudo persistir refresh tokens:', (err as Error).message)
      }
    })()
  })

  return oauth2Client
}

export async function isGmailConnected(): Promise<boolean> {
  const tokens = await getGmailTokens()
  return !!tokens && (!!tokens.access_token || !!tokens.refresh_token)
}

/**
 * Search Gmail and extract contacts with full signature data
 */
export async function searchContactsByDomain(domain: string): Promise<GmailContact[]> {
  const auth = await getOAuth2Client()
  const gmail = google.gmail({ version: 'v1', auth })

  const query = `from:@${domain} OR to:@${domain} OR cc:@${domain}`

  const { data } = await gmail.users.messages.list({
    userId: 'me',
    q: query,
    maxResults: 100,
  })

  if (!data.messages || data.messages.length === 0) {
    return []
  }

  // Map: email → contact data (accumulate best info)
  const contacts = new Map<string, GmailContact>()

  // Phase 1: Read messages — extract headers + body signatures
  const messagesToRead = data.messages.slice(0, 30) // limit for speed

  for (const msg of messagesToRead) {
    try {
      const { data: fullMsg } = await gmail.users.messages.get({
        userId: 'me',
        id: msg.id!,
        format: 'full',
      })

      const headers = fullMsg.payload?.headers || []
      const bodyText = extractTextBody(fullMsg.payload)

      // Extract contacts from headers
      for (const header of headers) {
        if (!header.value) continue
        if (!['From', 'To', 'Cc'].includes(header.name || '')) continue

        const addresses = parseEmailAddresses(header.value)
        for (const addr of addresses) {
          if (addr.email.toLowerCase().includes(domain.toLowerCase())) {
            const emailLower = addr.email.toLowerCase()
            if (!contacts.has(emailLower)) {
              contacts.set(emailLower, {
                name: cleanName(addr.name) || '',
                email: emailLower,
                position: '',
                phone: '',
                whatsapp: '',
                raw_signature: '',
              })
            } else if (addr.name && !contacts.get(emailLower)!.name) {
              contacts.get(emailLower)!.name = cleanName(addr.name)
            }
          }
        }
      }

      // Extract signature data from body
      if (bodyText) {
        // Find signatures for each contact from this domain
        for (const [email, contact] of contacts) {
          if (!email.includes(domain.toLowerCase())) continue

          const signature = extractSignatureForEmail(bodyText, email, contact.name)
          if (signature) {
            // Merge: keep the most complete data
            if (signature.position && !contact.position) contact.position = signature.position
            if (signature.phone && !contact.phone) contact.phone = signature.phone
            if (signature.whatsapp && !contact.whatsapp) contact.whatsapp = signature.whatsapp
            if (signature.raw && !contact.raw_signature) contact.raw_signature = signature.raw
          }
        }
      }
    } catch {
      continue
    }
  }

  return Array.from(contacts.values())
}

/**
 * Extract plain text body from email payload (handles multipart)
 */
function extractTextBody(payload: any): string {
  if (!payload) return ''

  // Direct body
  if (payload.mimeType === 'text/plain' && payload.body?.data) {
    return Buffer.from(payload.body.data, 'base64').toString('utf-8')
  }

  // Multipart — recurse
  if (payload.parts) {
    for (const part of payload.parts) {
      // Prefer text/plain
      if (part.mimeType === 'text/plain' && part.body?.data) {
        return Buffer.from(part.body.data, 'base64').toString('utf-8')
      }
      // Recurse into nested multipart
      if (part.parts) {
        const nested = extractTextBody(part)
        if (nested) return nested
      }
    }
    // Fallback to text/html
    for (const part of payload.parts) {
      if (part.mimeType === 'text/html' && part.body?.data) {
        const html = Buffer.from(part.body.data, 'base64').toString('utf-8')
        // Strip HTML tags for signature extraction
        return html.replace(/<br\s*\/?>/gi, '\n').replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ').replace(/\s+/g, ' ')
      }
    }
  }

  return ''
}

/**
 * Extract signature block for a specific contact from email body
 */
function extractSignatureForEmail(
  body: string,
  email: string,
  name: string
): { position: string; phone: string; whatsapp: string; raw: string } | null {
  // Find the signature block — usually near the person's name or email
  const lines = body.split(/\n/)
  let signatureStart = -1

  // Search for the contact's name or email in the body
  const searchTerms = [name, email].filter(Boolean)
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].toLowerCase()
    for (const term of searchTerms) {
      if (term && line.includes(term.toLowerCase())) {
        signatureStart = Math.max(0, i - 2) // start a few lines before
        break
      }
    }
    if (signatureStart >= 0) break
  }

  if (signatureStart < 0) return null

  // Take ~15 lines from signature start
  const signatureLines = lines.slice(signatureStart, signatureStart + 15)
  const signatureBlock = signatureLines.join('\n')

  return {
    position: extractPosition(signatureBlock),
    phone: extractPhone(signatureBlock),
    whatsapp: extractWhatsapp(signatureBlock),
    raw: signatureBlock.slice(0, 500),
  }
}

/**
 * Extract job position/title from signature text
 */
function extractPosition(text: string): string {
  const patterns = [
    /(?:Depto?\.?\s*(?:de\s+)?|Departamento\s+(?:de\s+)?)([A-ZÀ-Ü][a-záéíóúñ\s]+(?:y\s+[A-ZÀ-Ü][a-záéíóúñ\s]+)?)/i,
    /(?:Gerente|Director[a]?|Jefe|Responsable|Coordinador[a]?|Analista|Ingenier[oa]|Supervisor[a]?|Encargad[oa])\s+(?:de\s+)?[A-ZÀ-Ü][a-záéíóúñ\s]*/i,
    /(?:Compras|Ventas|Comercio\s+Exterior|Comex|Logística|Administración|Finanzas|Ingeniería|Calidad|RRHH|Mantenimiento|Producción)/i,
  ]

  for (const pattern of patterns) {
    const match = text.match(pattern)
    if (match) {
      // Clean: take only first line, remove company name artifacts
      return match[0].split(/[\r\n]/)[0].trim()
    }
  }
  return ''
}

/**
 * Extract phone numbers from signature text
 */
function extractPhone(text: string): string {
  const patterns = [
    /(?:Tel\.?|Teléfono|Phone|Ph|Tel\.?\s*:?\s*\(?)\s*[:\s]?\s*(\+?[\d\s().-]{7,20})/i,
    /(\(\d{2,4}\)\s*\d{4,}[\d\s.-]*)/,
    /(\+\d{1,3}[\s.-]?\d{1,4}[\s.-]?\d{3,}[\d\s.-]*)/,
  ]

  for (const pattern of patterns) {
    const match = text.match(pattern)
    if (match) {
      const phone = (match[1] || match[0]).trim().replace(/^[:\s]+/, '')
      if (phone.replace(/\D/g, '').length >= 7) return phone
    }
  }
  return ''
}

/**
 * Extract WhatsApp number from signature text
 */
function extractWhatsapp(text: string): string {
  const patterns = [
    /(?:whatsapp|wsp|wa)\s*[:\s]?\s*(\+?[\d\s().-]{7,20})/i,
    /whatsapp\.com\/send\/?[?&]phone=(\d+)/i,
    /wa\.me\/(\d+)/i,
    /(?:Cel\.?|Celular|Mobile|Móvil)\s*[:\s]?\s*(\+?[\d\s().-]{7,20})/i,
  ]

  for (const pattern of patterns) {
    const match = text.match(pattern)
    if (match) {
      const num = (match[1] || match[0]).trim()
      if (num.replace(/\D/g, '').length >= 7) return num
    }
  }
  return ''
}

/**
 * Parse email addresses from header string
 */
function parseEmailAddresses(headerValue: string): Array<{ name: string; email: string }> {
  const results: Array<{ name: string; email: string }> = []
  const parts = headerValue.split(/,(?=(?:[^"]*"[^"]*")*[^"]*$)/)

  for (const part of parts) {
    const trimmed = part.trim()
    const match = trimmed.match(/^"?([^"<]*)"?\s*<([^>]+)>/)
    if (match) {
      results.push({ name: match[1].trim().replace(/^"|"$/g, ''), email: match[2].trim() })
      continue
    }
    const emailMatch = trimmed.match(/[\w.-]+@[\w.-]+\.\w+/)
    if (emailMatch) {
      results.push({ name: '', email: emailMatch[0] })
    }
  }
  return results
}

/**
 * Clean contact name (remove email artifacts, quotes, etc.)
 */
function cleanName(name: string): string {
  return name
    .replace(/<[^>]+>/g, '')
    .replace(/\([^)]*@[^)]*\)/g, '') // remove (email@domain)
    .replace(/["']/g, '')
    .replace(/\s+/g, ' ')
    .trim()
}
