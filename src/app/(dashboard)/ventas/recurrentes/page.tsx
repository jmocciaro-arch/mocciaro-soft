'use client'

import { useState, useEffect, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useCompanyFilter } from '@/hooks/use-company-filter'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Select } from '@/components/ui/select'
import { Modal } from '@/components/ui/modal'
import { Badge } from '@/components/ui/badge'
import { KPICard } from '@/components/ui/kpi-card'
import { SearchBar } from '@/components/ui/search-bar'
import { useToast } from '@/components/ui/toast'
import { formatCurrency, formatDate } from '@/lib/utils'
import {
  RefreshCw, Plus, Loader2, Calendar, DollarSign,
  Play, Pause, Trash2, Edit3, Eye, X, ArrowLeft,
  FileText, Save, Copy,
} from 'lucide-react'

type Row = Record<string, unknown>

// ===============================================================
// TYPES
// ===============================================================
interface RecurringInvoice {
  id: string
  company_id: string | null
  client_id: string | null
  name: string
  description: string | null
  currency: string
  subtotal: number
  tax_rate: number
  tax_amount: number
  total: number
  frequency: string
  next_date: string | null
  end_date: string | null
  day_of_month: number | null
  payment_terms: string | null
  incoterm: string | null
  notes: string | null
  internal_notes: string | null
  active: boolean
  last_generated_at: string | null
  total_generated: number
  created_by: string | null
  created_at: string
  client?: { id: string; name: string; legal_name?: string; tax_id?: string }
}

interface RecurringItem {
  id?: string
  recurring_invoice_id?: string
  product_id: string | null
  sku: string
  description: string
  quantity: number
  unit_price: number
  discount_pct: number
  subtotal: number
  sort_order: number
}

// ===============================================================
// CONSTANTS
// ===============================================================
const FREQUENCY_MAP: Record<string, { label: string; variant: 'default' | 'success' | 'warning' | 'danger' | 'info' | 'orange'; months: number }> = {
  weekly: { label: 'Semanal', variant: 'info', months: 0.25 },
  biweekly: { label: 'Quincenal', variant: 'info', months: 0.5 },
  monthly: { label: 'Mensual', variant: 'success', months: 1 },
  quarterly: { label: 'Trimestral', variant: 'warning', months: 3 },
  semiannual: { label: 'Semestral', variant: 'orange', months: 6 },
  annual: { label: 'Anual', variant: 'danger', months: 12 },
}

const FREQUENCY_OPTIONS = [
  { value: 'weekly', label: 'Semanal' },
  { value: 'biweekly', label: 'Quincenal' },
  { value: 'monthly', label: 'Mensual' },
  { value: 'quarterly', label: 'Trimestral' },
  { value: 'semiannual', label: 'Semestral' },
  { value: 'annual', label: 'Anual' },
]

// ===============================================================
// HELPER: calculate next date from frequency
// ===============================================================
function calculateNextDate(currentDate: string, frequency: string): string {
  const d = new Date(currentDate)
  switch (frequency) {
    case 'weekly': d.setDate(d.getDate() + 7); break
    case 'biweekly': d.setDate(d.getDate() + 14); break
    case 'monthly': d.setMonth(d.getMonth() + 1); break
    case 'quarterly': d.setMonth(d.getMonth() + 3); break
    case 'semiannual': d.setMonth(d.getMonth() + 6); break
    case 'annual': d.setFullYear(d.getFullYear() + 1); break
  }
  return d.toISOString().split('T')[0]
}

// ===============================================================
// MAIN PAGE
// ===============================================================
export default function RecurrentesPage() {
  const { filterByCompany, companyKey, defaultCompanyId } = useCompanyFilter()
  const { addToast } = useToast()

  // List state
  const [subscriptions, setSubscriptions] = useState<RecurringInvoice[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [filterActive, setFilterActive] = useState<'all' | 'active' | 'paused'>('all')

  // Modal state
  const [showForm, setShowForm] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  // Detail state
  const [selectedSub, setSelectedSub] = useState<RecurringInvoice | null>(null)
  const [subItems, setSubItems] = useState<RecurringItem[]>([])
  const [generatedInvoices, setGeneratedInvoices] = useState<Row[]>([])
  const [loadingDetail, setLoadingDetail] = useState(false)

  // Form state
  const [formData, setFormData] = useState({
    name: '',
    description: '',
    client_id: '',
    frequency: 'monthly',
    day_of_month: 1,
    next_date: new Date().toISOString().split('T')[0],
    end_date: '',
    tax_rate: 21,
    payment_terms: '30 dias',
    incoterm: '',
    notes: '',
    internal_notes: '',
    currency: 'EUR',
  })
  const [formItems, setFormItems] = useState<RecurringItem[]>([])

  // Lookup data
  const [clients, setClients] = useState<Row[]>([])
  const [clientSearch, setClientSearch] = useState('')
  const [clientsLoading, setClientsLoading] = useState(false)
  const [products, setProducts] = useState<Row[]>([])

  // Generating state
  const [generating, setGenerating] = useState<string | null>(null)

  // ─── LOAD SUBSCRIPTIONS ────────────────────────────────────
  const loadSubscriptions = useCallback(async () => {
    setLoading(true)
    const sb = createClient()
    let q = sb
      .from('tt_recurring_invoices')
      .select('*, client:tt_clients(id, name, legal_name, tax_id)')
    q = filterByCompany(q)
    const { data, error } = await q.order('created_at', { ascending: false })
    if (error) {
      addToast({ type: 'error', title: 'Error al cargar suscripciones', message: error.message })
    }
    setSubscriptions((data || []) as RecurringInvoice[])
    setLoading(false)
  }, [companyKey])

  useEffect(() => { loadSubscriptions() }, [loadSubscriptions])

  // ─── SEARCH CLIENTS (async) ────────────────────────────────
  const searchClients = useCallback(async (term: string) => {
    setClientSearch(term)
    if (term.length < 2) { setClients([]); return }
    setClientsLoading(true)
    const sb = createClient()
    const { data } = await sb
      .from('tt_clients')
      .select('id, name, legal_name, tax_id')
      .or(`name.ilike.%${term}%,legal_name.ilike.%${term}%,tax_id.ilike.%${term}%`)
      .order('name')
      .limit(20)
    setClients(data || [])
    setClientsLoading(false)
  }, [])

  // ─── LOAD PRODUCTS ────────────────────────────────────────
  const loadProducts = useCallback(async () => {
    const sb = createClient()
    const { data } = await sb
      .from('tt_products')
      .select('id, sku, name, price_eur')
      .order('name')
      .limit(500)
    setProducts(data || [])
  }, [])

  // ─── OPEN CREATE MODAL ─────────────────────────────────────
  const openCreate = () => {
    setEditingId(null)
    setFormData({
      name: '',
      description: '',
      client_id: '',
      frequency: 'monthly',
      day_of_month: 1,
      next_date: new Date().toISOString().split('T')[0],
      end_date: '',
      tax_rate: 21,
      payment_terms: '30 dias',
      incoterm: '',
      notes: '',
      internal_notes: '',
      currency: 'EUR',
    })
    setFormItems([])
    setClientSearch('')
    setClients([])
    loadProducts()
    setShowForm(true)
  }

  // ─── OPEN EDIT MODAL ──────────────────────────────────────
  const openEdit = useCallback(async (sub: RecurringInvoice) => {
    setEditingId(sub.id)
    setFormData({
      name: sub.name || '',
      description: sub.description || '',
      client_id: sub.client_id || '',
      frequency: sub.frequency || 'monthly',
      day_of_month: sub.day_of_month || 1,
      next_date: sub.next_date || new Date().toISOString().split('T')[0],
      end_date: sub.end_date || '',
      tax_rate: sub.tax_rate || 21,
      payment_terms: sub.payment_terms || '30 dias',
      incoterm: sub.incoterm || '',
      notes: sub.notes || '',
      internal_notes: sub.internal_notes || '',
      currency: sub.currency || 'EUR',
    })
    // Set client search to current client name
    const clientName = sub.client?.legal_name || sub.client?.name || ''
    setClientSearch(clientName)
    if (clientName) {
      setClients([{ id: sub.client_id, name: sub.client?.name, legal_name: sub.client?.legal_name, tax_id: sub.client?.tax_id }])
    }
    // Load items
    const sb = createClient()
    const { data: items } = await sb
      .from('tt_recurring_invoice_items')
      .select('*')
      .eq('recurring_invoice_id', sub.id)
      .order('sort_order')
    setFormItems((items || []) as RecurringItem[])
    loadProducts()
    setShowForm(true)
  }, [])

  // ─── RECALC FORM TOTALS ────────────────────────────────────
  const formSubtotal = formItems.reduce((s, item) => {
    const disc = item.discount_pct || 0
    return s + (item.quantity * item.unit_price * (1 - disc / 100))
  }, 0)
  const formTaxAmount = formSubtotal * (formData.tax_rate / 100)
  const formTotal = formSubtotal + formTaxAmount

  // ─── ADD ITEM LINE ─────────────────────────────────────────
  const addItemLine = () => {
    setFormItems([...formItems, {
      product_id: null,
      sku: '',
      description: '',
      quantity: 1,
      unit_price: 0,
      discount_pct: 0,
      subtotal: 0,
      sort_order: formItems.length,
    }])
  }

  // ─── UPDATE ITEM ───────────────────────────────────────────
  const updateItem = (index: number, field: string, value: unknown) => {
    const updated = [...formItems]
    const item = { ...updated[index], [field]: value }
    // Auto-calc subtotal
    item.subtotal = item.quantity * item.unit_price * (1 - (item.discount_pct || 0) / 100)
    updated[index] = item
    setFormItems(updated)
  }

  // ─── SELECT PRODUCT FOR ITEM ──────────────────────────────
  const selectProduct = (index: number, productId: string) => {
    const product = products.find(p => p.id === productId) as Row | undefined
    if (!product) return
    const updated = [...formItems]
    updated[index] = {
      ...updated[index],
      product_id: productId,
      sku: (product.sku || '') as string,
      description: (product.name || '') as string,
      unit_price: (product.price_eur || 0) as number,
      subtotal: updated[index].quantity * ((product.price_eur || 0) as number),
    }
    setFormItems(updated)
  }

  // ─── SAVE (CREATE or UPDATE) ──────────────────────────────
  const handleSave = useCallback(async () => {
    if (!formData.name.trim()) {
      addToast({ type: 'warning', title: 'El nombre es obligatorio' })
      return
    }
    if (!formData.client_id) {
      addToast({ type: 'warning', title: 'Selecciona un cliente' })
      return
    }
    if (formItems.length === 0) {
      addToast({ type: 'warning', title: 'Agrega al menos un item' })
      return
    }
    setSaving(true)
    const sb = createClient()
    const payload = {
      company_id: defaultCompanyId,
      client_id: formData.client_id,
      name: formData.name.trim(),
      description: formData.description.trim() || null,
      currency: formData.currency,
      subtotal: formSubtotal,
      tax_rate: formData.tax_rate,
      tax_amount: formTaxAmount,
      total: formTotal,
      frequency: formData.frequency,
      next_date: formData.next_date || null,
      end_date: formData.end_date || null,
      day_of_month: formData.day_of_month,
      payment_terms: formData.payment_terms || null,
      incoterm: formData.incoterm || null,
      notes: formData.notes || null,
      internal_notes: formData.internal_notes || null,
      active: true,
    }

    let subId = editingId
    if (editingId) {
      // UPDATE
      const { error } = await sb
        .from('tt_recurring_invoices')
        .update(payload)
        .eq('id', editingId)
      if (error) {
        addToast({ type: 'error', title: 'Error al actualizar', message: error.message })
        setSaving(false)
        return
      }
      // Delete old items and reinsert
      await sb.from('tt_recurring_invoice_items').delete().eq('recurring_invoice_id', editingId)
    } else {
      // CREATE
      const { data, error } = await sb
        .from('tt_recurring_invoices')
        .insert(payload)
        .select()
        .single()
      if (error || !data) {
        addToast({ type: 'error', title: 'Error al crear', message: error?.message })
        setSaving(false)
        return
      }
      subId = data.id
    }

    // Insert items
    if (subId && formItems.length > 0) {
      const itemPayloads = formItems.map((item, i) => ({
        recurring_invoice_id: subId,
        product_id: item.product_id || null,
        sku: item.sku || '',
        description: item.description || '',
        quantity: item.quantity,
        unit_price: item.unit_price,
        discount_pct: item.discount_pct || 0,
        subtotal: item.quantity * item.unit_price * (1 - (item.discount_pct || 0) / 100),
        sort_order: i,
      }))
      const { error: itemsError } = await sb.from('tt_recurring_invoice_items').insert(itemPayloads)
      if (itemsError) {
        addToast({ type: 'error', title: 'Error al guardar items', message: itemsError.message })
      }
    }

    addToast({ type: 'success', title: editingId ? 'Suscripcion actualizada' : 'Suscripcion creada' })
    setShowForm(false)
    setSaving(false)
    loadSubscriptions()
  }, [formData, formItems, editingId, defaultCompanyId, formSubtotal, formTaxAmount, formTotal])

  // ─── TOGGLE ACTIVE ─────────────────────────────────────────
  const toggleActive = useCallback(async (sub: RecurringInvoice) => {
    const sb = createClient()
    const { error } = await sb
      .from('tt_recurring_invoices')
      .update({ active: !sub.active })
      .eq('id', sub.id)
    if (error) {
      addToast({ type: 'error', title: 'Error', message: error.message })
      return
    }
    addToast({ type: 'success', title: sub.active ? 'Suscripcion pausada' : 'Suscripcion activada' })
    loadSubscriptions()
  }, [])

  // ─── DELETE ────────────────────────────────────────────────
  const handleDelete = useCallback(async (id: string) => {
    if (!confirm('Seguro que queres eliminar esta suscripcion?')) return
    const sb = createClient()
    await sb.from('tt_recurring_invoice_items').delete().eq('recurring_invoice_id', id)
    const { error } = await sb.from('tt_recurring_invoices').delete().eq('id', id)
    if (error) {
      addToast({ type: 'error', title: 'Error al eliminar', message: error.message })
      return
    }
    addToast({ type: 'success', title: 'Suscripcion eliminada' })
    if (selectedSub?.id === id) setSelectedSub(null)
    loadSubscriptions()
  }, [selectedSub])

  // ─── LOAD DETAIL ───────────────────────────────────────────
  const loadDetail = useCallback(async (id: string) => {
    setLoadingDetail(true)
    const sb = createClient()
    const [{ data: sub }, { data: items }, { data: invoices }] = await Promise.all([
      sb.from('tt_recurring_invoices')
        .select('*, client:tt_clients(id, name, legal_name, tax_id)')
        .eq('id', id)
        .single(),
      sb.from('tt_recurring_invoice_items')
        .select('*')
        .eq('recurring_invoice_id', id)
        .order('sort_order'),
      sb.from('tt_documents')
        .select('id, display_ref, system_code, status, total, created_at')
        .eq('doc_type', 'factura')
        .ilike('internal_notes', `%${id}%`)
        .order('created_at', { ascending: false })
        .limit(50),
    ])
    if (sub) setSelectedSub(sub as RecurringInvoice)
    setSubItems((items || []) as RecurringItem[])
    setGeneratedInvoices(invoices || [])
    setLoadingDetail(false)
  }, [])

  // ─── GENERATE INVOICE ──────────────────────────────────────
  const generateInvoice = useCallback(async (sub: RecurringInvoice) => {
    setGenerating(sub.id)
    const sb = createClient()

    // Load recurring items
    const { data: recItems } = await sb
      .from('tt_recurring_invoice_items')
      .select('*')
      .eq('recurring_invoice_id', sub.id)
      .order('sort_order')

    // Generate doc number
    const yr = new Date().getFullYear().toString().slice(-2)
    const mo = (new Date().getMonth() + 1).toString().padStart(2, '0')
    const seq = Math.floor(Math.random() * 9999).toString().padStart(4, '0')
    const docNum = `FAC-${yr}${mo}-${seq}`

    // Create document
    const { data: doc, error: docError } = await sb
      .from('tt_documents')
      .insert({
        company_id: sub.company_id,
        client_id: sub.client_id,
        doc_type: 'factura',
        display_ref: docNum,
        system_code: docNum,
        status: 'draft',
        currency: sub.currency || 'EUR',
        subtotal: sub.subtotal,
        tax_pct: sub.tax_rate,
        tax_amount: sub.tax_amount,
        total: sub.total,
        payment_terms: sub.payment_terms,
        incoterm: sub.incoterm,
        notes: sub.notes,
        internal_notes: `Generada automaticamente desde suscripcion: ${sub.name}`,
      })
      .select()
      .single()

    if (docError || !doc) {
      addToast({ type: 'error', title: 'Error al generar factura', message: docError?.message })
      setGenerating(null)
      return
    }

    // Copy items to tt_document_lines
    if (recItems && recItems.length > 0) {
      const docItems = recItems.map((item: Row, i: number) => ({
        document_id: doc.id,
        product_id: item.product_id || null,
        sku: item.sku || '',
        description: item.description || '',
        quantity: item.quantity,
        unit_price: item.unit_price,
        discount_pct: item.discount_pct || 0,
        line_total: (item.quantity as number) * (item.unit_price as number) * (1 - ((item.discount_pct as number) || 0) / 100),
        sort_order: i,
      }))
      await sb.from('tt_document_lines').insert(docItems)
    }

    // Update recurring invoice: next_date, total_generated, last_generated_at
    const nextDate = calculateNextDate(sub.next_date || new Date().toISOString().split('T')[0], sub.frequency)
    await sb
      .from('tt_recurring_invoices')
      .update({
        next_date: nextDate,
        last_generated_at: new Date().toISOString(),
        total_generated: (sub.total_generated || 0) + 1,
      })
      .eq('id', sub.id)

    addToast({ type: 'success', title: 'Factura generada', message: docNum })
    setGenerating(null)
    loadSubscriptions()

    // Refresh detail if viewing
    if (selectedSub?.id === sub.id) {
      loadDetail(sub.id)
    }
  }, [selectedSub, loadDetail])

  // ─── KPIs ──────────────────────────────────────────────────
  const activeSubs = subscriptions.filter(s => s.active)
  const mrr = activeSubs.reduce((sum, s) => {
    const freq = FREQUENCY_MAP[s.frequency]
    if (!freq) return sum
    return sum + (s.total / freq.months)
  }, 0)
  const nextPending = activeSubs
    .filter(s => s.next_date)
    .sort((a, b) => new Date(a.next_date!).getTime() - new Date(b.next_date!).getTime())[0]

  // ─── FILTER + SEARCH ──────────────────────────────────────
  const filtered = subscriptions.filter(s => {
    if (filterActive === 'active' && !s.active) return false
    if (filterActive === 'paused' && s.active) return false
    if (search) {
      const term = search.toLowerCase()
      const clientName = (s.client?.legal_name || s.client?.name || '').toLowerCase()
      return (
        s.name.toLowerCase().includes(term) ||
        clientName.includes(term) ||
        (s.description || '').toLowerCase().includes(term)
      )
    }
    return true
  })

  // ─── DETAIL VIEW ──────────────────────────────────────────
  if (selectedSub) {
    return (
      <div className="space-y-6 animate-fade-in">
        <div className="flex items-center gap-3">
          <button
            onClick={() => setSelectedSub(null)}
            className="p-2 rounded-lg hover:bg-[#1E2330] text-[#6B7280] hover:text-[#F0F2F5] transition-colors"
          >
            <ArrowLeft size={20} />
          </button>
          <div className="flex-1">
            <h1 className="text-2xl font-bold text-[#F0F2F5]">{selectedSub.name}</h1>
            <p className="text-sm text-[#6B7280]">
              {selectedSub.client?.legal_name || selectedSub.client?.name || 'Sin cliente'}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Badge variant={selectedSub.active ? 'success' : 'default'}>
              {selectedSub.active ? 'Activa' : 'Pausada'}
            </Badge>
            <Badge variant={FREQUENCY_MAP[selectedSub.frequency]?.variant || 'default'}>
              {FREQUENCY_MAP[selectedSub.frequency]?.label || selectedSub.frequency}
            </Badge>
            <Button
              variant="primary"
              size="sm"
              onClick={() => generateInvoice(selectedSub)}
              loading={generating === selectedSub.id}
              disabled={!selectedSub.active}
            >
              <FileText size={14} /> Generar factura
            </Button>
            <Button variant="secondary" size="sm" onClick={() => openEdit(selectedSub)}>
              <Edit3 size={14} /> Editar
            </Button>
          </div>
        </div>

        {/* Detail cards */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="rounded-xl bg-[#141820] border border-[#1E2330] p-5">
            <p className="text-sm text-[#6B7280] mb-1">Importe total</p>
            <p className="text-2xl font-bold text-[#F0F2F5]">{formatCurrency(selectedSub.total, selectedSub.currency as 'EUR' | 'USD' | 'ARS')}</p>
            <p className="text-xs text-[#4B5563] mt-1">
              Subtotal: {formatCurrency(selectedSub.subtotal, selectedSub.currency as 'EUR' | 'USD' | 'ARS')} + IVA {selectedSub.tax_rate}%
            </p>
          </div>
          <div className="rounded-xl bg-[#141820] border border-[#1E2330] p-5">
            <p className="text-sm text-[#6B7280] mb-1">Proxima generacion</p>
            <p className="text-2xl font-bold text-[#F0F2F5]">
              {selectedSub.next_date ? formatDate(selectedSub.next_date) : 'Sin fecha'}
            </p>
            <p className="text-xs text-[#4B5563] mt-1">
              Dia del mes: {selectedSub.day_of_month || '-'}
              {selectedSub.end_date && ` | Finaliza: ${formatDate(selectedSub.end_date)}`}
            </p>
          </div>
          <div className="rounded-xl bg-[#141820] border border-[#1E2330] p-5">
            <p className="text-sm text-[#6B7280] mb-1">Facturas generadas</p>
            <p className="text-2xl font-bold text-[#F0F2F5]">{selectedSub.total_generated || 0}</p>
            <p className="text-xs text-[#4B5563] mt-1">
              Ultima: {selectedSub.last_generated_at ? formatDate(selectedSub.last_generated_at) : 'Nunca'}
            </p>
          </div>
        </div>

        {/* Items table */}
        <div className="rounded-xl bg-[#141820] border border-[#1E2330] overflow-hidden">
          <div className="px-5 py-3 border-b border-[#1E2330]">
            <h3 className="text-sm font-semibold text-[#F0F2F5]">Items de la suscripcion</h3>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-[#1E2330] text-[#6B7280]">
                  <th className="text-left px-5 py-2 font-medium">SKU</th>
                  <th className="text-left px-5 py-2 font-medium">Descripcion</th>
                  <th className="text-right px-5 py-2 font-medium">Cant.</th>
                  <th className="text-right px-5 py-2 font-medium">Precio</th>
                  <th className="text-right px-5 py-2 font-medium">Dto%</th>
                  <th className="text-right px-5 py-2 font-medium">Subtotal</th>
                </tr>
              </thead>
              <tbody>
                {loadingDetail ? (
                  <tr><td colSpan={6} className="text-center py-8"><Loader2 className="animate-spin mx-auto text-[#FF6600]" size={20} /></td></tr>
                ) : subItems.length === 0 ? (
                  <tr><td colSpan={6} className="text-center py-8 text-[#4B5563]">Sin items</td></tr>
                ) : subItems.map((item, i) => (
                  <tr key={i} className="border-b border-[#1E2330]/50 text-[#F0F2F5]">
                    <td className="px-5 py-2 text-[#6B7280]">{item.sku || '-'}</td>
                    <td className="px-5 py-2">{item.description}</td>
                    <td className="px-5 py-2 text-right">{item.quantity}</td>
                    <td className="px-5 py-2 text-right">{formatCurrency(item.unit_price)}</td>
                    <td className="px-5 py-2 text-right">{item.discount_pct || 0}%</td>
                    <td className="px-5 py-2 text-right font-medium">{formatCurrency(item.subtotal)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* Generated invoices history */}
        <div className="rounded-xl bg-[#141820] border border-[#1E2330] overflow-hidden">
          <div className="px-5 py-3 border-b border-[#1E2330]">
            <h3 className="text-sm font-semibold text-[#F0F2F5]">Historial de facturas generadas</h3>
          </div>
          {generatedInvoices.length === 0 ? (
            <div className="px-5 py-8 text-center text-[#4B5563] text-sm">Aun no se generaron facturas</div>
          ) : (
            <div className="divide-y divide-[#1E2330]/50">
              {generatedInvoices.map((inv) => (
                <div key={inv.id as string} className="flex items-center justify-between px-5 py-3 hover:bg-[#0F1218] transition-colors">
                  <div className="flex items-center gap-3">
                    <FileText size={16} className="text-[#6B7280]" />
                    <div>
                      <p className="text-sm font-medium text-[#F0F2F5]">{(inv.display_ref as string) || (inv.system_code as string) || 'S/N'}</p>
                      <p className="text-xs text-[#6B7280]">{inv.created_at ? formatDate(inv.created_at as string) : ''}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="text-sm font-medium text-[#F0F2F5]">{formatCurrency((inv.total as number) || 0)}</span>
                    <Badge variant={inv.status === 'paid' || inv.status === 'pagada' ? 'success' : 'info'} size="sm">
                      {(inv.status as string) || 'Borrador'}
                    </Badge>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Notes */}
        {(selectedSub.notes || selectedSub.internal_notes || selectedSub.payment_terms) && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {selectedSub.notes && (
              <div className="rounded-xl bg-[#141820] border border-[#1E2330] p-5">
                <p className="text-sm font-semibold text-[#F0F2F5] mb-2">Notas</p>
                <p className="text-sm text-[#9CA3AF] whitespace-pre-wrap">{selectedSub.notes}</p>
              </div>
            )}
            {selectedSub.internal_notes && (
              <div className="rounded-xl bg-[#141820] border border-[#1E2330] p-5">
                <p className="text-sm font-semibold text-[#F0F2F5] mb-2">Notas internas</p>
                <p className="text-sm text-[#9CA3AF] whitespace-pre-wrap">{selectedSub.internal_notes}</p>
              </div>
            )}
          </div>
        )}
      </div>
    )
  }

  // ─── LIST VIEW ─────────────────────────────────────────────
  return (
    <div className="space-y-6 animate-fade-in">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-[#F0F2F5]">Facturacion Recurrente</h1>
          <p className="text-sm text-[#6B7280] mt-1">Gestiona tus suscripciones y facturas periodicas</p>
        </div>
        <Button onClick={openCreate}>
          <Plus size={16} /> Nueva suscripcion
        </Button>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <KPICard
          label="Suscripciones activas"
          value={activeSubs.length}
          icon={<RefreshCw size={22} />}
          color="#10B981"
        />
        <KPICard
          label="MRR (Ingreso Mensual Recurrente)"
          value={formatCurrency(mrr)}
          icon={<DollarSign size={22} />}
          color="#FF6600"
        />
        <KPICard
          label="Proxima generacion"
          value={nextPending?.next_date ? formatDate(nextPending.next_date) : 'Sin pendientes'}
          icon={<Calendar size={22} />}
          color="#3B82F6"
        />
      </div>

      {/* Search + Filters */}
      <div className="flex items-center gap-3">
        <SearchBar
          placeholder="Buscar por nombre, cliente..."
          value={search}
          onChange={setSearch}
          className="flex-1 max-w-md"
        />
        <div className="flex gap-1 p-1 bg-[#0F1218] rounded-lg border border-[#1E2330]">
          {(['all', 'active', 'paused'] as const).map(f => (
            <button
              key={f}
              onClick={() => setFilterActive(f)}
              className={`px-3 py-1.5 text-xs font-medium rounded-md transition-all ${
                filterActive === f
                  ? 'bg-[#1E2330] text-[#FF6600]'
                  : 'text-[#6B7280] hover:text-[#9CA3AF]'
              }`}
            >
              {f === 'all' ? 'Todas' : f === 'active' ? 'Activas' : 'Pausadas'}
            </button>
          ))}
        </div>
      </div>

      {/* Cards grid */}
      {loading ? (
        <div className="flex justify-center py-20">
          <Loader2 className="animate-spin text-[#FF6600]" size={32} />
        </div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-20">
          <RefreshCw size={48} className="mx-auto text-[#2A3040] mb-4" />
          <p className="text-[#6B7280]">No hay suscripciones recurrentes</p>
          <p className="text-[#4B5563] text-sm mt-1">Crea tu primera suscripcion para automatizar la facturacion</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {filtered.map(sub => {
            const clientName = sub.client?.legal_name || sub.client?.name || 'Sin cliente'
            const freq = FREQUENCY_MAP[sub.frequency]
            const isPastDue = sub.next_date && new Date(sub.next_date) < new Date()
            return (
              <div
                key={sub.id}
                className="rounded-xl bg-[#141820] border border-[#1E2330] hover:border-[#2A3040] transition-all duration-200 overflow-hidden group"
              >
                {/* Card header */}
                <div className="px-5 pt-4 pb-3">
                  <div className="flex items-start justify-between mb-2">
                    <div className="flex-1 min-w-0">
                      <h3
                        className="text-sm font-semibold text-[#F0F2F5] truncate cursor-pointer hover:text-[#FF6600] transition-colors"
                        onClick={() => loadDetail(sub.id)}
                      >
                        {sub.name}
                      </h3>
                      <p className="text-xs text-[#6B7280] truncate mt-0.5">{clientName}</p>
                    </div>
                    <div className="flex items-center gap-1.5 ml-2">
                      <Badge variant={freq?.variant || 'default'} size="sm">
                        {freq?.label || sub.frequency}
                      </Badge>
                      <Badge variant={sub.active ? 'success' : 'default'} size="sm">
                        {sub.active ? 'Activa' : 'Pausada'}
                      </Badge>
                    </div>
                  </div>
                  {sub.description && (
                    <p className="text-xs text-[#4B5563] truncate">{sub.description}</p>
                  )}
                </div>

                {/* Card body */}
                <div className="px-5 py-3 border-t border-[#1E2330]/50">
                  <div className="grid grid-cols-3 gap-3 text-center">
                    <div>
                      <p className="text-lg font-bold text-[#F0F2F5]">{formatCurrency(sub.total, sub.currency as 'EUR' | 'USD' | 'ARS')}</p>
                      <p className="text-[10px] text-[#4B5563]">Total</p>
                    </div>
                    <div>
                      <p className={`text-lg font-bold ${isPastDue ? 'text-red-400' : 'text-[#F0F2F5]'}`}>
                        {sub.next_date ? formatDate(sub.next_date, 'dd/MM') : '-'}
                      </p>
                      <p className="text-[10px] text-[#4B5563]">Proxima</p>
                    </div>
                    <div>
                      <p className="text-lg font-bold text-[#F0F2F5]">{sub.total_generated || 0}</p>
                      <p className="text-[10px] text-[#4B5563]">Generadas</p>
                    </div>
                  </div>
                </div>

                {/* Card actions */}
                <div className="px-4 py-2.5 border-t border-[#1E2330]/50 flex items-center justify-between">
                  <div className="flex items-center gap-1">
                    <button
                      onClick={(e) => { e.stopPropagation(); toggleActive(sub) }}
                      className="p-1.5 rounded-lg hover:bg-[#1E2330] text-[#6B7280] hover:text-[#F0F2F5] transition-colors"
                      title={sub.active ? 'Pausar' : 'Activar'}
                    >
                      {sub.active ? <Pause size={14} /> : <Play size={14} />}
                    </button>
                    <button
                      onClick={(e) => { e.stopPropagation(); openEdit(sub) }}
                      className="p-1.5 rounded-lg hover:bg-[#1E2330] text-[#6B7280] hover:text-[#F0F2F5] transition-colors"
                      title="Editar"
                    >
                      <Edit3 size={14} />
                    </button>
                    <button
                      onClick={(e) => { e.stopPropagation(); loadDetail(sub.id) }}
                      className="p-1.5 rounded-lg hover:bg-[#1E2330] text-[#6B7280] hover:text-[#F0F2F5] transition-colors"
                      title="Ver detalle"
                    >
                      <Eye size={14} />
                    </button>
                    <button
                      onClick={(e) => { e.stopPropagation(); handleDelete(sub.id) }}
                      className="p-1.5 rounded-lg hover:bg-[#1E2330] text-[#6B7280] hover:text-red-400 transition-colors"
                      title="Eliminar"
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                  <Button
                    size="sm"
                    variant="primary"
                    onClick={(e) => { e.stopPropagation(); generateInvoice(sub) }}
                    loading={generating === sub.id}
                    disabled={!sub.active}
                  >
                    <Copy size={12} /> Generar
                  </Button>
                </div>
              </div>
            )
          })}
        </div>
      )}

      {/* CREATE / EDIT MODAL */}
      <Modal
        isOpen={showForm}
        onClose={() => setShowForm(false)}
        title={editingId ? 'Editar suscripcion' : 'Nueva suscripcion recurrente'}
        size="xl"
      >
        <div className="space-y-6">
          {/* Client search */}
          <div>
            <label className="block text-sm font-medium text-[#9CA3AF] mb-1.5">Cliente *</label>
            <div className="relative">
              <SearchBar
                placeholder="Buscar cliente por nombre, razon social o CIF..."
                value={clientSearch}
                onChange={(v) => {
                  searchClients(v)
                  if (!v) setFormData({ ...formData, client_id: '' })
                }}
              />
              {clientsLoading && (
                <Loader2 size={14} className="animate-spin absolute right-3 top-3 text-[#6B7280]" />
              )}
              {clients.length > 0 && clientSearch.length >= 2 && !formData.client_id && (
                <div className="absolute z-20 w-full mt-1 bg-[#141820] border border-[#1E2330] rounded-lg shadow-xl max-h-48 overflow-y-auto">
                  {clients.map(c => (
                    <button
                      key={c.id as string}
                      onClick={() => {
                        setFormData({ ...formData, client_id: c.id as string })
                        setClientSearch((c.legal_name as string) || (c.name as string) || '')
                        setClients([])
                      }}
                      className="w-full text-left px-4 py-2.5 hover:bg-[#1E2330] transition-colors"
                    >
                      <p className="text-sm text-[#F0F2F5]">{(c.legal_name as string) || (c.name as string)}</p>
                      <p className="text-xs text-[#6B7280]">{(c.tax_id as string) || ''}</p>
                    </button>
                  ))}
                </div>
              )}
              {formData.client_id && (
                <div className="flex items-center gap-2 mt-2">
                  <Badge variant="success" size="sm">Cliente seleccionado</Badge>
                  <button
                    onClick={() => {
                      setFormData({ ...formData, client_id: '' })
                      setClientSearch('')
                    }}
                    className="text-[#6B7280] hover:text-red-400"
                  >
                    <X size={14} />
                  </button>
                </div>
              )}
            </div>
          </div>

          {/* Name + Description */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Input
              label="Nombre *"
              value={formData.name}
              onChange={e => setFormData({ ...formData, name: e.target.value })}
              placeholder="Ej: Mantenimiento mensual, Licencia anual..."
            />
            <Input
              label="Descripcion"
              value={formData.description}
              onChange={e => setFormData({ ...formData, description: e.target.value })}
              placeholder="Descripcion breve"
            />
          </div>

          {/* Frequency + Dates */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <Select
              label="Frecuencia"
              options={FREQUENCY_OPTIONS}
              value={formData.frequency}
              onChange={e => setFormData({ ...formData, frequency: e.target.value })}
            />
            <Input
              label="Dia del mes"
              type="number"
              min={1}
              max={28}
              value={formData.day_of_month}
              onChange={e => setFormData({ ...formData, day_of_month: Number(e.target.value) })}
            />
            <Input
              label="Fecha inicio / Proxima"
              type="date"
              value={formData.next_date}
              onChange={e => setFormData({ ...formData, next_date: e.target.value })}
            />
            <Input
              label="Fecha fin (opcional)"
              type="date"
              value={formData.end_date}
              onChange={e => setFormData({ ...formData, end_date: e.target.value })}
            />
          </div>

          {/* Items table */}
          <div>
            <div className="flex items-center justify-between mb-3">
              <span className="text-sm font-semibold text-[#F0F2F5]">Items</span>
              <Button variant="ghost" size="sm" onClick={addItemLine}>
                <Plus size={14} /> Agregar linea
              </Button>
            </div>
            <div className="rounded-lg border border-[#1E2330] overflow-hidden">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-[#0F1218] text-[#6B7280] text-xs">
                    <th className="text-left px-3 py-2 font-medium w-[200px]">Producto</th>
                    <th className="text-left px-3 py-2 font-medium">Descripcion</th>
                    <th className="text-right px-3 py-2 font-medium w-[70px]">Cant.</th>
                    <th className="text-right px-3 py-2 font-medium w-[100px]">Precio</th>
                    <th className="text-right px-3 py-2 font-medium w-[60px]">Dto%</th>
                    <th className="text-right px-3 py-2 font-medium w-[100px]">Subtotal</th>
                    <th className="w-[40px]"></th>
                  </tr>
                </thead>
                <tbody>
                  {formItems.length === 0 ? (
                    <tr>
                      <td colSpan={7} className="text-center py-6 text-[#4B5563] text-xs">
                        Agrega items desde el catalogo o manualmente
                      </td>
                    </tr>
                  ) : formItems.map((item, i) => (
                    <tr key={i} className="border-t border-[#1E2330]/50">
                      <td className="px-2 py-1.5">
                        <select
                          className="w-full h-8 rounded bg-[#1E2330] border border-[#2A3040] px-2 text-xs text-[#F0F2F5] appearance-none"
                          value={item.product_id || ''}
                          onChange={e => selectProduct(i, e.target.value)}
                        >
                          <option value="">Manual</option>
                          {products.map(p => (
                            <option key={p.id as string} value={p.id as string}>
                              {(p.sku as string) || ''} - {(p.name as string)}
                            </option>
                          ))}
                        </select>
                      </td>
                      <td className="px-2 py-1.5">
                        <input
                          className="w-full h-8 rounded bg-[#1E2330] border border-[#2A3040] px-2 text-xs text-[#F0F2F5]"
                          value={item.description}
                          onChange={e => updateItem(i, 'description', e.target.value)}
                          placeholder="Descripcion"
                        />
                      </td>
                      <td className="px-2 py-1.5">
                        <input
                          type="number"
                          min={1}
                          className="w-full h-8 rounded bg-[#1E2330] border border-[#2A3040] px-2 text-xs text-[#F0F2F5] text-right"
                          value={item.quantity}
                          onChange={e => updateItem(i, 'quantity', Number(e.target.value))}
                        />
                      </td>
                      <td className="px-2 py-1.5">
                        <input
                          type="number"
                          min={0}
                          step={0.01}
                          className="w-full h-8 rounded bg-[#1E2330] border border-[#2A3040] px-2 text-xs text-[#F0F2F5] text-right"
                          value={item.unit_price}
                          onChange={e => updateItem(i, 'unit_price', Number(e.target.value))}
                        />
                      </td>
                      <td className="px-2 py-1.5">
                        <input
                          type="number"
                          min={0}
                          max={100}
                          className="w-full h-8 rounded bg-[#1E2330] border border-[#2A3040] px-2 text-xs text-[#F0F2F5] text-right"
                          value={item.discount_pct}
                          onChange={e => updateItem(i, 'discount_pct', Number(e.target.value))}
                        />
                      </td>
                      <td className="px-2 py-1.5 text-right text-xs text-[#F0F2F5] font-medium">
                        {formatCurrency(item.quantity * item.unit_price * (1 - (item.discount_pct || 0) / 100))}
                      </td>
                      <td className="px-1 py-1.5">
                        <button
                          onClick={() => setFormItems(formItems.filter((_, idx) => idx !== i))}
                          className="p-1 rounded hover:bg-red-500/10 text-[#6B7280] hover:text-red-400 transition-colors"
                        >
                          <X size={14} />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Totals */}
          <div className="flex justify-end">
            <div className="w-64 space-y-1 text-sm">
              <div className="flex justify-between text-[#9CA3AF]">
                <span>Subtotal:</span>
                <span className="text-[#F0F2F5] font-medium">{formatCurrency(formSubtotal)}</span>
              </div>
              <div className="flex justify-between items-center text-[#9CA3AF]">
                <div className="flex items-center gap-2">
                  <span>IVA</span>
                  <input
                    type="number"
                    className="w-14 h-6 rounded bg-[#1E2330] border border-[#2A3040] px-1 text-xs text-[#F0F2F5] text-center"
                    value={formData.tax_rate}
                    onChange={e => setFormData({ ...formData, tax_rate: Number(e.target.value) })}
                  />
                  <span>%:</span>
                </div>
                <span className="text-[#F0F2F5]">{formatCurrency(formTaxAmount)}</span>
              </div>
              <div className="flex justify-between border-t border-[#1E2330] pt-2">
                <span className="font-semibold text-[#F0F2F5]">Total:</span>
                <span className="font-bold text-[#FF6600] text-lg">{formatCurrency(formTotal)}</span>
              </div>
            </div>
          </div>

          {/* Extra fields */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <Input
              label="Condiciones de pago"
              value={formData.payment_terms}
              onChange={e => setFormData({ ...formData, payment_terms: e.target.value })}
              placeholder="Ej: 30 dias, contado..."
            />
            <Select
              label="Moneda"
              options={[
                { value: 'EUR', label: 'EUR' },
                { value: 'USD', label: 'USD' },
                { value: 'ARS', label: 'ARS' },
              ]}
              value={formData.currency}
              onChange={e => setFormData({ ...formData, currency: e.target.value })}
            />
            <Select
              label="Incoterm"
              options={[
                { value: '', label: 'Sin incoterm' },
                { value: 'EXW', label: 'EXW' },
                { value: 'FCA', label: 'FCA' },
                { value: 'DAP', label: 'DAP' },
                { value: 'DDP', label: 'DDP' },
                { value: 'FOB', label: 'FOB' },
                { value: 'CIF', label: 'CIF' },
              ]}
              value={formData.incoterm}
              onChange={e => setFormData({ ...formData, incoterm: e.target.value })}
            />
          </div>

          {/* Notes */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-[#9CA3AF] mb-1.5">Notas (visibles al cliente)</label>
              <textarea
                className="w-full h-20 rounded-lg bg-[#1E2330] border border-[#2A3040] px-3 py-2 text-sm text-[#F0F2F5] placeholder:text-[#4B5563] focus:outline-none focus:ring-2 focus:ring-orange-500/50 resize-none"
                value={formData.notes}
                onChange={e => setFormData({ ...formData, notes: e.target.value })}
                placeholder="Notas para el cliente..."
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-[#9CA3AF] mb-1.5">Notas internas</label>
              <textarea
                className="w-full h-20 rounded-lg bg-[#1E2330] border border-[#2A3040] px-3 py-2 text-sm text-[#F0F2F5] placeholder:text-[#4B5563] focus:outline-none focus:ring-2 focus:ring-orange-500/50 resize-none"
                value={formData.internal_notes}
                onChange={e => setFormData({ ...formData, internal_notes: e.target.value })}
                placeholder="Notas internas..."
              />
            </div>
          </div>

          {/* Footer actions */}
          <div className="flex justify-end gap-3 pt-4 border-t border-[#1E2330]">
            <Button variant="secondary" onClick={() => setShowForm(false)}>
              Cancelar
            </Button>
            <Button onClick={handleSave} loading={saving}>
              <Save size={14} /> {editingId ? 'Guardar cambios' : 'Crear suscripcion'}
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  )
}
