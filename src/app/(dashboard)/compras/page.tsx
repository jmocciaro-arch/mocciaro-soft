'use client'

import { useState, useEffect, useCallback, useMemo, Suspense } from 'react'
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
import { formatCurrency, formatDate, formatRelative, getInitials } from '@/lib/utils'
import { DocumentDetailLayout, type WorkflowStep } from '@/components/workflow/document-detail-layout'
import { DocumentItemsTree, type DocumentItem } from '@/components/workflow/document-items-tree'
import { DocumentListCard } from '@/components/workflow/document-list-card'
import { DocumentForm } from '@/components/workflow/document-form'
import { documentToTableRow, localPOToRow, purchaseInvoiceToRow, mapStatus, extractClientName, extractDocRef } from '@/lib/document-helpers'
import type { Supplier, SupplierContact, PurchaseInvoice, PurchasePayment } from '@/types'
import {
  ShoppingCart, Plus, Package, Truck, CheckCircle, Clock,
  FileText, Loader2, X, Send, Users, DollarSign, FileCheck,
  Building2, Phone, Mail, MessageSquare, MapPin, Globe,
  Hash, ArrowLeft, Edit3, Save, Trash2, Star, ChevronRight,
  Contact, CreditCard, CalendarDays, AlertTriangle, Banknote,
  Receipt, ArrowUpRight, CalendarClock, CircleDollarSign,
  Layers, ArrowRightLeft
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
  { id: 'facturas', label: 'Facturas compra', icon: <FileCheck size={16} /> },
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

function generateInvoiceNumber(): string {
  const now = new Date()
  const y = now.getFullYear().toString().slice(-2)
  const m = (now.getMonth() + 1).toString().padStart(2, '0')
  const r = Math.floor(Math.random() * 9999).toString().padStart(4, '0')
  return `FC-${y}${m}-${r}`
}

// Helper: build workflow steps for a purchase order
function buildPOWorkflow(po: Row): WorkflowStep[] {
  const st = (po.status as string) || 'draft'
  return [
    { key: 'solicitud', label: 'Solicitud', icon: '\uD83D\uDCCB', status: 'completed', tooltip: 'Necesidad detectada' },
    {
      key: 'pap', label: 'Pedido proveedor', icon: '\uD83D\uDED2',
      status: st === 'draft' ? 'current' : st === 'sent' ? 'current' : 'completed',
      documentRef: (po.supplier_name as string) || '',
      date: po.created_at ? new Date(po.created_at as string).toLocaleDateString('es-ES') : '',
    },
    { key: 'recepcion', label: 'Recepcion', icon: '\uD83D\uDCE6', status: st === 'partial' ? 'partial' : st === 'received' || st === 'closed' ? 'completed' : 'pending' },
    { key: 'factura_compra', label: 'Factura compra', icon: '\uD83D\uDCB3', status: st === 'closed' ? 'completed' : 'pending' },
  ]
}

const countryFlags: Record<string, string> = { ES: '\u{1F1EA}\u{1F1F8}', AR: '\u{1F1E6}\u{1F1F7}', US: '\u{1F1FA}\u{1F1F8}', CL: '\u{1F1E8}\u{1F1F1}', UY: '\u{1F1FA}\u{1F1FE}', BR: '\u{1F1E7}\u{1F1F7}', MX: '\u{1F1F2}\u{1F1FD}', CO: '\u{1F1E8}\u{1F1F4}', DE: '\u{1F1E9}\u{1F1EA}', FR: '\u{1F1EB}\u{1F1F7}', IT: '\u{1F1EE}\u{1F1F9}', GB: '\u{1F1EC}\u{1F1E7}', CN: '\u{1F1E8}\u{1F1F3}', JP: '\u{1F1EF}\u{1F1F5}', TW: '\u{1F1F9}\u{1F1FC}', KR: '\u{1F1F0}\u{1F1F7}', PT: '\u{1F1F5}\u{1F1F9}' }
const countryNames: Record<string, string> = { ES: 'Espana', AR: 'Argentina', US: 'Estados Unidos', CL: 'Chile', UY: 'Uruguay', BR: 'Brasil', MX: 'Mexico', CO: 'Colombia', DE: 'Alemania', FR: 'Francia', IT: 'Italia', GB: 'Reino Unido', CN: 'China', JP: 'Japon', TW: 'Taiwan', KR: 'Corea del Sur', PT: 'Portugal' }

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
function SupplierDetail({ supplier, onClose, onUpdate }: {
  supplier: Supplier
  onClose: () => void
  onUpdate: () => void
}) {
  const { addToast } = useToast()
  const supabase = createClient()
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
      .ilike('supplier_name', `%${supplier.name}%`)
      .order('created_at', { ascending: false })
      .limit(30)
    setPurchaseOrders(data || [])
    setLoadingPOs(false)
  }, [supplier.name])

  const loadPaymentInfo = useCallback(async () => {
    const sb = createClient()
    // Pending invoices for this supplier
    const { data: invs } = await sb
      .from('tt_purchase_invoices')
      .select('*')
      .eq('supplier_id', supplier.id)
      .neq('status', 'paid')
      .order('due_date', { ascending: true })
    setPendingInvoices((invs || []) as PurchaseInvoice[])

    // Total paid this year
    const yearStart = new Date(new Date().getFullYear(), 0, 1).toISOString().split('T')[0]
    const { data: payments } = await sb
      .from('tt_purchase_payments')
      .select('amount')
      .eq('supplier_id', supplier.id)
      .gte('payment_date', yearStart)
    setTotalPaidYear((payments || []).reduce((s: number, p: { amount: number }) => s + (p.amount || 0), 0))

    // Last payment
    const { data: lastP } = await sb
      .from('tt_purchase_payments')
      .select('*')
      .eq('supplier_id', supplier.id)
      .order('payment_date', { ascending: false })
      .limit(1)
    setLastPayment(lastP?.[0] as PurchasePayment || null)
  }, [supplier.id])

  useEffect(() => { loadContacts(); loadPurchaseOrders(); loadPaymentInfo() }, [loadContacts, loadPurchaseOrders, loadPaymentInfo])

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
    if (!error) { setEditing(false); addToast({ type: 'success', title: 'Proveedor actualizado' }); onUpdate() }
    else addToast({ type: 'error', title: 'Error', message: error.message })
    setSaving(false)
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
    { id: 'pagos', label: `Pagos (${pendingInvoices.length})` },
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
        </div>
        <div className="flex gap-2">
          {supplier.phone && <a href={`tel:${supplier.phone}`}><Button variant="ghost" size="sm"><Phone size={14} /></Button></a>}
          {supplier.email && <a href={`mailto:${supplier.email}`}><Button variant="ghost" size="sm"><Mail size={14} /></Button></a>}
          {supplier.phone && <a href={`https://wa.me/${supplier.phone.replace(/[^0-9+]/g, '')}`} target="_blank" rel="noreferrer"><Button variant="ghost" size="sm"><MessageSquare size={14} /></Button></a>}
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
              {supplier.email && <a href={`mailto:${supplier.email}`}><Button variant="secondary" size="sm" className="w-full text-xs"><Mail size={12} /> Email</Button></a>}
              {supplier.phone && <a href={`https://wa.me/${supplier.phone.replace(/[^0-9+]/g, '')}`} target="_blank" rel="noreferrer"><Button variant="secondary" size="sm" className="w-full text-xs"><MessageSquare size={12} /> WhatsApp</Button></a>}
            </div>
          </Card>
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
                        clientName={(po.supplier_name as string) || 'Sin proveedor'}
                        date={po.created_at ? formatDate(po.created_at as string) : '-'}
                        total={(po.total as number) || 0} currency="EUR"
                        status={st} statusLabel={PO_STATUS[st]?.label || st}
                        onClick={() => {}}
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

  const load = useCallback(async () => {
    setLoading(true)
    const sb = createClient()
    const { data } = await sb.from('tt_suppliers').select('*').eq('active', true).order('name')
    const list = (data || []) as Supplier[]
    setSuppliers(list)
    const uniqueCountries = [...new Set(list.map(s => s.country).filter(Boolean) as string[])]
    uniqueCountries.sort()
    setCountries(uniqueCountries)
    setLoading(false)
  }, [])

  useEffect(() => { load() }, [load])

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
        <KPICard label="Con contactos" value={0} icon={<Contact size={22} />} />
      </div>
      <div className="flex justify-end gap-2">
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
                <div className="flex gap-1.5">
                  {supplier.category && <Badge variant="info" size="sm">{supplier.category}</Badge>}
                  {supplier.payment_terms && <Badge variant="default" size="sm">{supplier.payment_terms}</Badge>}
                </div>
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
function PedidosCompraTab() {
  const supabase = createClient()
  const { addToast } = useToast()
  const [orders, setOrders] = useState<Row[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState('')
  const [showCreate, setShowCreate] = useState(false)
  const [showReceive, setShowReceive] = useState(false)
  const [selectedPO, setSelectedPO] = useState<Row | null>(null)
  const [poItems, setPOItems] = useState<Row[]>([])
  const [supplier, setSupplier] = useState('')
  const [notesText, setNotesText] = useState('')
  const [lines, setLines] = useState<Array<{ product_id: string; name: string; quantity: number; unit_cost: number }>>([])
  const [products, setProducts] = useState<Array<Row>>([])
  const [saving, setSaving] = useState(false)
  const [rcvLines, setRcvLines] = useState<Array<{ id: string; desc: string; ordered: number; received: number; toReceive: number }>>([])

  const load = useCallback(async () => {
    setLoading(true)
    const sb = createClient()
    // Load from tt_documents (StelOrder historical PAPs)
    let qDoc = sb.from('tt_documents').select('*, client:tt_clients(id, name, legal_name)')
      .eq('type', 'pap')
      .order('created_at', { ascending: false })
      .range(0, 99)
    if (statusFilter) qDoc = qDoc.eq('status', statusFilter)
    if (search) qDoc = qDoc.or(`display_ref.ilike.%${search}%,system_code.ilike.%${search}%`)
    const { data: docData } = await qDoc

    // Also load from tt_purchase_orders (locally created)
    let qLocal = sb.from('tt_purchase_orders').select('*').order('created_at', { ascending: false })
    if (statusFilter) qLocal = qLocal.eq('status', statusFilter)
    if (search) qLocal = qLocal.ilike('supplier_name', `%${search}%`)
    const { data: localData } = await qLocal

    const localMapped = (localData || []).map((o: Row) => ({
      ...o, _source: 'local' as const,
      supplier_name: (o.supplier_name as string) || 'Sin proveedor',
    }))
    const docMapped = (docData || []).map((d: Row) => ({
      ...d, _source: 'tt_documents' as const,
      supplier_name: getClientName(d),
    }))
    setOrders([...localMapped, ...docMapped])
    setLoading(false)
  }, [statusFilter, search])

  useEffect(() => { load() }, [load])

  const loadProducts = async () => {
    const { data } = await supabase.from('tt_products').select('id, sku, name, cost_eur').order('name').limit(500)
    setProducts(data || [])
  }

  const handleCreate = async () => {
    if (!supplier.trim() || lines.length === 0) { addToast({ type: 'warning', title: 'Completa los datos' }); return }
    setSaving(true)
    const total = lines.reduce((s, l) => s + l.quantity * l.unit_cost, 0)
    const { data: po, error } = await supabase.from('tt_purchase_orders').insert({ supplier_name: supplier, status: 'draft', total, notes: notesText }).select().single()
    if (error || !po) { addToast({ type: 'error', title: 'Error', message: error?.message }); setSaving(false); return }
    const items = lines.map((l, i) => ({ purchase_order_id: po.id, product_id: l.product_id || null, description: l.name, quantity: l.quantity, unit_cost: l.unit_cost, qty_received: 0, line_total: l.quantity * l.unit_cost, sort_order: i }))
    await supabase.from('tt_po_items').insert(items)
    addToast({ type: 'success', title: 'OC creada' })
    setShowCreate(false); setSupplier(''); setNotesText(''); setLines([]); load(); setSaving(false)
  }

  const openDetail = async (po: Row) => {
    setSelectedPO(po)
    if ((po as Row & { _source?: string })._source === 'tt_documents') {
      const { data } = await supabase.from('tt_document_items').select('*').eq('document_id', po.id).order('sort_order')
      setPOItems(data || [])
    } else {
      const { data } = await supabase.from('tt_po_items').select('*').eq('purchase_order_id', po.id).order('sort_order')
      setPOItems(data || [])
    }
  }

  const openReceive = async (po: Row) => {
    setSelectedPO(po)
    const { data } = await supabase.from('tt_po_items').select('*').eq('purchase_order_id', po.id).order('sort_order')
    setRcvLines((data || []).map((it: Row) => ({ id: it.id as string, desc: (it.description || '') as string, ordered: (it.quantity || 0) as number, received: (it.qty_received || 0) as number, toReceive: 0 })))
    setShowReceive(true)
  }

  const handleReceive = async () => {
    if (!selectedPO) return
    for (const l of rcvLines) { if (l.toReceive > 0) { await supabase.from('tt_po_items').update({ qty_received: l.received + l.toReceive }).eq('id', l.id) } }
    const { data: items } = await supabase.from('tt_po_items').select('quantity, qty_received').eq('purchase_order_id', selectedPO.id)
    const allDone = (items || []).every((i: Row) => (i.qty_received as number) >= (i.quantity as number))
    const someDone = (items || []).some((i: Row) => (i.qty_received as number) > 0)
    const st = allDone ? 'received' : someDone ? 'partial' : (selectedPO.status as string)
    await supabase.from('tt_purchase_orders').update({ status: st }).eq('id', selectedPO.id)
    addToast({ type: 'success', title: 'Recepcion registrada' })
    setShowReceive(false); setSelectedPO(null); load()
  }

  const changeStatus = async (id: string, st: string) => {
    await supabase.from('tt_purchase_orders').update({ status: st }).eq('id', id)
    addToast({ type: 'success', title: 'Estado actualizado' })
    setSelectedPO(null); load()
  }

  if (selectedPO && !showReceive) {
    const src = (selectedPO as Row & { _source?: string })._source === 'tt_documents' ? 'tt_documents' : 'local' as const
    const allIds = orders.map(o => o.id as string)
    return (
      <DocumentForm
        documentId={selectedPO.id as string}
        documentType="pap"
        source={src}
        onBack={() => { setSelectedPO(null); load() }}
        onUpdate={load}
        siblingIds={allIds}
      />
    )
  }

  // Build DataTable rows
  const tableRows = useMemo(() => {
    return orders.map((po) => {
      const isDoc = (po as Row & { _source?: string })._source === 'tt_documents'
      if (isDoc) {
        const r = documentToTableRow(po)
        r.proveedor = r.cliente
        r._raw = po
        return r
      }
      return localPOToRow(po)
    })
  }, [orders])

  const PO_TABLE_COLS: DataTableColumn[] = [
    { key: 'referencia', label: 'Referencia', sortable: true, searchable: true, width: '140px' },
    { key: 'proveedor', label: 'Proveedor', sortable: true, searchable: true },
    { key: 'titulo', label: 'Titulo', searchable: true },
    { key: 'estado', label: 'Estado', sortable: true, type: 'status', width: '120px' },
    { key: 'fecha', label: 'Fecha', sortable: true, type: 'date', width: '110px' },
    { key: 'importe', label: 'Importe', sortable: true, type: 'currency', width: '120px' },
  ]

  const handleRowClick = (row: Record<string, unknown>) => {
    const po = row._raw as Row
    openDetail(po)
  }

  return (
    <div className="space-y-4">
      <DataTable
        data={tableRows}
        columns={PO_TABLE_COLS}
        loading={loading}
        totalLabel="ordenes de compra"
        showTotals
        onRowClick={handleRowClick}
        onNewClick={() => { setShowCreate(true); loadProducts() }}
        newLabel="Nueva OC"
        exportFilename="ordenes_compra_torquetools"
        pageSize={25}
      />
      <Modal isOpen={showCreate} onClose={() => setShowCreate(false)} title="Nueva Orden de Compra" size="xl">
        <div className="space-y-4">
          <Input label="Proveedor" value={supplier} onChange={(e) => setSupplier(e.target.value)} placeholder="Nombre del proveedor" />
          <div>
            <div className="flex items-center justify-between mb-2"><span className="text-sm font-medium text-[#9CA3AF]">Productos</span><Button variant="ghost" size="sm" onClick={() => setLines([...lines, { product_id: '', name: '', quantity: 1, unit_cost: 0 }])}><Plus size={14} /> Agregar</Button></div>
            {lines.map((l, i) => (
              <div key={i} className="flex gap-2 mb-2 items-end">
                <div className="flex-1"><Select options={products.map(p => ({ value: p.id as string, label: `${p.sku || ''} - ${p.name}` }))} value={l.product_id} onChange={(e) => { const u = [...lines]; const p = products.find(pr => pr.id === e.target.value); if (p) { u[i] = { ...u[i], product_id: p.id as string, name: (p.name || '') as string, unit_cost: (p.cost_eur || 0) as number } }; setLines(u) }} placeholder="Producto" /></div>
                <Input type="number" value={l.quantity} onChange={(e) => { const u = [...lines]; u[i].quantity = Number(e.target.value); setLines(u) }} className="w-20" />
                <Input type="number" value={l.unit_cost} onChange={(e) => { const u = [...lines]; u[i].unit_cost = Number(e.target.value); setLines(u) }} className="w-28" />
                <Button variant="ghost" size="sm" onClick={() => setLines(lines.filter((_, idx) => idx !== i))}><X size={14} /></Button>
              </div>
            ))}
          </div>
          <Input label="Notas" value={notesText} onChange={(e) => setNotesText(e.target.value)} placeholder="Observaciones..." />
          <div className="flex justify-end gap-3 pt-4 border-t border-[#1E2330]"><Button variant="secondary" onClick={() => setShowCreate(false)}>Cancelar</Button><Button onClick={handleCreate} loading={saving}>Crear OC</Button></div>
        </div>
      </Modal>
      <Modal isOpen={showReceive} onClose={() => setShowReceive(false)} title="Recepcion de Mercaderia" size="lg">
        <div className="space-y-4">
          <p className="text-sm text-[#6B7280]">Ingresa las cantidades recibidas para cada producto</p>
          {rcvLines.map((l, i) => (
            <div key={l.id} className="flex items-center gap-3 p-3 rounded-lg bg-[#0F1218]">
              <div className="flex-1"><p className="text-sm text-[#F0F2F5]">{l.desc}</p><p className="text-xs text-[#6B7280]">Pedido: {l.ordered} | Recibido: {l.received} | Pend: {l.ordered - l.received}</p></div>
              <Input type="number" value={l.toReceive} onChange={(e) => { const u = [...rcvLines]; u[i].toReceive = Math.max(0, Math.min(Number(e.target.value), l.ordered - l.received)); setRcvLines(u) }} className="w-24" />
            </div>
          ))}
          <div className="flex justify-end gap-3 pt-4 border-t border-[#1E2330]"><Button variant="secondary" onClick={() => setShowReceive(false)}>Cancelar</Button><Button onClick={handleReceive}><CheckCircle size={16} /> Confirmar</Button></div>
        </div>
      </Modal>
    </div>
  )
}

// ===============================================================
// RECEPCIONES TAB
// ===============================================================
function RecepcionesTab() {
  const supabase = createClient()
  const [rows, setRows] = useState<Record<string, unknown>[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    (async () => {
      setLoading(true)
      const [{ data: docData }, { data: localData }] = await Promise.all([
        supabase.from('tt_documents').select('*, client:tt_clients(id, name, legal_name)').eq('type', 'recepcion').order('created_at', { ascending: false }).range(0, 499),
        supabase.from('tt_purchase_orders').select('*').in('status', ['partial', 'received']).order('updated_at', { ascending: false }),
      ])

      const localRows = (localData || []).map((r: Row) => ({
        id: r.id,
        referencia: `REC-${(r.id as string).slice(0, 8).toUpperCase()}`,
        proveedor: (r.supplier_name as string) || 'Sin proveedor',
        estado: mapStatus(r.status as string),
        fecha: r.updated_at || r.created_at,
        importe: (r.total as number) || 0,
        _raw: r,
        _source: 'local',
      }))
      const docRows = (docData || []).map((d: Row) => {
        const r = documentToTableRow(d)
        r.proveedor = r.cliente
        return r
      })
      setRows([...localRows, ...docRows])
      setLoading(false)
    })()
  }, [])

  const REC_COLS: DataTableColumn[] = [
    { key: 'referencia', label: 'Referencia', sortable: true, searchable: true, width: '140px' },
    { key: 'proveedor', label: 'Proveedor', sortable: true, searchable: true },
    { key: 'estado', label: 'Estado', sortable: true, type: 'status', width: '120px' },
    { key: 'fecha', label: 'Fecha', sortable: true, type: 'date', width: '110px' },
    { key: 'importe', label: 'Importe', sortable: true, type: 'currency', width: '120px' },
  ]

  return (
    <DataTable
      data={rows}
      columns={REC_COLS}
      loading={loading}
      totalLabel="recepciones"
      showTotals
      exportFilename="recepciones_torquetools"
      pageSize={25}
    />
  )
}

// ===============================================================
// FACTURAS COMPRA TAB (ENHANCED)
// ===============================================================
function FacturasCompraTab() {
  const supabase = createClient()
  const { addToast } = useToast()
  const [invoices, setInvoices] = useState<PurchaseInvoice[]>([])
  const [suppliers, setSuppliers] = useState<Supplier[]>([])
  const [purchaseOrders, setPurchaseOrders] = useState<Row[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState('')
  const [showCreate, setShowCreate] = useState(false)
  const [showPayment, setShowPayment] = useState(false)
  const [selectedInvoice, setSelectedInvoice] = useState<PurchaseInvoice | null>(null)
  const [saving, setSaving] = useState(false)
  const [newInv, setNewInv] = useState({ supplier_id: '', purchase_order_id: '', supplier_invoice_number: '', supplier_invoice_date: '', subtotal: 0, tax_rate: 21, due_date: '', notes: '' })
  const [newPay, setNewPay] = useState({ amount: 0, payment_date: new Date().toISOString().split('T')[0], payment_method: 'transferencia', bank_reference: '', bank_account: '', notes: '' })
  const [invoicePayments, setInvoicePayments] = useState<PurchasePayment[]>([])

  // Historical purchase invoices from tt_documents
  const [histDocs, setHistDocs] = useState<Row[]>([])

  const load = useCallback(async () => {
    setLoading(true)
    const sb = createClient()
    const { data } = await sb
      .from('tt_purchase_invoices')
      .select('*, supplier:tt_suppliers(id, name, legal_name)')
      .order('created_at', { ascending: false })
    setInvoices((data || []) as PurchaseInvoice[])

    // Also load historical from tt_documents
    const { data: docData } = await sb.from('tt_documents').select('*, client:tt_clients(id, name, legal_name)')
      .eq('type', 'factura_compra')
      .order('created_at', { ascending: false })
      .range(0, 99)
    setHistDocs(docData || [])

    setLoading(false)
  }, [])

  useEffect(() => { load(); checkPaymentAlerts() }, [load])

  const loadSuppliers = async () => {
    const { data } = await supabase.from('tt_suppliers').select('id, name, legal_name').eq('active', true).order('name')
    setSuppliers((data || []) as Supplier[])
  }

  const loadPOs = async () => {
    const { data } = await supabase.from('tt_purchase_orders').select('id, supplier_name, total, status').order('created_at', { ascending: false }).limit(50)
    setPurchaseOrders(data || [])
  }

  const filtered = useMemo(() => {
    let result = invoices
    if (statusFilter) {
      result = result.filter(inv => {
        const ds = getInvoiceDisplayStatus(inv)
        return ds === statusFilter
      })
    }
    if (search.trim()) {
      const tokens = search.trim().toLowerCase().split(/\s+/)
      result = result.filter(inv => {
        const sName = (inv.supplier as Supplier | undefined)?.name || ''
        const searchable = [inv.number, sName, inv.supplier_invoice_number, inv.notes].filter(Boolean).join(' ').toLowerCase()
        return tokens.every(t => searchable.includes(t))
      })
    }
    return result
  }, [invoices, search, statusFilter])

  const totalPending = filtered.filter(i => i.status !== 'paid').reduce((s, i) => s + i.total, 0)
  const dueThisWeek = filtered.filter(i => {
    if (i.status === 'paid' || !i.due_date) return false
    const due = new Date(i.due_date)
    const now = new Date()
    const in7 = new Date(Date.now() + 7 * 86400000)
    return due >= now && due <= in7
  }).length
  const overdueAmount = filtered.filter(i => {
    if (i.status === 'paid' || !i.due_date) return false
    return new Date(i.due_date) < new Date()
  }).reduce((s, i) => s + i.total, 0)

  async function handleCreateInvoice() {
    if (!newInv.supplier_id) { addToast({ type: 'error', title: 'Selecciona un proveedor' }); return }
    setSaving(true)
    const taxAmount = newInv.subtotal * newInv.tax_rate / 100
    const total = newInv.subtotal + taxAmount
    const { error } = await supabase.from('tt_purchase_invoices').insert({
      number: generateInvoiceNumber(),
      supplier_id: newInv.supplier_id,
      purchase_order_id: newInv.purchase_order_id || null,
      supplier_invoice_number: newInv.supplier_invoice_number || null,
      supplier_invoice_date: newInv.supplier_invoice_date || null,
      subtotal: newInv.subtotal,
      tax_rate: newInv.tax_rate,
      tax_amount: taxAmount,
      total,
      due_date: newInv.due_date || null,
      notes: newInv.notes || null,
      status: 'pending',
    })
    if (!error) {
      addToast({ type: 'success', title: 'Factura registrada' })
      setShowCreate(false)
      setNewInv({ supplier_id: '', purchase_order_id: '', supplier_invoice_number: '', supplier_invoice_date: '', subtotal: 0, tax_rate: 21, due_date: '', notes: '' })
      load()
    } else { addToast({ type: 'error', title: 'Error', message: error.message }) }
    setSaving(false)
  }

  async function openInvoiceDetail(inv: PurchaseInvoice) {
    setSelectedInvoice(inv)
    const { data } = await supabase
      .from('tt_purchase_payments')
      .select('*')
      .eq('purchase_invoice_id', inv.id)
      .order('payment_date', { ascending: false })
    setInvoicePayments((data || []) as PurchasePayment[])
  }

  async function handleRegisterPayment() {
    if (!selectedInvoice || newPay.amount <= 0) { addToast({ type: 'error', title: 'Monto invalido' }); return }
    setSaving(true)
    const { error } = await supabase.from('tt_purchase_payments').insert({
      purchase_invoice_id: selectedInvoice.id,
      supplier_id: selectedInvoice.supplier_id,
      purchase_order_id: selectedInvoice.purchase_order_id,
      amount: newPay.amount,
      payment_date: newPay.payment_date,
      payment_method: newPay.payment_method,
      bank_reference: newPay.bank_reference || null,
      bank_account: newPay.bank_account || null,
      notes: newPay.notes || null,
      is_advance: false,
      status: 'completed',
    })
    if (error) { addToast({ type: 'error', title: 'Error', message: error.message }); setSaving(false); return }

    // Update invoice status
    const totalPaid = invoicePayments.reduce((s, p) => s + p.amount, 0) + newPay.amount
    const newStatus = totalPaid >= selectedInvoice.total ? 'paid' : 'partial'
    await supabase.from('tt_purchase_invoices').update({
      status: newStatus,
      paid_at: newStatus === 'paid' ? new Date().toISOString() : null,
    }).eq('id', selectedInvoice.id)

    // Resolve related alerts
    if (newStatus === 'paid') {
      await supabase.from('tt_alerts')
        .update({ status: 'resolved' })
        .eq('document_id', selectedInvoice.id)
        .in('type', ['payment_due_soon', 'payment_overdue'])
    }

    addToast({ type: 'success', title: 'Pago registrado' })
    setShowPayment(false)
    setNewPay({ amount: 0, payment_date: new Date().toISOString().split('T')[0], payment_method: 'transferencia', bank_reference: '', bank_account: '', notes: '' })
    load()
    openInvoiceDetail({ ...selectedInvoice, status: newStatus })
    setSaving(false)
  }

  // Invoice detail view
  if (selectedInvoice) {
    const ds = getInvoiceDisplayStatus(selectedInvoice)
    const totalPaid = invoicePayments.reduce((s, p) => s + p.amount, 0)
    const remaining = selectedInvoice.total - totalPaid
    const sName = (selectedInvoice.supplier as Supplier | undefined)?.name || 'Proveedor'

    return (
      <div className="space-y-4 animate-in fade-in">
        <button onClick={() => setSelectedInvoice(null)} className="flex items-center gap-2 text-[#9CA3AF] hover:text-[#F0F2F5] transition-colors text-sm">
          <ArrowLeft size={16} /> Volver a facturas
        </button>

        <div className="flex items-start justify-between">
          <div>
            <h2 className="text-xl font-bold text-[#F0F2F5]">{selectedInvoice.number}</h2>
            <p className="text-sm text-[#6B7280]">{sName} {selectedInvoice.supplier_invoice_number ? `| Factura proveedor: ${selectedInvoice.supplier_invoice_number}` : ''}</p>
          </div>
          <Badge variant={INVOICE_STATUS[ds]?.variant || 'default'} size="md">{INVOICE_STATUS[ds]?.label || ds}</Badge>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <div className="p-4 rounded-xl bg-[#141820] border border-[#1E2330]">
            <p className="text-xs text-[#6B7280]">Subtotal</p>
            <p className="text-lg font-bold text-[#F0F2F5]">{formatCurrency(selectedInvoice.subtotal)}</p>
          </div>
          <div className="p-4 rounded-xl bg-[#141820] border border-[#1E2330]">
            <p className="text-xs text-[#6B7280]">IVA ({selectedInvoice.tax_rate}%)</p>
            <p className="text-lg font-bold text-[#F0F2F5]">{formatCurrency(selectedInvoice.tax_amount)}</p>
          </div>
          <div className="p-4 rounded-xl bg-[#141820] border border-[#1E2330]">
            <p className="text-xs text-[#6B7280]">Total</p>
            <p className="text-lg font-bold text-[#FF6600]">{formatCurrency(selectedInvoice.total)}</p>
          </div>
          <div className="p-4 rounded-xl bg-[#141820] border border-[#1E2330]">
            <p className="text-xs text-[#6B7280]">Pendiente</p>
            <p className={`text-lg font-bold ${remaining > 0 ? 'text-amber-400' : 'text-emerald-400'}`}>{formatCurrency(remaining)}</p>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <Card>
            <h3 className="text-sm font-semibold text-[#F0F2F5] mb-3">Datos de la factura</h3>
            <div className="space-y-2 text-xs">
              <div className="flex justify-between"><span className="text-[#6B7280]">Fecha factura proveedor</span><span className="text-[#F0F2F5]">{selectedInvoice.supplier_invoice_date ? formatDate(selectedInvoice.supplier_invoice_date) : '-'}</span></div>
              <div className="flex justify-between"><span className="text-[#6B7280]">Fecha vencimiento</span><span className="text-[#F0F2F5]" style={{ color: getDueDateColor(selectedInvoice.due_date) }}>{selectedInvoice.due_date ? formatDate(selectedInvoice.due_date) : '-'}</span></div>
              <div className="flex justify-between"><span className="text-[#6B7280]">Moneda</span><span className="text-[#F0F2F5]">{selectedInvoice.currency}</span></div>
              {selectedInvoice.notes && <div className="pt-2 border-t border-[#1E2330]"><span className="text-[#6B7280]">Notas: </span><span className="text-[#F0F2F5]">{selectedInvoice.notes}</span></div>}
            </div>
          </Card>

          <Card>
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-sm font-semibold text-[#F0F2F5]">Pagos realizados</h3>
              {remaining > 0 && <Button variant="primary" size="sm" onClick={() => { setNewPay({ ...newPay, amount: remaining }); setShowPayment(true) }}><CreditCard size={14} /> Registrar pago</Button>}
            </div>
            {invoicePayments.length === 0 ? (
              <p className="text-xs text-[#4B5563] py-4 text-center">Sin pagos registrados</p>
            ) : (
              <div className="space-y-2">
                {invoicePayments.map(pay => (
                  <div key={pay.id} className="flex items-center justify-between p-2 rounded-lg bg-[#0F1218]">
                    <div>
                      <p className="text-sm font-semibold text-emerald-400">{formatCurrency(pay.amount)}</p>
                      <p className="text-xs text-[#6B7280]">{formatDate(pay.payment_date)} | {pay.payment_method}</p>
                      {pay.bank_reference && <p className="text-xs text-[#4B5563]">Ref: {pay.bank_reference}</p>}
                    </div>
                    <Badge variant="success" size="sm">Pagado</Badge>
                  </div>
                ))}
              </div>
            )}
          </Card>
        </div>

        {/* Payment modal */}
        <Modal isOpen={showPayment} onClose={() => setShowPayment(false)} title="Registrar pago" size="md">
          <div className="space-y-4">
            <Input label="Monto *" type="number" value={newPay.amount} onChange={(e) => setNewPay({ ...newPay, amount: Number(e.target.value) })} />
            <Input label="Fecha de pago *" type="date" value={newPay.payment_date} onChange={(e) => setNewPay({ ...newPay, payment_date: e.target.value })} />
            <Select label="Metodo de pago" value={newPay.payment_method} onChange={(e) => setNewPay({ ...newPay, payment_method: e.target.value })} options={[
              { value: 'transferencia', label: 'Transferencia bancaria' }, { value: 'cheque', label: 'Cheque' },
              { value: 'efectivo', label: 'Efectivo' }, { value: 'tarjeta', label: 'Tarjeta' },
              { value: 'paypal', label: 'PayPal' }, { value: 'otro', label: 'Otro' },
            ]} />
            <Input label="Referencia bancaria" value={newPay.bank_reference} onChange={(e) => setNewPay({ ...newPay, bank_reference: e.target.value })} placeholder="Nro transferencia, cheque..." />
            <Input label="Cuenta bancaria" value={newPay.bank_account} onChange={(e) => setNewPay({ ...newPay, bank_account: e.target.value })} />
            <Input label="Notas" value={newPay.notes} onChange={(e) => setNewPay({ ...newPay, notes: e.target.value })} />
            <div className="flex justify-end gap-3 pt-4 border-t border-[#1E2330]">
              <Button variant="secondary" onClick={() => setShowPayment(false)}>Cancelar</Button>
              <Button onClick={handleRegisterPayment} loading={saving}><CreditCard size={14} /> Registrar pago</Button>
            </div>
          </div>
        </Modal>
      </div>
    )
  }

  // Build combined DataTable rows from local invoices + historical docs
  const tableRows = useMemo(() => {
    const localRows = filtered.map((inv) => {
      const ds = getInvoiceDisplayStatus(inv)
      const sName = (inv.supplier as Supplier | undefined)?.name || 'Proveedor'
      return {
        id: inv.id,
        referencia: inv.number || '-',
        proveedor: sName,
        ref_proveedor: inv.supplier_invoice_number || '',
        estado: INVOICE_STATUS[ds]?.label || ds,
        fecha: inv.created_at,
        importe: inv.total || 0,
        moneda: inv.currency || 'EUR',
        fecha_vencimiento: inv.due_date,
        _raw: inv,
        _source: 'local',
      }
    })
    const docRows = histDocs.map((d) => {
      const r = documentToTableRow(d)
      r.proveedor = r.cliente
      return r
    })
    return [...localRows, ...docRows]
  }, [filtered, histDocs])

  const FC_COLS: DataTableColumn[] = [
    { key: 'referencia', label: 'Referencia', sortable: true, searchable: true, width: '140px' },
    { key: 'proveedor', label: 'Proveedor', sortable: true, searchable: true },
    { key: 'ref_proveedor', label: 'Ref. proveedor', searchable: true, defaultVisible: true },
    { key: 'estado', label: 'Estado', sortable: true, type: 'status', width: '120px' },
    { key: 'fecha', label: 'Fecha', sortable: true, type: 'date', width: '110px' },
    { key: 'importe', label: 'Importe', sortable: true, type: 'currency', width: '120px' },
    { key: 'fecha_vencimiento', label: 'Vencimiento', sortable: true, type: 'date', width: '110px' },
  ]

  const handleInvRowClick = (row: Record<string, unknown>) => {
    if (row._source === 'local') {
      openInvoiceDetail(row._raw as PurchaseInvoice)
    }
  }

  return (
    <div className="space-y-4">
      <DataTable
        data={tableRows}
        columns={FC_COLS}
        loading={loading}
        totalLabel="facturas de compra"
        showTotals
        onRowClick={handleInvRowClick}
        onNewClick={() => { setShowCreate(true); loadSuppliers(); loadPOs() }}
        newLabel="Registrar factura"
        exportFilename="facturas_compra"
        pageSize={25}
      />

      {/* Create invoice modal */}
      <Modal isOpen={showCreate} onClose={() => setShowCreate(false)} title="Registrar factura de compra" size="xl">
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <Select label="Proveedor *" value={newInv.supplier_id} onChange={(e) => setNewInv({ ...newInv, supplier_id: e.target.value })} options={[{ value: '', label: 'Seleccionar...' }, ...suppliers.map(s => ({ value: s.id, label: s.legal_name || s.name }))]} />
            <Select label="OC vinculada" value={newInv.purchase_order_id} onChange={(e) => setNewInv({ ...newInv, purchase_order_id: e.target.value })} options={[{ value: '', label: 'Ninguna' }, ...purchaseOrders.map(po => ({ value: po.id as string, label: `${(po.supplier_name as string)} - ${formatCurrency((po.total as number) || 0)}` }))]} />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <Input label="N de factura del proveedor" value={newInv.supplier_invoice_number} onChange={(e) => setNewInv({ ...newInv, supplier_invoice_number: e.target.value })} placeholder="Ej: FA-2024-001" />
            <Input label="Fecha factura proveedor" type="date" value={newInv.supplier_invoice_date} onChange={(e) => setNewInv({ ...newInv, supplier_invoice_date: e.target.value })} />
          </div>
          <div className="grid grid-cols-3 gap-4">
            <Input label="Subtotal (sin IVA) *" type="number" value={newInv.subtotal} onChange={(e) => setNewInv({ ...newInv, subtotal: Number(e.target.value) })} />
            <Input label="IVA %" type="number" value={newInv.tax_rate} onChange={(e) => setNewInv({ ...newInv, tax_rate: Number(e.target.value) })} />
            <div className="p-3 rounded-lg bg-[#0F1218] border border-[#1E2330]">
              <p className="text-xs text-[#6B7280] mb-1">Total</p>
              <p className="text-lg font-bold text-[#FF6600]">{formatCurrency(newInv.subtotal + (newInv.subtotal * newInv.tax_rate / 100))}</p>
            </div>
          </div>
          <Input label="Fecha de vencimiento" type="date" value={newInv.due_date} onChange={(e) => setNewInv({ ...newInv, due_date: e.target.value })} />
          <Input label="Notas" value={newInv.notes} onChange={(e) => setNewInv({ ...newInv, notes: e.target.value })} />
          <div className="flex justify-end gap-3 pt-4 border-t border-[#1E2330]">
            <Button variant="secondary" onClick={() => setShowCreate(false)}>Cancelar</Button>
            <Button onClick={handleCreateInvoice} loading={saving}><FileCheck size={14} /> Registrar factura</Button>
          </div>
        </div>
      </Modal>
    </div>
  )
}

// ===============================================================
// PAGOS TAB (NEW)
// ===============================================================
function PagosTab() {
  const supabase = createClient()
  const { addToast } = useToast()
  const [payments, setPayments] = useState<PurchasePayment[]>([])
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState<'all' | 'normal' | 'advance'>('all')
  const [showAdvance, setShowAdvance] = useState(false)
  const [suppliers, setSuppliers] = useState<Supplier[]>([])
  const [saving, setSaving] = useState(false)
  const [newAdv, setNewAdv] = useState({ supplier_id: '', amount: 0, payment_date: new Date().toISOString().split('T')[0], payment_method: 'transferencia', bank_reference: '', advance_reason: '', expected_goods_date: '', notes: '' })

  const load = useCallback(async () => {
    setLoading(true)
    const sb = createClient()
    const { data } = await sb
      .from('tt_purchase_payments')
      .select('*, supplier:tt_suppliers(id, name, legal_name)')
      .order('payment_date', { ascending: false })
    setPayments((data || []) as PurchasePayment[])
    setLoading(false)
  }, [])

  useEffect(() => { load() }, [load])

  const filtered = useMemo(() => {
    if (filter === 'normal') return payments.filter(p => !p.is_advance)
    if (filter === 'advance') return payments.filter(p => p.is_advance)
    return payments
  }, [payments, filter])

  const totalPaidMonth = useMemo(() => {
    const now = new Date()
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().split('T')[0]
    return payments.filter(p => p.payment_date >= monthStart).reduce((s, p) => s + p.amount, 0)
  }, [payments])

  const advancesPending = payments.filter(p => p.is_advance && !p.goods_received)
  const paymentsThisWeek = useMemo(() => {
    const now = new Date()
    const weekStart = new Date(now)
    weekStart.setDate(now.getDate() - now.getDay())
    const ws = weekStart.toISOString().split('T')[0]
    return payments.filter(p => p.payment_date >= ws).length
  }, [payments])

  async function handleCreateAdvance() {
    if (!newAdv.supplier_id || newAdv.amount <= 0) { addToast({ type: 'error', title: 'Completa los datos obligatorios' }); return }
    setSaving(true)
    const reminderDate = newAdv.expected_goods_date || null
    const { error } = await supabase.from('tt_purchase_payments').insert({
      supplier_id: newAdv.supplier_id,
      amount: newAdv.amount,
      payment_date: newAdv.payment_date,
      payment_method: newAdv.payment_method,
      bank_reference: newAdv.bank_reference || null,
      advance_reason: newAdv.advance_reason || null,
      expected_goods_date: newAdv.expected_goods_date || null,
      reminder_date: reminderDate,
      is_advance: true,
      goods_received: false,
      status: 'completed',
      notes: newAdv.notes || null,
    })
    if (!error) {
      addToast({ type: 'success', title: 'Anticipo registrado' })
      setShowAdvance(false)
      setNewAdv({ supplier_id: '', amount: 0, payment_date: new Date().toISOString().split('T')[0], payment_method: 'transferencia', bank_reference: '', advance_reason: '', expected_goods_date: '', notes: '' })
      load()
    } else { addToast({ type: 'error', title: 'Error', message: error.message }) }
    setSaving(false)
  }

  async function markGoodsReceived(paymentId: string) {
    await supabase.from('tt_purchase_payments').update({
      goods_received: true,
      goods_received_date: new Date().toISOString().split('T')[0],
    }).eq('id', paymentId)
    // Resolve related alerts
    await supabase.from('tt_alerts').update({ status: 'resolved' }).eq('document_id', paymentId).eq('type', 'advance_goods_pending')
    addToast({ type: 'success', title: 'Mercaderia recibida marcada' })
    load()
  }

  const loadSuppliers = async () => {
    const { data } = await supabase.from('tt_suppliers').select('id, name, legal_name').eq('active', true).order('name')
    setSuppliers((data || []) as Supplier[])
  }

  return (
    <div className="space-y-4">
      <div className="flex justify-end gap-2">
        <Button variant="secondary" onClick={() => { setShowAdvance(true); loadSuppliers() }}><Banknote size={16} /> Registrar anticipo</Button>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <KPICard label="Pagado este mes" value={formatCurrency(totalPaidMonth)} icon={<CircleDollarSign size={22} />} color="#10B981" />
        <KPICard label="Anticipos pendientes" value={advancesPending.length} icon={<Banknote size={22} />} color="#3B82F6" />
        <KPICard label="Pagos esta semana" value={paymentsThisWeek} icon={<CreditCard size={22} />} />
        <KPICard label="Total pagos" value={filtered.length} icon={<Receipt size={22} />} color="#6B7280" />
      </div>

      <div className="flex gap-2">
        {(['all', 'normal', 'advance'] as const).map(f => (
          <button key={f} onClick={() => setFilter(f)} className={`px-4 py-2 rounded-lg text-xs font-medium transition-all ${filter === f ? 'bg-[#FF6600] text-white' : 'bg-[#1E2330] text-[#9CA3AF] hover:bg-[#2A3040]'}`}>
            {f === 'all' ? 'Todos' : f === 'normal' ? 'Normales' : 'Anticipos'}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-20"><Loader2 className="animate-spin text-[#FF6600]" size={32} /></div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-20 text-[#6B7280]"><CreditCard size={48} className="mx-auto mb-3 opacity-30" /><p>No hay pagos registrados</p></div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
          {filtered.map((pay) => {
            const sName = (pay.supplier as Supplier | undefined)?.name || 'Proveedor'
            return (
              <Card key={pay.id}>
                <div className="flex items-start justify-between mb-2">
                  <div>
                    <p className="text-sm font-bold text-[#F0F2F5]">{sName}</p>
                    <p className="text-xs text-[#6B7280]">{formatDate(pay.payment_date)} | {pay.payment_method || '-'}</p>
                  </div>
                  <div className="flex gap-1">
                    {pay.is_advance && <Badge variant="info" size="sm">ANTICIPO</Badge>}
                    <Badge variant="success" size="sm">{pay.status}</Badge>
                  </div>
                </div>
                <p className="text-xl font-bold text-emerald-400 mb-2">{formatCurrency(pay.amount)}</p>
                {pay.bank_reference && <p className="text-xs text-[#4B5563] mb-1">Ref: {pay.bank_reference}</p>}
                {pay.is_advance && (
                  <div className="pt-2 border-t border-[#1E2330] mt-2">
                    {pay.advance_reason && <p className="text-xs text-[#9CA3AF] mb-1">Motivo: {pay.advance_reason}</p>}
                    {pay.expected_goods_date && (
                      <div className="flex items-center justify-between">
                        <p className="text-xs text-[#6B7280]">
                          Mercaderia esperada: <span style={{ color: getDueDateColor(pay.expected_goods_date) }}>{formatDate(pay.expected_goods_date)}</span>
                        </p>
                        {pay.goods_received ? (
                          <Badge variant="success" size="sm">Recibida</Badge>
                        ) : (
                          <Button variant="secondary" size="sm" onClick={() => markGoodsReceived(pay.id)}>
                            <CheckCircle size={12} /> Recibida
                          </Button>
                        )}
                      </div>
                    )}
                    {pay.goods_received && pay.goods_received_date && (
                      <p className="text-xs text-emerald-400 mt-1">Recibida el {formatDate(pay.goods_received_date)}</p>
                    )}
                  </div>
                )}
              </Card>
            )
          })}
        </div>
      )}

      {/* Advance payment modal */}
      <Modal isOpen={showAdvance} onClose={() => setShowAdvance(false)} title="Registrar anticipo a proveedor" size="lg">
        <div className="space-y-4">
          <div className="p-3 rounded-lg bg-blue-500/10 border border-blue-500/20 text-xs text-blue-400">
            Los anticipos son pagos realizados antes de recibir la mercaderia. Se genera un recordatorio automatico para la fecha de recepcion esperada.
          </div>
          <Select label="Proveedor *" value={newAdv.supplier_id} onChange={(e) => setNewAdv({ ...newAdv, supplier_id: e.target.value })} options={[{ value: '', label: 'Seleccionar...' }, ...suppliers.map(s => ({ value: s.id, label: s.legal_name || s.name }))]} />
          <div className="grid grid-cols-2 gap-4">
            <Input label="Monto *" type="number" value={newAdv.amount} onChange={(e) => setNewAdv({ ...newAdv, amount: Number(e.target.value) })} />
            <Input label="Fecha de pago *" type="date" value={newAdv.payment_date} onChange={(e) => setNewAdv({ ...newAdv, payment_date: e.target.value })} />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <Select label="Metodo de pago" value={newAdv.payment_method} onChange={(e) => setNewAdv({ ...newAdv, payment_method: e.target.value })} options={[
              { value: 'transferencia', label: 'Transferencia' }, { value: 'cheque', label: 'Cheque' },
              { value: 'efectivo', label: 'Efectivo' }, { value: 'tarjeta', label: 'Tarjeta' },
            ]} />
            <Input label="Referencia bancaria" value={newAdv.bank_reference} onChange={(e) => setNewAdv({ ...newAdv, bank_reference: e.target.value })} />
          </div>
          <Input label="Motivo del anticipo" value={newAdv.advance_reason} onChange={(e) => setNewAdv({ ...newAdv, advance_reason: e.target.value })} placeholder="Por que se paga por adelantado..." />
          <Input label="Fecha esperada de recepcion de mercaderia" type="date" value={newAdv.expected_goods_date} onChange={(e) => setNewAdv({ ...newAdv, expected_goods_date: e.target.value })} />
          <Input label="Notas" value={newAdv.notes} onChange={(e) => setNewAdv({ ...newAdv, notes: e.target.value })} />
          <div className="flex justify-end gap-3 pt-4 border-t border-[#1E2330]">
            <Button variant="secondary" onClick={() => setShowAdvance(false)}>Cancelar</Button>
            <Button onClick={handleCreateAdvance} loading={saving}><Banknote size={14} /> Registrar anticipo</Button>
          </div>
        </div>
      </Modal>
    </div>
  )
}

// ===============================================================
// CALENDARIO DE PAGOS TAB (NEW)
// ===============================================================
function CalendarioPagosTab() {
  const supabase = createClient()
  const [invoices, setInvoices] = useState<PurchaseInvoice[]>([])
  const [loading, setLoading] = useState(true)
  const [selectedDay, setSelectedDay] = useState<string | null>(null)

  useEffect(() => {
    (async () => {
      setLoading(true)
      const { data } = await supabase
        .from('tt_purchase_invoices')
        .select('*, supplier:tt_suppliers(id, name, legal_name)')
        .not('due_date', 'is', null)
        .order('due_date', { ascending: true })
      setInvoices((data || []) as PurchaseInvoice[])
      setLoading(false)
    })()
  }, [])

  // Build calendar data for next 30 days
  const calendarData = useMemo(() => {
    const days: Array<{ date: string; label: string; dayNum: number; weekday: string; invoices: PurchaseInvoice[]; isToday: boolean; isWeekend: boolean }> = []
    const today = new Date()
    today.setHours(0, 0, 0, 0)

    for (let i = 0; i < 30; i++) {
      const d = new Date(today)
      d.setDate(today.getDate() + i)
      const dateStr = d.toISOString().split('T')[0]
      const dayInvs = invoices.filter(inv => inv.due_date === dateStr)
      const weekday = d.toLocaleDateString('es-ES', { weekday: 'short' })
      days.push({
        date: dateStr,
        label: d.toLocaleDateString('es-ES', { day: 'numeric', month: 'short' }),
        dayNum: d.getDate(),
        weekday,
        invoices: dayInvs,
        isToday: i === 0,
        isWeekend: d.getDay() === 0 || d.getDay() === 6,
      })
    }
    return days
  }, [invoices])

  const totalDueThisWeek = useMemo(() => {
    const now = new Date()
    const weekEnd = new Date(now)
    weekEnd.setDate(now.getDate() + 7)
    const ws = now.toISOString().split('T')[0]
    const we = weekEnd.toISOString().split('T')[0]
    return invoices.filter(i => i.status !== 'paid' && i.due_date && i.due_date >= ws && i.due_date <= we).reduce((s, i) => s + i.total, 0)
  }, [invoices])

  const totalDueNextWeek = useMemo(() => {
    const now = new Date()
    const weekStart = new Date(now)
    weekStart.setDate(now.getDate() + 7)
    const weekEnd = new Date(now)
    weekEnd.setDate(now.getDate() + 14)
    const ws = weekStart.toISOString().split('T')[0]
    const we = weekEnd.toISOString().split('T')[0]
    return invoices.filter(i => i.status !== 'paid' && i.due_date && i.due_date >= ws && i.due_date <= we).reduce((s, i) => s + i.total, 0)
  }, [invoices])

  const totalDueMonth = invoices.filter(i => i.status !== 'paid').reduce((s, i) => s + i.total, 0)

  const selectedDayInvoices = selectedDay ? calendarData.find(d => d.date === selectedDay)?.invoices || [] : []

  if (loading) return <div className="flex items-center justify-center py-20"><Loader2 className="animate-spin text-[#FF6600]" size={32} /></div>

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <KPICard label="Vence esta semana" value={formatCurrency(totalDueThisWeek)} icon={<CalendarDays size={22} />} color="#F97316" />
        <KPICard label="Vence proxima semana" value={formatCurrency(totalDueNextWeek)} icon={<CalendarClock size={22} />} color="#EAB308" />
        <KPICard label="Total pendiente (30d)" value={formatCurrency(totalDueMonth)} icon={<DollarSign size={22} />} color="#EF4444" />
      </div>

      {/* Calendar grid */}
      <div className="grid grid-cols-7 gap-1">
        {/* Header */}
        {['Lun', 'Mar', 'Mie', 'Jue', 'Vie', 'Sab', 'Dom'].map(d => (
          <div key={d} className="text-center text-xs font-medium text-[#6B7280] py-2">{d}</div>
        ))}
      </div>

      <div className="grid grid-cols-5 sm:grid-cols-6 lg:grid-cols-10 gap-2">
        {calendarData.map(day => {
          const hasInvoices = day.invoices.length > 0
          const hasPaid = day.invoices.some(i => i.status === 'paid')
          const hasOverdue = day.invoices.some(i => i.status !== 'paid' && new Date(i.due_date!) < new Date())
          const hasPending = day.invoices.some(i => i.status !== 'paid')
          const totalDayAmount = day.invoices.filter(i => i.status !== 'paid').reduce((s, i) => s + i.total, 0)

          let borderColor = 'border-[#1E2330]'
          let bgColor = 'bg-[#141820]'
          if (hasOverdue) { borderColor = 'border-red-500/40'; bgColor = 'bg-red-500/5' }
          else if (hasPending) { borderColor = 'border-amber-500/40'; bgColor = 'bg-amber-500/5' }
          else if (hasPaid && hasInvoices) { borderColor = 'border-emerald-500/40'; bgColor = 'bg-emerald-500/5' }

          return (
            <button
              key={day.date}
              onClick={() => setSelectedDay(selectedDay === day.date ? null : day.date)}
              className={`p-2 rounded-lg border ${borderColor} ${bgColor} transition-all hover:border-[#FF6600]/50 ${selectedDay === day.date ? 'ring-2 ring-[#FF6600]/50' : ''} ${day.isToday ? 'ring-1 ring-blue-500/50' : ''}`}
            >
              <div className="text-center">
                <p className="text-[10px] text-[#6B7280] uppercase">{day.weekday}</p>
                <p className={`text-sm font-bold ${day.isToday ? 'text-blue-400' : 'text-[#F0F2F5]'}`}>{day.dayNum}</p>
                {hasInvoices && (
                  <>
                    <div className="flex justify-center gap-0.5 mt-1">
                      {day.invoices.slice(0, 3).map((inv, idx) => (
                        <div key={idx} className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: inv.status === 'paid' ? '#22C55E' : getDueDateColor(inv.due_date) }} />
                      ))}
                    </div>
                    {totalDayAmount > 0 && <p className="text-[9px] font-mono text-amber-400 mt-0.5">{formatCurrency(totalDayAmount)}</p>}
                  </>
                )}
              </div>
            </button>
          )
        })}
      </div>

      {/* Selected day detail */}
      {selectedDay && (
        <Card>
          <h3 className="text-sm font-semibold text-[#F0F2F5] mb-3">
            Facturas del {formatDate(selectedDay, 'dd MMMM yyyy')}
          </h3>
          {selectedDayInvoices.length === 0 ? (
            <p className="text-xs text-[#4B5563] py-4 text-center">No hay facturas con vencimiento este dia</p>
          ) : (
            <div className="space-y-2">
              {selectedDayInvoices.map(inv => {
                const ds = getInvoiceDisplayStatus(inv)
                const sName = (inv.supplier as Supplier | undefined)?.name || 'Proveedor'
                return (
                  <div key={inv.id} className="flex items-center justify-between p-3 rounded-lg bg-[#0F1218]">
                    <div>
                      <p className="text-sm font-semibold text-[#F0F2F5]">{inv.number}</p>
                      <p className="text-xs text-[#6B7280]">{sName}</p>
                    </div>
                    <div className="text-right">
                      <p className="text-sm font-bold text-[#FF6600]">{formatCurrency(inv.total)}</p>
                      <Badge variant={INVOICE_STATUS[ds]?.variant || 'default'} size="sm">{INVOICE_STATUS[ds]?.label || ds}</Badge>
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </Card>
      )}

      {/* Legend */}
      <div className="flex flex-wrap gap-4 text-xs text-[#6B7280]">
        <div className="flex items-center gap-1.5"><div className="w-3 h-3 rounded-full bg-emerald-500" /> Pagada</div>
        <div className="flex items-center gap-1.5"><div className="w-3 h-3 rounded-full bg-amber-500" /> Pendiente</div>
        <div className="flex items-center gap-1.5"><div className="w-3 h-3 rounded-full bg-red-500" /> Vencida</div>
        <div className="flex items-center gap-1.5"><div className="w-3 h-3 rounded border border-blue-500" /> Hoy</div>
      </div>
    </div>
  )
}

// ===============================================================
// INTERCOMPANY TAB
// ===============================================================
function IntercompanyTab() {
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
        .from('tt_document_links')
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
              <div key={po.id as string} className="px-4 py-3 flex items-center gap-4 hover:bg-[#141820] transition-colors">
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
                  <p className="text-xs text-[#6B7280]">{po.supplier_name as string}</p>
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
              <div key={so.id as string} className="px-4 py-3 flex items-center gap-4 hover:bg-[#141820] transition-colors">
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
              {activeTab === 'facturas' && <FacturasCompraTab />}
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
