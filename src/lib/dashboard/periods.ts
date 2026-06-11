/**
 * Períodos del dashboard ejecutivo (SPEC-dashboard-canales.md §2.1).
 *
 * Cada período define una ventana actual, la ventana anterior equivalente
 * (para el trend chip ▲/▼) y una ventana de 8 períodos para la sparkline.
 * Lógica pura, sin React ni Supabase, para testearla con Vitest.
 */

export type PeriodKey = 'hoy' | 'd7' | 'd30' | 'trim'

export const DEFAULT_PERIOD: PeriodKey = 'd30'
export const SPARK_BUCKETS = 8

export const PERIOD_OPTIONS: { value: PeriodKey; label: string }[] = [
  { value: 'hoy', label: 'Hoy' },
  { value: 'd7', label: '7 días' },
  { value: 'd30', label: '30 días' },
  { value: 'trim', label: 'Trimestre' },
]

export const PERIOD_LABELS: Record<PeriodKey, string> = {
  hoy: 'Hoy',
  d7: 'Últimos 7 días',
  d30: 'Últimos 30 días',
  trim: 'Trimestre',
}

const PERIOD_DAYS: Record<PeriodKey, number> = { hoy: 1, d7: 7, d30: 30, trim: 91 }
const DAY_MS = 86_400_000

export function isPeriodKey(value: string | null | undefined): value is PeriodKey {
  return value === 'hoy' || value === 'd7' || value === 'd30' || value === 'trim'
}

export interface PeriodWindow {
  /** Inicio del período actual. */
  from: Date
  /** Fin del período actual (ahora). */
  to: Date
  /** Inicio del período anterior equivalente (termina en `from`). */
  prevFrom: Date
  /** Inicio de la ventana de sparkline: SPARK_BUCKETS períodos hacia atrás. */
  sparkFrom: Date
  /** Duración de un período en ms (= un bucket de sparkline). */
  bucketMs: number
}

export function periodWindow(key: PeriodKey, now: Date = new Date()): PeriodWindow {
  const bucketMs = PERIOD_DAYS[key] * DAY_MS
  const to = now
  // "Hoy" arranca a las 00:00 locales; el resto son ventanas móviles que terminan ahora.
  const from = key === 'hoy'
    ? new Date(now.getFullYear(), now.getMonth(), now.getDate())
    : new Date(to.getTime() - bucketMs)
  return {
    from,
    to,
    prevFrom: new Date(from.getTime() - bucketMs),
    sparkFrom: new Date(from.getTime() - bucketMs * (SPARK_BUCKETS - 1)),
    bucketMs,
  }
}

export interface DatedValue {
  date: string | null
  value: number
}

/**
 * Suma por bucket para la sparkline: `buckets` ventanas consecutivas de
 * `bucketMs`, desde `sparkFrom` hasta `to` (la última = período actual).
 * Filas sin fecha o fuera de rango se ignoran.
 */
export function bucketize(rows: DatedValue[], win: PeriodWindow, buckets: number = SPARK_BUCKETS): number[] {
  const out = new Array<number>(buckets).fill(0)
  const start = win.sparkFrom.getTime()
  const end = win.to.getTime()
  for (const row of rows) {
    if (!row.date) continue
    const t = new Date(row.date).getTime()
    if (Number.isNaN(t) || t < start || t > end) continue
    out[Math.min(buckets - 1, Math.floor((t - start) / win.bucketMs))] += Number(row.value || 0)
  }
  return out
}

/**
 * Regla de la spec: "Sin datos suficientes para sparkline → ocultarla, no inventar".
 * Suficiente = al menos 2 buckets con movimiento real.
 */
export function hasSparkData(buckets: number[]): boolean {
  return buckets.filter(v => v !== 0).length >= 2
}

export function sumBetween(rows: DatedValue[], from: Date, to: Date): number {
  let sum = 0
  for (const row of rows) {
    if (!row.date) continue
    const t = new Date(row.date).getTime()
    if (!Number.isNaN(t) && t >= from.getTime() && t <= to.getTime()) sum += Number(row.value || 0)
  }
  return sum
}

export function countBetween(rows: DatedValue[], from: Date, to: Date): number {
  let count = 0
  for (const row of rows) {
    if (!row.date) continue
    const t = new Date(row.date).getTime()
    if (!Number.isNaN(t) && t >= from.getTime() && t <= to.getTime()) count++
  }
  return count
}
