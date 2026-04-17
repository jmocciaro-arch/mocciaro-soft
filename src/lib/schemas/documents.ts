import { z } from 'zod'

// -----------------------------------------------------------------------------
// Constantes canónicas. Deben coincidir con los CHECK de la migración v37.
// -----------------------------------------------------------------------------
export const DOC_TYPES = [
  'quote',
  'sales_order',
  'purchase_order',
  'delivery_note',
  'invoice',
  'proforma',
  'receipt',
  'internal',
  'credit_note',
  'debit_note',
] as const
export type DocType = (typeof DOC_TYPES)[number]

export const DOC_DIRECTIONS = ['sales', 'purchase', 'internal'] as const
export type DocDirection = (typeof DOC_DIRECTIONS)[number]

export const DOC_STATUSES = [
  'draft',
  'issued',
  'sent',
  'accepted',
  'rejected',
  'partially_delivered',
  'delivered',
  'partially_invoiced',
  'invoiced',
  'paid',
  'cancelled',
  'voided',
] as const
export type DocStatus = (typeof DOC_STATUSES)[number]

export const RELATION_TYPES = [
  'converted_to',
  'delivered_as',
  'invoiced_as',
  'paid_by',
  'amended_by',
  'cancelled_by',
  'copied_from',
  'split_into',
  'merged_into',
] as const
export type RelationType = (typeof RELATION_TYPES)[number]

export const COUNTERPARTY_TYPES = ['customer', 'supplier', 'internal', 'other'] as const

// Sigla corta por tipo, usada por el motor de nombres
export const DOC_TYPE_SHORT: Record<DocType, string> = {
  quote: 'COTI',
  sales_order: 'OV',
  purchase_order: 'OC',
  delivery_note: 'REM',
  invoice: 'FAC',
  proforma: 'PROF',
  receipt: 'REC',
  internal: 'INT',
  credit_note: 'NC',
  debit_note: 'ND',
}

// Dirección canónica por tipo (para fijarla al crear si no se envía explícita)
export const DOC_TYPE_DIRECTION: Record<DocType, DocDirection> = {
  quote: 'sales',
  sales_order: 'sales',
  delivery_note: 'sales',
  invoice: 'sales',
  proforma: 'sales',
  receipt: 'sales',
  credit_note: 'sales',
  debit_note: 'sales',
  purchase_order: 'purchase',
  internal: 'internal',
}

// -----------------------------------------------------------------------------
// Transiciones de estado permitidas
// -----------------------------------------------------------------------------
export const ALLOWED_TRANSITIONS: Record<DocStatus, DocStatus[]> = {
  draft: ['issued', 'cancelled'],
  issued: ['sent', 'accepted', 'rejected', 'partially_delivered', 'delivered', 'partially_invoiced', 'invoiced', 'paid', 'cancelled', 'voided'],
  sent: ['accepted', 'rejected', 'partially_delivered', 'delivered', 'partially_invoiced', 'invoiced', 'paid', 'cancelled', 'voided'],
  accepted: ['partially_delivered', 'delivered', 'partially_invoiced', 'invoiced', 'paid', 'cancelled', 'voided'],
  rejected: ['cancelled'],
  partially_delivered: ['delivered', 'partially_invoiced', 'invoiced', 'cancelled', 'voided'],
  delivered: ['partially_invoiced', 'invoiced', 'paid', 'voided'],
  partially_invoiced: ['invoiced', 'paid', 'voided'],
  invoiced: ['paid', 'voided'],
  paid: ['voided'],
  cancelled: [],
  voided: [],
}

// Matriz de derivaciones: source_type -> targets permitidos con relation_type
export const ALLOWED_DERIVATIONS: Record<DocType, Array<{ target: DocType; relation: RelationType }>> = {
  quote:          [{ target: 'sales_order',   relation: 'converted_to' }],
  sales_order:    [{ target: 'delivery_note', relation: 'delivered_as' },
                   { target: 'invoice',       relation: 'invoiced_as' },
                   { target: 'proforma',      relation: 'copied_from' }],
  delivery_note:  [{ target: 'invoice',       relation: 'invoiced_as' }],
  invoice:        [{ target: 'receipt',       relation: 'paid_by' },
                   { target: 'credit_note',   relation: 'amended_by' },
                   { target: 'debit_note',    relation: 'amended_by' }],
  proforma:       [{ target: 'invoice',       relation: 'invoiced_as' }],
  purchase_order: [{ target: 'delivery_note', relation: 'delivered_as' },
                   { target: 'invoice',       relation: 'invoiced_as' }],
  receipt:        [],
  internal:       [],
  credit_note:    [],
  debit_note:     [],
}

export function canTransition(from: DocStatus, to: DocStatus): boolean {
  if (from === to) return true
  return ALLOWED_TRANSITIONS[from]?.includes(to) ?? false
}

export function canDerive(from: DocType, to: DocType): { ok: true; relation: RelationType } | { ok: false; reason: string } {
  const allowed = ALLOWED_DERIVATIONS[from] ?? []
  const match = allowed.find((a) => a.target === to)
  if (!match) return { ok: false, reason: `No se permite derivar ${from} → ${to}` }
  return { ok: true, relation: match.relation }
}

// -----------------------------------------------------------------------------
// MOTOR DE NOMBRES — renderDocumentCode
// -----------------------------------------------------------------------------
export interface NameContext {
  docType: DocType
  prefix: string | null | undefined      // tt_companies.code_prefix o config override
  docDate: Date | string                 // fecha del documento
  number: number                         // correlativo asignado al emitir
  year: number                           // año contable (usado en {year})
  counterparty?: string | null
  currency?: string | null
  companyName?: string | null
  numberPadding?: number                 // default 6, si el template usa {number} sin padding
}

/**
 * Renderiza el código humano del documento.
 *
 * Tokens soportados en la plantilla:
 *   {date:YYYY} {date:MM} {date:DD} {date}      (YYYY-MM-DD)
 *   {type}                                      (sigla corta: COTI, FAC, etc.)
 *   {prefix}                                    (code_prefix de la empresa)
 *   {year}
 *   {number:N}                                  (número con padding N)
 *   {number}                                    (sin padding o con numberPadding por defecto)
 *   {counterparty} {currency} {company}
 *
 * Ejemplo:
 *   plantilla: "{date:YYYY} {date:MM} {date:DD} {type}-{prefix}.{year}.{number:6}"
 *   salida:    "2026 04 16 COTI-TT.2026.000123"
 */
export function renderDocumentCode(template: string, ctx: NameContext): string {
  const d = typeof ctx.docDate === 'string' ? new Date(ctx.docDate) : ctx.docDate
  if (Number.isNaN(d.getTime())) throw new Error('docDate inválido para renderDocumentCode')

  const pad2 = (n: number) => String(n).padStart(2, '0')
  const typeShort = DOC_TYPE_SHORT[ctx.docType] ?? ctx.docType.toUpperCase()

  let out = template
    .replace(/\{date:YYYY\}/g, String(d.getFullYear()))
    .replace(/\{date:MM\}/g, pad2(d.getMonth() + 1))
    .replace(/\{date:DD\}/g, pad2(d.getDate()))
    .replace(/\{date\}/g, d.toISOString().slice(0, 10))
    .replace(/\{type\}/g, typeShort)
    .replace(/\{prefix\}/g, (ctx.prefix ?? '').toUpperCase())
    .replace(/\{year\}/g, String(ctx.year))
    .replace(/\{counterparty\}/g, (ctx.counterparty ?? '').toUpperCase())
    .replace(/\{currency\}/g, (ctx.currency ?? '').toUpperCase())
    .replace(/\{company\}/g, ctx.companyName ?? '')

  out = out.replace(/\{number:(\d+)\}/g, (_m, n) => String(ctx.number).padStart(Number(n), '0'))
  if (out.includes('{number}')) {
    const fallback = ctx.numberPadding ? String(ctx.number).padStart(ctx.numberPadding, '0') : String(ctx.number)
    out = out.replace(/\{number\}/g, fallback)
  }

  return out
}

// -----------------------------------------------------------------------------
// SCHEMAS Zod
// -----------------------------------------------------------------------------
const uuid = z.string().uuid()
const positiveDecimal = z.coerce.number().nonnegative()

export const documentCreateSchema = z.object({
  company_id: uuid,
  doc_type: z.enum(DOC_TYPES),
  direction: z.enum(DOC_DIRECTIONS).optional(),

  doc_date: z.string().optional(),
  valid_until: z.string().optional(),
  due_date: z.string().optional(),

  counterparty_type: z.enum(COUNTERPARTY_TYPES).optional(),
  counterparty_id: uuid.optional(),
  counterparty_name: z.string().min(1).max(200).optional(),
  counterparty_tax_id: z.string().max(64).optional(),
  counterparty_email: z.string().email().optional().or(z.literal('')),
  counterparty_address: z.string().max(500).optional(),

  currency_code: z.string().length(3),
  exchange_rate: positiveDecimal.optional(),

  external_ref: z.string().max(200).optional(),
  customer_po_number: z.string().max(200).optional(),

  notes: z.string().optional(),
  internal_notes: z.string().optional(),
  metadata: z.record(z.string(), z.unknown()).optional(),
})

export const documentUpdateSchema = documentCreateSchema.partial().extend({
  status: z.enum(DOC_STATUSES).optional(),
})

export const documentLineCreateSchema = z.object({
  line_number: z.number().int().positive().optional(),
  product_id: uuid.optional(),
  product_sku: z.string().max(100).optional(),
  product_name: z.string().min(1).max(300),
  description: z.string().optional(),

  quantity: positiveDecimal,
  unit: z.string().max(16).default('u'),

  unit_price: positiveDecimal.default(0),
  discount_pct: z.coerce.number().min(0).max(100).default(0),
  discount_amount: positiveDecimal.default(0),
  tax_rate: z.coerce.number().min(0).max(100).default(0),

  attributes: z.record(z.string(), z.unknown()).optional(),
  image_url: z.string().url().optional().or(z.literal('')),
  notes: z.string().optional(),

  source_line_id: uuid.optional(),
})
export const documentLineUpdateSchema = documentLineCreateSchema.partial()

export const documentIssueSchema = z.object({
  doc_date: z.string().optional(),      // si null, toma hoy
  force_renumber: z.boolean().optional(),
})

export const documentCancelSchema = z.object({
  reason: z.string().min(3).max(500),
})

export const documentDeriveSchema = z.object({
  target_type: z.enum(DOC_TYPES),
  mode: z.enum(['full', 'selected']).default('full'),
  line_ids: z.array(uuid).optional(),               // requerido si mode=selected
  line_quantities: z.record(uuid, positiveDecimal).optional(), // opcional: overrides de qty
  copy_counterparty: z.boolean().default(true),
  notes: z.string().optional(),
})

export const documentConfigUpsertSchema = z.object({
  name_template: z.string().min(3).max(500).optional(),
  number_padding: z.number().int().min(1).max(12).optional(),
  reset_yearly: z.boolean().optional(),
  prefix_override: z.string().max(16).nullable().optional(),

  logo_url: z.string().url().nullable().optional(),
  header_html: z.string().nullable().optional(),
  footer_html: z.string().nullable().optional(),

  show_prices: z.boolean().optional(),
  show_images: z.boolean().optional(),
  show_attributes: z.boolean().optional(),
  show_taxes: z.boolean().optional(),
  show_notes: z.boolean().optional(),
  show_discounts: z.boolean().optional(),
  show_footer: z.boolean().optional(),
  show_payment_terms: z.boolean().optional(),

  signature_url: z.string().url().nullable().optional(),
  signature_required: z.boolean().optional(),
  qr_enabled: z.boolean().optional(),
  qr_payload_template: z.string().nullable().optional(),

  default_header_note: z.string().nullable().optional(),
  default_footer_note: z.string().nullable().optional(),
  terms_and_conditions: z.string().nullable().optional(),

  default_validity_days: z.number().int().positive().nullable().optional(),
  default_due_days: z.number().int().positive().nullable().optional(),

  metadata: z.record(z.string(), z.unknown()).optional(),
  is_active: z.boolean().optional(),
})

// -----------------------------------------------------------------------------
// Helpers numéricos para totales
// -----------------------------------------------------------------------------
export interface LineMoney {
  quantity: number
  unit_price: number
  discount_pct: number
  discount_amount: number
  tax_rate: number
}

export function computeLineMoney(l: LineMoney): {
  subtotal: number
  tax_amount: number
  total: number
  discount_amount: number
} {
  const gross = Number((l.quantity * l.unit_price).toFixed(2))
  const pctDisc = Number(((gross * (l.discount_pct ?? 0)) / 100).toFixed(2))
  const totalDisc = Number(((l.discount_amount ?? 0) + pctDisc).toFixed(2))
  const subtotal = Math.max(0, Number((gross - totalDisc).toFixed(2)))
  const tax = Number(((subtotal * (l.tax_rate ?? 0)) / 100).toFixed(2))
  const total = Number((subtotal + tax).toFixed(2))
  return { subtotal, tax_amount: tax, total, discount_amount: totalDisc }
}
