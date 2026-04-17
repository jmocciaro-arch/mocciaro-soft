// -----------------------------------------------------------------------------
// renderDocumentHTML — motor de presentación.
// Carga document + lines + company + fiscal profile + address + config en
// paralelo y compone el HTML A4 usando template-a4.ts.
//
// No toca lógica de negocio: no cambia status, no recomputa totales, no
// registra eventos (eso lo hace el endpoint que invoca esta función).
// -----------------------------------------------------------------------------

import { getAdminClient } from '@/lib/supabase/admin'
import { renderA4Document, type RenderContext, type RenderConfig } from './template-a4'
import type { DocType } from '@/lib/schemas/documents'

type Admin = ReturnType<typeof getAdminClient>

// Config con defaults — se aplica si la fila de tt_document_configs no existe.
const DEFAULT_CONFIG: RenderConfig = {
  logo_url: null,
  header_html: null,
  footer_html: null,
  show_prices: true,
  show_images: false,
  show_attributes: true,
  show_taxes: true,
  show_notes: true,
  show_discounts: true,
  show_footer: true,
  show_payment_terms: true,
  signature_url: null,
  signature_required: false,
  qr_enabled: false,
  qr_payload_template: null,
  default_header_note: null,
  default_footer_note: null,
  terms_and_conditions: null,
}

export interface RenderResult {
  html: string
  filename: string               // "<doc_code>.pdf" — se reusa para el PDF
  docCode: string                // código humano o fallback "draft-<id>"
  docType: DocType
  companyId: string
  locale: string
}

export interface RenderOptions {
  locale?: string                // default derivado de empresa/país
}

// -----------------------------------------------------------------------------
// Carga y ensamblado.
// -----------------------------------------------------------------------------
async function loadContext(
  admin: Admin,
  documentId: string,
  options: RenderOptions,
): Promise<{ ctx: RenderContext; docCode: string } | { error: string; status: number }> {
  // Cabecera del documento
  const { data: doc, error: docErr } = await admin
    .from('tt_documents')
    .select(`
      id, company_id, doc_type, direction,
      doc_number, doc_year, doc_code, doc_date,
      counterparty_type, counterparty_id, counterparty_name, counterparty_tax_id,
      counterparty_email, counterparty_address,
      currency_code, exchange_rate,
      subtotal, discount_total, tax_total, total,
      status, valid_until, due_date,
      external_ref, customer_po_number,
      notes, internal_notes, metadata
    `)
    .eq('id', documentId)
    .maybeSingle()

  if (docErr) return { error: docErr.message, status: 500 }
  if (!doc)   return { error: 'Documento no encontrado', status: 404 }

  // Líneas, empresa, fiscal, address, config en paralelo.
  const [linesRes, companyRes, fiscalRes, addrRes, configRes] = await Promise.all([
    admin.from('tt_document_lines')
      .select('*')
      .eq('document_id', documentId)
      .order('line_number', { ascending: true }),
    admin.from('tt_companies')
      .select('id, name, code_prefix, logo_url, email_billing, timezone')
      .eq('id', doc.company_id)
      .maybeSingle(),
    admin.from('tt_company_fiscal_profiles')
      .select('tax_id, tax_id_type, country_code')
      .eq('company_id', doc.company_id)
      .maybeSingle(),
    admin.from('tt_company_addresses')
      .select('line1, line2, city, state, postal_code, country_code')
      .eq('company_id', doc.company_id)
      .eq('kind', 'fiscal')
      .maybeSingle(),
    admin.from('tt_document_configs')
      .select('*')
      .eq('company_id', doc.company_id)
      .eq('doc_type', doc.doc_type)
      .maybeSingle(),
  ])

  if (linesRes.error)   return { error: linesRes.error.message, status: 500 }
  if (companyRes.error) return { error: companyRes.error.message, status: 500 }
  const company = companyRes.data
  if (!company) return { error: 'Empresa del documento no encontrada', status: 500 }

  // Arma dirección fiscal como string legible.
  const fiscalAddress = addrRes.data
    ? [addrRes.data.line1, addrRes.data.line2, [addrRes.data.postal_code, addrRes.data.city, addrRes.data.state].filter(Boolean).join(' '), addrRes.data.country_code]
        .filter(Boolean).join(', ')
    : null

  // Config con fallback a defaults.
  const cfgRow = configRes.data
  const config: RenderConfig = cfgRow
    ? {
        logo_url:             cfgRow.logo_url ?? null,
        header_html:          cfgRow.header_html ?? null,
        footer_html:          cfgRow.footer_html ?? null,
        show_prices:          cfgRow.show_prices ?? true,
        show_images:          cfgRow.show_images ?? false,
        show_attributes:      cfgRow.show_attributes ?? true,
        show_taxes:           cfgRow.show_taxes ?? true,
        show_notes:           cfgRow.show_notes ?? true,
        show_discounts:       cfgRow.show_discounts ?? true,
        show_footer:          cfgRow.show_footer ?? true,
        show_payment_terms:   cfgRow.show_payment_terms ?? true,
        signature_url:        cfgRow.signature_url ?? null,
        signature_required:   cfgRow.signature_required ?? false,
        qr_enabled:           cfgRow.qr_enabled ?? false,
        qr_payload_template:  cfgRow.qr_payload_template ?? null,
        default_header_note:  cfgRow.default_header_note ?? null,
        default_footer_note:  cfgRow.default_footer_note ?? null,
        terms_and_conditions: cfgRow.terms_and_conditions ?? null,
      }
    : DEFAULT_CONFIG

  // Locale: por country del fiscal profile, o default rioplatense.
  const locale = options.locale
    ?? localeFromCountry(fiscalRes.data?.country_code ?? null)
    ?? 'es-AR'

  const docCode = doc.doc_code ?? `draft-${String(doc.id).slice(0, 8)}`

  const ctx: RenderContext = {
    document: {
      id: doc.id,
      doc_type: doc.doc_type as DocType,
      doc_code: doc.doc_code,
      doc_number: doc.doc_number,
      doc_date: doc.doc_date,
      due_date: doc.due_date,
      valid_until: doc.valid_until,
      status: doc.status,
      currency_code: doc.currency_code,
      exchange_rate: Number(doc.exchange_rate ?? 1),
      notes: doc.notes,
      external_ref: doc.external_ref,
      customer_po_number: doc.customer_po_number,
    },
    lines: (linesRes.data ?? []).map((l) => ({
      line_number: l.line_number,
      product_sku: l.product_sku,
      product_name: l.product_name,
      description: l.description,
      quantity: Number(l.quantity),
      unit: l.unit,
      unit_price: Number(l.unit_price),
      discount_pct: Number(l.discount_pct),
      discount_amount: Number(l.discount_amount),
      tax_rate: Number(l.tax_rate),
      tax_amount: Number(l.tax_amount),
      subtotal: Number(l.subtotal),
      total: Number(l.total),
      attributes: l.attributes ?? {},
      image_url: l.image_url,
      notes: l.notes,
    })),
    company: {
      id: company.id,
      name: company.name,
      code_prefix: company.code_prefix ?? null,
      logo_url: company.logo_url ?? null,
      tax_id: fiscalRes.data?.tax_id ?? null,
      tax_id_type: fiscalRes.data?.tax_id_type ?? null,
      fiscal_address: fiscalAddress,
      email_billing: company.email_billing ?? null,
      timezone: company.timezone ?? null,
    },
    config,
    counterparty: {
      type: doc.counterparty_type,
      name: doc.counterparty_name,
      tax_id: doc.counterparty_tax_id,
      email: doc.counterparty_email,
      address: doc.counterparty_address,
    },
    totals: {
      subtotal: Number(doc.subtotal ?? 0),
      discount_total: Number(doc.discount_total ?? 0),
      tax_total: Number(doc.tax_total ?? 0),
      total: Number(doc.total ?? 0),
    },
    meta: {
      renderedAt: new Date(),
      locale,
    },
  }

  return { ctx, docCode }
}

function localeFromCountry(cc: string | null): string | null {
  if (!cc) return null
  switch (cc.toUpperCase()) {
    case 'AR': return 'es-AR'
    case 'UY': return 'es-AR'
    case 'ES': return 'es-ES'
    case 'US': return 'en-US'
    case 'BR': return 'pt-BR'
    case 'MX': return 'es-MX'
    default:   return null
  }
}

// -----------------------------------------------------------------------------
// API pública
// -----------------------------------------------------------------------------
export async function renderDocumentHTML(
  documentId: string,
  options: RenderOptions = {},
): Promise<RenderResult | { error: string; status: number }> {
  const admin = getAdminClient()
  const loaded = await loadContext(admin, documentId, options)
  if ('error' in loaded) return loaded

  const { ctx, docCode } = loaded
  const html = renderA4Document(ctx)
  return {
    html,
    filename: `${sanitizeFilename(docCode)}.pdf`,
    docCode,
    docType: ctx.document.doc_type,
    companyId: ctx.company.id,
    locale: ctx.meta.locale,
  }
}

function sanitizeFilename(s: string): string {
  return s.replace(/[^\w\-.]+/g, '_').replace(/_+/g, '_').replace(/^_|_$/g, '')
}
