/**
 * Fases de migración StelOrder → Mocciaro Soft
 *
 * Cada fase:
 *   - lee una entidad de StelOrder (paginado)
 *   - mapea campos
 *   - upsert en Supabase por stelorder_id
 *   - actualiza tt_migration_log con progreso
 */

import { SupabaseClient } from '@supabase/supabase-js'
import { StelOrderClient } from './stelorder-client'

export interface PhaseContext {
  stel: StelOrderClient
  supabase: SupabaseClient
  companyId: string
  logId: string  // tt_migration_log.id
  onProgress?: (processed: number, total: number) => void
}

export interface PhaseResult {
  processed: number
  inserted: number
  updated: number
  skipped: number
  errors: number
  errorLog: Array<{ ref: string; error: string }>
}

// ═══════════════════════════════════════════════════════════════════
// Helper de upsert con tracking
// ═══════════════════════════════════════════════════════════════════
async function upsert(
  supabase: SupabaseClient,
  table: string,
  rows: any[],
  onConflict: string = 'stelorder_id'
): Promise<{ inserted: number; updated: number; errors: number; errorLog: Array<{ ref: string; error: string }> }> {
  let inserted = 0, updated = 0, errors = 0
  const errorLog: Array<{ ref: string; error: string }> = []

  // Upsert en batches de 100 para no saturar
  for (let i = 0; i < rows.length; i += 100) {
    const batch = rows.slice(i, i + 100)
    const { data, error } = await supabase
      .from(table)
      .upsert(batch, { onConflict, ignoreDuplicates: false })
      .select('id, stelorder_id')

    if (error) {
      errors += batch.length
      errorLog.push({ ref: `batch@${i}`, error: error.message })
    } else if (data) {
      inserted += data.length
    }
  }

  return { inserted, updated, errors, errorLog }
}

// ═══════════════════════════════════════════════════════════════════
// FASE 1 — Datos maestros
// ═══════════════════════════════════════════════════════════════════

export async function phase1_warehouses(ctx: PhaseContext): Promise<PhaseResult> {
  const data = await ctx.stel.getWarehouses()
  ctx.onProgress?.(0, data.length)
  const rows = data.map((w: any) => ({
    stelorder_id: w.id,
    name: w.name || 'Almacén',
    code: w.reference || `WH-${w.id}`,
    company_id: ctx.companyId,
    active: w.deleted !== true,
  }))
  const r = await upsert(ctx.supabase, 'tt_warehouses', rows)
  ctx.onProgress?.(data.length, data.length)
  return { processed: data.length, inserted: r.inserted, updated: r.updated, skipped: 0, errors: r.errors, errorLog: r.errorLog }
}

// ═══════════════════════════════════════════════════════════════════
// FASE 2 — Maestros de negocio
// ═══════════════════════════════════════════════════════════════════

export async function phase2_suppliers(ctx: PhaseContext): Promise<PhaseResult> {
  const data = await ctx.stel.getSuppliers()
  ctx.onProgress?.(0, data.length)
  const rows = data.map((s: any) => ({
    stelorder_id: s.id,
    name: s.name || s['legal-name'] || `Proveedor ${s.id}`,
    legal_name: s['legal-name'],
    tax_id: s['tax-identification-number'],
    email: s.email,
    phone: s.phone,
    address: s['main-address'],
    reference: s.reference,
    company_id: ctx.companyId,
    active: s.deleted !== true,
  }))
  const r = await upsert(ctx.supabase, 'tt_suppliers', rows)
  ctx.onProgress?.(data.length, data.length)
  return { processed: data.length, inserted: r.inserted, updated: r.updated, skipped: 0, errors: r.errors, errorLog: r.errorLog }
}

export async function phase2_clients(ctx: PhaseContext): Promise<PhaseResult> {
  const data = await ctx.stel.getClients()
  ctx.onProgress?.(0, data.length)
  const rows = data.map((c: any) => ({
    stelorder_id: c.id,
    name: c.name || c['legal-name'] || `Cliente ${c.id}`,
    legal_name: c['legal-name'],
    tax_id: c['tax-identification-number'],
    email: c.email,
    phone: c.phone,
    address: c['main-address'],
    reference: c.reference,
    currency: c['currency-code'] || 'EUR',
    discount_pct: c['discount-percentage'] || 0,
    company_id: ctx.companyId,
    active: c.deleted !== true,
    source: 'stelorder',
  }))
  const r = await upsert(ctx.supabase, 'tt_clients', rows)
  ctx.onProgress?.(data.length, data.length)
  return { processed: data.length, inserted: r.inserted, updated: r.updated, skipped: 0, errors: r.errors, errorLog: r.errorLog }
}

export async function phase2_potential_clients(ctx: PhaseContext): Promise<PhaseResult> {
  const data = await ctx.stel.getPotentialClients()
  ctx.onProgress?.(0, data.length)
  const rows = data.map((c: any) => ({
    stelorder_id: c.id,
    name: c.name || `Lead ${c.id}`,
    company_name: c['legal-name'],
    email: c.email,
    phone: c.phone,
    source: c.source || 'stelorder_import',
    status: 'new',
    company_id: ctx.companyId,
    raw_message: c.comments || c.description,
  }))
  const r = await upsert(ctx.supabase, 'tt_leads', rows)
  ctx.onProgress?.(data.length, data.length)
  return { processed: data.length, inserted: r.inserted, updated: r.updated, skipped: 0, errors: r.errors, errorLog: r.errorLog }
}

export async function phase2_contacts(ctx: PhaseContext): Promise<PhaseResult> {
  const data = await ctx.stel.getContacts()
  ctx.onProgress?.(0, data.length)
  // Necesitamos resolver client_id desde stelorder_id (account-id)
  const { data: clientMap } = await ctx.supabase
    .from('tt_clients')
    .select('id, stelorder_id')
    .not('stelorder_id', 'is', null)
  const map = new Map<number, string>((clientMap || []).map((c: any) => [c.stelorder_id, c.id]))

  const rows = data.map((c: any) => ({
    stelorder_id: c.id,
    client_id: map.get(c['account-id']) || null,
    name: [c['first-name'], c['last-name']].filter(Boolean).join(' ') || c.name,
    email: c.email,
    phone: c.phone,
    position: c.position || c['job-title'],
    company_id: ctx.companyId,
  })).filter((r: any) => r.client_id)  // Solo contactos vinculados a clientes migrados
  const r = await upsert(ctx.supabase, 'tt_client_contacts', rows)
  ctx.onProgress?.(data.length, data.length)
  return { processed: data.length, inserted: r.inserted, updated: r.updated, skipped: data.length - rows.length, errors: r.errors, errorLog: r.errorLog }
}

// ═══════════════════════════════════════════════════════════════════
// FASE 3 — Catálogo
// ═══════════════════════════════════════════════════════════════════

export async function phase3_products(ctx: PhaseContext): Promise<PhaseResult> {
  const data = await ctx.stel.getProducts()
  ctx.onProgress?.(0, data.length)
  const rows = data.map((p: any) => ({
    stelorder_id: p.id,
    sku: p.reference || `STEL-${p.id}`,
    name: p.name || `Producto ${p.id}`,
    description: p.description,
    price_eur: p['sales-price'] || 0,
    cost_eur: p['purchase-price'] || 0,
    barcode: p.barcode,
    category: 'Importado StelOrder',
    active: p.deleted !== true,
    company_id: ctx.companyId,
    specs: {
      tax_pct: p['primary-tax-percentage'],
      stock_real: p['real-stock'],
      stock_virtual: p['virtual-stock'],
      stock_enabled: p['stock-enabled'],
    },
  }))
  const r = await upsert(ctx.supabase, 'tt_products', rows)
  ctx.onProgress?.(data.length, data.length)
  return { processed: data.length, inserted: r.inserted, updated: r.updated, skipped: 0, errors: r.errors, errorLog: r.errorLog }
}

export async function phase3_services(ctx: PhaseContext): Promise<PhaseResult> {
  const data = await ctx.stel.getServices()
  ctx.onProgress?.(0, data.length)
  const rows = data.map((p: any) => ({
    stelorder_id: p.id,
    sku: p.reference || `SERV-${p.id}`,
    name: p.name || `Servicio ${p.id}`,
    description: p.description,
    price_eur: p['sales-price'] || 0,
    cost_eur: p['purchase-price'] || 0,
    category: 'Servicios (StelOrder)',
    active: p.deleted !== true,
    company_id: ctx.companyId,
    specs: { type: 'service', tax_pct: p['primary-tax-percentage'] },
  }))
  const r = await upsert(ctx.supabase, 'tt_products', rows)
  ctx.onProgress?.(data.length, data.length)
  return { processed: data.length, inserted: r.inserted, updated: r.updated, skipped: 0, errors: r.errors, errorLog: r.errorLog }
}

// ═══════════════════════════════════════════════════════════════════
// FASE 4 — Documentos de venta
// ═══════════════════════════════════════════════════════════════════

async function upsertDocument(ctx: PhaseContext, rows: any[]): Promise<PhaseResult> {
  const r = await upsert(ctx.supabase, 'tt_documents', rows)
  ctx.onProgress?.(rows.length, rows.length)
  return { processed: rows.length, inserted: r.inserted, updated: r.updated, skipped: 0, errors: r.errors, errorLog: r.errorLog }
}

/**
 * Helper: extrae referencia de OC del cliente desde el campo `title` o `comments`
 * Ej: "OC4700061269" o "Pedido 12345" o comments con "Ref. OC: XYZ"
 */
function extractClientPO(doc: any): string | null {
  const candidates = [doc.title, doc.comments, doc.addendum, doc['private-comments']].filter(Boolean)
  for (const txt of candidates) {
    const str = String(txt)
    // Patrón 1: OC + dígitos (tipo "OC4700061269" o "OC 4700061269")
    const m1 = str.match(/\bOC[\s-]*(\d{5,})\b/i)
    if (m1) return `OC${m1[1]}`
    // Patrón 2: PO + dígitos
    const m2 = str.match(/\bPO[\s-]*(\d{5,})\b/i)
    if (m2) return `PO${m2[1]}`
    // Patrón 3: "pedido/orden N°XXX" o "orden de compra XXX"
    const m3 = str.match(/\b(?:pedido|orden(?:\s+de\s+compra)?)[\s:N°#]*(\w+)\b/i)
    if (m3 && /\d/.test(m3[1])) return m3[1]
  }
  return null
}

export async function phase4_sales_estimates(ctx: PhaseContext): Promise<PhaseResult> {
  const data = await ctx.stel.getSalesEstimates()
  ctx.onProgress?.(0, data.length)
  const { data: clientMap } = await ctx.supabase.from('tt_clients').select('id, stelorder_id').not('stelorder_id', 'is', null)
  const map = new Map<number, string>((clientMap || []).map((c: any) => [c.stelorder_id, c.id]))

  const rows = data.map((d: any) => ({
    stelorder_id: d.id,
    stelorder_reference: d['full-reference'],
    parent_stelorder_id: d['parent-document-id'],
    stelorder_pdf_original_url: d['pdf-path'],
    doc_type: 'cotizacion',
    legal_number: d['full-reference'] || d.reference,
    client_id: map.get(d['account-id']) || null,
    company_id: ctx.companyId,
    subtotal: d['subtotal-amount'] || 0,
    tax_amount: d['tax-total-amount'] || 0,
    total: d['total-amount'] || 0,
    currency: d['currency-code'] || 'EUR',
    status: d.settled ? 'accepted' : 'draft',
    notes: d.comments,
    client_po_reference: extractClientPO(d),
    created_at: d.date || new Date().toISOString(),
    metadata: { stelorder_raw: d, lines: d.lines || [] },
  }))
  return await upsertDocument(ctx, rows)
}

export async function phase4_sales_orders(ctx: PhaseContext): Promise<PhaseResult> {
  const data = await ctx.stel.getSalesOrders()
  ctx.onProgress?.(0, data.length)
  const { data: clientMap } = await ctx.supabase.from('tt_clients').select('id, stelorder_id').not('stelorder_id', 'is', null)
  const map = new Map<number, string>((clientMap || []).map((c: any) => [c.stelorder_id, c.id]))

  const rows = data.map((d: any) => ({
    stelorder_id: d.id,
    stelorder_reference: d['full-reference'],
    parent_stelorder_id: d['parent-document-id'],
    stelorder_pdf_original_url: d['pdf-path'],
    doc_type: 'pedido',
    legal_number: d['full-reference'] || d.reference,
    client_id: map.get(d['account-id']) || null,
    company_id: ctx.companyId,
    subtotal: d['subtotal-amount'] || 0,
    tax_amount: d['tax-total-amount'] || 0,
    total: d['total-amount'] || 0,
    currency: d['currency-code'] || 'EUR',
    status: d.settled ? 'completed' : 'open',
    notes: d.comments,
    client_po_reference: extractClientPO(d),
    created_at: d.date || new Date().toISOString(),
    metadata: { stelorder_raw: d, lines: d.lines || [] },
  }))
  return await upsertDocument(ctx, rows)
}

export async function phase4_delivery_notes(ctx: PhaseContext): Promise<PhaseResult> {
  const data = await ctx.stel.getSalesDeliveryNotes()
  ctx.onProgress?.(0, data.length)
  const { data: clientMap } = await ctx.supabase.from('tt_clients').select('id, stelorder_id').not('stelorder_id', 'is', null)
  const map = new Map<number, string>((clientMap || []).map((c: any) => [c.stelorder_id, c.id]))

  const rows = data.map((d: any) => {
    const fullRef = d['full-reference'] || d.reference || ''
    const isPackingList = /^PckList/i.test(fullRef)
    return {
      stelorder_id: d.id,
      stelorder_reference: fullRef,
      parent_stelorder_id: d['parent-document-id'],
      stelorder_pdf_original_url: d['pdf-path'],
      doc_type: isPackingList ? 'packing_list' : 'albaran',
      is_packing_list: isPackingList,
      legal_number: fullRef,
      client_id: map.get(d['account-id']) || null,
      company_id: ctx.companyId,
      subtotal: d['subtotal-amount'] || 0,
      tax_amount: d['tax-total-amount'] || 0,
      total: d['total-amount'] || 0,
      currency: d['currency-code'] || 'EUR',
      status: d.settled ? 'delivered' : 'prepared',
      notes: d.comments,
      // El campo TITLE del albarán suele tener la OC del cliente (ej "OC4700061269")
      client_po_reference: d.title || extractClientPO(d),
      created_at: d.date || new Date().toISOString(),
      metadata: { stelorder_raw: d, lines: d.lines || [], title: d.title },
    }
  })
  return await upsertDocument(ctx, rows)
}

export async function phase4_invoices(ctx: PhaseContext): Promise<PhaseResult> {
  const data = await ctx.stel.getOrdinaryInvoices()
  ctx.onProgress?.(0, data.length)
  const { data: clientMap } = await ctx.supabase.from('tt_clients').select('id, stelorder_id').not('stelorder_id', 'is', null)
  const map = new Map<number, string>((clientMap || []).map((c: any) => [c.stelorder_id, c.id]))

  const rows = data.map((d: any) => ({
    stelorder_id: d.id,
    stelorder_reference: d['full-reference'],
    parent_stelorder_id: d['parent-document-id'],
    stelorder_pdf_original_url: d['pdf-path'],
    doc_type: 'factura',
    legal_number: d['full-reference'] || d.reference,
    invoice_number: d['full-reference'] || d.reference,
    invoice_date: d.date,
    invoice_total: d['total-amount'] || 0,
    invoice_currency: d['currency-code'] || 'EUR',
    client_id: map.get(d['account-id']) || null,
    company_id: ctx.companyId,
    subtotal: d['subtotal-amount'] || 0,
    tax_amount: d['tax-total-amount'] || 0,
    total: d['total-amount'] || 0,
    currency: d['currency-code'] || 'EUR',
    status: d.settled || (d['remaining-total-amount'] === 0) ? 'cobrada' : 'emitida',
    invoice_method: 'external',
    notes: d.comments,
    // En facturas la OC puede estar en title, comments, o addendum
    client_po_reference: extractClientPO(d),
    created_at: d.date || new Date().toISOString(),
    metadata: {
      stelorder_raw: d,
      lines: d.lines || [],
      verifactu_state: d['verifactu-state'],
      title: d.title,
    },
  }))
  return await upsertDocument(ctx, rows)
}

export async function phase4_refund_invoices(ctx: PhaseContext): Promise<PhaseResult> {
  const data = await ctx.stel.getRefundInvoices()
  ctx.onProgress?.(0, data.length)
  const { data: clientMap } = await ctx.supabase.from('tt_clients').select('id, stelorder_id').not('stelorder_id', 'is', null)
  const map = new Map<number, string>((clientMap || []).map((c: any) => [c.stelorder_id, c.id]))

  const rows = data.map((d: any) => ({
    stelorder_id: d.id,
    doc_type: 'nota_credito',
    legal_number: d['full-reference'] || d.reference,
    client_id: map.get(d['account-id']) || null,
    company_id: ctx.companyId,
    total: d['total-amount'] || 0,
    currency: 'EUR',
    status: 'emitida',
    created_at: d.date || new Date().toISOString(),
    metadata: { stelorder_raw: d },
  }))
  return await upsertDocument(ctx, rows)
}

// ═══════════════════════════════════════════════════════════════════
// FASE 5 — Documentos de compra
// ═══════════════════════════════════════════════════════════════════

export async function phase5_purchase_orders(ctx: PhaseContext): Promise<PhaseResult> {
  const data = await ctx.stel.getPurchaseOrders()
  ctx.onProgress?.(0, data.length)
  const rows = data.map((d: any) => ({
    stelorder_id: d.id,
    doc_type: 'orden_compra',
    legal_number: d['full-reference'] || d.reference,
    company_id: ctx.companyId,
    subtotal: d['subtotal-amount'] || 0,
    tax_amount: d['tax-total-amount'] || 0,
    total: d['total-amount'] || 0,
    currency: 'EUR',
    status: d.settled ? 'received' : 'sent',
    created_at: d.date || new Date().toISOString(),
    metadata: { stelorder_raw: d, supplier_stelorder_id: d['account-id'], lines: d.lines || [] },
  }))
  return await upsertDocument(ctx, rows)
}

export async function phase5_purchase_delivery_notes(ctx: PhaseContext): Promise<PhaseResult> {
  const data = await ctx.stel.getPurchaseDeliveryNotes()
  ctx.onProgress?.(0, data.length)
  const rows = data.map((d: any) => ({
    stelorder_id: d.id,
    doc_type: 'albaran_compra',
    legal_number: d['full-reference'] || d.reference,
    company_id: ctx.companyId,
    subtotal: d['subtotal-amount'] || 0,
    total: d['total-amount'] || 0,
    currency: 'EUR',
    status: 'received',
    created_at: d.date || new Date().toISOString(),
    metadata: { stelorder_raw: d, supplier_stelorder_id: d['account-id'] },
  }))
  return await upsertDocument(ctx, rows)
}

export async function phase5_purchase_invoices(ctx: PhaseContext): Promise<PhaseResult> {
  const data = await ctx.stel.getPurchaseInvoices()
  ctx.onProgress?.(0, data.length)
  const rows = data.map((d: any) => ({
    stelorder_id: d.id,
    doc_type: 'factura_compra',
    legal_number: d['full-reference'] || d.reference,
    invoice_number: d['full-reference'] || d.reference,
    invoice_date: d.date,
    invoice_total: d['total-amount'] || 0,
    company_id: ctx.companyId,
    total: d['total-amount'] || 0,
    currency: 'EUR',
    status: d.settled ? 'pagada' : 'pendiente',
    created_at: d.date || new Date().toISOString(),
    metadata: { stelorder_raw: d, supplier_stelorder_id: d['account-id'] },
  }))
  return await upsertDocument(ctx, rows)
}

export async function phase5_expenses(ctx: PhaseContext): Promise<PhaseResult> {
  const data = await ctx.stel.getExpenses()
  ctx.onProgress?.(0, data.length)
  const rows = data.map((d: any) => ({
    stelorder_id: d.id,
    doc_type: 'gasto',
    legal_number: d['full-reference'] || d.reference,
    company_id: ctx.companyId,
    total: d['total-amount'] || 0,
    currency: 'EUR',
    status: 'registrado',
    created_at: d.date || new Date().toISOString(),
    metadata: { stelorder_raw: d },
  }))
  return await upsertDocument(ctx, rows)
}

// ═══════════════════════════════════════════════════════════════════
// FASE 6 — Cobros (recibos) y SAT
// ═══════════════════════════════════════════════════════════════════

export async function phase6_receipts(ctx: PhaseContext): Promise<PhaseResult> {
  const data = await ctx.stel.getOrdinaryInvoiceReceipts()
  ctx.onProgress?.(0, data.length)
  const { data: invoiceMap } = await ctx.supabase.from('tt_documents').select('id, stelorder_id').eq('doc_type', 'factura').not('stelorder_id', 'is', null)
  const map = new Map<number, string>((invoiceMap || []).map((d: any) => [d.stelorder_id, d.id]))

  // Update status de facturas cobradas
  let updated = 0
  for (const r of data) {
    if ((r.paid || r['paid-total-amount']) && r['original-element-id']) {
      const docId = map.get(r['original-element-id'])
      if (docId) {
        await ctx.supabase
          .from('tt_documents')
          .update({ status: 'cobrada', metadata: { payment: { amount: r.amount, date: r['payment-date'], stelorder_receipt_id: r.id } } })
          .eq('id', docId)
        updated++
      }
    }
  }
  ctx.onProgress?.(data.length, data.length)
  return { processed: data.length, inserted: 0, updated, skipped: data.length - updated, errors: 0, errorLog: [] }
}

export async function phase6_incidents_sat(ctx: PhaseContext): Promise<PhaseResult> {
  const data = await ctx.stel.getIncidents()
  if (data.length === 0) return { processed: 0, inserted: 0, updated: 0, skipped: 0, errors: 0, errorLog: [] }

  ctx.onProgress?.(0, data.length)
  const rows = data.map((d: any) => ({
    stelorder_id: d.id,
    title: d.title || d.subject || `Incidencia ${d.id}`,
    description: d.description,
    status: d.status || 'open',
    company_id: ctx.companyId,
    metadata: { stelorder_raw: d },
  }))
  const r = await upsert(ctx.supabase, 'tt_sat_tickets', rows)
  ctx.onProgress?.(data.length, data.length)
  return { processed: data.length, inserted: r.inserted, updated: r.updated, skipped: 0, errors: r.errors, errorLog: r.errorLog }
}

// ═══════════════════════════════════════════════════════════════════
// FASE 7 — LINKEO entre documentos (presupuesto→pedido→factura, OC cliente)
// ═══════════════════════════════════════════════════════════════════

export async function phase7_link_documents(ctx: PhaseContext): Promise<PhaseResult> {
  const { data: docs } = await ctx.supabase
    .from('tt_documents')
    .select('id, doc_type, stelorder_id, parent_stelorder_id, client_po_reference, notes')
    .eq('company_id', ctx.companyId)
    .not('stelorder_id', 'is', null)
  if (!docs) return { processed: 0, inserted: 0, updated: 0, skipped: 0, errors: 0, errorLog: [] }

  ctx.onProgress?.(0, docs.length)
  const byStelId = new Map<number, { id: string; type: string }>()
  for (const d of docs as any[]) byStelId.set(d.stelorder_id, { id: d.id, type: d.doc_type })

  const linksToInsert: Array<{ parent_id: string; child_id: string; relation_type: string }> = []
  let withParent = 0, withPO = 0, orphans = 0

  for (const d of docs as any[]) {
    if (d.parent_stelorder_id) {
      const parent = byStelId.get(d.parent_stelorder_id)
      if (parent) {
        linksToInsert.push({ parent_id: parent.id, child_id: d.id, relation_type: `${parent.type}_to_${d.doc_type}` })
        withParent++
      } else orphans++
    }

    // Albarán ↔ Pedido por OC del cliente (title del albarán)
    if (d.doc_type === 'albaran' && d.client_po_reference) {
      const { data: matchingOrders } = await ctx.supabase
        .from('tt_documents')
        .select('id')
        .eq('company_id', ctx.companyId)
        .eq('doc_type', 'pedido')
        .or(`client_po_reference.eq.${d.client_po_reference},notes.ilike.%${d.client_po_reference}%`)
        .limit(1)
      if (matchingOrders && matchingOrders[0]) {
        linksToInsert.push({ parent_id: matchingOrders[0].id, child_id: d.id, relation_type: 'pedido_to_albaran' })
        withPO++
      }
    }
  }

  let inserted = 0
  for (let i = 0; i < linksToInsert.length; i += 100) {
    const batch = linksToInsert.slice(i, i + 100)
    const { data } = await ctx.supabase
      .from('tt_document_relations')
      .upsert(batch, { onConflict: 'parent_id,child_id,relation_type', ignoreDuplicates: true })
      .select('id')
    if (data) inserted += data.length
  }

  ctx.onProgress?.(docs.length, docs.length)
  return {
    processed: docs.length, inserted, updated: 0, skipped: orphans, errors: 0,
    errorLog: [{ ref: 'summary', error: `withParent=${withParent}, withPO=${withPO}, orphans=${orphans}` }],
  }
}

// ═══════════════════════════════════════════════════════════════════
// FASE 8 — DESCARGA DE PDFs (albaranes, facturas, packing lists)
// ═══════════════════════════════════════════════════════════════════

export async function phase8_download_pdfs(ctx: PhaseContext): Promise<PhaseResult> {
  const { data: docs } = await ctx.supabase
    .from('tt_documents')
    .select('id, stelorder_id, doc_type, stelorder_reference, stelorder_pdf_original_url, stelorder_pdf_url')
    .eq('company_id', ctx.companyId)
    .in('doc_type', ['albaran', 'factura', 'packing_list', 'factura_compra', 'albaran_compra', 'nota_credito'])
    .not('stelorder_pdf_original_url', 'is', null)
    .is('stelorder_pdf_url', null)
  if (!docs || docs.length === 0) return { processed: 0, inserted: 0, updated: 0, skipped: 0, errors: 0, errorLog: [] }

  ctx.onProgress?.(0, docs.length)
  let downloaded = 0, errors = 0
  const errorLog: Array<{ ref: string; error: string }> = []

  for (let i = 0; i < docs.length; i++) {
    const d = docs[i] as any
    try {
      const res = await fetch(d.stelorder_pdf_original_url, { headers: { Accept: 'application/pdf' } })
      if (!res.ok) { errors++; errorLog.push({ ref: d.stelorder_reference, error: `HTTP ${res.status}` }); continue }
      const blob = new Uint8Array(await res.arrayBuffer())
      const safeName = (d.stelorder_reference || `DOC-${d.stelorder_id}`).replace(/[^\w.-]/g, '_')
      const path = `${ctx.companyId}/${d.doc_type}/${safeName}.pdf`

      const { error: upErr } = await ctx.supabase.storage
        .from('stelorder-pdfs')
        .upload(path, blob, { contentType: 'application/pdf', upsert: true })
      if (upErr) { errors++; errorLog.push({ ref: d.stelorder_reference, error: upErr.message }); continue }

      const { data: pub } = ctx.supabase.storage.from('stelorder-pdfs').getPublicUrl(path)
      await ctx.supabase.from('tt_documents').update({ stelorder_pdf_url: pub.publicUrl }).eq('id', d.id)
      downloaded++
    } catch (e) {
      errors++
      errorLog.push({ ref: d.stelorder_reference, error: (e as Error).message })
    }
    if (i % 10 === 0) ctx.onProgress?.(i, docs.length)
    if (i % 20 === 19) await new Promise(r => setTimeout(r, 1000))
  }

  ctx.onProgress?.(docs.length, docs.length)
  return { processed: docs.length, inserted: downloaded, updated: downloaded, skipped: 0, errors, errorLog: errorLog.slice(0, 50) }
}

// ═══════════════════════════════════════════════════════════════════
// Registro de todas las fases
// ═══════════════════════════════════════════════════════════════════

export const PHASES: Array<{ id: string; label: string; entity: string; fn: (ctx: PhaseContext) => Promise<PhaseResult> }> = [
  { id: '1a_warehouses',      label: 'Almacenes',              entity: 'warehouses',            fn: phase1_warehouses },
  { id: '2a_suppliers',       label: 'Proveedores',            entity: 'suppliers',             fn: phase2_suppliers },
  { id: '2b_potential_clients', label: 'Clientes potenciales', entity: 'potentialClients',      fn: phase2_potential_clients },
  { id: '2c_clients',         label: 'Clientes',               entity: 'clients',               fn: phase2_clients },
  { id: '2d_contacts',        label: 'Contactos',              entity: 'contacts',              fn: phase2_contacts },
  { id: '3a_products',        label: 'Productos',              entity: 'products',              fn: phase3_products },
  { id: '3b_services',        label: 'Servicios',              entity: 'services',              fn: phase3_services },
  { id: '4a_sales_estimates', label: 'Presupuestos',           entity: 'salesEstimates',        fn: phase4_sales_estimates },
  { id: '4b_sales_orders',    label: 'Pedidos de venta',       entity: 'salesOrders',           fn: phase4_sales_orders },
  { id: '4c_delivery_notes',  label: 'Albaranes de venta',     entity: 'salesDeliveryNotes',    fn: phase4_delivery_notes },
  { id: '4d_invoices',        label: 'Facturas',               entity: 'ordinaryInvoices',      fn: phase4_invoices },
  { id: '4e_refund_invoices', label: 'Facturas de abono',      entity: 'refundInvoices',        fn: phase4_refund_invoices },
  { id: '5a_purchase_orders', label: 'Pedidos de compra',      entity: 'purchaseOrders',        fn: phase5_purchase_orders },
  { id: '5b_purchase_deliv',  label: 'Albaranes de compra',    entity: 'purchaseDeliveryNotes', fn: phase5_purchase_delivery_notes },
  { id: '5c_purchase_invoices', label: 'Facturas de compra',   entity: 'purchaseInvoices',      fn: phase5_purchase_invoices },
  { id: '5d_expenses',        label: 'Gastos',                 entity: 'expenses',              fn: phase5_expenses },
  { id: '6a_receipts',        label: 'Recibos / cobros',       entity: 'ordinaryInvoiceReceipts', fn: phase6_receipts },
  { id: '6b_incidents_sat',   label: 'Incidencias SAT',        entity: 'incidents',             fn: phase6_incidents_sat },
  { id: '7_link_documents',   label: 'Linkeo entre documentos (COT→PED→FAC + OC cliente)', entity: 'document_links', fn: phase7_link_documents },
  { id: '8_download_pdfs',    label: 'Descargar PDFs (albarán/factura/packing)',            entity: 'pdfs', fn: phase8_download_pdfs },
]
