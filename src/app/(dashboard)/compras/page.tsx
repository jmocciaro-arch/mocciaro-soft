'use client'

import { useState, useEffect, useCallback, useMemo, useRef, Suspense, type ReactNode } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Select } from '@/components/ui/select'
import { Badge } from '@/components/ui/badge'
import { Modal } from '@/components/ui/modal'
import { SearchBar } from '@/components/ui/search-bar'
import { KPICard } from '@/components/ui/kpi-card'
import { Tabs } from '@/components/ui/tabs'
import { useToast } from '@/components/ui/toast'
import { ExportButton } from '@/components/ui/export-button'
import { ImportButton } from '@/components/ui/import-button'
import { DataTable, type DataTableColumn } from '@/components/ui/data-table'
import { SearchableSelect } from '@/components/ui/searchable-select'
import { formatCurrency, formatDate, formatRelative, getInitials } from '@/lib/utils'
import { DocumentDetailLayout, type WorkflowStep } from '@/components/workflow/document-detail-layout'
import { DocumentItemsTree, type DocumentItem } from '@/components/workflow/document-items-tree'
import { DocumentListCard } from '@/components/workflow/document-list-card'
import { DocumentForm } from '@/components/workflow/document-form'
import { documentToTableRow, localPOToRow, purchaseInvoiceToRow, mapStatus, extractClientName, extractDocRef } from '@/lib/document-helpers'
import { generateDocNumber } from '@/lib/doc-numbering'
import type { Supplier, SupplierContact, SupplierInteraction, PurchaseInvoice, PurchasePayment, PurchaseCreditNote, PurchaseCreditNoteItem } from '@/types'
import { RecepcionesTab } from './_tabs/RecepcionesTab'
import { PagosTab } from './_tabs/PagosTab'
import { CalendarioPagosTab } from './_tabs/CalendarioPagosTab'
import { PedidosCompraTab } from './_tabs/PedidosCompraTab'
import { FacturasCompraTab } from './_tabs/FacturasCompraTab'
import { AbonosTab } from './_tabs/AbonosTab'
import { useCompanyFilter } from '@/hooks/use-company-filter'
import {
  ShoppingCart, Plus, Package, Truck, CheckCircle, Clock,
  FileText, Loader2, X, Send, Users, DollarSign, FileCheck,
  Building2, Phone, Mail, MessageSquare, MapPin, Globe,
  Hash, ArrowLeft, Edit3, Save, Trash2, Star, ChevronRight,
  Contact, CreditCard, CalendarDays, AlertTriangle, Banknote,
  Receipt, ArrowUpRight, CalendarClock, CircleDollarSign,
  Layers, ArrowRightLeft, Grid3X3, List,
  Brain, Sparkles, Activity, ExternalLink, Copy, RefreshCw,
  MessageCircle, PhoneCall, Video, ThumbsDown, Wrench,
  TrendingUp, TrendingDown, ShieldCheck, BarChart2, Link,
  Upload, FileSpreadsheet, AlertCircle
} from 'lucide-react'

type Row = Record<string, unknown>

// ===============================================================
// HELPERS: tt_documents unified data
// ===============================================================
function getClientName(doc: Row): string {
  // 1. Try joined client data first (from Supabase FK join)
  const client = doc.client as Record<string, unknown> | undefined
  if (client) {
    const joined = (client.legal_name as string) || (client.name as string)
    if (joined) return joined
  }

  // 2. Try metadata from StelOrder raw
  const raw = (doc.metadata as Record<string, unknown>)?.stelorder_raw as Record<string, unknown> | undefined
  if (raw) {
    const name = (raw['account-name'] as string) || (raw['legal-name'] as string) || (raw['name'] as string)
    if (name) return name
  }

  // 3. Fallback
  return (doc.client_name as string) || 'Sin proveedor'
}

// Resuelve nombre de proveedor para una purchase order. Prefiere el JOIN
// real a tt_suppliers; cae a supplier_name (text libre) solo si la PO se
// creó sin vincular a un supplier formal (legacy).
function getSupplierName(po: Row): string {
  const supplier = po.supplier as Record<string, unknown> | undefined
  if (supplier) {
    const joined = (supplier.legal_name as string) || (supplier.name as string)
    if (joined) return joined
  }
  return (po.supplier_name as string) || 'Sin proveedor'
}

function getDocRef(doc: Row): string {
  return (doc.display_ref as string) || (doc.metadata as Record<string, unknown>)?.stelorder_reference as string || (doc.system_code as string) || '-'
}

const DOC_STATUS: Record<string, { label: string; variant: 'default' | 'success' | 'warning' | 'danger' | 'info' | 'orange' }> = {
  draft: { label: 'Borrador', variant: 'default' },
  sent: { label: 'Enviada', variant: 'info' },
  closed: { label: 'Cerrado', variant: 'default' },
  open: { label: 'Abierto', variant: 'info' },
  pending: { label: 'Pendiente', variant: 'warning' },
  partial: { label: 'Parcial', variant: 'orange' },
  received: { label: 'Recibida', variant: 'success' },
  paid: { label: 'Pagada', variant: 'success' },
  completed: { label: 'Completado', variant: 'success' },
}

const PO_STATUS: Record<string, { label: string; variant: 'default' | 'success' | 'warning' | 'danger' | 'info' | 'orange' }> = {
  // DB uses Spanish status values (CHECK constraint)
  borrador: { label: 'Borrador', variant: 'default' },
  enviada: { label: 'Enviada', variant: 'info' },
  confirmada: { label: 'Confirmada', variant: 'info' },
  recibida_parcial: { label: 'Recepcion parcial', variant: 'warning' },
  recibida: { label: 'Recibida', variant: 'success' },
  cancelada: { label: 'Cancelada', variant: 'danger' },
  // Legacy English keys (backward compat with old records)
  draft: { label: 'Borrador', variant: 'default' },
  sent: { label: 'Enviada', variant: 'info' },
  partial: { label: 'Parcial', variant: 'warning' },
  received: { label: 'Recibida', variant: 'success' },
  closed: { label: 'Cerrada', variant: 'danger' },
}

const INVOICE_STATUS: Record<string, { label: string; variant: 'default' | 'success' | 'warning' | 'danger' | 'info' | 'orange' }> = {
  pending: { label: 'Pendiente', variant: 'warning' },
  due_soon: { label: 'Vence pronto', variant: 'orange' },
  overdue: { label: 'Vencida', variant: 'danger' },
  paid: { label: 'Pagada', variant: 'success' },
  partial: { label: 'Pago parcial', variant: 'info' },
}

const comprasTabs = [
  { id: 'proveedores', label: 'Proveedores', icon: <Users size={16} /> },
  { id: 'pedidos', label: 'Pedidos', icon: <ShoppingCart size={16} /> },
  { id: 'recepciones', label: 'Recepciones', icon: <Truck size={16} /> },
  { id: 'ofertas', label: 'Ofertas proveedor', icon: <FileText size={16} /> },
  { id: 'facturas', label: 'Facturas compra', icon: <FileCheck size={16} /> },
  { id: 'abonos', label: 'Abonos', icon: <Receipt size={16} /> },
  { id: 'pagos', label: 'Pagos', icon: <CreditCard size={16} /> },
  { id: 'calendario', label: 'Calendario pagos', icon: <CalendarDays size={16} /> },
  { id: 'intercompany', label: 'Intercompany', icon: <ArrowRightLeft size={16} /> },
]

// ===============================================================
// HELPERS
// ===============================================================
function getInvoiceDisplayStatus(inv: PurchaseInvoice): string {
  if (inv.status === 'paid') return 'paid'
  if (inv.status === 'partial') return 'partial'
  if (!inv.due_date) return 'pending'
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const due = new Date(inv.due_date)
  due.setHours(0, 0, 0, 0)
  const diffDays = Math.ceil((due.getTime() - today.getTime()) / (1000 * 60 * 60 * 24))
  if (diffDays < 0) return 'overdue'
  if (diffDays <= 7) return 'due_soon'
  return 'pending'
}

function getDueDateColor(dueDate: string | null): string {
  if (!dueDate) return '#6B7280'
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const due = new Date(dueDate)
  due.setHours(0, 0, 0, 0)
  const diffDays = Math.ceil((due.getTime() - today.getTime()) / (1000 * 60 * 60 * 24))
  if (diffDays < 0) return '#EF4444'   // overdue - red
  if (diffDays <= 3) return '#F97316'   // 1-3d - orange
  if (diffDays <= 7) return '#EAB308'   // 3-7d - yellow
  return '#22C55E'                      // >7d - green
}

async function generateInvoiceNumber(companyId?: string | null): Promise<string> {
  return generateDocNumber('FC', companyId ?? null)
}

// Helper: build workflow steps for a purchase order
// DB status values (Spanish): borrador, enviada, confirmada, recibida_parcial, recibida, cancelada
function buildPOWorkflow(po: Row): WorkflowStep[] {
  const st = (po.status as string) || 'borrador'
  // Normalize: accept both English and Spanish
  const isDraft = st === 'borrador' || st === 'draft'
  const isSent = st === 'enviada' || st === 'sent'
  const isConfirmed = st === 'confirmada'
  const isPartial = st === 'recibida_parcial' || st === 'partial'
  const isReceived = st === 'recibida' || st === 'received'
  const isClosed = st === 'closed'
  const isCancelled = st === 'cancelada'

  const pastSent = !isDraft
  const pastConfirmed = pastSent && !isSent
  const pastReceived = isReceived || isClosed
  const hasInvoice = isClosed // factura registrada y pagada

  return [
    {
      key: 'borrador', label: 'Borrador', icon: '\uD83D\uDCCB',
      status: isDraft ? 'current' : 'completed',
    },
    {
      key: 'enviada', label: 'Enviada', icon: '\uD83D\uDCE8',
      status: isSent ? 'current' : pastSent ? 'completed' : 'pending',
      documentRef: (po.supplier_name as string) || '',
      date: po.created_at ? new Date(po.created_at as string).toLocaleDateString('es-ES') : '',
    },
    {
      key: 'confirmada', label: 'Confirmada', icon: '\u2705',
      status: isConfirmed ? 'current' : pastConfirmed ? 'completed' : 'pending',
    },
    {
      key: 'recepcion', label: 'Recepcion', icon: '\uD83D\uDCE6',
      status: isPartial ? 'partial' : isReceived || isClosed ? 'completed' : pastConfirmed && !isConfirmed ? 'current' : 'pending',
    },
    {
      key: 'factura_compra', label: 'Factura compra', icon: '\uD83D\uDCB3',
      status: hasInvoice ? 'completed' : pastReceived ? 'current' : 'pending',
    },
    {
      key: 'pagada', label: 'Pagada', icon: '\uD83D\uDCB0',
      status: isClosed ? 'completed' : 'pending',
    },
  ]
}

const countryFlags: Record<string, string> = { ES: '\u{1F1EA}\u{1F1F8}', AR: '\u{1F1E6}\u{1F1F7}', US: '\u{1F1FA}\u{1F1F8}', CL: '\u{1F1E8}\u{1F1F1}', UY: '\u{1F1FA}\u{1F1FE}', BR: '\u{1F1E7}\u{1F1F7}', MX: '\u{1F1F2}\u{1F1FD}', CO: '\u{1F1E8}\u{1F1F4}', DE: '\u{1F1E9}\u{1F1EA}', FR: '\u{1F1EB}\u{1F1F7}', IT: '\u{1F1EE}\u{1F1F9}', GB: '\u{1F1EC}\u{1F1E7}', CN: '\u{1F1E8}\u{1F1F3}', JP: '\u{1F1EF}\u{1F1F5}', TW: '\u{1F1F9}\u{1F1FC}', KR: '\u{1F1F0}\u{1F1F7}', PT: '\u{1F1F5}\u{1F1F9}' }
const countryNames: Record<string, string> = { ES: 'Espana', AR: 'Argentina', US: 'Estados Unidos', CL: 'Chile', UY: 'Uruguay', BR: 'Brasil', MX: 'Mexico', CO: 'Colombia', DE: 'Alemania', FR: 'Francia', IT: 'Italia', GB: 'Reino Unido', CN: 'China', JP: 'Japon', TW: 'Taiwan', KR: 'Corea del Sur', PT: 'Portugal' }

// Estados miembros de la UE distintos de ES (operaciones intracomunitarias).
const EU_INTRACOM_COUNTRIES = new Set([
  'DE', 'FR', 'IT', 'PT', 'NL', 'BE', 'AT', 'IE', 'FI', 'SE', 'DK',
  'PL', 'CZ', 'GR', 'HU', 'LU', 'RO', 'SK', 'SI', 'BG', 'HR', 'CY',
  'EE', 'LT', 'LV', 'MT',
])

// Normaliza el country del proveedor (puede venir como 'ES', 'Espana', 'Spain', etc.)
function normalizeCountryToCode(country: string | null | undefined): string | null {
  if (!country) return null
  const trimmed = country.trim()
  if (!trimmed) return null
  // Si ya es codigo ISO de 2 letras
  if (trimmed.length === 2) return trimmed.toUpperCase()
  // Buscar en countryNames por nombre
  const upper = trimmed.toUpperCase()
  for (const [code, name] of Object.entries(countryNames)) {
    if (name.toUpperCase() === upper) return code
  }
  // Heuristicas adicionales para nombres en ingles
  const en: Record<string, string> = {
    'SPAIN': 'ES', 'GERMANY': 'DE', 'FRANCE': 'FR', 'ITALY': 'IT', 'PORTUGAL': 'PT',
    'NETHERLANDS': 'NL', 'BELGIUM': 'BE', 'AUSTRIA': 'AT', 'IRELAND': 'IE',
    'FINLAND': 'FI', 'SWEDEN': 'SE', 'DENMARK': 'DK', 'POLAND': 'PL',
    'CZECH REPUBLIC': 'CZ', 'GREECE': 'GR', 'HUNGARY': 'HU', 'LUXEMBOURG': 'LU',
    'ROMANIA': 'RO', 'SLOVAKIA': 'SK', 'SLOVENIA': 'SI', 'BULGARIA': 'BG',
    'CROATIA': 'HR', 'CYPRUS': 'CY', 'ESTONIA': 'EE', 'LITHUANIA': 'LT',
    'LATVIA': 'LV', 'MALTA': 'MT',
  }
  return en[upper] || null
}

function isEUIntracomCountry(country: string | null | undefined): boolean {
  const code = normalizeCountryToCode(country)
  return !!code && EU_INTRACOM_COUNTRIES.has(code)
}

// ===============================================================
// PAYMENT ALERTS CHECKER
// ===============================================================
async function checkPaymentAlerts() {
  const supabase = createClient()
  const today = new Date().toISOString().split('T')[0]
  const in7days = new Date(Date.now() + 7 * 86400000).toISOString().split('T')[0]

  // 1) Invoices due within 7 days (not paid)
  const { data: dueSoon } = await supabase
    .from('tt_purchase_invoices')
    .select('id, number, total, due_date, supplier_id')
    .neq('status', 'paid')
    .gte('due_date', today)
    .lte('due_date', in7days)

  for (const inv of dueSoon || []) {
    const { data: existing } = await supabase
      .from('tt_alerts')
      .select('id')
      .eq('type', 'payment_due_soon')
      .eq('document_id', inv.id)
      .eq('status', 'active')
      .limit(1)
    if (!existing?.length) {
      await supabase.from('tt_alerts').insert({
        type: 'payment_due_soon',
        severity: 'warning',
        title: `Factura ${inv.number} vence el ${formatDate(inv.due_date)}`,
        description: `Monto: ${formatCurrency(inv.total)}. Programar pago.`,
        document_id: inv.id,
        status: 'active',
      })
    }
  }

  // 2) Overdue invoices
  const { data: overdue } = await supabase
    .from('tt_purchase_invoices')
    .select('id, number, total, due_date')
    .neq('status', 'paid')
    .lt('due_date', today)

  for (const inv of overdue || []) {
    const { data: existing } = await supabase
      .from('tt_alerts')
      .select('id')
      .eq('type', 'payment_overdue')
      .eq('document_id', inv.id)
      .eq('status', 'active')
      .limit(1)
    if (!existing?.length) {
      await supabase.from('tt_alerts').insert({
        type: 'payment_overdue',
        severity: 'urgent',
        title: `VENCIDA: Factura ${inv.number}`,
        description: `Vencio el ${formatDate(inv.due_date)}. Monto: ${formatCurrency(inv.total)}.`,
        document_id: inv.id,
        status: 'active',
      })
    }
  }

  // 3) Advance payments with goods not received past expected date
  const { data: advances } = await supabase
    .from('tt_purchase_payments')
    .select('id, amount, expected_goods_date, supplier_id')
    .eq('is_advance', true)
    .eq('goods_received', false)
    .lte('expected_goods_date', today)

  for (const adv of advances || []) {
    const { data: existing } = await supabase
      .from('tt_alerts')
      .select('id')
      .eq('type', 'advance_goods_pending')
      .eq('document_id', adv.id)
      .eq('status', 'active')
      .limit(1)
    if (!existing?.length) {
      await supabase.from('tt_alerts').insert({
        type: 'advance_goods_pending',
        severity: 'warning',
        title: `Anticipo sin mercaderia recibida`,
        description: `Se esperaba recepcion el ${formatDate(adv.expected_goods_date!)}. Monto anticipo: ${formatCurrency(adv.amount)}.`,
        document_id: adv.id,
        status: 'active',
      })
    }
  }
}


// ===============================================================
// SUPPLIER DETAIL VIEW (3-column layout like Clients)
// ===============================================================
function SupplierDetail({ supplier: supplierProp, onClose, onUpdate }: {
  supplier: Supplier
  onClose: () => void
  onUpdate: () => void
}) {
  const { addToast } = useToast()
  const supabase = createClient()
  const router = useRouter()
  const [supplier, setSupplier] = useState<Supplier>(supplierProp)
  const [activeDetailTab, setActiveDetailTab] = useState('datos')
  const [editing, setEditing] = useState(false)
  const [editData, setEditData] = useState<Partial<Supplier>>({})
  const [saving, setSaving] = useState(false)
  const [contacts, setContacts] = useState<SupplierContact[]>([])
  const [loadingContacts, setLoadingContacts] = useState(true)
  const [purchaseOrders, setPurchaseOrders] = useState<Row[]>([])
  const [loadingPOs, setLoadingPOs] = useState(true)
  const [showAddContact, setShowAddContact] = useState(false)
  const [newContact, setNewContact] = useState({ name: '', position: '', email: '', phone: '', whatsapp: '' })
  const [savingContact, setSavingContact] = useState(false)
  const [editingContact, setEditingContact] = useState<string | null>(null)
  const [editContactData, setEditContactData] = useState<Partial<SupplierContact>>({})
  // Payment data for supplier detail
  const [pendingInvoices, setPendingInvoices] = useState<PurchaseInvoice[]>([])
  const [totalPaidYear, setTotalPaidYear] = useState(0)
  const [lastPayment, setLastPayment] = useState<PurchasePayment | null>(null)
  // Nuevas features: AI score, interactions, doc chain, portal
  const [interactions, setInteractions] = useState<SupplierInteraction[]>([])
  const [loadingInteractions, setLoadingInteractions] = useState(false)
  const [scoringAI, setScoringAI] = useState(false)
  const [showAddInteraction, setShowAddInteraction] = useState(false)
  const [newInteraction, setNewInteraction] = useState({ type: 'note' as SupplierInteraction['type'], subject: '', body: '', outcome: '', rating: '' })
  const [savingInteraction, setSavingInteraction] = useState(false)
  const [generatingPortal, setGeneratingPortal] = useState(false)
  const [portalCopied, setPortalCopied] = useState(false)
  const [documentChain, setDocumentChain] = useState<Row[]>([])

  const loadContacts = useCallback(async () => {
    setLoadingContacts(true)
    const sb = createClient()
    const { data } = await sb
      .from('tt_supplier_contacts')
      .select('*')
      .eq('supplier_id', supplier.id)
      .order('is_primary', { ascending: false })
    setContacts((data || []) as SupplierContact[])
    setLoadingContacts(false)
  }, [supplier.id])

  const loadPurchaseOrders = useCallback(async () => {
    setLoadingPOs(true)
    const sb = createClient()
    const { data } = await sb
      .from('tt_purchase_orders')
      .select('*')
      .eq('supplier_id', supplier.id)
      .order('created_at', { ascending: false })
      .limit(30)
    // Fallback: buscar por nombre si no hay supplier_id FK
    if (!data || data.length === 0) {
      const { data: byName } = await sb
        .from('tt_purchase_orders')
        .select('*')
        .ilike('supplier_name', `%${supplier.name}%`)
        .order('created_at', { ascending: false })
        .limit(30)
      setPurchaseOrders(byName || [])
    } else {
      setPurchaseOrders(data)
    }
    setLoadingPOs(false)
  }, [supplier.id, supplier.name])

  const loadPaymentInfo = useCallback(async () => {
    const sb = createClient()
    const { data: invs } = await sb
      .from('tt_purchase_invoices')
      .select('*')
      .eq('supplier_id', supplier.id)
      .neq('status', 'paid')
      .order('due_date', { ascending: true })
    setPendingInvoices((invs || []) as PurchaseInvoice[])

    const yearStart = new Date(new Date().getFullYear(), 0, 1).toISOString().split('T')[0]
    const { data: payments } = await sb
      .from('tt_purchase_payments')
      .select('amount')
      .eq('supplier_id', supplier.id)
      .gte('payment_date', yearStart)
    setTotalPaidYear((payments || []).reduce((s: number, p: { amount: number }) => s + (p.amount || 0), 0))

    const { data: lastP } = await sb
      .from('tt_purchase_payments')
      .select('*')
      .eq('supplier_id', supplier.id)
      .order('payment_date', { ascending: false })
      .limit(1)
    setLastPayment(lastP?.[0] as PurchasePayment || null)
  }, [supplier.id])

  const loadInteractions = useCallback(async () => {
    setLoadingInteractions(true)
    const sb = createClient()
    const { data } = await sb
      .from('tt_supplier_interactions')
      .select('*')
      .eq('supplier_id', supplier.id)
      .order('created_at', { ascending: false })
      .limit(50)
    setInteractions((data || []) as SupplierInteraction[])
    setLoadingInteractions(false)
  }, [supplier.id])

  const loadDocumentChain = useCallback(async () => {
    const sb = createClient()
    const { data } = await sb
      .from('tt_purchase_orders')
      .select('id, po_number, status, total, created_at, expected_delivery')
      .eq('supplier_id', supplier.id)
      .order('created_at', { ascending: false })
      .limit(20)
    setDocumentChain(data || [])
  }, [supplier.id])

  useEffect(() => {
    loadContacts()
    loadPurchaseOrders()
    loadPaymentInfo()
    loadInteractions()
    loadDocumentChain()
  }, [loadContacts, loadPurchaseOrders, loadPaymentInfo, loadInteractions, loadDocumentChain])

  function startEditing() {
    setEditing(true)
    setEditData({
      name: supplier.name,
      legal_name: supplier.legal_name,
      tax_id: supplier.tax_id,
      email: supplier.email,
      phone: supplier.phone,
      address: supplier.address,
      city: supplier.city,
      country: supplier.country,
      category: supplier.category,
      payment_terms: supplier.payment_terms,
      notes: supplier.notes,
    })
  }

  async function saveEdit() {
    setSaving(true)
    const { error } = await supabase.from('tt_suppliers').update({
      name: editData.name,
      legal_name: editData.legal_name,
      tax_id: editData.tax_id,
      email: editData.email,
      phone: editData.phone,
      address: editData.address,
      city: editData.city,
      country: editData.country,
      category: editData.category,
      payment_terms: editData.payment_terms,
      notes: editData.notes,
    }).eq('id', supplier.id)
    if (!error) {
      setEditing(false)
      setSupplier(prev => ({ ...prev, ...editData }))
      addToast({ type: 'success', title: 'Proveedor actualizado' })
      onUpdate()
    }
    else addToast({ type: 'error', title: 'Error', message: error.message })
    setSaving(false)
  }

  async function runAIScore() {
    setScoringAI(true)
    try {
      const res = await fetch('/api/suppliers/score', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ supplierId: supplier.id, persist: true }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Error IA')
      setSupplier(prev => ({
        ...prev,
        ai_score: data.score,
        ai_tags: data.tags,
        ai_analysis: data.analysis,
        ai_analysis_at: new Date().toISOString(),
        ai_profile: {
          delivery_score: data.delivery_score,
          quality_score: data.quality_score,
          price_score: data.price_score,
          reliability_score: data.reliability_score,
          last_analysis_summary: data.analysis,
          suggested_action: data.suggested_action,
        },
      }))
      addToast({ type: 'success', title: 'Score IA calculado', message: `Score: ${data.score}/100` })
    } catch (err) {
      addToast({ type: 'error', title: 'Error IA', message: (err as Error).message })
    }
    setScoringAI(false)
  }

  async function addInteraction() {
    if (!newInteraction.subject.trim()) { addToast({ type: 'error', title: 'El asunto es obligatorio' }); return }
    setSavingInteraction(true)
    try {
      const { error } = await supabase.from('tt_supplier_interactions').insert({
        supplier_id: supplier.id,
        company_id: null, // se setea via RLS / trigger si aplica
        type: newInteraction.type,
        direction: ['email_sent', 'call'].includes(newInteraction.type) ? 'outbound' : 'inbound',
        subject: newInteraction.subject,
        body: newInteraction.body || null,
        outcome: newInteraction.outcome || null,
        rating: newInteraction.rating ? parseInt(newInteraction.rating) : null,
      })
      if (error) throw error
      setShowAddInteraction(false)
      setNewInteraction({ type: 'note', subject: '', body: '', outcome: '', rating: '' })
      addToast({ type: 'success', title: 'Interaccion registrada' })
      loadInteractions()
    } catch (err) {
      addToast({ type: 'error', title: 'Error', message: (err as Error).message })
    }
    setSavingInteraction(false)
  }

  async function generatePortalToken() {
    setGeneratingPortal(true)
    try {
      const token = crypto.randomUUID().replace(/-/g, '') + crypto.randomUUID().replace(/-/g, '')
      const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString()
      const { error } = await supabase.from('tt_supplier_portal_tokens').insert({
        supplier_id: supplier.id,
        company_id: null,
        token,
        is_active: true,
        expires_at: expiresAt,
      })
      if (error) throw error
      await supabase.from('tt_suppliers').update({ portal_token: token, portal_token_expires_at: expiresAt }).eq('id', supplier.id)
      setSupplier(prev => ({ ...prev, portal_token: token, portal_token_expires_at: expiresAt }))
      addToast({ type: 'success', title: 'Portal generado', message: 'El link expira en 30 dias' })
    } catch (err) {
      addToast({ type: 'error', title: 'Error', message: (err as Error).message })
    }
    setGeneratingPortal(false)
  }

  function copyPortalLink() {
    if (!supplier.portal_token) return
    const url = `${window.location.origin}/api/portal/supplier/${supplier.portal_token}`
    navigator.clipboard.writeText(url)
    setPortalCopied(true)
    setTimeout(() => setPortalCopied(false), 2000)
    addToast({ type: 'success', title: 'Link copiado' })
  }

  function sendPOByEmail() {
    if (!supplier.email) { addToast({ type: 'error', title: 'El proveedor no tiene email registrado' }); return }
    const subject = encodeURIComponent(`Orden de Compra — ${supplier.name}`)
    const body = encodeURIComponent(`Estimados ${supplier.name},\n\nAdjunto les enviamos la orden de compra correspondiente.\n\nSaludos,\nEquipo Mocciaro`)
    window.open(`mailto:${supplier.email}?subject=${subject}&body=${body}`, '_blank')
  }

  function sendPOByWhatsApp() {
    if (!supplier.phone) { addToast({ type: 'error', title: 'El proveedor no tiene telefono registrado' }); return }
    const phone = supplier.phone.replace(/[^0-9+]/g, '')
    const msg = encodeURIComponent(`Hola ${supplier.name}, les enviamos la orden de compra. Por favor confirmar recepcion.`)
    window.open(`https://wa.me/${phone}?text=${msg}`, '_blank')
  }

  async function addContact() {
    if (!newContact.name.trim()) { addToast({ type: 'error', title: 'El nombre es obligatorio' }); return }
    setSavingContact(true)
    const { error } = await supabase.from('tt_supplier_contacts').insert({
      supplier_id: supplier.id, name: newContact.name, position: newContact.position || null,
      email: newContact.email || null, phone: newContact.phone || null, whatsapp: newContact.whatsapp || null,
      is_primary: contacts.length === 0,
    })
    if (!error) { setShowAddContact(false); setNewContact({ name: '', position: '', email: '', phone: '', whatsapp: '' }); addToast({ type: 'success', title: 'Contacto agregado' }); loadContacts() }
    else addToast({ type: 'error', title: 'Error', message: error.message })
    setSavingContact(false)
  }

  async function saveContactEdit(contactId: string) {
    await supabase.from('tt_supplier_contacts').update({
      name: editContactData.name, position: editContactData.position || null,
      email: editContactData.email || null, phone: editContactData.phone || null,
      whatsapp: editContactData.whatsapp || null,
    }).eq('id', contactId)
    setEditingContact(null); addToast({ type: 'success', title: 'Contacto actualizado' }); loadContacts()
  }

  async function deleteContact(contactId: string) {
    await supabase.from('tt_supplier_contacts').delete().eq('id', contactId)
    addToast({ type: 'success', title: 'Contacto eliminado' }); loadContacts()
  }

  async function togglePrimary(contactId: string) {
    for (const c of contacts) {
      await supabase.from('tt_supplier_contacts').update({ is_primary: c.id === contactId }).eq('id', c.id)
    }
    addToast({ type: 'success', title: 'Contacto principal actualizado' }); loadContacts()
  }

  const totalSpend = purchaseOrders.reduce((s, po) => s + ((po.total as number) || 0), 0)
  const pendingPOs = purchaseOrders.filter(po => po.status === 'sent' || po.status === 'partial')
  const hasOverdueInvoice = pendingInvoices.some(inv => {
    if (!inv.due_date) return false
    return new Date(inv.due_date) < new Date()
  })

  const detailTabs = [
    { id: 'datos', label: 'Datos' },
    { id: 'contactos', label: `Contactos (${contacts.length})` },
    { id: 'historial', label: `Historial (${purchaseOrders.length})` },
    { id: 'cadena', label: 'Cadena Doc.' },
    { id: 'interacciones', label: `Interacciones (${interactions.length})` },
    { id: 'ia', label: supplier.ai_score ? `IA ${supplier.ai_score}/100` : 'IA Score' },
    { id: 'pagos', label: `Pagos (${pendingInvoices.length})` },
    { id: 'portal', label: 'Portal' },
  ]

  return (
    <div className="fixed inset-0 z-50 flex bg-[#0B0E13]/95 backdrop-blur-sm animate-in fade-in duration-200">
      {/* TOP BAR */}
      <div className="absolute top-0 left-0 right-0 h-14 bg-[#141820] border-b border-[#1E2330] flex items-center px-4 gap-4 z-10">
        <button onClick={onClose} className="flex items-center gap-2 text-[#9CA3AF] hover:text-[#F0F2F5] transition-colors">
          <ArrowLeft size={18} /><span className="text-sm">Volver</span>
        </button>
        <div className="flex items-center gap-3 flex-1">
          <div className="w-8 h-8 rounded-lg bg-[#F59E0B]/20 flex items-center justify-center">
            <Building2 size={16} className="text-[#F59E0B]" />
          </div>
          <div>
            <h1 className="text-base font-bold text-[#F0F2F5] leading-tight">{supplier.legal_name || supplier.name}</h1>
            <p className="text-xs text-[#6B7280]">{countryFlags[supplier.country || ''] || ''} {supplier.tax_id || 'Sin CIF/NIF'}</p>
          </div>
          {hasOverdueInvoice && (
            <Badge variant="danger" size="sm">PAGO VENCIDO</Badge>
          )}
          {supplier.ai_score !== null && supplier.ai_score !== undefined && (
            <Badge
              variant={supplier.ai_score >= 80 ? 'success' : supplier.ai_score >= 50 ? 'warning' : 'danger'}
              size="sm"
            >
              <Brain size={10} className="mr-1 inline" />
              IA {supplier.ai_score}/100
            </Badge>
          )}
        </div>
        <div className="flex gap-2">
          {supplier.phone && <a href={`tel:${supplier.phone}`}><Button variant="ghost" size="sm"><Phone size={14} /></Button></a>}
          {supplier.email && (
            <Button variant="ghost" size="sm" onClick={sendPOByEmail} title="Enviar OC por email">
              <Mail size={14} />
            </Button>
          )}
          {supplier.phone && (
            <Button variant="ghost" size="sm" onClick={sendPOByWhatsApp} title="Enviar OC por WhatsApp">
              <MessageSquare size={14} />
            </Button>
          )}
        </div>
      </div>

      <div className="flex flex-1 pt-14 overflow-hidden">
        {/* LEFT PANEL */}
        <div className="w-72 border-r border-[#1E2330] overflow-y-auto p-4 space-y-4 shrink-0 hidden lg:block">
          <Card>
            <div className="space-y-3">
              <div className="w-14 h-14 rounded-xl bg-[#F59E0B]/20 flex items-center justify-center mx-auto">
                <span className="text-xl font-bold text-[#F59E0B]">{getInitials(supplier.legal_name || supplier.name)}</span>
              </div>
              <h2 className="text-center text-sm font-bold text-[#F0F2F5]">{supplier.legal_name || supplier.name}</h2>
              {supplier.tax_id && <p className="text-center text-xs font-mono text-[#9CA3AF]">{supplier.tax_id}</p>}
              <div className="pt-2 border-t border-[#1E2330] space-y-2">
                {supplier.address && <div className="flex items-start gap-2 text-xs text-[#9CA3AF]"><MapPin size={12} className="mt-0.5 shrink-0" /><span>{supplier.address}{supplier.city ? `, ${supplier.city}` : ''}</span></div>}
                {supplier.phone && <div className="flex items-center gap-2 text-xs text-[#9CA3AF]"><Phone size={12} className="shrink-0" /><span>{supplier.phone}</span></div>}
                {supplier.email && <div className="flex items-center gap-2 text-xs text-[#9CA3AF]"><Mail size={12} className="shrink-0" /><span className="truncate">{supplier.email}</span></div>}
                <div className="flex items-center gap-2 text-xs text-[#9CA3AF]"><Globe size={12} className="shrink-0" /><span>{countryFlags[supplier.country || ''] || ''} {countryNames[supplier.country || ''] || supplier.country || '-'}</span></div>
              </div>
            </div>
          </Card>

          <Card>
            <h3 className="text-xs font-semibold text-[#6B7280] uppercase mb-3">Condiciones</h3>
            <div className="space-y-2">
              <div className="flex justify-between text-xs"><span className="text-[#6B7280]">Pago</span><span className="text-[#F0F2F5]">{supplier.payment_terms || '-'}</span></div>
              <div className="flex justify-between text-xs"><span className="text-[#6B7280]">Categoria</span><span className="text-[#F0F2F5] capitalize">{supplier.category || '-'}</span></div>
              <div className="flex justify-between text-xs"><span className="text-[#6B7280]">Origen</span><span className="text-[#F0F2F5]">{supplier.source || '-'}</span></div>
            </div>
          </Card>

          <Card>
            <h3 className="text-xs font-semibold text-[#6B7280] uppercase mb-3">Acciones rapidas</h3>
            <div className="grid grid-cols-2 gap-2">
              {supplier.phone && <a href={`tel:${supplier.phone}`}><Button variant="secondary" size="sm" className="w-full text-xs"><Phone size={12} /> Llamar</Button></a>}
              {supplier.email && <Button variant="secondary" size="sm" className="w-full text-xs" onClick={sendPOByEmail}><Mail size={12} /> Enviar OC</Button>}
              {supplier.phone && <Button variant="secondary" size="sm" className="w-full text-xs" onClick={sendPOByWhatsApp}><MessageSquare size={12} /> WA OC</Button>}
              <Button variant="secondary" size="sm" className="w-full text-xs" onClick={() => setShowAddInteraction(true)}><Activity size={12} /> Interaccion</Button>
            </div>
          </Card>

          {/* AI Score card en sidebar */}
          {supplier.ai_score !== null && supplier.ai_score !== undefined && supplier.ai_profile && (
            <Card>
              <h3 className="text-xs font-semibold text-[#6B7280] uppercase mb-3 flex items-center gap-1.5"><Brain size={12} /> Score IA</h3>
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-xs text-[#6B7280]">Global</span>
                  <span className={`text-sm font-bold ${supplier.ai_score >= 80 ? 'text-emerald-400' : supplier.ai_score >= 50 ? 'text-amber-400' : 'text-red-400'}`}>{supplier.ai_score}/100</span>
                </div>
                {supplier.ai_profile.delivery_score !== undefined && (
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-[#6B7280]">Entrega</span>
                    <span className="text-[#F0F2F5]">{supplier.ai_profile.delivery_score}/100</span>
                  </div>
                )}
                {supplier.ai_profile.quality_score !== undefined && (
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-[#6B7280]">Calidad</span>
                    <span className="text-[#F0F2F5]">{supplier.ai_profile.quality_score}/100</span>
                  </div>
                )}
                {supplier.ai_profile.reliability_score !== undefined && (
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-[#6B7280]">Fiabilidad</span>
                    <span className="text-[#F0F2F5]">{supplier.ai_profile.reliability_score}/100</span>
                  </div>
                )}
                {supplier.ai_tags && supplier.ai_tags.length > 0 && (
                  <div className="flex flex-wrap gap-1 pt-1">
                    {supplier.ai_tags.slice(0, 4).map(tag => (
                      <span key={tag} className="text-[10px] px-1.5 py-0.5 rounded bg-[#1E2330] text-[#9CA3AF]">{tag}</span>
                    ))}
                  </div>
                )}
              </div>
            </Card>
          )}
        </div>

        {/* CENTER PANEL */}
        <div className="flex-1 overflow-y-auto p-4">
          <div className="flex gap-1 p-1 bg-[#0F1218] rounded-lg border border-[#1E2330] mb-4 overflow-x-auto">
            {detailTabs.map((tab) => (
              <button key={tab.id} onClick={() => setActiveDetailTab(tab.id)} className={`px-4 py-2 text-sm font-medium rounded-md transition-all whitespace-nowrap ${activeDetailTab === tab.id ? 'bg-[#1E2330] text-[#FF6600] shadow-sm' : 'text-[#6B7280] hover:text-[#9CA3AF]'}`}>
                {tab.label}
              </button>
            ))}
          </div>

          {/* TAB: Datos */}
          {activeDetailTab === 'datos' && (
            <div className="space-y-4">
              <div className="flex justify-between items-center">
                <h3 className="text-sm font-semibold text-[#F0F2F5]">Datos del proveedor</h3>
                {!editing && <Button variant="secondary" size="sm" onClick={startEditing}><Edit3 size={14} /> Editar</Button>}
              </div>
              {editing ? (
                <Card>
                  <div className="space-y-4">
                    <div className="grid grid-cols-2 gap-4">
                      <Input label="Nombre comercial *" value={editData.name || ''} onChange={(e) => setEditData({ ...editData, name: e.target.value })} />
                      <Input label="Razon social" value={editData.legal_name || ''} onChange={(e) => setEditData({ ...editData, legal_name: e.target.value })} />
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                      <Input label="CIF / NIF" value={editData.tax_id || ''} onChange={(e) => setEditData({ ...editData, tax_id: e.target.value })} />
                      <Select label="Categoria" value={editData.category || ''} onChange={(e) => setEditData({ ...editData, category: e.target.value })} options={[{ value: '', label: 'Sin categoria' }, { value: 'fabricante', label: 'Fabricante' }, { value: 'distribuidor', label: 'Distribuidor' }, { value: 'transporte', label: 'Transporte' }, { value: 'servicios', label: 'Servicios' }]} />
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                      <Input label="Email" type="email" value={editData.email || ''} onChange={(e) => setEditData({ ...editData, email: e.target.value })} />
                      <Input label="Telefono" value={editData.phone || ''} onChange={(e) => setEditData({ ...editData, phone: e.target.value })} />
                    </div>
                    <Input label="Direccion" value={editData.address || ''} onChange={(e) => setEditData({ ...editData, address: e.target.value })} />
                    <div className="grid grid-cols-3 gap-4">
                      <Input label="Ciudad" value={editData.city || ''} onChange={(e) => setEditData({ ...editData, city: e.target.value })} />
                      <Select label="Pais" value={editData.country || 'ES'} onChange={(e) => setEditData({ ...editData, country: e.target.value })} options={Object.entries(countryNames).map(([k, v]) => ({ value: k, label: v }))} />
                      <Input label="Condiciones de pago" value={editData.payment_terms || ''} onChange={(e) => setEditData({ ...editData, payment_terms: e.target.value })} />
                    </div>
                    <Input label="Notas" value={editData.notes || ''} onChange={(e) => setEditData({ ...editData, notes: e.target.value })} />
                    <div className="flex gap-2 justify-end pt-2">
                      <Button variant="secondary" onClick={() => setEditing(false)}>Cancelar</Button>
                      <Button variant="primary" onClick={saveEdit} loading={saving}><Save size={14} /> Guardar</Button>
                    </div>
                  </div>
                </Card>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  <SupplierInfoField label="Nombre comercial" value={supplier.name} />
                  <SupplierInfoField label="Razon social" value={supplier.legal_name} />
                  <SupplierInfoField label="CIF / NIF" value={supplier.tax_id} mono />
                  <SupplierInfoField label="Categoria" value={supplier.category} />
                  <SupplierInfoField label="Email" value={supplier.email} />
                  <SupplierInfoField label="Telefono" value={supplier.phone} />
                  <SupplierInfoField label="Direccion" value={[supplier.address, supplier.city].filter(Boolean).join(', ')} />
                  <SupplierInfoField label="Pais" value={`${countryFlags[supplier.country || ''] || ''} ${countryNames[supplier.country || ''] || supplier.country}`} />
                  <SupplierInfoField label="Condiciones de pago" value={supplier.payment_terms} />
                  <SupplierInfoField label="Notas" value={supplier.notes} />
                </div>
              )}
            </div>
          )}

          {/* TAB: Contactos */}
          {activeDetailTab === 'contactos' && (
            <div className="space-y-4">
              <div className="flex justify-between items-center">
                <h3 className="text-sm font-semibold text-[#F0F2F5]">Contactos de {supplier.name}</h3>
                <Button variant="primary" size="sm" onClick={() => setShowAddContact(true)}><Plus size={14} /> Agregar contacto</Button>
              </div>
              {loadingContacts ? (
                <div className="flex justify-center py-10"><Loader2 className="animate-spin text-[#FF6600]" size={24} /></div>
              ) : contacts.length === 0 ? (
                <Card><p className="text-center text-[#6B7280] py-6">No hay contactos registrados</p></Card>
              ) : (
                <div className="space-y-3">
                  {contacts.map((contact) => (
                    <Card key={contact.id}>
                      {editingContact === contact.id ? (
                        <div className="space-y-3">
                          <div className="grid grid-cols-2 gap-3">
                            <Input label="Nombre" value={editContactData.name || ''} onChange={(e) => setEditContactData({ ...editContactData, name: e.target.value })} />
                            <Input label="Cargo" value={editContactData.position || ''} onChange={(e) => setEditContactData({ ...editContactData, position: e.target.value })} />
                          </div>
                          <div className="grid grid-cols-3 gap-3">
                            <Input label="Email" value={editContactData.email || ''} onChange={(e) => setEditContactData({ ...editContactData, email: e.target.value })} />
                            <Input label="Telefono" value={editContactData.phone || ''} onChange={(e) => setEditContactData({ ...editContactData, phone: e.target.value })} />
                            <Input label="WhatsApp" value={editContactData.whatsapp || ''} onChange={(e) => setEditContactData({ ...editContactData, whatsapp: e.target.value })} />
                          </div>
                          <div className="flex gap-2 justify-end">
                            <Button variant="secondary" size="sm" onClick={() => setEditingContact(null)}>Cancelar</Button>
                            <Button variant="primary" size="sm" onClick={() => saveContactEdit(contact.id)}><Save size={12} /> Guardar</Button>
                          </div>
                        </div>
                      ) : (
                        <div className="flex items-center gap-3">
                          <div className="w-10 h-10 rounded-full bg-[#1E2330] flex items-center justify-center text-sm font-bold text-[#F59E0B] shrink-0">
                            {getInitials(contact.name)}
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2">
                              <span className="text-sm font-semibold text-[#F0F2F5]">{contact.name}</span>
                              {contact.is_primary && <Badge variant="orange" size="sm">Principal</Badge>}
                            </div>
                            {contact.position && <p className="text-xs text-[#6B7280]">{contact.position}</p>}
                            <div className="flex gap-4 mt-1 flex-wrap">
                              {contact.email && <span className="text-xs text-[#9CA3AF] flex items-center gap-1"><Mail size={10} />{contact.email}</span>}
                              {contact.phone && <span className="text-xs text-[#9CA3AF] flex items-center gap-1"><Phone size={10} />{contact.phone}</span>}
                            </div>
                          </div>
                          <div className="flex gap-1 shrink-0">
                            {!contact.is_primary && <Button variant="ghost" size="sm" onClick={() => togglePrimary(contact.id)} title="Marcar como principal"><Star size={14} /></Button>}
                            <Button variant="ghost" size="sm" onClick={() => {
                              setEditingContact(contact.id)
                              setEditContactData({ name: contact.name, position: contact.position, email: contact.email, phone: contact.phone, whatsapp: contact.whatsapp })
                            }}><Edit3 size={14} /></Button>
                            <Button variant="ghost" size="sm" onClick={() => deleteContact(contact.id)}><Trash2 size={14} className="text-red-400" /></Button>
                          </div>
                        </div>
                      )}
                    </Card>
                  ))}
                </div>
              )}
              <Modal isOpen={showAddContact} onClose={() => setShowAddContact(false)} title="Agregar contacto" size="md">
                <div className="space-y-4">
                  <Input label="Nombre *" value={newContact.name} onChange={(e) => setNewContact({ ...newContact, name: e.target.value })} />
                  <Input label="Cargo / Posicion" value={newContact.position} onChange={(e) => setNewContact({ ...newContact, position: e.target.value })} />
                  <div className="grid grid-cols-2 gap-4">
                    <Input label="Email" type="email" value={newContact.email} onChange={(e) => setNewContact({ ...newContact, email: e.target.value })} />
                    <Input label="Telefono" value={newContact.phone} onChange={(e) => setNewContact({ ...newContact, phone: e.target.value })} />
                  </div>
                  <Input label="WhatsApp" value={newContact.whatsapp} onChange={(e) => setNewContact({ ...newContact, whatsapp: e.target.value })} />
                  <div className="flex justify-end gap-2 pt-2">
                    <Button variant="secondary" onClick={() => setShowAddContact(false)}>Cancelar</Button>
                    <Button variant="primary" onClick={addContact} loading={savingContact}><Save size={14} /> Guardar</Button>
                  </div>
                </div>
              </Modal>
            </div>
          )}

          {/* TAB: Historial */}
          {activeDetailTab === 'historial' && (
            <div className="space-y-4">
              <h3 className="text-sm font-semibold text-[#F0F2F5]">Ordenes de compra</h3>
              {loadingPOs ? (
                <div className="flex justify-center py-10"><Loader2 className="animate-spin text-[#FF6600]" size={24} /></div>
              ) : purchaseOrders.length === 0 ? (
                <Card><p className="text-center text-[#6B7280] py-6">No hay ordenes de compra para este proveedor</p></Card>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  {purchaseOrders.map((po) => {
                    const st = (po.status as string) || 'draft'
                    return (
                      <DocumentListCard
                        key={po.id as string} type="pap"
                        systemCode={`PAP-${(po.id as string).slice(0, 8).toUpperCase()}`}
                        clientName={getSupplierName(po as Row)}
                        date={po.created_at ? formatDate(po.created_at as string) : '-'}
                        total={(po.total as number) || 0} currency="EUR"
                        status={st} statusLabel={PO_STATUS[st]?.label || st}
                        onClick={() => router.push(`/documentos/${po.id as string}`)}
                      />
                    )
                  })}
                </div>
              )}
            </div>
          )}

          {/* TAB: Pagos del proveedor */}
          {activeDetailTab === 'pagos' && (
            <div className="space-y-4">
              <h3 className="text-sm font-semibold text-[#F0F2F5]">Situacion de pagos</h3>

              {/* Payment KPIs */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div className="p-4 rounded-xl bg-[#0F1218] border border-[#1E2330]">
                  <p className="text-xs text-[#6B7280] mb-1">Pagos pendientes</p>
                  <p className="text-lg font-bold text-amber-400">{pendingInvoices.length}</p>
                  <p className="text-xs text-[#4B5563]">{formatCurrency(pendingInvoices.reduce((s, i) => s + i.total, 0))}</p>
                </div>
                <div className="p-4 rounded-xl bg-[#0F1218] border border-[#1E2330]">
                  <p className="text-xs text-[#6B7280] mb-1">Total pagado {new Date().getFullYear()}</p>
                  <p className="text-lg font-bold text-emerald-400">{formatCurrency(totalPaidYear)}</p>
                </div>
                <div className="p-4 rounded-xl bg-[#0F1218] border border-[#1E2330]">
                  <p className="text-xs text-[#6B7280] mb-1">Ultimo pago</p>
                  <p className="text-lg font-bold text-[#F0F2F5]">{lastPayment ? formatCurrency(lastPayment.amount) : '-'}</p>
                  <p className="text-xs text-[#4B5563]">{lastPayment ? formatDate(lastPayment.payment_date) : 'Sin pagos'}</p>
                </div>
              </div>

              {/* Pending invoices list */}
              {pendingInvoices.length === 0 ? (
                <Card><p className="text-center text-[#6B7280] py-6">No hay facturas pendientes de pago</p></Card>
              ) : (
                <div className="space-y-2">
                  {pendingInvoices.map(inv => {
                    const ds = getInvoiceDisplayStatus(inv)
                    const dueDateCol = getDueDateColor(inv.due_date)
                    return (
                      <div key={inv.id} className="flex items-center justify-between p-3 rounded-lg bg-[#0F1218] border border-[#1E2330]">
                        <div className="flex items-center gap-3">
                          <div className="w-2 h-8 rounded-full" style={{ backgroundColor: dueDateCol }} />
                          <div>
                            <p className="text-sm font-semibold text-[#F0F2F5]">{inv.number}</p>
                            <p className="text-xs text-[#6B7280]">Vence: {inv.due_date ? formatDate(inv.due_date) : 'Sin fecha'}</p>
                          </div>
                        </div>
                        <div className="text-right">
                          <p className="text-sm font-bold text-[#F0F2F5]">{formatCurrency(inv.total)}</p>
                          <Badge variant={INVOICE_STATUS[ds]?.variant || 'default'} size="sm">{INVOICE_STATUS[ds]?.label || ds}</Badge>
                        </div>
                      </div>
                    )
                  })}
                </div>
              )}

              {hasOverdueInvoice && (
                <div className="p-3 rounded-lg bg-red-500/10 border border-red-500/20 flex items-center gap-3">
                  <AlertTriangle size={18} className="text-red-400 shrink-0" />
                  <p className="text-sm text-red-400">Este proveedor tiene facturas vencidas sin pagar</p>
                </div>
              )}
            </div>
          )}

          {/* TAB: Cadena de documentos */}
          {activeDetailTab === 'cadena' && (
            <div className="space-y-4">
              <h3 className="text-sm font-semibold text-[#F0F2F5]">Cadena de documentos — {supplier.name}</h3>
              <p className="text-xs text-[#6B7280]">Flujo de documentos: OC enviada → Recepcion → Factura compra → Pago</p>
              {documentChain.length === 0 ? (
                <Card><p className="text-center text-[#6B7280] py-6">No hay ordenes de compra registradas para este proveedor</p></Card>
              ) : (
                <div className="space-y-3">
                  {documentChain.map((po) => {
                    const st = (po.status as string) || 'draft'
                    const steps: Array<{ label: string; done: boolean; current: boolean }> = [
                      { label: 'OC Enviada', done: true, current: st === 'sent' },
                      { label: 'Recepcion', done: st === 'received' || st === 'closed', current: st === 'partial' },
                      { label: 'Factura', done: st === 'closed', current: false },
                      { label: 'Pago', done: false, current: false },
                    ]
                    return (
                      <Card key={po.id as string}>
                        <div className="flex items-start justify-between mb-3">
                          <div>
                            <p className="text-sm font-semibold text-[#F0F2F5]">{(po.po_number as string) || `OC-${(po.id as string).slice(0, 8).toUpperCase()}`}</p>
                            <p className="text-xs text-[#6B7280]">{po.created_at ? formatDate(po.created_at as string) : '-'}</p>
                          </div>
                          <div className="text-right">
                            <p className="text-sm font-bold text-[#FF6600]">{formatCurrency((po.total as number) || 0)}</p>
                            <Badge variant={PO_STATUS[st]?.variant || 'default'} size="sm">{PO_STATUS[st]?.label || st}</Badge>
                          </div>
                        </div>
                        {/* Mini workflow */}
                        <div className="flex items-center gap-1">
                          {steps.map((step, i) => (
                            <div key={step.label} className="flex items-center gap-1 flex-1">
                              <div className={`flex-1 text-center py-1 px-2 rounded text-[10px] font-medium ${
                                step.done ? 'bg-emerald-500/20 text-emerald-400' :
                                step.current ? 'bg-amber-500/20 text-amber-400' :
                                'bg-[#1E2330] text-[#4B5563]'
                              }`}>
                                {step.label}
                              </div>
                              {i < steps.length - 1 ? <ChevronRight size={10} className="text-[#4B5563] shrink-0" /> : null}
                            </div>
                          ))}
                        </div>
                        {po.expected_delivery ? (
                          <p className="text-[10px] text-[#4B5563] mt-2">Entrega esperada: {formatDate(po.expected_delivery as string)}</p>
                        ) : null}
                      </Card>
                    )
                  })}
                </div>
              )}
            </div>
          )}

          {/* TAB: Interacciones */}
          {activeDetailTab === 'interacciones' && (
            <div className="space-y-4">
              <div className="flex justify-between items-center">
                <h3 className="text-sm font-semibold text-[#F0F2F5]">Timeline de interacciones</h3>
                <Button variant="primary" size="sm" onClick={() => setShowAddInteraction(true)}><Plus size={14} /> Agregar</Button>
              </div>
              {loadingInteractions ? (
                <div className="flex justify-center py-10"><Loader2 className="animate-spin text-[#FF6600]" size={24} /></div>
              ) : interactions.length === 0 ? (
                <Card>
                  <div className="text-center py-8 text-[#4B5563]">
                    <Activity size={32} className="mx-auto mb-2 opacity-30" />
                    <p className="text-sm">No hay interacciones registradas</p>
                    <p className="text-xs mt-1">Registra llamadas, emails, reuniones e incidencias</p>
                  </div>
                </Card>
              ) : (
                <div className="space-y-2">
                  {interactions.map((interaction) => {
                    const typeIcons: Record<string, ReactNode> = {
                      email_sent: <Mail size={14} className="text-blue-400" />,
                      email_received: <Mail size={14} className="text-emerald-400" />,
                      call: <PhoneCall size={14} className="text-emerald-400" />,
                      meeting: <Video size={14} className="text-purple-400" />,
                      complaint: <ThumbsDown size={14} className="text-red-400" />,
                      quality_issue: <Wrench size={14} className="text-red-400" />,
                      price_negotiation: <TrendingUp size={14} className="text-amber-400" />,
                      delivery_issue: <Truck size={14} className="text-orange-400" />,
                      payment_sent: <CreditCard size={14} className="text-emerald-400" />,
                      note: <FileText size={14} className="text-[#6B7280]" />,
                      other: <MessageCircle size={14} className="text-[#6B7280]" />,
                    }
                    const typeLabels: Record<string, string> = {
                      email_sent: 'Email enviado', email_received: 'Email recibido', call: 'Llamada',
                      meeting: 'Reunion', complaint: 'Reclamo', quality_issue: 'Problema calidad',
                      price_negotiation: 'Negociacion precio', delivery_issue: 'Problema entrega',
                      payment_sent: 'Pago enviado', note: 'Nota', other: 'Otro',
                    }
                    return (
                      <Card key={interaction.id}>
                        <div className="flex items-start gap-3">
                          <div className="w-8 h-8 rounded-full bg-[#1E2330] flex items-center justify-center shrink-0">
                            {typeIcons[interaction.type] || <MessageCircle size={14} className="text-[#6B7280]" />}
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 flex-wrap">
                              <span className="text-xs font-semibold text-[#9CA3AF]">{typeLabels[interaction.type] || interaction.type}</span>
                              {interaction.rating && (
                                <div className="flex gap-0.5">
                                  {Array.from({ length: 5 }).map((_, i) => (
                                    <Star key={i} size={10} className={i < interaction.rating! ? 'text-amber-400 fill-amber-400' : 'text-[#4B5563]'} />
                                  ))}
                                </div>
                              )}
                            </div>
                            {interaction.subject && <p className="text-sm font-medium text-[#F0F2F5] mt-0.5">{interaction.subject}</p>}
                            {interaction.body && <p className="text-xs text-[#6B7280] mt-1 line-clamp-2">{interaction.body}</p>}
                            {interaction.outcome && <p className="text-xs text-amber-400 mt-1">Resultado: {interaction.outcome}</p>}
                            <p className="text-[10px] text-[#4B5563] mt-1">{formatRelative(interaction.created_at)}</p>
                          </div>
                        </div>
                      </Card>
                    )
                  })}
                </div>
              )}

              <Modal isOpen={showAddInteraction} onClose={() => setShowAddInteraction(false)} title="Registrar interaccion" size="md">
                <div className="space-y-4">
                  <Select
                    label="Tipo de interaccion"
                    value={newInteraction.type}
                    onChange={(e) => setNewInteraction({ ...newInteraction, type: e.target.value as SupplierInteraction['type'] })}
                    options={[
                      { value: 'email_sent', label: 'Email enviado' },
                      { value: 'email_received', label: 'Email recibido' },
                      { value: 'call', label: 'Llamada' },
                      { value: 'meeting', label: 'Reunion' },
                      { value: 'complaint', label: 'Reclamo' },
                      { value: 'quality_issue', label: 'Problema de calidad' },
                      { value: 'price_negotiation', label: 'Negociacion de precio' },
                      { value: 'delivery_issue', label: 'Problema de entrega' },
                      { value: 'payment_sent', label: 'Pago enviado' },
                      { value: 'note', label: 'Nota interna' },
                      { value: 'other', label: 'Otro' },
                    ]}
                  />
                  <Input label="Asunto *" value={newInteraction.subject} onChange={(e) => setNewInteraction({ ...newInteraction, subject: e.target.value })} />
                  <div>
                    <label className="block text-xs font-medium text-[#9CA3AF] mb-1.5">Detalle</label>
                    <textarea
                      className="w-full bg-[#0F1218] border border-[#2A3040] rounded-lg px-3 py-2 text-sm text-[#F0F2F5] placeholder-[#4B5563] focus:outline-none focus:border-[#FF6600] resize-none"
                      rows={3}
                      value={newInteraction.body}
                      onChange={(e) => setNewInteraction({ ...newInteraction, body: e.target.value })}
                      placeholder="Descripcion de la interaccion..."
                    />
                  </div>
                  <Input label="Resultado / Conclusiones" value={newInteraction.outcome} onChange={(e) => setNewInteraction({ ...newInteraction, outcome: e.target.value })} />
                  <Select
                    label="Valoracion (opcional)"
                    value={newInteraction.rating}
                    onChange={(e) => setNewInteraction({ ...newInteraction, rating: e.target.value })}
                    options={[
                      { value: '', label: 'Sin valorar' },
                      { value: '1', label: '1 — Muy malo' },
                      { value: '2', label: '2 — Malo' },
                      { value: '3', label: '3 — Regular' },
                      { value: '4', label: '4 — Bueno' },
                      { value: '5', label: '5 — Excelente' },
                    ]}
                  />
                  <div className="flex justify-end gap-2 pt-2">
                    <Button variant="secondary" onClick={() => setShowAddInteraction(false)}>Cancelar</Button>
                    <Button variant="primary" onClick={addInteraction} loading={savingInteraction}><Save size={14} /> Guardar</Button>
                  </div>
                </div>
              </Modal>
            </div>
          )}

          {/* TAB: IA Score */}
          {activeDetailTab === 'ia' && (
            <div className="space-y-4">
              <div className="flex justify-between items-center">
                <h3 className="text-sm font-semibold text-[#F0F2F5]">Analisis IA del proveedor</h3>
                <Button variant="primary" size="sm" onClick={runAIScore} loading={scoringAI}>
                  <Sparkles size={14} /> {supplier.ai_score ? 'Re-analizar' : 'Analizar con IA'}
                </Button>
              </div>

              {!supplier.ai_score && !scoringAI && (
                <Card>
                  <div className="text-center py-8 text-[#4B5563]">
                    <Brain size={40} className="mx-auto mb-2 opacity-30" />
                    <p className="text-sm">Sin analisis IA todavia</p>
                    <p className="text-xs mt-1">Hace click en &ldquo;Analizar con IA&rdquo; para evaluar este proveedor</p>
                  </div>
                </Card>
              )}

              {scoringAI && (
                <Card>
                  <div className="flex items-center gap-3 py-4">
                    <Loader2 size={24} className="animate-spin text-[#FF6600]" />
                    <p className="text-sm text-[#9CA3AF]">Analizando historial del proveedor...</p>
                  </div>
                </Card>
              )}

              {supplier.ai_score !== null && supplier.ai_score !== undefined && !scoringAI && (
                <>
                  {/* Score global */}
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                    <div className="p-4 rounded-xl bg-[#0F1218] border border-[#1E2330] text-center">
                      <p className="text-xs text-[#6B7280] mb-1">Score Global</p>
                      <p className={`text-2xl font-bold ${supplier.ai_score >= 80 ? 'text-emerald-400' : supplier.ai_score >= 50 ? 'text-amber-400' : 'text-red-400'}`}>{supplier.ai_score}</p>
                      <p className="text-[10px] text-[#4B5563]">/ 100</p>
                    </div>
                    {supplier.ai_profile?.delivery_score !== undefined && (
                      <div className="p-4 rounded-xl bg-[#0F1218] border border-[#1E2330] text-center">
                        <p className="text-xs text-[#6B7280] mb-1 flex items-center justify-center gap-1"><Truck size={10} /> Entrega</p>
                        <p className="text-xl font-bold text-[#F0F2F5]">{supplier.ai_profile.delivery_score}</p>
                      </div>
                    )}
                    {supplier.ai_profile?.quality_score !== undefined && (
                      <div className="p-4 rounded-xl bg-[#0F1218] border border-[#1E2330] text-center">
                        <p className="text-xs text-[#6B7280] mb-1 flex items-center justify-center gap-1"><ShieldCheck size={10} /> Calidad</p>
                        <p className="text-xl font-bold text-[#F0F2F5]">{supplier.ai_profile.quality_score}</p>
                      </div>
                    )}
                    {supplier.ai_profile?.reliability_score !== undefined && (
                      <div className="p-4 rounded-xl bg-[#0F1218] border border-[#1E2330] text-center">
                        <p className="text-xs text-[#6B7280] mb-1 flex items-center justify-center gap-1"><BarChart2 size={10} /> Fiabilidad</p>
                        <p className="text-xl font-bold text-[#F0F2F5]">{supplier.ai_profile.reliability_score}</p>
                      </div>
                    )}
                  </div>

                  {/* Analisis textual */}
                  {supplier.ai_analysis && (
                    <Card>
                      <h4 className="text-xs font-semibold text-[#6B7280] uppercase mb-2">Analisis</h4>
                      <p className="text-sm text-[#F0F2F5] leading-relaxed">{supplier.ai_analysis}</p>
                      {supplier.ai_profile?.suggested_action && (
                        <div className="mt-3 p-3 rounded-lg bg-[#FF6600]/10 border border-[#FF6600]/20">
                          <p className="text-xs text-[#FF6600] font-semibold">Accion sugerida: {supplier.ai_profile.suggested_action}</p>
                        </div>
                      )}
                    </Card>
                  )}

                  {/* Tags */}
                  {supplier.ai_tags && supplier.ai_tags.length > 0 && (
                    <Card>
                      <h4 className="text-xs font-semibold text-[#6B7280] uppercase mb-2">Tags IA</h4>
                      <div className="flex flex-wrap gap-2">
                        {supplier.ai_tags.map(tag => (
                          <span key={tag} className="px-2 py-1 rounded-full text-xs bg-[#1E2330] text-[#9CA3AF] border border-[#2A3040]">{tag}</span>
                        ))}
                      </div>
                    </Card>
                  )}

                  {supplier.ai_analysis_at && (
                    <p className="text-[10px] text-[#4B5563] text-right">
                      Analizado {formatRelative(supplier.ai_analysis_at)} · por {supplier.ai_provider || 'IA'}
                    </p>
                  )}
                </>
              )}
            </div>
          )}

          {/* TAB: Portal del proveedor */}
          {activeDetailTab === 'portal' && (
            <div className="space-y-4">
              <div className="flex justify-between items-center">
                <h3 className="text-sm font-semibold text-[#F0F2F5]">Portal del proveedor</h3>
                <Button variant="primary" size="sm" onClick={generatePortalToken} loading={generatingPortal}>
                  <Link size={14} /> {supplier.portal_token ? 'Regenerar link' : 'Generar link de acceso'}
                </Button>
              </div>

              <Card>
                <p className="text-xs text-[#6B7280] mb-3">
                  El portal permite al proveedor ver sus ordenes de compra, estado de recepciones y pagos pendientes
                  sin necesidad de login. El link tiene validez de 30 dias.
                </p>

                {!supplier.portal_token ? (
                  <div className="text-center py-6 text-[#4B5563]">
                    <ExternalLink size={32} className="mx-auto mb-2 opacity-30" />
                    <p className="text-sm">Portal no generado</p>
                    <p className="text-xs mt-1">Genera un link de acceso para compartir con el proveedor</p>
                  </div>
                ) : (
                  <div className="space-y-3">
                    <div className="flex items-center gap-2 p-3 rounded-lg bg-[#0F1218] border border-[#1E2330]">
                      <code className="text-xs text-[#FF6600] font-mono truncate flex-1">
                        {typeof window !== 'undefined' ? `${window.location.origin}/api/portal/supplier/${supplier.portal_token}` : `[origin]/api/portal/supplier/${supplier.portal_token}`}
                      </code>
                      <Button variant="ghost" size="sm" onClick={copyPortalLink}>
                        {portalCopied ? <CheckCircle size={14} className="text-emerald-400" /> : <Copy size={14} />}
                      </Button>
                    </div>
                    {supplier.portal_token_expires_at && (
                      <p className="text-xs text-[#6B7280]">
                        Expira: {formatDate(supplier.portal_token_expires_at)}
                        {new Date(supplier.portal_token_expires_at) < new Date() && (
                          <span className="ml-2 text-red-400 font-semibold">EXPIRADO</span>
                        )}
                      </p>
                    )}
                    {supplier.portal_last_seen && (
                      <p className="text-xs text-[#6B7280]">Ultimo acceso: {formatRelative(supplier.portal_last_seen)}</p>
                    )}

                    {/* Send portal link */}
                    <div className="pt-2 flex gap-2">
                      {supplier.email && (
                        <Button
                          variant="secondary"
                          size="sm"
                          onClick={() => {
                            const url = typeof window !== 'undefined' ? `${window.location.origin}/api/portal/supplier/${supplier.portal_token}` : ''
                            const subject = encodeURIComponent(`Portal de proveedor — ${supplier.name}`)
                            const body = encodeURIComponent(`Estimados ${supplier.name},\n\nPueden acceder a su portal de proveedor en el siguiente link:\n\n${url}\n\nAhí podrán ver sus ordenes de compra, recepciones y estado de pagos.\n\nSaludos,\nEquipo Mocciaro`)
                            window.open(`mailto:${supplier.email}?subject=${subject}&body=${body}`, '_blank')
                          }}
                        >
                          <Mail size={12} /> Enviar por email
                        </Button>
                      )}
                      {supplier.phone && (
                        <Button
                          variant="secondary"
                          size="sm"
                          onClick={() => {
                            const url = typeof window !== 'undefined' ? `${window.location.origin}/api/portal/supplier/${supplier.portal_token}` : ''
                            const phone = supplier.phone!.replace(/[^0-9+]/g, '')
                            const msg = encodeURIComponent(`Hola ${supplier.name}, les compartimos el acceso a su portal de proveedor: ${url}`)
                            window.open(`https://wa.me/${phone}?text=${msg}`, '_blank')
                          }}
                        >
                          <MessageSquare size={12} /> Enviar por WhatsApp
                        </Button>
                      )}
                    </div>
                  </div>
                )}
              </Card>
            </div>
          )}
        </div>

        {/* RIGHT PANEL */}
        <div className="w-72 border-l border-[#1E2330] overflow-y-auto p-4 space-y-4 shrink-0 hidden xl:block">
          <Card>
            <h3 className="text-xs font-semibold text-[#6B7280] uppercase mb-3">Resumen</h3>
            <div className="space-y-3">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-lg bg-blue-500/10 flex items-center justify-center"><ShoppingCart size={14} className="text-blue-400" /></div>
                <div><p className="text-xs text-[#6B7280]">Ordenes de compra</p><p className="text-sm font-semibold text-[#F0F2F5]">{purchaseOrders.length}</p></div>
              </div>
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-lg bg-emerald-500/10 flex items-center justify-center"><DollarSign size={14} className="text-emerald-400" /></div>
                <div><p className="text-xs text-[#6B7280]">Total compras</p><p className="text-sm font-semibold text-[#F0F2F5]">{formatCurrency(totalSpend)}</p></div>
              </div>
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-lg bg-orange-500/10 flex items-center justify-center"><Contact size={14} className="text-orange-400" /></div>
                <div><p className="text-xs text-[#6B7280]">Contactos</p><p className="text-sm font-semibold text-[#F0F2F5]">{contacts.length}</p></div>
              </div>
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-lg bg-amber-500/10 flex items-center justify-center"><Receipt size={14} className="text-amber-400" /></div>
                <div><p className="text-xs text-[#6B7280]">Facturas pendientes</p><p className="text-sm font-semibold text-[#F0F2F5]">{pendingInvoices.length}</p></div>
              </div>
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-lg bg-purple-500/10 flex items-center justify-center"><Activity size={14} className="text-purple-400" /></div>
                <div><p className="text-xs text-[#6B7280]">Interacciones</p><p className="text-sm font-semibold text-[#F0F2F5]">{interactions.length}</p></div>
              </div>
              {supplier.ai_score !== null && supplier.ai_score !== undefined && (
                <div className="flex items-center gap-2">
                  <div className="w-8 h-8 rounded-lg bg-[#FF6600]/10 flex items-center justify-center"><Brain size={14} className="text-[#FF6600]" /></div>
                  <div><p className="text-xs text-[#6B7280]">Score IA</p><p className={`text-sm font-semibold ${supplier.ai_score >= 80 ? 'text-emerald-400' : supplier.ai_score >= 50 ? 'text-amber-400' : 'text-red-400'}`}>{supplier.ai_score}/100</p></div>
                </div>
              )}
            </div>
          </Card>

          <Card>
            <h3 className="text-xs font-semibold text-[#6B7280] uppercase mb-3">Pedidos pendientes</h3>
            {pendingPOs.length === 0 ? (
              <p className="text-xs text-[#4B5563]">Sin pendientes</p>
            ) : (
              <div className="space-y-2">
                {pendingPOs.slice(0, 5).map(po => (
                  <div key={po.id as string} className="flex items-center justify-between p-2 rounded-lg bg-[#0F1218]">
                    <span className="text-xs font-mono text-[#FF6600]">PAP-{(po.id as string).slice(0, 8).toUpperCase()}</span>
                    <Badge variant="warning" size="sm">{PO_STATUS[(po.status as string)]?.label || (po.status as string)}</Badge>
                  </div>
                ))}
              </div>
            )}
          </Card>

          <Card>
            <h3 className="text-xs font-semibold text-[#6B7280] uppercase mb-3">Ultimas compras</h3>
            {purchaseOrders.length === 0 ? (
              <p className="text-xs text-[#4B5563]">Sin compras</p>
            ) : (
              <div className="space-y-2">
                {purchaseOrders.slice(0, 5).map(po => (
                  <div key={po.id as string} className="flex items-center justify-between p-2 rounded-lg bg-[#0F1218]">
                    <div>
                      <span className="text-xs font-mono text-[#FF6600]">PAP-{(po.id as string).slice(0, 8).toUpperCase()}</span>
                      <p className="text-[10px] text-[#4B5563]">{po.created_at ? formatDate(po.created_at as string) : '-'}</p>
                    </div>
                    <span className="text-xs font-semibold text-[#F0F2F5]">{formatCurrency((po.total as number) || 0)}</span>
                  </div>
                ))}
              </div>
            )}
          </Card>
        </div>
      </div>
    </div>
  )
}

function SupplierInfoField({ label, value, mono }: { label: string; value: string | null | undefined; mono?: boolean }) {
  return (
    <div className="p-3 rounded-lg bg-[#0F1218] border border-[#1E2330]">
      <p className="text-xs text-[#6B7280] mb-0.5">{label}</p>
      <p className={`text-sm text-[#F0F2F5] ${mono ? 'font-mono' : ''}`}>{value || '-'}</p>
    </div>
  )
}

// ===============================================================
// PROVEEDORES TAB (reads from tt_suppliers table)
// ===============================================================
function ProveedoresTab() {
  const supabase = createClient()
  const { addToast } = useToast()
  const { filterByCompany, companyKey } = useCompanyFilter()
  const [suppliers, setSuppliers] = useState<Supplier[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [filterCountry, setFilterCountry] = useState('')
  const [filterCategory, setFilterCategory] = useState('')
  const [countries, setCountries] = useState<string[]>([])
  const [selectedSupplier, setSelectedSupplier] = useState<Supplier | null>(null)
  const [showNew, setShowNew] = useState(false)
  const [newSupplier, setNewSupplier] = useState({ name: '', legal_name: '', tax_id: '', category: '', country: 'ES', city: '', email: '', phone: '', address: '', payment_terms: '', notes: '' })
  const [savingNew, setSavingNew] = useState(false)
  const [viewMode, setViewMode] = useState<'card' | 'table'>('card')
  const [supplierMetrics, setSupplierMetrics] = useState<Record<string, {
    total_purchased: number; pending_invoices: number; paid_amount: number; last_purchase: string | null
    po_count: number; po_open: number; po_pending_delivery: number; invoices_count: number
    payments_count: number; oldest_unpaid: string | null; receipts_count: number
  }>>({})
  const [withContactsCount, setWithContactsCount] = useState(0)

  const load = useCallback(async () => {
    setLoading(true)
    const sb = createClient()
    // tt_suppliers tiene company_id (migración v52). Filtramos por las
    // companies activas del usuario para no mezclar proveedores entre orgs.
    let q = sb.from('tt_suppliers').select('*').eq('active', true).order('name')
    q = filterByCompany(q)
    const { data } = await q
    const list = (data || []) as Supplier[]
    setSuppliers(list)
    const uniqueCountries = [...new Set(list.map(s => s.country).filter(Boolean) as string[])]
    uniqueCountries.sort()
    setCountries(uniqueCountries)
    // KPI: proveedores con al menos un contacto (solo de los proveedores visibles)
    const visibleSupplierIds = list.map(s => s.id)
    if (visibleSupplierIds.length > 0) {
      const { data: contactsData } = await sb.from('tt_supplier_contacts').select('supplier_id').in('supplier_id', visibleSupplierIds)
      const uniqueSupplierIds = new Set((contactsData || []).map(c => c.supplier_id as string).filter(Boolean))
      setWithContactsCount(uniqueSupplierIds.size)
    } else {
      setWithContactsCount(0)
    }
    setLoading(false)
  }, [companyKey])

  useEffect(() => { load() }, [load])

  // Load supplier metrics (all transactional data)
  const loadSupplierMetrics = useCallback(async () => {
    const sb = createClient()
    const [{ data: poData }, { data: invData }, { data: payData }] = await Promise.all([
      sb.from('tt_purchase_orders').select('supplier_id, total, status, created_at').not('supplier_id', 'is', null),
      sb.from('tt_purchase_invoices').select('supplier_id, total, paid_amount, status, created_at, due_date').not('supplier_id', 'is', null),
      sb.from('tt_purchase_payments').select('supplier_id, amount, payment_date').not('supplier_id', 'is', null),
    ])
    type M = typeof supplierMetrics extends Record<string, infer V> ? V : never
    const empty = (): M => ({
      total_purchased: 0, pending_invoices: 0, paid_amount: 0, last_purchase: null,
      po_count: 0, po_open: 0, po_pending_delivery: 0, invoices_count: 0,
      payments_count: 0, oldest_unpaid: null, receipts_count: 0,
    })
    const map: Record<string, M> = {}
    // Purchase orders
    for (const po of (poData || [])) {
      const sid = po.supplier_id as string
      if (!map[sid]) map[sid] = empty()
      const m = map[sid]
      m.total_purchased += (po.total as number) || 0
      m.po_count++
      const st = po.status as string
      if (['draft', 'sent', 'partial'].includes(st)) { m.po_open++; m.po_pending_delivery += (po.total as number) || 0 }
      const ca = po.created_at as string
      if (!m.last_purchase || ca > m.last_purchase) m.last_purchase = ca
    }
    // Invoices
    for (const inv of (invData || [])) {
      const sid = inv.supplier_id as string
      if (!map[sid]) map[sid] = empty()
      const m = map[sid]
      m.invoices_count++
      if (inv.status !== 'paid') {
        m.pending_invoices += ((inv.total as number) || 0) - ((inv.paid_amount as number) || 0)
        const due = (inv.due_date || inv.created_at) as string
        if (!m.oldest_unpaid || due < m.oldest_unpaid) m.oldest_unpaid = due
      }
    }
    // Payments
    for (const pay of (payData || [])) {
      const sid = pay.supplier_id as string
      if (!map[sid]) map[sid] = empty()
      map[sid].paid_amount += (pay.amount as number) || 0
      map[sid].payments_count++
    }
    setSupplierMetrics(map)
  }, [])

  useEffect(() => { loadSupplierMetrics() }, [loadSupplierMetrics])

  const filtered = useMemo(() => {
    let result = suppliers
    if (filterCountry) result = result.filter(s => s.country === filterCountry)
    if (filterCategory) result = result.filter(s => s.category === filterCategory)
    if (search.trim()) {
      const tokens = search.trim().toLowerCase().split(/\s+/)
      result = result.filter(s => {
        const searchable = [s.name, s.legal_name, s.tax_id, s.email, s.city, s.phone, s.category].filter(Boolean).join(' ').toLowerCase()
        return tokens.every(t => searchable.includes(t))
      })
    }
    return result
  }, [suppliers, search, filterCountry, filterCategory])

  // Global total for % calculation
  const globalTotalPurchased = useMemo(() => {
    let t = 0
    for (const m of Object.values(supplierMetrics)) t += m.total_purchased
    return t || 1
  }, [supplierMetrics])

  // Table rows with metrics
  const supplierTableRows = useMemo(() => {
    return filtered.map(s => {
      const m = supplierMetrics[s.id]
      const totalPurchased = m?.total_purchased || 0
      const pendingInv = m?.pending_invoices || 0
      const daysOldestUnpaid = m?.oldest_unpaid ? Math.floor((Date.now() - new Date(m.oldest_unpaid).getTime()) / 86400000) : 0
      const daysInactive = m?.last_purchase ? Math.floor((Date.now() - new Date(m.last_purchase).getTime()) / 86400000) : 999
      const pctPurchase = Math.round((totalPurchased / globalTotalPurchased) * 10000) / 100
      return {
        ...s,
        _total_purchased: totalPurchased,
        _pending_invoices: pendingInv,
        _paid_amount: m?.paid_amount || 0,
        _last_purchase: m?.last_purchase || null,
        _po_count: m?.po_count || 0,
        _po_open: m?.po_open || 0,
        _po_pending_delivery: m?.po_pending_delivery || 0,
        _invoices_count: m?.invoices_count || 0,
        _payments_count: m?.payments_count || 0,
        _days_oldest_unpaid: daysOldestUnpaid,
        _days_inactive: daysInactive,
        _pct_purchase: pctPurchase,
        _country_display: `${countryFlags[s.country || ''] || ''} ${s.country || ''}`,
      } as Record<string, unknown>
    })
  }, [filtered, supplierMetrics, globalTotalPurchased])

  const supplierColumns: DataTableColumn[] = useMemo(() => [
    // --- Datos base ---
    { key: 'name', label: 'Nombre', sortable: true, searchable: true, type: 'text' },
    { key: 'legal_name', label: 'Razon Social', sortable: true, searchable: true, type: 'text', defaultVisible: false },
    { key: 'tax_id', label: 'CIF/CUIT', sortable: true, searchable: true, type: 'text' },
    { key: 'email', label: 'Email', sortable: true, searchable: true, type: 'text' },
    { key: 'phone', label: 'Telefono', sortable: false, type: 'text', defaultVisible: false },
    { key: 'city', label: 'Ciudad', sortable: true, type: 'text', defaultVisible: false },
    { key: '_country_display', label: 'Pais', sortable: true, type: 'text' },
    { key: 'category', label: 'Categoria', sortable: true, searchable: true, type: 'text' },
    { key: 'payment_terms', label: 'Cond. Pago', sortable: true, type: 'text' },
    // --- Compras ---
    { key: '_total_purchased', label: 'Total Comprado', sortable: true, type: 'currency' },
    { key: '_pct_purchase', label: '% Compras', sortable: true, type: 'number', render: (v) => v ? `${v}%` : '-' },
    { key: '_pending_invoices', label: 'Deuda Pend.', sortable: true, type: 'currency' },
    { key: '_paid_amount', label: 'Total Pagado', sortable: true, type: 'currency', defaultVisible: false },
    { key: '_days_oldest_unpaid', label: 'Dias Deuda', sortable: true, type: 'number', render: (v) => { const d = v as number; return d > 0 ? `${d}d` : '-' } },
    // --- Pipeline ---
    { key: '_po_pending_delivery', label: 'Merc. Pendiente', sortable: true, type: 'currency' },
    { key: '_po_open', label: 'OC Abiertas', sortable: true, type: 'number' },
    // --- Actividad ---
    { key: '_last_purchase', label: 'Ultima Compra', sortable: true, type: 'date' },
    { key: '_days_inactive', label: 'Dias Inactivo', sortable: true, type: 'number' },
    // --- Contadores ---
    { key: '_po_count', label: 'Total OC', sortable: true, type: 'number', defaultVisible: false },
    { key: '_invoices_count', label: 'Facturas', sortable: true, type: 'number', defaultVisible: false },
    { key: '_payments_count', label: 'Pagos', sortable: true, type: 'number', defaultVisible: false },
    // --- IA ---
    { key: 'ai_score', label: 'Score IA', sortable: true, type: 'number', render: (v) => v !== null && v !== undefined ? `${v}/100` : '-' },
    // --- Extra ---
    { key: 'notes', label: 'Notas', sortable: false, type: 'text', defaultVisible: false },
    { key: 'created_at', label: 'Creado', sortable: true, type: 'date', defaultVisible: false },
  ], [])

  async function createNewSupplier() {
    if (!newSupplier.name.trim()) { addToast({ type: 'error', title: 'El nombre es obligatorio' }); return }
    setSavingNew(true)
    const supabase = createClient()
    const { error } = await supabase.from('tt_suppliers').insert({
      name: newSupplier.name, legal_name: newSupplier.legal_name || null, tax_id: newSupplier.tax_id || null,
      category: newSupplier.category || null, country: newSupplier.country, city: newSupplier.city || null,
      email: newSupplier.email || null, phone: newSupplier.phone || null, address: newSupplier.address || null,
      payment_terms: newSupplier.payment_terms || null, notes: newSupplier.notes || null, active: true,
    })
    if (!error) {
      addToast({ type: 'success', title: 'Proveedor creado', message: newSupplier.name })
      setShowNew(false)
      setNewSupplier({ name: '', legal_name: '', tax_id: '', category: '', country: 'ES', city: '', email: '', phone: '', address: '', payment_terms: '', notes: '' })
      load()
    } else { addToast({ type: 'error', title: 'Error', message: error.message }) }
    setSavingNew(false)
  }

  if (selectedSupplier) {
    return <SupplierDetail supplier={selectedSupplier} onClose={() => setSelectedSupplier(null)} onUpdate={() => { setSelectedSupplier(null); load() }} />
  }

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <KPICard label="Proveedores" value={filtered.length} icon={<Building2 size={22} />} />
        <KPICard label="Paises" value={countries.length} icon={<Globe size={22} />} />
        <KPICard label="Fabricantes" value={suppliers.filter(s => s.category === 'fabricante').length} icon={<Package size={22} />} color="#10B981" />
        <KPICard label="Con contactos" value={withContactsCount} icon={<Contact size={22} />} />
      </div>
      <div className="flex justify-end gap-2">
        {/* View mode toggle */}
        <div className="flex rounded-lg border border-[#2A3040] overflow-hidden">
          <button onClick={() => setViewMode('card')} className={`flex items-center gap-1.5 px-3 py-2 text-xs font-medium transition-all ${viewMode === 'card' ? 'bg-[#FF6600] text-white' : 'bg-[#141820] text-[#6B7280] hover:text-[#F0F2F5]'}`}>
            <Grid3X3 size={14} /> Tarjetas
          </button>
          <button onClick={() => setViewMode('table')} className={`flex items-center gap-1.5 px-3 py-2 text-xs font-medium transition-all ${viewMode === 'table' ? 'bg-[#FF6600] text-white' : 'bg-[#141820] text-[#6B7280] hover:text-[#F0F2F5]'}`}>
            <List size={14} /> Tabla
          </button>
        </div>
        <ExportButton data={filtered as unknown as Record<string, unknown>[]} filename="proveedores_torquetools" targetTable="tt_suppliers" columns={[
          { key: 'name', label: 'Nombre' }, { key: 'legal_name', label: 'Razon Social' }, { key: 'tax_id', label: 'CIF/NIF' },
          { key: 'email', label: 'Email' }, { key: 'phone', label: 'Telefono' }, { key: 'country', label: 'Pais' },
          { key: 'city', label: 'Ciudad' }, { key: 'category', label: 'Categoria' }, { key: 'payment_terms', label: 'Condiciones Pago' },
        ]} />
        <ImportButton
          targetTable="tt_suppliers"
          fields={[
            { key: 'name', label: 'Nombre', required: true },
            { key: 'legal_name', label: 'Razon social' },
            { key: 'reference', label: 'Referencia' },
            { key: 'tax_id', label: 'CIF/CUIT' },
            { key: 'email', label: 'Email' },
            { key: 'phone', label: 'Telefono' },
            { key: 'address', label: 'Direccion' },
            { key: 'city', label: 'Ciudad' },
            { key: 'state', label: 'Provincia' },
            { key: 'postal_code', label: 'Codigo postal' },
            { key: 'country', label: 'Pais' },
            { key: 'category', label: 'Categoria' },
            { key: 'payment_terms', label: 'Condiciones pago' },
            { key: 'notes', label: 'Observaciones' },
            { key: 'active', label: 'Activa', type: 'boolean' },
          ]}
          permission="manage_suppliers"
        />
        <Button variant="primary" onClick={() => setShowNew(true)}><Plus size={16} /> Nuevo Proveedor</Button>
      </div>
      <div className="flex flex-col sm:flex-row gap-3">
        <SearchBar placeholder="Buscar proveedor, CIF, email..." value={search} onChange={setSearch} className="flex-1 max-w-lg" />
        <div className="flex gap-2 flex-wrap">
          <button onClick={() => setFilterCountry('')} className={`px-3 py-2 rounded-lg text-xs font-medium transition-all ${!filterCountry ? 'bg-[#FF6600] text-white' : 'bg-[#1E2330] text-[#9CA3AF] hover:bg-[#2A3040]'}`}>Todos</button>
          {countries.slice(0, 8).map((country) => (
            <button key={country} onClick={() => setFilterCountry(filterCountry === country ? '' : country)} className={`px-3 py-2 rounded-lg text-xs font-medium transition-all ${filterCountry === country ? 'bg-[#FF6600] text-white' : 'bg-[#1E2330] text-[#9CA3AF] hover:bg-[#2A3040]'}`}>
              {countryFlags[country] || ''} {country}
            </button>
          ))}
        </div>
      </div>
      {loading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="rounded-xl bg-[#141820] border border-[#1E2330] p-5 animate-pulse">
              <div className="h-5 bg-[#1E2330] rounded w-40 mb-3" /><div className="h-3 bg-[#1E2330] rounded w-full mb-2" /><div className="h-3 bg-[#1E2330] rounded w-2/3" />
            </div>
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 text-[#4B5563]">
          <Building2 size={48} className="mb-4" /><p className="text-lg font-medium">No se encontraron proveedores</p>
          <p className="text-sm mt-1">Proba con otros filtros o terminos de busqueda</p>
        </div>
      ) : viewMode === 'table' ? (
        <DataTable
          data={supplierTableRows}
          columns={supplierColumns}
          loading={loading}
          pageSize={50}
          showTotals
          totalLabel="proveedores"
          onRowClick={(row) => {
            const sup = filtered.find(s => s.id === (row.id as string))
            if (sup) setSelectedSupplier(sup)
          }}
          exportFilename="proveedores_torquetools"
          exportTargetTable="tt_suppliers"
        />
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {filtered.map((supplier) => (
            <Card key={supplier.id} hover onClick={() => setSelectedSupplier(supplier)}>
              <div className="flex items-start justify-between mb-3">
                <div className="flex items-center gap-3 min-w-0 flex-1">
                  <div className="w-11 h-11 rounded-xl bg-[#F59E0B]/15 flex items-center justify-center text-sm font-bold text-[#F59E0B] shrink-0">
                    {getInitials(supplier.legal_name || supplier.name)}
                  </div>
                  <div className="min-w-0">
                    <h3 className="text-sm font-bold text-[#F0F2F5] truncate">{supplier.name}</h3>
                    {supplier.tax_id && <p className="text-xs font-mono text-[#6B7280] truncate">{supplier.tax_id}</p>}
                  </div>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <span className="text-lg">{countryFlags[supplier.country || ''] || ''}</span>
                  <ChevronRight size={14} className="text-[#4B5563]" />
                </div>
              </div>
              <div className="flex flex-wrap gap-1.5 mb-3">
                {supplier.email && <span className="text-xs text-[#9CA3AF] flex items-center gap-1"><Mail size={10} /><span className="truncate max-w-[140px]">{supplier.email}</span></span>}
                {supplier.phone && <span className="text-xs text-[#9CA3AF] flex items-center gap-1"><Phone size={10} />{supplier.phone}</span>}
              </div>
              <div className="pt-3 border-t border-[#1E2330] flex items-center justify-between">
                <div className="flex gap-1.5 flex-wrap">
                  {supplier.category && <Badge variant="info" size="sm">{supplier.category}</Badge>}
                  {supplier.payment_terms && <Badge variant="default" size="sm">{supplier.payment_terms}</Badge>}
                </div>
                {supplier.ai_score !== null && supplier.ai_score !== undefined && (
                  <Badge
                    variant={supplier.ai_score >= 80 ? 'success' : supplier.ai_score >= 50 ? 'warning' : 'danger'}
                    size="sm"
                  >
                    <Brain size={9} className="mr-0.5 inline" />
                    {supplier.ai_score}
                  </Badge>
                )}
              </div>
            </Card>
          ))}
        </div>
      )}
      <Modal isOpen={showNew} onClose={() => setShowNew(false)} title="Nuevo Proveedor" size="xl">
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <Input label="Nombre comercial *" value={newSupplier.name} onChange={(e) => setNewSupplier({ ...newSupplier, name: e.target.value })} />
            <Input label="Razon social" value={newSupplier.legal_name} onChange={(e) => setNewSupplier({ ...newSupplier, legal_name: e.target.value })} />
          </div>
          <div className="grid grid-cols-3 gap-4">
            <Input label="CIF / NIF" value={newSupplier.tax_id} onChange={(e) => setNewSupplier({ ...newSupplier, tax_id: e.target.value })} />
            <Select label="Categoria" value={newSupplier.category} onChange={(e) => setNewSupplier({ ...newSupplier, category: e.target.value })} options={[{ value: '', label: 'Sin categoria' }, { value: 'fabricante', label: 'Fabricante' }, { value: 'distribuidor', label: 'Distribuidor' }, { value: 'transporte', label: 'Transporte' }, { value: 'servicios', label: 'Servicios' }]} />
            <Select label="Pais" value={newSupplier.country} onChange={(e) => setNewSupplier({ ...newSupplier, country: e.target.value })} options={Object.entries(countryNames).map(([k, v]) => ({ value: k, label: v }))} />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <Input label="Email" type="email" value={newSupplier.email} onChange={(e) => setNewSupplier({ ...newSupplier, email: e.target.value })} />
            <Input label="Telefono" value={newSupplier.phone} onChange={(e) => setNewSupplier({ ...newSupplier, phone: e.target.value })} />
          </div>
          <Input label="Direccion" value={newSupplier.address} onChange={(e) => setNewSupplier({ ...newSupplier, address: e.target.value })} />
          <div className="grid grid-cols-2 gap-4">
            <Input label="Ciudad" value={newSupplier.city} onChange={(e) => setNewSupplier({ ...newSupplier, city: e.target.value })} />
            <Input label="Condiciones de pago" value={newSupplier.payment_terms} onChange={(e) => setNewSupplier({ ...newSupplier, payment_terms: e.target.value })} />
          </div>
          <Input label="Notas" value={newSupplier.notes} onChange={(e) => setNewSupplier({ ...newSupplier, notes: e.target.value })} />
          <div className="flex justify-end gap-3 pt-4 border-t border-[#1E2330]">
            <Button variant="secondary" onClick={() => setShowNew(false)}>Cancelar</Button>
            <Button onClick={createNewSupplier} loading={savingNew}>Crear Proveedor</Button>
          </div>
        </div>
      </Modal>
    </div>
  )
}

// ===============================================================
// PEDIDOS COMPRA TAB
// ===============================================================

// ===============================================================
// RECEPCIONES TAB
// ===============================================================

// ===============================================================
// FACTURAS COMPRA TAB (ENHANCED)
// ===============================================================

// ===============================================================
// PAGOS TAB (NEW)
// ===============================================================

// ===============================================================
// CALENDARIO DE PAGOS TAB (NEW)
// ===============================================================

// ===============================================================
// ABONOS TAB (Purchase Credit Notes)
// ===============================================================
const CN_STATUS: Record<string, { label: string; variant: 'default' | 'success' | 'warning' | 'danger' | 'info' | 'orange' }> = {
  pending: { label: 'Pendiente', variant: 'warning' },
  applied: { label: 'Aplicado', variant: 'success' },
  rejected: { label: 'Rechazado', variant: 'danger' },
}

async function generateCNNumber(companyId?: string | null): Promise<string> {
  return generateDocNumber('AB', companyId ?? null)
}


// ===============================================================
// INTERCOMPANY TAB
// ===============================================================
function IntercompanyTab() {
  const router = useRouter()
  const [relations, setRelations] = useState<Row[]>([])
  const [documents, setDocuments] = useState<{ purchaseOrders: Row[]; salesOrders: Row[] }>({ purchaseOrders: [], salesOrders: [] })
  const [loading, setLoading] = useState(true)
  const [showNewOrder, setShowNewOrder] = useState(false)
  const [sellers, setSellers] = useState<Row[]>([])
  const [selectedSeller, setSelectedSeller] = useState('')
  const [icItems, setIcItems] = useState<{ description: string; quantity: number; unit_price: number; sku: string }[]>([])
  const [icNotes, setIcNotes] = useState('')
  const [creating, setCreating] = useState(false)
  const { addToast } = useToast()

  const fetchData = useCallback(async () => {
    setLoading(true)
    try {
      const supabase = createClient()

      // Get all intercompany relations
      const { data: rels } = await supabase
        .from('tt_intercompany_relations')
        .select(`
          *,
          buyer_company:tt_companies!buyer_company_id(id, name, country, currency),
          seller_company:tt_companies!seller_company_id(id, name, country, currency)
        `)
        .eq('active', true)

      setRelations(rels || [])

      // Get intercompany document links
      const { data: links } = await supabase
        .from('tt_document_relations')
        .select('*')
        .eq('relation_type', 'intercompany')
        .order('created_at', { ascending: false })
        .limit(50)

      if (links && links.length > 0) {
        const poIds = links.filter((l: Row) => l.source_type === 'purchase_order').map((l: Row) => l.source_id as string)
        const soIds = links.filter((l: Row) => l.target_type === 'sales_order').map((l: Row) => l.target_id as string)

        const [posRes, sosRes] = await Promise.all([
          poIds.length > 0
            ? supabase.from('tt_purchase_orders').select('*').in('id', poIds).order('created_at', { ascending: false })
            : Promise.resolve({ data: [] }),
          soIds.length > 0
            ? supabase.from('tt_sales_orders').select('*').in('id', soIds).order('created_at', { ascending: false })
            : Promise.resolve({ data: [] }),
        ])

        setDocuments({
          purchaseOrders: posRes.data || [],
          salesOrders: sosRes.data || [],
        })
      }
    } catch {
      // Silent
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchData()
  }, [fetchData])

  // Fetch available sellers when opening new order form
  const handleNewOrder = async () => {
    setShowNewOrder(true)
    try {
      const supabase = createClient()
      const { data } = await supabase
        .from('tt_intercompany_relations')
        .select(`
          *,
          seller_company:tt_companies!seller_company_id(id, name, country, currency)
        `)
        .eq('active', true)

      setSellers(data || [])
      setIcItems([{ description: '', quantity: 1, unit_price: 0, sku: '' }])
    } catch {
      // Silent
    }
  }

  const addItem = () => {
    setIcItems(prev => [...prev, { description: '', quantity: 1, unit_price: 0, sku: '' }])
  }

  const removeItem = (idx: number) => {
    setIcItems(prev => prev.filter((_, i) => i !== idx))
  }

  const updateItem = (idx: number, field: string, value: string | number) => {
    setIcItems(prev => prev.map((item, i) => i === idx ? { ...item, [field]: value } : item))
  }

  const handleCreateOrder = async () => {
    if (!selectedSeller || icItems.length === 0 || icItems.some(i => !i.description)) {
      addToast({ title: 'Completa todos los campos', type: 'warning' })
      return
    }

    setCreating(true)
    try {
      const { createIntercompanyPurchase } = await import('@/lib/intercompany')

      // For now, use the first buyer relation
      const sellerRel = sellers.find((s: Row) => (s.seller_company as Row)?.id === selectedSeller)
      if (!sellerRel) throw new Error('Relacion no encontrada')

      const result = await createIntercompanyPurchase(
        sellerRel.buyer_company_id as string,
        selectedSeller,
        icItems.map(i => ({
          product_id: null,
          sku: i.sku || null,
          description: i.description,
          quantity: i.quantity,
          unit_price: i.unit_price,
        })),
        icNotes
      )

      addToast({ title: `OC ${result.purchaseOrderNumber} y Pedido ${result.salesOrderNumber} creados`, type: 'success' })
      setShowNewOrder(false)
      setSelectedSeller('')
      setIcItems([])
      setIcNotes('')
      fetchData()
    } catch (err) {
      addToast({ title: `Error: ${err instanceof Error ? err.message : 'Error desconocido'}`, type: 'error' })
    } finally {
      setCreating(false)
    }
  }

  const COUNTRY_FLAGS: Record<string, string> = { ES: '\u{1F1EA}\u{1F1F8}', US: '\u{1F1FA}\u{1F1F8}', AR: '\u{1F1E6}\u{1F1F7}' }
  const getFlag = (code: string) => COUNTRY_FLAGS[code] || '\u{1F3F3}\u{FE0F}'

  if (loading) {
    return (
      <div className="flex justify-center py-20">
        <Loader2 className="animate-spin text-[#FF6600]" size={32} />
      </div>
    )
  }

  const icTotal = icItems.reduce((sum, i) => sum + i.quantity * i.unit_price, 0)
  const sellerInfo = sellers.find((s: Row) => (s.seller_company as Row)?.id === selectedSeller)
  const sellerCurrency = sellerInfo ? (sellerInfo.default_currency as string) || ((sellerInfo.seller_company as Row)?.currency as string) || 'EUR' : 'EUR'

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-lg bg-violet-500/10 flex items-center justify-center">
            <ArrowRightLeft size={20} className="text-violet-400" />
          </div>
          <div>
            <h2 className="text-lg font-bold text-[#F0F2F5]">Operaciones Intercompany</h2>
            <p className="text-xs text-[#6B7280]">Compras y ventas entre empresas del grupo</p>
          </div>
        </div>
        <Button onClick={handleNewOrder} className="gap-2">
          <Plus size={16} />
          Nueva OC Intercompany
        </Button>
      </div>

      {/* Relations overview */}
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
        {relations.map((rel: Row) => {
          const buyer = rel.buyer_company as Row
          const seller = rel.seller_company as Row
          return (
            <Card key={rel.id as string} className="p-4">
              <div className="flex items-center gap-3 mb-3">
                <span className="text-lg">{getFlag(buyer?.country as string)}</span>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-[#F0F2F5] truncate">{buyer?.name as string}</p>
                  <p className="text-[10px] text-[#6B7280]">Comprador</p>
                </div>
                <ArrowRightLeft size={16} className="text-violet-400 shrink-0" />
                <div className="flex-1 min-w-0 text-right">
                  <p className="text-sm font-medium text-[#F0F2F5] truncate">{seller?.name as string}</p>
                  <p className="text-[10px] text-[#6B7280]">Vendedor</p>
                </div>
                <span className="text-lg">{getFlag(seller?.country as string)}</span>
              </div>
              <div className="flex items-center gap-2">
                <Badge variant="info">{rel.default_currency as string}</Badge>
                <Badge variant="default">{rel.default_incoterm as string}</Badge>
                <span className="ml-auto px-2 py-0.5 text-[9px] font-medium rounded-full bg-violet-500/15 text-violet-400 border border-violet-500/25">
                  Intercompany
                </span>
              </div>
            </Card>
          )
        })}
      </div>

      {/* Documents history */}
      {(documents.purchaseOrders.length > 0 || documents.salesOrders.length > 0) && (
        <Card className="p-0">
          <div className="px-4 py-3 border-b border-[#1E2330]">
            <h3 className="text-sm font-semibold text-[#F0F2F5]">Historial de documentos intercompany</h3>
          </div>
          <div className="divide-y divide-[#1E2330]">
            {documents.purchaseOrders.map((po: Row) => (
              <div
                key={po.id as string}
                onClick={() => router.push(`/documentos/${po.id as string}`)}
                className="px-4 py-3 flex items-center gap-4 hover:bg-[#141820] transition-colors cursor-pointer"
              >
                <div className="w-8 h-8 rounded-lg bg-blue-500/10 flex items-center justify-center">
                  <ShoppingCart size={14} className="text-blue-400" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <p className="text-sm font-medium text-[#F0F2F5]">{po.po_number as string}</p>
                    <span className="px-2 py-0.5 text-[9px] font-medium rounded-full bg-violet-500/15 text-violet-400 border border-violet-500/25">
                      IC-Compra
                    </span>
                  </div>
                  <p className="text-xs text-[#6B7280]">{getSupplierName(po as Row)}</p>
                </div>
                <div className="text-right">
                  <p className="text-sm font-bold text-[#F0F2F5]">
                    {formatCurrency(po.total as number, (po.currency as string) as 'EUR' | 'USD' | 'ARS')}
                  </p>
                  <p className="text-[10px] text-[#6B7280]">{formatDate(po.created_at as string)}</p>
                </div>
                <Badge variant={PO_STATUS[po.status as string]?.variant || 'default'}>
                  {PO_STATUS[po.status as string]?.label || (po.status as string)}
                </Badge>
              </div>
            ))}
            {documents.salesOrders.map((so: Row) => (
              <div
                key={so.id as string}
                onClick={() => router.push(`/documentos/${so.id as string}`)}
                className="px-4 py-3 flex items-center gap-4 hover:bg-[#141820] transition-colors cursor-pointer"
              >
                <div className="w-8 h-8 rounded-lg bg-emerald-500/10 flex items-center justify-center">
                  <FileText size={14} className="text-emerald-400" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <p className="text-sm font-medium text-[#F0F2F5]">{so.so_number as string}</p>
                    <span className="px-2 py-0.5 text-[9px] font-medium rounded-full bg-violet-500/15 text-violet-400 border border-violet-500/25">
                      IC-Venta
                    </span>
                  </div>
                </div>
                <div className="text-right">
                  <p className="text-sm font-bold text-[#F0F2F5]">
                    {formatCurrency(so.total as number, (so.currency as string) as 'EUR' | 'USD' | 'ARS')}
                  </p>
                  <p className="text-[10px] text-[#6B7280]">{formatDate(so.created_at as string)}</p>
                </div>
              </div>
            ))}
          </div>
        </Card>
      )}

      {documents.purchaseOrders.length === 0 && documents.salesOrders.length === 0 && (
        <Card className="p-10 text-center">
          <Layers size={40} className="text-[#2A3040] mx-auto mb-3" />
          <p className="text-sm text-[#6B7280]">No hay documentos intercompany todavia</p>
          <p className="text-xs text-[#4A5060] mt-1">Crea una OC intercompany para empezar</p>
        </Card>
      )}

      {/* New Intercompany Order Modal */}
      <Modal
        isOpen={showNewOrder}
        onClose={() => setShowNewOrder(false)}
        title="Nueva OC Intercompany"
        size="lg"
      >
        <div className="space-y-4">
          {/* Seller selection */}
          <div>
            <label className="text-xs text-[#6B7280] mb-1 block">Empresa vendedora</label>
            <select
              value={selectedSeller}
              onChange={(e) => setSelectedSeller(e.target.value)}
              className="w-full px-3 py-2 bg-[#0F1218] border border-[#1E2330] rounded-lg text-sm text-[#F0F2F5] focus:border-[#FF6600] focus:outline-none"
            >
              <option value="">Seleccionar empresa...</option>
              {sellers.map((s: Row) => {
                const comp = s.seller_company as Row
                return (
                  <option key={comp?.id as string} value={comp?.id as string}>
                    {getFlag(comp?.country as string)} {comp?.name as string} ({s.default_currency as string})
                  </option>
                )
              })}
            </select>
          </div>

          {/* Items */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="text-xs text-[#6B7280]">Productos / Items</label>
              <button onClick={addItem} className="text-xs text-[#FF6600] hover:text-[#FF8800]">
                + Agregar item
              </button>
            </div>
            <div className="space-y-2">
              {icItems.map((item, idx) => (
                <div key={idx} className="flex gap-2 items-start">
                  <Input
                    placeholder="SKU"
                    value={item.sku}
                    onChange={(e) => updateItem(idx, 'sku', e.target.value)}
                    className="w-24"
                  />
                  <Input
                    placeholder="Descripcion"
                    value={item.description}
                    onChange={(e) => updateItem(idx, 'description', e.target.value)}
                    className="flex-1"
                  />
                  <Input
                    type="number"
                    placeholder="Cant."
                    value={item.quantity || ''}
                    onChange={(e) => updateItem(idx, 'quantity', Number(e.target.value))}
                    className="w-20"
                  />
                  <Input
                    type="number"
                    placeholder="Precio"
                    value={item.unit_price || ''}
                    onChange={(e) => updateItem(idx, 'unit_price', Number(e.target.value))}
                    className="w-28"
                  />
                  {icItems.length > 1 && (
                    <button onClick={() => removeItem(idx)} className="p-2 text-[#6B7280] hover:text-red-400">
                      <X size={14} />
                    </button>
                  )}
                </div>
              ))}
            </div>
          </div>

          {/* Total */}
          {icTotal > 0 && (
            <div className="flex justify-end">
              <div className="bg-[#141820] px-4 py-2 rounded-lg border border-[#1E2330]">
                <span className="text-xs text-[#6B7280] mr-3">Total:</span>
                <span className="text-lg font-bold text-[#FF6600]">
                  {formatCurrency(icTotal, sellerCurrency as 'EUR' | 'USD' | 'ARS')}
                </span>
              </div>
            </div>
          )}

          {/* Notes */}
          <div>
            <label className="text-xs text-[#6B7280] mb-1 block">Notas</label>
            <textarea
              value={icNotes}
              onChange={(e) => setIcNotes(e.target.value)}
              rows={2}
              className="w-full px-3 py-2 bg-[#0F1218] border border-[#1E2330] rounded-lg text-sm text-[#F0F2F5] focus:border-[#FF6600] focus:outline-none resize-none"
              placeholder="Notas adicionales..."
            />
          </div>

          {/* Info */}
          <div className="flex items-start gap-2 p-3 rounded-lg bg-violet-500/5 border border-violet-500/15">
            <ArrowRightLeft size={14} className="text-violet-400 mt-0.5 shrink-0" />
            <p className="text-xs text-violet-300/80">
              Al crear esta OC intercompany, se genera automaticamente un pedido de venta espejo
              en la empresa vendedora. Ambos documentos quedan vinculados.
            </p>
          </div>

          {/* Actions */}
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="ghost" onClick={() => setShowNewOrder(false)}>
              Cancelar
            </Button>
            <Button onClick={handleCreateOrder} disabled={creating || !selectedSeller}>
              {creating ? (
                <>
                  <Loader2 size={14} className="animate-spin mr-2" />
                  Creando...
                </>
              ) : (
                <>
                  <ArrowRightLeft size={14} className="mr-2" />
                  Crear OC Intercompany
                </>
              )}
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  )
}

// ===============================================================
// OFERTAS PROVEEDOR TAB
// ===============================================================
type SupplierOffer = {
  id: string
  number: string
  supplier_id: string | null
  supplier_name?: string
  offer_date: string | null
  valid_until: string | null
  total: number | null
  currency: string | null
  status: string
  items_count?: number
  new_products_count?: number
  pdf_url?: string | null
  notes?: string | null
  created_at: string
  supplier?: { id: string; name: string; legal_name: string | null } | null
}

type ParsedOfferItem = {
  sku?: string
  name: string
  brand?: string
  qty?: number
  unit_price: number
  currency?: string
  // populated by matching
  product_id?: string | null
  matched_sku?: string | null
  matched_name?: string | null
  current_cost?: number | null
  variation_pct?: number | null
  is_new?: boolean
  // user choices
  update_cost?: boolean
}

type ParsedOfferPreview = {
  supplier_name?: string
  supplier_id?: string | null
  offer_number?: string
  offer_date?: string
  valid_until?: string
  currency?: string
  total?: number
  notes?: string
  items: ParsedOfferItem[]
}

type ExcelPreview = {
  detected_columns: { sku?: string; name?: string; price?: string; cost?: string; currency?: string }
  rows_count: number
  sample: Record<string, unknown>[]
  raw_rows?: Record<string, unknown>[]
}

const OFFER_STATUS: Record<string, { label: string; variant: 'default' | 'success' | 'warning' | 'danger' | 'info' | 'orange' }> = {
  pending: { label: 'Pendiente revision', variant: 'warning' },
  reviewing: { label: 'En revision', variant: 'info' },
  accepted: { label: 'Aceptada', variant: 'success' },
  rejected: { label: 'Rechazada', variant: 'danger' },
  expired: { label: 'Expirada', variant: 'default' },
  draft: { label: 'Borrador', variant: 'default' },
}

function variationColor(pct: number | null | undefined): string {
  if (pct == null || isNaN(pct)) return '#9CA3AF'
  const abs = Math.abs(pct)
  if (abs > 10) return '#EF4444'
  if (abs >= 5) return '#F59E0B'
  return '#10B981'
}

function variationBgClass(pct: number | null | undefined): string {
  if (pct == null || isNaN(pct)) return 'bg-[#0F1218]'
  const abs = Math.abs(pct)
  if (abs > 10) return 'bg-red-500/10 border-red-500/20'
  if (abs >= 5) return 'bg-amber-500/10 border-amber-500/20'
  return 'bg-[#0F1218]'
}

function OfertasTab() {
  const [offers, setOffers] = useState<SupplierOffer[]>([])
  const [loading, setLoading] = useState(true)
  const [showPdfModal, setShowPdfModal] = useState(false)
  const [showExcelModal, setShowExcelModal] = useState(false)
  const [selectedOffer, setSelectedOffer] = useState<SupplierOffer | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    const sb = createClient()
    const { data, error } = await sb
      .from('tt_supplier_offers')
      .select('*, supplier:tt_suppliers(id, name, legal_name)')
      .order('created_at', { ascending: false })
      .limit(200)
    if (error) {
      // Tabla puede no existir aun; no romper UI
      setOffers([])
    } else {
      setOffers((data || []) as SupplierOffer[])
    }
    setLoading(false)
  }, [])

  useEffect(() => { load() }, [load])

  // KPIs
  const pendingReview = useMemo(() => offers.filter(o => o.status === 'pending' || o.status === 'reviewing').length, [offers])
  const accepted = useMemo(() => offers.filter(o => o.status === 'accepted').length, [offers])
  const newProductsPending = useMemo(
    () => offers.reduce((s, o) => s + ((o.status === 'pending' || o.status === 'reviewing') ? (o.new_products_count || 0) : 0), 0),
    [offers]
  )

  const tableRows = useMemo(() => offers.map(o => {
    const sName = o.supplier?.legal_name || o.supplier?.name || o.supplier_name || 'Sin proveedor'
    return {
      id: o.id,
      numero: o.number || '-',
      proveedor: sName,
      fecha: o.offer_date || o.created_at,
      valido_hasta: o.valid_until || '',
      total: o.total || 0,
      moneda: o.currency || 'EUR',
      estado: OFFER_STATUS[o.status]?.label || o.status,
      _raw: o,
    } as Record<string, unknown>
  }), [offers])

  const cols: DataTableColumn[] = [
    { key: 'numero', label: 'Numero', sortable: true, searchable: true, width: '140px' },
    { key: 'proveedor', label: 'Proveedor', sortable: true, searchable: true },
    { key: 'fecha', label: 'Fecha', sortable: true, type: 'date', width: '110px' },
    { key: 'valido_hasta', label: 'Valido hasta', sortable: true, type: 'date', width: '120px' },
    { key: 'total', label: 'Total', sortable: true, type: 'currency', width: '130px' },
    { key: 'estado', label: 'Estado', sortable: true, type: 'status', width: '150px' },
  ]

  return (
    <div className="space-y-4">
      {/* KPIs */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <KPICard
          label="Pendientes de revisar"
          value={pendingReview}
          icon={<Clock size={22} />}
          color="#F59E0B"
        />
        <KPICard
          label="Ofertas aceptadas"
          value={accepted}
          icon={<CheckCircle size={22} />}
          color="#10B981"
        />
        <KPICard
          label="Productos nuevos a aprobar"
          value={newProductsPending}
          icon={<Package size={22} />}
          color="#FF6600"
        />
      </div>

      {/* Toolbar */}
      <div className="flex flex-wrap gap-2 justify-end">
        <Button variant="secondary" onClick={() => setShowExcelModal(true)}>
          <FileSpreadsheet size={14} /> Actualizar precios Excel
        </Button>
        <Button variant="primary" onClick={() => setShowPdfModal(true)}>
          <Upload size={14} /> Subir oferta PDF
        </Button>
      </div>

      {/* Table */}
      <DataTable
        data={tableRows}
        columns={cols}
        loading={loading}
        totalLabel="ofertas"
        showTotals
        exportFilename="ofertas_proveedor"
        pageSize={25}
        onRowClick={(row) => setSelectedOffer((row._raw as SupplierOffer) || null)}
      />

      {/* Modals */}
      <SubirOfertaPdfModal isOpen={showPdfModal} onClose={() => { setShowPdfModal(false); load() }} />
      <ActualizarPreciosExcelModal isOpen={showExcelModal} onClose={() => { setShowExcelModal(false); load() }} />

      {/* Detalle de oferta (mínimo) */}
      <Modal
        isOpen={!!selectedOffer}
        onClose={() => setSelectedOffer(null)}
        title={selectedOffer ? `Oferta ${selectedOffer.number || ''}` : 'Oferta'}
        size="md"
      >
        {selectedOffer && (
          <div className="space-y-3 text-sm">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <p className="text-xs text-[#6B7280]">Proveedor</p>
                <p className="text-[#F0F2F5]">{selectedOffer.supplier?.legal_name || selectedOffer.supplier?.name || selectedOffer.supplier_name || '-'}</p>
              </div>
              <div>
                <p className="text-xs text-[#6B7280]">Estado</p>
                <p className="text-[#F0F2F5]">{OFFER_STATUS[selectedOffer.status]?.label || selectedOffer.status}</p>
              </div>
              <div>
                <p className="text-xs text-[#6B7280]">Fecha</p>
                <p className="text-[#F0F2F5]">{selectedOffer.offer_date ? formatDate(selectedOffer.offer_date) : '-'}</p>
              </div>
              <div>
                <p className="text-xs text-[#6B7280]">Válido hasta</p>
                <p className="text-[#F0F2F5]">{selectedOffer.valid_until ? formatDate(selectedOffer.valid_until) : '-'}</p>
              </div>
              <div>
                <p className="text-xs text-[#6B7280]">Total</p>
                <p className="text-[#F0F2F5]">{formatCurrency(selectedOffer.total || 0, (selectedOffer.currency || 'EUR') as 'EUR' | 'USD' | 'ARS')}</p>
              </div>
              <div>
                <p className="text-xs text-[#6B7280]">Productos nuevos</p>
                <p className="text-[#F0F2F5]">{selectedOffer.new_products_count || 0}</p>
              </div>
            </div>
            {selectedOffer.notes && (
              <div>
                <p className="text-xs text-[#6B7280] mb-1">Notas</p>
                <p className="text-[#D1D5DB] whitespace-pre-wrap">{selectedOffer.notes}</p>
              </div>
            )}
            <div className="flex justify-end pt-2">
              <Button variant="secondary" size="sm" onClick={() => setSelectedOffer(null)}>Cerrar</Button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  )
}

// ===============================================================
// MODAL: Subir Oferta PDF
// ===============================================================
function SubirOfertaPdfModal({ isOpen, onClose }: { isOpen: boolean; onClose: () => void }) {
  const { addToast } = useToast()
  const fileRef = useRef<HTMLInputElement>(null)
  const [parsing, setParsing] = useState(false)
  const [saving, setSaving] = useState(false)
  const [preview, setPreview] = useState<ParsedOfferPreview | null>(null)
  const [statusMsg, setStatusMsg] = useState('')
  const [pdfFile, setPdfFile] = useState<File | null>(null)

  function reset() {
    setPreview(null)
    setPdfFile(null)
    setStatusMsg('')
    setParsing(false)
    setSaving(false)
  }

  function handleClose() {
    reset()
    onClose()
  }

  async function handleFile(file: File) {
    if (file.type !== 'application/pdf') {
      addToast({ type: 'error', title: 'Solo PDF', message: 'Tenes que subir un archivo PDF.' })
      return
    }
    setPdfFile(file)
    setParsing(true)
    setStatusMsg('Analizando PDF con IA...')
    try {
      const fd = new FormData()
      fd.append('file', file)
      const res = await fetch('/api/supplier-offers/parse-pdf', { method: 'POST', body: fd })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error || 'Error parseando PDF')
      const items: ParsedOfferItem[] = (json.items || []).map((it: ParsedOfferItem) => ({
        ...it,
        update_cost: !it.is_new, // por defecto checked si esta matcheado
      }))
      setPreview({
        supplier_name: json.supplier_name,
        supplier_id: json.supplier_id || null,
        offer_number: json.offer_number,
        offer_date: json.offer_date,
        valid_until: json.valid_until,
        currency: json.currency || 'EUR',
        total: json.total || items.reduce((s, i) => s + (i.unit_price * (i.qty || 1)), 0),
        notes: json.notes,
        items,
      })
      setStatusMsg(`Oferta parseada: ${items.length} items detectados`)
    } catch (err) {
      setStatusMsg('Error: ' + (err as Error).message)
      addToast({ type: 'error', title: 'Error parseando', message: (err as Error).message })
    } finally {
      setParsing(false)
    }
  }

  function toggleUpdateCost(idx: number) {
    setPreview(prev => {
      if (!prev) return prev
      const items = prev.items.slice()
      items[idx] = { ...items[idx], update_cost: !items[idx].update_cost }
      return { ...prev, items }
    })
  }

  async function handleSave() {
    if (!preview) return
    setSaving(true)
    try {
      const fd = new FormData()
      if (pdfFile) fd.append('file', pdfFile)
      fd.append('payload', JSON.stringify(preview))
      const res = await fetch('/api/supplier-offers/save', { method: 'POST', body: fd })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error || 'Error guardando')
      addToast({
        type: 'success',
        title: 'Oferta guardada',
        message: `${json.items_saved || preview.items.length} items procesados${json.costs_updated ? `, ${json.costs_updated} costos actualizados` : ''}`,
      })
      handleClose()
    } catch (err) {
      addToast({ type: 'error', title: 'Error', message: (err as Error).message })
    } finally {
      setSaving(false)
    }
  }

  const matchedCount = preview?.items.filter(i => !i.is_new).length || 0
  const newCount = preview?.items.filter(i => i.is_new).length || 0
  const significantChanges = preview?.items.filter(i => Math.abs(i.variation_pct || 0) > 10).length || 0

  return (
    <Modal isOpen={isOpen} onClose={handleClose} title="Subir oferta PDF" size="full">
      <div className="space-y-4">
        <input
          ref={fileRef}
          type="file"
          accept="application/pdf"
          className="hidden"
          onChange={(e) => { const f = e.target.files?.[0]; if (f) void handleFile(f) }}
        />

        {!preview && (
          <>
            <div
              className="border-2 border-dashed rounded-xl p-10 text-center cursor-pointer hover:bg-[#1E2330] transition-colors"
              style={{ borderColor: '#2A3040' }}
              onClick={() => !parsing && fileRef.current?.click()}
              onDragOver={(e) => e.preventDefault()}
              onDrop={(e) => {
                e.preventDefault()
                if (parsing) return
                const f = e.dataTransfer.files?.[0]
                if (f) void handleFile(f)
              }}
            >
              {parsing ? (
                <Loader2 size={48} className="mx-auto mb-3 text-[#FF6600] animate-spin" />
              ) : (
                <FileText size={48} className="mx-auto mb-3 text-[#FF6600]" />
              )}
              <div className="text-base font-semibold text-[#F0F2F5] mb-2">
                {parsing ? 'Analizando oferta...' : 'Arrastra el PDF de la oferta o cliquea aca'}
              </div>
              <div className="text-xs text-[#6B7280]">
                La IA extrae proveedor, items, cantidades y precios y los compara contra el catalogo
              </div>
            </div>
            {statusMsg && (
              <div className="text-xs text-center text-[#9CA3AF]">{statusMsg}</div>
            )}
          </>
        )}

        {preview && (
          <div className="space-y-4">
            {/* Header info */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <div className="p-3 rounded-lg bg-[#0F1218] border border-[#1E2330]">
                <p className="text-[10px] uppercase text-[#6B7280] mb-1">Proveedor</p>
                <p className="text-sm font-semibold text-[#F0F2F5] truncate">{preview.supplier_name || '-'}</p>
              </div>
              <div className="p-3 rounded-lg bg-[#0F1218] border border-[#1E2330]">
                <p className="text-[10px] uppercase text-[#6B7280] mb-1">N de oferta</p>
                <p className="text-sm font-semibold text-[#F0F2F5]">{preview.offer_number || '-'}</p>
              </div>
              <div className="p-3 rounded-lg bg-[#0F1218] border border-[#1E2330]">
                <p className="text-[10px] uppercase text-[#6B7280] mb-1">Valido hasta</p>
                <p className="text-sm font-semibold text-[#F0F2F5]">{preview.valid_until || '-'}</p>
              </div>
              <div className="p-3 rounded-lg bg-[#0F1218] border border-[#1E2330]">
                <p className="text-[10px] uppercase text-[#6B7280] mb-1">Total</p>
                <p className="text-sm font-bold text-[#FF6600]">{formatCurrency(preview.total || 0, (preview.currency || 'EUR') as 'EUR' | 'USD' | 'ARS')}</p>
              </div>
            </div>

            {/* Summary chips */}
            <div className="flex flex-wrap items-center gap-2 text-xs">
              <Badge variant="info" size="md">{preview.items.length} items</Badge>
              <Badge variant="success" size="md">{matchedCount} matcheados</Badge>
              {newCount > 0 && <Badge variant="orange" size="md"><Plus size={10} className="mr-1 inline" />{newCount} nuevos</Badge>}
              {significantChanges > 0 && (
                <Badge variant="danger" size="md"><AlertCircle size={10} className="mr-1 inline" />{significantChanges} con variacion {'>'}10%</Badge>
              )}
            </div>

            {/* Items table */}
            <div className="border border-[#1E2330] rounded-xl overflow-hidden">
              <div className="overflow-x-auto max-h-[55vh] overflow-y-auto">
                <table className="w-full text-xs">
                  <thead className="bg-[#0A0D12] sticky top-0">
                    <tr className="text-left text-[#6B7280] uppercase">
                      <th className="px-3 py-2 font-semibold">SKU</th>
                      <th className="px-3 py-2 font-semibold">Producto</th>
                      <th className="px-3 py-2 font-semibold text-right">Cant.</th>
                      <th className="px-3 py-2 font-semibold text-right">Costo actual</th>
                      <th className="px-3 py-2 font-semibold text-right">Precio oferta</th>
                      <th className="px-3 py-2 font-semibold text-right">Variacion</th>
                      <th className="px-3 py-2 font-semibold text-center">Estado</th>
                      <th className="px-3 py-2 font-semibold text-center">Actualizar costo</th>
                    </tr>
                  </thead>
                  <tbody>
                    {preview.items.map((it, idx) => {
                      const rowBg = variationBgClass(it.variation_pct)
                      return (
                        <tr key={idx} className={`border-t border-[#1E2330] ${rowBg}`}>
                          <td className="px-3 py-2 font-mono text-[#9CA3AF]">{it.sku || it.matched_sku || '-'}</td>
                          <td className="px-3 py-2">
                            <div className="text-[#F0F2F5]">{it.name}</div>
                            {it.matched_name && it.matched_name !== it.name && (
                              <div className="text-[10px] text-[#6B7280]">Match: {it.matched_name}</div>
                            )}
                          </td>
                          <td className="px-3 py-2 text-right text-[#F0F2F5]">{it.qty ?? 1}</td>
                          <td className="px-3 py-2 text-right text-[#9CA3AF]">
                            {it.current_cost != null ? formatCurrency(it.current_cost, (preview.currency || 'EUR') as 'EUR' | 'USD' | 'ARS') : '-'}
                          </td>
                          <td className="px-3 py-2 text-right text-[#F0F2F5] font-semibold">
                            {formatCurrency(it.unit_price, (preview.currency || 'EUR') as 'EUR' | 'USD' | 'ARS')}
                          </td>
                          <td className="px-3 py-2 text-right">
                            {it.variation_pct != null && !isNaN(it.variation_pct) ? (
                              <span style={{ color: variationColor(it.variation_pct) }} className="font-semibold inline-flex items-center gap-1">
                                {it.variation_pct >= 0 ? <TrendingUp size={11} /> : <TrendingDown size={11} />}
                                {it.variation_pct >= 0 ? '+' : ''}{it.variation_pct.toFixed(1)}%
                              </span>
                            ) : (
                              <span className="text-[#4B5563]">-</span>
                            )}
                          </td>
                          <td className="px-3 py-2 text-center">
                            {it.is_new ? (
                              <Badge variant="orange" size="sm">Nuevo</Badge>
                            ) : (
                              <Badge variant="success" size="sm">Match</Badge>
                            )}
                          </td>
                          <td className="px-3 py-2 text-center">
                            <input
                              type="checkbox"
                              checked={!!it.update_cost}
                              disabled={it.is_new}
                              onChange={() => toggleUpdateCost(idx)}
                              className="w-4 h-4 rounded border-[#2A3040] bg-[#0F1218] text-[#FF6600] focus:ring-[#FF6600] focus:ring-offset-0 cursor-pointer"
                              title={it.is_new ? 'Producto nuevo: se creara' : 'Marcar para actualizar el costo del producto'}
                            />
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            </div>

            <div className="flex justify-end gap-3 pt-4 border-t border-[#1E2330]">
              <Button variant="secondary" onClick={() => reset()}>
                Otra oferta
              </Button>
              <Button variant="primary" onClick={handleSave} loading={saving}>
                <Save size={14} /> Confirmar y guardar
              </Button>
            </div>
          </div>
        )}
      </div>
    </Modal>
  )
}

// ===============================================================
// MODAL: Actualizar precios Excel
// ===============================================================
function ActualizarPreciosExcelModal({ isOpen, onClose }: { isOpen: boolean; onClose: () => void }) {
  const { addToast } = useToast()
  const fileRef = useRef<HTMLInputElement>(null)
  const [parsing, setParsing] = useState(false)
  const [applying, setApplying] = useState(false)
  const [preview, setPreview] = useState<ExcelPreview | null>(null)
  const [excelFile, setExcelFile] = useState<File | null>(null)
  const [suppliers, setSuppliers] = useState<Supplier[]>([])
  const [supplierId, setSupplierId] = useState('')
  const [result, setResult] = useState<{ updated: number; created: number; significant: number } | null>(null)

  const loadSuppliers = useCallback(async () => {
    const sb = createClient()
    const { data } = await sb.from('tt_suppliers').select('id, name, legal_name').eq('active', true).order('name')
    setSuppliers((data || []) as Supplier[])
  }, [])

  useEffect(() => {
    if (isOpen) loadSuppliers()
  }, [isOpen, loadSuppliers])

  function reset() {
    setPreview(null)
    setExcelFile(null)
    setSupplierId('')
    setResult(null)
    setParsing(false)
    setApplying(false)
  }

  function handleClose() {
    reset()
    onClose()
  }

  async function handleFile(file: File) {
    const validTypes = [
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'application/vnd.ms-excel',
      'text/csv',
    ]
    const validExt = /\.(xlsx|xls|csv)$/i.test(file.name)
    if (!validTypes.includes(file.type) && !validExt) {
      addToast({ type: 'error', title: 'Archivo invalido', message: 'Subi un .xlsx, .xls o .csv' })
      return
    }
    setExcelFile(file)
    setParsing(true)
    try {
      const fd = new FormData()
      fd.append('file', file)
      const res = await fetch('/api/supplier-offers/parse-excel', { method: 'POST', body: fd })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error || 'Error parseando Excel')
      setPreview({
        detected_columns: json.detected_columns || {},
        rows_count: json.rows_count || 0,
        sample: json.sample || [],
        raw_rows: json.rows || [],
      })
    } catch (err) {
      addToast({ type: 'error', title: 'Error', message: (err as Error).message })
    } finally {
      setParsing(false)
    }
  }

  async function handleApply() {
    if (!preview) return
    if (!supplierId) {
      addToast({ type: 'error', title: 'Seleccionar proveedor' })
      return
    }
    setApplying(true)
    try {
      const fd = new FormData()
      if (excelFile) fd.append('file', excelFile)
      fd.append('supplier_id', supplierId)
      fd.append('payload', JSON.stringify({ rows: preview.raw_rows, detected_columns: preview.detected_columns }))
      const res = await fetch('/api/supplier-offers/apply-excel-update', { method: 'POST', body: fd })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error || 'Error aplicando')
      setResult({
        updated: json.updated || 0,
        created: json.created || 0,
        significant: json.significant_changes || 0,
      })
      addToast({
        type: 'success',
        title: 'Actualizacion aplicada',
        message: `${json.updated || 0} productos actualizados, ${json.created || 0} nuevos`,
      })
    } catch (err) {
      addToast({ type: 'error', title: 'Error', message: (err as Error).message })
    } finally {
      setApplying(false)
    }
  }

  return (
    <Modal isOpen={isOpen} onClose={handleClose} title="Actualizar precios desde Excel" size="xl">
      <div className="space-y-4">
        <input
          ref={fileRef}
          type="file"
          accept=".xlsx,.xls,.csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-excel,text/csv"
          className="hidden"
          onChange={(e) => { const f = e.target.files?.[0]; if (f) void handleFile(f) }}
        />

        {!preview && !result && (
          <div
            className="border-2 border-dashed rounded-xl p-10 text-center cursor-pointer hover:bg-[#1E2330] transition-colors"
            style={{ borderColor: '#2A3040' }}
            onClick={() => !parsing && fileRef.current?.click()}
            onDragOver={(e) => e.preventDefault()}
            onDrop={(e) => {
              e.preventDefault()
              if (parsing) return
              const f = e.dataTransfer.files?.[0]
              if (f) void handleFile(f)
            }}
          >
            {parsing ? (
              <Loader2 size={48} className="mx-auto mb-3 text-[#FF6600] animate-spin" />
            ) : (
              <FileSpreadsheet size={48} className="mx-auto mb-3 text-emerald-400" />
            )}
            <div className="text-base font-semibold text-[#F0F2F5] mb-2">
              {parsing ? 'Procesando Excel...' : 'Arrastra el archivo Excel o cliquea aca'}
            </div>
            <div className="text-xs text-[#6B7280]">
              Formato: .xlsx, .xls o .csv. Detectamos columnas SKU, nombre, precio y costo automaticamente.
            </div>
          </div>
        )}

        {preview && !result && (
          <div className="space-y-4">
            {/* Detected columns */}
            <Card>
              <h3 className="text-sm font-semibold text-[#F0F2F5] mb-3">Columnas detectadas</h3>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs">
                <div className="p-2 rounded bg-[#0F1218] border border-[#1E2330]">
                  <span className="text-[#6B7280]">SKU: </span>
                  <span className="text-[#F0F2F5] font-mono">{preview.detected_columns.sku || 'No detectada'}</span>
                </div>
                <div className="p-2 rounded bg-[#0F1218] border border-[#1E2330]">
                  <span className="text-[#6B7280]">Nombre: </span>
                  <span className="text-[#F0F2F5] font-mono">{preview.detected_columns.name || 'No detectada'}</span>
                </div>
                <div className="p-2 rounded bg-[#0F1218] border border-[#1E2330]">
                  <span className="text-[#6B7280]">Precio: </span>
                  <span className="text-[#F0F2F5] font-mono">{preview.detected_columns.price || 'No detectada'}</span>
                </div>
                <div className="p-2 rounded bg-[#0F1218] border border-[#1E2330]">
                  <span className="text-[#6B7280]">Costo: </span>
                  <span className="text-[#F0F2F5] font-mono">{preview.detected_columns.cost || 'No detectada'}</span>
                </div>
              </div>
              <div className="mt-3 text-xs text-[#9CA3AF]">
                Filas detectadas: <strong className="text-[#F0F2F5]">{preview.rows_count}</strong>
              </div>
            </Card>

            {/* Supplier select */}
            <Select
              label="Proveedor *"
              value={supplierId}
              onChange={(e) => setSupplierId(e.target.value)}
              options={[
                { value: '', label: 'Seleccionar proveedor...' },
                ...suppliers.map(s => ({ value: s.id, label: s.legal_name || s.name })),
              ]}
            />

            {/* Sample rows */}
            <Card>
              <h3 className="text-sm font-semibold text-[#F0F2F5] mb-3">Muestra (primeras filas)</h3>
              <div className="overflow-x-auto max-h-64 overflow-y-auto">
                <table className="w-full text-xs">
                  <thead className="bg-[#0A0D12] sticky top-0">
                    <tr className="text-left text-[#6B7280]">
                      {Object.keys(preview.sample[0] || {}).map(k => (
                        <th key={k} className="px-2 py-1.5 font-semibold uppercase">{k}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {preview.sample.slice(0, 10).map((row, idx) => (
                      <tr key={idx} className="border-t border-[#1E2330]">
                        {Object.values(row).map((v, i) => (
                          <td key={i} className="px-2 py-1.5 text-[#F0F2F5]">{String(v ?? '')}</td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Card>

            <div className="flex justify-end gap-3 pt-4 border-t border-[#1E2330]">
              <Button variant="secondary" onClick={() => reset()}>Otro archivo</Button>
              <Button variant="primary" onClick={handleApply} loading={applying}>
                <CheckCircle size={14} /> Aplicar actualizaciones
              </Button>
            </div>
          </div>
        )}

        {result && (
          <div className="space-y-4">
            <div className="p-6 rounded-xl bg-emerald-500/10 border border-emerald-500/30 text-center">
              <CheckCircle size={48} className="mx-auto mb-3 text-emerald-400" />
              <h3 className="text-lg font-bold text-[#F0F2F5] mb-2">Actualizacion completada</h3>
              <p className="text-sm text-[#9CA3AF]">El historial de precios fue registrado en tt_price_history</p>
            </div>

            <div className="grid grid-cols-3 gap-3">
              <div className="p-4 rounded-xl bg-[#0F1218] border border-[#1E2330] text-center">
                <p className="text-3xl font-bold text-[#FF6600]">{result.updated}</p>
                <p className="text-xs text-[#6B7280] mt-1">Productos actualizados</p>
              </div>
              <div className="p-4 rounded-xl bg-[#0F1218] border border-[#1E2330] text-center">
                <p className="text-3xl font-bold text-emerald-400">{result.created}</p>
                <p className="text-xs text-[#6B7280] mt-1">Productos nuevos</p>
              </div>
              <div className="p-4 rounded-xl bg-[#0F1218] border border-[#1E2330] text-center">
                <p className="text-3xl font-bold text-amber-400">{result.significant}</p>
                <p className="text-xs text-[#6B7280] mt-1">Variacion {'>'}10%</p>
              </div>
            </div>

            <div className="flex justify-end gap-3 pt-4 border-t border-[#1E2330]">
              <Button variant="primary" onClick={handleClose}>Listo</Button>
            </div>
          </div>
        )}
      </div>
    </Modal>
  )
}

// ===============================================================
// MAIN PAGE
// ===============================================================
export default function ComprasPage() {
  return (
    <div className="space-y-6 animate-fade-in">
      <div>
        <h1 className="text-2xl font-bold text-[#F0F2F5]">Compras</h1>
        <p className="text-sm text-[#6B7280] mt-1">Proveedores, ordenes de compra, recepciones, facturas y pagos</p>
      </div>
      <Suspense fallback={<div className="flex justify-center py-10"><Loader2 className="animate-spin text-[#FF6600]" size={32} /></div>}>
        <Tabs tabs={comprasTabs} defaultTab="proveedores">
          {(activeTab) => (
            <>
              {activeTab === 'proveedores' && <ProveedoresTab />}
              {activeTab === 'pedidos' && <PedidosCompraTab />}
              {activeTab === 'recepciones' && <RecepcionesTab />}
              {activeTab === 'ofertas' && <OfertasTab />}
              {activeTab === 'facturas' && <FacturasCompraTab />}
              {activeTab === 'abonos' && <AbonosTab />}
              {activeTab === 'pagos' && <PagosTab />}
              {activeTab === 'calendario' && <CalendarioPagosTab />}
              {activeTab === 'intercompany' && <IntercompanyTab />}
            </>
          )}
        </Tabs>
      </Suspense>
    </div>
  )
}
