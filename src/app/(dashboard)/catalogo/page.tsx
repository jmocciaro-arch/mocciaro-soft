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
import { formatCurrency, formatDate } from '@/lib/utils'
import { ExportButton } from '@/components/ui/export-button'
import { ImportButton } from '@/components/ui/import-button'
import {
  Package, Loader2, ShoppingCart, Tag, Award, DollarSign,
  ChevronDown, ChevronRight, X, RotateCcw, Plus, Search, ArrowUpDown,
  ChevronLeft, Upload, Trash2, Edit3, Eye, FileSpreadsheet,
  Check, Percent, ArrowLeft, ToggleLeft, ToggleRight,
  LayoutGrid, List, SlidersHorizontal,
  TrendingUp, TrendingDown, History, Minus
} from 'lucide-react'
import { useToast } from '@/components/ui/toast'
import { useCompanyContext } from '@/lib/company-context'
import { usePermissions } from '@/hooks/use-permissions'
import { Input } from '@/components/ui/input'
import { parseCSV, readFileAsText } from '@/lib/csv-parser'
import { ProductPricesTab, type CompanyPriceRow } from '@/components/catalogo/product-prices-tab'
import { DynamicAttributeInput } from '@/components/catalogo/dynamic-attribute-input'
import { useCatalogPresets } from '@/hooks/use-catalog-presets'

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
  diagram_url: string | null
  gallery_urls: Array<{ url: string; alt?: string; sort_order?: number }> | null
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

interface CategoryCard {
  name: string        // category value (e.g. "PUNTAS Y TUBOS")
  product_count: number
  subcategories: string[]  // distinct subcategory values for this category
}

/* Legacy types removed: ProductFamily, FilterConfig — cards now driven by tt_products.category */

interface SearchResult {
  id: string
  sku: string
  name: string
  brand: string
  price_eur: number
  image_url: string | null
  relevance: number
}

type SortOption = 'name_asc' | 'name_desc' | 'price_asc' | 'price_desc'

// -------------------------------------------------------
// Category emoji map (matched by lowercased category)
// -------------------------------------------------------
const CATEGORY_EMOJI: Record<string, string> = {
  'atornilladores': '\uD83D\uDD27',
  'llaves de torque': '\uD83D\uDD29',
  'equilibradoras': '\u2696\uFE0F',
  'balanceadores': '\u2696\uFE0F',
  'puntas y tubos': '\uD83D\uDD28',
  'bits y puntas': '\uD83D\uDD28',
  'soldadura': '\u26A1',
  'epp': '\uD83E\uDDBA',
  'accesorios': '\uD83D\uDD17',
  'repuestos': '\uD83D\uDEE0\uFE0F',
  'otros': '\uD83D\uDCE6',
  '__todos__': '\uD83D\uDCE6',
}

const getCategoryEmoji = (cat: string): string => {
  return CATEGORY_EMOJI[cat.toLowerCase()] || '\uD83D\uDCCB'
}

const CATEGORY_COLUMNS: Record<string, string[]> = {
  'atornilladores': ['image', 'sku', 'name', 'torque', 'rpm', 'encastre', 'weight', 'price', 'cotizar'],
  'llaves de torque': ['image', 'sku', 'name', 'torque', 'encastre', 'brand', 'price', 'cotizar'],
  'equilibradoras': ['image', 'sku', 'name', 'weight', 'brand', 'price', 'cotizar'],
  'balanceadores': ['image', 'sku', 'name', 'weight', 'brand', 'price', 'cotizar'],
  'puntas y tubos': ['image', 'sku', 'name', 'brand', 'category', 'subcategory', 'price', 'cotizar'],
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
  const { addToast } = useToast()
  const { hasRole, isSuper } = usePermissions()
  const isAdmin = isSuper || hasRole('admin') || hasRole('super_admin')

  // Catálogo presets (categorías, marcas, atributos, valores predefinidos desde la DB)
  const presets = useCatalogPresets()

  // ---------- Core State ----------
  const [categories, setCategories] = useState<CategoryCard[]>([])
  const [creatingNewCategory, setCreatingNewCategory] = useState(false)
  const [categoriesLoading, setCategoriesLoading] = useState(true)
  const [totalProductCount, setTotalProductCount] = useState(0)
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null) // null = grid, '__todos__' = all, or category name
  const [selectedSubcategory, setSelectedSubcategory] = useState<string | null>(null)
  const [currentSubcategories, setCurrentSubcategories] = useState<string[]>([])

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

  // View mode & facet filters
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('list')
  const [filterBrands, setFilterBrands] = useState<string[]>([])
  const [filterEncastres, setFilterEncastres] = useState<string[]>([])
  const [availableBrands, setAvailableBrands] = useState<string[]>([])
  const [availableEncastres, setAvailableEncastres] = useState<string[]>([])

  // Debounce ref for sort/filter changes
  const filterDebounceRef = useRef<NodeJS.Timeout | null>(null)

  // Product detail modal
  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null)

  // Product form modal (create + edit)
  const [showProductForm, setShowProductForm] = useState(false)
  const [editingProduct, setEditingProduct] = useState<Product | null>(null)
  const [productFormTab, setProductFormTab] = useState<'general' | 'precios' | 'tecnico' | 'imagenes' | 'specs'>('general')
  const [productForm, setProductForm] = useState<Partial<Product>>({})
  const [productSaving, setProductSaving] = useState(false)
  const [brandSuggestions, setBrandSuggestions] = useState<string[]>([])
  const [showBrandSuggestions, setShowBrandSuggestions] = useState(false)
  const brandInputRef = useRef<HTMLInputElement>(null)

  // Specs editor (key-value pairs)
  const [specRows, setSpecRows] = useState<Array<{ key: string; value: string }>>([])

  // Per-company pricing
  type CompanyMeta = { id: string; name: string; currency: string; country: string }
  const [companiesMeta, setCompaniesMeta] = useState<CompanyMeta[]>([])
  const [companyPrices, setCompanyPrices] = useState<Record<string, CompanyPriceRow>>({})

  // Load companies once
  useEffect(() => {
    const sb = createClient()
    sb.from('tt_companies').select('id,name,currency,country').order('name')
      .then(({ data }) => setCompaniesMeta((data || []) as CompanyMeta[]))
  }, [])

  const handlePriceChange = useCallback(
    (companyId: string, field: keyof CompanyPriceRow, value: string | number | null) => {
      setCompanyPrices(prev => {
        const existing = prev[companyId]
        const base: CompanyPriceRow = existing ?? {
          company_id:    companyId,
          currency_code: companiesMeta.find(c => c.id === companyId)?.currency || 'USD',
          purchase_price: null,
          sale_price:    null,
          min_price:     null,
        }
        return { ...prev, [companyId]: { ...base, [field]: value } }
      })
    },
    [companiesMeta]
  )

  // Delete confirm
  const [deleteConfirmProduct, setDeleteConfirmProduct] = useState(false)
  const [deletingProduct, setDeletingProduct] = useState(false)

  // WooCommerce import
  const [showWooImport, setShowWooImport] = useState(false)
  const [wooFile, setWooFile] = useState<File | null>(null)
  const [wooParsedRows, setWooParsedRows] = useState<Array<Record<string, string>>>([])
  const [wooPreview, setWooPreview] = useState<{ total: number; categories: string[]; brands: string[] } | null>(null)
  const [wooImporting, setWooImporting] = useState(false)
  const [wooProgress, setWooProgress] = useState('')
  const wooFileRef = useRef<HTMLInputElement>(null)

  const totalPages = Math.max(1, Math.ceil(totalCount / PAGE_SIZE))

  // ---------- Load dynamic categories from tt_products on mount ----------
  const loadCategories = useCallback(async () => {
    setCategoriesLoading(true)
    const sb = createClient()

    // Total active count
    const { count: allCount } = await sb
      .from('tt_products')
      .select('*', { count: 'exact', head: true })
      .eq('active', true)
    setTotalProductCount(allCount || 0)

    // Usamos RPC para obtener conteos y subcategorías sin el límite de 1000 filas
    const { data: rpcData, error: rpcError } = await sb.rpc('get_catalog_category_counts')

    if (!rpcError && rpcData && Array.isArray(rpcData)) {
      const cards: CategoryCard[] = (rpcData as Array<{
        category_name: string
        product_count: number
        subcategories: string[] | null
      }>).map(r => ({
        name: r.category_name,
        product_count: Number(r.product_count) || 0,
        subcategories: (r.subcategories || []).filter(Boolean).sort(),
      }))
      setCategories(cards)
    } else {
      setCategories([])
    }
    setCategoriesLoading(false)
  }, [])

  useEffect(() => {
    loadCategories()
  }, [loadCategories])

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

  // ---------- Load products for selected category ----------
  const loadProducts = useCallback(async (
    categoryName: string | null,
    subcat: string | null,
    pageNum: number,
    sort: SortOption,
    brands: string[] = [],
    encastres: string[] = [],
  ) => {
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

    // Filter by category (skip for '__todos__' which shows everything)
    if (categoryName && categoryName !== '__todos__') {
      query = query.eq('category', categoryName)
    }

    // Filter by subcategory if selected
    if (subcat) {
      query = query.eq('subcategory', subcat)
    }

    // Facet filters
    if (brands.length > 0) {
      query = query.in('brand', brands)
    }
    if (encastres.length > 0) {
      query = query.in('encastre', encastres)
    }

    const { data, count } = await query
    setProducts((data || []) as Product[])
    setTotalCount(count || 0)
    setProductsLoading(false)
  }, [])

  // ---------- Select a category ----------
  const selectCategory = useCallback((categoryName: string) => {
    setSelectedCategory(categoryName)
    setSelectedSubcategory(null)
    setFilterBrands([])
    setFilterEncastres([])
    // Load subcategories for this category
    if (categoryName !== '__todos__') {
      const card = categories.find(c => c.name === categoryName)
      setCurrentSubcategories(card?.subcategories || [])
    } else {
      setCurrentSubcategories([])
    }
    setPage(1)
    setSortBy('name_asc')
    loadProducts(categoryName, null, 1, 'name_asc')

    // Load available facet values for this category
    const loadFacets = async () => {
      const sbFacets = createClient()
      const isAll = categoryName === '__todos__'
      const { data } = await (isAll
        ? sbFacets.from('tt_products').select('brand, encastre').eq('active', true)
        : sbFacets.from('tt_products').select('brand, encastre').eq('active', true).eq('category', categoryName)
      )
      type FacetRow = { brand: string | null; encastre: string | null }
      const rows = (data || []) as FacetRow[]
      const brands = [...new Set(rows.map(r => r.brand).filter((b): b is string => !!b))].sort()
      const encastres = [...new Set(rows.map(r => r.encastre).filter((e): e is string => !!e))].sort()
      setAvailableBrands(brands)
      setAvailableEncastres(encastres)
    }
    loadFacets()
  }, [loadProducts, categories])

  // ---------- Go back to categories grid ----------
  const goBackToCategories = useCallback(() => {
    setSelectedCategory(null)
    setSelectedSubcategory(null)
    setCurrentSubcategories([])
    setProducts([])
    setTotalCount(0)
    setPage(1)
    setFilterBrands([])
    setFilterEncastres([])
    setAvailableBrands([])
    setAvailableEncastres([])
  }, [])

  // ---------- Sort / subcategory / facet change ----------
  useEffect(() => {
    if (!selectedCategory) return
    if (filterDebounceRef.current) clearTimeout(filterDebounceRef.current)
    filterDebounceRef.current = setTimeout(() => {
      setPage(1)
      loadProducts(selectedCategory, selectedSubcategory, 1, sortBy, filterBrands, filterEncastres)
    }, 400)
    return () => {
      if (filterDebounceRef.current) clearTimeout(filterDebounceRef.current)
    }
  }, [sortBy, selectedCategory, selectedSubcategory, filterBrands, filterEncastres, loadProducts])

  // ---------- Pagination ----------
  const changePage = useCallback((newPage: number) => {
    if (!selectedCategory || newPage < 1 || newPage > totalPages) return
    setPage(newPage)
    loadProducts(selectedCategory, selectedSubcategory, newPage, sortBy, filterBrands, filterEncastres)
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }, [totalPages, selectedCategory, selectedSubcategory, sortBy, filterBrands, filterEncastres, loadProducts])

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

  // ---------- Open product form (create) ----------
  const openCreateProduct = useCallback(() => {
    setEditingProduct(null)
    setProductForm({
      sku: '',
      name: '',
      description: '',
      brand: '',
      product_type: 'product',
      family_id: null,
      category: (selectedCategory && selectedCategory !== '__todos__') ? selectedCategory : '',
      subcategory: selectedSubcategory || '',
      active: true,
      price_eur: 0,
      price_usd: null,
      price_ars: null,
      cost_eur: 0,
      price_min: null,
      encastre: '',
      torque_min: null,
      torque_max: null,
      rpm: null,
      weight_kg: null,
      modelo: '',
      serie: '',
      origin: '',
      image_url: '',
      diagram_url: '',
      gallery_urls: [],
      specs: {},
    })
    setSpecRows([])
    setCompanyPrices({})
    setCreatingNewCategory(false)
    setProductFormTab('general')
    setShowProductForm(true)
  }, [selectedCategory, selectedSubcategory])

  // ---------- Open product form (edit) ----------
  const openEditProduct = useCallback((product: Product) => {
    setEditingProduct(product)
    setProductForm({ ...product })
    const existingSpecs = product.specs || {}
    setSpecRows(Object.entries(existingSpecs).map(([key, value]) => ({ key, value: String(value) })))
    // Cargar precios por empresa
    setCompanyPrices({})
    const sb = createClient()
    sb.from('tt_product_prices').select('*').eq('product_id', product.id)
      .then(({ data }) => {
        const map: Record<string, CompanyPriceRow> = {}
        ;(data || []).forEach((r) => { map[r.company_id as string] = r as CompanyPriceRow })
        setCompanyPrices(map)
      })
    setCreatingNewCategory(false)
    setProductFormTab('general')
    setSelectedProduct(null)
    setShowProductForm(true)
  }, [])

  // ---------- Load brand suggestions ----------
  const loadBrandSuggestions = useCallback(async (query: string) => {
    if (!query || query.length < 1) {
      setBrandSuggestions([])
      setShowBrandSuggestions(false)
      return
    }
    const sb = createClient()
    const { data } = await sb
      .from('tt_products')
      .select('brand')
      .ilike('brand', `%${query}%`)
      .limit(50)

    if (data) {
      const unique = [...new Set(data.map(d => d.brand as string).filter(Boolean))]
      setBrandSuggestions(unique.slice(0, 8))
      setShowBrandSuggestions(unique.length > 0)
    }
  }, [])

  // ---------- Update product form field ----------
  const updateProductField = useCallback((field: string, value: unknown) => {
    setProductForm(prev => ({ ...prev, [field]: value }))
  }, [])

  // ---------- Save product (create or update) ----------
  const saveProduct = useCallback(async () => {
    if (!productForm.sku?.trim()) {
      addToast({ type: 'warning', title: 'El SKU es obligatorio' })
      return
    }
    if (!productForm.name?.trim()) {
      addToast({ type: 'warning', title: 'El nombre es obligatorio' })
      return
    }

    setProductSaving(true)
    const sb = createClient()

    // Build specs from specRows
    const specs: Record<string, string> = {}
    for (const row of specRows) {
      if (row.key.trim()) {
        specs[row.key.trim()] = row.value.trim()
      }
    }

    const payload = {
      sku: productForm.sku!.trim(),
      name: productForm.name!.trim(),
      description: productForm.description?.trim() || null,
      brand: productForm.brand?.trim() || '',
      product_type: productForm.product_type || 'product',
      family_id: productForm.family_id || null,
      category: productForm.category?.trim() || null,
      subcategory: productForm.subcategory?.trim() || null,
      active: productForm.active ?? true,
      price_eur: productForm.price_eur || 0,
      price_usd: productForm.price_usd || null,
      price_ars: productForm.price_ars || null,
      cost_eur: productForm.cost_eur || 0,
      price_min: productForm.price_min || null,
      encastre: productForm.encastre?.trim() || null,
      torque_min: productForm.torque_min || null,
      torque_max: productForm.torque_max || null,
      rpm: productForm.rpm || null,
      weight_kg: productForm.weight_kg || null,
      modelo: productForm.modelo?.trim() || null,
      serie: productForm.serie?.trim() || null,
      origin: productForm.origin?.trim() || null,
      image_url: productForm.image_url?.trim() || null,
      diagram_url: productForm.diagram_url?.trim() || null,
      gallery_urls: Array.isArray(productForm.gallery_urls) && productForm.gallery_urls.length
        ? productForm.gallery_urls.filter(g => g && g.url?.trim())
        : [],
      specs: Object.keys(specs).length > 0 ? specs : null,
    }

    let error
    let savedProductId: string | null = editingProduct?.id ?? null

    if (editingProduct) {
      const res = await sb
        .from('tt_products')
        .update(payload)
        .eq('id', editingProduct.id)
      error = res.error
    } else {
      const res = await sb
        .from('tt_products')
        .insert(payload)
        .select('id')
        .single()
      error = res.error
      if (!error && res.data) savedProductId = (res.data as { id: string }).id
    }

    // Guardar precios por empresa
    if (!error && savedProductId) {
      const priceRows = Object.values(companyPrices).filter(
        (r) => r.purchase_price != null || r.sale_price != null || r.min_price != null
      )
      if (priceRows.length > 0) {
        await sb.from('tt_product_prices').upsert(
          priceRows.map((r) => ({
            product_id:     savedProductId,
            company_id:     r.company_id,
            currency_code:  r.currency_code,
            purchase_price: r.purchase_price,
            sale_price:     r.sale_price,
            min_price:      r.min_price,
          })),
          { onConflict: 'product_id,company_id' }
        )
      }
    }

    setProductSaving(false)

    if (error) {
      addToast({ type: 'error', title: 'Error guardando producto', message: error.message })
      return
    }

    addToast({ type: 'success', title: editingProduct ? 'Producto actualizado' : 'Producto creado' })
    setShowProductForm(false)
    setEditingProduct(null)

    // Reload
    if (selectedCategory) {
      loadProducts(selectedCategory, selectedSubcategory, page, sortBy)
    }
    loadCategories()
  }, [productForm, specRows, editingProduct, companyPrices, selectedCategory, selectedSubcategory, page, sortBy, addToast, loadProducts, loadCategories])

  // ---------- Soft delete product ----------
  const softDeleteProduct = useCallback(async (product: Product) => {
    setDeletingProduct(true)
    const sb = createClient()
    const { error } = await sb
      .from('tt_products')
      .update({ active: false })
      .eq('id', product.id)

    setDeletingProduct(false)
    setDeleteConfirmProduct(false)

    if (error) {
      addToast({ type: 'error', title: 'Error eliminando producto', message: error.message })
      return
    }

    addToast({ type: 'success', title: 'Producto desactivado', message: product.sku })
    setSelectedProduct(null)

    if (selectedCategory) {
      loadProducts(selectedCategory, selectedSubcategory, page, sortBy)
    }
    loadCategories()
  }, [selectedCategory, selectedSubcategory, page, sortBy, addToast, loadProducts, loadCategories])

  // ---------- WooCommerce CSV Parse ----------
  const parseWooCSV = useCallback(async (file: File) => {
    try {
      const text = await readFileAsText(file)
      const parsed = parseCSV(text)
      if (!parsed.headers.length || !parsed.rows.length) {
        addToast({ type: 'error', title: 'CSV vacio o formato invalido' })
        return
      }

      // Build array of objects from headers + rows
      const rows: Array<Record<string, string>> = parsed.rows.map(row => {
        const obj: Record<string, string> = {}
        parsed.headers.forEach((h, i) => {
          obj[h.trim()] = (row[i] || '').trim()
        })
        return obj
      }).filter(r => r['SKU']?.trim()) // Only rows with SKU

      if (rows.length === 0) {
        addToast({ type: 'error', title: 'No se encontraron productos con SKU en el CSV' })
        return
      }

      // Build preview stats
      const catSet = new Set<string>()
      const brandSet = new Set<string>()

      for (const row of rows) {
        // Parse categories like "BALANCEADORES > NO GRAVITY"
        const cats = row['Categorías'] || row['Categorias'] || row['Categories'] || ''
        if (cats) {
          const mainCat = cats.split(',')[0]?.split('>')[0]?.trim()
          if (mainCat) catSet.add(mainCat)
        }

        // Brand from "Marcas" column or from attributes
        let brand = row['Marcas'] || row['Brands'] || ''
        if (!brand) {
          // Search through attribute columns for MARCA
          for (let i = 1; i <= 38; i++) {
            const attrName = row[`Nombre del atributo ${i}`] || ''
            if (attrName.toUpperCase() === 'MARCA') {
              brand = row[`Valor(es) del atributo ${i}`] || ''
              break
            }
          }
        }
        if (brand) brandSet.add(brand.trim())
      }

      setWooParsedRows(rows)
      setWooPreview({
        total: rows.length,
        categories: Array.from(catSet).sort(),
        brands: Array.from(brandSet).sort(),
      })
    } catch (err) {
      addToast({ type: 'error', title: 'Error leyendo CSV', message: String(err) })
    }
  }, [addToast])

  // ---------- WooCommerce CSV Import (upsert) ----------
  const importWooCSV = useCallback(async () => {
    if (wooParsedRows.length === 0) return
    setWooImporting(true)
    setWooProgress('Preparando importacion...')

    try {
      // Process rows into product payloads (no family_id mapping needed)
      const productPayloads: Array<Record<string, unknown>> = []

      for (const row of wooParsedRows) {
        const sku = (row['SKU'] || '').trim()
        if (!sku) continue

        const name = row['Nombre'] || row['Name'] || ''
        const description = row['Descripción corta'] || row['Descripcion corta'] || row['Short description'] || ''
        const priceStr = row['Precio normal'] || row['Regular price'] || '0'
        const price_eur = parseFloat(priceStr.replace(',', '.')) || 0
        const weightStr = row['Peso (kg)'] || row['Weight (kg)'] || ''
        const weight_kg = weightStr ? (parseFloat(weightStr.replace(',', '.')) || null) : null
        const imagesStr = row['Imágenes'] || row['Imagenes'] || row['Images'] || ''
        const image_url = imagesStr.split(',')[0]?.trim() || null

        // Parse categories directly into category/subcategory fields
        const catStr = row['Categorías'] || row['Categorias'] || row['Categories'] || ''
        let category: string | null = null
        let subcategory: string | null = null

        if (catStr) {
          const firstCatPath = catStr.split(',')[0]?.trim() || ''
          const catParts = firstCatPath.split('>').map(p => p.trim())
          category = catParts[0] || null
          subcategory = catParts[1] || null
        }

        // Brand
        let brand = row['Marcas'] || row['Brands'] || ''
        if (!brand) {
          for (let i = 1; i <= 38; i++) {
            const attrName = row[`Nombre del atributo ${i}`] || ''
            if (attrName.toUpperCase() === 'MARCA') {
              brand = row[`Valor(es) del atributo ${i}`] || ''
              break
            }
          }
        }

        // Build specs from attributes
        const specs: Record<string, string> = {}
        for (let i = 1; i <= 38; i++) {
          const attrName = row[`Nombre del atributo ${i}`] || ''
          const attrValue = row[`Valor(es) del atributo ${i}`] || ''
          if (attrName && attrValue && attrName.toUpperCase() !== 'MARCA') {
            specs[attrName.trim()] = attrValue.trim()
          }
        }

        // Tags
        const tags = row['Etiquetas'] || row['Tags'] || ''
        if (tags) {
          specs['tags'] = tags
        }

        productPayloads.push({
          sku,
          name,
          description: description || null,
          brand: brand.trim(),
          price_eur,
          weight_kg,
          image_url,
          category,
          subcategory,
          specs: Object.keys(specs).length > 0 ? specs : null,
          active: true,
          product_type: 'product',
        })
      }

      // Upsert products in batches of 100
      const BATCH_SIZE = 100
      let inserted = 0
      let errors = 0

      for (let i = 0; i < productPayloads.length; i += BATCH_SIZE) {
        const batch = productPayloads.slice(i, i + BATCH_SIZE)
        setWooProgress(`Importando ${i + 1}-${Math.min(i + BATCH_SIZE, productPayloads.length)} de ${productPayloads.length}...`)

        const sb4 = createClient()
        const { error } = await sb4
          .from('tt_products')
          .upsert(batch, { onConflict: 'sku' })

        if (error) {
          errors += batch.length
          console.error('WooCommerce import batch error:', error)
        } else {
          inserted += batch.length
        }
      }

      setWooImporting(false)
      setWooProgress('')
      setShowWooImport(false)
      setWooFile(null)
      setWooParsedRows([])
      setWooPreview(null)

      addToast({
        type: errors > 0 ? 'warning' : 'success',
        title: `Importacion completada: ${inserted} productos`,
        message: errors > 0 ? `${errors} filas con errores` : undefined,
      })

      // Reload everything
      loadCategories()
      if (selectedCategory) {
        loadProducts(selectedCategory, selectedSubcategory, page, sortBy)
      }
    } catch (err) {
      setWooImporting(false)
      setWooProgress('')
      addToast({ type: 'error', title: 'Error en importacion', message: String(err) })
    }
  }, [wooParsedRows, addToast, loadCategories, selectedCategory, selectedSubcategory, page, sortBy, loadProducts])

  // ---------- Get table columns for current category ----------
  const getColumns = useCallback(() => {
    const defaultCols = ['image', 'sku', 'name', 'brand', 'category', 'price', 'cotizar']
    if (!selectedCategory || selectedCategory === '__todos__') return defaultCols
    return CATEGORY_COLUMNS[selectedCategory.toLowerCase()] || defaultCols
  }, [selectedCategory])

  // ---------- Clear subcategory filter ----------
  const clearSubcategoryFilter = useCallback(() => {
    setSelectedSubcategory(null)
  }, [])

  const hasActiveFilters = useMemo(() => {
    return !!selectedSubcategory || filterBrands.length > 0 || filterEncastres.length > 0
  }, [selectedSubcategory, filterBrands, filterEncastres])

  const clearAllFilters = useCallback(() => {
    setSelectedSubcategory(null)
    setFilterBrands([])
    setFilterEncastres([])
  }, [])

  // ============================================================
  // RENDER
  // ============================================================
  return (
    <div className="space-y-6">

      {/* ======== ACTION BUTTONS ======== */}
      <div className="flex items-center gap-3 flex-wrap">
        <Button variant="primary" size="sm" onClick={openCreateProduct}>
          <Plus size={14} /> Nuevo Producto
        </Button>
        <ImportButton
          targetTable="tt_products"
          fields={[
            { key: 'sku', label: 'SKU', required: true },
            { key: 'name', label: 'Nombre', required: true },
            { key: 'brand', label: 'Marca' },
            { key: 'description', label: 'Descripcion' },
            { key: 'category', label: 'Categoria' },
            { key: 'subcategory', label: 'Subcategoria' },
            { key: 'price_eur', label: 'Precio EUR', type: 'number' },
            { key: 'cost_eur', label: 'Costo EUR', type: 'number' },
            { key: 'price_usd', label: 'Precio USD', type: 'number' },
            { key: 'price_ars', label: 'Precio ARS', type: 'number' },
            { key: 'price_min', label: 'Precio Minimo', type: 'number' },
            { key: 'encastre', label: 'Encastre' },
            { key: 'torque_min', label: 'Torque Min', type: 'number' },
            { key: 'torque_max', label: 'Torque Max', type: 'number' },
            { key: 'rpm', label: 'RPM', type: 'number' },
            { key: 'weight_kg', label: 'Peso (kg)', type: 'number' },
            { key: 'product_type', label: 'Tipo' },
            { key: 'modelo', label: 'Modelo' },
            { key: 'serie', label: 'Serie' },
            { key: 'origin', label: 'Origen' },
            { key: 'image_url', label: 'URL Imagen' },
            { key: 'active', label: 'Activo', type: 'boolean' },
          ]}
          onComplete={() => {
            if (selectedCategory) {
              loadProducts(selectedCategory, selectedSubcategory, page, sortBy)
            }
            loadCategories()
          }}
          label="Importar"
        />
        <Button
          variant="secondary"
          size="sm"
          onClick={() => setShowWooImport(true)}
        >
          <Upload size={14} /> Importar WooCommerce
        </Button>
        <Button
          variant="secondary"
          size="sm"
          onClick={async () => {
            const sb = createClient()
            const { addToast: t } = { addToast }
            addToast({ type: 'info', title: 'Descargando todos los productos...' })
            // Fetch ALL products (no limit)
            let allProds: Record<string, unknown>[] = []
            let page = 0
            const PAGE = 1000
            while (true) {
              const { data } = await sb.from('tt_products')
                .select('sku, name, description, brand, category, subcategory, price_eur, cost_eur, price_usd, price_ars, price_min, encastre, torque_min, torque_max, rpm, weight_kg, modelo, serie, origin, image_url, product_type, active, specs')
                .eq('active', true)
                .range(page * PAGE, (page + 1) * PAGE - 1)
                .order('sku')
              if (!data || data.length === 0) break
              allProds = allProds.concat(data as Record<string, unknown>[])
              page++
              if (data.length < PAGE) break
            }
            // Convert specs JSONB to flat columns
            const specKeys = new Set<string>()
            allProds.forEach(p => {
              if (p.specs && typeof p.specs === 'object') {
                Object.keys(p.specs as Record<string, unknown>).forEach(k => specKeys.add(k))
              }
            })
            const rows = allProds.map(p => {
              const row: Record<string, unknown> = { ...p }
              delete row.specs
              const specs = (p.specs || {}) as Record<string, unknown>
              for (const k of specKeys) { row['spec_' + k] = specs[k] || '' }
              return row
            })
            // Generate CSV
            if (rows.length === 0) { addToast({ type: 'warning', title: 'No hay productos para exportar' }); return }
            const headers = Object.keys(rows[0])
            const csv = [headers.join(','), ...rows.map(r => headers.map(h => {
              const v = r[h]
              if (v == null) return ''
              const s = String(v)
              return s.includes(',') || s.includes('"') || s.includes('\n') ? '"' + s.replace(/"/g, '""') + '"' : s
            }).join(','))].join('\n')
            const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8' })
            const url2 = URL.createObjectURL(blob)
            const a = document.createElement('a')
            a.href = url2
            a.download = `productos_mocciaro_soft_${new Date().toISOString().split('T')[0]}.csv`
            a.click()
            URL.revokeObjectURL(url2)
            addToast({ type: 'success', title: `${allProds.length} productos exportados` })
          }}
        >
          <FileSpreadsheet size={14} /> Exportar TODO ({totalProductCount.toLocaleString('es-AR')})
        </Button>
      </div>

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

      {/* ======== CATEGORY CARDS (when no category selected) ======== */}
      {!selectedCategory && (
        <>
          {categoriesLoading ? (
            <div className="flex flex-col items-center justify-center py-16">
              <Loader2 className="animate-spin text-[#FF6600] mb-3" size={32} />
              <p className="text-sm text-[#4B5563]">Cargando categorias de productos...</p>
            </div>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
              {/* "Todos los productos" card */}
              <button
                onClick={() => selectCategory('__todos__')}
                className="group relative rounded-2xl bg-[#141820] border border-[#FF6600]/30 p-6 hover:border-[#FF6600]/60 hover:bg-[#1A1F2E] transition-all duration-300 cursor-pointer text-left flex flex-col items-center gap-3 hover:shadow-lg hover:shadow-[#FF6600]/10 hover:-translate-y-0.5"
              >
                <span className="text-4xl group-hover:scale-110 transition-transform duration-300">{getCategoryEmoji('__todos__')}</span>
                <h3 className="text-sm font-bold text-[#FF6600] text-center">
                  Todos los productos
                </h3>
                <span className="text-xs text-[#6B7280]">
                  {totalProductCount.toLocaleString('es-AR')} productos
                </span>
                <div className="absolute bottom-0 left-4 right-4 h-0.5 bg-[#FF6600] rounded-full opacity-0 group-hover:opacity-100 transition-opacity duration-300" />
              </button>

              {/* Dynamic category cards */}
              {categories.map((cat) => (
                <button
                  key={cat.name}
                  onClick={() => selectCategory(cat.name)}
                  className="group relative rounded-2xl bg-[#141820] border border-[#1E2330] p-6 hover:border-[#FF6600]/40 hover:bg-[#1A1F2E] transition-all duration-300 cursor-pointer text-left flex flex-col items-center gap-3 hover:shadow-lg hover:shadow-[#FF6600]/5 hover:-translate-y-0.5"
                >
                  <span className="text-4xl group-hover:scale-110 transition-transform duration-300">{getCategoryEmoji(cat.name)}</span>
                  <h3 className="text-sm font-bold text-[#F0F2F5] text-center group-hover:text-[#FF6600] transition-colors">
                    {cat.name}
                  </h3>
                  <span className="text-xs text-[#6B7280]">
                    {cat.product_count.toLocaleString('es-AR')} productos
                  </span>
                  {cat.subcategories.length > 0 && (
                    <p className="text-[10px] text-[#4B5563] text-center line-clamp-2 mt-1">
                      {cat.subcategories.slice(0, 4).join(', ')}{cat.subcategories.length > 4 ? ` +${cat.subcategories.length - 4}` : ''}
                    </p>
                  )}
                  <div className="absolute bottom-0 left-4 right-4 h-0.5 bg-[#FF6600] rounded-full opacity-0 group-hover:opacity-100 transition-opacity duration-300" />
                </button>
              ))}
            </div>
          )}
        </>
      )}

      {/* ======== CATEGORY DETAIL VIEW (when a category is selected) ======== */}
      {selectedCategory && (
        <div className="space-y-5">
          {/* Category header + back button */}
          <div className="flex items-center gap-4 flex-wrap">
            <button
              onClick={goBackToCategories}
              className="flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium text-[#9CA3AF] hover:text-[#F0F2F5] hover:bg-[#1E2330] transition-all"
            >
              <ChevronLeft size={18} /> Categorias
            </button>
            <div className="flex items-center gap-3 flex-1">
              <span className="text-3xl">{getCategoryEmoji(selectedCategory)}</span>
              <div>
                <h2 className="text-xl font-bold text-[#F0F2F5]">
                  {selectedCategory === '__todos__' ? 'Todos los productos' : selectedCategory}
                </h2>
                <p className="text-xs text-[#6B7280]">
                  {productsLoading ? 'Cargando...' : `${totalCount.toLocaleString('es-AR')} productos`}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              {/* View mode toggle */}
              <div className="flex items-center rounded-lg border border-[#2A3040] bg-[#0F1218] overflow-hidden">
                <button
                  onClick={() => setViewMode('list')}
                  title="Vista lista"
                  className={`flex items-center justify-center w-9 h-9 transition-colors ${viewMode === 'list' ? 'bg-[#FF6600] text-white' : 'text-[#6B7280] hover:text-[#F0F2F5]'}`}
                >
                  <List size={15} />
                </button>
                <button
                  onClick={() => setViewMode('grid')}
                  title="Vista grilla"
                  className={`flex items-center justify-center w-9 h-9 transition-colors ${viewMode === 'grid' ? 'bg-[#FF6600] text-white' : 'text-[#6B7280] hover:text-[#F0F2F5]'}`}
                >
                  <LayoutGrid size={15} />
                </button>
              </div>
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
                filename={`productos_${(selectedCategory === '__todos__' ? 'todos' : selectedCategory).toLowerCase().replace(/[^a-z0-9]+/g, '-')}`}
                targetTable="tt_products"
                columns={[
                  { key: 'sku', label: 'SKU' },
                  { key: 'name', label: 'Nombre' },
                  { key: 'brand', label: 'Marca' },
                  { key: 'category', label: 'Categoria' },
                  { key: 'subcategory', label: 'Subcategoria' },
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

          {/* ======= FILTER PANEL ======= */}
          {(currentSubcategories.length > 0 || availableBrands.length > 1 || availableEncastres.length > 0) && (
            <div className="rounded-xl bg-[#141820] border border-[#1E2330] p-4 space-y-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <SlidersHorizontal size={14} className="text-[#FF6600]" />
                  <span className="text-xs font-bold uppercase tracking-wider text-[#FF6600]">Filtros</span>
                  {hasActiveFilters && (
                    <span className="px-1.5 py-0.5 rounded-full bg-[#FF6600]/20 text-[#FF6600] text-[10px] font-bold">
                      {[selectedSubcategory ? 1 : 0, filterBrands.length, filterEncastres.length].reduce((a, b) => a + b, 0)} activos
                    </span>
                  )}
                </div>
                {hasActiveFilters && (
                  <button
                    onClick={clearAllFilters}
                    className="flex items-center gap-1 text-[10px] text-[#FF6600] hover:text-[#FF8833] font-medium"
                  >
                    <RotateCcw size={10} /> Limpiar todo
                  </button>
                )}
              </div>

              {/* Subcategories */}
              {currentSubcategories.length > 0 && (
                <div>
                  <p className="text-[10px] font-semibold uppercase tracking-wider text-[#4B5563] mb-2">Subcategoria</p>
                  <div className="flex flex-wrap gap-2">
                    {currentSubcategories.map((subcat) => (
                      <button
                        key={subcat}
                        onClick={() => setSelectedSubcategory(prev => prev === subcat ? null : subcat)}
                        className={`px-3 py-1.5 rounded-lg text-xs font-bold border transition-all duration-200 ${
                          selectedSubcategory === subcat
                            ? 'border-[#FF6600] bg-[#FF6600]/15 text-[#FF6600]'
                            : 'border-[#2A3040] bg-[#0F1218] text-[#9CA3AF] hover:border-[#3A4050] hover:text-[#F0F2F5]'
                        }`}
                      >
                        {subcat}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* Brands */}
              {availableBrands.length > 1 && (
                <div>
                  <p className="text-[10px] font-semibold uppercase tracking-wider text-[#4B5563] mb-2">Marca</p>
                  <div className="flex flex-wrap gap-2">
                    {availableBrands.map((brand) => (
                      <button
                        key={brand}
                        onClick={() => setFilterBrands(prev =>
                          prev.includes(brand) ? prev.filter(b => b !== brand) : [...prev, brand]
                        )}
                        className={`px-3 py-1.5 rounded-lg text-xs font-bold border transition-all duration-200 ${
                          filterBrands.includes(brand)
                            ? 'border-blue-500 bg-blue-500/15 text-blue-400'
                            : 'border-[#2A3040] bg-[#0F1218] text-[#9CA3AF] hover:border-[#3A4050] hover:text-[#F0F2F5]'
                        }`}
                      >
                        {brand}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* Encastres */}
              {availableEncastres.length > 0 && (
                <div>
                  <p className="text-[10px] font-semibold uppercase tracking-wider text-[#4B5563] mb-2">Encastre</p>
                  <div className="flex flex-wrap gap-2">
                    {availableEncastres.map((enc) => (
                      <button
                        key={enc}
                        onClick={() => setFilterEncastres(prev =>
                          prev.includes(enc) ? prev.filter(e => e !== enc) : [...prev, enc]
                        )}
                        className={`px-3 py-1.5 rounded-lg text-xs font-bold font-mono border transition-all duration-200 ${
                          filterEncastres.includes(enc)
                            ? 'border-emerald-500 bg-emerald-500/15 text-emerald-400'
                            : 'border-[#2A3040] bg-[#0F1218] text-[#9CA3AF] hover:border-[#3A4050] hover:text-[#F0F2F5]'
                        }`}
                      >
                        {enc}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* Active filter tags */}
              {hasActiveFilters && (
                <div className="flex items-center gap-2 flex-wrap pt-2 border-t border-[#1E2330]">
                  <span className="text-[10px] text-[#4B5563] uppercase shrink-0">Activos:</span>
                  {selectedSubcategory && (
                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-[#FF6600]/15 text-[#FF6600] text-[10px] font-medium">
                      {selectedSubcategory}
                      <button onClick={() => setSelectedSubcategory(null)}><X size={10} /></button>
                    </span>
                  )}
                  {filterBrands.map(b => (
                    <span key={b} className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-blue-500/15 text-blue-400 text-[10px] font-medium">
                      {b}
                      <button onClick={() => setFilterBrands(prev => prev.filter(x => x !== b))}><X size={10} /></button>
                    </span>
                  ))}
                  {filterEncastres.map(e => (
                    <span key={e} className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-emerald-500/15 text-emerald-400 text-[10px] font-medium font-mono">
                      {e}
                      <button onClick={() => setFilterEncastres(prev => prev.filter(x => x !== e))}><X size={10} /></button>
                    </span>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Product grid/table */}
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
          ) : viewMode === 'grid' ? (
            /* ===== VISUAL GRID VIEW ===== */
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4">
              {products.map((product) => (
                <div
                  key={product.id}
                  onClick={() => setSelectedProduct(product)}
                  className="group rounded-xl bg-[#0F1218] border border-[#1E2330] hover:border-[#FF6600]/40 hover:bg-[#141820] transition-all cursor-pointer overflow-hidden flex flex-col hover:shadow-lg hover:shadow-[#FF6600]/5 hover:-translate-y-0.5"
                >
                  {/* Image */}
                  <div className="aspect-square bg-[#141820] flex items-center justify-center overflow-hidden relative">
                    {product.image_url ? (
                      <img
                        src={product.image_url}
                        alt={product.name}
                        referrerPolicy="no-referrer"
                        className="w-full h-full object-contain p-3 group-hover:scale-105 transition-transform duration-300"
                        onError={(e) => {
                          (e.target as HTMLImageElement).style.display = 'none';
                          const parent = (e.target as HTMLImageElement).parentElement!
                          parent.innerHTML = '<div class="flex items-center justify-center w-full h-full"><span style="font-size:2.5rem">📦</span></div>'
                        }}
                      />
                    ) : (
                      <Package size={40} className="text-[#2A3040]" />
                    )}
                    {/* Brand badge overlay */}
                    <span className="absolute top-2 left-2 px-1.5 py-0.5 rounded bg-black/60 text-[9px] font-bold text-[#9CA3AF] uppercase tracking-wider backdrop-blur-sm">
                      {product.brand}
                    </span>
                    {/* Encastre badge */}
                    {product.encastre && (
                      <span className="absolute top-2 right-2 px-1.5 py-0.5 rounded bg-[#FF6600]/80 text-[9px] font-bold text-white font-mono backdrop-blur-sm">
                        {product.encastre}
                      </span>
                    )}
                  </div>

                  {/* Info */}
                  <div className="p-3 flex flex-col flex-1 gap-1.5">
                    <span className="font-mono text-[11px] text-[#FF6600] group-hover:text-[#FF8833]">{product.sku}</span>
                    <p className="text-xs font-medium text-[#D1D5DB] line-clamp-2 group-hover:text-white leading-relaxed flex-1">{product.name}</p>

                    {/* Spec chips */}
                    {(product.torque_max != null || product.rpm != null || product.weight_kg != null) && (
                      <div className="flex flex-wrap gap-1 pt-0.5">
                        {product.torque_max != null && (
                          <span className="text-[9px] bg-[#0A0D12] border border-[#1E2330] px-1.5 py-0.5 rounded text-[#6B7280]">
                            ⚡ {product.torque_max}Nm
                          </span>
                        )}
                        {product.rpm != null && (
                          <span className="text-[9px] bg-[#0A0D12] border border-[#1E2330] px-1.5 py-0.5 rounded text-[#6B7280]">
                            🔄 {product.rpm.toLocaleString('es-AR')}rpm
                          </span>
                        )}
                        {product.weight_kg != null && (
                          <span className="text-[9px] bg-[#0A0D12] border border-[#1E2330] px-1.5 py-0.5 rounded text-[#6B7280]">
                            ⚖️ {product.weight_kg}kg
                          </span>
                        )}
                      </div>
                    )}

                    <div className="flex items-center justify-between pt-1 mt-auto">
                      <span className="text-xs font-bold text-[#FF6600]">
                        {product.price_eur > 0 ? formatCurrency(product.price_eur, 'EUR') : 'Consultar'}
                      </span>
                    </div>

                    {/* Cotizar button */}
                    <button
                      onClick={(e) => {
                        e.stopPropagation()
                        router.push(`/cotizador?products=${encodeURIComponent(product.sku)}`)
                      }}
                      className="w-full mt-1 py-1.5 rounded-lg bg-[#FF6600]/10 hover:bg-[#FF6600] border border-[#FF6600]/30 hover:border-[#FF6600] text-[#FF6600] hover:text-white text-[11px] font-bold transition-all"
                    >
                      COTIZAR
                    </button>
                  </div>
                </div>
              ))}
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
                          subcategory: { label: 'Subcategoria', align: 'text-left' },
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
                            case 'subcategory':
                              return (
                                <td key={col} className="px-3 py-2 text-xs text-[#6B7280]">{product.subcategory || '-'}</td>
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
          {!productsLoading && totalCount > 0 && (
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

              <div className="flex flex-col items-center gap-0.5 text-sm text-[#6B7280]">
                <span>
                  Mostrando <strong className="text-[#F0F2F5]">{((page - 1) * PAGE_SIZE) + 1}</strong>-<strong className="text-[#F0F2F5]">{Math.min(page * PAGE_SIZE, totalCount)}</strong> de <strong className="text-[#FF6600]">{totalCount.toLocaleString('es-AR')}</strong> productos
                </span>
                {totalPages > 1 && (
                  <span className="text-xs text-[#4B5563]">
                    Pagina {page} de {totalPages}
                  </span>
                )}
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
      <Modal isOpen={!!selectedProduct} onClose={() => { setSelectedProduct(null); setDeleteConfirmProduct(false) }} title={selectedProduct?.name || ''} size="xl">
        {selectedProduct && (
          <div className="space-y-6">
            {/* Edit / Delete buttons at top */}
            <div className="flex items-center gap-2 justify-end -mt-2">
              <Button variant="secondary" size="sm" onClick={() => openEditProduct(selectedProduct)}>
                <Edit3 size={14} /> Editar
              </Button>
              {!deleteConfirmProduct ? (
                <Button variant="danger" size="sm" onClick={() => setDeleteConfirmProduct(true)}>
                  <Trash2 size={14} /> Eliminar
                </Button>
              ) : (
                <div className="flex items-center gap-2">
                  <span className="text-xs text-red-400">Confirmar eliminacion?</span>
                  <Button
                    variant="danger"
                    size="sm"
                    loading={deletingProduct}
                    onClick={() => softDeleteProduct(selectedProduct)}
                  >
                    Si, desactivar
                  </Button>
                  <Button variant="ghost" size="sm" onClick={() => setDeleteConfirmProduct(false)}>
                    No
                  </Button>
                </div>
              )}
            </div>

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

            {/* Historial de precios */}
            <ProductPriceHistory productId={selectedProduct.id} />

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

      {/* ======== PRODUCT FORM MODAL (Create / Edit) ======== */}
      <Modal
        isOpen={showProductForm}
        onClose={() => { setShowProductForm(false); setEditingProduct(null) }}
        title={editingProduct ? `Editar: ${editingProduct.sku}` : 'Nuevo Producto'}
        size="xl"
      >
        <div className="space-y-5">
          {/* Tab navigation */}
          <div className="flex gap-1 bg-[#0A0D12] rounded-xl p-1 border border-[#1E2330]">
            {([
              { id: 'general' as const, label: 'General' },
              { id: 'precios' as const, label: 'Precios' },
              { id: 'tecnico' as const, label: 'Tecnico' },
              { id: 'imagenes' as const, label: 'Imagenes' },
              { id: 'specs' as const, label: 'Specs' },
            ]).map(tab => (
              <button
                key={tab.id}
                onClick={() => setProductFormTab(tab.id)}
                className={`flex-1 px-3 py-2 rounded-lg text-xs font-bold uppercase tracking-wider transition-all ${
                  productFormTab === tab.id
                    ? 'bg-[#FF6600] text-white shadow-lg shadow-orange-500/20'
                    : 'text-[#6B7280] hover:text-[#F0F2F5] hover:bg-[#1E2330]'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>

          {/* ─── TAB: General ─── */}
          {productFormTab === 'general' && (
            <div className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <Input
                  label="SKU *"
                  value={productForm.sku || ''}
                  onChange={(e) => updateProductField('sku', e.target.value)}
                  placeholder="Ej: ASM-18-L-SET"
                />
                <Input
                  label="Nombre *"
                  value={productForm.name || ''}
                  onChange={(e) => updateProductField('name', e.target.value)}
                  placeholder="Ej: Atornillador Fein ASM 18 L Set"
                />
              </div>

              <div className="w-full">
                <label className="block text-sm font-medium text-[#9CA3AF] mb-1.5">Descripcion</label>
                <textarea
                  value={productForm.description || ''}
                  onChange={(e) => updateProductField('description', e.target.value)}
                  placeholder="Descripcion del producto..."
                  rows={3}
                  className="w-full rounded-lg bg-[#1E2330] border border-[#2A3040] px-3 py-2 text-sm text-[#F0F2F5] placeholder:text-[#4B5563] focus:outline-none focus:ring-2 focus:ring-orange-500/50 focus:border-orange-500/50 transition-all resize-none"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {/* Brand — dropdown desde tt_catalog_brands + botón "+" admin */}
                <div className="w-full">
                  <div className="flex items-center justify-between mb-1.5">
                    <label className="block text-sm font-medium text-[#9CA3AF]">Marca</label>
                    {isAdmin && (
                      <button
                        type="button"
                        onClick={async () => {
                          const name = window.prompt('Nombre de la nueva marca:')
                          if (!name || !name.trim()) return
                          const country = window.prompt('País de origen (ISO 2, ej: DE, US, JP):') || undefined
                          const created = await presets.addBrand(name, country || undefined)
                          if (created) {
                            updateProductField('brand', created.name)
                            addToast({ type: 'success', title: `Marca "${created.name}" creada` })
                          } else {
                            addToast({ type: 'error', title: 'Error creando la marca' })
                          }
                        }}
                        className="text-[10px] font-semibold text-[#FF6600] hover:text-[#FF8833] flex items-center gap-1"
                      >
                        <Plus size={10} /> Nueva marca
                      </button>
                    )}
                  </div>
                  <select
                    value={productForm.brand || ''}
                    onChange={(e) => updateProductField('brand', e.target.value)}
                    className="w-full h-10 rounded-lg bg-[#1E2330] border border-[#2A3040] px-3 text-sm text-[#F0F2F5] focus:outline-none focus:ring-2 focus:ring-orange-500/50 focus:border-orange-500/50 transition-all appearance-none"
                  >
                    <option value="">— Sin marca —</option>
                    {presets.brands.map(b => (
                      <option key={b.id} value={b.name}>
                        {b.name}{b.country_origin ? ` (${b.country_origin})` : ''}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="w-full">
                  <label className="block text-sm font-medium text-[#9CA3AF] mb-1.5">Tipo de producto</label>
                  <select
                    value={productForm.product_type || 'product'}
                    onChange={(e) => updateProductField('product_type', e.target.value)}
                    className="w-full h-10 rounded-lg bg-[#1E2330] border border-[#2A3040] px-3 text-sm text-[#F0F2F5] focus:outline-none focus:ring-2 focus:ring-orange-500/50 focus:border-orange-500/50 transition-all appearance-none"
                  >
                    <option value="product">Producto</option>
                    <option value="service">Servicio</option>
                    <option value="expense">Gasto</option>
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="w-full">
                  <div className="flex items-center justify-between mb-1.5">
                    <label className="block text-sm font-medium text-[#9CA3AF]">Categoria</label>
                    {isAdmin && !creatingNewCategory && (
                      <button
                        type="button"
                        onClick={() => {
                          setCreatingNewCategory(true)
                          updateProductField('category', '')
                        }}
                        className="text-[10px] font-semibold text-[#FF6600] hover:text-[#FF8833] flex items-center gap-1"
                      >
                        <Plus size={10} /> Nueva categoria
                      </button>
                    )}
                    {isAdmin && creatingNewCategory && (
                      <button
                        type="button"
                        onClick={() => {
                          setCreatingNewCategory(false)
                          updateProductField('category', '')
                        }}
                        className="text-[10px] font-semibold text-[#6B7280] hover:text-[#F0F2F5] flex items-center gap-1"
                      >
                        <X size={10} /> Cancelar
                      </button>
                    )}
                  </div>
                  {creatingNewCategory ? (
                    <input
                      type="text"
                      autoFocus
                      value={productForm.category || ''}
                      onChange={(e) => updateProductField('category', e.target.value)}
                      onBlur={async () => {
                        const newName = (productForm.category || '').trim()
                        if (newName && !presets.categories.some(c => c.name.toLowerCase() === newName.toLowerCase())) {
                          const created = await presets.addCategory(newName)
                          if (created) {
                            updateProductField('category', created.slug)
                            setCreatingNewCategory(false)
                            addToast({ type: 'success', title: `Categoría "${newName}" creada` })
                          }
                        }
                      }}
                      placeholder="Ej: Atornilladores, Torquímetros..."
                      className="w-full h-10 rounded-lg bg-[#1E2330] border-2 border-[#FF6600]/50 px-3 text-sm text-[#F0F2F5] placeholder:text-[#4B5563] focus:outline-none focus:ring-2 focus:ring-orange-500/50 focus:border-orange-500 transition-all"
                    />
                  ) : (
                    <select
                      value={productForm.category || ''}
                      onChange={(e) => updateProductField('category', e.target.value || null)}
                      className="w-full h-10 rounded-lg bg-[#1E2330] border border-[#2A3040] px-3 text-sm text-[#F0F2F5] focus:outline-none focus:ring-2 focus:ring-orange-500/50 focus:border-orange-500/50 transition-all appearance-none"
                    >
                      <option value="">— Sin categoría —</option>
                      {presets.categories.map(c => (
                        <option key={c.id} value={c.slug}>{c.name}</option>
                      ))}
                    </select>
                  )}
                </div>
                <Input
                  label="Subcategoria"
                  value={productForm.subcategory || ''}
                  onChange={(e) => updateProductField('subcategory', e.target.value)}
                  placeholder="Ej: EMBOCADURA, ALLEM, TORX"
                />
              </div>

              {/* Active toggle */}
              <div className="flex items-center gap-3 p-3 rounded-lg bg-[#0A0D12] border border-[#1E2330]">
                <label className="flex items-center gap-3 cursor-pointer">
                  <div
                    className={`relative w-10 h-5 rounded-full transition-colors ${productForm.active ? 'bg-emerald-500' : 'bg-[#2A3040]'}`}
                    onClick={() => updateProductField('active', !productForm.active)}
                  >
                    <div className={`absolute top-0.5 w-4 h-4 rounded-full bg-white transition-transform ${productForm.active ? 'left-5.5 translate-x-0.5' : 'left-0.5'}`} />
                  </div>
                  <span className="text-sm text-[#F0F2F5]">
                    {productForm.active ? 'Producto activo' : 'Producto inactivo'}
                  </span>
                </label>
              </div>
            </div>
          )}

          {/* ─── TAB: Precios ─── */}
          {productFormTab === 'precios' && (
            <div className="space-y-4">
              <ProductPricesTab
                companies={companiesMeta}
                prices={companyPrices}
                onChange={handlePriceChange}
              />
            </div>
          )}

          {/* ─── TAB: Tecnico ─── */}
          {productFormTab === 'tecnico' && (() => {
            // Mapeo: code del preset → columna en productForm (o null si va a specs JSONB)
            const PRESET_FIELD_MAP: Record<string, string | null> = {
              torque_min: 'torque_min',
              torque_max: 'torque_max',
              rpm:        'rpm',
              encastre:   'encastre',
              peso:       'weight_kg',
              // resto va a specs
              drive_type: null, voltaje: null, longitud: null,
              tipo_punta: null, medida_punta: null, tipo_tubo: null,
              tipo_torquimetro: null, precision: null,
              capacidad_kg: null, recorrido_m: null,
              ruido_db: null, consumo_aire: null, presion_bar: null,
            }

            const specs = (productForm.specs || {}) as Record<string, string | number>
            const categoryAttrs = presets.getAttributesForCategory(productForm.category as string | null)

            const getAttrValue = (code: string): string | number | boolean | null => {
              const col = PRESET_FIELD_MAP[code]
              if (col !== null && col !== undefined) {
                return (productForm as Record<string, unknown>)[col] as string | number | boolean | null
              }
              return (specs[code] ?? null) as string | number | boolean | null
            }

            const setAttrValue = (code: string, value: string | number | boolean | null) => {
              const col = PRESET_FIELD_MAP[code]
              if (col !== null && col !== undefined) {
                updateProductField(col, value)
              } else {
                const newSpecs: Record<string, string | number | boolean> = { ...specs }
                if (value == null || value === '') delete newSpecs[code]
                else newSpecs[code] = value
                updateProductField('specs', newSpecs)
              }
            }

            return (
              <div className="space-y-4">
                {!productForm.category && (
                  <div className="rounded-xl bg-[#1A2030] border border-[#FF6600]/30 p-4 text-sm text-[#9CA3AF]">
                    💡 Seleccioná una categoría en la pestaña <strong>General</strong> para ver los campos técnicos específicos.
                  </div>
                )}

                {productForm.category && categoryAttrs.length === 0 && !presets.loading && (
                  <div className="rounded-xl bg-[#1A2030] border border-[#1E2330] p-4 text-sm text-[#6B7280]">
                    Esta categoría no tiene atributos destacados definidos.
                  </div>
                )}

                {/* Atributos dinámicos según la categoría */}
                {categoryAttrs.length > 0 && (
                  <>
                    <p className="text-[11px] font-semibold uppercase tracking-wider text-[#FF6600] mb-2">
                      Atributos de {presets.categories.find(c => c.slug === productForm.category)?.name}
                    </p>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      {categoryAttrs.map(attr => (
                        <DynamicAttributeInput
                          key={attr.id}
                          attribute={attr}
                          value={getAttrValue(attr.code)}
                          onChange={(v) => setAttrValue(attr.code, v)}
                          values={presets.getValuesForAttribute(attr.code)}
                          isAdmin={isAdmin}
                          onAddValue={isAdmin ? presets.addAttributeValue : undefined}
                        />
                      ))}
                    </div>
                  </>
                )}

                {/* Campos comunes a todas las categorías */}
                <div className="pt-3 border-t border-[#1E2330]">
                  <p className="text-[11px] font-semibold uppercase tracking-wider text-[#6B7280] mb-2">
                    Identificación
                  </p>
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                    <Input
                      label="Modelo"
                      value={productForm.modelo || ''}
                      onChange={(e) => updateProductField('modelo', e.target.value)}
                      placeholder="Numero de modelo"
                    />
                    <Input
                      label="Serie"
                      value={productForm.serie || ''}
                      onChange={(e) => updateProductField('serie', e.target.value)}
                      placeholder="Serie del producto"
                    />
                    <Input
                      label="Origen"
                      value={productForm.origin || ''}
                      onChange={(e) => updateProductField('origin', e.target.value)}
                      placeholder="Ej: Alemania, Japón"
                    />
                  </div>
                </div>
              </div>
            )
          })()}

          {/* ─── TAB: Imagenes ─── */}
          {productFormTab === 'imagenes' && (
            <div className="space-y-6">
              {/* Foto principal + diagrama lado a lado */}
              <div className="grid md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Input
                    label="Foto principal del producto (URL)"
                    value={productForm.image_url || ''}
                    onChange={(e) => updateProductField('image_url', e.target.value)}
                    placeholder="https://example.com/product-image.jpg"
                  />
                  <div className="rounded-xl bg-[#0A0D12] border border-[#1E2330] p-4 h-56 flex items-center justify-center">
                    {productForm.image_url ? (
                      <img
                        src={productForm.image_url}
                        alt="Foto"
                        referrerPolicy="no-referrer"
                        className="max-h-full max-w-full object-contain"
                      />
                    ) : (
                      <div className="text-[#4B5563] text-xs text-center">
                        <Package size={32} className="mx-auto mb-2" />
                        Foto principal
                      </div>
                    )}
                  </div>
                </div>

                <div className="space-y-2">
                  <Input
                    label="Diagrama técnico (URL)"
                    value={productForm.diagram_url || ''}
                    onChange={(e) => updateProductField('diagram_url', e.target.value)}
                    placeholder="https://example.com/product-diagram.png"
                  />
                  <div className="rounded-xl bg-[#0A0D12] border border-[#1E2330] p-4 h-56 flex items-center justify-center">
                    {productForm.diagram_url ? (
                      <img
                        src={productForm.diagram_url}
                        alt="Diagrama"
                        referrerPolicy="no-referrer"
                        className="max-h-full max-w-full object-contain"
                      />
                    ) : (
                      <div className="text-[#4B5563] text-xs text-center">
                        <Package size={32} className="mx-auto mb-2" />
                        Diagrama técnico con medidas (A, B, C, D)
                      </div>
                    )}
                  </div>
                </div>
              </div>

              {/* Galería multi-imagen */}
              <div className="rounded-xl bg-[#0A0D12] border border-[#1E2330] p-4">
                <div className="flex items-center justify-between mb-3">
                  <div>
                    <h4 className="text-sm font-semibold text-[#F0F2F5]">Galería adicional</h4>
                    <p className="text-xs text-[#6B7280]">Fotos secundarias, vistas de aplicación, renders</p>
                  </div>
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={() => {
                      const current = Array.isArray(productForm.gallery_urls) ? productForm.gallery_urls : []
                      updateProductField('gallery_urls', [...current, { url: '', alt: '', sort_order: current.length }])
                    }}
                  >
                    <Plus size={14} /> Agregar imagen
                  </Button>
                </div>
                <div className="space-y-2">
                  {(productForm.gallery_urls || []).map((g, idx) => (
                    <div key={idx} className="flex gap-2 items-start">
                      <div className="w-16 h-16 rounded bg-[#141820] border border-[#1E2330] flex items-center justify-center overflow-hidden shrink-0">
                        {g.url ? (
                          <img src={g.url} alt="" referrerPolicy="no-referrer" className="w-full h-full object-contain" />
                        ) : (
                          <Package size={20} className="text-[#4B5563]" />
                        )}
                      </div>
                      <div className="flex-1 space-y-1">
                        <input
                          value={g.url}
                          onChange={(e) => {
                            const next = [...(productForm.gallery_urls || [])]
                            next[idx] = { ...next[idx], url: e.target.value }
                            updateProductField('gallery_urls', next)
                          }}
                          placeholder="https://..."
                          className="w-full rounded bg-[#141820] border border-[#1E2330] px-2 py-1 text-sm text-[#F0F2F5]"
                        />
                        <input
                          value={g.alt || ''}
                          onChange={(e) => {
                            const next = [...(productForm.gallery_urls || [])]
                            next[idx] = { ...next[idx], alt: e.target.value }
                            updateProductField('gallery_urls', next)
                          }}
                          placeholder="Texto alternativo (opcional)"
                          className="w-full rounded bg-[#141820] border border-[#1E2330] px-2 py-1 text-xs text-[#9CA3AF]"
                        />
                      </div>
                      <Button
                        variant="secondary"
                        size="sm"
                        onClick={() => {
                          const next = (productForm.gallery_urls || []).filter((_, i) => i !== idx)
                          updateProductField('gallery_urls', next)
                        }}
                      >
                        ✕
                      </Button>
                    </div>
                  ))}
                  {(!productForm.gallery_urls || productForm.gallery_urls.length === 0) && (
                    <p className="text-xs text-[#6B7280] text-center py-4">Sin imágenes adicionales</p>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* ─── TAB: Specs (JSONB key-value pairs) ─── */}
          {productFormTab === 'specs' && (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <h4 className="text-sm font-semibold text-[#F0F2F5]">Especificaciones adicionales</h4>
                  <p className="text-xs text-[#6B7280] mt-0.5">Pares clave-valor que se guardan en el campo specs (JSONB)</p>
                </div>
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => setSpecRows(prev => [...prev, { key: '', value: '' }])}
                >
                  <Plus size={14} /> Agregar campo
                </Button>
              </div>

              {specRows.length === 0 ? (
                <div className="rounded-xl bg-[#0A0D12] border-2 border-dashed border-[#2A3040] p-8 flex flex-col items-center justify-center text-[#4B5563]">
                  <FileSpreadsheet size={32} className="mb-2" />
                  <p className="text-sm">Sin especificaciones adicionales</p>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="mt-3"
                    onClick={() => setSpecRows([{ key: '', value: '' }])}
                  >
                    <Plus size={14} /> Agregar primera spec
                  </Button>
                </div>
              ) : (
                <div className="space-y-2">
                  {specRows.map((row, idx) => (
                    <div key={idx} className="flex items-center gap-2">
                      <input
                        type="text"
                        value={row.key}
                        onChange={(e) => {
                          const updated = [...specRows]
                          updated[idx] = { ...updated[idx], key: e.target.value }
                          setSpecRows(updated)
                        }}
                        placeholder="Clave (ej: voltaje)"
                        className="flex-1 h-9 rounded-lg bg-[#1E2330] border border-[#2A3040] px-3 text-sm text-[#F0F2F5] placeholder:text-[#4B5563] focus:outline-none focus:ring-2 focus:ring-orange-500/50 focus:border-orange-500/50 transition-all"
                      />
                      <input
                        type="text"
                        value={row.value}
                        onChange={(e) => {
                          const updated = [...specRows]
                          updated[idx] = { ...updated[idx], value: e.target.value }
                          setSpecRows(updated)
                        }}
                        placeholder="Valor (ej: 18V)"
                        className="flex-1 h-9 rounded-lg bg-[#1E2330] border border-[#2A3040] px-3 text-sm text-[#F0F2F5] placeholder:text-[#4B5563] focus:outline-none focus:ring-2 focus:ring-orange-500/50 focus:border-orange-500/50 transition-all"
                      />
                      <button
                        onClick={() => setSpecRows(prev => prev.filter((_, i) => i !== idx))}
                        className="p-2 rounded-lg hover:bg-red-500/10 text-[#6B7280] hover:text-red-400 transition-colors shrink-0"
                      >
                        <Trash2 size={14} />
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* ─── Footer: Save / Cancel ─── */}
          <div className="flex items-center justify-between pt-4 border-t border-[#1E2330]">
            <p className="text-[10px] text-[#4B5563]">
              {editingProduct ? `ID: ${editingProduct.id}` : 'Nuevo producto'}
            </p>
            <div className="flex gap-3">
              <Button variant="secondary" onClick={() => { setShowProductForm(false); setEditingProduct(null) }}>
                Cancelar
              </Button>
              <Button
                variant="primary"
                onClick={saveProduct}
                loading={productSaving}
                disabled={productSaving}
              >
                {editingProduct ? 'Guardar cambios' : 'Crear producto'}
              </Button>
            </div>
          </div>
        </div>
      </Modal>

      {/* ======== WOOCOMMERCE IMPORT MODAL ======== */}
      <Modal
        isOpen={showWooImport}
        onClose={() => {
          if (!wooImporting) {
            setShowWooImport(false)
            setWooFile(null)
            setWooParsedRows([])
            setWooPreview(null)
          }
        }}
        title="Importar desde WooCommerce CSV"
        size="xl"
      >
        <div className="space-y-5">
          {/* Step 1: Select file */}
          <div className="space-y-3">
            <p className="text-sm text-[#9CA3AF]">
              Subi un CSV exportado de WooCommerce. Se mapean automaticamente las columnas en espanol:
              SKU, Nombre, Descripcion corta, Precio normal, Categorias, Imagenes, Peso, Marcas y Atributos 1-38.
            </p>

            <div
              onClick={() => wooFileRef.current?.click()}
              className="rounded-xl border-2 border-dashed border-[#2A3040] hover:border-[#FF6600]/40 bg-[#0A0D12] p-8 flex flex-col items-center justify-center cursor-pointer transition-all hover:bg-[#0F1218]"
            >
              <Upload size={36} className="text-[#4B5563] mb-3" />
              <p className="text-sm text-[#6B7280]">
                {wooFile ? wooFile.name : 'Click para seleccionar CSV de WooCommerce'}
              </p>
              {wooFile && (
                <p className="text-[10px] text-[#4B5563] mt-1">
                  {(wooFile.size / 1024).toFixed(0)} KB
                </p>
              )}
            </div>
            <input
              ref={wooFileRef}
              type="file"
              accept=".csv"
              className="hidden"
              onChange={async (e) => {
                const file = e.target.files?.[0]
                if (file) {
                  setWooFile(file)
                  await parseWooCSV(file)
                }
                e.target.value = ''
              }}
            />
          </div>

          {/* Step 2: Preview */}
          {wooPreview && (
            <div className="space-y-4">
              <div className="rounded-xl bg-[#141820] border border-[#1E2330] p-5 space-y-4">
                <h4 className="text-sm font-bold text-[#FF6600]">Preview de importacion</h4>

                <div className="grid grid-cols-3 gap-4">
                  <div className="text-center p-3 rounded-lg bg-[#0A0D12] border border-[#1E2330]">
                    <p className="text-2xl font-bold text-[#FF6600]">{wooPreview.total.toLocaleString('es-AR')}</p>
                    <p className="text-[10px] text-[#6B7280] mt-1">Productos</p>
                  </div>
                  <div className="text-center p-3 rounded-lg bg-[#0A0D12] border border-[#1E2330]">
                    <p className="text-2xl font-bold text-blue-400">{wooPreview.categories.length}</p>
                    <p className="text-[10px] text-[#6B7280] mt-1">Categorias</p>
                  </div>
                  <div className="text-center p-3 rounded-lg bg-[#0A0D12] border border-[#1E2330]">
                    <p className="text-2xl font-bold text-emerald-400">{wooPreview.brands.length}</p>
                    <p className="text-[10px] text-[#6B7280] mt-1">Marcas</p>
                  </div>
                </div>

                {wooPreview.categories.length > 0 && (
                  <div>
                    <p className="text-[10px] font-semibold uppercase tracking-wider text-[#6B7280] mb-2">Categorias detectadas</p>
                    <div className="flex flex-wrap gap-1.5">
                      {wooPreview.categories.map(cat => (
                        <Badge key={cat} variant="default" size="sm">{cat}</Badge>
                      ))}
                    </div>
                  </div>
                )}

                {wooPreview.brands.length > 0 && (
                  <div>
                    <p className="text-[10px] font-semibold uppercase tracking-wider text-[#6B7280] mb-2">Marcas detectadas</p>
                    <div className="flex flex-wrap gap-1.5">
                      {wooPreview.brands.map(brand => (
                        <Badge key={brand} variant="info" size="sm">{brand}</Badge>
                      ))}
                    </div>
                  </div>
                )}

                {/* Sample rows */}
                <div>
                  <p className="text-[10px] font-semibold uppercase tracking-wider text-[#6B7280] mb-2">Primeros 5 productos</p>
                  <div className="space-y-1.5">
                    {wooParsedRows.slice(0, 5).map((row, idx) => (
                      <div key={idx} className="flex items-center gap-3 px-3 py-2 rounded-lg bg-[#0A0D12] border border-[#1E2330] text-xs">
                        <span className="font-mono text-[#FF6600] shrink-0">{row['SKU']}</span>
                        <span className="text-[#F0F2F5] truncate flex-1">{row['Nombre'] || row['Name'] || '-'}</span>
                        <span className="text-[#9CA3AF] shrink-0">{row['Precio normal'] || row['Regular price'] || '-'}</span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>

              {/* Progress */}
              {wooImporting && wooProgress && (
                <div className="flex items-center gap-3 px-4 py-3 rounded-xl bg-[#FF6600]/10 border border-[#FF6600]/30">
                  <Loader2 size={16} className="animate-spin text-[#FF6600]" />
                  <span className="text-sm text-[#FF6600]">{wooProgress}</span>
                </div>
              )}

              {/* Actions */}
              <div className="flex justify-end gap-3 pt-2 border-t border-[#1E2330]">
                <Button
                  variant="secondary"
                  onClick={() => {
                    setShowWooImport(false)
                    setWooFile(null)
                    setWooParsedRows([])
                    setWooPreview(null)
                  }}
                  disabled={wooImporting}
                >
                  Cancelar
                </Button>
                <Button
                  variant="primary"
                  onClick={importWooCSV}
                  loading={wooImporting}
                  disabled={wooImporting}
                >
                  Importar {wooPreview.total.toLocaleString('es-AR')} productos
                </Button>
              </div>
            </div>
          )}
        </div>
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
// PRODUCT PRICE HISTORY (renders inside product detail modal)
// ===============================================================
type PriceHistoryRow = {
  id: string
  product_id: string
  price_type: string | null
  old_price: number | null
  new_price: number | null
  variation_pct: number | null
  source: string | null
  supplier_id: string | null
  supplier_name: string | null
  notes: string | null
  created_at: string
  currency: string | null
  supplier?: { id: string; name: string; legal_name: string | null } | null
}

function formatPriceType(t: string | null): string {
  if (!t) return '-'
  const map: Record<string, string> = {
    cost: 'Costo',
    cost_eur: 'Costo EUR',
    cost_usd: 'Costo USD',
    price: 'Precio venta',
    price_eur: 'Precio EUR',
    price_usd: 'Precio USD',
    price_ars: 'Precio ARS',
    price_min: 'Precio min.',
    sale: 'Venta',
    purchase: 'Compra',
  }
  return map[t] || t
}

function formatSource(s: string | null): string {
  if (!s) return '-'
  const map: Record<string, string> = {
    manual: 'Manual',
    pdf_offer: 'Oferta PDF',
    excel_update: 'Excel',
    excel_import: 'Excel',
    api: 'API',
    sync: 'Sync',
    purchase_invoice: 'Factura compra',
  }
  return map[s] || s
}

function ProductPriceHistory({ productId }: { productId: string }) {
  const [history, setHistory] = useState<PriceHistoryRow[]>([])
  const [loading, setLoading] = useState(true)

  const load = useCallback(async () => {
    if (!productId) return
    setLoading(true)
    const sb = createClient()
    const { data, error } = await sb
      .from('tt_price_history')
      .select('*, supplier:tt_suppliers(id, name, legal_name)')
      .eq('product_id', productId)
      .order('created_at', { ascending: false })
      .limit(50)
    if (error) {
      // tabla puede no existir aun
      setHistory([])
    } else {
      setHistory((data || []) as PriceHistoryRow[])
    }
    setLoading(false)
  }, [productId])

  useEffect(() => { load() }, [load])

  if (loading) {
    return (
      <div className="border-t border-[#1E2330] pt-4">
        <div className="flex items-center gap-2 text-sm text-[#6B7280]">
          <Loader2 size={14} className="animate-spin" /> Cargando historial...
        </div>
      </div>
    )
  }

  return (
    <div className="border-t border-[#1E2330] pt-4">
      <h4 className="text-sm font-semibold text-[#F0F2F5] mb-3 flex items-center gap-2">
        <History size={14} className="text-[#FF6600]" /> Historial de precios
        {history.length > 0 && <span className="text-xs text-[#6B7280]">({history.length} registros)</span>}
      </h4>

      {history.length === 0 ? (
        <div className="p-4 rounded-lg bg-[#0A0D12] border border-[#1E2330] text-center">
          <p className="text-xs text-[#6B7280]">Sin historial de cambios de precio registrado</p>
        </div>
      ) : (
        <>
          {/* Mini line chart SVG */}
          <PriceHistoryChart data={history} />

          {/* History table */}
          <div className="border border-[#1E2330] rounded-xl overflow-hidden mt-3">
            <div className="overflow-x-auto max-h-72 overflow-y-auto">
              <table className="w-full text-xs">
                <thead className="bg-[#0A0D12] sticky top-0">
                  <tr className="text-left text-[#6B7280] uppercase">
                    <th className="px-3 py-2 font-semibold">Fecha</th>
                    <th className="px-3 py-2 font-semibold">Tipo</th>
                    <th className="px-3 py-2 font-semibold text-right">Anterior</th>
                    <th className="px-3 py-2 font-semibold text-right">Nuevo</th>
                    <th className="px-3 py-2 font-semibold text-right">Variacion</th>
                    <th className="px-3 py-2 font-semibold">Fuente</th>
                    <th className="px-3 py-2 font-semibold">Proveedor</th>
                  </tr>
                </thead>
                <tbody>
                  {history.map(row => {
                    const variation = row.variation_pct
                    const decreased = (variation != null && variation < 0) || (row.old_price != null && row.new_price != null && row.new_price < row.old_price)
                    const increased = (variation != null && variation > 0) || (row.old_price != null && row.new_price != null && row.new_price > row.old_price)
                    const color = decreased ? '#10B981' : increased ? '#EF4444' : '#9CA3AF'
                    const Icon = decreased ? TrendingDown : increased ? TrendingUp : Minus
                    const supplierName = row.supplier?.legal_name || row.supplier?.name || row.supplier_name || '-'
                    const ccy = row.currency || 'EUR'
                    const computedVar = variation != null
                      ? variation
                      : (row.old_price && row.old_price > 0 && row.new_price != null
                        ? ((row.new_price - row.old_price) / row.old_price) * 100
                        : null)
                    return (
                      <tr key={row.id} className="border-t border-[#1E2330] hover:bg-[#1E2330]/40">
                        <td className="px-3 py-2 text-[#9CA3AF] whitespace-nowrap">{formatDate(row.created_at, 'dd/MM/yy')}</td>
                        <td className="px-3 py-2 text-[#F0F2F5]">{formatPriceType(row.price_type)}</td>
                        <td className="px-3 py-2 text-right text-[#9CA3AF]">
                          {row.old_price != null ? formatCurrency(row.old_price, ccy as 'EUR' | 'USD' | 'ARS') : '-'}
                        </td>
                        <td className="px-3 py-2 text-right text-[#F0F2F5] font-semibold">
                          {row.new_price != null ? formatCurrency(row.new_price, ccy as 'EUR' | 'USD' | 'ARS') : '-'}
                        </td>
                        <td className="px-3 py-2 text-right">
                          {computedVar != null && !isNaN(computedVar) ? (
                            <span className="inline-flex items-center gap-1 font-semibold" style={{ color }}>
                              <Icon size={11} />
                              {computedVar >= 0 ? '+' : ''}{computedVar.toFixed(1)}%
                            </span>
                          ) : (
                            <span className="text-[#4B5563]">-</span>
                          )}
                        </td>
                        <td className="px-3 py-2 text-[#9CA3AF]">{formatSource(row.source)}</td>
                        <td className="px-3 py-2 text-[#9CA3AF] truncate max-w-[140px]" title={supplierName}>{supplierName}</td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}
    </div>
  )
}

// Mini SVG line chart - sin librerias
function PriceHistoryChart({ data }: { data: PriceHistoryRow[] }) {
  // Solo mostrar el chart si hay >= 2 puntos
  // Usamos new_price ordenado por fecha ASC
  const series = useMemo(() => {
    const valid = data
      .filter(r => r.new_price != null && !isNaN(r.new_price as number))
      .map(r => ({
        date: new Date(r.created_at).getTime(),
        price: r.new_price as number,
        priceType: r.price_type || 'price',
      }))
      .sort((a, b) => a.date - b.date)
    return valid
  }, [data])

  if (series.length < 2) {
    return null
  }

  const W = 600
  const H = 120
  const PAD_X = 30
  const PAD_Y = 16

  const minPrice = Math.min(...series.map(s => s.price))
  const maxPrice = Math.max(...series.map(s => s.price))
  const minDate = series[0].date
  const maxDate = series[series.length - 1].date
  const priceRange = Math.max(maxPrice - minPrice, 0.01)
  const dateRange = Math.max(maxDate - minDate, 1)

  const x = (d: number) => PAD_X + ((d - minDate) / dateRange) * (W - 2 * PAD_X)
  const y = (p: number) => H - PAD_Y - ((p - minPrice) / priceRange) * (H - 2 * PAD_Y)

  const pathD = series.map((s, i) => `${i === 0 ? 'M' : 'L'} ${x(s.date).toFixed(1)} ${y(s.price).toFixed(1)}`).join(' ')

  // Color: si el ultimo es mayor que el primero, rojo; si menor, verde
  const trendUp = series[series.length - 1].price > series[0].price
  const lineColor = trendUp ? '#EF4444' : '#10B981'

  // Grid horizontal: 3 lineas
  const gridLines = [0.25, 0.5, 0.75].map(t => {
    const yy = PAD_Y + t * (H - 2 * PAD_Y)
    return yy
  })

  return (
    <div className="rounded-xl bg-[#0A0D12] border border-[#1E2330] p-3">
      <div className="flex items-center justify-between mb-2">
        <p className="text-[10px] uppercase text-[#6B7280] font-semibold">Evolucion de precio</p>
        <div className="flex items-center gap-3 text-[10px]">
          <span className="text-[#6B7280]">Min: <span className="text-[#F0F2F5] font-semibold">{formatCurrency(minPrice, 'EUR')}</span></span>
          <span className="text-[#6B7280]">Max: <span className="text-[#F0F2F5] font-semibold">{formatCurrency(maxPrice, 'EUR')}</span></span>
          <span className="inline-flex items-center gap-1" style={{ color: lineColor }}>
            {trendUp ? <TrendingUp size={11} /> : <TrendingDown size={11} />}
            <span className="font-semibold">
              {(((series[series.length - 1].price - series[0].price) / series[0].price) * 100).toFixed(1)}%
            </span>
          </span>
        </div>
      </div>
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-28" preserveAspectRatio="none">
        {/* Grid */}
        {gridLines.map((yy, i) => (
          <line key={i} x1={PAD_X} x2={W - PAD_X} y1={yy} y2={yy} stroke="#1E2330" strokeWidth="0.5" strokeDasharray="2 2" />
        ))}
        {/* X axis */}
        <line x1={PAD_X} x2={W - PAD_X} y1={H - PAD_Y} y2={H - PAD_Y} stroke="#1E2330" strokeWidth="1" />
        {/* Area fill */}
        <path
          d={`${pathD} L ${x(series[series.length - 1].date).toFixed(1)} ${H - PAD_Y} L ${x(series[0].date).toFixed(1)} ${H - PAD_Y} Z`}
          fill={lineColor}
          opacity="0.1"
        />
        {/* Line */}
        <path d={pathD} fill="none" stroke={lineColor} strokeWidth="1.5" strokeLinejoin="round" strokeLinecap="round" />
        {/* Points */}
        {series.map((s, i) => (
          <g key={i}>
            <circle cx={x(s.date)} cy={y(s.price)} r="2.5" fill={lineColor} />
            <circle cx={x(s.date)} cy={y(s.price)} r="6" fill="transparent">
              <title>{formatDate(new Date(s.date).toISOString(), 'dd/MM/yy')}: {formatCurrency(s.price, 'EUR')}</title>
            </circle>
          </g>
        ))}
        {/* Y labels */}
        <text x="4" y={y(maxPrice) + 3} fill="#6B7280" fontSize="9">{formatCurrency(maxPrice, 'EUR')}</text>
        <text x="4" y={y(minPrice) + 3} fill="#6B7280" fontSize="9">{formatCurrency(minPrice, 'EUR')}</text>
        {/* X labels */}
        <text x={PAD_X} y={H - 2} fill="#6B7280" fontSize="9">{formatDate(new Date(minDate).toISOString(), 'dd/MM/yy')}</text>
        <text x={W - PAD_X} y={H - 2} fill="#6B7280" fontSize="9" textAnchor="end">{formatDate(new Date(maxDate).toISOString(), 'dd/MM/yy')}</text>
      </svg>
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
