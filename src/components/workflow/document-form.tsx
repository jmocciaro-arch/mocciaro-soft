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
import { useCompanyContext } from '@/lib/company-context'
import {
  ArrowLeft, Edit3, Save, Printer, Mail, MoreVertical,
  ChevronLeft, ChevronRight, Trash2, Copy, RefreshCw,
  Plus, X, Search, FileText, Link2, Clock, Paperclip,
  PenTool, Loader2, ExternalLink, GripVertical, Eye, Send,
  Building2, Minus, TrendingUp, BarChart3,
} from 'lucide-react'
import { DocLink } from '@/components/ui/doc-link'

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
  pedido: 'Pedido de Venta',
  delivery_note: 'Albaran / Remito',
  factura: 'Factura',
  pap: 'Pedido a Proveedor',
  recepcion: 'Recepcion',
  factura_compra: 'Factura de Compra',
}

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

  // Mode
  const [editMode, setEditMode] = useState(false)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [activeTab, setActiveTab] = useState<'lineas' | 'rentabilidad' | 'mas_info' | 'adjuntos' | 'firma' | 'relacionados'>('lineas')
  const [productCosts, setProductCosts] = useState<Record<string, number>>({})

  // Data
  const [doc, setDoc] = useState<DocumentData | null>(null)
  const [client, setClient] = useState<ClientData | null>(null)
  const [company, setCompany] = useState<CompanyFullData | null>(null)
  const [items, setItems] = useState<ItemData[]>([])
  const [parentLinks, setParentLinks] = useState<LinkData[]>([])
  const [childLinks, setChildLinks] = useState<LinkData[]>([])
  const [activity, setActivity] = useState<ActivityEntry[]>([])

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
            type: docData.type || documentType,
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
            .from('tt_document_items')
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
            .from('tt_document_links')
            .select('parent_id, relation_type, parent:tt_documents!parent_id(id, type, system_code, display_ref, created_at)')
            .eq('child_id', documentId)

          setParentLinks((parents || []).map((p: Row) => {
            const parent = p.parent as Row
            return {
              id: (parent?.id as string) || '',
              type: (parent?.type as string) || '',
              system_code: (parent?.system_code as string) || '',
              display_ref: (parent?.display_ref as string) || (parent?.system_code as string) || '',
              created_at: (parent?.created_at as string) || '',
            }
          }).filter(l => l.id))

          // Load child links
          const { data: children } = await supabase
            .from('tt_document_links')
            .select('child_id, relation_type, child:tt_documents!child_id(id, type, system_code, display_ref, created_at)')
            .eq('parent_id', documentId)

          setChildLinks((children || []).map((c: Row) => {
            const child = c.child as Row
            return {
              id: (child?.id as string) || '',
              type: (child?.type as string) || '',
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
        }
        const table = tableMap[documentType] || 'tt_quotes'
        const itemTableMap: Record<string, { table: string; fk: string }> = {
          coti: { table: 'tt_quote_items', fk: 'quote_id' },
          pedido: { table: 'tt_so_items', fk: 'sales_order_id' },
          delivery_note: { table: 'tt_dn_items', fk: 'delivery_note_id' },
          factura: { table: 'tt_invoice_items', fk: 'invoice_id' },
        }
        const itemConfig = itemTableMap[documentType] || { table: 'tt_quote_items', fk: 'quote_id' }

        const { data: localDoc } = await supabase
          .from(table)
          .select('*, client:tt_clients(id, name, legal_name, tax_id, email, country), company:tt_companies(id, name, currency)')
          .eq('id', documentId)
          .single()

        if (localDoc) {
          const clientJoined = localDoc.client as ClientData | undefined

          setDoc({
            id: localDoc.id,
            type: documentType,
            status: localDoc.status || 'draft',
            display_ref: localDoc.doc_number || localDoc.number || '',
            system_code: localDoc.doc_number || localDoc.number || '',
            currency: localDoc.currency || 'EUR',
            total: localDoc.total || 0,
            subtotal: localDoc.subtotal || 0,
            tax_amount: localDoc.tax_amount || 0,
            tax_rate: localDoc.tax_rate || 21,
            notes: localDoc.notes || '',
            internal_notes: localDoc.internal_notes || '',
            created_at: localDoc.created_at || '',
            updated_at: localDoc.updated_at || '',
            incoterm: localDoc.incoterm || '',
            payment_terms: localDoc.payment_terms || '',
            delivery_date: localDoc.delivery_date || '',
            valid_until: localDoc.valid_until || '',
            shipping_address: localDoc.shipping_address || '',
            subject_iva: localDoc.subject_iva !== false,
            subject_irpf: localDoc.subject_irpf === true,
            created_by: localDoc.created_by || '',
            agent: localDoc.agent || '',
            tariff: localDoc.tariff || '',
            client_id: localDoc.client_id || '',
            company_id: localDoc.company_id || '',
            metadata: {},
          })

          if (clientJoined) setClient(clientJoined)

          // Load selling company
          const localCompanyId = localDoc.company_id || activeCompany?.id
          if (localCompanyId) {
            const { data: companyData } = await supabase
              .from('tt_companies')
              .select('id, name, legal_name, tax_id, address, city, postal_code, country, phone, email, website')
              .eq('id', localCompanyId)
              .single()
            if (companyData) setCompany(companyData as CompanyFullData)
          }

          // Load items
          const { data: itemsData } = await supabase
            .from(itemConfig.table)
            .select('*')
            .eq(itemConfig.fk, documentId)
            .order('sort_order')

          setItems((itemsData || []).map((it: Row, idx: number) => ({
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
            is_section: false,
            section_label: '',
          })))
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

    } catch (err) {
      addToast({ type: 'error', title: 'Error cargando documento', message: (err as Error).message })
    } finally {
      setLoading(false)
    }
  }, [documentId, documentType, source, supabase, addToast])

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
      const { data } = await supabase
        .from('tt_clients')
        .select('id, name, legal_name, tax_id, email, country')
        .or(`name.ilike.%${clientSearch}%,legal_name.ilike.%${clientSearch}%,tax_id.ilike.%${clientSearch}%`)
        .eq('active', true)
        .limit(8)
      setClientResults((data || []) as ClientData[])
      setShowClientDropdown(true)
    }, 300)
    return () => { if (clientDebounceRef.current) clearTimeout(clientDebounceRef.current) }
  }, [clientSearch, supabase])

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
            await supabase.from('tt_document_items').insert({
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
            await supabase.from('tt_document_items').update({
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
          await supabase.from('tt_document_items').delete().eq('id', rid)
        }

        // Log activity
        await supabase.from('tt_activity_log').insert({
          entity_type: 'document',
          entity_id: documentId,
          action: 'update',
          details: 'Documento actualizado',
        }).then(() => {})

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
  // DELETE
  // ---------------------------------------------------------------
  const handleDelete = async () => {
    if (!doc) return
    try {
      if (source === 'tt_documents') {
        await supabase.from('tt_document_items').delete().eq('document_id', documentId)
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
  // PRINT
  // ---------------------------------------------------------------
  const handlePrint = () => {
    window.print()
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

  // ===============================================================
  // RENDER
  // ===============================================================
  return (
    <div className="max-w-[1200px] mx-auto space-y-0 animate-fade-in print:bg-white print:text-black">

      {/* ====== TOP ACTION BAR ====== */}
      <div className="sticky top-0 z-30 bg-[#0B0E13]/95 backdrop-blur-sm border-b border-[#1E2330] px-4 py-3 -mx-4 mb-4 print:hidden">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          {/* Left: Back + Edit */}
          <div className="flex items-center gap-2">
            <Button variant="ghost" size="sm" onClick={onBack}>
              <ArrowLeft size={16} /> Volver
            </Button>

            <div className="w-px h-6 bg-[#2A3040]" />

            <Button
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
              <Button variant="ghost" size="sm" onClick={() => setEditMode(false)}>
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
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-3 print:grid-cols-2">
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
      <div className="bg-[#141820] rounded-xl border border-[#2A3040] p-5 mt-3">
        {/* Row 1: Type badge + Ref + Status */}
        <div className="flex items-center justify-between gap-4 mb-5">
          <div className="flex items-center gap-3 flex-wrap">
            <span className="px-3 py-1 rounded-full text-xs font-bold uppercase tracking-wide bg-[#FF6600] text-white">
              {TYPE_LABELS[documentType] || documentType}
            </span>
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
              <code className="text-sm font-mono text-[#9CA3AF] bg-[#0B0E13] px-2.5 py-1 rounded-md border border-[#2A3040]">
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

        {/* Row 2: Field Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
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
                          setEditDoc({ ...editDoc, client_id: c.id })
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

      {/* ====== TABS SECTION ====== */}
      <div className="mt-4">
        {/* Tab buttons */}
        <div className="flex gap-1 p-1 bg-[#0F1218] rounded-lg border border-[#1E2330] mb-4 overflow-x-auto print:hidden">
          {[
            { id: 'lineas' as const, label: 'Lineas', icon: <FileText size={14} /> },
            { id: 'rentabilidad' as const, label: 'Rentabilidad', icon: <TrendingUp size={14} /> },
            { id: 'mas_info' as const, label: 'Mas informacion', icon: <FileText size={14} /> },
            { id: 'adjuntos' as const, label: 'Adjuntos', icon: <Paperclip size={14} /> },
            { id: 'firma' as const, label: 'Firma', icon: <PenTool size={14} /> },
            { id: 'relacionados' as const, label: 'Relacionados', icon: <Link2 size={14} /> },
          ].map((tab) => (
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
          <div className="bg-[#141820] rounded-xl border border-[#2A3040] overflow-hidden">
            {/* Items table */}
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
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
                <Button variant="ghost" size="sm" onClick={addItem}>
                  <Plus size={14} /> Agregar item
                </Button>
                <Button variant="ghost" size="sm" onClick={addSection}>
                  <Plus size={14} /> Agregar seccion (OC)
                </Button>
                <Button variant="ghost" size="sm" onClick={() => setShowProductSearch(true)}>
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
        {activeTab === 'adjuntos' && (
          <div className="bg-[#141820] rounded-xl border border-[#2A3040] p-5">
            <div className="text-center py-10">
              <Paperclip size={40} className="mx-auto mb-3 text-[#4B5563]" />
              <p className="text-sm text-[#6B7280] mb-3">No hay adjuntos</p>
              <Button variant="outline" size="sm" disabled>
                <Plus size={14} /> Subir archivo
              </Button>
              <p className="text-xs text-[#4B5563] mt-2">Proximamente: subida de archivos a Supabase Storage</p>
            </div>
          </div>
        )}

        {/* ====== TAB: FIRMA ====== */}
        {activeTab === 'firma' && (
          <div className="bg-[#141820] rounded-xl border border-[#2A3040] p-5">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div>
                <label className="block text-xs font-medium text-[#6B7280] mb-2 uppercase tracking-wider">Area de firma</label>
                <div className="bg-[#0B0E13] border-2 border-dashed border-[#2A3040] rounded-xl h-40 flex items-center justify-center">
                  <div className="text-center text-[#4B5563]">
                    <PenTool size={32} className="mx-auto mb-2" />
                    <p className="text-sm">Area de firma (proximamente)</p>
                  </div>
                </div>
              </div>
              <div className="space-y-4">
                <div>
                  <label className="block text-xs font-medium text-[#6B7280] mb-1.5 uppercase tracking-wider">Firmado por</label>
                  <div className="bg-[#0B0E13] rounded-lg border border-[#2A3040] px-3 py-2 text-sm text-[#9CA3AF]">
                    Sin firma
                  </div>
                </div>
                <div>
                  <label className="block text-xs font-medium text-[#6B7280] mb-1.5 uppercase tracking-wider">Fecha de firma</label>
                  <div className="bg-[#0B0E13] rounded-lg border border-[#2A3040] px-3 py-2 text-sm text-[#9CA3AF]">
                    -
                  </div>
                </div>
              </div>
            </div>
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

      {/* ====== PRINT STYLES ====== */}
      <style jsx global>{`
        @media print {
          body { background: white !important; color: black !important; }
          .print\\:hidden { display: none !important; }
          .print\\:bg-white { background: white !important; }
          .print\\:text-black { color: black !important; }
        }
      `}</style>
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
