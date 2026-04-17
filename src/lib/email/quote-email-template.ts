/**
 * quote-email-template.ts
 * Plantilla HTML de email para cotizaciones — self-contained, inline styles,
 * compatible con Gmail, Outlook y Apple Mail.
 */

export interface QuoteEmailCompany {
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
}

export interface QuoteEmailDocument {
  system_code?: string | null
  display_ref?: string | null
  legal_number?: string | null
  invoice_date?: string | null
  valid_until?: string | null
  currency?: string | null
  subtotal?: number | null
  tax_amount?: number | null
  total?: number | null
  notes?: string | null
}

export interface QuoteEmailItem {
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

function formatAmount(amount: number | null | undefined, currency: string): string {
  const n = Number(amount ?? 0)
  const sym = currency === 'EUR' ? '€' : currency === 'ARS' ? '$' : '$'
  return `${sym}${n.toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}

function formatDateStr(d: string | null | undefined): string {
  if (!d) return '—'
  return d.slice(0, 10).split('-').reverse().join('/')
}

/**
 * Genera el HTML completo del email de cotización.
 *
 * @param company  Datos de la empresa emisora (branding)
 * @param document Cabecera del documento
 * @param items    Líneas del documento
 * @param portalUrl URL pública del portal de aceptación
 * @returns HTML string listo para enviar como `text/html`
 */
export function buildQuoteEmailHtml(
  company: QuoteEmailCompany,
  document: QuoteEmailDocument,
  items: QuoteEmailItem[],
  portalUrl: string
): string {
  const brand = company.brand_color || '#F97316'
  const companyName = company.trade_name || company.name || 'Su proveedor'
  const docCode = document.display_ref || document.system_code || document.legal_number || '—'
  const currency = document.currency || 'EUR'

  // Mostrar máximo 5 ítems, luego "y X más..."
  const MAX_ITEMS = 5
  const visibleItems = items.slice(0, MAX_ITEMS)
  const extraCount = items.length - visibleItems.length

  const itemRows = visibleItems.map(it => {
    const name = it['item-name'] || it.name || it.description || 'Item'
    const sku = it['item-reference'] || it.sku || ''
    const qty = it.units ?? it.quantity ?? 1
    const price = it['item-base-price'] ?? it.unit_price ?? 0
    const sub = it['total-amount'] ?? it.subtotal ?? (qty * price)
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
  }).join('')

  const moreRow = extraCount > 0
    ? `<tr>
        <td colspan="4" style="padding:10px 14px;font-size:13px;color:#888888;font-style:italic;text-align:center">
          y ${extraCount} ítem${extraCount > 1 ? 's' : ''} más...
        </td>
       </tr>`
    : ''

  const totalRow = document.total != null
    ? `<tr style="background-color:#f9f9f9">
        <td colspan="3" style="padding:12px 14px;font-size:14px;font-weight:700;color:#222222;text-align:right">TOTAL</td>
        <td style="padding:12px 14px;font-size:16px;font-weight:700;color:${brand};text-align:right;white-space:nowrap">${formatAmount(document.total, currency)}</td>
       </tr>`
    : ''

  const logoHtml = company.logo_url
    ? `<img src="${company.logo_url}" alt="${companyName}" style="max-height:50px;max-width:180px;display:block" />`
    : `<span style="font-size:22px;font-weight:800;color:${brand}">${companyName}</span>`

  const footerAddress = [
    company.legal_name || company.name,
    company.tax_id ? `CIF/NIF: ${company.tax_id}` : '',
    company.address ? `${company.address}${company.city ? ', ' + company.city : ''}${company.postal_code ? ' ' + company.postal_code : ''}` : '',
    company.phone ? `Tel: ${company.phone}` : '',
    company.email_main ? company.email_main : '',
    company.website ? company.website : '',
  ].filter(Boolean).join(' · ')

  return `<!DOCTYPE html>
<html lang="es">
<head>
<meta charset="UTF-8" />
<meta name="viewport" content="width=device-width, initial-scale=1.0" />
<title>Nueva Cotización de ${companyName}</title>
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
                  Nueva Cotización
                </td>
              </tr>
            </table>
          </td>
        </tr>

        <!-- ── INTRO ── -->
        <tr>
          <td style="padding:28px 32px 16px">
            <h1 style="margin:0 0 8px;font-size:22px;color:#111827;font-weight:700">
              Cotización ${docCode}
            </h1>
            <p style="margin:0;font-size:15px;color:#6b7280">
              <strong>${companyName}</strong> le ha enviado una cotización para su revisión.
            </p>
          </td>
        </tr>

        <!-- ── META ── -->
        <tr>
          <td style="padding:0 32px 20px">
            <table width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#f9fafb;border-radius:6px;border:1px solid #e5e7eb">
              <tr>
                <td style="padding:14px 16px;border-right:1px solid #e5e7eb;width:50%">
                  <div style="font-size:11px;color:#9ca3af;text-transform:uppercase;letter-spacing:0.5px;margin-bottom:4px">Número</div>
                  <div style="font-size:15px;font-weight:600;color:#111827">${docCode}</div>
                </td>
                <td style="padding:14px 16px;width:50%">
                  <div style="font-size:11px;color:#9ca3af;text-transform:uppercase;letter-spacing:0.5px;margin-bottom:4px">Fecha</div>
                  <div style="font-size:15px;font-weight:600;color:#111827">${formatDateStr(document.invoice_date)}</div>
                </td>
              </tr>
              ${document.valid_until ? `
              <tr>
                <td colspan="2" style="padding:10px 16px;border-top:1px solid #e5e7eb">
                  <div style="font-size:11px;color:#9ca3af;text-transform:uppercase;letter-spacing:0.5px;margin-bottom:4px">Válida hasta</div>
                  <div style="font-size:15px;font-weight:600;color:#d97706">${formatDateStr(document.valid_until)}</div>
                </td>
              </tr>` : ''}
            </table>
          </td>
        </tr>

        <!-- ── ITEMS TABLE ── -->
        ${items.length > 0 ? `
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
                ${itemRows}
                ${moreRow}
                ${totalRow}
              </tbody>
            </table>
          </td>
        </tr>` : ''}

        <!-- ── CTA ── -->
        <tr>
          <td style="padding:8px 32px 32px;text-align:center">
            <p style="margin:0 0 20px;font-size:15px;color:#6b7280">
              Para ver el detalle completo, hacer consultas o aceptar la cotización, haga clic en el botón:
            </p>
            <!--[if mso]>
            <v:roundrect xmlns:v="urn:schemas-microsoft-com:vml" href="${portalUrl}" style="height:48px;v-text-anchor:middle;width:260px;" arcsize="8%" stroke="f" fillcolor="${brand}">
              <w:anchorlock/>
              <center style="color:#ffffff;font-family:Arial,sans-serif;font-size:16px;font-weight:bold">Ver cotización completa →</center>
            </v:roundrect>
            <![endif]-->
            <!--[if !mso]><!-->
            <a href="${portalUrl}"
               style="display:inline-block;background-color:${brand};color:#ffffff;font-size:16px;font-weight:700;text-decoration:none;padding:14px 32px;border-radius:8px;letter-spacing:0.3px">
              Ver cotización completa →
            </a>
            <!--<![endif]-->
            <p style="margin:16px 0 0;font-size:12px;color:#9ca3af">
              O copie este enlace: <a href="${portalUrl}" style="color:${brand};word-break:break-all">${portalUrl}</a>
            </p>
          </td>
        </tr>

        <!-- ── DIVIDER ── -->
        <tr>
          <td style="padding:0 32px"><hr style="border:none;border-top:1px solid #f0f0f0;margin:0" /></td>
        </tr>

        <!-- ── FOOTER ── -->
        <tr>
          <td style="padding:20px 32px;text-align:center">
            <p style="margin:0 0 6px;font-size:12px;color:#9ca3af">${footerAddress}</p>
            <p style="margin:0;font-size:11px;color:#c4c4c4">
              Este correo fue generado automáticamente. Si recibió este mensaje por error, por favor ignórelo.
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
