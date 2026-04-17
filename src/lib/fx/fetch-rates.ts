/**
 * FX Rate fetcher — dolarapi.com + ECB
 *
 * Fuentes:
 *   - https://dolarapi.com/v1/dolares  → ARS (oficial, blue, MEP, CCL) respecto a USD
 *   - ECB (data.ecb.europa.eu)         → EUR/USD para completar triángulo EUR↔ARS
 *
 * Sin auth, sin costo. Llamado desde /api/fx/rates (POST).
 */

export interface FXRate {
  date: string            // ISO YYYY-MM-DD
  base_currency: string
  target_currency: string
  rate: number
  source: string
}

export interface DolarAPIResponse {
  casa: string            // 'oficial' | 'blue' | 'mep' | 'ccl' | etc.
  nombre: string
  compra: number
  venta: number
  fechaActualizacion: string
}

// Mapa de tipos de dólar que nos interesan (casa → label)
const DOLAR_TYPES: Record<string, string> = {
  oficial: 'ARS_OFICIAL',
  blue: 'ARS_BLUE',
  mep: 'ARS_MEP',
  ccl: 'ARS_CCL',
}

/**
 * Fetch todos los tipos de cambio ARS desde dolarapi.com.
 * Retorna tasas USD→ARS (cuántos pesos por 1 USD) para cada tipo.
 */
export async function fetchDolarApiRates(date: string): Promise<FXRate[]> {
  const res = await fetch('https://dolarapi.com/v1/dolares', {
    headers: { 'User-Agent': 'MocciaroSoftERP/1.0' },
    next: { revalidate: 0 },
  })

  if (!res.ok) {
    throw new Error(`dolarapi.com error: ${res.status} ${res.statusText}`)
  }

  const data: DolarAPIResponse[] = await res.json()
  const rates: FXRate[] = []

  for (const item of data) {
    const label = DOLAR_TYPES[item.casa?.toLowerCase()]
    if (!label) continue

    // Usamos el promedio de compra/venta como rate
    const rate = item.venta || item.compra
    if (!rate || rate <= 0) continue

    rates.push({
      date,
      base_currency: 'USD',
      target_currency: label,
      rate,
      source: 'dolarapi.com',
    })
  }

  return rates
}

/**
 * Fetch EUR/USD desde el European Central Bank (ecb.europa.eu).
 * XML público, sin auth.
 */
export async function fetchECBRate(date: string): Promise<FXRate | null> {
  try {
    const res = await fetch(
      'https://data-api.ecb.europa.eu/service/data/EXR/D.USD.EUR.SP00.A?lastNObservations=1&format=csvdata',
      {
        headers: { 'User-Agent': 'MocciaroSoftERP/1.0' },
        next: { revalidate: 0 },
      }
    )

    if (!res.ok) return null

    const text = await res.text()
    const lines = text.trim().split('\n').filter(l => !l.startsWith('KEY'))
    const last = lines[lines.length - 1]
    if (!last) return null

    // CSV format: KEY_FAMILY,FREQ,CURRENCY,CURRENCY_DENOM,EXR_TYPE,EXR_SUFFIX,TIME_PERIOD,OBS_VALUE,...
    const parts = last.split(',')
    const obsValue = parseFloat(parts[7])
    if (!obsValue || isNaN(obsValue)) return null

    // obsValue es USD por 1 EUR
    return {
      date,
      base_currency: 'EUR',
      target_currency: 'USD',
      rate: obsValue,
      source: 'ecb',
    }
  } catch {
    return null
  }
}

/**
 * Fetch completo: ARS + EUR.
 * Retorna array de FXRate listos para insertar en tt_fx_rates.
 */
export async function fetchAllRates(date?: string): Promise<FXRate[]> {
  const today = date || new Date().toISOString().slice(0, 10)

  const [arsRates, eurRate] = await Promise.all([
    fetchDolarApiRates(today).catch(() => [] as FXRate[]),
    fetchECBRate(today).catch(() => null),
  ])

  const all: FXRate[] = [...arsRates]

  if (eurRate) {
    all.push(eurRate)

    // Triángulo EUR↔ARS usando ARS_OFICIAL como referencia
    const oficialRate = arsRates.find(r => r.target_currency === 'ARS_OFICIAL')
    if (oficialRate) {
      // EUR → ARS_OFICIAL = (EUR→USD) * (USD→ARS_OFICIAL)
      all.push({
        date: today,
        base_currency: 'EUR',
        target_currency: 'ARS_OFICIAL',
        rate: eurRate.rate * oficialRate.rate,
        source: 'calculated',
      })
    }
  }

  return all
}
