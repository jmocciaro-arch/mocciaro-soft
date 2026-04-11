'use client'

import { useState, useEffect, useCallback, useRef, Suspense } from 'react'
import { SearchBar } from '@/components/ui/search-bar'
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Modal } from '@/components/ui/modal'
import { Select } from '@/components/ui/select'
import { Input } from '@/components/ui/input'
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from '@/components/ui/table'
import { KPICard } from '@/components/ui/kpi-card'
import { Tabs } from '@/components/ui/tabs'
import { createClient } from '@/lib/supabase/client'
import { formatCurrency } from '@/lib/utils'
import { Package, Grid3X3, List, Loader2, ShoppingCart, Tag, Award, DollarSign } from 'lucide-react'

type Row = Record<string, unknown>
const BRANDS = ['FEIN', 'TOHNICHI', 'TECNA', 'INGERSOLL RAND', 'SPEEDRILL', 'FIAM', 'APEX', 'URYU']
const PAGE_SIZE = 50

interface Product {
  id: string; sku: string; name: string; description: string | null; brand: string
  category_name: string | null; price_list: number; price_currency: string
  image_url: string | null; specs: Record<string, string> | null; is_active: boolean
  torque_min: number | null; torque_max: number | null; rpm: number | null; encastre: string | null
}

const catalogoTabs = [
  { id: 'productos', label: 'Productos', icon: <Package size={16} /> },
  { id: 'categorias', label: 'Categorias', icon: <Tag size={16} /> },
  { id: 'marcas', label: 'Marcas', icon: <Award size={16} /> },
  { id: 'tarifas', label: 'Tarifas', icon: <DollarSign size={16} /> },
]

// ═══════════════════════════════════════════════════════
// PRODUCTOS TAB (existing catalog)
// ═══════════════════════════════════════════════════════
function ProductosTab() {
  const [products, setProducts] = useState<Product[]>([])
  const [totalCount, setTotalCount] = useState(0)
  const [search, setSearch] = useState('')
  const [selectedBrand, setSelectedBrand] = useState<string | null>(null)
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null)
  const [categories, setCategories] = useState<string[]>([])
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid')
  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null)
  const [loading, setLoading] = useState(true)
  const [loadingMore, setLoadingMore] = useState(false)
  const [offset, setOffset] = useState(0)
  const [hasMore, setHasMore] = useState(true)
  const debounceRef = useRef<NodeJS.Timeout | null>(null)

  useEffect(() => { loadCategories() }, [])
  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(() => { setOffset(0); setProducts([]); setHasMore(true); loadProducts(0, true) }, 300)
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current) }
  }, [search, selectedBrand, selectedCategory])

  async function loadCategories() {
    const supabase = createClient()
    const { data } = await supabase.from('tt_products').select('category_name').not('category_name', 'is', null).limit(1000)
    if (data) { const unique = [...new Set(data.map((d: { category_name: string | null }) => d.category_name).filter(Boolean) as string[])]; unique.sort(); setCategories(unique) }
  }

  const loadProducts = useCallback(async (fromOffset: number, reset: boolean = false) => {
    const supabase = createClient()
    if (reset) setLoading(true); else setLoadingMore(true)
    try {
      let query = supabase.from('tt_products').select('id, sku, name, description, brand, category_name, price_list, price_currency, image_url, specs, is_active, torque_min, torque_max, rpm, encastre', { count: 'exact' }).eq('is_active', true).order('name', { ascending: true }).range(fromOffset, fromOffset + PAGE_SIZE - 1)
      if (selectedBrand) query = query.ilike('brand', selectedBrand)
      if (selectedCategory) query = query.eq('category_name', selectedCategory)
      if (search.trim()) { const tokens = search.trim().toLowerCase().split(/\s+/); for (const token of tokens) { query = query.or(`name.ilike.%${token}%,sku.ilike.%${token}%,brand.ilike.%${token}%,category_name.ilike.%${token}%`) } }
      const { data, count } = await query
      const newProducts = (data || []) as Product[]
      if (reset) setProducts(newProducts); else setProducts((prev) => [...prev, ...newProducts])
      setTotalCount(count || 0); setOffset(fromOffset + PAGE_SIZE); setHasMore(newProducts.length === PAGE_SIZE)
    } finally { setLoading(false); setLoadingMore(false) }
  }, [search, selectedBrand, selectedCategory])

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-[#6B7280]">{loading ? 'Buscando...' : `${totalCount.toLocaleString('es-AR')} productos`}</p>
        <div className="flex items-center gap-2">
          <Button variant={viewMode === 'grid' ? 'primary' : 'secondary'} size="icon" onClick={() => setViewMode('grid')}><Grid3X3 size={16} /></Button>
          <Button variant={viewMode === 'list' ? 'primary' : 'secondary'} size="icon" onClick={() => setViewMode('list')}><List size={16} /></Button>
        </div>
      </div>
      <SearchBar placeholder="Buscar por SKU, nombre, marca..." value={search} onChange={setSearch} className="max-w-2xl" />
      <div className="flex flex-wrap gap-2">
        <button onClick={() => setSelectedBrand(null)} className={`px-3 py-1.5 rounded-full text-xs font-medium transition-all ${!selectedBrand ? 'bg-[#FF6600] text-white' : 'bg-[#1E2330] text-[#9CA3AF] hover:bg-[#2A3040]'}`}>Todas</button>
        {BRANDS.map((brand) => (<button key={brand} onClick={() => setSelectedBrand(selectedBrand === brand ? null : brand)} className={`px-3 py-1.5 rounded-full text-xs font-medium transition-all ${selectedBrand === brand ? 'bg-[#FF6600] text-white' : 'bg-[#1E2330] text-[#9CA3AF] hover:bg-[#2A3040]'}`}>{brand}</button>))}
      </div>
      {categories.length > 0 && (
        <div className="flex flex-wrap gap-2">
          <span className="text-xs text-[#4B5563] self-center mr-1">Categoria:</span>
          <button onClick={() => setSelectedCategory(null)} className={`px-3 py-1 rounded-full text-[11px] font-medium transition-all ${!selectedCategory ? 'bg-[#3B82F6] text-white' : 'bg-[#1E2330] text-[#6B7280] hover:bg-[#2A3040]'}`}>Todas</button>
          {categories.slice(0, 15).map((cat) => (<button key={cat} onClick={() => setSelectedCategory(selectedCategory === cat ? null : cat)} className={`px-3 py-1 rounded-full text-[11px] font-medium transition-all ${selectedCategory === cat ? 'bg-[#3B82F6] text-white' : 'bg-[#1E2330] text-[#6B7280] hover:bg-[#2A3040]'}`}>{cat}</button>))}
        </div>
      )}

      {loading ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">{Array.from({ length: 8 }).map((_, i) => (<div key={i} className="rounded-xl bg-[#141820] border border-[#1E2330] p-5 animate-pulse"><div className="aspect-square rounded-lg bg-[#0F1218] mb-3" /><div className="h-4 bg-[#1E2330] rounded w-16 mb-2" /></div>))}</div>
      ) : products.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 text-[#4B5563]"><Package size={48} className="mb-4" /><p>No se encontraron productos</p></div>
      ) : viewMode === 'grid' ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {products.map((product) => (
            <Card key={product.id} hover onClick={() => setSelectedProduct(product)} className="flex flex-col">
              <div className="aspect-square rounded-lg bg-[#0F1218] border border-[#1E2330] flex items-center justify-center mb-3 overflow-hidden">
                {product.image_url ? <img src={product.image_url} alt={product.name} referrerPolicy="no-referrer" className="w-full h-full object-contain p-2" onError={(e) => { (e.target as HTMLImageElement).style.display = 'none' }} /> : <Package size={40} className="text-[#2A3040]" />}
              </div>
              <Badge variant="default" className="w-fit mb-2">{product.brand}</Badge>
              <p className="text-xs font-mono text-[#6B7280] mb-1">{product.sku}</p>
              <h3 className="text-sm font-medium text-[#F0F2F5] line-clamp-2 flex-1">{product.name}</h3>
              <p className="text-lg font-bold text-[#FF6600] mt-2">{product.price_list > 0 ? formatCurrency(product.price_list, (product.price_currency || 'EUR') as 'EUR' | 'ARS' | 'USD') : 'Consultar'}</p>
            </Card>
          ))}
        </div>
      ) : (
        <div className="space-y-2">
          {products.map((product) => (
            <div key={product.id} onClick={() => setSelectedProduct(product)} className="flex items-center gap-4 p-4 rounded-xl bg-[#141820] border border-[#1E2330] hover:border-[#2A3040] transition-all cursor-pointer">
              <div className="w-16 h-16 rounded-lg bg-[#0F1218] border border-[#1E2330] flex items-center justify-center shrink-0 overflow-hidden">
                {product.image_url ? <img src={product.image_url} alt={product.name} referrerPolicy="no-referrer" className="w-full h-full object-contain p-1" onError={(e) => { (e.target as HTMLImageElement).style.display = 'none' }} /> : <Package size={24} className="text-[#2A3040]" />}
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2"><Badge variant="default">{product.brand}</Badge><span className="text-xs font-mono text-[#6B7280]">{product.sku}</span></div>
                <h3 className="text-sm font-medium text-[#F0F2F5] mt-1 truncate">{product.name}</h3>
              </div>
              <p className="text-lg font-bold text-[#FF6600] shrink-0">{product.price_list > 0 ? formatCurrency(product.price_list, (product.price_currency || 'EUR') as 'EUR' | 'ARS' | 'USD') : 'Consultar'}</p>
            </div>
          ))}
        </div>
      )}

      {!loading && hasMore && products.length > 0 && (
        <div className="flex justify-center pt-4"><Button variant="secondary" onClick={() => loadProducts(offset, false)} loading={loadingMore}>Cargar mas ({products.length} de {totalCount})</Button></div>
      )}

      <Modal isOpen={!!selectedProduct} onClose={() => setSelectedProduct(null)} title={selectedProduct?.name || ''} size="lg">
        {selectedProduct && (
          <div className="space-y-6">
            <div className="flex flex-col sm:flex-row gap-6">
              <div className="w-full sm:w-56 aspect-square rounded-lg bg-[#0F1218] border border-[#1E2330] flex items-center justify-center shrink-0 overflow-hidden">
                {selectedProduct.image_url ? <img src={selectedProduct.image_url} alt={selectedProduct.name} referrerPolicy="no-referrer" className="w-full h-full object-contain p-3" onError={(e) => { (e.target as HTMLImageElement).style.display = 'none' }} /> : <Package size={48} className="text-[#2A3040]" />}
              </div>
              <div className="flex-1 space-y-3">
                <div className="flex items-center gap-2 flex-wrap"><Badge variant="orange">{selectedProduct.brand}</Badge>{selectedProduct.category_name && <Badge variant="default">{selectedProduct.category_name}</Badge>}</div>
                <p className="text-sm font-mono text-[#6B7280]">{selectedProduct.sku}</p>
                {selectedProduct.description && <p className="text-sm text-[#D1D5DB]">{selectedProduct.description}</p>}
                <p className="text-2xl font-bold text-[#FF6600]">{selectedProduct.price_list > 0 ? formatCurrency(selectedProduct.price_list, (selectedProduct.price_currency || 'EUR') as 'EUR' | 'ARS' | 'USD') : 'Consultar precio'}</p>
              </div>
            </div>
            {selectedProduct.specs && Object.keys(selectedProduct.specs).length > 0 && (
              <div><h4 className="text-sm font-semibold text-[#F0F2F5] mb-3">Especificaciones</h4>
                <div className="grid grid-cols-2 gap-2">{Object.entries(selectedProduct.specs).map(([key, value]) => (<div key={key} className="flex justify-between p-2.5 rounded-lg bg-[#0F1218] border border-[#1E2330]"><span className="text-xs text-[#6B7280]">{key}</span><span className="text-xs font-medium text-[#F0F2F5]">{String(value)}</span></div>))}</div>
              </div>
            )}
            <div className="flex gap-3 pt-2"><Button variant="primary" className="flex-1 gap-2"><ShoppingCart size={16} /> Agregar a cotizacion</Button></div>
          </div>
        )}
      </Modal>
    </div>
  )
}

// ═══════════════════════════════════════════════════════
// CATEGORIAS TAB
// ═══════════════════════════════════════════════════════
function CategoriasTab() {
  const supabase = createClient()
  const [categories, setCategories] = useState<Array<{ name: string; count: number }>>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    (async () => {
      setLoading(true)
      const { data } = await supabase.from('tt_products').select('category_name').eq('is_active', true)
      const map = new Map<string, number>()
      for (const p of (data || [])) { const cat = (p.category_name as string) || 'Sin categoria'; map.set(cat, (map.get(cat) || 0) + 1) }
      const arr = Array.from(map.entries()).map(([name, count]) => ({ name, count })).sort((a, b) => b.count - a.count)
      setCategories(arr)
      setLoading(false)
    })()
  }, [])

  return (
    <div className="space-y-4">
      <KPICard label="Total categorias" value={categories.length} icon={<Tag size={22} />} />
      <Card className="p-0 overflow-hidden">
        {loading ? (
          <div className="flex items-center justify-center py-20"><Loader2 className="animate-spin text-[#FF6600]" size={32} /></div>
        ) : (
          <Table>
            <TableHeader><TableRow><TableHead>Categoria</TableHead><TableHead>Productos</TableHead></TableRow></TableHeader>
            <TableBody>
              {categories.map((c) => (
                <TableRow key={c.name}><TableCell className="font-medium text-[#F0F2F5]">{c.name}</TableCell><TableCell><Badge variant="info">{c.count}</Badge></TableCell></TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </Card>
    </div>
  )
}

// ═══════════════════════════════════════════════════════
// MARCAS TAB
// ═══════════════════════════════════════════════════════
function MarcasTab() {
  const supabase = createClient()
  const [brands, setBrands] = useState<Array<{ name: string; count: number; avgPrice: number }>>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    (async () => {
      setLoading(true)
      const { data } = await supabase.from('tt_products').select('brand, price_list').eq('is_active', true)
      const map = new Map<string, { count: number; totalPrice: number }>()
      for (const p of (data || [])) { const brand = (p.brand as string) || 'Sin marca'; const existing = map.get(brand) || { count: 0, totalPrice: 0 }; existing.count++; existing.totalPrice += (p.price_list as number) || 0; map.set(brand, existing) }
      const arr = Array.from(map.entries()).map(([name, v]) => ({ name, count: v.count, avgPrice: v.count > 0 ? v.totalPrice / v.count : 0 })).sort((a, b) => b.count - a.count)
      setBrands(arr)
      setLoading(false)
    })()
  }, [])

  return (
    <div className="space-y-4">
      <KPICard label="Total marcas" value={brands.length} icon={<Award size={22} />} />
      {loading ? (
        <div className="flex justify-center py-20"><Loader2 className="animate-spin text-[#FF6600]" size={32} /></div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {brands.map((b) => (
            <Card key={b.name}>
              <div className="flex items-center gap-3">
                <div className="w-12 h-12 rounded-lg bg-[#FF6600]/10 flex items-center justify-center"><Award size={24} className="text-[#FF6600]" /></div>
                <div className="flex-1"><h3 className="text-sm font-bold text-[#F0F2F5]">{b.name}</h3><p className="text-xs text-[#6B7280]">{b.count} productos</p></div>
                <p className="text-sm font-bold text-[#FF6600]">{formatCurrency(b.avgPrice)} avg</p>
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  )
}

// ═══════════════════════════════════════════════════════
// TARIFAS TAB
// ═══════════════════════════════════════════════════════
function TarifasTab() {
  const supabase = createClient()
  const [products, setProducts] = useState<Row[]>([])
  const [loading, setLoading] = useState(true)
  const [brandFilter, setBrandFilter] = useState('')

  const load = useCallback(async () => {
    setLoading(true)
    let q = supabase.from('tt_products').select('id, sku, name, brand, price_list, price_currency, cost_price, sell_price').eq('is_active', true).order('brand').order('name')
    if (brandFilter) q = q.ilike('brand', brandFilter)
    const { data } = await q.limit(200)
    setProducts(data || [])
    setLoading(false)
  }, [supabase, brandFilter])

  useEffect(() => { load() }, [load])

  return (
    <div className="space-y-4">
      <Card>
        <div className="flex items-center gap-3">
          <span className="text-sm text-[#9CA3AF]">Filtrar por marca:</span>
          <Select options={[{ value: '', label: 'Todas' }, ...BRANDS.map(b => ({ value: b, label: b }))]} value={brandFilter} onChange={(e) => setBrandFilter(e.target.value)} />
        </div>
      </Card>
      <Card className="p-0 overflow-hidden">
        {loading ? (
          <div className="flex items-center justify-center py-20"><Loader2 className="animate-spin text-[#FF6600]" size={32} /></div>
        ) : (
          <Table>
            <TableHeader><TableRow><TableHead>SKU</TableHead><TableHead>Producto</TableHead><TableHead>Marca</TableHead><TableHead>Precio lista</TableHead><TableHead>Costo</TableHead><TableHead>Moneda</TableHead></TableRow></TableHeader>
            <TableBody>
              {products.map((p) => (
                <TableRow key={p.id as string}>
                  <TableCell className="font-mono text-xs">{p.sku as string}</TableCell>
                  <TableCell className="text-[#F0F2F5] max-w-[200px] truncate">{p.name as string}</TableCell>
                  <TableCell><Badge>{p.brand as string}</Badge></TableCell>
                  <TableCell className="font-bold text-[#FF6600]">{formatCurrency((p.price_list as number) || 0)}</TableCell>
                  <TableCell className="text-[#6B7280]">{formatCurrency((p.cost_price as number) || 0)}</TableCell>
                  <TableCell>{(p.price_currency as string) || 'EUR'}</TableCell>
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
// MAIN PAGE
// ═══════════════════════════════════════════════════════
export default function CatalogoPage() {
  return (
    <div className="space-y-6 animate-fade-in">
      <div>
        <h1 className="text-2xl font-bold text-[#F0F2F5]">Catalogo de Productos</h1>
        <p className="text-sm text-[#6B7280] mt-1">Productos, categorias, marcas y tarifas</p>
      </div>
      <Suspense fallback={<div className="flex justify-center py-10"><Loader2 className="animate-spin text-[#FF6600]" size={32} /></div>}>
        <Tabs tabs={catalogoTabs} defaultTab="productos">
          {(activeTab) => (
            <>
              {activeTab === 'productos' && <ProductosTab />}
              {activeTab === 'categorias' && <CategoriasTab />}
              {activeTab === 'marcas' && <MarcasTab />}
              {activeTab === 'tarifas' && <TarifasTab />}
            </>
          )}
        </Tabs>
      </Suspense>
    </div>
  )
}
