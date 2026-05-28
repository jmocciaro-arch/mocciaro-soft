'use client'

import { useState, useEffect, useCallback, Suspense } from 'react'
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
  documentToTableRow, paymentToRow, mapStatus
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
import { generateDocNumber } from '@/lib/doc-numbering'
import { PresupuestosTab } from './_tabs/PresupuestosTab'
import { CobrosTab } from './_tabs/CobrosTab'
import { FacturasTab } from './_tabs/FacturasTab'
import { NotasCreditoTab } from './_tabs/NotasCreditoTab'

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

// ===============================================================
// PEDIDOS TAB
// ===============================================================
function PedidosTab() {
  const { filterByCompany, companyKey } = useCompanyFilter()
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
    // Solo tt_documents — tt_sales_orders legacy queda vacía y se elimina en Fase 2.
    let q = sb.from('tt_documents').select('*, client:tt_clients(id, name, legal_name, tax_id)').in('doc_type', ['pedido', 'order', 'so'])
    q = filterByCompany(q)
    const { data: docData } = await q.order('created_at', { ascending: false }).range(0, 499)
    setRows((docData || []).map(documentToTableRow))
    setLoading(false)
  }, [companyKey])

  useEffect(() => { load() }, [load])

  const loadCreateData = async () => {
    // Cotizaciones leen de tt_documents (doc_type='presupuesto').
    // 'doc_number' → 'display_ref' para mantener compat de UI.
    const [{ data: cl }, { data: qt }, { data: pr }] = await Promise.all([
      supabase.from('tt_clients').select('id, name').order('name').limit(500),
      supabase.from('tt_documents')
        .select('id, display_ref, system_code, client_id, total')
        .eq('doc_type', 'presupuesto')
        .in('status', ['draft', 'borrador', 'open'])
        .order('created_at', { ascending: false }),
      supabase.from('tt_products').select('id, sku, name, price_eur').order('name').limit(500),
    ])
    // Normalizamos a doc_number para que el dropdown UI no cambie.
    setClients(cl || [])
    setQuotesData((qt || []).map((row) => ({ ...row, doc_number: row.display_ref || row.system_code })))
    setProducts(pr || [])
  }

  const handleCreateFromQuote = async () => {
    if (!selectedQuote) return
    setSaving(true)
    // Lee la cotización del modelo unificado (tt_documents/tt_document_lines).
    // Antes leía tt_quotes/tt_quote_items (Fase 2 — migración).
    const { data: quote } = await supabase
      .from('tt_documents')
      .select('*, tt_document_lines(*)')
      .eq('id', selectedQuote)
      .eq('doc_type', 'presupuesto')
      .single()
    if (!quote) { addToast({ type: 'error', title: 'Error', message: 'Cotizacion no encontrada' }); setSaving(false); return }
    const docNum = await generateDocNumber('PED', quote.company_id as string | null)
    const { data: so, error } = await supabase
      .from('tt_documents')
      .insert({
        doc_type: 'pedido',
        system_code: docNum,
        display_ref: docNum,
        company_id: quote.company_id,
        client_id: quote.client_id,
        currency: quote.currency || 'EUR',
        status: 'open',
        subtotal: quote.subtotal || 0,
        tax_amount: quote.tax_amount || 0,
        total: quote.total || 0,
        notes: quote.notes || '',
        metadata: { quote_id: selectedQuote },
      })
      .select()
      .single()
    if (error || !so) { addToast({ type: 'error', title: 'Error', message: error?.message }); setSaving(false); return }
    const items = ((quote.tt_document_lines || []) as Row[]).map((it: Row, i: number) => ({
      document_id: so.id,
      product_id: it.product_id,
      sku: it.sku,
      description: it.description,
      quantity: it.quantity,
      unit_price: it.unit_price,
      discount_pct: it.discount_pct || 0,
      subtotal: it.subtotal,
      qty_reserved: 0,
      qty_delivered: 0,
      qty_invoiced: 0,
      sort_order: i,
    }))
    await supabase.from('tt_document_lines').insert(items)
    await supabase.from('tt_document_relations').insert({ parent_id: selectedQuote, child_id: so.id, relation_type: 'quote_to_order' })
    await supabase.from('tt_documents').update({ status: 'accepted' }).eq('id', selectedQuote)
    addToast({ type: 'success', title: 'Pedido creado', message: docNum })
    setShowCreate(false); setSelectedQuoteForm(''); load(); setSaving(false)
  }

  const handleCreateFromScratch = async () => {
    if (!selectedClient || newLines.length === 0) { addToast({ type: 'warning', title: 'Completa los datos' }); return }
    setSaving(true)
    const total = newLines.reduce((s, l) => s + l.qty * l.price, 0)
    const docNum = await generateDocNumber('PED', null)
    const { data: so, error } = await supabase
      .from('tt_documents')
      .insert({
        doc_type: 'pedido',
        system_code: docNum,
        display_ref: docNum,
        client_id: selectedClient,
        currency: 'EUR',
        status: 'open',
        subtotal: total,
        tax_amount: 0,
        total,
      })
      .select()
      .single()
    if (error || !so) { addToast({ type: 'error', title: 'Error', message: error?.message }); setSaving(false); return }
    const items = newLines.map((l, i) => ({
      document_id: so.id,
      product_id: l.product_id || null,
      description: l.name,
      quantity: l.qty,
      unit_price: l.price,
      subtotal: l.qty * l.price,
      qty_reserved: 0,
      qty_delivered: 0,
      qty_invoiced: 0,
      sort_order: i,
    }))
    await supabase.from('tt_document_lines').insert(items)
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
    // Lee las líneas del pedido del modelo unificado.
    const { data } = await supabase
      .from('tt_document_lines')
      .select('*')
      .eq('document_id', rawSO.id)
      .order('sort_order')
    setDeliveryLines((data || []).map((it: Row) => ({
      id: it.id as string,
      desc: (it.description || '') as string,
      ordered: ((it.quantity as number) || 0),
      delivered: ((it.qty_delivered as number) || 0),
      toDeliver: 0,
    })))
    setShowDelivery(true)
  }

  const handleDelivery = async () => {
    if (!selectedSO) return
    const docNum = await generateDocNumber('REM', (selectedSO.company_id as string | null) ?? null)
    // Crear el albarán en tt_documents.
    const { data: dn, error } = await supabase
      .from('tt_documents')
      .insert({
        doc_type: 'albaran',
        system_code: docNum,
        display_ref: docNum,
        company_id: selectedSO.company_id || null,
        client_id: selectedSO.client_id,
        status: 'pending',
        metadata: { sales_order_id: selectedSO.id },
      })
      .select()
      .single()
    if (error || !dn) { addToast({ type: 'error', title: 'Error', message: error?.message }); return }
    // Actualizar qty_delivered en las líneas del pedido + crear líneas del albarán.
    for (const l of deliveryLines) {
      if (l.toDeliver > 0) {
        await supabase.from('tt_document_lines').insert({
          document_id: dn.id,
          description: l.desc,
          quantity: l.toDeliver,
          qty_delivered: l.toDeliver,
          metadata: { source_line_id: l.id },
        })
        await supabase
          .from('tt_document_lines')
          .update({ qty_delivered: l.delivered + l.toDeliver })
          .eq('id', l.id)
      }
    }
    // Vincular albarán ↔ pedido.
    await supabase.from('tt_document_relations').insert({
      parent_id: selectedSO.id, child_id: dn.id, relation_type: 'order_to_delivery',
    })
    // Estado del pedido según lo entregado total.
    const { data: items } = await supabase
      .from('tt_document_lines')
      .select('quantity, qty_delivered')
      .eq('document_id', selectedSO.id)
    const allDelivered = (items || []).every((it: Row) => ((it.qty_delivered as number) || 0) >= ((it.quantity as number) || 0))
    await supabase
      .from('tt_documents')
      .update({ status: allDelivered ? 'fully_delivered' : 'partially_delivered' })
      .eq('id', selectedSO.id)
    addToast({ type: 'success', title: 'Remito generado', message: docNum })
    setShowDelivery(false); setSelectedSO(null); load()
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
    const { data: docData } = await q.order('created_at', { ascending: false }).range(0, 499)
    setRows((docData || []).map(documentToTableRow))
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
      const invoiceRef = await generateDocNumber('FAC', null)
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
// NOTAS DE CREDITO TAB
// NotasCreditoTab → ./_tabs/NotasCreditoTab
export default function VentasPage() {
  return (
    <div className="space-y-6 animate-fade-in">
      <div>
        <h1 className="text-2xl font-bold text-[#F0F2F5]">Ventas</h1>
        <p className="text-sm text-[#6B7280] mt-1">Presupuestos, pedidos, albaranes, facturas, notas de credito y cobros</p>
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
