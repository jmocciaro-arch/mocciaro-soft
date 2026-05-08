'use client'

import { useEffect, useState } from 'react'
import { Package, ArrowDown, ArrowUp, Search, Loader2, AlertCircle, Inbox } from 'lucide-react'

interface ProductHistoryRow {
  client_id: string
  product_id: string
  sku: string | null
  product_name: string | null
  product_brand: string | null
  docs_count: number
  quotes_count: number
  orders_count: number
  invoices_count: number
  deliveries_count: number
  total_quantity: number
  avg_quantity_per_doc: number
  total_subtotal: number
  avg_unit_price: number
  min_unit_price: number | null
  max_unit_price: number | null
  last_unit_price: number | null
  last_currency: string | null
  first_purchase_at: string
  last_purchase_at: string
}

type SortKey =
  | 'last_purchase_at'
  | 'first_purchase_at'
  | 'total_quantity'
  | 'total_subtotal'
  | 'docs_count'

interface Props {
  clientId: string
  /** Si se pasa, click en una fila navega a ficha producto */
  onProductClick?: (productId: string) => void
}

export function ClientProductsHistory({ clientId, onProductClick }: Props) {
  const [rows, setRows] = useState<ProductHistoryRow[] | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [search, setSearch] = useState('')
  const [sort, setSort] = useState<SortKey>('last_purchase_at')
  const [order, setOrder] = useState<'asc' | 'desc'>('desc')

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    setError(null)

    const params = new URLSearchParams({
      sort,
      order,
      limit: '500',
    })
    if (search.trim()) params.set('q', search.trim())

    fetch(`/api/clients/${clientId}/products?${params}`, { credentials: 'include' })
      .then(async (res) => {
        if (!res.ok) {
          const j = await res.json().catch(() => ({}))
          throw new Error(j.error || `HTTP ${res.status}`)
        }
        return res.json() as Promise<{ data: ProductHistoryRow[] }>
      })
      .then((j) => { if (!cancelled) setRows(j.data || []) })
      .catch((e: Error) => { if (!cancelled) setError(e.message) })
      .finally(() => { if (!cancelled) setLoading(false) })

    return () => { cancelled = true }
  }, [clientId, sort, order, search])

  const fmtNum = (n: number | null | undefined) =>
    n == null ? '—' : Number(n).toLocaleString('es-AR', { maximumFractionDigits: 2 })
  const fmtMoney = (n: number | null | undefined, currency?: string | null) =>
    n == null ? '—' : `${Number(n).toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ${currency || ''}`.trim()
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
    <div className="space-y-3">
      {/* Buscador */}
      <div className="relative">
        <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-[#6B7280]" />
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Filtrar por SKU o nombre del producto…"
          className="w-full pl-9 pr-3 py-2 rounded-md bg-[#1E2330] border border-[#2A3040] text-sm text-[#F0F2F5] placeholder:text-[#6B7280]"
        />
      </div>

      {loading ? (
        <div className="p-12 text-center text-[#6B7280] text-sm">
          <Loader2 size={20} className="mx-auto mb-2 animate-spin opacity-50" />
          Cargando productos comprados…
        </div>
      ) : error ? (
        <div className="p-4 rounded-lg border border-red-500/30 bg-red-500/5 text-sm text-red-400">
          <AlertCircle size={14} className="inline mr-1.5" />
          {error}
          {error.includes('relation "v_client_product_history" does not exist') && (
            <p className="mt-1 text-xs text-red-300">
              Las vistas SQL no están aplicadas todavía. Ejecutar <code>migration-v63-traceability-views.sql</code> en Supabase.
            </p>
          )}
        </div>
      ) : !rows || rows.length === 0 ? (
        <div className="p-12 text-center">
          <Inbox size={32} className="mx-auto mb-2 text-[#3A4050]" />
          <p className="text-sm text-[#9CA3AF]">
            {search ? 'Ningún producto matchea el filtro.' : 'Este cliente todavía no compró ningún producto.'}
          </p>
          {!search && (
            <p className="text-xs text-[#6B7280] mt-1">
              La trazabilidad cuenta cotizaciones, pedidos, remitos y facturas (excluye cancelados).
            </p>
          )}
        </div>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-[#1E2330]">
          <table className="w-full text-sm">
            <thead className="bg-[#0A0D12] text-[11px] uppercase tracking-wide">
              <tr>
                <th className="text-left px-3 py-2.5">Producto</th>
                <th className="text-right px-3 py-2.5"><SortHeader label="Cant. total" k="total_quantity" /></th>
                <th className="text-right px-3 py-2.5"><SortHeader label="Total $" k="total_subtotal" /></th>
                <th className="text-right px-3 py-2.5">Último precio</th>
                <th className="text-center px-3 py-2.5"><SortHeader label="# docs" k="docs_count" /></th>
                <th className="text-right px-3 py-2.5"><SortHeader label="Última compra" k="last_purchase_at" /></th>
                <th className="text-right px-3 py-2.5"><SortHeader label="Primera compra" k="first_purchase_at" /></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#1E2330]">
              {rows.map((r) => (
                <tr
                  key={r.product_id}
                  className={`${onProductClick ? 'hover:bg-[#1A1F2E] cursor-pointer transition' : ''}`}
                  onClick={() => onProductClick?.(r.product_id)}
                >
                  <td className="px-3 py-2.5">
                    <div className="flex items-center gap-2 min-w-0">
                      <Package size={14} className="text-[#6B7280] shrink-0" />
                      <div className="min-w-0">
                        {r.sku && <p className="text-[11px] font-mono text-[#9CA3AF]">{r.sku}</p>}
                        <p className="text-[#F0F2F5] truncate">{r.product_name || '(sin nombre)'}</p>
                        {r.product_brand && (
                          <p className="text-[10px] text-[#6B7280]">{r.product_brand}</p>
                        )}
                      </div>
                    </div>
                  </td>
                  <td className="px-3 py-2.5 text-right tabular-nums">{fmtNum(r.total_quantity)}</td>
                  <td className="px-3 py-2.5 text-right tabular-nums text-emerald-400">{fmtMoney(r.total_subtotal, r.last_currency)}</td>
                  <td className="px-3 py-2.5 text-right tabular-nums">{fmtMoney(r.last_unit_price, r.last_currency)}</td>
                  <td className="px-3 py-2.5 text-center">
                    <span className="inline-flex items-center gap-1 text-[11px] text-[#9CA3AF]">
                      <strong className="text-[#F0F2F5]">{r.docs_count}</strong>
                      {r.invoices_count > 0 && <span className="text-emerald-400" title="Facturas">f:{r.invoices_count}</span>}
                      {r.orders_count > 0 && <span className="text-orange-400" title="Pedidos">p:{r.orders_count}</span>}
                      {r.quotes_count > 0 && <span className="text-blue-400" title="Cotizaciones">c:{r.quotes_count}</span>}
                    </span>
                  </td>
                  <td className="px-3 py-2.5 text-right text-[11px] text-[#9CA3AF] tabular-nums">{fmtDate(r.last_purchase_at)}</td>
                  <td className="px-3 py-2.5 text-right text-[11px] text-[#6B7280] tabular-nums">{fmtDate(r.first_purchase_at)}</td>
                </tr>
              ))}
            </tbody>
            <tfoot className="bg-[#0A0D12] text-[11px] text-[#6B7280] border-t border-[#1E2330]">
              <tr>
                <td className="px-3 py-2" colSpan={7}>
                  Total productos distintos: <strong className="text-[#F0F2F5]">{rows.length}</strong>
                  {' · '}
                  Total facturado:{' '}
                  <strong className="text-emerald-400">
                    {fmtMoney(
                      rows.reduce((sum, r) => sum + Number(r.total_subtotal || 0), 0),
                      rows[0]?.last_currency
                    )}
                  </strong>
                </td>
              </tr>
            </tfoot>
          </table>
        </div>
      )}
    </div>
  )
}
