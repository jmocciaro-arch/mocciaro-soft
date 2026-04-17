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
  Package, Loader2, ShoppingCart, Tag, Award, DollarSign,
  ChevronDown, ChevronRight, X, RotateCcw, Plus, Search, ArrowUpDown,
  ChevronLeft, Upload, Trash2, Edit3, Eye, FileSpreadsheet,
  Check, Percent, ArrowLeft, ToggleLeft, ToggleRight
} from 'lucide-react'
import { useToast } from '@/components/ui/toast'
import { useCompanyContext } from '@/lib/company-context'
import { Input } from '@/components/ui/input'

const PAGE_SIZE = 50

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
  product_type: string | null
  family_id: string | null
  price_min: number | null
  search_text: string | null
}

interface ProductFamily {
  id: string
  name: string
  slug: string
  description: string | null
  icon_url: string | null
  icon_svg: string | null
  parent_id: string | null
  sort_order: number
  filter_config: FilterConfig | null
  active: boolean
  product_count?: number
}

interface FilterConfig {
  filters: FilterDef[]
}

interface FilterDef {
  key: string
  label: string
  type: 'icon_select' | 'range' | 'select' | 'text'
  field: string
  unit?: string
  options?: FilterOption[]
  min_field?: string
  max_field?: string
  spec_key?: string
}

interface FilterOption {
  value: string
  label: string
  icon?: string
}

interface SearchResult {
  id: string
  sku: string
  name: string
  brand: string
  price_eur: number
  image_url: string | null
  relevance: number
}

interface RangeFilter {
  min: string
  max: string
}

type SortOption = 'name_asc' | 'name_desc' | 'price_asc' | 'price_desc'

// -------------------------------------------------------
// Family emoji map
// -------------------------------------------------------
const FAMILY_EMOJI: Record<string, string> = {
  'atornilladores': '\uD83D\uDD27',
  'llaves-de-torque': '\uD83D\uDD29',
  'equilibradoras': '\u2696\uFE0F',
  'bits-y-puntas': '\uD83D\uDD28',
  'soldadura': '\u26A1',
  'epp': '\uD83E\uDDBA',
  'accesorios': '\uD83D\uDD17',
  'repuestos': '\uD83D\uDEE0\uFE0F',
}

const FAMILY_COLUMNS: Record<string, string[]> = {
  'atornilladores': ['image', 'sku', 'name', 'torque', 'rpm', 'encastre', 'weight', 'price', 'cotizar'],
  'llaves-de-torque': ['image', 'sku', 'name', 'torque', 'encastre', 'brand', 'price', 'cotizar'],
  'equilibradoras': ['image', 'sku', 'name', 'weight', 'brand', 'price', 'cotizar'],
  'bits-y-puntas': ['image', 'sku', 'name', 'drive', 'tip_type', 'length', 'price', 'cotizar'],
}

const catalogoTabs = [
  { id: 'productos', label: 'Productos', icon: <Package size={16} /> },
  { id: 'categorias', label: 'Categorias', icon: <Tag size={16} /> },
  { id: 'marcas', label: 'Marcas', icon: <Award size={16} /> },
  { id: 'tarifas', label: 'Tarifas', icon: <DollarSign size={16} /> },
]

// ===============================================================
// PRODUCTOS TAB — Visual Product Catalog (vessel-europe style)
// ===============================================================
function ProductosTab() {
  const router = useRouter()

  // ---------- Core State ----------
  const [families, setFamilies] = useState<ProductFamily[]>([])
  const [familiesLoading, setFamiliesLoading] = useState(true)
  const [selectedFamily, setSelectedFamily] = useState<ProductFamily | null>(null)

  // Search
  const [searchQuery, setSearchQuery] = useState('')
  const [searchResults, setSearchResults] = useState<SearchResult[]>([])
  const [searchLoading, setSearchLoading] = useState(false)
  const [showSearchDropdown, setShowSearchDropdown] = useState(false)
  const searchDebounceRef = useRef<NodeJS.Timeout | null>(null)
  const searchContainerRef = useRef<HTMLDivElement>(null)

  // Products (when family is selected)
  const [products, setProducts] = useState<Product[]>([])
  const [totalCount, setTotalCount] = useState(0)
  const [productsLoading, setProductsLoading] = useState(false)
  const [page, setPage] = useState(1)
  const [sortBy, setSortBy] = useState<SortOption>('name_asc')

  // Dynamic filters from filter_config
  const [activeFilters, setActiveFilters] = useState<Record<string, string>>({})
  const [rangeFilters, setRangeFilters] = useState<Record<string, RangeFilter>>({})
  const filterDebounceRef = useRef<NodeJS.Timeout | null>(null)

  // Product detail modal
  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null)

  const totalPages = Math.max(1, Math.ceil(totalCount / PAGE_SIZE))

  // ---------- Load families on mount ----------
  const loadFamilies = useCallback(async () => {
    setFamiliesLoading(true)
    const sb = createClient()

    const { data: familyData } = await sb
      .from('tt_product_families')
      .select('*')
      .eq('active', true)
      .order('sort_order', { ascending: true })

    if (familyData && familyData.length > 0) {
      // Get product counts per family
      const sb2 = createClient()
      const { data: countData } = await sb2
        .from('tt_products')
        .select('family_id')
        .eq('active', true)
        .not('family_id', 'is', null)

      const countMap = new Map<string, number>()
      if (countData) {
        for (const row of countData) {
          const fid = row.family_id as string
          countMap.set(fid, (countMap.get(fid) || 0) + 1)
        }
      }

      const fams = (familyData as ProductFamily[]).map(f => ({
        ...f,
        product_count: countMap.get(f.id) || 0,
      }))
      setFamilies(fams)
    } else {
      setFamilies([])
    }
    setFamiliesLoading(false)
  }, [])

  useEffect(() => {
    loadFamilies()
  }, [loadFamilies])

  // ---------- Fuzzy search via RPC ----------
  const performSearch = useCallback(async (query: string) => {
    if (!query.trim() || query.trim().length < 2) {
      setSearchResults([])
      setShowSearchDropdown(false)
      return
    }
    setSearchLoading(true)
    setShowSearchDropdown(true)
    const sb = createClient()

    const { data, error } = await sb.rpc('search_products_fuzzy', {
      query_text: query.trim(),
      max_results: 12,
    })

    if (!error && data) {
      setSearchResults(data as SearchResult[])
    } else {
      // Fallback to ilike search if RPC fails
      const sb2 = createClient()
      const tokens = query.trim().toLowerCase().split(/\s+/)
      let q = sb2
        .from('tt_products')
        .select('id, sku, name, brand, price_eur, image_url')
        .eq('active', true)
        .limit(12)

      for (const token of tokens) {
        q = q.or(`name.ilike.%${token}%,sku.ilike.%${token}%,brand.ilike.%${token}%`)
      }

      const { data: fallbackData } = await q
      setSearchResults((fallbackData || []).map((r: Record<string, unknown>) => ({ ...r, relevance: 0 } as SearchResult)))
    }
    setSearchLoading(false)
  }, [])

  // Debounced search
  useEffect(() => {
    if (searchDebounceRef.current) clearTimeout(searchDebounceRef.current)
    searchDebounceRef.current = setTimeout(() => {
      performSearch(searchQuery)
    }, 300)
    return () => {
      if (searchDebounceRef.current) clearTimeout(searchDebounceRef.current)
    }
  }, [searchQuery, performSearch])

  // Close search dropdown on click outside
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (searchContainerRef.current && !searchContainerRef.current.contains(e.target as Node)) {
        setShowSearchDropdown(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  // ---------- Load products for selected family ----------
  const loadProducts = useCallback(async (family: ProductFamily | null, pageNum: number, sort: SortOption, filters: Record<string, string>, ranges: Record<string, RangeFilter>) => {
    setProductsLoading(true)
    const sb = createClient()
    const fromOffset = (pageNum - 1) * PAGE_SIZE

    let orderCol = 'name'
    let orderAsc = true
    if (sort === 'name_desc') { orderCol = 'name'; orderAsc = false }
    else if (sort === 'price_asc') { orderCol = 'price_eur'; orderAsc = true }
    else if (sort === 'price_desc') { orderCol = 'price_eur'; orderAsc = false }

    let query = sb
      .from('tt_products')
      .select('*', { count: 'exact' })
      .eq('active', true)
      .order(orderCol, { ascending: orderAsc })
      .range(fromOffset, fromOffset + PAGE_SIZE - 1)

    if (family) {
      query = query.eq('family_id', family.id)
    }

    // Apply dynamic filters from filter_config
    for (const [key, value] of Object.entries(filters)) {
      if (!value) continue
      // Determine the actual DB field from filter_config
      const filterDef = family?.filter_config?.filters?.find(f => f.key === key)
      if (filterDef) {
        if (filterDef.spec_key) {
          // Filter on specs JSONB: specs->>key = value
          query = query.eq(`specs->${filterDef.spec_key}` as string, value)
        } else {
          query = query.eq(filterDef.field, value)
        }
      }
    }

    // Apply range filters
    for (const [key, range] of Object.entries(ranges)) {
      if (!range.min && !range.max) continue
      const filterDef = family?.filter_config?.filters?.find(f => f.key === key)
      if (filterDef) {
        if (filterDef.min_field && range.min) {
          query = query.gte(filterDef.min_field, parseFloat(range.min))
        }
        if (filterDef.max_field && range.max) {
          query = query.lte(filterDef.max_field, parseFloat(range.max))
        }
        if (filterDef.field && !filterDef.min_field) {
          if (range.min) query = query.gte(filterDef.field, parseFloat(range.min))
          if (range.max) query = query.lte(filterDef.field, parseFloat(range.max))
        }
      }
    }

    const { data, count } = await query
    setProducts((data || []) as Product[])
    setTotalCount(count || 0)
    setProductsLoading(false)
  }, [])

  // ---------- Select a family ----------
  const selectFamily = useCallback((family: ProductFamily) => {
    setSelectedFamily(family)
    setActiveFilters({})
    setRangeFilters({})
    setPage(1)
    setSortBy('name_asc')
    loadProducts(family, 1, 'name_asc', {}, {})
  }, [loadProducts])

  // ---------- Go back to families grid ----------
  const goBackToFamilies = useCallback(() => {
    setSelectedFamily(null)
    setProducts([])
    setTotalCount(0)
    setActiveFilters({})
    setRangeFilters({})
    setPage(1)
  }, [])

  // ---------- Filter change (debounced) ----------
  useEffect(() => {
    if (!selectedFamily) return
    if (filterDebounceRef.current) clearTimeout(filterDebounceRef.current)
    filterDebounceRef.current = setTimeout(() => {
      setPage(1)
      loadProducts(selectedFamily, 1, sortBy, activeFilters, rangeFilters)
    }, 400)
    return () => {
      if (filterDebounceRef.current) clearTimeout(filterDebounceRef.current)
    }
  }, [activeFilters, rangeFilters, sortBy, selectedFamily, loadProducts])

  // ---------- Pagination ----------
  const changePage = useCallback((newPage: number) => {
    if (!selectedFamily || newPage < 1 || newPage > totalPages) return
    setPage(newPage)
    loadProducts(selectedFamily, newPage, sortBy, activeFilters, rangeFilters)
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }, [totalPages, selectedFamily, sortBy, activeFilters, rangeFilters, loadProducts])

  // ---------- Navigate to search result product ----------
  const openSearchProduct = useCallback(async (result: SearchResult) => {
    setShowSearchDropdown(false)
    setSearchQuery('')
    const sb = createClient()
    const { data } = await sb
      .from('tt_products')
      .select('*')
      .eq('id', result.id)
      .single()
    if (data) {
      setSelectedProduct(data as Product)
    }
  }, [])

  // ---------- Get table columns for current family ----------
  const getColumns = useCallback(() => {
    if (!selectedFamily) return FAMILY_COLUMNS['default'] || ['image', 'sku', 'name', 'brand', 'category', 'price', 'cotizar']
    return FAMILY_COLUMNS[selectedFamily.slug] || ['image', 'sku', 'name', 'brand', 'category', 'price', 'cotizar']
  }, [selectedFamily])

  // ---------- Clear active filters ----------
  const clearAllFilters = useCallback(() => {
    setActiveFilters({})
    setRangeFilters({})
  }, [])

  const hasActiveFilters = useMemo(() => {
    return Object.values(activeFilters).some(v => v) ||
           Object.values(rangeFilters).some(r => r.min || r.max)
  }, [activeFilters, rangeFilters])

  // ============================================================
  // RENDER
  // ============================================================
  return (
    <div className="space-y-6">

      {/* ======== SMART SEARCH BAR ======== */}
      <div ref={searchContainerRef} className="relative">
        <div className="relative">
          <Search size={22} className="absolute left-4 top-1/2 -translate-y-1/2 text-[#6B7280] z-10" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            onFocus={() => { if (searchResults.length > 0) setShowSearchDropdown(true) }}
            placeholder="Buscar productos... ej: fein asm, 15C5A90, tohnichi ql"
            className="w-full h-14 rounded-2xl bg-[#141820] border-2 border-[#1E2330] pl-12 pr-12 text-base text-[#F0F2F5] placeholder:text-[#4B5563] focus:outline-none focus:ring-2 focus:ring-[#FF6600]/50 focus:border-[#FF6600]/50 transition-all shadow-lg shadow-black/20"
          />
          {searchLoading && (
            <Loader2 size={18} className="absolute right-4 top-1/2 -translate-y-1/2 animate-spin text-[#FF6600]" />
          )}
          {searchQuery && !searchLoading && (
            <button
              onClick={() => { setSearchQuery(''); setSearchResults([]); setShowSearchDropdown(false) }}
              className="absolute right-4 top-1/2 -translate-y-1/2 text-[#6B7280] hover:text-[#F0F2F5] transition-colors"
            >
              <X size={18} />
            </button>
          )}
        </div>

        {/* Search results dropdown */}
        {showSearchDropdown && searchResults.length > 0 && (
          <div className="absolute z-50 top-full mt-2 left-0 right-0 bg-[#141820] border border-[#1E2330] rounded-xl shadow-2xl shadow-black/40 overflow-hidden max-h-[420px] overflow-y-auto">
            {searchResults.map((result) => (
              <button
                key={result.id}
                onClick={() => openSearchProduct(result)}
                className="w-full flex items-center gap-3 px-4 py-3 hover:bg-[#1A1F2E] transition-colors text-left border-b border-[#1E2330] last:border-b-0"
              >
                <div className="w-10 h-10 rounded-lg bg-[#0F1218] border border-[#1E2330] flex items-center justify-center shrink-0 overflow-hidden">
                  {result.image_url ? (
                    <img src={result.image_url} alt="" referrerPolicy="no-referrer" className="w-full h-full object-contain p-0.5" onError={(e) => { (e.target as HTMLImageElement).style.display = 'none' }} />
                  ) : (
                    <Package size={16} className="text-[#2A3040]" />
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="font-mono text-xs text-[#FF6600]">{result.sku}</span>
                    <Badge variant="default" size="sm">{result.brand}</Badge>
                  </div>
                  <p className="text-sm text-[#F0F2F5] truncate">{result.name}</p>
                </div>
                <span className="text-sm font-bold text-[#FF6600] shrink-0">
                  {result.price_eur > 0 ? formatCurrency(result.price_eur, 'EUR') : 'Consultar'}
                </span>
              </button>
            ))}
          </div>
        )}

        {showSearchDropdown && searchQuery.trim().length >= 2 && !searchLoading && searchResults.length === 0 && (
          <div className="absolute z-50 top-full mt-2 left-0 right-0 bg-[#141820] border border-[#1E2330] rounded-xl shadow-2xl p-6 text-center">
            <p className="text-sm text-[#6B7280]">Sin resultados para &quot;{searchQuery}&quot;</p>
          </div>
        )}
      </div>

      {/* ======== FAMILY CARDS (when no family selected) ======== */}
      {!selectedFamily && (
        <>
          {familiesLoading ? (
            <div className="flex flex-col items-center justify-center py-16">
              <Loader2 className="animate-spin text-[#FF6600] mb-3" size={32} />
              <p className="text-sm text-[#4B5563]">Cargando familias de productos...</p>
            </div>
          ) : families.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 text-[#4B5563]">
              <Package size={48} className="mb-4" />
              <p className="text-lg font-medium">No hay familias configuradas</p>
              <p className="text-sm mt-1">Agrega familias de producto en tt_product_families</p>
            </div>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
              {families.map((family) => {
                const emoji = FAMILY_EMOJI[family.slug] || '\uD83D\uDCE6'
                return (
                  <button
                    key={family.id}
                    onClick={() => selectFamily(family)}
                    className="group relative rounded-2xl bg-[#141820] border border-[#1E2330] p-6 hover:border-[#FF6600]/40 hover:bg-[#1A1F2E] transition-all duration-300 cursor-pointer text-left flex flex-col items-center gap-3 hover:shadow-lg hover:shadow-[#FF6600]/5 hover:-translate-y-0.5"
                  >
                    <span className="text-4xl group-hover:scale-110 transition-transform duration-300">{emoji}</span>
                    <h3 className="text-sm font-bold text-[#F0F2F5] text-center group-hover:text-[#FF6600] transition-colors">
                      {family.name}
                    </h3>
                    <span className="text-xs text-[#6B7280]">
                      {family.product_count || 0} productos
                    </span>
                    {family.description && (
                      <p className="text-[10px] text-[#4B5563] text-center line-clamp-2 mt-1">
                        {family.description}
                      </p>
                    )}
                    {/* Hover accent line */}
                    <div className="absolute bottom-0 left-4 right-4 h-0.5 bg-[#FF6600] rounded-full opacity-0 group-hover:opacity-100 transition-opacity duration-300" />
                  </button>
                )
              })}
            </div>
          )}
        </>
      )}

      {/* ======== FAMILY DETAIL VIEW (when a family is selected) ======== */}
      {selectedFamily && (
        <div className="space-y-5">
          {/* Family header + back button */}
          <div className="flex items-center gap-4 flex-wrap">
            <button
              onClick={goBackToFamilies}
              className="flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium text-[#9CA3AF] hover:text-[#F0F2F5] hover:bg-[#1E2330] transition-all"
            >
              <ChevronLeft size={18} /> Familias
            </button>
            <div className="flex items-center gap-3 flex-1">
              <span className="text-3xl">{FAMILY_EMOJI[selectedFamily.slug] || '\uD83D\uDCE6'}</span>
              <div>
                <h2 className="text-xl font-bold text-[#F0F2F5]">{selectedFamily.name}</h2>
                <p className="text-xs text-[#6B7280]">
                  {productsLoading ? 'Cargando...' : `${totalCount} productos`}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2">
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
              <ExportButton
                data={products as unknown as Record<string, unknown>[]}
                filename={`productos_${selectedFamily.slug}`}
                targetTable="tt_products"
                columns={[
                  { key: 'sku', label: 'SKU' },
                  { key: 'name', label: 'Nombre' },
                  { key: 'brand', label: 'Marca' },
                  { key: 'price_eur', label: 'Precio EUR' },
                  { key: 'torque_min', label: 'Torque Min' },
                  { key: 'torque_max', label: 'Torque Max' },
                  { key: 'rpm', label: 'RPM' },
                  { key: 'encastre', label: 'Encastre' },
                  { key: 'weight_kg', label: 'Peso (kg)' },
                ]}
              />
            </div>
          </div>

          {/* Dynamic filters from filter_config */}
          {selectedFamily.filter_config?.filters && selectedFamily.filter_config.filters.length > 0 && (
            <div className="rounded-xl bg-[#141820] border border-[#1E2330] p-4">
              <div className="flex items-center justify-between mb-3">
                <span className="text-xs font-bold uppercase tracking-wider text-[#FF6600]">Filtros</span>
                {hasActiveFilters && (
                  <button
                    onClick={clearAllFilters}
                    className="flex items-center gap-1 text-[10px] text-[#FF6600] hover:text-[#FF8833] font-medium"
                  >
                    <RotateCcw size={10} /> Limpiar
                  </button>
                )}
              </div>
              <div className="flex flex-wrap gap-4 items-end">
                {selectedFamily.filter_config.filters.map((filterDef) => {
                  if (filterDef.type === 'icon_select' && filterDef.options) {
                    const currentVal = activeFilters[filterDef.key] || ''
                    return (
                      <div key={filterDef.key} className="space-y-1.5">
                        <label className="text-[10px] font-semibold uppercase tracking-wider text-[#6B7280]">
                          {filterDef.label}
                        </label>
                        <div className="flex gap-1.5 flex-wrap">
                          {filterDef.options.map((opt) => (
                            <button
                              key={opt.value}
                              onClick={() => {
                                setActiveFilters(prev => ({
                                  ...prev,
                                  [filterDef.key]: prev[filterDef.key] === opt.value ? '' : opt.value,
                                }))
                              }}
                              className={`px-3 py-2 rounded-lg text-xs font-bold border-2 transition-all duration-200 ${
                                currentVal === opt.value
                                  ? 'border-[#FF6600] bg-[#FF6600]/15 text-[#FF6600] shadow-md shadow-[#FF6600]/10'
                                  : 'border-[#2A3040] bg-[#0F1218] text-[#9CA3AF] hover:border-[#3A4050] hover:text-[#F0F2F5]'
                              }`}
                              title={opt.label}
                            >
                              {opt.icon ? <span className="mr-1">{opt.icon}</span> : null}
                              {opt.label}
                            </button>
                          ))}
                        </div>
                      </div>
                    )
                  }

                  if (filterDef.type === 'range') {
                    const rangeVal = rangeFilters[filterDef.key] || { min: '', max: '' }
                    return (
                      <div key={filterDef.key} className="space-y-1.5">
                        <label className="text-[10px] font-semibold uppercase tracking-wider text-[#6B7280]">
                          {filterDef.label} {filterDef.unit ? `(${filterDef.unit})` : ''}
                        </label>
                        <div className="flex gap-2 items-center">
                          <input
                            type="number"
                            value={rangeVal.min}
                            onChange={(e) => setRangeFilters(prev => ({
                              ...prev,
                              [filterDef.key]: { ...rangeVal, min: e.target.value },
                            }))}
                            placeholder="Min"
                            className="w-20 h-9 rounded-lg bg-[#0F1218] border border-[#2A3040] px-2 text-xs text-[#F0F2F5] placeholder:text-[#4B5563] focus:outline-none focus:ring-1 focus:ring-[#FF6600]/50"
                          />
                          <span className="text-[#4B5563] text-xs">-</span>
                          <input
                            type="number"
                            value={rangeVal.max}
                            onChange={(e) => setRangeFilters(prev => ({
                              ...prev,
                              [filterDef.key]: { ...rangeVal, max: e.target.value },
                            }))}
                            placeholder="Max"
                            className="w-20 h-9 rounded-lg bg-[#0F1218] border border-[#2A3040] px-2 text-xs text-[#F0F2F5] placeholder:text-[#4B5563] focus:outline-none focus:ring-1 focus:ring-[#FF6600]/50"
                          />
                        </div>
                      </div>
                    )
                  }

                  if (filterDef.type === 'select' && filterDef.options) {
                    return (
                      <div key={filterDef.key} className="space-y-1.5">
                        <label className="text-[10px] font-semibold uppercase tracking-wider text-[#6B7280]">
                          {filterDef.label}
                        </label>
                        <select
                          value={activeFilters[filterDef.key] || ''}
                          onChange={(e) => setActiveFilters(prev => ({
                            ...prev,
                            [filterDef.key]: e.target.value,
                          }))}
                          className="h-9 rounded-lg bg-[#0F1218] border border-[#2A3040] px-2 pr-8 text-xs text-[#F0F2F5] appearance-none focus:outline-none focus:ring-1 focus:ring-[#FF6600]/50 min-w-[140px]"
                        >
                          <option value="">Todos</option>
                          {filterDef.options.map(opt => (
                            <option key={opt.value} value={opt.value}>{opt.label}</option>
                          ))}
                        </select>
                      </div>
                    )
                  }

                  if (filterDef.type === 'text') {
                    return (
                      <div key={filterDef.key} className="space-y-1.5">
                        <label className="text-[10px] font-semibold uppercase tracking-wider text-[#6B7280]">
                          {filterDef.label}
                        </label>
                        <input
                          type="text"
                          value={activeFilters[filterDef.key] || ''}
                          onChange={(e) => setActiveFilters(prev => ({
                            ...prev,
                            [filterDef.key]: e.target.value,
                          }))}
                          placeholder={filterDef.label}
                          className="w-32 h-9 rounded-lg bg-[#0F1218] border border-[#2A3040] px-2 text-xs text-[#F0F2F5] placeholder:text-[#4B5563] focus:outline-none focus:ring-1 focus:ring-[#FF6600]/50"
                        />
                      </div>
                    )
                  }

                  return null
                })}
              </div>

              {/* Active filter tags */}
              {hasActiveFilters && (
                <div className="flex items-center gap-2 flex-wrap mt-3 pt-3 border-t border-[#1E2330]">
                  <span className="text-[10px] text-[#4B5563] uppercase">Activos:</span>
                  {Object.entries(activeFilters).filter(([, v]) => v).map(([key, value]) => {
                    const def = selectedFamily.filter_config?.filters?.find(f => f.key === key)
                    return (
                      <span key={key} className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-[#FF6600]/15 text-[#FF6600] text-[10px] font-medium">
                        {def?.label}: {value}
                        <button onClick={() => setActiveFilters(prev => ({ ...prev, [key]: '' }))}><X size={10} /></button>
                      </span>
                    )
                  })}
                  {Object.entries(rangeFilters).filter(([, r]) => r.min || r.max).map(([key, range]) => {
                    const def = selectedFamily.filter_config?.filters?.find(f => f.key === key)
                    return (
                      <span key={key} className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-[#FF6600]/15 text-[#FF6600] text-[10px] font-medium">
                        {def?.label}: {range.min || '0'}-{range.max || '*'} {def?.unit || ''}
                        <button onClick={() => setRangeFilters(prev => ({ ...prev, [key]: { min: '', max: '' } }))}><X size={10} /></button>
                      </span>
                    )
                  })}
                </div>
              )}
            </div>
          )}

          {/* Product table */}
          {productsLoading ? (
            <div className="flex flex-col items-center justify-center py-16">
              <Loader2 className="animate-spin text-[#FF6600] mb-3" size={32} />
              <p className="text-sm text-[#4B5563]">Cargando productos...</p>
            </div>
          ) : products.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 text-[#4B5563]">
              <Package size={48} className="mb-4" />
              <p className="text-lg font-medium">No se encontraron productos</p>
              <p className="text-sm mt-1">Proba ajustando los filtros</p>
              {hasActiveFilters && (
                <Button variant="outline" size="sm" className="mt-4" onClick={clearAllFilters}>
                  <RotateCcw size={14} /> Limpiar filtros
                </Button>
              )}
            </div>
          ) : (
            <div className="rounded-xl border border-[#1E2330] overflow-hidden bg-[#0F1218]">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-[#0A0D12] border-b border-[#1E2330]">
                    <tr>
                      {getColumns().map((col) => {
                        const colDefs: Record<string, { label: string; align: string; sortable?: boolean; sortKey?: SortOption }> = {
                          image: { label: '', align: 'text-center', },
                          sku: { label: 'SKU', align: 'text-left' },
                          name: { label: 'Producto', align: 'text-left', sortable: true, sortKey: 'name_asc' },
                          brand: { label: 'Marca', align: 'text-left' },
                          category: { label: 'Categoria', align: 'text-left' },
                          torque: { label: 'Torque (Nm)', align: 'text-center' },
                          rpm: { label: 'RPM', align: 'text-center' },
                          encastre: { label: 'Encastre', align: 'text-center' },
                          weight: { label: 'Peso (kg)', align: 'text-center' },
                          drive: { label: 'Drive', align: 'text-center' },
                          tip_type: { label: 'Tipo Punta', align: 'text-center' },
                          length: { label: 'Longitud', align: 'text-center' },
                          price: { label: 'Precio', align: 'text-right', sortable: true, sortKey: 'price_asc' },
                          cotizar: { label: '', align: 'text-center' },
                        }
                        const def = colDefs[col]
                        if (!def) return null
                        return (
                          <th
                            key={col}
                            className={`px-3 py-3 text-xs font-semibold text-[#6B7280] uppercase tracking-wider ${def.align} ${
                              col === 'image' ? 'w-[60px]' : col === 'cotizar' ? 'w-[100px]' : ''
                            } ${def.sortable ? 'cursor-pointer hover:text-[#FF6600] transition-colors' : ''}`}
                            onClick={def.sortable ? () => {
                              if (col === 'name') setSortBy(sortBy === 'name_asc' ? 'name_desc' : 'name_asc')
                              if (col === 'price') setSortBy(sortBy === 'price_asc' ? 'price_desc' : 'price_asc')
                            } : undefined}
                          >
                            <span className={`flex items-center gap-1 ${def.align === 'text-right' ? 'justify-end' : def.align === 'text-center' ? 'justify-center' : ''}`}>
                              {def.label}
                              {def.sortable && <ArrowUpDown size={11} />}
                            </span>
                          </th>
                        )
                      })}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#1E2330]">
                    {products.map((product) => (
                      <tr
                        key={product.id}
                        onClick={() => setSelectedProduct(product)}
                        className="hover:bg-[#1A1F2E] transition-colors cursor-pointer group"
                      >
                        {getColumns().map((col) => {
                          switch (col) {
                            case 'image':
                              return (
                                <td key={col} className="px-3 py-2">
                                  <div className="w-[46px] h-[46px] rounded-lg bg-[#141820] border border-[#1E2330] flex items-center justify-center overflow-hidden">
                                    {product.image_url ? (
                                      <img
                                        src={product.image_url}
                                        alt={product.name}
                                        referrerPolicy="no-referrer"
                                        className="w-full h-full object-contain p-0.5"
                                        onError={(e) => {
                                          (e.target as HTMLImageElement).style.display = 'none';
                                          (e.target as HTMLImageElement).parentElement!.innerHTML = '<span style="font-size:18px">\uD83D\uDCE6</span>'
                                        }}
                                      />
                                    ) : (
                                      <Package size={18} className="text-[#2A3040]" />
                                    )}
                                  </div>
                                </td>
                              )
                            case 'sku':
                              return (
                                <td key={col} className="px-3 py-2">
                                  <span className="font-mono text-xs text-[#FF6600] group-hover:text-[#FF8833]">{product.sku}</span>
                                </td>
                              )
                            case 'name':
                              return (
                                <td key={col} className="px-3 py-2">
                                  <span className="text-sm text-[#F0F2F5] group-hover:text-white max-w-[280px] truncate block">{product.name}</span>
                                </td>
                              )
                            case 'brand':
                              return (
                                <td key={col} className="px-3 py-2">
                                  <Badge variant="default" size="sm">{product.brand}</Badge>
                                </td>
                              )
                            case 'category':
                              return (
                                <td key={col} className="px-3 py-2 text-xs text-[#6B7280]">{product.category || '-'}</td>
                              )
                            case 'torque':
                              return (
                                <td key={col} className="px-3 py-2 text-center text-xs text-[#9CA3AF]">
                                  {product.torque_min != null && product.torque_max != null
                                    ? `${product.torque_min} - ${product.torque_max}`
                                    : product.torque_max != null
                                      ? `${product.torque_max}`
                                      : '-'}
                                </td>
                              )
                            case 'rpm':
                              return (
                                <td key={col} className="px-3 py-2 text-center text-xs text-[#9CA3AF]">
                                  {product.rpm || '-'}
                                </td>
                              )
                            case 'encastre':
                              return (
                                <td key={col} className="px-3 py-2 text-center">
                                  {product.encastre ? (
                                    <span className="inline-block px-2 py-0.5 rounded bg-[#1E2330] text-[10px] font-bold text-[#9CA3AF]">{product.encastre}</span>
                                  ) : '-'}
                                </td>
                              )
                            case 'weight':
                              return (
                                <td key={col} className="px-3 py-2 text-center text-xs text-[#9CA3AF]">
                                  {product.weight_kg != null ? `${product.weight_kg}` : '-'}
                                </td>
                              )
                            case 'drive':
                              return (
                                <td key={col} className="px-3 py-2 text-center text-xs text-[#9CA3AF]">
                                  {product.specs?.drive || product.encastre || '-'}
                                </td>
                              )
                            case 'tip_type':
                              return (
                                <td key={col} className="px-3 py-2 text-center text-xs text-[#9CA3AF]">
                                  {product.specs?.tipo_punta || '-'}
                                </td>
                              )
                            case 'length':
                              return (
                                <td key={col} className="px-3 py-2 text-center text-xs text-[#9CA3AF]">
                                  {product.specs?.longitud || '-'}
                                </td>
                              )
                            case 'price':
                              return (
                                <td key={col} className="px-3 py-2 text-right whitespace-nowrap">
                                  <span className="font-bold text-[#FF6600]">
                                    {product.price_eur > 0 ? formatCurrency(product.price_eur, 'EUR') : 'Consultar'}
                                  </span>
                                </td>
                              )
                            case 'cotizar':
                              return (
                                <td key={col} className="px-3 py-2 text-center">
                                  <button
                                    onClick={(e) => {
                                      e.stopPropagation()
                                      router.push(`/cotizador?products=${encodeURIComponent(product.sku)}`)
                                    }}
                                    className="px-3 py-1.5 rounded-lg bg-[#FF6600] hover:bg-[#E55A00] text-white text-xs font-bold transition-all shadow-lg shadow-orange-500/20 hover:shadow-orange-500/30 active:scale-95"
                                  >
                                    COTIZAR
                                  </button>
                                </td>
                              )
                            default:
                              return <td key={col} />
                          }
                        })}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Pagination */}
          {!productsLoading && totalCount > PAGE_SIZE && (
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
                <ChevronLeft size={16} /> Anterior
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
                Siguiente <ChevronRight size={16} />
              </button>
            </div>
          )}
        </div>
      )}

      {/* ======== PRODUCT DETAIL MODAL ======== */}
      <Modal isOpen={!!selectedProduct} onClose={() => setSelectedProduct(null)} title={selectedProduct?.name || ''} size="xl">
        {selectedProduct && (
          <div className="space-y-6">
            <div className="flex flex-col sm:flex-row gap-6">
              {/* Image */}
              <div className="w-full sm:w-72 aspect-square rounded-xl bg-[#0A0D12] border border-[#1E2330] flex items-center justify-center shrink-0 overflow-hidden">
                {selectedProduct.image_url ? (
                  <img
                    src={selectedProduct.image_url}
                    alt={selectedProduct.name}
                    referrerPolicy="no-referrer"
                    className="w-full h-full object-contain p-6"
                    onError={(e) => { (e.target as HTMLImageElement).style.display = 'none' }}
                  />
                ) : (
                  <Package size={72} className="text-[#2A3040]" />
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
                {selectedProduct.description && (
                  <p className="text-sm text-[#D1D5DB] mt-2 leading-relaxed">{selectedProduct.description}</p>
                )}

                <div className="pt-3 border-t border-[#1E2330] mt-4">
                  <p className="text-3xl font-bold text-[#FF6600]">
                    {selectedProduct.price_eur > 0 ? formatCurrency(selectedProduct.price_eur, 'EUR') : 'Consultar precio'}
                  </p>
                  <div className="flex items-center gap-4 mt-1">
                    {selectedProduct.cost_eur > 0 && (
                      <p className="text-xs text-[#4B5563]">Costo: {formatCurrency(selectedProduct.cost_eur, 'EUR')}</p>
                    )}
                    {selectedProduct.price_usd != null && selectedProduct.price_usd > 0 && (
                      <p className="text-xs text-[#6B7280]">USD {formatCurrency(selectedProduct.price_usd, 'USD')}</p>
                    )}
                    {selectedProduct.cost_eur > 0 && selectedProduct.price_eur > 0 && (
                      <p className="text-xs text-emerald-400">
                        Margen: {((1 - selectedProduct.cost_eur / selectedProduct.price_eur) * 100).toFixed(1)}%
                      </p>
                    )}
                  </div>
                </div>
              </div>
            </div>

            {/* Technical specs grid */}
            <div>
              <h4 className="text-sm font-semibold text-[#F0F2F5] mb-3">Especificaciones Tecnicas</h4>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                {selectedProduct.torque_min != null && (
                  <div className="flex justify-between p-2.5 rounded-lg bg-[#0A0D12] border border-[#1E2330]">
                    <span className="text-xs text-[#6B7280]">Torque Min</span>
                    <span className="text-xs font-medium text-[#F0F2F5]">{selectedProduct.torque_min} Nm</span>
                  </div>
                )}
                {selectedProduct.torque_max != null && (
                  <div className="flex justify-between p-2.5 rounded-lg bg-[#0A0D12] border border-[#1E2330]">
                    <span className="text-xs text-[#6B7280]">Torque Max</span>
                    <span className="text-xs font-medium text-[#F0F2F5]">{selectedProduct.torque_max} Nm</span>
                  </div>
                )}
                {selectedProduct.rpm != null && (
                  <div className="flex justify-between p-2.5 rounded-lg bg-[#0A0D12] border border-[#1E2330]">
                    <span className="text-xs text-[#6B7280]">RPM</span>
                    <span className="text-xs font-medium text-[#F0F2F5]">{selectedProduct.rpm}</span>
                  </div>
                )}
                {selectedProduct.encastre && (
                  <div className="flex justify-between p-2.5 rounded-lg bg-[#0A0D12] border border-[#1E2330]">
                    <span className="text-xs text-[#6B7280]">Encastre</span>
                    <span className="text-xs font-medium text-[#F0F2F5]">{selectedProduct.encastre}</span>
                  </div>
                )}
                {selectedProduct.weight_kg != null && (
                  <div className="flex justify-between p-2.5 rounded-lg bg-[#0A0D12] border border-[#1E2330]">
                    <span className="text-xs text-[#6B7280]">Peso</span>
                    <span className="text-xs font-medium text-[#F0F2F5]">{selectedProduct.weight_kg} kg</span>
                  </div>
                )}
                {selectedProduct.origin && (
                  <div className="flex justify-between p-2.5 rounded-lg bg-[#0A0D12] border border-[#1E2330]">
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
                    <div key={key} className="flex justify-between p-2.5 rounded-lg bg-[#0A0D12] border border-[#1E2330]">
                      <span className="text-xs text-[#6B7280]">{key}</span>
                      <span className="text-xs font-medium text-[#F0F2F5]">{String(value)}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Actions */}
            <div className="flex gap-3 pt-2">
              <Button
                variant="primary"
                className="flex-1 gap-2"
                onClick={() => {
                  router.push(`/cotizador?products=${encodeURIComponent(selectedProduct.sku)}`)
                }}
              >
                <ShoppingCart size={16} /> Cotizar este producto
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
