/* eslint-disable @next/next/no-img-element */
// ============================================================================
// Buscador de productos — estilo SPEEDRILL/APEX, rediseño visual (dark) aprobado.
// Ruta: /buscador · usa tt_products via /api/products/search (datos reales).
// ----------------------------------------------------------------------------
//   - Vistas Catálogo (cards) / Tabla
//   - Filtros compactos (dropdowns desde facetas con counts) + chips activos
//   - Comparación visual seleccionable (atributos/precios, resalta diferencias)
//   - Detalle con foto + diagrama técnico + galería + specs + hoja de catálogo
// Stock y asesor IA: versión interna (necesitan empresa/login), próximo paso.
// ============================================================================
'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { LayoutGrid, Table2, GitCompare, Check, X, Search, Link2, Plus, Bot, Sparkles, ChevronRight, TrendingUp, Users, Package2 } from 'lucide-react'

type Product = {
  id: string
  sku: string
  name: string
  brand: string | null
  category: string | null
  subcategory: string | null
  encastre: string | null
  modelo: string | null
  price_eur: number | null
  price_usd: number | null
  price_ars: number | null
  torque_min: number | null
  torque_max: number | null
  rpm: string | null
  image_url: string | null
  diagram_url: string | null
  gallery_urls: Array<{ url: string; alt?: string; sort_order?: number }>
  specs: Record<string, unknown> | null
  family_id: string | null
}
type FacetItem = { value: string; count: number }
type Facets = { brand: FacetItem[]; category: FacetItem[]; encastre: FacetItem[] }
type ApiResponse = { total: number; items: Product[]; facets: Facets }

type AiClient = { client_name: string; last_doc_date: string; purchase_count: number; last_price: number; currency: string }
type AiCoProduct = { sku: string; description: string; co_count: number }
type AiPricePoint = { date: string; unit_price: number; currency: string; client_name: string }
type AiInsightResult = {
  catalogFound: boolean
  product: { id: string; sku: string; name: string; brand: string | null; price_eur: number | null } | null
  clients: AiClient[]
  coProducts: AiCoProduct[]
  priceHistory: AiPricePoint[]
  aiSummary: string
}

const T = { bg: '#0B0E13', surface: '#141820', card: '#1A1F29', border: '#2A3040', accent: '#FF6600', text: '#F0F2F5', soft: '#9CA3AF', muted: '#6B7280' }

const fmtEur = (v: number | null) => (v ? `€ ${v.toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : '—')
const fmt = (v: number | null, sym: string) => (v ? `${sym} ${v.toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : '—')
const spec = (p: Product, k: string): string => {
  const v = p.specs?.[k]
  return v == null || v === '' || v === '-' ? '' : String(v)
}
const huella = (p: Product) => spec(p, 'drive')
const medida = (p: Product) => spec(p, 'medida_display') || spec(p, 'medida')
const largo = (p: Product) => { const l = spec(p, 'largo'); return l ? `${l}mm` : '' }
const categoria = (p: Product) => p.category || p.subcategory || spec(p, 'subcategoria') || '—'
const torque = (p: Product) => (p.torque_min || p.torque_max) ? `${p.torque_min ?? '—'}–${p.torque_max ?? '—'} Nm` : ''

const PLACEHOLDER =
  'data:image/svg+xml;utf8,' +
  encodeURIComponent(
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 120 120"><rect width="120" height="120" fill="#1A1F29"/><path d="M30 45h60v40H30z" fill="none" stroke="#3a4150" stroke-width="2"/><circle cx="48" cy="60" r="7" fill="#3a4150"/><path d="M30 80l18-18 12 12 16-20 14 26" fill="none" stroke="#3a4150" stroke-width="2"/></svg>`
  )

const COL_ATTRS: { label: string; get: (p: Product) => string }[] = [
  { label: 'Marca', get: (p) => p.brand || '—' },
  { label: 'Categoría', get: categoria },
  { label: 'Encastre', get: (p) => p.encastre || '—' },
  { label: 'Huella', get: (p) => huella(p) || '—' },
  { label: 'Medida', get: (p) => medida(p) || '—' },
  { label: 'Largo', get: (p) => largo(p) || '—' },
]

function Img({ p, className }: { p: Product; className?: string }) {
  return <img src={p.image_url || p.diagram_url || PLACEHOLDER} alt={p.name} className={className} referrerPolicy="no-referrer" onError={(e) => { (e.target as HTMLImageElement).src = PLACEHOLDER }} />
}

function CompactSelect({ value, onChange, placeholder, items }: { value: string | null; onChange: (v: string | null) => void; placeholder: string; items: FacetItem[] }) {
  return (
    <select value={value ?? ''} onChange={(e) => onChange(e.target.value || null)}
      className="rounded-lg px-2.5 py-1.5 text-xs outline-none cursor-pointer max-w-[180px]"
      style={{ background: value ? `${T.accent}22` : T.bg, color: value ? T.accent : T.soft, border: `1px solid ${value ? T.accent : T.border}` }}>
      <option value="">{placeholder}</option>
      {items.map((i) => <option key={i.value} value={i.value} style={{ background: T.bg, color: T.text }}>{i.value} ({i.count})</option>)}
    </select>
  )
}

export default function BuscadorPage() {
  const [q, setQ] = useState('')
  const [brand, setBrand] = useState<string | null>(null)
  const [category, setCategory] = useState<string | null>(null)
  const [encastre, setEncastre] = useState<string | null>(null)
  const [view, setView] = useState<'catalogo' | 'tabla'>('catalogo')
  const [data, setData] = useState<ApiResponse | null>(null)
  const [loading, setLoading] = useState(false)
  const [detail, setDetail] = useState<Product | null>(null)
  const [selected, setSelected] = useState<string[]>([])
  const [comparing, setComparing] = useState(false)
  const [aiOpen, setAiOpen] = useState(false)
  const [aiInputQuery, setAiInputQuery] = useState('')
  const [aiLoading, setAiLoading] = useState(false)
  const [aiResult, setAiResult] = useState<AiInsightResult | null>(null)
  const [aiError, setAiError] = useState<string | null>(null)
  const abortRef = useRef<AbortController | null>(null)

  async function queryInsight(q: string) {
    if (!q.trim()) return
    setAiLoading(true)
    setAiError(null)
    setAiResult(null)
    try {
      const res = await fetch('/api/catalog/product-insight', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query: q }),
      })
      const json = (await res.json()) as AiInsightResult & { error?: string }
      if (res.status === 401) {
        setAiError('no_auth')
      } else if (!res.ok) {
        setAiError(json.error || 'Error al consultar')
      } else {
        setAiResult(json)
      }
    } catch (err) {
      setAiError((err as Error).message)
    }
    setAiLoading(false)
  }

  const fetchData = useCallback(async () => {
    abortRef.current?.abort()
    const ctl = new AbortController()
    abortRef.current = ctl
    setLoading(true)
    try {
      const p = new URLSearchParams()
      if (q) p.set('q', q)
      if (brand) p.set('brand', brand)
      if (category) p.set('category', category)
      if (encastre) p.set('encastre', encastre)
      p.set('limit', '60')
      const res = await fetch(`/api/products/search?${p.toString()}`, { signal: ctl.signal })
      setData((await res.json()) as ApiResponse)
    } catch (e) {
      if ((e as Error).name !== 'AbortError') console.error(e)
    } finally { setLoading(false) }
  }, [q, brand, category, encastre])

  useEffect(() => { const t = setTimeout(fetchData, 180); return () => clearTimeout(t) }, [fetchData])

  const items = data?.items || []
  const selectedProducts = items.filter((p) => selected.includes(p.id))
  const allVisibleSelected = items.length > 0 && items.every((p) => selected.includes(p.id))
  const someVisibleSelected = items.some((p) => selected.includes(p.id))
  const hasFilters = !!(brand || category || encastre || q)

  function toggle(id: string) { setSelected((prev) => prev.includes(id) ? prev.filter((s) => s !== id) : [...prev, id]) }
  function toggleAll() { setSelected(allVisibleSelected ? [] : items.map((p) => p.id)) }
  function clearAll() { setBrand(null); setCategory(null); setEncastre(null); setQ('') }

  return (
    <div style={{ background: T.bg, minHeight: '100vh', color: T.text }}>
      <div className="max-w-6xl mx-auto px-4 py-6">
        {/* Header */}
        <div className="flex items-center justify-between mb-1">
          <h1 className="text-2xl font-bold">Catálogo de productos</h1>
          <span className="text-xs" style={{ color: T.soft }}>{loading ? 'Buscando…' : `${data?.total ?? 0} productos`}</span>
        </div>
        <p className="text-sm mb-4" style={{ color: T.soft }}>Buscador visual de productos</p>

        {/* Buscador */}
        <div className="flex items-center gap-2 rounded-xl px-3 py-2 mb-3" style={{ background: T.surface, border: `1px solid ${T.border}` }}>
          <Search className="w-4 h-4 shrink-0" style={{ color: T.muted }} />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar por SKU, nombre, marca…"
            className="flex-1 min-w-0 bg-transparent text-sm outline-none" style={{ color: T.text }} />
        </div>

        {/* Asesor IA — botón de acceso rápido */}
        <button
          type="button"
          onClick={() => setAiOpen(true)}
          className="w-full flex items-center gap-2.5 px-3 py-2 rounded-xl text-sm mb-3 transition-colors hover:opacity-90"
          style={{ background: 'linear-gradient(135deg, #1A1F29, #1F2535)', border: `1px solid #FF660044`, color: T.soft }}
        >
          <Bot className="w-4 h-4 shrink-0" style={{ color: '#FF6600' }} />
          <span style={{ color: T.soft }}>Consultá el asesor IA sobre cualquier producto…</span>
          <span className="ml-auto text-[10px] font-semibold px-2 py-0.5 rounded-full" style={{ background: '#FF660020', color: '#FF6600' }}>IA</span>
        </button>

        {/* Filtros compactos + toggle de vista */}
        <div className="flex flex-wrap items-center gap-2 mb-3">
          <CompactSelect value={brand} onChange={setBrand} placeholder="Marca" items={data?.facets.brand || []} />
          <CompactSelect value={category} onChange={setCategory} placeholder="Categoría" items={data?.facets.category || []} />
          <CompactSelect value={encastre} onChange={setEncastre} placeholder="Encastre" items={data?.facets.encastre || []} />
          {hasFilters && <button type="button" onClick={clearAll} className="text-[11px] px-2 py-1 rounded-lg" style={{ color: T.soft, border: `1px solid ${T.border}` }}>Limpiar</button>}
          <div className="ml-auto flex rounded-lg overflow-hidden" style={{ border: `1px solid ${T.border}` }}>
            {([['catalogo', LayoutGrid, 'Catálogo'], ['tabla', Table2, 'Tabla']] as const).map(([id, Icon, label]) => (
              <button key={id} type="button" onClick={() => setView(id)} className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold"
                style={{ background: view === id ? T.accent : 'transparent', color: view === id ? 'white' : T.soft }}>
                <Icon className="w-3.5 h-3.5" /> {label}
              </button>
            ))}
          </div>
        </div>

        {items.length === 0 && !loading ? (
          <div className="rounded-xl border border-dashed p-10 text-center text-sm" style={{ borderColor: T.border, color: T.muted }}>
            No encontramos productos con esos filtros. Probá aflojar la búsqueda.
          </div>
        ) : view === 'catalogo' ? (
          /* CATÁLOGO */
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
            {items.map((p) => {
              const sel = selected.includes(p.id)
              return (
                <div key={p.id} onClick={() => setDetail(p)} className="group rounded-2xl overflow-hidden transition-all hover:-translate-y-1 cursor-pointer relative" style={{ background: T.card, border: `1px solid ${sel ? T.accent : T.border}` }}>
                  <button type="button" onClick={(e) => { e.stopPropagation(); toggle(p.id) }} title="Comparar" className="absolute top-2 left-2 z-10 w-5 h-5 rounded flex items-center justify-center" style={{ background: sel ? T.accent : 'rgba(0,0,0,0.5)', border: `1px solid ${sel ? T.accent : T.border}` }}>
                    {sel && <Check className="w-3.5 h-3.5 text-white" />}
                  </button>
                  <div className="w-full flex items-center justify-center" style={{ aspectRatio: '4 / 3', background: '#fff' }}>
                    <Img p={p} className="max-h-full max-w-full object-contain p-2" />
                  </div>
                  <div className="p-3">
                    <div className="flex items-center justify-between mb-1">
                      {p.brand && <span className="rounded-md px-2 py-0.5 text-[10px] font-bold" style={{ background: T.surface, color: T.soft, border: `1px solid ${T.border}` }}>{p.brand}</span>}
                      <span className="font-mono text-[10px]" style={{ color: T.accent }}>{p.sku}</span>
                    </div>
                    <div className="text-sm font-semibold leading-snug mb-2 line-clamp-2" style={{ color: T.text }}>{p.name}</div>
                    <div className="flex items-center justify-between">
                      <div className="text-base font-bold">{fmtEur(p.price_eur)}</div>
                      {p.encastre && <span className="rounded px-1.5 py-0.5 text-[10px]" style={{ background: `${T.accent}18`, color: T.accent }}>{p.encastre}</span>}
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        ) : (
          /* TABLA */
          <div className="rounded-xl overflow-x-auto" style={{ border: `1px solid ${T.border}` }}>
            <table className="w-full text-xs" style={{ minWidth: 880 }}>
              <thead>
                <tr style={{ background: T.surface, color: T.muted }}>
                  <th className="w-8 p-2 text-center">
                    <button type="button" onClick={toggleAll} title={allVisibleSelected ? 'Deseleccionar todo' : 'Seleccionar todo'} className="w-4 h-4 rounded inline-flex items-center justify-center" style={{ background: allVisibleSelected ? T.accent : 'transparent', border: `1px solid ${allVisibleSelected || someVisibleSelected ? T.accent : T.border}` }}>
                      {allVisibleSelected ? <Check className="w-3 h-3 text-white" /> : someVisibleSelected ? <div style={{ width: 7, height: 2, background: T.accent }} /> : null}
                    </button>
                  </th>
                  <th className="w-12 p-2" />
                  <th className="text-left p-2 font-medium">Producto</th>
                  {COL_ATTRS.map((c) => <th key={c.label} className="text-left p-2 font-medium">{c.label}</th>)}
                  <th className="text-right p-2 font-medium">Precio</th>
                </tr>
              </thead>
              <tbody>
                {items.map((p) => {
                  const sel = selected.includes(p.id)
                  return (
                    <tr key={p.id} onClick={() => setDetail(p)} className="cursor-pointer transition-colors hover:bg-white/[0.03]" style={{ borderTop: `1px solid ${T.border}`, background: sel ? 'rgba(255,102,0,0.06)' : 'transparent' }}>
                      <td className="p-2 text-center" onClick={(e) => e.stopPropagation()}>
                        <button type="button" onClick={() => toggle(p.id)} className="w-4 h-4 rounded inline-flex items-center justify-center" style={{ background: sel ? T.accent : 'transparent', border: `1px solid ${sel ? T.accent : T.border}` }}>{sel && <Check className="w-3 h-3 text-white" />}</button>
                      </td>
                      <td className="p-1"><div className="w-9 h-9 rounded-md mx-auto flex items-center justify-center" style={{ background: '#fff' }}><Img p={p} className="max-h-full max-w-full object-contain p-0.5" /></div></td>
                      <td className="p-2">
                        <div className="font-mono text-[10px]" style={{ color: T.accent }}>{p.sku}</div>
                        <div className="font-semibold truncate" style={{ color: T.text, maxWidth: 240 }}>{p.name}</div>
                      </td>
                      {COL_ATTRS.map((c) => <td key={c.label} className="p-2" style={{ color: T.soft }}>{c.get(p)}</td>)}
                      <td className="p-2 text-right font-bold">{fmtEur(p.price_eur)}</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Barra flotante de comparación */}
      {selected.length > 0 && (
        <div className="fixed bottom-4 left-1/2 -translate-x-1/2 z-40 flex items-center gap-3 rounded-full pl-4 pr-2 py-2 shadow-2xl" style={{ background: T.surface, border: `1px solid ${T.accent}` }}>
          <span className="text-xs" style={{ color: T.text }}>{selected.length} seleccionado(s)</span>
          <button type="button" onClick={() => setSelected([])} className="text-[11px]" style={{ color: T.soft }}>Limpiar</button>
          <button type="button" onClick={() => setComparing(true)} disabled={selected.length < 2} className="flex items-center gap-1.5 rounded-full px-4 py-1.5 text-xs font-semibold" style={{ background: selected.length < 2 ? T.border : `linear-gradient(135deg, ${T.accent}, #ef4444)`, color: 'white', opacity: selected.length < 2 ? 0.6 : 1 }}>
            <GitCompare className="w-3.5 h-3.5" /> Comparar
          </button>
        </div>
      )}

      {detail && <ProductDetail product={detail} onClose={() => setDetail(null)} onCompare={(p) => { setSelected((s) => s.includes(p.id) ? s : [...s, p.id]); setDetail(null); setComparing(true) }} onAiQuery={(sku) => { setAiInputQuery(sku); setAiOpen(true); void queryInsight(sku) }} />}
      {comparing && selectedProducts.length > 0 && <Comparison products={selectedProducts} onRemove={toggle} onClose={() => setComparing(false)} />}

      {/* Panel Asesor IA */}
      {aiOpen && (
        <div className="fixed inset-0 z-50 flex" style={{ background: 'rgba(0,0,0,0.5)', backdropFilter: 'blur(2px)' }} onClick={() => setAiOpen(false)}>
          <div className="ml-auto w-full max-w-md h-full flex flex-col overflow-hidden" style={{ background: T.bg, borderLeft: `1px solid ${T.border}` }} onClick={(e) => e.stopPropagation()}>
            {/* Header */}
            <div className="flex items-center justify-between px-4 py-3 border-b" style={{ borderColor: T.border }}>
              <div className="flex items-center gap-2">
                <Bot className="w-4 h-4" style={{ color: '#FF6600' }} />
                <span className="font-bold text-sm" style={{ color: T.text }}>Asesor IA de Productos</span>
              </div>
              <button type="button" onClick={() => setAiOpen(false)} className="p-1 rounded hover:bg-white/10"><X className="w-4 h-4" style={{ color: T.soft }} /></button>
            </div>

            {/* Búsqueda */}
            <div className="px-4 py-3 border-b" style={{ borderColor: T.border }}>
              <div className="flex gap-2">
                <div className="flex-1 flex items-center gap-2 rounded-lg px-3 py-2" style={{ background: T.surface, border: `1px solid ${T.border}` }}>
                  <Search className="w-3.5 h-3.5 shrink-0" style={{ color: T.muted }} />
                  <input
                    value={aiInputQuery}
                    onChange={(e) => setAiInputQuery(e.target.value)}
                    onKeyDown={(e) => { if (e.key === 'Enter') void queryInsight(aiInputQuery) }}
                    placeholder="SKU o nombre del producto…"
                    className="flex-1 bg-transparent text-sm outline-none"
                    style={{ color: T.text }}
                    autoFocus
                  />
                </div>
                <button
                  type="button"
                  onClick={() => void queryInsight(aiInputQuery)}
                  disabled={aiLoading}
                  className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-semibold"
                  style={{ background: '#FF6600', color: 'white', opacity: aiLoading ? 0.7 : 1 }}
                >
                  {aiLoading ? <span className="animate-spin">⟳</span> : <ChevronRight className="w-4 h-4" />}
                </button>
              </div>
              <p className="text-[11px] mt-1.5" style={{ color: T.muted }}>Escribí el SKU o nombre — te digo historial de clientes, precios y co-ventas</p>
            </div>

            {/* Resultado */}
            <div className="flex-1 overflow-y-auto px-4 py-3 space-y-4">
              {aiError === 'no_auth' && (
                <div className="rounded-xl p-4 text-center" style={{ background: T.surface, border: `1px solid ${T.border}` }}>
                  <Bot className="w-8 h-8 mx-auto mb-2" style={{ color: T.muted }} />
                  <p className="text-sm font-semibold" style={{ color: T.text }}>Iniciá sesión para ver el historial</p>
                  <p className="text-xs mt-1" style={{ color: T.muted }}>El asesor IA accede a ventas, clientes y precios — requiere tu cuenta.</p>
                </div>
              )}
              {aiError && aiError !== 'no_auth' && (
                <div className="text-sm p-3 rounded-lg" style={{ background: '#ef444420', color: '#f87171', border: '1px solid #ef444430' }}>
                  Error: {aiError}
                </div>
              )}

              {aiLoading && (
                <div className="space-y-3">
                  {[80, 60, 90, 70].map((w, i) => (
                    <div key={i} className="h-3 rounded animate-pulse" style={{ width: `${w}%`, background: T.surface }} />
                  ))}
                </div>
              )}

              {!aiLoading && aiResult && (
                <>
                  {/* Status */}
                  <div className="flex items-center gap-2 p-3 rounded-lg" style={{ background: aiResult.catalogFound ? '#22c55e14' : '#ef444414', border: `1px solid ${aiResult.catalogFound ? '#22c55e30' : '#ef444430'}` }}>
                    <span className="text-lg">{aiResult.catalogFound ? '✅' : '🔍'}</span>
                    <div>
                      <p className="text-sm font-semibold" style={{ color: aiResult.catalogFound ? '#4ade80' : '#f87171' }}>
                        {aiResult.catalogFound ? `En catálogo: ${aiResult.product?.sku}` : 'No está en el catálogo'}
                      </p>
                      {aiResult.product?.name && <p className="text-xs mt-0.5" style={{ color: T.soft }}>{aiResult.product.name}</p>}
                    </div>
                  </div>

                  {/* AI Summary */}
                  {aiResult.aiSummary && (
                    <div className="p-3 rounded-xl" style={{ background: '#FF660010', border: '1px solid #FF660030' }}>
                      <div className="flex items-center gap-1.5 mb-2">
                        <Sparkles className="w-3.5 h-3.5" style={{ color: '#FF6600' }} />
                        <span className="text-[11px] font-semibold uppercase tracking-wide" style={{ color: '#FF6600' }}>Análisis IA</span>
                      </div>
                      <p className="text-sm leading-relaxed" style={{ color: T.text }}>{aiResult.aiSummary}</p>
                    </div>
                  )}

                  {/* Clientes */}
                  {aiResult.clients.length > 0 && (
                    <div>
                      <div className="flex items-center gap-1.5 mb-2">
                        <Users className="w-3.5 h-3.5" style={{ color: T.soft }} />
                        <span className="text-xs font-semibold uppercase tracking-wide" style={{ color: T.muted }}>Clientes ({aiResult.clients.length})</span>
                      </div>
                      <div className="space-y-1.5">
                        {aiResult.clients.map((c, i) => (
                          <div key={i} className="flex items-center justify-between p-2 rounded-lg" style={{ background: T.surface }}>
                            <div>
                              <span className="text-sm font-medium" style={{ color: T.text }}>{c.client_name}</span>
                              <span className="text-[10px] ml-2" style={{ color: T.muted }}>{c.purchase_count} pedido{c.purchase_count !== 1 ? 's' : ''}</span>
                            </div>
                            <span className="text-xs font-mono font-bold" style={{ color: '#4ade80' }}>
                              {c.currency} {c.last_price.toFixed(2)}
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Co-ventas */}
                  {aiResult.coProducts.length > 0 && (
                    <div>
                      <div className="flex items-center gap-1.5 mb-2">
                        <Package2 className="w-3.5 h-3.5" style={{ color: T.soft }} />
                        <span className="text-xs font-semibold uppercase tracking-wide" style={{ color: T.muted }}>Se vende con</span>
                      </div>
                      <div className="flex flex-wrap gap-1.5">
                        {aiResult.coProducts.map((cp, i) => (
                          <button
                            key={i}
                            type="button"
                            onClick={() => { setAiInputQuery(cp.sku); void queryInsight(cp.sku) }}
                            className="flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-medium hover:opacity-80"
                            style={{ background: T.surface, border: `1px solid ${T.border}`, color: T.text }}
                          >
                            <span className="font-mono" style={{ color: '#FF6600' }}>{cp.sku}</span>
                            <span style={{ color: T.muted }}>×{cp.co_count}</span>
                          </button>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Historial de precios */}
                  {aiResult.priceHistory.length > 0 && (
                    <div>
                      <div className="flex items-center gap-1.5 mb-2">
                        <TrendingUp className="w-3.5 h-3.5" style={{ color: T.soft }} />
                        <span className="text-xs font-semibold uppercase tracking-wide" style={{ color: T.muted }}>Historial de precios</span>
                      </div>
                      <div className="rounded-xl overflow-hidden" style={{ border: `1px solid ${T.border}` }}>
                        <table className="w-full text-xs">
                          <thead>
                            <tr style={{ background: T.surface }}>
                              <th className="text-left p-2 font-medium" style={{ color: T.muted }}>Fecha</th>
                              <th className="text-left p-2 font-medium" style={{ color: T.muted }}>Cliente</th>
                              <th className="text-right p-2 font-medium" style={{ color: T.muted }}>Precio</th>
                            </tr>
                          </thead>
                          <tbody>
                            {aiResult.priceHistory.slice(-10).reverse().map((pt, i) => {
                              const prev = aiResult.priceHistory.slice(-10).reverse()[i + 1]
                              const change = prev ? ((pt.unit_price - prev.unit_price) / prev.unit_price) * 100 : 0
                              return (
                                <tr key={i} style={{ borderTop: `1px solid ${T.border}` }}>
                                  <td className="p-2" style={{ color: T.soft }}>{pt.date}</td>
                                  <td className="p-2 truncate max-w-[100px]" style={{ color: T.text }}>{pt.client_name}</td>
                                  <td className="p-2 text-right font-mono font-bold">
                                    <span style={{ color: change > 5 ? '#f87171' : change < -5 ? '#4ade80' : T.text }}>
                                      {pt.currency} {pt.unit_price.toFixed(2)}
                                    </span>
                                    {Math.abs(change) > 3 && <span className="ml-1 text-[10px]" style={{ color: change > 0 ? '#f87171' : '#4ade80' }}>{change > 0 ? '▲' : '▼'}{Math.abs(change).toFixed(0)}%</span>}
                                  </td>
                                </tr>
                              )
                            })}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  )}
                </>
              )}

              {!aiLoading && !aiResult && !aiError && (
                <div className="text-center py-8" style={{ color: T.muted }}>
                  <Bot className="w-12 h-12 mx-auto mb-3 opacity-20" />
                  <p className="text-sm">Escribí un SKU o nombre de producto para analizar</p>
                  <p className="text-xs mt-1 opacity-60">Ej: QSP200N3, FEIN ASCS 6.25, torquímetro 200 Nm</p>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

function ProductDetail({ product, onClose, onCompare, onAiQuery }: { product: Product; onClose: () => void; onCompare: (p: Product) => void; onAiQuery?: (sku: string) => void }) {
  const p = product
  const gallery = Array.isArray(p.gallery_urls) ? p.gallery_urls : []
  const page = spec(p, 'page_catalog')
  const attrs: [string, string][] = [
    ['Marca', p.brand || '—'], ['Categoría', categoria(p)], ['Encastre', p.encastre || '—'],
    ['Modelo', p.modelo || '—'], ['Huella', huella(p) || '—'], ['Medida', medida(p) || '—'],
    ['Largo', largo(p) || '—'], ['Torque', torque(p) || '—'], ['RPM', p.rpm || '—'],
  ]

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto p-4" style={{ background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(3px)' }} onMouseDown={onClose}>
      <div className="rounded-2xl w-full max-w-3xl my-4" style={{ background: T.bg, border: `1px solid ${T.border}` }} onMouseDown={(e) => e.stopPropagation()}>
        <div className="flex items-start justify-between p-4 border-b" style={{ borderColor: T.border }}>
          <div>
            <div className="font-mono text-[11px]" style={{ color: T.accent }}>{p.sku}</div>
            <div className="text-lg font-bold" style={{ color: T.text }}>{p.name}</div>
            <div className="text-base font-bold mt-1" style={{ color: T.text }}>{fmtEur(p.price_eur)}</div>
          </div>
          <button type="button" onClick={onClose} className="p-1.5 rounded hover:bg-white/10"><X className="w-5 h-5" style={{ color: T.soft }} /></button>
        </div>

        <div className="grid md:grid-cols-2 gap-4 p-4">
          {/* Foto + diagrama */}
          <div>
            <div className="grid grid-cols-2 gap-2">
              {[['Foto', p.image_url], ['Diagrama', p.diagram_url]].map(([label, url]) => (
                <div key={label} className="rounded-lg overflow-hidden" style={{ border: `1px solid ${T.border}` }}>
                  <div className="flex items-center justify-center" style={{ aspectRatio: '1', background: '#fff' }}>
                    <img src={(url as string) || PLACEHOLDER} alt={label as string} className="max-h-full max-w-full object-contain p-2" referrerPolicy="no-referrer" onError={(e) => { (e.target as HTMLImageElement).src = PLACEHOLDER }} />
                  </div>
                  <div className="text-center text-[10px] py-1" style={{ background: T.surface, color: T.muted }}>{label === 'Foto' ? 'Foto producto' : 'Diagrama técnico'}</div>
                </div>
              ))}
            </div>
            {gallery.length > 0 && (
              <div className="flex gap-2 overflow-x-auto mt-2">
                {gallery.map((g, i) => <img key={i} src={g.url} alt={g.alt || ''} className="h-14 w-14 rounded border object-contain" style={{ borderColor: T.border, background: '#fff' }} referrerPolicy="no-referrer" />)}
              </div>
            )}
            {page && <div className="mt-2 text-[11px]" style={{ color: T.muted }}>📄 Hoja del catálogo · página {page}</div>}
          </div>

          {/* Atributos + precios */}
          <div>
            <div className="grid grid-cols-2 gap-x-4">
              {attrs.map(([k, v]) => (
                <div key={k} className="flex justify-between py-1.5 text-sm" style={{ borderBottom: `1px solid ${T.border}` }}>
                  <span className="text-[11px] uppercase" style={{ color: T.muted }}>{k}</span>
                  <span className="font-semibold text-right" style={{ color: T.text }}>{v}</span>
                </div>
              ))}
            </div>
            <div className="rounded-lg p-3 mt-3 text-sm" style={{ background: T.surface }}>
              <div className="text-xs mb-1" style={{ color: T.muted }}>Precios</div>
              <div className="flex flex-wrap gap-x-4 gap-y-1">
                <span style={{ color: T.soft }}>EUR <b style={{ color: T.text }}>{fmt(p.price_eur, '€')}</b></span>
                <span style={{ color: T.soft }}>USD <b style={{ color: T.text }}>{fmt(p.price_usd, 'US$')}</b></span>
                <span style={{ color: T.soft }}>ARS <b style={{ color: T.text }}>{fmt(p.price_ars, '$')}</b></span>
              </div>
            </div>
          </div>
        </div>

        <div className="flex flex-wrap gap-2 p-4 pt-0">
          <button type="button" className="flex-1 min-w-[160px] flex items-center justify-center gap-1.5 py-2 rounded-lg text-sm font-semibold" style={{ background: `linear-gradient(135deg, ${T.accent}, #ef4444)`, color: 'white' }}><Plus className="w-4 h-4" /> Agregar a cotización</button>
          <button type="button" onClick={() => onCompare(p)} className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm" style={{ background: T.surface, color: T.text, border: `1px solid ${T.border}` }}><GitCompare className="w-4 h-4" /> Comparar</button>
          {onAiQuery && <button type="button" onClick={() => { onClose(); onAiQuery(p.sku) }} className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm" style={{ background: '#FF660015', color: '#FF6600', border: '1px solid #FF660030' }}><Bot className="w-4 h-4" /> Asesor IA</button>}
          <button type="button" className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm" style={{ background: T.surface, color: T.text, border: `1px solid ${T.border}` }}><Link2 className="w-4 h-4" /> Copiar link</button>
        </div>
      </div>
    </div>
  )
}

function Comparison({ products, onRemove, onClose }: { products: Product[]; onRemove: (id: string) => void; onClose: () => void }) {
  const prices = products.map((p) => p.price_eur ?? Infinity)
  const minPrecio = Math.min(...prices)
  const ROWS: { label: string; get: (p: Product) => string }[] = [
    { label: 'Precio', get: (p) => fmtEur(p.price_eur) },
    ...COL_ATTRS,
    { label: 'Modelo', get: (p) => p.modelo || '—' },
    { label: 'Torque', get: (p) => torque(p) || '—' },
    { label: 'RPM', get: (p) => p.rpm || '—' },
  ]
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(3px)' }} onMouseDown={onClose}>
      <div className="rounded-2xl w-full max-w-4xl max-h-[90vh] overflow-auto" style={{ background: T.bg, border: `1px solid ${T.border}` }} onMouseDown={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between p-4 border-b sticky top-0" style={{ borderColor: T.border, background: T.bg }}>
          <div className="text-sm font-bold flex items-center gap-2" style={{ color: T.text }}><GitCompare className="w-4 h-4" style={{ color: T.accent }} /> Comparar {products.length} productos</div>
          <button type="button" onClick={onClose} className="p-1.5 rounded hover:bg-white/10"><X className="w-5 h-5" style={{ color: T.soft }} /></button>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm" style={{ minWidth: 120 + products.length * 180 }}>
            <thead>
              <tr>
                <th className="sticky left-0 p-3" style={{ background: T.bg, width: 110 }} />
                {products.map((p) => (
                  <th key={p.id} className="p-3 align-bottom" style={{ minWidth: 180 }}>
                    <div className="rounded-xl p-2 relative" style={{ background: T.card, border: `1px solid ${(p.price_eur ?? Infinity) === minPrecio ? T.accent : T.border}` }}>
                      <button type="button" onClick={() => onRemove(p.id)} className="absolute top-1 right-1 p-0.5 rounded hover:bg-white/10"><X className="w-3.5 h-3.5" style={{ color: T.muted }} /></button>
                      <div className="rounded-lg mb-2 mx-auto flex items-center justify-center" style={{ width: 56, height: 56, background: '#fff' }}><Img p={p} className="max-h-full max-w-full object-contain p-1" /></div>
                      <div className="font-mono text-[10px] text-center" style={{ color: T.accent }}>{p.sku}</div>
                      <div className="text-[11px] font-semibold text-center leading-tight" style={{ color: T.text }}>{p.name}</div>
                    </div>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {ROWS.map((row) => {
                const values = products.map((p) => row.get(p))
                const allSame = values.every((v) => v === values[0])
                const isPrecio = row.label === 'Precio'
                return (
                  <tr key={row.label} style={{ borderTop: `1px solid ${T.border}` }}>
                    <td className="sticky left-0 p-3 text-[11px] uppercase tracking-wide" style={{ background: T.bg, color: T.muted }}>{row.label}</td>
                    {products.map((p, i) => {
                      const best = isPrecio && (p.price_eur ?? Infinity) === minPrecio && products.length > 1
                      return (
                        <td key={p.id} className="p-3 text-center" style={{ color: best ? '#34d399' : (allSame ? T.soft : T.text), fontWeight: (best || !allSame) ? 600 : 400, background: !allSame && !isPrecio ? 'rgba(255,102,0,0.06)' : 'transparent' }}>
                          {values[i]}{best ? ' ✓' : ''}
                        </td>
                      )
                    })}
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
        <div className="p-3 text-center text-[11px]" style={{ color: T.muted }}>Fondo naranja = diferencias · ✓ = mejor precio</div>
      </div>
    </div>
  )
}
