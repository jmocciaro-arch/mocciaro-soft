/**
 * src/lib/sat/currency-converter.ts
 *
 * Conversion entre USD, EUR y ARS usando tipos de cambio configurables.
 * Mantiene precision de 2 decimales al redondear precios.
 */

import type { Currency } from './fein-data'

export interface ExchangeRates {
  usd_ars: number   // 1 USD = X ARS
  usd_eur: number   // 1 USD = X EUR (ej: 0.91)
}

export const DEFAULT_RATES: ExchangeRates = {
  usd_ars: 1200,
  usd_eur: 0.91,
}

/** Convierte un precio de una moneda a USD */
export function toUSD(price: number, from: Currency, rates: ExchangeRates = DEFAULT_RATES): number {
  if (from === 'USD') return price
  if (from === 'ARS') return price / rates.usd_ars
  if (from === 'EUR') return price / rates.usd_eur
  return price
}

/** Convierte desde USD a una moneda destino */
export function fromUSD(price: number, to: Currency, rates: ExchangeRates = DEFAULT_RATES): number {
  if (to === 'USD') return price
  if (to === 'ARS') return price * rates.usd_ars
  if (to === 'EUR') return price * rates.usd_eur
  return price
}

/** Conversion directa entre dos monedas */
export function convert(price: number, from: Currency, to: Currency, rates: ExchangeRates = DEFAULT_RATES): number {
  if (from === to) return price
  const usd = toUSD(price, from, rates)
  return Math.round(fromUSD(usd, to, rates) * 100) / 100
}

/** Formato de numero con separadores en-us (1,234.56) */
export function fmtNumber(n: number): string {
  return n.toLocaleString('es-AR', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })
}

/** Formato de precio con simbolo */
export function fmtPrice(n: number, currency: Currency): string {
  const symbols: Record<Currency, string> = { USD: 'USD $', EUR: '€', ARS: 'ARS $' }
  return `${symbols[currency]} ${fmtNumber(n)}`
}
