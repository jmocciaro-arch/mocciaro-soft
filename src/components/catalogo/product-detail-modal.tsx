'use client'

import { useEffect, useState, useMemo } from 'react'
import { Modal } from '@/components/ui/modal'
import { Badge } from '@/components/ui/badge'
import {
  Package, User as UserIcon, ArrowDown, ArrowUp, Search,
  Loader2, AlertCircle, Inbox, FileText, Tag, Hash, DollarSign,
} from 'lucide-react'
import { createClient } from '@/lib/supabase/client'

// ════════════════════════════════════════════════════════════════════
// Sprint 2B — Modal de detalle de producto con histórico de clientes
// ════════════════════════════════════════════════════════════════════

interface ProductRow {
  id: string
  sku: string | null
  name: string | null
  brand: string | null
  product_type: string | null
  price_eur: number | null
  cost_eur: number | null
  image_url: string | null
  description: string | null
  company_id: string | null
}

interface ClientHistoryRow {
  product_id: string
  client_id: string
  client_name: string | null
  client_legal_name: string | null
  client_tax_id: string | null
  docs_count: number
  quotes_count: number
  orders_count: number
  invoices_count: number
  deliveries_count: number
  total_quantity: number
  total_subtotal: number
  avg_unit_price: number
  min_unit_price: number | null
  max_unit_price: number | null
  last_unit_price: number | null
  first_purchase_at: string
  last_purchase_at: string
}

type SortKey = 'last_purchase_at' | 'first_purchase_at' | 'total_quantity' | 'total_subtotal' | 'docs_count'

interface Props {
  productId: string | null
  onClose: () => void
  onClientClick?: (clientId: string) => void
}

export function ProductDetailModal({ productId, onClose, onClientClick }: Props) {
  const supabase = createClient()
  const [tab, setTab] = useState<'general' | 'clients'>('general')
  const [product, setProduct] = useState<ProductRow | null>(null)
  const [clients, setClients] = useState<ClientHistoryRow[] | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [search, setSearch] = useState('')
  const [sort, setSort] = useState<SortKey>('total_subtotal')
  const [order, setOrder] = useState<'asc' | 'desc'>('desc')

  // Cargar producto + histórico
  useEffect(() => {
    if (!productId) return
    let cancelled = false
    setLoading(true)
    setError(null)
    setTab('general')

    void (async () => {
      try {
        const [{ data: prod, error: prodErr }, clientsRes] = await Promise.all([
          supabase
            .from('tt_products')
            .select('id, sku, name, brand, product_type, price_eur, cost_eur, image_url, description, company_id')
            .eq('id', productId)
            .maybeSingle(),
          fetch(`/api/products/${productId}/clients?sort=${sort}&order=${order}&limit=500${search.trim() ? `&q=${encodeURIComponent(search.trim())}` : ''}`, {
            credentials: 'include',
          }),
        ])

        if (cancelled) return
        if (prodErr) throw new Error(prodErr.message)
        setProduct(prod as ProductRow)

        if (!clientsRes.ok) {
          const j = await clientsRes.json().catch(() => ({}))
          throw new Error(j.error || `HTTP ${clientsRes.status}`)
        }
        const j = (await clientsRes.json()) as { data: ClientHistoryRow[] }
        setClients(j.data || [])
      } catch (e) {
        if (!cancelled) setError((e as Error).message)
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()

    return () => { cancelled = true }
  }, [productId, sort, order, search, supabase])

  const totalSold = useMemo(
    () => (clients || []).reduce((s, r) => s + Number(r.total_subtotal || 0), 0),
    [clients]
  )
  const totalUnits = useMemo(
    () => (clients || []).reduce((s, r) => s + Number(r.total_quantity || 0), 0),
    [clients]
  )

  const fmtNum = (n: number | null | undefined) =>
    n == null ? '—' : Number(n).toLocaleString('es-AR', { maximumFractionDigits: 2 })
  const fmtMoney = (n: number | null | undefined) =>
    n == null ? '—' : Number(n).toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
  const fmtDate = (s: string) => new Date(s).toLocaleDateString('es-AR')

  const SortHeader = ({ label, k }: { label: string; k: SortKey }) => (
    <button
      onClick={() => {
        if (sort === k) setOrder(order === 'asc' ? 'desc' : 'asc')
        else { setSort(k); setOrder('desc') }
      }}
      className={`inline-flex items-center gap-1 ${sort === k ? 'text-[#FF6600]' : 'text-[#9CA3AF] hover:text-[#F0F2F5]'} transition`}
    >
      {label}
      {sort === k && (order === 'asc' ? <ArrowUp size={11} /> : <ArrowDown size={11} />)}
    </button>
  )

  return (
    <Modal isOpen={!!productId} onClose={onClose} title="Ficha de producto" size="xl">
      {loading ? (
        <div className="p-12 text-center text-[#6B7280] text-sm">
          <Loader2 size={20} className="mx-auto mb-2 animate-spin opacity-50" />
          Cargando…
        </div>
      ) : error ? (
        <div className="p-4 rounded-lg border border-red-500/30 bg-red-500/5 text-sm text-red-400">
          <AlertCircle size={14} className="inline mr-1.5" />
          {error}
          {error.includes('relation "v_product_client_history" does not exist') && (
            <p className="mt-1 text-xs text-red-300">
              Vistas SQL no aplicadas. Correr <code>migration-v63-traceability-views.sql</code>.
            </p>
          )}
        </div>
      ) : !product ? (
        <p className="text-sm text-[#9CA3AF]">Producto no encontrado.</p>
      ) : (
        <div className="space-y-4">
          {/* Header con miniatura + datos clave */}
          <div className="flex items-start gap-4 pb-4 border-b border-[#1E2330]">
            <div className="w-16 h-16 rounded-lg bg-[#0F1218] border border-[#1E2330] flex items-center justify-center shrink-0 overflow-hidden">
              {product.image_url ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={product.image_url} alt="" referrerPolicy="no-referrer" className="w-full h-full object-contain" />
              ) : (
                <Package size={28} className="text-[#3A4050]" />
              )}
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                {product.sku && <Badge variant="default">{product.sku}</Badge>}
                {product.brand && <Badge variant="default">{product.brand}</Badge>}
                {product.product_type && <Badge variant="default">{product.product_type}</Badge>}
              </div>
              <h2 className="text-lg font-bold text-[#F0F2F5] mt-1">
                {product.name || '(sin nombre)'}
              </h2>
              {product.description && (
                <p className="text-xs text-[#9CA3AF] mt-1 line-clamp-2">{product.description}</p>
              )}
            </div>
            {/* KPIs trazabilidad */}
            <div className="text-right space-y-1 shrink-0">
              <div className="text-[10px] uppercase tracking-wider text-[#6B7280]">Total vendido</div>
              <div className="text-lg font-bold text-emerald-400 tabular-nums">{fmtMoney(totalSold)}</div>
              <div className="text-[10px] text-[#6B7280] tabular-nums">{fmtNum(totalUnits)} unidades · {clients?.length || 0} clientes</div>
            </div>
          </div>

          {/* Tabs */}
          <div className="flex gap-1 p-1 bg-[#0A0D12] rounded-lg border border-[#1E2330]">
            {(
              [
                { id: 'general' as const, label: 'General', icon: Tag, count: undefined as number | undefined },
                { id: 'clients' as const, label: 'Clientes', icon: UserIcon, count: clients?.length },
              ]
            ).map((t) => (
              <button
                key={t.id}
                onClick={() => setTab(t.id)}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition ${
                  tab === t.id ? 'bg-[#FF6600] text-white' : 'text-[#6B7280] hover:text-[#F0F2F5] hover:bg-[#1E2330]'
                }`}
              >
                <t.icon size={12} /> {t.label}
                {t.count != null && t.count > 0 && (
                  <span className={`text-[9px] px-1 rounded ${tab === t.id ? 'bg-white/20' : 'bg-[#1E2330]'}`}>
                    {t.count}
                  </span>
                )}
              </button>
            ))}
          </div>

          {/* TAB GENERAL */}
          {tab === 'general' && (
            <div className="grid grid-cols-2 gap-3 text-sm">
              <div className="p-3 rounded-lg bg-[#0F1218] border border-[#1E2330]">
                <div className="text-[10px] uppercase tracking-wider text-[#6B7280] flex items-center gap-1"><Hash size={10} /> SKU</div>
                <div className="font-mono text-[#F0F2F5] mt-0.5">{product.sku || '—'}</div>
              </div>
              <div className="p-3 rounded-lg bg-[#0F1218] border border-[#1E2330]">
                <div className="text-[10px] uppercase tracking-wider text-[#6B7280] flex items-center gap-1"><Tag size={10} /> Marca</div>
                <div className="text-[#F0F2F5] mt-0.5">{product.brand || '—'}</div>
              </div>
              <div className="p-3 rounded-lg bg-[#0F1218] border border-[#1E2330]">
                <div className="text-[10px] uppercase tracking-wider text-[#6B7280] flex items-center gap-1"><DollarSign size={10} /> Precio EUR</div>
                <div className="text-[#F0F2F5] tabular-nums mt-0.5">{fmtMoney(product.price_eur)}</div>
              </div>
              <div className="p-3 rounded-lg bg-[#0F1218] border border-[#1E2330]">
                <div className="text-[10px] uppercase tracking-wider text-[#6B7280] flex items-center gap-1"><DollarSign size={10} /> Costo EUR</div>
                <div className="text-[#F0F2F5] tabular-nums mt-0.5">{fmtMoney(product.cost_eur)}</div>
              </div>
            </div>
          )}

          {/* TAB CLIENTES */}
          {tab === 'clients' && (
            <div className="space-y-3">
              <p className="text-xs text-[#9CA3AF]">
                Clientes que compraron este producto alguna vez (cotizaciones, pedidos, remitos y facturas no canceladas).
              </p>
              <div className="relative">
                <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-[#6B7280]" />
                <input
                  type="text"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Filtrar por nombre o CUIT/CIF…"
                  className="w-full pl-9 pr-3 py-2 rounded-md bg-[#1E2330] border border-[#2A3040] text-sm text-[#F0F2F5] placeholder:text-[#6B7280]"
                />
              </div>

              {!clients || clients.length === 0 ? (
                <div className="p-12 text-center">
                  <Inbox size={32} className="mx-auto mb-2 text-[#3A4050]" />
                  <p className="text-sm text-[#9CA3AF]">
                    {search ? 'Ningún cliente matchea el filtro.' : 'Este producto todavía no fue vendido a ningún cliente.'}
                  </p>
                </div>
              ) : (
                <div className="overflow-x-auto rounded-lg border border-[#1E2330]">
                  <table className="w-full text-sm">
                    <thead className="bg-[#0A0D12] text-[11px] uppercase tracking-wide">
                      <tr>
                        <th className="text-left px-3 py-2.5">Cliente</th>
                        <th className="text-right px-3 py-2.5"><SortHeader label="Cant." k="total_quantity" /></th>
                        <th className="text-right px-3 py-2.5"><SortHeader label="Total" k="total_subtotal" /></th>
                        <th className="text-right px-3 py-2.5">Último precio</th>
                        <th className="text-center px-3 py-2.5"><SortHeader label="# docs" k="docs_count" /></th>
                        <th className="text-right px-3 py-2.5"><SortHeader label="Última" k="last_purchase_at" /></th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-[#1E2330]">
                      {clients.map((r) => (
                        <tr
                          key={r.client_id}
                          className={onClientClick ? 'hover:bg-[#1A1F2E] cursor-pointer transition' : ''}
                          onClick={() => onClientClick?.(r.client_id)}
                        >
                          <td className="px-3 py-2.5">
                            <div>
                              <p className="text-[#F0F2F5]">{r.client_name || r.client_legal_name || '(sin nombre)'}</p>
                              {r.client_tax_id && <p className="text-[10px] font-mono text-[#6B7280]">{r.client_tax_id}</p>}
                            </div>
                          </td>
                          <td className="px-3 py-2.5 text-right tabular-nums">{fmtNum(r.total_quantity)}</td>
                          <td className="px-3 py-2.5 text-right tabular-nums text-emerald-400">{fmtMoney(r.total_subtotal)}</td>
                          <td className="px-3 py-2.5 text-right tabular-nums">{fmtMoney(r.last_unit_price)}</td>
                          <td className="px-3 py-2.5 text-center">
                            <span className="inline-flex items-center gap-1 text-[11px] text-[#9CA3AF]">
                              <strong className="text-[#F0F2F5]">{r.docs_count}</strong>
                              {r.invoices_count > 0 && <span className="text-emerald-400" title="Facturas">f:{r.invoices_count}</span>}
                              {r.orders_count > 0 && <span className="text-orange-400" title="Pedidos">p:{r.orders_count}</span>}
                            </span>
                          </td>
                          <td className="px-3 py-2.5 text-right text-[11px] text-[#9CA3AF] tabular-nums">{fmtDate(r.last_purchase_at)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </Modal>
  )
}
