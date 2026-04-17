'use client'

import { useState, useEffect, useRef, useCallback, Suspense, useMemo } from 'react'
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card'
import { SearchBar } from '@/components/ui/search-bar'
import { Badge } from '@/components/ui/badge'
import { Select } from '@/components/ui/select'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Modal } from '@/components/ui/modal'
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from '@/components/ui/table'
import { KPICard } from '@/components/ui/kpi-card'
import { Tabs } from '@/components/ui/tabs'
import { DataTable } from '@/components/ui/data-table'
import type { DataTableColumn } from '@/components/ui/data-table'
import { useToast } from '@/components/ui/toast'
import { createClient } from '@/lib/supabase/client'
import { formatDate, formatCurrency } from '@/lib/utils'
import type { Warehouse } from '@/types'
import { ExportButton } from '@/components/ui/export-button'
import { ImportButton } from '@/components/ui/import-button'
import {
  Package, AlertTriangle, XCircle, CheckCircle, Loader2,
  ArrowLeftRight, Warehouse as WarehouseIcon, Activity, TrendingUp,
  Plus, ClipboardEdit, Search
} from 'lucide-react'

type Row = Record<string, unknown>

interface StockRow {
  id: string; quantity: number; reserved: number; min_quantity: number
  product_id: string; product_sku: string; product_name: string; product_brand: string
  warehouse_id: string; warehouse_name: string; warehouse_code: string
  // Virtual stock fields
  pending_reception: number; pending_delivery: number; stock_virtual: number
}

interface MovementRow {
  id: string
  product_id: string
  warehouse_id: string
  movement_type: string
  quantity: number
  quantity_before: number
  quantity_after: number
  reference: string
  notes: string
  created_by: string
  created_at: string
  product_name: string
  product_sku: string
  warehouse_name: string
}

const stockTabs = [
  { id: 'inventario', label: 'Inventario', icon: <Package size={16} /> },
  { id: 'movimientos', label: 'Movimientos', icon: <Activity size={16} /> },
  { id: 'traspasos', label: 'Traspasos', icon: <ArrowLeftRight size={16} /> },
  { id: 'almacenes', label: 'Almacenes', icon: <WarehouseIcon size={16} /> },
]

// ═══════════════════════════════════════════════════════
// MOVEMENT TYPE BADGE
// ═══════════════════════════════════════════════════════
function MovementTypeBadge({ type }: { type: string }) {
  const variants: Record<string, 'success' | 'danger' | 'info' | 'warning'> = {
    entrada: 'success',
    salida: 'danger',
    ajuste: 'info',
    traspaso: 'warning',
  }
  return <Badge variant={variants[type] || 'default'}>{type.toUpperCase()}</Badge>
}

// ═══════════════════════════════════════════════════════
// INVENTARIO TAB
// ═══════════════════════════════════════════════════════
function InventarioTab() {
  const [stockItems, setStockItems] = useState<StockRow[]>([])
  const [warehouses, setWarehouses] = useState<Warehouse[]>([])
  const [brands, setBrands] = useState<string[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [warehouseFilter, setWarehouseFilter] = useState('')
  const [brandFilter, setBrandFilter] = useState('')
  const debounceRef = useRef<NodeJS.Timeout | null>(null)
  const [kpis, setKpis] = useState({ total: 0, inStock: 0, lowStock: 0, outOfStock: 0, virtualTotal: 0 })

  // Ajuste de stock modal state
  const [showAjusteModal, setShowAjusteModal] = useState(false)
  const [ajusteSearch, setAjusteSearch] = useState('')
  const [ajusteResults, setAjusteResults] = useState<Row[]>([])
  const [ajusteSearching, setAjusteSearching] = useState(false)
  const [ajusteProduct, setAjusteProduct] = useState<Row | null>(null)
  const [ajusteWarehouse, setAjusteWarehouse] = useState('')
  const [ajusteType, setAjusteType] = useState<'entrada' | 'salida' | 'ajuste'>('entrada')
  const [ajusteQty, setAjusteQty] = useState(1)
  const [ajusteNotes, setAjusteNotes] = useState('')
  const [ajusteSubmitting, setAjusteSubmitting] = useState(false)
  const ajusteDebounceRef = useRef<NodeJS.Timeout | null>(null)
  const { addToast } = useToast()

  // Alertas section toggle
  const [showAlertas, setShowAlertas] = useState(false)

  useEffect(() => { loadWarehouses() }, [])
  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(() => { loadStock() }, 300)
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current) }
  }, [search, warehouseFilter, brandFilter])

  async function loadWarehouses() {
    const supabase = createClient()
    const { data } = await supabase.from('tt_warehouses').select('*').eq('active', true).order('name')
    setWarehouses((data || []) as Warehouse[])
  }

  const loadStock = useCallback(async () => {
    const sb = createClient()
    setLoading(true)
    try {
      // Query tt_stock with virtual stock data from tt_stock_virtual
      let query = sb.from('tt_stock').select(`id, product_id, warehouse_id, quantity, reserved, min_quantity, product:tt_products(sku, name, brand), warehouse:tt_warehouses(name, code)`).order('quantity', { ascending: true })
      if (warehouseFilter) query = query.eq('warehouse_id', warehouseFilter)
      const { data } = await query

      // Also fetch virtual stock data
      let virtualQuery = sb.from('tt_stock_virtual').select('product_id, warehouse_id, stock_real, reserved, disponible, pending_reception, pending_delivery, stock_virtual, min_quantity')
      if (warehouseFilter) virtualQuery = virtualQuery.eq('warehouse_id', warehouseFilter)
      const { data: virtualData } = await virtualQuery

      // Build a lookup map for virtual stock
      const virtualMap = new Map<string, { pending_reception: number; pending_delivery: number; stock_virtual: number }>()
      if (virtualData) {
        for (const v of virtualData) {
          const key = `${v.product_id}_${v.warehouse_id}`
          virtualMap.set(key, {
            pending_reception: (v.pending_reception as number) || 0,
            pending_delivery: (v.pending_delivery as number) || 0,
            stock_virtual: (v.stock_virtual as number) || 0,
          })
        }
      }

      if (!data || data.length === 0) { setStockItems([]); setBrands([]); setKpis({ total: 0, inStock: 0, lowStock: 0, outOfStock: 0, virtualTotal: 0 }); setLoading(false); return }
      let items: StockRow[] = data.map((row: Row) => {
        const product = row.product as Record<string, string> | null
        const warehouse = row.warehouse as Record<string, string> | null
        const vKey = `${row.product_id}_${row.warehouse_id}`
        const virtual = virtualMap.get(vKey)
        return {
          id: row.id as string,
          product_id: row.product_id as string,
          warehouse_id: row.warehouse_id as string,
          quantity: row.quantity as number,
          reserved: row.reserved as number,
          min_quantity: row.min_quantity as number,
          product_sku: product?.sku || '',
          product_name: product?.name || '',
          product_brand: product?.brand || '',
          warehouse_name: warehouse?.name || '',
          warehouse_code: warehouse?.code || '',
          pending_reception: virtual?.pending_reception || 0,
          pending_delivery: virtual?.pending_delivery || 0,
          stock_virtual: virtual?.stock_virtual || (row.quantity as number) - (row.reserved as number),
        }
      })
      const uniqueBrands = [...new Set(items.map((i) => i.product_brand).filter(Boolean))]; uniqueBrands.sort(); setBrands(uniqueBrands)
      if (brandFilter) items = items.filter((i) => i.product_brand === brandFilter)
      if (search.trim()) { const q = search.toLowerCase(); items = items.filter((i) => i.product_sku.toLowerCase().includes(q) || i.product_name.toLowerCase().includes(q) || i.product_brand.toLowerCase().includes(q)) }
      const virtualTotal = items.reduce((sum, i) => sum + i.stock_virtual, 0)
      setKpis({ total: items.length, inStock: items.filter((i) => i.quantity > i.min_quantity).length, lowStock: items.filter((i) => i.quantity > 0 && i.quantity <= i.min_quantity).length, outOfStock: items.filter((i) => i.quantity === 0).length, virtualTotal })
      setStockItems(items)
    } finally { setLoading(false) }
  }, [search, warehouseFilter, brandFilter])

  // Product autocomplete for ajuste modal
  useEffect(() => {
    if (ajusteDebounceRef.current) clearTimeout(ajusteDebounceRef.current)
    if (!ajusteSearch.trim() || ajusteSearch.length < 2) { setAjusteResults([]); return }
    ajusteDebounceRef.current = setTimeout(async () => {
      setAjusteSearching(true)
      const sb = createClient()
      const term = `%${ajusteSearch}%`
      const { data } = await sb.from('tt_products').select('id, sku, name, brand').eq('active', true).or(`sku.ilike.${term},name.ilike.${term}`).limit(10)
      setAjusteResults(data || [])
      setAjusteSearching(false)
    }, 300)
    return () => { if (ajusteDebounceRef.current) clearTimeout(ajusteDebounceRef.current) }
  }, [ajusteSearch])

  const handleAjusteSubmit = useCallback(async () => {
    if (!ajusteProduct || !ajusteWarehouse || ajusteQty <= 0) {
      addToast({ type: 'warning', title: 'Completa todos los campos' }); return
    }
    setAjusteSubmitting(true)
    try {
      const sb = createClient()
      const productId = ajusteProduct.id as string

      // Get current stock
      const { data: current } = await sb
        .from('tt_stock')
        .select('id, quantity')
        .eq('product_id', productId)
        .eq('warehouse_id', ajusteWarehouse)
        .single()

      const qtyBefore = current ? (current.quantity as number) : 0
      let qtyAfter = qtyBefore

      if (ajusteType === 'entrada') {
        qtyAfter = qtyBefore + ajusteQty
      } else if (ajusteType === 'salida') {
        if (ajusteQty > qtyBefore) {
          addToast({ type: 'error', title: 'Stock insuficiente', message: `Stock actual: ${qtyBefore}` })
          setAjusteSubmitting(false); return
        }
        qtyAfter = qtyBefore - ajusteQty
      } else {
        // ajuste: set directly
        qtyAfter = ajusteQty
      }

      // Update or create stock record
      if (current) {
        await sb.from('tt_stock').update({ quantity: qtyAfter }).eq('id', current.id)
      } else {
        await sb.from('tt_stock').insert({ product_id: productId, warehouse_id: ajusteWarehouse, quantity: qtyAfter, reserved: 0, min_quantity: 0 })
      }

      // Insert movement record
      await sb.from('tt_stock_movements').insert({
        product_id: productId,
        warehouse_id: ajusteWarehouse,
        movement_type: ajusteType,
        quantity: ajusteType === 'ajuste' ? ajusteQty : ajusteQty,
        quantity_before: qtyBefore,
        quantity_after: qtyAfter,
        reference: `Ajuste manual - ${ajusteType}`,
        notes: ajusteNotes || null,
      })

      addToast({ type: 'success', title: 'Ajuste de stock realizado', message: `${qtyBefore} -> ${qtyAfter}` })
      setShowAjusteModal(false)
      resetAjusteForm()
      loadStock()
    } catch (err) {
      addToast({ type: 'error', title: 'Error al ajustar stock' })
    } finally {
      setAjusteSubmitting(false)
    }
  }, [ajusteProduct, ajusteWarehouse, ajusteType, ajusteQty, ajusteNotes, addToast, loadStock])

  function resetAjusteForm() {
    setAjusteSearch(''); setAjusteResults([]); setAjusteProduct(null)
    setAjusteWarehouse(''); setAjusteType('entrada'); setAjusteQty(1); setAjusteNotes('')
  }

  function stockBadge(qty: number, min: number) {
    if (qty === 0) return <Badge variant="danger">Sin stock</Badge>
    if (qty <= min) return <Badge variant="warning">Stock bajo</Badge>
    return <Badge variant="success">OK</Badge>
  }

  const alertItems = useMemo(() => stockItems.filter((i) => i.quantity <= i.min_quantity), [stockItems])

  return (
    <div className="space-y-4">
      {/* KPIs */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
        <KPICard label="Total items" value={kpis.total} icon={<Package size={20} />} />
        <KPICard label="En stock" value={kpis.inStock} icon={<CheckCircle size={20} />} color="#00C853" />
        <KPICard label="Stock bajo" value={kpis.lowStock} icon={<AlertTriangle size={20} />} color="#FFB300" />
        <KPICard label="Sin stock" value={kpis.outOfStock} icon={<XCircle size={20} />} color="#FF3D00" />
        <KPICard label="Stock Virtual Total" value={kpis.virtualTotal} icon={<TrendingUp size={20} />} color="#3B82F6" />
      </div>

      {/* Toolbar */}
      <Card>
        <div className="flex flex-col md:flex-row gap-4 items-start md:items-center justify-between">
          <SearchBar value={search} onChange={setSearch} placeholder="Buscar por SKU, nombre o marca..." className="flex-1" />
          <div className="flex flex-wrap gap-2">
            <Button onClick={() => setShowAjusteModal(true)}>
              <ClipboardEdit size={14} /> Ajuste de Stock
            </Button>
            <Select value={warehouseFilter} onChange={(e) => setWarehouseFilter(e.target.value)} options={warehouses.map((w) => ({ value: w.id, label: `${w.name} (${w.code})` }))} placeholder="Todos los almacenes" />
            <Select value={brandFilter} onChange={(e) => setBrandFilter(e.target.value)} options={brands.map((b) => ({ value: b, label: b }))} placeholder="Todas las marcas" />
            <ExportButton
              data={stockItems as unknown as Record<string, unknown>[]}
              filename="stock_torquetools"
              targetTable="tt_stock"
              columns={[
                { key: 'product_sku', label: 'SKU' },
                { key: 'product_name', label: 'Producto' },
                { key: 'product_brand', label: 'Marca' },
                { key: 'warehouse_name', label: 'Almacen' },
                { key: 'quantity', label: 'Cantidad' },
                { key: 'reserved', label: 'Reservado' },
                { key: 'min_quantity', label: 'Stock Minimo' },
                { key: 'pending_reception', label: 'Pte. Recibir' },
                { key: 'pending_delivery', label: 'Pte. Entregar' },
                { key: 'stock_virtual', label: 'Stock Virtual' },
              ]}
            />
            <ImportButton
              targetTable="tt_stock"
              fields={[
                { key: 'sku', label: 'SKU', required: true },
                { key: 'warehouse_code', label: 'Codigo Almacen', required: true },
                { key: 'quantity', label: 'Cantidad', required: true, type: 'number' },
                { key: 'min_quantity', label: 'Stock minimo', type: 'number' },
              ]}
              permission="manage_stock"
              onComplete={() => loadStock()}
            />
          </div>
        </div>
      </Card>

      {/* Alertas Section */}
      {alertItems.length > 0 && (
        <Card className="border-amber-500/30">
          <button
            onClick={() => setShowAlertas(!showAlertas)}
            className="w-full flex items-center justify-between"
          >
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-amber-500/10 flex items-center justify-center">
                <AlertTriangle size={20} className="text-amber-400" />
              </div>
              <div className="text-left">
                <h3 className="text-sm font-bold text-amber-400">Alertas de Stock</h3>
                <p className="text-xs text-[#6B7280]">{alertItems.length} producto{alertItems.length !== 1 ? 's' : ''} con stock bajo o sin stock</p>
              </div>
            </div>
            <Badge variant="warning">{alertItems.length}</Badge>
          </button>
          {showAlertas && (
            <div className="mt-4 border-t border-[#1E2330] pt-4">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>SKU</TableHead>
                    <TableHead>Producto</TableHead>
                    <TableHead>Almacen</TableHead>
                    <TableHead className="text-right">Cantidad</TableHead>
                    <TableHead className="text-right">Minimo</TableHead>
                    <TableHead>Estado</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {alertItems.map((item) => (
                    <TableRow key={item.id} className={item.quantity === 0 ? 'bg-red-500/5' : 'bg-amber-500/5'}>
                      <TableCell className="font-mono text-sm">{item.product_sku}</TableCell>
                      <TableCell className="max-w-[200px] truncate">{item.product_name}</TableCell>
                      <TableCell className="text-[#9CA3AF]">{item.warehouse_name}</TableCell>
                      <TableCell className={`text-right font-bold text-lg ${item.quantity === 0 ? 'text-red-400' : 'text-amber-400'}`}>{item.quantity}</TableCell>
                      <TableCell className="text-right text-[#6B7280]">{item.min_quantity}</TableCell>
                      <TableCell>{stockBadge(item.quantity, item.min_quantity)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </Card>
      )}

      {/* Stock Table */}
      <Card className="p-0 overflow-hidden">
        {loading ? (
          <div className="flex items-center justify-center py-16"><Loader2 size={32} className="animate-spin text-[#FF6600]" /></div>
        ) : stockItems.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-[#4B5563]"><Package size={48} className="mb-4" /><p>No hay datos de stock</p></div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>SKU</TableHead>
                <TableHead>Producto</TableHead>
                <TableHead>Marca</TableHead>
                <TableHead>Almacen</TableHead>
                <TableHead className="text-right">Cantidad</TableHead>
                <TableHead className="text-right">Reservado</TableHead>
                <TableHead className="text-right">Disponible</TableHead>
                <TableHead className="text-right">Pte. recibir</TableHead>
                <TableHead className="text-right">Pte. entregar</TableHead>
                <TableHead className="text-right">Stock Virtual</TableHead>
                <TableHead>Estado</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {stockItems.map((s) => {
                const available = s.quantity - s.reserved
                const virtualWarning = s.stock_virtual < s.min_quantity
                return (
                  <TableRow key={s.id}>
                    <TableCell className="font-mono text-sm">{s.product_sku}</TableCell>
                    <TableCell className="max-w-[200px] truncate">{s.product_name}</TableCell>
                    <TableCell><Badge>{s.product_brand}</Badge></TableCell>
                    <TableCell className="text-[#9CA3AF]">{s.warehouse_name}</TableCell>
                    <TableCell className={`text-right font-bold text-lg ${s.quantity === 0 ? 'text-red-400' : s.quantity <= s.min_quantity ? 'text-yellow-400' : 'text-green-400'}`}>{s.quantity}</TableCell>
                    <TableCell className="text-right text-[#6B7280]">{s.reserved}</TableCell>
                    <TableCell className={`text-right font-medium ${available === 0 ? 'text-red-400' : available <= s.min_quantity ? 'text-yellow-400' : 'text-green-400'}`}>{available}</TableCell>
                    <TableCell className="text-right text-emerald-400 font-medium">{s.pending_reception > 0 ? `+${s.pending_reception}` : '-'}</TableCell>
                    <TableCell className="text-right text-red-400 font-medium">{s.pending_delivery > 0 ? `-${s.pending_delivery}` : '-'}</TableCell>
                    <TableCell className={`text-right font-bold ${s.stock_virtual > 0 ? 'text-blue-400' : 'text-red-400'}`}>
                      <span className="flex items-center justify-end gap-1">
                        {virtualWarning && <AlertTriangle size={14} className="text-amber-400 shrink-0" />}
                        {s.stock_virtual}
                      </span>
                    </TableCell>
                    <TableCell>{stockBadge(s.quantity, s.min_quantity)}</TableCell>
                  </TableRow>
                )
              })}
            </TableBody>
          </Table>
        )}
      </Card>

      {/* Ajuste de Stock Modal */}
      <Modal isOpen={showAjusteModal} onClose={() => { setShowAjusteModal(false); resetAjusteForm() }} title="Ajuste de Stock" size="lg">
        <div className="space-y-5">
          {/* Product autocomplete */}
          <div>
            <label className="block text-xs font-semibold text-[#9CA3AF] mb-1.5">Producto</label>
            {ajusteProduct ? (
              <div className="flex items-center justify-between p-3 rounded-lg bg-[#1E2330] border border-[#2A3040]">
                <div>
                  <p className="text-sm font-medium text-[#F0F2F5]">{ajusteProduct.name as string}</p>
                  <p className="text-xs text-[#6B7280]">SKU: {ajusteProduct.sku as string} | {ajusteProduct.brand as string}</p>
                </div>
                <button onClick={() => { setAjusteProduct(null); setAjusteSearch('') }} className="text-[#6B7280] hover:text-red-400 transition-colors">
                  <XCircle size={18} />
                </button>
              </div>
            ) : (
              <div className="relative">
                <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-[#4B5563]" />
                <input
                  type="text"
                  value={ajusteSearch}
                  onChange={(e) => setAjusteSearch(e.target.value)}
                  placeholder="Buscar por SKU o nombre..."
                  className="w-full pl-9 pr-4 py-2.5 text-sm bg-[#0A0D12] border border-[#2A3040] rounded-lg text-[#F0F2F5] placeholder-[#4B5563] focus:outline-none focus:border-[#FF6600] transition-colors"
                />
                {ajusteSearching && <Loader2 size={14} className="absolute right-3 top-1/2 -translate-y-1/2 animate-spin text-[#FF6600]" />}
                {ajusteResults.length > 0 && !ajusteProduct && (
                  <div className="absolute z-20 top-full mt-1 w-full bg-[#141820] border border-[#2A3040] rounded-lg shadow-2xl max-h-60 overflow-y-auto">
                    {ajusteResults.map((p) => (
                      <button
                        key={p.id as string}
                        onClick={() => { setAjusteProduct(p); setAjusteSearch(''); setAjusteResults([]) }}
                        className="w-full text-left px-4 py-2.5 hover:bg-[#1E2330] transition-colors border-b border-[#1E2330] last:border-0"
                      >
                        <p className="text-sm text-[#F0F2F5]">{p.name as string}</p>
                        <p className="text-xs text-[#6B7280]">{p.sku as string} | {p.brand as string}</p>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Warehouse + Type */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Select
              label="Almacen"
              options={warehouses.map(w => ({ value: w.id, label: `${w.name} (${w.code})` }))}
              value={ajusteWarehouse}
              onChange={(e) => setAjusteWarehouse(e.target.value)}
              placeholder="Selecciona almacen"
            />
            <Select
              label="Tipo de movimiento"
              options={[
                { value: 'entrada', label: 'Entrada (+)' },
                { value: 'salida', label: 'Salida (-)' },
                { value: 'ajuste', label: 'Ajuste (=)' },
              ]}
              value={ajusteType}
              onChange={(e) => setAjusteType(e.target.value as 'entrada' | 'salida' | 'ajuste')}
              placeholder="Tipo"
            />
          </div>

          {/* Quantity + Notes */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Input
              label={ajusteType === 'ajuste' ? 'Nueva cantidad' : 'Cantidad'}
              type="number"
              min={ajusteType === 'ajuste' ? 0 : 1}
              value={ajusteQty}
              onChange={(e) => setAjusteQty(Number(e.target.value))}
            />
            <Input
              label="Motivo / Notas"
              value={ajusteNotes}
              onChange={(e) => setAjusteNotes(e.target.value)}
              placeholder="Motivo del ajuste..."
            />
          </div>

          {/* Submit */}
          <div className="flex justify-end gap-3 pt-2">
            <Button onClick={() => { setShowAjusteModal(false); resetAjusteForm() }} className="bg-[#1E2330] hover:bg-[#2A3040] text-[#9CA3AF]">
              Cancelar
            </Button>
            <Button onClick={handleAjusteSubmit} disabled={ajusteSubmitting}>
              {ajusteSubmitting ? <Loader2 size={14} className="animate-spin" /> : <CheckCircle size={14} />}
              Confirmar Ajuste
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  )
}

// ═══════════════════════════════════════════════════════
// MOVIMIENTOS TAB
// ═══════════════════════════════════════════════════════
function MovimientosTab() {
  const [movements, setMovements] = useState<Record<string, unknown>[]>([])
  const [loading, setLoading] = useState(true)

  const loadMovements = useCallback(async () => {
    const sb = createClient()
    setLoading(true)
    try {
      const { data } = await sb
        .from('tt_stock_movements')
        .select(`id, product_id, warehouse_id, movement_type, quantity, quantity_before, quantity_after, reference, notes, created_by, created_at, product:tt_products(sku, name), warehouse:tt_warehouses(name, code)`)
        .order('created_at', { ascending: false })
        .limit(500)

      const rows = (data || []).map((row: Row) => {
        const product = row.product as Record<string, string> | null
        const warehouse = row.warehouse as Record<string, string> | null
        return {
          id: row.id,
          product_id: row.product_id,
          warehouse_id: row.warehouse_id,
          movement_type: row.movement_type,
          quantity: row.quantity,
          quantity_before: row.quantity_before,
          quantity_after: row.quantity_after,
          reference: row.reference || '',
          notes: row.notes || '',
          created_by: row.created_by || '',
          created_at: row.created_at,
          product_name: product?.name || '',
          product_sku: product?.sku || '',
          warehouse_name: warehouse?.name || '',
        }
      })
      setMovements(rows)
    } finally { setLoading(false) }
  }, [])

  useEffect(() => { loadMovements() }, [loadMovements])

  const columns: DataTableColumn[] = useMemo(() => [
    {
      key: 'created_at',
      label: 'Fecha',
      sortable: true,
      type: 'date',
      width: '140px',
    },
    {
      key: 'movement_type',
      label: 'Tipo',
      sortable: true,
      searchable: true,
      width: '110px',
      render: (value: unknown) => <MovementTypeBadge type={String(value || '')} />,
    },
    {
      key: 'product_sku',
      label: 'SKU',
      sortable: true,
      searchable: true,
      width: '130px',
      render: (value: unknown) => <span className="font-mono text-xs text-[#D1D5DB]">{String(value || '')}</span>,
    },
    {
      key: 'product_name',
      label: 'Producto',
      sortable: true,
      searchable: true,
    },
    {
      key: 'warehouse_name',
      label: 'Almacen',
      sortable: true,
      searchable: true,
      width: '140px',
    },
    {
      key: 'quantity',
      label: 'Cantidad',
      sortable: true,
      type: 'number',
      width: '100px',
      render: (value: unknown, row: Record<string, unknown>) => {
        const type = row.movement_type as string
        const color = type === 'entrada' ? 'text-green-400' : type === 'salida' ? 'text-red-400' : 'text-blue-400'
        const prefix = type === 'entrada' ? '+' : type === 'salida' ? '-' : ''
        return <span className={`font-bold ${color}`}>{prefix}{String(value || 0)}</span>
      },
    },
    {
      key: 'quantity_before',
      label: 'Antes',
      sortable: true,
      type: 'number',
      width: '80px',
    },
    {
      key: 'quantity_after',
      label: 'Despues',
      sortable: true,
      type: 'number',
      width: '80px',
    },
    {
      key: 'reference',
      label: 'Referencia',
      searchable: true,
    },
    {
      key: 'notes',
      label: 'Notas',
      searchable: true,
      render: (value: unknown) => (
        <span className="text-xs text-[#6B7280] max-w-[200px] truncate block">{String(value || '')}</span>
      ),
    },
  ], [])

  return (
    <div className="space-y-4">
      <KPICard label="Movimientos registrados" value={movements.length} icon={<Activity size={22} />} />
      <DataTable
        data={movements}
        columns={columns}
        loading={loading}
        pageSize={25}
        totalLabel="movimientos"
        exportFilename="movimientos_stock"
        exportTargetTable="tt_stock_movements"
      />
    </div>
  )
}

// ═══════════════════════════════════════════════════════
// TRASPASOS TAB
// ═══════════════════════════════════════════════════════
function TraspasosTab() {
  const supabase = createClient()
  const { addToast } = useToast()
  const [warehouses, setWarehouses] = useState<Warehouse[]>([])
  const [products, setProducts] = useState<Row[]>([])
  const [loading, setLoading] = useState(true)
  const [originWH, setOriginWH] = useState('')
  const [destWH, setDestWH] = useState('')
  const [selectedProduct, setSelectedProduct] = useState('')
  const [quantity, setQuantity] = useState(1)
  const [transferring, setTransferring] = useState(false)

  // Recent traspasos
  const [recentTraspasos, setRecentTraspasos] = useState<Record<string, unknown>[]>([])
  const [loadingRecent, setLoadingRecent] = useState(false)

  useEffect(() => {
    (async () => {
      setLoading(true)
      const [{ data: wh }, { data: pr }] = await Promise.all([
        supabase.from('tt_warehouses').select('*').eq('active', true).order('name'),
        supabase.from('tt_products').select('id, sku, name').eq('active', true).order('name').limit(500),
      ])
      setWarehouses((wh || []) as Warehouse[]); setProducts(pr || [])
      setLoading(false)
    })()
    loadRecentTraspasos()
  }, [])

  const loadRecentTraspasos = useCallback(async () => {
    const sb = createClient()
    setLoadingRecent(true)
    try {
      const { data } = await sb
        .from('tt_stock_movements')
        .select(`id, product_id, warehouse_id, movement_type, quantity, quantity_before, quantity_after, reference, notes, created_at, product:tt_products(sku, name), warehouse:tt_warehouses(name)`)
        .eq('movement_type', 'traspaso')
        .order('created_at', { ascending: false })
        .limit(20)

      const rows = (data || []).map((row: Row) => {
        const product = row.product as Record<string, string> | null
        const warehouse = row.warehouse as Record<string, string> | null
        return {
          id: row.id,
          created_at: row.created_at,
          product_name: product?.name || '',
          product_sku: product?.sku || '',
          warehouse_name: warehouse?.name || '',
          movement_type: row.movement_type,
          quantity: row.quantity,
          quantity_before: row.quantity_before,
          quantity_after: row.quantity_after,
          reference: row.reference || '',
          notes: row.notes || '',
        }
      })
      setRecentTraspasos(rows)
    } finally { setLoadingRecent(false) }
  }, [])

  const handleTransfer = async () => {
    if (!originWH || !destWH || !selectedProduct || quantity <= 0) { addToast({ type: 'warning', title: 'Completa todos los campos' }); return }
    if (originWH === destWH) { addToast({ type: 'warning', title: 'Origen y destino no pueden ser iguales' }); return }

    setTransferring(true)
    try {
      // Get origin stock
      const { data: originStock } = await supabase.from('tt_stock').select('id, quantity').eq('warehouse_id', originWH).eq('product_id', selectedProduct).single()
      if (!originStock || (originStock.quantity as number) < quantity) {
        addToast({ type: 'error', title: 'Stock insuficiente en origen' }); setTransferring(false); return
      }

      const originQtyBefore = originStock.quantity as number
      const originQtyAfter = originQtyBefore - quantity

      // Decrement origin
      await supabase.from('tt_stock').update({ quantity: originQtyAfter }).eq('id', originStock.id)

      // Increment destination
      const { data: destStock } = await supabase.from('tt_stock').select('id, quantity').eq('warehouse_id', destWH).eq('product_id', selectedProduct).single()
      const destQtyBefore = destStock ? (destStock.quantity as number) : 0
      const destQtyAfter = destQtyBefore + quantity

      if (destStock) {
        await supabase.from('tt_stock').update({ quantity: destQtyAfter }).eq('id', destStock.id)
      } else {
        await supabase.from('tt_stock').insert({ warehouse_id: destWH, product_id: selectedProduct, quantity, reserved: 0, min_quantity: 0 })
      }

      // Get warehouse names for reference
      const originWHName = warehouses.find(w => w.id === originWH)?.name || originWH
      const destWHName = warehouses.find(w => w.id === destWH)?.name || destWH
      const refText = `Traspaso ${originWHName} -> ${destWHName}`

      // Insert 2 movement records: salida from origin + entrada to destination
      await supabase.from('tt_stock_movements').insert([
        {
          product_id: selectedProduct,
          warehouse_id: originWH,
          movement_type: 'traspaso',
          quantity,
          quantity_before: originQtyBefore,
          quantity_after: originQtyAfter,
          reference: refText,
          notes: `Salida por traspaso a ${destWHName}`,
        },
        {
          product_id: selectedProduct,
          warehouse_id: destWH,
          movement_type: 'traspaso',
          quantity,
          quantity_before: destQtyBefore,
          quantity_after: destQtyAfter,
          reference: refText,
          notes: `Entrada por traspaso desde ${originWHName}`,
        },
      ])

      addToast({ type: 'success', title: 'Traspaso realizado' })
      setOriginWH(''); setDestWH(''); setSelectedProduct(''); setQuantity(1)
      loadRecentTraspasos()
    } catch {
      addToast({ type: 'error', title: 'Error en el traspaso' })
    } finally {
      setTransferring(false)
    }
  }

  if (loading) return <div className="flex justify-center py-20"><Loader2 className="animate-spin text-[#FF6600]" size={32} /></div>

  return (
    <div className="space-y-4">
      {/* Transfer Form */}
      <Card>
        <h3 className="text-sm font-semibold text-[#F0F2F5] mb-4">Nuevo traspaso entre almacenes</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <Select label="Almacen origen" options={warehouses.map(w => ({ value: w.id, label: w.name }))} value={originWH} onChange={(e) => setOriginWH(e.target.value)} placeholder="Selecciona origen" />
          <Select label="Almacen destino" options={warehouses.map(w => ({ value: w.id, label: w.name }))} value={destWH} onChange={(e) => setDestWH(e.target.value)} placeholder="Selecciona destino" />
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-4">
          <Select label="Producto" options={products.map(p => ({ value: p.id as string, label: `${p.sku} - ${p.name}` }))} value={selectedProduct} onChange={(e) => setSelectedProduct(e.target.value)} placeholder="Selecciona producto" />
          <Input label="Cantidad" type="number" min={1} value={quantity} onChange={(e) => setQuantity(Number(e.target.value))} />
        </div>
        <div className="flex justify-end mt-4">
          <Button onClick={handleTransfer} disabled={transferring}>
            {transferring ? <Loader2 size={14} className="animate-spin" /> : <ArrowLeftRight size={14} />}
            Realizar Traspaso
          </Button>
        </div>
      </Card>

      {/* Recent Traspasos */}
      <Card>
        <h3 className="text-sm font-semibold text-[#F0F2F5] mb-4">Traspasos recientes</h3>
        {loadingRecent ? (
          <div className="flex justify-center py-10"><Loader2 className="animate-spin text-[#FF6600]" size={24} /></div>
        ) : recentTraspasos.length === 0 ? (
          <div className="text-center py-10 text-[#6B7280]">
            <ArrowLeftRight size={36} className="mx-auto mb-2 opacity-30" />
            <p className="text-sm">No hay traspasos registrados</p>
          </div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Fecha</TableHead>
                <TableHead>Producto</TableHead>
                <TableHead>Almacen</TableHead>
                <TableHead className="text-right">Cantidad</TableHead>
                <TableHead className="text-right">Antes</TableHead>
                <TableHead className="text-right">Despues</TableHead>
                <TableHead>Notas</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {recentTraspasos.map((t) => (
                <TableRow key={t.id as string}>
                  <TableCell className="text-sm whitespace-nowrap text-[#9CA3AF]">
                    {t.created_at ? formatDate(t.created_at as string) : '-'}
                  </TableCell>
                  <TableCell>
                    <div>
                      <p className="text-sm text-[#F0F2F5]">{t.product_name as string}</p>
                      <p className="text-[10px] text-[#6B7280] font-mono">{t.product_sku as string}</p>
                    </div>
                  </TableCell>
                  <TableCell className="text-sm text-[#9CA3AF]">{t.warehouse_name as string}</TableCell>
                  <TableCell className="text-right font-bold text-amber-400">{t.quantity as number}</TableCell>
                  <TableCell className="text-right text-[#6B7280]">{t.quantity_before as number}</TableCell>
                  <TableCell className="text-right text-[#D1D5DB]">{t.quantity_after as number}</TableCell>
                  <TableCell className="text-xs text-[#6B7280] max-w-[200px] truncate">{t.notes as string}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </Card>
    </div>
  )
}

// ═══════════════════════════════════════════════════════
// ALMACENES TAB
// ═══════════════════════════════════════════════════════
function AlmacenesTab() {
  const supabase = createClient()
  const [warehouses, setWarehouses] = useState<Warehouse[]>([])
  const [loading, setLoading] = useState(true)
  const [stockCounts, setStockCounts] = useState<Record<string, number>>({})

  useEffect(() => {
    (async () => {
      setLoading(true)
      const [{ data: wh }, { data: stock }] = await Promise.all([
        supabase.from('tt_warehouses').select('*').eq('active', true).order('name'),
        supabase.from('tt_stock').select('warehouse_id, quantity'),
      ])
      setWarehouses((wh || []) as Warehouse[])
      const counts: Record<string, number> = {}
      for (const s of (stock || [])) { const wid = s.warehouse_id as string; counts[wid] = (counts[wid] || 0) + ((s.quantity as number) || 0) }
      setStockCounts(counts)
      setLoading(false)
    })()
  }, [])

  if (loading) return <div className="flex justify-center py-20"><Loader2 className="animate-spin text-[#FF6600]" size={32} /></div>

  return (
    <div className="space-y-4">
      <KPICard label="Total almacenes" value={warehouses.length} icon={<WarehouseIcon size={22} />} />
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {warehouses.map((w) => (
          <Card key={w.id}>
            <div className="flex items-center gap-4">
              <div className="w-12 h-12 rounded-lg bg-[#FF6600]/10 flex items-center justify-center"><WarehouseIcon size={24} className="text-[#FF6600]" /></div>
              <div className="flex-1">
                <h3 className="text-sm font-bold text-[#F0F2F5]">{w.name}</h3>
                <p className="text-xs text-[#6B7280]">{w.code} - {w.city || w.country}</p>
              </div>
              <div className="text-right">
                <p className="text-lg font-bold text-[#FF6600]">{stockCounts[w.id] || 0}</p>
                <p className="text-[10px] text-[#6B7280]">unidades</p>
              </div>
            </div>
          </Card>
        ))}
      </div>
    </div>
  )
}

// ═══════════════════════════════════════════════════════
// MAIN PAGE
// ═══════════════════════════════════════════════════════
export default function StockPage() {
  return (
    <div className="space-y-6 animate-fade-in">
      <div>
        <h1 className="text-2xl font-bold text-[#F0F2F5]">Stock</h1>
        <p className="text-sm text-[#6B7280] mt-1">Inventario, movimientos, traspasos y almacenes</p>
      </div>
      <Suspense fallback={<div className="flex justify-center py-10"><Loader2 className="animate-spin text-[#FF6600]" size={32} /></div>}>
        <Tabs tabs={stockTabs} defaultTab="inventario">
          {(activeTab) => (
            <>
              {activeTab === 'inventario' && <InventarioTab />}
              {activeTab === 'movimientos' && <MovimientosTab />}
              {activeTab === 'traspasos' && <TraspasosTab />}
              {activeTab === 'almacenes' && <AlmacenesTab />}
            </>
          )}
        </Tabs>
      </Suspense>
    </div>
  )
}
