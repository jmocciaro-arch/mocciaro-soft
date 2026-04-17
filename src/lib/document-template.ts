/**
 * Document HTML Template Generator
 * Genera representaciones HTML profesionales de documentos para envio, impresion y preview.
 */

import { formatCurrency, formatDate } from '@/lib/utils'

interface CompanyInfo {
  name: string
  legal_name?: string
  tax_id?: string
  address?: string
  city?: string
  state?: string
  country?: string
  phone?: string
  email?: string
  website?: string
  logo_url?: string
  bank_details?: string
}

interface ClientInfo {
  name: string
  legal_name?: string | null
  tax_id?: string | null
  email?: string | null
  phone?: string | null
  address?: string | null
  city?: string | null
  country?: string | null
}

interface DocumentItem {
  sku: string
  description: string
  quantity: number
  unit_price: number
  discount_pct: number
  subtotal: number
  notes?: string
  is_section?: boolean
  section_label?: string
  photo_url?: string
}

interface DocumentInfo {
  type: string
  display_ref: string
  system_code: string
  status: string
  currency: string
  subtotal: number
  tax_amount: number
  tax_rate: number
  total: number
  notes?: string
  created_at: string
  valid_until?: string
  delivery_date?: string
  incoterm?: string
  payment_terms?: string
  shipping_address?: string
}

type FormatMode = 'full' | 'email' | 'print'
type Language = 'es' | 'en' | 'pt'

const TYPE_LABELS: Record<string, Record<Language, string>> = {
  coti: { es: 'Cotizacion', en: 'Quotation', pt: 'Cotacao' },
  cotizacion: { es: 'Cotizacion', en: 'Quotation', pt: 'Cotacao' },
  presupuesto: { es: 'Presupuesto', en: 'Budget / Estimate', pt: 'Orcamento' },
  proforma: { es: 'Factura Proforma', en: 'Proforma Invoice', pt: 'Fatura Proforma' },
  packing_list: { es: 'Packing List', en: 'Packing List', pt: 'Lista de Embalaje' },
  oferta: { es: 'Oferta Comercial', en: 'Commercial Offer', pt: 'Oferta Comercial' },
  pedido: { es: 'Pedido de Venta', en: 'Sales Order', pt: 'Pedido de Venda' },
  delivery_note: { es: 'Albaran / Remito', en: 'Delivery Note', pt: 'Nota de Entrega' },
  factura: { es: 'Factura', en: 'Invoice', pt: 'Fatura' },
  pap: { es: 'Pedido a Proveedor', en: 'Purchase Order', pt: 'Pedido de Compra' },
  recepcion: { es: 'Recepcion', en: 'Goods Receipt', pt: 'Recepcao' },
  factura_compra: { es: 'Factura de Compra', en: 'Purchase Invoice', pt: 'Fatura de Compra' },
}

const LABELS: Record<string, Record<Language, string>> = {
  date: { es: 'Fecha', en: 'Date', pt: 'Data' },
  valid_until: { es: 'Valido hasta', en: 'Valid until', pt: 'Valido ate' },
  delivery_date: { es: 'Fecha de entrega', en: 'Delivery date', pt: 'Data de entrega' },
  client: { es: 'Cliente', en: 'Client', pt: 'Cliente' },
  tax_id: { es: 'CIF/NIF', en: 'Tax ID', pt: 'CNPJ/CPF' },
  sku: { es: 'Ref.', en: 'SKU', pt: 'Ref.' },
  description: { es: 'Descripcion', en: 'Description', pt: 'Descricao' },
  qty: { es: 'Cant.', en: 'Qty', pt: 'Qtd.' },
  unit_price: { es: 'Precio unit.', en: 'Unit price', pt: 'Preco unit.' },
  discount: { es: 'Dto.', en: 'Disc.', pt: 'Desc.' },
  line_total: { es: 'Total linea', en: 'Line total', pt: 'Total linha' },
  subtotal: { es: 'Subtotal', en: 'Subtotal', pt: 'Subtotal' },
  tax: { es: 'IVA', en: 'Tax', pt: 'IVA' },
  total: { es: 'TOTAL', en: 'TOTAL', pt: 'TOTAL' },
  incoterm: { es: 'Incoterm', en: 'Incoterm', pt: 'Incoterm' },
  payment_terms: { es: 'Condiciones de pago', en: 'Payment terms', pt: 'Condicoes de pagamento' },
  shipping: { es: 'Direccion de envio', en: 'Shipping address', pt: 'Endereco de envio' },
  notes: { es: 'Notas', en: 'Notes', pt: 'Notas' },
  bank: { es: 'Datos bancarios', en: 'Bank details', pt: 'Dados bancarios' },
  terms: { es: 'Terminos y condiciones', en: 'Terms and conditions', pt: 'Termos e condicoes' },
  page: { es: 'Pagina', en: 'Page', pt: 'Pagina' },
  generated: { es: 'Generado con', en: 'Generated with', pt: 'Gerado com' },
}

function l(key: string, lang: Language): string {
  return LABELS[key]?.[lang] || LABELS[key]?.es || key
}

function getTypeLabel(type: string, lang: Language): string {
  return TYPE_LABELS[type]?.[lang] || TYPE_LABELS[type]?.es || type
}

export function generateDocumentHTML(
  doc: DocumentInfo,
  items: DocumentItem[],
  company: CompanyInfo,
  client: ClientInfo,
  options: { format: FormatMode; language?: Language }
): string {
  const lang = options.language || 'es'
  const fmt = options.format
  const cur = (doc.currency || 'EUR') as 'EUR' | 'ARS' | 'USD'
  const typeLabel = getTypeLabel(doc.type, lang)
  const isEmail = fmt === 'email'

  // Group items by section
  const sections: Array<{ label: string; items: DocumentItem[] }> = []
  let currentSection: { label: string; items: DocumentItem[] } = { label: '', items: [] }

  for (const item of items) {
    if (item.is_section) {
      if (currentSection.items.length > 0 || currentSection.label) {
        sections.push(currentSection)
      }
      currentSection = { label: item.section_label || item.description, items: [] }
    } else {
      currentSection.items.push(item)
    }
  }
  if (currentSection.items.length > 0 || sections.length === 0) {
    sections.push(currentSection)
  }

  const css = `
    <style>
      * { margin: 0; padding: 0; box-sizing: border-box; }
      body, html { font-family: 'Segoe UI', -apple-system, BlinkMacSystemFont, sans-serif; color: #1a1a1a; background: #fff; font-size: 13px; line-height: 1.5; }
      .doc-container { max-width: 800px; margin: 0 auto; padding: ${isEmail ? '20px' : '40px'}; background: #fff; }
      .doc-header { display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 30px; padding-bottom: 20px; border-bottom: 3px solid #FF6600; }
      .company-block { flex: 1; }
      .company-name { font-size: 22px; font-weight: 700; color: #1a1a1a; margin-bottom: 4px; }
      .company-detail { font-size: 11px; color: #666; line-height: 1.6; }
      .company-logo { max-height: 60px; max-width: 180px; object-fit: contain; }
      .doc-type-block { text-align: right; }
      .doc-type-label { font-size: 24px; font-weight: 700; color: #FF6600; text-transform: uppercase; letter-spacing: 1px; }
      .doc-number { font-size: 16px; font-weight: 600; color: #333; margin-top: 4px; }
      .doc-date { font-size: 12px; color: #666; margin-top: 2px; }
      .meta-row { display: flex; gap: 30px; margin-bottom: 24px; }
      .meta-card { flex: 1; background: #f8f9fa; border: 1px solid #e9ecef; border-radius: 6px; padding: 14px; }
      .meta-card-title { font-size: 10px; font-weight: 700; text-transform: uppercase; letter-spacing: 1px; color: #FF6600; margin-bottom: 8px; }
      .meta-card-name { font-size: 14px; font-weight: 600; color: #1a1a1a; }
      .meta-card-detail { font-size: 11px; color: #666; margin-top: 2px; }
      .section-header { background: #f0f0f0; padding: 8px 12px; font-weight: 700; font-size: 13px; color: #333; margin-top: 16px; border-left: 4px solid #FF6600; }
      .items-table { width: 100%; border-collapse: collapse; margin-bottom: 24px; }
      .items-table thead th { background: #1a1a1a; color: #fff; padding: 10px 12px; font-size: 11px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.5px; text-align: left; }
      .items-table thead th:last-child, .items-table thead th.num { text-align: right; }
      .items-table tbody td { padding: 10px 12px; border-bottom: 1px solid #eee; font-size: 12px; vertical-align: top; }
      .items-table tbody td.num { text-align: right; font-variant-numeric: tabular-nums; }
      .items-table tbody tr:hover { background: #fafafa; }
      .item-sku { font-weight: 600; color: #333; white-space: nowrap; }
      .item-desc { color: #1a1a1a; }
      .item-notes { font-size: 10px; color: #888; margin-top: 3px; font-style: italic; }
      .item-photo { max-width: 60px; max-height: 40px; border-radius: 3px; margin-top: 4px; }
      .section-subtotal { background: #f8f9fa; font-weight: 600; }
      .section-subtotal td { border-top: 2px solid #ddd; padding: 8px 12px; }
      .totals-block { display: flex; justify-content: flex-end; margin-bottom: 30px; }
      .totals-table { width: 280px; }
      .totals-table tr td { padding: 6px 12px; font-size: 13px; }
      .totals-table tr td:first-child { color: #666; }
      .totals-table tr td:last-child { text-align: right; font-weight: 500; font-variant-numeric: tabular-nums; }
      .totals-table .grand-total td { font-size: 18px; font-weight: 700; color: #FF6600; border-top: 3px solid #FF6600; padding-top: 10px; }
      .info-section { margin-bottom: 20px; padding: 14px; background: #f8f9fa; border-radius: 6px; border: 1px solid #e9ecef; }
      .info-section-title { font-size: 10px; font-weight: 700; text-transform: uppercase; letter-spacing: 1px; color: #FF6600; margin-bottom: 6px; }
      .info-section-text { font-size: 12px; color: #333; white-space: pre-wrap; }
      .doc-footer { margin-top: 40px; padding-top: 20px; border-top: 1px solid #ddd; }
      .bank-details { background: #fafafa; padding: 14px; border-radius: 6px; margin-bottom: 16px; border: 1px solid #e9ecef; }
      .bank-details-title { font-size: 10px; font-weight: 700; text-transform: uppercase; letter-spacing: 1px; color: #FF6600; margin-bottom: 6px; }
      .bank-details-text { font-size: 11px; color: #333; white-space: pre-wrap; }
      .terms-text { font-size: 10px; color: #888; line-height: 1.6; }
      .watermark { text-align: center; margin-top: 30px; font-size: 9px; color: #ccc; letter-spacing: 1px; }
      .detail-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; }
      .detail-item { display: flex; gap: 6px; font-size: 11px; }
      .detail-label { color: #888; min-width: 100px; }
      .detail-value { color: #333; font-weight: 500; }
      @media print {
        .doc-container { padding: 20px; }
        .items-table thead th { background: #1a1a1a !important; color: #fff !important; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
        .section-header { background: #f0f0f0 !important; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
      }
    </style>
  `

  // Company header
  const companyHeader = `
    <div class="doc-header">
      <div class="company-block">
        ${company.logo_url
          ? `<img src="${company.logo_url}" alt="${company.name}" class="company-logo" />`
          : `<div class="company-name">${company.name}</div>`
        }
        ${company.logo_url ? `<div class="company-name" style="margin-top:6px;font-size:14px;">${company.name}</div>` : ''}
        <div class="company-detail">
          ${company.address ? `${company.address}<br/>` : ''}
          ${company.city ? `${company.city}${company.state ? `, ${company.state}` : ''}${company.country ? ` - ${company.country}` : ''}<br/>` : ''}
          ${company.tax_id ? `CIF/NIF: ${company.tax_id}<br/>` : ''}
          ${company.phone ? `Tel: ${company.phone}<br/>` : ''}
          ${company.email ? `${company.email}` : ''}
          ${company.website ? ` | ${company.website}` : ''}
        </div>
      </div>
      <div class="doc-type-block">
        <div class="doc-type-label">${typeLabel}</div>
        <div class="doc-number">${doc.display_ref || doc.system_code}</div>
        <div class="doc-date">${l('date', lang)}: ${formatDate(doc.created_at)}</div>
        ${doc.valid_until ? `<div class="doc-date">${l('valid_until', lang)}: ${formatDate(doc.valid_until)}</div>` : ''}
      </div>
    </div>
  `

  // Client + details
  const clientSection = `
    <div class="meta-row">
      <div class="meta-card">
        <div class="meta-card-title">${l('client', lang)}</div>
        <div class="meta-card-name">${client.name}</div>
        ${client.legal_name && client.legal_name !== client.name ? `<div class="meta-card-detail">${client.legal_name}</div>` : ''}
        ${client.tax_id ? `<div class="meta-card-detail">${l('tax_id', lang)}: ${client.tax_id}</div>` : ''}
        ${client.email ? `<div class="meta-card-detail">${client.email}</div>` : ''}
        ${client.phone ? `<div class="meta-card-detail">${client.phone}</div>` : ''}
        ${client.address ? `<div class="meta-card-detail">${client.address}${client.city ? `, ${client.city}` : ''}</div>` : ''}
      </div>
      <div class="meta-card">
        <div class="meta-card-title">Detalles</div>
        <div class="detail-grid">
          ${doc.incoterm ? `<div class="detail-item"><span class="detail-label">${l('incoterm', lang)}:</span><span class="detail-value">${doc.incoterm}</span></div>` : ''}
          ${doc.payment_terms ? `<div class="detail-item"><span class="detail-label">${l('payment_terms', lang)}:</span><span class="detail-value">${doc.payment_terms}</span></div>` : ''}
          ${doc.delivery_date ? `<div class="detail-item"><span class="detail-label">${l('delivery_date', lang)}:</span><span class="detail-value">${formatDate(doc.delivery_date)}</span></div>` : ''}
          ${doc.shipping_address ? `<div class="detail-item"><span class="detail-label">${l('shipping', lang)}:</span><span class="detail-value">${doc.shipping_address}</span></div>` : ''}
        </div>
      </div>
    </div>
  `

  // Items table
  let itemsHTML = ''
  for (const section of sections) {
    if (section.label) {
      itemsHTML += `<tr><td colspan="6" style="padding:0;"><div class="section-header">${section.label}</div></td></tr>`
    }

    let sectionTotal = 0
    for (const item of section.items) {
      sectionTotal += item.subtotal
      itemsHTML += `
        <tr>
          <td><span class="item-sku">${item.sku}</span></td>
          <td>
            <div class="item-desc">${item.description}</div>
            ${item.notes ? `<div class="item-notes">${item.notes}</div>` : ''}
            ${item.photo_url ? `<img src="${item.photo_url}" class="item-photo" />` : ''}
          </td>
          <td class="num">${item.quantity}</td>
          <td class="num">${formatCurrency(item.unit_price, cur)}</td>
          <td class="num">${item.discount_pct > 0 ? `${item.discount_pct}%` : '-'}</td>
          <td class="num">${formatCurrency(item.subtotal, cur)}</td>
        </tr>
      `
    }

    // Section subtotal if multiple sections
    if (sections.length > 1 && section.items.length > 0) {
      itemsHTML += `
        <tr class="section-subtotal">
          <td colspan="5" style="text-align:right;color:#666;">Subtotal ${section.label}:</td>
          <td class="num">${formatCurrency(sectionTotal, cur)}</td>
        </tr>
      `
    }
  }

  const tableHTML = `
    <table class="items-table">
      <thead>
        <tr>
          <th style="width:100px;">${l('sku', lang)}</th>
          <th>${l('description', lang)}</th>
          <th class="num" style="width:60px;">${l('qty', lang)}</th>
          <th class="num" style="width:100px;">${l('unit_price', lang)}</th>
          <th class="num" style="width:60px;">${l('discount', lang)}</th>
          <th class="num" style="width:110px;">${l('line_total', lang)}</th>
        </tr>
      </thead>
      <tbody>
        ${itemsHTML}
      </tbody>
    </table>
  `

  // Totals
  const totalsHTML = `
    <div class="totals-block">
      <table class="totals-table">
        <tr>
          <td>${l('subtotal', lang)}</td>
          <td>${formatCurrency(doc.subtotal, cur)}</td>
        </tr>
        ${doc.tax_amount > 0 ? `
        <tr>
          <td>${l('tax', lang)} (${doc.tax_rate}%)</td>
          <td>${formatCurrency(doc.tax_amount, cur)}</td>
        </tr>
        ` : ''}
        <tr class="grand-total">
          <td>${l('total', lang)}</td>
          <td>${formatCurrency(doc.total, cur)}</td>
        </tr>
      </table>
    </div>
  `

  // Notes
  const notesHTML = doc.notes ? `
    <div class="info-section">
      <div class="info-section-title">${l('notes', lang)}</div>
      <div class="info-section-text">${doc.notes}</div>
    </div>
  ` : ''

  // Footer
  const footerHTML = `
    <div class="doc-footer">
      ${company.bank_details ? `
      <div class="bank-details">
        <div class="bank-details-title">${l('bank', lang)}</div>
        <div class="bank-details-text">${company.bank_details}</div>
      </div>
      ` : ''}
      <div class="terms-text">
        ${lang === 'es'
          ? 'Los precios indicados no incluyen IVA salvo que se indique expresamente. La validez de esta oferta es de 30 dias salvo indicacion contraria. Los plazos de entrega son orientativos y pueden variar segun disponibilidad de stock.'
          : lang === 'en'
          ? 'Prices shown do not include tax unless expressly stated. This offer is valid for 30 days unless otherwise indicated. Delivery times are approximate and may vary depending on stock availability.'
          : 'Os precos indicados nao incluem IVA salvo indicacao expressa. A validade desta oferta e de 30 dias salvo indicacao contraria.'
        }
      </div>
    </div>
    <div class="watermark">${l('generated', lang)} Mocciaro Soft ERP</div>
  `

  // Full HTML document
  if (fmt === 'email') {
    // For email: inline all styles (simplified version)
    return `
      <div style="max-width:800px;margin:0 auto;padding:20px;background:#fff;font-family:'Segoe UI',-apple-system,BlinkMacSystemFont,sans-serif;color:#1a1a1a;font-size:13px;line-height:1.5;">
        ${companyHeader}
        ${clientSection}
        ${tableHTML}
        ${totalsHTML}
        ${notesHTML}
        ${footerHTML}
      </div>
    `
  }

  return `<!DOCTYPE html>
<html lang="${lang}">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${typeLabel} ${doc.display_ref || doc.system_code}</title>
  ${css}
</head>
<body>
  <div class="doc-container">
    ${companyHeader}
    ${clientSection}
    ${tableHTML}
    ${totalsHTML}
    ${notesHTML}
    ${footerHTML}
  </div>
</body>
</html>`
}

/**
 * Genera texto plano formateado del documento
 */
export function generateDocumentText(
  doc: DocumentInfo,
  items: DocumentItem[],
  company: CompanyInfo,
  client: ClientInfo,
  lang: Language = 'es'
): string {
  const cur = (doc.currency || 'EUR') as 'EUR' | 'ARS' | 'USD'
  const typeLabel = getTypeLabel(doc.type, lang)
  const sep = '='.repeat(60)
  const sep2 = '-'.repeat(60)

  let text = ''
  text += `${company.name}\n`
  if (company.address) text += `${company.address}\n`
  if (company.phone) text += `Tel: ${company.phone}\n`
  if (company.email) text += `${company.email}\n`
  text += `\n${sep}\n`
  text += `${typeLabel}  ${doc.display_ref || doc.system_code}\n`
  text += `${l('date', lang)}: ${formatDate(doc.created_at)}\n`
  text += `${sep}\n\n`

  text += `${l('client', lang)}: ${client.name}\n`
  if (client.tax_id) text += `${l('tax_id', lang)}: ${client.tax_id}\n`
  if (client.email) text += `Email: ${client.email}\n`
  text += `\n${sep2}\n`

  if (doc.incoterm) text += `${l('incoterm', lang)}: ${doc.incoterm}\n`
  if (doc.payment_terms) text += `${l('payment_terms', lang)}: ${doc.payment_terms}\n`
  if (doc.delivery_date) text += `${l('delivery_date', lang)}: ${formatDate(doc.delivery_date)}\n`
  text += `${sep2}\n\n`

  // Items
  text += `${'Ref.'.padEnd(15)} ${'Descripcion'.padEnd(30)} ${'Cant.'.padStart(6)} ${'Precio'.padStart(12)} ${'Total'.padStart(12)}\n`
  text += `${'-'.repeat(77)}\n`

  for (const item of items) {
    if (item.is_section) {
      text += `\n>>> ${item.section_label || item.description} <<<\n\n`
      continue
    }
    const sku = (item.sku || '').substring(0, 14).padEnd(15)
    const desc = (item.description || '').substring(0, 29).padEnd(30)
    const qty = String(item.quantity).padStart(6)
    const price = formatCurrency(item.unit_price, cur).padStart(12)
    const total = formatCurrency(item.subtotal, cur).padStart(12)
    text += `${sku} ${desc} ${qty} ${price} ${total}\n`
    if (item.discount_pct > 0) {
      text += `${''.padEnd(15)} (Dto. ${item.discount_pct}%)\n`
    }
  }

  text += `${'-'.repeat(77)}\n`
  text += `${''.padEnd(53)} ${l('subtotal', lang).padStart(10)}: ${formatCurrency(doc.subtotal, cur).padStart(12)}\n`
  if (doc.tax_amount > 0) {
    text += `${''.padEnd(53)} ${(l('tax', lang) + ` ${doc.tax_rate}%`).padStart(10)}: ${formatCurrency(doc.tax_amount, cur).padStart(12)}\n`
  }
  text += `${''.padEnd(53)} ${l('total', lang).padStart(10)}: ${formatCurrency(doc.total, cur).padStart(12)}\n`
  text += `\n${sep}\n`

  if (doc.notes) {
    text += `\n${l('notes', lang)}:\n${doc.notes}\n`
  }

  if (company.bank_details) {
    text += `\n${l('bank', lang)}:\n${company.bank_details}\n`
  }

  text += `\n${sep}\n`
  text += `${l('generated', lang)} Mocciaro Soft ERP\n`

  return text
}

/**
 * Genera Excel XML del documento
 */
export function generateDocumentExcelXML(
  doc: DocumentInfo,
  items: DocumentItem[],
  company: CompanyInfo,
  client: ClientInfo,
  lang: Language = 'es'
): string {
  const cur = (doc.currency || 'EUR') as 'EUR' | 'ARS' | 'USD'
  const typeLabel = getTypeLabel(doc.type, lang)

  function esc(s: string): string {
    return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
  }

  let xml = '<?xml version="1.0" encoding="UTF-8"?>\n'
  xml += '<?mso-application progid="Excel.Sheet"?>\n'
  xml += '<Workbook xmlns="urn:schemas-microsoft-com:office:spreadsheet"\n'
  xml += ' xmlns:ss="urn:schemas-microsoft-com:office:spreadsheet">\n'
  xml += '<Styles>\n'
  xml += '<Style ss:ID="h1"><Font ss:Bold="1" ss:Size="16"/></Style>\n'
  xml += '<Style ss:ID="h2"><Font ss:Bold="1" ss:Size="12"/></Style>\n'
  xml += '<Style ss:ID="header"><Font ss:Bold="1" ss:Size="11" ss:Color="#FFFFFF"/><Interior ss:Color="#FF6600" ss:Pattern="Solid"/></Style>\n'
  xml += '<Style ss:ID="num"><NumberFormat ss:Format="#,##0.00"/></Style>\n'
  xml += '<Style ss:ID="total"><Font ss:Bold="1" ss:Size="12"/><NumberFormat ss:Format="#,##0.00"/><Borders><Border ss:Position="Top" ss:LineStyle="Double" ss:Weight="2"/></Borders></Style>\n'
  xml += '<Style ss:ID="section"><Font ss:Bold="1"/><Interior ss:Color="#F0F0F0" ss:Pattern="Solid"/></Style>\n'
  xml += '</Styles>\n'

  xml += `<Worksheet ss:Name="${esc(typeLabel).substring(0, 30)}">\n<Table>\n`

  // Company + doc info
  xml += `<Row><Cell ss:StyleID="h1"><Data ss:Type="String">${esc(company.name)}</Data></Cell></Row>\n`
  xml += `<Row><Cell ss:StyleID="h2"><Data ss:Type="String">${esc(typeLabel)} ${esc(doc.display_ref || doc.system_code)}</Data></Cell></Row>\n`
  xml += `<Row><Cell><Data ss:Type="String">${l('date', lang)}: ${formatDate(doc.created_at)}</Data></Cell></Row>\n`
  xml += `<Row><Cell><Data ss:Type="String">${l('client', lang)}: ${esc(client.name)}</Data></Cell></Row>\n`
  xml += '<Row></Row>\n'

  // Header row
  xml += '<Row>\n'
  const cols = [l('sku', lang), l('description', lang), l('qty', lang), l('unit_price', lang), l('discount', lang), l('line_total', lang)]
  cols.forEach(c => {
    xml += `<Cell ss:StyleID="header"><Data ss:Type="String">${esc(c)}</Data></Cell>\n`
  })
  xml += '</Row>\n'

  // Data rows
  for (const item of items) {
    if (item.is_section) {
      xml += `<Row><Cell ss:StyleID="section" ss:MergeAcross="5"><Data ss:Type="String">${esc(item.section_label || item.description)}</Data></Cell></Row>\n`
      continue
    }
    xml += '<Row>\n'
    xml += `<Cell><Data ss:Type="String">${esc(item.sku)}</Data></Cell>\n`
    xml += `<Cell><Data ss:Type="String">${esc(item.description)}</Data></Cell>\n`
    xml += `<Cell ss:StyleID="num"><Data ss:Type="Number">${item.quantity}</Data></Cell>\n`
    xml += `<Cell ss:StyleID="num"><Data ss:Type="Number">${item.unit_price}</Data></Cell>\n`
    xml += `<Cell ss:StyleID="num"><Data ss:Type="Number">${item.discount_pct}</Data></Cell>\n`
    xml += `<Cell ss:StyleID="num"><Data ss:Type="Number">${item.subtotal}</Data></Cell>\n`
    xml += '</Row>\n'
  }

  // Totals
  xml += '<Row></Row>\n'
  xml += `<Row><Cell ss:Index="5"><Data ss:Type="String">${l('subtotal', lang)}</Data></Cell><Cell ss:StyleID="num"><Data ss:Type="Number">${doc.subtotal}</Data></Cell></Row>\n`
  if (doc.tax_amount > 0) {
    xml += `<Row><Cell ss:Index="5"><Data ss:Type="String">${l('tax', lang)} (${doc.tax_rate}%)</Data></Cell><Cell ss:StyleID="num"><Data ss:Type="Number">${doc.tax_amount}</Data></Cell></Row>\n`
  }
  xml += `<Row><Cell ss:Index="5"><Data ss:Type="String">${l('total', lang)}</Data></Cell><Cell ss:StyleID="total"><Data ss:Type="Number">${doc.total}</Data></Cell></Row>\n`

  xml += '</Table>\n</Worksheet>\n</Workbook>'
  return xml
}

/**
 * Lanza impresion/PDF del documento usando un iframe oculto
 */
export function printDocumentHTML(html: string): void {
  const iframe = document.createElement('iframe')
  iframe.style.position = 'fixed'
  iframe.style.top = '-9999px'
  iframe.style.left = '-9999px'
  iframe.style.width = '210mm'
  iframe.style.height = '297mm'
  document.body.appendChild(iframe)

  const iframeDoc = iframe.contentDocument || iframe.contentWindow?.document
  if (iframeDoc) {
    iframeDoc.open()
    iframeDoc.write(html)
    iframeDoc.close()

    iframe.onload = () => {
      setTimeout(() => {
        iframe.contentWindow?.print()
        setTimeout(() => document.body.removeChild(iframe), 1000)
      }, 500)
    }
  }
}

/**
 * Descarga contenido como archivo
 */
export function downloadDocument(content: string, filename: string, mimeType: string): void {
  const blob = new Blob([content], { type: mimeType })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  URL.revokeObjectURL(url)
}
