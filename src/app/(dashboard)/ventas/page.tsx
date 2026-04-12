'use client'

import { useState, useEffect, useCallback, Suspense } from 'react'
import { createClient } from '@/lib/supabase/client'
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
import {
  Receipt, Plus, Loader2, FileText, Truck, CreditCard,
  Clock, ArrowRight, X, DollarSign,
  ClipboardList, FileCheck
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

// ===============================================================
// PRESUPUESTOS TAB
// ===============================================================
function PresupuestosTab() {
  const supabase = createClient()
  const [rows, setRows] = useState<Record<string, unknown>[]>([])
  const [loading, setLoading] = useState(true)
  const [selectedDoc, setSelectedDoc] = useState<{ id: string; source: 'local' | 'tt_documents' } | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    const sb = createClient()
    const [{ data: docData }, { data: localData }] = await Promise.all([
      sb.from('tt_documents').select('*, client:tt_clients(id, name, legal_name, tax_id)').eq('type', 'coti').order('created_at', { ascending: false }).range(0, 499),
      sb.from('tt_quotes').select('*, tt_clients(name, tax_id, country)').order('created_at', { ascending: false }),
    ])
    const localRows = (localData || []).map(localQuoteToRow)
    const docRows = (docData || []).map(documentToTableRow)
    setRows([...localRows, ...docRows])
    setLoading(false)
  }, [])

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
  const supabase = createClient()
  const { addToast } = useToast()

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
    const [{ data: docData }, { data: localData }] = await Promise.all([
      sb.from('tt_documents').select('*, client:tt_clients(id, name, legal_name, tax_id)').eq('type', 'pedido').order('created_at', { ascending: false }).range(0, 499),
      sb.from('tt_sales_orders').select('*, tt_clients(name, tax_id, country)').order('created_at', { ascending: false }),
    ])
    const localRows = (localData || []).map(localSOToRow)
    const docRows = (docData || []).map(documentToTableRow)
    setRows([...localRows, ...docRows])
    setLoading(false)
  }, [])

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
// ALBARANES TAB
// ===============================================================
function AlbaranesTab() {
  const supabase = createClient()
  const [rows, setRows] = useState<Record<string, unknown>[]>([])
  const [loading, setLoading] = useState(true)
  const [selectedDoc, setSelectedDoc] = useState<{ id: string; source: 'local' | 'tt_documents' } | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    const sb = createClient()
    const [{ data: docData }, { data: localData }] = await Promise.all([
      sb.from('tt_documents').select('*, client:tt_clients(id, name, legal_name, tax_id)').eq('type', 'delivery_note').order('created_at', { ascending: false }).range(0, 499),
      sb.from('tt_delivery_notes').select('*, tt_clients(name), tt_sales_orders(doc_number)').order('created_at', { ascending: false }),
    ])
    const localRows = (localData || []).map(localDNToRow)
    const docRows = (docData || []).map(documentToTableRow)
    setRows([...localRows, ...docRows])
    setLoading(false)
  }, [])

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
        documentType="delivery_note"
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
      columns={ALBARAN_COLS}
      loading={loading}
      totalLabel="albaranes"
      showTotals
      onRowClick={openDetail}
      exportFilename="albaranes_torquetools"
      pageSize={25}
    />
  )
}

// ===============================================================
// FACTURAS TAB
// ===============================================================
function FacturasTab() {
  const supabase = createClient()
  const [rows, setRows] = useState<Record<string, unknown>[]>([])
  const [loading, setLoading] = useState(true)
  const [selectedDoc, setSelectedDoc] = useState<{ id: string; source: 'local' | 'tt_documents' } | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    const sb = createClient()
    const [{ data: docData }, { data: localData }] = await Promise.all([
      sb.from('tt_documents').select('*, client:tt_clients(id, name, legal_name, tax_id)').in('type', ['factura', 'factura_abono']).order('created_at', { ascending: false }).range(0, 499),
      sb.from('tt_invoices').select('*, tt_clients(name)').eq('type', 'sale').order('created_at', { ascending: false }),
    ])
    const localRows = (localData || []).map(localInvoiceToRow)
    const docRows = (docData || []).map(documentToTableRow)
    setRows([...localRows, ...docRows])
    setLoading(false)
  }, [])

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
  const supabase = createClient()
  const [rows, setRows] = useState<Record<string, unknown>[]>([])
  const [loading, setLoading] = useState(true)

  const load = useCallback(async () => {
    setLoading(true)
    const sb = createClient()
    const { data } = await sb.from('tt_payments').select('*, tt_invoices(doc_number)').order('created_at', { ascending: false })
    setRows((data || []).map(paymentToRow))
    setLoading(false)
  }, [])

  useEffect(() => { load() }, [load])

  return (
    <DataTable
      data={rows}
      columns={COBRO_COLS}
      loading={loading}
      totalLabel="cobros"
      showTotals
      exportFilename="cobros_torquetools"
      pageSize={25}
    />
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
