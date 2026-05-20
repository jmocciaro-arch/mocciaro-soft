'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { DataTable, type DataTableColumn } from '@/components/ui/data-table'
import { formatCurrency } from '@/lib/utils'
import { loadClientBalances } from '@/lib/cuenta-corriente'
import { useCompanyContext } from '@/lib/company-context'
import { Wallet, Loader2, RefreshCw, AlertCircle, FileSpreadsheet } from 'lucide-react'

type Balance = {
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

type CurrencyCode = 'EUR' | 'ARS' | 'USD'
const asCur = (c: string): CurrencyCode => (c === 'ARS' || c === 'USD' ? c : 'EUR')

type FilterMode = 'all' | 'deudores' | 'a_favor' | 'pendientes'

export default function CuentaCorrientePage() {
  const router = useRouter()
  const { activeCompanyId, activeCompany, companies } = useCompanyContext()
  const [rows, setRows] = useState<Balance[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [filterMode, setFilterMode] = useState<FilterMode>('all')
  const [search, setSearch] = useState('')

  const companyName = activeCompany?.name || companies.find((c) => c.id === activeCompanyId)?.name || 'Todas las empresas'

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const data = await loadClientBalances(activeCompanyId)
      setRows(data)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error cargando saldos')
    } finally {
      setLoading(false)
    }
  }, [activeCompanyId])

  useEffect(() => { void load() }, [load])

  const filtered = useMemo(() => {
    let list = rows
    if (filterMode === 'deudores') list = list.filter((r) => r.saldo > 0.005)
    else if (filterMode === 'a_favor') list = list.filter((r) => r.saldo < -0.005)
    else if (filterMode === 'pendientes') list = list.filter((r) => r.facturas_pendientes > 0)
    if (search.trim()) {
      const q = search.toLowerCase()
      list = list.filter((r) => r.client_name.toLowerCase().includes(q) || (r.client_ref || '').toLowerCase().includes(q))
    }
    return list
  }, [rows, filterMode, search])

  const kpis = useMemo(() => {
    let porCobrar = 0
    let aFavor = 0
    let totalFacturado = 0
    let totalCobrado = 0
    let pendientes = 0
    const currency = rows[0]?.currency || 'EUR'
    for (const r of rows) {
      if (r.saldo > 0) porCobrar += r.saldo
      else if (r.saldo < 0) aFavor += Math.abs(r.saldo)
      totalFacturado += r.total_debe
      totalCobrado += r.total_haber
      pendientes += r.facturas_pendientes
    }
    return { porCobrar, aFavor, totalFacturado, totalCobrado, saldoNeto: porCobrar - aFavor, pendientes, currency, clientes: rows.length }
  }, [rows])

  function exportCSV() {
    const header = ['Referencia', 'Cliente', 'Saldo', 'Facturado', 'Cobrado', 'Facturas pendientes', 'Último movimiento', 'Moneda']
    const lines = [header, ...filtered.map((r) => [
      r.client_ref || '', r.client_name,
      r.saldo.toFixed(2), r.total_debe.toFixed(2), r.total_haber.toFixed(2),
      String(r.facturas_pendientes), r.ultimo_movimiento || '', r.currency,
    ])]
    const csv = lines.map((row) => row.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(',')).join('\n')
    const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `cuentas-corrientes_${companyName.replace(/[^\w-]/g, '_')}_${new Date().toISOString().slice(0, 10)}.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

  const columns: DataTableColumn[] = [
    { key: 'client_ref', label: 'Ref.', sortable: true, searchable: true, type: 'text' },
    { key: 'client_name', label: 'Cliente', sortable: true, searchable: true, type: 'text' },
    {
      key: 'saldo', label: 'Saldo', sortable: true, type: 'currency',
      render: (v, row) => {
        const r = row as unknown as Balance
        const val = Number(v || 0)
        const cls = val > 0.005 ? 'text-red-400 font-semibold' : val < -0.005 ? 'text-emerald-400 font-semibold' : 'text-[#9CA3AF]'
        return <span className={`tabular-nums ${cls}`}>{formatCurrency(val, asCur(r.currency))}</span>
      },
    },
    {
      key: 'total_debe', label: 'Facturado', sortable: true, type: 'currency',
      render: (v, row) => <span className="tabular-nums text-[#9CA3AF]">{formatCurrency(Number(v || 0), asCur((row as unknown as Balance).currency))}</span>,
    },
    {
      key: 'total_haber', label: 'Cobrado', sortable: true, type: 'currency',
      render: (v, row) => <span className="tabular-nums text-[#9CA3AF]">{formatCurrency(Number(v || 0), asCur((row as unknown as Balance).currency))}</span>,
    },
    {
      key: 'facturas_pendientes', label: 'Pend.', sortable: true, type: 'number',
      render: (v) => {
        const n = Number(v || 0)
        if (n === 0) return <span className="text-[#6B7280]">0</span>
        return <span className="text-orange-400 font-medium">{n}</span>
      },
    },
    { key: 'ultimo_movimiento', label: 'Últ. mov.', sortable: true, type: 'date' },
  ]

  return (
    <div className="p-6 space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2 text-[#F0F2F5]">
            <Wallet className="w-6 h-6 text-[#FF6600]" /> Cuentas Corrientes
          </h1>
          <p className="text-sm text-[#6B7280]">{companyName} · {kpis.clientes} clientes con movimientos</p>
        </div>
        <div className="flex gap-2">
          <Button variant="secondary" size="sm" onClick={load}><RefreshCw size={14} /> Recargar</Button>
          <Button variant="secondary" size="sm" onClick={exportCSV}><FileSpreadsheet size={14} /> Exportar CSV</Button>
        </div>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <KPI label="Por cobrar" value={formatCurrency(kpis.porCobrar, asCur(kpis.currency))} accent="rojo" sub={`${rows.filter((r) => r.saldo > 0.005).length} clientes`} />
        <KPI label="Saldo a favor cliente" value={formatCurrency(kpis.aFavor, asCur(kpis.currency))} accent="verde" sub={`${rows.filter((r) => r.saldo < -0.005).length} clientes`} />
        <KPI label="Saldo neto" value={formatCurrency(kpis.saldoNeto, asCur(kpis.currency))} accent={kpis.saldoNeto > 0 ? 'rojo' : 'verde'} sub="Por cobrar − a favor" />
        <KPI label="Facturas pendientes" value={String(kpis.pendientes)} accent="naranja" sub={`de ${rows.length} clientes`} />
      </div>

      {/* Filtros */}
      <Card>
        <div className="flex flex-wrap items-end gap-3">
          <div className="flex-1 min-w-[200px]">
            <label className="block text-xs text-[#6B7280] mb-1">Buscar cliente</label>
            <Input
              placeholder="Nombre o referencia..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          <div className="flex gap-1 flex-wrap">
            <FilterChip active={filterMode === 'all'} onClick={() => setFilterMode('all')}>Todos</FilterChip>
            <FilterChip active={filterMode === 'deudores'} onClick={() => setFilterMode('deudores')} variant="rojo">Solo deudores</FilterChip>
            <FilterChip active={filterMode === 'a_favor'} onClick={() => setFilterMode('a_favor')} variant="verde">Saldo a favor</FilterChip>
            <FilterChip active={filterMode === 'pendientes'} onClick={() => setFilterMode('pendientes')} variant="naranja">Con pendientes</FilterChip>
          </div>
        </div>
      </Card>

      {/* Listado */}
      {loading ? (
        <Card>
          <div className="flex items-center justify-center py-12 text-[#6B7280]">
            <Loader2 size={20} className="animate-spin mr-2" /> Calculando saldos...
          </div>
        </Card>
      ) : error ? (
        <Card>
          <div className="flex items-center gap-2 text-red-400 p-4 text-sm">
            <AlertCircle size={16} /> {error}
          </div>
        </Card>
      ) : filtered.length === 0 ? (
        <Card>
          <p className="text-center text-[#6B7280] py-10 text-sm">No hay clientes que coincidan con los filtros</p>
        </Card>
      ) : (
        <DataTable
          columns={columns}
          data={filtered as unknown as Record<string, unknown>[]}
          onRowClick={(row) => {
            const r = row as unknown as Balance
            router.push(`/clientes?open=${r.client_id}#cuenta_corriente`)
          }}
          pageSize={50}
        />
      )}

      <p className="text-xs text-[#6B7280] text-center">
        Tip: click en una fila para abrir la ficha del cliente con su cuenta corriente detallada.
      </p>
    </div>
  )
}

function KPI({ label, value, accent, sub }: { label: string; value: string; accent: 'rojo' | 'verde' | 'naranja' | 'neutral'; sub?: string }) {
  const color =
    accent === 'rojo' ? 'text-red-400' :
    accent === 'verde' ? 'text-emerald-400' :
    accent === 'naranja' ? 'text-orange-400' : 'text-[#F0F2F5]'
  return (
    <div className="bg-[#0F1218] border border-[#1E2330] rounded-lg p-4">
      <div className="text-xs text-[#6B7280] uppercase tracking-wide">{label}</div>
      <div className={`mt-1 text-xl font-bold ${color}`}>{value}</div>
      {sub && <div className="text-xs text-[#6B7280] mt-1">{sub}</div>}
    </div>
  )
}

function FilterChip({ active, onClick, variant = 'neutral', children }: {
  active: boolean
  onClick: () => void
  variant?: 'rojo' | 'verde' | 'naranja' | 'neutral'
  children: React.ReactNode
}) {
  const activeColor =
    variant === 'rojo' ? 'bg-red-500/20 text-red-400 border-red-500/40' :
    variant === 'verde' ? 'bg-emerald-500/20 text-emerald-400 border-emerald-500/40' :
    variant === 'naranja' ? 'bg-orange-500/20 text-orange-400 border-orange-500/40' :
    'bg-[#FF6600]/20 text-[#FF6600] border-[#FF6600]/40'
  return (
    <button
      onClick={onClick}
      className={`px-3 py-2 text-xs font-medium rounded-md border transition-colors ${
        active ? activeColor : 'border-[#1E2330] text-[#9CA3AF] hover:text-[#F0F2F5] hover:border-[#2D3441]'
      }`}
    >
      {children}
    </button>
  )
}
