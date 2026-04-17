'use client'

import { useEffect, useState, useRef, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { useCompanyContext } from '@/lib/company-context'
import {
  Search, FileText, Users, Package, ShoppingCart, Wrench, Banknote,
  Plus, ArrowRight, Sparkles, Target, CreditCard, Building2,
  Clock, Filter,
} from 'lucide-react'

interface CmdItem {
  id: string
  type: 'nav' | 'action' | 'client' | 'product' | 'document' | 'lead'
  label: string
  subtitle?: string
  icon: React.ReactNode
  onSelect: () => void
  keywords?: string
}

/**
 * Command Palette — Cmd+K / Ctrl+K
 * Acceso rápido a: navegación, acciones comunes, búsqueda de clientes/productos/docs.
 */
export function CommandPalette() {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [active, setActive] = useState(0)
  const [results, setResults] = useState<CmdItem[]>([])
  const [searching, setSearching] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)
  const listRef = useRef<HTMLDivElement>(null)
  const router = useRouter()
  const { activeCompanyId } = useCompanyContext()
  const supabase = createClient()

  // Hotkey global
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault()
        setOpen((o) => !o)
      }
      if (e.key === 'Escape') setOpen(false)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  // Focus input al abrir
  useEffect(() => {
    if (open) {
      setTimeout(() => inputRef.current?.focus(), 50)
      setQuery('')
      setActive(0)
    }
  }, [open])

  // Items estáticos (navegación + acciones)
  const staticItems: CmdItem[] = [
    // Navegación
    { id: 'nav-dashboard', type: 'nav', label: 'Ir a Dashboard', icon: <Building2 className="w-4 h-4" />, onSelect: () => router.push('/dashboard'), keywords: 'home inicio' },
    { id: 'nav-cotizador', type: 'nav', label: 'Ir a Cotizador', icon: <FileText className="w-4 h-4" />, onSelect: () => router.push('/cotizador'), keywords: 'cotizacion presupuesto' },
    { id: 'nav-ventas', type: 'nav', label: 'Ir a Ventas', icon: <CreditCard className="w-4 h-4" />, onSelect: () => router.push('/ventas'), keywords: 'facturas pedidos' },
    { id: 'nav-compras', type: 'nav', label: 'Ir a Compras', icon: <ShoppingCart className="w-4 h-4" />, onSelect: () => router.push('/compras'), keywords: 'proveedores oc' },
    { id: 'nav-crm', type: 'nav', label: 'Ir a CRM Pipeline', icon: <Target className="w-4 h-4" />, onSelect: () => router.push('/crm?tab=pipeline'), keywords: 'oportunidades' },
    { id: 'nav-leads', type: 'nav', label: 'Ir a Leads IA', icon: <Sparkles className="w-4 h-4" />, onSelect: () => router.push('/crm/leads'), keywords: 'prospects' },
    { id: 'nav-clientes', type: 'nav', label: 'Ir a Clientes', icon: <Users className="w-4 h-4" />, onSelect: () => router.push('/clientes') },
    { id: 'nav-productos', type: 'nav', label: 'Ir a Catálogo', icon: <Package className="w-4 h-4" />, onSelect: () => router.push('/catalogo'), keywords: 'productos' },
    { id: 'nav-stock', type: 'nav', label: 'Ir a Stock', icon: <Package className="w-4 h-4" />, onSelect: () => router.push('/stock'), keywords: 'inventario almacen' },
    { id: 'nav-cobros', type: 'nav', label: 'Ir a Cobros', icon: <Banknote className="w-4 h-4" />, onSelect: () => router.push('/cobros'), keywords: 'conciliacion bancaria' },
    { id: 'nav-importar-oc', type: 'nav', label: 'Importar OC de cliente', icon: <FileText className="w-4 h-4" />, onSelect: () => router.push('/ventas/importar-oc'), keywords: 'orden compra' },
    { id: 'nav-sat', type: 'nav', label: 'Ir a SAT', icon: <Wrench className="w-4 h-4" />, onSelect: () => router.push('/sat'), keywords: 'servicio tecnico mantenimiento' },
    { id: 'nav-diagnostico', type: 'nav', label: 'Diagnóstico del sistema', icon: <Filter className="w-4 h-4" />, onSelect: () => router.push('/admin/diagnostico') },
    { id: 'nav-migration', type: 'nav', label: 'Migración StelOrder', icon: <ArrowRight className="w-4 h-4" />, onSelect: () => router.push('/admin/migration') },

    // Acciones rápidas
    { id: 'act-new-quote', type: 'action', label: 'Nueva cotización', icon: <Plus className="w-4 h-4" />, onSelect: () => router.push('/cotizador') },
    { id: 'act-new-lead', type: 'action', label: 'Nuevo lead', icon: <Plus className="w-4 h-4" />, onSelect: () => router.push('/crm/leads?new=1') },
    { id: 'act-new-invoice', type: 'action', label: 'Nueva factura', icon: <Plus className="w-4 h-4" />, onSelect: () => router.push('/ventas?tab=facturas&new=1') },
    { id: 'act-new-bank', type: 'action', label: 'Subir extracto bancario', icon: <Plus className="w-4 h-4" />, onSelect: () => router.push('/cobros') },
  ]

  // Búsqueda dinámica (clientes/productos/docs/leads)
  const runSearch = useCallback(async (q: string) => {
    if (!q.trim() || q.length < 2) {
      setResults(staticItems.filter((i) =>
        !q || i.label.toLowerCase().includes(q.toLowerCase()) || i.keywords?.toLowerCase().includes(q.toLowerCase())
      ))
      return
    }
    setSearching(true)
    const like = `%${q}%`

    const [clientsRes, productsRes, docsRes, leadsRes] = await Promise.all([
      supabase.from('tt_clients').select('id, name, tax_id, email').or(`name.ilike.${like},tax_id.ilike.${like},email.ilike.${like}`).limit(5),
      supabase.from('tt_products').select('id, sku, name, price_eur').or(`name.ilike.${like},sku.ilike.${like}`).limit(5),
      supabase.from('tt_documents').select('id, type, legal_number, system_code, total, client:tt_clients(name)').or(`legal_number.ilike.${like},system_code.ilike.${like}`).limit(5),
      supabase.from('tt_leads').select('id, name, company_name, ai_temperature').or(`name.ilike.${like},company_name.ilike.${like}`).limit(5),
    ])

    const dynamic: CmdItem[] = []

    // Clientes
    for (const c of (clientsRes.data || []) as any[]) {
      dynamic.push({
        id: `cli-${c.id}`,
        type: 'client',
        label: c.name,
        subtitle: [c.tax_id, c.email].filter(Boolean).join(' · '),
        icon: <Users className="w-4 h-4" />,
        onSelect: () => router.push(`/clientes/${c.id}`),
      })
    }

    // Productos
    for (const p of (productsRes.data || []) as any[]) {
      dynamic.push({
        id: `prod-${p.id}`,
        type: 'product',
        label: p.name,
        subtitle: [p.sku, p.price_eur ? `€ ${p.price_eur}` : ''].filter(Boolean).join(' · '),
        icon: <Package className="w-4 h-4" />,
        onSelect: () => router.push(`/catalogo?product=${p.id}`),
      })
    }

    // Documentos
    for (const d of (docsRes.data || []) as any[]) {
      dynamic.push({
        id: `doc-${d.id}`,
        type: 'document',
        label: d.legal_number || d.system_code || 'Sin código',
        subtitle: [d.type?.toUpperCase(), d.client?.name, d.total ? `$${d.total}` : ''].filter(Boolean).join(' · '),
        icon: <FileText className="w-4 h-4" />,
        onSelect: () => {
          const route = d.type === 'cotizacion' ? '/cotizador'
            : d.type === 'factura' ? '/ventas?tab=facturas'
            : d.type === 'pedido' ? '/ventas?tab=pedidos'
            : d.type === 'albaran' ? '/ventas?tab=albaranes'
            : '/ventas'
          router.push(route)
        },
      })
    }

    // Leads
    for (const l of (leadsRes.data || []) as any[]) {
      dynamic.push({
        id: `lead-${l.id}`,
        type: 'lead',
        label: l.name,
        subtitle: [l.company_name, l.ai_temperature].filter(Boolean).join(' · '),
        icon: <Sparkles className="w-4 h-4" />,
        onSelect: () => router.push(`/crm/leads`),
      })
    }

    // Filtrar items estáticos por query también
    const staticFiltered = staticItems.filter((i) =>
      i.label.toLowerCase().includes(q.toLowerCase()) ||
      i.keywords?.toLowerCase().includes(q.toLowerCase())
    )

    setResults([...dynamic, ...staticFiltered])
    setSearching(false)
  }, [supabase, router])

  // Debounce search
  useEffect(() => {
    const t = setTimeout(() => runSearch(query), 200)
    return () => clearTimeout(t)
  }, [query, runSearch])

  // Navegación con teclado
  function onKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setActive((a) => Math.min(a + 1, results.length - 1))
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setActive((a) => Math.max(a - 1, 0))
    } else if (e.key === 'Enter') {
      e.preventDefault()
      const item = results[active]
      if (item) {
        item.onSelect()
        setOpen(false)
      }
    }
  }

  // Scroll el item activo
  useEffect(() => {
    if (listRef.current) {
      const el = listRef.current.querySelector(`[data-idx="${active}"]`) as HTMLElement
      if (el) el.scrollIntoView({ block: 'nearest' })
    }
  }, [active])

  if (!open) return null

  return (
    <div
      className="fixed inset-0 z-[100] flex items-start justify-center p-4 pt-[10vh]"
      style={{ background: 'rgba(0,0,0,0.7)', backdropFilter: 'blur(4px)' }}
      onClick={() => setOpen(false)}
    >
      <div
        className="w-full max-w-xl rounded-xl shadow-2xl overflow-hidden border"
        style={{ background: '#0F1218', borderColor: '#2A3040' }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-2 px-3 py-2.5 border-b" style={{ borderColor: '#2A3040' }}>
          <Search className="w-4 h-4 opacity-60" />
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => { setQuery(e.target.value); setActive(0) }}
            onKeyDown={onKeyDown}
            placeholder="Buscá clientes, productos, documentos, leads o acciones..."
            className="flex-1 bg-transparent outline-none text-sm"
          />
          {searching && <Clock className="w-3 h-3 opacity-60 animate-spin" />}
          <kbd className="text-[10px] opacity-60 border px-1.5 py-0.5 rounded" style={{ borderColor: '#2A3040' }}>Esc</kbd>
        </div>

        <div ref={listRef} className="max-h-[60vh] overflow-y-auto">
          {results.length === 0 ? (
            <div className="p-6 text-center opacity-60 text-sm">Sin resultados para "{query}"</div>
          ) : (
            <div>
              {groupByType(results).map((group) => (
                <div key={group.type}>
                  <div className="text-[10px] font-semibold uppercase opacity-60 px-3 pt-2 pb-1">
                    {groupLabel(group.type)}
                  </div>
                  {group.items.map((item, i) => {
                    const globalIdx = results.indexOf(item)
                    return (
                      <button
                        key={item.id}
                        data-idx={globalIdx}
                        onClick={() => { item.onSelect(); setOpen(false) }}
                        onMouseEnter={() => setActive(globalIdx)}
                        className="w-full flex items-center gap-3 px-3 py-2 text-left text-sm"
                        style={{
                          background: globalIdx === active ? 'rgba(249,115,22,0.15)' : 'transparent',
                          borderLeft: globalIdx === active ? '2px solid #f97316' : '2px solid transparent',
                        }}
                      >
                        <span className="opacity-70">{item.icon}</span>
                        <div className="flex-1 min-w-0">
                          <div className="truncate">{item.label}</div>
                          {item.subtitle && <div className="text-xs opacity-60 truncate">{item.subtitle}</div>}
                        </div>
                        {globalIdx === active && <ArrowRight className="w-3.5 h-3.5 opacity-60" />}
                      </button>
                    )
                  })}
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="flex items-center justify-between px-3 py-2 text-[10px] opacity-60 border-t" style={{ borderColor: '#2A3040' }}>
          <span>↑↓ navegar · Enter seleccionar · Esc cerrar</span>
          <span>{results.length} resultado{results.length !== 1 ? 's' : ''}</span>
        </div>
      </div>
    </div>
  )
}

function groupByType(items: CmdItem[]) {
  const order: CmdItem['type'][] = ['action', 'client', 'document', 'lead', 'product', 'nav']
  const groups: Record<string, CmdItem[]> = {}
  for (const it of items) {
    if (!groups[it.type]) groups[it.type] = []
    groups[it.type].push(it)
  }
  return order.filter((t) => groups[t]?.length).map((t) => ({ type: t, items: groups[t] }))
}

function groupLabel(t: string) {
  return ({
    action: '⚡ Acciones rápidas',
    client: '👥 Clientes',
    document: '📄 Documentos',
    lead: '✨ Leads',
    product: '📦 Productos',
    nav: '🧭 Navegación',
  } as any)[t] || t
}
