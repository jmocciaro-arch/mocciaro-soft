// -----------------------------------------------------------------------------
// Client library — wrappers tipados sobre la API REST de documentos v37.
// Se usa solo del lado del browser. Los guards (requireAuth/requireAdmin)
// viven en las rutas del server; el cliente asume sesión válida vía cookie.
// -----------------------------------------------------------------------------

import type { DocStatus, DocType } from '@/lib/schemas/documents'

// ---------- Tipos de wire (lo que la API devuelve) ----------
export interface DocumentRow {
  id: string
  company_id: string
  doc_type: DocType
  direction: 'sales' | 'purchase' | 'internal'
  doc_number: number | null
  doc_year: number | null
  doc_code: string | null
  doc_date: string
  counterparty_type: string | null
  counterparty_id: string | null
  counterparty_name: string | null
  counterparty_tax_id: string | null
  counterparty_email: string | null
  counterparty_address: string | null
  currency_code: string
  exchange_rate: number
  subtotal: number
  discount_total: number
  tax_total: number
  total: number
  status: DocStatus
  valid_until: string | null
  due_date: string | null
  external_ref: string | null
  customer_po_number: string | null
  notes: string | null
  internal_notes: string | null
  metadata: Record<string, unknown>
  locked: boolean
  issued_at: string | null
  cancelled_at: string | null
  cancelled_reason: string | null
  created_at: string
  updated_at: string
}

export interface DocumentLineRow {
  id: string
  document_id: string
  line_number: number
  product_id: string | null
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
  source_line_id: string | null
  quantity_delivered: number
  quantity_invoiced: number
  created_at: string
}

export interface DocumentEventRow {
  id: string
  document_id: string
  event_type: string
  from_status: string | null
  to_status: string | null
  actor_id: string | null
  related_document_id: string | null
  payload: Record<string, unknown>
  notes: string | null
  created_at: string
}

export interface DocumentRelationRow {
  id: string
  source_document_id: string
  target_document_id: string
  relation_type: string
  notes: string | null
  created_at: string
  source?: Pick<DocumentRow, 'id' | 'doc_type' | 'doc_code' | 'status' | 'doc_date'>
  target?: Pick<DocumentRow, 'id' | 'doc_type' | 'doc_code' | 'status' | 'doc_date'>
}

export interface DocumentDetail {
  document: DocumentRow
  lines: DocumentLineRow[]
  relations_out: DocumentRelationRow[]
  relations_in: DocumentRelationRow[]
  events: DocumentEventRow[]
}

// ---------- Filtros de lista ----------
// La API GET /api/documents acepta: company_id, doc_type, status, limit, offset.
// Filtros adicionales (search, fechas) se aplican en el cliente sobre la
// ventana devuelta — con pageSize 50-100 cubre casos reales sin ir al server.
export interface ListDocumentsFilters {
  companyId?: string
  docType?: DocType
  status?: DocStatus
  page?: number
  pageSize?: number
}

// GET /api/documents devuelve un subset de columnas — más liviano que la
// cabecera completa. Expuesto como tipo propio para que la UI de lista no
// asuma campos que no viajan.
export type DocumentListRow = Pick<
  DocumentRow,
  | 'id' | 'company_id' | 'doc_type' | 'direction' | 'doc_code' | 'doc_number'
  | 'doc_year' | 'doc_date' | 'status' | 'counterparty_name' | 'currency_code'
  | 'total' | 'created_at' | 'issued_at'
>

export interface ListDocumentsResult {
  data: DocumentListRow[]
  count: number                  // total server-side (antes de filtros client)
  page: number
  pageSize: number
}

// ---------- HTTP helper ----------
async function apiFetch<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, {
    ...init,
    headers: { 'Content-Type': 'application/json', ...(init?.headers ?? {}) },
    credentials: 'include',
    cache: 'no-store',
  })
  const body = await res.json().catch(() => ({}))
  if (!res.ok) {
    const msg = body?.error || `HTTP ${res.status}`
    const err = new Error(msg) as Error & { status: number; issues?: unknown }
    err.status = res.status
    err.issues = body?.issues
    throw err
  }
  return body as T
}

// ---------- CRUD documentos ----------
export async function listDocuments(filters: ListDocumentsFilters = {}): Promise<ListDocumentsResult> {
  const page = Math.max(1, filters.page ?? 1)
  const pageSize = Math.min(200, Math.max(1, filters.pageSize ?? 50))
  const offset = (page - 1) * pageSize
  const qs = new URLSearchParams()
  if (filters.companyId) qs.set('company_id', filters.companyId)
  if (filters.docType)   qs.set('doc_type', filters.docType)
  if (filters.status)    qs.set('status', filters.status)
  qs.set('limit', String(pageSize))
  qs.set('offset', String(offset))
  const res = await apiFetch<{ data: DocumentListRow[]; count: number }>(`/api/documents?${qs.toString()}`)
  return { data: res.data ?? [], count: res.count ?? 0, page, pageSize }
}

export function getDocument(id: string): Promise<DocumentDetail> {
  return apiFetch(`/api/documents/${id}`)
}

export interface CreateDocumentInput {
  company_id: string
  doc_type: DocType
  direction?: 'sales' | 'purchase' | 'internal'
  doc_date?: string
  counterparty_type?: 'customer' | 'supplier' | 'internal' | 'other'
  counterparty_id?: string
  counterparty_name?: string
  counterparty_tax_id?: string
  counterparty_email?: string
  counterparty_address?: string
  currency_code: string
  exchange_rate?: number
  valid_until?: string
  due_date?: string
  external_ref?: string
  customer_po_number?: string
  notes?: string
  internal_notes?: string
}

export function createDocument(input: CreateDocumentInput): Promise<{ success: true; data: DocumentRow }> {
  return apiFetch(`/api/documents`, { method: 'POST', body: JSON.stringify(input) })
}

export function updateDocument(id: string, patch: Partial<CreateDocumentInput>): Promise<{ success: true; data: DocumentRow }> {
  return apiFetch(`/api/documents/${id}`, { method: 'PATCH', body: JSON.stringify(patch) })
}

export function deleteDocument(id: string): Promise<{ success: true }> {
  return apiFetch(`/api/documents/${id}`, { method: 'DELETE' })
}

// ---------- Líneas ----------
export interface LineInput {
  line_number?: number
  product_id?: string
  product_sku?: string
  product_name: string
  description?: string
  quantity: number
  unit?: string
  unit_price?: number
  discount_pct?: number
  discount_amount?: number
  tax_rate?: number
  attributes?: Record<string, unknown>
  image_url?: string
  notes?: string
}

export function addLine(documentId: string, input: LineInput): Promise<{ success: true; data: DocumentLineRow }> {
  return apiFetch(`/api/documents/${documentId}/lines`, { method: 'POST', body: JSON.stringify(input) })
}

export function updateLine(documentId: string, lineId: string, patch: Partial<LineInput>): Promise<{ success: true; data: DocumentLineRow }> {
  return apiFetch(`/api/documents/${documentId}/lines/${lineId}`, { method: 'PATCH', body: JSON.stringify(patch) })
}

export function deleteLine(documentId: string, lineId: string): Promise<{ success: true }> {
  return apiFetch(`/api/documents/${documentId}/lines/${lineId}`, { method: 'DELETE' })
}

// ---------- Acciones ----------
export function issueDocument(id: string, input: { doc_date?: string } = {}): Promise<{ success: true; number: number; code: string; year: number }> {
  return apiFetch(`/api/documents/${id}/issue`, { method: 'POST', body: JSON.stringify(input) })
}

export function cancelDocument(id: string, reason: string): Promise<{ success: true }> {
  return apiFetch(`/api/documents/${id}/cancel`, { method: 'POST', body: JSON.stringify({ reason }) })
}

export interface DeriveInput {
  target_type: DocType
  mode?: 'full' | 'selected'
  line_ids?: string[]
  line_quantities?: Record<string, number>
  copy_counterparty?: boolean
  notes?: string
}

export function deriveDocument(id: string, input: DeriveInput): Promise<{ success: true; document_id: string; relation: string; lines_copied: number }> {
  return apiFetch(`/api/documents/${id}/derive`, { method: 'POST', body: JSON.stringify(input) })
}

export function getEvents(id: string, limit = 100): Promise<{ data: DocumentEventRow[] }> {
  return apiFetch(`/api/documents/${id}/events?limit=${limit}`)
}

// ---------- PDF / HTML ----------
export function pdfUrl(id: string, opts: { inline?: boolean; locale?: string } = {}): string {
  const qs = new URLSearchParams()
  if (opts.inline) qs.set('inline', '1')
  if (opts.locale) qs.set('locale', opts.locale)
  const q = qs.toString()
  return `/api/documents/${id}/pdf${q ? `?${q}` : ''}`
}

export function htmlUrl(id: string, opts: { locale?: string } = {}): string {
  const qs = new URLSearchParams()
  if (opts.locale) qs.set('locale', opts.locale)
  const q = qs.toString()
  return `/api/documents/${id}/html${q ? `?${q}` : ''}`
}
