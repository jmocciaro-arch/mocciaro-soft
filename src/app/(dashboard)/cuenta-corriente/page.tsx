'use client'

/**
 * /cuenta-corriente — vista global multi-cliente de la CC.
 *
 * Tabla con: cliente, saldo a favor, saldo a deber, deuda vencida, deuda
 * al día, total. Filtros: search por cliente, rango de fechas, empresa
 * activa (via useCompanyFilter).
 *
 * Datos: agrupa tt_invoices (status pending/partial) por client_id y resta
 * tt_payments. Si existiera una vista tt_clients_with_balance la usaría;
 * por ahora agg en cliente con queries paralelas.
 *
 * Reglas:
 *  - NUNCA `supabase` en deps de useCallback. `const sb = createClient()`.
 *  - NUNCA return antes de hooks.
 */

import { useEffect, useMemo, useState, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { SearchBar } from '@/components/ui/search-bar'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { KPICard } from '@/components/ui/kpi-card'
import { useCompanyFilter } from '@/hooks/use-company-filter'
import { formatCurrency, formatDate } from '@/lib/utils'
import {
  CreditCard, Filter, AlertCircle, TrendingDown, TrendingUp,
  ArrowUpDown, Loader2, Calendar, Building2,
} from 'lucide-react'

interface InvoiceRow {
  id: string
  client_id: string
  total: number
  currency: string
  status: string
  due_date: string | null
  created_at: string
}

interface PaymentRow {
  id: string
  client_id: string
  amount: number
  currency: string
  paid_at: string | null
  created_at: string
}

interface ClientRow {
  id: string
  name: string | null
  legal_name: string | null
  tax_id: string | null
  country: string | null
}

interface CCRow {
  client: ClientRow
  saldoFavor: number     // dinero del cliente a su favor (cobramos de más)
  saldoDeber: number     // lo que el cliente nos debe (pendiente)
  deudaVencida: number   // facturas pending/partial pasadas due_date
  deudaAlDia: number     // facturas pending/partial dentro de plazo
  total: number          // = deuda - favor
  currency: 'EUR' | 'USD' | 'ARS'
}

const INVOICE_TYPES = ['factura', 'invoice']
const PENDING_STATUSES = ['pending', 'partial', 'open', 'sent']

type SortKey = 'name' | 'deudaVencida' | 'deudaAlDia' | 'saldoFavor' | 'total'

export default function CuentaCorrientePage() {
  const router = useRouter()
  const { filterByCompany, companyKey } = useCompanyFilter()

  const [loading, setLoading] = useState(true)
  const [rows, setRows] = useState<CCRow[]>([])
  const [search, setSearch] = useState('')
  const [showFilters, setShowFilters] = useState(false)
  const [dateFrom, setDateFrom] = useState('')
  const [dateTo, setDateTo] = useState('')
  const [sortKey, setSortKey] = useState<SortKey>('total')
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc')

  const load = useCallback(async () => {
    setLoading(true)
    const sb = createClient()

    // 1) Invoices: tt_documents con doc_type = factura/invoice
    let qInv = sb
      .from('tt_documents')
      .select('id, client_id, total, currency, status, valid_until, delivery_date, created_at, doc_type')
      .in('doc_type', INVOICE_TYPES)
      .not('client_id', 'is', null)
    qInv = filterByCompany(qInv)
    if (dateFrom) qInv = qInv.gte('created_at', dateFrom)
    if (dateTo) qInv = qInv.lte('created_at', dateTo + 'T23:59:59')
    const { data: invData } = await qInv

    // Normalizar invoices con due_date (fallback a valid_until / delivery_date)
    const invoices: InvoiceRow[] = ((invData || []) as Array<Record<string, unknown>>).map(d => ({
      id: d.id as string,
      client_id: d.client_id as string,
      total: Number(d.total) || 0,
      currency: (d.currency as string) || 'EUR',
      status: (d.status as string) || 'pending',
      due_date: (d.valid_until as string | null) || (d.delivery_date as string | null) || null,
      created_at: d.created_at as string,
    }))

    // 2) Payments
    let qPay = sb
      .from('tt_payments')
      .select('id, client_id, amount, currency, paid_at, created_at')
      .not('client_id', 'is', null)
    qPay = filterByCompany(qPay)
    if (dateFrom) qPay = qPay.gte('created_at', dateFrom)
    if (dateTo) qPay = qPay.lte('created_at', dateTo + 'T23:59:59')
    const { data: payData } = await qPay
    const payments: PaymentRow[] = ((payData || []) as PaymentRow[])

    // 3) Clientes implicados
    const clientIds = Array.from(new Set([
      ...invoices.map(i => i.client_id),
      ...payments.map(p => p.client_id),
    ]))
    if (clientIds.length === 0) {
      setRows([])
      setLoading(false)
      return
    }
    let qCli = sb
      .from('tt_clients')
      .select('id, name, legal_name, tax_id, country, company_id')
      .in('id', clientIds)
    qCli = filterByCompany(qCli)
    const { data: cliData } = await qCli
    const clientsMap = new Map<string, ClientRow>()
    for (const c of ((cliData || []) as Array<ClientRow & { company_id?: string }>)) {
      clientsMap.set(c.id, c)
    }

    // 4) Aggregate
    const today = new Date().toISOString().slice(0, 10)
    const byClient = new Map<string, CCRow>()

    for (const inv of invoices) {
      const client = clientsMap.get(inv.client_id)
      if (!client) continue
      const cur = (inv.currency || 'EUR') as 'EUR' | 'USD' | 'ARS'
      const key = inv.client_id
      let r = byClient.get(key)
      if (!r) {
        r = {
          client, saldoFavor: 0, saldoDeber: 0,
          deudaVencida: 0, deudaAlDia: 0, total: 0, currency: cur,
        }
        byClient.set(key, r)
      }
      // Solo cuenta como deuda si está pending/partial
      if (PENDING_STATUSES.includes((inv.status || '').toLowerCase())) {
        r.saldoDeber += inv.total
        const vencida = !!inv.due_date && inv.due_date < today
        if (vencida) r.deudaVencida += inv.total
        else r.deudaAlDia += inv.total
      }
    }

    for (const pay of payments) {
      const client = clientsMap.get(pay.client_id)
      if (!client) continue
      const cur = (pay.currency || 'EUR') as 'EUR' | 'USD' | 'ARS'
      const key = pay.client_id
      let r = byClient.get(key)
      if (!r) {
        r = {
          client, saldoFavor: 0, saldoDeber: 0,
          deudaVencida: 0, deudaAlDia: 0, total: 0, currency: cur,
        }
        byClient.set(key, r)
      }
      // Resta del saldo a deber. Si supera, queda saldo a favor.
      r.saldoDeber -= pay.amount
    }

    // Calcular saldo a favor (sobrante) y total
    const out: CCRow[] = []
    for (const r of byClient.values()) {
      if (r.saldoDeber < 0) {
        r.saldoFavor = -r.saldoDeber
        r.saldoDeber = 0
        // recalibrar deuda vencida/al día — si está cobrado por debajo, ambas se imputan proporcionalmente
        r.deudaVencida = 0
        r.deudaAlDia = 0
      }
      r.total = r.saldoDeber - r.saldoFavor
      // Skip clientes que no tienen ningún movimiento neto
      if (r.saldoDeber === 0 && r.saldoFavor === 0) continue
      out.push(r)
    }

    setRows(out)
    setLoading(false)
  }, [filterByCompany, dateFrom, dateTo])

  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { void load() }, [load, companyKey])

  // ─── derived ───────────────────────────────
  const filtered = useMemo(() => {
    const s = search.trim().toLowerCase()
    const out = rows.filter(r => {
      if (!s) return true
      const name = (r.client.legal_name || r.client.name || '').toLowerCase()
      const tax = (r.client.tax_id || '').toLowerCase()
      return name.includes(s) || tax.includes(s)
    })
    out.sort((a, b) => {
      const dir = sortDir === 'asc' ? 1 : -1
      if (sortKey === 'name') {
        const na = (a.client.legal_name || a.client.name || '').toLowerCase()
        const nb = (b.client.legal_name || b.client.name || '').toLowerCase()
        return na.localeCompare(nb) * dir
      }
      return ((a[sortKey] as number) - (b[sortKey] as number)) * dir
    })
    return out
  }, [rows, search, sortKey, sortDir])

  const totals = useMemo(() => {
    let totalDeuda = 0
    let totalFavor = 0
    let totalVencida = 0
    for (const r of filtered) {
      totalDeuda += r.saldoDeber
      totalFavor += r.saldoFavor
      totalVencida += r.deudaVencida
    }
    return { totalDeuda, totalFavor, totalVencida, neto: totalDeuda - totalFavor }
  }, [filtered])

  function toggleSort(k: SortKey) {
    if (sortKey === k) setSortDir(d => (d === 'asc' ? 'desc' : 'asc'))
    else { setSortKey(k); setSortDir('desc') }
  }

  // ─── render ────────────────────────────────
  return (
    <div className="px-3 sm:px-5 py-4 space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-lg bg-[#FF6600]/20 flex items-center justify-center">
            <CreditCard size={20} className="text-[#FF6600]" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-[#F0F2F5]">Cuenta corriente</h1>
            <p className="text-xs text-[#6B7280]">Saldos globales por cliente</p>
          </div>
        </div>
        <Button
          variant="ghost"
          size="sm"
          onClick={() => setShowFilters(s => !s)}
        >
          <Filter size={14} className="mr-1" />
          Filtros {dateFrom || dateTo ? '·' : ''}
        </Button>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <KPICard
          label="Deuda total"
          value={formatCurrency(totals.totalDeuda, 'EUR')}
          icon={<TrendingDown size={16} />}
        />
        <KPICard
          label="Vencida"
          value={formatCurrency(totals.totalVencida, 'EUR')}
          icon={<AlertCircle size={16} />}
        />
        <KPICard
          label="A favor cliente"
          value={formatCurrency(totals.totalFavor, 'EUR')}
          icon={<TrendingUp size={16} />}
        />
        <KPICard
          label="Saldo neto"
          value={formatCurrency(totals.neto, 'EUR')}
          icon={<Building2 size={16} />}
        />
      </div>

      {/* Filtros expandibles */}
      {showFilters && (
        <Card>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 items-end">
            <div>
              <label className="block text-xs text-[#6B7280] mb-1">Desde</label>
              <Input
                type="date"
                value={dateFrom}
                onChange={(e) => setDateFrom(e.target.value)}
              />
            </div>
            <div>
              <label className="block text-xs text-[#6B7280] mb-1">Hasta</label>
              <Input
                type="date"
                value={dateTo}
                onChange={(e) => setDateTo(e.target.value)}
              />
            </div>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => { setDateFrom(''); setDateTo('') }}
            >
              Limpiar
            </Button>
          </div>
        </Card>
      )}

      {/* Search */}
      <SearchBar
        placeholder="Buscar cliente por nombre o CIF/CUIT…"
        value={search}
        onChange={setSearch}
      />

      {/* Tabla */}
      <Card className="p-0 overflow-hidden">
        {loading ? (
          <div className="flex items-center gap-2 p-8 text-xs text-[#9CA3AF]">
            <Loader2 size={14} className="animate-spin text-[#FF6600]" />
            Calculando saldos…
          </div>
        ) : filtered.length === 0 ? (
          <div className="p-8 text-center text-xs text-[#6B7280]">
            <CreditCard size={32} className="mx-auto mb-2 text-[#3A4252]" />
            Sin movimientos para la empresa y el rango seleccionado.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead className="bg-[#0F1218] text-[#6B7280] uppercase">
                <tr>
                  <Th onClick={() => toggleSort('name')}>Cliente</Th>
                  <Th align="right" onClick={() => toggleSort('saldoFavor')}>A favor</Th>
                  <Th align="right" onClick={() => toggleSort('deudaVencida')}>Vencida</Th>
                  <Th align="right" onClick={() => toggleSort('deudaAlDia')}>Al día</Th>
                  <Th align="right" onClick={() => toggleSort('total')}>Total</Th>
                </tr>
              </thead>
              <tbody>
                {filtered.map(r => (
                  <tr
                    key={r.client.id}
                    onClick={() => router.push(`/clientes/${r.client.id}?tab=cuenta-corriente`)}
                    className="border-b border-[#1E2330] hover:bg-[#1A1F2E] cursor-pointer"
                  >
                    <td className="px-3 py-2">
                      <p className="text-[#F0F2F5] font-medium">
                        {r.client.legal_name || r.client.name || 'Sin nombre'}
                      </p>
                      {r.client.tax_id && (
                        <p className="text-[10px] font-mono text-[#6B7280]">{r.client.tax_id}</p>
                      )}
                    </td>
                    <td className="px-3 py-2 text-right text-emerald-400">
                      {r.saldoFavor ? formatCurrency(r.saldoFavor, r.currency) : '—'}
                    </td>
                    <td className="px-3 py-2 text-right text-red-400">
                      {r.deudaVencida ? formatCurrency(r.deudaVencida, r.currency) : '—'}
                    </td>
                    <td className="px-3 py-2 text-right text-amber-400">
                      {r.deudaAlDia ? formatCurrency(r.deudaAlDia, r.currency) : '—'}
                    </td>
                    <td className="px-3 py-2 text-right font-bold text-[#F0F2F5]">
                      {formatCurrency(r.total, r.currency)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {(dateFrom || dateTo) && (
        <p className="text-[10px] text-[#6B7280] text-center flex items-center justify-center gap-1">
          <Calendar size={10} />
          Rango: {dateFrom ? formatDate(dateFrom) : '—'} → {dateTo ? formatDate(dateTo) : '—'}
        </p>
      )}
    </div>
  )
}

function Th({ children, align = 'left', onClick }: {
  children: React.ReactNode; align?: 'left' | 'right'; onClick?: () => void
}) {
  return (
    <th
      onClick={onClick}
      className={`px-3 py-2 cursor-pointer select-none hover:text-[#F0F2F5] ${align === 'right' ? 'text-right' : 'text-left'}`}
    >
      <span className="inline-flex items-center gap-1">
        {children}
        {onClick && <ArrowUpDown size={10} />}
      </span>
    </th>
  )
}
