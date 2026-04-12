'use client'

import { useState, useEffect, useCallback, Suspense } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Card, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Select } from '@/components/ui/select'
import { Badge } from '@/components/ui/badge'
import { Modal } from '@/components/ui/modal'
import { SearchBar } from '@/components/ui/search-bar'
import { KPICard } from '@/components/ui/kpi-card'
import { Tabs } from '@/components/ui/tabs'
import { useToast } from '@/components/ui/toast'
import { formatCurrency, formatDate } from '@/lib/utils'
import { DocumentDetailLayout, type WorkflowStep, type InternalNote } from '@/components/workflow/document-detail-layout'
import { DocumentItemsTree, type DocumentItem, type DocumentItemComponent } from '@/components/workflow/document-items-tree'
import { DocumentListCard } from '@/components/workflow/document-list-card'
import { ExportButton } from '@/components/ui/export-button'
import {
  Receipt, Plus, Loader2, FileText, Truck, CreditCard,
  Clock, ArrowRight, X, DollarSign,
  ClipboardList, FileCheck
} from 'lucide-react'

type Row = Record<string, unknown>

// ===============================================================
// HELPERS: tt_documents unified data
// ===============================================================
function getClientName(doc: Row): string {
  const raw = (doc.metadata as Record<string, unknown>)?.stelorder_raw as Record<string, unknown> | undefined
  if (!raw) return (doc.client_name as string) || 'Sin cliente'
  return (raw['account-name'] as string) || (raw['legal-name'] as string) || (raw['name'] as string) || 'Sin cliente'
}

function getDocRef(doc: Row): string {
  return (doc.display_ref as string) || (doc.metadata as Record<string, unknown>)?.stelorder_reference as string || (doc.system_code as string) || '-'
}

const DOC_STATUS: Record<string, { label: string; variant: 'default' | 'success' | 'warning' | 'danger' | 'info' | 'orange' }> = {
  draft: { label: 'Borrador', variant: 'default' },
  sent: { label: 'Enviada', variant: 'info' },
  accepted: { label: 'Aceptada', variant: 'success' },
  rejected: { label: 'Rechazada', variant: 'danger' },
  closed: { label: 'Cerrado', variant: 'default' },
  open: { label: 'Abierto', variant: 'info' },
  pending: { label: 'Pendiente', variant: 'warning' },
  partial: { label: 'Parcial', variant: 'orange' },
  paid: { label: 'Pagada', variant: 'success' },
  completed: { label: 'Completado', variant: 'success' },
  cancelled: { label: 'Cancelado', variant: 'danger' },
}

// ===============================================================
// STATUS MAPS
// ===============================================================
const SO_STATUS: Record<string, { label: string; variant: 'default' | 'success' | 'warning' | 'danger' | 'info' | 'orange' }> = {
  open: { label: 'Abierto', variant: 'info' },
  partially_delivered: { label: 'Entrega parcial', variant: 'warning' },
  fully_delivered: { label: 'Entregado', variant: 'success' },
  partially_invoiced: { label: 'Facturacion parcial', variant: 'orange' },
  fully_invoiced: { label: 'Facturado', variant: 'success' },
  closed: { label: 'Cerrado', variant: 'default' },
}

const QUOTE_STATUS: Record<string, { label: string; variant: 'default' | 'success' | 'warning' | 'danger' | 'info' | 'orange' }> = {
  draft: { label: 'Borrador', variant: 'default' },
  borrador: { label: 'Borrador', variant: 'default' },
  sent: { label: 'Enviada', variant: 'info' },
  enviada: { label: 'Enviada', variant: 'info' },
  accepted: { label: 'Aceptada', variant: 'success' },
  aceptada: { label: 'Aceptada', variant: 'success' },
  rejected: { label: 'Rechazada', variant: 'danger' },
  rechazada: { label: 'Rechazada', variant: 'danger' },
  closed: { label: 'Cerrada', variant: 'default' },
}

const INV_STATUS: Record<string, { label: string; variant: 'default' | 'success' | 'warning' | 'danger' | 'info' | 'orange' }> = {
  draft: { label: 'Borrador', variant: 'default' },
  pending: { label: 'Pendiente', variant: 'warning' },
  partial: { label: 'Pago parcial', variant: 'orange' },
  paid: { label: 'Pagada', variant: 'success' },
}

const DN_STATUS: Record<string, { label: string; variant: 'default' | 'success' | 'warning' | 'danger' | 'info' | 'orange' }> = {
  pending: { label: 'Pendiente', variant: 'warning' },
  delivered: { label: 'Entregado', variant: 'success' },
  invoiced: { label: 'Facturado', variant: 'info' },
}

const ventasTabs = [
  { id: 'presupuestos', label: 'Presupuestos', icon: <FileText size={16} /> },
  { id: 'pedidos', label: 'Pedidos', icon: <ClipboardList size={16} /> },
  { id: 'albaranes', label: 'Albaranes', icon: <Truck size={16} /> },
  { id: 'facturas', label: 'Facturas', icon: <FileCheck size={16} /> },
  { id: 'cobros', label: 'Cobros', icon: <DollarSign size={16} /> },
]

// ===============================================================
// Helper: build workflow steps for a sales order
// ===============================================================
function buildSOWorkflow(so: Row): WorkflowStep[] {
  const status = (so.status as string) || 'open'
  const hasQuote = !!so.quote_id
  const isDelivered = status.includes('deliver') || status.includes('invoiced') || status === 'closed'
  const isInvoiced = status.includes('invoiced') || status === 'closed'

  return [
    { key: 'coti', label: 'Cotizacion', icon: '\uD83D\uDCCB', status: hasQuote ? 'completed' : 'pending', tooltip: hasQuote ? 'Desde cotizacion' : 'Sin cotizacion' },
    { key: 'pedido', label: 'Pedido', icon: '\uD83D\uDCE6', status: status === 'open' ? 'current' : 'completed', documentRef: (so.doc_number as string) || '', date: so.created_at ? new Date(so.created_at as string).toLocaleDateString('es-ES') : '' },
    { key: 'delivery_note', label: 'Albaran', icon: '\uD83D\uDE9A', status: isDelivered ? (status === 'partially_delivered' ? 'partial' : 'completed') : status === 'open' ? 'pending' : 'current' },
    { key: 'factura', label: 'Factura', icon: '\uD83D\uDCB3', status: isInvoiced ? 'completed' : 'pending' },
    { key: 'cobro', label: 'Cobro', icon: '\uD83D\uDCB0', status: status === 'closed' ? 'completed' : 'pending' },
  ]
}

// ===============================================================
// PRESUPUESTOS TAB
// ===============================================================
function PresupuestosTab() {
  const supabase = createClient()
  const [quotes, setQuotes] = useState<Row[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState('')
  const [selectedQuote, setSelectedQuote] = useState<Row | null>(null)
  const [quoteItems, setQuoteItems] = useState<Row[]>([])
  const [page, setPage] = useState(0)
  const [hasMore, setHasMore] = useState(false)
  const [totalCount, setTotalCount] = useState(0)
  const PAGE_SIZE = 100

  const load = useCallback(async (loadPage = 0) => {
    setLoading(true)
    // Load from tt_documents (StelOrder historical data)
    let q = supabase.from('tt_documents').select('*', { count: 'exact' })
      .eq('type', 'coti')
      .order('created_at', { ascending: false })
      .range(loadPage * PAGE_SIZE, (loadPage + 1) * PAGE_SIZE - 1)
    if (statusFilter) q = q.eq('status', statusFilter)
    if (search) q = q.or(`display_ref.ilike.%${search}%,system_code.ilike.%${search}%`)
    const { data: docData, count } = await q

    // Also load from tt_quotes (locally created)
    let q2 = supabase.from('tt_quotes').select('*, tt_clients(name, tax_id, country)').order('created_at', { ascending: false })
    if (statusFilter) q2 = q2.eq('status', statusFilter)
    if (search) q2 = q2.or(`doc_number.ilike.%${search}%,number.ilike.%${search}%`)
    const { data: localData } = await q2

    // Merge: local quotes first (they are user-created), then tt_documents
    const localMapped = (localData || []).map((lq: Row) => ({
      ...lq,
      _source: 'local' as const,
      _clientName: ((lq.tt_clients as Row)?.name as string) || 'Sin cliente',
    }))
    const docMapped = (docData || []).map((d: Row) => ({
      ...d,
      _source: 'tt_documents' as const,
      _clientName: getClientName(d),
    }))

    if (loadPage === 0) {
      setQuotes([...localMapped, ...docMapped])
    } else {
      setQuotes(prev => [...prev, ...docMapped])
    }
    setTotalCount((localData?.length || 0) + (count || 0))
    setHasMore((count || 0) > (loadPage + 1) * PAGE_SIZE)
    setPage(loadPage)
    setLoading(false)
  }, [supabase, statusFilter, search])

  useEffect(() => { load(0) }, [load])

  const openDetail = async (quote: Row) => {
    if ((quote as Row & { _source: string })._source === 'tt_documents') {
      // Load items from tt_document_items
      const { data } = await supabase.from('tt_document_items').select('*').eq('document_id', quote.id).order('sort_order')
      setQuoteItems(data || [])
    } else {
      // Load from tt_quote_items (local)
      const { data } = await supabase.from('tt_quote_items').select('*').eq('quote_id', quote.id).order('sort_order')
      setQuoteItems(data || [])
    }
    setSelectedQuote(quote)
  }

  // Detail view
  if (selectedQuote) {
    const isDoc = (selectedQuote as Row & { _source?: string })._source === 'tt_documents'
    const clientObj = isDoc ? null : selectedQuote.tt_clients as Row | null
    const clientName = isDoc ? getClientName(selectedQuote) : (clientObj?.name as string) || 'Sin cliente'
    const ref = isDoc ? getDocRef(selectedQuote) : (selectedQuote.doc_number as string) || (selectedQuote.number as string) || ''

    const steps: WorkflowStep[] = [
      { key: 'coti', label: 'Cotizacion', icon: '\uD83D\uDCCB', status: 'current', documentRef: ref },
      { key: 'pedido', label: 'Pedido', icon: '\uD83D\uDCE6', status: 'pending' },
      { key: 'delivery_note', label: 'Albaran', icon: '\uD83D\uDE9A', status: 'pending' },
      { key: 'factura', label: 'Factura', icon: '\uD83D\uDCB3', status: 'pending' },
      { key: 'cobro', label: 'Cobro', icon: '\uD83D\uDCB0', status: 'pending' },
    ]

    const docItems: DocumentItem[] = quoteItems.map((it, idx) => ({
      id: (it.id as string) || `qi-${idx}`,
      sku: (it.sku as string) || '',
      description: (it.description as string) || '',
      quantity: (it.quantity as number) || 0,
      unit_price: (it.unit_price as number) || 0,
      subtotal: (it.subtotal as number) || (it.line_total as number) || 0,
      qty_delivered: 0, qty_invoiced: 0, qty_reserved: 0,
      status: 'pending', statusColor: '#6B7280', statusLabel: 'Sin pedido',
      stockAvailable: 0, stockReserved: 0, stockIndicator: 'ok' as const,
      requires_po: false, hasComponents: false,
    }))

    return (
      <DocumentDetailLayout
        workflowSteps={steps}
        document={{
          id: selectedQuote.id as string, type: 'coti', system_code: ref,
          display_ref: `Presupuesto ${clientName}`,
          status: (selectedQuote.status as string) || 'draft',
          currency: (selectedQuote.currency as string) || 'EUR',
          total: (selectedQuote.total as number) || 0,
          subtotal: (selectedQuote.subtotal as number) || 0,
          tax_amount: (selectedQuote.tax_amount as number) || 0,
          created_at: (selectedQuote.created_at as string) || new Date().toISOString(),
        }}
        client={clientObj ? { id: '', name: clientName, tax_id: clientObj.tax_id as string, country: clientObj.country as string } : undefined}
        notes={[]}
        onAddNote={() => {}}
        onBack={() => setSelectedQuote(null)}
        backLabel="Volver a presupuestos"
      >
        <DocumentItemsTree items={docItems} components={[]} showStock={false} />
      </DocumentDetailLayout>
    )
  }

  const totalQuotes = quotes.length
  const draftCount = quotes.filter(q => q.status === 'draft' || q.status === 'borrador').length
  const sentCount = quotes.filter(q => q.status === 'sent' || q.status === 'enviada').length
  const totalVal = quotes.reduce((s, q) => s + ((q.total as number) || 0), 0)

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <KPICard label="Total presupuestos" value={totalQuotes} icon={<FileText size={22} />} />
        <KPICard label="Borradores" value={draftCount} icon={<Clock size={22} />} color="#6B7280" />
        <KPICard label="Enviados" value={sentCount} icon={<FileText size={22} />} color="#3B82F6" />
        <KPICard label="Valor total" value={formatCurrency(totalVal)} icon={<CreditCard size={22} />} color="#F59E0B" />
      </div>
      <div className="bg-[#141820] rounded-xl border border-[#2A3040] p-3">
        <div className="flex flex-col sm:flex-row gap-3">
          <SearchBar placeholder="Buscar presupuesto..." value={search} onChange={setSearch} className="flex-1" />
          <Select options={[{ value: '', label: 'Todos' }, ...Object.entries(QUOTE_STATUS).filter(([k]) => !['borrador', 'enviada', 'aceptada', 'rechazada'].includes(k)).map(([k, v]) => ({ value: k, label: v.label }))]} value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} />
          <ExportButton
            data={quotes as Record<string, unknown>[]}
            filename="presupuestos_torquetools"
            columns={[
              { key: 'doc_number', label: 'Numero' },
              { key: 'status', label: 'Estado' },
              { key: 'total', label: 'Total' },
              { key: 'currency', label: 'Moneda' },
              { key: 'created_at', label: 'Fecha' },
            ]}
          />
        </div>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-20"><Loader2 className="animate-spin text-[#FF6600]" size={32} /></div>
      ) : quotes.length === 0 ? (
        <div className="text-center py-20 text-[#6B7280]"><FileText size={48} className="mx-auto mb-3 opacity-30" /><p>No hay presupuestos</p></div>
      ) : (
        <>
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
            {quotes.map((q) => {
              const isDoc = (q as Row & { _source?: string })._source === 'tt_documents'
              const clientName = (q as Row & { _clientName?: string })._clientName || 'Sin cliente'
              const ref = isDoc ? getDocRef(q) : (q.doc_number as string) || (q.number as string) || '-'
              const st = (q.status as string) || 'draft'
              const statusMap = isDoc ? DOC_STATUS : QUOTE_STATUS
              return (
                <DocumentListCard
                  key={q.id as string} type="coti" systemCode={ref} clientName={clientName}
                  date={q.created_at ? formatDate(q.created_at as string) : '-'}
                  total={(q.total as number) || 0} currency={(q.currency as string) || 'EUR'}
                  status={st} statusLabel={statusMap[st]?.label || st}
                  onClick={() => openDetail(q)}
                />
              )
            })}
          </div>
          {hasMore && (
            <div className="flex justify-center pt-4">
              <Button variant="secondary" onClick={() => load(page + 1)}>
                Cargar mas ({totalCount - quotes.length} restantes)
              </Button>
            </div>
          )}
        </>
      )}
    </div>
  )
}

// ===============================================================
// PEDIDOS TAB
// ===============================================================
function PedidosTab() {
  const supabase = createClient()
  const { addToast } = useToast()

  const [orders, setOrders] = useState<Row[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState('')

  const [selectedSO, setSelectedSO] = useState<Row | null>(null)
  const [soItems, setSOItems] = useState<Row[]>([])
  const [showCreate, setShowCreate] = useState(false)
  const [showDelivery, setShowDelivery] = useState(false)

  const [clients, setClients] = useState<Array<Row>>([])
  const [quotesData, setQuotesData] = useState<Array<Row>>([])
  const [selectedQuote, setSelectedQuote] = useState('')
  const [selectedClient, setSelectedClient] = useState('')
  const [products, setProducts] = useState<Array<Row>>([])
  const [newLines, setNewLines] = useState<Array<{ product_id: string; name: string; qty: number; price: number }>>([])
  const [saving, setSaving] = useState(false)
  const [deliveryLines, setDeliveryLines] = useState<Array<{ id: string; desc: string; ordered: number; delivered: number; toDeliver: number }>>([])

  const load = useCallback(async () => {
    setLoading(true)
    // Load from tt_documents (StelOrder historical pedidos)
    let qDoc = supabase.from('tt_documents').select('*')
      .eq('type', 'pedido')
      .order('created_at', { ascending: false })
      .range(0, 99)
    if (statusFilter) qDoc = qDoc.eq('status', statusFilter)
    if (search) qDoc = qDoc.or(`display_ref.ilike.%${search}%,system_code.ilike.%${search}%`)
    const { data: docData } = await qDoc

    // Also load from tt_sales_orders (locally created)
    let qLocal = supabase.from('tt_sales_orders').select('*, tt_clients(name, tax_id, country)').order('created_at', { ascending: false })
    if (statusFilter) qLocal = qLocal.eq('status', statusFilter)
    if (search) qLocal = qLocal.ilike('doc_number', `%${search}%`)
    const { data: localData } = await qLocal

    const localMapped = (localData || []).map((o: Row) => ({
      ...o, _source: 'local' as const,
      _clientName: ((o.tt_clients as Row)?.name as string) || 'Sin cliente',
    }))
    const docMapped = (docData || []).map((d: Row) => ({
      ...d, _source: 'tt_documents' as const,
      _clientName: getClientName(d),
    }))
    setOrders([...localMapped, ...docMapped])
    setLoading(false)
  }, [supabase, statusFilter, search])

  useEffect(() => { load() }, [load])

  const loadCreateData = async () => {
    const [{ data: cl }, { data: qt }, { data: pr }] = await Promise.all([
      supabase.from('tt_clients').select('id, name').order('name').limit(500),
      supabase.from('tt_quotes').select('id, doc_number, client_id, total').eq('status', 'draft').order('created_at', { ascending: false }),
      supabase.from('tt_products').select('id, sku, name, price_eur').order('name').limit(500),
    ])
    setClients(cl || []); setQuotesData(qt || []); setProducts(pr || [])
  }

  const handleCreateFromQuote = async () => {
    if (!selectedQuote) return
    setSaving(true)
    const { data: quote } = await supabase.from('tt_quotes').select('*, tt_quote_items(*)').eq('id', selectedQuote).single()
    if (!quote) { addToast({ type: 'error', title: 'Error', message: 'Cotizacion no encontrada' }); setSaving(false); return }
    const yr = new Date().getFullYear().toString().slice(-2); const mo = (new Date().getMonth() + 1).toString().padStart(2, '0'); const seq = Math.floor(Math.random() * 9999).toString().padStart(4, '0')
    const docNum = `PED-${yr}${mo}-${seq}`
    const { data: so, error } = await supabase.from('tt_sales_orders').insert({ company_id: quote.company_id, client_id: quote.client_id, quote_id: selectedQuote, doc_number: docNum, currency: quote.currency || 'EUR', status: 'open', subtotal: quote.subtotal || 0, tax_amount: quote.tax_amount || 0, total: quote.total || 0, notes: quote.notes || '' }).select().single()
    if (error || !so) { addToast({ type: 'error', title: 'Error', message: error?.message }); setSaving(false); return }
    const items = (quote.tt_quote_items || []).map((it: Row, i: number) => ({ sales_order_id: so.id, product_id: it.product_id, description: it.description, quantity: it.quantity, unit_price: it.unit_price, discount_pct: it.discount_pct || 0, line_total: it.line_total, qty_ordered: it.quantity, qty_reserved: 0, qty_delivered: 0, qty_invoiced: 0, sort_order: i }))
    await supabase.from('tt_so_items').insert(items)
    await supabase.from('tt_quotes').update({ status: 'accepted' }).eq('id', selectedQuote)
    addToast({ type: 'success', title: 'Pedido creado', message: docNum })
    setShowCreate(false); setSelectedQuote(''); load(); setSaving(false)
  }

  const handleCreateFromScratch = async () => {
    if (!selectedClient || newLines.length === 0) { addToast({ type: 'warning', title: 'Completa los datos' }); return }
    setSaving(true)
    const total = newLines.reduce((s, l) => s + l.qty * l.price, 0)
    const yr = new Date().getFullYear().toString().slice(-2); const mo = (new Date().getMonth() + 1).toString().padStart(2, '0'); const seq = Math.floor(Math.random() * 9999).toString().padStart(4, '0')
    const docNum = `PED-${yr}${mo}-${seq}`
    const { data: so, error } = await supabase.from('tt_sales_orders').insert({ client_id: selectedClient, doc_number: docNum, currency: 'EUR', status: 'open', subtotal: total, tax_amount: 0, total }).select().single()
    if (error || !so) { addToast({ type: 'error', title: 'Error', message: error?.message }); setSaving(false); return }
    const items = newLines.map((l, i) => ({ sales_order_id: so.id, product_id: l.product_id || null, description: l.name, quantity: l.qty, unit_price: l.price, line_total: l.qty * l.price, qty_ordered: l.qty, qty_reserved: 0, qty_delivered: 0, qty_invoiced: 0, sort_order: i }))
    await supabase.from('tt_so_items').insert(items)
    addToast({ type: 'success', title: 'Pedido creado', message: docNum })
    setShowCreate(false); setSelectedClient(''); setNewLines([]); load(); setSaving(false)
  }

  const openDetail = async (so: Row) => {
    setSelectedSO(so)
    if ((so as Row & { _source?: string })._source === 'tt_documents') {
      const { data } = await supabase.from('tt_document_items').select('*').eq('document_id', so.id).order('sort_order')
      setSOItems(data || [])
    } else {
      const { data } = await supabase.from('tt_so_items').select('*').eq('sales_order_id', so.id).order('sort_order')
      setSOItems(data || [])
    }
  }

  const openDelivery = async (so: Row) => {
    setSelectedSO(so)
    const { data } = await supabase.from('tt_so_items').select('*').eq('sales_order_id', so.id).order('sort_order')
    setDeliveryLines((data || []).map((it: Row) => ({ id: it.id as string, desc: (it.description || '') as string, ordered: (it.qty_ordered || it.quantity || 0) as number, delivered: (it.qty_delivered || 0) as number, toDeliver: 0 })))
    setShowDelivery(true)
  }

  const handleDelivery = async () => {
    if (!selectedSO) return
    const yr = new Date().getFullYear().toString().slice(-2); const mo = (new Date().getMonth() + 1).toString().padStart(2, '0'); const seq = Math.floor(Math.random() * 9999).toString().padStart(4, '0')
    const docNum = `REM-${yr}${mo}-${seq}`
    const { data: dn, error } = await supabase.from('tt_delivery_notes').insert({ company_id: selectedSO.company_id || null, client_id: selectedSO.client_id, sales_order_id: selectedSO.id, doc_number: docNum, status: 'pending' }).select().single()
    if (error || !dn) { addToast({ type: 'error', title: 'Error', message: error?.message }); return }
    for (const l of deliveryLines) { if (l.toDeliver > 0) { await supabase.from('tt_dn_items').insert({ delivery_note_id: dn.id, so_item_id: l.id, quantity: l.toDeliver }); await supabase.from('tt_so_items').update({ qty_delivered: l.delivered + l.toDeliver }).eq('id', l.id) } }
    const { data: items } = await supabase.from('tt_so_items').select('qty_ordered, quantity, qty_delivered').eq('sales_order_id', selectedSO.id)
    const allDelivered = (items || []).every((it: Row) => ((it.qty_delivered as number) || 0) >= ((it.qty_ordered as number) || (it.quantity as number) || 0))
    await supabase.from('tt_sales_orders').update({ status: allDelivered ? 'fully_delivered' : 'partially_delivered' }).eq('id', selectedSO.id)
    addToast({ type: 'success', title: 'Remito generado', message: docNum })
    setShowDelivery(false); setSelectedSO(null); load()
  }

  const handleInvoice = async (so: Row) => {
    const yr = new Date().getFullYear().toString().slice(-2); const mo = (new Date().getMonth() + 1).toString().padStart(2, '0'); const seq = Math.floor(Math.random() * 9999).toString().padStart(4, '0')
    const docNum = `FAC-${yr}${mo}-${seq}`
    const { error } = await supabase.from('tt_invoices').insert({ company_id: so.company_id || null, client_id: so.client_id, sales_order_id: so.id, doc_number: docNum, type: 'sale', status: 'draft', currency: so.currency || 'EUR', subtotal: so.subtotal || 0, tax_amount: so.tax_amount || 0, total: so.total || 0 }).select().single()
    if (error) { addToast({ type: 'error', title: 'Error', message: error.message }); return }
    await supabase.from('tt_sales_orders').update({ status: 'fully_invoiced' }).eq('id', so.id)
    addToast({ type: 'success', title: 'Factura generada', message: docNum })
    setSelectedSO(null); load()
  }

  // Detail view using DocumentDetailLayout
  if (selectedSO && !showDelivery) {
    const isDoc = (selectedSO as Row & { _source?: string })._source === 'tt_documents'
    const clientObj = isDoc ? null : selectedSO.tt_clients as Row | null
    const clientName = isDoc ? getClientName(selectedSO) : (clientObj?.name as string) || 'Sin cliente'
    const st = (selectedSO.status as string) || 'open'

    const totalOrdered = soItems.reduce((s, it) => s + ((it.qty_ordered as number) || (it.quantity as number) || 0), 0)
    const totalDelivered = soItems.reduce((s, it) => s + ((it.qty_delivered as number) || 0), 0)
    const totalInvoiced = soItems.reduce((s, it) => s + ((it.qty_invoiced as number) || 0), 0)
    const deliveredPct = totalOrdered > 0 ? Math.round((totalDelivered / totalOrdered) * 100) : 0
    const invoicedPct = totalOrdered > 0 ? Math.round((totalInvoiced / totalOrdered) * 100) : 0

    const docItems: DocumentItem[] = soItems.map((it, idx) => {
      const ordered = (it.qty_ordered as number) || (it.quantity as number) || 0
      const delivered = (it.qty_delivered as number) || 0
      const invoiced = (it.qty_invoiced as number) || 0
      const isDone = delivered >= ordered
      return {
        id: (it.id as string) || `si-${idx}`,
        sku: (it.sku as string) || '',
        description: (it.description as string) || '',
        quantity: ordered,
        unit_price: (it.unit_price as number) || 0,
        subtotal: (it.line_total as number) || 0,
        qty_delivered: delivered,
        qty_invoiced: invoiced,
        qty_reserved: (it.qty_reserved as number) || 0,
        status: isDone ? 'completed' : delivered > 0 ? 'partial' : 'pending',
        statusColor: isDone ? '#00C853' : delivered > 0 ? '#FFB300' : '#6B7280',
        statusLabel: isDone ? 'Entregado' : delivered > 0 ? 'Parcial' : 'Pendiente',
        stockAvailable: 0, stockReserved: 0, stockIndicator: 'ok' as const,
        requires_po: false, hasComponents: false,
      }
    })

    const actionButtons = (
      <div className="flex gap-2 mt-4">
        {(st === 'open' || st === 'partially_delivered') && (
          <Button variant="secondary" onClick={() => openDelivery(selectedSO)}><Truck size={14} /> Generar Remito</Button>
        )}
        {(st === 'fully_delivered' || st === 'partially_invoiced') && (
          <Button onClick={() => handleInvoice(selectedSO)}><CreditCard size={14} /> Generar Factura</Button>
        )}
      </div>
    )

    return (
      <DocumentDetailLayout
        workflowSteps={buildSOWorkflow(selectedSO)}
        document={{
          id: selectedSO.id as string, type: 'pedido',
          system_code: (selectedSO.doc_number as string) || '',
          display_ref: `Pedido ${clientName}`,
          status: st, currency: (selectedSO.currency as string) || 'EUR',
          total: (selectedSO.total as number) || 0,
          subtotal: (selectedSO.subtotal as number) || 0,
          tax_amount: (selectedSO.tax_amount as number) || 0,
          created_at: (selectedSO.created_at as string) || new Date().toISOString(),
        }}
        client={clientObj ? { id: '', name: clientName, tax_id: (clientObj.tax_id as string), country: (clientObj.country as string) } : undefined}
        deliveryProgress={{
          clientName, deliveredPct, invoicedPct, collectedPct: 0,
          itemStatuses: docItems.map((i) => ({ label: i.statusLabel, color: i.statusColor })),
        }}
        trackingSummary={[
          { label: 'Items', value: soItems.length, color: '#F0F2F5' },
          { label: 'Entregado', value: `${deliveredPct}%`, color: deliveredPct >= 100 ? '#00C853' : '#FFB300' },
          { label: 'Facturado', value: `${invoicedPct}%`, color: invoicedPct >= 100 ? '#00C853' : '#6B7280' },
        ]}
        overallProgress={deliveredPct}
        notes={[]}
        onAddNote={() => {}}
        onBack={() => setSelectedSO(null)}
        backLabel="Volver a pedidos"
      >
        <DocumentItemsTree items={docItems} components={[]} showStock={false} />
        {actionButtons}
      </DocumentDetailLayout>
    )
  }

  const totalSOs = orders.length
  const openCount = orders.filter(o => o.status === 'open').length
  const deliveredCount = orders.filter(o => ((o.status as string) || '').includes('deliver')).length
  const totalVal = orders.reduce((s, o) => s + ((o.total as number) || 0), 0)

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <Button onClick={() => { setShowCreate(true); loadCreateData() }}><Plus size={16} /> Nuevo Pedido</Button>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <KPICard label="Total pedidos" value={totalSOs} icon={<Receipt size={22} />} />
        <KPICard label="Abiertos" value={openCount} icon={<Clock size={22} />} color="#3B82F6" />
        <KPICard label="Entregados" value={deliveredCount} icon={<Truck size={22} />} color="#10B981" />
        <KPICard label="Valor total" value={formatCurrency(totalVal)} icon={<CreditCard size={22} />} color="#F59E0B" />
      </div>
      <div className="bg-[#141820] rounded-xl border border-[#2A3040] p-3">
        <div className="flex flex-col sm:flex-row gap-3">
          <SearchBar placeholder="Buscar por nro de pedido..." value={search} onChange={setSearch} className="flex-1" />
          <Select options={[{ value: '', label: 'Todos' }, ...Object.entries(SO_STATUS).map(([k, v]) => ({ value: k, label: v.label }))]} value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} />
          <ExportButton
            data={orders as Record<string, unknown>[]}
            filename="pedidos_venta_torquetools"
            columns={[
              { key: 'doc_number', label: 'Numero' },
              { key: 'status', label: 'Estado' },
              { key: 'total', label: 'Total' },
              { key: 'currency', label: 'Moneda' },
              { key: 'created_at', label: 'Fecha' },
            ]}
          />
        </div>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-20"><Loader2 className="animate-spin text-[#FF6600]" size={32} /></div>
      ) : orders.length === 0 ? (
        <div className="text-center py-20 text-[#6B7280]"><Receipt size={48} className="mx-auto mb-3 opacity-30" /><p>No hay pedidos de venta</p></div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
          {orders.map((so) => {
            const isDoc = (so as Row & { _source?: string })._source === 'tt_documents'
            const clientName = (so as Row & { _clientName?: string })._clientName || '-'
            const st = (so.status as string) || 'open'
            const ref = isDoc ? getDocRef(so) : (so.doc_number as string) || '-'
            const statusMap = isDoc ? DOC_STATUS : SO_STATUS
            return (
              <DocumentListCard
                key={so.id as string} type="pedido"
                systemCode={ref}
                clientName={clientName}
                date={so.created_at ? formatDate(so.created_at as string) : '-'}
                total={(so.total as number) || 0}
                currency={(so.currency as string) || 'EUR'}
                status={st} statusLabel={statusMap[st]?.label || st}
                onClick={() => openDetail(so)}
              />
            )
          })}
        </div>
      )}

      {/* CREATE MODAL */}
      <Modal isOpen={showCreate} onClose={() => setShowCreate(false)} title="Nuevo Pedido de Venta" size="xl">
        <div className="space-y-6">
          <div className="p-4 rounded-lg bg-[#0F1218] border border-[#1E2330]">
            <h3 className="text-sm font-semibold text-[#F0F2F5] mb-3">Desde cotizacion existente</h3>
            <div className="flex gap-3 items-end">
              <div className="flex-1">
                <Select label="Cotizacion" options={quotesData.map(q => ({ value: q.id as string, label: `${q.doc_number || q.id} - $${q.total}` }))} value={selectedQuote} onChange={(e) => setSelectedQuote(e.target.value)} placeholder="Selecciona una cotizacion" />
              </div>
              <Button onClick={handleCreateFromQuote} loading={saving} disabled={!selectedQuote}><ArrowRight size={14} /> Crear desde COT</Button>
            </div>
          </div>
          <div className="relative text-center"><span className="text-xs text-[#4B5563] bg-[#141820] px-3 relative z-10">o crear desde cero</span><div className="absolute top-1/2 left-0 right-0 h-px bg-[#1E2330]" /></div>
          <div className="space-y-4">
            <Select label="Cliente" options={clients.map(c => ({ value: c.id as string, label: c.name as string }))} value={selectedClient} onChange={(e) => setSelectedClient(e.target.value)} placeholder="Selecciona un cliente" />
            <div>
              <div className="flex items-center justify-between mb-2"><span className="text-sm font-medium text-[#9CA3AF]">Items</span><Button variant="ghost" size="sm" onClick={() => setNewLines([...newLines, { product_id: '', name: '', qty: 1, price: 0 }])}><Plus size={14} /> Agregar</Button></div>
              {newLines.map((l, i) => (
                <div key={i} className="flex gap-2 mb-2 items-end">
                  <div className="flex-1"><Select options={products.map(p => ({ value: p.id as string, label: `${p.sku || ''} - ${p.name}` }))} value={l.product_id} onChange={(e) => { const u = [...newLines]; const p = products.find(pr => pr.id === e.target.value); if (p) u[i] = { ...u[i], product_id: p.id as string, name: (p.name || '') as string, price: (p.price_eur || 0) as number }; setNewLines(u) }} placeholder="Producto" /></div>
                  <Input type="number" value={l.qty} onChange={(e) => { const u = [...newLines]; u[i].qty = Number(e.target.value); setNewLines(u) }} className="w-20" />
                  <Input type="number" value={l.price} onChange={(e) => { const u = [...newLines]; u[i].price = Number(e.target.value); setNewLines(u) }} className="w-28" />
                  <Button variant="ghost" size="sm" onClick={() => setNewLines(newLines.filter((_, idx) => idx !== i))}><X size={14} /></Button>
                </div>
              ))}
            </div>
            <div className="flex justify-end gap-3 pt-4 border-t border-[#1E2330]"><Button variant="secondary" onClick={() => setShowCreate(false)}>Cancelar</Button><Button onClick={handleCreateFromScratch} loading={saving}>Crear Pedido</Button></div>
          </div>
        </div>
      </Modal>

      {/* DELIVERY NOTE MODAL */}
      <Modal isOpen={showDelivery} onClose={() => setShowDelivery(false)} title="Generar Remito" size="lg">
        <div className="space-y-4">
          <p className="text-sm text-[#6B7280]">Indica las cantidades a entregar para cada item</p>
          {deliveryLines.map((l, i) => (
            <div key={l.id} className="flex items-center gap-3 p-3 rounded-lg bg-[#0F1218]">
              <div className="flex-1"><p className="text-sm text-[#F0F2F5]">{l.desc}</p><p className="text-xs text-[#6B7280]">Pedido: {l.ordered} | Entregado: {l.delivered} | Pend: {l.ordered - l.delivered}</p></div>
              <Input type="number" value={l.toDeliver} onChange={(e) => { const u = [...deliveryLines]; u[i].toDeliver = Math.max(0, Math.min(Number(e.target.value), l.ordered - l.delivered)); setDeliveryLines(u) }} className="w-24" />
            </div>
          ))}
          <div className="flex justify-end gap-3 pt-4 border-t border-[#1E2330]"><Button variant="secondary" onClick={() => setShowDelivery(false)}>Cancelar</Button><Button onClick={handleDelivery}><Truck size={16} /> Confirmar Remito</Button></div>
        </div>
      </Modal>
    </div>
  )
}

// ===============================================================
// ALBARANES TAB
// ===============================================================
function AlbaranesTab() {
  const supabase = createClient()
  const [notes, setNotes] = useState<Row[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState('')

  const load = useCallback(async () => {
    setLoading(true)
    // Load from tt_documents (StelOrder historical albaranes)
    let qDoc = supabase.from('tt_documents').select('*')
      .eq('type', 'delivery_note')
      .order('created_at', { ascending: false })
      .range(0, 99)
    if (statusFilter) qDoc = qDoc.eq('status', statusFilter)
    if (search) qDoc = qDoc.or(`display_ref.ilike.%${search}%,system_code.ilike.%${search}%`)
    const { data: docData } = await qDoc

    // Also load from tt_delivery_notes (locally created)
    let qLocal = supabase.from('tt_delivery_notes').select('*, tt_clients(name), tt_sales_orders(doc_number)').order('created_at', { ascending: false })
    if (statusFilter) qLocal = qLocal.eq('status', statusFilter)
    if (search) qLocal = qLocal.ilike('doc_number', `%${search}%`)
    const { data: localData } = await qLocal

    const localMapped = (localData || []).map((n: Row) => ({
      ...n, _source: 'local' as const,
      _clientName: ((n.tt_clients as Row)?.name as string) || '-',
    }))
    const docMapped = (docData || []).map((d: Row) => ({
      ...d, _source: 'tt_documents' as const,
      _clientName: getClientName(d),
    }))
    setNotes([...localMapped, ...docMapped])
    setLoading(false)
  }, [supabase, statusFilter, search])

  useEffect(() => { load() }, [load])

  const totalNotes = notes.length
  const pendingCount = notes.filter(n => n.status === 'pending').length

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <KPICard label="Total albaranes" value={totalNotes} icon={<Truck size={22} />} />
        <KPICard label="Pendientes" value={pendingCount} icon={<Clock size={22} />} color="#F59E0B" />
      </div>
      <div className="bg-[#141820] rounded-xl border border-[#2A3040] p-3">
        <div className="flex flex-col sm:flex-row gap-3">
          <SearchBar placeholder="Buscar albaran..." value={search} onChange={setSearch} className="flex-1" />
          <Select options={[{ value: '', label: 'Todos' }, ...Object.entries(DN_STATUS).map(([k, v]) => ({ value: k, label: v.label }))]} value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} />
          <ExportButton
            data={notes as Record<string, unknown>[]}
            filename="albaranes_torquetools"
            columns={[
              { key: 'doc_number', label: 'Numero' },
              { key: 'status', label: 'Estado' },
              { key: 'total', label: 'Total' },
              { key: 'created_at', label: 'Fecha' },
            ]}
          />
        </div>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-20"><Loader2 className="animate-spin text-[#FF6600]" size={32} /></div>
      ) : notes.length === 0 ? (
        <div className="text-center py-20 text-[#6B7280]"><Truck size={48} className="mx-auto mb-3 opacity-30" /><p>No hay albaranes</p></div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
          {notes.map((n) => {
            const isDoc = (n as Row & { _source?: string })._source === 'tt_documents'
            const clientName = (n as Row & { _clientName?: string })._clientName || '-'
            const st = (n.status as string) || 'pending'
            const ref = isDoc ? getDocRef(n) : (n.doc_number as string) || '-'
            const statusMap = isDoc ? DOC_STATUS : DN_STATUS
            return (
              <DocumentListCard
                key={n.id as string} type="delivery_note"
                systemCode={ref}
                displayRef={isDoc ? undefined : (n.tt_sales_orders as Row)?.doc_number as string}
                clientName={clientName}
                date={n.created_at ? formatDate(n.created_at as string) : '-'}
                total={isDoc ? ((n.total as number) || 0) : 0} currency="EUR" status={st}
                statusLabel={statusMap[st]?.label || st}
                onClick={() => {}}
              />
            )
          })}
        </div>
      )}
    </div>
  )
}

// ===============================================================
// FACTURAS TAB
// ===============================================================
function FacturasTab() {
  const supabase = createClient()
  const { addToast } = useToast()
  const [invoices, setInvoices] = useState<Row[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState('')

  const load = useCallback(async () => {
    setLoading(true)
    // Load from tt_documents (StelOrder historical facturas)
    let qDoc = supabase.from('tt_documents').select('*')
      .in('type', ['factura', 'factura_abono'])
      .order('created_at', { ascending: false })
      .range(0, 99)
    if (statusFilter) qDoc = qDoc.eq('status', statusFilter)
    if (search) qDoc = qDoc.or(`display_ref.ilike.%${search}%,system_code.ilike.%${search}%`)
    const { data: docData } = await qDoc

    // Also load from tt_invoices (locally created)
    let qLocal = supabase.from('tt_invoices').select('*, tt_clients(name)').eq('type', 'sale').order('created_at', { ascending: false })
    if (statusFilter) qLocal = qLocal.eq('status', statusFilter)
    if (search) qLocal = qLocal.ilike('doc_number', `%${search}%`)
    const { data: localData } = await qLocal

    const localMapped = (localData || []).map((inv: Row) => ({
      ...inv, _source: 'local' as const,
      _clientName: ((inv.tt_clients as Row)?.name as string) || '-',
    }))
    const docMapped = (docData || []).map((d: Row) => ({
      ...d, _source: 'tt_documents' as const,
      _clientName: getClientName(d),
    }))
    setInvoices([...localMapped, ...docMapped])
    setLoading(false)
  }, [supabase, statusFilter, search])

  useEffect(() => { load() }, [load])

  const registerPayment = async (inv: Row) => {
    await supabase.from('tt_invoices').update({ status: 'paid' }).eq('id', inv.id)
    await supabase.from('tt_payments').insert({ invoice_id: inv.id, amount: inv.total, method: 'transferencia', status: 'completed' })
    addToast({ type: 'success', title: 'Pago registrado' })
    load()
  }

  const totalInv = invoices.length
  const pendingAmount = invoices.filter(i => i.status !== 'paid').reduce((s, i) => s + ((i.total as number) || 0), 0)
  const paidCount = invoices.filter(i => i.status === 'paid').length

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <KPICard label="Total facturas" value={totalInv} icon={<FileCheck size={22} />} />
        <KPICard label="Cobradas" value={paidCount} icon={<CreditCard size={22} />} color="#10B981" />
        <KPICard label="Pendiente cobro" value={formatCurrency(pendingAmount)} icon={<CreditCard size={22} />} color="#F59E0B" />
      </div>
      <div className="bg-[#141820] rounded-xl border border-[#2A3040] p-3">
        <div className="flex flex-col sm:flex-row gap-3">
          <SearchBar placeholder="Buscar factura..." value={search} onChange={setSearch} className="flex-1" />
          <Select options={[{ value: '', label: 'Todas' }, ...Object.entries(INV_STATUS).map(([k, v]) => ({ value: k, label: v.label }))]} value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} />
          <ExportButton
            data={invoices as Record<string, unknown>[]}
            filename="facturas_venta_torquetools"
            columns={[
              { key: 'doc_number', label: 'Numero' },
              { key: 'status', label: 'Estado' },
              { key: 'total', label: 'Total' },
              { key: 'currency', label: 'Moneda' },
              { key: 'created_at', label: 'Fecha' },
            ]}
          />
        </div>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-20"><Loader2 className="animate-spin text-[#FF6600]" size={32} /></div>
      ) : invoices.length === 0 ? (
        <div className="text-center py-20 text-[#6B7280]"><FileCheck size={48} className="mx-auto mb-3 opacity-30" /><p>No hay facturas de venta</p></div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
          {invoices.map((inv) => {
            const isDoc = (inv as Row & { _source?: string })._source === 'tt_documents'
            const clientName = (inv as Row & { _clientName?: string })._clientName || '-'
            const st = (inv.status as string) || 'draft'
            const ref = isDoc ? getDocRef(inv) : (inv.doc_number as string) || '-'
            const statusMap = isDoc ? DOC_STATUS : INV_STATUS
            return (
              <DocumentListCard
                key={inv.id as string} type="factura"
                systemCode={ref}
                clientName={clientName}
                date={inv.created_at ? formatDate(inv.created_at as string) : '-'}
                total={(inv.total as number) || 0}
                currency={(inv.currency as string) || 'EUR'}
                status={st} statusLabel={statusMap[st]?.label || st}
                onClick={() => { if (!isDoc && st !== 'paid') registerPayment(inv) }}
              />
            )
          })}
        </div>
      )}
    </div>
  )
}

// ===============================================================
// COBROS TAB
// ===============================================================
function CobrosTab() {
  const supabase = createClient()
  const [payments, setPayments] = useState<Row[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')

  const load = useCallback(async () => {
    setLoading(true)
    let q = supabase.from('tt_payments').select('*, tt_invoices(doc_number)').order('created_at', { ascending: false })
    if (search) q = q.ilike('method', `%${search}%`)
    const { data } = await q
    setPayments(data || [])
    setLoading(false)
  }, [supabase, search])

  useEffect(() => { load() }, [load])

  const totalAmount = payments.reduce((s, p) => s + ((p.amount as number) || 0), 0)

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <KPICard label="Total cobros" value={payments.length} icon={<DollarSign size={22} />} />
        <KPICard label="Monto total" value={formatCurrency(totalAmount)} icon={<CreditCard size={22} />} color="#10B981" />
      </div>
      <div className="bg-[#141820] rounded-xl border border-[#2A3040] p-3 flex gap-3 items-center">
        <SearchBar placeholder="Buscar cobro..." value={search} onChange={setSearch} className="flex-1" />
        <ExportButton
          data={payments as Record<string, unknown>[]}
          filename="cobros_torquetools"
          columns={[
            { key: 'reference', label: 'Referencia' },
            { key: 'amount', label: 'Monto' },
            { key: 'method', label: 'Metodo' },
            { key: 'status', label: 'Estado' },
            { key: 'created_at', label: 'Fecha' },
          ]}
        />
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-20"><Loader2 className="animate-spin text-[#FF6600]" size={32} /></div>
      ) : payments.length === 0 ? (
        <div className="text-center py-20 text-[#6B7280]"><DollarSign size={48} className="mx-auto mb-3 opacity-30" /><p>No hay cobros registrados</p></div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
          {payments.map((p) => {
            const invRef = (p.tt_invoices as Row)?.doc_number as string || '-'
            return (
              <DocumentListCard
                key={p.id as string} type="cobro"
                systemCode={invRef}
                displayRef={(p.method as string) || 'transferencia'}
                clientName={`Cobro ${invRef}`}
                date={p.created_at ? formatDate(p.created_at as string) : '-'}
                total={(p.amount as number) || 0}
                currency="EUR" status={(p.status as string) || 'completed'}
                statusLabel={(p.status as string) || 'completado'}
                onClick={() => {}}
              />
            )
          })}
        </div>
      )}
    </div>
  )
}

// ===============================================================
// MAIN PAGE
// ===============================================================
export default function VentasPage() {
  return (
    <div className="space-y-6 animate-fade-in">
      <div>
        <h1 className="text-2xl font-bold text-[#F0F2F5]">Ventas</h1>
        <p className="text-sm text-[#6B7280] mt-1">Presupuestos, pedidos, albaranes, facturas y cobros</p>
      </div>
      <Suspense fallback={<div className="flex justify-center py-10"><Loader2 className="animate-spin text-[#FF6600]" size={32} /></div>}>
        <Tabs tabs={ventasTabs} defaultTab="presupuestos">
          {(activeTab) => (
            <>
              {activeTab === 'presupuestos' && <PresupuestosTab />}
              {activeTab === 'pedidos' && <PedidosTab />}
              {activeTab === 'albaranes' && <AlbaranesTab />}
              {activeTab === 'facturas' && <FacturasTab />}
              {activeTab === 'cobros' && <CobrosTab />}
            </>
          )}
        </Tabs>
      </Suspense>
    </div>
  )
}
