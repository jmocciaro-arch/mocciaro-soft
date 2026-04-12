'use client'

import { useState, useEffect, useRef, useCallback, Suspense } from 'react'
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
import { useToast } from '@/components/ui/toast'
import { createClient } from '@/lib/supabase/client'
import { formatDate, formatCurrency } from '@/lib/utils'
import type { Warehouse } from '@/types'
import { ExportButton } from '@/components/ui/export-button'
import { ImportButton } from '@/components/ui/import-button'
import {
  Package, AlertTriangle, XCircle, CheckCircle, Loader2,
  ArrowLeftRight, Warehouse as WarehouseIcon, Activity, TrendingUp
} from 'lucide-react'

type Row = Record<string, unknown>

interface StockRow {
  id: string; quantity: number; reserved: number; min_quantity: number
  product_sku: string; product_name: string; product_brand: string
  warehouse_name: string; warehouse_code: string
}

const stockTabs = [
  { id: 'inventario', label: 'Inventario', icon: <Package size={16} /> },
  { id: 'movimientos', label: 'Movimientos', icon: <Activity size={16} /> },
  { id: 'traspasos', label: 'Traspasos', icon: <ArrowLeftRight size={16} /> },
  { id: 'almacenes', label: 'Almacenes', icon: <WarehouseIcon size={16} /> },
]

// ═══════════════════════════════════════════════════════
// INVENTARIO TAB (existing stock functionality)
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
  const [kpis, setKpis] = useState({ total: 0, inStock: 0, lowStock: 0, outOfStock: 0 })

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
    const supabase = createClient(); setLoading(true)
    try {
      let query = supabase.from('tt_stock').select(`id, quantity, reserved, min_quantity, product:tt_products(sku, name, brand), warehouse:tt_warehouses(name, code)`).order('quantity', { ascending: true })
      if (warehouseFilter) query = query.eq('warehouse_id', warehouseFilter)
      const { data } = await query
      if (!data || data.length === 0) { setStockItems([]); setBrands([]); setKpis({ total: 0, inStock: 0, lowStock: 0, outOfStock: 0 }); setLoading(false); return }
      let items: StockRow[] = data.map((row: Row) => {
        const product = row.product as Record<string, string> | null
        const warehouse = row.warehouse as Record<string, string> | null
        return { id: row.id as string, quantity: row.quantity as number, reserved: row.reserved as number, min_quantity: row.min_quantity as number, product_sku: product?.sku || '', product_name: product?.name || '', product_brand: product?.brand || '', warehouse_name: warehouse?.name || '', warehouse_code: warehouse?.code || '' }
      })
      const uniqueBrands = [...new Set(items.map((i) => i.product_brand).filter(Boolean))]; uniqueBrands.sort(); setBrands(uniqueBrands)
      if (brandFilter) items = items.filter((i) => i.product_brand === brandFilter)
      if (search.trim()) { const q = search.toLowerCase(); items = items.filter((i) => i.product_sku.toLowerCase().includes(q) || i.product_name.toLowerCase().includes(q) || i.product_brand.toLowerCase().includes(q)) }
      setKpis({ total: items.length, inStock: items.filter((i) => i.quantity > i.min_quantity).length, lowStock: items.filter((i) => i.quantity > 0 && i.quantity <= i.min_quantity).length, outOfStock: items.filter((i) => i.quantity === 0).length })
      setStockItems(items)
    } finally { setLoading(false) }
  }, [search, warehouseFilter, brandFilter])

  function stockBadge(qty: number, min: number) {
    if (qty === 0) return <Badge variant="danger">Sin stock</Badge>
    if (qty <= min) return <Badge variant="warning">Stock bajo</Badge>
    return <Badge variant="success">OK</Badge>
  }

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <KPICard label="Total items" value={kpis.total} icon={<Package size={20} />} />
        <KPICard label="En stock" value={kpis.inStock} icon={<CheckCircle size={20} />} color="#00C853" />
        <KPICard label="Stock bajo" value={kpis.lowStock} icon={<AlertTriangle size={20} />} color="#FFB300" />
        <KPICard label="Sin stock" value={kpis.outOfStock} icon={<XCircle size={20} />} color="#FF3D00" />
      </div>
      <Card>
        <div className="flex flex-col md:flex-row gap-4 items-start md:items-center justify-between">
          <SearchBar value={search} onChange={setSearch} placeholder="Buscar por SKU, nombre o marca..." className="flex-1" />
          <div className="flex flex-wrap gap-2">
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
              ]}
            />
            <ImportButton
              targetTable="tt_stock"
              fields={[
                { key: 'product_id', label: 'Producto ID' },
                { key: 'warehouse_id', label: 'Almacen ID' },
                { key: 'quantity', label: 'Cantidad', required: true, type: 'number' },
                { key: 'min_quantity', label: 'Stock minimo', type: 'number' },
              ]}
              permission="manage_stock"
            />
          </div>
        </div>
      </Card>
      <Card className="p-0 overflow-hidden">
        {loading ? (
          <div className="flex items-center justify-center py-16"><Loader2 size={32} className="animate-spin text-[#FF6600]" /></div>
        ) : stockItems.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-[#4B5563]"><Package size={48} className="mb-4" /><p>No hay datos de stock</p></div>
        ) : (
          <Table>
            <TableHeader><TableRow><TableHead>SKU</TableHead><TableHead>Producto</TableHead><TableHead>Marca</TableHead><TableHead>Almacen</TableHead><TableHead className="text-right">Cantidad</TableHead><TableHead className="text-right">Reservado</TableHead><TableHead className="text-right">Disponible</TableHead><TableHead>Estado</TableHead></TableRow></TableHeader>
            <TableBody>
              {stockItems.map((s) => {
                const available = s.quantity - s.reserved
                return (
                  <TableRow key={s.id}>
                    <TableCell className="font-mono text-sm">{s.product_sku}</TableCell>
                    <TableCell className="max-w-[200px] truncate">{s.product_name}</TableCell>
                    <TableCell><Badge>{s.product_brand}</Badge></TableCell>
                    <TableCell className="text-[#9CA3AF]">{s.warehouse_name}</TableCell>
                    <TableCell className={`text-right font-bold text-lg ${s.quantity === 0 ? 'text-red-400' : s.quantity <= s.min_quantity ? 'text-yellow-400' : 'text-green-400'}`}>{s.quantity}</TableCell>
                    <TableCell className="text-right text-[#6B7280]">{s.reserved}</TableCell>
                    <TableCell className={`text-right font-medium ${available === 0 ? 'text-red-400' : available <= s.min_quantity ? 'text-yellow-400' : 'text-green-400'}`}>{available}</TableCell>
                    <TableCell>{stockBadge(s.quantity, s.min_quantity)}</TableCell>
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
// MOVIMIENTOS TAB
// ═══════════════════════════════════════════════════════
function MovimientosTab() {
  const supabase = createClient()
  const [movements, setMovements] = useState<Row[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    (async () => {
      setLoading(true)
      const { data } = await supabase.from('tt_activity_log').select('*').in('entity_type', ['stock', 'delivery_note', 'purchase_order']).order('created_at', { ascending: false }).limit(100)
      setMovements(data || [])
      setLoading(false)
    })()
  }, [])

  return (
    <div className="space-y-4">
      <KPICard label="Movimientos registrados" value={movements.length} icon={<Activity size={22} />} />
      <Card className="p-0 overflow-hidden">
        {loading ? (
          <div className="flex items-center justify-center py-20"><Loader2 className="animate-spin text-[#FF6600]" size={32} /></div>
        ) : movements.length === 0 ? (
          <div className="text-center py-20 text-[#6B7280]"><Activity size={48} className="mx-auto mb-3 opacity-30" /><p>No hay movimientos registrados</p></div>
        ) : (
          <Table>
            <TableHeader><TableRow><TableHead>Fecha</TableHead><TableHead>Tipo</TableHead><TableHead>Accion</TableHead><TableHead>Detalle</TableHead></TableRow></TableHeader>
            <TableBody>
              {movements.map((m) => (
                <TableRow key={m.id as string}>
                  <TableCell className="text-sm whitespace-nowrap">{m.created_at ? formatDate(m.created_at as string) : '-'}</TableCell>
                  <TableCell><Badge variant="default">{(m.entity_type as string) || '-'}</Badge></TableCell>
                  <TableCell className="text-sm text-[#F0F2F5]">{(m.action as string) || '-'}</TableCell>
                  <TableCell className="text-sm text-[#9CA3AF] max-w-[300px] truncate">{(m.detail as string) || (m.description as string) || ''}</TableCell>
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
  }, [])

  const handleTransfer = async () => {
    if (!originWH || !destWH || !selectedProduct || quantity <= 0) { addToast({ type: 'warning', title: 'Completa todos los campos' }); return }
    if (originWH === destWH) { addToast({ type: 'warning', title: 'Origen y destino no pueden ser iguales' }); return }

    // Decrement origin
    const { data: originStock } = await supabase.from('tt_stock').select('id, quantity').eq('warehouse_id', originWH).eq('product_id', selectedProduct).single()
    if (!originStock || (originStock.quantity as number) < quantity) { addToast({ type: 'error', title: 'Stock insuficiente en origen' }); return }
    await supabase.from('tt_stock').update({ quantity: (originStock.quantity as number) - quantity }).eq('id', originStock.id)

    // Increment destination
    const { data: destStock } = await supabase.from('tt_stock').select('id, quantity').eq('warehouse_id', destWH).eq('product_id', selectedProduct).single()
    if (destStock) {
      await supabase.from('tt_stock').update({ quantity: (destStock.quantity as number) + quantity }).eq('id', destStock.id)
    } else {
      await supabase.from('tt_stock').insert({ warehouse_id: destWH, product_id: selectedProduct, quantity, reserved: 0, min_quantity: 0 })
    }

    await supabase.from('tt_activity_log').insert({ entity_type: 'stock', action: 'transfer', detail: `Traspaso de ${quantity} unidades entre almacenes` })
    addToast({ type: 'success', title: 'Traspaso realizado' })
    setOriginWH(''); setDestWH(''); setSelectedProduct(''); setQuantity(1)
  }

  if (loading) return <div className="flex justify-center py-20"><Loader2 className="animate-spin text-[#FF6600]" size={32} /></div>

  return (
    <div className="space-y-4">
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
        <div className="flex justify-end mt-4"><Button onClick={handleTransfer}><ArrowLeftRight size={14} /> Realizar Traspaso</Button></div>
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
