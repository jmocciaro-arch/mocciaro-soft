/**
 * BNA Exchange Rates Scraper
 * Fuente: https://www.bna.com.ar/Personas
 * Extrae la tabla "Cotización Divisas" (divisas, que es lo que se usa para convertir precios)
 */

export interface BnaRate {
  currency_code: string
  buy:  number
  sell: number
}

/**
 * Scrapea la tabla de divisas del Banco Nación.
 * El sitio devuelve HTML con dos tablas (billetes y divisas).
 * La tabla "Divisas" tiene id="divisas" o class similar.
 */
export async function fetchBnaRates(): Promise<{ date: string; rates: BnaRate[] } | null> {
  try {
    const res = await fetch('https://www.bna.com.ar/Personas', {
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; MocciaroSoft/1.0)',
        'Accept': 'text/html,application/xhtml+xml',
      },
      cache: 'no-store',
    })

    if (!res.ok) {
      console.error('[BNA] HTTP error', res.status)
      return null
    }

    const html = await res.text()

    // Extraer fecha del snapshot: busca patrón dd/mm/yyyy o yyyy-mm-dd
    const dateMatch = html.match(/(\d{1,2})\/(\d{1,2})\/(\d{4})/)
    const rateDate = dateMatch
      ? `${dateMatch[3]}-${dateMatch[2].padStart(2,'0')}-${dateMatch[1].padStart(2,'0')}`
      : new Date().toISOString().split('T')[0]

    // Extraer la sección "divisas"
    const divisasSection = extractDivisasSection(html)
    if (!divisasSection) {
      console.error('[BNA] No se encontró sección de divisas')
      return null
    }

    // Parsear filas: cada fila tiene <td>Nombre</td><td>Compra</td><td>Venta</td>
    const rows = Array.from(divisasSection.matchAll(/<tr[^>]*>([\s\S]*?)<\/tr>/gi))
    const rates: BnaRate[] = []

    for (const row of rows) {
      const cells = Array.from(row[1].matchAll(/<td[^>]*>([\s\S]*?)<\/td>/gi))
        .map(m => m[1].replace(/<[^>]+>/g, '').replace(/&nbsp;/g, ' ').trim())

      if (cells.length < 3) continue
      const [name, buyStr, sellStr] = cells

      const code = mapBnaNameToCode(name)
      if (!code) continue

      const buy = parseBnaNumber(buyStr)
      const sell = parseBnaNumber(sellStr)
      if (!isFinite(buy) || !isFinite(sell) || buy <= 0 || sell <= 0) continue

      // Para divisas como yenes/coronas que cotizan "por 100 unidades", dividimos
      const divisor = /\*/.test(name) ? 100 : 1

      rates.push({
        currency_code: code,
        buy:  buy / divisor,
        sell: sell / divisor,
      })
    }

    if (rates.length === 0) return null
    return { date: rateDate, rates }
  } catch (err) {
    console.error('[BNA] scraper error:', err)
    return null
  }
}

function extractDivisasSection(html: string): string | null {
  // Busca "Cotización Divisas" o tabla con id/class que indique divisas
  const patterns = [
    /Cotización\s+Divisas[\s\S]*?<table[^>]*>([\s\S]*?)<\/table>/i,
    /id="divisas"[\s\S]*?<table[^>]*>([\s\S]*?)<\/table>/i,
    /class="[^"]*divisas[^"]*"[\s\S]*?<table[^>]*>([\s\S]*?)<\/table>/i,
  ]
  for (const p of patterns) {
    const m = html.match(p)
    if (m && m[1]) return m[1]
  }
  // Fallback: última tabla del HTML
  const tables = Array.from(html.matchAll(/<table[^>]*>([\s\S]*?)<\/table>/gi))
  if (tables.length >= 2) return tables[tables.length - 1][1]
  return null
}

function mapBnaNameToCode(name: string): string | null {
  const n = name.toLowerCase().replace(/\s+/g, ' ').replace(/\*/g, '').trim()
  if (n.includes('dolar') && n.includes('u.s.a')) return 'USD'
  if (n.includes('dolar') && n.includes('usa'))   return 'USD'
  if (n.includes('euro'))                          return 'EUR'
  if (n.includes('libra'))                         return 'GBP'
  if (n.includes('franco') && n.includes('suizo')) return 'CHF'
  if (n.includes('yen'))                           return 'JPY'
  if (n.includes('dolar') && n.includes('canad'))  return 'CAD'
  if (n.includes('dolar') && n.includes('austral'))return 'AUD'
  if (n.includes('corona') && n.includes('danes')) return 'DKK'
  if (n.includes('corona') && n.includes('norueg'))return 'NOK'
  if (n.includes('corona') && n.includes('suec'))  return 'SEK'
  if (n.includes('yuan'))                          return 'CNY'
  return null
}

function parseBnaNumber(s: string): number {
  // "1.364,5000" → 1364.5
  const clean = s.replace(/\./g, '').replace(',', '.').replace(/[^\d.-]/g, '')
  return parseFloat(clean)
}

/**
 * Fallback API pública si BNA falla
 */
export async function fetchBluelyticsFallback(): Promise<{ date: string; rates: BnaRate[] } | null> {
  try {
    const res = await fetch('https://api.bluelytics.com.ar/v2/latest')
    if (!res.ok) return null
    const json = await res.json() as {
      oficial:  { value_buy: number; value_sell: number }
      last_update: string
    }
    const date = new Date(json.last_update).toISOString().split('T')[0]
    // Bluelytics solo tiene USD. Para EUR, aproximamos USD * 1.08 (placeholder conservador)
    return {
      date,
      rates: [
        { currency_code: 'USD', buy: json.oficial.value_buy, sell: json.oficial.value_sell },
      ],
    }
  } catch {
    return null
  }
}
