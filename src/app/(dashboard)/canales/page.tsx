'use client'

import { useState, useEffect, useCallback, useMemo } from 'react'
import Link from 'next/link'
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
import { EditListingModal, type EditableListing } from '@/components/channels/edit-listing-modal'
import { ArrowLeftRight, Inbox, PackageOpen, RefreshCw, Pencil } from 'lucide-react'
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
  /** El embed many-to-one puede llegar como objeto o array según el client. */
  document: { system_code: string | null } | { system_code: string | null }[] | null
}

function docCodeOf(document: OrderRow['document']): string | null {
  if (!document) return null
  const d = Array.isArray(document) ? document[0] : document
  return d?.system_code ?? null
}

interface ListingRow extends Record<string, unknown> {
  id: string
  channel_id: string
  external_id: string | null
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
  const { companyIds, companyKey, defaultCompanyId } = useCompanyFilter()
  const { activeCompany } = useCompanyContext()
  const { addToast } = useToast()

  const [orders, setOrders] = useState<OrderRow[]>([])
  const [listings, setListings] = useState<ListingRow[]>([])
  const [loadingData, setLoadingData] = useState(true)
  const [creatingId, setCreatingId] = useState<string | null>(null)
  const [showNewListing, setShowNewListing] = useState(false)
  const [editing, setEditing] = useState<EditableListing | null>(null)
  const [syncing, setSyncing] = useState(false)

  const canManageOrders = can('manage_channel_orders')
  const canManageChannels = can('manage_channels')
  const canPublish = can('publish_listings')
  const companyCurrency = (activeCompany as { currency?: string } | null)?.currency || 'EUR'

  const loadData = useCallback(async () => {
    if (companyIds.length === 0) return
    setLoadingData(true)
    try {
      // Vía GET /api/channels: la RLS de tt_channel_* es company-scoped por la
      // empresa DEFAULT del usuario, no por la empresa activa del selector
      const res = await fetch(`/api/channels?company_id=${companyIds.join(',')}&include=orders,listings`)
      if (!res.ok) {
        setOrders([])
        setListings([])
        return
      }
      const json = await res.json() as { orders?: OrderRow[]; listings?: ListingRow[] }
      setOrders(json.orders ?? [])
      setListings(json.listings ?? [])
    } finally {
      setLoadingData(false)
    }
    // companyIds cambia de identidad por render; companyKey es la dep estable (mismo patrón que calendario)
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

  // Sincroniza publicaciones de TODOS los canales MercadoLibre habilitados y
  // conectados. Un canal sin conexión devuelve 409 y se reporta sin frenar al resto.
  const syncListings = useCallback(async () => {
    const mlChannels = gate.enabledChannels.filter(c => c.code === 'mercadolibre')
    if (mlChannels.length === 0) {
      addToast({ type: 'info', title: 'No hay canales de MercadoLibre habilitados' })
      return
    }
    setSyncing(true)
    try {
      let total = 0
      const fails: string[] = []
      for (const ch of mlChannels) {
        const res = await fetch('/api/channels/mercadolibre/sync-listings', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ channel_id: ch.id }),
        })
        const json = await res.json() as { synced?: number; error?: string }
        if (!res.ok) fails.push(`${ch.label}: ${json.error ?? 'error'}`)
        else total += json.synced ?? 0
      }
      if (fails.length > 0) {
        addToast({ type: total > 0 ? 'warning' : 'error', title: `Sincronizadas ${total} publicaciones`, message: fails.join(' · ') })
      } else {
        addToast({ type: 'success', title: `${total} publicaciones sincronizadas desde MercadoLibre` })
      }
      await loadData()
    } finally {
      setSyncing(false)
    }
  }, [gate.enabledChannels, addToast, loadData])

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
        if (v) return <span className="font-mono text-[12px]">{docCodeOf(r.document) ?? 'Vinculado'}</span>
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
    {
      key: 'id', label: '', width: '90px',
      render: (_v, row) => {
        const r = row as ListingRow
        // Solo se editan en ML las publicaciones con external_id (las traídas por sync).
        if (!canManageChannels || !r.external_id) return null
        return (
          <Button size="sm" variant="secondary" onClick={() => setEditing({
            id: r.id, title: r.title, price: r.price, currency: r.currency,
            stock_published: r.stock_published, status: r.status,
          })}>
            <Pencil size={13} /> Editar
          </Button>
        )
      },
    },
  ], [channelLabels, canManageChannels]) // eslint-disable-line react-hooks/exhaustive-deps

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
        <div className="flex items-center justify-between mb-2">
          <h2 className="text-sm font-bold">Publicaciones</h2>
          {canManageChannels && gate.enabledChannels.some(c => c.code === 'mercadolibre') && (
            <Button size="sm" variant="secondary" onClick={() => void syncListings()} disabled={syncing}>
              <RefreshCw size={14} className={syncing ? 'animate-spin' : ''} />
              {syncing ? 'Sincronizando…' : 'Sincronizar publicaciones'}
            </Button>
          )}
        </div>
        {!loadingData && listings.length === 0 ? (
          <EmptyState
            icon={<PackageOpen size={36} />}
            title="Sin publicaciones todavía"
            description={canManageChannels
              ? 'Sincronizá desde MercadoLibre para traer todas tus publicaciones, o creá una manual vinculando un producto del catálogo.'
              : canPublish
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

      <EditListingModal
        listing={editing}
        onClose={() => setEditing(null)}
        onSaved={() => void loadData()}
      />
    </div>
  )
}
