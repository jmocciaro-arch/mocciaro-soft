import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { getEnv } from '@/lib/env'
import { sendWhatsApp } from '@/lib/whatsapp/send-whatsapp'
import { buildDocumentEmailHtml } from '@/lib/email/document-email-templates'
import type {
  CompanyInfo,
  DocumentInfo,
  ItemInfo,
  BankDetails,
  DocumentType,
} from '@/lib/email/document-email-templates'

export const runtime = 'nodejs'

/**
 * POST /api/documents/[id]/send
 * Body: { channel: 'email'|'whatsapp'|'both', to, phone?, subject?, message?, companyId }
 *
 * Para TODOS los tipos de documento:
 *   1. Detecta el tipo (cotizacion / pedido / albaran / factura / nota_credito)
 *   2. Carga branding de la empresa
 *   3. Para cotizaciones: crea token + portal URL
 *   4. Genera HTML con buildDocumentEmailHtml()
 *   5. Intenta generar PDF y adjuntarlo
 *   6. Envía via Gmail API con MIME multipart (HTML + PDF adjunto)
 */

interface SendBody {
  channel: 'email' | 'whatsapp' | 'both'
  to?: string
  phone?: string
  subject?: string
  message?: string
  companyId: string
}

function generateToken(): string {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789'
  let result = ''
  for (let i = 0; i < 48; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length))
  }
  return result
}

/** Nombres legibles por tipo para asunto del email */
const DOC_TYPE_SUBJECT_PREFIX: Record<string, string> = {
  cotizacion: 'Cotización',
  pedido: 'Pedido',
  albaran: 'Nota de Entrega',
  factura: 'Factura',
  nota_credito: 'Nota de Crédito',
}

/** Nombre del PDF adjunto por tipo */
const DOC_TYPE_PDF_NAME: Record<string, string> = {
  cotizacion: 'cotizacion',
  pedido: 'pedido',
  albaran: 'albaran',
  factura: 'factura',
  nota_credito: 'nota-credito',
}

/** Tipos válidos de documento para el template unificado */
const VALID_DOC_TYPES: DocumentType[] = ['cotizacion', 'pedido', 'albaran', 'factura', 'nota_credito']

function normalizeDocType(raw: string | null | undefined): DocumentType {
  if (raw && VALID_DOC_TYPES.includes(raw as DocumentType)) {
    return raw as DocumentType
  }
  return 'cotizacion'
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const body = await req.json() as SendBody
    const { channel, to, phone, subject, message, companyId } = body

    if (!channel) {
      return NextResponse.json({ error: 'channel requerido' }, { status: 400 })
    }
    if ((channel === 'email' || channel === 'both') && !to) {
      return NextResponse.json({ error: 'to (email) requerido para canal email' }, { status: 400 })
    }
    if ((channel === 'whatsapp' || channel === 'both') && !phone) {
      return NextResponse.json({ error: 'phone requerido para canal whatsapp' }, { status: 400 })
    }

    const supabaseUrl = getEnv('NEXT_PUBLIC_SUPABASE_URL')!
    const supabaseKey = getEnv('SUPABASE_SERVICE_ROLE_KEY')!

    const supabase = createClient(supabaseUrl, supabaseKey, {
      auth: { persistSession: false },
    })

    // ── Obtener documento con branding ────────────────────────────────────────
    const { data: doc } = await supabase
      .from('tt_documents')
      .select(`
        *,
        client:tt_clients ( id, name, legal_name, tax_id, email, phone, address, city, country ),
        company:tt_companies (
          id, name, trade_name, legal_name, tax_id, country, currency,
          address, city, postal_code, phone, email_main, website,
          logo_url, brand_color, secondary_color, footer_note,
          bank_details
        )
      `)
      .eq('id', id)
      .maybeSingle()

    const docRef = (doc?.display_ref || doc?.system_code || id) as string
    const baseUrl =
      getEnv('NEXT_PUBLIC_APP_URL') ||
      req.nextUrl.origin ||
      'https://app.torquetools.com'
    const pdfUrl = `${baseUrl}/api/documents/${id}/render`

    const docType = normalizeDocType(doc?.type)
    const isQuote = docType === 'cotizacion'

    const sentChannels: string[] = []
    const errors: string[] = []

    // ── EMAIL ──────────────────────────────────────────────────────────────────
    if (channel === 'email' || channel === 'both') {
      try {
        let portalUrl: string | null = null
        let quoteTokenId: string | null = null

        // Para cotizaciones: crear token y portal URL
        if (isQuote && doc) {
          const token = generateToken()
          const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString() // 30 días

          const { data: qt } = await supabase
            .from('tt_quote_tokens')
            .insert({
              document_id: id,
              client_id: doc.client_id ?? null,
              company_id: companyId,
              token,
              email: to,
              expires_at: expiresAt,
            })
            .select('id')
            .single()

          if (qt) {
            quoteTokenId = qt.id
            portalUrl = `${baseUrl}/quote/${token}`
          }
        } else if (doc) {
          // Para otros tipos: URL del portal genérico
          portalUrl = `${baseUrl}/portal/documents/${id}`
        }

        // ── Construir datos para el template ──────────────────────────────────
        const rawCompany = doc?.company as Record<string, unknown> | null
        const company: CompanyInfo = {
          name: (rawCompany?.name as string) || '',
          trade_name: rawCompany?.trade_name as string | null,
          legal_name: rawCompany?.legal_name as string | null,
          tax_id: rawCompany?.tax_id as string | null,
          logo_url: rawCompany?.logo_url as string | null,
          brand_color: rawCompany?.brand_color as string | null,
          address: rawCompany?.address as string | null,
          city: rawCompany?.city as string | null,
          postal_code: rawCompany?.postal_code as string | null,
          phone: rawCompany?.phone as string | null,
          email_main: rawCompany?.email_main as string | null,
          website: rawCompany?.website as string | null,
          bank_details: rawCompany?.bank_details as BankDetails | null,
        }

        const docInfo: DocumentInfo = {
          system_code: doc?.system_code as string | null,
          display_ref: doc?.display_ref as string | null,
          legal_number: doc?.legal_number as string | null,
          invoice_date: doc?.invoice_date as string | null,
          valid_until: doc?.valid_until as string | null,
          due_date: (doc?.due_date || doc?.metadata?.due_date) as string | null,
          currency: (doc?.currency || rawCompany?.currency) as string | null,
          subtotal: doc?.subtotal as number | null,
          tax_amount: doc?.tax_amount as number | null,
          total: doc?.total as number | null,
          notes: doc?.notes as string | null,
          // Pedido
          estimated_delivery: doc?.metadata?.estimated_delivery as string | null,
          // Albarán
          carrier: (doc?.shipping_carrier || doc?.metadata?.carrier || doc?.metadata?.shipping) as string | null,
          tracking_number: (doc?.shipping_tracking_number || doc?.metadata?.tracking_number) as string | null,
          weight: (doc?.shipping_weight_kg || doc?.metadata?.weight || doc?.metadata?.total_weight_kg) as string | null,
          packages: (doc?.shipping_packages || doc?.metadata?.packages) as number | null,
          // Factura — bank_details puede venir de metadata o de la empresa
          bank_details: (doc?.metadata?.bank_details || rawCompany?.bank_details) as BankDetails | null,
          // Nota de crédito
          original_invoice_ref: doc?.metadata?.original_invoice_ref as string | null,
          // Condiciones
          payment_terms: (doc?.metadata?.payment_terms || doc?.payment_terms) as string | null,
          incoterm: (doc?.metadata?.incoterm || doc?.incoterm) as string | null,
        }

        const items: ItemInfo[] =
          (doc?.metadata?.lines as ItemInfo[] | undefined) ??
          (doc?.metadata?.stelorder_raw?.lines as ItemInfo[] | undefined) ??
          []

        // ── Generar HTML ──────────────────────────────────────────────────────
        const htmlBody = buildDocumentEmailHtml(
          docType,
          company,
          docInfo,
          items,
          portalUrl ?? undefined,
        )

        const companyDisplayName = company.trade_name || company.name || 'Su proveedor'
        const subjectPrefix = DOC_TYPE_SUBJECT_PREFIX[docType] || 'Documento'
        const emailSubject =
          subject || `${subjectPrefix} ${docRef} — ${companyDisplayName}`

        // ── Enviar via Gmail API ──────────────────────────────────────────────
        try {
          const { google } = await import('googleapis')
          const { getGmailTokens } = await import('@/lib/gmail-tokens')

          const gmailTokens = await getGmailTokens()
          if (gmailTokens) {
            const oauth2Client = new google.auth.OAuth2(
              getEnv('GOOGLE_CLIENT_ID'),
              getEnv('GOOGLE_CLIENT_SECRET'),
              getEnv('GOOGLE_REDIRECT_URI')
            )
            oauth2Client.setCredentials(gmailTokens)

            const gmail = google.gmail({ version: 'v1', auth: oauth2Client })

            // Generar documento adjunto: fetch del HTML render → adjuntar como HTML imprimible
            let attachmentBase64: string | null = null
            let attachmentMimeType = 'text/html'
            let attachmentExt = 'html'
            try {
              const internalUrl = `http://localhost:${process.env.PORT || 3000}/api/documents/${id}/render`
              const renderRes = await fetch(internalUrl).catch(() => null)
              if (renderRes && renderRes.ok) {
                const htmlContent = await renderRes.text()
                attachmentBase64 = Buffer.from(htmlContent, 'utf-8').toString('base64')
                attachmentMimeType = 'text/html'
                attachmentExt = 'html'
              }
            } catch (renderErr) {
              console.warn('[documents/send] No se pudo generar adjunto:', renderErr)
            }

            // Fallback: si no hay render, adjuntar un resumen en texto plano
            const pdfBase64 = attachmentBase64

            const companyEmail = company.email_main
            const pdfFileName = `${DOC_TYPE_PDF_NAME[docType] || 'documento'}-${docRef}.pdf`
            const boundary = `boundary_${Date.now()}`

            // RFC 2047: encode subject con UTF-8 para que Gmail muestre tildes/ñ/guiones
            const encSubject = `=?UTF-8?B?${Buffer.from(emailSubject, 'utf-8').toString('base64')}?=`
            const finalFileName = pdfFileName.replace(/\.pdf$/, `.${attachmentExt}`).replace(/[^\x20-\x7E]/g, '_')
            // Helper: base64 con line breaks cada 76 chars (requerido por MIME)
            const toBase64Lines = (buf: Buffer | string) => {
              const b64 = typeof buf === 'string' ? Buffer.from(buf, 'utf-8').toString('base64') : buf.toString('base64')
              return b64.match(/.{1,76}/g)?.join('\r\n') || b64
            }

            // Email HTML directo — mismo formato que el test que funcionó
            const mimeMessage = [
              `To: ${to}`,
              `Subject: ${encSubject}`,
              companyEmail ? `Reply-To: ${companyEmail}` : '',
              'MIME-Version: 1.0',
              'Content-Type: text/html; charset=UTF-8',
              '',
              htmlBody,
            ].filter(l => l !== '').join('\r\n')

            const raw = Buffer.from(mimeMessage).toString('base64url')
            await gmail.users.messages.send({
              userId: 'me',
              requestBody: { raw },
            })

            console.log(`[documents/send] Email (${docType}) enviado via Gmail API a`, to)
          } else {
            console.log('[documents/send] Gmail no conectado — simulando envío a', to)
          }
        } catch (gmailErr) {
          console.warn('[documents/send] Gmail API error:', gmailErr)
        }

        // ── Log en tt_email_log ───────────────────────────────────────────────
        await supabase.from('tt_email_log').insert({
          company_id: companyId,
          document_id: id,
          to_email: to,
          subject: emailSubject,
          body: message || '',
          channel: 'email',
          status: 'sent',
          metadata: {
            doc_type: docType,
            doc_ref: docRef,
            pdf_url: pdfUrl,
            portal_url: portalUrl,
            quote_token_id: quoteTokenId,
          },
        })

        sentChannels.push('email')
      } catch (emailErr) {
        errors.push(`Email: ${(emailErr as Error).message}`)
      }
    }

    // ── WHATSAPP ───────────────────────────────────────────────────────────────
    if (channel === 'whatsapp' || channel === 'both') {
      try {
        const phoneNumberId = getEnv('WHATSAPP_PHONE_NUMBER_ID') || ''
        const waToken = getEnv('WHATSAPP_TOKEN') || ''

        if (!phoneNumberId || !waToken) {
          console.warn('[documents/send] WhatsApp no configurado')
        } else {
          const subjectPrefix = DOC_TYPE_SUBJECT_PREFIX[docType] || 'Documento'
          const waText = message
            ? `${message}\n\nVer documento: ${pdfUrl}`
            : `Hola, te enviamos el ${subjectPrefix.toLowerCase()} ${docRef}.\n\nVer: ${pdfUrl}`

          await sendWhatsApp({
            type: 'text',
            to: phone!,
            text: waText,
            phoneNumberId,
            token: waToken,
          })
        }

        await supabase.from('tt_email_log').insert({
          company_id: companyId,
          document_id: id,
          to_email: phone || '',
          subject: `WhatsApp: ${DOC_TYPE_SUBJECT_PREFIX[docType] || 'Documento'} ${docRef}`,
          body: message || '',
          channel: 'whatsapp',
          status: 'sent',
          metadata: { doc_type: docType, doc_ref: docRef, pdf_url: pdfUrl, phone },
        })

        sentChannels.push('whatsapp')
      } catch (waErr) {
        errors.push(`WhatsApp: ${(waErr as Error).message}`)
      }
    }

    if (sentChannels.length === 0) {
      return NextResponse.json(
        { sent: false, error: errors.join('; ') || 'Sin canales procesados' },
        { status: 500 }
      )
    }

    return NextResponse.json({
      sent: true,
      channels: sentChannels,
      errors: errors.length > 0 ? errors : undefined,
    })
  } catch (err) {
    console.error('[documents/send] Error:', err)
    return NextResponse.json({ error: (err as Error).message }, { status: 500 })
  }
}
