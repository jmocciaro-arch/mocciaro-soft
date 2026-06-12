'use client'

import { useState, useEffect, useCallback, useMemo, useRef } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { useCompanyFilter } from '@/hooks/use-company-filter'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Select } from '@/components/ui/select'
import { Modal } from '@/components/ui/modal'
import { useToast } from '@/components/ui/toast'
import { DataTable, type DataTableColumn } from '@/components/ui/data-table'
import { DocumentForm } from '@/components/workflow/document-form'
import { documentToTableRow, localPOToRow } from '@/lib/document-helpers'
import { Plus, X, CheckCircle } from 'lucide-react'

type Row = Record<string, unknown>

function getClientName(doc: Row): string {
  const client = doc.client as Row | undefined
  if (!client) return 'Sin proveedor'
  return (client.legal_name as string) || (client.name as string) || 'Sin proveedor'
}

function getSupplierName(po: Row): string {
  const supplier = po.supplier as Row | undefined
  if (supplier) return (supplier.legal_name as string) || (supplier.name as string) || 'Sin proveedor'
  return (po.supplier_name as string) || 'Sin proveedor'
}

export function PedidosCompraTab() {
  const { filterByCompany, companyKey } = useCompanyFilter()
  const supabase = createClient()
  const router = useRouter()
  const searchParams = useSearchParams()
  const { addToast } = useToast()
  const [orders, setOrders] = useState<Row[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [statusFilter] = useState('')
  const [showCreate, setShowCreate] = useState(false)
  const [showReceive, setShowReceive] = useState(false)
  const [selectedPO, setSelectedPO] = useState<Row | null>(null)
  const [supplier, setSupplier] = useState('')
  const [notesText, setNotesText] = useState('')
  const [lines, setLines] = useState<Array<{ product_id: string; name: string; quantity: number; unit_cost: number }>>([])
  const [products, setProducts] = useState<Array<Row>>([])
  const [saving, setSaving] = useState(false)
  const [rcvLines, setRcvLines] = useState<Array<{ id: string; product_id: string | null; desc: string; ordered: number; received: number; toReceive: number }>>([])

  const load = useCallback(async () => {
    setLoading(true)
    const sb = createClient()
    let qDoc = sb.from('tt_documents').select('*, client:tt_clients(id, name, legal_name)')
      .eq('doc_type', 'pap')
      .order('created_at', { ascending: false })
      .range(0, 99)
    qDoc = filterByCompany(qDoc)
    if (statusFilter) qDoc = qDoc.eq('status', statusFilter)
    if (search) qDoc = qDoc.or(`display_ref.ilike.%${search}%,system_code.ilike.%${search}%`)
    const { data: docData } = await qDoc

    let qLocal = sb.from('tt_purchase_orders')
      .select('*, supplier:tt_suppliers(id, name, legal_name)')
      .order('created_at', { ascending: false })
    qLocal = filterByCompany(qLocal)
    if (statusFilter) qLocal = qLocal.eq('status', statusFilter)
    if (search) qLocal = qLocal.ilike('supplier_name', `%${search}%`)
    const { data: localData } = await qLocal

    const localMapped = (localData || []).map((o: Row) => ({
      ...o, _source: 'local' as const,
      supplier_name: getSupplierName(o),
    }))
    const docMapped = (docData || []).map((d: Row) => ({
      ...d, _source: 'tt_documents' as const,
      supplier_name: getClientName(d),
    }))
    setOrders([...localMapped, ...docMapped])
    setLoading(false)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [statusFilter, search, companyKey])

  useEffect(() => { load() }, [load])

  const loadProducts = async () => {
    const { data } = await supabase.from('tt_products').select('id, sku, name, cost_eur').order('name').limit(500)
    setProducts(data || [])
  }

  const paramsHandledRef = useRef(false)
  useEffect(() => {
    if (paramsHandledRef.current) return
    const raw = searchParams.get('newWithProducts')
    if (!raw) return
    paramsHandledRef.current = true
    try {
      const items = JSON.parse(decodeURIComponent(raw)) as Array<{ sku: string; qty: number }>
      if (!Array.isArray(items) || items.length === 0) return
      ;(async () => {
        const skus = items.map(i => i.sku).filter(Boolean)
        const { data: prods } = await supabase.from('tt_products').select('id, sku, name, cost_eur').in('sku', skus)
        setProducts(prods || [])
        const preLines = items.map((it) => {
          const p = (prods || []).find((pp: Row) => (pp.sku as string) === it.sku)
          return {
            product_id: (p?.id as string) || '',
            name: (p?.name as string) || it.sku,
            quantity: it.qty || 1,
            unit_cost: (p?.cost_eur as number) || 0,
          }
        })
        setLines(preLines)
        setShowCreate(true)
        router.replace('/compras?tab=pedidos')
      })()
    } catch (e) {
      console.error('newWithProducts parse error', e)
    }
  }, [searchParams, supabase, router])

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
  }

  const openReceive = async (po: Row) => {
    setSelectedPO(po)
    const { data } = await supabase.from('tt_po_items').select('*').eq('purchase_order_id', po.id).order('sort_order')
    setRcvLines((data || []).map((it: Row) => ({
      id: it.id as string,
      product_id: (it.product_id as string | null) || null,
      desc: (it.description || '') as string,
      ordered: (it.quantity || 0) as number,
      received: (it.qty_received || 0) as number,
      toReceive: 0,
    })))
    setShowReceive(true)
  }

  const handleReceive = async () => {
    if (!selectedPO) return
    const linesToReceive = rcvLines.filter((l) => l.toReceive > 0)
    if (linesToReceive.length === 0) {
      addToast({ type: 'warning', title: 'Marcá al menos una línea con cantidad a recibir' })
      return
    }
    const poCompanyId = (selectedPO as Row & { company_id?: string | null }).company_id || null
    let primaryWarehouseId: string | null = null
    if (poCompanyId) {
      const { data: wh } = await supabase
        .from('tt_warehouses')
        .select('id').eq('company_id', poCompanyId).eq('active', true)
        .order('created_at', { ascending: true }).limit(1).maybeSingle()
      primaryWarehouseId = (wh?.id as string) || null
    }
    for (const l of linesToReceive) {
      await supabase.from('tt_po_items').update({ qty_received: l.received + l.toReceive }).eq('id', l.id)
    }
    const poNumber = (selectedPO as Row & { number?: string; po_number?: string }).number
                   || (selectedPO as Row & { po_number?: string }).po_number
                   || (selectedPO.id as string).slice(0, 8)
    let stockMovementsLogged = 0
    let stockSkipped = 0
    for (const l of linesToReceive) {
      if (!l.product_id || !primaryWarehouseId) { stockSkipped++; continue }
      try {
        await supabase.from('tt_stock_movements').insert({
          product_id: l.product_id,
          warehouse_id: primaryWarehouseId,
          movement_type: 'entrada',
          quantity: l.toReceive,
          document_id: selectedPO.id,
          document_item_id: l.id,
          reference: `Recepción OC ${poNumber}`,
        })
        const { data: existing } = await supabase
          .from('tt_stock')
          .select('id, quantity')
          .eq('product_id', l.product_id)
          .eq('warehouse_id', primaryWarehouseId)
          .maybeSingle()
        if (existing) {
          await supabase.from('tt_stock').update({ quantity: (Number(existing.quantity) || 0) + l.toReceive }).eq('id', existing.id as string)
        } else {
          await supabase.from('tt_stock').insert({ product_id: l.product_id, warehouse_id: primaryWarehouseId, quantity: l.toReceive, reserved: 0 })
        }
        stockMovementsLogged++
      } catch (err) {
        console.error(`Stock update falló para item ${l.id}`, err)
        stockSkipped++
      }
    }
    const { data: items } = await supabase.from('tt_po_items').select('quantity, qty_received').eq('purchase_order_id', selectedPO.id)
    const allDone = (items || []).every((i: Row) => (i.qty_received as number) >= (i.quantity as number))
    const someDone = (items || []).some((i: Row) => (i.qty_received as number) > 0)
    const st = allDone ? 'received' : someDone ? 'partial' : (selectedPO.status as string)
    await supabase.from('tt_purchase_orders').update({ status: st }).eq('id', selectedPO.id)
    const stockMsg = stockMovementsLogged > 0
      ? `${stockMovementsLogged} ítem(s) sumados al stock`
      : stockSkipped > 0
        ? `Recepción OK — ${stockSkipped} ítem(s) sin actualizar stock (falta product_id o warehouse)`
        : 'Recepción OK'
    addToast({ type: 'success', title: 'Recepción registrada', message: stockMsg })
    setShowReceive(false); setSelectedPO(null); load()
  }

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

  if (selectedPO && !showReceive) {
    const src = (selectedPO as Row & { _source?: string })._source === 'tt_documents' ? 'tt_documents' : 'local' as const
    const allIds = orders.map(o => o.id as string)
    const isLocalPO = src === 'local'
    const poStatus = (selectedPO.status as string) || ''
    const canReceive = isLocalPO && !['received', 'cancelled', 'draft'].includes(poStatus)
    return (
      <div className="space-y-3">
        {canReceive && (
          <div className="flex justify-end gap-2 p-3 rounded-lg bg-[#0F1218] border border-[#1E2330]">
            <Button variant="primary" size="sm" onClick={() => { const po = selectedPO; setSelectedPO(null); openReceive(po) }}>
              <CheckCircle size={14} /> Recibir mercadería
            </Button>
          </div>
        )}
        <DocumentForm
          documentId={selectedPO.id as string}
          documentType="pap"
          source={src}
          onBack={() => { setSelectedPO(null); load() }}
          onUpdate={load}
          siblingIds={allIds}
        />
      </div>
    )
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
