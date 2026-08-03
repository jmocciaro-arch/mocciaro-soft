'use client'

import { useState, useEffect } from 'react'
import { Modal } from '@/components/ui/modal'
import { Badge } from '@/components/ui/badge'
import { Trophy, TrendingDown, Info, Loader2, AlertTriangle, Crown } from 'lucide-react'
import type { CompetitionAnalysis, CompetitorOffer } from '@/lib/channels/mercadolibre-competition'

/** Mínimo que el modal necesita de una fila de publicación para analizarla. */
export interface AnalyzableListing {
  id: string
  channel_id: string
  external_id: string
  title: string | null
}

interface Props {
  listing: AnalyzableListing | null
  onClose: () => void
}

/** ML listing_type_id → etiqueta legible. */
const LISTING_TYPE_LABELS: Record<string, string> = {
  gold_pro: 'Premium',
  gold_premium: 'Premium',
  gold_special: 'Clásica',
  gold: 'Oro',
  silver: 'Plata',
  bronze: 'Bronce',
  free: 'Gratuita',
}

function fmtMoney(value: number | null, currency: string | null): string {
  if (value == null) return '—'
  const symbol = currency === 'USD' ? 'USD ' : currency === 'EUR' ? '€' : '$'
  return `${symbol}${Number(value).toLocaleString('es-AR', { maximumFractionDigits: 2 })}`
}

function pct(part: number, whole: number): number {
  if (whole === 0) return 0
  return Math.round((part / whole) * 100)
}

function sellerLabel(o: CompetitorOffer): string {
  if (o.is_mine) return 'Vos'
  if (o.seller_nickname) return o.seller_nickname
  return 'Otro vendedor'
}

/**
 * Foto del día de la competencia de una publicación catalogada de ML: Buy Box
 * (quién gana y por qué), benchmark de precio y tu posición. Dispara el análisis
 * al abrirse (POST /api/channels/mercadolibre/analyze-competition). No guarda nada.
 */
export function CompetitionAnalysisModal({ listing, onClose }: Props) {
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [data, setData] = useState<CompetitionAnalysis | null>(null)

  useEffect(() => {
    if (!listing) return
    let cancelled = false
    setLoading(true)
    setError(null)
    setData(null)
    ;(async () => {
      try {
        const res = await fetch('/api/channels/mercadolibre/analyze-competition', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ channel_id: listing.channel_id, listing_id: listing.id }),
        })
        const json = (await res.json()) as { analysis?: CompetitionAnalysis; error?: string }
        if (cancelled) return
        if (!res.ok) { setError(json.error ?? `Error ${res.status}`); return }
        setData(json.analysis ?? null)
      } catch (e) {
        if (!cancelled) setError((e as Error).message)
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()
    return () => { cancelled = true }
  }, [listing])

  return (
    <Modal isOpen={listing !== null} onClose={onClose} title="Análisis de competencia" size="xl">
      <div className="space-y-4">
        <p className="text-sm text-muted truncate">{listing?.title ?? '—'}</p>

        {loading && (
          <div className="flex items-center justify-center gap-2 py-12 text-muted">
            <Loader2 size={18} className="animate-spin" />
            Consultando MercadoLibre…
          </div>
        )}

        {!loading && error && (
          <div className="flex items-start gap-2 rounded-lg border border-red-500/40 bg-red-500/10 px-3 py-3 text-sm text-foreground">
            <AlertTriangle size={16} className="text-red-500 shrink-0 mt-0.5" />
            <span>{error}</span>
          </div>
        )}

        {!loading && !error && data && (
          data.in_catalog ? <InCatalog data={data} /> : <NotInCatalog />
        )}
      </div>
    </Modal>
  )
}

function NotInCatalog() {
  return (
    <div className="flex items-start gap-2 rounded-lg border border-[#FF6600]/40 bg-[#FF6600]/10 px-3 py-3 text-sm text-foreground">
      <Info size={16} className="text-[#FF6600] shrink-0 mt-0.5" />
      <div>
        <p className="font-semibold">Esta publicación no está en Catálogo de MercadoLibre</p>
        <p className="text-[12.5px] text-muted mt-1">
          Para las publicaciones libres, MercadoLibre no expone la competencia por API (cerró el buscador
          general por keyword). El análisis de competencia solo funciona con publicaciones catalogadas, que
          además son las que compiten por el Buy Box.
        </p>
      </div>
    </div>
  )
}

function InCatalog({ data }: { data: CompetitionAnalysis }) {
  const soloYo = data.competitors_count === 1 && data.offers.every(o => o.is_mine)

  return (
    <>
      {data.catalog_name && (
        <p className="text-[12px] text-muted -mt-1">
          Catálogo: <span className="text-foreground">{data.catalog_name}</span>
        </p>
      )}

      <BuyBoxVerdict data={data} soloYo={soloYo} />

      {data.competitors_count > 0 && <PriceBenchmark data={data} />}

      {data.competitors_count > 0 && <OffersTable data={data} />}
    </>
  )
}

function BuyBoxVerdict({ data, soloYo }: { data: CompetitionAnalysis; soloYo: boolean }) {
  if (data.competitors_count === 0) {
    return (
      <Banner tone="muted" icon={<Info size={16} className="text-muted shrink-0 mt-0.5" />}>
        <p className="font-semibold">Sin ofertas activas en este catálogo</p>
        <p className="text-[12.5px] text-muted mt-0.5">No hay con quién comparar en este momento.</p>
      </Banner>
    )
  }

  if (soloYo) {
    return (
      <Banner tone="success" icon={<Crown size={16} className="text-green-500 shrink-0 mt-0.5" />}>
        <p className="font-semibold">Sos el único vendedor en este catálogo</p>
        <p className="text-[12.5px] text-muted mt-0.5">Te llevás toda la venta: no tenés competencia directa hoy.</p>
      </Banner>
    )
  }

  if (data.i_win_buy_box === true) {
    return (
      <Banner tone="success" icon={<Trophy size={16} className="text-green-500 shrink-0 mt-0.5" />}>
        <p className="font-semibold">Estás ganando el Buy Box 🏆</p>
        <p className="text-[12.5px] text-muted mt-0.5">
          Tu publicación se lleva la venta entre {data.competitors_count} competidores.
        </p>
      </Banner>
    )
  }

  if (data.i_win_buy_box === false) {
    const winner = data.winner
    const gap = data.price_gap_to_winner
    return (
      <Banner tone="warning" icon={<TrendingDown size={16} className="text-[#FF6600] shrink-0 mt-0.5" />}>
        <p className="font-semibold">No estás ganando el Buy Box</p>
        <p className="text-[12.5px] text-muted mt-0.5">
          {winner ? <>Gana <span className="text-foreground font-medium">{winner.seller_nickname ?? 'otro vendedor'}</span> a <span className="text-foreground font-medium">{fmtMoney(winner.price, data.currency)}</span></> : 'Otro vendedor lleva la delantera'}
          {gap != null && gap > 0 && winner?.price != null && (
            <> · estás <span className="text-[#FF6600] font-medium">{fmtMoney(gap, data.currency)} más caro</span> ({pct(gap, winner.price)}%)</>
          )}
        </p>
      </Banner>
    )
  }

  // i_win_buy_box === null con competidores: ML no declaró ganador.
  return (
    <Banner tone="muted" icon={<Info size={16} className="text-muted shrink-0 mt-0.5" />}>
      <p className="font-semibold">MercadoLibre no asignó un ganador del Buy Box</p>
      <p className="text-[12.5px] text-muted mt-0.5">Igual podés comparar precios contra {data.competitors_count} competidores abajo.</p>
    </Banner>
  )
}

function PriceBenchmark({ data }: { data: CompetitionAnalysis }) {
  const cells: { label: string; value: string; highlight?: boolean }[] = [
    { label: 'Tu precio', value: fmtMoney(data.my_price, data.currency), highlight: true },
    { label: 'Más barato', value: fmtMoney(data.price_min, data.currency) },
    { label: 'Promedio', value: fmtMoney(data.price_avg, data.currency) },
    { label: 'Más caro', value: fmtMoney(data.price_max, data.currency) },
    {
      label: 'Tu posición',
      value: data.my_price_rank != null ? `#${data.my_price_rank} de ${data.competitors_count}` : '—',
    },
  ]
  return (
    <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
      {cells.map(c => (
        <div
          key={c.label}
          className={`rounded-lg border px-3 py-2 ${c.highlight ? 'border-[#FF6600]/50 bg-[#FF6600]/10' : 'border-border bg-card'}`}
        >
          <p className="text-[10px] uppercase tracking-wider font-bold text-muted">{c.label}</p>
          <p className="text-sm font-mono font-semibold text-foreground mt-0.5">{c.value}</p>
        </div>
      ))}
    </div>
  )
}

function OffersTable({ data }: { data: CompetitionAnalysis }) {
  return (
    <div className="overflow-x-auto rounded-lg border border-border">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-border text-[11px] uppercase tracking-wider text-muted">
            <th className="text-left font-bold px-3 py-2">#</th>
            <th className="text-left font-bold px-3 py-2">Vendedor</th>
            <th className="text-right font-bold px-3 py-2">Precio</th>
            <th className="text-left font-bold px-3 py-2">Tipo</th>
            <th className="text-center font-bold px-3 py-2">Envío gratis</th>
            <th className="text-left font-bold px-3 py-2"></th>
          </tr>
        </thead>
        <tbody>
          {data.offers.map((o, i) => (
            <tr
              key={o.item_id}
              className={`border-b border-border last:border-0 ${o.is_mine ? 'bg-[#FF6600]/10' : ''}`}
            >
              <td className="px-3 py-2 text-muted font-mono">{i + 1}</td>
              <td className="px-3 py-2 text-foreground">{sellerLabel(o)}</td>
              <td className="px-3 py-2 text-right font-mono text-foreground">{fmtMoney(o.price, o.currency)}</td>
              <td className="px-3 py-2 text-muted">{o.listing_type_id ? (LISTING_TYPE_LABELS[o.listing_type_id] ?? o.listing_type_id) : '—'}</td>
              <td className="px-3 py-2 text-center">{o.free_shipping ? '✓' : '—'}</td>
              <td className="px-3 py-2">
                <div className="flex gap-1">
                  {o.is_winner && <Badge variant="success">Gana</Badge>}
                  {o.is_mine && <Badge variant="orange">Vos</Badge>}
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

function Banner({
  tone,
  icon,
  children,
}: {
  tone: 'success' | 'warning' | 'muted'
  icon: React.ReactNode
  children: React.ReactNode
}) {
  const cls = tone === 'success'
    ? 'border-green-500/40 bg-green-500/10'
    : tone === 'warning'
      ? 'border-[#FF6600]/40 bg-[#FF6600]/10'
      : 'border-border bg-card'
  return (
    <div className={`flex items-start gap-2 rounded-lg border px-3 py-3 text-sm text-foreground ${cls}`}>
      {icon}
      <div className="min-w-0">{children}</div>
    </div>
  )
}
