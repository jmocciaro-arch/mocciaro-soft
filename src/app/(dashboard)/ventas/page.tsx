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
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from '@/components/ui/table'
import { KPICard } from '@/components/ui/kpi-card'
import { Tabs } from '@/components/ui/tabs'
import { useToast } from '@/components/ui/toast'
import { formatCurrency, formatDate } from '@/lib/utils'
import {
  Receipt, Plus, Eye, Loader2, FileText, Truck, CreditCard,
  Package, Clock, CheckCircle, ArrowRight, X, Send, DollarSign,
  ClipboardList, FileCheck
} from 'lucide-react'

type Row = Record<string, unknown>

// ═══════════════════════════════════════════════════════
// STATUS MAPS
// ═══════════════════════════════════════════════════════
const SO_STATUS: Record<string, { label: string; variant: 'default' | 'success' | 'warning' | 'danger' | 'info' | 'orange' }> = {
  open: { label: 'Abierto', variant: 'info' },
  partially_delivered: { label: 'Entrega parcial', variant: 'warning' },
  fully_delivered: { label: 'Entregado', variant: 'success' },
  partially_invoiced: { label: 'Facturación parcial', variant: 'orange' },
  fully_invoiced: { label: 'Facturado', variant: 'success' },
  closed: { label: 'Cerrado', variant: 'default' },
}

const QUOTE_STATUS: Record<string, { label: string; variant: 'default' | 'success' | 'warning' | 'danger' | 'info' | 'orange' }> = {
  draft: { label: 'Borrador', variant: 'default' },
  sent: { label: 'Enviada', variant: 'info' },
  accepted: { label: 'Aceptada', variant: 'success' },
  rejected: { label: 'Rechazada', variant: 'danger' },
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

// ═══════════════════════════════════════════════════════
// TAB DEFINITIONS
// ═══════════════════════════════════════════════════════
const ventasTabs = [
  { id: 'presupuestos', label: 'Presupuestos', icon: <FileText size={16} /> },
  { id: 'pedidos', label: 'Pedidos', icon: <ClipboardList size={16} /> },
  { id: 'albaranes', label: 'Albaranes', icon: <Truck size={16} /> },
  { id: 'facturas', label: 'Facturas', icon: <FileCheck size={16} /> },
  { id: 'cobros', label: 'Cobros', icon: <DollarSign size={16} /> },
]

// ═══════════════════════════════════════════════════════
// PRESUPUESTOS TAB
// ═══════════════════════════════════════════════════════
function PresupuestosTab() {
  const supabase = createClient()
  const { addToast } = useToast()
  const [quotes, setQuotes] = useState<Row[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState('')

  const load = useCallback(async () => {
    setLoading(true)
    let q = supabase.from('tt_quotes').select('*, tt_clients(name, company_name)').order('created_at', { ascending: false })
    if (statusFilter) q = q.eq('status', statusFilter)
    if (search) q = q.ilike('doc_number', `%${search}%`)
    const { data } = await q
    setQuotes(data || [])
    setLoading(false)
  }, [supabase, statusFilter, search])

  useEffect(() => { load() }, [load])

  const totalQuotes = quotes.length
  const draftCount = quotes.filter(q => q.status === 'draft').length
  const sentCount = quotes.filter(q => q.status === 'sent').length
  const totalVal = quotes.reduce((s, q) => s + ((q.total as number) || 0), 0)

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <KPICard label="Total presupuestos" value={totalQuotes} icon={<FileText size={22} />} />
        <KPICard label="Borradores" value={draftCount} icon={<Clock size={22} />} color="#6B7280" />
        <KPICard label="Enviados" value={sentCount} icon={<Send size={22} />} color="#3B82F6" />
        <KPICard label="Valor total" value={formatCurrency(totalVal)} icon={<CreditCard size={22} />} color="#F59E0B" />
      </div>
      <Card>
        <div className="flex flex-col sm:flex-row gap-3">
          <SearchBar placeholder="Buscar presupuesto..." value={search} onChange={setSearch} className="flex-1" />
          <Select
            options={[{ value: '', label: 'Todos' }, ...Object.entries(QUOTE_STATUS).map(([k, v]) => ({ value: k, label: v.label }))]}
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
          />
        </div>
      </Card>
      <Card className="p-0 overflow-hidden">
        {loading ? (
          <div className="flex items-center justify-center py-20"><Loader2 className="animate-spin text-[#FF6600]" size={32} /></div>
        ) : quotes.length === 0 ? (
          <div className="text-center py-20 text-[#6B7280]">
            <FileText size={48} className="mx-auto mb-3 opacity-30" />
            <p>No hay presupuestos</p>
          </div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Nro</TableHead>
                <TableHead>Cliente</TableHead>
                <TableHead>Estado</TableHead>
                <TableHead>Total</TableHead>
                <TableHead>Fecha</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {quotes.map((q) => {
                const cfg = QUOTE_STATUS[(q.status as string) || 'draft']
                const clientObj = q.tt_clients as Row | null
                const clientName = (clientObj?.company_name as string) || (clientObj?.name as string) || '-'
                return (
                  <TableRow key={q.id as string}>
                    <TableCell><span className="font-mono text-xs text-[#FF6600]">{(q.doc_number as string) || (q.quote_number as string) || '-'}</span></TableCell>
                    <TableCell><span className="text-[#F0F2F5]">{clientName}</span></TableCell>
                    <TableCell><Badge variant={cfg?.variant || 'default'}>{cfg?.label || (q.status as string)}</Badge></TableCell>
                    <TableCell>{formatCurrency((q.total as number) || 0)}</TableCell>
                    <TableCell className="text-sm">{q.created_at ? formatDate(q.created_at as string) : '-'}</TableCell>
                  </TableRow>
                )
              })}
            </TableBody>
          </Table>
        )}
      </Card>
    </div>
  )
}

// ═══════════════════════════════════════════════════════
// PEDIDOS TAB (existing ventas functionality)
// ═══════════════════════════════════════════════════════
function PedidosTab() {
  const supabase = createClient()
  const { addToast } = useToast()

  const [orders, setOrders] = useState<Row[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState('')

  const [showDetail, setShowDetail] = useState(false)
  const [showCreate, setShowCreate] = useState(false)
  const [showDelivery, setShowDelivery] = useState(false)

  const [selectedSO, setSelectedSO] = useState<Row | null>(null)
  const [soItems, setSOItems] = useState<Row[]>([])

  // Create form
  const [clients, setClients] = useState<Array<Row>>([])
  const [quotesData, setQuotesData] = useState<Array<Row>>([])
  const [selectedQuote, setSelectedQuote] = useState('')
  const [selectedClient, setSelectedClient] = useState('')
  const [products, setProducts] = useState<Array<Row>>([])
  const [newLines, setNewLines] = useState<Array<{ product_id: string; name: string; qty: number; price: number }>>([])
  const [saving, setSaving] = useState(false)

  // Delivery form
  const [deliveryLines, setDeliveryLines] = useState<Array<{ id: string; desc: string; ordered: number; delivered: number; toDeliver: number }>>([])

  const load = useCallback(async () => {
    setLoading(true)
    let q = supabase.from('tt_sales_orders').select('*, tt_clients(name)').order('created_at', { ascending: false })
    if (statusFilter) q = q.eq('status', statusFilter)
    if (search) q = q.ilike('doc_number', `%${search}%`)
    const { data } = await q
    setOrders(data || [])
    setLoading(false)
  }, [supabase, statusFilter, search])

  useEffect(() => { load() }, [load])

  const loadCreateData = async () => {
    const [{ data: cl }, { data: qt }, { data: pr }] = await Promise.all([
      supabase.from('tt_clients').select('id, name').order('name').limit(500),
      supabase.from('tt_quotes').select('id, doc_number, client_id, total').eq('status', 'draft').order('created_at', { ascending: false }),
      supabase.from('tt_products').select('id, sku, name, sell_price').order('name').limit(500),
    ])
    setClients(cl || [])
    setQuotesData(qt || [])
    setProducts(pr || [])
  }

  const handleCreateFromQuote = async () => {
    if (!selectedQuote) return
    setSaving(true)
    const { data: quote } = await supabase.from('tt_quotes').select('*, tt_quote_items(*)').eq('id', selectedQuote).single()
    if (!quote) { addToast({ type: 'error', title: 'Error', message: 'Cotizacion no encontrada' }); setSaving(false); return }

    const yr = new Date().getFullYear().toString().slice(-2)
    const mo = (new Date().getMonth() + 1).toString().padStart(2, '0')
    const seq = Math.floor(Math.random() * 9999).toString().padStart(4, '0')
    const docNum = `PED-${yr}${mo}-${seq}`

    const { data: so, error } = await supabase.from('tt_sales_orders').insert({
      company_id: quote.company_id, client_id: quote.client_id, quote_id: selectedQuote,
      doc_number: docNum, currency: quote.currency || 'EUR', status: 'open',
      subtotal: quote.subtotal || 0, tax_amount: quote.tax_amount || 0, total: quote.total || 0, notes: quote.notes || '',
    }).select().single()

    if (error || !so) { addToast({ type: 'error', title: 'Error', message: error?.message }); setSaving(false); return }

    const items = (quote.tt_quote_items || []).map((it: Row, i: number) => ({
      sales_order_id: so.id, product_id: it.product_id, description: it.description,
      quantity: it.quantity, unit_price: it.unit_price, discount_pct: it.discount_pct || 0,
      line_total: it.line_total, qty_ordered: it.quantity, qty_reserved: 0, qty_delivered: 0, qty_invoiced: 0, sort_order: i,
    }))
    await supabase.from('tt_so_items').insert(items)
    await supabase.from('tt_quotes').update({ status: 'accepted' }).eq('id', selectedQuote)
    await supabase.from('tt_activity_log').insert({ entity_type: 'sales_order', entity_id: so.id, action: 'created', detail: `Pedido ${docNum} desde cotizacion` })

    addToast({ type: 'success', title: 'Pedido creado', message: docNum })
    setShowCreate(false); setSelectedQuote(''); load(); setSaving(false)
  }

  const handleCreateFromScratch = async () => {
    if (!selectedClient || newLines.length === 0) { addToast({ type: 'warning', title: 'Completa los datos' }); return }
    setSaving(true)
    const total = newLines.reduce((s, l) => s + l.qty * l.price, 0)
    const yr = new Date().getFullYear().toString().slice(-2)
    const mo = (new Date().getMonth() + 1).toString().padStart(2, '0')
    const seq = Math.floor(Math.random() * 9999).toString().padStart(4, '0')
    const docNum = `PED-${yr}${mo}-${seq}`

    const { data: so, error } = await supabase.from('tt_sales_orders').insert({
      client_id: selectedClient, doc_number: docNum, currency: 'EUR', status: 'open',
      subtotal: total, tax_amount: 0, total,
    }).select().single()

    if (error || !so) { addToast({ type: 'error', title: 'Error', message: error?.message }); setSaving(false); return }

    const items = newLines.map((l, i) => ({
      sales_order_id: so.id, product_id: l.product_id || null, description: l.name,
      quantity: l.qty, unit_price: l.price, line_total: l.qty * l.price,
      qty_ordered: l.qty, qty_reserved: 0, qty_delivered: 0, qty_invoiced: 0, sort_order: i,
    }))
    await supabase.from('tt_so_items').insert(items)
    await supabase.from('tt_activity_log').insert({ entity_type: 'sales_order', entity_id: so.id, action: 'created', detail: `Pedido ${docNum} creado` })

    addToast({ type: 'success', title: 'Pedido creado', message: docNum })
    setShowCreate(false); setSelectedClient(''); setNewLines([]); load(); setSaving(false)
  }

  const openDetail = async (so: Row) => {
    setSelectedSO(so)
    const { data } = await supabase.from('tt_so_items').select('*').eq('sales_order_id', so.id).order('sort_order')
    setSOItems(data || [])
    setShowDetail(true)
  }

  const openDelivery = async (so: Row) => {
    setSelectedSO(so)
    const { data } = await supabase.from('tt_so_items').select('*').eq('sales_order_id', so.id).order('sort_order')
    setDeliveryLines((data || []).map((it: Row) => ({
      id: it.id as string, desc: (it.description || '') as string,
      ordered: (it.qty_ordered || it.quantity || 0) as number, delivered: (it.qty_delivered || 0) as number, toDeliver: 0,
    })))
    setShowDelivery(true)
  }

  const handleDelivery = async () => {
    if (!selectedSO) return
    const yr = new Date().getFullYear().toString().slice(-2)
    const mo = (new Date().getMonth() + 1).toString().padStart(2, '0')
    const seq = Math.floor(Math.random() * 9999).toString().padStart(4, '0')
    const docNum = `REM-${yr}${mo}-${seq}`

    const { data: dn, error } = await supabase.from('tt_delivery_notes').insert({
      company_id: selectedSO.company_id || null, client_id: selectedSO.client_id,
      sales_order_id: selectedSO.id, doc_number: docNum, status: 'pending',
    }).select().single()

    if (error || !dn) { addToast({ type: 'error', title: 'Error', message: error?.message }); return }

    for (const l of deliveryLines) {
      if (l.toDeliver > 0) {
        await supabase.from('tt_dn_items').insert({ delivery_note_id: dn.id, so_item_id: l.id, quantity: l.toDeliver })
        await supabase.from('tt_so_items').update({ qty_delivered: l.delivered + l.toDeliver }).eq('id', l.id)
      }
    }

    const { data: items } = await supabase.from('tt_so_items').select('qty_ordered, quantity, qty_delivered').eq('sales_order_id', selectedSO.id)
    const allDelivered = (items || []).every((it: Row) => ((it.qty_delivered as number) || 0) >= ((it.qty_ordered as number) || (it.quantity as number) || 0))
    const st = allDelivered ? 'fully_delivered' : 'partially_delivered'

    await supabase.from('tt_sales_orders').update({ status: st }).eq('id', selectedSO.id)
    await supabase.from('tt_activity_log').insert({ entity_type: 'delivery_note', entity_id: dn.id, action: 'created', detail: `Remito ${docNum} creado` })

    addToast({ type: 'success', title: 'Remito generado', message: docNum })
    setShowDelivery(false); load()
  }

  const handleInvoice = async (so: Row) => {
    const yr = new Date().getFullYear().toString().slice(-2)
    const mo = (new Date().getMonth() + 1).toString().padStart(2, '0')
    const seq = Math.floor(Math.random() * 9999).toString().padStart(4, '0')
    const docNum = `FAC-${yr}${mo}-${seq}`

    const { error } = await supabase.from('tt_invoices').insert({
      company_id: so.company_id || null, client_id: so.client_id, sales_order_id: so.id,
      doc_number: docNum, type: 'sale', status: 'draft', currency: so.currency || 'EUR',
      subtotal: so.subtotal || 0, tax_amount: so.tax_amount || 0, total: so.total || 0,
    }).select().single()

    if (error) { addToast({ type: 'error', title: 'Error', message: error.message }); return }

    await supabase.from('tt_sales_orders').update({ status: 'fully_invoiced' }).eq('id', so.id)
    addToast({ type: 'success', title: 'Factura generada', message: docNum })
    setShowDetail(false); load()
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

      <Card>
        <div className="flex flex-col sm:flex-row gap-3">
          <SearchBar placeholder="Buscar por nro de pedido..." value={search} onChange={setSearch} className="flex-1" />
          <Select
            options={[{ value: '', label: 'Todos' }, ...Object.entries(SO_STATUS).map(([k, v]) => ({ value: k, label: v.label }))]}
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
          />
        </div>
      </Card>

      <Card className="p-0 overflow-hidden">
        {loading ? (
          <div className="flex items-center justify-center py-20"><Loader2 className="animate-spin text-[#FF6600]" size={32} /></div>
        ) : orders.length === 0 ? (
          <div className="text-center py-20 text-[#6B7280]"><Receipt size={48} className="mx-auto mb-3 opacity-30" /><p>No hay pedidos de venta</p></div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Nro</TableHead>
                <TableHead>Cliente</TableHead>
                <TableHead>Estado</TableHead>
                <TableHead>Total</TableHead>
                <TableHead>Fecha</TableHead>
                <TableHead>Acciones</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {orders.map((so) => {
                const cfg = SO_STATUS[(so.status as string) || 'open']
                const clientName = (so.tt_clients as Row)?.name as string || '-'
                return (
                  <TableRow key={so.id as string}>
                    <TableCell><span className="font-mono text-xs text-[#FF6600]">{so.doc_number as string}</span></TableCell>
                    <TableCell><span className="text-[#F0F2F5]">{clientName}</span></TableCell>
                    <TableCell><Badge variant={cfg?.variant || 'default'}>{cfg?.label || (so.status as string)}</Badge></TableCell>
                    <TableCell>{formatCurrency((so.total as number) || 0)}</TableCell>
                    <TableCell className="text-sm">{so.created_at ? formatDate(so.created_at as string) : '-'}</TableCell>
                    <TableCell>
                      <div className="flex gap-1">
                        <Button variant="ghost" size="sm" onClick={() => openDetail(so)}><Eye size={14} /></Button>
                        {(so.status === 'open' || so.status === 'partially_delivered') && (
                          <Button variant="ghost" size="sm" onClick={() => openDelivery(so)} title="Generar remito"><Truck size={14} /></Button>
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                )
              })}
            </TableBody>
          </Table>
        )}
      </Card>

      {/* CREATE MODAL */}
      <Modal isOpen={showCreate} onClose={() => setShowCreate(false)} title="Nuevo Pedido de Venta" size="xl">
        <div className="space-y-6">
          <div className="p-4 rounded-lg bg-[#0F1218] border border-[#1E2330]">
            <h3 className="text-sm font-semibold text-[#F0F2F5] mb-3">Desde cotizacion existente</h3>
            <div className="flex gap-3 items-end">
              <div className="flex-1">
                <Select
                  label="Cotizacion"
                  options={quotesData.map(q => ({ value: q.id as string, label: `${q.doc_number || q.id} - $${q.total}` }))}
                  value={selectedQuote}
                  onChange={(e) => setSelectedQuote(e.target.value)}
                  placeholder="Selecciona una cotizacion"
                />
              </div>
              <Button onClick={handleCreateFromQuote} loading={saving} disabled={!selectedQuote}><ArrowRight size={14} /> Crear desde COT</Button>
            </div>
          </div>
          <div className="relative text-center"><span className="text-xs text-[#4B5563] bg-[#141820] px-3 relative z-10">o crear desde cero</span><div className="absolute top-1/2 left-0 right-0 h-px bg-[#1E2330]" /></div>
          <div className="space-y-4">
            <Select label="Cliente" options={clients.map(c => ({ value: c.id as string, label: c.name as string }))} value={selectedClient} onChange={(e) => setSelectedClient(e.target.value)} placeholder="Selecciona un cliente" />
            <div>
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm font-medium text-[#9CA3AF]">Items</span>
                <Button variant="ghost" size="sm" onClick={() => setNewLines([...newLines, { product_id: '', name: '', qty: 1, price: 0 }])}><Plus size={14} /> Agregar</Button>
              </div>
              {newLines.map((l, i) => (
                <div key={i} className="flex gap-2 mb-2 items-end">
                  <div className="flex-1">
                    <Select options={products.map(p => ({ value: p.id as string, label: `${p.sku || ''} - ${p.name}` }))} value={l.product_id}
                      onChange={(e) => { const u = [...newLines]; const p = products.find(pr => pr.id === e.target.value); if (p) u[i] = { ...u[i], product_id: p.id as string, name: (p.name || '') as string, price: (p.sell_price || 0) as number }; setNewLines(u) }}
                      placeholder="Producto" />
                  </div>
                  <Input type="number" value={l.qty} onChange={(e) => { const u = [...newLines]; u[i].qty = Number(e.target.value); setNewLines(u) }} className="w-20" />
                  <Input type="number" value={l.price} onChange={(e) => { const u = [...newLines]; u[i].price = Number(e.target.value); setNewLines(u) }} className="w-28" />
                  <Button variant="ghost" size="sm" onClick={() => setNewLines(newLines.filter((_, idx) => idx !== i))}><X size={14} /></Button>
                </div>
              ))}
            </div>
            <div className="flex justify-end gap-3 pt-4 border-t border-[#1E2330]">
              <Button variant="secondary" onClick={() => setShowCreate(false)}>Cancelar</Button>
              <Button onClick={handleCreateFromScratch} loading={saving}>Crear Pedido</Button>
            </div>
          </div>
        </div>
      </Modal>

      {/* DETAIL MODAL */}
      <Modal isOpen={showDetail} onClose={() => setShowDetail(false)} title={`Pedido ${(selectedSO?.doc_number as string) || ''}`} size="lg">
        {selectedSO && (
          <div className="space-y-4">
            <div className="flex items-center gap-3 flex-wrap">
              <Badge variant={SO_STATUS[(selectedSO.status as string) || 'open']?.variant || 'default'}>
                {SO_STATUS[(selectedSO.status as string) || 'open']?.label || (selectedSO.status as string)}
              </Badge>
              {selectedSO.quote_id ? <Badge variant="info">Desde cotizacion</Badge> : null}
              <span className="text-sm text-[#6B7280]">{selectedSO.created_at ? formatDate(selectedSO.created_at as string) : ''}</span>
            </div>
            <Table>
              <TableHeader><TableRow><TableHead>Producto</TableHead><TableHead>Pedido</TableHead><TableHead>Entregado</TableHead><TableHead>Facturado</TableHead><TableHead>Pendiente</TableHead><TableHead>Total</TableHead></TableRow></TableHeader>
              <TableBody>
                {soItems.map((it) => {
                  const ordered = (it.qty_ordered || it.quantity || 0) as number
                  const delivered = (it.qty_delivered || 0) as number
                  const invoiced = (it.qty_invoiced || 0) as number
                  return (
                    <TableRow key={it.id as string}>
                      <TableCell>{it.description as string}</TableCell>
                      <TableCell>{ordered}</TableCell>
                      <TableCell><span className={delivered >= ordered ? 'text-emerald-400' : 'text-amber-400'}>{delivered}</span></TableCell>
                      <TableCell>{invoiced}</TableCell>
                      <TableCell>{Math.max(0, ordered - delivered)}</TableCell>
                      <TableCell>{formatCurrency((it.line_total as number) || 0)}</TableCell>
                    </TableRow>
                  )
                })}
              </TableBody>
            </Table>
            <p className="text-right text-lg font-bold text-[#FF6600]">Total: {formatCurrency((selectedSO.total as number) || 0)}</p>
            <div className="flex justify-end gap-2 pt-4 border-t border-[#1E2330]">
              {(selectedSO.status === 'open' || selectedSO.status === 'partially_delivered') && (
                <Button variant="secondary" onClick={() => { setShowDetail(false); openDelivery(selectedSO) }}><Truck size={14} /> Generar Remito</Button>
              )}
              {(selectedSO.status === 'fully_delivered' || selectedSO.status === 'partially_invoiced') && (
                <Button onClick={() => handleInvoice(selectedSO)}><CreditCard size={14} /> Generar Factura</Button>
              )}
            </div>
          </div>
        )}
      </Modal>

      {/* DELIVERY NOTE MODAL */}
      <Modal isOpen={showDelivery} onClose={() => setShowDelivery(false)} title="Generar Remito" size="lg">
        <div className="space-y-4">
          <p className="text-sm text-[#6B7280]">Indica las cantidades a entregar para cada item</p>
          {deliveryLines.map((l, i) => (
            <div key={l.id} className="flex items-center gap-3 p-3 rounded-lg bg-[#0F1218]">
              <div className="flex-1">
                <p className="text-sm text-[#F0F2F5]">{l.desc}</p>
                <p className="text-xs text-[#6B7280]">Pedido: {l.ordered} | Entregado: {l.delivered} | Pend: {l.ordered - l.delivered}</p>
              </div>
              <Input type="number" value={l.toDeliver}
                onChange={(e) => { const u = [...deliveryLines]; u[i].toDeliver = Math.max(0, Math.min(Number(e.target.value), l.ordered - l.delivered)); setDeliveryLines(u) }}
                className="w-24" />
            </div>
          ))}
          <div className="flex justify-end gap-3 pt-4 border-t border-[#1E2330]">
            <Button variant="secondary" onClick={() => setShowDelivery(false)}>Cancelar</Button>
            <Button onClick={handleDelivery}><Truck size={16} /> Confirmar Remito</Button>
          </div>
        </div>
      </Modal>
    </div>
  )
}

// ═══════════════════════════════════════════════════════
// ALBARANES TAB
// ═══════════════════════════════════════════════════════
function AlbaranesTab() {
  const supabase = createClient()
  const [notes, setNotes] = useState<Row[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState('')

  const load = useCallback(async () => {
    setLoading(true)
    let q = supabase.from('tt_delivery_notes').select('*, tt_clients(name), tt_sales_orders(doc_number)').order('created_at', { ascending: false })
    if (statusFilter) q = q.eq('status', statusFilter)
    if (search) q = q.ilike('doc_number', `%${search}%`)
    const { data } = await q
    setNotes(data || [])
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
      <Card>
        <div className="flex flex-col sm:flex-row gap-3">
          <SearchBar placeholder="Buscar albaran..." value={search} onChange={setSearch} className="flex-1" />
          <Select
            options={[{ value: '', label: 'Todos' }, ...Object.entries(DN_STATUS).map(([k, v]) => ({ value: k, label: v.label }))]}
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
          />
        </div>
      </Card>
      <Card className="p-0 overflow-hidden">
        {loading ? (
          <div className="flex items-center justify-center py-20"><Loader2 className="animate-spin text-[#FF6600]" size={32} /></div>
        ) : notes.length === 0 ? (
          <div className="text-center py-20 text-[#6B7280]"><Truck size={48} className="mx-auto mb-3 opacity-30" /><p>No hay albaranes</p></div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Nro</TableHead>
                <TableHead>Cliente</TableHead>
                <TableHead>Pedido ref.</TableHead>
                <TableHead>Estado</TableHead>
                <TableHead>Fecha</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {notes.map((n) => {
                const cfg = DN_STATUS[(n.status as string) || 'pending']
                const clientName = (n.tt_clients as Row)?.name as string || '-'
                const soRef = (n.tt_sales_orders as Row)?.doc_number as string || '-'
                return (
                  <TableRow key={n.id as string}>
                    <TableCell><span className="font-mono text-xs text-[#FF6600]">{n.doc_number as string}</span></TableCell>
                    <TableCell><span className="text-[#F0F2F5]">{clientName}</span></TableCell>
                    <TableCell><span className="text-sm text-[#9CA3AF]">{soRef}</span></TableCell>
                    <TableCell><Badge variant={cfg?.variant || 'default'}>{cfg?.label || (n.status as string)}</Badge></TableCell>
                    <TableCell className="text-sm">{n.created_at ? formatDate(n.created_at as string) : '-'}</TableCell>
                  </TableRow>
                )
              })}
            </TableBody>
          </Table>
        )}
      </Card>
    </div>
  )
}

// ═══════════════════════════════════════════════════════
// FACTURAS TAB
// ═══════════════════════════════════════════════════════
function FacturasTab() {
  const supabase = createClient()
  const { addToast } = useToast()
  const [invoices, setInvoices] = useState<Row[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState('')

  const load = useCallback(async () => {
    setLoading(true)
    let q = supabase.from('tt_invoices').select('*, tt_clients(name)').eq('type', 'sale').order('created_at', { ascending: false })
    if (statusFilter) q = q.eq('status', statusFilter)
    if (search) q = q.ilike('doc_number', `%${search}%`)
    const { data } = await q
    setInvoices(data || [])
    setLoading(false)
  }, [supabase, statusFilter, search])

  useEffect(() => { load() }, [load])

  const totalInv = invoices.length
  const pendingAmount = invoices.filter(i => i.status !== 'paid').reduce((s, i) => s + ((i.total as number) || 0), 0)
  const paidCount = invoices.filter(i => i.status === 'paid').length

  const registerPayment = async (inv: Row) => {
    await supabase.from('tt_invoices').update({ status: 'paid' }).eq('id', inv.id)
    await supabase.from('tt_payments').insert({
      invoice_id: inv.id, amount: inv.total, method: 'transferencia', status: 'completed',
    })
    addToast({ type: 'success', title: 'Pago registrado' })
    load()
  }

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <KPICard label="Total facturas" value={totalInv} icon={<FileCheck size={22} />} />
        <KPICard label="Cobradas" value={paidCount} icon={<CheckCircle size={22} />} color="#10B981" />
        <KPICard label="Pendiente de cobro" value={formatCurrency(pendingAmount)} icon={<CreditCard size={22} />} color="#F59E0B" />
      </div>
      <Card>
        <div className="flex flex-col sm:flex-row gap-3">
          <SearchBar placeholder="Buscar factura..." value={search} onChange={setSearch} className="flex-1" />
          <Select
            options={[{ value: '', label: 'Todas' }, ...Object.entries(INV_STATUS).map(([k, v]) => ({ value: k, label: v.label }))]}
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
          />
        </div>
      </Card>
      <Card className="p-0 overflow-hidden">
        {loading ? (
          <div className="flex items-center justify-center py-20"><Loader2 className="animate-spin text-[#FF6600]" size={32} /></div>
        ) : invoices.length === 0 ? (
          <div className="text-center py-20 text-[#6B7280]"><FileCheck size={48} className="mx-auto mb-3 opacity-30" /><p>No hay facturas de venta</p></div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Nro</TableHead>
                <TableHead>Cliente</TableHead>
                <TableHead>Total</TableHead>
                <TableHead>Estado</TableHead>
                <TableHead>Fecha</TableHead>
                <TableHead>Acciones</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {invoices.map((inv) => {
                const cfg = INV_STATUS[(inv.status as string) || 'draft']
                const clientName = (inv.tt_clients as Row)?.name as string || '-'
                return (
                  <TableRow key={inv.id as string}>
                    <TableCell><span className="font-mono text-xs text-[#FF6600]">{inv.doc_number as string}</span></TableCell>
                    <TableCell><span className="text-[#F0F2F5]">{clientName}</span></TableCell>
                    <TableCell>{formatCurrency((inv.total as number) || 0)}</TableCell>
                    <TableCell><Badge variant={cfg?.variant || 'default'}>{cfg?.label || (inv.status as string)}</Badge></TableCell>
                    <TableCell className="text-sm">{inv.created_at ? formatDate(inv.created_at as string) : '-'}</TableCell>
                    <TableCell>
                      {inv.status !== 'paid' && (
                        <Button variant="ghost" size="sm" onClick={() => registerPayment(inv)} title="Registrar pago"><DollarSign size={14} /></Button>
                      )}
                    </TableCell>
                  </TableRow>
                )
              })}
            </TableBody>
          </Table>
        )}
      </Card>
    </div>
  )
}

// ═══════════════════════════════════════════════════════
// COBROS TAB
// ═══════════════════════════════════════════════════════
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
      <Card>
        <SearchBar placeholder="Buscar cobro..." value={search} onChange={setSearch} className="flex-1" />
      </Card>
      <Card className="p-0 overflow-hidden">
        {loading ? (
          <div className="flex items-center justify-center py-20"><Loader2 className="animate-spin text-[#FF6600]" size={32} /></div>
        ) : payments.length === 0 ? (
          <div className="text-center py-20 text-[#6B7280]"><DollarSign size={48} className="mx-auto mb-3 opacity-30" /><p>No hay cobros registrados</p></div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Factura ref.</TableHead>
                <TableHead>Monto</TableHead>
                <TableHead>Metodo</TableHead>
                <TableHead>Estado</TableHead>
                <TableHead>Fecha</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {payments.map((p) => {
                const invRef = (p.tt_invoices as Row)?.doc_number as string || '-'
                return (
                  <TableRow key={p.id as string}>
                    <TableCell><span className="font-mono text-xs text-[#FF6600]">{invRef}</span></TableCell>
                    <TableCell className="font-bold text-[#F0F2F5]">{formatCurrency((p.amount as number) || 0)}</TableCell>
                    <TableCell className="capitalize">{(p.method as string) || '-'}</TableCell>
                    <TableCell><Badge variant={(p.status as string) === 'completed' ? 'success' : 'warning'}>{(p.status as string) || 'pendiente'}</Badge></TableCell>
                    <TableCell className="text-sm">{p.created_at ? formatDate(p.created_at as string) : '-'}</TableCell>
                  </TableRow>
                )
              })}
            </TableBody>
          </Table>
        )}
      </Card>
    </div>
  )
}

// ═══════════════════════════════════════════════════════
// MAIN PAGE
// ═══════════════════════════════════════════════════════
export default function VentasPage() {
  return (
    <div className="space-y-6">
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
