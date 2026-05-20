import { createClient } from '@/lib/supabase/client'

export type CCKind = 'factura' | 'nota_credito' | 'cobro'

export interface CCMovement {
  id: string
  date: string
  kind: CCKind
  ref: string
  concept: string
  debe: number
  haber: number
  saldo: number
  currency: string
  status: string
  doc_id?: string | null
}

export interface CCSummary {
  total_debe: number
  total_haber: number
  saldo: number
  count: number
  currency: string
}

export interface LoadCCOptions {
  from?: string | null
  to?: string | null
}

interface ClientBalanceRow {
  client_id: string
  client_name: string
  client_ref: string | null
  saldo: number
  total_debe: number
  total_haber: number
  facturas_pendientes: number
  ultimo_movimiento: string | null
  currency: string
}

const DOC_INVOICE = 'factura'
const DOC_REFUND = 'factura_abono'
const PENDING_STATUSES = ['emitida', 'autorizada', 'pendiente_cobro', 'open', 'sent', 'partial', 'pending', 'pendiente']

interface DocRow {
  id: string
  doc_type: string
  display_ref?: string | null
  system_code?: string | null
  legal_number?: string | null
  invoice_date?: string | null
  created_at?: string | null
  total: number | null
  currency?: string | null
  status?: string | null
  notes?: string | null
  client_id: string | null
}

function pickDate(d: DocRow): string {
  return (d.invoice_date || d.created_at || '').slice(0, 10)
}

function pickRef(d: DocRow): string {
  return d.legal_number || d.display_ref || d.system_code || '—'
}

export async function loadCuentaCorriente(
  clientId: string | string[],
  companyId: string | null,
  opts: LoadCCOptions = {}
): Promise<{ movements: CCMovement[]; summary: CCSummary }> {
  const sb = createClient()
  const ids = Array.isArray(clientId) ? clientId : [clientId]
  if (ids.length === 0) {
    return { movements: [], summary: { total_debe: 0, total_haber: 0, saldo: 0, count: 0, currency: 'EUR' } }
  }

  let docQuery = sb
    .from('tt_documents')
    .select('id, doc_type, display_ref, system_code, legal_number, invoice_date, created_at, total, currency, status, notes, client_id')
    .in('client_id', ids)
    .in('doc_type', [DOC_INVOICE, DOC_REFUND])

  if (companyId) docQuery = docQuery.eq('company_id', companyId)
  if (opts.from) docQuery = docQuery.or(`invoice_date.gte.${opts.from},and(invoice_date.is.null,created_at.gte.${opts.from})`)
  if (opts.to) docQuery = docQuery.or(`invoice_date.lte.${opts.to},and(invoice_date.is.null,created_at.lte.${opts.to})`)

  const { data: docs, error: docsErr } = await docQuery.limit(5000)
  if (docsErr) throw docsErr

  const docList = (docs || []) as unknown as DocRow[]
  const invoiceIds = docList.filter((d) => d.doc_type === DOC_INVOICE).map((d) => d.id)

  let payments: Array<{
    id: string
    invoice_id: string
    amount: number
    currency: string | null
    payment_date: string
    method: string | null
    reference: string | null
  }> = []

  if (invoiceIds.length > 0) {
    let payQuery = sb
      .from('tt_payments')
      .select('id, invoice_id, amount, currency, payment_date, method, reference')
      .in('invoice_id', invoiceIds)

    if (opts.from) payQuery = payQuery.gte('payment_date', opts.from)
    if (opts.to) payQuery = payQuery.lte('payment_date', opts.to)

    const { data: pData, error: pErr } = await payQuery
    if (pErr) throw pErr
    payments = (pData || []) as typeof payments
  }

  const movements: CCMovement[] = []
  const invoiceRefById = new Map<string, string>()

  for (const d of docList) {
    const ref = pickRef(d)
    invoiceRefById.set(d.id, ref)
    const monto = Math.abs(Number(d.total || 0))
    const fecha = pickDate(d)
    if (!fecha) continue
    if (d.doc_type === DOC_INVOICE) {
      movements.push({
        id: `inv:${d.id}`,
        date: fecha,
        kind: 'factura',
        ref,
        concept: (d.notes || '').toString().slice(0, 100) || 'Factura de venta',
        debe: monto,
        haber: 0,
        saldo: 0,
        currency: d.currency || 'EUR',
        status: d.status || '',
        doc_id: d.id,
      })
    } else {
      movements.push({
        id: `nc:${d.id}`,
        date: fecha,
        kind: 'nota_credito',
        ref,
        concept: (d.notes || '').toString().slice(0, 100) || 'Nota de crédito',
        debe: 0,
        haber: monto,
        saldo: 0,
        currency: d.currency || 'EUR',
        status: d.status || '',
        doc_id: d.id,
      })
    }
  }

  for (const p of payments) {
    const ref = invoiceRefById.get(p.invoice_id) || '—'
    movements.push({
      id: `pay:${p.id}`,
      date: (p.payment_date || '').slice(0, 10),
      kind: 'cobro',
      ref,
      concept: p.reference ? `Cobro ${p.method || ''} · ${p.reference}` : `Cobro ${p.method || ''} factura ${ref}`,
      debe: 0,
      haber: Math.abs(Number(p.amount || 0)),
      saldo: 0,
      currency: p.currency || 'EUR',
      status: 'cobrado',
      doc_id: p.invoice_id,
    })
  }

  movements.sort((a, b) => {
    if (a.date !== b.date) return a.date.localeCompare(b.date)
    const order = { factura: 0, nota_credito: 1, cobro: 2 }
    return order[a.kind] - order[b.kind]
  })

  let saldo = 0
  let total_debe = 0
  let total_haber = 0
  for (const m of movements) {
    saldo += m.debe - m.haber
    m.saldo = saldo
    total_debe += m.debe
    total_haber += m.haber
  }

  const currency = movements[0]?.currency || 'EUR'
  return {
    movements,
    summary: { total_debe, total_haber, saldo, count: movements.length, currency },
  }
}

export async function loadClientBalances(companyId: string | null): Promise<ClientBalanceRow[]> {
  const sb = createClient()

  let docQ = sb
    .from('tt_documents')
    .select('id, doc_type, total, currency, invoice_date, created_at, status, client_id, company_id')
    .in('doc_type', [DOC_INVOICE, DOC_REFUND])
    .not('client_id', 'is', null)

  if (companyId) docQ = docQ.eq('company_id', companyId)

  const { data: docs, error: docsErr } = await docQ.limit(20000)
  if (docsErr) throw docsErr

  const docList = (docs || []) as unknown as DocRow[]
  const docsByClient = new Map<string, DocRow[]>()
  const allInvoiceIds: string[] = []
  for (const d of docList) {
    if (!d.client_id) continue
    if (!docsByClient.has(d.client_id)) docsByClient.set(d.client_id, [])
    docsByClient.get(d.client_id)!.push(d)
    if (d.doc_type === DOC_INVOICE) allInvoiceIds.push(d.id)
  }

  const payByInvoice = new Map<string, { amount: number; date: string }[]>()
  if (allInvoiceIds.length) {
    const CHUNK = 500
    for (let i = 0; i < allInvoiceIds.length; i += CHUNK) {
      const slice = allInvoiceIds.slice(i, i + CHUNK)
      const { data: pData, error: pErr } = await sb
        .from('tt_payments')
        .select('invoice_id, amount, payment_date')
        .in('invoice_id', slice)
      if (pErr) throw pErr
      for (const p of pData || []) {
        const arr = payByInvoice.get(p.invoice_id as string) || []
        arr.push({ amount: Number(p.amount || 0), date: (p.payment_date as string) || '' })
        payByInvoice.set(p.invoice_id as string, arr)
      }
    }
  }

  const clientIds = Array.from(docsByClient.keys())
  const clientsById = new Map<string, { name: string }>()
  if (clientIds.length) {
    const CHUNK = 500
    for (let i = 0; i < clientIds.length; i += CHUNK) {
      const slice = clientIds.slice(i, i + CHUNK)
      const { data: cData } = await sb
        .from('tt_clients')
        .select('id, name, legal_name')
        .in('id', slice)
      for (const c of cData || []) {
        clientsById.set(c.id as string, {
          name: ((c.legal_name || c.name) as string) || '—',
        })
      }
    }
  }

  const rows: ClientBalanceRow[] = []
  for (const [cid, cdocs] of docsByClient.entries()) {
    let debe = 0
    let haber = 0
    let pendientes = 0
    let ultimo = ''
    let currency = 'EUR'
    for (const d of cdocs) {
      currency = d.currency || currency
      const monto = Math.abs(Number(d.total || 0))
      if (d.doc_type === DOC_INVOICE) {
        debe += monto
        if (d.status && PENDING_STATUSES.includes(d.status)) {
          pendientes++
        }
      } else {
        haber += monto
      }
      const dt = pickDate(d)
      if (dt > ultimo) ultimo = dt
      if (d.doc_type === DOC_INVOICE) {
        for (const p of payByInvoice.get(d.id) || []) {
          haber += p.amount
          if (p.date > ultimo) ultimo = p.date
        }
      }
    }
    const info = clientsById.get(cid)
    rows.push({
      client_id: cid,
      client_name: info?.name || '—',
      client_ref: null,
      saldo: debe - haber,
      total_debe: debe,
      total_haber: haber,
      facturas_pendientes: pendientes,
      ultimo_movimiento: ultimo ? ultimo.slice(0, 10) : null,
      currency,
    })
  }

  rows.sort((a, b) => b.saldo - a.saldo)
  return rows
}
