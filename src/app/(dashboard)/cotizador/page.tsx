'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { OCParserModal } from '@/components/ai/oc-parser-modal'
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Select } from '@/components/ui/select'
import { Badge } from '@/components/ui/badge'
import { SearchBar } from '@/components/ui/search-bar'
import { Modal } from '@/components/ui/modal'
import { useToast } from '@/components/ui/toast'
import { createClient } from '@/lib/supabase/client'
import { useCompanyFilter } from '@/hooks/use-company-filter'
import { useCompanyContext } from '@/lib/company-context'
import { formatCurrency, INCOTERMS } from '@/lib/utils'
import { resolveTaxConfigFromClient, type TaxConfig } from '@/lib/tax-config'
import type { Company, Client } from '@/types'
import { DocumentDetailLayout, type WorkflowStep, type Alert, type InternalNote } from '@/components/workflow/document-detail-layout'
import { DocumentProcessBar } from '@/components/workflow/document-process-bar'
import { buildSteps } from '@/lib/workflow-definitions'
import { DocumentItemsTree, type DocumentItem, type DocumentItemComponent } from '@/components/workflow/document-items-tree'
import { DocumentActions } from '@/components/workflow/document-actions'
import { DocumentForm } from '@/components/workflow/document-form'
import { DocumentListCard } from '@/components/workflow/document-list-card'
import { DataTable, type DataTableColumn } from '@/components/ui/data-table'
import { mapStatus } from '@/lib/document-helpers'
import { quoteToOrder } from '@/lib/document-workflow'
import {
  Plus, Minus, Trash2, Save, FileText, Paperclip,
  MessageSquare, Building2, User, Search, X, Loader2, Printer, List, PlusCircle, Upload, Sparkles
} from 'lucide-react'
import { DocumentAttachments } from '@/components/documents/document-attachments'
import { SendConfirmationModal } from '@/components/workflow/send-confirmation-modal'
import { SendDocumentModal } from '@/components/workflow/send-document-modal'
import { DocumentMoreMenu } from '@/components/workflow/document-more-menu'
import { QuoteVersionBadge } from '@/components/workflow/quote-version-badge'
import { markAcceptedVersion, snapshotQuoteVersion } from '@/lib/quote-versioning'

interface QuoteLineItem {
  id: string
  product_id: string | null
  sku: string
  description: string
  quantity: number
  unitPrice: number
  discount: number
  notes: string
}

interface ProductSearchResult {
  id: string
  sku: string
  name: string
  brand: string
  price_eur: number
  cost_eur: number
  image_url: string | null
  product_type?: 'product' | 'service' | 'expense'
  price_min?: number | null
}

interface SavedQuote {
  id: string
  number: string
  status: string
  total: number
  currency: string
  created_at: string
  subtotal?: number
  tax_amount?: number
  tax_rate?: number
  notes?: string
  internal_notes?: string
  incoterm?: string
  client_id?: string
  company_id?: string
  client?: { name: string; legal_name?: string; tax_id?: string; country?: string } | null
  company?: { name: string; country?: string } | null
  items?: Array<{
    id: string
    sku: string
    description: string
    quantity: number
    unit_price: number
    discount_pct: number
    subtotal: number
    notes?: string
    product_id?: string
  }>
}

type ViewMode = 'create' | 'list' | 'detail'

export default function CotizadorPage() {
  const router = useRouter()
  const { addToast } = useToast()
  const { filterByCompany, companyKey } = useCompanyFilter()
  const { visibleCompanies, activeCompanyId } = useCompanyContext()

  // Importar OC del cliente como entrada de cotización (Sprint 1)
  const [ocParserOpen, setOcParserOpen] = useState(false)
  const [convertingOc, setConvertingOc] = useState(false)
  // Marca que la cotización actual fue precargada desde una OC (para mostrar banner guía)
  const [ocImportSource, setOcImportSource] = useState<{ ocNumber: string | null; ocParsedId: string | null } | null>(null)

  // Pre-carga desde URL params (viene del Lead o de otra pantalla)
  const urlParams = typeof window !== 'undefined' ? new URLSearchParams(window.location.search) : null
  const preloadClientId = urlParams?.get('clientId') || ''
  const preloadClientName = urlParams?.get('clientName') || ''
  const preloadProducts = urlParams?.get('products') || ''

  // View state
  const [viewMode, setViewMode] = useState<ViewMode>('create')
  const [selectedQuote, setSelectedQuote] = useState<SavedQuote | null>(null)

  // Companies from Supabase
  const [companies, setCompanies] = useState<Company[]>([])
  const [selectedCompanyId, setSelectedCompanyId] = useState('')
  const [currency, setCurrency] = useState<'EUR' | 'ARS' | 'USD'>('EUR')

  // Client
  const [clientSearch, setClientSearch] = useState('')
  const [clientResults, setClientResults] = useState<Client[]>([])
  const [selectedClient, setSelectedClient] = useState<Client | null>(null)
  const [showClientDropdown, setShowClientDropdown] = useState(false)
  const clientDebounceRef = useRef<NodeJS.Timeout | null>(null)
  // Contactos del cliente seleccionado (NORDEX → Mariella, Ana, etc.)
  interface ContactLite { id: string; name: string; position: string | null; email: string | null; phone: string | null; whatsapp: string | null; is_primary: boolean | null; receives_quotes: boolean | null }
  const [clientContacts, setClientContacts] = useState<ContactLite[]>([])
  const [participatingContactIds, setParticipatingContactIds] = useState<string[]>([])
  const [showNewContactModal, setShowNewContactModal] = useState(false)
  const [newContactDraft, setNewContactDraft] = useState({ name: '', position: '', email: '', phone: '' })
  const [savingContact, setSavingContact] = useState(false)

  // Quote
  const [currentQuoteId, setCurrentQuoteId] = useState<string | null>(null)
  const [quoteStatus, setQuoteStatus] = useState<'borrador' | 'enviada' | 'aceptada' | 'rechazada' | 'pedido' | null>(null)
  const [transitioning, setTransitioning] = useState(false)
  // Cuando se convierte la cotización en pedido real (via quoteToOrder), guardamos
  // referencia al pedido creado para mostrar el link "Ver pedido →"
  const [createdOrder, setCreatedOrder] = useState<{ id: string; number: string } | null>(null)
  // FASE 0 — Modal de confirmación post-envío WhatsApp (estado falso desactivado)
  const [showSendConfirmation, setShowSendConfirmation] = useState(false)
  // Modal "Enviar al cliente" estilo StelOrder (split-screen con preview)
  const [showSendModal, setShowSendModal] = useState(false)
  const [quoteNumber, setQuoteNumber] = useState('')
  const [docSubtype, setDocSubtype] = useState<'cotizacion' | 'presupuesto' | 'proforma' | 'packing_list' | 'oferta'>('cotizacion')
  const [items, setItems] = useState<QuoteLineItem[]>([])
  const [notes, setNotes] = useState('')
  const [internalNotes, setInternalNotes] = useState('')
  const [incoterm, setIncoterm] = useState('')
  const [ivaEnabled, setIvaEnabled] = useState(true)
  const [taxRate, setTaxRate] = useState(21)
  const [irpfEnabled, setIrpfEnabled] = useState(false)
  const [irpfRate, setIrpfRate] = useState(0)
  const [reEnabled, setReEnabled] = useState(false)
  const [reRate, setReRate] = useState(0)
  // Fuente del IVA aplicado (override / default cliente / fallback). Se actualiza
  // cuando cambia (cliente, empresa). Sirve para mostrar un chip en la UI.
  const [taxConfigSource, setTaxConfigSource] = useState<TaxConfig['source'] | null>(null)
  const [validUntil, setValidUntil] = useState('')
  const [paymentTerms, setPaymentTerms] = useState('')       // "30 dias FF"
  const [paymentDays, setPaymentDays] = useState<number>(0)   // 30
  const [paymentTermsType, setPaymentTermsType] = useState<'contado'|'dias_ff'|'dias_fv'|'dias_fr'|'anticipado'|'custom'>('contado')
  const [saving, setSaving] = useState(false)

  // Product search modal
  const [showProductSearch, setShowProductSearch] = useState(false)
  const [productSearch, setProductSearch] = useState('')
  const [productResults, setProductResults] = useState<ProductSearchResult[]>([])
  const [searchingProducts, setSearchingProducts] = useState(false)
  const productDebounceRef = useRef<NodeJS.Timeout | null>(null)
  // Cuando el usuario clickea el dot rojo (item sin match), guardamos qué item está
  // vinculando. Al elegir un producto se actualiza ese item específico Y se guarda
  // el alias en tt_sku_aliases para que la próxima OC lo encuentre solo.
  const [linkingItemId, setLinkingItemId] = useState<string | null>(null)
  // Cache de productos vinculados (key: product_id) para mostrar el SKU del
  // catálogo bajo el SKU del cliente en cada línea matcheada. Se popula
  // automáticamente cuando cambian los items.
  const [linkedProducts, setLinkedProducts] = useState<Map<string, { sku: string; name: string; brand: string | null }>>(new Map())

  // Saved quotes list
  const [savedQuotes, setSavedQuotes] = useState<SavedQuote[]>([])
  const [showCancelled, setShowCancelled] = useState(false)
  const [loadingQuotes, setLoadingQuotes] = useState(false)
  const [listSearch, setListSearch] = useState('')

  // Load companies on mount + cuando cambia la selección multi-empresa del topbar
  useEffect(() => {
    loadCompanies()

  }, [visibleCompanies.length, activeCompanyId])

  // ════════════════════════════════════════════════════════════════════
  // Importar OC del cliente: precarga el cotizador con datos del PDF.
  //
  // Flow nuevo (UX-fix): en vez de redirigir a /documentos/[id] (vista
  // solo lectura), CARGAMOS los items + cabecera en el state del
  // cotizador para que el user vea todo, edite precios/cantidades/cliente
  // y después guarde con el botón "Guardar cotización" normal.
  // ════════════════════════════════════════════════════════════════════
  const handleOCParsed = useCallback(async (result: {
    ocParsedId?: string
    discrepancies?: unknown[]
    data?: {
      numero_oc?: string
      fecha?: string
      emisor_razon_social?: string
      emisor_cuit?: string
      condicion_pago?: string
      condicion_entrega?: string
      direccion_entrega?: string
      moneda?: string
      observaciones?: string
      items?: Array<{
        codigo?: string
        descripcion: string
        cantidad: number
        precio_unitario?: number
        subtotal?: number
        observaciones?: string
      }>
    }
  }) => {
    const data = result.data
    if (!data || !data.items || data.items.length === 0) {
      addToast({ type: 'error', title: 'La OC no tiene items parseados' })
      return
    }

    setConvertingOc(true)
    try {
      // 1. Cargar items en el cotizador (sin match todavía)
      const newItems: QuoteLineItem[] = data.items.map((it) => ({
        id: Math.random().toString(36).slice(2),
        product_id: null,
        sku: it.codigo || '',
        description: it.descripcion || '',
        quantity: it.cantidad || 1,
        unitPrice: it.precio_unitario || 0,
        discount: 0,
        notes: it.observaciones || '',
      }))
      setItems(newItems)

      // 1.b Auto-match en 2 pasos:
      //   (a) Aliases aprendidos (tt_sku_aliases): si falla la query, no
      //       rompemos el flujo — solo seguimos sin alias.
      //   (b) SKU exacto en tt_products.
      const skusBuscados = newItems.map((i) => i.sku.trim()).filter((s) => s.length > 0)
      if (skusBuscados.length > 0) {
        const supabase = createClient()

        // (a) Lookup de aliases (defensivo: cualquier error → aliasMap vacío)
        let aliasMap = new Map<string, { productId: string; aliasId: string; scope: 'client' | 'global' }>()
        if (selectedCompanyId) {
          try {
            const { lookupAliasesForSkus } = await import('@/lib/sku-aliases')
            aliasMap = await lookupAliasesForSkus({
              companyId: selectedCompanyId,
              clientId: selectedClient?.id || null,
              externalSkus: skusBuscados,
            })
          } catch (aliasErr) {
            console.warn('Lookup de aliases falló — continuando con match directo:', aliasErr)
          }
        }

        // (b) SKU exacto en tt_products para los que no tuvieron alias
        const skusSinAlias = skusBuscados.filter((s) => !aliasMap.has(s.toUpperCase().trim()))
        const { data: prods } = skusSinAlias.length > 0
          ? await supabase
              .from('tt_products')
              .select('id, sku, name, price_eur, cost_eur, price_min')
              .in('sku', skusSinAlias)
              .eq('active', true)
          : { data: [] }

        // Productos referenciados por aliases (para tomar nombre/precio)
        const aliasProductIds = Array.from(aliasMap.values()).map((v) => v.productId)
        const { data: aliasProds } = aliasProductIds.length > 0
          ? await supabase
              .from('tt_products')
              .select('id, sku, name, price_eur, cost_eur, price_min')
              .in('id', aliasProductIds)
          : { data: [] }

        const productById = new Map<string, { id: string; sku: string; name: string; price_eur: number; cost_eur: number; price_min: number | null }>()
        for (const p of ([...(aliasProds || []), ...(prods || [])]) as Array<{ id: string; sku: string; name: string; price_eur: number; cost_eur: number; price_min: number | null }>) {
          productById.set(p.id, p)
        }
        const bySku = new Map<string, { id: string; sku: string; name: string; price_eur: number; cost_eur: number; price_min: number | null }>()
        for (const p of (prods || []) as Array<{ id: string; sku: string; name: string; price_eur: number; cost_eur: number; price_min: number | null }>) {
          bySku.set(p.sku.toUpperCase().trim(), p)
        }

        setItems((curr) => curr.map((item) => {
          const key = item.sku.toUpperCase().trim()
          const aliasHit = aliasMap.get(key)
          const match = aliasHit ? productById.get(aliasHit.productId) : bySku.get(key)
          if (!match) return item
          // Si la OC trae precio, lo respetamos. Sino: price_eur del catálogo,
          // y si no hay price_eur pero sí cost_eur, sugerimos cost*1.3
          let suggestedPrice = match.price_eur || 0
          if (suggestedPrice <= 0 && match.cost_eur && match.cost_eur > 0) {
            suggestedPrice = Math.round(match.cost_eur * 1.3 * 100) / 100
          }
          const ocPrice = item.unitPrice > 0 ? item.unitPrice : suggestedPrice
          const notesPrefix = (item.unitPrice <= 0 && suggestedPrice > 0 && (match.price_eur || 0) <= 0)
            ? 'Precio sugerido = costo + 30%. '
            : ''
          return {
            ...item,
            product_id: match.id,
            description: item.description && item.description.length > 3 ? item.description : match.name,
            unitPrice: ocPrice,
            notes: notesPrefix + (item.notes || ''),
          }
        }))
        const aliasHits = aliasMap.size
        const directHits = newItems.filter((i) => bySku.has(i.sku.toUpperCase().trim())).length
        const total = aliasHits + directHits
        if (total > 0) {
          addToast({
            type: 'info',
            title: `${total}/${newItems.length} items matcheados con el catálogo`,
            message: aliasHits > 0
              ? `${aliasHits} desde historial de vinculación, ${directHits} por SKU directo`
              : total < newItems.length ? 'Revisá los items en rojo (sin match)' : 'Todos los SKUs encontrados ✓',
          })
        }
      }

      // 2. Pre-cargar moneda
      if (data.moneda) {
        const m = data.moneda.toUpperCase()
        if (m === 'EUR' || m === 'ARS' || m === 'USD') setCurrency(m)
      }

      // 3. Pre-cargar incoterm (si matchea con la lista)
      if (data.condicion_entrega) {
        const inco = data.condicion_entrega.trim().toUpperCase().split(/\s+/)[0]
        if ((INCOTERMS as readonly string[]).includes(inco)) setIncoterm(inco)
      }

      // 4. Pre-cargar condición de pago (texto libre)
      if (data.condicion_pago) {
        setPaymentTerms(data.condicion_pago)
        setPaymentTermsType('custom')
      }

      // 5. Pre-cargar notas con referencia a la OC original
      const ocRef = data.numero_oc ? `OC ${data.numero_oc}` : 'OC del cliente'
      const ocFecha = data.fecha ? ` (${data.fecha})` : ''
      const newNotes = `Cotización generada desde ${ocRef}${ocFecha}`
      setNotes((prev) => prev ? prev : newNotes)

      // 6. Pre-cargar internal notes con datos del cliente para trazar
      const internalParts: string[] = []
      if (data.emisor_razon_social) internalParts.push(`Cliente OC: ${data.emisor_razon_social}`)
      if (data.emisor_cuit) internalParts.push(`CUIT/CIF: ${data.emisor_cuit}`)
      if (data.direccion_entrega) internalParts.push(`Entrega: ${data.direccion_entrega}`)
      if (result.ocParsedId) internalParts.push(`OC ID: ${result.ocParsedId}`)
      if (internalParts.length > 0) {
        setInternalNotes((prev) => prev || internalParts.join(' · '))
      }

      // 7. Buscar cliente en DB por CIF/CUIT (best effort)
      if (data.emisor_cuit) {
        try {
          const supabase = createClient()
          const { data: clientFound } = await supabase
            .from('tt_clients')
            .select('*')
            .eq('tax_id', data.emisor_cuit)
            .limit(1)
            .maybeSingle()
          if (clientFound) {
            setSelectedClient(clientFound as Client)
          } else {
            // Sugerir crear/buscar manualmente
            setClientSearch(data.emisor_razon_social || '')
          }
        } catch {
          /* ignore */
        }
      } else if (data.emisor_razon_social) {
        setClientSearch(data.emisor_razon_social)
      }

      // 8. Cerrar modal y mensaje guía
      setOcParserOpen(false)
      const discCount = (result.discrepancies || []).length
      addToast({
        type: 'success',
        title: `OC ${data.numero_oc || ''} cargada — ${newItems.length} items. Revisá precios y cliente, después click "Guardar cotización"${discCount > 0 ? ` · ${discCount} discrepancia${discCount !== 1 ? 's' : ''}` : ''}`,
      })

      // Marcar que esta cotización vino de una OC (para mostrar banner guía)
      setOcImportSource({ ocNumber: data.numero_oc || null, ocParsedId: result.ocParsedId || null })

      // 9. Scroll al inicio del cotizador para que vea los items
      window.scrollTo({ top: 0, behavior: 'smooth' })
    } catch (err) {
      addToast({ type: 'error', title: (err as Error).message })
    } finally {
      setConvertingOc(false)
    }
  }, [addToast])

  useEffect(() => {
    generateQuoteNumber()
    loadSavedQuotes()
    const d = new Date()
    d.setDate(d.getDate() + 30)
    setValidUntil(d.toISOString().split('T')[0])

    // Pre-cargar cliente si viene de un Lead (URL params)
    if (preloadClientId) {
      const supabase = createClient()
      supabase.from('tt_clients').select('*').eq('id', preloadClientId).maybeSingle()
        .then(({ data }) => {
          if (data) {
            setSelectedClient(data as Client)
            addToast({ type: 'success', title: `Cliente pre-cargado: ${data.name}` })
          }
        })
    } else if (preloadClientName) {
      setClientSearch(preloadClientName)
    }
  }, [])

  // Solo pre-selecciona moneda/IVA cuando CAMBIÁS de empresa (no bloquea edición manual)
  const prevCompanyRef = useRef<string>('')
  useEffect(() => {
    const comp = companies.find((c) => c.id === selectedCompanyId)
    if (comp && selectedCompanyId !== prevCompanyRef.current) {
      prevCompanyRef.current = selectedCompanyId
      setCurrency((comp.currency || 'EUR') as 'EUR' | 'ARS' | 'USD')
      setTaxRate(comp.default_tax_rate || 21)
    }
  }, [selectedCompanyId, companies])

  useEffect(() => {
    if (!clientSearch.trim()) { setClientResults([]); setShowClientDropdown(false); return }
    if (clientDebounceRef.current) clearTimeout(clientDebounceRef.current)
    clientDebounceRef.current = setTimeout(() => searchClients(clientSearch), 300)
    return () => { if (clientDebounceRef.current) clearTimeout(clientDebounceRef.current) }
  }, [clientSearch])

  useEffect(() => {
    if (!productSearch.trim()) { setProductResults([]); return }
    if (productDebounceRef.current) clearTimeout(productDebounceRef.current)
    productDebounceRef.current = setTimeout(() => searchProducts(productSearch), 300)
    return () => { if (productDebounceRef.current) clearTimeout(productDebounceRef.current) }
  }, [productSearch])

  // Cargar contactos del cliente seleccionado. Pre-selecciona el primario
  // o los marcados como receives_quotes=true (default razonable).
  useEffect(() => {
    if (!selectedClient?.id) {
      setClientContacts([])
      // No tocamos participatingContactIds si estamos cargando una cotización guardada
      return
    }
    const sb = createClient()
    void sb.from('tt_client_contacts')
      .select('id, name, position, email, phone, whatsapp, is_primary, receives_quotes')
      .eq('client_id', selectedClient.id)
      .eq('active', true)
      .order('is_primary', { ascending: false })
      .order('name')
      .then(({ data }) => {
        const contacts = (data || []) as ContactLite[]
        setClientContacts(contacts)
        // Pre-selección: si NO había contactos elegidos antes, marcamos los
        // que reciben cotizaciones (o el primario si no hay).
        setParticipatingContactIds((prev) => {
          if (prev.length > 0) return prev
          const auto = contacts
            .filter((c) => c.receives_quotes || c.is_primary)
            .map((c) => c.id)
          return auto.length > 0 ? auto : (contacts[0] ? [contacts[0].id] : [])
        })
      })
  }, [selectedClient?.id])

  // Carga el SKU/nombre del catálogo para cada item vinculado, así podemos
  // mostrar "[SKU cliente] → [SKU catálogo]" en cada línea. Se dispara cada
  // vez que cambia el set de product_ids vinculados.
  useEffect(() => {
    const ids = Array.from(new Set(items.map((i) => i.product_id).filter(Boolean) as string[]))
    if (ids.length === 0) { setLinkedProducts(new Map()); return }
    // Si todos los ids ya están en el cache, no hace falta refetch
    const missing = ids.filter((id) => !linkedProducts.has(id))
    if (missing.length === 0) return
    const sb = createClient()
    void sb.from('tt_products').select('id, sku, name, brand').in('id', missing).then(({ data }) => {
      setLinkedProducts((prev) => {
        const next = new Map(prev)
        for (const p of (data || []) as Array<{ id: string; sku: string; name: string; brand: string | null }>) {
          next.set(p.id, { sku: p.sku, name: p.name, brand: p.brand })
        }
        return next
      })
    })
    // No depende de linkedProducts (sólo de los ids) — usamos length+ids como key
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [items.map((i) => i.product_id).filter(Boolean).join(',')])

  /**
   * REGLA DE ORO: las empresas del selector salen del contexto multi-empresa.
   * Si el topbar tiene Torquetools seleccionada → solo Torquetools aparece acá.
   * Si tiene múltiples → aparecen esas múltiples.
   * Ver src/lib/company-context.tsx → visibleCompanies
   */
  async function loadCompanies() {
    // Obtener detalles completos de las visibleCompanies (que solo traen los campos del context)
    const ids = visibleCompanies.map(c => c.id)
    if (ids.length === 0) {
      setCompanies([])
      return
    }
    const supabase = createClient()
    const { data } = await supabase
      .from('tt_companies')
      .select('*')
      .in('id', ids)
      .order('name')
    if (data) {
      setCompanies(data as Company[])
      // Pre-seleccionar: la activa del context, o la primera visible
      const preferred = activeCompanyId && data.find((c: any) => c.id === activeCompanyId)
        ? activeCompanyId
        : data[0]?.id
      if (preferred) setSelectedCompanyId(preferred)
    }
  }

  async function generateQuoteNumber() {
    const supabase = createClient()
    const year = new Date().getFullYear()
    const { data } = await supabase
      .from('tt_quotes')
      .select('number')
      .ilike('number', `COT-${year}-%`)
      .order('number', { ascending: false })
      .limit(1)
    let nextNum = 1
    if (data && data.length > 0) {
      const lastNum = data[0].number.split('-').pop()
      nextNum = (parseInt(lastNum || '0', 10) || 0) + 1
    }
    setQuoteNumber(`COT-${year}-${nextNum.toString().padStart(4, '0')}`)
  }

  async function searchClients(query: string) {
    const sb = createClient()
    let q = sb.from('tt_clients').select('*')
      .or(`name.ilike.%${query}%,legal_name.ilike.%${query}%,tax_id.ilike.%${query}%,email.ilike.%${query}%`)
      .eq('active', true)
    q = filterByCompany(q)
    // Traemos más filas porque hay duplicados por tax_id (~38% de la base
    // está repetida por la migración de StelOrder). Después dedup en runtime.
    const { data } = await q.limit(40)
    const rows = (data || []) as Client[]
    const SUFIJOS = /\b(SA|SRL|SAS|SL|S\.A\.|S\.R\.L\.|S\.A\.S\.|LLC|INC|LTD|BV|GMBH|OY|AB|PLC|CIA|LIMITED|SOCIEDAD|GROUP|HOLDING|CORP)\b/i
    const normalizeTaxId = (s: string | null | undefined) => (s || '').replace(/[\s.\-]/g, '').toUpperCase()
    const scoreClient = (c: Client) => {
      let s = 0
      if (c.legal_name && SUFIJOS.test(c.legal_name)) s += 3
      if (c.legal_name && c.legal_name !== c.name) s += 1
      if (c.tax_id && /\d{6,}/.test(c.tax_id)) s += 1
      if (c.email) s += 1
      return s
    }
    // Dedup por tax_id normalizado (cuando existe) o por id, preferimos
    // la fila con mayor score (la que más parece "razón social del cliente").
    const byKey = new Map<string, Client>()
    for (const r of rows) {
      const key = normalizeTaxId(r.tax_id) || `id:${r.id}`
      const existing = byKey.get(key)
      if (!existing || scoreClient(r) > scoreClient(existing)) byKey.set(key, r)
    }
    const deduped = Array.from(byKey.values()).slice(0, 10)
    setClientResults(deduped)
    setShowClientDropdown(true)
  }

  // Auto-apply IVA/IRPF/RE: resuelve por (cliente, empresa) con override v70 →
  // fallback a defaults del cliente → fallback duro 21%/sin retenciones.
  // Se redispara cuando cambia el cliente o la empresa activa. Después de esto,
  // si el operador edita los toggles a mano, sus cambios persisten hasta que
  // vuelva a cambiar cliente/empresa (no hay watcher de los toggles).
  useEffect(() => {
    if (!selectedClient) {
      setIvaEnabled(true); setTaxRate(21)
      setIrpfEnabled(false); setIrpfRate(0); setReEnabled(false); setReRate(0)
      setTaxConfigSource(null)
      return
    }

    // Guard contra race conditions: si el efecto vuelve a dispararse antes
    // que termine la query, descartamos la respuesta vieja.
    let cancelled = false
    const sb = createClient()
    const c = selectedClient as Client & {
      id: string
      subject_iva?: boolean; iva_rate?: number;
      subject_irpf?: boolean; irpf_rate?: number;
      subject_re?: boolean; re_rate?: number;
    }

    void resolveTaxConfigFromClient(sb, c, activeCompanyId).then((cfg) => {
      if (cancelled) return
      setIvaEnabled(cfg.subject_iva)
      setTaxRate(cfg.subject_iva ? cfg.iva_rate : 0)
      setIrpfEnabled(cfg.subject_irpf)
      setIrpfRate(cfg.subject_irpf ? cfg.irpf_rate : 0)
      setReEnabled(cfg.subject_re)
      setReRate(cfg.subject_re ? cfg.re_rate : 0)
      setTaxConfigSource(cfg.source)
    })

    return () => { cancelled = true }
    // selectedClient.id es la signal real; selectedClient completo solo dispara
    // el effect cuando se selecciona/deselecciona, no por mutaciones internas.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedClient?.id, activeCompanyId])

  // Client special prices (loaded when client is selected)
  const [clientPrices, setClientPrices] = useState<Record<string, { special_price: number | null; discount_pct: number }>>({})
  const [clientPriceList, setClientPriceList] = useState<Record<string, number>>({})

  // Load client prices when client changes
  useEffect(() => {
    if (!selectedClient?.id) { setClientPrices({}); setClientPriceList({}); return }
    const loadPrices = async () => {
      const sb = createClient()
      // 1) Special prices for this client
      const { data: specials } = await sb.from('tt_client_prices')
        .select('product_id, special_price, discount_pct')
        .eq('client_id', selectedClient.id)
      const priceMap: Record<string, { special_price: number | null; discount_pct: number }> = {}
      for (const sp of (specials || [])) {
        priceMap[sp.product_id] = { special_price: sp.special_price, discount_pct: sp.discount_pct || 0 }
      }
      setClientPrices(priceMap)
      // 2) Client's price list
      const { data: clientData } = await sb.from('tt_clients').select('price_list_id').eq('id', selectedClient.id).single()
      if (clientData?.price_list_id) {
        const { data: plItems } = await sb.from('tt_price_list_items')
          .select('product_id, price')
          .eq('price_list_id', clientData.price_list_id)
        const plMap: Record<string, number> = {}
        for (const pli of (plItems || [])) { plMap[pli.product_id] = pli.price }
        setClientPriceList(plMap)
      } else {
        setClientPriceList({})
      }
    }
    loadPrices()
  }, [selectedClient?.id])

  // Resolve best price for a product: special price > price list > catalog
  function resolvePrice(productId: string, catalogPrice: number, costPrice?: number): { price: number; source: string; discount: number } {
    const special = clientPrices[productId]
    if (special?.special_price != null) return { price: special.special_price, source: 'especial', discount: special.discount_pct }
    if (special?.discount_pct) return { price: catalogPrice * (1 - special.discount_pct / 100), source: 'dto_cliente', discount: special.discount_pct }
    const plPrice = clientPriceList[productId]
    if (plPrice != null) return { price: plPrice, source: 'tarifa', discount: 0 }
    // Si el producto NO tiene price_eur pero tiene cost_eur, sugerimos cost+30%.
    // Útil mientras se cargan los precios reales (la mayoría de productos no
    // tienen price_eur tras la migración de StelOrder).
    if ((!catalogPrice || catalogPrice <= 0) && costPrice && costPrice > 0) {
      return { price: Math.round(costPrice * 1.3 * 100) / 100, source: 'sugerido_costo+30%', discount: 0 }
    }
    return { price: catalogPrice, source: 'catalogo', discount: 0 }
  }

  async function searchProducts(query: string) {
    setSearchingProducts(true)
    const supabase = createClient()
    const tokens = query.trim().toLowerCase().split(/\s+/)
    // Traemos más de 20 porque hay duplicados de la migración de StelOrder
    // (mismo nombre con SKU auto-generado tipo PROXXXXX y el SKU real tipo
    // TC.QSP o TE.HEAVY.55). Después dedup en runtime.
    let q = supabase.from('tt_products').select('id, sku, name, brand, price_eur, cost_eur, image_url, product_type, price_min').eq('active', true).limit(80)
    for (const token of tokens) { q = q.or(`name.ilike.%${token}%,sku.ilike.%${token}%,brand.ilike.%${token}%`) }
    const { data } = await q
    const rows = (data || []) as ProductSearchResult[]

    // Dedup por nombre+marca, preferimos:
    //   - SKU "real" (no patrón PROXXXXX o COSTOPROXXXXX auto-generado)
    //   - Con precio_eur > 0 (mejor que precio cero)
    //   - Con price_min definido
    //   - Con imagen
    const isAutoSku = (sku: string) => /^(PRO|COSTO|GASTO|SVC|SRV)\d{3,}$/i.test(sku) || /^[A-Z]{3,6}\d{5,}$/.test(sku)
    const scoreProd = (p: ProductSearchResult) => {
      let s = 0
      if (!isAutoSku(p.sku)) s += 10
      if (p.price_eur && p.price_eur > 0) s += 3
      if (p.price_min && p.price_min > 0) s += 1
      if (p.image_url) s += 1
      if (p.brand) s += 1
      return s
    }
    const byKey = new Map<string, ProductSearchResult>()
    for (const p of rows) {
      const key = `${(p.name || '').trim().toLowerCase()}__${(p.brand || '').trim().toLowerCase()}`
      const existing = byKey.get(key)
      if (!existing || scoreProd(p) > scoreProd(existing)) byKey.set(key, p)
    }
    setProductResults(Array.from(byKey.values()).slice(0, 20))
    setSearchingProducts(false)
  }

  async function addProductAsItem(product: ProductSearchResult) {
    // Si venimos del flujo "vincular ítem rojo", actualizamos el ítem existente
    // (conservamos cantidad, sku original del cliente, descripción) y guardamos
    // el alias para futuras OCs.
    if (linkingItemId) {
      const target = items.find((i) => i.id === linkingItemId)
      if (target) {
        setItems((prev) => prev.map((i) => i.id === linkingItemId ? {
          ...i,
          product_id: product.id,
          // Mantenemos el SKU original del cliente — es lo que viene en su OC.
          // El SKU del catálogo queda implícito vía product_id.
          // Mantenemos también la cantidad y precio que ya estaban en la línea.
        } : i))

        // Si la cotización ya está guardada en DB, persistir el vínculo
        // inmediatamente en tt_quote_items (no esperar a que el user vuelva a
        // tocar "Guardar"). Hacemos match por quote_id + sku + product_id IS NULL
        // para no pisar otros items que ya estuvieran vinculados.
        if (currentQuoteId && target.sku.trim()) {
          try {
            const sb = createClient()
            const { error } = await sb.from('tt_quote_items')
              .update({ product_id: product.id })
              .eq('quote_id', currentQuoteId)
              .eq('sku', target.sku)
              .is('product_id', null)
            if (error) console.warn('No se pudo persistir el vínculo en tt_quote_items:', error)
          } catch (err) {
            console.warn('Error persistiendo vínculo en DB:', err)
          }
        }

        // Guardar alias para que la próxima OC lo encuentre solo.
        // Si no hay company seleccionada no podemos guardar (FK obligatoria).
        if (selectedCompanyId && target.sku.trim()) {
          try {
            const { saveAlias } = await import('@/lib/sku-aliases')
            const useClientScope = !!selectedClient?.id && confirm(
              `¿Guardar este vínculo SOLO para "${selectedClient.legal_name || selectedClient.name}"?\n\n` +
              `Aceptar = alias específico para ese cliente.\n` +
              `Cancelar = alias GLOBAL (vale para cualquier cliente con SKU "${target.sku.trim()}").`
            )
            const saved = await saveAlias({
              companyId: selectedCompanyId,
              clientId: useClientScope ? selectedClient!.id : null,
              externalSku: target.sku,
              productId: product.id,
              source: 'manual',
            })
            if (saved) {
              addToast({
                type: 'success',
                title: 'Vínculo guardado',
                message: useClientScope
                  ? `Próxima OC de este cliente con SKU "${target.sku}" se va a matchear solo`
                  : `SKU "${target.sku}" matcheado globalmente con ${product.sku}`,
              })
            } else {
              addToast({ type: 'warning', title: 'Vinculado pero no se pudo guardar el alias' })
            }
          } catch (err) {
            console.error('Error guardando alias:', err)
            addToast({ type: 'warning', title: 'Vinculado pero falló guardar el alias' })
          }
        }
      }
      setLinkingItemId(null)
      setShowProductSearch(false)
      setProductSearch('')
      return
    }

    // Flujo normal: agregar nuevo ítem a la cotización
    const resolved = resolvePrice(product.id, product.price_eur, product.cost_eur)
    setItems((prev) => [...prev, {
      id: Math.random().toString(36).slice(2),
      product_id: product.id,
      sku: product.sku,
      description: product.name + (product.product_type === 'service' ? ' [SERVICIO]' : ''),
      quantity: 1,
      unitPrice: resolved.price,
      discount: resolved.discount,
      notes: resolved.source !== 'catalogo' ? `Precio ${resolved.source}` : '',
    }])
    setShowProductSearch(false)
    setProductSearch('')
    addToast({ type: 'success', title: 'Producto agregado', message: `${product.sku} — ${resolved.source !== 'catalogo' ? 'Precio ' + resolved.source : 'Precio catalogo'}` })
  }

  function addEmptyItem() {
    setItems((prev) => [...prev, { id: Math.random().toString(36).slice(2), product_id: null, sku: '', description: '', quantity: 1, unitPrice: 0, discount: 0, notes: '' }])
  }

  function removeItem(id: string) { setItems((prev) => prev.filter((i) => i.id !== id)) }
  function updateItem(id: string, field: keyof QuoteLineItem, value: string | number) { setItems((prev) => prev.map((i) => (i.id === id ? { ...i, [field]: value } : i))) }
  function updateQuantity(id: string, delta: number) { setItems((prev) => prev.map((i) => (i.id === id ? { ...i, quantity: Math.max(1, i.quantity + delta) } : i))) }

  const subtotal = items.reduce((sum, i) => sum + i.quantity * i.unitPrice * (1 - i.discount / 100), 0)
  const taxAmount = ivaEnabled ? subtotal * (taxRate / 100) : 0
  const irpfAmount = irpfEnabled ? subtotal * (irpfRate / 100) : 0
  const reAmount = reEnabled ? subtotal * (reRate / 100) : 0
  const total = subtotal + taxAmount - irpfAmount + reAmount

  async function saveQuote() {
    if (currentQuoteId) { addToast({ type: 'info', title: 'Esta cotización ya está guardada', message: 'Usá los botones de enviar o convertir' }); return }
    if (saving) return
    if (!selectedCompanyId) { addToast({ type: 'error', title: 'Selecciona una empresa emisora' }); return }
    if (!selectedClient) { addToast({ type: 'error', title: 'Seleccioná un cliente antes de guardar' }); return }
    if (items.length === 0) { addToast({ type: 'error', title: 'Agrega al menos un item' }); return }
    setSaving(true)
    const supabase = createClient()
    try {
      const { data: quoteData, error: quoteError } = await supabase
        .from('tt_quotes')
        .insert({ number: quoteNumber, company_id: selectedCompanyId, client_id: selectedClient?.id || null, user_id: (await supabase.from('tt_users').select('id').eq('role', 'admin').limit(1).single()).data?.id || null, status: 'borrador', doc_subtype: docSubtype, notes, internal_notes: internalNotes, incoterm: incoterm || null, payment_terms: paymentTerms || null, payment_days: paymentDays || null, payment_terms_type: paymentTermsType || null, currency, subtotal, subject_iva: ivaEnabled, tax_rate: ivaEnabled ? taxRate : 0, tax_amount: taxAmount, irpf_rate: irpfEnabled ? irpfRate : 0, irpf_amount: irpfAmount, re_rate: reEnabled ? reRate : 0, re_amount: reAmount, total, valid_until: validUntil ? new Date(validUntil).toISOString() : null, participating_contact_ids: participatingContactIds.length > 0 ? participatingContactIds : null })
        .select('id').single()
      if (quoteError) throw quoteError
      const quoteItems = items.map((item, idx) => ({ quote_id: quoteData.id, product_id: item.product_id, sort_order: idx + 1, sku: item.sku, description: item.description, quantity: item.quantity, unit_price: item.unitPrice, discount_pct: item.discount, subtotal: item.quantity * item.unitPrice * (1 - item.discount / 100), notes: item.notes || null }))
      const { error: itemsError } = await supabase.from('tt_quote_items').insert(quoteItems)
      if (itemsError) throw itemsError
      await supabase.from('tt_activity_log').insert({ entity_type: 'quote', entity_id: quoteData.id, action: 'Cotizacion creada', detail: `${quoteNumber} - ${selectedClient?.legal_name || selectedClient?.name || 'Sin cliente'} - ${formatCurrency(total, currency)}` })
      addToast({ type: 'success', title: 'Cotización guardada', message: 'Próximo paso: enviar al cliente' })
      // No reseteamos los datos — dejamos al usuario sobre la cotización recién creada
      // para que pueda adjuntar archivos. setCurrentQuoteId expone el ID al panel de adjuntos.
      setCurrentQuoteId(quoteData.id as string)
      setQuoteStatus('borrador')
      loadSavedQuotes()
    } catch (err) {
      console.error('Error guardando cotizacion:', err)
      // Exponemos el error real al toast — si es un PostgrestError, trae message/code/details/hint
      const msg =
        err instanceof Error
          ? err.message
          : (err && typeof err === 'object' && 'message' in err)
            ? String((err as { message: unknown }).message)
            : JSON.stringify(err)
      addToast({ type: 'error', title: 'Error al guardar', message: msg })
    } finally { setSaving(false) }
  }

  async function transitionStatus(newStatus: 'enviada' | 'aceptada' | 'rechazada') {
    if (!currentQuoteId) return
    setTransitioning(true)
    const sb = createClient()
    try {
      // FASE 1.4 — Al pasar a 'enviada' por primera vez, snapshoteamos
      // la versión actual para tener el original que vio el cliente.
      if (newStatus === 'enviada') {
        const { data: authUser } = await sb.auth.getUser()
        const snap = await snapshotQuoteVersion({
          quoteId: currentQuoteId,
          changeSummary: 'Versión enviada al cliente',
          actorUserId: authUser?.user?.id ?? null,
        })
        if (!snap.ok) {
          console.warn('[transitionStatus] snapshotQuoteVersion fallo:', snap.error)
        }
      }

      // FASE 1.4 — Al aceptar, marcamos cuál versión aceptó el cliente.
      // mark_quote_accepted_version setea status='aceptada' + accepted_at,
      // así que no necesitamos el UPDATE manual abajo en ese caso.
      if (newStatus === 'aceptada') {
        const { data: authUser } = await sb.auth.getUser()
        // Leer current_version_number ANTES del snapshot
        const { data: q } = await sb
          .from('tt_quotes')
          .select('current_version_number')
          .eq('id', currentQuoteId)
          .maybeSingle()
        // accepted_version = última versión existente (current - 1 si
        // ya hubo al menos un snapshot; si no, 1 implícito)
        const acceptedVersion = Math.max(1, ((q?.current_version_number as number) || 1) - 1)
        const mark = await markAcceptedVersion({
          quoteId: currentQuoteId,
          versionNumber: acceptedVersion,
          actorUserId: authUser?.user?.id ?? null,
        })
        if (!mark.ok) {
          // Fallback: UPDATE manual sin marcar versión
          await sb.from('tt_quotes').update({ status: newStatus }).eq('id', currentQuoteId)
        }
      } else {
        const { error } = await sb.from('tt_quotes').update({ status: newStatus }).eq('id', currentQuoteId)
        if (error) throw error
      }
      const labels: Record<typeof newStatus, string> = {
        enviada: 'Marcada como enviada',
        aceptada: 'Cotización aceptada',
        rechazada: 'Cotización rechazada',
      }
      await sb.from('tt_activity_log').insert({
        entity_type: 'quote', entity_id: currentQuoteId,
        action: labels[newStatus], detail: quoteNumber,
      })
      setQuoteStatus(newStatus)
      addToast({ type: 'success', title: labels[newStatus] })
      loadSavedQuotes()
    } catch (err) {
      const msg = err instanceof Error ? err.message : JSON.stringify(err)
      addToast({ type: 'error', title: 'No se pudo cambiar el estado', message: msg })
    } finally { setTransitioning(false) }
  }

  // Convierte la cotización en un pedido real (tt_sales_orders) usando el helper
  // unificado del ERP. Crea items, link en tt_document_links, marca la cotización
  // como 'pedido' y redirige a /ventas?tab=pedidos&highlight=<id>.
  async function convertToOrder() {
    if (!currentQuoteId) return
    // FASE 0 — Anti doble-click / retry: el botón ya está disabled
    // mientras transitioning=true. La defensa de fondo es withIdempotency
    // dentro de quoteToOrder() + el índice UNIQUE de la migración v71.
    if (transitioning) return
    setTransitioning(true)
    try {
      const sb = createClient()
      // userId para que la clave de idempotencia distinga entre usuarios
      // (un mismo usuario haciendo doble click obtiene el mismo PED;
      //  el índice UNIQUE de DB bloquea cualquier intento posterior).
      const { data: authUser } = await sb.auth.getUser()
      const userId = authUser?.user?.id ?? null
      const { orderId, orderNumber } = await quoteToOrder(currentQuoteId, 'local', { userId })
      // Link de trazabilidad cotización ↔ pedido (tt_document_relations,
      // renombrada desde tt_document_links en v61). Si el parent
      // currentQuoteId vive en tt_quotes y no en tt_documents, el FK
      // tira y dejamos pasar (el pedido ya está creado y registrado en
      // tt_sales_orders.quote_id). El índice UNIQUE parcial de v71
      // sobre (parent_id, relation_type) garantiza que no haya dos
      // 'quote_to_order' del mismo origen, evitando duplicados aún
      // ante carreras a nivel de DB.
      try {
        await sb.from('tt_document_relations').insert({
          parent_id: currentQuoteId,
          child_id: orderId,
          relation_type: 'quote_to_order',
        })
      } catch { /* parent no en tt_documents (tt_quotes legacy) — no crítico */ }
      // Marca la cotización como convertida en pedido (para el banner del cotizador)
      await sb.from('tt_quotes').update({ status: 'pedido' }).eq('id', currentQuoteId)
      setQuoteStatus('pedido')
      setCreatedOrder({ id: orderId, number: orderNumber })
      addToast({
        type: 'success',
        title: `Pedido ${orderNumber} creado`,
        message: 'Te redirijo a la pantalla del pedido…',
      })
      // Redirect a /ventas con tab=pedidos y highlight del recién creado
      setTimeout(() => {
        router.push(`/ventas?tab=pedidos&highlight=${orderId}`)
      }, 800)
    } catch (err) {
      const msg = err instanceof Error ? err.message : JSON.stringify(err)
      addToast({ type: 'error', title: 'No se pudo crear el pedido', message: msg })
    } finally { setTransitioning(false) }
  }

  // CTA principal "Enviar al cliente": abre el modal split-screen estilo StelOrder
  // (formulario + preview del PDF en vivo). Reemplaza al wa.me directo.
  function openSendModal() {
    if (!currentQuoteId) {
      addToast({ type: 'warning', title: 'Primero guardá la cotización' })
      return
    }
    setShowSendModal(true)
  }

  // Mantiene compatibilidad: el botón "Reenviar por WhatsApp" del banner azul
  // sigue siendo wa.me directo (envío rápido sin pasar por el modal).
  function sendByWhatsApp() {
    const text = `Cotización ${quoteNumber}\nCliente: ${selectedClient?.legal_name || selectedClient?.name || '-'}\nTotal: ${formatCurrency(total, currency)}\nItems: ${items.length}`
    const phone = (selectedClient as Client & { phone?: string })?.phone || ''
    const cleaned = phone.replace(/[^\d]/g, '')
    const url = cleaned
      ? `https://wa.me/${cleaned}?text=${encodeURIComponent(text)}`
      : `https://wa.me/?text=${encodeURIComponent(text)}`
    window.open(url, '_blank')
    if (quoteStatus === 'borrador') setShowSendConfirmation(true)
  }

  async function handleWhatsAppConfirmed() {
    await transitionStatus('enviada')
    setShowSendConfirmation(false)
  }

  function sendByEmail() {
    const email = (selectedClient as Client & { email?: string })?.email || ''
    const subject = `Cotización ${quoteNumber}`
    const body = `Estimado/a ${selectedClient?.legal_name || selectedClient?.name || ''},\n\nAdjunto cotización ${quoteNumber} por un total de ${formatCurrency(total, currency)}.\n\nSaludos cordiales.`
    window.open(`mailto:${email}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`, '_blank')
    if (quoteStatus === 'borrador') void transitionStatus('enviada')
  }

  function downloadPdf() {
    window.print()
    if (quoteStatus === 'borrador') void transitionStatus('enviada')
  }

  // === ACCIONES NUEVAS para el menú "Más" ===

  // Duplicar: limpia los flags de "ya guardada" y deja el form igual, listo
  // para guardar como nueva cotización. Pide confirmación antes.
  function duplicateQuote() {
    if (!currentQuoteId) return
    if (!confirm('¿Duplicar esta cotización? Se mantienen los items, cliente y condiciones, pero se guarda como una nueva.')) return
    setCurrentQuoteId(null)
    setQuoteStatus(null)
    setCreatedOrder(null)
    setOcImportSource(null)
    generateQuoteNumber()
    addToast({ type: 'success', title: 'Cotización duplicada', message: 'Ajustá lo que necesites y guardá como nueva' })
  }

  // Eliminar: borra la cotización y sus items. Pide confirmación + texto.
  async function deleteQuote() {
    if (!currentQuoteId) return
    const confirmTxt = prompt(`Para eliminar la cotización ${quoteNumber} escribí "ELIMINAR" en mayúsculas:`)
    if (confirmTxt !== 'ELIMINAR') return
    setTransitioning(true)
    const sb = createClient()
    try {
      await sb.from('tt_quote_items').delete().eq('quote_id', currentQuoteId)
      await sb.from('tt_quotes').delete().eq('id', currentQuoteId)
      await sb.from('tt_activity_log').insert({
        entity_type: 'quote', entity_id: currentQuoteId,
        action: 'Cotización eliminada', detail: quoteNumber,
      })
      addToast({ type: 'success', title: 'Cotización eliminada' })
      // Reset form
      setItems([]); setNotes(''); setInternalNotes(''); setSelectedClient(null)
      setIvaEnabled(true); setTaxRate(21); setIrpfEnabled(false); setIrpfRate(0)
      setReEnabled(false); setReRate(0); setOcImportSource(null)
      setCurrentQuoteId(null); setQuoteStatus(null); setCreatedOrder(null)
      generateQuoteNumber()
      loadSavedQuotes()
    } catch (err) {
      const msg = err instanceof Error ? err.message : JSON.stringify(err)
      addToast({ type: 'error', title: 'No se pudo eliminar', message: msg })
    } finally { setTransitioning(false) }
  }

  // Reabrir: vuelve a 'borrador'. Útil cuando se marcó por error como enviada/aceptada.
  async function reopenQuote() {
    if (!currentQuoteId) return
    if (!confirm('¿Reabrir esta cotización como borrador? Vas a poder editarla y volver a enviarla.')) return
    setTransitioning(true)
    const sb = createClient()
    try {
      await sb.from('tt_quotes').update({ status: 'borrador' }).eq('id', currentQuoteId)
      await sb.from('tt_activity_log').insert({
        entity_type: 'quote', entity_id: currentQuoteId,
        action: 'Cotización reabierta', detail: quoteNumber,
      })
      setQuoteStatus('borrador')
      addToast({ type: 'success', title: 'Cotización reabierta' })
      loadSavedQuotes()
    } catch (err) {
      const msg = err instanceof Error ? err.message : JSON.stringify(err)
      addToast({ type: 'error', title: 'No se pudo reabrir', message: msg })
    } finally { setTransitioning(false) }
  }

  async function loadSavedQuotes() {
    setLoadingQuotes(true)
    const sb = createClient()
    // Load locally created quotes (filtered by company)
    let qLocal = sb.from('tt_quotes')
      .select('id, number, status, total, currency, created_at, subtotal, tax_amount, tax_rate, notes, internal_notes, incoterm, client_id, company_id, client:tt_clients(name, legal_name, tax_id, country), company:tt_companies(name, country)')
    qLocal = filterByCompany(qLocal)
    const { data: localData } = await qLocal.order('created_at', { ascending: false }).limit(50)

    // Load historical from tt_documents (filtered by company)
    let qDoc = sb.from('tt_documents')
      .select('id, display_ref, system_code, status, total, currency, created_at, subtotal, tax_amount, notes, metadata, client_id, client:tt_clients(id, name, legal_name, tax_id)')
      .in('doc_type', ['coti', 'presupuesto', 'quote'])
    qDoc = filterByCompany(qDoc)
    const { data: docData } = await qDoc.order('created_at', { ascending: false }).limit(50)

    const localQuotes = ((localData || []) as unknown as SavedQuote[]).map(q => ({
      ...q, _source: 'local' as string,
    }))

    const docQuotes: SavedQuote[] = (docData || []).map((d: Record<string, unknown>) => {
      const joinedClient = d.client as Record<string, unknown> | undefined
      const raw = (d.metadata as Record<string, unknown>)?.stelorder_raw as Record<string, unknown> | undefined
      // Prefer joined client name, fall back to metadata
      const clientName = (joinedClient?.legal_name as string) || (joinedClient?.name as string)
        || (raw ? ((raw['account-name'] as string) || (raw['legal-name'] as string) || 'Sin cliente') : 'Sin cliente')
      return {
        id: d.id as string,
        number: (d.display_ref as string) || (d.system_code as string) || '-',
        status: (d.status as string) || 'closed',
        total: (d.total as number) || 0,
        currency: (d.currency as string) || 'EUR',
        created_at: d.created_at as string,
        subtotal: (d.subtotal as number) || 0,
        tax_amount: (d.tax_amount as number) || 0,
        notes: (d.notes as string) || '',
        client: { name: clientName },
        _source: 'tt_documents' as string,
      }
    })

    const merged = [...localQuotes, ...docQuotes]
      .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
    setSavedQuotes(merged as SavedQuote[])
    setLoadingQuotes(false)
  }

  async function openQuoteDetail(quote: SavedQuote) {
    const supabase = createClient()
    const isDoc = (quote as SavedQuote & { _source?: string })._source === 'tt_documents'
    if (isDoc) {
      // Load items from tt_document_lines
      const { data: docItems } = await supabase
        .from('tt_document_lines')
        .select('*')
        .eq('document_id', quote.id)
        .order('sort_order')
      const mappedItems = (docItems || []).map((it: Record<string, unknown>) => ({
        id: (it.id as string) || '',
        sku: (it.sku as string) || '',
        description: (it.description as string) || '',
        quantity: (it.quantity as number) || 0,
        unit_price: (it.unit_price as number) || 0,
        discount_pct: (it.discount_pct as number) || 0,
        subtotal: (it.subtotal as number) || 0,
      }))
      setSelectedQuote({ ...quote, items: mappedItems })
    } else {
      const { data: quoteItems } = await supabase
        .from('tt_quote_items')
        .select('*')
        .eq('quote_id', quote.id)
        .order('sort_order')
      setSelectedQuote({ ...quote, items: quoteItems || [] })
    }
    setViewMode('detail')
  }

  function shareWhatsApp() {
    const text = `Cotizacion ${quoteNumber}\nCliente: ${selectedClient?.legal_name || selectedClient?.name || '-'}\nTotal: ${formatCurrency(total, currency)}\nItems: ${items.length}`
    window.open(`https://wa.me/?text=${encodeURIComponent(text)}`, '_blank')
  }

  const companyOptions = companies.map((c) => ({ value: c.id, label: `${c.name} (${c.currency})` }))

  // Build document detail view data for a selected quote
  function buildQuoteDetailData(q: SavedQuote) {
    const workflowSteps: WorkflowStep[] = [
      { key: 'lead', label: 'Lead', icon: '\uD83C\uDFAF', status: 'pending', tooltip: 'Sin lead asociado' },
      {
        key: 'coti', label: 'Cotizacion', icon: '\uD83D\uDCCB',
        status: q.status === 'borrador' || q.status === 'draft' ? 'current' : q.status === 'enviada' || q.status === 'sent' ? 'current' : 'completed',
        documentRef: q.number, date: new Date(q.created_at).toLocaleDateString('es-ES'),
        tooltip: `Cotizacion ${q.status}`,
      },
      { key: 'oc_cliente', label: 'OC Cliente', icon: '\uD83D\uDCC4', status: 'pending', tooltip: 'Pendiente OC del cliente' },
      { key: 'pedido', label: 'Pedido', icon: '\uD83D\uDCE6', status: 'pending', tooltip: 'Pendiente crear pedido' },
      { key: 'delivery_note', label: 'Albaran', icon: '\uD83D\uDE9A', status: 'pending' },
      { key: 'factura', label: 'Factura', icon: '\uD83D\uDCB3', status: 'pending' },
      { key: 'cobro', label: 'Cobro', icon: '\uD83D\uDCB0', status: 'pending' },
    ]

    const document = {
      id: q.id,
      type: 'coti',
      system_code: q.number,
      display_ref: q.client?.name ? `Cotizacion ${q.client.name}` : q.number,
      status: q.status === 'borrador' ? 'draft' : q.status,
      currency: q.currency || 'EUR',
      total: q.total || 0,
      subtotal: q.subtotal || 0,
      tax_amount: q.tax_amount || 0,
      incoterm: q.incoterm,
      created_at: q.created_at,
    }

    const client = q.client ? { id: q.client_id || '', name: q.client.name, tax_id: q.client.tax_id, country: q.client.country } : undefined
    const comp = q.company ? { id: q.company_id || '', name: q.company.name, country: q.company.country } : undefined

    const docItems: DocumentItem[] = (q.items || []).map((it, idx) => ({
      id: it.id || `item-${idx}`,
      sku: it.sku || '',
      description: it.description || '',
      quantity: it.quantity || 0,
      unit_price: it.unit_price || 0,
      subtotal: it.subtotal || 0,
      qty_delivered: 0,
      qty_invoiced: 0,
      qty_reserved: 0,
      status: 'pending',
      statusColor: '#6B7280',
      statusLabel: 'Sin pedido',
      stockAvailable: 0,
      stockReserved: 0,
      stockIndicator: 'ok' as const,
      requires_po: false,
      hasComponents: false,
    }))

    const mockNotes: InternalNote[] = q.internal_notes ? [{
      id: 'note-1', author: 'Sistema', authorInitials: 'S', content: q.internal_notes, createdAt: new Date(q.created_at).toLocaleDateString('es-ES'), isSystem: true,
    }] : []

    return { workflowSteps, document, client, comp, docItems, mockNotes }
  }

  // Column definitions for saved quotes DataTable
  const SAVED_QUOTE_COLS: DataTableColumn[] = [
    { key: 'referencia', label: 'Referencia', sortable: true, searchable: true, width: '140px' },
    { key: 'cliente', label: 'Cliente', sortable: true, searchable: true },
    { key: 'titulo', label: 'Titulo / Descripcion', searchable: true },
    { key: 'estado', label: 'Estado', sortable: true, type: 'status', width: '120px' },
    { key: 'fecha', label: 'Fecha', sortable: true, type: 'date', width: '110px' },
    { key: 'importe', label: 'Importe', sortable: true, type: 'currency', width: '120px' },
    { key: 'moneda', label: 'Moneda', sortable: true, width: '80px' },
  ]

  // Estados que consideramos "canceladas" (las ocultamos por default).
  // Soporta variantes en español, inglés y mayúsculas mixtas.
  const isCancelledStatus = (s: string | null | undefined): boolean => {
    if (!s) return false
    const x = s.toLowerCase()
    return x === 'cancelled' || x === 'canceled' || x === 'cancelado' || x === 'cancelada'
  }

  // Convert savedQuotes to DataTable rows. Ocultamos canceladas salvo que
  // el toggle esté activo.
  const visibleSavedQuotes = showCancelled
    ? savedQuotes
    : savedQuotes.filter((q) => !isCancelledStatus(q.status))
  const cancelledCount = savedQuotes.length - savedQuotes.filter((q) => !isCancelledStatus(q.status)).length

  const savedQuoteRows = visibleSavedQuotes.map((q) => ({
    id: q.id,
    referencia: q.number || '-',
    cliente: q.client?.legal_name || q.client?.name || 'Sin cliente',
    titulo: q.notes || '',
    estado: mapStatus(q.status),
    fecha: q.created_at,
    importe: q.total || 0,
    moneda: q.currency || 'EUR',
    _raw: q,
  }))

  const handleQuoteRowClick = (row: Record<string, unknown>) => {
    const q = row._raw as SavedQuote
    openQuoteDetail(q)
  }

  const filteredQuotes = savedQuotes.filter((q) => {
    if (!listSearch) return true
    const s = listSearch.toLowerCase()
    return q.number.toLowerCase().includes(s) || (q.client?.legal_name || q.client?.name || '').toLowerCase().includes(s)
  })

  // ================================================================
  // DETAIL VIEW
  // ================================================================
  if (viewMode === 'detail' && selectedQuote) {
    const quoteSource = ((selectedQuote as SavedQuote & { _source?: string })._source === 'tt_documents' ? 'tt_documents' : 'local') as 'local' | 'tt_documents'
    const allIds = savedQuotes.map(q => q.id)

    return (
      <DocumentForm
        documentId={selectedQuote.id}
        documentType="coti"
        source={quoteSource}
        onBack={() => { setViewMode('list'); setSelectedQuote(null); loadSavedQuotes() }}
        onUpdate={loadSavedQuotes}
        siblingIds={allIds}
      />
    )
  }

  // ================================================================
  // MAIN VIEW - Tabs: Nueva cotizacion | Cotizaciones guardadas
  // ================================================================
  return (
    <div className="space-y-6 animate-fade-in print:space-y-4">
      {/* Header with tab toggle */}
      <div className="flex items-center justify-between flex-wrap gap-4 print:hidden">
        <div>
          <h1 className="text-2xl font-bold text-[#F0F2F5]">Cotizador</h1>
          <p className="text-[#6B7280] mt-1 text-sm">
            {viewMode === 'create' ? 'Nueva cotizacion' : 'Cotizaciones guardadas'}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {viewMode === 'create' && (
            <button
              onClick={() => setOcParserOpen(true)}
              disabled={convertingOc || !activeCompanyId}
              title={!activeCompanyId
                ? 'Seleccioná una empresa primero'
                : 'Subí el PDF de la OC del cliente y la IA crea la cotización automáticamente'}
              className="px-4 py-2.5 rounded-lg bg-[#FF6600] hover:bg-[#FF8533] disabled:opacity-50 disabled:cursor-not-allowed text-white text-sm font-bold transition flex items-center gap-2 shadow-lg shadow-[#FF6600]/30 ring-2 ring-[#FF6600]/20 hover:ring-[#FF6600]/50"
            >
              {convertingOc ? (
                <><Loader2 size={16} className="animate-spin" /> Creando cotización…</>
              ) : (
                <><Sparkles size={14} /> <Upload size={16} /> Importar OC del cliente (PDF)</>
              )}
            </button>
          )}
          {/* Menú "Más" estilo StelOrder — aparece solo cuando hay una cotización
              guardada (currentQuoteId) y agrupa acciones contextuales. Las
              acciones se pueden habilitar/deshabilitar desde /admin. */}
          {viewMode === 'create' && currentQuoteId && (
            <DocumentMoreMenu
              documentType="coti"
              variant="ghost"
              align="right"
              handlers={{
                send: openSendModal,
                download_pdf: downloadPdf,
                duplicate: duplicateQuote,
                generate_order: quoteStatus === 'aceptada' ? convertToOrder : undefined,
                reopen: (quoteStatus === 'enviada' || quoteStatus === 'aceptada' || quoteStatus === 'rechazada') ? reopenQuote : undefined,
                delete: deleteQuote,
              }}
            />
          )}
          <div className="flex bg-[#0B0E13] rounded-lg border border-[#2A3040] p-0.5">
            <button
              onClick={() => {
                // Si ya estamos en create y había una cotización cargada, limpiar todo
                if (viewMode === 'create' && currentQuoteId) {
                  setItems([]); setNotes(''); setInternalNotes(''); setSelectedClient(null)
                  setIvaEnabled(true); setTaxRate(21); setIrpfEnabled(false); setIrpfRate(0)
                  setReEnabled(false); setReRate(0); setOcImportSource(null)
                  setCurrentQuoteId(null); setQuoteStatus(null); generateQuoteNumber()
                }
                setViewMode('create')
              }}
              className={`px-3 py-1.5 rounded-md text-xs font-semibold transition-all ${viewMode === 'create' ? 'bg-[#FF6600] text-white' : 'text-[#6B7280] hover:text-[#F0F2F5]'}`}
            >
              <PlusCircle size={14} className="inline mr-1" />
              Nueva
            </button>
            <button
              onClick={() => { setViewMode('list'); loadSavedQuotes() }}
              className={`px-3 py-1.5 rounded-md text-xs font-semibold transition-all ${viewMode === 'list' ? 'bg-[#FF6600] text-white' : 'text-[#6B7280] hover:text-[#F0F2F5]'}`}
            >
              <List size={14} className="inline mr-1" />
              Guardadas
            </button>
          </div>
        </div>
      </div>

      {/* LIST VIEW */}
      {viewMode === 'list' && (
        <>
          {cancelledCount > 0 && (
            <div className="flex items-center justify-end mb-2">
              <label className="flex items-center gap-2 text-xs text-[#9CA3AF] cursor-pointer hover:text-[#F0F2F5] transition">
                <input
                  type="checkbox"
                  checked={showCancelled}
                  onChange={(e) => setShowCancelled(e.target.checked)}
                  className="accent-[#FF6600]"
                />
                Mostrar canceladas ({cancelledCount})
              </label>
            </div>
          )}
          <DataTable
            data={savedQuoteRows}
            columns={SAVED_QUOTE_COLS}
            loading={loadingQuotes}
            totalLabel="cotizaciones"
            showTotals
            onRowClick={handleQuoteRowClick}
            onNewClick={() => setViewMode('create')}
            newLabel="Nueva cotizacion"
            exportFilename="cotizaciones_torquetools"
            pageSize={25}
          />
        </>
      )}

      {/* CREATE VIEW */}
      {viewMode === 'create' && (
        <>
          {/* ══════════════════════════════════════════════════════════════
              Banner POST-SAVE: cotización guardada, próximos pasos
              ══════════════════════════════════════════════════════════════ */}
          {currentQuoteId && quoteStatus && (
            <div className={`rounded-xl border p-4 ${
              quoteStatus === 'borrador' ? 'border-emerald-500/30 bg-gradient-to-r from-emerald-500/10 to-emerald-500/5'
              : quoteStatus === 'enviada' ? 'border-blue-500/30 bg-gradient-to-r from-blue-500/10 to-blue-500/5'
              : quoteStatus === 'aceptada' ? 'border-[#FF6600]/30 bg-gradient-to-r from-[#FF6600]/10 to-[#FF6600]/5'
              : quoteStatus === 'pedido' ? 'border-purple-500/30 bg-gradient-to-r from-purple-500/10 to-purple-500/5'
              : 'border-red-500/30 bg-gradient-to-r from-red-500/10 to-red-500/5'
            }`}>
              <div className="flex items-start gap-3">
                <div className={`w-9 h-9 rounded-lg flex items-center justify-center shrink-0 ${
                  quoteStatus === 'borrador' ? 'bg-emerald-500/20'
                  : quoteStatus === 'enviada' ? 'bg-blue-500/20'
                  : quoteStatus === 'aceptada' ? 'bg-[#FF6600]/20'
                  : quoteStatus === 'pedido' ? 'bg-purple-500/20'
                  : 'bg-red-500/20'
                }`}>
                  <Save size={18} className={
                    quoteStatus === 'borrador' ? 'text-emerald-400'
                    : quoteStatus === 'enviada' ? 'text-blue-400'
                    : quoteStatus === 'aceptada' ? 'text-[#FF6600]'
                    : quoteStatus === 'pedido' ? 'text-purple-400'
                    : 'text-red-400'
                  } />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <p className="text-sm font-bold text-[#F0F2F5]">
                      {quoteStatus === 'borrador' && `Cotización ${quoteNumber} guardada · Próximo paso: enviar al cliente`}
                      {quoteStatus === 'enviada' && `Cotización ${quoteNumber} enviada · Esperando respuesta del cliente`}
                      {quoteStatus === 'aceptada' && `Cliente aceptó · Convertí en pedido cuando estés listo`}
                      {quoteStatus === 'pedido' && (createdOrder ? `✓ Convertida en pedido ${createdOrder.number}` : `Convertida en pedido de venta`)}
                      {quoteStatus === 'rechazada' && `Cliente rechazó la cotización`}
                    </p>
                    {currentQuoteId && <QuoteVersionBadge quoteId={currentQuoteId} />}
                  </div>
                  {quoteStatus === 'borrador' && (
                    <div className="flex flex-wrap gap-2 mt-2">
                      <Button size="sm" variant="primary" onClick={openSendModal} disabled={transitioning}>
                        <MessageSquare size={14} /> Enviar al cliente
                      </Button>
                      <Button size="sm" variant="secondary" onClick={sendByEmail} disabled={transitioning}>
                        Email
                      </Button>
                      <Button size="sm" variant="secondary" onClick={downloadPdf} disabled={transitioning}>
                        <Printer size={14} /> PDF
                      </Button>
                      <Button size="sm" variant="ghost" onClick={() => transitionStatus('enviada')} disabled={transitioning}>
                        Marcar enviada (sin enviar ahora)
                      </Button>
                    </div>
                  )}
                  {quoteStatus === 'enviada' && (
                    <div className="flex flex-wrap gap-2 mt-2">
                      <Button size="sm" variant="primary" onClick={() => transitionStatus('aceptada')} disabled={transitioning}>
                        ✓ Marcar aceptada
                      </Button>
                      <Button size="sm" variant="secondary" onClick={() => transitionStatus('rechazada')} disabled={transitioning}>
                        Rechazada
                      </Button>
                      <Button size="sm" variant="ghost" onClick={sendByWhatsApp}>
                        Reenviar por WhatsApp
                      </Button>
                    </div>
                  )}
                  {quoteStatus === 'aceptada' && (
                    <div className="flex flex-wrap gap-2 mt-2">
                      <Button size="sm" variant="primary" onClick={convertToOrder} loading={transitioning} disabled={transitioning}>
                        📦 Convertir en pedido
                      </Button>
                    </div>
                  )}
                  {quoteStatus === 'pedido' && (
                    <div className="flex flex-wrap gap-2 mt-2">
                      {createdOrder && (
                        <Button size="sm" variant="primary" onClick={() => router.push(`/ventas?tab=pedidos&highlight=${createdOrder.id}`)}>
                          📦 Ver pedido {createdOrder.number} →
                        </Button>
                      )}
                      <Button size="sm" variant="secondary" onClick={() => {
                        setItems([]); setNotes(''); setInternalNotes(''); setSelectedClient(null)
                        setIvaEnabled(true); setTaxRate(21); setIrpfEnabled(false); setIrpfRate(0)
                        setReEnabled(false); setReRate(0); setOcImportSource(null)
                        setCurrentQuoteId(null); setQuoteStatus(null); setCreatedOrder(null); generateQuoteNumber()
                      }}>
                        <PlusCircle size={14} /> Nueva cotización
                      </Button>
                    </div>
                  )}
                  {quoteStatus === 'rechazada' && (
                    <div className="flex flex-wrap gap-2 mt-2">
                      <Button size="sm" variant="primary" onClick={() => {
                        setItems([]); setNotes(''); setInternalNotes(''); setSelectedClient(null)
                        setIvaEnabled(true); setTaxRate(21); setIrpfEnabled(false); setIrpfRate(0)
                        setReEnabled(false); setReRate(0); setOcImportSource(null)
                        setCurrentQuoteId(null); setQuoteStatus(null); setCreatedOrder(null); generateQuoteNumber()
                      }}>
                        <PlusCircle size={14} /> Nueva cotización
                      </Button>
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* ══════════════════════════════════════════════════════════════
              Banner guía cuando se importó una OC: muestra próximos pasos
              ══════════════════════════════════════════════════════════════ */}
          {!currentQuoteId && ocImportSource && items.length > 0 && (
            <div className="rounded-xl border border-[#FF6600]/30 bg-gradient-to-r from-[#FF6600]/10 to-[#FF6600]/5 p-4">
              <div className="flex items-start gap-3">
                <div className="w-9 h-9 rounded-lg bg-[#FF6600]/20 flex items-center justify-center shrink-0">
                  <Sparkles size={18} className="text-[#FF6600]" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-bold text-[#F0F2F5]">
                    OC {ocImportSource.ocNumber || 'del cliente'} cargada · {items.length} items extraídos por IA
                  </p>
                  <p className="text-xs text-[#9CA3AF] mt-0.5">Próximos pasos para terminar:</p>
                  <ol className="mt-2 space-y-1.5 text-xs text-[#D1D5DB]">
                    <li className="flex items-start gap-2">
                      <span className={`shrink-0 w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold ${selectedClient ? 'bg-emerald-500/20 text-emerald-400' : 'bg-[#FF6600]/30 text-[#FF6600]'}`}>
                        {selectedClient ? '✓' : '1'}
                      </span>
                      <span>
                        <strong>Cliente:</strong>{' '}
                        {selectedClient ? (
                          <span className="text-emerald-400">{selectedClient.legal_name || selectedClient.name} ✓</span>
                        ) : (
                          <span className="text-[#FF6600]">Buscá y seleccioná el cliente abajo (lo intenté por CUIT pero no lo encontré)</span>
                        )}
                      </span>
                    </li>
                    <li className="flex items-start gap-2">
                      <span className={`shrink-0 w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold ${items.every(i => i.unitPrice > 0) ? 'bg-emerald-500/20 text-emerald-400' : 'bg-amber-500/20 text-amber-400'}`}>
                        {items.every(i => i.unitPrice > 0) ? '✓' : '2'}
                      </span>
                      <span>
                        <strong>Precios:</strong>{' '}
                        {items.every(i => i.unitPrice > 0) ? (
                          <span className="text-emerald-400">Todos cargados ✓</span>
                        ) : (
                          <span className="text-amber-400">{items.filter(i => i.unitPrice === 0).length} items con precio en 0 — revisá la tabla de items</span>
                        )}
                      </span>
                    </li>
                    <li className="flex items-start gap-2">
                      <span className={`shrink-0 w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold ${incoterm && paymentTerms ? 'bg-emerald-500/20 text-emerald-400' : 'bg-[#1E2330] text-[#6B7280]'}`}>
                        {incoterm && paymentTerms ? '✓' : '3'}
                      </span>
                      <span>
                        <strong>Condiciones:</strong>{' '}
                        {incoterm && paymentTerms ? (
                          <span className="text-emerald-400">{incoterm} · {paymentTerms} ✓</span>
                        ) : (
                          <span className="text-[#9CA3AF]">Verificá incoterm y condición de pago abajo</span>
                        )}
                      </span>
                    </li>
                    <li className="flex items-start gap-2">
                      <span className="shrink-0 w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold bg-[#FF6600] text-white">
                        4
                      </span>
                      <span>
                        <strong>Click <span className="text-[#FF6600]">"Guardar cotización"</span></strong> abajo a la derecha cuando esté todo OK
                      </span>
                    </li>
                  </ol>
                </div>
                <button
                  onClick={() => setOcImportSource(null)}
                  className="text-[#6B7280] hover:text-[#F0F2F5] p-1 shrink-0"
                  title="Cerrar guía"
                  aria-label="Cerrar guía"
                >
                  <X size={16} />
                </button>
              </div>
            </div>
          )}

          {/* ══════════════════════════════════════════════════════════════
              REGLA FUNDAMENTAL: Barra sticky con código + stepper + alertas
              ══════════════════════════════════════════════════════════════ */}
          <DocumentProcessBar
            code={quoteNumber || 'COT-pendiente'}
            badge={
              currentQuoteId && quoteStatus
                ? {
                    label: quoteStatus === 'borrador' ? 'Guardada · Sin enviar'
                      : quoteStatus === 'enviada' ? 'Enviada al cliente'
                      : quoteStatus === 'aceptada' ? 'Aceptada por el cliente'
                      : quoteStatus === 'pedido' ? 'Convertida en pedido'
                      : 'Rechazada',
                    variant: quoteStatus === 'borrador' ? 'warning'
                      : quoteStatus === 'enviada' ? 'info'
                      : quoteStatus === 'aceptada' ? 'success'
                      : quoteStatus === 'pedido' ? 'success'
                      : 'danger',
                  }
                : {
                    label: selectedClient && items.length > 0 ? 'Listo para guardar' : 'Borrador',
                    variant: selectedClient && items.length > 0 ? 'success' : 'warning',
                  }
            }
            entity={
              <span>
                {(() => {
                  const c = companies.find((c) => c.id === selectedCompanyId)
                  return c ? <><strong>{(c as any).trade_name || c.name}</strong>{c.country ? ` (${c.country})` : ''} · Moneda {currency}</> : 'Seleccioná empresa emisora'
                })()}
                {selectedClient && <> · Cliente: <strong>{selectedClient.legal_name || selectedClient.name}</strong></>}
              </span>
            }
            alerts={[
              ...(!selectedCompanyId ? [{ type: 'warning' as const, message: 'Seleccioná la empresa emisora' }] : []),
              ...(!selectedClient ? [{ type: 'warning' as const, message: 'Buscá y seleccioná el cliente' }] : []),
              ...(items.length === 0 ? [{ type: 'info' as const, message: 'Agregá al menos un item a la cotización' }] : []),
              ...(!paymentTerms ? [{ type: 'info' as const, message: 'Condición de pago sin definir' }] : []),
              ...(!incoterm ? [{ type: 'info' as const, message: 'Incoterm sin definir (EXW/FOB/CIF/etc)' }] : []),
            ]}
            steps={buildSteps('quote',
              // Si ya está guardada, el step viene del status real
              currentQuoteId && quoteStatus === 'pedido' ? 'converted'
              : currentQuoteId && quoteStatus === 'aceptada' ? 'accepted'
              : currentQuoteId && quoteStatus === 'enviada' ? 'sent'
              : currentQuoteId ? 'approval' // borrador guardado: en revisión, listo para enviar
              // Pre-save: completitud del form
              : !selectedCompanyId || !selectedClient ? 'draft'
              : items.length === 0 ? 'draft'
              : !paymentTerms || !incoterm ? 'conditions'
              : 'approval'
            )}
            actions={
              !currentQuoteId
                ? [{ label: 'Guardar', onClick: saveQuote, icon: 'save', variant: 'primary', disabled: saving || !selectedClient || items.length === 0 }]
                : quoteStatus === 'borrador'
                  ? [
                      { label: 'Enviar al cliente', onClick: openSendModal, icon: 'play', variant: 'primary', disabled: transitioning },
                      { label: 'Marcar enviada', onClick: () => transitionStatus('enviada'), variant: 'secondary', disabled: transitioning },
                    ]
                  : quoteStatus === 'enviada'
                    ? [
                        { label: 'Marcar aceptada', onClick: () => transitionStatus('aceptada'), icon: 'check', variant: 'primary', disabled: transitioning },
                        { label: 'Rechazada', onClick: () => transitionStatus('rechazada'), variant: 'danger', disabled: transitioning },
                      ]
                    : quoteStatus === 'aceptada'
                      ? [
                          { label: 'Convertir en pedido', onClick: convertToOrder, icon: 'play', variant: 'primary', disabled: transitioning },
                        ]
                      : []
            }
          />

          {/* Empresa & Cliente */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <Card>
              <CardHeader>
                <CardTitle className="text-sm flex items-center gap-2">
                  <Building2 size={16} className="text-[#FF6600]" /> Empresa emisora
                </CardTitle>
              </CardHeader>
              <CardContent>
                <Select options={companyOptions} value={selectedCompanyId} onChange={(e) => setSelectedCompanyId(e.target.value)} placeholder="Seleccionar empresa..." />
                {selectedCompanyId && (
                  <div className="flex items-center gap-3 mt-2 flex-wrap">
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-[#4B5563]">Tipo:</span>
                      <select
                        value={docSubtype}
                        onChange={(e) => setDocSubtype(e.target.value as typeof docSubtype)}
                        className="bg-[#0F1218] border border-[#1E2330] rounded px-2 py-1 text-xs font-semibold text-[#F0F2F5]"
                      >
                        <option value="cotizacion">📋 Cotizacion</option>
                        <option value="presupuesto">📄 Presupuesto</option>
                        <option value="proforma">📑 Proforma</option>
                        <option value="packing_list">📦 Packing List</option>
                        <option value="oferta">💼 Oferta Comercial</option>
                      </select>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-[#4B5563]">Moneda:</span>
                      <select
                        value={currency}
                        onChange={(e) => setCurrency(e.target.value as 'EUR' | 'ARS' | 'USD')}
                        className="bg-[#0F1218] border border-[#1E2330] rounded px-2 py-1 text-xs font-semibold"
                        style={{ color: '#FF6600' }}
                      >
                        <option value="EUR">EUR €</option>
                        <option value="USD">USD $</option>
                        <option value="ARS">ARS $</option>
                      </select>
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-sm flex items-center gap-2">
                  <User size={16} className="text-[#FF6600]" /> Cliente
                </CardTitle>
              </CardHeader>
              <CardContent>
                {selectedClient ? (
                  <div className="flex items-center justify-between p-3 rounded-lg bg-[#0F1218] border border-[#1E2330]">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <p className="text-sm font-medium text-[#F0F2F5]">{selectedClient.legal_name || selectedClient.name}</p>
                        {selectedClient.legal_name && selectedClient.name && selectedClient.legal_name !== selectedClient.name && (
                          <span className="text-[10px] px-1.5 py-0.5 rounded bg-[#1E2330] text-[#9CA3AF] border border-[#2A3040]" title="Contacto principal cargado en el cliente">
                            👤 {selectedClient.name}
                          </span>
                        )}
                        {taxConfigSource === 'override' && activeCompanyId && (
                          <span
                            className="text-[10px] px-1.5 py-0.5 rounded bg-emerald-500/15 text-emerald-400 border border-emerald-500/30"
                            title="Aplicado override de IVA específico para esta empresa (v70)"
                          >
                            ✓ override empresa
                          </span>
                        )}
                        {taxConfigSource === 'client_default' && (
                          <span
                            className="text-[10px] px-1.5 py-0.5 rounded bg-[#1E2330] text-[#9CA3AF] border border-[#2A3040]"
                            title="Sin override por empresa: se aplican los defaults fiscales del cliente"
                          >
                            default cliente
                          </span>
                        )}
                      </div>
                      <p className="text-xs text-[#6B7280] mt-0.5">{selectedClient.tax_id} - {selectedClient.email}</p>
                    </div>
                    <button onClick={() => { setSelectedClient(null); setParticipatingContactIds([]) }} className="text-[#6B7280] hover:text-red-400 shrink-0"><X size={16} /></button>
                  </div>
                ) : (
                  <div className="relative">
                    <SearchBar placeholder="Buscar cliente por nombre, CUIT, email..." value={clientSearch} onChange={setClientSearch} />
                    {showClientDropdown && clientResults.length > 0 && (
                      <div className="absolute top-full left-0 right-0 mt-1 bg-[#141820] border border-[#1E2330] rounded-lg shadow-xl z-10 max-h-48 overflow-y-auto">
                        {clientResults.map((client) => (
                          <button key={client.id} onClick={() => { setSelectedClient(client); setClientSearch(''); setShowClientDropdown(false) }} className="w-full text-left px-4 py-2.5 hover:bg-[#1E2330] transition-colors border-b border-[#1E2330] last:border-0">
                            <p className="text-sm font-semibold text-[#F0F2F5]">{client.legal_name || client.name}</p>
                            <div className="flex items-center gap-2 flex-wrap mt-0.5">
                              {client.tax_id && (
                                <span className="text-[11px] font-mono text-[#FF6600] bg-[#FF6600]/10 px-1.5 py-0.5 rounded">
                                  {client.tax_id}
                                </span>
                              )}
                              {client.country && (
                                <span className="text-[11px] text-[#6B7280]">{client.country}</span>
                              )}
                              {client.legal_name && client.name && client.legal_name !== client.name && (
                                <span className="text-[11px] text-[#9CA3AF]">👤 {client.name}</span>
                              )}
                            </div>
                            {client.email && <p className="text-[11px] text-[#6B7280] mt-0.5">{client.email}</p>}
                          </button>
                        ))}
                      </div>
                    )}
                    {showClientDropdown && clientSearch && clientResults.length === 0 && (
                      <div className="absolute top-full left-0 right-0 mt-1 bg-[#141820] border border-[#1E2330] rounded-lg shadow-xl z-10">
                        <p className="px-4 py-3 text-sm text-[#4B5563]">No se encontraron clientes</p>
                      </div>
                    )}
                  </div>
                )}

                {/* ── CONTACTOS PARTICIPANTES (estilo StelOrder) ───────────
                    Lista de contactos del cliente con checkboxes para marcar
                    quiénes participan en la cotización. Pre-selecciona los
                    marcados con receives_quotes=true o is_primary.
                    Sus emails se pre-cargan en el modal de envío. */}
                {selectedClient && (
                  <div className="mt-3 rounded-lg border border-[#1E2330] bg-[#0F1218] overflow-hidden">
                    <div className="flex items-center justify-between px-3 py-2 border-b border-[#1E2330] bg-[#141820]">
                      <span className="text-[10px] uppercase tracking-wider text-[#9CA3AF] font-semibold flex items-center gap-1.5">
                        <User size={11} /> Contactos participantes ({participatingContactIds.length}/{clientContacts.length})
                      </span>
                      <button
                        type="button"
                        onClick={() => { setNewContactDraft({ name: '', position: '', email: '', phone: '' }); setShowNewContactModal(true) }}
                        className="text-[10px] font-semibold text-[#FF6600] hover:text-[#FF8533] flex items-center gap-1"
                      >
                        <Plus size={10} /> Nuevo contacto
                      </button>
                    </div>
                    {clientContacts.length === 0 ? (
                      <div className="px-3 py-3 text-xs text-[#6B7280] text-center italic">
                        Este cliente todavía no tiene contactos cargados.
                        <button
                          type="button"
                          onClick={() => { setNewContactDraft({ name: '', position: '', email: '', phone: '' }); setShowNewContactModal(true) }}
                          className="block w-full mt-1 text-[#FF6600] hover:text-[#FF8533] font-semibold"
                        >
                          + Agregar el primero
                        </button>
                      </div>
                    ) : (
                      <div className="max-h-44 overflow-y-auto divide-y divide-[#1E2330]">
                        {clientContacts.map((c) => {
                          const checked = participatingContactIds.includes(c.id)
                          return (
                            <label
                              key={c.id}
                              className={`flex items-center gap-2 px-3 py-2 text-xs cursor-pointer transition-colors ${
                                checked ? 'bg-[#FF6600]/5 hover:bg-[#FF6600]/10' : 'hover:bg-[#1C2230]'
                              }`}
                            >
                              <input
                                type="checkbox"
                                checked={checked}
                                onChange={(e) => {
                                  setParticipatingContactIds((prev) =>
                                    e.target.checked ? [...prev, c.id] : prev.filter((id) => id !== c.id)
                                  )
                                }}
                                className="accent-[#FF6600] shrink-0"
                              />
                              <div className="flex-1 min-w-0">
                                <div className="flex items-center gap-1.5 flex-wrap">
                                  <span className={`font-semibold truncate ${checked ? 'text-[#F0F2F5]' : 'text-[#D1D5DB]'}`}>{c.name}</span>
                                  {c.is_primary && <span className="text-[9px] px-1 py-0.5 rounded bg-emerald-500/15 text-emerald-400 border border-emerald-500/30">PRINCIPAL</span>}
                                  {c.position && <span className="text-[10px] text-[#6B7280]">— {c.position}</span>}
                                </div>
                                {(c.email || c.phone) && (
                                  <div className="text-[10px] text-[#6B7280] truncate">
                                    {c.email}{c.email && c.phone ? ' · ' : ''}{c.phone}
                                  </div>
                                )}
                              </div>
                            </label>
                          )
                        })}
                      </div>
                    )}
                  </div>
                )}
              </CardContent>
            </Card>
          </div>

          {/* Items table */}
          <Card>
            <CardHeader>
              <CardTitle className="text-sm">Items de la cotizacion</CardTitle>
              <div className="flex gap-2 print:hidden">
                <Button variant="secondary" size="sm" onClick={() => setShowProductSearch(true)}><Search size={14} /> Buscar producto</Button>
                <Button variant="primary" size="sm" onClick={addEmptyItem}><Plus size={14} /> Linea manual</Button>
              </div>
            </CardHeader>
            <CardContent>
              {items.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-12 text-[#4B5563] border border-dashed border-[#1E2330] rounded-lg">
                  <FileText size={36} className="mb-3" />
                  <p className="text-sm">No hay items todavia</p>
                  <p className="text-xs mt-1">Agrega productos desde el buscador o con linea manual</p>
                  <div className="flex gap-2 mt-4">
                    <Button variant="primary" size="sm" onClick={() => setShowProductSearch(true)}><Search size={14} /> Buscar producto</Button>
                    <Button variant="secondary" size="sm" onClick={addEmptyItem}><Plus size={14} /> Linea manual</Button>
                  </div>
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-[#1E2330]">
                        <th className="text-left py-2 px-2 text-xs text-[#6B7280] font-medium w-8">#</th>
                        <th className="text-left py-2 px-2 text-xs text-[#6B7280] font-medium w-28">SKU</th>
                        <th className="text-left py-2 px-2 text-xs text-[#6B7280] font-medium">Descripcion</th>
                        <th className="text-center py-2 px-2 text-xs text-[#6B7280] font-medium w-28">Cant.</th>
                        <th className="text-right py-2 px-2 text-xs text-[#6B7280] font-medium w-28">P. Unit.</th>
                        <th className="text-center py-2 px-2 text-xs text-[#6B7280] font-medium w-20">Dto %</th>
                        <th className="text-right py-2 px-2 text-xs text-[#6B7280] font-medium w-28">Subtotal</th>
                        <th className="text-left py-2 px-2 text-xs text-[#6B7280] font-medium w-32">Notas</th>
                        <th className="w-10 print:hidden"></th>
                      </tr>
                    </thead>
                    <tbody>
                      {items.map((item, idx) => {
                        const lineTotal = item.quantity * item.unitPrice * (1 - item.discount / 100)
                        // Check price minimum: find product in search results
                        const prod = productResults.find(p => p.id === item.product_id)
                        const minPrice = prod?.price_min ?? prod?.cost_eur ?? 0
                        const effectiveUnitPrice = item.unitPrice * (1 - item.discount / 100)
                        const isBelowMin = minPrice > 0 && effectiveUnitPrice < minPrice
                        const isService = prod?.product_type === 'service'
                        return (
                          <tr key={item.id} className={`border-b border-[#1E2330]/50 ${isBelowMin ? 'bg-red-500/5' : ''}`}>
                            <td className="py-2 px-2 text-xs text-[#4B5563]">
                              {idx + 1}
                              {isService && <span className="ml-1 text-[8px] text-blue-400" title="Servicio">S</span>}
                            </td>
                            <td className="py-2 px-2">
                              <div className="flex items-start gap-1.5">
                                {item.product_id ? (
                                  <span
                                    className="w-2 h-2 mt-1.5 rounded-full shrink-0 bg-emerald-400 print:hidden"
                                    title="Producto matcheado con el catálogo"
                                  />
                                ) : (
                                  <button
                                    type="button"
                                    onClick={(e) => {
                                      e.stopPropagation()
                                      setLinkingItemId(item.id)
                                      setProductSearch(item.sku || item.description.slice(0, 30))
                                      setProductResults([])
                                      setShowProductSearch(true)
                                    }}
                                    className="shrink-0 inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-red-500/15 hover:bg-red-500/30 border border-red-500/40 hover:border-red-500/70 text-red-400 hover:text-red-300 text-[10px] font-semibold print:hidden transition-all"
                                    title="SIN MATCH — click para vincular este SKU con un producto del catálogo. Se guarda como alias para futuras OCs del cliente."
                                  >
                                    🔗 Vincular
                                  </button>
                                )}
                                <div className="flex-1 min-w-0">
                                  <input value={item.sku} onChange={(e) => updateItem(item.id, 'sku', e.target.value)} className="w-full bg-transparent text-xs font-mono text-[#9CA3AF] outline-none" placeholder="SKU cliente" />
                                  {/* SKU del catálogo bajo el del cliente — solo si están vinculados y son distintos */}
                                  {item.product_id && (() => {
                                    const linked = linkedProducts.get(item.product_id)
                                    if (!linked || linked.sku === item.sku) return null
                                    return (
                                      <div className="text-[10px] font-mono text-emerald-400/80 truncate" title={`Catálogo: ${linked.sku} · ${linked.name}`}>
                                        → {linked.sku}
                                      </div>
                                    )
                                  })()}
                                </div>
                              </div>
                            </td>
                            <td className="py-2 px-2"><input value={item.description} onChange={(e) => updateItem(item.id, 'description', e.target.value)} className="w-full bg-transparent text-sm text-[#F0F2F5] outline-none" placeholder="Descripcion del producto" /></td>
                            <td className="py-2 px-2">
                              <div className="flex items-center justify-center gap-1">
                                <button onClick={() => updateQuantity(item.id, -1)} className="p-0.5 rounded hover:bg-[#1E2330] text-[#6B7280] print:hidden"><Minus size={12} /></button>
                                <input type="number" min="1" value={item.quantity} onChange={(e) => updateItem(item.id, 'quantity', Math.max(1, Number(e.target.value)))} className="w-12 bg-[#0F1218] border border-[#1E2330] rounded px-1 py-1 text-center text-sm text-[#F0F2F5] outline-none focus:border-[#FF6600]" />
                                <button onClick={() => updateQuantity(item.id, 1)} className="p-0.5 rounded hover:bg-[#1E2330] text-[#6B7280] print:hidden"><Plus size={12} /></button>
                              </div>
                            </td>
                            <td className="py-2 px-2 relative">
                              <input type="number" min="0" step="0.01" value={item.unitPrice} onChange={(e) => updateItem(item.id, 'unitPrice', Number(e.target.value))} className={`w-full bg-[#0F1218] border rounded px-2 py-1 text-right text-sm outline-none focus:border-[#FF6600] ${isBelowMin ? 'border-red-500 text-red-400' : 'border-[#1E2330] text-[#F0F2F5]'}`} />
                              {isBelowMin && <span className="absolute -bottom-3 right-1 text-[9px] text-red-400 whitespace-nowrap print:hidden" title={`Precio minimo: ${minPrice.toFixed(2)}`}>Min: {minPrice.toFixed(2)}</span>}
                            </td>
                            <td className="py-2 px-2"><input type="number" min="0" max="100" value={item.discount} onChange={(e) => updateItem(item.id, 'discount', Number(e.target.value))} className="w-full bg-[#0F1218] border border-[#1E2330] rounded px-2 py-1 text-center text-sm text-[#F0F2F5] outline-none focus:border-[#FF6600]" /></td>
                            <td className={`py-2 px-2 text-right text-sm font-medium ${isBelowMin ? 'text-red-400' : 'text-[#F0F2F5]'}`}>{formatCurrency(lineTotal, currency)}</td>
                            <td className="py-2 px-2">
                              <input
                                value={item.notes}
                                onChange={(e) => updateItem(item.id, 'notes', e.target.value)}
                                className={`w-full text-xs outline-none rounded px-2 py-1 transition-colors border ${
                                  item.notes
                                    ? 'bg-[#FF6600]/5 border-[#FF6600]/30 text-[#F0F2F5]'
                                    : 'bg-transparent border-dashed border-[#2A3040] text-[#6B7280] hover:border-[#FF6600]/50 hover:bg-[#FF6600]/5'
                                } focus:border-[#FF6600] focus:bg-[#FF6600]/5 focus:text-[#F0F2F5]`}
                                placeholder="+ Nota"
                                title="Nota visible al cliente en la línea del producto (ej: 'incluye flete', 'entrega 30 días', etc.)"
                              />
                            </td>
                            <td className="py-2 px-1 print:hidden"><button onClick={() => removeItem(item.id)} className="p-1 rounded hover:bg-red-500/10 text-[#4B5563] hover:text-red-400 transition-colors"><Trash2 size={14} /></button></td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Bottom: Notes + Totals */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <Card>
              <CardContent className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-[#9CA3AF] mb-1.5">Notas (visible al cliente)</label>
                  <textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={3} className="w-full rounded-lg bg-[#1E2330] border border-[#2A3040] px-3 py-2 text-sm text-[#F0F2F5] placeholder:text-[#4B5563] focus:outline-none focus:ring-2 focus:ring-orange-500/50 resize-none" placeholder="Notas para el cliente..." />
                </div>
                <div className="print:hidden">
                  <label className="block text-sm font-medium text-[#9CA3AF] mb-1.5">Notas internas (solo admin)</label>
                  <textarea value={internalNotes} onChange={(e) => setInternalNotes(e.target.value)} rows={2} className="w-full rounded-lg bg-[#1E2330] border border-[#2A3040] px-3 py-2 text-sm text-[#F0F2F5] placeholder:text-[#4B5563] focus:outline-none focus:ring-2 focus:ring-orange-500/50 resize-none" placeholder="Notas internas..." />
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <Select label="Incoterm" options={INCOTERMS.map((i) => ({ value: i, label: i }))} value={incoterm} onChange={(e) => setIncoterm(e.target.value)} placeholder="Seleccionar..." />
                  <Input label="Valido hasta" type="date" value={validUntil} onChange={(e) => setValidUntil(e.target.value)} />
                </div>
                <div className="grid grid-cols-3 gap-4">
                  <Select
                    label="Condicion de pago"
                    value={paymentTermsType}
                    onChange={(e) => {
                      const t = e.target.value as typeof paymentTermsType
                      setPaymentTermsType(t)
                      // Autocompletar texto descriptivo
                      if (t === 'contado') { setPaymentTerms('Contado'); setPaymentDays(0) }
                      else if (t === 'anticipado') { setPaymentTerms('Pago anticipado'); setPaymentDays(0) }
                      else if (t === 'dias_ff') { setPaymentTerms(`${paymentDays || 30} dias fecha factura`); if (!paymentDays) setPaymentDays(30) }
                      else if (t === 'dias_fv') { setPaymentTerms(`${paymentDays || 30} dias fecha vencimiento`); if (!paymentDays) setPaymentDays(30) }
                      else if (t === 'dias_fr') { setPaymentTerms(`${paymentDays || 30} dias fecha recepcion`); if (!paymentDays) setPaymentDays(30) }
                      else { setPaymentTerms('') }
                    }}
                    options={[
                      { value: 'contado', label: 'Contado' },
                      { value: 'anticipado', label: 'Pago anticipado' },
                      { value: 'dias_ff', label: 'X dias Fecha Factura' },
                      { value: 'dias_fv', label: 'X dias Fecha Vencimiento' },
                      { value: 'dias_fr', label: 'X dias Fecha Recepcion' },
                      { value: 'custom', label: 'Personalizado' },
                    ]}
                  />
                  {(paymentTermsType === 'dias_ff' || paymentTermsType === 'dias_fv' || paymentTermsType === 'dias_fr') && (
                    <Input
                      label="Dias"
                      type="number"
                      min={0}
                      value={paymentDays}
                      onChange={(e) => {
                        const n = Number(e.target.value) || 0
                        setPaymentDays(n)
                        const suffix = paymentTermsType === 'dias_ff' ? 'fecha factura'
                          : paymentTermsType === 'dias_fv' ? 'fecha vencimiento'
                          : 'fecha recepcion'
                        setPaymentTerms(`${n} dias ${suffix}`)
                      }}
                    />
                  )}
                  <Input
                    label="Detalle condicion (editable)"
                    value={paymentTerms}
                    onChange={(e) => { setPaymentTerms(e.target.value); setPaymentTermsType('custom') }}
                    placeholder="Ej: 50% anticipo + 50% 30d FF"
                  />
                </div>
              </CardContent>
            </Card>

            {/* ============ ADJUNTOS DE LA COTIZACIÓN ============ */}
            {currentQuoteId ? (
              <DocumentAttachments
                documentId={currentQuoteId}
                documentType="quote"
              />
            ) : (
              <div className="rounded-xl border border-dashed border-[#2A3040] bg-[#0F1218] p-4 text-center">
                <Paperclip size={20} className="mx-auto text-[#6B7280] mb-1.5" />
                <p className="text-xs text-[#9CA3AF]">
                  💡 Guardá la cotización para adjuntar la <span className="text-[#FF6600] font-semibold">OC del cliente</span>, pliegos, planos o especificaciones.
                </p>
              </div>
            )}

            <Card>
              <CardContent className="space-y-3">
                <div className="flex justify-between text-sm"><span className="text-[#6B7280]">Subtotal ({items.length} items)</span><span className="text-[#D1D5DB]">{formatCurrency(subtotal, currency)}</span></div>

                {/* IVA — toggle estilo IRPF / R.E. */}
                <div className="flex items-center justify-between text-sm">
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => setIvaEnabled(!ivaEnabled)}
                      className={`w-8 h-4 rounded-full transition-all relative shrink-0 ${ivaEnabled ? 'bg-emerald-500/40' : 'bg-[#2A3040]'}`}
                      title={ivaEnabled ? 'Desactivar IVA (cliente exento)' : 'Aplicar IVA'}
                    >
                      <div className={`w-3 h-3 rounded-full bg-white absolute top-0.5 transition-all ${ivaEnabled ? 'right-0.5' : 'left-0.5'}`} />
                    </button>
                    <span className={`${ivaEnabled ? 'text-emerald-400' : 'text-[#4B5563]'}`}>IVA</span>
                    {ivaEnabled && (
                      <>
                        <input
                          type="number"
                          value={taxRate}
                          onChange={(e) => setTaxRate(Number(e.target.value))}
                          className="w-14 bg-[#0F1218] border border-[#1E2330] rounded px-2 py-0.5 text-center text-xs text-[#F0F2F5] print:border-none"
                        />
                        <span className="text-xs text-[#6B7280]">%</span>
                      </>
                    )}
                  </div>
                  <span className={`${ivaEnabled ? 'text-[#D1D5DB]' : 'text-[#4B5563]'}`}>
                    {ivaEnabled ? formatCurrency(taxAmount, currency) : '— exento'}
                  </span>
                </div>

                {/* IRPF */}
                <div className="flex items-center justify-between text-sm">
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => setIrpfEnabled(!irpfEnabled)}
                      className={`w-8 h-4 rounded-full transition-all relative shrink-0 ${irpfEnabled ? 'bg-red-500/40' : 'bg-[#2A3040]'}`}
                      title={irpfEnabled ? 'Desactivar IRPF' : 'Aplicar IRPF'}
                    >
                      <div className={`w-3 h-3 rounded-full bg-white absolute top-0.5 transition-all ${irpfEnabled ? 'right-0.5' : 'left-0.5'}`} />
                    </button>
                    <span className={`${irpfEnabled ? 'text-red-400' : 'text-[#4B5563]'}`}>IRPF</span>
                    {irpfEnabled && (
                      <select
                        value={irpfRate}
                        onChange={(e) => setIrpfRate(Number(e.target.value))}
                        className="bg-[#0F1218] border border-[#1E2330] rounded px-1.5 py-0.5 text-xs text-[#F0F2F5] print:border-none"
                      >
                        <option value={0}>0%</option>
                        <option value={7}>7%</option>
                        <option value={15}>15%</option>
                        <option value={19}>19%</option>
                      </select>
                    )}
                  </div>
                  <span className={`${irpfEnabled ? 'text-red-400' : 'text-[#4B5563]'}`}>
                    {irpfEnabled ? `- ${formatCurrency(irpfAmount, currency)}` : '-'}
                  </span>
                </div>

                {/* Recargo de Equivalencia */}
                <div className="flex items-center justify-between text-sm">
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => setReEnabled(!reEnabled)}
                      className={`w-8 h-4 rounded-full transition-all relative shrink-0 ${reEnabled ? 'bg-blue-500/40' : 'bg-[#2A3040]'}`}
                      title={reEnabled ? 'Desactivar R.E.' : 'Aplicar Recargo Equivalencia'}
                    >
                      <div className={`w-3 h-3 rounded-full bg-white absolute top-0.5 transition-all ${reEnabled ? 'right-0.5' : 'left-0.5'}`} />
                    </button>
                    <span className={`${reEnabled ? 'text-blue-400' : 'text-[#4B5563]'}`}>R.E.</span>
                    {reEnabled && (
                      <select
                        value={reRate}
                        onChange={(e) => setReRate(Number(e.target.value))}
                        className="bg-[#0F1218] border border-[#1E2330] rounded px-1.5 py-0.5 text-xs text-[#F0F2F5] print:border-none"
                      >
                        <option value={0}>0%</option>
                        <option value={0.5}>0.5%</option>
                        <option value={1.4}>1.4%</option>
                        <option value={5.2}>5.2%</option>
                      </select>
                    )}
                  </div>
                  <span className={`${reEnabled ? 'text-blue-400' : 'text-[#4B5563]'}`}>
                    {reEnabled ? `+ ${formatCurrency(reAmount, currency)}` : '-'}
                  </span>
                </div>

                <div className="border-t border-[#1E2330] pt-3 flex justify-between">
                  <span className="text-lg font-semibold text-[#F0F2F5]">Total</span>
                  <span className="text-2xl font-bold text-[#FF6600]">{formatCurrency(total, currency)}</span>
                </div>
                <div className="flex gap-2 pt-2 print:hidden">
                  <Button variant="secondary" size="sm" className="flex-1" onClick={currentQuoteId ? downloadPdf : () => window.print()}><Printer size={14} /> PDF / Imprimir</Button>
                  <Button variant="secondary" size="sm" className="flex-1" onClick={currentQuoteId ? sendByWhatsApp : shareWhatsApp}><MessageSquare size={14} /> WhatsApp</Button>
                </div>
                {/* Warning: items below minimum price */}
                {items.some(item => {
                  const prod = productResults.find(p => p.id === item.product_id)
                  const min = prod?.price_min ?? prod?.cost_eur ?? 0
                  return min > 0 && item.unitPrice * (1 - item.discount / 100) < min
                }) && (
                  <div className="text-xs text-red-400 bg-red-500/10 border border-red-500/30 rounded px-3 py-2 mt-2 print:hidden">
                    ⚠️ Hay items con precio por debajo del minimo/costo. Revisa las lineas marcadas en rojo.
                  </div>
                )}
                {/* CTA contextual según estado */}
                {!currentQuoteId ? (
                  <Button variant="primary" className="w-full mt-2 print:hidden" onClick={saveQuote} loading={saving}>
                    <Save size={16} /> Guardar cotización
                  </Button>
                ) : quoteStatus === 'borrador' ? (
                  <div className="space-y-2 mt-2 print:hidden">
                    <Button variant="primary" className="w-full" onClick={openSendModal} loading={transitioning}>
                      <MessageSquare size={16} /> Enviar al cliente (Email · WhatsApp · PDF)
                    </Button>
                    <div className="grid grid-cols-2 gap-2">
                      <Button variant="secondary" size="sm" onClick={sendByEmail} disabled={transitioning}>Enviar por Email</Button>
                      <Button variant="ghost" size="sm" onClick={() => transitionStatus('enviada')} disabled={transitioning}>Marcar enviada</Button>
                    </div>
                  </div>
                ) : quoteStatus === 'enviada' ? (
                  <div className="grid grid-cols-2 gap-2 mt-2 print:hidden">
                    <Button variant="primary" onClick={() => transitionStatus('aceptada')} loading={transitioning}>
                      ✓ Aceptada
                    </Button>
                    <Button variant="secondary" onClick={() => transitionStatus('rechazada')} disabled={transitioning}>
                      Rechazada
                    </Button>
                  </div>
                ) : quoteStatus === 'aceptada' ? (
                  <Button variant="primary" className="w-full mt-2 print:hidden" onClick={convertToOrder} loading={transitioning}>
                    📦 Convertir en pedido
                  </Button>
                ) : quoteStatus === 'pedido' && createdOrder ? (
                  <div className="space-y-2 mt-2 print:hidden">
                    <Button variant="primary" className="w-full" onClick={() => router.push(`/ventas?tab=pedidos&highlight=${createdOrder.id}`)}>
                      📦 Ver pedido {createdOrder.number} →
                    </Button>
                    <Button variant="ghost" className="w-full" onClick={() => {
                      setItems([]); setNotes(''); setInternalNotes(''); setSelectedClient(null)
                      setIvaEnabled(true); setTaxRate(21); setIrpfEnabled(false); setIrpfRate(0)
                      setReEnabled(false); setReRate(0); setOcImportSource(null)
                      setCurrentQuoteId(null); setQuoteStatus(null); setCreatedOrder(null); generateQuoteNumber()
                    }}>
                      <PlusCircle size={16} /> Nueva cotización
                    </Button>
                  </div>
                ) : (
                  <Button variant="secondary" className="w-full mt-2 print:hidden" onClick={() => {
                    setItems([]); setNotes(''); setInternalNotes(''); setSelectedClient(null)
                    setIvaEnabled(true); setTaxRate(21); setIrpfEnabled(false); setIrpfRate(0)
                    setReEnabled(false); setReRate(0); setOcImportSource(null)
                    setCurrentQuoteId(null); setQuoteStatus(null); setCreatedOrder(null); generateQuoteNumber()
                  }}>
                    <PlusCircle size={16} /> Nueva cotización
                  </Button>
                )}
              </CardContent>
            </Card>
          </div>
        </>
      )}

      {/* Product Search Modal */}
      <Modal
        isOpen={showProductSearch}
        onClose={() => { setShowProductSearch(false); setProductSearch(''); setProductResults([]); setLinkingItemId(null) }}
        title={linkingItemId ? `Vincular SKU "${items.find((i) => i.id === linkingItemId)?.sku || ''}" con producto del catálogo` : 'Buscar Producto'}
        size="lg"
      >
        <SearchBar placeholder="Buscar por SKU, nombre, marca..." value={productSearch} onChange={setProductSearch} autoFocus className="mb-4" />
        {searchingProducts && <div className="flex items-center justify-center py-8"><Loader2 size={24} className="animate-spin text-[#FF6600]" /></div>}
        {!searchingProducts && productResults.length === 0 && productSearch && <p className="text-sm text-[#4B5563] text-center py-8">No se encontraron productos</p>}
        <div className="space-y-1 max-h-[400px] overflow-y-auto">
          {productResults.map((p) => (
            <button key={p.id} onClick={() => addProductAsItem(p)} className="w-full text-left flex items-center justify-between p-3 rounded-lg hover:bg-[#1E2330] transition-colors">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded bg-[#0F1218] border border-[#1E2330] flex items-center justify-center shrink-0 overflow-hidden">
                  {p.image_url ? <img src={p.image_url} alt="" referrerPolicy="no-referrer" className="w-full h-full object-contain" /> : <FileText size={14} className="text-[#2A3040]" />}
                </div>
                <div>
                  <p className="text-xs font-mono text-[#6B7280]">{p.sku}</p>
                  <p className="text-sm text-[#F0F2F5]">{p.name}</p>
                  <Badge variant="default" className="mt-0.5">{p.brand}</Badge>
                </div>
              </div>
              <span className="text-sm font-bold text-[#FF6600] shrink-0 ml-3">{p.price_eur > 0 ? formatCurrency(p.price_eur, 'EUR') : 'Consultar'}</span>
            </button>
          ))}
        </div>
      </Modal>

      {/* ══════════════════════════════════════════════════════════════
          Sprint 1 — Importar OC del cliente como entrada de cotización
          ══════════════════════════════════════════════════════════════ */}
      {activeCompanyId && (
        <OCParserModal
          open={ocParserOpen}
          onClose={() => setOcParserOpen(false)}
          companyId={activeCompanyId}
          clientId={selectedClient?.id}
          onParsed={(result) => { void handleOCParsed(result) }}
        />
      )}

      {/* Modal "Nuevo contacto" — crear contacto on-the-fly desde el cotizador */}
      <Modal
        isOpen={showNewContactModal}
        onClose={() => setShowNewContactModal(false)}
        title={`Nuevo contacto para ${selectedClient?.legal_name || selectedClient?.name || 'cliente'}`}
        size="md"
      >
        <div className="space-y-3">
          <Input
            label="Nombre completo *"
            value={newContactDraft.name}
            onChange={(e) => setNewContactDraft((d) => ({ ...d, name: e.target.value }))}
            placeholder="Ej: Ana Capatano"
            autoFocus
          />
          <Input
            label="Cargo / Posición"
            value={newContactDraft.position}
            onChange={(e) => setNewContactDraft((d) => ({ ...d, position: e.target.value }))}
            placeholder="Ej: Compras"
          />
          <Input
            label="Email"
            type="email"
            value={newContactDraft.email}
            onChange={(e) => setNewContactDraft((d) => ({ ...d, email: e.target.value }))}
            placeholder="ana@empresa.com"
          />
          <Input
            label="Teléfono / WhatsApp"
            value={newContactDraft.phone}
            onChange={(e) => setNewContactDraft((d) => ({ ...d, phone: e.target.value }))}
            placeholder="+598 ..."
          />
          <div className="flex justify-end gap-2 pt-2 border-t border-[#1E2330]">
            <Button variant="secondary" onClick={() => setShowNewContactModal(false)} disabled={savingContact}>
              Cancelar
            </Button>
            <Button
              variant="primary"
              loading={savingContact}
              disabled={!newContactDraft.name.trim() || !selectedClient?.id}
              onClick={async () => {
                if (!selectedClient?.id || !newContactDraft.name.trim()) return
                setSavingContact(true)
                const sb = createClient()
                try {
                  const { data, error } = await sb.from('tt_client_contacts').insert({
                    client_id: selectedClient.id,
                    name: newContactDraft.name.trim(),
                    position: newContactDraft.position.trim() || null,
                    email: newContactDraft.email.trim() || null,
                    phone: newContactDraft.phone.trim() || null,
                    is_primary: clientContacts.length === 0,
                    receives_quotes: true,
                    receives_invoices: false,
                    receives_remitos: false,
                    is_collections: false,
                    active: true,
                  }).select('id, name, position, email, phone, whatsapp, is_primary, receives_quotes').single()
                  if (error) throw error
                  const created = data as ContactLite
                  setClientContacts((prev) => [...prev, created])
                  setParticipatingContactIds((prev) => [...prev, created.id])
                  addToast({ type: 'success', title: `Contacto "${created.name}" agregado y marcado como participante` })
                  setShowNewContactModal(false)
                } catch (err) {
                  addToast({ type: 'error', title: 'No se pudo crear el contacto', message: (err as Error).message })
                } finally {
                  setSavingContact(false)
                }
              }}
            >
              <Plus size={14} /> Crear y marcar
            </Button>
          </div>
        </div>
      </Modal>

      {/* FASE 0 — Confirmación humana post-envío WhatsApp.
          Reemplaza el auto-marca a 'enviada' al click del botón WA. */}
      <SendConfirmationModal
        isOpen={showSendConfirmation}
        onClose={() => setShowSendConfirmation(false)}
        onConfirmed={handleWhatsAppConfirmed}
        onDeclined={() => setShowSendConfirmation(false)}
        channel="whatsapp"
        documentLabel="Cotizacion"
        documentNumber={quoteNumber}
        recipientHint={selectedClient?.legal_name || selectedClient?.name || undefined}
        confirming={transitioning}
      />

      {/* Modal de envío estilo StelOrder: form de email + preview del PDF en split-screen.
          Solo se abre cuando hay currentQuoteId (cotización ya guardada). */}
      {currentQuoteId && (
        <SendDocumentModal
          isOpen={showSendModal}
          onClose={() => setShowSendModal(false)}
          documentType="coti"
          documentNumber={quoteNumber}
          documentId={currentQuoteId}
          clientName={selectedClient?.legal_name || selectedClient?.name || ''}
          clientEmail={(selectedClient as Client & { email?: string })?.email || ''}
          extraRecipients={clientContacts
            .filter((c) => participatingContactIds.includes(c.id) && c.email && c.email.includes('@'))
            .map((c) => ({ email: c.email!, name: c.name }))}
          clientId={selectedClient?.id}
          total={total}
          currency={currency}
          items={items.map((it) => ({
            sku: it.sku,
            description: it.description,
            quantity: it.quantity,
            unit_price: it.unitPrice,
            discount_pct: it.discount,
            subtotal: it.quantity * it.unitPrice * (1 - it.discount / 100),
            notes: it.notes,
          }))}
          document={{
            type: 'coti',
            display_ref: quoteNumber,
            system_code: quoteNumber,
            status: quoteStatus || 'borrador',
            currency: currency,
            subtotal: subtotal,
            tax_amount: taxAmount,
            tax_rate: ivaEnabled ? taxRate : 0,
            total: total,
            notes: notes,
            created_at: new Date().toISOString(),
            valid_until: validUntil,
            incoterm: incoterm,
            payment_terms: paymentTerms,
          }}
          client={selectedClient ? {
            name: selectedClient.name,
            legal_name: selectedClient.legal_name,
            tax_id: selectedClient.tax_id,
            email: (selectedClient as Client & { email?: string })?.email || null,
            phone: (selectedClient as Client & { phone?: string })?.phone || null,
            country: selectedClient.country,
          } : undefined}
          company={(() => {
            const c = companies.find((c) => c.id === selectedCompanyId)
            if (!c) return undefined
            return {
              name: c.name,
              tax_id: (c as Company & { tax_id?: string })?.tax_id,
              country: c.country,
            }
          })()}
          onSent={() => {
            // Al confirmar el envío desde el modal, marcamos la cotización
            // como enviada automáticamente (a diferencia de wa.me que pide
            // confirmación manual via SendConfirmationModal).
            if (quoteStatus === 'borrador') void transitionStatus('enviada')
          }}
        />
      )}
    </div>
  )
}
