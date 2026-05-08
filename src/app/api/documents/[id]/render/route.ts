import { NextRequest, NextResponse } from 'next/server'
import { getAdminClient } from '@/lib/supabase/admin'
import { withCompanyFilter } from '@/lib/auth/with-company-filter'

export const runtime = 'nodejs'

/**
 * GET /api/documents/[id]/render
 * Devuelve HTML listo para imprimir (→ PDF via print-to-PDF del navegador).
 * Incluye branding de la empresa (logo, color, datos fiscales).
 *
 * SECURITY (Fase 0.2): valida acceso al documento por company_id antes
 * de renderizar HTML — sin esto cualquier user logueado podría ver
 * documentos (con datos de cliente/totales) de OTRAS empresas.
 */
export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params

  const guard = await withCompanyFilter()
  if (!guard.ok) return guard.response

  const supabase = getAdminClient()

  const { data: doc } = await supabase
    .from('tt_documents')
    .select(`
      *,
      client:tt_clients ( name, legal_name, tax_id, email, phone, address, city, country ),
      company:tt_companies ( name, trade_name, legal_name, tax_id, country, address, city, postal_code,
                             phone, email_main, website, bank_details, logo_url, brand_color, secondary_color,
                             footer_note, code_prefix, currency )
    `)
    .eq('id', id)
    .maybeSingle()

  if (!doc) return new NextResponse('Not found', { status: 404 })

  if (!guard.assertAccess((doc as { company_id: string | null }).company_id)) {
    return new NextResponse('Acceso denegado a este documento', { status: 403 })
  }

  const html = renderDocument(doc as any)
  return new NextResponse(html, {
    status: 200,
    headers: { 'Content-Type': 'text/html; charset=utf-8' },
  })
}

function renderDocument(doc: any): string {
  const c = doc.company || {}
  const cli = doc.client || {}
  const items = doc.metadata?.lines || doc.metadata?.stelorder_raw?.lines || []
  const brand = c.brand_color || '#F97316'
  const secondary = c.secondary_color || '#1E2330'
  const cur = doc.currency === 'EUR' ? '€' : doc.currency === 'ARS' ? '$' : '$'

  const typeLabel: Record<string, string> = {
    cotizacion: 'COTIZACIÓN', factura: 'FACTURA', pedido: 'PEDIDO',
    albaran: 'ALBARÁN', remito: 'REMITO', packing_list: 'PACKING LIST',
    nota_credito: 'NOTA DE CRÉDITO', nota_debito: 'NOTA DE DÉBITO',
    orden_compra: 'ORDEN DE COMPRA', factura_compra: 'FACTURA DE COMPRA',
  }
  const label = typeLabel[doc.type] || String(doc.type).toUpperCase()
  const code = doc.system_code || doc.legal_number || doc.stelorder_reference || '—'

  const rowsHtml = (items || []).map((it: any, i: number) => `
    <tr>
      <td style="padding:8px;border-bottom:1px solid #e5e5e5;font-size:11px">${it['item-reference'] || it.sku || ''}</td>
      <td style="padding:8px;border-bottom:1px solid #e5e5e5;font-size:12px">
        <strong>${it['item-name'] || it.name || it.description || 'Item'}</strong>
        ${it['item-description'] ? `<div style="opacity:.7;font-size:11px">${it['item-description']}</div>` : ''}
      </td>
      <td style="padding:8px;border-bottom:1px solid #e5e5e5;font-size:12px;text-align:right">${it.units || it.quantity || 1}</td>
      <td style="padding:8px;border-bottom:1px solid #e5e5e5;font-size:12px;text-align:right">${cur}${Number(it['item-base-price'] || it.unit_price || 0).toFixed(2)}</td>
      <td style="padding:8px;border-bottom:1px solid #e5e5e5;font-size:12px;text-align:right;font-weight:600">${cur}${Number(it['total-amount'] || it.subtotal || 0).toFixed(2)}</td>
    </tr>
  `).join('')

  return `<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8">
  <title>${label} ${code}</title>
  <style>
    @page { size: A4; margin: 15mm }
    @media print { .no-print { display: none !important } }
    * { box-sizing: border-box; margin: 0; padding: 0 }
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; color: #1a1a1a; background: #fff; font-size: 12px; line-height: 1.4 }
    .container { max-width: 180mm; margin: 0 auto; padding: 20px }
    .no-print { position: fixed; top: 10px; right: 10px; background: ${brand}; color: #fff; padding: 10px 16px; border-radius: 6px; cursor: pointer; font-weight: 600; font-size: 13px; border: none; box-shadow: 0 4px 12px rgba(0,0,0,.2); z-index: 100 }
    header { display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 24px; padding-bottom: 16px; border-bottom: 3px solid ${brand} }
    .logo { max-width: 140px; max-height: 60px }
    .company-info { text-align: right }
    .company-info strong { font-size: 18px; color: ${brand} }
    .company-info div { font-size: 11px; opacity: .75; margin-top: 2px }
    .doc-header { display: flex; justify-content: space-between; align-items: center; background: ${secondary}; color: #fff; padding: 12px 16px; border-radius: 6px; margin-bottom: 16px }
    .doc-header h1 { font-size: 18px; letter-spacing: 1px }
    .doc-header .code { font-family: monospace; font-size: 14px; opacity: .9 }
    .meta { display: grid; grid-template-columns: 1fr 1fr; gap: 20px; margin-bottom: 20px }
    .meta-box { padding: 12px; background: #fafafa; border-left: 3px solid ${brand}; border-radius: 4px }
    .meta-box .label { font-size: 10px; text-transform: uppercase; opacity: .6; margin-bottom: 4px }
    .meta-box strong { font-size: 13px }
    .meta-box .muted { font-size: 11px; opacity: .7; margin-top: 2px }
    table { width: 100%; border-collapse: collapse; margin-bottom: 20px }
    th { background: ${secondary}; color: #fff; padding: 8px; text-align: left; font-size: 11px; text-transform: uppercase; letter-spacing: .5px }
    th.right { text-align: right }
    .totals { margin-left: auto; width: 280px; margin-bottom: 20px }
    .totals > div { display: flex; justify-content: space-between; padding: 6px 12px; font-size: 12px }
    .totals .grand { background: ${brand}; color: #fff; padding: 10px 12px; font-size: 14px; font-weight: 700; border-radius: 4px; margin-top: 4px }
    footer { margin-top: 32px; padding-top: 16px; border-top: 1px solid #e5e5e5; font-size: 10px; opacity: .7; text-align: center }
    .notes { padding: 12px; background: #fff9f0; border: 1px solid ${brand}40; border-radius: 4px; margin-bottom: 16px; font-size: 11px }
  </style>
</head>
<body>
  <button class="no-print" onclick="window.print()">🖨️ Imprimir / Guardar PDF</button>

  <div class="container">
    <header>
      <div>
        ${c.logo_url ? `<img src="${c.logo_url}" class="logo" />` : `<div class="company-info"><strong>${c.trade_name || c.name || 'Mocciaro Soft'}</strong></div>`}
      </div>
      <div class="company-info">
        <strong>${c.trade_name || c.name}</strong>
        ${c.legal_name ? `<div>${c.legal_name}</div>` : ''}
        ${c.tax_id ? `<div>CIF/NIF/CUIT: ${c.tax_id}</div>` : ''}
        ${c.address ? `<div>${c.address}${c.city ? ', ' + c.city : ''}${c.postal_code ? ' — ' + c.postal_code : ''}</div>` : ''}
        ${c.country ? `<div>${c.country}</div>` : ''}
        ${c.phone ? `<div>📞 ${c.phone}</div>` : ''}
        ${c.email_main ? `<div>✉️ ${c.email_main}</div>` : ''}
        ${c.website ? `<div>🌐 ${c.website}</div>` : ''}
      </div>
    </header>

    <div class="doc-header">
      <h1>${label}</h1>
      <span class="code">${code}</span>
    </div>

    <div class="meta">
      <div class="meta-box">
        <div class="label">Cliente</div>
        <strong>${cli.legal_name || cli.name || '—'}</strong>
        ${cli.name && cli.legal_name ? `<div class="muted">${cli.name}</div>` : ''}
        ${cli.tax_id ? `<div class="muted">CIF/CUIT: ${cli.tax_id}</div>` : ''}
        ${cli.address ? `<div class="muted">${cli.address}${cli.city ? ', ' + cli.city : ''}</div>` : ''}
        ${cli.email ? `<div class="muted">${cli.email}</div>` : ''}
        ${cli.phone ? `<div class="muted">${cli.phone}</div>` : ''}
      </div>
      <div class="meta-box">
        <div class="label">Datos</div>
        <div><strong>Fecha:</strong> ${doc.invoice_date || doc.created_at?.slice(0, 10) || '—'}</div>
        ${doc.valid_until ? `<div><strong>Válido hasta:</strong> ${doc.valid_until.slice(0, 10)}</div>` : ''}
        ${doc.incoterm ? `<div><strong>Incoterm:</strong> ${doc.incoterm}</div>` : ''}
        ${doc.payment_terms ? `<div><strong>Cond. pago:</strong> ${doc.payment_terms}</div>` : ''}
        ${doc.cae ? `<div><strong>CAE:</strong> ${doc.cae}</div>` : ''}
        ${doc.client_po_reference ? `<div><strong>OC cliente:</strong> ${doc.client_po_reference}</div>` : ''}
      </div>
    </div>

    ${doc.notes ? `<div class="notes">${doc.notes}</div>` : ''}

    <table>
      <thead>
        <tr>
          <th>Código</th>
          <th>Descripción</th>
          <th class="right">Cant.</th>
          <th class="right">Precio</th>
          <th class="right">Subtotal</th>
        </tr>
      </thead>
      <tbody>
        ${rowsHtml || `<tr><td colspan="5" style="padding:20px;text-align:center;opacity:.6">Sin items</td></tr>`}
      </tbody>
    </table>

    <div class="totals">
      <div><span>Subtotal</span><strong>${cur}${Number(doc.subtotal || 0).toFixed(2)}</strong></div>
      ${Number(doc.tax_amount) ? `<div><span>Impuestos (${doc.tax_rate || 21}%)</span><strong>${cur}${Number(doc.tax_amount).toFixed(2)}</strong></div>` : ''}
      <div class="grand"><span>TOTAL</span><span>${cur}${Number(doc.total || 0).toFixed(2)}</span></div>
    </div>

    ${c.bank_details ? `
      <div class="meta-box" style="margin-top:16px">
        <div class="label">Datos bancarios</div>
        <div style="white-space:pre-line;font-size:11px">${c.bank_details}</div>
      </div>
    ` : ''}

    <footer>
      ${c.footer_note || `Documento generado por Mocciaro Soft ERP · ${new Date().toLocaleDateString('es-AR')}`}
    </footer>
  </div>
</body>
</html>`
}
