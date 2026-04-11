'use client'

import { useState, useEffect, useCallback, Suspense } from 'react'
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
import { formatCurrency, formatDate } from '@/lib/utils'
import { DocumentDetailLayout, type WorkflowStep } from '@/components/workflow/document-detail-layout'
import { DocumentItemsTree, type DocumentItem } from '@/components/workflow/document-items-tree'
import { DocumentListCard } from '@/components/workflow/document-list-card'
import {
  ShoppingCart, Plus, Package, Truck, CheckCircle, Clock,
  FileText, Loader2, X, Send, Users, DollarSign, FileCheck
} from 'lucide-react'

type Row = Record<string, unknown>

const PO_STATUS: Record<string, { label: string; variant: 'default' | 'success' | 'warning' | 'danger' | 'info' | 'orange' }> = {
  draft: { label: 'Borrador', variant: 'default' },
  sent: { label: 'Enviada', variant: 'info' },
  partial: { label: 'Parcial', variant: 'warning' },
  received: { label: 'Recibida', variant: 'success' },
  closed: { label: 'Cerrada', variant: 'danger' },
}

const comprasTabs = [
  { id: 'proveedores', label: 'Proveedores', icon: <Users size={16} /> },
  { id: 'pedidos', label: 'Pedidos', icon: <ShoppingCart size={16} /> },
  { id: 'recepciones', label: 'Recepciones', icon: <Truck size={16} /> },
  { id: 'facturas', label: 'Facturas compra', icon: <FileCheck size={16} /> },
]

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

// ===============================================================
// PROVEEDORES TAB
// ===============================================================
function ProveedoresTab() {
  const supabase = createClient()
  const [suppliers, setSuppliers] = useState<Array<{ name: string; email: string; totalPOs: number; lastDate: string; totalSpend: number }>>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')

  const load = useCallback(async () => {
    setLoading(true)
    const { data } = await supabase.from('tt_purchase_orders').select('supplier_name, supplier_email, created_at, total').order('created_at', { ascending: false })
    const map = new Map<string, { name: string; email: string; totalPOs: number; lastDate: string; totalSpend: number }>()
    for (const po of (data || [])) {
      const name = (po.supplier_name as string) || 'Sin nombre'
      const existing = map.get(name)
      if (existing) {
        existing.totalPOs++
        existing.totalSpend += (po.total as number) || 0
        if ((po.created_at as string) > existing.lastDate) existing.lastDate = po.created_at as string
      } else {
        map.set(name, { name, email: (po.supplier_email as string) || '', totalPOs: 1, lastDate: (po.created_at as string) || '', totalSpend: (po.total as number) || 0 })
      }
    }
    let result = Array.from(map.values())
    if (search) result = result.filter(s => s.name.toLowerCase().includes(search.toLowerCase()))
    setSuppliers(result)
    setLoading(false)
  }, [supabase, search])

  useEffect(() => { load() }, [load])

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        <KPICard label="Total proveedores" value={suppliers.length} icon={<Users size={22} />} />
      </div>
      <div className="bg-[#141820] rounded-xl border border-[#2A3040] p-3">
        <SearchBar placeholder="Buscar proveedor..." value={search} onChange={setSearch} className="flex-1" />
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-20"><Loader2 className="animate-spin text-[#FF6600]" size={32} /></div>
      ) : suppliers.length === 0 ? (
        <div className="text-center py-20 text-[#6B7280]"><Users size={48} className="mx-auto mb-3 opacity-30" /><p>No hay proveedores</p></div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
          {suppliers.map((s) => (
            <div
              key={s.name}
              className="bg-[#141820] rounded-xl border border-[#2A3040] p-4 hover:border-[#FF6600]/50 transition-all"
            >
              <div className="flex items-start gap-3">
                <div className="w-10 h-10 rounded-lg bg-[#F59E0B]/20 flex items-center justify-center shrink-0">
                  <Users size={16} className="text-[#F59E0B]" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-[#F0F2F5] truncate">{s.name}</p>
                  <p className="text-[10px] text-[#6B7280]">{s.email || 'Sin email'}</p>
                </div>
                <div className="text-right shrink-0">
                  <p className="text-sm font-bold text-[#FF6600]">{formatCurrency(s.totalSpend)}</p>
                  <p className="text-[10px] text-[#6B7280]">{s.totalPOs} OCs</p>
                </div>
              </div>
              <div className="mt-3 pt-3 border-t border-[#1E2330] flex items-center justify-between text-[10px] text-[#6B7280]">
                <span>Ultimo pedido: {s.lastDate ? formatDate(s.lastDate) : '-'}</span>
                <Badge variant="info">{s.totalPOs} ordenes</Badge>
              </div>
            </div>
          ))}
        </div>
      )}
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
    let q = supabase.from('tt_purchase_orders').select('*').order('created_at', { ascending: false })
    if (statusFilter) q = q.eq('status', statusFilter)
    if (search) q = q.ilike('supplier_name', `%${search}%`)
    const { data } = await q
    setOrders(data || [])
    setLoading(false)
  }, [supabase, statusFilter, search])

  useEffect(() => { load() }, [load])

  const loadProducts = async () => {
    const { data } = await supabase.from('tt_products').select('id, sku, name, cost_price').order('name').limit(500)
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
    const { data } = await supabase.from('tt_po_items').select('*').eq('purchase_order_id', po.id).order('sort_order')
    setPOItems(data || [])
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

  // Detail view using DocumentDetailLayout
  if (selectedPO && !showReceive) {
    const st = (selectedPO.status as string) || 'draft'
    const supplierName = (selectedPO.supplier_name as string) || 'Sin proveedor'

    const totalOrdered = poItems.reduce((s, it) => s + ((it.quantity as number) || 0), 0)
    const totalReceived = poItems.reduce((s, it) => s + ((it.qty_received as number) || 0), 0)
    const receivedPct = totalOrdered > 0 ? Math.round((totalReceived / totalOrdered) * 100) : 0

    const docItems: DocumentItem[] = poItems.map((it, idx) => {
      const ordered = (it.quantity as number) || 0
      const received = (it.qty_received as number) || 0
      const isDone = received >= ordered
      return {
        id: (it.id as string) || `pi-${idx}`,
        sku: (it.sku as string) || '',
        description: (it.description as string) || '',
        quantity: ordered,
        unit_price: (it.unit_cost as number) || 0,
        subtotal: (it.line_total as number) || 0,
        qty_delivered: received,
        qty_invoiced: 0, qty_reserved: 0,
        status: isDone ? 'completed' : received > 0 ? 'partial' : 'pending',
        statusColor: isDone ? '#00C853' : received > 0 ? '#FFB300' : '#6B7280',
        statusLabel: isDone ? 'Recibido' : received > 0 ? 'Parcial' : 'Pendiente',
        stockAvailable: 0, stockReserved: 0, stockIndicator: 'ok' as const,
        requires_po: false, hasComponents: false,
      }
    })

    const alerts = st === 'sent' && selectedPO.created_at ? (() => {
      const daysSince = Math.floor((Date.now() - new Date(selectedPO.created_at as string).getTime()) / (1000 * 60 * 60 * 24))
      if (daysSince > 14) return [{
        id: 'overdue-alert', type: 'po_overdue', severity: 'warning' as const,
        title: `OC enviada hace ${daysSince} dias sin confirmacion`,
        description: `Verificar con ${supplierName} el estado del envio.`,
        status: 'active',
      }]
      return []
    })() : []

    const actionButtons = (
      <div className="flex gap-2 mt-4">
        {st === 'draft' && (
          <Button variant="secondary" onClick={() => changeStatus(selectedPO.id as string, 'sent')}><Send size={14} /> Marcar Enviada</Button>
        )}
        {(st === 'sent' || st === 'partial') && (
          <Button variant="secondary" onClick={() => openReceive(selectedPO)}><Truck size={14} /> Registrar Recepcion</Button>
        )}
        {st === 'received' && (
          <Button variant="secondary" onClick={() => changeStatus(selectedPO.id as string, 'closed')}><CheckCircle size={14} /> Cerrar OC</Button>
        )}
      </div>
    )

    return (
      <DocumentDetailLayout
        workflowSteps={buildPOWorkflow(selectedPO)}
        document={{
          id: selectedPO.id as string, type: 'pap',
          system_code: `PAP-${(selectedPO.id as string).slice(0, 8).toUpperCase()}`,
          display_ref: `Compra ${supplierName}`,
          status: st, currency: 'EUR',
          total: (selectedPO.total as number) || 0,
          subtotal: (selectedPO.total as number) || 0,
          tax_amount: 0,
          created_at: (selectedPO.created_at as string) || new Date().toISOString(),
        }}
        alerts={alerts}
        deliveryProgress={{
          clientName: supplierName,
          deliveredPct: receivedPct,
          invoicedPct: 0, collectedPct: 0,
          ocRef: supplierName,
          itemStatuses: docItems.map((i) => ({ label: i.statusLabel, color: i.statusColor })),
        }}
        trackingSummary={[
          { label: 'Proveedor', value: supplierName, color: '#F0F2F5' },
          { label: 'Items', value: poItems.length, color: '#F0F2F5' },
          { label: 'Recibido', value: `${receivedPct}%`, color: receivedPct >= 100 ? '#00C853' : '#FFB300' },
        ]}
        overallProgress={receivedPct}
        notes={[]}
        onAddNote={() => {}}
        onBack={() => setSelectedPO(null)}
        backLabel="Volver a pedidos de compra"
      >
        <DocumentItemsTree items={docItems} components={[]} showStock={false} />
        {actionButtons}
      </DocumentDetailLayout>
    )
  }

  const totalPOs = orders.length
  const draftCount = orders.filter(o => o.status === 'draft').length
  const pendingCount = orders.filter(o => o.status === 'sent' || o.status === 'partial').length
  const totalVal = orders.reduce((s, o) => s + ((o.total as number) || 0), 0)

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <Button onClick={() => { setShowCreate(true); loadProducts() }}><Plus size={16} /> Nueva OC</Button>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <KPICard label="Total OCs" value={totalPOs} icon={<ShoppingCart size={22} />} />
        <KPICard label="Borradores" value={draftCount} icon={<FileText size={22} />} color="#6B7280" />
        <KPICard label="Pendientes" value={pendingCount} icon={<Clock size={22} />} color="#F59E0B" />
        <KPICard label="Valor total" value={formatCurrency(totalVal)} icon={<Package size={22} />} color="#10B981" />
      </div>
      <div className="bg-[#141820] rounded-xl border border-[#2A3040] p-3">
        <div className="flex flex-col sm:flex-row gap-3">
          <SearchBar placeholder="Buscar proveedor..." value={search} onChange={setSearch} className="flex-1" />
          <Select options={[{ value: '', label: 'Todos' }, ...Object.entries(PO_STATUS).map(([k, v]) => ({ value: k, label: v.label }))]} value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} />
        </div>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-20"><Loader2 className="animate-spin text-[#FF6600]" size={32} /></div>
      ) : orders.length === 0 ? (
        <div className="text-center py-20 text-[#6B7280]"><ShoppingCart size={48} className="mx-auto mb-3 opacity-30" /><p>No hay ordenes de compra</p></div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
          {orders.map((po) => {
            const st = (po.status as string) || 'draft'
            return (
              <DocumentListCard
                key={po.id as string} type="pap"
                systemCode={`PAP-${(po.id as string).slice(0, 8).toUpperCase()}`}
                clientName={(po.supplier_name as string) || 'Sin proveedor'}
                date={po.created_at ? formatDate(po.created_at as string) : '-'}
                total={(po.total as number) || 0} currency="EUR"
                status={st} statusLabel={PO_STATUS[st]?.label || st}
                onClick={() => openDetail(po)}
              />
            )
          })}
        </div>
      )}

      {/* CREATE MODAL */}
      <Modal isOpen={showCreate} onClose={() => setShowCreate(false)} title="Nueva Orden de Compra" size="xl">
        <div className="space-y-4">
          <Input label="Proveedor" value={supplier} onChange={(e) => setSupplier(e.target.value)} placeholder="Nombre del proveedor" />
          <div>
            <div className="flex items-center justify-between mb-2"><span className="text-sm font-medium text-[#9CA3AF]">Productos</span><Button variant="ghost" size="sm" onClick={() => setLines([...lines, { product_id: '', name: '', quantity: 1, unit_cost: 0 }])}><Plus size={14} /> Agregar</Button></div>
            {lines.map((l, i) => (
              <div key={i} className="flex gap-2 mb-2 items-end">
                <div className="flex-1"><Select options={products.map(p => ({ value: p.id as string, label: `${p.sku || ''} - ${p.name}` }))} value={l.product_id} onChange={(e) => { const u = [...lines]; const p = products.find(pr => pr.id === e.target.value); if (p) { u[i] = { ...u[i], product_id: p.id as string, name: (p.name || '') as string, unit_cost: (p.cost_price || 0) as number } }; setLines(u) }} placeholder="Producto" /></div>
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

      {/* RECEIVE MODAL */}
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
  const [receptions, setReceptions] = useState<Row[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    (async () => {
      setLoading(true)
      const { data } = await supabase.from('tt_purchase_orders').select('*').in('status', ['partial', 'received']).order('updated_at', { ascending: false })
      setReceptions(data || [])
      setLoading(false)
    })()
  }, [])

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <KPICard label="Recepciones" value={receptions.length} icon={<Truck size={22} />} />
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-20"><Loader2 className="animate-spin text-[#FF6600]" size={32} /></div>
      ) : receptions.length === 0 ? (
        <div className="text-center py-20 text-[#6B7280]"><Truck size={48} className="mx-auto mb-3 opacity-30" /><p>No hay recepciones registradas</p></div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
          {receptions.map((r) => {
            const st = (r.status as string) || 'partial'
            return (
              <DocumentListCard
                key={r.id as string} type="recepcion"
                systemCode={`REC-${(r.id as string).slice(0, 8).toUpperCase()}`}
                clientName={(r.supplier_name as string) || 'Sin proveedor'}
                date={r.updated_at ? formatDate(r.updated_at as string) : '-'}
                total={(r.total as number) || 0} currency="EUR"
                status={st} statusLabel={st === 'received' ? 'Completa' : 'Parcial'}
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
// FACTURAS COMPRA TAB
// ===============================================================
function FacturasCompraTab() {
  const supabase = createClient()
  const [invoices, setInvoices] = useState<Row[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')

  const load = useCallback(async () => {
    setLoading(true)
    let q = supabase.from('tt_invoices').select('*').eq('type', 'purchase').order('created_at', { ascending: false })
    if (search) q = q.ilike('doc_number', `%${search}%`)
    const { data } = await q
    setInvoices(data || [])
    setLoading(false)
  }, [supabase, search])

  useEffect(() => { load() }, [load])

  const totalAmount = invoices.reduce((s, i) => s + ((i.total as number) || 0), 0)

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <KPICard label="Facturas de compra" value={invoices.length} icon={<FileCheck size={22} />} />
        <KPICard label="Monto total" value={formatCurrency(totalAmount)} icon={<DollarSign size={22} />} color="#EF4444" />
      </div>
      <div className="bg-[#141820] rounded-xl border border-[#2A3040] p-3">
        <SearchBar placeholder="Buscar factura de compra..." value={search} onChange={setSearch} className="flex-1" />
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-20"><Loader2 className="animate-spin text-[#FF6600]" size={32} /></div>
      ) : invoices.length === 0 ? (
        <div className="text-center py-20 text-[#6B7280]"><FileCheck size={48} className="mx-auto mb-3 opacity-30" /><p>No hay facturas de compra</p></div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
          {invoices.map((inv) => {
            const st = (inv.status as string) || 'pending'
            return (
              <DocumentListCard
                key={inv.id as string} type="factura_compra"
                systemCode={(inv.doc_number as string) || '-'}
                clientName="Factura proveedor"
                date={inv.created_at ? formatDate(inv.created_at as string) : '-'}
                total={(inv.total as number) || 0} currency="EUR"
                status={st} statusLabel={st === 'paid' ? 'Pagada' : st}
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
export default function ComprasPage() {
  return (
    <div className="space-y-6 animate-fade-in">
      <div>
        <h1 className="text-2xl font-bold text-[#F0F2F5]">Compras</h1>
        <p className="text-sm text-[#6B7280] mt-1">Proveedores, ordenes de compra, recepciones y facturas</p>
      </div>
      <Suspense fallback={<div className="flex justify-center py-10"><Loader2 className="animate-spin text-[#FF6600]" size={32} /></div>}>
        <Tabs tabs={comprasTabs} defaultTab="proveedores">
          {(activeTab) => (
            <>
              {activeTab === 'proveedores' && <ProveedoresTab />}
              {activeTab === 'pedidos' && <PedidosCompraTab />}
              {activeTab === 'recepciones' && <RecepcionesTab />}
              {activeTab === 'facturas' && <FacturasCompraTab />}
            </>
          )}
        </Tabs>
      </Suspense>
    </div>
  )
}
