'use client'

/**
 * ProductMatchModal — Modal de matching SKU cliente → producto del catálogo.
 *
 * Se abre desde una línea del cotizador (típicamente importada de una OC del
 * cliente donde el matcher automático no encontró equivalencia). Muestra un
 * buscador del catálogo y permite seleccionar un producto para vincularlo,
 * con la opción de guardar el alias para que la próxima OC del mismo cliente
 * lo matchee automáticamente.
 *
 * No depende del cotizador: recibe todo lo necesario por props y devuelve el
 * producto elegido por callback. La persistencia del alias la maneja este
 * componente (POST /api/sku-aliases) si el usuario tilda el checkbox.
 */

import { useCallback, useEffect, useRef, useState } from 'react'
import { Modal } from '@/components/ui/modal'
import { Search, Link2, X } from 'lucide-react'

export interface CatalogProduct {
  id: string
  sku: string
  name: string
  brand: string | null
  price_eur: number | null
  /** % de IVA del producto — se define por producto, no todos son 21%. */
  tax_rate?: number | null
  image_url?: string | null
  category?: string | null
  // Smart-search: explica por qué este producto apareció en los resultados
  // ("🎯 SKU coincide con modelo", "🏷️ Marca FEIN + modelo", etc.).
  score?: number
  match_reasons?: string[]
}

interface ParsedQuery {
  brand?: string | null
  model?: string | null
  internal_code?: string | null
  keywords?: string[]
}

interface Props {
  open: boolean
  onClose: () => void
  /** SKU del cliente que originó este match (se muestra como contexto y se usa para el alias). */
  clientSKU?: string
  /** Descripción del item del cliente — sirve como query inicial al abrir el modal. */
  clientDescription?: string
  /** Cliente actualmente seleccionado en el cotizador (necesario para guardar alias). */
  clientId?: string | null
  clientName?: string | null
  /** Empresa emisora — necesaria para el POST de alias. */
  companyId: string
  /** Callback cuando el usuario confirma un producto. */
  onSelect: (product: CatalogProduct, opts: { savedAsAlias: boolean }) => void
}

export function ProductMatchModal({
  open,
  onClose,
  clientSKU,
  clientDescription,
  clientId,
  clientName,
  companyId,
  onSelect,
}: Props) {
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<CatalogProduct[]>([])
  const [parsed, setParsed] = useState<ParsedQuery | null>(null)
  const [loading, setLoading] = useState(false)
  const [saveAsAlias, setSaveAsAlias] = useState(true)
  const [savingAlias, setSavingAlias] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const debounceRef = useRef<NodeJS.Timeout | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  // Reset state cuando se abre con un item distinto
  useEffect(() => {
    if (open) {
      // Pre-cargar query con SKU del cliente + descripción COMPLETA.
      // Smart-search se beneficia de más contexto: la IA usa el texto
      // entero para identificar marca, modelo y código interno.
      // Antes truncábamos a 30 chars para fuzzy plano — ya no aplica.
      const parts = [clientSKU, clientDescription].filter((s) => s && s.trim()).map((s) => s!.trim())
      // Dedup si SKU está dentro de la descripción (común en OCs)
      const initial = parts.length === 2 && parts[1].includes(parts[0])
        ? parts[1]
        : parts.join(' ')
      // Capear a 200 chars para evitar excesos (los items raramente son tan largos)
      setQuery(initial.slice(0, 200))
      setError(null)
      setSaveAsAlias(Boolean(clientId && clientSKU))
      // Auto-focus input al abrir
      setTimeout(() => inputRef.current?.focus(), 50)
    }
  }, [open, clientDescription, clientSKU, clientId])

  // Debounce de búsqueda
  const runSearch = useCallback(async (q: string) => {
    const term = q.trim()
    if (term.length < 2) {
      setResults([])
      return
    }
    setLoading(true)
    setError(null)
    try {
      // Smart-search: IA parsea {brand, model, internal_code, keywords} y la DB
      // combina múltiples sub-queries con scoring multi-factor. Devuelve también
      // un campo `parsed` para mostrar al usuario qué entendió la IA de su query.
      const r = await fetch('/api/products/smart-search', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query: term, limit: 20 }),
      })
      const j = await r.json()
      if (!r.ok) throw new Error(j?.error || 'Error buscando productos')
      const items: CatalogProduct[] = (j.items || []).map((p: Record<string, unknown>) => ({
        id: p.id as string,
        sku: (p.sku as string) || '',
        name: (p.name as string) || '',
        brand: (p.brand as string | null) ?? null,
        price_eur: (p.price_eur as number | null) ?? null,
        image_url: (p.image_url as string | null) ?? null,
        category: (p.category as string | null) ?? null,
        score: typeof p.score === 'number' ? p.score : undefined,
        match_reasons: Array.isArray(p.match_reasons) ? (p.match_reasons as string[]) : undefined,
      }))
      setResults(items)
      setParsed(j.parsed || null)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error desconocido')
      setResults([])
      setParsed(null)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    if (!open) return
    if (debounceRef.current) clearTimeout(debounceRef.current)
    // 400ms en lugar de 250ms — el smart-search llama a Claude, mejor no spamear.
    // El cache hit del segundo keystroke (misma query) es instantáneo igual.
    debounceRef.current = setTimeout(() => runSearch(query), 400)
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current)
    }
  }, [query, open, runSearch])

  async function persistAlias(product: CatalogProduct) {
    if (!saveAsAlias || !clientId || !clientSKU) return false
    setSavingAlias(true)
    try {
      const r = await fetch('/api/sku-aliases', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          company_id: companyId,
          client_id: clientId,
          external_sku: clientSKU,
          product_id: product.id,
          source: 'manual',
        }),
      })
      if (!r.ok) {
        // No bloqueamos el match si falla el alias — solo avisamos
        console.warn('No se pudo guardar el alias', await r.text())
        return false
      }
      return true
    } catch (err) {
      console.warn('No se pudo guardar el alias', err)
      return false
    } finally {
      setSavingAlias(false)
    }
  }

  async function handleSelect(product: CatalogProduct) {
    const savedAsAlias = await persistAlias(product)
    onSelect(product, { savedAsAlias })
    onClose()
  }

  if (!open) return null

  return (
    <Modal isOpen={open} onClose={onClose} title="Vincular producto del catálogo" size="lg">
      <div className="space-y-2">
        {/* Contexto: item del cliente (compacto, una línea) */}
        {(clientSKU || clientDescription) && (
          <div
            className="rounded-md px-2.5 py-1.5 text-[11px] flex items-baseline gap-1.5"
            style={{ background: 'rgba(255,102,0,0.06)', border: '1px solid rgba(255,102,0,0.2)' }}
          >
            <span className="opacity-70 shrink-0">Vinculando:</span>
            <span className="font-mono truncate" title={[clientSKU, clientDescription].filter(Boolean).join(' · ')}>
              {clientSKU && <span className="font-semibold">{clientSKU}</span>}
              {clientSKU && clientDescription && <span className="opacity-50"> · </span>}
              {clientDescription && <span>{clientDescription}</span>}
            </span>
          </div>
        )}

        {/* Buscador (más chico verticalmente) */}
        <div className="relative">
          <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-[#6B7280]" />
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Buscar por SKU, nombre o marca..."
            className="w-full rounded-md bg-[#0F1218] border border-[#1E2330] pl-8 pr-8 py-1.5 text-sm text-[#F0F2F5] placeholder:text-[#4B5563] focus:outline-none focus:border-[#FF6600]"
          />
          {query && (
            <button
              onClick={() => setQuery('')}
              className="absolute right-2 top-1/2 -translate-y-1/2 text-[#6B7280] hover:text-[#F0F2F5]"
              aria-label="Limpiar búsqueda"
            >
              <X size={13} />
            </button>
          )}
        </div>

        {/* Chip IA entendió + checkbox alias en la misma línea cuando hay espacio */}
        <div className="flex items-center justify-between gap-2 flex-wrap">
          {/* IA entendió */}
          {parsed && (parsed.brand || parsed.model || parsed.internal_code) && !loading ? (
            <div className="text-[10px] flex flex-wrap items-center gap-1 flex-1 min-w-0">
              <span className="opacity-60 shrink-0">✨ IA:</span>
              {parsed.brand && <span className="px-1.5 py-px rounded bg-indigo-500/15 text-indigo-300 font-mono">🏷️ {parsed.brand}</span>}
              {parsed.model && <span className="px-1.5 py-px rounded bg-indigo-500/15 text-indigo-300 font-mono">📐 {parsed.model}</span>}
              {parsed.internal_code && <span className="px-1.5 py-px rounded bg-indigo-500/15 text-indigo-300 font-mono">🔢 {parsed.internal_code}</span>}
              {parsed.keywords && parsed.keywords.length > 0 && (
                <span className="opacity-50 truncate">+ {parsed.keywords.slice(0, 2).join(' · ')}</span>
              )}
            </div>
          ) : <div className="flex-1" />}

          {/* Checkbox alias (a la derecha, compacto) */}
          {clientId && clientSKU && (
            <label className="flex items-center gap-1.5 text-[10px] text-[#9CA3AF] cursor-pointer select-none shrink-0">
              <input
                type="checkbox"
                checked={saveAsAlias}
                onChange={(e) => setSaveAsAlias(e.target.checked)}
                className="rounded border-[#2A3040] bg-[#0F1218] w-3 h-3"
              />
              <span>
                Guardar alias para <strong className="text-[#F0F2F5]">{clientName || 'cliente'}</strong>
              </span>
            </label>
          )}
        </div>

        {/* Error */}
        {error && (
          <div className="text-[11px] px-2 py-1 rounded" style={{ background: 'rgba(239,68,68,0.1)', color: '#ef4444' }}>
            {error}
          </div>
        )}

        {/* Resultados — filas mucho más compactas */}
        <div
          className="border rounded-md overflow-hidden"
          style={{ borderColor: 'var(--sat-br, #2A3040)', minHeight: 260, maxHeight: 480 }}
        >
          {loading ? (
            <div className="flex items-center justify-center py-8 text-xs text-[#6B7280]">
              Buscando…
            </div>
          ) : results.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-10 text-xs text-[#6B7280] gap-1">
              <Search size={18} className="opacity-40" />
              {query.trim().length < 2
                ? 'Escribí al menos 2 caracteres para buscar'
                : 'No se encontraron productos'}
            </div>
          ) : (
            <div className="overflow-y-auto" style={{ maxHeight: 480 }}>
              {results.map((p) => (
                <button
                  key={p.id}
                  onClick={() => void handleSelect(p)}
                  disabled={savingAlias}
                  className="w-full flex items-center gap-2 px-2 py-1.5 text-left border-b border-[#1E2330]/40 hover:bg-[#1E2330]/60 transition-colors disabled:opacity-50"
                >
                  {/* Imagen — solo si existe. Sin placeholder "Sin foto" que ocupaba espacio */}
                  {p.image_url && (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={p.image_url}
                      alt=""
                      className="w-8 h-8 rounded object-cover flex-shrink-0 bg-[#0F1218]"
                    />
                  )}
                  <div className="flex-1 min-w-0">
                    {/* Línea 1: SKU · score · brand · category */}
                    <div className="flex items-center gap-1.5 text-[11px]">
                      <span className="font-mono text-[#FF6600] font-semibold">{p.sku}</span>
                      {typeof p.score === 'number' && p.score > 0 && (
                        <span
                          className={`px-1 rounded font-semibold text-[9px] ${
                            p.score >= 100 ? 'bg-emerald-500/20 text-emerald-300'
                            : p.score >= 70 ? 'bg-indigo-500/15 text-indigo-300'
                            : p.score >= 40 ? 'bg-amber-500/15 text-amber-300'
                            : 'bg-[#1E2330] text-[#6B7280]'
                          }`}
                          title={`Score ${p.score}`}
                        >
                          {p.score >= 100 ? '★★★' : p.score >= 70 ? '★★' : p.score >= 40 ? '★' : '·'}{p.score}
                        </span>
                      )}
                      {p.brand && <span className="text-[#6B7280]">· {p.brand}</span>}
                      {p.category && <span className="text-[#4B5563] truncate">· {p.category}</span>}
                    </div>
                    {/* Línea 2: name */}
                    <div className="text-[13px] text-[#F0F2F5] truncate leading-tight" title={p.name}>{p.name}</div>
                    {/* Línea 3: razones (solo si hay, muy chiquito) */}
                    {p.match_reasons && p.match_reasons.length > 0 && (
                      <div className="text-[9px] text-emerald-400/70 truncate leading-tight" title={p.match_reasons.join(' · ')}>
                        {p.match_reasons.slice(0, 2).join(' · ')}
                      </div>
                    )}
                  </div>
                  {/* Precio + link a la derecha */}
                  <div className="text-right flex-shrink-0 flex items-center gap-1.5">
                    {p.price_eur != null && (
                      <div className="text-xs font-medium text-[#F0F2F5] whitespace-nowrap">€ {p.price_eur.toFixed(2)}</div>
                    )}
                    <Link2 size={12} className="text-[#FF6600]" />
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Footer — solo cancelar (el guardar se hace al click del producto) */}
        <div className="flex justify-end pt-0.5">
          <button onClick={onClose} className="text-xs text-[#9CA3AF] hover:text-[#F0F2F5] px-3 py-1">
            Cancelar
          </button>
        </div>
      </div>
    </Modal>
  )
}
