import { describe, it, expect } from 'vitest'
import {
  periodWindow, bucketize, hasSparkData, sumBetween, countBetween,
  isPeriodKey, DEFAULT_PERIOD, SPARK_BUCKETS,
} from '@/lib/dashboard/periods'

const NOW = new Date('2026-06-10T15:00:00.000Z')
const DAY = 86_400_000

describe('isPeriodKey', () => {
  it('acepta los 4 períodos válidos y rechaza el resto', () => {
    expect(isPeriodKey('hoy')).toBe(true)
    expect(isPeriodKey('d7')).toBe(true)
    expect(isPeriodKey('d30')).toBe(true)
    expect(isPeriodKey('trim')).toBe(true)
    expect(isPeriodKey('d90')).toBe(false)
    expect(isPeriodKey(null)).toBe(false)
    expect(isPeriodKey(undefined)).toBe(false)
  })

  it('el default es 30 días (spec §2.1)', () => {
    expect(DEFAULT_PERIOD).toBe('d30')
  })
})

describe('periodWindow', () => {
  it('d30: ventana móvil de 30 días, anterior equivalente y sparkline de 8 períodos', () => {
    const win = periodWindow('d30', NOW)
    expect(win.to).toEqual(NOW)
    expect(NOW.getTime() - win.from.getTime()).toBe(30 * DAY)
    expect(win.from.getTime() - win.prevFrom.getTime()).toBe(30 * DAY)
    // 8 buckets: sparkFrom está 7 períodos antes del inicio del actual
    expect(win.from.getTime() - win.sparkFrom.getTime()).toBe(30 * DAY * (SPARK_BUCKETS - 1))
    expect(win.bucketMs).toBe(30 * DAY)
  })

  it('hoy: arranca a las 00:00 locales', () => {
    const win = periodWindow('hoy', NOW)
    expect(win.from.getHours()).toBe(0)
    expect(win.from.getMinutes()).toBe(0)
    expect(win.from.getTime()).toBeLessThanOrEqual(NOW.getTime())
    expect(win.bucketMs).toBe(DAY)
  })

  it('trim: 91 días', () => {
    const win = periodWindow('trim', NOW)
    expect(NOW.getTime() - win.from.getTime()).toBe(91 * DAY)
  })
})

describe('bucketize', () => {
  const win = periodWindow('d7', NOW)

  it('acumula cada fila en su bucket y el último bucket es el período actual', () => {
    const inCurrent = new Date(NOW.getTime() - 2 * DAY).toISOString()
    const inFirst = new Date(win.sparkFrom.getTime() + DAY).toISOString()
    const buckets = bucketize([
      { date: inCurrent, value: 100 },
      { date: inCurrent, value: 50 },
      { date: inFirst, value: 7 },
    ], win)
    expect(buckets).toHaveLength(SPARK_BUCKETS)
    expect(buckets[SPARK_BUCKETS - 1]).toBe(150)
    expect(buckets[0]).toBe(7)
    // consistencia con la suma del período actual
    expect(buckets[SPARK_BUCKETS - 1]).toBe(sumBetween([{ date: inCurrent, value: 150 }], win.from, win.to))
  })

  it('ignora filas sin fecha, fuera de rango o con fecha inválida', () => {
    const buckets = bucketize([
      { date: null, value: 100 },
      { date: new Date(win.sparkFrom.getTime() - DAY).toISOString(), value: 100 },
      { date: new Date(NOW.getTime() + DAY).toISOString(), value: 100 },
      { date: 'no-es-fecha', value: 100 },
    ], win)
    expect(buckets.every(v => v === 0)).toBe(true)
  })
})

describe('hasSparkData — "sin datos suficientes → ocultarla, no inventar"', () => {
  it('todo en cero → no hay sparkline', () => {
    expect(hasSparkData([0, 0, 0, 0, 0, 0, 0, 0])).toBe(false)
  })
  it('un solo bucket con datos → no alcanza', () => {
    expect(hasSparkData([0, 0, 0, 0, 0, 0, 0, 5])).toBe(false)
  })
  it('dos o más buckets con datos → se muestra', () => {
    expect(hasSparkData([0, 3, 0, 0, 0, 0, 0, 5])).toBe(true)
  })
})

describe('countBetween', () => {
  it('cuenta solo lo que cae en la ventana', () => {
    const win = periodWindow('d7', NOW)
    const rows = [
      { date: new Date(NOW.getTime() - DAY).toISOString(), value: 1 },
      { date: new Date(NOW.getTime() - 10 * DAY).toISOString(), value: 1 },
      { date: null, value: 1 },
    ]
    expect(countBetween(rows, win.from, win.to)).toBe(1)
  })
})
