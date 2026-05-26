/**
 * StelOrder API Client — para migración
 *
 * Base URL: https://app.stelorder.com/app
 * Auth: header APIKEY
 * Cap: 100 items por GET sin filtros → paginamos con filtros de fecha
 * Rate limit: ~60 req/min (plan Lite), esperamos 1.5s entre requests
 */

const BASE_URL = 'https://app.stelorder.com/app'
const RATE_LIMIT_MS = 1500

export interface StelOrderClientOptions {
  apiKey: string
  onRequest?: (endpoint: string) => void
  dryRun?: boolean
}

export class StelOrderClient {
  private apiKey: string
  private lastRequestAt = 0
  private onRequest?: (endpoint: string) => void

  constructor(opts: StelOrderClientOptions) {
    this.apiKey = opts.apiKey
    this.onRequest = opts.onRequest
  }

  private async throttle() {
    const now = Date.now()
    const elapsed = now - this.lastRequestAt
    if (elapsed < RATE_LIMIT_MS) {
      await new Promise((r) => setTimeout(r, RATE_LIMIT_MS - elapsed))
    }
    this.lastRequestAt = Date.now()
  }

  async get<T = any>(path: string, params?: Record<string, string | number>): Promise<T> {
    await this.throttle()
    const url = new URL(`${BASE_URL}${path}`)
    if (params) {
      Object.entries(params).forEach(([k, v]) => url.searchParams.set(k, String(v)))
    }
    this.onRequest?.(path)
    const res = await fetch(url.toString(), {
      headers: { APIKEY: this.apiKey, Accept: 'application/json' },
    })
    if (!res.ok) {
      throw new Error(`StelOrder ${res.status}: ${await res.text()}`)
    }
    return (await res.json()) as T
  }

  /**
   * 2026-05-25: StelOrder devolvió 400 en TODOS los filtros de fecha
   * (date-from, utc-creation-date-from, etc). Probablemente quitaron esos
   * parámetros. Ahora delegamos a paginateById (offset con start=).
   * Los argumentos quedan por compat pero se ignoran.
   */
  async getAllByDateRange<T = any>(
    path: string,
    _options: { from?: Date; to?: Date; dateField?: string; monthChunks?: boolean } = {}
  ): Promise<T[]> {
    void _options
    return this.paginateById<T>(path)
  }

  /**
   * Para entidades pequeñas sin fecha (clientes, productos) — trae TODO
   * iterando sin filtros. Si cap es 100, fallback a paginación por ID.
   */
  async getAll<T = any>(path: string): Promise<T[]> {
    const data = await this.get<T[]>(path)
    if (!Array.isArray(data)) return []
    if (data.length < 100) return data
    // Si llegamos al cap, intentar paginar por rangos de ID
    return await this.paginateById<T>(path)
  }

  /**
   * Paginación por OFFSET ascendente — StelOrder usa `start=` (no `id-from=`).
   * Comprobado contra app.stelorder.com 2026-05-25.
   */
  private async paginateById<T = any>(path: string): Promise<T[]> {
    const all: T[] = []
    let start = 0
    let tries = 0
    const maxTries = 500 // safety (50k items máximo)
    const PAGE_SIZE = 100

    while (tries < maxTries) {
      const params: Record<string, string | number> = {}
      if (start > 0) params['start'] = start
      const data = await this.get<T[]>(path, params)
      if (!Array.isArray(data) || data.length === 0) break
      all.push(...data)
      start += data.length
      tries++
      if (data.length < PAGE_SIZE) break
    }

    return this.dedupById(all)
  }

  private yearRanges(from: Date, to: Date): Array<[Date, Date]> {
    const ranges: Array<[Date, Date]> = []
    let cur = new Date(from.getFullYear(), 0, 1)
    while (cur < to) {
      const end = new Date(cur.getFullYear() + 1, 0, 1)
      ranges.push([new Date(cur), end > to ? to : end])
      cur = end
    }
    return ranges
  }

  private monthRanges(from: Date, to: Date): Array<[Date, Date]> {
    const ranges: Array<[Date, Date]> = []
    let cur = new Date(from.getFullYear(), from.getMonth(), 1)
    while (cur < to) {
      const end = new Date(cur.getFullYear(), cur.getMonth() + 1, 1)
      ranges.push([new Date(cur), end > to ? to : end])
      cur = end
    }
    return ranges
  }

  private dedupById<T = any>(arr: T[]): T[] {
    const seen = new Set<number>()
    const out: T[] = []
    for (const it of arr) {
      const id = (it as any)?.id
      if (typeof id === 'number') {
        if (seen.has(id)) continue
        seen.add(id)
      }
      out.push(it)
    }
    return out
  }

  // ─── Atajos por entidad ───────────────────────────────
  getClients() { return this.getAll('/clients') }
  getSuppliers() { return this.getAll('/suppliers') }
  getProducts() { return this.getAll('/products') }
  getServices() { return this.getAll('/services') }
  getContacts() { return this.getAll('/contacts') }
  getPotentialClients() { return this.getAll('/potentialClients') }
  getWarehouses() { return this.getAll('/warehouses') }
  getTaxLines() { return this.getAll('/taxLines') }
  getPaymentOptions() { return this.getAll('/paymentOptions') }
  getRates() { return this.getAll('/rates') }
  getSerialNumbers() { return this.getAll('/serialNumbers') }
  getIncidents() { return this.getAll('/incidents') }

  getSalesEstimates() { return this.getAllByDateRange('/salesEstimates') }
  getSalesOrders() { return this.getAllByDateRange('/salesOrders') }
  getSalesDeliveryNotes() { return this.getAllByDateRange('/salesDeliveryNotes') }
  getOrdinaryInvoices() { return this.getAllByDateRange('/ordinaryInvoices') }
  getOrdinaryInvoiceReceipts() { return this.getAllByDateRange('/ordinaryInvoiceReceipts', { dateField: 'payment-date' }) }
  getRefundInvoices() { return this.getAllByDateRange('/refundInvoices') }
  getPurchaseOrders() { return this.getAllByDateRange('/purchaseOrders') }
  getPurchaseDeliveryNotes() { return this.getAllByDateRange('/purchaseDeliveryNotes') }
  getPurchaseInvoices() { return this.getAllByDateRange('/purchaseInvoices') }
  getExpenses() { return this.getAllByDateRange('/expenses') }
}
