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

export interface SystemParam {
  key: string
  value: string | null
  description: string | null
  updated_at: string
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
