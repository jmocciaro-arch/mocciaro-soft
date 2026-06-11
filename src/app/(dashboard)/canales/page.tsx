'use client'

import { useState, useEffect, useCallback, useMemo } from 'react'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import { useCompanyContext } from '@/lib/company-context'
import { useCompanyFilter } from '@/hooks/use-company-filter'
import { usePermissions } from '@/hooks/use-permissions'
import { useChannelsGate } from '@/hooks/use-channels-gate'
import { useToast } from '@/components/ui/toast'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { DataTable, type DataTableColumn } from '@/components/ui/data-table'
import { EmptyState } from '@/components/ui/empty-state'
import { SkeletonCardGrid } from '@/components/ui/skeleton'
import { ChannelCard } from '@/components/channels/channel-card'
import { NewListingModal } from '@/components/channels/new-listing-modal'
import { ArrowLeftRight, Inbox, PackageOpen } from 'lucide-react'
import { formatRelative } from '@/lib/utils'
import { buyerName, estadoBucketFor, CHANNEL_ORDER_STATUS_LABELS } from '@/lib/dashboard/executive-kpis'
import { LISTING_STATUS_LABELS, LISTING_STATUS_BADGE } from '@/lib/channels/constants'

interface OrderRow extends Record<string, unknown> {
  id: string
  channel_id: string
  external_order_id: string
  buyer: unknown
  total: number | null
  currency: string | null
  status: string
  received_at: string
  document_id: string | null
  document: { doc_code: string | null } | null
}

interface ListingRow extends Record<string, unknown> {
  id: string
  channel_id: string
  title: string | null
  price: number | null
  currency: string | null
  stock_published: number | null
  status: string
  last_sync_at: string | null
  sync_error: string | null
  product: { sku: string | null } | null
}

const ESTADO_BADGE: Record<'cobrado' | 'abierto' | 'atencion', 'success' | 'info' | 'danger'> = {
  cobrado: 'success', abierto: 'info', atencion: 'danger',
}

export default function CanalesPage() {
  const gate = useChannelsGate()
  const { can } = usePermissions()
  const { filterByCompany, companyKey, defaultCompanyId } = useCompanyFilter()
  const { activeCompany } = useCompanyContext()
  const { addToast } = useToast()

  const [orders, setOrders] = useState<OrderRow[]>([])
  const [listings, setListings] = useState<ListingRow[]>([])
  const [loadingData, setLoadingData] = useState(true)
  const [creatingId, setCreatingId] = useState<string | null>(null)
  const [showNewListing, setShowNewListing] = useState(false)

  const canManageOrders = can('manage_channel_orders')
  const canPublish = can('publish_listings')
  const companyCurrency = (activeCompany as { currency?: string } | null)?.currency || 'EUR'

  const loadData = useCallback(async () => {
    setLoadingData(true)
    const sb = createClient()
    const [ordersRes, listingsRes] = await Promise.all([
      filterByCompany(
        sb.from('tt_channel_orders')
          .select('id, channel_id, external_order_id, buyer, total, currency, status, received_at, document_id, document:tt_documents(doc_code)')
          .order('received_at', { ascending: false })
          .limit(100),
      ),
      filterByCompany(
        sb.from('tt_channel_listings')
          .select('id, channel_id, title, price, currency, stock_published, status, last_sync_at, sync_error, product:tt_products(sku)')
          .order('updated_at', { ascending: false })
          .limit(200),
      ),
    ])
    setOrders(((ordersRes.data ?? []) as unknown as OrderRow[]))
    setListings(((listingsRes.data ?? []) as unknown as ListingRow[]))
    setLoadingData(false)
    // filterByCompany cambia de identidad por render; companyKey es la dep estable (mismo patrón que calendario)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [companyKey])

  useEffect(() => {
    if (gate.functional) void loadData()
  }, [gate.functional, loadData])

  const channelLabels = useMemo(
    () => Object.fromEntries(gate.enabledChannels.map(c => [c.id, c.label])),
    [gate.enabledChannels],
  )

  const statsByChannel = useMemo(() => {
    const startOfToday = new Date()
    startOfToday.setHours(0, 0, 0, 0)
    return Object.fromEntries(gate.enabledChannels.map(channel => {
      const chListings = listings.filter(l => l.channel_id === channel.id)
      const chOrders = orders.filter(o => o.channel_id === channel.id)
      const synced = chListings.filter(l => l.last_sync_at && !l.sync_error).length
      return [channel.id, {
        listings: chListings.length,
        ordersToday: chOrders.filter(o => new Date(o.received_at) >= startOfToday).length,
        pending: chOrders.filter(o => o.document_id === null && o.status !== 'cancelled').length,
        syncPct: chListings.length > 0 ? Math.round((synced / chListings.length) * 100) : null,
      }]
    }))
  }, [gate.enabledChannels, listings, orders])

  const createDocument = useCallback(async (orderId: string) => {
    setCreatingId(orderId)
    try {
      const res = await fetch(`/api/channel-orders/${orderId}/create-document`, { method: 'POST' })
      const json = await res.json() as { error?: string; doc_code?: string; stock?: { shortfall?: boolean } }
      if (!res.ok) {
        addToast({ type: 'error', title: 'No se pudo crear el documento', message: json.error })
        return
      }
      addToast({
        type: json.stock?.shortfall ? 'warning' : 'success',
        title: `Documento ${json.doc_code} creado`,
        message: json.stock?.shortfall ? 'Reserva de stock incompleta: faltante en algún ítem.' : 'Stock reservado y orden vinculada.',
      })
      await loadData()
    } finally {
      setCreatingId(null)
    }
  }, [addToast, loadData])

  function fmtMoney(total: number | null, currency: string | null): string {
    if (total == null) return '—'
    const cur = currency ?? companyCurrency
    const symbol = cur === 'EUR' ? '€' : cur === 'USD' ? 'USD ' : '$'
    return `${symbol}${Number(total).toLocaleString('es-AR', { maximumFractionDigits: 2 })}`
  }

  const orderColumns: DataTableColumn[] = useMemo(() => [
    {
      key: 'channel_id', label: 'Canal', width: '120px',
      render: v => <Badge variant="orange">{channelLabels[String(v)] ?? 'Canal'}</Badge>,
    },
    { key: 'external_order_id', label: 'Orden', render: v => <span className="font-mono text-[12px]">{String(v ?? '')}</span> },
    { key: 'buyer', label: 'Comprador', render: v => buyerName(v) },
    { key: 'total', label: 'Importe', type: 'number', render: (v, row) => <span className="font-mono">{fmtMoney(v as number | null, (row as OrderRow).currency)}</span> },
    { key: 'received_at', label: 'Recibida', type: 'date', render: v => (v ? formatRelative(String(v)) : '—') },
    {
      key: 'status', label: 'Estado',
      render: v => <Badge variant={ESTADO_BADGE[estadoBucketFor(String(v))]}>{CHANNEL_ORDER_STATUS_LABELS[String(v)] ?? String(v)}</Badge>,
    },
    {
      key: 'document_id', label: 'Documento',
      render: (v, row) => {
        const r = row as OrderRow
        if (v) return <span className="font-mono text-[12px]">{r.document?.doc_code ?? 'Vinculado'}</span>
        if (!canManageOrders) return <span className="text-[#6B7280] text-xs">—</span>
        return (
          <Button
            size="sm"
            variant="secondary"
            disabled={creatingId !== null}
            onClick={() => void createDocument(r.id)}
          >
            {creatingId === r.id ? 'Creando…' : 'Crear documento'}
          </Button>
        )
      },
    },
  ], [channelLabels, canManageOrders, creatingId, createDocument]) // eslint-disable-line react-hooks/exhaustive-deps

  const listingColumns: DataTableColumn[] = useMemo(() => [
    {
      key: 'channel_id', label: 'Canal', width: '120px',
      render: v => <Badge variant="orange">{channelLabels[String(v)] ?? 'Canal'}</Badge>,
    },
    { key: 'product', label: 'SKU', render: v => <span className="font-mono text-[12px]">{(v as ListingRow['product'])?.sku ?? '—'}</span> },
    { key: 'title', label: 'Título', render: v => <span className="truncate block max-w-[280px]">{String(v ?? '—')}</span> },
    { key: 'price', label: 'Precio', type: 'number', render: (v, row) => <span className="font-mono">{fmtMoney(v as number | null, (row as ListingRow).currency)}</span> },
    { key: 'stock_published', label: 'Stock pub.', type: 'number' },
    {
      key: 'status', label: 'Estado',
      render: v => <Badge variant={LISTING_STATUS_BADGE[String(v)] ?? 'default'}>{LISTING_STATUS_LABELS[String(v)] ?? String(v)}</Badge>,
    },
    { key: 'last_sync_at', label: 'Última sync', render: v => (v ? formatRelative(String(v)) : 'Nunca') },
    {
      key: 'sync_error', label: 'Error',
      render: v => (v ? <span className="text-red-400 text-xs truncate block max-w-[180px]" title={String(v)}>{String(v)}</span> : <span className="text-[#6B7280] text-xs">—</span>),
    },
  ], [channelLabels]) // eslint-disable-line react-hooks/exhaustive-deps

  // ---- Gating §1 ----
  if (gate.loading) {
    return <div className="p-6"><SkeletonCardGrid /></div>
  }
  // Sin permiso view_channels el módulo está AUSENTE (ni deshabilitado): el
  // sidebar ya lo oculta; si alguien navega directo, no se renderiza nada.
  if (!gate.showModule) {
    return null
  }
  if (gate.isEmpty) {
    return (
      <div className="p-6">
        <EmptyState
          icon={<ArrowLeftRight size={48} />}
          title={`Sin canales habilitados en ${activeCompany?.name ?? 'esta empresa'}`}
          description="Pedí a un admin que los active en Admin → Canales."
          action={can('manage_channels') ? (
            <Link href="/admin"><Button>Ir a Admin → Canales</Button></Link>
          ) : undefined}
        />
      </div>
    )
  }

  return (
    <div className="p-6 space-y-4">
      <div>
        <h1 className="text-2xl font-bold flex items-center gap-2">
          <ArrowLeftRight className="w-6 h-6" /> Canales de venta
        </h1>
        <p className="text-sm opacity-60">
          {activeCompany?.name ?? ''} · un catálogo → N canales
        </p>
      </div>

      {/* Tarjetas por canal habilitado (§3.1) */}
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-3">
        {gate.enabledChannels.map(channel => (
          <ChannelCard
            key={channel.id}
            channel={channel}
            stats={statsByChannel[channel.id] ?? { listings: 0, ordersToday: 0, pending: 0, syncPct: null }}
          />
        ))}
      </div>

      {/* Órdenes entrantes (§3.2) */}
      <section aria-label="Órdenes entrantes">
        <h2 className="text-sm font-bold mb-2">Órdenes entrantes</h2>
        {!loadingData && orders.length === 0 ? (
          <EmptyState
            icon={<Inbox size={36} />}
            title="Sin órdenes de canal todavía"
            description="Cuando entren órdenes de los marketplaces (o se carguen manualmente) van a aparecer acá, listas para convertir en documento."
          />
        ) : (
          <DataTable
            data={orders}
            columns={orderColumns}
            loading={loadingData}
            pageSize={10}
            totalLabel="órdenes"
            exportFilename="ordenes-canal"
          />
        )}
      </section>

      {/* Publicaciones (§3.3) */}
      <section aria-label="Publicaciones">
        <h2 className="text-sm font-bold mb-2">Publicaciones</h2>
        {!loadingData && listings.length === 0 ? (
          <EmptyState
            icon={<PackageOpen size={36} />}
            title="Sin publicaciones todavía"
            description={canPublish
              ? 'Creá la primera publicación vinculando un producto del catálogo a un canal.'
              : 'Necesitás el permiso publish_listings para dar de alta publicaciones.'}
            action={canPublish ? <Button onClick={() => setShowNewListing(true)}>+ Nueva publicación</Button> : undefined}
          />
        ) : (
          <DataTable
            data={listings}
            columns={listingColumns}
            loading={loadingData}
            pageSize={10}
            totalLabel="publicaciones"
            exportFilename="publicaciones-canal"
            onNewClick={canPublish ? () => setShowNewListing(true) : undefined}
            newLabel="Nueva publicación"
          />
        )}
      </section>

      <NewListingModal
        isOpen={showNewListing}
        onClose={() => setShowNewListing(false)}
        channels={gate.enabledChannels}
        companyId={defaultCompanyId}
        defaultCurrency={companyCurrency}
        onCreated={() => void loadData()}
      />
    </div>
  )
}
