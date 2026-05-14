'use client'

import { useState, useEffect, useCallback, useRef, Suspense } from 'react'
import { useSearchParams } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { useCompanyFilter } from '@/hooks/use-company-filter'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Select } from '@/components/ui/select'
import { Modal } from '@/components/ui/modal'
import { Tabs } from '@/components/ui/tabs'
import { useToast } from '@/components/ui/toast'
import { DataTable, type DataTableColumn } from '@/components/ui/data-table'
import { formatCurrency, formatDate } from '@/lib/utils'
import { DocumentDetailLayout, type WorkflowStep } from '@/components/workflow/document-detail-layout'
import { DocumentItemsTree, type DocumentItem } from '@/components/workflow/document-items-tree'
import { DocumentActions } from '@/components/workflow/document-actions'
import { DocumentForm } from '@/components/workflow/document-form'
import {
  documentToTableRow, localQuoteToRow, localSOToRow, localDNToRow,
  localInvoiceToRow, paymentToRow, mapStatus
} from '@/lib/document-helpers'
import { KPICard } from '@/components/ui/kpi-card'
import { Badge } from '@/components/ui/badge'
import { SearchBar } from '@/components/ui/search-bar'
import {
  Receipt, Plus, Loader2, FileText, Truck, CreditCard,
  Clock, ArrowRight, X, DollarSign, Save,
  ClipboardList, FileCheck, CheckSquare, Square, AlertTriangle,
  GitMerge, RotateCcw, ArrowLeft, Eye,
} from 'lucide-react'

type Row = Record<string, unknown>

// ===============================================================
// STATUS MAPS (for detail views)
// ===============================================================
const SO_STATUS: Record<string, { label: string; variant: 'default' | 'success' | 'warning' | 'danger' | 'info' | 'orange' }> = {
  open: { label: 'Abierto', variant: 'info' },
  partially_delivered: { label: 'Entrega parcial', variant: 'warning' },
  fully_delivered: { label: 'Entregado', variant: 'success' },
  partially_invoiced: { label: 'Facturacion parcial', variant: 'orange' },
  fully_invoiced: { label: 'Facturado', variant: 'success' },
  closed: { label: 'Cerrado', variant: 'default' },
}

const ventasTabs = [
  { id: 'presupuestos', label: 'Presupuestos', icon: <FileText size={16} /> },
  { id: 'pedidos', label: 'Pedidos', icon: <ClipboardList size={16} /> },
  { id: 'albaranes', label: 'Albaranes', icon: <Truck size={16} /> },
  { id: 'facturas', label: 'Facturas', icon: <FileCheck size={16} /> },
  { id: 'notas_credito', label: 'Notas de credito', icon: <RotateCcw size={16} /> },
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
// COLUMN DEFINITIONS
// ===============================================================
const PRESUPUESTO_COLS: DataTableColumn[] = [
  { key: 'referencia', label: 'Referencia', sortable: true, searchable: true, width: '140px' },
  { key: 'cliente', label: 'Cliente', sortable: true, searchable: true },
  { key: 'titulo', label: 'Titulo / Descripcion', searchable: true },
  { key: 'estado', label: 'Estado', sortable: true, type: 'status', width: '120px' },
  { key: 'fecha', label: 'Fecha', sortable: true, type: 'date', width: '110px' },
  { key: 'importe', label: 'Importe', sortable: true, type: 'currency', width: '120px' },
]

const PEDIDO_COLS: DataTableColumn[] = [
  { key: 'referencia', label: 'Referencia', sortable: true, searchable: true, width: '140px' },
  { key: 'cliente', label: 'Cliente', sortable: true, searchable: true },
  { key: 'titulo', label: 'Titulo', searchable: true },
  { key: 'creado_por', label: 'Creado por', searchable: true, defaultVisible: false },
  { key: 'estado', label: 'Estado', sortable: true, type: 'status', width: '120px' },
  { key: 'fecha', label: 'Fecha', sortable: true, type: 'date', width: '110px' },
  { key: 'importe', label: 'Importe', sortable: true, type: 'currency', width: '120px' },
]

const ALBARAN_COLS: DataTableColumn[] = [
  { key: 'referencia', label: 'Referencia', sortable: true, searchable: true, width: '140px' },
  { key: 'cliente', label: 'Cliente', sortable: true, searchable: true },
  { key: 'titulo', label: 'Titulo', searchable: true },
  { key: 'creado_por', label: 'Creado por', searchable: true, defaultVisible: false },
  { key: 'estado', label: 'Estado', sortable: true, type: 'status', width: '120px' },
  { key: 'fecha', label: 'Fecha', sortable: true, type: 'date', width: '110px' },
  { key: 'importe', label: 'Importe', sortable: true, type: 'currency', width: '120px' },
]

const FACTURA_COLS: DataTableColumn[] = [
  { key: 'referencia', label: 'Referencia', sortable: true, searchable: true, width: '140px' },
  { key: 'cliente', label: 'Cliente', sortable: true, searchable: true },
  { key: 'titulo', label: 'Titulo', searchable: true },
  { key: 'estado', label: 'Estado', sortable: true, type: 'status', width: '120px' },
  { key: 'fecha', label: 'Fecha', sortable: true, type: 'date', width: '110px' },
  { key: 'importe', label: 'Importe', sortable: true, type: 'currency', width: '120px' },
]

const COBRO_COLS: DataTableColumn[] = [
  { key: 'referencia', label: 'Referencia', sortable: true, searchable: true, width: '140px' },
  { key: 'cliente', label: 'Cliente', searchable: true },
  { key: 'concepto', label: 'Concepto / Forma pago', searchable: true },
  { key: 'estado', label: 'Estado', sortable: true, type: 'status', width: '120px' },
  { key: 'fecha', label: 'Fecha', sortable: true, type: 'date', width: '110px' },
  { key: 'importe', label: 'Importe', sortable: true, type: 'currency', width: '120px' },
]

const NOTA_CREDITO_COLS: DataTableColumn[] = [
  { key: 'referencia', label: 'Numero', sortable: true, searchable: true, width: '140px' },
  { key: 'cliente', label: 'Cliente', sortable: true, searchable: true },
  { key: 'factura_original', label: 'Factura original', searchable: true, width: '140px' },
  { key: 'motivo', label: 'Motivo', searchable: true, width: '160px' },
  { key: 'estado', label: 'Estado', sortable: true, type: 'status', width: '120px' },
  { key: 'fecha', label: 'Fecha', sortable: true, type: 'date', width: '110px' },
  { key: 'importe', label: 'Total', sortable: true, type: 'currency', width: '120px' },
]

const CREDIT_NOTE_REASON_LABELS: Record<string, string> = {
  devolucion: 'Devolucion',
  error_facturacion: 'Error de facturacion',
  descuento_posterior: 'Descuento posterior',
  anulacion: 'Anulacion',
  otro: 'Otro',
}

// ===============================================================
// PRESUPUESTOS TAB
// ===============================================================
function PresupuestosTab() {
  const { filterByCompany, companyKey } = useCompanyFilter()
  const supabase = createClient()
  const [rows, setRows] = useState<Record<string, unknown>[]>([])
  const [loading, setLoading] = useState(true)
  const [selectedDoc, setSelectedDoc] = useState<{ id: string; source: 'local' | 'tt_documents' } | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    const sb = createClient()
    let q = sb.from('tt_documents').select('*, client:tt_clients(id, name, legal_name, tax_id)').in('doc_type', ['coti', 'presupuesto', 'quote'])
    q = filterByCompany(q)
    const [{ data: docData }, { data: localData }] = await Promise.all([
      q.order('created_at', { ascending: false }).range(0, 499),
      sb.from('tt_quotes').select('*, tt_clients(name, tax_id, country)').order('created_at', { ascending: false }),
    ])
    const localRows = (localData || []).map(localQuoteToRow)
    const docRows = (docData || []).map(documentToTableRow)
    setRows([...localRows, ...docRows])
    setLoading(false)
  }, [companyKey])

  useEffect(() => { load() }, [load])

  const openDetail = (row: Record<string, unknown>) => {
    const doc = row._raw as Row
    const src = row._source as string
    setSelectedDoc({ id: doc.id as string, source: src === 'local' ? 'local' : 'tt_documents' })
  }

  if (selectedDoc) {
    const allIds = rows.map(r => (r._raw as Row).id as string)
    return (
      <DocumentForm
        documentId={selectedDoc.id}
        documentType="coti"
        source={selectedDoc.source}
        onBack={() => { setSelectedDoc(null); load() }}
        onUpdate={load}
        siblingIds={allIds}
      />
    )
  }

  return (
    <DataTable
      data={rows}
      columns={PRESUPUESTO_COLS}
      loading={loading}
      totalLabel="presupuestos"
      showTotals
      onRowClick={openDetail}
      exportFilename="presupuestos_torquetools"
      pageSize={25}
    />
  )
}

// ===============================================================
// PEDIDOS TAB
// ===============================================================
function PedidosTab() {
  const { filterByCompany, companyKey } = useCompanyFilter()
  const supabase = createClient()
  const { addToast } = useToast()
  const searchParams = useSearchParams()
  const highlightId = searchParams.get('highlight')
  const highlightConsumed = useRef<string | null>(null)

  const [rows, setRows] = useState<Record<string, unknown>[]>([])
  const [loading, setLoading] = useState(true)
  const [selectedSO, setSelectedSO] = useState<Row | null>(null)
  const [soItems, setSOItems] = useState<Row[]>([])
  const [showCreate, setShowCreate] = useState(false)
  const [showDelivery, setShowDelivery] = useState(false)

  const [clients, setClients] = useState<Array<Row>>([])
  const [quotesData, setQuotesData] = useState<Array<Row>>([])
  const [selectedQuote, setSelectedQuoteForm] = useState('')
  const [selectedClient, setSelectedClient] = useState('')
  const [products, setProducts] = useState<Array<Row>>([])
  const [newLines, setNewLines] = useState<Array<{ product_id: string; name: string; qty: number; price: number }>>([])
  const [saving, setSaving] = useState(false)
  const [deliveryLines, setDeliveryLines] = useState<Array<{ id: string; desc: string; ordered: number; delivered: number; toDeliver: number }>>([])

  const load = useCallback(async () => {
    setLoading(true)
    const sb = createClient()
    let q = sb.from('tt_documents').select('*, client:tt_clients(id, name, legal_name, tax_id)').in('doc_type', ['pedido', 'order', 'so'])
    q = filterByCompany(q)
    const [{ data: docData }, { data: localData }] = await Promise.all([
      q.order('created_at', { ascending: false }).range(0, 499),
      sb.from('tt_sales_orders').select('*, tt_clients(name, tax_id, country)').order('created_at', { ascending: false }),
    ])
    const localRows = (localData || []).map(localSOToRow)
    const docRows = (docData || []).map(documentToTableRow)
    setRows([...localRows, ...docRows])
    setLoading(false)
  }, [companyKey])

  useEffect(() => { load() }, [load])

  // Auto-abrir el detalle cuando llegamos desde el cotizador con ?highlight=<id>.
  // Se consume una sola vez por id para que después de cerrar el detalle no
  // se vuelva a abrir solo.
  useEffect(() => {
    if (!highlightId || loading || rows.length === 0) return
    if (highlightConsumed.current === highlightId) return
    const found = rows.find((r) => {
      const raw = r._raw as Row | undefined
      return raw?.id === highlightId
    })
    if (found) {
      highlightConsumed.current = highlightId
      const doc = found._raw as Row
      const src = found._source as string
      setSelectedSO({ id: doc.id as string, source: src === 'local' ? 'local' : 'tt_documents' } as unknown as Row)
      addToast({ type: 'success', title: 'Pedido abierto', message: `${(doc.number || doc.display_ref || doc.system_code) ?? ''}` })
    }
  }, [highlightId, loading, rows, addToast])

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
    setShowCreate(false); setSelectedQuoteForm(''); load(); setSaving(false)
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

  const openDetail = (row: Record<string, unknown>) => {
    const doc = row._raw as Row
    const src = row._source as string
    setSelectedSO({ id: doc.id as string, source: src === 'local' ? 'local' : 'tt_documents' } as unknown as Row)
  }

  const openDelivery = async (so: Row) => {
    const rawSO = so as Row
    setSelectedSO(rawSO)
    const { data } = await supabase.from('tt_so_items').select('*').eq('sales_order_id', rawSO.id).order('sort_order')
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

  // Detail view via DocumentForm
  if (selectedSO && !showDelivery) {
    const docInfo = selectedSO as unknown as { id: string; source: 'local' | 'tt_documents' }
    const allIds = rows.map(r => (r._raw as Row).id as string)
    return (
      <DocumentForm
        documentId={docInfo.id}
        documentType="pedido"
        source={docInfo.source}
        onBack={() => { setSelectedSO(null); load() }}
        onUpdate={load}
        siblingIds={allIds}
      />
    )
  }

  return (
    <>
      <DataTable
        data={rows}
        columns={PEDIDO_COLS}
        loading={loading}
        totalLabel="pedidos"
        showTotals
        onRowClick={openDetail}
        onNewClick={() => { setShowCreate(true); loadCreateData() }}
        newLabel="Nuevo Pedido"
        exportFilename="pedidos_venta_torquetools"
        pageSize={25}
      />

      {/* CREATE MODAL */}
      <Modal isOpen={showCreate} onClose={() => setShowCreate(false)} title="Nuevo Pedido de Venta" size="xl">
        <div className="space-y-6">
          <div className="p-4 rounded-lg bg-[#0F1218] border border-[#1E2330]">
            <h3 className="text-sm font-semibold text-[#F0F2F5] mb-3">Desde cotizacion existente</h3>
            <div className="flex gap-3 items-end">
              <div className="flex-1">
                <Select label="Cotizacion" options={quotesData.map(q => ({ value: q.id as string, label: `${q.doc_number || q.id} - $${q.total}` }))} value={selectedQuote} onChange={(e) => setSelectedQuoteForm(e.target.value)} placeholder="Selecciona una cotizacion" />
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
    </>
  )
}

// ===============================================================
// ALBARANES TAB (with consolidation feature)
// ===============================================================
function AlbaranesTab() {
  const { filterByCompany, companyKey } = useCompanyFilter()
  const { addToast } = useToast()
  const [rows, setRows] = useState<Record<string, unknown>[]>([])
  const [loading, setLoading] = useState(true)
  const [selectedDoc, setSelectedDoc] = useState<{ id: string; source: 'local' | 'tt_documents' } | null>(null)

  // Selection state for consolidation
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [showConsolidateModal, setShowConsolidateModal] = useState(false)
  const [consolidating, setConsolidating] = useState(false)
  const [consolidatePreview, setConsolidatePreview] = useState<{
    clientName: string
    clientId: string
    companyId: string
    deliveryNotes: Array<{ id: string; ref: string; date: string; total: number }>
    items: Array<{ sku: string; description: string; quantity: number; unit_price: number; discount_pct: number; subtotal: number; source_dn_ref: string; product_id: string | null }>
    totalAmount: number
    currency: string
  } | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    const sb = createClient()
    let q = sb.from('tt_documents').select('*, client:tt_clients(id, name, legal_name, tax_id)').in('doc_type', ['delivery_note', 'albaran', 'remito'])
    q = filterByCompany(q)
    const [{ data: docData }, { data: localData }] = await Promise.all([
      q.order('created_at', { ascending: false }).range(0, 499),
      sb.from('tt_delivery_notes').select('*, tt_clients(name), tt_sales_orders(doc_number)').order('created_at', { ascending: false }),
    ])
    const localRows = (localData || []).map(localDNToRow)
    const docRows = (docData || []).map(documentToTableRow)
    setRows([...localRows, ...docRows])
    setLoading(false)
  }, [companyKey])

  useEffect(() => { load() }, [load])

  const openDetail = (row: Record<string, unknown>) => {
    const doc = row._raw as Row
    const src = row._source as string
    setSelectedDoc({ id: doc.id as string, source: src === 'local' ? 'local' : 'tt_documents' })
  }

  const toggleSelection = (id: string) => {
    setSelectedIds(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const selectableRows = rows.filter(r => {
    const src = r._source as string
    const status = ((r.estado as string) || '').toLowerCase()
    return src === 'tt_documents' && status !== 'facturado' && status !== 'invoiced'
  })

  const toggleSelectAll = () => {
    if (selectedIds.size > 0) {
      setSelectedIds(new Set())
    } else {
      setSelectedIds(new Set(selectableRows.map(r => (r._raw as Row).id as string)))
    }
  }

  const prepareConsolidate = useCallback(async () => {
    if (selectedIds.size < 2) {
      addToast({ type: 'warning', title: 'Selecciona al menos 2 albaranes' })
      return
    }
    const sb = createClient()
    const ids = Array.from(selectedIds)
    const { data: docs } = await sb
      .from('tt_documents')
      .select('id, display_ref, system_code, client_id, company_id, total, subtotal, tax_amount, currency, status, created_at, client:tt_clients(id, name, legal_name)')
      .in('id', ids)
    if (!docs || docs.length === 0) { addToast({ type: 'error', title: 'No se pudieron cargar los albaranes' }); return }
    const clientIds = new Set(docs.map(d => d.client_id).filter(Boolean))
    if (clientIds.size > 1) { addToast({ type: 'error', title: 'Error de validacion', message: 'Todos los albaranes deben ser del mismo cliente' }); return }
    const companyIds = new Set(docs.map(d => d.company_id).filter(Boolean))
    if (companyIds.size > 1) { addToast({ type: 'error', title: 'Error de validacion', message: 'Todos los albaranes deben ser de la misma empresa' }); return }
    const alreadyInvoiced = docs.filter(d => d.status === 'facturado' || d.status === 'invoiced')
    if (alreadyInvoiced.length > 0) { addToast({ type: 'error', title: 'Error de validacion', message: `${alreadyInvoiced.length} albaran(es) ya estan facturados` }); return }
    const { data: allItems } = await sb.from('tt_document_lines').select('*').in('document_id', ids).order('sort_order')
    const clientData = docs[0].client as unknown as Row | null
    const deliveryNotes = docs.map(d => ({ id: d.id, ref: (d.display_ref as string) || (d.system_code as string) || 'S/N', date: d.created_at ? formatDate(d.created_at as string) : '-', total: (d.total as number) || 0 }))
    const docRefMap = new Map<string, string>()
    for (const d of docs) docRefMap.set(d.id, (d.display_ref as string) || (d.system_code as string) || 'S/N')
    const items = (allItems || []).filter((it: Row) => !(it.is_section as boolean)).map((it: Row) => ({
      sku: (it.sku as string) || '', description: (it.description as string) || '', quantity: (it.quantity as number) || 0,
      unit_price: (it.unit_price as number) || 0, discount_pct: (it.discount_pct as number) || 0,
      subtotal: (it.subtotal as number) || (it.line_total as number) || 0,
      source_dn_ref: docRefMap.get((it.document_id as string) || '') || '', product_id: (it.product_id as string) || null,
    }))
    const totalAmount = items.reduce((s: number, i: { subtotal: number }) => s + i.subtotal, 0)
    setConsolidatePreview({
      clientName: (clientData?.legal_name as string) || (clientData?.name as string) || 'Sin cliente',
      clientId: (docs[0].client_id as string) || '', companyId: (docs[0].company_id as string) || '',
      deliveryNotes, items, totalAmount, currency: (docs[0].currency as string) || 'EUR',
    })
    setShowConsolidateModal(true)
  }, [selectedIds, addToast])

  const executeConsolidate = useCallback(async () => {
    if (!consolidatePreview) return
    setConsolidating(true)
    try {
      const sb = createClient()
      const yr = new Date().getFullYear().toString().slice(-2)
      const mo = (new Date().getMonth() + 1).toString().padStart(2, '0')
      const seq = Math.floor(Math.random() * 9999).toString().padStart(4, '0')
      const invoiceRef = `FAC-${yr}${mo}-${seq}`
      const subtotal = consolidatePreview.totalAmount
      const taxRate = 21
      const taxAmount = subtotal * (taxRate / 100)
      const total = subtotal + taxAmount
      const { data: newInvoice, error: invoiceErr } = await sb.from('tt_documents').insert({
        doc_type: 'factura', status: 'pending', display_ref: invoiceRef, system_code: invoiceRef,
        client_id: consolidatePreview.clientId, company_id: consolidatePreview.companyId,
        currency: consolidatePreview.currency, subtotal, tax_amount: taxAmount, total,
        notes: `Factura consolidada de ${consolidatePreview.deliveryNotes.length} albaranes: ${consolidatePreview.deliveryNotes.map(dn => dn.ref).join(', ')}`,
        metadata: { tax_rate: taxRate, consolidated_from: consolidatePreview.deliveryNotes.map(dn => ({ id: dn.id, ref: dn.ref })) },
        paid_amount: 0, payment_count: 0,
      }).select().single()
      if (invoiceErr || !newInvoice) throw invoiceErr || new Error('Error creando factura')
      const itemInserts = consolidatePreview.items.map((item, idx) => ({
        document_id: newInvoice.id, sku: item.sku, description: item.description, quantity: item.quantity,
        unit_price: item.unit_price, discount_pct: item.discount_pct, subtotal: item.subtotal,
        sort_order: idx, product_id: item.product_id, notes: `Desde albaran: ${item.source_dn_ref}`,
      }))
      if (itemInserts.length > 0) { const { error: itemsErr } = await sb.from('tt_document_lines').insert(itemInserts); if (itemsErr) throw itemsErr }
      const linkInserts = consolidatePreview.deliveryNotes.map(dn => ({ parent_id: dn.id, child_id: newInvoice.id, relation_type: 'consolidated_invoice' }))
      await sb.from('tt_document_relations').insert(linkInserts)
      try { await sb.from('tt_invoice_sources').insert(consolidatePreview.deliveryNotes.map(dn => ({ invoice_id: newInvoice.id, source_document_id: dn.id, source_type: 'delivery_note' }))) } catch { /* table might not exist */ }
      await sb.from('tt_documents').update({ status: 'facturado' }).in('id', consolidatePreview.deliveryNotes.map(dn => dn.id))
      try { await sb.from('tt_activity_log').insert({ entity_type: 'document', entity_id: newInvoice.id, action: 'consolidate', detail: `Factura consolidada desde ${consolidatePreview.deliveryNotes.length} albaranes` }) } catch { /* ignore */ }
      addToast({ type: 'success', title: `Factura ${invoiceRef} creada`, message: `Consolidados ${consolidatePreview.deliveryNotes.length} albaranes` })
      setShowConsolidateModal(false); setConsolidatePreview(null); setSelectedIds(new Set()); load()
    } catch (err) { addToast({ type: 'error', title: 'Error consolidando', message: (err as Error).message }) }
    finally { setConsolidating(false) }
  }, [consolidatePreview, addToast, load])

  if (selectedDoc) {
    const allIds = rows.map(r => (r._raw as Row).id as string)
    return (
      <DocumentForm
        documentId={selectedDoc.id}
        documentType="delivery_note"
        source={selectedDoc.source}
        onBack={() => { setSelectedDoc(null); load() }}
        onUpdate={load}
        siblingIds={allIds}
      />
    )
  }

  return (
    <div className="space-y-0 relative">
      {/* Selection toggle header */}
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-3">
          <button onClick={toggleSelectAll} className="flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-medium text-[#9CA3AF] hover:text-[#F0F2F5] hover:bg-[#1E2330] transition-colors">
            {selectedIds.size > 0 ? <CheckSquare size={14} className="text-[#FF6600]" /> : <Square size={14} />}
            {selectedIds.size > 0 ? `${selectedIds.size} seleccionado(s)` : 'Seleccionar para facturar'}
          </button>
          {selectedIds.size > 0 && (
            <button onClick={() => setSelectedIds(new Set())} className="text-xs text-[#6B7280] hover:text-[#F0F2F5] transition-colors">Deseleccionar todo</button>
          )}
        </div>
      </div>

      {/* Custom data table with checkboxes */}
      <div className="bg-[#141820] rounded-xl border border-[#2A3040] overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-[#2A3040] text-[#6B7280] text-xs uppercase tracking-wider">
                <th className="w-10 px-2 py-3 text-center">
                  <button onClick={toggleSelectAll} className="hover:text-[#FF6600] transition-colors">
                    {selectedIds.size > 0 && selectedIds.size === selectableRows.length ? <CheckSquare size={14} className="text-[#FF6600]" /> : <Square size={14} />}
                  </button>
                </th>
                <th className="text-left px-4 py-3 w-[140px]">Referencia</th>
                <th className="text-left px-4 py-3">Cliente</th>
                <th className="text-left px-4 py-3">Titulo</th>
                <th className="text-left px-4 py-3 w-[120px]">Estado</th>
                <th className="text-left px-4 py-3 w-[110px]">Fecha</th>
                <th className="text-right px-4 py-3 w-[120px]">Importe</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={7} className="text-center py-10"><Loader2 className="animate-spin mx-auto text-[#FF6600]" size={24} /></td></tr>
              ) : rows.length === 0 ? (
                <tr><td colSpan={7} className="text-center py-10 text-sm text-[#6B7280]">Sin albaranes</td></tr>
              ) : rows.map((row) => {
                const raw = row._raw as Row
                const id = raw.id as string
                const source = row._source as string
                const isSelectable = source === 'tt_documents'
                const isSelected = selectedIds.has(id)
                const statusText = (row.estado as string) || '-'
                const isFacturado = statusText.toLowerCase() === 'facturado' || statusText.toLowerCase() === 'invoiced'
                const statusColors: Record<string, { bg: string; text: string }> = {
                  pendiente: { bg: 'rgba(245,158,11,0.15)', text: '#F59E0B' }, entregado: { bg: 'rgba(16,185,129,0.15)', text: '#10B981' },
                  entregada: { bg: 'rgba(16,185,129,0.15)', text: '#10B981' }, facturado: { bg: 'rgba(99,102,241,0.15)', text: '#6366F1' },
                  cerrado: { bg: 'rgba(107,114,128,0.15)', text: '#6B7280' },
                }
                const sc = statusColors[statusText.toLowerCase()] || { bg: 'rgba(107,114,128,0.15)', text: '#6B7280' }
                return (
                  <tr key={id} className={`border-b border-[#1E2330] transition-colors cursor-pointer ${isSelected ? 'bg-[#FF6600]/5' : 'hover:bg-[#1C2230]/50'}`} onClick={() => openDetail(row)}>
                    <td className="px-2 py-3 text-center" onClick={(e) => { e.stopPropagation() }}>
                      {isSelectable && !isFacturado ? (
                        <button onClick={() => toggleSelection(id)} className="hover:text-[#FF6600] transition-colors">
                          {isSelected ? <CheckSquare size={16} className="text-[#FF6600]" /> : <Square size={16} className="text-[#4B5563]" />}
                        </button>
                      ) : <span className="text-[#2A3040]"><Square size={16} /></span>}
                    </td>
                    <td className="px-4 py-3"><span className="text-sm font-mono text-[#FF6600]">{(row.referencia as string) || '-'}</span></td>
                    <td className="px-4 py-3"><span className="text-sm text-[#F0F2F5]">{(row.cliente as string) || '-'}</span></td>
                    <td className="px-4 py-3"><span className="text-sm text-[#9CA3AF]">{(row.titulo as string) || '-'}</span></td>
                    <td className="px-4 py-3"><span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-bold" style={{ background: sc.bg, color: sc.text }}>{statusText}</span></td>
                    <td className="px-4 py-3"><span className="text-sm text-[#9CA3AF]">{(row.fecha as string) || '-'}</span></td>
                    <td className="px-4 py-3 text-right"><span className="text-sm font-semibold text-[#F0F2F5]">{typeof row.importe === 'number' ? formatCurrency(row.importe as number) : (row.importe as string) || '-'}</span></td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Floating action bar when 2+ items are selected */}
      {selectedIds.size >= 2 && (
        <div className="sticky bottom-4 z-40 mt-4">
          <div className="mx-auto max-w-xl bg-[#1C2230] border border-[#FF6600]/40 rounded-2xl shadow-2xl px-5 py-3 flex items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-full bg-[#FF6600]/15 flex items-center justify-center"><GitMerge size={18} className="text-[#FF6600]" /></div>
              <div>
                <p className="text-sm font-bold text-[#F0F2F5]">{selectedIds.size} albaranes seleccionados</p>
                <p className="text-[10px] text-[#6B7280]">Consolida en una sola factura</p>
              </div>
            </div>
            <Button variant="primary" size="sm" onClick={prepareConsolidate}><FileCheck size={14} /> Facturar juntos</Button>
          </div>
        </div>
      )}

      {/* Consolidation confirmation modal */}
      <Modal isOpen={showConsolidateModal} onClose={() => { setShowConsolidateModal(false); setConsolidatePreview(null) }} title="Consolidar albaranes en una factura" size="xl">
        {consolidatePreview && (
          <div className="space-y-5">
            <div className="flex items-center gap-3 p-4 rounded-lg bg-[#0F1218] border border-[#1E2330]">
              <FileText size={20} className="text-[#3B82F6]" />
              <div>
                <p className="text-sm font-bold text-[#F0F2F5]">{consolidatePreview.clientName}</p>
                <p className="text-xs text-[#6B7280]">{consolidatePreview.deliveryNotes.length} albaranes a consolidar</p>
              </div>
            </div>
            <div>
              <h4 className="text-xs font-bold text-[#6B7280] uppercase tracking-wider mb-2">Albaranes incluidos</h4>
              <div className="space-y-1">
                {consolidatePreview.deliveryNotes.map(dn => (
                  <div key={dn.id} className="flex items-center justify-between px-3 py-2 rounded-lg bg-[#0F1218] border border-[#1E2330]">
                    <div className="flex items-center gap-2">
                      <Truck size={14} className="text-[#FF6600]" />
                      <span className="text-sm font-mono text-[#FF6600]">{dn.ref}</span>
                      <span className="text-xs text-[#6B7280]">{dn.date}</span>
                    </div>
                    <span className="text-sm font-semibold text-[#F0F2F5]">{formatCurrency(dn.total, consolidatePreview.currency as 'EUR' | 'USD' | 'ARS')}</span>
                  </div>
                ))}
              </div>
            </div>
            <div>
              <h4 className="text-xs font-bold text-[#6B7280] uppercase tracking-wider mb-2">Items combinados ({consolidatePreview.items.length})</h4>
              <div className="max-h-[250px] overflow-y-auto rounded-lg border border-[#1E2330]">
                <table className="w-full text-sm">
                  <thead className="sticky top-0 bg-[#141820]">
                    <tr className="border-b border-[#2A3040] text-[#6B7280] text-xs uppercase tracking-wider">
                      <th className="text-left px-3 py-2">SKU</th>
                      <th className="text-left px-3 py-2">Descripcion</th>
                      <th className="text-right px-3 py-2">Uds</th>
                      <th className="text-right px-3 py-2">Precio</th>
                      <th className="text-right px-3 py-2">Subtotal</th>
                      <th className="text-left px-3 py-2">Origen</th>
                    </tr>
                  </thead>
                  <tbody>
                    {consolidatePreview.items.map((item, idx) => (
                      <tr key={idx} className="border-b border-[#1E2330] hover:bg-[#1C2230]/50">
                        <td className="px-3 py-2 text-xs font-mono text-[#9CA3AF]">{item.sku || '-'}</td>
                        <td className="px-3 py-2 text-xs text-[#F0F2F5] max-w-[200px] truncate">{item.description}</td>
                        <td className="px-3 py-2 text-right text-xs text-[#F0F2F5]">{item.quantity}</td>
                        <td className="px-3 py-2 text-right text-xs text-[#F0F2F5]">{formatCurrency(item.unit_price, consolidatePreview.currency as 'EUR' | 'USD' | 'ARS')}</td>
                        <td className="px-3 py-2 text-right text-xs font-semibold text-[#F0F2F5]">{formatCurrency(item.subtotal, consolidatePreview.currency as 'EUR' | 'USD' | 'ARS')}</td>
                        <td className="px-3 py-2 text-[10px] font-mono text-[#6B7280]">{item.source_dn_ref}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
            <div className="flex items-center justify-between p-4 rounded-lg bg-[#FF6600]/5 border border-[#FF6600]/20">
              <span className="text-sm font-bold text-[#FF6600]">Total factura (base imponible)</span>
              <span className="text-xl font-bold text-[#FF6600] font-mono">{formatCurrency(consolidatePreview.totalAmount, consolidatePreview.currency as 'EUR' | 'USD' | 'ARS')}</span>
            </div>
            <div className="flex items-start gap-2 p-3 rounded-lg bg-[#F59E0B]/5 border border-[#F59E0B]/20">
              <AlertTriangle size={16} className="text-[#F59E0B] shrink-0 mt-0.5" />
              <p className="text-xs text-[#F59E0B]">Se creara una factura nueva combinando todos los items. Los albaranes seleccionados pasaran a estado &ldquo;Facturado&rdquo;. Esta accion no se puede deshacer facilmente.</p>
            </div>
            <div className="flex justify-end gap-3 pt-2 border-t border-[#2A3040]">
              <Button variant="secondary" onClick={() => { setShowConsolidateModal(false); setConsolidatePreview(null) }}>Cancelar</Button>
              <Button variant="primary" onClick={executeConsolidate} loading={consolidating}><FileCheck size={14} /> Crear factura consolidada</Button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  )
}

// ===============================================================
// FACTURAS TAB
// ===============================================================
function FacturasTab() {
  const { filterByCompany, companyKey } = useCompanyFilter()
  const supabase = createClient()
  const [rows, setRows] = useState<Record<string, unknown>[]>([])
  const [loading, setLoading] = useState(true)
  const [selectedDoc, setSelectedDoc] = useState<{ id: string; source: 'local' | 'tt_documents' } | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    const sb = createClient()
    let q = sb.from('tt_documents').select('*, client:tt_clients(id, name, legal_name, tax_id)').in('doc_type', ['factura', 'factura_abono'])
    q = filterByCompany(q)
    const [{ data: docData }, { data: localData }] = await Promise.all([
      q.order('created_at', { ascending: false }).range(0, 499),
      sb.from('tt_invoices').select('*, tt_clients(name)').eq('type', 'sale').order('created_at', { ascending: false }),
    ])
    const localRows = (localData || []).map(localInvoiceToRow)
    const docRows = (docData || []).map(documentToTableRow)
    setRows([...localRows, ...docRows])
    setLoading(false)
  }, [companyKey])

  useEffect(() => { load() }, [load])

  const openDetail = (row: Record<string, unknown>) => {
    const doc = row._raw as Row
    const src = row._source as string
    setSelectedDoc({ id: doc.id as string, source: src === 'local' ? 'local' : 'tt_documents' })
  }

  if (selectedDoc) {
    const allIds = rows.map(r => (r._raw as Row).id as string)
    return (
      <DocumentForm
        documentId={selectedDoc.id}
        documentType="factura"
        source={selectedDoc.source}
        onBack={() => { setSelectedDoc(null); load() }}
        onUpdate={load}
        siblingIds={allIds}
      />
    )
  }

  return (
    <DataTable
      data={rows}
      columns={FACTURA_COLS}
      loading={loading}
      totalLabel="facturas"
      showTotals
      onRowClick={openDetail}
      exportFilename="facturas_venta_torquetools"
      pageSize={25}
    />
  )
}

// ===============================================================
// COBROS TAB
// ===============================================================
function CobrosTab() {
  const { filterByCompany, companyKey, defaultCompanyId } = useCompanyFilter()
  const supabase = createClient()
  const { addToast } = useToast()
  const [rows, setRows] = useState<Record<string, unknown>[]>([])
  const [invoicesWithStatus, setInvoicesWithStatus] = useState<Array<{
    id: string; doc_number: string; client_name?: string; total: number;
    paid: number; outstanding: number; due_date: string | null;
    payment_status: 'pendiente' | 'parcial' | 'pagada' | 'vencida'; currency: string
  }>>([])
  const [bankAccounts, setBankAccounts] = useState<Array<{ id: string; bank_name: string | null; iban_or_cbu: string | null; currency: string }>>([])
  const [loading, setLoading] = useState(true)
  const [showRegister, setShowRegister] = useState(false)
  const [invoices, setInvoices] = useState<Record<string, unknown>[]>([])
  const [newPayment, setNewPayment] = useState({
    invoice_id: '', amount: 0, method: 'transferencia' as 'transferencia' | 'efectivo' | 'tarjeta' | 'cheque' | 'pagare' | 'compensacion' | 'otro',
    reference: '', bank_account_id: '', payment_date: new Date().toISOString().split('T')[0],
  })
  const [saving, setSaving] = useState(false)
  const [filterStatus, setFilterStatus] = useState<'all' | 'pendiente' | 'parcial' | 'pagada' | 'vencida'>('all')

  const load = useCallback(async () => {
    setLoading(true)
    const sb = createClient()
    // Listar pagos (via VIEW tt_payments, alias method/reference)
    const { data: pData } = await sb
      .from('tt_payments')
      .select('id, invoice_id, amount, currency, payment_date, method, reference, created_at')
      .order('payment_date', { ascending: false })
      .limit(500)
    setRows((pData || []).map((p) => ({
      id: p.id,
      invoice_id: p.invoice_id,
      importe: (p.amount as number) || 0,
      metodo: p.method,
      referencia: p.reference || '-',
      fecha: p.payment_date,
      created_at: p.created_at,
    })))

    // Listar facturas con estado para la vista de "facturas pendientes/vencidas"
    const { listInvoicesWithPaymentStatus } = await import('@/lib/payments')
    const list = await listInvoicesWithPaymentStatus({
      companyId: defaultCompanyId ?? null,
      limit: 300,
    })
    setInvoicesWithStatus(list)
    setLoading(false)
  }, [defaultCompanyId])

  useEffect(() => { load() }, [load])

  const loadInvoices = async () => {
    let q = supabase.from('tt_documents')
      .select('id, display_ref, system_code, total, status, client:tt_clients(name, legal_name)')
      .in('doc_type', ['factura', 'factura_abono'])
      .in('status', ['pending', 'partial', 'open', 'sent', 'draft'])
    q = filterByCompany(q)
    const { data } = await q
      .order('created_at', { ascending: false })
      .limit(50)
    setInvoices(data || [])

    // Cargar cuentas bancarias activas de la company
    if (defaultCompanyId) {
      const { listActiveBankAccounts } = await import('@/lib/payments')
      const accounts = await listActiveBankAccounts(defaultCompanyId)
      setBankAccounts(accounts)
    }
  }

  const handleRegisterPayment = async () => {
    if (!newPayment.amount || newPayment.amount <= 0) { addToast({ type: 'warning', title: 'El importe debe ser mayor a 0' }); return }
    if (!newPayment.invoice_id) { addToast({ type: 'warning', title: 'Seleccioná la factura' }); return }
    setSaving(true)
    const { registerInvoicePayment } = await import('@/lib/payments')
    const { data: authUser } = await supabase.auth.getUser()
    const result = await registerInvoicePayment({
      invoiceId: newPayment.invoice_id,
      amount: newPayment.amount,
      method: newPayment.method,
      reference: newPayment.reference || null,
      bankAccountId: newPayment.bank_account_id || null,
      paymentDate: newPayment.payment_date,
      actorUserId: authUser?.user?.id ?? null,
    })
    if (result.ok) {
      addToast({
        type: 'success',
        title: 'Cobro registrado',
        message: `Factura ahora: ${result.newStatus}`,
      })
      setShowRegister(false)
      setNewPayment({ invoice_id: '', amount: 0, method: 'transferencia', reference: '', bank_account_id: '', payment_date: new Date().toISOString().split('T')[0] })
      load()
    } else {
      addToast({ type: 'error', title: 'Error', message: result.error })
    }
    setSaving(false)
  }

  const totalCobrado = rows.reduce((s, r) => s + ((r.importe as number) || 0), 0)
  const outstandingTotal = invoicesWithStatus.reduce((s, r) => s + r.outstanding, 0)
  const overdueCount = invoicesWithStatus.filter((r) => r.payment_status === 'vencida').length

  const filteredInvoices = filterStatus === 'all'
    ? invoicesWithStatus
    : invoicesWithStatus.filter((r) => r.payment_status === filterStatus)

  const STATUS_COLORS: Record<typeof filterStatus, string> = {
    all: '#9CA3AF',
    pendiente: '#F59E0B',
    parcial: '#3B82F6',
    pagada: '#10B981',
    vencida: '#EF4444',
  }

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <KPICard label="Total cobrado" value={formatCurrency(totalCobrado)} icon={<CreditCard size={22} />} color="#10B981" />
        <KPICard label="Por cobrar" value={formatCurrency(outstandingTotal)} icon={<Receipt size={22} />} color="#F59E0B" />
        <KPICard label="Vencidas" value={overdueCount} icon={<AlertTriangle size={22} />} color="#EF4444" />
        <div className="flex items-end justify-end">
          <Button variant="primary" onClick={() => { setShowRegister(true); loadInvoices() }}>
            <Plus size={16} /> Registrar Cobro
          </Button>
        </div>
      </div>

      {/* Filtros de estado */}
      <div className="flex gap-2 flex-wrap">
        {(['all', 'pendiente', 'parcial', 'vencida', 'pagada'] as const).map((s) => (
          <button
            key={s}
            onClick={() => setFilterStatus(s)}
            className={`px-3 py-1.5 text-xs font-medium rounded-lg transition-all ${
              filterStatus === s
                ? 'bg-[#1E2330] text-[#F0F2F5] border border-[#3A4050]'
                : 'bg-[#0B0E13] text-[#9CA3AF] hover:text-[#F0F2F5]'
            }`}
            style={filterStatus === s ? { borderLeft: `3px solid ${STATUS_COLORS[s]}` } : undefined}
          >
            {s === 'all' ? 'Todas' : s.charAt(0).toUpperCase() + s.slice(1)}
            <span className="ml-1.5 text-[10px] text-[#6B7280]">
              ({s === 'all' ? invoicesWithStatus.length : invoicesWithStatus.filter((r) => r.payment_status === s).length})
            </span>
          </button>
        ))}
      </div>

      {/* Tabla facturas con estado */}
      <div className="border border-[#1E2330] rounded-lg overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-[#0F1218] text-[#9CA3AF]">
            <tr>
              <th className="px-3 py-2 text-left text-xs font-medium">Factura</th>
              <th className="px-3 py-2 text-left text-xs font-medium">Cliente</th>
              <th className="px-3 py-2 text-right text-xs font-medium">Total</th>
              <th className="px-3 py-2 text-right text-xs font-medium">Cobrado</th>
              <th className="px-3 py-2 text-right text-xs font-medium">Pendiente</th>
              <th className="px-3 py-2 text-left text-xs font-medium">Vencimiento</th>
              <th className="px-3 py-2 text-left text-xs font-medium">Estado</th>
            </tr>
          </thead>
          <tbody className="text-[#F0F2F5]">
            {loading && (
              <tr><td colSpan={7} className="px-3 py-6 text-center text-[#6B7280]"><Loader2 className="animate-spin inline mr-2" size={14} /> Cargando…</td></tr>
            )}
            {!loading && filteredInvoices.length === 0 && (
              <tr><td colSpan={7} className="px-3 py-6 text-center text-[#6B7280]">Sin facturas</td></tr>
            )}
            {!loading && filteredInvoices.map((r) => (
              <tr key={r.id} className="border-t border-[#1E2330] hover:bg-[#0F1218]">
                <td className="px-3 py-2 font-mono text-xs">{r.doc_number}</td>
                <td className="px-3 py-2 text-xs">{r.client_name || '-'}</td>
                <td className="px-3 py-2 text-right">{formatCurrency(r.total, r.currency as 'EUR' | 'ARS' | 'USD')}</td>
                <td className="px-3 py-2 text-right text-[#10B981]">{formatCurrency(r.paid, r.currency as 'EUR' | 'ARS' | 'USD')}</td>
                <td className="px-3 py-2 text-right text-[#F59E0B] font-semibold">{formatCurrency(r.outstanding, r.currency as 'EUR' | 'ARS' | 'USD')}</td>
                <td className="px-3 py-2 text-xs text-[#9CA3AF]">{r.due_date ? formatDate(r.due_date) : '-'}</td>
                <td className="px-3 py-2">
                  <span
                    className="text-[10px] font-semibold px-2 py-0.5 rounded-full"
                    style={{ color: STATUS_COLORS[r.payment_status], backgroundColor: `${STATUS_COLORS[r.payment_status]}20` }}
                  >
                    {r.payment_status}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Tabla de cobros registrados */}
      <details className="border border-[#1E2330] rounded-lg p-2">
        <summary className="cursor-pointer text-xs text-[#9CA3AF] hover:text-[#F0F2F5] px-2 py-1">
          Historial de cobros ({rows.length})
        </summary>
        <div className="mt-2">
          <DataTable
            data={rows}
            columns={COBRO_COLS}
            loading={loading}
            totalLabel="cobros"
            showTotals
            exportFilename="cobros_torquetools"
            pageSize={25}
          />
        </div>
      </details>

      <Modal isOpen={showRegister} onClose={() => setShowRegister(false)} title="Registrar Cobro" size="md">
        <div className="space-y-4">
          <Select label="Factura *" value={newPayment.invoice_id} onChange={e => setNewPayment({ ...newPayment, invoice_id: e.target.value })}
            options={invoices.map(inv => ({ value: inv.id as string, label: `${(inv.display_ref as string) || (inv.system_code as string) || 'S/N'} — ${formatCurrency((inv.total as number) || 0)} — ${((inv.client as Record<string, unknown>)?.legal_name as string) || 'Sin cliente'}` }))}
            placeholder="Seleccionar factura" />
          <div className="grid grid-cols-2 gap-4">
            <Input label="Importe *" type="number" min={0} step={0.01} value={newPayment.amount || ''} onChange={e => setNewPayment({ ...newPayment, amount: Number(e.target.value) })} />
            <Input label="Fecha" type="date" value={newPayment.payment_date} onChange={e => setNewPayment({ ...newPayment, payment_date: e.target.value })} />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <Select label="Método" value={newPayment.method} onChange={e => setNewPayment({ ...newPayment, method: e.target.value as typeof newPayment.method })}
              options={[
                { value: 'transferencia', label: 'Transferencia bancaria' },
                { value: 'cheque', label: 'Cheque' },
                { value: 'efectivo', label: 'Efectivo' },
                { value: 'tarjeta', label: 'Tarjeta' },
                { value: 'pagare', label: 'Pagaré' },
                { value: 'compensacion', label: 'Compensación' },
                { value: 'otro', label: 'Otro' },
              ]} />
            <Input label="Referencia" value={newPayment.reference} onChange={e => setNewPayment({ ...newPayment, reference: e.target.value })} placeholder="Nro transferencia, cheque..." />
          </div>
          {bankAccounts.length > 0 && (newPayment.method === 'transferencia' || newPayment.method === 'cheque') && (
            <Select
              label="Cuenta bancaria de destino"
              value={newPayment.bank_account_id}
              onChange={(e) => setNewPayment({ ...newPayment, bank_account_id: e.target.value })}
              options={bankAccounts.map((b) => ({
                value: b.id,
                label: `${b.bank_name || 'Sin nombre'}${b.iban_or_cbu ? ` — ${b.iban_or_cbu}` : ''}${b.currency ? ` (${b.currency})` : ''}`,
              }))}
              placeholder="Sin cuenta específica"
            />
          )}
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="secondary" onClick={() => setShowRegister(false)}>Cancelar</Button>
            <Button variant="primary" onClick={handleRegisterPayment} loading={saving}><Save size={14} /> Registrar</Button>
          </div>
        </div>
      </Modal>
    </div>
  )
}

// ===============================================================
// NOTAS DE CREDITO TAB
// ===============================================================
function NotasCreditoTab() {
  const { filterByCompany, companyKey, defaultCompanyId } = useCompanyFilter()
  const { addToast } = useToast()

  const [rows, setRows] = useState<Record<string, unknown>[]>([])
  const [loading, setLoading] = useState(true)
  const [showCreate, setShowCreate] = useState(false)
  const [saving, setSaving] = useState(false)

  // Create form state
  const [invoiceSearch, setInvoiceSearch] = useState('')
  const [invoiceResults, setInvoiceResults] = useState<Row[]>([])
  const [invoicesLoading, setInvoicesLoading] = useState(false)
  const [selectedInvoice, setSelectedInvoice] = useState<Row | null>(null)
  const [selectedInvoiceItems, setSelectedInvoiceItems] = useState<Array<{
    id: string; description: string; quantity: number; unit_price: number;
    discount_pct: number; max_qty: number; include: boolean
  }>>([])
  const [creditReason, setCreditReason] = useState('')
  const [creditReasonCustom, setCreditReasonCustom] = useState('')

  // Detail navigation
  const [selectedDoc, setSelectedDoc] = useState<{ id: string; source: 'local' | 'tt_documents' } | null>(null)

  // Load credit notes
  const load = useCallback(async () => {
    setLoading(true)
    const sb = createClient()
    let q = sb
      .from('tt_documents')
      .select('*, client:tt_clients(id, name, legal_name, tax_id)')
      .eq('is_credit_note', true)
    q = filterByCompany(q)
    const { data, error } = await q.order('created_at', { ascending: false }).range(0, 499)

    if (error) {
      addToast({ type: 'error', title: 'Error al cargar notas de credito', message: error.message })
    }

    const mapped = (data || []).map((doc: Row) => {
      const client = doc.client as Record<string, unknown> | undefined
      const clientName = (client?.legal_name as string) || (client?.name as string) || 'Sin cliente'
      const ref = (doc.display_ref as string) || (doc.system_code as string) || 'S/N'
      const reason = (doc.credit_note_reason as string) || ''
      return {
        id: doc.id,
        referencia: ref,
        cliente: clientName,
        factura_original: (doc.original_invoice_ref as string) || '-',
        motivo: CREDIT_NOTE_REASON_LABELS[reason] || reason || '-',
        estado: mapStatus(doc.status as string),
        fecha: doc.created_at ? formatDate(doc.created_at as string) : '',
        importe: -Math.abs((doc.total as number) || 0),
        _raw: doc,
        _source: 'tt_documents',
      }
    })
    setRows(mapped)
    setLoading(false)
  }, [companyKey])

  useEffect(() => { load() }, [load])

  // Search invoices for credit note creation
  const searchInvoices = useCallback(async (term: string) => {
    setInvoiceSearch(term)
    if (term.length < 2) { setInvoiceResults([]); return }
    setInvoicesLoading(true)
    const sb = createClient()
    let q = sb
      .from('tt_documents')
      .select('*, client:tt_clients(id, name, legal_name, tax_id)')
      .in('doc_type', ['factura', 'factura_abono'])
      .or(`display_ref.ilike.%${term}%,system_code.ilike.%${term}%`)
      .eq('is_credit_note', false)
    q = filterByCompany(q)
    const { data } = await q.order('created_at', { ascending: false }).limit(20)
    setInvoiceResults(data || [])
    setInvoicesLoading(false)
  }, [companyKey])

  // Select an invoice and load its items
  const selectOriginalInvoice = useCallback(async (invoice: Row) => {
    setSelectedInvoice(invoice)
    const ref = (invoice.display_ref as string) || (invoice.system_code as string) || ''
    setInvoiceSearch(ref)
    setInvoiceResults([])

    // Load invoice items
    const sb = createClient()
    const { data: items } = await sb
      .from('tt_document_lines')
      .select('*')
      .eq('document_id', invoice.id)
      .order('sort_order')

    setSelectedInvoiceItems((items || []).map((item: Row) => ({
      id: item.id as string,
      description: (item.description as string) || '',
      quantity: (item.quantity as number) || 0,
      unit_price: (item.unit_price as number) || 0,
      discount_pct: (item.discount_pct as number) || 0,
      max_qty: (item.quantity as number) || 0,
      include: true,
    })))
  }, [])

  const resetCreateForm = () => {
    setSelectedInvoice(null)
    setSelectedInvoiceItems([])
    setInvoiceSearch('')
    setInvoiceResults([])
    setCreditReason('')
    setCreditReasonCustom('')
  }

  // Create credit note
  const handleCreateCreditNote = useCallback(async () => {
    if (!selectedInvoice) {
      addToast({ type: 'warning', title: 'Selecciona una factura original' })
      return
    }
    if (!creditReason) {
      addToast({ type: 'warning', title: 'Selecciona un motivo' })
      return
    }
    const includedItems = selectedInvoiceItems.filter(it => it.include && it.quantity > 0)
    if (includedItems.length === 0) {
      addToast({ type: 'warning', title: 'Incluye al menos un item' })
      return
    }

    setSaving(true)
    const sb = createClient()

    // Calculate totals (negative)
    const subtotal = includedItems.reduce((s, it) => {
      return s + (it.quantity * it.unit_price * (1 - (it.discount_pct || 0) / 100))
    }, 0)
    const taxPct = (selectedInvoice.tax_pct as number) || 21
    const taxAmount = subtotal * (taxPct / 100)
    const total = subtotal + taxAmount

    // Generate doc number
    const yr = new Date().getFullYear().toString().slice(-2)
    const mo = (new Date().getMonth() + 1).toString().padStart(2, '0')
    const seq = Math.floor(Math.random() * 9999).toString().padStart(4, '0')
    const docNum = `NC-${yr}${mo}-${seq}`
    const originalRef = (selectedInvoice.display_ref as string) || (selectedInvoice.system_code as string) || ''

    // Create the credit note document
    const { data: doc, error } = await sb
      .from('tt_documents')
      .insert({
        company_id: (selectedInvoice.company_id as string) || defaultCompanyId,
        client_id: (selectedInvoice.client_id as string) || null,
        doc_type: 'factura',
        display_ref: docNum,
        system_code: docNum,
        status: 'draft',
        currency: (selectedInvoice.currency as string) || 'EUR',
        subtotal: -Math.abs(subtotal),
        tax_pct: taxPct,
        tax_amount: -Math.abs(taxAmount),
        total: -Math.abs(total),
        is_credit_note: true,
        credit_note_reason: creditReason === 'otro' ? creditReasonCustom || 'otro' : creditReason,
        original_invoice_id: selectedInvoice.id as string,
        original_invoice_ref: originalRef,
        notes: `Nota de credito sobre factura ${originalRef}`,
        internal_notes: creditReason === 'otro' ? creditReasonCustom : CREDIT_NOTE_REASON_LABELS[creditReason] || creditReason,
        payment_terms: (selectedInvoice.payment_terms as string) || null,
        incoterm: (selectedInvoice.incoterm as string) || null,
      })
      .select()
      .single()

    if (error || !doc) {
      addToast({ type: 'error', title: 'Error al crear nota de credito', message: error?.message })
      setSaving(false)
      return
    }

    // Insert items (negative quantities)
    const itemPayloads = includedItems.map((item, i) => ({
      document_id: doc.id,
      description: item.description,
      quantity: -Math.abs(item.quantity),
      unit_price: item.unit_price,
      discount_pct: item.discount_pct || 0,
      line_total: -(item.quantity * item.unit_price * (1 - (item.discount_pct || 0) / 100)),
      sort_order: i,
    }))
    const { error: itemsError } = await sb.from('tt_document_lines').insert(itemPayloads)
    if (itemsError) {
      addToast({ type: 'error', title: 'Error al crear items', message: itemsError.message })
    }

    addToast({ type: 'success', title: 'Nota de credito creada', message: docNum })
    setSaving(false)
    setShowCreate(false)
    resetCreateForm()
    load()
  }, [selectedInvoice, creditReason, creditReasonCustom, selectedInvoiceItems, defaultCompanyId])

  // Navigate to original invoice
  const openOriginalInvoice = (row: Record<string, unknown>) => {
    const raw = row._raw as Row
    if (raw.original_invoice_id) {
      setSelectedDoc({ id: raw.original_invoice_id as string, source: 'tt_documents' })
    }
  }

  // Detail view
  if (selectedDoc) {
    return (
      <DocumentForm
        documentId={selectedDoc.id}
        documentType="factura"
        source={selectedDoc.source}
        onBack={() => { setSelectedDoc(null); load() }}
        onUpdate={load}
        siblingIds={[]}
      />
    )
  }

  // KPIs
  const totalNCs = rows.length
  const totalAmount = rows.reduce((s, r) => s + Math.abs((r.importe as number) || 0), 0)

  return (
    <div className="space-y-4">
      {/* KPIs */}
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
        <KPICard
          label="Notas de credito"
          value={totalNCs}
          icon={<RotateCcw size={22} />}
          color="#EF4444"
        />
        <KPICard
          label="Total acreditado"
          value={formatCurrency(totalAmount)}
          icon={<DollarSign size={22} />}
          color="#F59E0B"
        />
        <div className="flex items-end justify-end">
          <Button variant="primary" onClick={() => { setShowCreate(true); resetCreateForm() }}>
            <Plus size={16} /> Nueva nota de credito
          </Button>
        </div>
      </div>

      {/* Table with custom render for negative amounts and factura original link */}
      <DataTable
        data={rows}
        columns={NOTA_CREDITO_COLS.map(col => {
          if (col.key === 'importe') {
            return {
              ...col,
              render: (value: unknown) => (
                <span className="text-red-400 font-medium">
                  {formatCurrency(Math.abs(value as number))}
                </span>
              ),
            }
          }
          if (col.key === 'factura_original') {
            return {
              ...col,
              render: (value: unknown, row: Record<string, unknown>) => {
                const raw = row._raw as Row
                if (!raw.original_invoice_id) return <span className="text-[#4B5563]">-</span>
                return (
                  <button
                    onClick={(e) => { e.stopPropagation(); openOriginalInvoice(row) }}
                    className="text-[#FF6600] hover:underline text-sm"
                  >
                    {value as string}
                  </button>
                )
              },
            }
          }
          return col
        })}
        loading={loading}
        totalLabel="notas de credito"
        showTotals
        exportFilename="notas_credito_torquetools"
        pageSize={25}
      />

      {/* CREATE CREDIT NOTE MODAL */}
      <Modal
        isOpen={showCreate}
        onClose={() => { setShowCreate(false); resetCreateForm() }}
        title="Nueva nota de credito"
        size="xl"
      >
        <div className="space-y-6">
          {/* Step 1: Select original invoice */}
          <div>
            <label className="block text-sm font-semibold text-[#F0F2F5] mb-2">
              1. Selecciona la factura original
            </label>
            <div className="relative">
              <SearchBar
                placeholder="Buscar factura por numero..."
                value={invoiceSearch}
                onChange={(v) => {
                  searchInvoices(v)
                  if (!v) setSelectedInvoice(null)
                }}
              />
              {invoicesLoading && (
                <Loader2 size={14} className="animate-spin absolute right-3 top-3 text-[#6B7280]" />
              )}
              {invoiceResults.length > 0 && invoiceSearch.length >= 2 && !selectedInvoice && (
                <div className="absolute z-20 w-full mt-1 bg-[#141820] border border-[#1E2330] rounded-lg shadow-xl max-h-60 overflow-y-auto">
                  {invoiceResults.map(inv => {
                    const client = inv.client as Record<string, unknown> | undefined
                    const clientName = (client?.legal_name as string) || (client?.name as string) || 'Sin cliente'
                    return (
                      <button
                        key={inv.id as string}
                        onClick={() => selectOriginalInvoice(inv)}
                        className="w-full text-left px-4 py-3 hover:bg-[#1E2330] transition-colors border-b border-[#1E2330]/30 last:border-0"
                      >
                        <div className="flex items-center justify-between">
                          <div>
                            <p className="text-sm font-medium text-[#F0F2F5]">
                              {(inv.display_ref as string) || (inv.system_code as string) || 'S/N'}
                            </p>
                            <p className="text-xs text-[#6B7280]">{clientName}</p>
                          </div>
                          <div className="text-right">
                            <p className="text-sm font-medium text-[#F0F2F5]">
                              {formatCurrency((inv.total as number) || 0)}
                            </p>
                            <p className="text-xs text-[#6B7280]">
                              {inv.created_at ? formatDate(inv.created_at as string) : ''}
                            </p>
                          </div>
                        </div>
                      </button>
                    )
                  })}
                </div>
              )}
            </div>
            {selectedInvoice && (
              <div className="mt-3 p-3 rounded-lg bg-[#0F1218] border border-[#1E2330] flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-[#F0F2F5]">
                    Factura: {(selectedInvoice.display_ref as string) || (selectedInvoice.system_code as string)}
                  </p>
                  <p className="text-xs text-[#6B7280]">
                    {((selectedInvoice.client as Record<string, unknown>)?.legal_name as string) ||
                     ((selectedInvoice.client as Record<string, unknown>)?.name as string) || 'Sin cliente'}
                    {' - '}Total: {formatCurrency((selectedInvoice.total as number) || 0)}
                  </p>
                </div>
                <button
                  onClick={() => { setSelectedInvoice(null); setSelectedInvoiceItems([]); setInvoiceSearch('') }}
                  className="p-1 text-[#6B7280] hover:text-red-400"
                >
                  <X size={16} />
                </button>
              </div>
            )}
          </div>

          {/* Step 2: Reason */}
          <div>
            <label className="block text-sm font-semibold text-[#F0F2F5] mb-2">
              2. Motivo de la nota de credito *
            </label>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
              {[
                { value: 'devolucion', label: 'Devolucion' },
                { value: 'error_facturacion', label: 'Error de facturacion' },
                { value: 'descuento_posterior', label: 'Descuento posterior' },
                { value: 'anulacion', label: 'Anulacion total' },
                { value: 'otro', label: 'Otro' },
              ].map(opt => (
                <button
                  key={opt.value}
                  onClick={() => setCreditReason(opt.value)}
                  className={`px-3 py-2.5 rounded-lg border text-sm text-left transition-all ${
                    creditReason === opt.value
                      ? 'border-[#FF6600] bg-[#FF6600]/10 text-[#FF6600]'
                      : 'border-[#1E2330] bg-[#0F1218] text-[#9CA3AF] hover:border-[#2A3040]'
                  }`}
                >
                  {opt.label}
                </button>
              ))}
            </div>
            {creditReason === 'otro' && (
              <Input
                label="Especifica el motivo"
                value={creditReasonCustom}
                onChange={e => setCreditReasonCustom(e.target.value)}
                placeholder="Describe el motivo..."
                className="mt-3"
              />
            )}
          </div>

          {/* Step 3: Items (editable quantities for partial credit) */}
          {selectedInvoice && selectedInvoiceItems.length > 0 && (
            <div>
              <label className="block text-sm font-semibold text-[#F0F2F5] mb-2">
                3. Items a acreditar (ajusta cantidades para credito parcial)
              </label>
              <div className="rounded-lg border border-[#1E2330] overflow-hidden">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-[#0F1218] text-[#6B7280] text-xs">
                      <th className="text-center px-3 py-2 font-medium w-[50px]">Incluir</th>
                      <th className="text-left px-3 py-2 font-medium">Descripcion</th>
                      <th className="text-right px-3 py-2 font-medium w-[80px]">Cant. orig.</th>
                      <th className="text-right px-3 py-2 font-medium w-[90px]">Cant. NC</th>
                      <th className="text-right px-3 py-2 font-medium w-[100px]">Precio</th>
                      <th className="text-right px-3 py-2 font-medium w-[60px]">Dto%</th>
                      <th className="text-right px-3 py-2 font-medium w-[110px]">Subtotal NC</th>
                    </tr>
                  </thead>
                  <tbody>
                    {selectedInvoiceItems.map((item, i) => (
                      <tr key={item.id} className="border-t border-[#1E2330]/50">
                        <td className="px-3 py-2 text-center">
                          <button
                            onClick={() => {
                              const updated = [...selectedInvoiceItems]
                              updated[i] = { ...updated[i], include: !updated[i].include }
                              setSelectedInvoiceItems(updated)
                            }}
                            className="text-[#6B7280] hover:text-[#FF6600] transition-colors"
                          >
                            {item.include ? <CheckSquare size={18} className="text-[#FF6600]" /> : <Square size={18} />}
                          </button>
                        </td>
                        <td className="px-3 py-2 text-[#F0F2F5] text-xs">{item.description}</td>
                        <td className="px-3 py-2 text-right text-[#6B7280] text-xs">{item.max_qty}</td>
                        <td className="px-2 py-1.5">
                          <input
                            type="number"
                            min={0}
                            max={item.max_qty}
                            className="w-full h-7 rounded bg-[#1E2330] border border-[#2A3040] px-2 text-xs text-[#F0F2F5] text-right disabled:opacity-40"
                            value={item.quantity}
                            disabled={!item.include}
                            onChange={e => {
                              const updated = [...selectedInvoiceItems]
                              updated[i] = { ...updated[i], quantity: Math.min(Number(e.target.value), item.max_qty) }
                              setSelectedInvoiceItems(updated)
                            }}
                          />
                        </td>
                        <td className="px-3 py-2 text-right text-[#F0F2F5] text-xs">{formatCurrency(item.unit_price)}</td>
                        <td className="px-3 py-2 text-right text-[#6B7280] text-xs">{item.discount_pct}%</td>
                        <td className="px-3 py-2 text-right font-medium text-xs">
                          {item.include ? (
                            <span className="text-red-400">
                              -{formatCurrency(item.quantity * item.unit_price * (1 - (item.discount_pct || 0) / 100))}
                            </span>
                          ) : (
                            <span className="text-[#4B5563]">-</span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>

                {/* Totals row */}
                <div className="px-4 py-3 border-t border-[#1E2330] bg-[#0F1218] flex justify-end">
                  <div className="w-64 space-y-1 text-sm">
                    <div className="flex justify-between text-[#9CA3AF]">
                      <span>Subtotal NC:</span>
                      <span className="text-red-400 font-medium">
                        -{formatCurrency(
                          selectedInvoiceItems
                            .filter(it => it.include)
                            .reduce((s, it) => s + it.quantity * it.unit_price * (1 - (it.discount_pct || 0) / 100), 0)
                        )}
                      </span>
                    </div>
                    <div className="flex justify-between text-[#9CA3AF]">
                      <span>IVA {(selectedInvoice.tax_pct as number) || 21}%:</span>
                      <span className="text-red-400">
                        -{formatCurrency(
                          selectedInvoiceItems
                            .filter(it => it.include)
                            .reduce((s, it) => s + it.quantity * it.unit_price * (1 - (it.discount_pct || 0) / 100), 0) *
                          (((selectedInvoice.tax_pct as number) || 21) / 100)
                        )}
                      </span>
                    </div>
                    <div className="flex justify-between border-t border-[#1E2330] pt-2">
                      <span className="font-semibold text-[#F0F2F5]">Total NC:</span>
                      <span className="font-bold text-red-400 text-lg">
                        -{formatCurrency(
                          (() => {
                            const sub = selectedInvoiceItems
                              .filter(it => it.include)
                              .reduce((s, it) => s + it.quantity * it.unit_price * (1 - (it.discount_pct || 0) / 100), 0)
                            return sub + sub * (((selectedInvoice.tax_pct as number) || 21) / 100)
                          })()
                        )}
                      </span>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* No items message */}
          {selectedInvoice && selectedInvoiceItems.length === 0 && (
            <div className="p-4 rounded-lg bg-[#0F1218] border border-[#1E2330] text-center">
              <AlertTriangle size={20} className="mx-auto text-amber-400 mb-2" />
              <p className="text-sm text-[#6B7280]">
                La factura seleccionada no tiene items en tt_document_lines.
                Se creara la nota de credito por el total de la factura.
              </p>
            </div>
          )}

          {/* Actions */}
          <div className="flex justify-end gap-3 pt-4 border-t border-[#1E2330]">
            <Button variant="secondary" onClick={() => { setShowCreate(false); resetCreateForm() }}>
              Cancelar
            </Button>
            <Button
              variant="primary"
              onClick={handleCreateCreditNote}
              loading={saving}
              disabled={!selectedInvoice || !creditReason}
            >
              <Save size={14} /> Crear nota de credito
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
export default function VentasPage() {
  return (
    <div className="space-y-6 animate-fade-in">
      <div>
        <h1 className="text-2xl font-bold text-[#F0F2F5]">Ventas</h1>
        <p className="text-sm text-[#6B7280] mt-1">Presupuestos, pedidos, albaranes, facturas, notas de credito y cobros</p>
      </div>

      {/* FASE 0 — Disclaimer permanente. Mocciaro Soft opera como ERP
          standalone hoy: los documentos generados son operativos y
          NO tienen valor fiscal hasta que se integre la API legal
          (FASE 2 AR-ARCA / FASE 3 ES-AEAT-Verifactu). */}
      <div className="flex items-start gap-3 p-3 rounded-lg bg-[#F59E0B]/10 border border-[#F59E0B]/40">
        <AlertTriangle size={18} className="text-[#F59E0B] mt-0.5 shrink-0" />
        <div className="text-xs text-[#F0F2F5] leading-relaxed">
          <span className="font-semibold text-[#F59E0B]">Documentos operativos.</span>{' '}
          Facturación legal pendiente de integración API fiscal.{' '}
          <span className="text-[#D1D5DB]">No usar como comprobante AEAT (España) ni ARCA (Argentina).</span>
        </div>
      </div>

      <Suspense fallback={<div className="flex justify-center py-10"><Loader2 className="animate-spin text-[#FF6600]" size={32} /></div>}>
        <Tabs tabs={ventasTabs} defaultTab="presupuestos">
          {(activeTab) => (
            <>
              {activeTab === 'presupuestos' && <PresupuestosTab />}
              {activeTab === 'pedidos' && <PedidosTab />}
              {activeTab === 'albaranes' && <AlbaranesTab />}
              {activeTab === 'facturas' && <FacturasTab />}
              {activeTab === 'notas_credito' && <NotasCreditoTab />}
              {activeTab === 'cobros' && <CobrosTab />}
            </>
          )}
        </Tabs>
      </Suspense>
    </div>
  )
}
