'use client'

/**
 * ProductTierPricesTab
 * Grid de precios: 3 tiers (PVP, Cliente A, Distribuidor) × 3 monedas (ARS, USD, EUR)
 * - Cada tier tiene una moneda base (editable) y las otras 2 se autocalculan con cotización BNA.
 * - Costo y precio mínimo también con moneda base.
 * - Botón "Actualizar cotización BNA" para forzar refresh.
 */

import { useEffect, useMemo, useState, useCallback } from 'react'
import { TrendingUp, TrendingDown, DollarSign, RefreshCw, Info, AlertCircle, Lock } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'

export type Currency = 'ARS' | 'USD' | 'EUR'

export interface TierPriceRow {
  tier_code:     string
  base_currency: Currency
  base_price:    number | null
  // cache derivados
  price_ars:     number | null
  price_usd:     number | null
  price_eur:     number | null
}

export interface PriceTier {
  code: string
  name: string
  sort_order: number
  description: string | null
  discount_hint: number | null
}

export interface ExchangeRateMap {
  USD: number
  EUR: number
  date: string | null
}

interface Props {
  tiers: PriceTier[]
  rates: ExchangeRateMap
  prices: Record<string, TierPriceRow>  // key = tier_code
  onChange: (tierCode: string, field: keyof TierPriceRow, value: string | number | null) => void
  // Costo + mínimo (columnas en tt_products)
  cost: { currency: Currency | null; price: number | null }
  onCostChange: (field: 'currency' | 'price', value: Currency | number | null) => void
  minSale: { currency: Currency | null; price: number | null }
  onMinSaleChange: (field: 'currency' | 'price', value: Currency | number | null) => void
  onRefreshRates?: () => Promise<void>
  refreshing?: boolean
}

const CURRENCIES: Currency[] = ['ARS', 'USD', 'EUR']
const CURRENCY_SYMBOL: Record<Currency, string> = { ARS: '$', USD: 'US$', EUR: '€' }

/**
 * Convierte un monto de base_currency a target_currency usando cotización
 * Cotizaciones son valor del ARS por 1 unidad de moneda extranjera.
 * Ej: USD=1364.5 significa 1 USD = 1364.5 ARS
 */
function convert(amount: number, from: Currency, to: Currency, rates: ExchangeRateMap): number | null {
  if (from === to) return amount
  if (!isFinite(amount)) return null

  // Convertir todo a ARS primero
  let arsAmount: number
  if (from === 'ARS') arsAmount = amount
  else if (from === 'USD') arsAmount = amount * (rates.USD || 0)
  else if (from === 'EUR') arsAmount = amount * (rates.EUR || 0)
  else return null

  if (!arsAmount) return null

  // Luego de ARS a target
  if (to === 'ARS') return arsAmount
  if (to === 'USD') return rates.USD ? arsAmount / rates.USD : null
  if (to === 'EUR') return rates.EUR ? arsAmount / rates.EUR : null
  return null
}

function formatMoney(amount: number | null, currency: Currency): string {
  if (amount == null || !isFinite(amount)) return '—'
  return `${CURRENCY_SYMBOL[currency]} ${amount.toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}

export function ProductTierPricesTab(props: Props) {
  const { tiers, rates, prices, onChange, cost, onCostChange, minSale, onMinSaleChange, onRefreshRates, refreshing } = props
  const hasRates = rates.USD > 0 && rates.EUR > 0

  return (
    <div className="space-y-5">
      {/* ======== COTIZACIONES BANNER ======== */}
      <div className={`rounded-xl p-4 flex items-center gap-3 ${hasRates ? 'bg-[#0F1218] border border-[#1E2330]' : 'bg-red-950/30 border border-red-500/30'}`}>
        {hasRates ? (
          <>
            <DollarSign size={18} className="text-[#FF6600] shrink-0" />
            <div className="flex-1 text-xs text-[#9CA3AF]">
              <strong className="text-[#FF6600]">Cotización BNA</strong>
              {rates.date && <span className="text-[#6B7280]"> del {rates.date}</span>}
              {' · '}
              <span className="text-[#F0F2F5] font-mono">USD {rates.USD.toFixed(2)}</span>
              {' · '}
              <span className="text-[#F0F2F5] font-mono">EUR {rates.EUR.toFixed(2)}</span>
            </div>
          </>
        ) : (
          <>
            <AlertCircle size={18} className="text-red-400 shrink-0" />
            <div className="flex-1 text-xs text-red-300">
              Sin cotización cargada. Apretá <strong>Actualizar BNA</strong> para convertir automáticamente entre monedas.
            </div>
          </>
        )}
        {onRefreshRates && (
          <button
            type="button"
            onClick={onRefreshRates}
            disabled={refreshing}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[11px] font-bold bg-[#FF6600]/10 hover:bg-[#FF6600] border border-[#FF6600]/30 hover:border-[#FF6600] text-[#FF6600] hover:text-white transition-all disabled:opacity-50"
          >
            <RefreshCw size={12} className={refreshing ? 'animate-spin' : ''} />
            {refreshing ? 'Actualizando…' : 'Actualizar BNA'}
          </button>
        )}
      </div>

      {/* ======== GRID DE TIERS ======== */}
      <div>
        <p className="text-[11px] font-semibold uppercase tracking-wider text-[#6B7280] mb-2 flex items-center gap-1.5">
          <Info size={11} />
          Precios por tier — editá cualquier celda y las otras monedas se recalculan
        </p>

        {/* Cabecera */}
        <div className="grid grid-cols-[180px_1fr_1fr_1fr_90px] gap-2 px-3 py-2 text-[10px] font-bold uppercase tracking-wider text-[#4B5563] border-b border-[#1E2330]">
          <span>Tier</span>
          <span className="text-center">ARS</span>
          <span className="text-center">USD</span>
          <span className="text-center">EUR</span>
          <span className="text-right">vs PVP</span>
        </div>

        {tiers.map((tier, idx) => {
          const row = prices[tier.code] || {
            tier_code: tier.code,
            base_currency: 'USD' as Currency,
            base_price: null,
            price_ars: null, price_usd: null, price_eur: null,
          }
          const base = row.base_price
          const baseCurr = row.base_currency

          // Calcular valores derivados en vivo
          const derived: Record<Currency, number | null> = {
            ARS: base != null ? convert(base, baseCurr, 'ARS', rates) : null,
            USD: base != null ? convert(base, baseCurr, 'USD', rates) : null,
            EUR: base != null ? convert(base, baseCurr, 'EUR', rates) : null,
          }

          // Comparación vs PVP (primer tier)
          const pvpRow = prices[tiers[0]?.code]
          const pvpInUsd = pvpRow?.base_price != null ? convert(pvpRow.base_price, pvpRow.base_currency, 'USD', rates) : null
          const thisInUsd = derived.USD
          const diffPct = (idx > 0 && pvpInUsd && thisInUsd) ? ((thisInUsd - pvpInUsd) / pvpInUsd) * 100 : null

          return (
            <div
              key={tier.code}
              className={`grid grid-cols-[180px_1fr_1fr_1fr_90px] gap-2 p-3 items-center border-b border-[#1E2330] last:border-b-0 ${idx === 0 ? 'bg-[#FF6600]/5' : ''}`}
            >
              {/* Tier name */}
              <div className="min-w-0">
                <p className={`text-sm font-bold ${idx === 0 ? 'text-[#FF6600]' : 'text-[#F0F2F5]'}`}>{tier.name}</p>
                {tier.description && <p className="text-[10px] text-[#6B7280] truncate">{tier.description}</p>}
              </div>

              {/* Celda por moneda */}
              {CURRENCIES.map((curr) => {
                const isBase = baseCurr === curr
                const displayValue = isBase ? (base ?? '') : (derived[curr] ?? '')
                const formatted = isBase ? String(displayValue) : (derived[curr] != null ? derived[curr]!.toFixed(2) : '')

                return (
                  <div key={curr} className="relative">
                    <input
                      type="number"
                      step="0.01"
                      min="0"
                      value={formatted}
                      placeholder={CURRENCY_SYMBOL[curr]}
                      onChange={(e) => {
                        const val = e.target.value ? parseFloat(e.target.value) : null
                        onChange(tier.code, 'base_currency', curr)
                        onChange(tier.code, 'base_price', val)
                      }}
                      onFocus={(e) => {
                        // Al hacer focus, si no era la base, cambiar la base a esta moneda
                        if (!isBase && derived[curr] != null) {
                          onChange(tier.code, 'base_currency', curr)
                          onChange(tier.code, 'base_price', parseFloat(derived[curr]!.toFixed(2)))
                        }
                        e.currentTarget.select()
                      }}
                      className={`w-full h-10 rounded-lg pr-2 pl-8 text-sm font-mono transition-all focus:outline-none focus:ring-1 ${
                        isBase
                          ? 'bg-[#FF6600]/10 border-2 border-[#FF6600] text-[#F0F2F5] focus:ring-[#FF6600]'
                          : 'bg-[#1E2330] border border-[#2A3040] text-[#9CA3AF] focus:ring-orange-500/50 focus:border-orange-500/50'
                      } ${!hasRates && !isBase ? 'opacity-50' : ''}`}
                      disabled={!hasRates && !isBase && base != null}
                    />
                    <span className={`absolute left-2 top-1/2 -translate-y-1/2 text-[10px] font-bold pointer-events-none ${isBase ? 'text-[#FF6600]' : 'text-[#4B5563]'}`}>
                      {CURRENCY_SYMBOL[curr]}
                    </span>
                    {isBase && (
                      <Lock size={9} className="absolute right-2 top-1/2 -translate-y-1/2 text-[#FF6600] pointer-events-none" />
                    )}
                  </div>
                )
              })}

              {/* Diff vs PVP */}
              <div className="text-right">
                {diffPct != null ? (
                  <span className={`text-xs font-bold ${diffPct < 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                    {diffPct > 0 ? '+' : ''}{diffPct.toFixed(1)}%
                  </span>
                ) : (
                  <span className="text-[10px] text-[#374151]">—</span>
                )}
              </div>
            </div>
          )
        })}
      </div>

      {/* ======== COSTO + PRECIO MINIMO ======== */}
      <div className="rounded-xl bg-[#0A0D12] border border-[#1E2330] p-4 space-y-3">
        <p className="text-[11px] font-semibold uppercase tracking-wider text-[#6B7280]">
          Costo y Precio Mínimo (editables manualmente o por CSV)
        </p>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {/* Costo */}
          <div className="flex items-center gap-2 p-3 rounded-lg bg-[#141820] border border-[#1E2330]">
            <TrendingDown size={14} className="text-blue-400 shrink-0" />
            <div className="flex-1">
              <label className="block text-[10px] font-semibold uppercase tracking-wider text-[#6B7280] mb-1">Costo</label>
              <div className="flex gap-1">
                <select
                  value={cost.currency || 'USD'}
                  onChange={(e) => onCostChange('currency', e.target.value as Currency)}
                  className="w-16 h-8 rounded bg-[#1E2330] border border-[#2A3040] text-[11px] font-mono text-[#F0F2F5] px-1 focus:outline-none"
                >
                  {CURRENCIES.map(c => <option key={c} value={c}>{c}</option>)}
                </select>
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  value={cost.price ?? ''}
                  onChange={(e) => onCostChange('price', e.target.value ? parseFloat(e.target.value) : null)}
                  placeholder="0.00"
                  className="flex-1 h-8 rounded bg-[#1E2330] border border-[#2A3040] px-2 text-sm font-mono text-[#F0F2F5] focus:outline-none focus:ring-1 focus:ring-blue-500/50"
                />
              </div>
            </div>
          </div>

          {/* Precio mínimo */}
          <div className="flex items-center gap-2 p-3 rounded-lg bg-[#141820] border border-[#1E2330]">
            <TrendingUp size={14} className="text-emerald-400 shrink-0" />
            <div className="flex-1">
              <label className="block text-[10px] font-semibold uppercase tracking-wider text-[#6B7280] mb-1">Mínimo de venta</label>
              <div className="flex gap-1">
                <select
                  value={minSale.currency || 'USD'}
                  onChange={(e) => onMinSaleChange('currency', e.target.value as Currency)}
                  className="w-16 h-8 rounded bg-[#1E2330] border border-[#2A3040] text-[11px] font-mono text-[#F0F2F5] px-1 focus:outline-none"
                >
                  {CURRENCIES.map(c => <option key={c} value={c}>{c}</option>)}
                </select>
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  value={minSale.price ?? ''}
                  onChange={(e) => onMinSaleChange('price', e.target.value ? parseFloat(e.target.value) : null)}
                  placeholder="0.00"
                  className="flex-1 h-8 rounded bg-[#1E2330] border border-[#2A3040] px-2 text-sm font-mono text-[#F0F2F5] focus:outline-none focus:ring-1 focus:ring-emerald-500/50"
                />
              </div>
            </div>
          </div>
        </div>

        {/* Margen vs PVP calculado */}
        {cost.price != null && prices[tiers[0]?.code]?.base_price != null && (
          <MarginBadge
            cost={cost}
            pvp={prices[tiers[0].code]}
            rates={rates}
          />
        )}
      </div>

      <p className="text-[10px] text-[#374151] flex items-center gap-1.5">
        <Info size={10} />
        Tip: editá la celda de la moneda en la que conocés el precio. Las otras se recalculan con cotización del día.
      </p>
    </div>
  )
}

function MarginBadge({ cost, pvp, rates }: {
  cost: { currency: Currency | null; price: number | null }
  pvp: TierPriceRow
  rates: ExchangeRateMap
}) {
  if (!cost.price || !cost.currency || !pvp.base_price) return null

  // Convertir ambos a USD para comparar
  const costUSD = convert(cost.price, cost.currency, 'USD', rates)
  const pvpUSD = convert(pvp.base_price, pvp.base_currency, 'USD', rates)

  if (!costUSD || !pvpUSD) return null
  const margin = ((pvpUSD - costUSD) / pvpUSD) * 100
  const color = margin > 30 ? 'text-emerald-400' : margin > 15 ? 'text-yellow-400' : 'text-red-400'

  return (
    <div className="flex items-center justify-between pt-2 border-t border-[#1E2330]">
      <span className="text-[10px] text-[#6B7280] uppercase tracking-wider">Margen PVP sobre costo</span>
      <span className={`text-sm font-bold ${color}`}>
        {margin.toFixed(1)}%
      </span>
    </div>
  )
}

/**
 * Hook helper para traer cotizaciones, tiers y precios del producto
 */
export function useProductPricing(productId: string | null) {
  const [tiers, setTiers] = useState<PriceTier[]>([])
  const [rates, setRates] = useState<ExchangeRateMap>({ USD: 0, EUR: 0, date: null })
  const [prices, setPrices] = useState<Record<string, TierPriceRow>>({})
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)

  const loadTiersAndRates = useCallback(async () => {
    const sb = createClient()
    const [tiersRes, usdRes, eurRes] = await Promise.all([
      sb.from('tt_price_tiers').select('*').eq('active', true).order('sort_order'),
      sb.from('tt_exchange_rates').select('sell, rate_date').eq('currency_code', 'USD').order('rate_date', { ascending: false }).limit(1),
      sb.from('tt_exchange_rates').select('sell, rate_date').eq('currency_code', 'EUR').order('rate_date', { ascending: false }).limit(1),
    ])
    setTiers((tiersRes.data || []) as PriceTier[])
    const usdRow = usdRes.data?.[0] as { sell: number; rate_date: string } | undefined
    const eurRow = eurRes.data?.[0] as { sell: number; rate_date: string } | undefined
    setRates({
      USD: usdRow?.sell ? Number(usdRow.sell) : 0,
      EUR: eurRow?.sell ? Number(eurRow.sell) : 0,
      date: usdRow?.rate_date || eurRow?.rate_date || null,
    })
  }, [])

  const loadPrices = useCallback(async () => {
    if (!productId) { setPrices({}); return }
    const sb = createClient()
    const { data } = await sb.from('tt_product_tier_prices')
      .select('*')
      .eq('product_id', productId)
      .is('company_id', null)
    const map: Record<string, TierPriceRow> = {}
    ;(data || []).forEach((r: Record<string, unknown>) => {
      map[r.tier_code as string] = {
        tier_code:     r.tier_code as string,
        base_currency: r.base_currency as Currency,
        base_price:    r.base_price as number | null,
        price_ars:     r.price_ars as number | null,
        price_usd:     r.price_usd as number | null,
        price_eur:     r.price_eur as number | null,
      }
    })
    setPrices(map)
  }, [productId])

  useEffect(() => {
    setLoading(true)
    Promise.all([loadTiersAndRates(), loadPrices()]).finally(() => setLoading(false))
  }, [loadTiersAndRates, loadPrices])

  const refreshRates = useCallback(async () => {
    setRefreshing(true)
    try {
      const res = await fetch('/api/exchange-rates/update', { method: 'POST' })
      if (res.ok) await loadTiersAndRates()
    } finally {
      setRefreshing(false)
    }
  }, [loadTiersAndRates])

  return { tiers, rates, prices, setPrices, loading, refreshing, refreshRates, reload: loadPrices }
}

/**
 * Guarda los precios de tiers en la DB.
 * Calcula los derivados usando las cotizaciones actuales.
 */
export async function saveTierPrices(
  productId: string,
  prices: Record<string, TierPriceRow>,
  rates: ExchangeRateMap,
  rateDate: string | null,
): Promise<{ ok: boolean; error?: string }> {
  const sb = createClient()
  const rows = Object.values(prices)
    .filter(r => r.base_price != null)
    .map(r => ({
      product_id:     productId,
      company_id:     null,
      tier_code:      r.tier_code,
      base_currency:  r.base_currency,
      base_price:     r.base_price,
      price_ars:      convert(r.base_price!, r.base_currency, 'ARS', rates),
      price_usd:      convert(r.base_price!, r.base_currency, 'USD', rates),
      price_eur:      convert(r.base_price!, r.base_currency, 'EUR', rates),
      exchange_rate_date: rateDate,
      updated_at:     new Date().toISOString(),
    }))

  if (rows.length === 0) return { ok: true }

  const { error } = await sb
    .from('tt_product_tier_prices')
    .upsert(rows, { onConflict: 'product_id,company_id,tier_code' })

  if (error) return { ok: false, error: error.message }
  return { ok: true }
}
