/**
 * src/lib/sat/torque-calculations.ts
 *
 * Calculos estadisticos de torque para el paso 4 del workflow.
 * Port del buscatools-fein original (app.js).
 *
 * Formulas clave:
 *   - Cp  = (LCS - LCI) / (6 * sigma)
 *   - Cpk = min( (LCS - x̄)/(3σ), (x̄ - LCI)/(3σ) )
 *   - CV% = (sigma / x̄) * 100
 *   - Eficiencia % = min(x̄ / nominal, 1) * 100
 *
 * Criterio CAPAZ: Cpk >= 1.33
 */

export interface TorqueStats {
  mean: number | null
  stddev: number | null
  cp: number | null
  cpk: number | null
  cv: number | null
  efficiency: number | null
  result: 'CAPAZ' | 'REVISAR' | null
  mean_min: number | null
  mean_max: number | null
  repetibilidad: Array<number | null>
}

export interface TorqueInputs {
  lci: number | null
  nom: number | null
  lcs: number | null
  min_values: Array<number | null>
  max_values: Array<number | null>
  tgt_values: Array<number | null>
}

/** Promedio de valores validos */
export function avg(arr: Array<number | null | undefined>): number {
  const valid = arr.filter((v): v is number => typeof v === 'number' && !isNaN(v))
  if (!valid.length) return NaN
  return valid.reduce((s, v) => s + v, 0) / valid.length
}

/** Desviacion estandar (muestral, n-1) */
export function stddev(arr: Array<number | null | undefined>): number {
  const valid = arr.filter((v): v is number => typeof v === 'number' && !isNaN(v))
  if (valid.length < 2) return NaN
  const m = avg(valid)
  const variance = valid.reduce((s, v) => s + (v - m) ** 2, 0) / (valid.length - 1)
  return Math.sqrt(variance)
}

/** Calcula todas las estadisticas de torque */
export function calculateTorqueStats(inputs: TorqueInputs): TorqueStats {
  const { lci, nom, lcs, min_values, max_values, tgt_values } = inputs

  const pm = avg(min_values)
  const pM = avg(max_values)
  const pt = avg(tgt_values)
  const s = stddev(tgt_values)

  let cp: number | null = null
  let cpk: number | null = null
  let cv: number | null = null
  let ef: number | null = null

  if (lci !== null && lcs !== null && !isNaN(s) && s > 0) {
    cp = (lcs - lci) / (6 * s)
  }
  if (lci !== null && lcs !== null && !isNaN(pt) && !isNaN(s) && s > 0) {
    cpk = Math.min((lcs - pt) / (3 * s), (pt - lci) / (3 * s))
  }
  if (!isNaN(s) && !isNaN(pt) && pt !== 0) {
    cv = (s / pt) * 100
  }
  if (!isNaN(pt) && nom !== null && nom !== 0) {
    ef = Math.min(pt / nom, 1) * 100
  }

  const repetibilidad = tgt_values.map((v) =>
    v !== null && !isNaN(v) && nom !== null && nom !== 0
      ? (Math.abs(v - nom) / nom) * 100
      : null
  )

  let result: 'CAPAZ' | 'REVISAR' | null = null
  if (cpk !== null && !isNaN(cpk)) {
    result = cpk >= 1.33 ? 'CAPAZ' : 'REVISAR'
  }

  return {
    mean: !isNaN(pt) ? round3(pt) : null,
    stddev: !isNaN(s) ? round3(s) : null,
    cp: cp !== null && !isNaN(cp) ? round3(cp) : null,
    cpk: cpk !== null && !isNaN(cpk) ? round3(cpk) : null,
    cv: cv !== null && !isNaN(cv) ? round3(cv) : null,
    efficiency: ef !== null && !isNaN(ef) ? round3(ef) : null,
    result,
    mean_min: !isNaN(pm) ? round3(pm) : null,
    mean_max: !isNaN(pM) ? round3(pM) : null,
    repetibilidad,
  }
}

function round3(n: number): number {
  return Math.round(n * 1000) / 1000
}

/** Colores para indicadores Cp/Cpk */
export function cpColor(cp: number | null): 'green' | 'amber' | 'red' | 'gray' {
  if (cp === null || isNaN(cp)) return 'gray'
  if (cp >= 1.33) return 'green'
  if (cp >= 1) return 'amber'
  return 'red'
}
