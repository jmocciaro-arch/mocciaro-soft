'use client'

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { Modal } from '@/components/ui/modal'
import { Badge } from '@/components/ui/badge'
import { createClient } from '@/lib/supabase/client'
import {
  Loader2, Boxes, Building2, Calendar, User2, ShoppingCart,
  Truck, ArrowDownToLine, ArrowUpFromLine, FileText, History,
} from 'lucide-react'
import { formatDate } from '@/lib/utils'

type Tab = 'real' | 'committed' | 'requested' | 'movements'

interface StockReal {
  warehouse_id: string
  warehouse_name: string | null
  company_id: string | null
  company_name: string | null
  quantity: number
  reserved: number
  available: number
}

interface StockDetail {
  document_id: string
  doc_type: string
  system_code: string | null
  display_ref: string | null
  status: string | null
  client_id: string | null
  client_name?: string | null
  supplier_name?: string | null
  company_id: string | null
  company_name: string | null
  qty_pending: number
  qty_total: number
  qty_delivered?: number
  qty_received?: number
  eta: string | null
  created_at: string
}

interface Movement {
  id: string
  created_at: string
  movement_type: string
  quantity: number
  quantity_before: number | null
  quantity_after: number | null
  warehouse_id: string | null
  warehouse_name: string | null
  document_id: string | null
  document_code: string | null
  reference: string | null
  notes: string | null
  expected_arrival: string | null
}

interface Breakdown {
  product_id: string
  sku: string
  name: string
  stock_real_total: number
  stock_real_by_warehouse: StockReal[]
  stock_committed_total: number
  stock_committed_detail: StockDetail[]
  stock_requested_total: number
  stock_requested_detail: StockDetail[]
  movements: Movement[]
}

interface Props {
  isOpen: boolean
  onClose: () => void
  productId: string | null
  initialTab?: Tab
}

export function StockBreakdownModal({ isOpen, onClose, productId, initialTab = 'real' }: Props) {
  const sb = useMemo(() => createClient(), [])
  const [loading, setLoading] = useState(false)
  const [data, setData] = useState<Breakdown | null>(null)
  const [tab, setTab] = useState<Tab>(initialTab)

  useEffect(() => {
    if (!isOpen || !productId) return
    setTab(initialTab)
    setLoading(true)
    void sb
      .rpc('get_product_stock_breakdown', { p_product_ids: [productId], p_movements_limit: 25 })
      .then(({ data: result, error }) => {
        if (error) {
          console.error('stock breakdown error', error)
          setData(null)
        } else {
          const obj = (result as Record<string, Breakdown> | null) ?? {}
          setData(obj[productId] ?? null)
        }
      })
      .then(() => setLoading(false))
  }, [isOpen, productId, sb, initialTab])

  const tabs: Array<{ id: Tab; label: string; icon: typeof Boxes; count: number; color: string }> = [
    { id: 'real',       label: 'Stock real',  icon: Boxes,            count: data?.stock_real_by_warehouse.length ?? 0,  color: 'text-emerald-600' },
    { id: 'committed',  label: 'Comprometido', icon: ArrowUpFromLine, count: data?.stock_committed_detail.length ?? 0,   color: 'text-amber-600' },
    { id: 'requested',  label: 'Solicitado',   icon: ArrowDownToLine, count: data?.stock_requested_detail.length ?? 0,    color: 'text-blue-600' },
    { id: 'movements',  label: 'Movimientos',  icon: History,         count: data?.movements.length ?? 0,                 color: 'text-gray-600' },
  ]

  function statusVariant(status: string | null): 'default' | 'info' | 'warning' | 'success' | 'danger' | 'orange' {
    const s = (status ?? '').toLowerCase()
    if (['draft', 'borrador'].includes(s))               return 'default'
    if (['pending', 'pendiente'].includes(s))            return 'warning'
    if (['confirmed', 'confirmado', 'open'].includes(s)) return 'info'
    if (['partial', 'parcial'].includes(s))              return 'orange'
    if (['delivered','received','closed','paid'].includes(s)) return 'success'
    if (['cancelled','rejected'].includes(s))            return 'danger'
    return 'default'
  }

  function docLinkFor(d: StockDetail): string {
    // Heurística — la app usa /ventas o /compras según doc_type
    if (['pedido','sales_order','albaran'].includes(d.doc_type)) return `/ventas/${d.document_id}`
    if (['pap','purchase_order'].includes(d.doc_type))           return `/compras/${d.document_id}`
    return `/documentos/${d.document_id}`
  }

  return (
    <Modal isOpen={isOpen} onClose={onClose} size="xl" title={data ? `Stock — ${data.sku} ${data.name}` : 'Stock'}>
      {loading && (
        <div className="flex items-center justify-center py-12 text-[#6B7280]">
          <Loader2 className="w-5 h-5 animate-spin mr-2" /> Cargando...
        </div>
      )}

      {!loading && !data && (
        <div className="py-12 text-center text-[#6B7280]">No hay datos de stock para este producto.</div>
      )}

      {!loading && data && (
        <>
          {/* Totales */}
          <div className="grid grid-cols-3 gap-3 mb-4">
            <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-3">
              <div className="flex items-center gap-1.5 text-emerald-700 text-xs font-semibold uppercase">
                <Boxes className="w-3.5 h-3.5" /> Real
              </div>
              <div className="text-2xl font-bold text-emerald-900 mt-1">{data.stock_real_total}</div>
              <div className="text-[11px] text-emerald-700">en {data.stock_real_by_warehouse.length} almacén(es)</div>
            </div>
            <div className="rounded-lg border border-amber-200 bg-amber-50 p-3">
              <div className="flex items-center gap-1.5 text-amber-700 text-xs font-semibold uppercase">
                <ArrowUpFromLine className="w-3.5 h-3.5" /> Comprometido
              </div>
              <div className="text-2xl font-bold text-amber-900 mt-1">{data.stock_committed_total}</div>
              <div className="text-[11px] text-amber-700">{data.stock_committed_detail.length} pedido(s) de venta</div>
            </div>
            <div className="rounded-lg border border-blue-200 bg-blue-50 p-3">
              <div className="flex items-center gap-1.5 text-blue-700 text-xs font-semibold uppercase">
                <ArrowDownToLine className="w-3.5 h-3.5" /> Solicitado
              </div>
              <div className="text-2xl font-bold text-blue-900 mt-1">{data.stock_requested_total}</div>
              <div className="text-[11px] text-blue-700">{data.stock_requested_detail.length} compra(s) pendiente(s)</div>
            </div>
          </div>

          {/* Tabs */}
          <div className="flex border-b border-[#E5E5E5] mb-3">
            {tabs.map((t) => {
              const Icon = t.icon
              const active = tab === t.id
              return (
                <button
                  key={t.id}
                  onClick={() => setTab(t.id)}
                  className={`flex items-center gap-1.5 px-3 py-2 text-sm border-b-2 -mb-px transition-colors ${
                    active
                      ? 'border-[#FF6600] text-[#FF6600] font-semibold'
                      : 'border-transparent text-[#6B7280] hover:text-[#1F2937]'
                  }`}
                >
                  <Icon className={`w-4 h-4 ${active ? '' : t.color}`} />
                  {t.label}
                  <span className="ml-1 text-[11px] px-1.5 py-0.5 rounded bg-[#F3F4F6] text-[#6B7280]">
                    {t.count}
                  </span>
                </button>
              )
            })}
          </div>

          {/* Contenido */}
          <div className="max-h-[55vh] overflow-y-auto">
            {tab === 'real' && (
              <RealTab data={data.stock_real_by_warehouse} />
            )}
            {tab === 'committed' && (
              <DetailTab data={data.stock_committed_detail} kind="committed" docLinkFor={docLinkFor} statusVariant={statusVariant} />
            )}
            {tab === 'requested' && (
              <DetailTab data={data.stock_requested_detail} kind="requested" docLinkFor={docLinkFor} statusVariant={statusVariant} />
            )}
            {tab === 'movements' && (
              <MovementsTab data={data.movements} />
            )}
          </div>
        </>
      )}
    </Modal>
  )
}

// ─── Subcomponentes ────────────────────────────────────────────────────────
function RealTab({ data }: { data: StockReal[] }) {
  if (data.length === 0) return <EmptyState text="No hay stock registrado en ningún almacén." />
  return (
    <div className="space-y-1.5">
      {data.map((s) => (
        <div key={s.warehouse_id} className="flex items-center gap-3 p-2.5 rounded border border-[#E5E5E5]">
          <div className="w-9 h-9 rounded bg-emerald-50 text-emerald-700 flex items-center justify-center flex-shrink-0">
            <Boxes className="w-4 h-4" />
          </div>
          <div className="flex-1 min-w-0">
            <div className="text-sm font-medium text-[#1F2937]">{s.warehouse_name ?? 'Almacén sin nombre'}</div>
            <div className="text-xs text-[#6B7280] flex items-center gap-1.5">
              <Building2 className="w-3 h-3" /> {s.company_name ?? '—'}
            </div>
          </div>
          <div className="text-right flex-shrink-0">
            <div className="text-lg font-bold text-emerald-900">{s.quantity}</div>
            {s.reserved > 0 && (
              <div className="text-[11px] text-[#6B7280]">{s.reserved} reservado · {s.available} disponible</div>
            )}
          </div>
        </div>
      ))}
    </div>
  )
}

function DetailTab({
  data, kind, docLinkFor, statusVariant,
}: {
  data: StockDetail[]
  kind: 'committed' | 'requested'
  docLinkFor: (d: StockDetail) => string
  statusVariant: (s: string | null) => 'default' | 'info' | 'warning' | 'success' | 'danger' | 'orange'
}) {
  if (data.length === 0) return <EmptyState text={kind === 'committed' ? 'Sin pedidos de venta pendientes de entregar.' : 'Sin compras pendientes de recibir.'} />
  const today = new Date()
  return (
    <div className="space-y-1.5">
      {data.map((d) => {
        const eta = d.eta ? new Date(d.eta) : null
        const overdue = eta && eta < today
        const counterparty = kind === 'committed' ? d.client_name : d.supplier_name
        const Icon = kind === 'committed' ? Truck : ShoppingCart
        return (
          <div key={d.document_id} className={`flex items-center gap-3 p-2.5 rounded border ${overdue ? 'border-red-200 bg-red-50/30' : 'border-[#E5E5E5]'}`}>
            <div className={`w-9 h-9 rounded flex items-center justify-center flex-shrink-0 ${kind === 'committed' ? 'bg-amber-50 text-amber-700' : 'bg-blue-50 text-blue-700'}`}>
              <Icon className="w-4 h-4" />
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <Link href={docLinkFor(d)} className="font-mono text-xs text-[#FF6600] hover:underline">
                  {d.system_code ?? d.display_ref ?? d.document_id.slice(0, 8)}
                </Link>
                <Badge variant={statusVariant(d.status)} size="sm">{d.status ?? '—'}</Badge>
                <Badge variant="default" size="sm">{d.doc_type}</Badge>
                {d.company_name && <span className="text-[11px] text-[#6B7280]"><Building2 className="inline w-3 h-3" /> {d.company_name}</span>}
              </div>
              <div className="text-sm text-[#1F2937] mt-0.5 truncate">
                <User2 className="inline w-3 h-3 mr-1" />
                {counterparty ?? '—'}
              </div>
            </div>
            <div className="text-right flex-shrink-0">
              <div className={`text-lg font-bold ${kind === 'committed' ? 'text-amber-900' : 'text-blue-900'}`}>
                {d.qty_pending} <span className="text-xs font-normal text-[#6B7280]">/ {d.qty_total}</span>
              </div>
              <div className={`text-[11px] flex items-center justify-end gap-1 ${overdue ? 'text-red-600 font-semibold' : 'text-[#6B7280]'}`}>
                <Calendar className="w-3 h-3" />
                {eta ? formatDate(d.eta!) : 'sin ETA'}
                {overdue && ' ⚠'}
              </div>
            </div>
          </div>
        )
      })}
    </div>
  )
}

function MovementsTab({ data }: { data: Movement[] }) {
  if (data.length === 0) return <EmptyState text="Sin movimientos registrados." />
  return (
    <div className="space-y-1">
      {data.map((m) => {
        const positive = m.quantity > 0
        return (
          <div key={m.id} className="flex items-center gap-3 p-2 rounded border border-[#E5E5E5]">
            <div className={`w-8 h-8 rounded flex items-center justify-center flex-shrink-0 ${positive ? 'bg-emerald-50 text-emerald-700' : 'bg-red-50 text-red-700'}`}>
              {positive ? <ArrowDownToLine className="w-3.5 h-3.5" /> : <ArrowUpFromLine className="w-3.5 h-3.5" />}
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 flex-wrap text-xs">
                <span className="text-[#6B7280]">{formatDate(m.created_at)}</span>
                <Badge variant="default" size="sm">{m.movement_type}</Badge>
                {m.document_code && (
                  <Link href={`/documentos/${m.document_id}`} className="font-mono text-[#FF6600] hover:underline">
                    <FileText className="inline w-3 h-3" /> {m.document_code}
                  </Link>
                )}
              </div>
              <div className="text-xs text-[#6B7280] truncate">
                {m.warehouse_name ?? '—'}{m.reference ? ` · ${m.reference}` : ''}{m.notes ? ` · ${m.notes}` : ''}
              </div>
            </div>
            <div className="text-right flex-shrink-0">
              <div className={`text-sm font-bold ${positive ? 'text-emerald-700' : 'text-red-700'}`}>
                {positive ? '+' : ''}{m.quantity}
              </div>
              {m.quantity_before != null && m.quantity_after != null && (
                <div className="text-[10px] text-[#9CA3AF]">{m.quantity_before} → {m.quantity_after}</div>
              )}
            </div>
          </div>
        )
      })}
    </div>
  )
}

function EmptyState({ text }: { text: string }) {
  return <div className="py-8 text-center text-sm text-[#9CA3AF]">{text}</div>
}
