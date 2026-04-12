'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Select } from '@/components/ui/select'
import { Badge } from '@/components/ui/badge'
import { SearchBar } from '@/components/ui/search-bar'
import { Modal } from '@/components/ui/modal'
import { useToast } from '@/components/ui/toast'
import { createClient } from '@/lib/supabase/client'
import { formatCurrency, INCOTERMS } from '@/lib/utils'
import type { Company, Client } from '@/types'
import { DocumentDetailLayout, type WorkflowStep, type Alert, type InternalNote } from '@/components/workflow/document-detail-layout'
import { DocumentItemsTree, type DocumentItem, type DocumentItemComponent } from '@/components/workflow/document-items-tree'
import { DocumentListCard } from '@/components/workflow/document-list-card'
import {
  Plus, Minus, Trash2, Save, FileText,
  MessageSquare, Building2, User, Search, X, Loader2, Printer, List, PlusCircle
} from 'lucide-react'

interface QuoteLineItem {
  id: string
  product_id: string | null
  sku: string
  description: string
  quantity: number
  unitPrice: number
  discount: number
  notes: string
}

interface ProductSearchResult {
  id: string
  sku: string
  name: string
  brand: string
  price_eur: number
  cost_eur: string
  image_url: string | null
}

interface SavedQuote {
  id: string
  number: string
  status: string
  total: number
  currency: string
  created_at: string
  subtotal?: number
  tax_amount?: number
  tax_rate?: number
  notes?: string
  internal_notes?: string
  incoterm?: string
  client_id?: string
  company_id?: string
  client?: { name: string; tax_id?: string; country?: string } | null
  company?: { name: string; country?: string } | null
  items?: Array<{
    id: string
    sku: string
    description: string
    quantity: number
    unit_price: number
    discount_pct: number
    subtotal: number
    notes?: string
    product_id?: string
  }>
}

type ViewMode = 'create' | 'list' | 'detail'

export default function CotizadorPage() {
  const { addToast } = useToast()

  // View state
  const [viewMode, setViewMode] = useState<ViewMode>('create')
  const [selectedQuote, setSelectedQuote] = useState<SavedQuote | null>(null)

  // Companies from Supabase
  const [companies, setCompanies] = useState<Company[]>([])
  const [selectedCompanyId, setSelectedCompanyId] = useState('')
  const [currency, setCurrency] = useState<'EUR' | 'ARS' | 'USD'>('EUR')

  // Client
  const [clientSearch, setClientSearch] = useState('')
  const [clientResults, setClientResults] = useState<Client[]>([])
  const [selectedClient, setSelectedClient] = useState<Client | null>(null)
  const [showClientDropdown, setShowClientDropdown] = useState(false)
  const clientDebounceRef = useRef<NodeJS.Timeout | null>(null)

  // Quote
  const [quoteNumber, setQuoteNumber] = useState('')
  const [items, setItems] = useState<QuoteLineItem[]>([])
  const [notes, setNotes] = useState('')
  const [internalNotes, setInternalNotes] = useState('')
  const [incoterm, setIncoterm] = useState('')
  const [taxRate, setTaxRate] = useState(21)
  const [validUntil, setValidUntil] = useState('')
  const [saving, setSaving] = useState(false)

  // Product search modal
  const [showProductSearch, setShowProductSearch] = useState(false)
  const [productSearch, setProductSearch] = useState('')
  const [productResults, setProductResults] = useState<ProductSearchResult[]>([])
  const [searchingProducts, setSearchingProducts] = useState(false)
  const productDebounceRef = useRef<NodeJS.Timeout | null>(null)

  // Saved quotes list
  const [savedQuotes, setSavedQuotes] = useState<SavedQuote[]>([])
  const [loadingQuotes, setLoadingQuotes] = useState(false)
  const [listSearch, setListSearch] = useState('')

  // Load companies on mount
  useEffect(() => {
    loadCompanies()
    generateQuoteNumber()
    loadSavedQuotes()
    const d = new Date()
    d.setDate(d.getDate() + 30)
    setValidUntil(d.toISOString().split('T')[0])
  }, [])

  useEffect(() => {
    const comp = companies.find((c) => c.id === selectedCompanyId)
    if (comp) {
      setCurrency((comp.currency || 'EUR') as 'EUR' | 'ARS' | 'USD')
      setTaxRate(comp.default_tax_rate || 21)
    }
  }, [selectedCompanyId, companies])

  useEffect(() => {
    if (!clientSearch.trim()) { setClientResults([]); setShowClientDropdown(false); return }
    if (clientDebounceRef.current) clearTimeout(clientDebounceRef.current)
    clientDebounceRef.current = setTimeout(() => searchClients(clientSearch), 300)
    return () => { if (clientDebounceRef.current) clearTimeout(clientDebounceRef.current) }
  }, [clientSearch])

  useEffect(() => {
    if (!productSearch.trim()) { setProductResults([]); return }
    if (productDebounceRef.current) clearTimeout(productDebounceRef.current)
    productDebounceRef.current = setTimeout(() => searchProducts(productSearch), 300)
    return () => { if (productDebounceRef.current) clearTimeout(productDebounceRef.current) }
  }, [productSearch])

  async function loadCompanies() {
    const supabase = createClient()
    const { data } = await supabase.from('tt_companies').select('*').eq('active', true).order('name')
    if (data) {
      setCompanies(data as Company[])
      if (data.length > 0) setSelectedCompanyId(data[0].id)
    }
  }

  async function generateQuoteNumber() {
    const supabase = createClient()
    const year = new Date().getFullYear()
    const { data } = await supabase
      .from('tt_quotes')
      .select('number')
      .ilike('number', `COT-${year}-%`)
      .order('number', { ascending: false })
      .limit(1)
    let nextNum = 1
    if (data && data.length > 0) {
      const lastNum = data[0].number.split('-').pop()
      nextNum = (parseInt(lastNum || '0', 10) || 0) + 1
    }
    setQuoteNumber(`COT-${year}-${nextNum.toString().padStart(4, '0')}`)
  }

  async function searchClients(query: string) {
    const supabase = createClient()
    const { data } = await supabase
      .from('tt_clients')
      .select('*')
      .or(`name.ilike.%${query}%,legal_name.ilike.%${query}%,tax_id.ilike.%${query}%,email.ilike.%${query}%`)
      .eq('active', true)
      .limit(10)
    setClientResults((data || []) as Client[])
    setShowClientDropdown(true)
  }

  async function searchProducts(query: string) {
    setSearchingProducts(true)
    const supabase = createClient()
    const tokens = query.trim().toLowerCase().split(/\s+/)
    let q = supabase.from('tt_products').select('id, sku, name, brand, price_eur, cost_eur, image_url').eq('active', true).limit(20)
    for (const token of tokens) { q = q.or(`name.ilike.%${token}%,sku.ilike.%${token}%,brand.ilike.%${token}%`) }
    const { data } = await q
    setProductResults((data || []) as ProductSearchResult[])
    setSearchingProducts(false)
  }

  function addProductAsItem(product: ProductSearchResult) {
    setItems((prev) => [...prev, { id: Math.random().toString(36).slice(2), product_id: product.id, sku: product.sku, description: product.name, quantity: 1, unitPrice: product.price_eur, discount: 0, notes: '' }])
    setShowProductSearch(false)
    setProductSearch('')
    addToast({ type: 'success', title: 'Producto agregado', message: product.sku })
  }

  function addEmptyItem() {
    setItems((prev) => [...prev, { id: Math.random().toString(36).slice(2), product_id: null, sku: '', description: '', quantity: 1, unitPrice: 0, discount: 0, notes: '' }])
  }

  function removeItem(id: string) { setItems((prev) => prev.filter((i) => i.id !== id)) }
  function updateItem(id: string, field: keyof QuoteLineItem, value: string | number) { setItems((prev) => prev.map((i) => (i.id === id ? { ...i, [field]: value } : i))) }
  function updateQuantity(id: string, delta: number) { setItems((prev) => prev.map((i) => (i.id === id ? { ...i, quantity: Math.max(1, i.quantity + delta) } : i))) }

  const subtotal = items.reduce((sum, i) => sum + i.quantity * i.unitPrice * (1 - i.discount / 100), 0)
  const taxAmount = subtotal * (taxRate / 100)
  const total = subtotal + taxAmount

  async function saveQuote() {
    if (!selectedCompanyId) { addToast({ type: 'error', title: 'Selecciona una empresa emisora' }); return }
    if (items.length === 0) { addToast({ type: 'error', title: 'Agrega al menos un item' }); return }
    setSaving(true)
    const supabase = createClient()
    try {
      const { data: quoteData, error: quoteError } = await supabase
        .from('tt_quotes')
        .insert({ number: quoteNumber, company_id: selectedCompanyId, client_id: selectedClient?.id || null, user_id: (await supabase.from('tt_users').select('id').eq('role', 'admin').limit(1).single()).data?.id || null, status: 'borrador', notes, internal_notes: internalNotes, incoterm: incoterm || null, currency, subtotal, tax_rate: taxRate, tax_amount: taxAmount, total, valid_until: validUntil ? new Date(validUntil).toISOString() : null })
        .select('id').single()
      if (quoteError) throw quoteError
      const quoteItems = items.map((item, idx) => ({ quote_id: quoteData.id, product_id: item.product_id, sort_order: idx + 1, sku: item.sku, description: item.description, quantity: item.quantity, unit_price: item.unitPrice, discount_pct: item.discount, subtotal: item.quantity * item.unitPrice * (1 - item.discount / 100), notes: item.notes || null }))
      const { error: itemsError } = await supabase.from('tt_quote_items').insert(quoteItems)
      if (itemsError) throw itemsError
      await supabase.from('tt_activity_log').insert({ entity_type: 'quote', entity_id: quoteData.id, action: 'Cotizacion creada', detail: `${quoteNumber} - ${selectedClient?.name || 'Sin cliente'} - ${formatCurrency(total, currency)}` })
      addToast({ type: 'success', title: 'Cotizacion guardada', message: quoteNumber })
      setItems([]); setNotes(''); setInternalNotes(''); setSelectedClient(null); generateQuoteNumber(); loadSavedQuotes()
    } catch (err) {
      console.error('Error guardando cotizacion:', err)
      addToast({ type: 'error', title: 'Error al guardar', message: 'Revisa los datos e intenta de nuevo' })
    } finally { setSaving(false) }
  }

  async function loadSavedQuotes() {
    setLoadingQuotes(true)
    const supabase = createClient()
    // Load locally created quotes
    const { data: localData } = await supabase
      .from('tt_quotes')
      .select('id, number, status, total, currency, created_at, subtotal, tax_amount, tax_rate, notes, internal_notes, incoterm, client_id, company_id, client:tt_clients(name, tax_id, country), company:tt_companies(name, country)')
      .order('created_at', { ascending: false })
      .limit(50)

    // Load historical from tt_documents
    const { data: docData } = await supabase
      .from('tt_documents')
      .select('id, display_ref, system_code, status, total, currency, created_at, subtotal, tax_amount, notes, metadata')
      .eq('type', 'coti')
      .order('created_at', { ascending: false })
      .limit(50)

    const localQuotes = ((localData || []) as unknown as SavedQuote[]).map(q => ({
      ...q, _source: 'local' as string,
    }))

    const docQuotes: SavedQuote[] = (docData || []).map((d: Record<string, unknown>) => {
      const raw = (d.metadata as Record<string, unknown>)?.stelorder_raw as Record<string, unknown> | undefined
      const clientName = raw ? ((raw['account-name'] as string) || (raw['legal-name'] as string) || 'Sin cliente') : 'Sin cliente'
      return {
        id: d.id as string,
        number: (d.display_ref as string) || (d.system_code as string) || '-',
        status: (d.status as string) || 'closed',
        total: (d.total as number) || 0,
        currency: (d.currency as string) || 'EUR',
        created_at: d.created_at as string,
        subtotal: (d.subtotal as number) || 0,
        tax_amount: (d.tax_amount as number) || 0,
        notes: (d.notes as string) || '',
        client: { name: clientName },
        _source: 'tt_documents' as string,
      }
    })

    const merged = [...localQuotes, ...docQuotes]
      .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
    setSavedQuotes(merged as SavedQuote[])
    setLoadingQuotes(false)
  }

  async function openQuoteDetail(quote: SavedQuote) {
    const supabase = createClient()
    const isDoc = (quote as SavedQuote & { _source?: string })._source === 'tt_documents'
    if (isDoc) {
      // Load items from tt_document_items
      const { data: docItems } = await supabase
        .from('tt_document_items')
        .select('*')
        .eq('document_id', quote.id)
        .order('sort_order')
      const mappedItems = (docItems || []).map((it: Record<string, unknown>) => ({
        id: (it.id as string) || '',
        sku: (it.sku as string) || '',
        description: (it.description as string) || '',
        quantity: (it.quantity as number) || 0,
        unit_price: (it.unit_price as number) || 0,
        discount_pct: (it.discount_pct as number) || 0,
        subtotal: (it.subtotal as number) || 0,
      }))
      setSelectedQuote({ ...quote, items: mappedItems })
    } else {
      const { data: quoteItems } = await supabase
        .from('tt_quote_items')
        .select('*')
        .eq('quote_id', quote.id)
        .order('sort_order')
      setSelectedQuote({ ...quote, items: quoteItems || [] })
    }
    setViewMode('detail')
  }

  function shareWhatsApp() {
    const text = `Cotizacion ${quoteNumber}\nCliente: ${selectedClient?.name || '-'}\nTotal: ${formatCurrency(total, currency)}\nItems: ${items.length}`
    window.open(`https://wa.me/?text=${encodeURIComponent(text)}`, '_blank')
  }

  const companyOptions = companies.map((c) => ({ value: c.id, label: `${c.name} (${c.currency})` }))

  // Build document detail view data for a selected quote
  function buildQuoteDetailData(q: SavedQuote) {
    const workflowSteps: WorkflowStep[] = [
      { key: 'lead', label: 'Lead', icon: '\uD83C\uDFAF', status: 'pending', tooltip: 'Sin lead asociado' },
      {
        key: 'coti', label: 'Cotizacion', icon: '\uD83D\uDCCB',
        status: q.status === 'borrador' || q.status === 'draft' ? 'current' : q.status === 'enviada' || q.status === 'sent' ? 'current' : 'completed',
        documentRef: q.number, date: new Date(q.created_at).toLocaleDateString('es-ES'),
        tooltip: `Cotizacion ${q.status}`,
      },
      { key: 'oc_cliente', label: 'OC Cliente', icon: '\uD83D\uDCC4', status: 'pending', tooltip: 'Pendiente OC del cliente' },
      { key: 'pedido', label: 'Pedido', icon: '\uD83D\uDCE6', status: 'pending', tooltip: 'Pendiente crear pedido' },
      { key: 'delivery_note', label: 'Albaran', icon: '\uD83D\uDE9A', status: 'pending' },
      { key: 'factura', label: 'Factura', icon: '\uD83D\uDCB3', status: 'pending' },
      { key: 'cobro', label: 'Cobro', icon: '\uD83D\uDCB0', status: 'pending' },
    ]

    const document = {
      id: q.id,
      type: 'coti',
      system_code: q.number,
      display_ref: q.client?.name ? `Cotizacion ${q.client.name}` : q.number,
      status: q.status === 'borrador' ? 'draft' : q.status,
      currency: q.currency || 'EUR',
      total: q.total || 0,
      subtotal: q.subtotal || 0,
      tax_amount: q.tax_amount || 0,
      incoterm: q.incoterm,
      created_at: q.created_at,
    }

    const client = q.client ? { id: q.client_id || '', name: q.client.name, tax_id: q.client.tax_id, country: q.client.country } : undefined
    const comp = q.company ? { id: q.company_id || '', name: q.company.name, country: q.company.country } : undefined

    const docItems: DocumentItem[] = (q.items || []).map((it, idx) => ({
      id: it.id || `item-${idx}`,
      sku: it.sku || '',
      description: it.description || '',
      quantity: it.quantity || 0,
      unit_price: it.unit_price || 0,
      subtotal: it.subtotal || 0,
      qty_delivered: 0,
      qty_invoiced: 0,
      qty_reserved: 0,
      status: 'pending',
      statusColor: '#6B7280',
      statusLabel: 'Sin pedido',
      stockAvailable: 0,
      stockReserved: 0,
      stockIndicator: 'ok' as const,
      requires_po: false,
      hasComponents: false,
    }))

    const mockNotes: InternalNote[] = q.internal_notes ? [{
      id: 'note-1', author: 'Sistema', authorInitials: 'S', content: q.internal_notes, createdAt: new Date(q.created_at).toLocaleDateString('es-ES'), isSystem: true,
    }] : []

    return { workflowSteps, document, client, comp, docItems, mockNotes }
  }

  const filteredQuotes = savedQuotes.filter((q) => {
    if (!listSearch) return true
    const s = listSearch.toLowerCase()
    return q.number.toLowerCase().includes(s) || (q.client?.name || '').toLowerCase().includes(s)
  })

  // ================================================================
  // DETAIL VIEW
  // ================================================================
  if (viewMode === 'detail' && selectedQuote) {
    const { workflowSteps, document, client, comp, docItems, mockNotes } = buildQuoteDetailData(selectedQuote)

    return (
      <DocumentDetailLayout
        workflowSteps={workflowSteps}
        document={document}
        client={client}
        company={comp}
        assignedTo="Juan Manuel"
        onRefChange={(ref) => console.log('Ref changed:', ref)}
        notes={mockNotes}
        onAddNote={(content) => console.log('New note:', content)}
        trackingSummary={[
          { label: 'Items', value: docItems.length.toString(), color: '#F0F2F5' },
          { label: 'Estado', value: selectedQuote.status, color: selectedQuote.status === 'aceptada' ? '#00C853' : '#4285F4' },
          { label: 'Moneda', value: selectedQuote.currency || 'EUR', color: '#FF6600' },
        ]}
        onBack={() => { setViewMode('list'); setSelectedQuote(null) }}
        backLabel="Volver a cotizaciones"
      >
        <DocumentItemsTree items={docItems} components={[]} showStock={false} />
      </DocumentDetailLayout>
    )
  }

  // ================================================================
  // MAIN VIEW - Tabs: Nueva cotizacion | Cotizaciones guardadas
  // ================================================================
  return (
    <div className="space-y-6 animate-fade-in print:space-y-4">
      {/* Header with tab toggle */}
      <div className="flex items-center justify-between flex-wrap gap-4 print:hidden">
        <div>
          <h1 className="text-2xl font-bold text-[#F0F2F5]">Cotizador</h1>
          <p className="text-[#6B7280] mt-1 text-sm">
            {viewMode === 'create' ? 'Nueva cotizacion' : 'Cotizaciones guardadas'}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex bg-[#0B0E13] rounded-lg border border-[#2A3040] p-0.5">
            <button
              onClick={() => setViewMode('create')}
              className={`px-3 py-1.5 rounded-md text-xs font-semibold transition-all ${viewMode === 'create' ? 'bg-[#FF6600] text-white' : 'text-[#6B7280] hover:text-[#F0F2F5]'}`}
            >
              <PlusCircle size={14} className="inline mr-1" />
              Nueva
            </button>
            <button
              onClick={() => { setViewMode('list'); loadSavedQuotes() }}
              className={`px-3 py-1.5 rounded-md text-xs font-semibold transition-all ${viewMode === 'list' ? 'bg-[#FF6600] text-white' : 'text-[#6B7280] hover:text-[#F0F2F5]'}`}
            >
              <List size={14} className="inline mr-1" />
              Guardadas
            </button>
          </div>
        </div>
      </div>

      {/* LIST VIEW */}
      {viewMode === 'list' && (
        <div className="space-y-4">
          <div className="bg-[#141820] rounded-xl border border-[#2A3040] p-3">
            <SearchBar
              placeholder="Buscar por numero o cliente..."
              value={listSearch}
              onChange={setListSearch}
            />
          </div>

          {loadingQuotes ? (
            <div className="flex items-center justify-center py-20">
              <Loader2 size={32} className="animate-spin text-[#FF6600]" />
            </div>
          ) : filteredQuotes.length === 0 ? (
            <div className="text-center py-20">
              <FileText size={48} className="mx-auto mb-3 text-[#2A3040]" />
              <p className="text-sm text-[#6B7280]">No hay cotizaciones guardadas</p>
              <Button variant="primary" size="sm" className="mt-4" onClick={() => setViewMode('create')}>
                <Plus size={14} /> Crear primera cotizacion
              </Button>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
              {filteredQuotes.map((q) => (
                <DocumentListCard
                  key={q.id}
                  type="coti"
                  systemCode={q.number}
                  clientName={q.client?.name || 'Sin cliente'}
                  date={new Date(q.created_at).toLocaleDateString('es-ES')}
                  total={q.total || 0}
                  currency={q.currency || 'EUR'}
                  status={q.status === 'borrador' ? 'draft' : q.status}
                  statusLabel={q.status}
                  onClick={() => openQuoteDetail(q)}
                />
              ))}
            </div>
          )}
        </div>
      )}

      {/* CREATE VIEW */}
      {viewMode === 'create' && (
        <>
          {/* Quote number */}
          <div className="flex items-center gap-3 print:hidden">
            <code className="text-sm font-mono text-[#FF6600] bg-[#0B0E13] px-3 py-1.5 rounded-md border border-[#2A3040]">
              {quoteNumber}
            </code>
            <Button variant="secondary" onClick={saveQuote} loading={saving}>
              <Save size={16} /> Guardar
            </Button>
          </div>

          {/* Empresa & Cliente */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <Card>
              <CardHeader>
                <CardTitle className="text-sm flex items-center gap-2">
                  <Building2 size={16} className="text-[#FF6600]" /> Empresa emisora
                </CardTitle>
              </CardHeader>
              <CardContent>
                <Select options={companyOptions} value={selectedCompanyId} onChange={(e) => setSelectedCompanyId(e.target.value)} placeholder="Seleccionar empresa..." />
                {selectedCompanyId && <p className="text-xs text-[#4B5563] mt-2">Moneda: <span className="text-[#FF6600] font-medium">{currency}</span></p>}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-sm flex items-center gap-2">
                  <User size={16} className="text-[#FF6600]" /> Cliente
                </CardTitle>
              </CardHeader>
              <CardContent>
                {selectedClient ? (
                  <div className="flex items-center justify-between p-3 rounded-lg bg-[#0F1218] border border-[#1E2330]">
                    <div>
                      <p className="text-sm font-medium text-[#F0F2F5]">{selectedClient.name}</p>
                      <p className="text-xs text-[#6B7280]">{selectedClient.tax_id} - {selectedClient.email}</p>
                    </div>
                    <button onClick={() => setSelectedClient(null)} className="text-[#6B7280] hover:text-red-400"><X size={16} /></button>
                  </div>
                ) : (
                  <div className="relative">
                    <SearchBar placeholder="Buscar cliente por nombre, CUIT, email..." value={clientSearch} onChange={setClientSearch} />
                    {showClientDropdown && clientResults.length > 0 && (
                      <div className="absolute top-full left-0 right-0 mt-1 bg-[#141820] border border-[#1E2330] rounded-lg shadow-xl z-10 max-h-48 overflow-y-auto">
                        {clientResults.map((client) => (
                          <button key={client.id} onClick={() => { setSelectedClient(client); setClientSearch(''); setShowClientDropdown(false) }} className="w-full text-left px-4 py-2.5 hover:bg-[#1E2330] transition-colors">
                            <p className="text-sm text-[#F0F2F5]">{client.name}</p>
                            <p className="text-xs text-[#6B7280]">{client.tax_id} - {client.email}</p>
                          </button>
                        ))}
                      </div>
                    )}
                    {showClientDropdown && clientSearch && clientResults.length === 0 && (
                      <div className="absolute top-full left-0 right-0 mt-1 bg-[#141820] border border-[#1E2330] rounded-lg shadow-xl z-10">
                        <p className="px-4 py-3 text-sm text-[#4B5563]">No se encontraron clientes</p>
                      </div>
                    )}
                  </div>
                )}
              </CardContent>
            </Card>
          </div>

          {/* Items table */}
          <Card>
            <CardHeader>
              <CardTitle className="text-sm">Items de la cotizacion</CardTitle>
              <div className="flex gap-2 print:hidden">
                <Button variant="secondary" size="sm" onClick={() => setShowProductSearch(true)}><Search size={14} /> Buscar producto</Button>
                <Button variant="primary" size="sm" onClick={addEmptyItem}><Plus size={14} /> Linea manual</Button>
              </div>
            </CardHeader>
            <CardContent>
              {items.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-12 text-[#4B5563] border border-dashed border-[#1E2330] rounded-lg">
                  <FileText size={36} className="mb-3" />
                  <p className="text-sm">No hay items todavia</p>
                  <p className="text-xs mt-1">Agrega productos desde el buscador o con linea manual</p>
                  <div className="flex gap-2 mt-4">
                    <Button variant="primary" size="sm" onClick={() => setShowProductSearch(true)}><Search size={14} /> Buscar producto</Button>
                    <Button variant="secondary" size="sm" onClick={addEmptyItem}><Plus size={14} /> Linea manual</Button>
                  </div>
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-[#1E2330]">
                        <th className="text-left py-2 px-2 text-xs text-[#6B7280] font-medium w-8">#</th>
                        <th className="text-left py-2 px-2 text-xs text-[#6B7280] font-medium w-28">SKU</th>
                        <th className="text-left py-2 px-2 text-xs text-[#6B7280] font-medium">Descripcion</th>
                        <th className="text-center py-2 px-2 text-xs text-[#6B7280] font-medium w-28">Cant.</th>
                        <th className="text-right py-2 px-2 text-xs text-[#6B7280] font-medium w-28">P. Unit.</th>
                        <th className="text-center py-2 px-2 text-xs text-[#6B7280] font-medium w-20">Dto %</th>
                        <th className="text-right py-2 px-2 text-xs text-[#6B7280] font-medium w-28">Subtotal</th>
                        <th className="text-left py-2 px-2 text-xs text-[#6B7280] font-medium w-32">Notas</th>
                        <th className="w-10 print:hidden"></th>
                      </tr>
                    </thead>
                    <tbody>
                      {items.map((item, idx) => {
                        const lineTotal = item.quantity * item.unitPrice * (1 - item.discount / 100)
                        return (
                          <tr key={item.id} className="border-b border-[#1E2330]/50">
                            <td className="py-2 px-2 text-xs text-[#4B5563]">{idx + 1}</td>
                            <td className="py-2 px-2"><input value={item.sku} onChange={(e) => updateItem(item.id, 'sku', e.target.value)} className="w-full bg-transparent text-xs font-mono text-[#9CA3AF] outline-none" placeholder="SKU" /></td>
                            <td className="py-2 px-2"><input value={item.description} onChange={(e) => updateItem(item.id, 'description', e.target.value)} className="w-full bg-transparent text-sm text-[#F0F2F5] outline-none" placeholder="Descripcion del producto" /></td>
                            <td className="py-2 px-2">
                              <div className="flex items-center justify-center gap-1">
                                <button onClick={() => updateQuantity(item.id, -1)} className="p-0.5 rounded hover:bg-[#1E2330] text-[#6B7280] print:hidden"><Minus size={12} /></button>
                                <input type="number" min="1" value={item.quantity} onChange={(e) => updateItem(item.id, 'quantity', Math.max(1, Number(e.target.value)))} className="w-12 bg-[#0F1218] border border-[#1E2330] rounded px-1 py-1 text-center text-sm text-[#F0F2F5] outline-none focus:border-[#FF6600]" />
                                <button onClick={() => updateQuantity(item.id, 1)} className="p-0.5 rounded hover:bg-[#1E2330] text-[#6B7280] print:hidden"><Plus size={12} /></button>
                              </div>
                            </td>
                            <td className="py-2 px-2"><input type="number" min="0" step="0.01" value={item.unitPrice} onChange={(e) => updateItem(item.id, 'unitPrice', Number(e.target.value))} className="w-full bg-[#0F1218] border border-[#1E2330] rounded px-2 py-1 text-right text-sm text-[#F0F2F5] outline-none focus:border-[#FF6600]" /></td>
                            <td className="py-2 px-2"><input type="number" min="0" max="100" value={item.discount} onChange={(e) => updateItem(item.id, 'discount', Number(e.target.value))} className="w-full bg-[#0F1218] border border-[#1E2330] rounded px-2 py-1 text-center text-sm text-[#F0F2F5] outline-none focus:border-[#FF6600]" /></td>
                            <td className="py-2 px-2 text-right text-sm font-medium text-[#F0F2F5]">{formatCurrency(lineTotal, currency)}</td>
                            <td className="py-2 px-2"><input value={item.notes} onChange={(e) => updateItem(item.id, 'notes', e.target.value)} className="w-full bg-transparent text-xs text-[#6B7280] outline-none" placeholder="Notas" /></td>
                            <td className="py-2 px-1 print:hidden"><button onClick={() => removeItem(item.id)} className="p-1 rounded hover:bg-red-500/10 text-[#4B5563] hover:text-red-400 transition-colors"><Trash2 size={14} /></button></td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Bottom: Notes + Totals */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <Card>
              <CardContent className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-[#9CA3AF] mb-1.5">Notas (visible al cliente)</label>
                  <textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={3} className="w-full rounded-lg bg-[#1E2330] border border-[#2A3040] px-3 py-2 text-sm text-[#F0F2F5] placeholder:text-[#4B5563] focus:outline-none focus:ring-2 focus:ring-orange-500/50 resize-none" placeholder="Notas para el cliente..." />
                </div>
                <div className="print:hidden">
                  <label className="block text-sm font-medium text-[#9CA3AF] mb-1.5">Notas internas (solo admin)</label>
                  <textarea value={internalNotes} onChange={(e) => setInternalNotes(e.target.value)} rows={2} className="w-full rounded-lg bg-[#1E2330] border border-[#2A3040] px-3 py-2 text-sm text-[#F0F2F5] placeholder:text-[#4B5563] focus:outline-none focus:ring-2 focus:ring-orange-500/50 resize-none" placeholder="Notas internas..." />
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <Select label="Incoterm" options={INCOTERMS.map((i) => ({ value: i, label: i }))} value={incoterm} onChange={(e) => setIncoterm(e.target.value)} placeholder="Seleccionar..." />
                  <Input label="Valido hasta" type="date" value={validUntil} onChange={(e) => setValidUntil(e.target.value)} />
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardContent className="space-y-3">
                <div className="flex justify-between text-sm"><span className="text-[#6B7280]">Subtotal ({items.length} items)</span><span className="text-[#D1D5DB]">{formatCurrency(subtotal, currency)}</span></div>
                <div className="flex items-center justify-between text-sm">
                  <div className="flex items-center gap-2">
                    <span className="text-[#6B7280]">IVA</span>
                    <input type="number" value={taxRate} onChange={(e) => setTaxRate(Number(e.target.value))} className="w-14 bg-[#0F1218] border border-[#1E2330] rounded px-2 py-0.5 text-center text-xs text-[#F0F2F5] print:border-none" />
                    <span className="text-xs text-[#6B7280]">%</span>
                  </div>
                  <span className="text-[#D1D5DB]">{formatCurrency(taxAmount, currency)}</span>
                </div>
                <div className="border-t border-[#1E2330] pt-3 flex justify-between">
                  <span className="text-lg font-semibold text-[#F0F2F5]">Total</span>
                  <span className="text-2xl font-bold text-[#FF6600]">{formatCurrency(total, currency)}</span>
                </div>
                <div className="flex gap-2 pt-2 print:hidden">
                  <Button variant="secondary" size="sm" className="flex-1" onClick={() => window.print()}><Printer size={14} /> PDF / Imprimir</Button>
                  <Button variant="secondary" size="sm" className="flex-1" onClick={shareWhatsApp}><MessageSquare size={14} /> WhatsApp</Button>
                </div>
                <Button variant="primary" className="w-full mt-2 print:hidden" onClick={saveQuote} loading={saving}><Save size={16} /> Guardar cotizacion</Button>
              </CardContent>
            </Card>
          </div>
        </>
      )}

      {/* Product Search Modal */}
      <Modal isOpen={showProductSearch} onClose={() => { setShowProductSearch(false); setProductSearch(''); setProductResults([]) }} title="Buscar Producto" size="lg">
        <SearchBar placeholder="Buscar por SKU, nombre, marca..." value={productSearch} onChange={setProductSearch} autoFocus className="mb-4" />
        {searchingProducts && <div className="flex items-center justify-center py-8"><Loader2 size={24} className="animate-spin text-[#FF6600]" /></div>}
        {!searchingProducts && productResults.length === 0 && productSearch && <p className="text-sm text-[#4B5563] text-center py-8">No se encontraron productos</p>}
        <div className="space-y-1 max-h-[400px] overflow-y-auto">
          {productResults.map((p) => (
            <button key={p.id} onClick={() => addProductAsItem(p)} className="w-full text-left flex items-center justify-between p-3 rounded-lg hover:bg-[#1E2330] transition-colors">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded bg-[#0F1218] border border-[#1E2330] flex items-center justify-center shrink-0 overflow-hidden">
                  {p.image_url ? <img src={p.image_url} alt="" referrerPolicy="no-referrer" className="w-full h-full object-contain" /> : <FileText size={14} className="text-[#2A3040]" />}
                </div>
                <div>
                  <p className="text-xs font-mono text-[#6B7280]">{p.sku}</p>
                  <p className="text-sm text-[#F0F2F5]">{p.name}</p>
                  <Badge variant="default" className="mt-0.5">{p.brand}</Badge>
                </div>
              </div>
              <span className="text-sm font-bold text-[#FF6600] shrink-0 ml-3">{p.price_eur > 0 ? formatCurrency(p.price_eur, 'EUR') : 'Consultar'}</span>
            </button>
          ))}
        </div>
      </Modal>
    </div>
  )
}
