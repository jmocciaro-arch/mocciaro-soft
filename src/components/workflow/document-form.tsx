'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Select } from '@/components/ui/select'
import { Modal } from '@/components/ui/modal'
import { useToast } from '@/components/ui/toast'
import { formatCurrency, formatDate, formatRelative, INCOTERMS } from '@/lib/utils'
import { mapStatus } from '@/lib/document-helpers'
import { DocumentActions, type DocumentActionType } from './document-actions'
import { SendDocumentModal } from './send-document-modal'
import { DocumentProcessBar } from './document-process-bar'
import { buildSteps, type DocumentType } from '@/lib/workflow-definitions'
import { useCompanyContext } from '@/lib/company-context'
import { useCompanyFilter } from '@/hooks/use-company-filter'
import {
  ArrowLeft, Edit3, Save, Printer, Mail, MoreVertical,
  ChevronLeft, ChevronRight, Trash2, Copy, RefreshCw,
  Plus, X, Search, FileText, Link2, Clock, Paperclip,
  PenTool, Loader2, ExternalLink, GripVertical, Eye, Send,
  Building2, Minus, TrendingUp, BarChart3, GitMerge,
  AlertTriangle, CheckCircle2, Scale, PackageCheck, ShieldCheck,
  DollarSign, CreditCard, Banknote,
} from 'lucide-react'
import { DocLink } from '@/components/ui/doc-link'
import { DocumentChain } from './document-chain'
import { StockReservationsPanel } from './stock-reservations-panel'
import { ClientPOCard, type ClientPOContext } from './client-po-card'

type Row = Record<string, unknown>

// ===============================================================
// TYPES
// ===============================================================
export interface DocumentFormProps {
  documentId: string
  documentType: string
  source: 'local' | 'tt_documents'
  onBack: () => void
  onUpdate?: () => void
  /** Optional: all IDs of same type for navigation */
  siblingIds?: string[]
}

interface DocumentData {
  id: string
  type: string
  status: string
  display_ref: string
  system_code: string
  currency: string
  total: number
  subtotal: number
  tax_amount: number
  tax_rate: number
  notes: string
  internal_notes: string
  created_at: string
  updated_at: string
  incoterm: string
  payment_terms: string
  delivery_date: string
  valid_until: string
  shipping_address: string
  subject_iva: boolean
  subject_irpf: boolean
  created_by: string
  agent: string
  tariff: string
  client_id: string
  company_id: string
  client_reference: string
  metadata: Row
}

interface ClientData {
  id: string
  name: string
  legal_name: string | null
  tax_id: string | null
  email: string | null
  country: string
}

interface ItemData {
  id: string
  sku: string
  description: string
  quantity: number
  unit_price: number
  unit_cost?: number
  discount_pct: number
  subtotal: number
  sort_order: number
  notes: string
  product_id: string | null
  is_section: boolean
  section_label: string
}

interface LinkData {
  id: string
  type: string
  system_code: string
  display_ref: string
  created_at: string
}

interface ActivityEntry {
  id: string
  action: string
  details: string
  created_at: string
  user_name: string
}

interface PaymentEntry {
  id: string
  document_id: string
  invoice_id: string | null
  amount: number
  currency: string
  payment_date: string
  payment_method: string
  bank_reference: string | null
  bank_account: string | null
  notes: string | null
  receipt_url: string | null
  created_at: string
}

interface CompanyFullData {
  id: string
  name: string
  legal_name: string | null
  tax_id: string | null
  address: string | null
  city: string | null
  postal_code: string | null
  country: string | null
  phone: string | null
  email: string | null
  website: string | null
}

// ---------------------------------------------------------------
// PO vs Invoice Comparison types
// ---------------------------------------------------------------
interface InvoiceItemData {
  id: string
  purchase_invoice_id: string
  purchase_order_item_id: string | null
  product_id: string | null
  sku: string
  description: string
  quantity: number
  unit_price: number
  discount_pct: number
  subtotal: number
  is_new_item: boolean
  price_differs: boolean
  qty_differs: boolean
  po_unit_price: number | null
  po_quantity: number | null
  comparison_status: string | null
  notes: string | null
}

type ComparisonStatus = 'ok' | 'precio_diferente' | 'cantidad_diferente' | 'nuevo' | 'faltante'

interface ComparisonRow {
  /** Unique key for rendering */
  key: string
  description: string
  sku: string
  /** PO side */
  poQty: number | null
  poPrice: number | null
  poSubtotal: number | null
  /** Invoice side */
  invQty: number | null
  invPrice: number | null
  invSubtotal: number | null
  /** Status */
  status: ComparisonStatus
}

// ===============================================================
// STATUS CONFIG
// ===============================================================
const STATUS_OPTIONS: Record<string, Array<{ value: string; label: string; color: string }>> = {
  coti: [
    { value: 'draft', label: 'Borrador', color: '#6B7280' },
    { value: 'sent', label: 'Enviada', color: '#3B82F6' },
    { value: 'accepted', label: 'Aceptada', color: '#10B981' },
    { value: 'rejected', label: 'Rechazada', color: '#EF4444' },
    { value: 'closed', label: 'Cerrado', color: '#6B7280' },
  ],
  pedido: [
    { value: 'open', label: 'Abierto', color: '#3B82F6' },
    { value: 'partially_delivered', label: 'Entrega parcial', color: '#F59E0B' },
    { value: 'fully_delivered', label: 'Entregado', color: '#10B981' },
    { value: 'partially_invoiced', label: 'Facturacion parcial', color: '#FF6600' },
    { value: 'fully_invoiced', label: 'Facturado', color: '#10B981' },
    { value: 'closed', label: 'Cerrado', color: '#6B7280' },
  ],
  delivery_note: [
    { value: 'pending', label: 'Pendiente', color: '#F59E0B' },
    { value: 'delivered', label: 'Entregado', color: '#10B981' },
    { value: 'closed', label: 'Cerrado', color: '#6B7280' },
  ],
  factura: [
    { value: 'draft', label: 'Borrador', color: '#6B7280' },
    { value: 'pending', label: 'Pendiente', color: '#F59E0B' },
    { value: 'sent', label: 'Enviada', color: '#3B82F6' },
    { value: 'partial', label: 'Pago parcial', color: '#FF6600' },
    { value: 'paid', label: 'Pagada', color: '#10B981' },
  ],
  pap: [
    { value: 'draft', label: 'Borrador', color: '#6B7280' },
    { value: 'sent', label: 'Enviada', color: '#3B82F6' },
    { value: 'partial', label: 'Parcial', color: '#F59E0B' },
    { value: 'received', label: 'Recibida', color: '#10B981' },
    { value: 'closed', label: 'Cerrada', color: '#6B7280' },
  ],
  recepcion: [
    { value: 'pending', label: 'Pendiente', color: '#F59E0B' },
    { value: 'received', label: 'Recibida', color: '#10B981' },
    { value: 'closed', label: 'Cerrado', color: '#6B7280' },
  ],
  factura_compra: [
    { value: 'pending', label: 'Pendiente', color: '#F59E0B' },
    { value: 'paid', label: 'Pagada', color: '#10B981' },
    { value: 'partial', label: 'Pago parcial', color: '#FF6600' },
    { value: 'overdue', label: 'Vencida', color: '#EF4444' },
  ],
}

const PREFIX_MAP: Record<string, string> = {
  coti: 'COT',
  pedido: 'PED',
  delivery_note: 'ALB',
  factura: 'FAC',
  pap: 'PAP',
  recepcion: 'REC',
  factura_compra: 'FC',
}

const TYPE_LABELS: Record<string, string> = {
  coti: 'Cotizacion',
  cotizacion: 'Cotizacion',
  presupuesto: 'Presupuesto',
  proforma: 'Factura Proforma',
  packing_list: 'Packing List',
  oferta: 'Oferta Comercial',
  pedido: 'Pedido de Venta',
  delivery_note: 'Albaran / Remito',
  factura: 'Factura',
  pap: 'Pedido a Proveedor',
  recepcion: 'Recepcion',
  factura_compra: 'Factura de Compra',
}

// Subtypes that a quote-type document can be switched to
const QUOTE_SUBTYPES = [
  { value: 'cotizacion', label: 'Cotizacion', icon: '📋' },
  { value: 'presupuesto', label: 'Presupuesto', icon: '📄' },
  { value: 'proforma', label: 'Factura Proforma', icon: '📑' },
  { value: 'packing_list', label: 'Packing List', icon: '📦' },
  { value: 'oferta', label: 'Oferta Comercial', icon: '💼' },
]

const PAYMENT_TERMS = [
  { value: '', label: 'Sin definir' },
  { value: 'exw_anticipado', label: 'EXW 100% Anticipado' },
  { value: 'exw_30d', label: 'EXW 30 dias FF' },
  { value: 'exw_60d', label: 'EXW 60 dias FF' },
  { value: 'exw_90d', label: 'EXW 90 dias FF' },
  { value: 'fob_30d', label: 'FOB 30 dias FF' },
  { value: 'cif_30d', label: 'CIF 30 dias FF' },
  { value: 'contado', label: 'Contado' },
  { value: 'transferencia', label: 'Transferencia bancaria' },
]

const CURRENCY_OPTIONS = [
  { value: 'EUR', label: 'EUR' },
  { value: 'USD', label: 'USD' },
  { value: 'ARS', label: 'ARS' },
]

// ===============================================================
// COMPONENT
// ===============================================================
export function DocumentForm({
  documentId,
  documentType,
  source,
  onBack,
  onUpdate,
  siblingIds,
}: DocumentFormProps) {
  const { addToast } = useToast()
  const supabase = createClient()
  const { activeCompany } = useCompanyContext()
  const { filterByCompany } = useCompanyFilter()

  // Mode
  const [editMode, setEditMode] = useState(false)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [activeTab, setActiveTab] = useState<'lineas' | 'rentabilidad' | 'mas_info' | 'adjuntos' | 'firma' | 'relacionados' | 'comparacion' | 'cobros'>('lineas')
  const [productCosts, setProductCosts] = useState<Record<string, number>>({})

  // Data
  const [doc, setDoc] = useState<DocumentData | null>(null)
  const [client, setClient] = useState<ClientData | null>(null)
  const [company, setCompany] = useState<CompanyFullData | null>(null)
  const [items, setItems] = useState<ItemData[]>([])
  const [parentLinks, setParentLinks] = useState<LinkData[]>([])
  const [childLinks, setChildLinks] = useState<LinkData[]>([])
  const [activity, setActivity] = useState<ActivityEntry[]>([])
  const [linkedPurchaseInvoice, setLinkedPurchaseInvoice] = useState<{
    id: string; number: string; total: number; due_date: string | null; status: string;
    comparison_status?: string | null; po_total?: number | null; difference_amount?: number | null;
    difference_notes?: string | null; confirmed_by?: string | null; confirmed_at?: string | null;
  } | null>(null)
  const [invoiceItems, setInvoiceItems] = useState<InvoiceItemData[]>([])
  const [comparisonConfirming, setComparisonConfirming] = useState(false)

  // Edit state (copies for editing)
  const [editDoc, setEditDoc] = useState<Partial<DocumentData>>({})
  const [editItems, setEditItems] = useState<ItemData[]>([])

  // Client search
  const [clientSearch, setClientSearch] = useState('')
  const [clientResults, setClientResults] = useState<ClientData[]>([])
  const [showClientDropdown, setShowClientDropdown] = useState(false)
  const clientDebounceRef = useRef<NodeJS.Timeout | null>(null)

  // Modals
  const [showMoreMenu, setShowMoreMenu] = useState(false)
  const [showSendModal, setShowSendModal] = useState(false)
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false)

  // Contexto de OC del cliente (cuando este doc es un pedido que vino
  // de una OC parseada). ClientPOCard carga el contexto y lo expone
  // para enriquecer el workflow bar.
  const [clientPoCtx, setClientPoCtx] = useState<ClientPOContext | null>(null)

  // Convert document
  const [converting, setConverting] = useState(false)

  // Send tracking
  const [lastSend, setLastSend] = useState<{
    sent_at: string
    open_count: number
    delivery_status: string
    first_opened_at: string | null
  } | null>(null)

  // Navigation
  const currentIndex = siblingIds ? siblingIds.indexOf(documentId) : -1
  const totalSiblings = siblingIds?.length ?? 0

  // Product search
  const [showProductSearch, setShowProductSearch] = useState(false)
  const [productSearchQuery, setProductSearchQuery] = useState('')
  const [productResults, setProductResults] = useState<Row[]>([])
  const [searchingProducts, setSearchingProducts] = useState(false)
  const productDebounceRef = useRef<NodeJS.Timeout | null>(null)

  // Payments (cobros parciales)
  const [payments, setPayments] = useState<PaymentEntry[]>([])
  const [showPaymentForm, setShowPaymentForm] = useState(false)
  const [savingPayment, setSavingPayment] = useState(false)
  const [newPayment, setNewPayment] = useState({
    amount: 0,
    payment_date: new Date().toISOString().split('T')[0],
    payment_method: 'transferencia',
    bank_reference: '',
    notes: '',
  })

  // Signatures (firma digital)
  const [signatures, setSignatures] = useState<Array<{
    id: string; document_id: string; quote_id: string | null
    signer_name: string; signer_email: string; signer_role: string
    signature_data: string | null; signature_url: string | null
    ip_address: string | null; signed_at: string | null
    token: string; status: string; expires_at: string | null
    created_at: string
  }>>([])
  const [showSignatureForm, setShowSignatureForm] = useState(false)
  const [signerName, setSignerName] = useState('')
  const [signerEmail, setSignerEmail] = useState('')
  const [signerRole, setSignerRole] = useState<'client' | 'approver' | 'witness'>('client')
  const [requestingSignature, setRequestingSignature] = useState(false)
  const [copiedToken, setCopiedToken] = useState<string | null>(null)

  // ---------------------------------------------------------------
  // LOAD DATA
  // ---------------------------------------------------------------
  const loadDocument = useCallback(async () => {
    setLoading(true)
    try {
      if (source === 'tt_documents') {
        // Load from tt_documents
        const { data: docData } = await supabase
          .from('tt_documents')
          .select('*, client:tt_clients(id, name, legal_name, tax_id, email, country)')
          .eq('id', documentId)
          .single()

        if (docData) {
          const raw = (docData.metadata as Row)?.stelorder_raw as Row | undefined
          const clientJoined = docData.client as ClientData | undefined

          setDoc({
            id: docData.id,
            type: docData.doc_type || documentType,
            status: docData.status || 'draft',
            display_ref: docData.display_ref || (raw?.reference as string) || '',
            system_code: docData.system_code || '',
            currency: docData.currency || 'EUR',
            total: docData.total || 0,
            subtotal: docData.subtotal || 0,
            tax_amount: docData.tax_amount || 0,
            tax_rate: (docData.metadata as Row)?.tax_rate as number || 21,
            notes: docData.notes || (raw?.addendum as string) || '',
            internal_notes: (docData.metadata as Row)?.internal_notes as string || '',
            created_at: docData.created_at || '',
            updated_at: docData.updated_at || '',
            incoterm: (docData.metadata as Row)?.incoterm as string || '',
            payment_terms: (docData.metadata as Row)?.payment_terms as string || (raw?.['payment-method'] as string) || '',
            delivery_date: (docData.metadata as Row)?.delivery_date as string || '',
            valid_until: (docData.metadata as Row)?.valid_until as string || '',
            shipping_address: (docData.metadata as Row)?.shipping_address as string || '',
            subject_iva: (docData.metadata as Row)?.subject_iva !== false,
            subject_irpf: (docData.metadata as Row)?.subject_irpf === true,
            created_by: (raw?.['employee-name'] as string) || '',
            agent: (docData.metadata as Row)?.agent as string || '',
            tariff: (docData.metadata as Row)?.tariff as string || '',
            client_id: docData.client_id || '',
            company_id: docData.company_id || '',
            client_reference: ((docData.metadata as Row)?.client_reference as string) || '',
            metadata: (docData.metadata as Row) || {},
          })

          if (clientJoined) {
            setClient(clientJoined)
          }

          // Load selling company
          const companyId = docData.company_id || activeCompany?.id
          if (companyId) {
            const { data: companyData } = await supabase
              .from('tt_companies')
              .select('id, name, legal_name, tax_id, address, city, postal_code, country, phone, email, website')
              .eq('id', companyId)
              .single()
            if (companyData) setCompany(companyData as CompanyFullData)
          }

          // Load items
          const { data: itemsData } = await supabase
            .from('tt_document_lines')
            .select('*')
            .eq('document_id', documentId)
            .order('sort_order')

          const parsedItems = (itemsData || []).map((it: Row, idx: number) => ({
            id: (it.id as string) || `item-${idx}`,
            sku: (it.sku as string) || '',
            description: (it.description as string) || '',
            quantity: (it.quantity as number) || 0,
            unit_price: (it.unit_price as number) || 0,
            unit_cost: (it.unit_cost as number) || 0,
            discount_pct: (it.discount_pct as number) || 0,
            subtotal: (it.subtotal as number) || (it.line_total as number) || 0,
            sort_order: (it.sort_order as number) || idx,
            notes: (it.notes as string) || '',
            product_id: (it.product_id as string) || null,
            is_section: (it.is_section as boolean) || false,
            section_label: (it.section_label as string) || '',
          }))
          setItems(parsedItems)

          // Load product costs for profitability analysis
          const productIds = parsedItems.map(i => i.product_id).filter(Boolean) as string[]
          if (productIds.length > 0) {
            const { data: prods } = await supabase.from('tt_products').select('id, cost_eur').in('id', productIds)
            const costs: Record<string, number> = {}
            for (const p of (prods || [])) costs[p.id as string] = (p.cost_eur as number) || 0
            setProductCosts(costs)
          }

          // Load parent links
          const { data: parents } = await supabase
            .from('tt_document_relations')
            .select('parent_id, relation_type, parent:tt_documents!parent_id(id, doc_type, system_code, display_ref, created_at)')
            .eq('child_id', documentId)

          setParentLinks((parents || []).map((p: Row) => {
            const parent = p.parent as Row
            return {
              id: (parent?.id as string) || '',
              type: (parent?.doc_type as string) || '',
              system_code: (parent?.system_code as string) || '',
              display_ref: (parent?.display_ref as string) || (parent?.system_code as string) || '',
              created_at: (parent?.created_at as string) || '',
            }
          }).filter(l => l.id))

          // Load child links
          const { data: children } = await supabase
            .from('tt_document_relations')
            .select('child_id, relation_type, child:tt_documents!child_id(id, doc_type, system_code, display_ref, created_at)')
            .eq('parent_id', documentId)

          setChildLinks((children || []).map((c: Row) => {
            const child = c.child as Row
            return {
              id: (child?.id as string) || '',
              type: (child?.doc_type as string) || '',
              system_code: (child?.system_code as string) || '',
              display_ref: (child?.display_ref as string) || (child?.system_code as string) || '',
              created_at: (child?.created_at as string) || '',
            }
          }).filter(l => l.id))

          // Load activity log
          const { data: activityData } = await supabase
            .from('tt_activity_log')
            .select('*')
            .eq('entity_type', 'document')
            .eq('entity_id', documentId)
            .order('created_at', { ascending: false })
            .limit(50)

          setActivity((activityData || []).map((a: Row) => ({
            id: (a.id as string) || '',
            action: (a.action as string) || '',
            details: (a.details as string) || '',
            created_at: (a.created_at as string) || '',
            user_name: (a.user_name as string) || '',
          })))
        }
      } else {
        // Load from local tables (tt_quotes, etc.)
        const tableMap: Record<string, string> = {
          coti: 'tt_quotes',
          pedido: 'tt_sales_orders',
          delivery_note: 'tt_delivery_notes',
          factura: 'tt_invoices',
          pap: 'tt_purchase_orders',
        }
        const table = tableMap[documentType] || 'tt_quotes'
        const itemTableMap: Record<string, { table: string; fk: string }> = {
          coti: { table: 'tt_quote_items', fk: 'quote_id' },
          pedido: { table: 'tt_so_items', fk: 'sales_order_id' },
          delivery_note: { table: 'tt_dn_items', fk: 'delivery_note_id' },
          factura: { table: 'tt_invoice_items', fk: 'invoice_id' },
          pap: { table: 'tt_po_items', fk: 'purchase_order_id' },
        }
        const itemConfig = itemTableMap[documentType] || { table: 'tt_quote_items', fk: 'quote_id' }

        // PAP (purchase orders) have no client_id FK — different join
        const isPAP = documentType === 'pap'
        const selectQuery = isPAP
          ? '*, company:tt_companies(id, name, currency)'
          : '*, client:tt_clients(id, name, legal_name, tax_id, email, country), company:tt_companies(id, name, currency)'

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const { data: localDoc } = await (supabase as any)
          .from(table)
          .select(selectQuery)
          .eq('id', documentId)
          .single() as { data: Row | null }

        if (localDoc) {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const d = localDoc as any
          const clientJoined = isPAP ? null : d.client as ClientData | undefined

          setDoc({
            id: d.id,
            type: documentType,
            status: d.status || 'draft',
            display_ref: d.doc_number || d.number || '',
            system_code: d.doc_number || d.number || '',
            currency: d.currency || 'EUR',
            total: d.total || 0,
            subtotal: d.subtotal || 0,
            tax_amount: d.tax_amount || 0,
            tax_rate: isPAP ? (d.tax_rate ?? 0) : (d.tax_rate || 21),
            notes: d.notes || '',
            internal_notes: d.internal_notes || '',
            created_at: d.created_at || '',
            updated_at: d.updated_at || '',
            incoterm: d.incoterm || '',
            payment_terms: d.payment_terms || '',
            delivery_date: d.expected_date || d.delivery_date || '',
            valid_until: d.valid_until || '',
            shipping_address: d.shipping_address || '',
            subject_iva: isPAP ? false : (d.subject_iva !== false),
            subject_irpf: d.subject_irpf === true,
            created_by: d.created_by || '',
            agent: d.agent || '',
            tariff: d.tariff || '',
            client_id: d.client_id || '',
            company_id: d.company_id || '',
            client_reference: isPAP ? (d.supplier_name || '') : '',
            metadata: isPAP
              ? { supplier_name: d.supplier_name, supplier_email: d.supplier_email }
              : { doc_subtype: d.doc_subtype || undefined },
          })

          // For PAP, set supplier as "client" display
          if (isPAP && d.supplier_name) {
            setClient({ id: '', name: d.supplier_name, legal_name: d.supplier_name, tax_id: null, email: d.supplier_email || null, country: '' } as ClientData)
          } else if (clientJoined) {
            setClient(clientJoined)
          }

          // Load selling company
          const localCompanyId = d.company_id || activeCompany?.id
          if (localCompanyId) {
            const { data: companyData } = await supabase
              .from('tt_companies')
              .select('id, name, legal_name, tax_id, address, city, postal_code, country, phone, email, website')
              .eq('id', localCompanyId)
              .single()
            if (companyData) setCompany(companyData as CompanyFullData)
          }

          // Load items (tt_po_items doesn't have sort_order, use created_at)
          const itemQuery = supabase
            .from(itemConfig.table)
            .select('*')
            .eq(itemConfig.fk, documentId)
          const { data: itemsData } = isPAP
            ? await itemQuery.order('created_at')
            : await itemQuery.order('sort_order')

          setItems((itemsData || []).map((it: Row, idx: number) => ({
            id: (it.id as string) || `item-${idx}`,
            sku: (it.sku as string) || '',
            description: (it.description as string) || '',
            quantity: (it.qty_ordered as number) || (it.quantity as number) || 0,
            unit_price: (it.unit_cost as number) || (it.unit_price as number) || 0,
            unit_cost: (it.unit_cost as number) || 0,
            discount_pct: (it.discount_pct as number) || 0,
            subtotal: (it.subtotal as number) || (it.line_total as number) || 0,
            sort_order: (it.sort_order as number) || idx,
            notes: (it.notes as string) || '',
            product_id: (it.product_id as string) || null,
            is_section: false,
            section_label: '',
          })))

          // For PAP: check if there's a linked purchase invoice + load comparison data
          if (isPAP) {
            const { data: invData } = await supabase
              .from('tt_purchase_invoices')
              .select('id, number, total, due_date, status, supplier_invoice_number, comparison_status, po_total, difference_amount, difference_notes, confirmed_by, confirmed_at')
              .eq('purchase_order_id', documentId)
              .limit(1)
              .maybeSingle()
            if (invData) {
              setLinkedPurchaseInvoice({
                id: invData.id,
                number: invData.supplier_invoice_number || invData.number,
                total: invData.total,
                due_date: invData.due_date,
                status: invData.status,
                comparison_status: invData.comparison_status,
                po_total: invData.po_total,
                difference_amount: invData.difference_amount,
                difference_notes: invData.difference_notes,
                confirmed_by: invData.confirmed_by,
                confirmed_at: invData.confirmed_at,
              })
              // Load invoice items for comparison
              const { data: invItems } = await supabase
                .from('tt_purchase_invoice_items')
                .select('*')
                .eq('purchase_invoice_id', invData.id)
                .order('created_at')
              setInvoiceItems((invItems || []).map((ii: Row) => ({
                id: (ii.id as string) || '',
                purchase_invoice_id: (ii.purchase_invoice_id as string) || '',
                purchase_order_item_id: (ii.purchase_order_item_id as string) || null,
                product_id: (ii.product_id as string) || null,
                sku: (ii.sku as string) || '',
                description: (ii.description as string) || '',
                quantity: (ii.quantity as number) || 0,
                unit_price: (ii.unit_price as number) || 0,
                discount_pct: (ii.discount_pct as number) || 0,
                subtotal: (ii.subtotal as number) || 0,
                is_new_item: (ii.is_new_item as boolean) || false,
                price_differs: (ii.price_differs as boolean) || false,
                qty_differs: (ii.qty_differs as boolean) || false,
                po_unit_price: (ii.po_unit_price as number) || null,
                po_quantity: (ii.po_quantity as number) || null,
                comparison_status: (ii.comparison_status as string) || null,
                notes: (ii.notes as string) || null,
              })))
            }
          }
        }
      }
      // Load last send tracking info
      try {
        const { data: sendData } = await supabase
          .from('tt_document_sends')
          .select('sent_at, open_count, delivery_status, first_opened_at')
          .eq('document_id', documentId)
          .order('sent_at', { ascending: false })
          .limit(1)
          .single()
        if (sendData) {
          setLastSend(sendData as typeof lastSend)
        }
      } catch {
        // No sends yet, that's ok
        setLastSend(null)
      }

      // Load payments for invoice-type documents
      const isInvoiceType = documentType === 'factura' || documentType === 'invoice'
      if (isInvoiceType) {
        try {
          const sb2 = createClient()
          const { data: paymentsData } = await sb2
            .from('tt_invoice_payments')
            .select('*')
            .eq('document_id', documentId)
            .order('payment_date', { ascending: false })
          setPayments((paymentsData || []).map((p: Row) => ({
            id: (p.id as string) || '',
            document_id: (p.document_id as string) || '',
            invoice_id: (p.invoice_id as string) || null,
            amount: (p.amount as number) || 0,
            currency: (p.currency as string) || 'EUR',
            payment_date: (p.payment_date as string) || '',
            payment_method: (p.payment_method as string) || 'transferencia',
            bank_reference: (p.bank_reference as string) || null,
            bank_account: (p.bank_account as string) || null,
            notes: (p.notes as string) || null,
            receipt_url: (p.receipt_url as string) || null,
            created_at: (p.created_at as string) || '',
          })))
        } catch {
          setPayments([])
        }
      }

      // Load signatures
      try {
        const sbSig = createClient()
        const { data: sigData } = await sbSig
          .from('tt_signatures')
          .select('*')
          .eq('document_id', documentId)
          .order('created_at', { ascending: false })
        setSignatures((sigData || []).map((s: Row) => ({
          id: (s.id as string) || '',
          document_id: (s.document_id as string) || '',
          quote_id: (s.quote_id as string) || null,
          signer_name: (s.signer_name as string) || '',
          signer_email: (s.signer_email as string) || '',
          signer_role: (s.signer_role as string) || 'client',
          signature_data: (s.signature_data as string) || null,
          signature_url: (s.signature_url as string) || null,
          ip_address: (s.ip_address as string) || null,
          signed_at: (s.signed_at as string) || null,
          token: (s.token as string) || '',
          status: (s.status as string) || 'pending',
          expires_at: (s.expires_at as string) || null,
          created_at: (s.created_at as string) || '',
        })))
      } catch {
        setSignatures([])
      }

    } catch (err) {
      addToast({ type: 'error', title: 'Error cargando documento', message: (err as Error).message })
    } finally {
      setLoading(false)
    }
  }, [documentId, documentType, source, supabase, addToast])

  // ---------------------------------------------------------------
  // REGISTER PAYMENT (cobro parcial) — useCallback ARRIBA del early
  // return de !doc para no violar rules of hooks (React error #310).
  // ---------------------------------------------------------------
  const handleRegisterPayment = useCallback(async () => {
    if (!doc || newPayment.amount <= 0) return
    setSavingPayment(true)
    try {
      const sb = createClient()
      const currentPaidAmount = payments.reduce((sum, p) => sum + p.amount, 0)
      const currentDocTotal = doc.total || 0

      // Insert payment
      const { error: payErr } = await sb.from('tt_invoice_payments').insert({
        document_id: documentId,
        invoice_id: null,
        amount: newPayment.amount,
        currency: doc.currency || 'EUR',
        payment_date: newPayment.payment_date,
        payment_method: newPayment.payment_method,
        bank_reference: newPayment.bank_reference || null,
        notes: newPayment.notes || null,
      })
      if (payErr) throw payErr

      // Calculate new totals
      const newPaidAmount = currentPaidAmount + newPayment.amount
      const newPaymentCount = payments.length + 1
      const isFullyPaid = newPaidAmount >= currentDocTotal

      // Update tt_documents with paid_amount, payment_count, last_payment_date
      const updateData: Record<string, unknown> = {
        paid_amount: newPaidAmount,
        payment_count: newPaymentCount,
        last_payment_date: newPayment.payment_date,
      }
      if (isFullyPaid) {
        updateData.status = 'paid'
      } else if (newPaidAmount > 0) {
        updateData.status = 'partial'
      }

      await sb.from('tt_documents').update(updateData).eq('id', documentId)

      try {
        await sb.from('tt_activity_log').insert({
          entity_type: 'document',
          entity_id: documentId,
          action: isFullyPaid ? 'cobro_completo' : 'cobro_parcial',
          detail: `Cobro de ${newPayment.amount.toFixed(2)} ${doc.currency || 'EUR'} via ${newPayment.payment_method}${isFullyPaid ? ' — Factura cobrada al 100%' : ''}`,
        })
      } catch { /* ignore */ }

      addToast({
        type: 'success',
        title: isFullyPaid ? 'Factura cobrada al 100%' : 'Cobro registrado',
        message: `${newPayment.amount.toFixed(2)} ${doc.currency || 'EUR'}`,
      })

      setShowPaymentForm(false)
      setNewPayment({
        amount: 0,
        payment_date: new Date().toISOString().split('T')[0],
        payment_method: 'transferencia',
        bank_reference: '',
        notes: '',
      })

      loadDocument()
      onUpdate?.()
    } catch (err) {
      addToast({ type: 'error', title: 'Error registrando cobro', message: (err as Error).message })
    } finally {
      setSavingPayment(false)
    }
  }, [documentId, doc, newPayment, payments, addToast, loadDocument, onUpdate])

  useEffect(() => {
    loadDocument()
  }, [loadDocument])

  // When entering edit mode, copy data
  useEffect(() => {
    if (editMode && doc) {
      setEditDoc({ ...doc })
      setEditItems(items.map(i => ({ ...i })))
    }
  }, [editMode])

  // ---------------------------------------------------------------
  // CLIENT SEARCH
  // ---------------------------------------------------------------
  useEffect(() => {
    if (!clientSearch.trim()) { setClientResults([]); setShowClientDropdown(false); return }
    if (clientDebounceRef.current) clearTimeout(clientDebounceRef.current)
    clientDebounceRef.current = setTimeout(async () => {
      const sb = createClient()
      let q = sb.from('tt_clients')
        .select('id, name, legal_name, tax_id, email, country')
        .or(`name.ilike.%${clientSearch}%,legal_name.ilike.%${clientSearch}%,tax_id.ilike.%${clientSearch}%`)
        .eq('active', true)
      q = filterByCompany(q)
      const { data } = await q.limit(8)
      setClientResults((data || []) as ClientData[])
      setShowClientDropdown(true)
    }, 300)
    return () => { if (clientDebounceRef.current) clearTimeout(clientDebounceRef.current) }
  }, [clientSearch])

  // ---------------------------------------------------------------
  // PRODUCT SEARCH
  // ---------------------------------------------------------------
  useEffect(() => {
    if (!productSearchQuery.trim()) { setProductResults([]); return }
    if (productDebounceRef.current) clearTimeout(productDebounceRef.current)
    productDebounceRef.current = setTimeout(async () => {
      setSearchingProducts(true)
      const tokens = productSearchQuery.trim().toLowerCase().split(/\s+/)
      let q = supabase.from('tt_products').select('id, sku, name, brand, price_eur').eq('active', true).limit(15)
      for (const token of tokens) {
        q = q.or(`name.ilike.%${token}%,sku.ilike.%${token}%,brand.ilike.%${token}%`)
      }
      const { data } = await q
      setProductResults(data || [])
      setSearchingProducts(false)
    }, 300)
    return () => { if (productDebounceRef.current) clearTimeout(productDebounceRef.current) }
  }, [productSearchQuery, supabase])

  // ---------------------------------------------------------------
  // SAVE
  // ---------------------------------------------------------------
  const handleSave = async () => {
    if (!doc) return
    setSaving(true)
    try {
      if (source === 'tt_documents') {
        // Update tt_documents
        const updatedMeta = {
          ...(doc.metadata || {}),
          internal_notes: editDoc.internal_notes,
          incoterm: editDoc.incoterm,
          payment_terms: editDoc.payment_terms,
          delivery_date: editDoc.delivery_date,
          valid_until: editDoc.valid_until,
          shipping_address: editDoc.shipping_address,
          subject_iva: editDoc.subject_iva,
          subject_irpf: editDoc.subject_irpf,
          agent: editDoc.agent,
          tariff: editDoc.tariff,
          tax_rate: editDoc.tax_rate,
          client_reference: editDoc.client_reference || null,
        }

        const newTotal = recalcTotal(editItems)

        await supabase.from('tt_documents').update({
          status: editDoc.status,
          display_ref: editDoc.display_ref,
          currency: editDoc.currency,
          notes: editDoc.notes,
          subtotal: newTotal.subtotal,
          tax_amount: newTotal.tax_amount,
          total: newTotal.total,
          client_id: editDoc.client_id || doc.client_id,
          metadata: updatedMeta,
        }).eq('id', documentId)

        // Update items
        for (const item of editItems) {
          if (item.id.startsWith('new-')) {
            await supabase.from('tt_document_lines').insert({
              document_id: documentId,
              sku: item.sku,
              description: item.description,
              quantity: item.quantity,
              unit_price: item.unit_price,
              discount_pct: item.discount_pct,
              subtotal: item.subtotal,
              sort_order: item.sort_order,
              notes: item.notes,
              product_id: item.product_id,
              is_section: item.is_section,
              section_label: item.section_label,
            })
          } else {
            await supabase.from('tt_document_lines').update({
              sku: item.sku,
              description: item.description,
              quantity: item.quantity,
              unit_price: item.unit_price,
              discount_pct: item.discount_pct,
              subtotal: item.subtotal,
              sort_order: item.sort_order,
              notes: item.notes,
            }).eq('id', item.id)
          }
        }

        // Delete removed items
        const currentIds = editItems.filter(i => !i.id.startsWith('new-')).map(i => i.id)
        const originalIds = items.map(i => i.id)
        const removedIds = originalIds.filter(id => !currentIds.includes(id))
        for (const rid of removedIds) {
          await supabase.from('tt_document_lines').delete().eq('id', rid)
        }

        // Log activity (non-blocking, ignore errors)
        try {
          await supabase.from('tt_activity_log').insert({
            entity_type: 'document',
            entity_id: documentId,
            action: 'update',
            detail: 'Documento actualizado',
          })
        } catch { /* ignore */ }

      } else {
        // Update local tables
        const tableMap: Record<string, string> = {
          coti: 'tt_quotes',
          pedido: 'tt_sales_orders',
          delivery_note: 'tt_delivery_notes',
          factura: 'tt_invoices',
        }
        const table = tableMap[documentType] || 'tt_quotes'
        const newTotal = recalcTotal(editItems)

        await supabase.from(table).update({
          status: editDoc.status,
          doc_number: editDoc.display_ref,
          currency: editDoc.currency,
          notes: editDoc.notes,
          internal_notes: editDoc.internal_notes,
          incoterm: editDoc.incoterm,
          payment_terms: editDoc.payment_terms,
          subtotal: newTotal.subtotal,
          tax_amount: newTotal.tax_amount,
          total: newTotal.total,
          tax_rate: editDoc.tax_rate,
          client_id: editDoc.client_id || doc.client_id,
        }).eq('id', documentId)

        // Update items in local table
        const itemTableMap: Record<string, { table: string; fk: string }> = {
          coti: { table: 'tt_quote_items', fk: 'quote_id' },
          pedido: { table: 'tt_so_items', fk: 'sales_order_id' },
          delivery_note: { table: 'tt_dn_items', fk: 'delivery_note_id' },
          factura: { table: 'tt_invoice_items', fk: 'invoice_id' },
        }
        const itemConfig = itemTableMap[documentType] || { table: 'tt_quote_items', fk: 'quote_id' }

        for (const item of editItems) {
          if (item.id.startsWith('new-')) {
            await supabase.from(itemConfig.table).insert({
              [itemConfig.fk]: documentId,
              sku: item.sku,
              description: item.description,
              quantity: item.quantity,
              unit_price: item.unit_price,
              discount_pct: item.discount_pct,
              subtotal: item.subtotal,
              line_total: item.subtotal,
              sort_order: item.sort_order,
              notes: item.notes,
              product_id: item.product_id,
            })
          } else {
            await supabase.from(itemConfig.table).update({
              sku: item.sku,
              description: item.description,
              quantity: item.quantity,
              unit_price: item.unit_price,
              discount_pct: item.discount_pct,
              subtotal: item.subtotal,
              line_total: item.subtotal,
              sort_order: item.sort_order,
              notes: item.notes,
            }).eq('id', item.id)
          }
        }

        const currentIds = editItems.filter(i => !i.id.startsWith('new-')).map(i => i.id)
        const originalIds = items.map(i => i.id)
        const removedIds = originalIds.filter(id => !currentIds.includes(id))
        for (const rid of removedIds) {
          await supabase.from(itemConfig.table).delete().eq('id', rid)
        }
      }

      addToast({ type: 'success', title: 'Documento guardado' })
      setEditMode(false)
      onUpdate?.()
      loadDocument()
    } catch (err) {
      addToast({ type: 'error', title: 'Error guardando', message: (err as Error).message })
    } finally {
      setSaving(false)
    }
  }

  // ---------------------------------------------------------------
  // ITEM OPERATIONS
  // ---------------------------------------------------------------
  function recalcTotal(itemsList: ItemData[]) {
    const subtotal = itemsList
      .filter(i => !i.is_section)
      .reduce((sum, i) => sum + i.subtotal, 0)
    const taxRate = editDoc.tax_rate ?? doc?.tax_rate ?? 21
    const subjectIva = editDoc.subject_iva ?? doc?.subject_iva ?? true
    const tax_amount = subjectIva ? subtotal * (taxRate / 100) : 0
    return { subtotal, tax_amount, total: subtotal + tax_amount }
  }

  function recalcItem(item: ItemData): ItemData {
    const base = item.quantity * item.unit_price
    const discount = base * (item.discount_pct / 100)
    return { ...item, subtotal: base - discount }
  }

  function updateEditItem(index: number, field: keyof ItemData, value: unknown) {
    const updated = [...editItems]
    const item = { ...updated[index], [field]: value }
    updated[index] = recalcItem(item as ItemData)
    setEditItems(updated)
  }

  function addItem() {
    const newItem: ItemData = {
      id: `new-${Date.now()}`,
      sku: '',
      description: '',
      quantity: 1,
      unit_price: 0,
      discount_pct: 0,
      subtotal: 0,
      sort_order: editItems.length,
      notes: '',
      product_id: null,
      is_section: false,
      section_label: '',
    }
    setEditItems([...editItems, newItem])
  }

  function addSection() {
    const newSection: ItemData = {
      id: `new-${Date.now()}`,
      sku: '',
      description: '',
      quantity: 0,
      unit_price: 0,
      discount_pct: 0,
      subtotal: 0,
      sort_order: editItems.length,
      notes: '',
      product_id: null,
      is_section: true,
      section_label: 'OC ',
    }
    setEditItems([...editItems, newSection])
  }

  function removeItem(index: number) {
    setEditItems(editItems.filter((_, i) => i !== index))
  }

  function addProductToItems(product: Row) {
    const newItem: ItemData = {
      id: `new-${Date.now()}`,
      sku: (product.sku as string) || '',
      description: (product.name as string) || '',
      quantity: 1,
      unit_price: (product.price_eur as number) || 0,
      discount_pct: 0,
      subtotal: (product.price_eur as number) || 0,
      sort_order: editItems.length,
      notes: '',
      product_id: (product.id as string) || null,
      is_section: false,
      section_label: '',
    }
    setEditItems([...editItems, newItem])
    setShowProductSearch(false)
    setProductSearchQuery('')
  }

  // ---------------------------------------------------------------
  // DUPLICATE
  // ---------------------------------------------------------------
  const handleDuplicate = async () => {
    if (!doc) return
    addToast({ type: 'info', title: 'Funcion en desarrollo', message: 'Duplicar documento' })
    setShowMoreMenu(false)
  }

  // ---------------------------------------------------------------
  // CONVERT DOCUMENT
  // ---------------------------------------------------------------
  const handleConvert = async (targetType: 'pedido' | 'delivery_note' | 'factura') => {
    if (!doc) return
    const targetLabels: Record<string, string> = {
      pedido: 'Pedido',
      delivery_note: 'Albarán',
      factura: 'Factura',
    }
    setConverting(true)
    try {
      const res = await fetch('/api/documents/convert', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sourceDocId: documentId,
          targetType,
          companyId: doc.company_id,
        }),
      })
      const data = await res.json() as { newDocId?: string; newCode?: string; error?: string; stockAlert?: { insufficient: boolean } }
      if (!res.ok) throw new Error(data.error || 'Error en conversión')

      const label = targetLabels[targetType] || targetType
      let msg = `${label} ${data.newCode} creado correctamente`
      if (data.stockAlert?.insufficient) {
        msg += ' — ¡Atención! Hay items con stock insuficiente'
      }
      addToast({ type: 'success', title: msg })
      loadDocument()
      onUpdate?.()
    } catch (err) {
      addToast({ type: 'error', title: 'Error en conversión', message: (err as Error).message })
    } finally {
      setConverting(false)
    }
  }

  // ---------------------------------------------------------------
  // DELETE
  // ---------------------------------------------------------------
  const handleDelete = async () => {
    if (!doc) return
    try {
      if (source === 'tt_documents') {
        await supabase.from('tt_document_lines').delete().eq('document_id', documentId)
        await supabase.from('tt_documents').delete().eq('id', documentId)
      } else {
        const tableMap: Record<string, string> = {
          coti: 'tt_quotes',
          pedido: 'tt_sales_orders',
          delivery_note: 'tt_delivery_notes',
          factura: 'tt_invoices',
        }
        await supabase.from(tableMap[documentType] || 'tt_quotes').delete().eq('id', documentId)
      }
      addToast({ type: 'success', title: 'Documento eliminado' })
      onBack()
    } catch (err) {
      addToast({ type: 'error', title: 'Error', message: (err as Error).message })
    }
    setShowDeleteConfirm(false)
  }

  // ---------------------------------------------------------------
  // PRINT — with professional filename
  // ---------------------------------------------------------------
  const handlePrint = () => {
    if (!doc) { window.print(); return }
    const date = doc.created_at ? doc.created_at.split('T')[0] : new Date().toISOString().split('T')[0]
    const ref = (doc.display_ref || doc.system_code || 'DOC').replace(/\s+/g, '-')
    const companyName = (company?.name || 'Empresa').replace(/\s+/g, '_')
    const clientStr = (client?.legal_name || client?.name || 'Cliente').replace(/\s+/g, '_').substring(0, 60)
    const curr = (doc.currency || 'EUR').toUpperCase()
    const amount = String((doc.total || 0).toFixed(2)).replace('.', ',')
    const ocRef = (doc.metadata as Record<string, unknown>)?.client_reference as string || ''
    let filename = `${date}-${ref}-${companyName}-${clientStr}-${curr}_${amount}`
    if (ocRef) filename += `-${ocRef.replace(/\s+/g, '')}`

    const originalTitle = window.document.title
    window.document.title = filename
    window.print()
    setTimeout(() => { window.document.title = originalTitle }, 1000)
  }

  // ---------------------------------------------------------------
  // NAVIGATION
  // ---------------------------------------------------------------
  const goToSibling = (direction: 'prev' | 'next') => {
    if (!siblingIds || currentIndex < 0) return
    const newIdx = direction === 'prev' ? currentIndex - 1 : currentIndex + 1
    if (newIdx >= 0 && newIdx < siblingIds.length) {
      // The parent must handle this navigation - for now signal through onBack
      // We reload with the new ID
      window.location.hash = `doc-${siblingIds[newIdx]}`
      window.location.reload()
    }
  }

  // ---------------------------------------------------------------
  // RENDER HELPERS
  // ---------------------------------------------------------------
  const statusOptions = STATUS_OPTIONS[documentType] || STATUS_OPTIONS.coti
  const currentStatus = statusOptions.find(s => s.value === doc?.status) || statusOptions[0]
  const displayItems = editMode ? editItems : items
  const displayDoc = editMode ? { ...doc, ...editDoc } as DocumentData : doc

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <Loader2 className="animate-spin text-[#FF6600]" size={32} />
      </div>
    )
  }

  if (!doc) {
    return (
      <div className="text-center py-20 text-[#6B7280]">
        <FileText size={48} className="mx-auto mb-4 opacity-40" />
        <p>Documento no encontrado</p>
        <Button variant="outline" className="mt-4" onClick={onBack}>Volver</Button>
      </div>
    )
  }

  // ---------------------------------------------------------------
  // CALCULATE TOTALS
  // ---------------------------------------------------------------
  const totals = (() => {
    const itemsToCalc = displayItems.filter(i => !i.is_section)
    const subtotal = itemsToCalc.reduce((s, i) => s + i.subtotal, 0)
    const taxRate = displayDoc?.tax_rate ?? 21
    const subjectIva = displayDoc?.subject_iva ?? true
    const taxAmount = subjectIva ? subtotal * (taxRate / 100) : 0
    return { subtotal, taxAmount, total: subtotal + taxAmount }
  })()

  // ---------------------------------------------------------------
  // PO vs INVOICE COMPARISON
  // ---------------------------------------------------------------
  const isPAPWithInvoice = documentType === 'pap' && !!linkedPurchaseInvoice
  const comparisonRows: ComparisonRow[] = (() => {
    if (!isPAPWithInvoice) return []
    const poItems = items.filter(i => !i.is_section)
    const rows: ComparisonRow[] = []

    if (invoiceItems.length > 0) {
      // We have real invoice items -- match them
      const matchedPoIds = new Set<string>()

      for (const ii of invoiceItems) {
        // Try to find matching PO item by purchase_order_item_id or sku
        const poMatch = ii.purchase_order_item_id
          ? poItems.find(p => p.id === ii.purchase_order_item_id)
          : poItems.find(p => p.sku && p.sku === ii.sku)

        if (poMatch) {
          matchedPoIds.add(poMatch.id)
          const priceDiff = Math.abs((poMatch.unit_price || 0) - (ii.unit_price || 0)) > 0.01
          const qtyDiff = Math.abs((poMatch.quantity || 0) - (ii.quantity || 0)) > 0.001
          let status: ComparisonStatus = 'ok'
          if (priceDiff && qtyDiff) status = 'precio_diferente'
          else if (priceDiff) status = 'precio_diferente'
          else if (qtyDiff) status = 'cantidad_diferente'

          rows.push({
            key: `match-${ii.id}`,
            description: ii.description || poMatch.description,
            sku: ii.sku || poMatch.sku,
            poQty: poMatch.quantity,
            poPrice: poMatch.unit_price,
            poSubtotal: poMatch.subtotal,
            invQty: ii.quantity,
            invPrice: ii.unit_price,
            invSubtotal: ii.subtotal,
            status,
          })
        } else {
          // Invoice item not in PO -> NUEVO
          rows.push({
            key: `new-${ii.id}`,
            description: ii.description,
            sku: ii.sku,
            poQty: null,
            poPrice: null,
            poSubtotal: null,
            invQty: ii.quantity,
            invPrice: ii.unit_price,
            invSubtotal: ii.subtotal,
            status: 'nuevo',
          })
        }
      }

      // PO items not matched -> FALTANTE
      for (const po of poItems) {
        if (!matchedPoIds.has(po.id)) {
          rows.push({
            key: `missing-${po.id}`,
            description: po.description,
            sku: po.sku,
            poQty: po.quantity,
            poPrice: po.unit_price,
            poSubtotal: po.subtotal,
            invQty: null,
            invPrice: null,
            invSubtotal: null,
            status: 'faltante',
          })
        }
      }
    } else {
      // No invoice items in DB -- auto-generate comparison from PO items + total difference
      const poTotal = poItems.reduce((s, i) => s + (i.subtotal || 0), 0)
      const invTotal = linkedPurchaseInvoice!.total || 0
      const diff = invTotal - poTotal

      // All PO items are "matched" with same values (since we have no line detail)
      for (const po of poItems) {
        rows.push({
          key: `auto-${po.id}`,
          description: po.description,
          sku: po.sku,
          poQty: po.quantity,
          poPrice: po.unit_price,
          poSubtotal: po.subtotal,
          invQty: po.quantity,
          invPrice: po.unit_price,
          invSubtotal: po.subtotal,
          status: 'ok',
        })
      }

      // If there's a difference, add synthetic transport/extras line
      if (Math.abs(diff) > 0.01) {
        rows.push({
          key: 'synthetic-transport',
          description: diff > 0 ? 'GASTOS DE TRANSPORTE' : 'DESCUENTO / AJUSTE',
          sku: '-',
          poQty: null,
          poPrice: null,
          poSubtotal: null,
          invQty: 1,
          invPrice: Math.abs(diff),
          invSubtotal: diff,
          status: 'nuevo',
        })
      }
    }

    return rows
  })()

  const comparisonSummary = (() => {
    if (!isPAPWithInvoice) return null
    const poTotal = items.filter(i => !i.is_section).reduce((s, i) => s + (i.subtotal || 0), 0)
    const invTotal = linkedPurchaseInvoice!.total || 0
    const diff = invTotal - poTotal
    const diffPct = poTotal > 0 ? (diff / poTotal) * 100 : 0
    return { poTotal, invTotal, diff, diffPct }
  })()

  const handleConfirmComparison = async () => {
    if (!linkedPurchaseInvoice) return
    setComparisonConfirming(true)
    try {
      const sb = createClient()
      const poTotal = items.filter(i => !i.is_section).reduce((s, i) => s + (i.subtotal || 0), 0)
      const invTotal = linkedPurchaseInvoice.total || 0

      await sb.from('tt_purchase_invoices').update({
        comparison_status: 'confirmed',
        po_total: poTotal,
        difference_amount: invTotal - poTotal,
        confirmed_by: 'admin',
        confirmed_at: new Date().toISOString(),
      }).eq('id', linkedPurchaseInvoice.id)

      setLinkedPurchaseInvoice(prev => prev ? {
        ...prev,
        comparison_status: 'confirmed',
        po_total: poTotal,
        difference_amount: invTotal - poTotal,
        confirmed_by: 'admin',
        confirmed_at: new Date().toISOString(),
      } : null)

      addToast({ type: 'success', title: 'Comparacion confirmada', message: 'Las diferencias fueron revisadas y confirmadas' })
    } catch (err) {
      addToast({ type: 'error', title: 'Error', message: (err as Error).message })
    } finally {
      setComparisonConfirming(false)
    }
  }

  // ---------------------------------------------------------------
  // REGISTER PAYMENT (cobro parcial)
  // ---------------------------------------------------------------
  // Variables derivadas para el JSX (ya está post early-return; no hay
  // problema de orden de hooks acá).
  const isInvoiceType = documentType === 'factura' || documentType === 'invoice'
  const paidAmount = payments.reduce((sum, p) => sum + p.amount, 0)
  const docTotal = doc?.total || 0
  const remainingAmount = Math.max(0, docTotal - paidAmount)
  const paidPct = docTotal > 0 ? Math.min(100, (paidAmount / docTotal) * 100) : 0
  // El useCallback de handleRegisterPayment se movió ARRIBA del early
  // return (cerca de loadDocument) para no violar las rules of hooks.

  // ===============================================================
  // RENDER
  // ===============================================================
  // ═══════════════════════════════════════════════════════════════════
  // Map de documentType → tipo de workflow + paso actual según status
  // ═══════════════════════════════════════════════════════════════════
  const workflowTypeMap: Record<string, DocumentType> = {
    coti: 'quote', cotizacion: 'quote', quote: 'quote',
    pedido: 'sales_order', sales_order: 'sales_order',
    albaran: 'delivery_note', remito: 'delivery_note', delivery_note: 'delivery_note',
    factura: 'invoice', invoice: 'invoice',
    nota_credito: 'credit_note', credit_note: 'credit_note',
    oc: 'purchase_order', orden_compra: 'purchase_order', purchase_order: 'purchase_order', pap: 'purchase_order',
  }
  const wfType = workflowTypeMap[documentType] || 'quote'

  const statusToStepMap: Record<DocumentType, Record<string, string>> = {
    quote: { draft: 'draft', borrador: 'draft', pending: 'conditions', sent: 'sent', enviada: 'sent', accepted: 'accepted', aceptada: 'accepted', converted: 'converted', approved: 'approval' },
    sales_order: { draft: 'created', open: 'created', confirmed: 'po_received', in_production: 'production', shipped: 'delivery', delivered: 'delivery', invoiced: 'invoice' },
    delivery_note: { draft: 'prepared', prepared: 'prepared', shipped: 'shipped', delivered: 'delivered', signed: 'signed', invoiced: 'invoiced' },
    invoice: { draft: 'draft', borrador: 'draft', emitida: 'emitted', emitted: 'emitted', autorizada: 'authorized', authorized: 'authorized', sent: 'sent', cobrada: 'collected', paid: 'collected' },
    credit_note: { draft: 'draft', emitted: 'emitted', authorized: 'authorized', applied: 'applied' },
    purchase_order: { draft: 'draft', borrador: 'draft', sent: 'sent', enviada: 'sent', confirmed: 'confirmed', confirmada: 'confirmed', received: 'received', recibida: 'received', partial: 'received', recibida_parcial: 'received', invoiced: 'invoiced', paid: 'paid', cancelada: 'draft' },
    client_po: {}, lead: {}, opportunity: {}, sat_ticket: {}, bank_statement: {},
  }
  let currentStepId = statusToStepMap[wfType]?.[doc.status] || Object.values(statusToStepMap[wfType] || {})[0] || 'draft'
  // For purchase orders: advance step if linked invoice exists
  if (wfType === 'purchase_order' && linkedPurchaseInvoice) {
    if (linkedPurchaseInvoice.status === 'paid') {
      currentStepId = 'paid'
    } else {
      // Invoice exists but not paid yet → facturada is completed, pagada is current
      currentStepId = 'paid' // "paid" as current means facturada=completed, pagada=current
    }
  }

  // Variants de badge por status
  const badgeVariant: 'default'|'warning'|'success'|'danger'|'info' =
    ['cobrada','paid','accepted','aceptada','delivered','received','recibida','collected','autorizada','authorized'].includes(doc.status) ? 'success'
    : ['emitted','emitida','sent','enviada','confirmed','confirmada','shipped'].includes(doc.status) ? 'info'
    : ['cancelled','cancelada','rejected','rechazada'].includes(doc.status) ? 'danger'
    : ['draft','borrador','pending','prepared','open'].includes(doc.status) ? 'warning'
    : 'default'

  // Alertas dinámicas
  const barAlerts: Array<{ type: 'info'|'warning'|'error'|'success'; message: string }> = []
  if (editMode) barAlerts.push({ type: 'warning', message: 'Estás en modo edición — acordate de guardar' })
  if (!doc.system_code) barAlerts.push({ type: 'info', message: 'Este documento aún no tiene código asignado' })
  // Purchase order: invoice & payment alerts
  if (wfType === 'purchase_order' && linkedPurchaseInvoice) {
    const inv = linkedPurchaseInvoice
    if (inv.status === 'paid') {
      barAlerts.push({ type: 'success', message: `Factura ${inv.number} pagada` })
    } else if (inv.due_date) {
      const today = new Date(); today.setHours(0,0,0,0)
      const due = new Date(inv.due_date); due.setHours(0,0,0,0)
      const diffDays = Math.ceil((due.getTime() - today.getTime()) / 86400000)
      if (diffDays < 0) {
        barAlerts.push({ type: 'error', message: `VENCIDA — Factura ${inv.number} por ${inv.total.toLocaleString('es-ES')} EUR venció hace ${Math.abs(diffDays)} días (${due.toLocaleDateString('es-ES')})` })
      } else if (diffDays <= 7) {
        barAlerts.push({ type: 'warning', message: `Factura ${inv.number} por ${inv.total.toLocaleString('es-ES')} EUR vence en ${diffDays} días (${due.toLocaleDateString('es-ES')})` })
      } else {
        barAlerts.push({ type: 'info', message: `Factura ${inv.number} por ${inv.total.toLocaleString('es-ES')} EUR — vence el ${due.toLocaleDateString('es-ES')} (${diffDays} días)` })
      }
    }
  }

  return (
    <div className="max-w-[1200px] mx-auto space-y-0 animate-fade-in pb-24 print:pb-0 print:bg-white print:text-black">

      {/* ═══════════════════════════════════════════════════════════════
           REGLA FUNDAMENTAL — Barra de proceso sticky
          ═══════════════════════════════════════════════════════════════ */}
      <div className="-mx-4 print:hidden">
        <DocumentProcessBar
          code={doc.display_ref || doc.system_code || 'sin-codigo'}
          badge={{ label: doc.status || '—', variant: badgeVariant }}
          entity={<span>Tipo: <strong>{documentType.toUpperCase()}</strong> · Total: {formatCurrency(doc.total || 0, (doc.currency as 'EUR'|'USD'|'ARS') || 'EUR')}</span>}
          alerts={barAlerts}
          steps={buildSteps(wfType, currentStepId,
            // Si este pedido tiene OC del cliente vinculada, marcar el
            // step "po_received" como completado con tooltip que muestra
            // el número de la OC. Solo aplica para sales_order.
            wfType === 'sales_order' && clientPoCtx?.has_client_po
              ? {
                  po_received: {
                    status: 'completed',
                    label: `OC ${clientPoCtx.oc_number || 'cliente'}`,
                    hint: `OC del cliente recibida (${clientPoCtx.oc_status || 'matcheada'})${clientPoCtx.discrepancies_count ? ` · ${clientPoCtx.discrepancies_count} discrepancias` : ''}`,
                  },
                }
              : undefined
          )}
          actions={[]}
        />
      </div>

      {/* ====== TOP ACTION BAR ====== */}
      <div className="sticky top-0 z-30 bg-[#0B0E13]/95 backdrop-blur-sm border-b border-[#1E2330] px-4 py-3 -mx-4 mb-4 print:hidden">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          {/* Left: Back + Edit */}
          <div className="flex items-center gap-2">
            <Button data-testid="doc-back" variant="ghost" size="sm" onClick={onBack}>
              <ArrowLeft size={16} /> Volver
            </Button>

            <div className="w-px h-6 bg-[#2A3040]" />

            <Button
              data-testid={editMode ? 'doc-save' : 'doc-edit'}
              variant={editMode ? 'primary' : 'outline'}
              size="sm"
              onClick={() => {
                if (editMode) {
                  handleSave()
                } else {
                  setEditMode(true)
                }
              }}
              loading={saving}
            >
              {editMode ? <><Save size={14} /> Guardar</> : <><Edit3 size={14} /> Editar</>}
            </Button>

            {editMode && (
              <Button data-testid="doc-cancel-edit" variant="ghost" size="sm" onClick={() => setEditMode(false)}>
                <X size={14} /> Cancelar
              </Button>
            )}
          </div>

          {/* Center: navigation */}
          {siblingIds && siblingIds.length > 1 && (
            <div className="flex items-center gap-2 text-sm text-[#6B7280]">
              <button
                onClick={() => goToSibling('prev')}
                disabled={currentIndex <= 0}
                className="p-1 hover:text-[#FF6600] disabled:opacity-30 disabled:cursor-not-allowed"
              >
                <ChevronLeft size={16} />
              </button>
              <span className="text-xs">
                {currentIndex + 1} de {totalSiblings}
              </span>
              <button
                onClick={() => goToSibling('next')}
                disabled={currentIndex >= totalSiblings - 1}
                className="p-1 hover:text-[#FF6600] disabled:opacity-30 disabled:cursor-not-allowed"
              >
                <ChevronRight size={16} />
              </button>
            </div>
          )}

          {/* Right: Actions */}
          <div className="flex items-center gap-2">
            {/* Send tracking indicator */}
            {lastSend && (
              <button
                onClick={() => setShowSendModal(true)}
                className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium transition-all ${
                  lastSend.open_count > 0
                    ? 'bg-[#10B981]/15 text-[#10B981] hover:bg-[#10B981]/25'
                    : 'bg-[#F59E0B]/15 text-[#F59E0B] hover:bg-[#F59E0B]/25'
                }`}
                title="Ver historial de envios"
              >
                {lastSend.open_count > 0 ? <Eye size={12} /> : <Send size={12} />}
                {lastSend.open_count > 0
                  ? `Abierto ${lastSend.open_count}x`
                  : `Enviado ${formatRelative(lastSend.sent_at)}`
                }
              </button>
            )}

            <Button variant="outline" size="sm" onClick={handlePrint}>
              <Printer size={14} />
            </Button>

            <Button variant="outline" size="sm" onClick={() => setShowSendModal(true)}>
              <Mail size={14} />
            </Button>

            {/* More menu */}
            <div className="relative">
              <Button variant="outline" size="sm" onClick={() => setShowMoreMenu(!showMoreMenu)}>
                <MoreVertical size={14} />
              </Button>
              {showMoreMenu && (
                <>
                  <div className="fixed inset-0 z-40" onClick={() => setShowMoreMenu(false)} />
                  <div className="absolute right-0 top-full mt-1 w-48 bg-[#1C2230] border border-[#2A3040] rounded-lg shadow-xl z-50 py-1">
                    <button
                      onClick={handleDuplicate}
                      className="w-full flex items-center gap-2 px-3 py-2 text-sm text-[#9CA3AF] hover:bg-[#2A3040] hover:text-[#F0F2F5]"
                    >
                      <Copy size={14} /> Duplicar
                    </button>
                    <button
                      onClick={() => { setShowDeleteConfirm(true); setShowMoreMenu(false) }}
                      className="w-full flex items-center gap-2 px-3 py-2 text-sm text-red-400 hover:bg-red-500/10"
                    >
                      <Trash2 size={14} /> Eliminar
                    </button>
                  </div>
                </>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* ====== DOCUMENT ACTIONS (workflow buttons) ====== */}
      {!editMode && (
        <DocumentActions
          document={doc as unknown as Row}
          documentType={documentType as DocumentActionType}
          source={source}
          clientName={client?.name || client?.legal_name || ''}
          clientEmail={client?.email || undefined}
          clientId={client?.id || doc?.client_id || undefined}
          onAction={(action) => {
            loadDocument()
            onUpdate?.()
          }}
        />
      )}

      {/* ====== CONVERT BUTTONS ====== */}
      {!editMode && source === 'tt_documents' && (
        <div className="flex items-center gap-2 flex-wrap mb-3 print:hidden">
          {/* Cotización → Pedido */}
          {documentType === 'coti' && (doc.status === 'accepted' || doc.status === 'sent' || doc.status === 'draft') && (
            <Button
              variant="secondary"
              size="sm"
              onClick={() => handleConvert('pedido')}
              loading={converting}
            >
              <GitMerge size={13} /> Convertir a Pedido
            </Button>
          )}
          {/* Pedido → Albarán */}
          {documentType === 'pedido' && (doc.status === 'open' || doc.status === 'partially_delivered') && (
            <Button
              variant="secondary"
              size="sm"
              onClick={() => handleConvert('delivery_note')}
              loading={converting}
            >
              <GitMerge size={13} /> Convertir a Albarán
            </Button>
          )}
          {/* Pedido → Factura */}
          {documentType === 'pedido' && (doc.status === 'fully_delivered' || doc.status === 'partially_invoiced') && (
            <Button
              variant="secondary"
              size="sm"
              onClick={() => handleConvert('factura')}
              loading={converting}
            >
              <GitMerge size={13} /> Convertir a Factura
            </Button>
          )}
          {/* Albarán → Factura */}
          {documentType === 'delivery_note' && (doc.status === 'delivered' || doc.status === 'pending') && (
            <Button
              variant="secondary"
              size="sm"
              onClick={() => handleConvert('factura')}
              loading={converting}
            >
              <GitMerge size={13} /> Convertir a Factura
            </Button>
          )}
        </div>
      )}

      {/* ====== DOCUMENT CHAIN (trazabilidad) ====== */}
      {!editMode && source === 'tt_documents' && (
        <div className="mb-3 print:hidden">
          <DocumentChain documentId={documentId} />
        </div>
      )}

      {/* ====== PRINT-ONLY HEADER ====== */}
      <div className="hidden print:block mb-6">
        <div className="flex justify-between border-b-2 border-black pb-4">
          <div>
            {company && (
              <>
                <h1 className="text-xl font-bold">{company.legal_name || company.name}</h1>
                {company.tax_id && <p className="text-sm">CIF/CUIT: {company.tax_id}</p>}
                {company.email && <p className="text-sm">{company.email}</p>}
                {company.phone && <p className="text-sm">Tel: {company.phone}</p>}
                {(company.address || company.city) && (
                  <p className="text-sm">{[company.address, company.city, company.postal_code, company.country].filter(Boolean).join(', ')}</p>
                )}
              </>
            )}
          </div>
          <div className="text-right">
            <p className="text-xs font-bold uppercase tracking-wider">{TYPE_LABELS[doc.metadata?.doc_subtype as string || documentType] || TYPE_LABELS[documentType] || documentType}</p>
            <h2 className="text-lg font-bold">{doc.display_ref || doc.system_code}</h2>
            <p className="text-sm">Fecha: {doc.created_at ? formatDate(doc.created_at) : '-'}</p>
            <p className="text-sm">Estado: {currentStatus.label || mapStatus(doc.status)}</p>
            {doc.payment_terms && (
              <p className="text-sm">Pago: {PAYMENT_TERMS.find(pt => pt.value === doc.payment_terms)?.label || doc.payment_terms}</p>
            )}
          </div>
        </div>
        {client && (
          <div className="mt-3 pt-2">
            <p className="text-xs font-bold uppercase tracking-wider mb-1">Cliente</p>
            <p className="text-sm font-bold">{client.legal_name || client.name}</p>
            {client.tax_id && <p className="text-sm">CIF/CUIT: {client.tax_id}</p>}
            {client.email && <p className="text-sm">{client.email}</p>}
          </div>
        )}
      </div>

      {/* ====== PARENT DOC LINK ====== */}
      {parentLinks.length > 0 && (
        <div className="flex items-center gap-2 px-1 py-2 print:hidden">
          {parentLinks.map((pl) => (
            <span key={pl.id} className="inline-flex items-center gap-1.5 text-xs text-[#9CA3AF]">
              <Link2 size={12} className="text-[#6B7280]" />
              Generado a partir de:
              <DocLink
                docRef={pl.display_ref || `${PREFIX_MAP[pl.type] || pl.type}`}
                docId={pl.id}
                docType={pl.type}
                className="text-xs"
              />
              {pl.created_at && (
                <span className="text-[#4B5563]">({formatDate(pl.created_at)})</span>
              )}
            </span>
          ))}
        </div>
      )}

      {/* ====== COMPANY + CLIENT HEADER (StelOrder style) ====== */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-3 print:hidden">
        {/* LEFT: Empresa emisora (vendedora) */}
        {company && (
          <div className="bg-[#141820] rounded-xl border border-[#2A3040] p-4">
            <div className="flex items-center gap-2 mb-2">
              <Building2 size={14} className="text-[#FF6600]" />
              <span className="text-[10px] font-bold text-[#6B7280] uppercase tracking-wider">Empresa emisora</span>
            </div>
            <p className="text-base font-bold text-[#F0F2F5] mb-1">{company.legal_name || company.name}</p>
            {company.tax_id && <p className="text-xs text-[#9CA3AF] mb-1">CIF/CUIT: {company.tax_id}</p>}
            {(company.address || company.city) && (
              <p className="text-xs text-[#6B7280]">
                {[company.address, company.city, company.postal_code, company.country].filter(Boolean).join(', ')}
              </p>
            )}
            <div className="flex flex-wrap gap-x-4 gap-y-0.5 mt-2">
              {company.phone && <span className="text-xs text-[#6B7280]">Tel: {company.phone}</span>}
              {company.email && <span className="text-xs text-[#6B7280]">{company.email}</span>}
              {company.website && <span className="text-xs text-[#6B7280]">{company.website}</span>}
            </div>
          </div>
        )}

        {/* RIGHT: Cliente (comprador) */}
        <div className="bg-[#141820] rounded-xl border border-[#2A3040] p-4">
          <div className="flex items-center gap-2 mb-2">
            <FileText size={14} className="text-[#3B82F6]" />
            <span className="text-[10px] font-bold text-[#6B7280] uppercase tracking-wider">Cliente</span>
          </div>
          {client ? (
            <>
              <p className="text-base font-bold text-[#F0F2F5] mb-1">{client.legal_name || client.name}</p>
              {client.tax_id && <p className="text-xs text-[#9CA3AF] mb-1">CIF/CUIT: {client.tax_id}</p>}
              {client.email && <p className="text-xs text-[#6B7280]">{client.email}</p>}
              {client.country && <p className="text-xs text-[#6B7280]">Pais: {client.country}</p>}
            </>
          ) : (
            <p className="text-sm text-[#4B5563]">Sin cliente asignado</p>
          )}
        </div>
      </div>

      {/* ====== HEADER SECTION ====== */}
      <div className="bg-[#141820] rounded-xl border border-[#2A3040] p-5 mt-3 print:hidden">
        {/* Row 1: Type badge + Ref + Status */}
        <div className="flex items-center justify-between gap-4 mb-5">
          <div className="flex items-center gap-3 flex-wrap">
            {editMode && (documentType === 'coti' || documentType === 'cotizacion') ? (
              <select
                value={(editDoc.metadata as Record<string, unknown>)?.doc_subtype as string || doc.metadata?.doc_subtype as string || 'cotizacion'}
                onChange={(e) => setEditDoc({ ...editDoc, metadata: { ...doc.metadata, ...editDoc.metadata as Record<string, unknown>, doc_subtype: e.target.value } })}
                className="px-3 py-1 rounded-full text-xs font-bold uppercase tracking-wide bg-[#FF6600] text-white border-none outline-none cursor-pointer"
              >
                {QUOTE_SUBTYPES.map(st => (
                  <option key={st.value} value={st.value} className="bg-[#141820] text-[#F0F2F5]">{st.icon} {st.label}</option>
                ))}
              </select>
            ) : (
              <span className="px-3 py-1 rounded-full text-xs font-bold uppercase tracking-wide bg-[#FF6600] text-white">
                {TYPE_LABELS[doc.metadata?.doc_subtype as string || documentType] || TYPE_LABELS[documentType] || documentType}
              </span>
            )}
            {editMode ? (
              <div className="flex items-center gap-1">
                <select
                  value={(editDoc.display_ref || '').split('-')[0] || PREFIX_MAP[documentType]}
                  onChange={(e) => {
                    const parts = (editDoc.display_ref || '').split('-')
                    parts[0] = e.target.value
                    setEditDoc({ ...editDoc, display_ref: parts.join('-') })
                  }}
                  className="h-8 rounded-md bg-[#0B0E13] border border-[#FF6600] px-2 text-xs text-[#F0F2F5] focus:outline-none"
                >
                  {Object.entries(PREFIX_MAP).map(([, prefix]) => (
                    <option key={prefix} value={prefix}>{prefix}</option>
                  ))}
                </select>
                <input
                  type="text"
                  value={(editDoc.display_ref || '').replace(/^[A-Z]+-?/, '')}
                  onChange={(e) => {
                    const prefix = (editDoc.display_ref || '').split('-')[0] || PREFIX_MAP[documentType]
                    setEditDoc({ ...editDoc, display_ref: `${prefix}-${e.target.value}` })
                  }}
                  className="h-8 w-40 rounded-md bg-[#0B0E13] border border-[#FF6600] px-2 text-sm text-[#F0F2F5] font-mono focus:outline-none"
                />
              </div>
            ) : (
              <code data-testid="doc-code" className="text-sm font-mono text-[#9CA3AF] bg-[#0B0E13] px-2.5 py-1 rounded-md border border-[#2A3040]">
                {doc.display_ref || doc.system_code || '-'}
              </code>
            )}
          </div>

          {/* Status */}
          {editMode ? (
            <select
              value={editDoc.status || doc.status}
              onChange={(e) => setEditDoc({ ...editDoc, status: e.target.value })}
              className="h-8 rounded-full bg-[#0B0E13] border border-[#FF6600] px-3 text-xs font-bold text-[#F0F2F5] focus:outline-none"
            >
              {statusOptions.map(s => (
                <option key={s.value} value={s.value}>{s.label}</option>
              ))}
            </select>
          ) : (
            <span
              data-testid="doc-status"
              data-status={doc.status}
              className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold"
              style={{
                background: `${currentStatus.color}20`,
                color: currentStatus.color,
              }}
            >
              <span className="w-2 h-2 rounded-full" style={{ background: currentStatus.color }} />
              {currentStatus.label || mapStatus(doc.status)}
            </span>
          )}
        </div>

        {/* Row 2: Field Grid (StelOrder style — 2 columnas) */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-4">
          {/* Fecha */}
          <FieldRow label="Fecha" editMode={editMode}>
            {editMode ? (
              <input
                type="date"
                value={(editDoc.created_at || doc.created_at || '').slice(0, 10)}
                onChange={(e) => setEditDoc({ ...editDoc, created_at: e.target.value })}
                className="h-9 w-full rounded-lg bg-[#0B0E13] border border-[#FF6600] px-3 text-sm text-[#F0F2F5] focus:outline-none"
              />
            ) : (
              <span className="text-sm text-[#F0F2F5]">{doc.created_at ? formatDate(doc.created_at) : '-'}</span>
            )}
          </FieldRow>

          {/* Cliente */}
          <FieldRow label="Cliente" editMode={editMode}>
            {editMode ? (
              <div className="relative">
                <input
                  type="text"
                  value={clientSearch || client?.name || ''}
                  onChange={(e) => setClientSearch(e.target.value)}
                  onFocus={() => { if (clientSearch) setShowClientDropdown(true) }}
                  placeholder="Buscar cliente..."
                  className="h-9 w-full rounded-lg bg-[#0B0E13] border border-[#FF6600] px-3 text-sm text-[#F0F2F5] focus:outline-none"
                />
                {showClientDropdown && clientResults.length > 0 && (
                  <div className="absolute z-50 left-0 right-0 top-full mt-1 bg-[#1C2230] border border-[#2A3040] rounded-lg shadow-xl max-h-48 overflow-y-auto">
                    {clientResults.map((c) => (
                      <button
                        key={c.id}
                        onClick={() => {
                          setClient(c)
                          // Auto IVA: España→España = 21%, España→otro país = 0%
                          const clientCountry = (c.country || '').toUpperCase()
                          const isExport = clientCountry && clientCountry !== 'ES'
                          setEditDoc({
                            ...editDoc,
                            client_id: c.id,
                            subject_iva: !isExport,
                            tax_rate: isExport ? 0 : 21,
                          })
                          if (isExport) {
                            addToast({ type: 'info', title: `Cliente de ${clientCountry} — IVA 0% (exportacion)` })
                          }
                          setClientSearch('')
                          setShowClientDropdown(false)
                        }}
                        className="w-full text-left px-3 py-2 text-sm text-[#F0F2F5] hover:bg-[#2A3040] border-b border-[#1E2330] last:border-0"
                      >
                        <span className="font-medium">{c.name}</span>
                        {c.tax_id && <span className="ml-2 text-xs text-[#6B7280]">{c.tax_id}</span>}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            ) : (
              <span className="text-sm text-[#F0F2F5] font-medium">
                {client?.legal_name || client?.name || 'Sin cliente'}
                {client?.tax_id && (
                  <span className="ml-2 text-xs text-[#6B7280]">({client.tax_id})</span>
                )}
              </span>
            )}
          </FieldRow>

          {/* Moneda */}
          <FieldRow label="Moneda" editMode={editMode}>
            {editMode ? (
              <select
                value={editDoc.currency || doc.currency}
                onChange={(e) => setEditDoc({ ...editDoc, currency: e.target.value })}
                className="h-9 w-full rounded-lg bg-[#0B0E13] border border-[#FF6600] px-3 text-sm text-[#F0F2F5] focus:outline-none"
              >
                {CURRENCY_OPTIONS.map(c => <option key={c.value} value={c.value}>{c.label}</option>)}
              </select>
            ) : (
              <span className="text-sm text-[#F0F2F5]">{doc.currency || 'EUR'}</span>
            )}
          </FieldRow>

          {/* Forma de pago */}
          <FieldRow label="Forma de pago" editMode={editMode}>
            {editMode ? (
              <select
                value={editDoc.payment_terms || doc.payment_terms}
                onChange={(e) => setEditDoc({ ...editDoc, payment_terms: e.target.value })}
                className="h-9 w-full rounded-lg bg-[#0B0E13] border border-[#FF6600] px-3 text-sm text-[#F0F2F5] focus:outline-none"
              >
                {PAYMENT_TERMS.map(pt => <option key={pt.value} value={pt.value}>{pt.label}</option>)}
              </select>
            ) : (
              <span className="text-sm text-[#F0F2F5]">
                {PAYMENT_TERMS.find(pt => pt.value === doc.payment_terms)?.label || doc.payment_terms || '-'}
              </span>
            )}
          </FieldRow>

          {/* OC del cliente */}
          <FieldRow label="OC del cliente" editMode={editMode}>
            {editMode ? (
              <input
                value={editDoc.client_reference || (doc.metadata as Row)?.client_reference as string || ''}
                onChange={(e) => setEditDoc({ ...editDoc, client_reference: e.target.value })}
                placeholder="Nro. orden de compra del cliente"
                className="h-9 w-full rounded-lg bg-[#0B0E13] border border-[#FF6600] px-3 text-sm text-[#F0F2F5] focus:outline-none placeholder:text-[#4B5563]"
              />
            ) : (
              <span className="text-sm text-[#F0F2F5] font-mono">
                {(doc.metadata as Row)?.client_reference as string || '-'}
              </span>
            )}
          </FieldRow>

          {/* Creado por */}
          <FieldRow label="Creado por" editMode={editMode}>
            {editMode ? (
              <input
                type="text"
                value={editDoc.created_by ?? doc.created_by}
                onChange={(e) => setEditDoc({ ...editDoc, created_by: e.target.value })}
                className="h-9 w-full rounded-lg bg-[#0B0E13] border border-[#FF6600] px-3 text-sm text-[#F0F2F5] focus:outline-none"
              />
            ) : (
              <span className="text-sm text-[#F0F2F5]">{doc.created_by || '-'}</span>
            )}
          </FieldRow>

          {/* Agente */}
          <FieldRow label="Agente" editMode={editMode}>
            {editMode ? (
              <input
                type="text"
                value={editDoc.agent ?? doc.agent}
                onChange={(e) => setEditDoc({ ...editDoc, agent: e.target.value })}
                className="h-9 w-full rounded-lg bg-[#0B0E13] border border-[#FF6600] px-3 text-sm text-[#F0F2F5] focus:outline-none"
              />
            ) : (
              <span className="text-sm text-[#F0F2F5]">{doc.agent || '-'}</span>
            )}
          </FieldRow>
        </div>

        {/* Row 3: Titulo / Notas externas */}
        <div className="mt-4">
          <FieldRow label="Titulo / Descripcion" editMode={editMode}>
            {editMode ? (
              <input
                type="text"
                value={editDoc.notes ?? doc.notes}
                onChange={(e) => setEditDoc({ ...editDoc, notes: e.target.value })}
                className="h-9 w-full rounded-lg bg-[#0B0E13] border border-[#FF6600] px-3 text-sm text-[#F0F2F5] focus:outline-none"
                placeholder="Addendum, descripcion..."
              />
            ) : (
              <span className="text-sm text-[#9CA3AF]">{doc.notes || '-'}</span>
            )}
          </FieldRow>
        </div>

        {/* Row 4: Tax checkboxes + Tarifa */}
        <div className="flex items-center gap-6 mt-4 pt-3 border-t border-[#2A3040]">
          <label className="flex items-center gap-2 text-xs text-[#9CA3AF] cursor-pointer">
            <input
              type="checkbox"
              checked={editMode ? (editDoc.subject_iva ?? doc.subject_iva) : doc.subject_iva}
              onChange={(e) => editMode && setEditDoc({ ...editDoc, subject_iva: e.target.checked })}
              disabled={!editMode}
              className="accent-[#FF6600] w-4 h-4"
            />
            Sujeto a IVA
          </label>
          <label className="flex items-center gap-2 text-xs text-[#9CA3AF] cursor-pointer">
            <input
              type="checkbox"
              checked={editMode ? (editDoc.subject_irpf ?? doc.subject_irpf) : doc.subject_irpf}
              onChange={(e) => editMode && setEditDoc({ ...editDoc, subject_irpf: e.target.checked })}
              disabled={!editMode}
              className="accent-[#FF6600] w-4 h-4"
            />
            Sujeto a IRPF
          </label>
          {editMode && (
            <div className="flex items-center gap-2">
              <span className="text-xs text-[#6B7280]">% IVA:</span>
              <input
                type="number"
                value={editDoc.tax_rate ?? doc.tax_rate}
                onChange={(e) => setEditDoc({ ...editDoc, tax_rate: Number(e.target.value) })}
                className="h-7 w-16 rounded bg-[#0B0E13] border border-[#FF6600] px-2 text-xs text-[#F0F2F5] focus:outline-none"
              />
            </div>
          )}

          {/* Payment status badge for invoices */}
          {isInvoiceType && doc && (
            <div className="flex items-center gap-2">
              {paidAmount > 0 ? (
                <span className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold ${
                  paidPct >= 100
                    ? 'bg-[#10B981]/15 text-[#10B981]'
                    : 'bg-[#F59E0B]/15 text-[#F59E0B]'
                }`}>
                  <DollarSign size={12} />
                  Cobrado {formatCurrency(paidAmount, (doc.currency || 'EUR') as 'EUR' | 'USD' | 'ARS')} de {formatCurrency(docTotal, (doc.currency || 'EUR') as 'EUR' | 'USD' | 'ARS')} ({paidPct.toFixed(0)}%)
                </span>
              ) : (
                <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold bg-[#EF4444]/15 text-[#EF4444]">
                  <DollarSign size={12} />
                  Sin cobros
                </span>
              )}
            </div>
          )}

          {/* Financials summary */}
          <div className="ml-auto flex items-center gap-5 text-xs">
            <span className="text-[#6B7280]">
              Base: <span className="text-[#F0F2F5] font-semibold">{formatCurrency(totals.subtotal, (displayDoc?.currency || 'EUR') as 'EUR' | 'USD' | 'ARS')}</span>
            </span>
            <span className="text-[#6B7280]">
              IVA: <span className="text-[#F0F2F5]">{formatCurrency(totals.taxAmount, (displayDoc?.currency || 'EUR') as 'EUR' | 'USD' | 'ARS')}</span>
            </span>
            <span className="text-[#6B7280]">
              Total: <span className="text-[#FF6600] font-bold text-sm">{formatCurrency(totals.total, (displayDoc?.currency || 'EUR') as 'EUR' | 'USD' | 'ARS')}</span>
            </span>
          </div>
        </div>
      </div>

      {/* ====== PRINT-ONLY: ITEMS TABLE + TOTALS + NOTES ====== */}
      <div className="hidden print:block mt-4">
        {/* Items table for print */}
        <table className="w-full text-sm border-collapse">
          <thead>
            <tr className="border-b-2 border-black text-xs uppercase tracking-wider">
              <th className="text-left px-2 py-2 w-28">Ref.</th>
              <th className="text-left px-2 py-2">Descripcion</th>
              <th className="text-right px-2 py-2 w-24">Precio</th>
              <th className="text-right px-2 py-2 w-16">Uds.</th>
              <th className="text-right px-2 py-2 w-20">% Dto.</th>
              <th className="text-right px-2 py-2 w-28">Subtotal</th>
            </tr>
          </thead>
          <tbody>
            {items.map((item) => {
              if (item.is_section) {
                return (
                  <tr key={item.id} className="border-b border-gray-300 bg-gray-50">
                    <td colSpan={6} className="px-2 py-2 text-sm font-bold">
                      {item.section_label}
                    </td>
                  </tr>
                )
              }
              return (
                <tr key={item.id} className="border-b border-gray-200">
                  <td className="px-2 py-2 text-xs font-mono">{item.sku || '-'}</td>
                  <td className="px-2 py-2 text-sm whitespace-pre-wrap">{item.description}</td>
                  <td className="px-2 py-2 text-right text-sm">{formatCurrency(item.unit_price, (doc.currency || 'EUR') as 'EUR' | 'USD' | 'ARS')}</td>
                  <td className="px-2 py-2 text-right text-sm">{item.quantity}</td>
                  <td className="px-2 py-2 text-right text-sm">{item.discount_pct > 0 ? `${item.discount_pct}%` : '-'}</td>
                  <td className="px-2 py-2 text-right text-sm font-semibold">{formatCurrency(item.subtotal, (doc.currency || 'EUR') as 'EUR' | 'USD' | 'ARS')}</td>
                </tr>
              )
            })}
          </tbody>
        </table>

        {/* Totals for print */}
        <div className="flex justify-end mt-4 pt-3 border-t-2 border-black">
          <div className="w-64">
            <div className="flex justify-between py-1 text-sm">
              <span>Base imponible:</span>
              <span className="font-semibold">{formatCurrency(totals.subtotal, (doc.currency || 'EUR') as 'EUR' | 'USD' | 'ARS')}</span>
            </div>
            <div className="flex justify-between py-1 text-sm">
              <span>IVA ({doc.tax_rate ?? 21}%):</span>
              <span>{formatCurrency(totals.taxAmount, (doc.currency || 'EUR') as 'EUR' | 'USD' | 'ARS')}</span>
            </div>
            <div className="flex justify-between py-1 text-base font-bold border-t border-black mt-1 pt-1">
              <span>TOTAL:</span>
              <span>{formatCurrency(totals.total, (doc.currency || 'EUR') as 'EUR' | 'USD' | 'ARS')}</span>
            </div>
          </div>
        </div>

        {/* Notes for print */}
        {doc.notes && (
          <div className="mt-6 pt-3 border-t border-gray-300">
            <p className="text-xs font-bold uppercase tracking-wider mb-1">Observaciones</p>
            <p className="text-sm whitespace-pre-wrap">{doc.notes}</p>
          </div>
        )}

        {/* Payment terms / Incoterm / Validity for print */}
        <div className="mt-4 pt-3 border-t border-gray-300 grid grid-cols-3 gap-4 text-sm">
          {doc.payment_terms && (
            <div>
              <p className="text-xs font-bold uppercase tracking-wider mb-1">Condiciones de pago</p>
              <p>{PAYMENT_TERMS.find(pt => pt.value === doc.payment_terms)?.label || doc.payment_terms}</p>
            </div>
          )}
          {doc.incoterm && (
            <div>
              <p className="text-xs font-bold uppercase tracking-wider mb-1">Incoterm</p>
              <p>{doc.incoterm}</p>
            </div>
          )}
          {(doc.valid_until || doc.delivery_date) && (
            <div>
              <p className="text-xs font-bold uppercase tracking-wider mb-1">
                {documentType === 'coti' ? 'Validez' : 'Fecha entrega'}
              </p>
              <p>{documentType === 'coti'
                ? (doc.valid_until ? formatDate(doc.valid_until) : '-')
                : (doc.delivery_date ? formatDate(doc.delivery_date) : '-')
              }</p>
            </div>
          )}
        </div>
      </div>

      {/* ====== TABS SECTION ====== */}
      <div className="mt-4 print:hidden">
        {/* Tab buttons */}
        <div className="flex gap-1 p-1 bg-[#0F1218] rounded-lg border border-[#1E2330] mb-4 overflow-x-auto print:hidden">
          {([
            { id: 'lineas' as const, label: 'Lineas', icon: <FileText size={14} /> },
            { id: 'rentabilidad' as const, label: 'Rentabilidad', icon: <TrendingUp size={14} /> },
            { id: 'mas_info' as const, label: 'Mas informacion', icon: <FileText size={14} /> },
            { id: 'adjuntos' as const, label: 'Adjuntos', icon: <Paperclip size={14} /> },
            { id: 'firma' as const, label: 'Firma', icon: <PenTool size={14} /> },
            { id: 'relacionados' as const, label: 'Relacionados', icon: <Link2 size={14} /> },
            ...(isInvoiceType ? [{ id: 'cobros' as const, label: `Cobros${payments.length > 0 ? ` (${payments.length})` : ''}`, icon: <CreditCard size={14} /> }] : []),
            ...(isPAPWithInvoice ? [{ id: 'comparacion' as const, label: 'Comparacion PO/Factura', icon: <Scale size={14} /> }] : []),
          ] as Array<{ id: typeof activeTab; label: string; icon: React.ReactNode }>).map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-md transition-all whitespace-nowrap ${
                activeTab === tab.id
                  ? 'bg-[#1E2330] text-[#FF6600] shadow-sm'
                  : 'text-[#6B7280] hover:text-[#9CA3AF]'
              }`}
            >
              {tab.icon}
              {tab.label}
            </button>
          ))}
        </div>

        {/* ====== TAB: LINEAS ====== */}
        {activeTab === 'lineas' && (
          <>
            {/* Card OC del cliente — solo para pedidos. Se renderiza
                solo si el pedido tiene OC parseada vinculada (vía
                quote_id → matched_quote_id). Si no hay, no se ve. */}
            {documentType === 'pedido' && doc?.id && (
              <div className="mb-4">
                <ClientPOCard salesOrderId={doc.id} onContext={setClientPoCtx} />
              </div>
            )}
            {/* Stock reservations panel — solo para pedidos en tt_documents */}
            {(documentType === 'pedido') && source === 'tt_documents' && doc?.id && (
              <div className="mb-4">
                <StockReservationsPanel documentId={doc.id} documentType={documentType} />
              </div>
            )}
            <div data-testid="doc-items-card" className="bg-[#141820] rounded-xl border border-[#2A3040] overflow-hidden">
            {/* Items table */}
            <div className="overflow-x-auto">
              <table data-testid="doc-items-table" className="w-full text-sm">
                <thead>
                  <tr className="border-b border-[#2A3040] text-[#6B7280] text-xs uppercase tracking-wider">
                    {editMode && <th className="w-8 px-2 py-3" />}
                    <th className="text-left px-4 py-3 w-28">Ref.</th>
                    <th className="text-left px-4 py-3">Nombre / Descripcion</th>
                    <th className="text-right px-4 py-3 w-24">Precio base</th>
                    <th className="text-right px-4 py-3 w-16">Uds.</th>
                    <th className="text-right px-4 py-3 w-20">% Dto.</th>
                    <th className="text-right px-4 py-3 w-28">Subtotal</th>
                    {editMode && <th className="w-10 px-2 py-3" />}
                  </tr>
                </thead>
                <tbody>
                  {displayItems.map((item, idx) => {
                    if (item.is_section) {
                      // Section header row
                      return (
                        <tr key={item.id} className="bg-[#1C2230] border-b border-[#2A3040]">
                          {editMode && <td className="px-2" />}
                          <td colSpan={editMode ? 6 : 5} className="px-4 py-2">
                            {editMode ? (
                              <input
                                type="text"
                                value={editItems[idx]?.section_label || ''}
                                onChange={(e) => {
                                  const updated = [...editItems]
                                  updated[idx] = { ...updated[idx], section_label: e.target.value }
                                  setEditItems(updated)
                                }}
                                className="bg-transparent border-b border-[#FF6600] text-sm font-bold text-[#FF6600] focus:outline-none w-full"
                                placeholder="Nombre seccion (ej: OC 49683 - GEDORE)"
                              />
                            ) : (
                              <span className="text-sm font-bold text-[#FF6600]">
                                {item.section_label}
                              </span>
                            )}
                          </td>
                          {editMode && (
                            <td className="px-2">
                              <button onClick={() => removeItem(idx)} className="text-red-400 hover:text-red-300">
                                <X size={14} />
                              </button>
                            </td>
                          )}
                        </tr>
                      )
                    }

                    return (
                      <tr
                        key={item.id}
                        className="border-b border-[#1E2330] hover:bg-[#1C2230]/50 transition-colors"
                      >
                        {editMode && (
                          <td className="px-2 text-[#4B5563] cursor-grab">
                            <GripVertical size={14} />
                          </td>
                        )}
                        <td className="px-4 py-3">
                          {editMode ? (
                            <input
                              type="text"
                              value={editItems[idx]?.sku || ''}
                              onChange={(e) => updateEditItem(idx, 'sku', e.target.value)}
                              className="h-8 w-full rounded bg-[#0B0E13] border border-[#2A3040] focus:border-[#FF6600] px-2 text-xs text-[#F0F2F5] font-mono focus:outline-none"
                            />
                          ) : (
                            <code className="text-xs text-[#9CA3AF] font-mono">{item.sku || '-'}</code>
                          )}
                        </td>
                        <td className="px-4 py-3">
                          {editMode ? (
                            <textarea
                              value={editItems[idx]?.description || ''}
                              onChange={(e) => updateEditItem(idx, 'description', e.target.value)}
                              rows={1}
                              className="w-full rounded bg-[#0B0E13] border border-[#2A3040] focus:border-[#FF6600] px-2 py-1.5 text-sm text-[#F0F2F5] focus:outline-none resize-y min-h-[32px]"
                            />
                          ) : (
                            <span className="text-sm text-[#F0F2F5] whitespace-pre-wrap">{item.description}</span>
                          )}
                        </td>
                        <td className="px-4 py-3 text-right">
                          {editMode ? (
                            <input
                              type="number"
                              step="0.01"
                              value={editItems[idx]?.unit_price ?? 0}
                              onChange={(e) => updateEditItem(idx, 'unit_price', Number(e.target.value))}
                              className="h-8 w-full rounded bg-[#0B0E13] border border-[#2A3040] focus:border-[#FF6600] px-2 text-xs text-right text-[#F0F2F5] focus:outline-none"
                            />
                          ) : (
                            <span className="text-sm text-[#F0F2F5]">
                              {item.unit_price.toLocaleString('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                            </span>
                          )}
                        </td>
                        <td className="px-4 py-3 text-right">
                          {editMode ? (
                            <div className="flex items-center justify-end gap-1">
                              <button
                                onClick={() => updateEditItem(idx, 'quantity', Math.max(1, (editItems[idx]?.quantity ?? 1) - 1))}
                                className="w-7 h-7 flex items-center justify-center rounded bg-[#1E2330] hover:bg-[#2A3040] text-[#9CA3AF] hover:text-[#FF6600] transition-colors"
                              >
                                <Minus size={12} />
                              </button>
                              <input
                                type="number"
                                value={editItems[idx]?.quantity ?? 0}
                                onChange={(e) => updateEditItem(idx, 'quantity', Number(e.target.value))}
                                className="h-8 w-[80px] rounded bg-[#0B0E13] border border-[#2A3040] focus:border-[#FF6600] px-2 text-center text-sm font-bold text-[#F0F2F5] focus:outline-none"
                              />
                              <button
                                onClick={() => updateEditItem(idx, 'quantity', (editItems[idx]?.quantity ?? 0) + 1)}
                                className="w-7 h-7 flex items-center justify-center rounded bg-[#1E2330] hover:bg-[#2A3040] text-[#9CA3AF] hover:text-[#FF6600] transition-colors"
                              >
                                <Plus size={12} />
                              </button>
                            </div>
                          ) : (
                            <span className="text-[16px] font-bold text-[#F0F2F5]">{item.quantity}</span>
                          )}
                        </td>
                        <td className="px-4 py-3 text-right">
                          {editMode ? (
                            <input
                              type="number"
                              step="0.1"
                              value={editItems[idx]?.discount_pct ?? 0}
                              onChange={(e) => updateEditItem(idx, 'discount_pct', Number(e.target.value))}
                              className="h-8 w-full rounded bg-[#0B0E13] border border-[#2A3040] focus:border-[#FF6600] px-2 text-xs text-right text-[#F0F2F5] focus:outline-none"
                            />
                          ) : (
                            <span className="text-sm text-[#9CA3AF]">{item.discount_pct ? `${item.discount_pct}%` : '-'}</span>
                          )}
                        </td>
                        <td className="px-4 py-3 text-right">
                          <span className="text-sm font-semibold text-[#F0F2F5]">
                            {(editMode ? (editItems[idx]?.subtotal ?? 0) : item.subtotal).toLocaleString('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                          </span>
                        </td>
                        {editMode && (
                          <td className="px-2">
                            <button onClick={() => removeItem(idx)} className="text-red-400 hover:text-red-300 p-1">
                              <X size={14} />
                            </button>
                          </td>
                        )}
                      </tr>
                    )
                  })}
                  {displayItems.length === 0 && (
                    <tr>
                      <td colSpan={editMode ? 8 : 6} className="text-center py-8 text-[#4B5563] text-sm">
                        Sin items
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>

            {/* Add item buttons */}
            {editMode && (
              <div className="flex items-center gap-2 px-4 py-3 border-t border-[#2A3040]">
                <Button data-testid="doc-add-item" variant="ghost" size="sm" onClick={addItem}>
                  <Plus size={14} /> Agregar item
                </Button>
                <Button data-testid="doc-add-section" variant="ghost" size="sm" onClick={addSection}>
                  <Plus size={14} /> Agregar seccion (OC)
                </Button>
                <Button data-testid="doc-search-product" variant="ghost" size="sm" onClick={() => setShowProductSearch(true)}>
                  <Search size={14} /> Buscar producto
                </Button>
              </div>
            )}

            {/* Totals footer */}
            <div className="bg-[#0F1218] px-4 py-4 border-t border-[#2A3040]">
              <div className="flex justify-end gap-8">
                <div className="text-right">
                  <p className="text-xs text-[#6B7280] mb-1">Base imponible</p>
                  <p className="text-sm font-semibold text-[#F0F2F5]">
                    {formatCurrency(totals.subtotal, (displayDoc?.currency || 'EUR') as 'EUR' | 'USD' | 'ARS')}
                  </p>
                </div>
                <div className="text-right">
                  <p className="text-xs text-[#6B7280] mb-1">IVA ({displayDoc?.tax_rate ?? 21}%)</p>
                  <p className="text-sm text-[#F0F2F5]">
                    {formatCurrency(totals.taxAmount, (displayDoc?.currency || 'EUR') as 'EUR' | 'USD' | 'ARS')}
                  </p>
                </div>
                <div className="text-right">
                  <p className="text-xs text-[#6B7280] mb-1">TOTAL</p>
                  <p className="text-lg font-bold text-[#FF6600]">
                    {formatCurrency(totals.total, (displayDoc?.currency || 'EUR') as 'EUR' | 'USD' | 'ARS')}
                  </p>
                </div>
              </div>
            </div>
          </div>
          </>
        )}

        {/* ====== TAB: RENTABILIDAD ====== */}
        {activeTab === 'rentabilidad' && (() => {
          const displayItems = editMode ? editItems : items
          const profitItems = displayItems.filter(i => !i.is_section).map(item => {
            const cost = item.unit_cost || productCosts[item.product_id || ''] || 0
            const revenue = item.subtotal || (item.quantity * item.unit_price * (1 - (item.discount_pct || 0) / 100))
            const totalCost = item.quantity * cost
            const profit = revenue - totalCost
            const marginPct = revenue > 0 ? (profit / revenue) * 100 : 0
            return { ...item, cost, totalCost, revenue, profit, marginPct }
          })
          const totRevenue = profitItems.reduce((s, i) => s + i.revenue, 0)
          const totCost = profitItems.reduce((s, i) => s + i.totalCost, 0)
          const totProfit = totRevenue - totCost
          const avgMargin = totRevenue > 0 ? (totProfit / totRevenue) * 100 : 0
          const curr = (displayDoc?.currency || 'EUR') as 'EUR' | 'USD' | 'ARS'

          return (
            <div className="space-y-4">
              {/* KPI Summary */}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                <div className="p-4 rounded-xl bg-[#141820] border border-[#2A3040]">
                  <p className="text-[10px] text-[#6B7280] uppercase tracking-wider">Venta Total</p>
                  <p className="text-lg font-bold text-[#F0F2F5] mt-1">{formatCurrency(totRevenue, curr)}</p>
                </div>
                <div className="p-4 rounded-xl bg-[#141820] border border-[#2A3040]">
                  <p className="text-[10px] text-[#6B7280] uppercase tracking-wider">Costo Total</p>
                  <p className="text-lg font-bold text-red-400 mt-1">{formatCurrency(totCost, curr)}</p>
                </div>
                <div className="p-4 rounded-xl bg-[#141820] border border-[#2A3040]">
                  <p className="text-[10px] text-[#6B7280] uppercase tracking-wider">Beneficio</p>
                  <p className={`text-lg font-bold mt-1 ${totProfit >= 0 ? 'text-green-400' : 'text-red-400'}`}>{formatCurrency(totProfit, curr)}</p>
                </div>
                <div className="p-4 rounded-xl bg-[#141820] border border-[#2A3040]">
                  <p className="text-[10px] text-[#6B7280] uppercase tracking-wider">Margen %</p>
                  <p className={`text-lg font-bold mt-1 ${avgMargin >= 20 ? 'text-green-400' : avgMargin >= 10 ? 'text-yellow-400' : 'text-red-400'}`}>{avgMargin.toFixed(1)}%</p>
                </div>
              </div>

              {/* Margin bar */}
              <div className="p-3 rounded-xl bg-[#141820] border border-[#2A3040]">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-xs text-[#6B7280]">Distribucion costo vs beneficio</span>
                  <span className="text-xs text-[#9CA3AF]">{formatCurrency(totRevenue, curr)}</span>
                </div>
                <div className="w-full h-4 rounded-full overflow-hidden flex bg-[#1E2330]">
                  {totRevenue > 0 && (
                    <>
                      <div className="h-full bg-red-500/70" style={{ width: `${(totCost / totRevenue) * 100}%` }} title={`Costo: ${formatCurrency(totCost, curr)}`} />
                      <div className="h-full bg-green-500/70" style={{ width: `${(totProfit / totRevenue) * 100}%` }} title={`Beneficio: ${formatCurrency(totProfit, curr)}`} />
                    </>
                  )}
                </div>
                <div className="flex justify-between mt-1">
                  <span className="text-[10px] text-red-400">Costo {totRevenue > 0 ? ((totCost / totRevenue) * 100).toFixed(0) : 0}%</span>
                  <span className="text-[10px] text-green-400">Beneficio {avgMargin.toFixed(0)}%</span>
                </div>
              </div>

              {/* Per-line profitability table */}
              <div className="bg-[#141820] rounded-xl border border-[#2A3040] overflow-hidden">
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-[#2A3040] text-[#6B7280] text-xs uppercase tracking-wider">
                        <th className="text-left px-4 py-3">SKU</th>
                        <th className="text-left px-4 py-3">Producto</th>
                        <th className="text-right px-4 py-3">Uds</th>
                        <th className="text-right px-4 py-3">P. Venta</th>
                        <th className="text-right px-4 py-3">P. Costo</th>
                        <th className="text-right px-4 py-3">Venta</th>
                        <th className="text-right px-4 py-3">Costo</th>
                        <th className="text-right px-4 py-3">Beneficio</th>
                        <th className="text-right px-4 py-3">Margen</th>
                      </tr>
                    </thead>
                    <tbody>
                      {profitItems.map(item => (
                        <tr key={item.id} className="border-b border-[#1E2330] hover:bg-[#1C2230]">
                          <td className="px-4 py-2.5 text-xs font-mono text-[#FF6600]">{item.sku || '-'}</td>
                          <td className="px-4 py-2.5 text-xs text-[#F0F2F5] max-w-[200px] truncate">{item.description}</td>
                          <td className="px-4 py-2.5 text-right text-xs">{item.quantity}</td>
                          <td className="px-4 py-2.5 text-right text-xs text-[#F0F2F5]">{formatCurrency(item.unit_price, curr)}</td>
                          <td className="px-4 py-2.5 text-right text-xs text-red-400">{item.cost > 0 ? formatCurrency(item.cost, curr) : <span className="text-[#4B5563]">s/d</span>}</td>
                          <td className="px-4 py-2.5 text-right text-xs text-[#F0F2F5] font-medium">{formatCurrency(item.revenue, curr)}</td>
                          <td className="px-4 py-2.5 text-right text-xs text-red-400">{formatCurrency(item.totalCost, curr)}</td>
                          <td className={`px-4 py-2.5 text-right text-xs font-bold ${item.profit >= 0 ? 'text-green-400' : 'text-red-400'}`}>{formatCurrency(item.profit, curr)}</td>
                          <td className="px-4 py-2.5 text-right">
                            <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${
                              item.marginPct >= 30 ? 'bg-green-500/20 text-green-400' :
                              item.marginPct >= 15 ? 'bg-yellow-500/20 text-yellow-400' :
                              item.marginPct > 0 ? 'bg-orange-500/20 text-orange-400' :
                              'bg-red-500/20 text-red-400'
                            }`}>
                              {item.cost > 0 ? `${item.marginPct.toFixed(1)}%` : '-'}
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                    <tfoot>
                      <tr className="border-t-2 border-[#FF6600]/30 bg-[#0F1218]">
                        <td colSpan={5} className="px-4 py-3 text-xs font-bold text-[#FF6600] uppercase">TOTALES</td>
                        <td className="px-4 py-3 text-right text-sm font-bold text-[#F0F2F5]">{formatCurrency(totRevenue, curr)}</td>
                        <td className="px-4 py-3 text-right text-sm font-bold text-red-400">{formatCurrency(totCost, curr)}</td>
                        <td className={`px-4 py-3 text-right text-sm font-bold ${totProfit >= 0 ? 'text-green-400' : 'text-red-400'}`}>{formatCurrency(totProfit, curr)}</td>
                        <td className="px-4 py-3 text-right">
                          <span className={`text-sm font-bold px-2.5 py-1 rounded-full ${avgMargin >= 20 ? 'bg-green-500/20 text-green-400' : avgMargin >= 10 ? 'bg-yellow-500/20 text-yellow-400' : 'bg-red-500/20 text-red-400'}`}>
                            {avgMargin.toFixed(1)}%
                          </span>
                        </td>
                      </tr>
                    </tfoot>
                  </table>
                </div>
              </div>

              {profitItems.some(i => i.cost === 0) && (
                <p className="text-[10px] text-[#4B5563] italic">* Algunos productos no tienen precio de costo cargado. El margen se calcula solo para los que tienen costo &gt; 0.</p>
              )}
            </div>
          )
        })()}

        {/* ====== TAB: MAS INFORMACION ====== */}
        {activeTab === 'mas_info' && (
          <div className="bg-[#141820] rounded-xl border border-[#2A3040] p-5 space-y-5">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
              <div>
                <label className="block text-xs font-medium text-[#6B7280] mb-1.5 uppercase tracking-wider">Notas internas</label>
                {editMode ? (
                  <textarea
                    value={editDoc.internal_notes ?? doc.internal_notes}
                    onChange={(e) => setEditDoc({ ...editDoc, internal_notes: e.target.value })}
                    rows={4}
                    className="w-full rounded-lg bg-[#0B0E13] border border-[#FF6600] px-3 py-2 text-sm text-[#F0F2F5] focus:outline-none resize-y"
                    placeholder="Notas internas (no se muestran al cliente)..."
                  />
                ) : (
                  <div className="bg-[#0B0E13] rounded-lg border border-[#2A3040] px-3 py-2 text-sm text-[#9CA3AF] min-h-[80px] whitespace-pre-wrap">
                    {doc.internal_notes || 'Sin notas internas'}
                  </div>
                )}
              </div>

              <div>
                <label className="block text-xs font-medium text-[#6B7280] mb-1.5 uppercase tracking-wider">Notas externas / Observaciones</label>
                {editMode ? (
                  <textarea
                    value={editDoc.notes ?? doc.notes}
                    onChange={(e) => setEditDoc({ ...editDoc, notes: e.target.value })}
                    rows={4}
                    className="w-full rounded-lg bg-[#0B0E13] border border-[#FF6600] px-3 py-2 text-sm text-[#F0F2F5] focus:outline-none resize-y"
                    placeholder="Observaciones para el cliente..."
                  />
                ) : (
                  <div className="bg-[#0B0E13] rounded-lg border border-[#2A3040] px-3 py-2 text-sm text-[#9CA3AF] min-h-[80px] whitespace-pre-wrap">
                    {doc.notes || 'Sin observaciones'}
                  </div>
                )}
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
              <div>
                <label className="block text-xs font-medium text-[#6B7280] mb-1.5 uppercase tracking-wider">Direccion de envio</label>
                {editMode ? (
                  <textarea
                    value={editDoc.shipping_address ?? doc.shipping_address}
                    onChange={(e) => setEditDoc({ ...editDoc, shipping_address: e.target.value })}
                    rows={3}
                    className="w-full rounded-lg bg-[#0B0E13] border border-[#FF6600] px-3 py-2 text-sm text-[#F0F2F5] focus:outline-none resize-y"
                  />
                ) : (
                  <div className="bg-[#0B0E13] rounded-lg border border-[#2A3040] px-3 py-2 text-sm text-[#9CA3AF] min-h-[60px] whitespace-pre-wrap">
                    {doc.shipping_address || 'Sin direccion'}
                  </div>
                )}
              </div>

              <div>
                <label className="block text-xs font-medium text-[#6B7280] mb-1.5 uppercase tracking-wider">Incoterm</label>
                {editMode ? (
                  <select
                    value={editDoc.incoterm ?? doc.incoterm}
                    onChange={(e) => setEditDoc({ ...editDoc, incoterm: e.target.value })}
                    className="h-10 w-full rounded-lg bg-[#0B0E13] border border-[#FF6600] px-3 text-sm text-[#F0F2F5] focus:outline-none"
                  >
                    <option value="">Sin definir</option>
                    {INCOTERMS.map(i => <option key={i} value={i}>{i}</option>)}
                  </select>
                ) : (
                  <div className="bg-[#0B0E13] rounded-lg border border-[#2A3040] px-3 py-2 text-sm text-[#9CA3AF]">
                    {doc.incoterm || 'Sin definir'}
                  </div>
                )}
              </div>

              <div>
                <label className="block text-xs font-medium text-[#6B7280] mb-1.5 uppercase tracking-wider">
                  {documentType === 'coti' ? 'Validez' : 'Fecha entrega'}
                </label>
                {editMode ? (
                  <input
                    type="date"
                    value={documentType === 'coti'
                      ? (editDoc.valid_until ?? (doc.valid_until || '')).slice(0, 10)
                      : (editDoc.delivery_date ?? (doc.delivery_date || '')).slice(0, 10)
                    }
                    onChange={(e) => {
                      if (documentType === 'coti') {
                        setEditDoc({ ...editDoc, valid_until: e.target.value })
                      } else {
                        setEditDoc({ ...editDoc, delivery_date: e.target.value })
                      }
                    }}
                    className="h-10 w-full rounded-lg bg-[#0B0E13] border border-[#FF6600] px-3 text-sm text-[#F0F2F5] focus:outline-none"
                  />
                ) : (
                  <div className="bg-[#0B0E13] rounded-lg border border-[#2A3040] px-3 py-2 text-sm text-[#9CA3AF]">
                    {documentType === 'coti'
                      ? (doc.valid_until ? formatDate(doc.valid_until) : 'Sin definir')
                      : (doc.delivery_date ? formatDate(doc.delivery_date) : 'Sin definir')
                    }
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {/* ====== TAB: ADJUNTOS ====== */}
        {activeTab === 'adjuntos' && (() => {
          const [attachments, setAttachments] = useState<Array<{ name: string; url: string; type: string; size: number; uploaded_at: string }>>([])
          const [uploading, setUploading] = useState(false)
          const existingAttachments = ((doc?.metadata as Row)?.attachments as Array<{ name: string; url: string; type: string; size: number; uploaded_at: string }>) || []

          const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
            const files = e.target.files
            if (!files || files.length === 0) return
            setUploading(true)
            const supabase = createClient()
            const newAttachments = [...existingAttachments]

            for (const file of Array.from(files)) {
              const safeName = file.name.replace(/[^\w.-]/g, '_')
              const path = `documents/${documentId}/${Date.now()}_${safeName}`
              const { error } = await supabase.storage.from('attachments').upload(path, file, { upsert: true })
              if (error) {
                console.warn('[document-form attachments] upload error:', error.message)
                addToast({ type: 'error', title: `No se pudo subir ${file.name}`, message: error.message })
                continue
              }
              // Bucket privado: signed URL larga (1 año). Re-firmar al leer si caduca.
              const { data: signed } = await supabase.storage
                .from('attachments')
                .createSignedUrl(path, 60 * 60 * 24 * 365)
              if (!signed?.signedUrl) {
                console.warn('[document-form attachments] no signed URL for', path)
                continue
              }
              newAttachments.push({
                name: file.name,
                url: signed.signedUrl,
                type: file.type,
                size: file.size,
                uploaded_at: new Date().toISOString(),
              })
            }

            // Save to metadata
            await supabase.from('tt_documents').update({
              metadata: { ...(doc?.metadata || {}), attachments: newAttachments }
            }).eq('id', documentId)

            setAttachments(newAttachments)
            addToast({ type: 'success', title: `${files.length} archivo(s) subido(s)` })
            setUploading(false)
          }

          const allAttachments = attachments.length > 0 ? attachments : existingAttachments

          return (
            <div className="bg-[#141820] rounded-xl border border-[#2A3040] p-5 space-y-4">
              {/* OC del cliente - prominente */}
              <div className="p-4 rounded-lg bg-[#FF6600]/5 border border-[#FF6600]/20">
                <div className="flex items-center gap-2 mb-2">
                  <FileText size={16} className="text-[#FF6600]" />
                  <h4 className="text-sm font-semibold text-[#FF6600]">Orden de Compra del Cliente</h4>
                </div>
                <p className="text-xs text-[#6B7280] mb-3">Subi el PDF de la OC del cliente para vincularla a este documento y armar el glosario de OC.</p>
                <div className="flex items-center gap-3">
                  <span className="text-sm text-[#F0F2F5] font-mono">{(doc?.metadata as Row)?.client_reference as string || 'Sin referencia OC'}</span>
                  {allAttachments.filter(a => a.name.toLowerCase().includes('oc') || a.name.toLowerCase().includes('orden') || a.name.toLowerCase().includes('po')).map((a, i) => (
                    <a key={i} href={a.url} target="_blank" rel="noopener noreferrer" className="text-xs text-[#FF6600] hover:underline flex items-center gap-1">
                      <Paperclip size={12} /> {a.name}
                    </a>
                  ))}
                </div>
              </div>

              {/* Upload area */}
              <div className="border-2 border-dashed border-[#2A3040] rounded-xl p-6 text-center hover:border-[#FF6600]/30 transition-colors">
                <input type="file" multiple onChange={handleUpload} className="hidden" id="file-upload" accept=".pdf,.doc,.docx,.xls,.xlsx,.jpg,.jpeg,.png,.txt" />
                <label htmlFor="file-upload" className="cursor-pointer">
                  {uploading ? (
                    <Loader2 size={32} className="mx-auto mb-2 text-[#FF6600] animate-spin" />
                  ) : (
                    <Paperclip size={32} className="mx-auto mb-2 text-[#4B5563]" />
                  )}
                  <p className="text-sm text-[#9CA3AF]">{uploading ? 'Subiendo...' : 'Click para subir archivos'}</p>
                  <p className="text-xs text-[#4B5563] mt-1">PDF, Word, Excel, imagenes (max 10MB)</p>
                </label>
              </div>

              {/* Attachments list */}
              {allAttachments.length > 0 && (
                <div className="space-y-2">
                  <h4 className="text-xs font-semibold text-[#6B7280] uppercase tracking-wider">Archivos adjuntos ({allAttachments.length})</h4>
                  {allAttachments.map((att, i) => (
                    <div key={i} className="flex items-center justify-between p-3 rounded-lg bg-[#0F1218] border border-[#1E2330]">
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded-lg bg-[#FF6600]/10 flex items-center justify-center">
                          <FileText size={14} className="text-[#FF6600]" />
                        </div>
                        <div>
                          <a href={att.url} target="_blank" rel="noopener noreferrer" className="text-sm text-[#F0F2F5] hover:text-[#FF6600] transition-colors">{att.name}</a>
                          <p className="text-[10px] text-[#4B5563]">{(att.size / 1024).toFixed(0)} KB — {formatDate(att.uploaded_at)}</p>
                        </div>
                      </div>
                      <a href={att.url} target="_blank" rel="noopener noreferrer" className="text-xs text-[#FF6600] hover:underline">Descargar</a>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )
        })()}

        {/* ====== TAB: FIRMA ====== */}
        {activeTab === 'firma' && (
          <div className="bg-[#141820] rounded-xl border border-[#2A3040] p-5 space-y-6">
            {/* Header + action */}
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-sm font-bold text-[#F0F2F5]">Firmas digitales</h3>
                <p className="text-xs text-[#6B7280] mt-0.5">Solicita y gestiona firmas para este documento</p>
              </div>
              <Button
                onClick={() => setShowSignatureForm(true)}
                className="text-xs"
              >
                <Plus size={14} /> Solicitar firma
              </Button>
            </div>

            {/* Signature request form */}
            {showSignatureForm && (
              <div className="bg-[#0B0E13] border border-[#2A3040] rounded-xl p-5 space-y-4">
                <h4 className="text-sm font-semibold text-[#F0F2F5]">Nueva solicitud de firma</h4>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <Input
                    label="Nombre del firmante"
                    value={signerName}
                    onChange={(e) => setSignerName(e.target.value)}
                    placeholder="Nombre completo"
                  />
                  <Input
                    label="Email del firmante"
                    type="email"
                    value={signerEmail}
                    onChange={(e) => setSignerEmail(e.target.value)}
                    placeholder="email@empresa.com"
                  />
                  <Select
                    label="Rol"
                    value={signerRole}
                    onChange={(e) => setSignerRole(e.target.value as 'client' | 'approver' | 'witness')}
                    options={[
                      { value: 'client', label: 'Cliente' },
                      { value: 'approver', label: 'Aprobador' },
                      { value: 'witness', label: 'Testigo' },
                    ]}
                  />
                </div>
                <div className="flex justify-end gap-3">
                  <Button
                    onClick={() => { setShowSignatureForm(false); setSignerName(''); setSignerEmail(''); setSignerRole('client') }}
                    className="bg-[#1E2330] hover:bg-[#2A3040] text-[#9CA3AF] text-xs"
                  >
                    Cancelar
                  </Button>
                  <Button
                    disabled={requestingSignature || !signerName.trim() || !signerEmail.trim()}
                    onClick={async () => {
                      setRequestingSignature(true)
                      try {
                        const sb = createClient()
                        const token = crypto.randomUUID()
                        const expiresAt = new Date()
                        expiresAt.setDate(expiresAt.getDate() + 7) // 7 days to sign
                        const { error } = await sb.from('tt_signatures').insert({
                          document_id: documentId,
                          quote_id: documentType === 'cotizacion' ? documentId : null,
                          signer_name: signerName.trim(),
                          signer_email: signerEmail.trim(),
                          signer_role: signerRole,
                          token,
                          status: 'pending',
                          expires_at: expiresAt.toISOString(),
                        })
                        if (error) throw error
                        addToast({ type: 'success', title: 'Solicitud de firma creada', message: `Enlace generado para ${signerName}` })
                        setShowSignatureForm(false)
                        setSignerName(''); setSignerEmail(''); setSignerRole('client')
                        // Reload signatures
                        const { data: sigData } = await sb
                          .from('tt_signatures')
                          .select('*')
                          .eq('document_id', documentId)
                          .order('created_at', { ascending: false })
                        setSignatures((sigData || []).map((s: Row) => ({
                          id: (s.id as string) || '',
                          document_id: (s.document_id as string) || '',
                          quote_id: (s.quote_id as string) || null,
                          signer_name: (s.signer_name as string) || '',
                          signer_email: (s.signer_email as string) || '',
                          signer_role: (s.signer_role as string) || 'client',
                          signature_data: (s.signature_data as string) || null,
                          signature_url: (s.signature_url as string) || null,
                          ip_address: (s.ip_address as string) || null,
                          signed_at: (s.signed_at as string) || null,
                          token: (s.token as string) || '',
                          status: (s.status as string) || 'pending',
                          expires_at: (s.expires_at as string) || null,
                          created_at: (s.created_at as string) || '',
                        })))
                      } catch (err) {
                        addToast({ type: 'error', title: 'Error creando solicitud', message: (err as Error).message })
                      } finally {
                        setRequestingSignature(false)
                      }
                    }}
                    className="text-xs"
                  >
                    {requestingSignature ? <Loader2 size={14} className="animate-spin" /> : <Send size={14} />}
                    Crear solicitud
                  </Button>
                </div>
              </div>
            )}

            {/* Signatures list */}
            {signatures.length === 0 && !showSignatureForm ? (
              <div className="bg-[#0B0E13] border-2 border-dashed border-[#2A3040] rounded-xl py-12 flex flex-col items-center justify-center">
                <PenTool size={40} className="text-[#4B5563] mb-3" />
                <p className="text-sm text-[#6B7280]">No hay solicitudes de firma</p>
                <p className="text-xs text-[#4B5563] mt-1">Hace clic en &quot;Solicitar firma&quot; para enviar una solicitud</p>
              </div>
            ) : (
              <div className="space-y-3">
                {signatures.map((sig) => {
                  const isExpired = sig.expires_at && new Date(sig.expires_at) < new Date() && sig.status === 'pending'
                  const effectiveStatus = isExpired ? 'expired' : sig.status
                  const sigUrl = `https://mocciaro-soft.vercel.app/portal/${sig.token}`
                  const roleLabels: Record<string, string> = { client: 'Cliente', approver: 'Aprobador', witness: 'Testigo' }

                  return (
                    <div key={sig.id} className="bg-[#0B0E13] border border-[#2A3040] rounded-xl p-4">
                      <div className="flex items-start justify-between gap-4">
                        {/* Signer info */}
                        <div className="flex-1 space-y-2">
                          <div className="flex items-center gap-2">
                            <span className="text-sm font-semibold text-[#F0F2F5]">{sig.signer_name}</span>
                            <span className="text-xs text-[#6B7280]">({roleLabels[sig.signer_role] || sig.signer_role})</span>
                            {effectiveStatus === 'pending' && (
                              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-500/10 text-amber-400 border border-amber-500/20">
                                <Clock size={10} /> Pendiente
                              </span>
                            )}
                            {effectiveStatus === 'signed' && (
                              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                                <CheckCircle2 size={10} /> Firmado
                              </span>
                            )}
                            {effectiveStatus === 'rejected' && (
                              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-red-500/10 text-red-400 border border-red-500/20">
                                <X size={10} /> Rechazado
                              </span>
                            )}
                            {effectiveStatus === 'expired' && (
                              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-[#1E2330] text-[#6B7280] border border-[#2A3040]">
                                <Clock size={10} /> Expirado
                              </span>
                            )}
                          </div>
                          <p className="text-xs text-[#6B7280]">{sig.signer_email}</p>

                          {/* Link to share (only for pending) */}
                          {effectiveStatus === 'pending' && (
                            <div className="flex items-center gap-2 mt-2">
                              <div className="flex-1 bg-[#141820] border border-[#2A3040] rounded-lg px-3 py-1.5 text-xs text-[#9CA3AF] font-mono truncate">
                                {sigUrl}
                              </div>
                              <button
                                onClick={() => {
                                  navigator.clipboard.writeText(sigUrl)
                                  setCopiedToken(sig.token)
                                  setTimeout(() => setCopiedToken(null), 2000)
                                }}
                                className="px-3 py-1.5 rounded-lg bg-[#1E2330] hover:bg-[#2A3040] text-[#9CA3AF] hover:text-[#F0F2F5] transition-colors text-xs flex items-center gap-1"
                              >
                                {copiedToken === sig.token ? <><CheckCircle2 size={12} /> Copiado</> : <><Copy size={12} /> Copiar</>}
                              </button>
                            </div>
                          )}

                          {/* Signed details */}
                          {effectiveStatus === 'signed' && (
                            <div className="mt-3 space-y-3">
                              {/* Signature image preview */}
                              {(sig.signature_url || sig.signature_data) && (
                                <div>
                                  <label className="block text-xs font-medium text-[#6B7280] mb-1.5 uppercase tracking-wider">Firma</label>
                                  <div className="bg-white rounded-lg p-3 inline-block border border-[#2A3040]">
                                    {/* eslint-disable-next-line @next/next/no-img-element */}
                                    <img
                                      src={sig.signature_url || sig.signature_data || ''}
                                      alt={`Firma de ${sig.signer_name}`}
                                      className="max-h-20 max-w-[200px] object-contain"
                                    />
                                  </div>
                                </div>
                              )}
                              <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                                <div>
                                  <label className="block text-[10px] font-medium text-[#6B7280] uppercase tracking-wider">Firmado por</label>
                                  <p className="text-sm text-[#F0F2F5] mt-0.5">{sig.signer_name}</p>
                                </div>
                                <div>
                                  <label className="block text-[10px] font-medium text-[#6B7280] uppercase tracking-wider">Fecha de firma</label>
                                  <p className="text-sm text-[#F0F2F5] mt-0.5">{sig.signed_at ? formatDate(sig.signed_at) : '-'}</p>
                                </div>
                                <div>
                                  <label className="block text-[10px] font-medium text-[#6B7280] uppercase tracking-wider">IP</label>
                                  <p className="text-sm text-[#9CA3AF] font-mono mt-0.5">{sig.ip_address || '-'}</p>
                                </div>
                              </div>
                            </div>
                          )}

                          {/* Expiry info */}
                          {sig.expires_at && effectiveStatus !== 'signed' && (
                            <p className="text-[10px] text-[#4B5563] mt-1">
                              {effectiveStatus === 'expired' ? 'Expiro' : 'Expira'}: {formatDate(sig.expires_at)}
                            </p>
                          )}
                        </div>
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        )}

        {/* ====== TAB: RELACIONADOS ====== */}
        {activeTab === 'relacionados' && (
          <div className="bg-[#141820] rounded-xl border border-[#2A3040] p-5 space-y-6">
            {/* Parent docs */}
            {parentLinks.length > 0 && (
              <div>
                <h3 className="text-xs font-bold text-[#6B7280] uppercase tracking-wider mb-3">Documentos padre</h3>
                <div className="space-y-2">
                  {parentLinks.map((link) => (
                    <div
                      key={link.id}
                      className="flex items-center justify-between px-4 py-3 rounded-lg bg-[#0F1218] border border-[#1E2330] hover:border-[#FF6600]/30 transition-colors"
                    >
                      <div className="flex items-center gap-3">
                        <span className="px-2 py-0.5 rounded text-xs font-bold bg-[#FF6600]/20 text-[#FF6600] uppercase">
                          {PREFIX_MAP[link.type] || link.type}
                        </span>
                        <DocLink
                          docRef={link.display_ref || link.system_code}
                          docId={link.id}
                          docType={link.type}
                          className="text-sm font-mono"
                        />
                      </div>
                      <div className="flex items-center gap-2 text-xs text-[#6B7280]">
                        {link.created_at && <span>{formatDate(link.created_at)}</span>}
                        <ExternalLink size={12} />
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Child docs */}
            {childLinks.length > 0 && (
              <div>
                <h3 className="text-xs font-bold text-[#6B7280] uppercase tracking-wider mb-3">Documentos generados</h3>
                <div className="space-y-2">
                  {childLinks.map((link) => (
                    <div
                      key={link.id}
                      className="flex items-center justify-between px-4 py-3 rounded-lg bg-[#0F1218] border border-[#1E2330] hover:border-[#10B981]/30 transition-colors"
                    >
                      <div className="flex items-center gap-3">
                        <span className="px-2 py-0.5 rounded text-xs font-bold bg-[#10B981]/20 text-[#10B981] uppercase">
                          {PREFIX_MAP[link.type] || link.type}
                        </span>
                        <DocLink
                          docRef={link.display_ref || link.system_code}
                          docId={link.id}
                          docType={link.type}
                          className="text-sm font-mono"
                        />
                      </div>
                      <div className="flex items-center gap-2 text-xs text-[#6B7280]">
                        {link.created_at && <span>{formatDate(link.created_at)}</span>}
                        <ExternalLink size={12} />
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {parentLinks.length === 0 && childLinks.length === 0 && (
              <div className="text-center py-6 text-[#4B5563]">
                <Link2 size={32} className="mx-auto mb-2 opacity-40" />
                <p className="text-sm">Sin documentos relacionados</p>
              </div>
            )}

            {/* Activity log */}
            {activity.length > 0 && (
              <div>
                <h3 className="text-xs font-bold text-[#6B7280] uppercase tracking-wider mb-3">Registro de actividad</h3>
                <div className="space-y-2 max-h-[300px] overflow-y-auto">
                  {activity.map((entry) => (
                    <div
                      key={entry.id}
                      className="flex items-start gap-3 px-3 py-2 rounded-lg bg-[#0F1218] text-xs"
                    >
                      <Clock size={12} className="text-[#4B5563] mt-0.5 shrink-0" />
                      <div className="min-w-0">
                        <p className="text-[#9CA3AF]">
                          <span className="font-medium text-[#F0F2F5]">{entry.action}</span>
                          {entry.details && ` - ${entry.details}`}
                        </p>
                        <p className="text-[#4B5563]">
                          {entry.created_at ? formatDate(entry.created_at, 'dd/MM/yyyy HH:mm') : ''}
                          {entry.user_name && ` por ${entry.user_name}`}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {/* ====== TAB: COBROS (Pagos parciales) ====== */}
        {activeTab === 'cobros' && isInvoiceType && doc && (
          <div className="space-y-4">
            {/* Progress bar */}
            <div className="bg-[#141820] rounded-xl border border-[#2A3040] p-5">
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2">
                  <CreditCard size={18} className="text-[#FF6600]" />
                  <h3 className="text-base font-bold text-[#F0F2F5]">Estado de cobro</h3>
                </div>
                <span className={`text-sm font-bold ${
                  paidPct >= 100 ? 'text-[#10B981]' : paidPct > 0 ? 'text-[#F59E0B]' : 'text-[#EF4444]'
                }`}>
                  {paidPct.toFixed(0)}% cobrado
                </span>
              </div>

              {/* Progress bar visual */}
              <div className="w-full h-5 rounded-full overflow-hidden bg-[#1E2330] mb-3">
                <div
                  className={`h-full rounded-full transition-all duration-500 ${
                    paidPct >= 100 ? 'bg-[#10B981]' : paidPct >= 50 ? 'bg-[#F59E0B]' : paidPct > 0 ? 'bg-[#FF6600]' : ''
                  }`}
                  style={{ width: `${Math.min(100, paidPct)}%` }}
                />
              </div>

              <div className="grid grid-cols-3 gap-4">
                <div className="text-center">
                  <p className="text-[10px] text-[#6B7280] uppercase tracking-wider">Total factura</p>
                  <p className="text-lg font-bold text-[#F0F2F5] font-mono">
                    {formatCurrency(docTotal, (doc.currency || 'EUR') as 'EUR' | 'USD' | 'ARS')}
                  </p>
                </div>
                <div className="text-center">
                  <p className="text-[10px] text-[#6B7280] uppercase tracking-wider">Cobrado</p>
                  <p className="text-lg font-bold text-[#10B981] font-mono">
                    {formatCurrency(paidAmount, (doc.currency || 'EUR') as 'EUR' | 'USD' | 'ARS')}
                  </p>
                </div>
                <div className="text-center">
                  <p className="text-[10px] text-[#6B7280] uppercase tracking-wider">Pendiente</p>
                  <p className={`text-lg font-bold font-mono ${remainingAmount > 0 ? 'text-[#EF4444]' : 'text-[#10B981]'}`}>
                    {formatCurrency(remainingAmount, (doc.currency || 'EUR') as 'EUR' | 'USD' | 'ARS')}
                  </p>
                </div>
              </div>
            </div>

            {/* Payment list */}
            <div className="bg-[#141820] rounded-xl border border-[#2A3040] overflow-hidden">
              <div className="flex items-center justify-between px-5 py-3 border-b border-[#2A3040]">
                <h4 className="text-sm font-bold text-[#F0F2F5]">Cobros registrados ({payments.length})</h4>
                {remainingAmount > 0 && (
                  <button
                    onClick={() => {
                      setNewPayment(prev => ({ ...prev, amount: Math.round(remainingAmount * 100) / 100 }))
                      setShowPaymentForm(true)
                    }}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[#FF6600] text-white text-xs font-bold hover:bg-[#FF6600]/90 transition-colors"
                  >
                    <Plus size={14} /> Registrar cobro
                  </button>
                )}
              </div>

              {payments.length > 0 ? (
                <div className="divide-y divide-[#1E2330]">
                  {payments.map((payment) => {
                    const methodLabels: Record<string, { label: string; color: string }> = {
                      transferencia: { label: 'Transferencia', color: '#3B82F6' },
                      efectivo: { label: 'Efectivo', color: '#10B981' },
                      tarjeta: { label: 'Tarjeta', color: '#8B5CF6' },
                      cheque: { label: 'Cheque', color: '#F59E0B' },
                      pagare: { label: 'Pagare', color: '#EF4444' },
                      compensacion: { label: 'Compensacion', color: '#6366F1' },
                      otro: { label: 'Otro', color: '#6B7280' },
                    }
                    const method = methodLabels[payment.payment_method] || methodLabels.otro
                    return (
                      <div key={payment.id} className="flex items-center justify-between px-5 py-3 hover:bg-[#1C2230]/50 transition-colors">
                        <div className="flex items-center gap-4">
                          <div className="w-10 h-10 rounded-lg bg-[#10B981]/10 flex items-center justify-center">
                            <Banknote size={18} className="text-[#10B981]" />
                          </div>
                          <div>
                            <div className="flex items-center gap-2">
                              <span className="text-sm font-bold text-[#F0F2F5]">
                                {formatCurrency(payment.amount, (payment.currency || doc.currency || 'EUR') as 'EUR' | 'USD' | 'ARS')}
                              </span>
                              <span
                                className="px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider"
                                style={{ background: `${method.color}20`, color: method.color }}
                              >
                                {method.label}
                              </span>
                            </div>
                            <div className="flex items-center gap-3 mt-0.5">
                              <span className="text-xs text-[#6B7280]">
                                {payment.payment_date ? formatDate(payment.payment_date) : '-'}
                              </span>
                              {payment.bank_reference && (
                                <span className="text-xs text-[#9CA3AF] font-mono">
                                  Ref: {payment.bank_reference}
                                </span>
                              )}
                              {payment.notes && (
                                <span className="text-xs text-[#6B7280] italic max-w-[200px] truncate">
                                  {payment.notes}
                                </span>
                              )}
                            </div>
                          </div>
                        </div>
                        <span className="text-xs text-[#4B5563]">
                          {payment.created_at ? formatDate(payment.created_at) : ''}
                        </span>
                      </div>
                    )
                  })}
                </div>
              ) : (
                <div className="text-center py-8">
                  <DollarSign size={32} className="mx-auto mb-2 text-[#4B5563] opacity-50" />
                  <p className="text-sm text-[#6B7280]">Sin cobros registrados</p>
                  <p className="text-xs text-[#4B5563] mt-1">Registra el primer cobro para esta factura</p>
                </div>
              )}
            </div>

            {/* Inline Payment Form */}
            {showPaymentForm && (
              <div className="bg-[#141820] rounded-xl border border-[#FF6600]/30 p-5 space-y-4">
                <div className="flex items-center justify-between">
                  <h4 className="text-sm font-bold text-[#FF6600]">Registrar nuevo cobro</h4>
                  <button
                    onClick={() => setShowPaymentForm(false)}
                    className="text-[#6B7280] hover:text-[#F0F2F5]"
                  >
                    <X size={16} />
                  </button>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-[10px] font-medium text-[#6B7280] mb-1 uppercase tracking-wider">
                      Importe *
                    </label>
                    <input
                      type="number"
                      step="0.01"
                      min="0.01"
                      max={remainingAmount}
                      value={newPayment.amount || ''}
                      onChange={(e) => setNewPayment({ ...newPayment, amount: Number(e.target.value) })}
                      className="h-10 w-full rounded-lg bg-[#0B0E13] border border-[#FF6600] px-3 text-sm text-[#F0F2F5] focus:outline-none font-mono"
                      placeholder={`Max: ${remainingAmount.toFixed(2)}`}
                    />
                    <p className="text-[10px] text-[#6B7280] mt-1">
                      Pendiente: {formatCurrency(remainingAmount, (doc.currency || 'EUR') as 'EUR' | 'USD' | 'ARS')}
                    </p>
                  </div>

                  <div>
                    <label className="block text-[10px] font-medium text-[#6B7280] mb-1 uppercase tracking-wider">
                      Fecha de cobro
                    </label>
                    <input
                      type="date"
                      value={newPayment.payment_date}
                      onChange={(e) => setNewPayment({ ...newPayment, payment_date: e.target.value })}
                      className="h-10 w-full rounded-lg bg-[#0B0E13] border border-[#2A3040] focus:border-[#FF6600] px-3 text-sm text-[#F0F2F5] focus:outline-none"
                    />
                  </div>

                  <div>
                    <label className="block text-[10px] font-medium text-[#6B7280] mb-1 uppercase tracking-wider">
                      Metodo de pago
                    </label>
                    <select
                      value={newPayment.payment_method}
                      onChange={(e) => setNewPayment({ ...newPayment, payment_method: e.target.value })}
                      className="h-10 w-full rounded-lg bg-[#0B0E13] border border-[#2A3040] focus:border-[#FF6600] px-3 text-sm text-[#F0F2F5] focus:outline-none"
                    >
                      <option value="transferencia">Transferencia bancaria</option>
                      <option value="efectivo">Efectivo</option>
                      <option value="tarjeta">Tarjeta</option>
                      <option value="cheque">Cheque</option>
                      <option value="pagare">Pagare</option>
                      <option value="compensacion">Compensacion</option>
                      <option value="otro">Otro</option>
                    </select>
                  </div>

                  <div>
                    <label className="block text-[10px] font-medium text-[#6B7280] mb-1 uppercase tracking-wider">
                      Referencia bancaria
                    </label>
                    <input
                      type="text"
                      value={newPayment.bank_reference}
                      onChange={(e) => setNewPayment({ ...newPayment, bank_reference: e.target.value })}
                      className="h-10 w-full rounded-lg bg-[#0B0E13] border border-[#2A3040] focus:border-[#FF6600] px-3 text-sm text-[#F0F2F5] focus:outline-none"
                      placeholder="Nro. transferencia, cheque..."
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-[10px] font-medium text-[#6B7280] mb-1 uppercase tracking-wider">
                    Notas
                  </label>
                  <input
                    type="text"
                    value={newPayment.notes}
                    onChange={(e) => setNewPayment({ ...newPayment, notes: e.target.value })}
                    className="h-10 w-full rounded-lg bg-[#0B0E13] border border-[#2A3040] focus:border-[#FF6600] px-3 text-sm text-[#F0F2F5] focus:outline-none"
                    placeholder="Observaciones del cobro..."
                  />
                </div>

                <div className="flex justify-end gap-2 pt-2 border-t border-[#2A3040]">
                  <Button variant="secondary" size="sm" onClick={() => setShowPaymentForm(false)}>
                    Cancelar
                  </Button>
                  <Button
                    variant="primary"
                    size="sm"
                    onClick={handleRegisterPayment}
                    loading={savingPayment}
                    disabled={!newPayment.amount || newPayment.amount <= 0}
                  >
                    <Save size={14} /> Registrar cobro
                  </Button>
                </div>
              </div>
            )}
          </div>
        )}

        {/* ====== TAB: COMPARACION PO vs FACTURA ====== */}
        {activeTab === 'comparacion' && isPAPWithInvoice && comparisonSummary && (
          <div className="space-y-4">
            {/* Summary Header Card */}
            <div className="bg-[#141820] rounded-xl border border-[#2A3040] p-5">
              <div className="flex items-center gap-3 mb-4">
                <Scale size={20} className="text-[#FF6600]" />
                <h3 className="text-base font-bold text-[#F0F2F5]">Comparacion: Pedido vs Factura de Compra</h3>
                {linkedPurchaseInvoice?.comparison_status === 'confirmed' && (
                  <span className="ml-auto flex items-center gap-1.5 px-3 py-1 rounded-full bg-[#10B981]/15 text-[#10B981] text-xs font-bold">
                    <ShieldCheck size={14} />
                    Confirmada {linkedPurchaseInvoice.confirmed_at
                      ? `el ${formatDate(linkedPurchaseInvoice.confirmed_at, 'dd/MM/yyyy HH:mm')}`
                      : ''}
                  </span>
                )}
              </div>

              <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                {/* PO Total */}
                <div className="bg-[#0B0E13] rounded-lg border border-[#1E2330] p-4">
                  <p className="text-[10px] font-medium text-[#6B7280] uppercase tracking-wider mb-1">Total Pedido (PO)</p>
                  <p className="text-xl font-bold text-[#F0F2F5] font-mono">
                    {formatCurrency(comparisonSummary.poTotal, (doc.currency as 'EUR' | 'USD' | 'ARS') || 'EUR')}
                  </p>
                </div>
                {/* Invoice Total */}
                <div className="bg-[#0B0E13] rounded-lg border border-[#1E2330] p-4">
                  <p className="text-[10px] font-medium text-[#6B7280] uppercase tracking-wider mb-1">Total Factura</p>
                  <p className="text-xl font-bold text-[#F0F2F5] font-mono">
                    {formatCurrency(comparisonSummary.invTotal, (doc.currency as 'EUR' | 'USD' | 'ARS') || 'EUR')}
                  </p>
                  <p className="text-xs text-[#6B7280] mt-1">Factura: {linkedPurchaseInvoice!.number}</p>
                </div>
                {/* Difference */}
                <div className={`rounded-lg border p-4 ${
                  Math.abs(comparisonSummary.diff) < 0.01
                    ? 'bg-[#10B981]/10 border-[#10B981]/30'
                    : comparisonSummary.diff > 0
                      ? 'bg-[#F59E0B]/10 border-[#F59E0B]/30'
                      : 'bg-[#3B82F6]/10 border-[#3B82F6]/30'
                }`}>
                  <p className="text-[10px] font-medium text-[#6B7280] uppercase tracking-wider mb-1">Diferencia</p>
                  <p className={`text-xl font-bold font-mono ${
                    Math.abs(comparisonSummary.diff) < 0.01
                      ? 'text-[#10B981]'
                      : comparisonSummary.diff > 0
                        ? 'text-[#F59E0B]'
                        : 'text-[#3B82F6]'
                  }`}>
                    {comparisonSummary.diff > 0 ? '+' : ''}
                    {formatCurrency(comparisonSummary.diff, (doc.currency as 'EUR' | 'USD' | 'ARS') || 'EUR')}
                  </p>
                </div>
                {/* Percentage */}
                <div className={`rounded-lg border p-4 ${
                  Math.abs(comparisonSummary.diffPct) < 0.1
                    ? 'bg-[#10B981]/10 border-[#10B981]/30'
                    : Math.abs(comparisonSummary.diffPct) > 5
                      ? 'bg-[#EF4444]/10 border-[#EF4444]/30'
                      : 'bg-[#F59E0B]/10 border-[#F59E0B]/30'
                }`}>
                  <p className="text-[10px] font-medium text-[#6B7280] uppercase tracking-wider mb-1">% Diferencia</p>
                  <p className={`text-xl font-bold font-mono ${
                    Math.abs(comparisonSummary.diffPct) < 0.1
                      ? 'text-[#10B981]'
                      : Math.abs(comparisonSummary.diffPct) > 5
                        ? 'text-[#EF4444]'
                        : 'text-[#F59E0B]'
                  }`}>
                    {comparisonSummary.diffPct > 0 ? '+' : ''}
                    {comparisonSummary.diffPct.toFixed(2)}%
                  </p>
                </div>
              </div>
            </div>

            {/* Line-by-line Comparison Table */}
            <div className="bg-[#141820] rounded-xl border border-[#2A3040] overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-[#2A3040]">
                      <th className="text-left px-3 py-3 text-[10px] font-medium text-[#6B7280] uppercase tracking-wider" rowSpan={2}>Item</th>
                      <th className="text-center px-2 py-1.5 text-[10px] font-medium text-[#6B7280] uppercase tracking-wider border-b border-[#2A3040] bg-[#0F1218]" colSpan={3}>Pedido (PO)</th>
                      <th className="text-center px-2 py-1.5 text-[10px] font-medium text-[#6B7280] uppercase tracking-wider border-b border-[#2A3040] bg-[#181E28]" colSpan={3}>Factura</th>
                      <th className="text-center px-3 py-3 text-[10px] font-medium text-[#6B7280] uppercase tracking-wider" rowSpan={2}>Estado</th>
                    </tr>
                    <tr className="border-b border-[#2A3040] text-[#6B7280] text-[10px] uppercase tracking-wider">
                      <th className="text-right px-2 py-2 bg-[#0F1218]">Cant.</th>
                      <th className="text-right px-2 py-2 bg-[#0F1218]">Precio</th>
                      <th className="text-right px-2 py-2 bg-[#0F1218]">Subtotal</th>
                      <th className="text-right px-2 py-2 bg-[#181E28]">Cant.</th>
                      <th className="text-right px-2 py-2 bg-[#181E28]">Precio</th>
                      <th className="text-right px-2 py-2 bg-[#181E28]">Subtotal</th>
                    </tr>
                  </thead>
                  <tbody>
                    {comparisonRows.map((row) => {
                      const statusConfig: Record<ComparisonStatus, { label: string; bg: string; badgeBg: string; badgeText: string }> = {
                        ok: { label: 'OK', bg: '', badgeBg: 'bg-[#10B981]/15', badgeText: 'text-[#10B981]' },
                        precio_diferente: { label: 'Precio diferente', bg: 'bg-[#F59E0B]/5', badgeBg: 'bg-[#F59E0B]/15', badgeText: 'text-[#F59E0B]' },
                        cantidad_diferente: { label: 'Cantidad diferente', bg: 'bg-[#F59E0B]/5', badgeBg: 'bg-[#EAB308]/15', badgeText: 'text-[#EAB308]' },
                        nuevo: { label: 'NUEVO', bg: 'bg-[#3B82F6]/5', badgeBg: 'bg-[#3B82F6]/15', badgeText: 'text-[#3B82F6]' },
                        faltante: { label: 'FALTANTE', bg: 'bg-[#EF4444]/5', badgeBg: 'bg-[#EF4444]/15', badgeText: 'text-[#EF4444]' },
                      }
                      const cfg = statusConfig[row.status]
                      const curr = (doc.currency as 'EUR' | 'USD' | 'ARS') || 'EUR'

                      return (
                        <tr key={row.key} className={`border-b border-[#1E2330] ${cfg.bg} hover:bg-[#1E2330]/50 transition-colors`}>
                          {/* Item description */}
                          <td className="px-3 py-2.5">
                            <div>
                              <p className="text-[#F0F2F5] font-medium text-sm">{row.description}</p>
                              {row.sku && row.sku !== '-' && (
                                <p className="text-[#6B7280] text-xs font-mono">{row.sku}</p>
                              )}
                            </div>
                          </td>

                          {/* PO side */}
                          <td className={`text-right px-2 py-2.5 font-mono text-xs bg-[#0F1218]/50 ${
                            row.status === 'nuevo' ? 'text-[#4B5563]' : 'text-[#9CA3AF]'
                          }`}>
                            {row.poQty != null ? row.poQty : <span className="text-[#4B5563]">-</span>}
                          </td>
                          <td className={`text-right px-2 py-2.5 font-mono text-xs bg-[#0F1218]/50 ${
                            row.status === 'precio_diferente' ? 'text-[#F59E0B] font-bold' : row.status === 'nuevo' ? 'text-[#4B5563]' : 'text-[#9CA3AF]'
                          }`}>
                            {row.poPrice != null ? formatCurrency(row.poPrice, curr) : <span className="text-[#4B5563]">-</span>}
                          </td>
                          <td className={`text-right px-2 py-2.5 font-mono text-xs bg-[#0F1218]/50 ${
                            row.status === 'nuevo' ? 'text-[#4B5563]' : 'text-[#9CA3AF]'
                          }`}>
                            {row.poSubtotal != null ? formatCurrency(row.poSubtotal, curr) : <span className="text-[#4B5563]">-</span>}
                          </td>

                          {/* Invoice side */}
                          <td className={`text-right px-2 py-2.5 font-mono text-xs bg-[#181E28]/50 ${
                            row.status === 'faltante' ? 'text-[#4B5563]' : row.status === 'cantidad_diferente' ? 'text-[#EAB308] font-bold' : 'text-[#F0F2F5]'
                          }`}>
                            {row.invQty != null ? row.invQty : <span className="text-[#4B5563]">-</span>}
                          </td>
                          <td className={`text-right px-2 py-2.5 font-mono text-xs bg-[#181E28]/50 ${
                            row.status === 'faltante' ? 'text-[#4B5563]' : row.status === 'precio_diferente' ? 'text-[#F59E0B] font-bold' : 'text-[#F0F2F5]'
                          }`}>
                            {row.invPrice != null ? formatCurrency(row.invPrice, curr) : <span className="text-[#4B5563]">-</span>}
                          </td>
                          <td className={`text-right px-2 py-2.5 font-mono text-xs bg-[#181E28]/50 ${
                            row.status === 'faltante' ? 'text-[#4B5563]' : row.status === 'nuevo' ? 'text-[#3B82F6] font-bold' : 'text-[#F0F2F5]'
                          }`}>
                            {row.invSubtotal != null ? formatCurrency(row.invSubtotal, curr) : <span className="text-[#4B5563]">-</span>}
                          </td>

                          {/* Status badge */}
                          <td className="text-center px-2 py-2.5">
                            <span className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider ${cfg.badgeBg} ${cfg.badgeText}`}>
                              {row.status === 'ok' && <CheckCircle2 size={11} />}
                              {row.status === 'precio_diferente' && <AlertTriangle size={11} />}
                              {row.status === 'cantidad_diferente' && <AlertTriangle size={11} />}
                              {row.status === 'nuevo' && <PackageCheck size={11} />}
                              {row.status === 'faltante' && <X size={11} />}
                              {cfg.label}
                            </span>
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                  {/* Table footer with totals */}
                  <tfoot>
                    <tr className="border-t-2 border-[#2A3040] bg-[#0F1218]">
                      <td className="px-3 py-3 text-xs font-bold text-[#F0F2F5] uppercase">Totales</td>
                      <td className="text-right px-2 py-3 bg-[#0F1218]" />
                      <td className="text-right px-2 py-3 bg-[#0F1218]" />
                      <td className="text-right px-2 py-3 font-mono text-sm font-bold text-[#9CA3AF] bg-[#0F1218]">
                        {formatCurrency(comparisonSummary.poTotal, (doc.currency as 'EUR' | 'USD' | 'ARS') || 'EUR')}
                      </td>
                      <td className="text-right px-2 py-3 bg-[#181E28]" />
                      <td className="text-right px-2 py-3 bg-[#181E28]" />
                      <td className="text-right px-2 py-3 font-mono text-sm font-bold text-[#F0F2F5] bg-[#181E28]">
                        {formatCurrency(comparisonSummary.invTotal, (doc.currency as 'EUR' | 'USD' | 'ARS') || 'EUR')}
                      </td>
                      <td className="text-center px-2 py-3">
                        {Math.abs(comparisonSummary.diff) < 0.01 ? (
                          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[10px] font-bold bg-[#10B981]/15 text-[#10B981]">
                            <CheckCircle2 size={11} />
                            COINCIDE
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[10px] font-bold bg-[#F59E0B]/15 text-[#F59E0B]">
                            <AlertTriangle size={11} />
                            {comparisonSummary.diff > 0 ? '+' : ''}{formatCurrency(comparisonSummary.diff, (doc.currency as 'EUR' | 'USD' | 'ARS') || 'EUR')}
                          </span>
                        )}
                      </td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            </div>

            {/* Confirm Button */}
            {linkedPurchaseInvoice?.comparison_status !== 'confirmed' ? (
              <div className="flex items-center justify-between bg-[#141820] rounded-xl border border-[#2A3040] p-5">
                <div className="flex items-center gap-3">
                  <AlertTriangle size={20} className="text-[#F59E0B]" />
                  <div>
                    <p className="text-sm font-medium text-[#F0F2F5]">Revision pendiente</p>
                    <p className="text-xs text-[#6B7280]">
                      {Math.abs(comparisonSummary.diff) < 0.01
                        ? 'Los totales coinciden. Confirma la revision para cerrar el control.'
                        : `Hay una diferencia de ${comparisonSummary.diff > 0 ? '+' : ''}${formatCurrency(comparisonSummary.diff, (doc.currency as 'EUR' | 'USD' | 'ARS') || 'EUR')} (${comparisonSummary.diffPct.toFixed(2)}%). Revisa las lineas y confirma.`
                      }
                    </p>
                  </div>
                </div>
                <Button
                  variant="primary"
                  onClick={handleConfirmComparison}
                  disabled={comparisonConfirming}
                  className="shrink-0"
                >
                  {comparisonConfirming ? (
                    <><Loader2 size={14} className="animate-spin" /> Confirmando...</>
                  ) : (
                    <><ShieldCheck size={14} /> Confirmar diferencias</>
                  )}
                </Button>
              </div>
            ) : (
              <div className="flex items-center gap-3 bg-[#10B981]/10 rounded-xl border border-[#10B981]/30 p-5">
                <ShieldCheck size={20} className="text-[#10B981]" />
                <div>
                  <p className="text-sm font-medium text-[#10B981]">Comparacion confirmada</p>
                  <p className="text-xs text-[#6B7280]">
                    Confirmado {linkedPurchaseInvoice.confirmed_at
                      ? `el ${formatDate(linkedPurchaseInvoice.confirmed_at, 'dd/MM/yyyy HH:mm')}`
                      : ''}
                    {linkedPurchaseInvoice.confirmed_by
                      ? ` por ${linkedPurchaseInvoice.confirmed_by}`
                      : ''}
                  </p>
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* ====== MODALS ====== */}

      {/* Send modal */}
      <SendDocumentModal
        isOpen={showSendModal}
        onClose={() => setShowSendModal(false)}
        documentType={documentType}
        documentNumber={doc.display_ref || doc.system_code}
        documentId={documentId}
        clientName={client?.name || 'Cliente'}
        clientEmail={client?.email || undefined}
        clientId={client?.id || undefined}
        total={totals.total}
        currency={(doc.currency || 'EUR') as 'EUR' | 'ARS' | 'USD'}
        items={displayItems.map(i => ({
          sku: i.sku,
          description: i.description,
          quantity: i.quantity,
          unit_price: i.unit_price,
          discount_pct: i.discount_pct,
          subtotal: i.subtotal,
          notes: i.notes,
          is_section: i.is_section,
          section_label: i.section_label,
        }))}
        document={{
          type: doc.type,
          display_ref: doc.display_ref,
          system_code: doc.system_code,
          status: doc.status,
          currency: doc.currency,
          subtotal: totals.subtotal,
          tax_amount: totals.taxAmount,
          tax_rate: doc.tax_rate,
          total: totals.total,
          notes: doc.notes,
          created_at: doc.created_at,
          valid_until: doc.valid_until,
          delivery_date: doc.delivery_date,
          incoterm: doc.incoterm,
          payment_terms: doc.payment_terms,
          shipping_address: doc.shipping_address,
        }}
        client={client ? {
          name: client.name,
          legal_name: client.legal_name,
          tax_id: client.tax_id,
          email: client.email,
        } : undefined}
        onSent={() => {
          loadDocument()
        }}
      />

      {/* Delete confirm */}
      <Modal isOpen={showDeleteConfirm} onClose={() => setShowDeleteConfirm(false)} title="Eliminar documento" size="sm">
        <div className="space-y-4">
          <p className="text-sm text-[#9CA3AF]">
            Seguro que queres eliminar este documento? Esta accion no se puede deshacer.
          </p>
          <div className="flex justify-end gap-2">
            <Button variant="secondary" size="sm" onClick={() => setShowDeleteConfirm(false)}>
              Cancelar
            </Button>
            <Button variant="danger" size="sm" onClick={handleDelete}>
              <Trash2 size={14} /> Eliminar
            </Button>
          </div>
        </div>
      </Modal>

      {/* Product search modal */}
      <Modal
        isOpen={showProductSearch}
        onClose={() => { setShowProductSearch(false); setProductSearchQuery('') }}
        title="Buscar producto"
        size="lg"
      >
        <div className="space-y-4">
          <Input
            placeholder="Buscar por SKU, nombre o marca..."
            value={productSearchQuery}
            onChange={(e) => setProductSearchQuery(e.target.value)}
            icon={<Search size={16} />}
            autoFocus
          />
          <div className="max-h-[400px] overflow-y-auto space-y-1">
            {searchingProducts && (
              <div className="text-center py-6">
                <Loader2 className="animate-spin mx-auto text-[#FF6600]" size={20} />
              </div>
            )}
            {!searchingProducts && productResults.map((p) => (
              <button
                key={p.id as string}
                onClick={() => addProductToItems(p)}
                className="w-full flex items-center justify-between px-3 py-2.5 rounded-lg hover:bg-[#1C2230] transition-colors text-left"
              >
                <div>
                  <p className="text-sm text-[#F0F2F5] font-medium">{p.name as string}</p>
                  <p className="text-xs text-[#6B7280]">
                    {p.sku as string} {p.brand ? `| ${p.brand as string}` : ''}
                  </p>
                </div>
                <span className="text-sm font-semibold text-[#FF6600] shrink-0 ml-3">
                  {formatCurrency((p.price_eur as number) || 0)}
                </span>
              </button>
            ))}
            {!searchingProducts && productSearchQuery && productResults.length === 0 && (
              <p className="text-center py-6 text-sm text-[#4B5563]">Sin resultados</p>
            )}
          </div>
        </div>
      </Modal>

      {/* ════════════════════════════════════════════════════════════════
           STICKY BOTTOM TOTALS BAR (StelOrder style)
           Solo se muestra en la pestaña "lineas". Pinned al viewport,
           muestra Uds. (items reales, sin secciones) + Base + IVA + TOTAL.
          ════════════════════════════════════════════════════════════════ */}
      {activeTab === 'lineas' && (() => {
        const realItems = displayItems.filter(i => !i.is_section)
        const totalUnits = realItems.reduce((s, i) => s + (Number(i.quantity) || 0), 0)
        const curr = (displayDoc?.currency || doc?.currency || 'EUR') as 'EUR' | 'USD' | 'ARS'
        return (
          <div className="fixed bottom-0 left-0 right-0 z-40 bg-[#0B0E13]/95 backdrop-blur-md border-t-2 border-[#FF6600]/40 shadow-[0_-4px_24px_rgba(0,0,0,0.6)] print:hidden">
            <div className="max-w-[1200px] mx-auto px-4 py-3 flex items-center justify-between gap-4 flex-wrap">
              <div className="flex items-center gap-4 text-xs text-[#9CA3AF]">
                <span>
                  Líneas: <span className="text-[#F0F2F5] font-semibold">{realItems.length}</span>
                </span>
                <span className="w-px h-4 bg-[#2A3040]" />
                <span>
                  Uds.: <span className="text-[#F0F2F5] font-semibold font-mono">{totalUnits.toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                </span>
              </div>
              <div className="flex items-center gap-6">
                <div className="text-right">
                  <p className="text-[10px] uppercase tracking-wider text-[#6B7280]">Base imponible</p>
                  <p className="text-sm font-semibold text-[#F0F2F5] font-mono">{formatCurrency(totals.subtotal, curr)}</p>
                </div>
                <div className="text-right">
                  <p className="text-[10px] uppercase tracking-wider text-[#6B7280]">IVA ({displayDoc?.tax_rate ?? doc?.tax_rate ?? 21}%)</p>
                  <p className="text-sm text-[#F0F2F5] font-mono">{formatCurrency(totals.taxAmount, curr)}</p>
                </div>
                <div className="text-right border-l-2 border-[#FF6600]/30 pl-4">
                  <p className="text-[10px] uppercase tracking-wider text-[#FF6600] font-bold">TOTAL</p>
                  <p className="text-xl font-bold text-[#FF6600] font-mono leading-tight">{formatCurrency(totals.total, curr)}</p>
                </div>
              </div>
            </div>
          </div>
        )
      })()}

      {/* Print styles are in globals.css */}
    </div>
  )
}

// ===============================================================
// FIELD ROW HELPER
// ===============================================================
function FieldRow({
  label,
  editMode,
  children,
}: {
  label: string
  editMode: boolean
  children: React.ReactNode
}) {
  return (
    <div>
      <label className="block text-[10px] font-medium text-[#6B7280] mb-1 uppercase tracking-wider">
        {label}
      </label>
      {children}
    </div>
  )
}
