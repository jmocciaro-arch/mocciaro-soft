/**
 * Preview del motor de render SIN Supabase.
 * Construye un RenderContext con datos fake y escribe el HTML resultante a
 *   scripts/out/sample-document.html
 *
 * Uso:
 *   npx tsx scripts/preview-document-html.ts
 *   open scripts/out/sample-document.html
 */

import { mkdirSync, writeFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { renderA4Document, type RenderContext } from '../src/lib/documents/template-a4'

const ctx: RenderContext = {
  document: {
    id: '0000-sample',
    doc_type: 'quote',
    doc_code: '2026 04 16 COTI-TT.2026.000123',
    doc_number: 123,
    doc_date: '2026-04-16',
    due_date: null,
    valid_until: '2026-05-16',
    status: 'issued',
    currency_code: 'EUR',
    exchange_rate: 1,
    notes: 'Plazo de entrega: 15 días hábiles desde confirmación. Stock sujeto a disponibilidad.',
    external_ref: 'REF-8822',
    customer_po_number: null,
  },
  lines: [
    {
      line_number: 1,
      product_sku: 'TQ-BAR-12',
      product_name: 'Llave dinamométrica 1/2" 20-200 Nm',
      description: 'Cabezal reversible. Escala dual Nm / ft·lb. Certificado trazable incluido.',
      quantity: 2,
      unit: 'u',
      unit_price: 289.5,
      discount_pct: 10,
      discount_amount: 57.9,
      tax_rate: 21,
      tax_amount: 109.42,
      subtotal: 521.1,
      total: 630.52,
      attributes: { Torque: '20-200 Nm', Drive: '1/2"', Marca: 'Torqueleader' },
      image_url: null,
      notes: null,
    },
    {
      line_number: 2,
      product_sku: 'TQ-CAL-K50',
      product_name: 'Kit de calibración portátil',
      description: 'Incluye maletín, transductor y software de reporte PDF.',
      quantity: 1,
      unit: 'u',
      unit_price: 1850,
      discount_pct: 0,
      discount_amount: 0,
      tax_rate: 21,
      tax_amount: 388.5,
      subtotal: 1850,
      total: 2238.5,
      attributes: { Rango: 'Hasta 1000 Nm', Conectividad: 'USB-C' },
      image_url: null,
      notes: 'Entrega coordinada con logística interna.',
    },
  ],
  company: {
    id: 'co-1',
    name: 'TorqueTools SL',
    code_prefix: 'TT',
    logo_url: null,
    tax_id: 'B12345678',
    tax_id_type: 'CIF',
    fiscal_address: 'C/ Ejemplo 12, 28001 Madrid, ES',
    email_billing: 'facturacion@torquetools.es',
    timezone: 'Europe/Madrid',
  },
  config: {
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
    signature_required: true,
    qr_enabled: true,
    qr_payload_template: '{doc_code}|{company_tax_id}|{total}|{currency}',
    default_header_note: 'Gracias por confiar en TorqueTools. Todos los precios en EUR sin IVA salvo indicación.',
    default_footer_note: 'TorqueTools SL · CIF B12345678 · www.torquetools.es',
    terms_and_conditions:
      'Oferta válida durante 30 días. Forma de pago: transferencia 50% anticipo, 50% contra entrega.\n' +
      'Garantía de fábrica 12 meses. Jurisdicción: Madrid.',
  },
  counterparty: {
    type: 'customer',
    name: 'ACME Industrial S.A.',
    tax_id: 'A98765432',
    email: 'compras@acme.example',
    address: 'Polígono Norte s/n, 08040 Barcelona, ES',
  },
  totals: {
    subtotal: 2371.1,
    discount_total: 57.9,
    tax_total: 497.92,
    total: 2869.02,
  },
  meta: {
    renderedAt: new Date(),
    locale: 'es-ES',
  },
}

const html = renderA4Document(ctx)
const out = join(process.cwd(), 'scripts', 'out', 'sample-document.html')
mkdirSync(dirname(out), { recursive: true })
writeFileSync(out, html, 'utf8')
console.log(`OK: ${out}`)
console.log(`Tamaño: ${html.length} chars`)
