'use client'

import { useState, useEffect, useCallback, useMemo, Suspense } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Card } from '@/components/ui/card'
import { KPICard } from '@/components/ui/kpi-card'
import { Badge } from '@/components/ui/badge'
import { Tabs } from '@/components/ui/tabs'
import { Select } from '@/components/ui/select'
import { Input } from '@/components/ui/input'
import { ExportButton } from '@/components/ui/export-button'
import { DataTable, type DataTableColumn } from '@/components/ui/data-table'
import { formatCurrency, formatDate } from '@/lib/utils'
import { useCompanyFilter } from '@/hooks/use-company-filter'
import {
  BarChart3, TrendingUp, TrendingDown, DollarSign, CreditCard,
  Users, Package, Loader2, Calendar, PieChart, Activity,
  ArrowUpRight, ArrowDownRight, Wallet, Receipt, FileText,
  ShoppingCart, Truck, Building2
} from 'lucide-react'

type Row = Record<string, unknown>

const informesTabs = [
  { id: 'resumen', label: 'Resumen', icon: <PieChart size={16} /> },
  { id: 'resultados', label: 'Resultados', icon: <TrendingUp size={16} /> },
  { id: 'facturacion', label: 'Facturacion', icon: <CreditCard size={16} /> },
  { id: 'tesoreria', label: 'Tesoreria', icon: <Wallet size={16} /> },
  { id: 'ventas', label: 'Ventas', icon: <FileText size={16} /> },
  { id: 'rentabilidad', label: 'Rentabilidad', icon: <BarChart3 size={16} /> },
  { id: 'stock', label: 'Stock', icon: <Package size={16} /> },
]

const PERIOD_OPTIONS = [
  { value: 'month', label: 'Este mes' },
  { value: 'quarter', label: 'Este trimestre' },
  { value: 'semester', label: 'Este semestre' },
  { value: 'year', label: 'Este ano' },
  { value: 'last_year', label: 'Ano anterior' },
  { value: 'all', label: 'Todo' },
]

function getPeriodDates(period: string): { from: string; to: string } {
  const now = new Date()
  const y = now.getFullYear()
  const m = now.getMonth()
  switch (period) {
    case 'month': return { from: new Date(y, m, 1).toISOString(), to: now.toISOString() }
    case 'quarter': { const q = Math.floor(m / 3) * 3; return { from: new Date(y, q, 1).toISOString(), to: now.toISOString() } }
    case 'semester': { const s = m < 6 ? 0 : 6; return { from: new Date(y, s, 1).toISOString(), to: now.toISOString() } }
    case 'year': return { from: new Date(y, 0, 1).toISOString(), to: now.toISOString() }
    case 'last_year': return { from: new Date(y - 1, 0, 1).toISOString(), to: new Date(y - 1, 11, 31, 23, 59, 59).toISOString() }
    default: return { from: '2020-01-01T00:00:00Z', to: now.toISOString() }
  }
}

// ═══════════════════════════════════════════════════════
// RESUMEN TAB — Overview con KPIs principales
// ═══════════════════════════════════════════════════════
function ResumenTab() {
  const { filterByCompany } = useCompanyFilter()
  const [period, setPeriod] = useState('year')
  const [data, setData] = useState<{ ventas: number; compras: number; cobrado: number; pagado: number; facturasPend: number; docs: number; clientes: number; productos: number }>({ ventas: 0, compras: 0, cobrado: 0, pagado: 0, facturasPend: 0, docs: 0, clientes: 0, productos: 0 })
  const [loading, setLoading] = useState(true)

  const load = useCallback(async () => {
    setLoading(true)
    const sb = createClient()
    const { from, to } = getPeriodDates(period)

    let docsQuery = sb.from('tt_documents').select('type, status, total, created_at').gte('created_at', from).lte('created_at', to)
    docsQuery = filterByCompany(docsQuery)

    const [docsRes, clientsRes, productsRes, paymentsRes] = await Promise.all([
      docsQuery,
      sb.from('tt_clients').select('id', { count: 'exact', head: true }).eq('active', true),
      sb.from('tt_products').select('id', { count: 'exact', head: true }).eq('active', true),
      sb.from('tt_purchase_payments').select('amount').gte('created_at', from).lte('created_at', to),
    ])

    const docs = docsRes.data || []
    let ventas = 0, compras = 0, cobrado = 0, facturasPend = 0
    for (const d of docs) {
      const t = d.total as number || 0
      const type = d.type as string
      if (['presupuesto', 'pedido', 'albaran', 'factura'].includes(type)) {
        if (type === 'factura') { ventas += t; if (['pending', 'partial', 'open', 'sent'].includes(d.status as string)) facturasPend += t; else cobrado += t }
      }
      if (['pap', 'factura_compra'].includes(type)) compras += t
    }
    const pagado = (paymentsRes.data || []).reduce((s: number, p: Row) => s + ((p.amount as number) || 0), 0)

    setData({
      ventas, compras, cobrado, pagado, facturasPend,
      docs: docs.length,
      clientes: clientsRes.count || 0,
      productos: productsRes.count || 0,
    })
    setLoading(false)
  }, [period])

  useEffect(() => { load() }, [load])

  if (loading) return <div className="flex justify-center py-20"><Loader2 className="animate-spin text-[#FF6600]" size={32} /></div>

  const resultado = data.ventas - data.compras

  return (
    <div className="space-y-6">
      <div className="flex justify-end">
        <Select value={period} onChange={e => setPeriod(e.target.value)} options={PERIOD_OPTIONS} />
      </div>

      {/* KPIs principales */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <KPICard label="Ventas facturadas" value={formatCurrency(data.ventas)} icon={<TrendingUp size={22} />} color="#10B981" />
        <KPICard label="Compras / Gastos" value={formatCurrency(data.compras)} icon={<ShoppingCart size={22} />} color="#EF4444" />
        <KPICard label="Resultado" value={formatCurrency(resultado)} icon={resultado >= 0 ? <ArrowUpRight size={22} /> : <ArrowDownRight size={22} />} color={resultado >= 0 ? '#10B981' : '#EF4444'} />
        <KPICard label="Pendiente cobro" value={formatCurrency(data.facturasPend)} icon={<Receipt size={22} />} color="#F59E0B" />
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <KPICard label="Cobrado" value={formatCurrency(data.cobrado)} icon={<Wallet size={22} />} color="#10B981" />
        <KPICard label="Pagado a proveedores" value={formatCurrency(data.pagado)} icon={<CreditCard size={22} />} color="#3B82F6" />
        <KPICard label="Documentos generados" value={data.docs} icon={<FileText size={22} />} />
        <KPICard label="Clientes activos" value={data.clientes} icon={<Users size={22} />} />
      </div>

      {/* Barra resultado */}
      <Card>
        <h3 className="text-sm font-semibold text-[#F0F2F5] mb-3">Resultado del periodo</h3>
        <div className="flex items-center gap-4 mb-2">
          <span className="text-xs text-green-400">Ventas: {formatCurrency(data.ventas)}</span>
          <span className="text-xs text-red-400">Compras: {formatCurrency(data.compras)}</span>
          <span className={`text-xs font-bold ${resultado >= 0 ? 'text-green-400' : 'text-red-400'}`}>Resultado: {formatCurrency(resultado)}</span>
        </div>
        <div className="w-full h-5 rounded-full overflow-hidden flex bg-[#1E2330]">
          {data.ventas > 0 && <div className="h-full bg-green-500/70" style={{ width: `${(data.ventas / (data.ventas + data.compras || 1)) * 100}%` }} />}
          {data.compras > 0 && <div className="h-full bg-red-500/70" style={{ width: `${(data.compras / (data.ventas + data.compras || 1)) * 100}%` }} />}
        </div>
      </Card>
    </div>
  )
}

// ═══════════════════════════════════════════════════════
// RESULTADOS TAB — Ventas vs Gastos por Cliente/Empleado/Catalogo
// ═══════════════════════════════════════════════════════
function ResultadosTab() {
  const { filterByCompany } = useCompanyFilter()
  const [period, setPeriod] = useState('year')
  const [groupBy, setGroupBy] = useState<'cliente' | 'tipo'>('cliente')
  const [rows, setRows] = useState<Row[]>([])
  const [loading, setLoading] = useState(true)

  const load = useCallback(async () => {
    setLoading(true)
    const sb = createClient()
    const { from, to } = getPeriodDates(period)
    let q = sb.from('tt_documents').select('type, status, total, client:tt_clients(name, legal_name)').gte('created_at', from).lte('created_at', to)
    q = filterByCompany(q)
    const { data } = await q

    if (groupBy === 'cliente') {
      const map = new Map<string, { cliente: string; ventas: number; compras: number }>()
      for (const d of (data || []) as Row[]) {
        const client = d.client as unknown as Row | null
        const name = (client?.legal_name as string) || (client?.name as string) || 'Sin cliente'
        if (!map.has(name)) map.set(name, { cliente: name, ventas: 0, compras: 0 })
        const m = map.get(name)!
        const t = (d.total as number) || 0
        if (['factura'].includes(d.type as string)) m.ventas += t
        if (['pap', 'factura_compra'].includes(d.type as string)) m.compras += t
      }
      setRows(Array.from(map.values()).map(r => ({ ...r, resultado: r.ventas - r.compras })).sort((a, b) => b.ventas - a.ventas))
    } else {
      const map = new Map<string, { tipo: string; cantidad: number; total: number }>()
      for (const d of (data || [])) {
        const type = d.type as string
        if (!map.has(type)) map.set(type, { tipo: type, cantidad: 0, total: 0 })
        const m = map.get(type)!
        m.cantidad++; m.total += (d.total as number) || 0
      }
      setRows(Array.from(map.values()).sort((a, b) => b.total - a.total))
    }
    setLoading(false)
  }, [period, groupBy])

  useEffect(() => { load() }, [load])

  const columns: DataTableColumn[] = groupBy === 'cliente'
    ? [
        { key: 'cliente', label: 'Cliente', sortable: true, searchable: true, type: 'text' },
        { key: 'ventas', label: 'Ventas', sortable: true, type: 'currency' },
        { key: 'compras', label: 'Compras', sortable: true, type: 'currency' },
        { key: 'resultado', label: 'Resultado', sortable: true, type: 'currency' },
      ]
    : [
        { key: 'tipo', label: 'Tipo documento', sortable: true, type: 'text' },
        { key: 'cantidad', label: 'Cantidad', sortable: true, type: 'number' },
        { key: 'total', label: 'Importe total', sortable: true, type: 'currency' },
      ]

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3 justify-end">
        <Select value={groupBy} onChange={e => setGroupBy(e.target.value as 'cliente' | 'tipo')} options={[{ value: 'cliente', label: 'Por cliente' }, { value: 'tipo', label: 'Por tipo documento' }]} />
        <Select value={period} onChange={e => setPeriod(e.target.value)} options={PERIOD_OPTIONS} />
      </div>
      <DataTable data={rows} columns={columns} loading={loading} showTotals pageSize={50} totalLabel="registros" exportFilename="informe_resultados" />
    </div>
  )
}

// ═══════════════════════════════════════════════════════
// FACTURACION TAB — Por cliente, empleado, periodo
// ═══════════════════════════════════════════════════════
function FacturacionTab() {
  const { filterByCompany } = useCompanyFilter()
  const [period, setPeriod] = useState('year')
  const [rows, setRows] = useState<Row[]>([])
  const [loading, setLoading] = useState(true)

  const load = useCallback(async () => {
    setLoading(true)
    const sb = createClient()
    const { from, to } = getPeriodDates(period)
    let q = sb.from('tt_documents').select('type, status, total, client:tt_clients(name, legal_name)').in('type', ['factura', 'factura_abono']).gte('created_at', from).lte('created_at', to)
    q = filterByCompany(q)
    const { data } = await q

    const map = new Map<string, { cliente: string; facturado: number; cobrado: number; pendiente: number; facturas: number }>()
    for (const d of (data || [])) {
      const client = d.client as unknown as Row | null
      const name = (client?.legal_name as string) || (client?.name as string) || 'Sin cliente'
      if (!map.has(name)) map.set(name, { cliente: name, facturado: 0, cobrado: 0, pendiente: 0, facturas: 0 })
      const m = map.get(name)!
      const t = (d.total as number) || 0
      m.facturado += t; m.facturas++
      if (['pending', 'partial', 'open', 'sent', 'draft'].includes(d.status as string)) m.pendiente += t
      else m.cobrado += t
    }
    setRows(Array.from(map.values()).sort((a, b) => b.facturado - a.facturado))
    setLoading(false)
  }, [period])

  useEffect(() => { load() }, [load])

  return (
    <div className="space-y-4">
      <div className="flex justify-end"><Select value={period} onChange={e => setPeriod(e.target.value)} options={PERIOD_OPTIONS} /></div>
      <DataTable
        data={rows}
        columns={[
          { key: 'cliente', label: 'Cliente', sortable: true, searchable: true, type: 'text' },
          { key: 'facturas', label: 'Facturas', sortable: true, type: 'number' },
          { key: 'facturado', label: 'Facturado', sortable: true, type: 'currency' },
          { key: 'cobrado', label: 'Cobrado', sortable: true, type: 'currency' },
          { key: 'pendiente', label: 'Pendiente', sortable: true, type: 'currency' },
        ]}
        loading={loading} showTotals pageSize={50} totalLabel="clientes" exportFilename="informe_facturacion"
      />
    </div>
  )
}

// ═══════════════════════════════════════════════════════
// TESORERIA TAB — Cobros vs Pagos, facturas pendientes
// ═══════════════════════════════════════════════════════
function TesoreriaTab() {
  const { filterByCompany } = useCompanyFilter()
  const [period, setPeriod] = useState('year')
  const [salesInvoices, setSalesInvoices] = useState<Row[]>([])
  const [purchaseInvoices, setPurchaseInvoices] = useState<Row[]>([])
  const [loading, setLoading] = useState(true)

  const load = useCallback(async () => {
    setLoading(true)
    const sb = createClient()
    const { from, to } = getPeriodDates(period)

    let salesQuery = sb.from('tt_documents').select('id, display_ref, system_code, type, status, total, created_at, client:tt_clients(legal_name, name)').in('type', ['factura', 'factura_abono']).gte('created_at', from).lte('created_at', to).order('created_at', { ascending: false })
    salesQuery = filterByCompany(salesQuery)
    let purchQuery = sb.from('tt_documents').select('id, display_ref, system_code, type, status, total, created_at, client:tt_clients(legal_name, name)').eq('type', 'factura_compra').gte('created_at', from).lte('created_at', to).order('created_at', { ascending: false })
    purchQuery = filterByCompany(purchQuery)

    const [salesRes, purchRes] = await Promise.all([
      salesQuery,
      purchQuery,
    ])

    setSalesInvoices((salesRes.data || []).map((d: Row) => {
      const client = d.client as unknown as Row | null
      return { ref: (d.display_ref as string) || (d.system_code as string) || '-', cliente: (client?.legal_name as string) || (client?.name as string) || '-', total: d.total, estado: d.status, fecha: d.created_at, tipo: 'venta' }
    }))
    setPurchaseInvoices((purchRes.data || []).map((d: Row) => {
      const client = d.client as unknown as Row | null
      return { ref: (d.display_ref as string) || (d.system_code as string) || '-', proveedor: (client?.legal_name as string) || (client?.name as string) || '-', total: d.total, estado: d.status, fecha: d.created_at, tipo: 'compra' }
    }))
    setLoading(false)
  }, [period])

  useEffect(() => { load() }, [load])

  const totalCobrar = salesInvoices.filter(i => ['pending', 'partial', 'open', 'sent', 'draft'].includes(i.estado as string)).reduce((s, i) => s + ((i.total as number) || 0), 0)
  const totalCobrado = salesInvoices.filter(i => !['pending', 'partial', 'open', 'sent', 'draft'].includes(i.estado as string)).reduce((s, i) => s + ((i.total as number) || 0), 0)
  const totalPagar = purchaseInvoices.filter(i => ['pending', 'partial', 'open', 'sent', 'draft'].includes(i.estado as string)).reduce((s, i) => s + ((i.total as number) || 0), 0)
  const totalPagado = purchaseInvoices.filter(i => !['pending', 'partial', 'open', 'sent', 'draft'].includes(i.estado as string)).reduce((s, i) => s + ((i.total as number) || 0), 0)

  return (
    <div className="space-y-4">
      <div className="flex justify-end"><Select value={period} onChange={e => setPeriod(e.target.value)} options={PERIOD_OPTIONS} /></div>
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <KPICard label="Cobrado" value={formatCurrency(totalCobrado)} icon={<ArrowUpRight size={22} />} color="#10B981" />
        <KPICard label="Pendiente cobrar" value={formatCurrency(totalCobrar)} icon={<Receipt size={22} />} color="#F59E0B" />
        <KPICard label="Pagado" value={formatCurrency(totalPagado)} icon={<ArrowDownRight size={22} />} color="#3B82F6" />
        <KPICard label="Pendiente pagar" value={formatCurrency(totalPagar)} icon={<CreditCard size={22} />} color="#EF4444" />
      </div>

      <Card>
        <h3 className="text-sm font-semibold text-[#F0F2F5] mb-3">Facturas de venta ({salesInvoices.length})</h3>
        <DataTable
          data={salesInvoices}
          columns={[
            { key: 'ref', label: 'Referencia', sortable: true, searchable: true },
            { key: 'cliente', label: 'Cliente', sortable: true, searchable: true },
            { key: 'estado', label: 'Estado', sortable: true, type: 'status' },
            { key: 'fecha', label: 'Fecha', sortable: true, type: 'date' },
            { key: 'total', label: 'Importe', sortable: true, type: 'currency' },
          ]}
          loading={loading} showTotals pageSize={25} totalLabel="facturas venta" exportFilename="tesoreria_ventas"
        />
      </Card>

      <Card>
        <h3 className="text-sm font-semibold text-[#F0F2F5] mb-3">Facturas de compra ({purchaseInvoices.length})</h3>
        <DataTable
          data={purchaseInvoices}
          columns={[
            { key: 'ref', label: 'Referencia', sortable: true, searchable: true },
            { key: 'proveedor', label: 'Proveedor', sortable: true, searchable: true },
            { key: 'estado', label: 'Estado', sortable: true, type: 'status' },
            { key: 'fecha', label: 'Fecha', sortable: true, type: 'date' },
            { key: 'total', label: 'Importe', sortable: true, type: 'currency' },
          ]}
          loading={loading} showTotals pageSize={25} totalLabel="facturas compra" exportFilename="tesoreria_compras"
        />
      </Card>
    </div>
  )
}

// ═══════════════════════════════════════════════════════
// VENTAS TAB — Desglose por tipo documento
// ═══════════════════════════════════════════════════════
function VentasTab() {
  const { filterByCompany } = useCompanyFilter()
  const [period, setPeriod] = useState('year')
  const [stats, setStats] = useState<{ presupuestos: { count: number; total: number; abiertos: number }; pedidos: { count: number; total: number; abiertos: number }; albaranes: { count: number; total: number }; facturas: { count: number; total: number; cobradas: number; pendientes: number } }>({
    presupuestos: { count: 0, total: 0, abiertos: 0 }, pedidos: { count: 0, total: 0, abiertos: 0 },
    albaranes: { count: 0, total: 0 }, facturas: { count: 0, total: 0, cobradas: 0, pendientes: 0 },
  })
  const [loading, setLoading] = useState(true)

  const load = useCallback(async () => {
    setLoading(true)
    const sb = createClient()
    const { from, to } = getPeriodDates(period)
    let q = sb.from('tt_documents').select('type, status, total').gte('created_at', from).lte('created_at', to)
    q = filterByCompany(q)
    const { data } = await q

    const s = { presupuestos: { count: 0, total: 0, abiertos: 0 }, pedidos: { count: 0, total: 0, abiertos: 0 }, albaranes: { count: 0, total: 0 }, facturas: { count: 0, total: 0, cobradas: 0, pendientes: 0 } }
    for (const d of (data || [])) {
      const t = (d.total as number) || 0
      const st = d.status as string
      switch (d.type as string) {
        case 'presupuesto': s.presupuestos.count++; s.presupuestos.total += t; if (['draft', 'sent', 'open'].includes(st)) s.presupuestos.abiertos++; break
        case 'pedido': s.pedidos.count++; s.pedidos.total += t; if (['open', 'sent', 'draft'].includes(st)) s.pedidos.abiertos++; break
        case 'albaran': s.albaranes.count++; s.albaranes.total += t; break
        case 'factura': case 'factura_abono': s.facturas.count++; s.facturas.total += t; if (['paid', 'closed', 'cobrada'].includes(st)) s.facturas.cobradas += t; else s.facturas.pendientes += t; break
      }
    }
    setStats(s)
    setLoading(false)
  }, [period])

  useEffect(() => { load() }, [load])

  if (loading) return <div className="flex justify-center py-20"><Loader2 className="animate-spin text-[#FF6600]" size={32} /></div>

  const sections = [
    { title: 'Presupuestos / Cotizaciones', icon: <FileText size={22} />, count: stats.presupuestos.count, total: stats.presupuestos.total, sub: `${stats.presupuestos.abiertos} abiertos`, color: '#3B82F6' },
    { title: 'Pedidos', icon: <ShoppingCart size={22} />, count: stats.pedidos.count, total: stats.pedidos.total, sub: `${stats.pedidos.abiertos} abiertos`, color: '#F59E0B' },
    { title: 'Albaranes / Remitos', icon: <Truck size={22} />, count: stats.albaranes.count, total: stats.albaranes.total, sub: '', color: '#8B5CF6' },
    { title: 'Facturas', icon: <CreditCard size={22} />, count: stats.facturas.count, total: stats.facturas.total, sub: `Cobradas: ${formatCurrency(stats.facturas.cobradas)} | Pend: ${formatCurrency(stats.facturas.pendientes)}`, color: '#10B981' },
  ]

  return (
    <div className="space-y-4">
      <div className="flex justify-end"><Select value={period} onChange={e => setPeriod(e.target.value)} options={PERIOD_OPTIONS} /></div>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {sections.map(s => (
          <Card key={s.title}>
            <div className="flex items-center gap-4">
              <div className="w-12 h-12 rounded-xl flex items-center justify-center" style={{ backgroundColor: `${s.color}15`, color: s.color }}>{s.icon}</div>
              <div className="flex-1">
                <h3 className="text-sm font-semibold text-[#F0F2F5]">{s.title}</h3>
                <p className="text-[10px] text-[#6B7280]">{s.count} documentos{s.sub ? ` — ${s.sub}` : ''}</p>
              </div>
              <p className="text-lg font-bold" style={{ color: s.color }}>{formatCurrency(s.total)}</p>
            </div>
          </Card>
        ))}
      </div>
    </div>
  )
}

// ═══════════════════════════════════════════════════════
// RENTABILIDAD TAB — Por producto y cliente
// ═══════════════════════════════════════════════════════
function RentabilidadTab() {
  const { filterByCompany } = useCompanyFilter()
  const [period, setPeriod] = useState('year')
  const [groupBy, setGroupBy] = useState<'producto' | 'cliente'>('producto')
  const [rows, setRows] = useState<Row[]>([])
  const [loading, setLoading] = useState(true)

  const load = useCallback(async () => {
    setLoading(true)
    const sb = createClient()
    const { from, to } = getPeriodDates(period)

    // Load factura items with product costs
    // Load factura documents first, then their items
    let facturaQuery = sb.from('tt_documents').select('id, type, client:tt_clients(legal_name, name)').eq('type', 'factura').gte('created_at', from).lte('created_at', to)
    facturaQuery = filterByCompany(facturaQuery)
    const { data: facturaDocs } = await facturaQuery
    const facturaIds = (facturaDocs || []).map((d: Row) => d.id as string)
    const clientByDoc: Record<string, string> = {}
    for (const d of (facturaDocs || [])) {
      const c = d.client as unknown as Row | null
      clientByDoc[d.id as string] = (c?.legal_name as string) || (c?.name as string) || 'Sin cliente'
    }
    const { data: items } = facturaIds.length > 0
      ? await sb.from('tt_document_items').select('sku, description, quantity, unit_price, unit_cost, subtotal, product_id, document_id').in('document_id', facturaIds)
      : { data: [] }

    // Also load product costs for fallback
    const productIds = [...new Set((items || []).map((i: Row) => i.product_id).filter(Boolean))] as string[]
    const { data: products } = productIds.length > 0 ? await sb.from('tt_products').select('id, cost_eur').in('id', productIds) : { data: [] }
    const costMap: Record<string, number> = {}
    for (const p of (products || [])) costMap[p.id as string] = (p.cost_eur as number) || 0

    if (groupBy === 'producto') {
      const map = new Map<string, { producto: string; sku: string; unidades: number; venta: number; costo: number; beneficio: number; margen: number }>()
      for (const item of (items || [])) {
        const key = (item.sku as string) || (item.description as string) || 'Sin SKU'
        if (!map.has(key)) map.set(key, { producto: (item.description as string) || key, sku: (item.sku as string) || '', unidades: 0, venta: 0, costo: 0, beneficio: 0, margen: 0 })
        const m = map.get(key)!
        const qty = (item.quantity as number) || 0
        const cost = (item.unit_cost as number) || costMap[(item.product_id as string) || ''] || 0
        m.unidades += qty
        m.venta += (item.subtotal as number) || 0
        m.costo += qty * cost
      }
      const arr = Array.from(map.values()).map(r => ({ ...r, beneficio: r.venta - r.costo, margen: r.venta > 0 ? ((r.venta - r.costo) / r.venta) * 100 : 0 }))
      setRows(arr.sort((a, b) => b.venta - a.venta))
    } else {
      const map = new Map<string, { cliente: string; venta: number; costo: number; beneficio: number; margen: number; facturas: number }>()
      for (const item of (items || [])) {
        const docId = item.document_id as string
        const name = clientByDoc[docId] || 'Sin cliente'
        if (!map.has(name)) map.set(name, { cliente: name, venta: 0, costo: 0, beneficio: 0, margen: 0, facturas: 0 })
        const m = map.get(name)!
        const qty = (item.quantity as number) || 0
        const cost = (item.unit_cost as number) || costMap[(item.product_id as string) || ''] || 0
        m.venta += (item.subtotal as number) || 0
        m.costo += qty * cost
        m.facturas++
      }
      const arr = Array.from(map.values()).map(r => ({ ...r, beneficio: r.venta - r.costo, margen: r.venta > 0 ? ((r.venta - r.costo) / r.venta) * 100 : 0 }))
      setRows(arr.sort((a, b) => b.venta - a.venta))
    }
    setLoading(false)
  }, [period, groupBy])

  useEffect(() => { load() }, [load])

  const columns: DataTableColumn[] = groupBy === 'producto'
    ? [
        { key: 'sku', label: 'SKU', sortable: true, searchable: true },
        { key: 'producto', label: 'Producto', sortable: true, searchable: true },
        { key: 'unidades', label: 'Uds vendidas', sortable: true, type: 'number' },
        { key: 'venta', label: 'Venta', sortable: true, type: 'currency' },
        { key: 'costo', label: 'Costo', sortable: true, type: 'currency' },
        { key: 'beneficio', label: 'Beneficio', sortable: true, type: 'currency' },
        { key: 'margen', label: 'Margen %', sortable: true, type: 'number', render: (v) => { const m = v as number; return <span className={`font-bold ${m >= 20 ? 'text-green-400' : m >= 10 ? 'text-yellow-400' : 'text-red-400'}`}>{m.toFixed(1)}%</span> } },
      ]
    : [
        { key: 'cliente', label: 'Cliente', sortable: true, searchable: true },
        { key: 'facturas', label: 'Lineas', sortable: true, type: 'number' },
        { key: 'venta', label: 'Venta', sortable: true, type: 'currency' },
        { key: 'costo', label: 'Costo', sortable: true, type: 'currency' },
        { key: 'beneficio', label: 'Beneficio', sortable: true, type: 'currency' },
        { key: 'margen', label: 'Margen %', sortable: true, type: 'number', render: (v) => { const m = v as number; return <span className={`font-bold ${m >= 20 ? 'text-green-400' : m >= 10 ? 'text-yellow-400' : 'text-red-400'}`}>{m.toFixed(1)}%</span> } },
      ]

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3 justify-end">
        <Select value={groupBy} onChange={e => setGroupBy(e.target.value as 'producto' | 'cliente')} options={[{ value: 'producto', label: 'Por producto' }, { value: 'cliente', label: 'Por cliente' }]} />
        <Select value={period} onChange={e => setPeriod(e.target.value)} options={PERIOD_OPTIONS} />
      </div>
      <DataTable data={rows} columns={columns} loading={loading} showTotals pageSize={50} totalLabel="registros" exportFilename="informe_rentabilidad" />
    </div>
  )
}

// ═══════════════════════════════════════════════════════
// STOCK TAB — Valoracion de inventario
// ═══════════════════════════════════════════════════════
function StockTab() {
  const [rows, setRows] = useState<Row[]>([])
  const [loading, setLoading] = useState(true)

  const load = useCallback(async () => {
    setLoading(true)
    const sb = createClient()
    const { data } = await sb.from('tt_stock').select('quantity, min_quantity, product:tt_products(sku, name, brand, price_eur, cost_eur), warehouse:tt_warehouses(name)').gt('quantity', 0).order('quantity', { ascending: false }).limit(500)

    const mapped = (data || []).map((s: Row) => {
      const prod = s.product as Row | null
      const wh = s.warehouse as Row | null
      const qty = (s.quantity as number) || 0
      const price = (prod?.price_eur as number) || 0
      const cost = (prod?.cost_eur as number) || 0
      return {
        sku: prod?.sku || '-',
        producto: prod?.name || '-',
        marca: prod?.brand || '-',
        almacen: wh?.name || '-',
        cantidad: qty,
        min: (s.min_quantity as number) || 0,
        valor_venta: qty * price,
        valor_costo: qty * cost,
        estado: qty === 0 ? 'Sin stock' : qty <= ((s.min_quantity as number) || 0) ? 'Stock bajo' : 'OK',
      }
    })
    setRows(mapped)
    setLoading(false)
  }, [])

  useEffect(() => { load() }, [load])

  const totalVenta = rows.reduce((s, r) => s + ((r.valor_venta as number) || 0), 0)
  const totalCosto = rows.reduce((s, r) => s + ((r.valor_costo as number) || 0), 0)
  const totalUnidades = rows.reduce((s, r) => s + ((r.cantidad as number) || 0), 0)

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <KPICard label="Productos en stock" value={rows.length} icon={<Package size={22} />} />
        <KPICard label="Total unidades" value={totalUnidades.toLocaleString()} icon={<Activity size={22} />} />
        <KPICard label="Valor stock (venta)" value={formatCurrency(totalVenta)} icon={<TrendingUp size={22} />} color="#10B981" />
        <KPICard label="Valor stock (costo)" value={formatCurrency(totalCosto)} icon={<DollarSign size={22} />} color="#3B82F6" />
      </div>
      <DataTable
        data={rows}
        columns={[
          { key: 'sku', label: 'SKU', sortable: true, searchable: true },
          { key: 'producto', label: 'Producto', sortable: true, searchable: true },
          { key: 'marca', label: 'Marca', sortable: true, searchable: true },
          { key: 'almacen', label: 'Almacen', sortable: true },
          { key: 'cantidad', label: 'Cantidad', sortable: true, type: 'number' },
          { key: 'min', label: 'Minimo', sortable: true, type: 'number' },
          { key: 'valor_venta', label: 'Valor venta', sortable: true, type: 'currency' },
          { key: 'valor_costo', label: 'Valor costo', sortable: true, type: 'currency' },
          { key: 'estado', label: 'Estado', sortable: true, type: 'status' },
        ]}
        loading={loading} showTotals pageSize={50} totalLabel="productos" exportFilename="informe_stock"
      />
    </div>
  )
}

// ═══════════════════════════════════════════════════════
// MAIN PAGE
// ═══════════════════════════════════════════════════════
export default function InformesPage() {
  return (
    <div className="space-y-6 animate-fade-in">
      <div>
        <h1 className="text-2xl font-bold text-[#F0F2F5]">Informes</h1>
        <p className="text-sm text-[#6B7280] mt-1">Resultados, facturacion, tesoreria, ventas, rentabilidad y stock</p>
      </div>
      <Suspense fallback={<div className="flex justify-center py-10"><Loader2 className="animate-spin text-[#FF6600]" size={32} /></div>}>
        <Tabs tabs={informesTabs} defaultTab="resumen">
          {(activeTab) => (
            <>
              {activeTab === 'resumen' && <ResumenTab />}
              {activeTab === 'resultados' && <ResultadosTab />}
              {activeTab === 'facturacion' && <FacturacionTab />}
              {activeTab === 'tesoreria' && <TesoreriaTab />}
              {activeTab === 'ventas' && <VentasTab />}
              {activeTab === 'rentabilidad' && <RentabilidadTab />}
              {activeTab === 'stock' && <StockTab />}
            </>
          )}
        </Tabs>
      </Suspense>
    </div>
  )
}
