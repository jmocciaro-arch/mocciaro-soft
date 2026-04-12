'use client'

import { useState, useEffect, useCallback, useRef, useMemo, Suspense } from 'react'
import { useSearchParams, useRouter, usePathname } from 'next/navigation'
import { SearchBar } from '@/components/ui/search-bar'
import { Card } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Modal } from '@/components/ui/modal'
import { Select } from '@/components/ui/select'
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from '@/components/ui/table'
import { KPICard } from '@/components/ui/kpi-card'
import { Tabs } from '@/components/ui/tabs'
import { createClient } from '@/lib/supabase/client'
import { formatCurrency } from '@/lib/utils'
import { ExportButton } from '@/components/ui/export-button'
import { ImportButton } from '@/components/ui/import-button'
import {
  Package, Grid3X3, List, Loader2, ShoppingCart, Tag, Award, DollarSign,
  ChevronDown, ChevronRight, X, RotateCcw, Plus, Search, ArrowUpDown,
  SlidersHorizontal, ChevronLeft
} from 'lucide-react'

type Row = Record<string, unknown>
const PAGE_SIZE = 100

// -------------------------------------------------------
// Types
// -------------------------------------------------------
interface Product {
  id: string
  sku: string
  name: string
  description: string | null
  brand: string
  category: string | null
  subcategory: string | null
  price_eur: number
  cost_eur: number
  image_url: string | null
  specs: Record<string, string> | null
  active: boolean
  torque_min: number | null
  torque_max: number | null
  rpm: number | null
  encastre: string | null
  weight_kg: number | null
  serie: string | null
  modelo: string | null
  origin: string | null
  price_usd: number | null
  price_ars: number | null
}

interface FacetItem {
  value: string
  count: number
}

interface RangeFilter {
  min: string
  max: string
}

type SortOption = 'name_asc' | 'name_desc' | 'price_asc' | 'price_desc'

const BRANDS_STATIC = ['FEIN', 'TOHNICHI', 'TECNA', 'INGERSOLL RAND', 'SPEEDRILL', 'FIAM', 'APEX', 'URYU']

const catalogoTabs = [
  { id: 'productos', label: 'Productos', icon: <Package size={16} /> },
  { id: 'categorias', label: 'Categorias', icon: <Tag size={16} /> },
  { id: 'marcas', label: 'Marcas', icon: <Award size={16} /> },
  { id: 'tarifas', label: 'Tarifas', icon: <DollarSign size={16} /> },
]

// ===============================================================
// COLLAPSIBLE FILTER SECTION
// ===============================================================
function FilterSection({
  title,
  defaultOpen = true,
  children,
}: {
  title: string
  defaultOpen?: boolean
  children: React.ReactNode
}) {
  const [open, setOpen] = useState(defaultOpen)
  return (
    <div className="border-b border-[#1E2330] last:border-b-0">
      <button
        onClick={() => setOpen(!open)}
        className="w-full flex items-center justify-between px-4 py-3 text-xs font-bold uppercase tracking-wider text-[#FF6600] hover:bg-[#141820] transition-colors"
      >
        {title}
        {open ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
      </button>
      {open && <div className="px-4 pb-3">{children}</div>}
    </div>
  )
}

// ===============================================================
// FACET LIST (clickable items with counts)
// ===============================================================
function FacetList({
  items,
  selected,
  onSelect,
  maxVisible = 12,
}: {
  items: FacetItem[]
  selected: string | null
  onSelect: (val: string | null) => void
  maxVisible?: number
}) {
  const [showAll, setShowAll] = useState(false)
  const visible = showAll ? items : items.slice(0, maxVisible)
  const hasMore = items.length > maxVisible

  return (
    <div className="space-y-0.5">
      {visible.map((item) => (
        <button
          key={item.value}
          onClick={() => onSelect(selected === item.value ? null : item.value)}
          className={`w-full flex items-center justify-between px-2 py-1.5 rounded text-xs transition-all ${
            selected === item.value
              ? 'bg-[#FF6600]/15 text-[#FF6600] font-semibold'
              : 'text-[#9CA3AF] hover:text-[#F0F2F5] hover:bg-[#1A1F2E]'
          }`}
        >
          <span className="truncate text-left">{item.value}</span>
          <span className={`ml-2 shrink-0 text-[10px] ${selected === item.value ? 'text-[#FF6600]' : 'text-[#4B5563]'}`}>
            {item.count}
          </span>
        </button>
      ))}
      {hasMore && (
        <button
          onClick={() => setShowAll(!showAll)}
          className="w-full text-center text-[10px] text-[#FF6600] hover:text-[#FF8833] py-1 mt-1"
        >
          {showAll ? 'Ver menos' : `Ver todos (${items.length})`}
        </button>
      )}
    </div>
  )
}

// ===============================================================
// RANGE FILTER (Min / Max inputs)
// ===============================================================
function RangeInputs({
  value,
  onChange,
  placeholderMin = 'Min',
  placeholderMax = 'Max',
}: {
  value: RangeFilter
  onChange: (v: RangeFilter) => void
  placeholderMin?: string
  placeholderMax?: string
}) {
  return (
    <div className="flex gap-2">
      <input
        type="number"
        value={value.min}
        onChange={(e) => onChange({ ...value, min: e.target.value })}
        placeholder={placeholderMin}
        className="w-full h-8 rounded bg-[#1E2330] border border-[#2A3040] px-2 text-xs text-[#F0F2F5] placeholder:text-[#4B5563] focus:outline-none focus:ring-1 focus:ring-orange-500/50"
      />
      <input
        type="number"
        value={value.max}
        onChange={(e) => onChange({ ...value, max: e.target.value })}
        placeholder={placeholderMax}
        className="w-full h-8 rounded bg-[#1E2330] border border-[#2A3040] px-2 text-xs text-[#F0F2F5] placeholder:text-[#4B5563] focus:outline-none focus:ring-1 focus:ring-orange-500/50"
      />
    </div>
  )
}

// ===============================================================
// PRODUCTOS TAB (full catalog with sidebar)
// ===============================================================
function ProductosTab() {
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()

  // ---------- State ----------
  const [products, setProducts] = useState<Product[]>([])
  const [totalCount, setTotalCount] = useState(0)
  const [loading, setLoading] = useState(true)
  const [page, setPage] = useState(1)

  const [search, setSearch] = useState(searchParams.get('q') || '')
  const [viewMode, setViewMode] = useState<'table' | 'grid'>(
    (searchParams.get('view') as 'table' | 'grid') || 'table'
  )
  const [sortBy, setSortBy] = useState<SortOption>(
    (searchParams.get('sort') as SortOption) || 'name_asc'
  )
  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null)

  // Sidebar filters
  const [selectedCategory, setSelectedCategory] = useState<string | null>(searchParams.get('cat') || null)
  const [selectedSubcategory, setSelectedSubcategory] = useState<string | null>(searchParams.get('subcat') || null)
  const [selectedBrand, setSelectedBrand] = useState<string | null>(searchParams.get('brand') || null)
  const [selectedSerie, setSelectedSerie] = useState<string | null>(searchParams.get('serie') || null)
  const [selectedEncastre, setSelectedEncastre] = useState<string | null>(searchParams.get('enc') || null)
  const [weightRange, setWeightRange] = useState<RangeFilter>({ min: searchParams.get('wmin') || '', max: searchParams.get('wmax') || '' })
  const [torqueRange, setTorqueRange] = useState<RangeFilter>({ min: searchParams.get('tmin') || '', max: searchParams.get('tmax') || '' })
  const [largoRange, setLargoRange] = useState<RangeFilter>({ min: searchParams.get('lmin') || '', max: searchParams.get('lmax') || '' })
  const [rpmRange, setRpmRange] = useState<RangeFilter>({ min: searchParams.get('rmin') || '', max: searchParams.get('rmax') || '' })
  const [stockOnly, setStockOnly] = useState(searchParams.get('stock') === '1')

  // Facet counts
  const [catFacets, setCatFacets] = useState<FacetItem[]>([])
  const [subcatFacets, setSubcatFacets] = useState<FacetItem[]>([])
  const [brandFacets, setBrandFacets] = useState<FacetItem[]>([])
  const [serieFacets, setSerieFacets] = useState<FacetItem[]>([])
  const [encastreFacets, setEncastreFacets] = useState<FacetItem[]>([])
  const [facetsLoading, setFacetsLoading] = useState(true)

  // Mobile sidebar
  const [sidebarOpen, setSidebarOpen] = useState(false)

  const debounceRef = useRef<NodeJS.Timeout | null>(null)

  // Total pages
  const totalPages = Math.max(1, Math.ceil(totalCount / PAGE_SIZE))

  // ---------- Sync URL params ----------
  const syncUrlParams = useCallback(() => {
    const params = new URLSearchParams()
    params.set('tab', 'productos')
    if (search) params.set('q', search)
    if (selectedCategory) params.set('cat', selectedCategory)
    if (selectedSubcategory) params.set('subcat', selectedSubcategory)
    if (selectedBrand) params.set('brand', selectedBrand)
    if (selectedSerie) params.set('serie', selectedSerie)
    if (selectedEncastre) params.set('enc', selectedEncastre)
    if (weightRange.min) params.set('wmin', weightRange.min)
    if (weightRange.max) params.set('wmax', weightRange.max)
    if (torqueRange.min) params.set('tmin', torqueRange.min)
    if (torqueRange.max) params.set('tmax', torqueRange.max)
    if (largoRange.min) params.set('lmin', largoRange.min)
    if (largoRange.max) params.set('lmax', largoRange.max)
    if (rpmRange.min) params.set('rmin', rpmRange.min)
    if (rpmRange.max) params.set('rmax', rpmRange.max)
    if (stockOnly) params.set('stock', '1')
    if (viewMode !== 'table') params.set('view', viewMode)
    if (sortBy !== 'name_asc') params.set('sort', sortBy)
    router.replace(`${pathname}?${params.toString()}`, { scroll: false })
  }, [search, selectedCategory, selectedSubcategory, selectedBrand, selectedSerie, selectedEncastre, weightRange, torqueRange, largoRange, rpmRange, stockOnly, viewMode, sortBy, router, pathname])

  // ---------- Load facets ----------
  const loadFacets = useCallback(async () => {
    setFacetsLoading(true)
    const supabase = createClient()

    // Categories with counts
    const { data: catData } = await supabase
      .from('tt_products')
      .select('category')
      .eq('active', true)
      .not('category', 'is', null)

    if (catData) {
      const map = new Map<string, number>()
      for (const r of catData) {
        const v = r.category as string
        if (v) map.set(v, (map.get(v) || 0) + 1)
      }
      setCatFacets(
        Array.from(map.entries())
          .map(([value, count]) => ({ value, count }))
          .sort((a, b) => b.count - a.count)
      )
    }

    // Brands with counts
    const { data: brandData } = await supabase
      .from('tt_products')
      .select('brand')
      .eq('active', true)
      .not('brand', 'is', null)

    if (brandData) {
      const map = new Map<string, number>()
      for (const r of brandData) {
        const v = r.brand as string
        if (v) map.set(v, (map.get(v) || 0) + 1)
      }
      setBrandFacets(
        Array.from(map.entries())
          .map(([value, count]) => ({ value, count }))
          .sort((a, b) => b.count - a.count)
      )
    }

    // Encastre with counts
    const { data: encData } = await supabase
      .from('tt_products')
      .select('encastre')
      .eq('active', true)
      .not('encastre', 'is', null)

    if (encData) {
      const map = new Map<string, number>()
      for (const r of encData) {
        const v = r.encastre as string
        if (v) map.set(v, (map.get(v) || 0) + 1)
      }
      setEncastreFacets(
        Array.from(map.entries())
          .map(([value, count]) => ({ value, count }))
          .sort((a, b) => b.count - a.count)
      )
    }

    setFacetsLoading(false)
  }, [])

  // Load subcategories (dependent on selected category)
  const loadSubcatFacets = useCallback(async () => {
    const supabase = createClient()
    let q = supabase
      .from('tt_products')
      .select('subcategory')
      .eq('active', true)
      .not('subcategory', 'is', null)

    if (selectedCategory) q = q.eq('category', selectedCategory)

    const { data } = await q
    if (data) {
      const map = new Map<string, number>()
      for (const r of data) {
        const v = r.subcategory as string
        if (v) map.set(v, (map.get(v) || 0) + 1)
      }
      setSubcatFacets(
        Array.from(map.entries())
          .map(([value, count]) => ({ value, count }))
          .sort((a, b) => b.count - a.count)
      )
    }
  }, [selectedCategory])

  // Load series (dependent on selected brand)
  const loadSerieFacets = useCallback(async () => {
    const supabase = createClient()
    let q = supabase
      .from('tt_products')
      .select('serie')
      .eq('active', true)
      .not('serie', 'is', null)

    if (selectedBrand) q = q.ilike('brand', selectedBrand)

    const { data } = await q
    if (data) {
      const map = new Map<string, number>()
      for (const r of data) {
        const v = r.serie as string
        if (v) map.set(v, (map.get(v) || 0) + 1)
      }
      setSerieFacets(
        Array.from(map.entries())
          .map(([value, count]) => ({ value, count }))
          .sort((a, b) => b.count - a.count)
      )
    }
  }, [selectedBrand])

  // ---------- Load products ----------
  const loadProducts = useCallback(async (pageNum: number) => {
    setLoading(true)
    const supabase = createClient()
    const fromOffset = (pageNum - 1) * PAGE_SIZE

    // Sort
    let orderCol = 'name'
    let orderAsc = true
    if (sortBy === 'name_desc') { orderCol = 'name'; orderAsc = false }
    else if (sortBy === 'price_asc') { orderCol = 'price_eur'; orderAsc = true }
    else if (sortBy === 'price_desc') { orderCol = 'price_eur'; orderAsc = false }

    let query = supabase
      .from('tt_products')
      .select(
        'id, sku, name, description, brand, category, subcategory, price_eur, cost_eur, image_url, specs, active, torque_min, torque_max, rpm, encastre, weight_kg, serie, modelo, origin, price_usd, price_ars',
        { count: 'exact' }
      )
      .eq('active', true)
      .order(orderCol, { ascending: orderAsc })
      .range(fromOffset, fromOffset + PAGE_SIZE - 1)

    // Apply filters
    if (selectedBrand) query = query.ilike('brand', selectedBrand)
    if (selectedCategory) query = query.eq('category', selectedCategory)
    if (selectedSubcategory) query = query.eq('subcategory', selectedSubcategory)
    if (selectedSerie) query = query.ilike('serie', selectedSerie)
    if (selectedEncastre) query = query.eq('encastre', selectedEncastre)

    // Range filters
    if (weightRange.min) query = query.gte('weight_kg', parseFloat(weightRange.min))
    if (weightRange.max) query = query.lte('weight_kg', parseFloat(weightRange.max))
    if (torqueRange.min) query = query.gte('torque_min', parseFloat(torqueRange.min))
    if (torqueRange.max) query = query.lte('torque_max', parseFloat(torqueRange.max))
    if (rpmRange.min) query = query.gte('rpm', parseFloat(rpmRange.min))
    if (rpmRange.max) query = query.lte('rpm', parseFloat(rpmRange.max))

    // Search (multi-token AND)
    if (search.trim()) {
      const tokens = search.trim().toLowerCase().split(/\s+/)
      for (const token of tokens) {
        query = query.or(
          `name.ilike.%${token}%,sku.ilike.%${token}%,brand.ilike.%${token}%,category.ilike.%${token}%`
        )
      }
    }

    const { data, count } = await query
    setProducts((data || []) as Product[])
    setTotalCount(count || 0)
    setLoading(false)
  }, [search, selectedBrand, selectedCategory, selectedSubcategory, selectedSerie, selectedEncastre, weightRange, torqueRange, rpmRange, sortBy])

  // ---------- Effects ----------
  useEffect(() => {
    loadFacets()
  }, [loadFacets])

  useEffect(() => {
    loadSubcatFacets()
  }, [loadSubcatFacets])

  useEffect(() => {
    loadSerieFacets()
  }, [loadSerieFacets])

  // Debounced product load on filter change
  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(() => {
      setPage(1)
      loadProducts(1)
      syncUrlParams()
    }, 300)
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current)
    }
  }, [search, selectedBrand, selectedCategory, selectedSubcategory, selectedSerie, selectedEncastre, weightRange, torqueRange, largoRange, rpmRange, stockOnly, sortBy])

  // Page change (no debounce)
  const changePage = useCallback((newPage: number) => {
    if (newPage < 1 || newPage > totalPages) return
    setPage(newPage)
    loadProducts(newPage)
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }, [totalPages, loadProducts])

  // Clear all filters
  const clearFilters = useCallback(() => {
    setSearch('')
    setSelectedCategory(null)
    setSelectedSubcategory(null)
    setSelectedBrand(null)
    setSelectedSerie(null)
    setSelectedEncastre(null)
    setWeightRange({ min: '', max: '' })
    setTorqueRange({ min: '', max: '' })
    setLargoRange({ min: '', max: '' })
    setRpmRange({ min: '', max: '' })
    setStockOnly(false)
  }, [])

  // Check if any filter is active
  const hasActiveFilters = useMemo(() => {
    return !!(
      search || selectedCategory || selectedSubcategory || selectedBrand ||
      selectedSerie || selectedEncastre || weightRange.min || weightRange.max ||
      torqueRange.min || torqueRange.max || largoRange.min || largoRange.max ||
      rpmRange.min || rpmRange.max || stockOnly
    )
  }, [search, selectedCategory, selectedSubcategory, selectedBrand, selectedSerie, selectedEncastre, weightRange, torqueRange, largoRange, rpmRange, stockOnly])

  // ---------- Sidebar content ----------
  const sidebarContent = (
    <div className="flex flex-col h-full">
      <div className="flex-1 overflow-y-auto">
        {/* CATEGORIA */}
        <FilterSection title="Categoria" defaultOpen={true}>
          {facetsLoading ? (
            <div className="flex justify-center py-3"><Loader2 className="animate-spin text-[#4B5563]" size={16} /></div>
          ) : (
            <FacetList
              items={catFacets}
              selected={selectedCategory}
              onSelect={(v) => { setSelectedCategory(v); setSelectedSubcategory(null) }}
            />
          )}
        </FilterSection>

        {/* SUBCATEGORIA */}
        <FilterSection title="Subcategoria" defaultOpen={!!selectedCategory}>
          {subcatFacets.length === 0 ? (
            <p className="text-[10px] text-[#4B5563] italic px-2">
              {selectedCategory ? 'Sin subcategorias' : 'Selecciona una categoria'}
            </p>
          ) : (
            <FacetList
              items={subcatFacets}
              selected={selectedSubcategory}
              onSelect={setSelectedSubcategory}
            />
          )}
        </FilterSection>

        {/* MARCA */}
        <FilterSection title="Marca" defaultOpen={true}>
          {facetsLoading ? (
            <div className="flex justify-center py-3"><Loader2 className="animate-spin text-[#4B5563]" size={16} /></div>
          ) : (
            <FacetList
              items={brandFacets}
              selected={selectedBrand}
              onSelect={(v) => { setSelectedBrand(v); setSelectedSerie(null) }}
            />
          )}
        </FilterSection>

        {/* SERIE */}
        <FilterSection title="Serie" defaultOpen={!!selectedBrand}>
          {serieFacets.length === 0 ? (
            <p className="text-[10px] text-[#4B5563] italic px-2">
              {selectedBrand ? 'Sin series' : 'Selecciona una marca'}
            </p>
          ) : (
            <FacetList
              items={serieFacets}
              selected={selectedSerie}
              onSelect={setSelectedSerie}
            />
          )}
        </FilterSection>

        {/* ENCASTRE */}
        <FilterSection title="Encastre" defaultOpen={false}>
          {facetsLoading ? (
            <div className="flex justify-center py-3"><Loader2 className="animate-spin text-[#4B5563]" size={16} /></div>
          ) : (
            <FacetList
              items={encastreFacets}
              selected={selectedEncastre}
              onSelect={setSelectedEncastre}
            />
          )}
        </FilterSection>

        {/* CARGA (KG) */}
        <FilterSection title="Carga (kg)" defaultOpen={false}>
          <RangeInputs value={weightRange} onChange={setWeightRange} placeholderMin="Min kg" placeholderMax="Max kg" />
        </FilterSection>

        {/* TORQUE (NM) */}
        <FilterSection title="Torque (Nm)" defaultOpen={false}>
          <RangeInputs value={torqueRange} onChange={setTorqueRange} placeholderMin="Min Nm" placeholderMax="Max Nm" />
        </FilterSection>

        {/* LARGO (MM) */}
        <FilterSection title="Largo (mm)" defaultOpen={false}>
          <RangeInputs value={largoRange} onChange={setLargoRange} placeholderMin="Min mm" placeholderMax="Max mm" />
        </FilterSection>

        {/* RPM */}
        <FilterSection title="RPM" defaultOpen={false}>
          <RangeInputs value={rpmRange} onChange={setRpmRange} placeholderMin="Min RPM" placeholderMax="Max RPM" />
        </FilterSection>

        {/* STOCK */}
        <FilterSection title="Stock" defaultOpen={false}>
          <label className="flex items-center gap-2 px-2 py-1 cursor-pointer text-xs text-[#9CA3AF] hover:text-[#F0F2F5]">
            <input
              type="checkbox"
              checked={stockOnly}
              onChange={(e) => setStockOnly(e.target.checked)}
              className="w-4 h-4 rounded border-[#2A3040] bg-[#1E2330] text-[#FF6600] focus:ring-[#FF6600] focus:ring-offset-0"
            />
            Solo con stock
          </label>
        </FilterSection>
      </div>

      {/* LIMPIAR TODOS */}
      <div className="p-4 border-t border-[#1E2330]">
        <button
          onClick={clearFilters}
          disabled={!hasActiveFilters}
          className={`w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg border-2 text-sm font-bold transition-all ${
            hasActiveFilters
              ? 'border-[#FF6600] text-[#FF6600] hover:bg-[#FF6600]/10'
              : 'border-[#2A3040] text-[#4B5563] cursor-not-allowed'
          }`}
        >
          <RotateCcw size={14} />
          LIMPIAR TODOS
        </button>
      </div>
    </div>
  )

  // ---------- Render ----------
  return (
    <div className="flex gap-0 relative min-h-[calc(100vh-200px)]">
      {/* MOBILE SIDEBAR OVERLAY */}
      {sidebarOpen && (
        <div className="fixed inset-0 z-40 lg:hidden">
          <div className="absolute inset-0 bg-black/60" onClick={() => setSidebarOpen(false)} />
          <div className="absolute left-0 top-0 bottom-0 w-[300px] bg-[#0F1218] border-r border-[#1E2330] z-50 flex flex-col animate-in slide-in-from-left duration-200">
            <div className="flex items-center justify-between px-4 py-3 border-b border-[#1E2330]">
              <span className="text-sm font-bold text-[#FF6600]">FILTROS</span>
              <button onClick={() => setSidebarOpen(false)} className="p-1 rounded hover:bg-[#1E2330] text-[#6B7280]">
                <X size={18} />
              </button>
            </div>
            {sidebarContent}
          </div>
        </div>
      )}

      {/* DESKTOP SIDEBAR */}
      <div className="hidden lg:flex flex-col w-[280px] shrink-0 bg-[#0F1218] border border-[#1E2330] rounded-xl mr-4 overflow-hidden">
        <div className="px-4 py-3 border-b border-[#1E2330]">
          <span className="text-sm font-bold text-[#FF6600]">FILTROS</span>
        </div>
        {sidebarContent}
      </div>

      {/* MAIN AREA */}
      <div className="flex-1 min-w-0 space-y-4">
        {/* HEADER BAR */}
        <div className="flex flex-col gap-3">
          <div className="flex items-center justify-between flex-wrap gap-2">
            <h2 className="text-lg font-bold text-[#FF6600] tracking-wide">
              CATALOGO COMPLETO{' '}
              <span className="text-[#6B7280] font-normal text-sm">
                &mdash; {loading ? '...' : `${totalCount.toLocaleString('es-AR')} PRODUCTOS`}
              </span>
            </h2>
            <div className="flex items-center gap-2">
              {/* Mobile filter toggle */}
              <Button
                variant="secondary"
                size="sm"
                className="lg:hidden"
                onClick={() => setSidebarOpen(true)}
              >
                <SlidersHorizontal size={14} />
                Filtros
              </Button>
              <ExportButton
                data={products as unknown as Record<string, unknown>[]}
                filename="productos_torquetools"
                columns={[
                  { key: 'sku', label: 'SKU' },
                  { key: 'name', label: 'Nombre' },
                  { key: 'brand', label: 'Marca' },
                  { key: 'category', label: 'Categoria' },
                  { key: 'subcategory', label: 'Subcategoria' },
                  { key: 'encastre', label: 'Encastre' },
                  { key: 'price_eur', label: 'Precio EUR' },
                  { key: 'cost_eur', label: 'Costo EUR' },
                  { key: 'torque_min', label: 'Torque Min' },
                  { key: 'torque_max', label: 'Torque Max' },
                  { key: 'rpm', label: 'RPM' },
                ]}
              />
              <ImportButton
                targetTable="tt_products"
                fields={[
                  { key: 'sku', label: 'SKU', required: true },
                  { key: 'name', label: 'Nombre', required: true },
                  { key: 'brand', label: 'Marca' },
                  { key: 'category', label: 'Categoria' },
                  { key: 'subcategory', label: 'Subcategoria' },
                  { key: 'price_eur', label: 'Precio EUR', type: 'number' },
                  { key: 'cost_eur', label: 'Costo EUR', type: 'number' },
                  { key: 'price_usd', label: 'Precio USD', type: 'number' },
                  { key: 'image_url', label: 'URL Imagen' },
                  { key: 'description', label: 'Descripcion' },
                  { key: 'origin', label: 'Origen' },
                  { key: 'encastre', label: 'Encastre' },
                  { key: 'torque_min', label: 'Torque Min', type: 'number' },
                  { key: 'torque_max', label: 'Torque Max', type: 'number' },
                  { key: 'rpm', label: 'RPM', type: 'number' },
                  { key: 'weight_kg', label: 'Peso (kg)', type: 'number' },
                ]}
                permission="edit_products"
              />
            </div>
          </div>

          {/* Search + controls row */}
          <div className="flex items-center gap-3 flex-wrap">
            <SearchBar
              placeholder="Buscar por SKU, nombre, marca, categoria..."
              value={search}
              onChange={setSearch}
              className="flex-1 min-w-[200px]"
            />

            {/* View toggle */}
            <div className="flex items-center bg-[#0F1218] border border-[#1E2330] rounded-lg p-0.5">
              <button
                onClick={() => setViewMode('table')}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-all ${
                  viewMode === 'table'
                    ? 'bg-[#1E2330] text-[#FF6600]'
                    : 'text-[#6B7280] hover:text-[#9CA3AF]'
                }`}
              >
                <List size={14} /> TABLA
              </button>
              <button
                onClick={() => setViewMode('grid')}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-all ${
                  viewMode === 'grid'
                    ? 'bg-[#1E2330] text-[#FF6600]'
                    : 'text-[#6B7280] hover:text-[#9CA3AF]'
                }`}
              >
                <Grid3X3 size={14} /> TARJETAS
              </button>
            </div>

            {/* Sort */}
            <Select
              options={[
                { value: 'name_asc', label: 'A \u2192 Z' },
                { value: 'name_desc', label: 'Z \u2192 A' },
                { value: 'price_asc', label: 'Precio \u2191' },
                { value: 'price_desc', label: 'Precio \u2193' },
              ]}
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value as SortOption)}
              className="w-[140px]"
            />
          </div>

          {/* Active filter badges */}
          {hasActiveFilters && (
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-[10px] text-[#4B5563] uppercase">Filtros activos:</span>
              {selectedCategory && (
                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-[#FF6600]/15 text-[#FF6600] text-[10px] font-medium">
                  Cat: {selectedCategory}
                  <button onClick={() => { setSelectedCategory(null); setSelectedSubcategory(null) }}><X size={10} /></button>
                </span>
              )}
              {selectedSubcategory && (
                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-[#FF6600]/15 text-[#FF6600] text-[10px] font-medium">
                  Subcat: {selectedSubcategory}
                  <button onClick={() => setSelectedSubcategory(null)}><X size={10} /></button>
                </span>
              )}
              {selectedBrand && (
                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-[#FF6600]/15 text-[#FF6600] text-[10px] font-medium">
                  Marca: {selectedBrand}
                  <button onClick={() => { setSelectedBrand(null); setSelectedSerie(null) }}><X size={10} /></button>
                </span>
              )}
              {selectedSerie && (
                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-[#FF6600]/15 text-[#FF6600] text-[10px] font-medium">
                  Serie: {selectedSerie}
                  <button onClick={() => setSelectedSerie(null)}><X size={10} /></button>
                </span>
              )}
              {selectedEncastre && (
                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-[#FF6600]/15 text-[#FF6600] text-[10px] font-medium">
                  Encastre: {selectedEncastre}
                  <button onClick={() => setSelectedEncastre(null)}><X size={10} /></button>
                </span>
              )}
              {(torqueRange.min || torqueRange.max) && (
                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-[#FF6600]/15 text-[#FF6600] text-[10px] font-medium">
                  Torque: {torqueRange.min || '0'}-{torqueRange.max || '*'} Nm
                  <button onClick={() => setTorqueRange({ min: '', max: '' })}><X size={10} /></button>
                </span>
              )}
              {(weightRange.min || weightRange.max) && (
                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-[#FF6600]/15 text-[#FF6600] text-[10px] font-medium">
                  Carga: {weightRange.min || '0'}-{weightRange.max || '*'} kg
                  <button onClick={() => setWeightRange({ min: '', max: '' })}><X size={10} /></button>
                </span>
              )}
              {(rpmRange.min || rpmRange.max) && (
                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-[#FF6600]/15 text-[#FF6600] text-[10px] font-medium">
                  RPM: {rpmRange.min || '0'}-{rpmRange.max || '*'}
                  <button onClick={() => setRpmRange({ min: '', max: '' })}><X size={10} /></button>
                </span>
              )}
              <button
                onClick={clearFilters}
                className="text-[10px] text-[#FF6600] hover:text-[#FF8833] font-medium underline ml-1"
              >
                Limpiar todos
              </button>
            </div>
          )}
        </div>

        {/* LOADING STATE */}
        {loading ? (
          <div className="flex flex-col items-center justify-center py-20">
            <Loader2 className="animate-spin text-[#FF6600] mb-3" size={32} />
            <p className="text-sm text-[#4B5563]">Cargando productos...</p>
          </div>
        ) : products.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 text-[#4B5563]">
            <Package size={48} className="mb-4" />
            <p className="text-lg font-medium">No se encontraron productos</p>
            <p className="text-sm mt-1">Proba ajustando los filtros o la busqueda</p>
            {hasActiveFilters && (
              <Button variant="outline" size="sm" className="mt-4" onClick={clearFilters}>
                <RotateCcw size={14} /> Limpiar filtros
              </Button>
            )}
          </div>
        ) : viewMode === 'table' ? (
          /* ============== TABLE VIEW ============== */
          <div className="rounded-xl border border-[#1E2330] overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-[#0F1218] border-b border-[#1E2330]">
                  <tr>
                    <th className="px-3 py-3 text-left text-xs font-semibold text-[#6B7280] uppercase tracking-wider w-[70px]">
                      Foto
                    </th>
                    <th
                      className="px-3 py-3 text-left text-xs font-semibold text-[#6B7280] uppercase tracking-wider cursor-pointer hover:text-[#FF6600] transition-colors"
                      onClick={() => setSortBy(sortBy === 'name_asc' ? 'name_desc' : 'name_asc')}
                    >
                      <span className="flex items-center gap-1">
                        Marca <ArrowUpDown size={12} />
                      </span>
                    </th>
                    <th className="px-3 py-3 text-left text-xs font-semibold text-[#6B7280] uppercase tracking-wider">
                      SKU
                    </th>
                    <th
                      className="px-3 py-3 text-left text-xs font-semibold text-[#6B7280] uppercase tracking-wider cursor-pointer hover:text-[#FF6600] transition-colors"
                      onClick={() => setSortBy(sortBy === 'name_asc' ? 'name_desc' : 'name_asc')}
                    >
                      <span className="flex items-center gap-1">
                        Nombre <ArrowUpDown size={12} />
                      </span>
                    </th>
                    <th className="px-3 py-3 text-left text-xs font-semibold text-[#6B7280] uppercase tracking-wider">
                      Subcat
                    </th>
                    <th className="px-3 py-3 text-left text-xs font-semibold text-[#6B7280] uppercase tracking-wider">
                      Encastre
                    </th>
                    <th
                      className="px-3 py-3 text-right text-xs font-semibold text-[#6B7280] uppercase tracking-wider cursor-pointer hover:text-[#FF6600] transition-colors"
                      onClick={() => setSortBy(sortBy === 'price_asc' ? 'price_desc' : 'price_asc')}
                    >
                      <span className="flex items-center justify-end gap-1">
                        Precio &euro; <ArrowUpDown size={12} />
                      </span>
                    </th>
                    <th className="px-3 py-3 text-center text-xs font-semibold text-[#6B7280] uppercase tracking-wider w-[100px]">
                      Cotizar
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#1E2330]">
                  {products.map((product) => (
                    <tr
                      key={product.id}
                      className="hover:bg-[#1A1F2E] transition-colors group"
                    >
                      {/* FOTO */}
                      <td className="px-3 py-2">
                        <div className="w-[50px] h-[50px] rounded-lg bg-[#0F1218] border border-[#1E2330] flex items-center justify-center overflow-hidden">
                          {product.image_url ? (
                            <img
                              src={product.image_url}
                              alt={product.name}
                              referrerPolicy="no-referrer"
                              className="w-full h-full object-contain p-1"
                              onError={(e) => {
                                (e.target as HTMLImageElement).style.display = 'none';
                                (e.target as HTMLImageElement).parentElement!.innerHTML = '<span style="font-size:20px">&#128230;</span>'
                              }}
                            />
                          ) : (
                            <span className="text-xl">&#128230;</span>
                          )}
                        </div>
                      </td>
                      {/* MARCA */}
                      <td className="px-3 py-2">
                        <Badge variant="default" size="sm">{product.brand}</Badge>
                      </td>
                      {/* SKU */}
                      <td className="px-3 py-2">
                        <button
                          onClick={() => setSelectedProduct(product)}
                          className="font-mono text-xs text-[#FF6600] hover:text-[#FF8833] hover:underline transition-colors"
                        >
                          {product.sku}
                        </button>
                      </td>
                      {/* NOMBRE */}
                      <td className="px-3 py-2">
                        <button
                          onClick={() => setSelectedProduct(product)}
                          className="text-sm text-[#F0F2F5] hover:text-[#FF6600] transition-colors text-left max-w-[300px] truncate block"
                        >
                          {product.name}
                        </button>
                      </td>
                      {/* SUBCAT */}
                      <td className="px-3 py-2 text-xs text-[#6B7280]">
                        {product.subcategory || '-'}
                      </td>
                      {/* ENCASTRE */}
                      <td className="px-3 py-2 text-xs text-[#9CA3AF]">
                        {product.encastre || '-'}
                      </td>
                      {/* PRECIO */}
                      <td className="px-3 py-2 text-right">
                        <span className="font-bold text-[#FF6600]">
                          {product.price_eur > 0 ? formatCurrency(product.price_eur, 'EUR') : 'Consultar'}
                        </span>
                      </td>
                      {/* COTIZAR */}
                      <td className="px-3 py-2 text-center">
                        <button
                          onClick={(e) => {
                            e.stopPropagation()
                            setSelectedProduct(product)
                          }}
                          className="px-3 py-1.5 rounded-lg bg-[#FF6600] hover:bg-[#E55A00] text-white text-xs font-bold transition-all shadow-lg shadow-orange-500/20"
                        >
                          COTIZAR
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        ) : (
          /* ============== CARD/GRID VIEW ============== */
          <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4 gap-4">
            {products.map((product) => (
              <div
                key={product.id}
                onClick={() => setSelectedProduct(product)}
                className="rounded-xl bg-[#141820] border border-[#1E2330] p-4 hover:border-[#2A3040] hover:bg-[#1A1F2E] transition-all duration-200 cursor-pointer flex flex-col"
              >
                <div className="aspect-square rounded-lg bg-[#0F1218] border border-[#1E2330] flex items-center justify-center mb-3 overflow-hidden">
                  {product.image_url ? (
                    <img
                      src={product.image_url}
                      alt={product.name}
                      referrerPolicy="no-referrer"
                      className="w-full h-full object-contain p-2"
                      onError={(e) => { (e.target as HTMLImageElement).style.display = 'none' }}
                    />
                  ) : (
                    <Package size={40} className="text-[#2A3040]" />
                  )}
                </div>
                <Badge variant="default" className="w-fit mb-2">{product.brand}</Badge>
                <p className="text-xs font-mono text-[#FF6600] mb-1">{product.sku}</p>
                <h3 className="text-sm font-medium text-[#F0F2F5] line-clamp-2 flex-1">{product.name}</h3>
                {product.encastre && <p className="text-[10px] text-[#6B7280] mt-1">Encastre: {product.encastre}</p>}
                <div className="flex items-center justify-between mt-3">
                  <p className="text-lg font-bold text-[#FF6600]">
                    {product.price_eur > 0 ? formatCurrency(product.price_eur, 'EUR') : 'Consultar'}
                  </p>
                  <button
                    onClick={(e) => { e.stopPropagation(); setSelectedProduct(product) }}
                    className="px-3 py-1.5 rounded-lg bg-[#FF6600] hover:bg-[#E55A00] text-white text-xs font-bold transition-all shadow-lg shadow-orange-500/20"
                  >
                    COTIZAR
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* PAGINATION */}
        {!loading && totalCount > 0 && (
          <div className="flex items-center justify-between pt-4 border-t border-[#1E2330]">
            <button
              onClick={() => changePage(page - 1)}
              disabled={page <= 1}
              className={`flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-medium transition-all ${
                page <= 1
                  ? 'text-[#4B5563] cursor-not-allowed'
                  : 'text-[#F0F2F5] hover:bg-[#1E2330] bg-[#141820] border border-[#2A3040]'
              }`}
            >
              <ChevronLeft size={16} /> ANTERIOR
            </button>

            <div className="flex items-center gap-2 text-sm text-[#6B7280]">
              <span>
                Pagina <strong className="text-[#F0F2F5]">{page}</strong> de <strong className="text-[#F0F2F5]">{totalPages}</strong>
              </span>
              <span className="text-[#4B5563]">&middot;</span>
              <span>{totalCount.toLocaleString('es-AR')} productos</span>
            </div>

            <button
              onClick={() => changePage(page + 1)}
              disabled={page >= totalPages}
              className={`flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-medium transition-all ${
                page >= totalPages
                  ? 'text-[#4B5563] cursor-not-allowed'
                  : 'text-[#F0F2F5] hover:bg-[#1E2330] bg-[#141820] border border-[#2A3040]'
              }`}
            >
              SIGUIENTE <ChevronRight size={16} />
            </button>
          </div>
        )}
      </div>

      {/* PRODUCT DETAIL MODAL */}
      <Modal isOpen={!!selectedProduct} onClose={() => setSelectedProduct(null)} title={selectedProduct?.name || ''} size="xl">
        {selectedProduct && (
          <div className="space-y-6">
            <div className="flex flex-col sm:flex-row gap-6">
              {/* Image */}
              <div className="w-full sm:w-64 aspect-square rounded-lg bg-[#0F1218] border border-[#1E2330] flex items-center justify-center shrink-0 overflow-hidden">
                {selectedProduct.image_url ? (
                  <img
                    src={selectedProduct.image_url}
                    alt={selectedProduct.name}
                    referrerPolicy="no-referrer"
                    className="w-full h-full object-contain p-4"
                    onError={(e) => { (e.target as HTMLImageElement).style.display = 'none' }}
                  />
                ) : (
                  <Package size={64} className="text-[#2A3040]" />
                )}
              </div>

              {/* Info */}
              <div className="flex-1 space-y-3">
                <div className="flex items-center gap-2 flex-wrap">
                  <Badge variant="orange" size="md">{selectedProduct.brand}</Badge>
                  {selectedProduct.category && <Badge variant="default" size="md">{selectedProduct.category}</Badge>}
                  {selectedProduct.subcategory && <Badge variant="info" size="md">{selectedProduct.subcategory}</Badge>}
                </div>
                <p className="text-sm font-mono text-[#6B7280]">SKU: {selectedProduct.sku}</p>
                {selectedProduct.modelo && <p className="text-sm text-[#9CA3AF]">Modelo: {selectedProduct.modelo}</p>}
                {selectedProduct.serie && <p className="text-sm text-[#9CA3AF]">Serie: {selectedProduct.serie}</p>}
                {selectedProduct.description && <p className="text-sm text-[#D1D5DB] mt-2">{selectedProduct.description}</p>}
                <p className="text-3xl font-bold text-[#FF6600] mt-4">
                  {selectedProduct.price_eur > 0 ? formatCurrency(selectedProduct.price_eur, 'EUR') : 'Consultar precio'}
                </p>
                {selectedProduct.price_usd && selectedProduct.price_usd > 0 && (
                  <p className="text-sm text-[#6B7280]">USD {formatCurrency(selectedProduct.price_usd, 'USD')}</p>
                )}
              </div>
            </div>

            {/* Technical specs grid */}
            <div>
              <h4 className="text-sm font-semibold text-[#F0F2F5] mb-3">Especificaciones Tecnicas</h4>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                {selectedProduct.torque_min != null && (
                  <div className="flex justify-between p-2.5 rounded-lg bg-[#0F1218] border border-[#1E2330]">
                    <span className="text-xs text-[#6B7280]">Torque Min</span>
                    <span className="text-xs font-medium text-[#F0F2F5]">{selectedProduct.torque_min} Nm</span>
                  </div>
                )}
                {selectedProduct.torque_max != null && (
                  <div className="flex justify-between p-2.5 rounded-lg bg-[#0F1218] border border-[#1E2330]">
                    <span className="text-xs text-[#6B7280]">Torque Max</span>
                    <span className="text-xs font-medium text-[#F0F2F5]">{selectedProduct.torque_max} Nm</span>
                  </div>
                )}
                {selectedProduct.rpm != null && (
                  <div className="flex justify-between p-2.5 rounded-lg bg-[#0F1218] border border-[#1E2330]">
                    <span className="text-xs text-[#6B7280]">RPM</span>
                    <span className="text-xs font-medium text-[#F0F2F5]">{selectedProduct.rpm}</span>
                  </div>
                )}
                {selectedProduct.encastre && (
                  <div className="flex justify-between p-2.5 rounded-lg bg-[#0F1218] border border-[#1E2330]">
                    <span className="text-xs text-[#6B7280]">Encastre</span>
                    <span className="text-xs font-medium text-[#F0F2F5]">{selectedProduct.encastre}</span>
                  </div>
                )}
                {selectedProduct.weight_kg != null && (
                  <div className="flex justify-between p-2.5 rounded-lg bg-[#0F1218] border border-[#1E2330]">
                    <span className="text-xs text-[#6B7280]">Peso</span>
                    <span className="text-xs font-medium text-[#F0F2F5]">{selectedProduct.weight_kg} kg</span>
                  </div>
                )}
                {selectedProduct.origin && (
                  <div className="flex justify-between p-2.5 rounded-lg bg-[#0F1218] border border-[#1E2330]">
                    <span className="text-xs text-[#6B7280]">Origen</span>
                    <span className="text-xs font-medium text-[#F0F2F5]">{selectedProduct.origin}</span>
                  </div>
                )}
              </div>
            </div>

            {/* JSONB specs */}
            {selectedProduct.specs && Object.keys(selectedProduct.specs).length > 0 && (
              <div>
                <h4 className="text-sm font-semibold text-[#F0F2F5] mb-3">Especificaciones Adicionales</h4>
                <div className="grid grid-cols-2 gap-2">
                  {Object.entries(selectedProduct.specs).map(([key, value]) => (
                    <div key={key} className="flex justify-between p-2.5 rounded-lg bg-[#0F1218] border border-[#1E2330]">
                      <span className="text-xs text-[#6B7280]">{key}</span>
                      <span className="text-xs font-medium text-[#F0F2F5]">{String(value)}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Action */}
            <div className="flex gap-3 pt-2">
              <Button variant="primary" className="flex-1 gap-2">
                <ShoppingCart size={16} /> Agregar a cotizacion
              </Button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  )
}

// ===============================================================
// CATEGORIAS TAB (kept as-is)
// ===============================================================
function CategoriasTab() {
  const supabase = createClient()
  const [categories, setCategories] = useState<Array<{ name: string; count: number }>>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    (async () => {
      setLoading(true)
      const { data } = await supabase.from('tt_products').select('category').eq('active', true)
      const map = new Map<string, number>()
      for (const p of (data || [])) { const cat = (p.category as string) || 'Sin categoria'; map.set(cat, (map.get(cat) || 0) + 1) }
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

// ===============================================================
// MARCAS TAB (kept as-is)
// ===============================================================
function MarcasTab() {
  const supabase = createClient()
  const [brands, setBrands] = useState<Array<{ name: string; count: number; avgPrice: number }>>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    (async () => {
      setLoading(true)
      const { data } = await supabase.from('tt_products').select('brand, price_eur').eq('active', true)
      const map = new Map<string, { count: number; totalPrice: number }>()
      for (const p of (data || [])) { const brand = (p.brand as string) || 'Sin marca'; const existing = map.get(brand) || { count: 0, totalPrice: 0 }; existing.count++; existing.totalPrice += (p.price_eur as number) || 0; map.set(brand, existing) }
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

// ===============================================================
// TARIFAS TAB (kept as-is)
// ===============================================================
function TarifasTab() {
  const supabase = createClient()
  const [products, setProducts] = useState<Row[]>([])
  const [loading, setLoading] = useState(true)
  const [brandFilter, setBrandFilter] = useState('')

  const load = useCallback(async () => {
    setLoading(true)
    let q = supabase.from('tt_products').select('id, sku, name, brand, price_eur, cost_eur').eq('active', true).order('brand').order('name')
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
          <Select options={[{ value: '', label: 'Todas' }, ...BRANDS_STATIC.map(b => ({ value: b, label: b }))]} value={brandFilter} onChange={(e) => setBrandFilter(e.target.value)} />
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
                  <TableCell className="font-bold text-[#FF6600]">{formatCurrency((p.price_eur as number) || 0)}</TableCell>
                  <TableCell className="text-[#6B7280]">{formatCurrency((p.cost_eur as number) || 0)}</TableCell>
                  <TableCell>EUR</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </Card>
    </div>
  )
}

// ===============================================================
// MAIN PAGE
// ===============================================================
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
