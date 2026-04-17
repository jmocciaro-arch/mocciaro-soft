// =====================================================
// TorqueTools ERP - TypeScript Types
// =====================================================

export interface Company {
  id: string
  name: string
  legal_name: string | null
  tax_id: string | null
  country: string
  currency: string
  address: string | null
  city: string | null
  postal_code: string | null
  phone: string | null
  email: string | null
  website: string | null
  logo_url: string | null
  iban: string | null
  swift: string | null
  default_tax_rate: number
  default_margin: number
  active: boolean
  created_at: string
  updated_at: string
}

export interface User {
  id: string
  auth_id: string | null
  username: string | null
  full_name: string
  email: string
  gmail: string | null
  whatsapp: string | null
  phone: string | null
  role: string
  company_id: string | null
  avatar_url: string | null
  permissions: Record<string, boolean>
  active: boolean
  created_at: string
  updated_at: string
}

export interface ProductCategory {
  id: string
  name: string
  slug: string
  parent_id: string | null
  description: string | null
  sort_order: number
  created_at: string
}

export interface Product {
  id: string
  sku: string
  name: string
  description: string | null
  brand: string
  category: string | null
  subcategory: string | null
  image_url: string | null
  price_eur: number
  cost_eur: number
  price_usd: number
  price_ars: number
  origin: string | null
  weight_kg: number | null
  torque_min: number | null
  torque_max: number | null
  rpm: number | null
  encastre: string | null
  modelo: string | null
  serie: string | null
  specs: Record<string, string>
  active: boolean
  created_at: string
  updated_at: string
  stelorder_id: string | null
  company_source: string | null
  product_type: 'product' | 'service' | 'expense'
  price_min: number | null
}

// ── Price Lists (Multitarifas) ──
export interface PriceList {
  id: string
  name: string
  description: string | null
  currency: string
  is_default: boolean
  markup_pct: number
  active: boolean
  company_id: string | null
  created_at: string
  updated_at: string
}

export interface PriceListItem {
  id: string
  price_list_id: string
  product_id: string
  price: number
  created_at: string
}

// ── Document Templates ──
export interface DocumentTemplate {
  id: string
  name: string
  doc_type: string
  company_id: string | null
  is_default: boolean
  language: string
  header_html: string | null
  footer_html: string | null
  logo_url: string | null
  primary_color: string
  secondary_color: string
  font_family: string
  show_logo: boolean
  show_company_address: boolean
  show_client_tax_id: boolean
  show_sku: boolean
  show_discount: boolean
  show_unit_price: boolean
  show_photos: boolean
  show_notes: boolean
  show_bank_details: boolean
  show_terms: boolean
  show_incoterm: boolean
  show_payment_terms: boolean
  show_valid_until: boolean
  show_delivery_date: boolean
  show_page_numbers: boolean
  terms_text: string | null
  footer_text: string | null
  custom_css: string | null
  active: boolean
  created_at: string
  updated_at: string
}

// ── Client Special Prices ──
export interface ClientPrice {
  id: string
  client_id: string
  product_id: string
  special_price: number | null
  discount_pct: number
  currency: string
  valid_from: string | null
  valid_until: string | null
  notes: string | null
  created_at: string
  updated_at: string
}

export interface Client {
  id: string
  name: string
  legal_name: string | null
  tax_id: string | null
  email: string | null
  phone: string | null
  whatsapp: string | null
  address: string | null
  city: string | null
  state: string | null
  postal_code: string | null
  country: string
  category: string | null
  payment_terms: string | null
  credit_limit: number
  assigned_to: string | null
  company_id: string | null
  notes: string | null
  source: string | null
  active: boolean
  created_at: string
  updated_at: string
  stelorder_id: string | null
  company_source: string | null
  is_favorite: boolean
  ranking_score: number
  ranking_tier: string | null
  total_revenue: number
  total_orders: number
  last_order_date: string | null
  price_list_id: string | null
  default_discount: number
}

export interface ClientContact {
  id: string
  client_id: string
  name: string
  position: string | null
  email: string | null
  phone: string | null
  whatsapp: string | null
  is_primary: boolean
  notes?: string | null
  created_at: string
}

export interface ClientAddress {
  id: string
  client_id: string
  label: string
  address: string | null
  city: string | null
  state: string | null
  postal_code: string | null
  country: string
  is_default: boolean
  notes: string | null
  created_at: string
}

/** Virtual grouped company derived from tt_clients records sharing the same legal_name */
export interface GroupedCompany {
  /** ID of the primary tt_clients record */
  id: string
  legal_name: string
  name: string
  tax_id: string | null
  email: string | null
  phone: string | null
  whatsapp: string | null
  address: string | null
  city: string | null
  state: string | null
  postal_code: string | null
  country: string
  category: string | null
  payment_terms: string | null
  credit_limit: number
  source: string | null
  /** All underlying tt_clients records for this company */
  records: Client[]
  /** Contacts extracted from duplicate records */
  inlineContacts: { name: string; email: string | null; phone: string | null }[]
  contactCount: number
}

export interface Warehouse {
  id: string
  name: string
  code: string
  company_id: string | null
  address: string | null
  city: string | null
  country: string
  active: boolean
  created_at: string
}

export interface Stock {
  id: string
  product_id: string
  warehouse_id: string
  quantity: number
  min_quantity: number
  reserved: number
  updated_at: string
  // Joined
  product?: Product
  warehouse?: Warehouse
}

export type QuoteStatus = 'borrador' | 'enviada' | 'aceptada' | 'rechazada' | 'expirada' | 'facturada'

export interface Quote {
  id: string
  number: string
  company_id: string
  client_id: string | null
  user_id: string | null
  status: string
  currency: string
  exchange_rate: number
  subtotal: number
  tax_amount: number
  total: number
  tax_rate: number
  incoterm: string | null
  payment_terms: string | null
  notes: string | null
  internal_notes: string | null
  valid_until: string | null
  closed_at: string | null
  parent_quote_id: string | null
  created_at: string
  updated_at: string
  // Joined
  company?: Company
  client?: Client
  items?: QuoteItem[]
}

export interface QuoteItem {
  id: string
  quote_id: string
  product_id: string | null
  sku: string | null
  description: string
  quantity: number
  unit_price: number
  discount_pct: number
  subtotal: number
  notes: string | null
  sort_order: number
  created_at: string
  // Joined
  product?: Product
}

export type CRMStage = 'lead' | 'propuesta' | 'negociacion' | 'ganado' | 'perdido'

export interface Opportunity {
  id: string
  title: string
  client_id: string | null
  company_id: string | null
  user_id: string | null
  stage: string
  probability: number
  expected_value: number
  expected_close: string | null
  source: string | null
  competitor: string | null
  loss_reason: string | null
  notes: string | null
  created_at: string
  updated_at: string
  // Joined
  client?: Client
  assignee?: User
}

export interface Supplier {
  id: string
  reference: string | null
  legal_name: string | null
  name: string
  tax_id: string | null
  email: string | null
  phone: string | null
  address: string | null
  city: string | null
  country: string | null
  payment_terms: string | null
  category: string | null
  notes: string | null
  active: boolean
  source: string | null
  created_at: string
  // AI scoring fields (migration v33)
  ai_score: number | null
  ai_tags: string[] | null
  ai_analysis: string | null
  ai_profile: {
    delivery_score?: number
    quality_score?: number
    price_score?: number
    reliability_score?: number
    on_time_rate?: number | null
    total_spent_ytd?: number
    avg_po_value?: number
    last_analysis_summary?: string
    suggested_action?: string
  } | null
  ai_analysis_at: string | null
  ai_provider: string | null
  portal_token: string | null
  portal_token_expires_at: string | null
  portal_last_seen: string | null
  is_duplicate_of: string | null
}

export interface SupplierInteraction {
  id: string
  company_id: string
  supplier_id: string
  type: 'email_sent' | 'email_received' | 'call' | 'meeting' | 'complaint' | 'quality_issue' | 'price_negotiation' | 'delivery_issue' | 'payment_sent' | 'note' | 'other'
  direction: 'outbound' | 'inbound' | 'internal' | null
  subject: string | null
  body: string | null
  outcome: string | null
  rating: number | null
  document_ref: string | null
  metadata: Record<string, unknown>
  created_by: string | null
  created_at: string
  // Joined
  user?: User
}

export interface SupplierContact {
  id: string
  supplier_id: string
  name: string
  position: string | null
  email: string | null
  phone: string | null
  whatsapp: string | null
  is_primary: boolean
  created_at: string
}

export interface PurchaseOrder {
  id: string
  po_number: string
  company_id: string
  supplier_name: string
  supplier_contact: string | null
  supplier_email: string | null
  status: string
  currency: string
  subtotal: number
  tax_amount: number
  total: number
  notes: string | null
  expected_delivery: string | null
  created_by: string | null
  created_at: string
  updated_at: string
}

export interface POItem {
  id: string
  po_id: string
  product_id: string | null
  sku: string | null
  description: string
  quantity: number
  received_quantity: number
  unit_price: number
  subtotal: number
  created_at: string
}

export interface SalesOrder {
  id: string
  so_number: string
  company_id: string
  client_id: string | null
  quote_id: string | null
  status: string
  currency: string
  subtotal: number
  tax_amount: number
  total: number
  shipping_address: string | null
  tracking_number: string | null
  notes: string | null
  created_by: string | null
  created_at: string
  updated_at: string
}

export interface SATTicket {
  id: string
  ticket_number: string
  client_id: string | null
  company_id: string | null
  assigned_to: string | null
  product_id: string | null
  serial_number: string | null
  type: 'reparacion' | 'mantenimiento' | 'garantia' | 'instalacion' | 'calibracion'
  priority: 'baja' | 'normal' | 'alta' | 'urgente'
  status: 'abierto' | 'en_proceso' | 'esperando_repuesto' | 'resuelto' | 'cerrado'
  title: string
  description: string | null
  resolution: string | null
  estimated_hours: number | null
  actual_hours: number | null
  cost: number
  created_at: string
  updated_at: string
  resolved_at: string | null
  // Joined
  client?: Client
  assignee?: User
  product?: Product
}

export interface ActivityLog {
  id: string
  entity_type: string
  entity_id: string | null
  action: string
  detail: string | null
  user_id: string | null
  metadata: Record<string, unknown>
  created_at: string
  // Joined
  user?: User
}

export interface Notification {
  id: string
  user_id: string
  title: string
  message: string | null
  type: 'info' | 'success' | 'warning' | 'error'
  link: string | null
  is_read: boolean
  created_at: string
}

export interface MailFollowup {
  id: string
  user_id: string
  client_id: string | null
  subject: string
  gmail_thread_id: string | null
  gmail_message_id: string | null
  status: 'pendiente' | 'seguimiento' | 'respondido' | 'archivado'
  follow_up_date: string | null
  notes: string | null
  created_at: string
  updated_at: string
}

export interface PurchaseInvoice {
  id: string
  number: string
  supplier_id: string | null
  purchase_order_id: string | null
  supplier_invoice_number: string | null
  supplier_invoice_date: string | null
  status: string
  currency: string
  subtotal: number
  tax_rate: number
  tax_amount: number
  total: number
  due_date: string | null
  paid_at: string | null
  notes: string | null
  created_at: string
  updated_at: string
  // Joined
  supplier?: Supplier
  purchase_order?: PurchaseOrder
}

export interface PurchasePayment {
  id: string
  purchase_invoice_id: string | null
  purchase_order_id: string | null
  supplier_id: string | null
  amount: number
  currency: string
  payment_date: string
  payment_method: string | null
  bank_reference: string | null
  bank_account: string | null
  is_advance: boolean
  advance_reason: string | null
  expected_goods_date: string | null
  goods_received: boolean
  goods_received_date: string | null
  reminder_date: string | null
  reminder_sent: boolean
  status: string
  notes: string | null
  created_by: string | null
  created_at: string
  // Joined
  supplier?: Supplier
  purchase_invoice?: PurchaseInvoice
}

// =====================================================
// Purchase Credit Notes (Abonos de proveedor)
// =====================================================
export interface PurchaseCreditNote {
  id: string
  number: string
  company_id: string | null
  supplier_id: string | null
  purchase_invoice_id: string | null
  supplier_cn_number: string | null
  supplier_cn_date: string | null
  reason: string | null
  status: 'pending' | 'applied' | 'rejected'
  currency: string
  subtotal: number
  tax_rate: number
  tax_amount: number
  total: number
  notes: string | null
  created_at: string
  updated_at: string
  // Joined
  supplier?: Supplier
  purchase_invoice?: PurchaseInvoice
}

export interface PurchaseCreditNoteItem {
  id: string
  credit_note_id: string
  product_id: string | null
  sku: string | null
  description: string | null
  quantity: number
  unit_price: number
  subtotal: number
}

export interface SystemParam {
  key: string
  value: string | null
  description: string | null
  updated_at: string
}

// =====================================================
// Multi-Company Types
// =====================================================

export interface UserCompany {
  id: string
  user_id: string
  company_id: string
  is_default: boolean
  can_sell: boolean
  can_buy: boolean
  created_at: string
  // Joined
  company?: Company
}

export interface IntercompanyRelation {
  id: string
  buyer_company_id: string
  seller_company_id: string
  active: boolean
  default_currency: string
  default_incoterm: string
  notes: string | null
  created_at: string
  // Joined
  buyer_company?: Company
  seller_company?: Company
}

export type CompanyType = 'internal' | 'external'

/** Country flag + metadata for company display */
export interface CompanyDisplay {
  id: string
  name: string
  country: string
  currency: string
  flag: string
  company_type: CompanyType
  is_default: boolean
  can_sell: boolean
  can_buy: boolean
}

// =====================================================
// UI / Helper Types
// =====================================================

export interface NavItem {
  label: string
  href: string
  icon: string
  badge?: number
  children?: NavItem[]
}

export interface KPIData {
  label: string
  value: string | number
  change?: number
  changeLabel?: string
  icon: string
  color?: string
}

export interface SelectOption {
  value: string
  label: string
}

export interface TableColumn<T> {
  key: keyof T | string
  label: string
  sortable?: boolean
  render?: (value: unknown, row: T) => React.ReactNode
  className?: string
}
