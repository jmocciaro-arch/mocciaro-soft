// -----------------------------------------------------------------------------
// Template A4 — funciones puras sin I/O.
// Todas las piezas generan string HTML seguro (escape en valores dinámicos).
// El CSS va inline en el <style> para que el documento sea autocontenido:
// imprimible por el navegador, apto para motores HTML→PDF (puppeteer,
// playwright, wkhtmltopdf) y portable como archivo único.
// -----------------------------------------------------------------------------

import type { DocType } from '@/lib/schemas/documents'
import { DOC_TYPE_SHORT } from '@/lib/schemas/documents'

// -----------------------------------------------------------------------------
// Tipos de contexto — estructura mínima que la plantilla necesita.
// -----------------------------------------------------------------------------
export interface RenderContext {
  document: RenderDocument
  lines: RenderLine[]
  company: RenderCompany
  config: RenderConfig
  counterparty: RenderCounterparty
  totals: RenderTotals
  meta: {
    renderedAt: Date
    locale: string                  // 'es-AR' | 'es-ES' | 'en-US' ...
  }
}

export interface RenderDocument {
  id: string
  doc_type: DocType
  doc_code: string | null
  doc_number: number | null
  doc_date: string                  // ISO date
  due_date: string | null
  valid_until: string | null
  status: string
  currency_code: string
  exchange_rate: number
  notes: string | null
  external_ref: string | null
  customer_po_number: string | null
}

export interface RenderLine {
  line_number: number
  product_sku: string | null
  product_name: string
  description: string | null
  quantity: number
  unit: string
  unit_price: number
  discount_pct: number
  discount_amount: number
  tax_rate: number
  tax_amount: number
  subtotal: number
  total: number
  attributes: Record<string, unknown>
  image_url: string | null
  notes: string | null
}

export interface RenderCompany {
  id: string
  name: string
  code_prefix: string | null
  logo_url: string | null
  tax_id: string | null
  tax_id_type: string | null
  fiscal_address: string | null
  email_billing: string | null
  timezone: string | null
}

export interface RenderConfig {
  logo_url: string | null
  header_html: string | null
  footer_html: string | null
  show_prices: boolean
  show_images: boolean
  show_attributes: boolean
  show_taxes: boolean
  show_notes: boolean
  show_discounts: boolean
  show_footer: boolean
  show_payment_terms: boolean
  signature_url: string | null
  signature_required: boolean
  qr_enabled: boolean
  qr_payload_template: string | null
  default_header_note: string | null
  default_footer_note: string | null
  terms_and_conditions: string | null
}

export interface RenderCounterparty {
  type: string | null
  name: string | null
  tax_id: string | null
  email: string | null
  address: string | null
}

export interface RenderTotals {
  subtotal: number
  discount_total: number
  tax_total: number
  total: number
}

// -----------------------------------------------------------------------------
// Helpers
// -----------------------------------------------------------------------------
export function escapeHtml(input: unknown): string {
  if (input === null || input === undefined) return ''
  const s = String(input)
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

export function fmtMoney(n: number, currency: string, locale = 'es-AR'): string {
  try {
    return new Intl.NumberFormat(locale, {
      style: 'currency',
      currency,
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(n ?? 0)
  } catch {
    return `${(n ?? 0).toFixed(2)} ${currency}`
  }
}

export function fmtDate(iso: string | null, locale = 'es-AR'): string {
  if (!iso) return ''
  try {
    return new Intl.DateTimeFormat(locale, { dateStyle: 'medium' }).format(new Date(iso))
  } catch {
    return iso
  }
}

export function fmtQty(n: number, locale = 'es-AR'): string {
  try {
    return new Intl.NumberFormat(locale, { maximumFractionDigits: 4 }).format(n ?? 0)
  } catch {
    return String(n ?? 0)
  }
}

// Títulos humanos por tipo. No localizado aún — Mocciaro Soft es rioplatense/ES.
const DOC_TYPE_TITLE: Record<DocType, string> = {
  quote:          'Cotización',
  sales_order:    'Orden de venta',
  purchase_order: 'Orden de compra',
  delivery_note:  'Remito',
  invoice:        'Factura',
  proforma:       'Factura proforma',
  receipt:        'Recibo',
  internal:       'Documento interno',
  credit_note:    'Nota de crédito',
  debit_note:     'Nota de débito',
}

export function docTypeTitle(t: DocType): string {
  return DOC_TYPE_TITLE[t] ?? t
}

// -----------------------------------------------------------------------------
// Estilos A4. Márgenes 15mm / 20mm para header/footer respiro.
// Usar sistema de grillas flex/grid. Tipografía system-ui (no bajar fuentes).
// @page size A4 fija el tamaño al imprimir / al convertir por headless.
// -----------------------------------------------------------------------------
export function stylesA4(): string {
  return `
@page { size: A4; margin: 18mm 14mm 20mm 14mm; }

*, *::before, *::after { box-sizing: border-box; }

html, body {
  margin: 0;
  padding: 0;
  color: #1a1a1a;
  font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
  font-size: 10.5pt;
  line-height: 1.35;
  background: #fff;
  -webkit-print-color-adjust: exact;
  print-color-adjust: exact;
}

.page {
  width: 100%;
  max-width: 210mm;
  margin: 0 auto;
  padding: 0;
}

/* HEADER */
.hdr {
  display: grid;
  grid-template-columns: 1fr auto;
  gap: 16px;
  align-items: flex-start;
  padding-bottom: 10px;
  border-bottom: 2px solid #111;
  margin-bottom: 14px;
}
.hdr-left { display: flex; align-items: center; gap: 12px; }
.hdr-logo { max-height: 58px; max-width: 180px; object-fit: contain; }
.hdr-company-name { font-size: 14pt; font-weight: 700; margin: 0 0 2px 0; }
.hdr-company-meta { font-size: 8.5pt; color: #444; line-height: 1.3; }
.hdr-right { text-align: right; }
.hdr-doc-type { font-size: 16pt; font-weight: 700; letter-spacing: .3px; margin: 0; }
.hdr-doc-code { font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-size: 10pt; margin-top: 4px; color: #222; }
.hdr-doc-date { font-size: 9pt; color: #444; margin-top: 2px; }
.hdr-doc-status { display: inline-block; margin-top: 4px; font-size: 8pt; padding: 2px 6px; border-radius: 3px; background: #e9ecef; color: #333; text-transform: uppercase; letter-spacing: .5px; }
.hdr-doc-status.issued, .hdr-doc-status.accepted, .hdr-doc-status.paid, .hdr-doc-status.invoiced, .hdr-doc-status.delivered { background: #0a6d2b; color: #fff; }
.hdr-doc-status.cancelled, .hdr-doc-status.voided, .hdr-doc-status.rejected { background: #8a1c1c; color: #fff; }
.hdr-doc-status.draft { background: #f4b400; color: #fff; }

/* PARTIES */
.parties {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 12px;
  margin-bottom: 14px;
}
.party {
  border: 1px solid #ddd;
  border-radius: 4px;
  padding: 8px 10px;
}
.party-label { font-size: 7.5pt; text-transform: uppercase; color: #777; letter-spacing: .6px; margin-bottom: 3px; }
.party-name { font-weight: 600; font-size: 10pt; margin-bottom: 2px; }
.party-line { font-size: 9pt; color: #333; }

/* META ROW */
.meta-row {
  display: flex;
  flex-wrap: wrap;
  gap: 12px 18px;
  padding: 6px 0;
  border-top: 1px solid #eee;
  border-bottom: 1px solid #eee;
  margin-bottom: 12px;
  font-size: 9pt;
}
.meta-cell { display: flex; flex-direction: column; min-width: 110px; }
.meta-key { color: #777; font-size: 7.5pt; text-transform: uppercase; letter-spacing: .5px; }
.meta-val { color: #111; font-weight: 500; }

/* HEADER NOTE */
.header-note {
  font-size: 9.5pt;
  color: #333;
  padding: 8px 10px;
  background: #f8f8f6;
  border-left: 3px solid #999;
  margin-bottom: 12px;
  white-space: pre-wrap;
}

/* TABLA DE LÍNEAS */
table.lines { width: 100%; border-collapse: collapse; margin-bottom: 14px; }
table.lines thead th {
  background: #111; color: #fff;
  font-size: 8.5pt; text-transform: uppercase; letter-spacing: .4px;
  padding: 6px 6px; text-align: left; font-weight: 600;
}
table.lines thead th.num, table.lines thead th.qty, table.lines thead th.money { text-align: right; }
table.lines tbody td {
  padding: 6px 6px;
  border-bottom: 1px solid #e4e4e4;
  vertical-align: top;
  font-size: 9.5pt;
}
table.lines tbody td.num { text-align: right; font-variant-numeric: tabular-nums; }
table.lines tbody td.money { text-align: right; font-variant-numeric: tabular-nums; white-space: nowrap; }
table.lines tbody tr:nth-child(even) td { background: #fafafa; }
table.lines .line-n { width: 24px; }
table.lines .line-name { font-weight: 600; }
table.lines .line-desc { color: #555; font-size: 9pt; margin-top: 2px; white-space: pre-wrap; }
table.lines .line-sku { color: #777; font-size: 8pt; margin-top: 1px; }
table.lines .line-attrs { font-size: 8pt; color: #555; margin-top: 3px; }
table.lines .line-attrs span { margin-right: 8px; }
table.lines .line-img { display: block; max-width: 70px; max-height: 50px; margin-top: 4px; border: 1px solid #ddd; }

/* TOTALES */
.totals {
  display: flex;
  justify-content: flex-end;
  margin-bottom: 14px;
}
.totals table { border-collapse: collapse; min-width: 260px; }
.totals td { padding: 4px 8px; font-size: 10pt; }
.totals td.lbl { text-align: left; color: #444; }
.totals td.val { text-align: right; font-variant-numeric: tabular-nums; white-space: nowrap; }
.totals tr.total-row td { border-top: 2px solid #111; font-weight: 700; font-size: 11pt; padding-top: 6px; }

/* NOTAS / TÉRMINOS */
.notes-block { margin-bottom: 10px; }
.notes-block h4 { font-size: 9pt; text-transform: uppercase; letter-spacing: .4px; color: #666; margin: 0 0 3px 0; }
.notes-block p, .notes-block div.body {
  font-size: 9pt;
  color: #333;
  margin: 0;
  white-space: pre-wrap;
}

/* FIRMA / QR */
.sign-row {
  display: grid;
  grid-template-columns: 1fr auto;
  gap: 16px;
  align-items: flex-end;
  margin-top: 14px;
}
.sign-box { border-top: 1px solid #333; padding-top: 4px; font-size: 8pt; color: #666; width: 220px; min-height: 48px; }
.sign-box img { max-height: 46px; max-width: 200px; display: block; margin-bottom: 4px; }
.qr-box { text-align: center; font-size: 8pt; color: #666; }
.qr-box img { max-width: 80px; max-height: 80px; display: block; }

/* FOOTER */
.ftr {
  margin-top: 22px;
  padding-top: 8px;
  border-top: 1px solid #ccc;
  font-size: 8pt;
  color: #666;
  text-align: center;
  white-space: pre-wrap;
}

/* PAGINACIÓN */
table.lines { page-break-inside: auto; }
table.lines tr { page-break-inside: avoid; page-break-after: auto; }
table.lines thead { display: table-header-group; }
table.lines tfoot { display: table-footer-group; }
  `.trim()
}

// -----------------------------------------------------------------------------
// Piezas de layout
// -----------------------------------------------------------------------------
export function renderHeader(ctx: RenderContext): string {
  const { document, company, config, meta } = ctx
  const logo = config.logo_url || company.logo_url
  const title = docTypeTitle(document.doc_type)
  const code = document.doc_code ?? `(borrador ${DOC_TYPE_SHORT[document.doc_type]})`
  const companyLines: string[] = []
  if (company.tax_id) companyLines.push(`${escapeHtml(company.tax_id_type || 'CIF')}: ${escapeHtml(company.tax_id)}`)
  if (company.fiscal_address) companyLines.push(escapeHtml(company.fiscal_address))
  if (company.email_billing) companyLines.push(escapeHtml(company.email_billing))

  return `
<header class="hdr">
  <div class="hdr-left">
    ${logo ? `<img class="hdr-logo" src="${escapeHtml(logo)}" alt="${escapeHtml(company.name)}"/>` : ''}
    <div>
      <h1 class="hdr-company-name">${escapeHtml(company.name)}</h1>
      <div class="hdr-company-meta">${companyLines.join('<br/>')}</div>
    </div>
  </div>
  <div class="hdr-right">
    <h2 class="hdr-doc-type">${escapeHtml(title)}</h2>
    <div class="hdr-doc-code">${escapeHtml(code)}</div>
    <div class="hdr-doc-date">Fecha: ${escapeHtml(fmtDate(document.doc_date, meta.locale))}</div>
    <span class="hdr-doc-status ${escapeHtml(document.status)}">${escapeHtml(document.status)}</span>
  </div>
</header>
  `.trim()
}

export function renderParties(ctx: RenderContext): string {
  const { counterparty } = ctx
  const cpLabel =
    counterparty.type === 'customer' ? 'Cliente' :
    counterparty.type === 'supplier' ? 'Proveedor' :
    counterparty.type === 'internal' ? 'Interno' : 'Contraparte'

  const lines: string[] = []
  if (counterparty.tax_id) lines.push(`NIF/CUIT: ${escapeHtml(counterparty.tax_id)}`)
  if (counterparty.address) lines.push(escapeHtml(counterparty.address))
  if (counterparty.email) lines.push(escapeHtml(counterparty.email))

  return `
<section class="parties">
  <div class="party">
    <div class="party-label">${escapeHtml(cpLabel)}</div>
    <div class="party-name">${escapeHtml(counterparty.name || '—')}</div>
    ${lines.map((l) => `<div class="party-line">${l}</div>`).join('')}
  </div>
  <div class="party">
    <div class="party-label">Datos del documento</div>
    ${renderDocMetaInline(ctx)}
  </div>
</section>
  `.trim()
}

function renderDocMetaInline(ctx: RenderContext): string {
  const { document, meta } = ctx
  const rows: Array<[string, string]> = []
  if (document.due_date)   rows.push(['Vencimiento', fmtDate(document.due_date, meta.locale)])
  if (document.valid_until) rows.push(['Válido hasta', fmtDate(document.valid_until, meta.locale)])
  rows.push(['Moneda', document.currency_code])
  if (Number(document.exchange_rate) && Number(document.exchange_rate) !== 1) {
    rows.push(['Tipo de cambio', String(document.exchange_rate)])
  }
  if (document.external_ref)       rows.push(['Ref. externa', document.external_ref])
  if (document.customer_po_number) rows.push(['PO cliente', document.customer_po_number])
  return rows
    .map(([k, v]) => `<div class="party-line"><span style="color:#777">${escapeHtml(k)}:</span> ${escapeHtml(v)}</div>`)
    .join('')
}

export function renderHeaderNote(ctx: RenderContext): string {
  const note = ctx.config.default_header_note
  if (!note) return ''
  return `<div class="header-note">${escapeHtml(note)}</div>`
}

// -----------------------------------------------------------------------------
// Tabla de líneas
// -----------------------------------------------------------------------------
export function renderLines(ctx: RenderContext): string {
  const { lines, config, document, meta } = ctx

  const columns: Array<{ key: string; label: string; className?: string }> = [
    { key: 'n',     label: '#', className: 'num line-n' },
    { key: 'item',  label: 'Concepto' },
    { key: 'qty',   label: 'Cant.', className: 'qty' },
  ]
  if (config.show_prices) {
    columns.push({ key: 'price', label: 'P. unit.', className: 'money' })
    if (config.show_discounts) columns.push({ key: 'disc', label: 'Desc.', className: 'money' })
    if (config.show_taxes)     columns.push({ key: 'tax',  label: 'Imp.',  className: 'money' })
    columns.push({ key: 'tot', label: 'Total', className: 'money' })
  }

  const head = `<tr>${columns.map((c) => `<th class="${escapeHtml(c.className ?? '')}">${escapeHtml(c.label)}</th>`).join('')}</tr>`

  const rows = lines.map((l) => {
    const cells: Record<string, string> = {}

    cells.n = `<td class="num line-n">${l.line_number}</td>`

    let item = `<div class="line-name">${escapeHtml(l.product_name)}</div>`
    if (l.product_sku) item += `<div class="line-sku">SKU: ${escapeHtml(l.product_sku)}</div>`
    if (l.description) item += `<div class="line-desc">${escapeHtml(l.description)}</div>`

    if (config.show_attributes && l.attributes && Object.keys(l.attributes).length > 0) {
      const attrs = Object.entries(l.attributes)
        .map(([k, v]) => `<span><strong>${escapeHtml(k)}:</strong> ${escapeHtml(formatAttrValue(v))}</span>`)
        .join(' ')
      item += `<div class="line-attrs">${attrs}</div>`
    }
    if (config.show_images && l.image_url) {
      item += `<img class="line-img" src="${escapeHtml(l.image_url)}" alt=""/>`
    }
    if (config.show_notes && l.notes) {
      item += `<div class="line-desc"><em>${escapeHtml(l.notes)}</em></div>`
    }
    cells.item = `<td>${item}</td>`

    cells.qty = `<td class="num">${fmtQty(l.quantity, meta.locale)} ${escapeHtml(l.unit)}</td>`

    if (config.show_prices) {
      cells.price = `<td class="money">${fmtMoney(l.unit_price, document.currency_code, meta.locale)}</td>`
      if (config.show_discounts) {
        const discLabel = l.discount_pct > 0
          ? `${fmtQty(l.discount_pct, meta.locale)}% · ${fmtMoney(l.discount_amount, document.currency_code, meta.locale)}`
          : fmtMoney(l.discount_amount, document.currency_code, meta.locale)
        cells.disc = `<td class="money">${escapeHtml(discLabel)}</td>`
      }
      if (config.show_taxes) {
        const taxLabel = l.tax_rate > 0
          ? `${fmtQty(l.tax_rate, meta.locale)}% · ${fmtMoney(l.tax_amount, document.currency_code, meta.locale)}`
          : fmtMoney(l.tax_amount, document.currency_code, meta.locale)
        cells.tax = `<td class="money">${escapeHtml(taxLabel)}</td>`
      }
      cells.tot = `<td class="money">${fmtMoney(l.total, document.currency_code, meta.locale)}</td>`
    }

    return `<tr>${columns.map((c) => cells[c.key] ?? '<td></td>').join('')}</tr>`
  }).join('')

  return `
<table class="lines">
  <thead>${head}</thead>
  <tbody>${rows || '<tr><td colspan="' + columns.length + '" style="text-align:center;color:#999;padding:12px 0;">Sin líneas</td></tr>'}</tbody>
</table>
  `.trim()
}

function formatAttrValue(v: unknown): string {
  if (v === null || v === undefined) return ''
  if (typeof v === 'object') {
    try { return JSON.stringify(v) } catch { return String(v) }
  }
  return String(v)
}

// -----------------------------------------------------------------------------
// Totales
// -----------------------------------------------------------------------------
export function renderTotals(ctx: RenderContext): string {
  const { totals, document, config, meta } = ctx
  if (!config.show_prices) return ''

  const cur = document.currency_code
  const rows: string[] = []
  rows.push(`<tr><td class="lbl">Subtotal</td><td class="val">${fmtMoney(totals.subtotal, cur, meta.locale)}</td></tr>`)
  if (config.show_discounts && totals.discount_total > 0) {
    rows.push(`<tr><td class="lbl">Descuentos</td><td class="val">− ${fmtMoney(totals.discount_total, cur, meta.locale)}</td></tr>`)
  }
  if (config.show_taxes) {
    rows.push(`<tr><td class="lbl">Impuestos</td><td class="val">${fmtMoney(totals.tax_total, cur, meta.locale)}</td></tr>`)
  }
  rows.push(`<tr class="total-row"><td class="lbl">Total</td><td class="val">${fmtMoney(totals.total, cur, meta.locale)}</td></tr>`)

  return `<section class="totals"><table>${rows.join('')}</table></section>`
}

// -----------------------------------------------------------------------------
// Notas, términos, firma, QR
// -----------------------------------------------------------------------------
export function renderNotesAndTerms(ctx: RenderContext): string {
  const { document, config } = ctx
  const blocks: string[] = []
  if (config.show_notes && document.notes) {
    blocks.push(`
<div class="notes-block">
  <h4>Notas</h4>
  <div class="body">${escapeHtml(document.notes)}</div>
</div>`.trim())
  }
  if (config.show_payment_terms && config.terms_and_conditions) {
    blocks.push(`
<div class="notes-block">
  <h4>Términos y condiciones</h4>
  <div class="body">${escapeHtml(config.terms_and_conditions)}</div>
</div>`.trim())
  }
  return blocks.join('\n')
}

export function renderSignatureAndQR(ctx: RenderContext): string {
  const { config, document, company, totals } = ctx
  const showSign = config.signature_required || !!config.signature_url
  const showQR = config.qr_enabled
  if (!showSign && !showQR) return ''

  const signHTML = showSign ? `
<div class="sign-box">
  ${config.signature_url ? `<img src="${escapeHtml(config.signature_url)}" alt="Firma"/>` : ''}
  Firma autorizada
</div>` : '<div></div>'

  let qrHTML = ''
  if (showQR) {
    const payload = renderQRPayload(config.qr_payload_template, { document, company, totals })
    // QR via servicio público sin dependencias. Para producción usar generador local.
    const url = `https://api.qrserver.com/v1/create-qr-code/?size=160x160&data=${encodeURIComponent(payload)}`
    qrHTML = `
<div class="qr-box">
  <img src="${escapeHtml(url)}" alt="QR"/>
  <div style="margin-top:3px;">Verificación</div>
</div>`.trim()
  } else {
    qrHTML = '<div></div>'
  }

  return `<section class="sign-row">${signHTML}${qrHTML}</section>`
}

function renderQRPayload(
  template: string | null,
  ctx: { document: RenderDocument; company: RenderCompany; totals: RenderTotals },
): string {
  const tpl = template || '{doc_code}|{company_tax_id}|{total}|{currency}'
  return tpl
    .replace(/\{doc_code\}/g, ctx.document.doc_code ?? '')
    .replace(/\{company_tax_id\}/g, ctx.company.tax_id ?? '')
    .replace(/\{total\}/g, String(ctx.totals.total))
    .replace(/\{currency\}/g, ctx.document.currency_code)
    .replace(/\{doc_number\}/g, String(ctx.document.doc_number ?? ''))
    .replace(/\{doc_date\}/g, ctx.document.doc_date)
}

// -----------------------------------------------------------------------------
// Footer
// -----------------------------------------------------------------------------
export function renderFooter(ctx: RenderContext): string {
  const { config } = ctx
  if (!config.show_footer) return ''
  const parts: string[] = []
  if (config.default_footer_note) parts.push(escapeHtml(config.default_footer_note))
  if (config.footer_html) parts.push(config.footer_html)   // HTML libre del config, no se escapa
  if (parts.length === 0) return ''
  return `<footer class="ftr">${parts.join('<br/>')}</footer>`
}

// -----------------------------------------------------------------------------
// Documento completo
// -----------------------------------------------------------------------------
export function renderA4Document(ctx: RenderContext): string {
  const parts: string[] = []
  parts.push(renderHeader(ctx))
  parts.push(renderParties(ctx))
  parts.push(renderHeaderNote(ctx))
  if (ctx.config.header_html) parts.push(ctx.config.header_html) // HTML libre, no se escapa
  parts.push(renderLines(ctx))
  parts.push(renderTotals(ctx))
  parts.push(renderNotesAndTerms(ctx))
  parts.push(renderSignatureAndQR(ctx))
  parts.push(renderFooter(ctx))

  const title = `${docTypeTitle(ctx.document.doc_type)} ${ctx.document.doc_code ?? ''}`.trim()

  return `<!DOCTYPE html>
<html lang="es">
<head>
<meta charset="utf-8"/>
<meta name="viewport" content="width=device-width,initial-scale=1"/>
<title>${escapeHtml(title)}</title>
<style>${stylesA4()}</style>
</head>
<body>
<main class="page">
${parts.filter(Boolean).join('\n')}
</main>
</body>
</html>`
}
