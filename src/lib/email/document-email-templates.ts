/**
 * document-email-templates.ts
 * Sistema unificado de plantillas HTML para TODOS los tipos de documentos.
 * Self-contained, estilos inline, compatible con Gmail / Outlook / Apple Mail.
 */

// ─── Interfaces ───────────────────────────────────────────────────────────────

export interface CompanyInfo {
  name: string
  trade_name?: string | null
  legal_name?: string | null
  tax_id?: string | null
  logo_url?: string | null
  brand_color?: string | null
  address?: string | null
  city?: string | null
  postal_code?: string | null
  phone?: string | null
  email_main?: string | null
  website?: string | null
  bank_details?: BankDetails | null
}

export interface BankDetails {
  bank_name?: string | null
  account_holder?: string | null
  iban?: string | null
  swift?: string | null
  account_number?: string | null
  currency?: string | null
}

export interface DocumentInfo {
  system_code?: string | null
  display_ref?: string | null
  legal_number?: string | null
  invoice_date?: string | null
  valid_until?: string | null
  due_date?: string | null
  currency?: string | null
  subtotal?: number | null
  tax_amount?: number | null
  total?: number | null
  notes?: string | null
  // Pedido
  estimated_delivery?: string | null
  // Albarán
  carrier?: string | null
  tracking_number?: string | null
  weight?: string | null
  packages?: number | null
  // Factura
  bank_details?: BankDetails | null
  // Nota de crédito
  original_invoice_ref?: string | null
  // Condiciones
  payment_terms?: string | null
  incoterm?: string | null
}

export interface ItemInfo {
  description?: string | null
  'item-name'?: string | null
  name?: string | null
  quantity?: number | null
  units?: number | null
  unit_price?: number | null
  'item-base-price'?: number | null
  subtotal?: number | null
  'total-amount'?: number | null
  sku?: string | null
  'item-reference'?: string | null
}

export type DocumentType = 'cotizacion' | 'pedido' | 'albaran' | 'factura' | 'nota_credito'

/** Genera URL de tracking según carrier (inline para no importar módulo externo en template) */
function buildTrackingUrlInline(carrier: string, trackingNumber: string): string | null {
  if (!carrier || !trackingNumber) return null
  const c = carrier.toLowerCase().trim()
  const n = trackingNumber.trim()
  if (c.includes('dhl')) return `https://www.dhl.com/ar-es/home/rastreo.html?tracking-id=${n}`
  if (c.includes('ups')) return `https://www.ups.com/track?tracknum=${n}`
  if (c.includes('fedex') || c.includes('fed ex')) return `https://www.fedex.com/fedextrack/?trknbr=${n}`
  if (c.includes('tnt')) return `https://www.tnt.com/express/es_ar/site/rastreo.html?searchType=con&cons=${n}`
  if (c.includes('oca')) return `https://www.oca.com.ar/Envios/Tracking?piession=${n}`
  if (c.includes('andreani')) return `https://www.andreani.com/#!/informacionEnvio/${n}`
  if (c.includes('correo')) return `https://www.correoargentino.com.ar/formularios/e-commerce?id=${n}`
  if (c.includes('seur')) return `https://www.seur.com/livetracking/?segOnlineIdentifier=${n}`
  if (c.includes('mrw')) return `https://www.mrw.es/seguimiento_envios/MRW_resultados_702.asp?num=${n}`
  if (c.includes('usps')) return `https://tools.usps.com/go/TrackConfirmAction?tLabels=${n}`
  return null
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function currencySymbol(currency: string | null | undefined): string {
  if (!currency) return '$'
  if (currency === 'EUR') return '€'
  return '$'
}

function formatAmount(amount: number | null | undefined, currency: string | null | undefined): string {
  const n = Number(amount ?? 0)
  const sym = currencySymbol(currency)
  const formatted = n.toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
  return `${sym}${formatted}`
}

function formatDateStr(d: string | null | undefined): string {
  if (!d) return '—'
  return d.slice(0, 10).split('-').reverse().join('/')
}

// Configuración visual por tipo de documento
interface DocTypeConfig {
  accentColor: string
  headerLabel: string
  getTitle: (docCode: string) => string
  getIntroMessage: (companyName: string) => string
}

const DOC_TYPE_CONFIG: Record<DocumentType, DocTypeConfig> = {
  cotizacion: {
    accentColor: '#F97316', // naranja — se sobreescribe con brand_color
    headerLabel: 'Nueva Cotización',
    getTitle: (code) => `Cotización ${code}`,
    getIntroMessage: (co) => `<strong>${co}</strong> le ha enviado una cotización para su revisión.`,
  },
  pedido: {
    accentColor: '#3b82f6', // azul
    headerLabel: 'Confirmación de Pedido',
    getTitle: (code) => `Confirmación de Pedido ${code}`,
    getIntroMessage: (co) =>
      `Tu pedido ha sido confirmado por <strong>${co}</strong> y está en preparación.`,
  },
  albaran: {
    accentColor: '#8b5cf6', // violeta
    headerLabel: 'Nota de Entrega',
    getTitle: (code) => `Nota de Entrega ${code}`,
    getIntroMessage: (co) =>
      `Tu pedido ha sido despachado por <strong>${co}</strong>.`,
  },
  factura: {
    accentColor: '#10b981', // verde
    headerLabel: 'Factura',
    getTitle: (code) => `Factura ${code}`,
    getIntroMessage: (co) =>
      `<strong>${co}</strong> adjunta la factura correspondiente a su pedido.`,
  },
  nota_credito: {
    accentColor: '#f59e0b', // ámbar
    headerLabel: 'Nota de Crédito',
    getTitle: (code) => `Nota de Crédito ${code}`,
    getIntroMessage: (co) =>
      `<strong>${co}</strong> emitió una nota de crédito a su favor.`,
  },
}

// ─── Secciones reutilizables ──────────────────────────────────────────────────

function buildLogoHtml(company: CompanyInfo, brand: string): string {
  return company.logo_url
    ? `<img src="${company.logo_url}" alt="${company.trade_name || company.name || ''}" style="max-height:50px;max-width:180px;display:block" />`
    : `<span style="font-size:22px;font-weight:800;color:#ffffff">${company.trade_name || company.name || 'Su proveedor'}</span>`
}

function buildFooterAddress(company: CompanyInfo): string {
  return [
    company.legal_name || company.name,
    company.tax_id ? `CIF/NIF/CUIT: ${company.tax_id}` : '',
    company.address
      ? `${company.address}${company.city ? ', ' + company.city : ''}${company.postal_code ? ' ' + company.postal_code : ''}`
      : '',
    company.phone ? `Tel: ${company.phone}` : '',
    company.email_main || '',
    company.website || '',
  ]
    .filter(Boolean)
    .join(' · ')
}

function buildItemsTable(
  items: ItemInfo[],
  currency: string | null | undefined,
  accentColor: string,
  document: DocumentInfo
): string {
  if (items.length === 0) return ''

  const MAX_ITEMS = 5
  const visible = items.slice(0, MAX_ITEMS)
  const extra = items.length - visible.length

  const rows = visible
    .map((it) => {
      const name = it['item-name'] || it.name || it.description || 'Ítem'
      const sku = it['item-reference'] || it.sku || ''
      const qty = it.units ?? it.quantity ?? 1
      const price = it['item-base-price'] ?? it.unit_price ?? 0
      const sub = it['total-amount'] ?? it.subtotal ?? qty * price
      return `
        <tr>
          <td style="padding:10px 14px;border-bottom:1px solid #f0f0f0;font-size:14px;color:#222222">
            ${sku ? `<span style="display:block;font-size:11px;color:#888888;margin-bottom:2px">${sku}</span>` : ''}
            ${name}
          </td>
          <td style="padding:10px 14px;border-bottom:1px solid #f0f0f0;font-size:14px;color:#555555;text-align:right;white-space:nowrap">${qty}</td>
          <td style="padding:10px 14px;border-bottom:1px solid #f0f0f0;font-size:14px;color:#555555;text-align:right;white-space:nowrap">${formatAmount(price, currency)}</td>
          <td style="padding:10px 14px;border-bottom:1px solid #f0f0f0;font-size:14px;font-weight:600;color:#222222;text-align:right;white-space:nowrap">${formatAmount(sub, currency)}</td>
        </tr>`
    })
    .join('')

  const moreRow =
    extra > 0
      ? `<tr>
          <td colspan="4" style="padding:10px 14px;font-size:13px;color:#888888;font-style:italic;text-align:center">
            y ${extra} ítem${extra > 1 ? 's' : ''} más...
          </td>
         </tr>`
      : ''

  const subtotalRow =
    document.subtotal != null
      ? `<tr>
          <td colspan="3" style="padding:8px 14px;font-size:13px;color:#6b7280;text-align:right;border-top:1px solid #e5e7eb">Subtotal</td>
          <td style="padding:8px 14px;font-size:13px;color:#374151;text-align:right;white-space:nowrap;border-top:1px solid #e5e7eb">${formatAmount(document.subtotal, currency)}</td>
         </tr>`
      : ''

  const taxRow =
    document.tax_amount != null
      ? `<tr>
          <td colspan="3" style="padding:4px 14px;font-size:13px;color:#6b7280;text-align:right">IVA</td>
          <td style="padding:4px 14px;font-size:13px;color:#374151;text-align:right;white-space:nowrap">${formatAmount(document.tax_amount, currency)}</td>
         </tr>`
      : ''

  const totalRow =
    document.total != null
      ? `<tr style="background-color:#f9f9f9">
          <td colspan="3" style="padding:12px 14px;font-size:14px;font-weight:700;color:#222222;text-align:right">TOTAL</td>
          <td style="padding:12px 14px;font-size:16px;font-weight:700;color:${accentColor};text-align:right;white-space:nowrap">${formatAmount(document.total, currency)}</td>
         </tr>`
      : ''

  return `
  <tr>
    <td style="padding:0 32px 20px">
      <table width="100%" cellpadding="0" cellspacing="0" border="0" style="border:1px solid #e5e7eb;border-radius:6px;overflow:hidden">
        <thead>
          <tr style="background-color:#f3f4f6">
            <th style="padding:10px 14px;font-size:11px;font-weight:600;color:#6b7280;text-transform:uppercase;letter-spacing:0.5px;text-align:left">Descripción</th>
            <th style="padding:10px 14px;font-size:11px;font-weight:600;color:#6b7280;text-transform:uppercase;letter-spacing:0.5px;text-align:right">Cant.</th>
            <th style="padding:10px 14px;font-size:11px;font-weight:600;color:#6b7280;text-transform:uppercase;letter-spacing:0.5px;text-align:right">Precio</th>
            <th style="padding:10px 14px;font-size:11px;font-weight:600;color:#6b7280;text-transform:uppercase;letter-spacing:0.5px;text-align:right">Subtotal</th>
          </tr>
        </thead>
        <tbody>
          ${rows}
          ${moreRow}
          ${subtotalRow}
          ${taxRow}
          ${totalRow}
        </tbody>
      </table>
    </td>
  </tr>`
}

function buildCta(text: string, url: string, color: string): string {
  return `
  <tr>
    <td style="padding:8px 32px 32px;text-align:center">
      <!--[if mso]>
      <v:roundrect xmlns:v="urn:schemas-microsoft-com:vml" href="${url}" style="height:48px;v-text-anchor:middle;width:280px;" arcsize="8%" stroke="f" fillcolor="${color}">
        <w:anchorlock/>
        <center style="color:#ffffff;font-family:Arial,sans-serif;font-size:16px;font-weight:bold">${text}</center>
      </v:roundrect>
      <![endif]-->
      <!--[if !mso]><!-->
      <a href="${url}"
         style="display:inline-block;background-color:${color};color:#ffffff;font-size:16px;font-weight:700;text-decoration:none;padding:14px 32px;border-radius:8px;letter-spacing:0.3px">
        ${text}
      </a>
      <!--<![endif]-->
      <p style="margin:16px 0 0;font-size:12px;color:#9ca3af">
        O copie este enlace: <a href="${url}" style="color:${color};word-break:break-all">${url}</a>
      </p>
    </td>
  </tr>`
}

// ─── Sección META genérica ─────────────────────────────────────────────────

function buildMetaRow(label: string, value: string, highlighted = false): string {
  return `
    <td style="padding:14px 16px">
      <div style="font-size:11px;color:#9ca3af;text-transform:uppercase;letter-spacing:0.5px;margin-bottom:4px">${label}</div>
      <div style="font-size:15px;font-weight:600;color:${highlighted ? '#d97706' : '#111827'}">${value}</div>
    </td>`
}

// ─── Secciones específicas por tipo ──────────────────────────────────────────

function buildCotizacionMeta(document: DocumentInfo): string {
  const cols: string[] = []
  cols.push(buildMetaRow('Número', document.display_ref || document.system_code || document.legal_number || '—'))
  cols.push(buildMetaRow('Fecha', formatDateStr(document.invoice_date)))

  const extraRows: string[] = []
  if (document.valid_until) {
    extraRows.push(`
      <tr>
        <td colspan="${cols.length}" style="padding:10px 16px;border-top:1px solid #e5e7eb">
          <div style="font-size:11px;color:#9ca3af;text-transform:uppercase;letter-spacing:0.5px;margin-bottom:4px">Válida hasta</div>
          <div style="font-size:15px;font-weight:600;color:#d97706">${formatDateStr(document.valid_until)}</div>
        </td>
      </tr>`)
  }
  if (document.incoterm || document.payment_terms) {
    const parts: string[] = []
    if (document.incoterm) parts.push(`Incoterm: <strong>${document.incoterm}</strong>`)
    if (document.payment_terms) parts.push(`Pago: <strong>${document.payment_terms}</strong>`)
    extraRows.push(`
      <tr>
        <td colspan="${cols.length}" style="padding:10px 16px;border-top:1px solid #e5e7eb;font-size:13px;color:#6b7280">
          ${parts.join(' &nbsp;·&nbsp; ')}
        </td>
      </tr>`)
  }

  return `
  <tr>
    <td style="padding:0 32px 20px">
      <table width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#f9fafb;border-radius:6px;border:1px solid #e5e7eb">
        <tr style="border-bottom:1px solid #e5e7eb">
          ${cols.map((c, i) => i < cols.length - 1 ? c.replace('<td style="padding:14px 16px">', '<td style="padding:14px 16px;border-right:1px solid #e5e7eb;width:50%">') : c.replace('<td style="padding:14px 16px">', '<td style="padding:14px 16px;width:50%">')).join('')}
        </tr>
        ${extraRows.join('')}
      </table>
    </td>
  </tr>`
}

function buildPedidoMeta(document: DocumentInfo): string {
  return `
  <tr>
    <td style="padding:0 32px 20px">
      <table width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#f9fafb;border-radius:6px;border:1px solid #e5e7eb">
        <tr>
          <td style="padding:14px 16px;border-right:1px solid #e5e7eb;width:50%">
            <div style="font-size:11px;color:#9ca3af;text-transform:uppercase;letter-spacing:0.5px;margin-bottom:4px">Número de pedido</div>
            <div style="font-size:15px;font-weight:600;color:#111827">${document.display_ref || document.system_code || document.legal_number || '—'}</div>
          </td>
          <td style="padding:14px 16px;width:50%">
            <div style="font-size:11px;color:#9ca3af;text-transform:uppercase;letter-spacing:0.5px;margin-bottom:4px">Fecha</div>
            <div style="font-size:15px;font-weight:600;color:#111827">${formatDateStr(document.invoice_date)}</div>
          </td>
        </tr>
        ${document.estimated_delivery ? `
        <tr>
          <td colspan="2" style="padding:10px 16px;border-top:1px solid #e5e7eb">
            <div style="font-size:11px;color:#9ca3af;text-transform:uppercase;letter-spacing:0.5px;margin-bottom:4px">Entrega estimada</div>
            <div style="font-size:15px;font-weight:600;color:#3b82f6">${formatDateStr(document.estimated_delivery)}</div>
          </td>
        </tr>` : ''}
        ${document.payment_terms ? `
        <tr>
          <td colspan="2" style="padding:10px 16px;border-top:1px solid #e5e7eb;font-size:13px;color:#6b7280">
            Condiciones de pago: <strong>${document.payment_terms}</strong>
          </td>
        </tr>` : ''}
      </table>
    </td>
  </tr>`
}

function buildAlbaranMeta(document: DocumentInfo): string {
  return `
  <tr>
    <td style="padding:0 32px 20px">
      <table width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#f9fafb;border-radius:6px;border:1px solid #e5e7eb">
        <tr>
          <td style="padding:14px 16px;border-right:1px solid #e5e7eb;width:50%">
            <div style="font-size:11px;color:#9ca3af;text-transform:uppercase;letter-spacing:0.5px;margin-bottom:4px">Número de entrega</div>
            <div style="font-size:15px;font-weight:600;color:#111827">${document.display_ref || document.system_code || document.legal_number || '—'}</div>
          </td>
          <td style="padding:14px 16px;width:50%">
            <div style="font-size:11px;color:#9ca3af;text-transform:uppercase;letter-spacing:0.5px;margin-bottom:4px">Fecha de despacho</div>
            <div style="font-size:15px;font-weight:600;color:#111827">${formatDateStr(document.invoice_date)}</div>
          </td>
        </tr>
        ${document.carrier || document.tracking_number ? `
        <tr>
          <td colspan="2" style="padding:14px 16px;border-top:1px solid #e5e7eb">
            <div style="font-size:11px;color:#9ca3af;text-transform:uppercase;letter-spacing:0.5px;margin-bottom:8px">Información de envío</div>
            <table width="100%" cellpadding="0" cellspacing="0" border="0">
              <tr>
                ${document.carrier ? `
                <td style="width:50%;vertical-align:top">
                  <span style="font-size:12px;color:#6b7280">Transportista:</span><br/>
                  <span style="font-size:14px;font-weight:600;color:#111827">${document.carrier}</span>
                </td>` : ''}
                ${document.tracking_number ? `
                <td style="width:50%;vertical-align:top">
                  <span style="font-size:12px;color:#6b7280">Número de seguimiento:</span><br/>
                  ${(() => {
                    const trackUrl = document.carrier ? buildTrackingUrlInline(document.carrier, document.tracking_number!) : null
                    return trackUrl
                      ? `<a href="${trackUrl}" target="_blank" style="font-size:14px;font-weight:600;color:#8b5cf6;text-decoration:underline">${document.tracking_number}</a>
                         <br/><a href="${trackUrl}" target="_blank" style="display:inline-block;margin-top:6px;padding:6px 14px;background:#8b5cf6;color:#ffffff;font-size:12px;font-weight:600;border-radius:4px;text-decoration:none">📦 Rastrear envío →</a>`
                      : `<span style="font-size:14px;font-weight:600;color:#8b5cf6">${document.tracking_number}</span>`
                  })()}
                </td>` : ''}
              </tr>
            </table>
          </td>
        </tr>` : ''}
        ${document.weight || document.packages ? `
        <tr>
          <td colspan="2" style="padding:10px 16px;border-top:1px solid #e5e7eb;font-size:13px;color:#6b7280">
            ${document.packages ? `Bultos: <strong>${document.packages}</strong>` : ''}
            ${document.packages && document.weight ? ' &nbsp;·&nbsp; ' : ''}
            ${document.weight ? `Peso: <strong>${document.weight}</strong>` : ''}
          </td>
        </tr>` : ''}
      </table>
    </td>
  </tr>`
}

function buildFacturaMeta(document: DocumentInfo, company: CompanyInfo, currency: string | null | undefined, accentColor: string): string {
  const bankDetails = document.bank_details || company.bank_details
  return `
  <tr>
    <td style="padding:0 32px 20px">
      <table width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#f9fafb;border-radius:6px;border:1px solid #e5e7eb">
        <tr>
          <td style="padding:14px 16px;border-right:1px solid #e5e7eb;width:50%">
            <div style="font-size:11px;color:#9ca3af;text-transform:uppercase;letter-spacing:0.5px;margin-bottom:4px">Número de factura</div>
            <div style="font-size:15px;font-weight:600;color:#111827">${document.display_ref || document.legal_number || document.system_code || '—'}</div>
          </td>
          <td style="padding:14px 16px;width:50%">
            <div style="font-size:11px;color:#9ca3af;text-transform:uppercase;letter-spacing:0.5px;margin-bottom:4px">Fecha</div>
            <div style="font-size:15px;font-weight:600;color:#111827">${formatDateStr(document.invoice_date)}</div>
          </td>
        </tr>
        ${document.due_date ? `
        <tr>
          <td colspan="2" style="padding:14px 16px;border-top:1px solid #e5e7eb;background:#fef3c7">
            <div style="font-size:11px;color:#92400e;text-transform:uppercase;letter-spacing:0.5px;margin-bottom:4px">Fecha de vencimiento</div>
            <div style="font-size:16px;font-weight:700;color:#d97706">${formatDateStr(document.due_date)}</div>
          </td>
        </tr>` : ''}
        ${document.total != null ? `
        <tr>
          <td colspan="2" style="padding:14px 16px;border-top:1px solid #e5e7eb;background-color:#f0fdf4">
            <div style="font-size:11px;color:#065f46;text-transform:uppercase;letter-spacing:0.5px;margin-bottom:4px">Total a pagar</div>
            <div style="font-size:20px;font-weight:800;color:${accentColor}">${formatAmount(document.total, currency)}</div>
          </td>
        </tr>` : ''}
        ${bankDetails ? `
        <tr>
          <td colspan="2" style="padding:14px 16px;border-top:2px solid #e5e7eb">
            <div style="font-size:11px;color:#9ca3af;text-transform:uppercase;letter-spacing:0.5px;margin-bottom:10px">Datos bancarios para el pago</div>
            <table width="100%" cellpadding="0" cellspacing="4" border="0">
              ${bankDetails.account_holder ? `
              <tr>
                <td style="font-size:12px;color:#6b7280;width:120px">Titular:</td>
                <td style="font-size:13px;font-weight:600;color:#111827">${bankDetails.account_holder}</td>
              </tr>` : ''}
              ${bankDetails.bank_name ? `
              <tr>
                <td style="font-size:12px;color:#6b7280">Banco:</td>
                <td style="font-size:13px;font-weight:600;color:#111827">${bankDetails.bank_name}</td>
              </tr>` : ''}
              ${bankDetails.iban ? `
              <tr>
                <td style="font-size:12px;color:#6b7280">IBAN:</td>
                <td style="font-size:13px;font-weight:700;color:#111827;letter-spacing:1px;font-family:monospace,Courier">${bankDetails.iban}</td>
              </tr>` : ''}
              ${bankDetails.swift ? `
              <tr>
                <td style="font-size:12px;color:#6b7280">SWIFT/BIC:</td>
                <td style="font-size:13px;font-weight:700;color:#111827;letter-spacing:1px;font-family:monospace,Courier">${bankDetails.swift}</td>
              </tr>` : ''}
              ${bankDetails.account_number && !bankDetails.iban ? `
              <tr>
                <td style="font-size:12px;color:#6b7280">Cuenta:</td>
                <td style="font-size:13px;font-weight:700;color:#111827;font-family:monospace,Courier">${bankDetails.account_number}</td>
              </tr>` : ''}
            </table>
          </td>
        </tr>` : ''}
        ${document.payment_terms ? `
        <tr>
          <td colspan="2" style="padding:10px 16px;border-top:1px solid #e5e7eb;font-size:13px;color:#6b7280">
            Condiciones de pago: <strong>${document.payment_terms}</strong>
          </td>
        </tr>` : ''}
      </table>
    </td>
  </tr>`
}

function buildNotaCreditoMeta(document: DocumentInfo): string {
  return `
  <tr>
    <td style="padding:0 32px 20px">
      <table width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#f9fafb;border-radius:6px;border:1px solid #e5e7eb">
        <tr>
          <td style="padding:14px 16px;border-right:1px solid #e5e7eb;width:50%">
            <div style="font-size:11px;color:#9ca3af;text-transform:uppercase;letter-spacing:0.5px;margin-bottom:4px">Número nota de crédito</div>
            <div style="font-size:15px;font-weight:600;color:#111827">${document.display_ref || document.legal_number || document.system_code || '—'}</div>
          </td>
          <td style="padding:14px 16px;width:50%">
            <div style="font-size:11px;color:#9ca3af;text-transform:uppercase;letter-spacing:0.5px;margin-bottom:4px">Fecha</div>
            <div style="font-size:15px;font-weight:600;color:#111827">${formatDateStr(document.invoice_date)}</div>
          </td>
        </tr>
        ${document.original_invoice_ref ? `
        <tr>
          <td colspan="2" style="padding:10px 16px;border-top:1px solid #e5e7eb">
            <div style="font-size:11px;color:#9ca3af;text-transform:uppercase;letter-spacing:0.5px;margin-bottom:4px">Factura original</div>
            <div style="font-size:14px;font-weight:600;color:#f59e0b">${document.original_invoice_ref}</div>
          </td>
        </tr>` : ''}
        ${document.total != null ? `
        <tr>
          <td colspan="2" style="padding:14px 16px;border-top:1px solid #e5e7eb;background-color:#fffbeb">
            <div style="font-size:11px;color:#78350f;text-transform:uppercase;letter-spacing:0.5px;margin-bottom:4px">Importe a favor</div>
            <div style="font-size:20px;font-weight:800;color:#f59e0b">- ${document.total != null ? formatAmount(Math.abs(document.total), document.currency) : '—'}</div>
          </td>
        </tr>` : ''}
      </table>
    </td>
  </tr>`
}

// ─── Función principal ────────────────────────────────────────────────────────

/**
 * Genera el HTML completo del email para cualquier tipo de documento.
 *
 * @param type       Tipo de documento
 * @param company    Datos de la empresa emisora (branding)
 * @param document   Cabecera del documento
 * @param items      Líneas del documento
 * @param portalUrl  URL del portal (para CTA). Obligatorio en cotizaciones.
 * @param extra      Campos extra opcionales (por tipo)
 */
export function buildDocumentEmailHtml(
  type: DocumentType,
  company: CompanyInfo,
  document: DocumentInfo,
  items: ItemInfo[],
  portalUrl?: string,
  extra?: Record<string, string>
): string {
  const config = DOC_TYPE_CONFIG[type]

  // Para cotizaciones usamos brand_color; para el resto el accent fijo del tipo
  const brand =
    type === 'cotizacion'
      ? (company.brand_color || config.accentColor)
      : config.accentColor

  const companyName = company.trade_name || company.name || 'Su proveedor'
  const docCode =
    document.display_ref ||
    document.system_code ||
    document.legal_number ||
    '—'
  const currency = document.currency

  const logoHtml = buildLogoHtml(company, brand)
  const footerAddress = buildFooterAddress(company)

  // ── Sección META específica por tipo ──────────────────────────────────────
  let metaSection = ''
  switch (type) {
    case 'cotizacion':
      metaSection = buildCotizacionMeta(document)
      break
    case 'pedido':
      metaSection = buildPedidoMeta(document)
      break
    case 'albaran':
      metaSection = buildAlbaranMeta(document)
      break
    case 'factura':
      metaSection = buildFacturaMeta(document, company, currency, brand)
      break
    case 'nota_credito':
      metaSection = buildNotaCreditoMeta(document)
      break
  }

  // ── Items (facturas muestran totales ya en el meta, no duplicar) ──────────
  // Para factura, ocultamos la sección de totales del items table (ya están en meta)
  const docForItems: DocumentInfo =
    type === 'factura'
      ? { ...document, subtotal: null, tax_amount: null, total: null }
      : document

  const itemsSection = buildItemsTable(items, currency, brand, docForItems)

  // ── CTA ───────────────────────────────────────────────────────────────────
  let ctaSection = ''
  const ctaUrl = portalUrl || extra?.portal_url || '#'

  if (ctaUrl !== '#') {
    const ctaLabels: Record<DocumentType, string> = {
      cotizacion: 'Ver y aceptar cotización →',
      pedido: 'Ver estado del pedido →',
      albaran: 'Ver detalle de envío →',
      factura: 'Ver factura y pagar →',
      nota_credito: 'Ver nota de crédito →',
    }
    ctaSection = buildCta(ctaLabels[type], ctaUrl, brand)
  }

  // ── Notas del documento ───────────────────────────────────────────────────
  const notesSection = document.notes
    ? `
  <tr>
    <td style="padding:0 32px 20px">
      <div style="background:#f9fafb;border-left:3px solid ${brand};padding:12px 16px;border-radius:0 6px 6px 0">
        <div style="font-size:11px;color:#9ca3af;text-transform:uppercase;letter-spacing:0.5px;margin-bottom:6px">Notas</div>
        <div style="font-size:13px;color:#374151;white-space:pre-wrap">${document.notes}</div>
      </div>
    </td>
  </tr>`
    : ''

  return `<!DOCTYPE html>
<html lang="es">
<head>
<meta charset="UTF-8" />
<meta name="viewport" content="width=device-width, initial-scale=1.0" />
<title>${config.getTitle(docCode)} — ${companyName}</title>
</head>
<body style="margin:0;padding:0;background-color:#f4f4f5;font-family:Arial,Helvetica,sans-serif">
<table width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color:#f4f4f5;padding:24px 0">
  <tr>
    <td align="center">
      <!--[if mso]><table width="600" cellpadding="0" cellspacing="0"><tr><td><![endif]-->
      <table width="100%" style="max-width:600px;background-color:#ffffff;border-radius:8px;overflow:hidden;box-shadow:0 2px 8px rgba(0,0,0,0.08)" cellpadding="0" cellspacing="0" border="0">

        <!-- ── HEADER ── -->
        <tr>
          <td style="background-color:${brand};padding:28px 32px">
            <table width="100%" cellpadding="0" cellspacing="0" border="0">
              <tr>
                <td style="color:#ffffff">${logoHtml}</td>
                <td align="right" style="color:rgba(255,255,255,0.85);font-size:12px;vertical-align:bottom">
                  ${config.headerLabel}
                </td>
              </tr>
            </table>
          </td>
        </tr>

        <!-- ── INTRO ── -->
        <tr>
          <td style="padding:28px 32px 16px">
            <h1 style="margin:0 0 8px;font-size:22px;color:#111827;font-weight:700">
              ${config.getTitle(docCode)}
            </h1>
            <p style="margin:0;font-size:15px;color:#6b7280">
              ${config.getIntroMessage(companyName)}
            </p>
          </td>
        </tr>

        <!-- ── META ── -->
        ${metaSection}

        <!-- ── ITEMS TABLE ── -->
        ${itemsSection}

        <!-- ── NOTES ── -->
        ${notesSection}

        <!-- ── CTA ── -->
        ${ctaSection}

        <!-- ── DIVIDER ── -->
        <tr>
          <td style="padding:0 32px"><hr style="border:none;border-top:1px solid #f0f0f0;margin:0" /></td>
        </tr>

        <!-- ── FOOTER ── -->
        <tr>
          <td style="padding:20px 32px;text-align:center">
            <p style="margin:0 0 6px;font-size:12px;color:#9ca3af">${footerAddress}</p>
            <p style="margin:0;font-size:11px;color:#c4c4c4">
              Este correo fue generado automáticamente por Mocciaro Soft ERP.
              Si recibió este mensaje por error, por favor ignórelo.
            </p>
          </td>
        </tr>

      </table>
      <!--[if mso]></td></tr></table><![endif]-->
    </td>
  </tr>
</table>
</body>
</html>`
}

// ─── Re-export de la función legacy para compatibilidad ───────────────────────
// Permite que código existente que importe buildQuoteEmailHtml siga funcionando
// mientras se migra completamente al nuevo sistema.
export function buildQuoteEmailHtml(
  company: CompanyInfo,
  document: DocumentInfo,
  items: ItemInfo[],
  portalUrl: string
): string {
  return buildDocumentEmailHtml('cotizacion', company, document, items, portalUrl)
}
