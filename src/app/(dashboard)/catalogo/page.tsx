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
  SlidersHorizontal, ChevronLeft, Upload, Trash2, Edit3, Eye, FileSpreadsheet,
  Check, Percent, ArrowLeft, ToggleLeft, ToggleRight
} from 'lucide-react'
import { useToast } from '@/components/ui/toast'
import { useCompanyContext } from '@/lib/company-context'
import { Input } from '@/components/ui/input'

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
                targetTable="tt_products"
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
                      <td className="px-3 py-2 text-right whitespace-nowrap">
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
// TARIFAS TAB — Full CRUD for price lists
// ===============================================================

interface PriceList {
  id: string
  name: string
  description: string | null
  currency: 'EUR' | 'USD' | 'ARS'
  is_default: boolean
  markup_pct: number
  active: boolean
  company_id: string | null
  created_at: string
  updated_at: string
  item_count?: number
}

interface PriceListItem {
  id: string
  price_list_id: string
  product_id: string
  price: number
  created_at: string
  product?: {
    id: string
    sku: string
    name: string
    brand: string
    price_eur: number
    cost_eur: number
    image_url: string | null
  }
}

interface PriceListFormData {
  name: string
  description: string
  currency: 'EUR' | 'USD' | 'ARS'
  markup_pct: number
  is_default: boolean
  active: boolean
}

const EMPTY_FORM: PriceListFormData = {
  name: '',
  description: '',
  currency: 'EUR',
  markup_pct: 0,
  is_default: false,
  active: true,
}

function TarifasTab() {
  const { addToast } = useToast()
  const { activeCompanyId } = useCompanyContext()

  // ---------- View state ----------
  const [view, setView] = useState<'list' | 'detail'>('list')
  const [selectedList, setSelectedList] = useState<PriceList | null>(null)

  // ---------- Price Lists state ----------
  const [priceLists, setPriceLists] = useState<PriceList[]>([])
  const [loading, setLoading] = useState(true)

  // ---------- Modal state ----------
  const [modalOpen, setModalOpen] = useState(false)
  const [editingList, setEditingList] = useState<PriceList | null>(null)
  const [form, setForm] = useState<PriceListFormData>(EMPTY_FORM)
  const [saving, setSaving] = useState(false)

  // ---------- Detail state ----------
  const [listItems, setListItems] = useState<PriceListItem[]>([])
  const [detailLoading, setDetailLoading] = useState(false)
  const [itemSearch, setItemSearch] = useState('')
  const [addProductSearch, setAddProductSearch] = useState('')
  const [addProductResults, setAddProductResults] = useState<Product[]>([])
  const [addProductLoading, setAddProductLoading] = useState(false)
  const [showAddProduct, setShowAddProduct] = useState(false)
  const [bulkMarkup, setBulkMarkup] = useState('')
  const [bulkApplying, setBulkApplying] = useState(false)
  const [editingItemId, setEditingItemId] = useState<string | null>(null)
  const [editingPrice, setEditingPrice] = useState('')

  // ---------- CSV Import state ----------
  const [showImportModal, setShowImportModal] = useState(false)
  const [importFile, setImportFile] = useState<File | null>(null)
  const [importing, setImporting] = useState(false)
  const [importPreview, setImportPreview] = useState<Array<{ sku: string; price: number }>>([])

  // ---------- Delete confirm ----------
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null)

  // ==========================================
  // Load price lists
  // ==========================================
  const loadPriceLists = useCallback(async () => {
    setLoading(true)
    const sb = createClient()

    const { data: lists, error } = await sb
      .from('tt_price_lists')
      .select('*')
      .order('is_default', { ascending: false })
      .order('name')

    if (error) {
      addToast({ type: 'error', title: 'Error cargando tarifas', message: error.message })
      setLoading(false)
      return
    }

    // Get item counts for each list
    if (lists && lists.length > 0) {
      const sb2 = createClient()
      const { data: countData } = await sb2
        .from('tt_price_list_items')
        .select('price_list_id')

      const countMap = new Map<string, number>()
      if (countData) {
        for (const row of countData) {
          const plId = row.price_list_id as string
          countMap.set(plId, (countMap.get(plId) || 0) + 1)
        }
      }

      const listsWithCount = (lists as PriceList[]).map(l => ({
        ...l,
        item_count: countMap.get(l.id) || 0,
      }))
      setPriceLists(listsWithCount)
    } else {
      setPriceLists([])
    }

    setLoading(false)
  }, [addToast])

  useEffect(() => { loadPriceLists() }, [loadPriceLists])

  // ==========================================
  // Create / Update price list
  // ==========================================
  const openCreateModal = useCallback(() => {
    setEditingList(null)
    setForm(EMPTY_FORM)
    setModalOpen(true)
  }, [])

  const openEditModal = useCallback((pl: PriceList) => {
    setEditingList(pl)
    setForm({
      name: pl.name,
      description: pl.description || '',
      currency: pl.currency,
      markup_pct: pl.markup_pct,
      is_default: pl.is_default,
      active: pl.active,
    })
    setModalOpen(true)
  }, [])

  const handleSave = useCallback(async () => {
    if (!form.name.trim()) {
      addToast({ type: 'warning', title: 'Nombre requerido' })
      return
    }

    setSaving(true)
    const sb = createClient()

    // If setting as default, unset others first
    if (form.is_default) {
      await sb
        .from('tt_price_lists')
        .update({ is_default: false })
        .neq('id', editingList?.id || '')
    }

    const payload = {
      name: form.name.trim(),
      description: form.description.trim() || null,
      currency: form.currency,
      markup_pct: form.markup_pct,
      is_default: form.is_default,
      active: form.active,
      company_id: activeCompanyId,
      updated_at: new Date().toISOString(),
    }

    let error
    if (editingList) {
      const res = await sb
        .from('tt_price_lists')
        .update(payload)
        .eq('id', editingList.id)
      error = res.error
    } else {
      const res = await sb
        .from('tt_price_lists')
        .insert({ ...payload, created_at: new Date().toISOString() })
      error = res.error
    }

    setSaving(false)

    if (error) {
      addToast({ type: 'error', title: 'Error guardando tarifa', message: error.message })
      return
    }

    addToast({ type: 'success', title: editingList ? 'Tarifa actualizada' : 'Tarifa creada' })
    setModalOpen(false)
    loadPriceLists()
  }, [form, editingList, activeCompanyId, addToast, loadPriceLists])

  // ==========================================
  // Delete price list
  // ==========================================
  const handleDelete = useCallback(async (plId: string) => {
    const sb = createClient()
    // Delete items first
    await sb.from('tt_price_list_items').delete().eq('price_list_id', plId)
    const { error } = await sb.from('tt_price_lists').delete().eq('id', plId)
    if (error) {
      addToast({ type: 'error', title: 'Error eliminando tarifa', message: error.message })
    } else {
      addToast({ type: 'success', title: 'Tarifa eliminada' })
      setDeleteConfirm(null)
      loadPriceLists()
    }
  }, [addToast, loadPriceLists])

  // ==========================================
  // Toggle active
  // ==========================================
  const toggleActive = useCallback(async (pl: PriceList) => {
    const sb = createClient()
    const { error } = await sb
      .from('tt_price_lists')
      .update({ active: !pl.active, updated_at: new Date().toISOString() })
      .eq('id', pl.id)

    if (error) {
      addToast({ type: 'error', title: 'Error', message: error.message })
    } else {
      loadPriceLists()
    }
  }, [addToast, loadPriceLists])

  // ==========================================
  // Load detail items
  // ==========================================
  const loadDetailItems = useCallback(async (pl: PriceList) => {
    setDetailLoading(true)
    const sb = createClient()

    const { data, error } = await sb
      .from('tt_price_list_items')
      .select('id, price_list_id, product_id, price, created_at')
      .eq('price_list_id', pl.id)
      .order('created_at', { ascending: false })

    if (error) {
      addToast({ type: 'error', title: 'Error cargando items', message: error.message })
      setDetailLoading(false)
      return
    }

    // Fetch product details for each item
    if (data && data.length > 0) {
      const sb2 = createClient()
      const productIds = data.map(d => d.product_id as string)
      const { data: products } = await sb2
        .from('tt_products')
        .select('id, sku, name, brand, price_eur, cost_eur, image_url')
        .in('id', productIds)

      const productMap = new Map<string, Product>()
      if (products) {
        for (const p of products) {
          productMap.set(p.id, p as unknown as Product)
        }
      }

      const itemsWithProducts = (data as PriceListItem[]).map(item => ({
        ...item,
        product: productMap.get(item.product_id) as PriceListItem['product'],
      }))
      setListItems(itemsWithProducts)
    } else {
      setListItems([])
    }

    setDetailLoading(false)
  }, [addToast])

  const openDetail = useCallback((pl: PriceList) => {
    setSelectedList(pl)
    setView('detail')
    setItemSearch('')
    setShowAddProduct(false)
    loadDetailItems(pl)
  }, [loadDetailItems])

  // ==========================================
  // Search products to add
  // ==========================================
  const searchProducts = useCallback(async (query: string) => {
    if (!query.trim() || query.trim().length < 2) {
      setAddProductResults([])
      return
    }
    setAddProductLoading(true)
    const sb = createClient()

    const tokens = query.trim().toLowerCase().split(/\s+/)
    let q = sb
      .from('tt_products')
      .select('id, sku, name, brand, price_eur, cost_eur, image_url')
      .eq('active', true)

    for (const token of tokens) {
      q = q.or(`name.ilike.%${token}%,sku.ilike.%${token}%,brand.ilike.%${token}%`)
    }

    const { data } = await q.limit(20)
    setAddProductResults((data || []) as unknown as Product[])
    setAddProductLoading(false)
  }, [])

  // Debounced search
  const addProductDebounceRef = useRef<NodeJS.Timeout | null>(null)
  useEffect(() => {
    if (addProductDebounceRef.current) clearTimeout(addProductDebounceRef.current)
    addProductDebounceRef.current = setTimeout(() => {
      searchProducts(addProductSearch)
    }, 300)
    return () => {
      if (addProductDebounceRef.current) clearTimeout(addProductDebounceRef.current)
    }
  }, [addProductSearch, searchProducts])

  // ==========================================
  // Add product to list
  // ==========================================
  const addProductToList = useCallback(async (product: Product) => {
    if (!selectedList) return
    const sb = createClient()

    // Calculate price from markup if available
    const basePrice = product.price_eur || 0
    const markup = selectedList.markup_pct || 0
    const price = basePrice > 0 ? basePrice * (1 + markup / 100) : 0

    const { error } = await sb
      .from('tt_price_list_items')
      .upsert({
        price_list_id: selectedList.id,
        product_id: product.id,
        price: Math.round(price * 100) / 100,
        created_at: new Date().toISOString(),
      }, { onConflict: 'price_list_id,product_id' })

    if (error) {
      addToast({ type: 'error', title: 'Error agregando producto', message: error.message })
    } else {
      addToast({ type: 'success', title: 'Producto agregado', message: product.sku })
      loadDetailItems(selectedList)
      loadPriceLists()
    }
  }, [selectedList, addToast, loadDetailItems, loadPriceLists])

  // ==========================================
  // Remove product from list
  // ==========================================
  const removeItem = useCallback(async (itemId: string) => {
    if (!selectedList) return
    const sb = createClient()
    const { error } = await sb
      .from('tt_price_list_items')
      .delete()
      .eq('id', itemId)

    if (error) {
      addToast({ type: 'error', title: 'Error eliminando item', message: error.message })
    } else {
      addToast({ type: 'success', title: 'Producto removido de la tarifa' })
      loadDetailItems(selectedList)
      loadPriceLists()
    }
  }, [selectedList, addToast, loadDetailItems, loadPriceLists])

  // ==========================================
  // Update item price
  // ==========================================
  const saveItemPrice = useCallback(async (itemId: string, newPrice: number) => {
    const sb = createClient()
    const { error } = await sb
      .from('tt_price_list_items')
      .update({ price: Math.round(newPrice * 100) / 100 })
      .eq('id', itemId)

    if (error) {
      addToast({ type: 'error', title: 'Error actualizando precio', message: error.message })
    } else {
      setEditingItemId(null)
      setEditingPrice('')
      if (selectedList) loadDetailItems(selectedList)
    }
  }, [addToast, selectedList, loadDetailItems])

  // ==========================================
  // Bulk apply markup
  // ==========================================
  const applyBulkMarkup = useCallback(async () => {
    if (!selectedList || !bulkMarkup) return
    const markupPct = parseFloat(bulkMarkup)
    if (isNaN(markupPct)) {
      addToast({ type: 'warning', title: 'Markup invalido' })
      return
    }

    setBulkApplying(true)
    const sb = createClient()

    // Get all items with their product catalog prices
    const { data: items } = await sb
      .from('tt_price_list_items')
      .select('id, product_id')
      .eq('price_list_id', selectedList.id)

    if (!items || items.length === 0) {
      addToast({ type: 'warning', title: 'No hay productos en la lista' })
      setBulkApplying(false)
      return
    }

    const sb2 = createClient()
    const productIds = items.map(i => i.product_id as string)
    const { data: products } = await sb2
      .from('tt_products')
      .select('id, price_eur')
      .in('id', productIds)

    if (!products) {
      setBulkApplying(false)
      return
    }

    const priceMap = new Map<string, number>()
    for (const p of products) {
      priceMap.set(p.id, (p.price_eur as number) || 0)
    }

    // Update each item
    const sb3 = createClient()
    let updated = 0
    for (const item of items) {
      const catalogPrice = priceMap.get(item.product_id as string) || 0
      if (catalogPrice > 0) {
        const newPrice = Math.round(catalogPrice * (1 + markupPct / 100) * 100) / 100
        const { error } = await sb3
          .from('tt_price_list_items')
          .update({ price: newPrice })
          .eq('id', item.id)
        if (!error) updated++
      }
    }

    // Also update the markup_pct on the list itself
    const sb4 = createClient()
    await sb4
      .from('tt_price_lists')
      .update({ markup_pct: markupPct, updated_at: new Date().toISOString() })
      .eq('id', selectedList.id)

    setBulkApplying(false)
    addToast({
      type: 'success',
      title: `Markup ${markupPct}% aplicado`,
      message: `${updated} de ${items.length} productos actualizados`,
    })
    loadDetailItems(selectedList)
    loadPriceLists()
  }, [selectedList, bulkMarkup, addToast, loadDetailItems, loadPriceLists])

  // ==========================================
  // CSV Import
  // ==========================================
  const handleFileChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    setImportFile(file)

    const reader = new FileReader()
    reader.onload = (ev) => {
      const text = ev.target?.result as string
      const lines = text.split('\n').filter(l => l.trim())
      // Skip header
      const header = lines[0].toLowerCase()
      const hasSku = header.includes('sku')
      const startIdx = hasSku ? 1 : 0

      const parsed: Array<{ sku: string; price: number }> = []
      for (let i = startIdx; i < lines.length; i++) {
        const cols = lines[i].split(/[,;\t]/).map(c => c.trim().replace(/^["']|["']$/g, ''))
        if (cols.length >= 2) {
          const sku = cols[0]
          const price = parseFloat(cols[1].replace(',', '.'))
          if (sku && !isNaN(price)) {
            parsed.push({ sku, price })
          }
        }
      }
      setImportPreview(parsed)
    }
    reader.readAsText(file)
  }, [])

  const executeImport = useCallback(async () => {
    if (!selectedList || importPreview.length === 0) return

    setImporting(true)
    const sb = createClient()

    // Look up product IDs by SKU
    const skus = importPreview.map(r => r.sku)
    const { data: products } = await sb
      .from('tt_products')
      .select('id, sku')
      .in('sku', skus)

    if (!products || products.length === 0) {
      addToast({ type: 'error', title: 'No se encontraron productos con esos SKUs' })
      setImporting(false)
      return
    }

    const skuToId = new Map<string, string>()
    for (const p of products) {
      skuToId.set((p.sku as string).toUpperCase(), p.id as string)
    }

    const sb2 = createClient()
    let imported = 0
    let notFound = 0
    for (const row of importPreview) {
      const productId = skuToId.get(row.sku.toUpperCase())
      if (productId) {
        const { error } = await sb2
          .from('tt_price_list_items')
          .upsert({
            price_list_id: selectedList.id,
            product_id: productId,
            price: Math.round(row.price * 100) / 100,
            created_at: new Date().toISOString(),
          }, { onConflict: 'price_list_id,product_id' })
        if (!error) imported++
      } else {
        notFound++
      }
    }

    setImporting(false)
    setShowImportModal(false)
    setImportFile(null)
    setImportPreview([])
    addToast({
      type: 'success',
      title: `Importacion completada`,
      message: `${imported} precios importados${notFound > 0 ? `, ${notFound} SKUs no encontrados` : ''}`,
    })
    loadDetailItems(selectedList)
    loadPriceLists()
  }, [selectedList, importPreview, addToast, loadDetailItems, loadPriceLists])

  // ==========================================
  // Filtered detail items
  // ==========================================
  const filteredItems = useMemo(() => {
    if (!itemSearch.trim()) return listItems
    const q = itemSearch.toLowerCase()
    return listItems.filter(item =>
      item.product?.sku?.toLowerCase().includes(q) ||
      item.product?.name?.toLowerCase().includes(q) ||
      item.product?.brand?.toLowerCase().includes(q)
    )
  }, [listItems, itemSearch])

  // ==========================================
  // RENDER: DETAIL VIEW
  // ==========================================
  if (view === 'detail' && selectedList) {
    return (
      <div className="space-y-4">
        {/* Header */}
        <div className="flex items-center gap-4 flex-wrap">
          <Button variant="ghost" size="sm" onClick={() => { setView('list'); setSelectedList(null) }}>
            <ArrowLeft size={16} /> Volver a tarifas
          </Button>
          <div className="flex-1">
            <h2 className="text-lg font-bold text-[#F0F2F5]">{selectedList.name}</h2>
            <div className="flex items-center gap-2 mt-1">
              <Badge variant={selectedList.active ? 'success' : 'default'} size="sm">
                {selectedList.active ? 'Activa' : 'Inactiva'}
              </Badge>
              <Badge variant="orange" size="sm">{selectedList.currency}</Badge>
              {selectedList.markup_pct > 0 && (
                <Badge variant="info" size="sm">Markup {selectedList.markup_pct}%</Badge>
              )}
              <span className="text-xs text-[#6B7280]">
                {listItems.length} productos
              </span>
            </div>
          </div>
          <Button variant="secondary" size="sm" onClick={() => openEditModal(selectedList)}>
            <Edit3 size={14} /> Editar tarifa
          </Button>
        </div>

        {/* Description */}
        {selectedList.description && (
          <p className="text-sm text-[#9CA3AF] bg-[#141820] border border-[#1E2330] rounded-lg px-4 py-3">
            {selectedList.description}
          </p>
        )}

        {/* Actions bar */}
        <div className="flex items-center gap-3 flex-wrap">
          <SearchBar
            placeholder="Buscar en esta tarifa..."
            value={itemSearch}
            onChange={setItemSearch}
            className="flex-1 min-w-[200px]"
          />
          <Button variant="primary" size="sm" onClick={() => { setShowAddProduct(!showAddProduct); setAddProductSearch(''); setAddProductResults([]) }}>
            <Plus size={14} /> Agregar productos
          </Button>
          <Button variant="secondary" size="sm" onClick={() => setShowImportModal(true)}>
            <Upload size={14} /> Importar CSV
          </Button>
        </div>

        {/* Bulk markup */}
        <Card className="p-4">
          <div className="flex items-center gap-3 flex-wrap">
            <Percent size={16} className="text-[#FF6600]" />
            <span className="text-sm text-[#9CA3AF]">Aplicar markup sobre precio catalogo:</span>
            <div className="flex items-center gap-2">
              <input
                type="number"
                value={bulkMarkup}
                onChange={(e) => setBulkMarkup(e.target.value)}
                placeholder="Ej: 25"
                className="w-24 h-8 rounded bg-[#1E2330] border border-[#2A3040] px-2 text-xs text-[#F0F2F5] placeholder:text-[#4B5563] focus:outline-none focus:ring-1 focus:ring-orange-500/50"
              />
              <span className="text-xs text-[#6B7280]">%</span>
            </div>
            <Button
              variant="primary"
              size="sm"
              onClick={applyBulkMarkup}
              loading={bulkApplying}
              disabled={!bulkMarkup || bulkApplying}
            >
              Aplicar markup {bulkMarkup ? `${bulkMarkup}%` : ''} sobre precio catalogo
            </Button>
          </div>
        </Card>

        {/* Add product panel */}
        {showAddProduct && (
          <Card className="p-4 border-[#FF6600]/30">
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <h4 className="text-sm font-semibold text-[#FF6600]">Agregar productos a la tarifa</h4>
                <button onClick={() => setShowAddProduct(false)} className="text-[#6B7280] hover:text-[#F0F2F5]">
                  <X size={16} />
                </button>
              </div>
              <SearchBar
                placeholder="Buscar por SKU, nombre o marca..."
                value={addProductSearch}
                onChange={setAddProductSearch}
                autoFocus
              />
              {addProductLoading && (
                <div className="flex justify-center py-4">
                  <Loader2 className="animate-spin text-[#FF6600]" size={20} />
                </div>
              )}
              {addProductResults.length > 0 && (
                <div className="max-h-[300px] overflow-y-auto rounded-lg border border-[#1E2330]">
                  <table className="w-full text-sm">
                    <thead className="bg-[#0F1218] border-b border-[#1E2330] sticky top-0">
                      <tr>
                        <th className="px-3 py-2 text-left text-xs text-[#6B7280]">SKU</th>
                        <th className="px-3 py-2 text-left text-xs text-[#6B7280]">Producto</th>
                        <th className="px-3 py-2 text-left text-xs text-[#6B7280]">Marca</th>
                        <th className="px-3 py-2 text-right text-xs text-[#6B7280]">Precio Cat.</th>
                        <th className="px-3 py-2 text-center text-xs text-[#6B7280] w-[80px]">Accion</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-[#1E2330]">
                      {addProductResults.map(prod => {
                        const alreadyAdded = listItems.some(li => li.product_id === prod.id)
                        return (
                          <tr key={prod.id} className="hover:bg-[#1A1F2E]">
                            <td className="px-3 py-2 font-mono text-xs text-[#FF6600]">{prod.sku}</td>
                            <td className="px-3 py-2 text-[#F0F2F5] text-xs max-w-[200px] truncate">{prod.name}</td>
                            <td className="px-3 py-2"><Badge size="sm">{prod.brand}</Badge></td>
                            <td className="px-3 py-2 text-right text-xs text-[#9CA3AF]">
                              {prod.price_eur > 0 ? formatCurrency(prod.price_eur, 'EUR') : '-'}
                            </td>
                            <td className="px-3 py-2 text-center">
                              {alreadyAdded ? (
                                <span className="text-[10px] text-emerald-400 flex items-center justify-center gap-1">
                                  <Check size={12} /> Agregado
                                </span>
                              ) : (
                                <button
                                  onClick={() => addProductToList(prod)}
                                  className="px-2 py-1 rounded bg-[#FF6600] hover:bg-[#E55A00] text-white text-[10px] font-bold transition-colors"
                                >
                                  + Agregar
                                </button>
                              )}
                            </td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </div>
              )}
              {addProductSearch.trim().length >= 2 && !addProductLoading && addProductResults.length === 0 && (
                <p className="text-xs text-[#4B5563] text-center py-3">No se encontraron productos</p>
              )}
            </div>
          </Card>
        )}

        {/* Items table */}
        {detailLoading ? (
          <div className="flex justify-center py-20">
            <Loader2 className="animate-spin text-[#FF6600]" size={32} />
          </div>
        ) : filteredItems.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 text-[#4B5563]">
            <DollarSign size={48} className="mb-4" />
            <p className="text-lg font-medium">
              {listItems.length === 0 ? 'No hay productos en esta tarifa' : 'Sin resultados de busqueda'}
            </p>
            <p className="text-sm mt-1">
              {listItems.length === 0
                ? 'Agrega productos para empezar a armar la tarifa'
                : 'Proba con otro termino de busqueda'}
            </p>
            {listItems.length === 0 && (
              <Button variant="primary" size="sm" className="mt-4" onClick={() => setShowAddProduct(true)}>
                <Plus size={14} /> Agregar productos
              </Button>
            )}
          </div>
        ) : (
          <Card className="p-0 overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-[#0F1218] border-b border-[#1E2330]">
                  <tr>
                    <th className="px-3 py-3 text-left text-xs font-semibold text-[#6B7280] uppercase">SKU</th>
                    <th className="px-3 py-3 text-left text-xs font-semibold text-[#6B7280] uppercase">Producto</th>
                    <th className="px-3 py-3 text-left text-xs font-semibold text-[#6B7280] uppercase">Marca</th>
                    <th className="px-3 py-3 text-right text-xs font-semibold text-[#6B7280] uppercase">Precio Catalogo</th>
                    <th className="px-3 py-3 text-right text-xs font-semibold text-[#6B7280] uppercase">Precio Tarifa</th>
                    <th className="px-3 py-3 text-right text-xs font-semibold text-[#6B7280] uppercase">Diferencia</th>
                    <th className="px-3 py-3 text-center text-xs font-semibold text-[#6B7280] uppercase w-[100px]">Acciones</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#1E2330]">
                  {filteredItems.map(item => {
                    const catalogPrice = item.product?.price_eur || 0
                    const diff = catalogPrice > 0 ? ((item.price - catalogPrice) / catalogPrice * 100) : 0
                    const isEditing = editingItemId === item.id

                    return (
                      <tr key={item.id} className="hover:bg-[#1A1F2E] transition-colors">
                        <td className="px-3 py-2.5 font-mono text-xs text-[#FF6600]">
                          {item.product?.sku || '-'}
                        </td>
                        <td className="px-3 py-2.5 text-sm text-[#F0F2F5] max-w-[250px] truncate">
                          {item.product?.name || 'Producto no encontrado'}
                        </td>
                        <td className="px-3 py-2.5">
                          <Badge size="sm">{item.product?.brand || '-'}</Badge>
                        </td>
                        <td className="px-3 py-2.5 text-right text-xs text-[#6B7280]">
                          {catalogPrice > 0 ? formatCurrency(catalogPrice, 'EUR') : '-'}
                        </td>
                        <td className="px-3 py-2.5 text-right">
                          {isEditing ? (
                            <div className="flex items-center justify-end gap-1">
                              <input
                                type="number"
                                value={editingPrice}
                                onChange={(e) => setEditingPrice(e.target.value)}
                                onKeyDown={(e) => {
                                  if (e.key === 'Enter') {
                                    const val = parseFloat(editingPrice)
                                    if (!isNaN(val)) saveItemPrice(item.id, val)
                                  }
                                  if (e.key === 'Escape') { setEditingItemId(null); setEditingPrice('') }
                                }}
                                autoFocus
                                className="w-24 h-7 rounded bg-[#1E2330] border border-[#FF6600] px-2 text-xs text-[#F0F2F5] focus:outline-none text-right"
                              />
                              <button
                                onClick={() => {
                                  const val = parseFloat(editingPrice)
                                  if (!isNaN(val)) saveItemPrice(item.id, val)
                                }}
                                className="p-1 rounded hover:bg-emerald-500/20 text-emerald-400"
                              >
                                <Check size={14} />
                              </button>
                              <button
                                onClick={() => { setEditingItemId(null); setEditingPrice('') }}
                                className="p-1 rounded hover:bg-[#1E2330] text-[#6B7280]"
                              >
                                <X size={14} />
                              </button>
                            </div>
                          ) : (
                            <button
                              onClick={() => { setEditingItemId(item.id); setEditingPrice(String(item.price)) }}
                              className="font-bold text-[#FF6600] hover:text-[#FF8833] transition-colors cursor-pointer"
                            >
                              {formatCurrency(item.price, selectedList.currency)}
                            </button>
                          )}
                        </td>
                        <td className="px-3 py-2.5 text-right text-xs">
                          {catalogPrice > 0 ? (
                            <span className={diff >= 0 ? 'text-emerald-400' : 'text-red-400'}>
                              {diff >= 0 ? '+' : ''}{diff.toFixed(1)}%
                            </span>
                          ) : (
                            <span className="text-[#4B5563]">-</span>
                          )}
                        </td>
                        <td className="px-3 py-2.5 text-center">
                          <button
                            onClick={() => removeItem(item.id)}
                            className="p-1.5 rounded hover:bg-red-500/10 text-[#6B7280] hover:text-red-400 transition-colors"
                            title="Quitar de la tarifa"
                          >
                            <Trash2 size={14} />
                          </button>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </Card>
        )}

        {/* CSV Import Modal */}
        <Modal isOpen={showImportModal} onClose={() => { setShowImportModal(false); setImportFile(null); setImportPreview([]) }} title="Importar precios desde CSV" size="lg">
          <div className="space-y-4">
            <div className="bg-[#0F1218] border border-[#1E2330] rounded-lg p-4">
              <p className="text-sm text-[#9CA3AF] mb-2">El archivo CSV debe tener 2 columnas:</p>
              <div className="font-mono text-xs text-[#6B7280] bg-[#141820] rounded p-3">
                <p className="text-[#FF6600]">sku,price</p>
                <p>ABC-001,125.50</p>
                <p>ABC-002,89.90</p>
                <p>DEF-100,340.00</p>
              </div>
              <p className="text-[10px] text-[#4B5563] mt-2">Separadores aceptados: coma, punto y coma, tab</p>
            </div>

            <div>
              <label className="flex flex-col items-center justify-center w-full h-32 border-2 border-dashed border-[#2A3040] rounded-lg cursor-pointer hover:border-[#FF6600]/50 transition-colors bg-[#0F1218]">
                <FileSpreadsheet size={32} className="text-[#4B5563] mb-2" />
                <span className="text-sm text-[#6B7280]">
                  {importFile ? importFile.name : 'Click para seleccionar archivo CSV'}
                </span>
                <input type="file" accept=".csv,.txt,.tsv" className="hidden" onChange={handleFileChange} />
              </label>
            </div>

            {importPreview.length > 0 && (
              <div>
                <p className="text-sm text-[#9CA3AF] mb-2">
                  Vista previa: <span className="text-[#FF6600] font-bold">{importPreview.length}</span> filas detectadas
                </p>
                <div className="max-h-[200px] overflow-y-auto rounded border border-[#1E2330]">
                  <table className="w-full text-xs">
                    <thead className="bg-[#0F1218] sticky top-0">
                      <tr>
                        <th className="px-3 py-2 text-left text-[#6B7280]">SKU</th>
                        <th className="px-3 py-2 text-right text-[#6B7280]">Precio</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-[#1E2330]">
                      {importPreview.slice(0, 20).map((row, i) => (
                        <tr key={i}>
                          <td className="px-3 py-1.5 font-mono text-[#F0F2F5]">{row.sku}</td>
                          <td className="px-3 py-1.5 text-right text-[#FF6600]">{row.price.toFixed(2)}</td>
                        </tr>
                      ))}
                      {importPreview.length > 20 && (
                        <tr>
                          <td colSpan={2} className="px-3 py-1.5 text-center text-[#4B5563]">
                            ... y {importPreview.length - 20} filas mas
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            <div className="flex justify-end gap-3 pt-2">
              <Button variant="secondary" onClick={() => { setShowImportModal(false); setImportFile(null); setImportPreview([]) }}>
                Cancelar
              </Button>
              <Button
                variant="primary"
                onClick={executeImport}
                loading={importing}
                disabled={importPreview.length === 0 || importing}
              >
                <Upload size={14} /> Importar {importPreview.length} precios
              </Button>
            </div>
          </div>
        </Modal>
      </div>
    )
  }

  // ==========================================
  // RENDER: LIST VIEW
  // ==========================================
  return (
    <div className="space-y-4">
      {/* KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <KPICard
          label="Total tarifas"
          value={priceLists.length}
          icon={<DollarSign size={22} />}
        />
        <KPICard
          label="Tarifas activas"
          value={priceLists.filter(l => l.active).length}
          icon={<Check size={22} />}
          color="#10B981"
        />
        <KPICard
          label="Productos con precio"
          value={priceLists.reduce((sum, l) => sum + (l.item_count || 0), 0)}
          icon={<Package size={22} />}
          color="#3B82F6"
        />
        <KPICard
          label="Tarifa por defecto"
          value={priceLists.find(l => l.is_default)?.name || 'Ninguna'}
          icon={<Award size={22} />}
          color="#F59E0B"
        />
      </div>

      {/* Action bar */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <h2 className="text-lg font-bold text-[#FF6600] tracking-wide">
          LISTAS DE PRECIOS{' '}
          <span className="text-[#6B7280] font-normal text-sm">
            &mdash; {loading ? '...' : `${priceLists.length} TARIFAS`}
          </span>
        </h2>
        <Button variant="primary" size="sm" onClick={openCreateModal}>
          <Plus size={14} /> Nueva tarifa
        </Button>
      </div>

      {/* List loading */}
      {loading ? (
        <div className="flex flex-col items-center justify-center py-20">
          <Loader2 className="animate-spin text-[#FF6600] mb-3" size={32} />
          <p className="text-sm text-[#4B5563]">Cargando tarifas...</p>
        </div>
      ) : priceLists.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 text-[#4B5563]">
          <DollarSign size={48} className="mb-4" />
          <p className="text-lg font-medium">No hay tarifas creadas</p>
          <p className="text-sm mt-1">Crea tu primera lista de precios</p>
          <Button variant="primary" size="sm" className="mt-4" onClick={openCreateModal}>
            <Plus size={14} /> Nueva tarifa
          </Button>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {priceLists.map(pl => (
            <Card key={pl.id} hover className="relative group">
              {/* Default badge */}
              {pl.is_default && (
                <div className="absolute top-3 right-3">
                  <Badge variant="warning" size="sm">Por defecto</Badge>
                </div>
              )}

              <div className="space-y-3">
                {/* Header */}
                <div className="flex items-start gap-3">
                  <div className="w-10 h-10 rounded-lg bg-[#FF6600]/10 flex items-center justify-center shrink-0">
                    <DollarSign size={20} className="text-[#FF6600]" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <h3 className="text-sm font-bold text-[#F0F2F5] truncate">{pl.name}</h3>
                    {pl.description && (
                      <p className="text-xs text-[#6B7280] mt-0.5 line-clamp-1">{pl.description}</p>
                    )}
                  </div>
                </div>

                {/* Stats */}
                <div className="flex items-center gap-3 flex-wrap">
                  <Badge variant="orange" size="sm">{pl.currency}</Badge>
                  <Badge variant={pl.active ? 'success' : 'default'} size="sm">
                    {pl.active ? 'Activa' : 'Inactiva'}
                  </Badge>
                  {pl.markup_pct > 0 && (
                    <Badge variant="info" size="sm">+{pl.markup_pct}%</Badge>
                  )}
                </div>

                {/* Item count */}
                <div className="flex items-center justify-between pt-2 border-t border-[#1E2330]">
                  <span className="text-xs text-[#6B7280]">
                    {pl.item_count || 0} productos
                  </span>
                  <span className="text-[10px] text-[#4B5563]">
                    {pl.updated_at ? new Date(pl.updated_at).toLocaleDateString('es-AR') : ''}
                  </span>
                </div>

                {/* Actions */}
                <div className="flex items-center gap-2 pt-1">
                  <Button variant="primary" size="sm" className="flex-1" onClick={() => openDetail(pl)}>
                    <Eye size={14} /> Ver precios
                  </Button>
                  <Button variant="secondary" size="sm" onClick={() => openEditModal(pl)}>
                    <Edit3 size={14} />
                  </Button>
                  <button
                    onClick={() => toggleActive(pl)}
                    className="p-2 rounded-lg hover:bg-[#1E2330] text-[#6B7280] hover:text-[#F0F2F5] transition-colors"
                    title={pl.active ? 'Desactivar' : 'Activar'}
                  >
                    {pl.active ? <ToggleRight size={16} className="text-emerald-400" /> : <ToggleLeft size={16} />}
                  </button>
                  {deleteConfirm === pl.id ? (
                    <div className="flex items-center gap-1">
                      <button
                        onClick={() => handleDelete(pl.id)}
                        className="px-2 py-1 rounded bg-red-600 hover:bg-red-700 text-white text-[10px] font-bold"
                      >
                        Confirmar
                      </button>
                      <button
                        onClick={() => setDeleteConfirm(null)}
                        className="px-2 py-1 rounded bg-[#1E2330] text-[#6B7280] text-[10px]"
                      >
                        No
                      </button>
                    </div>
                  ) : (
                    <button
                      onClick={() => setDeleteConfirm(pl.id)}
                      className="p-2 rounded-lg hover:bg-red-500/10 text-[#6B7280] hover:text-red-400 transition-colors"
                      title="Eliminar tarifa"
                    >
                      <Trash2 size={14} />
                    </button>
                  )}
                </div>
              </div>
            </Card>
          ))}
        </div>
      )}

      {/* Create / Edit Modal */}
      <Modal isOpen={modalOpen} onClose={() => setModalOpen(false)} title={editingList ? 'Editar tarifa' : 'Nueva tarifa'} size="md">
        <div className="space-y-4">
          <Input
            label="Nombre"
            value={form.name}
            onChange={(e) => setForm(prev => ({ ...prev, name: e.target.value }))}
            placeholder="Ej: Tarifa distribuidores EUR"
          />

          <div className="w-full">
            <label className="block text-sm font-medium text-[#9CA3AF] mb-1.5">Descripcion</label>
            <textarea
              value={form.description}
              onChange={(e) => setForm(prev => ({ ...prev, description: e.target.value }))}
              placeholder="Descripcion opcional..."
              rows={2}
              className="w-full rounded-lg bg-[#1E2330] border border-[#2A3040] px-3 py-2 text-sm text-[#F0F2F5] placeholder:text-[#4B5563] focus:outline-none focus:ring-2 focus:ring-orange-500/50 focus:border-orange-500/50 transition-all resize-none"
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <Select
              label="Moneda"
              options={[
                { value: 'EUR', label: 'EUR - Euro' },
                { value: 'USD', label: 'USD - Dolar' },
                { value: 'ARS', label: 'ARS - Peso argentino' },
              ]}
              value={form.currency}
              onChange={(e) => setForm(prev => ({ ...prev, currency: e.target.value as 'EUR' | 'USD' | 'ARS' }))}
            />

            <Input
              label="Markup %"
              type="number"
              value={String(form.markup_pct)}
              onChange={(e) => setForm(prev => ({ ...prev, markup_pct: parseFloat(e.target.value) || 0 }))}
              placeholder="0"
            />
          </div>

          <div className="flex items-center gap-6">
            <label className="flex items-center gap-2 cursor-pointer text-sm text-[#9CA3AF] hover:text-[#F0F2F5]">
              <input
                type="checkbox"
                checked={form.is_default}
                onChange={(e) => setForm(prev => ({ ...prev, is_default: e.target.checked }))}
                className="w-4 h-4 rounded border-[#2A3040] bg-[#1E2330] text-[#FF6600] focus:ring-[#FF6600] focus:ring-offset-0"
              />
              Tarifa por defecto
            </label>

            <label className="flex items-center gap-2 cursor-pointer text-sm text-[#9CA3AF] hover:text-[#F0F2F5]">
              <input
                type="checkbox"
                checked={form.active}
                onChange={(e) => setForm(prev => ({ ...prev, active: e.target.checked }))}
                className="w-4 h-4 rounded border-[#2A3040] bg-[#1E2330] text-[#FF6600] focus:ring-[#FF6600] focus:ring-offset-0"
              />
              Activa
            </label>
          </div>

          <div className="flex justify-end gap-3 pt-4 border-t border-[#1E2330]">
            <Button variant="secondary" onClick={() => setModalOpen(false)}>
              Cancelar
            </Button>
            <Button variant="primary" onClick={handleSave} loading={saving} disabled={saving}>
              {editingList ? 'Guardar cambios' : 'Crear tarifa'}
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
