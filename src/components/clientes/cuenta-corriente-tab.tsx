'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { formatCurrency, formatDate } from '@/lib/utils'
import { loadCuentaCorriente, type CCMovement, type CCSummary } from '@/lib/cuenta-corriente'
import { Loader2, Printer, Download, RefreshCw, FileSpreadsheet, ArrowDownCircle, ArrowUpCircle, RotateCcw } from 'lucide-react'

interface Props {
  clientId: string | string[]
  clientName: string
  clientRef?: string | null
  clientTaxId?: string | null
  companyId: string | null
  companyName?: string | null
}

type CurrencyCode = 'EUR' | 'ARS' | 'USD'
function asCurrency(c: string): CurrencyCode {
  return c === 'ARS' || c === 'USD' ? c : 'EUR'
}

export function CuentaCorrienteTab({ clientId, clientName, clientRef, clientTaxId, companyId, companyName }: Props) {
  const [movs, setMovs] = useState<CCMovement[]>([])
  const [summary, setSummary] = useState<CCSummary | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [from, setFrom] = useState<string>('')
  const [to, setTo] = useState<string>('')
  const [kindFilter, setKindFilter] = useState<'all' | 'factura' | 'cobro' | 'nota_credito'>('all')

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const res = await loadCuentaCorriente(clientId, companyId, {
        from: from || undefined,
        to: to || undefined,
      })
      setMovs(res.movements)
      setSummary(res.summary)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error cargando cuenta corriente')
    } finally {
      setLoading(false)
    }
  }, [clientId, companyId, from, to])

  useEffect(() => { void load() }, [load])

  const visibleMovs = useMemo(() => {
    if (kindFilter === 'all') return movs
    return movs.filter((m) => m.kind === kindFilter)
  }, [movs, kindFilter])

  const currency = asCurrency(summary?.currency || 'EUR')
  const saldoFinal = summary?.saldo ?? 0
  const saldoColor = saldoFinal > 0.005 ? 'text-red-400' : saldoFinal < -0.005 ? 'text-emerald-400' : 'text-[#9CA3AF]'
  const saldoLabel = saldoFinal > 0.005 ? 'Saldo a cobrar' : saldoFinal < -0.005 ? 'Saldo a favor del cliente' : 'Saldo cero'

  function exportCSV() {
    const rows = [
      ['Fecha', 'Tipo', 'Ref', 'Concepto', 'Debe', 'Haber', 'Saldo', 'Moneda', 'Estado'],
      ...visibleMovs.map((m) => [
        m.date, m.kind, m.ref, m.concept,
        m.debe.toFixed(2), m.haber.toFixed(2), m.saldo.toFixed(2),
        m.currency, m.status,
      ]),
    ]
    const csv = rows.map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(',')).join('\n')
    const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    const fname = clientRef || (Array.isArray(clientId) ? clientId[0] : clientId) || 'cliente'
    a.download = `cuenta-corriente_${String(fname).replace(/[^\w-]/g, '_')}_${new Date().toISOString().slice(0, 10)}.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

  function printExtract() {
    const w = window.open('', '_blank', 'width=900,height=700')
    if (!w) return
    const accentVerde = '#059669'
    const accentRojo = '#dc2626'
    const rows = visibleMovs.map((m) => `
      <tr>
        <td>${m.date}</td>
        <td>${kindLabel(m.kind)}</td>
        <td><b>${escape(m.ref)}</b></td>
        <td>${escape(m.concept)}</td>
        <td class="num" style="color:${accentRojo}">${m.debe ? fmt(m.debe, m.currency) : ''}</td>
        <td class="num" style="color:${accentVerde}">${m.haber ? fmt(m.haber, m.currency) : ''}</td>
        <td class="num" style="color:${m.saldo > 0 ? accentRojo : m.saldo < 0 ? accentVerde : '#374151'}; font-weight:600">${fmt(m.saldo, m.currency)}</td>
      </tr>`).join('')
    w.document.write(`<!doctype html><html><head><meta charset="utf-8"><title>Cuenta Corriente — ${escape(clientName)}</title>
      <style>
        body { font-family: -apple-system, "Segoe UI", Roboto, sans-serif; color: #111; padding: 30px; }
        h1 { margin:0; font-size: 20px; }
        .sub { color:#6b7280; font-size: 12px; margin: 4px 0 18px; }
        .cards { display:flex; gap:12px; margin-bottom:16px; }
        .card { flex:1; border:1px solid #e5e7eb; border-radius:8px; padding:12px 14px; }
        .card .label { font-size:11px; text-transform:uppercase; color:#6b7280; letter-spacing:.5px; }
        .card .value { font-size:18px; font-weight:600; margin-top:4px; }
        table { width:100%; border-collapse:collapse; font-size:12px; }
        th { background:#f9fafb; text-align:left; padding:8px 10px; border-bottom:1px solid #e5e7eb; font-weight:600; text-transform:uppercase; font-size:10px; color:#6b7280; letter-spacing:.4px; }
        td { padding:7px 10px; border-bottom:1px solid #f3f4f6; }
        .num { text-align:right; font-variant-numeric: tabular-nums; }
        @media print { body { padding: 10px; } }
      </style></head><body>
      <h1>Cuenta Corriente — ${escape(clientName)}</h1>
      <div class="sub">${clientRef ? escape(clientRef) + ' · ' : ''}${clientTaxId ? 'NIF: ' + escape(clientTaxId) + ' · ' : ''}${escape(companyName || '')} · ${new Date().toLocaleDateString('es-ES')}</div>
      <div class="cards">
        <div class="card"><div class="label">Total facturado</div><div class="value" style="color:${accentRojo}">${fmt(summary?.total_debe || 0, currency)}</div></div>
        <div class="card"><div class="label">Total cobrado / créditos</div><div class="value" style="color:${accentVerde}">${fmt(summary?.total_haber || 0, currency)}</div></div>
        <div class="card"><div class="label">Saldo actual</div><div class="value" style="color:${saldoFinal > 0 ? accentRojo : saldoFinal < 0 ? accentVerde : '#374151'}">${fmt(saldoFinal, currency)}</div></div>
        <div class="card"><div class="label">Movimientos</div><div class="value">${visibleMovs.length}</div></div>
      </div>
      <table><thead><tr>
        <th>Fecha</th><th>Tipo</th><th>Ref.</th><th>Concepto</th>
        <th class="num">Debe</th><th class="num">Haber</th><th class="num">Saldo</th>
      </tr></thead><tbody>${rows}</tbody></table>
      <script>window.onload = () => window.print();</script>
    </body></html>`)
    w.document.close()
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12 text-[#6B7280]">
        <Loader2 size={20} className="animate-spin mr-2" /> Cargando cuenta corriente...
      </div>
    )
  }

  if (error) {
    return (
      <Card>
        <div className="text-sm text-red-400 p-4">Error: {error}</div>
      </Card>
    )
  }

  return (
    <div className="space-y-4">
      {/* KPI cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <KPI label="Total facturado" value={formatCurrency(summary?.total_debe || 0, currency)} accent="rojo" />
        <KPI label="Cobrado / créditos" value={formatCurrency(summary?.total_haber || 0, currency)} accent="verde" />
        <KPI label={saldoLabel} value={formatCurrency(Math.abs(saldoFinal), currency)} accent={saldoFinal > 0 ? 'rojo' : saldoFinal < 0 ? 'verde' : 'neutral'} bold />
        <KPI label="Movimientos" value={String(visibleMovs.length)} accent="neutral" />
      </div>

      {/* Filtros */}
      <Card>
        <div className="flex flex-wrap items-end gap-3">
          <div className="flex-1 min-w-[140px]">
            <label className="block text-xs text-[#6B7280] mb-1">Desde</label>
            <Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
          </div>
          <div className="flex-1 min-w-[140px]">
            <label className="block text-xs text-[#6B7280] mb-1">Hasta</label>
            <Input type="date" value={to} onChange={(e) => setTo(e.target.value)} />
          </div>
          <div className="flex-1 min-w-[180px]">
            <label className="block text-xs text-[#6B7280] mb-1">Tipo de movimiento</label>
            <select
              value={kindFilter}
              onChange={(e) => setKindFilter(e.target.value as typeof kindFilter)}
              className="w-full bg-[#0F1218] border border-[#1E2330] rounded-md px-3 py-2 text-sm text-[#F0F2F5] focus:outline-none focus:border-[#FF6600]"
            >
              <option value="all">Todos</option>
              <option value="factura">Solo facturas</option>
              <option value="cobro">Solo cobros</option>
              <option value="nota_credito">Solo notas de crédito</option>
            </select>
          </div>
          <div className="flex gap-2">
            <Button variant="secondary" size="sm" onClick={() => { setFrom(''); setTo(''); setKindFilter('all') }}>
              <RotateCcw size={14} /> Limpiar
            </Button>
            <Button variant="secondary" size="sm" onClick={load}>
              <RefreshCw size={14} /> Recargar
            </Button>
            <Button variant="secondary" size="sm" onClick={exportCSV}>
              <FileSpreadsheet size={14} /> CSV
            </Button>
            <Button variant="secondary" size="sm" onClick={printExtract}>
              <Printer size={14} /> Imprimir
            </Button>
          </div>
        </div>
      </Card>

      {/* Tabla */}
      <div className="bg-[#0F1218] border border-[#1E2330] rounded-lg overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-[#141820] border-b border-[#1E2330]">
              <tr className="text-[#9CA3AF] text-xs uppercase tracking-wide">
                <th className="px-4 py-3 text-left font-medium">Fecha</th>
                <th className="px-4 py-3 text-left font-medium">Tipo</th>
                <th className="px-4 py-3 text-left font-medium">Ref.</th>
                <th className="px-4 py-3 text-left font-medium">Concepto</th>
                <th className="px-4 py-3 text-right font-medium">Debe</th>
                <th className="px-4 py-3 text-right font-medium">Haber</th>
                <th className="px-4 py-3 text-right font-medium">Saldo</th>
                <th className="px-4 py-3 text-left font-medium">Estado</th>
              </tr>
            </thead>
            <tbody>
              {visibleMovs.length === 0 && (
                <tr>
                  <td colSpan={8} className="px-4 py-10 text-center text-[#6B7280]">
                    No hay movimientos en el período seleccionado
                  </td>
                </tr>
              )}
              {visibleMovs.map((m) => (
                <tr key={m.id} className="border-b border-[#1E2330] hover:bg-[#141820] transition-colors">
                  <td className="px-4 py-2.5 text-[#9CA3AF] whitespace-nowrap font-mono text-xs">{formatDate(m.date, 'dd/MM/yyyy')}</td>
                  <td className="px-4 py-2.5">
                    <span className="inline-flex items-center gap-1.5 text-xs">
                      {m.kind === 'factura' && <ArrowUpCircle size={12} className="text-red-400" />}
                      {m.kind === 'cobro' && <ArrowDownCircle size={12} className="text-emerald-400" />}
                      {m.kind === 'nota_credito' && <RotateCcw size={12} className="text-blue-400" />}
                      <span className="text-[#F0F2F5]">{kindLabel(m.kind)}</span>
                    </span>
                  </td>
                  <td className="px-4 py-2.5 font-mono text-xs text-[#F0F2F5]">{m.ref}</td>
                  <td className="px-4 py-2.5 text-[#9CA3AF] max-w-[280px] truncate">{m.concept}</td>
                  <td className="px-4 py-2.5 text-right tabular-nums text-red-400 whitespace-nowrap">
                    {m.debe ? formatCurrency(m.debe, asCurrency(m.currency)) : ''}
                  </td>
                  <td className="px-4 py-2.5 text-right tabular-nums text-emerald-400 whitespace-nowrap">
                    {m.haber ? formatCurrency(m.haber, asCurrency(m.currency)) : ''}
                  </td>
                  <td className={`px-4 py-2.5 text-right tabular-nums font-semibold whitespace-nowrap ${m.saldo > 0.005 ? 'text-red-400' : m.saldo < -0.005 ? 'text-emerald-400' : 'text-[#6B7280]'}`}>
                    {formatCurrency(m.saldo, asCurrency(m.currency))}
                  </td>
                  <td className="px-4 py-2.5 text-xs text-[#6B7280] capitalize">{m.status.replace(/_/g, ' ')}</td>
                </tr>
              ))}
            </tbody>
            {visibleMovs.length > 0 && (
              <tfoot className="bg-[#141820] border-t border-[#1E2330]">
                <tr className="text-sm font-semibold">
                  <td colSpan={4} className="px-4 py-3 text-right text-[#9CA3AF]">Totales</td>
                  <td className="px-4 py-3 text-right tabular-nums text-red-400">
                    {formatCurrency(visibleMovs.reduce((s, m) => s + m.debe, 0), currency)}
                  </td>
                  <td className="px-4 py-3 text-right tabular-nums text-emerald-400">
                    {formatCurrency(visibleMovs.reduce((s, m) => s + m.haber, 0), currency)}
                  </td>
                  <td className={`px-4 py-3 text-right tabular-nums ${saldoColor}`}>
                    {formatCurrency(saldoFinal, currency)}
                  </td>
                  <td></td>
                </tr>
              </tfoot>
            )}
          </table>
        </div>
      </div>
    </div>
  )
}

function KPI({ label, value, accent, bold }: { label: string; value: string; accent: 'rojo' | 'verde' | 'neutral'; bold?: boolean }) {
  const color = accent === 'rojo' ? 'text-red-400' : accent === 'verde' ? 'text-emerald-400' : 'text-[#F0F2F5]'
  return (
    <div className="bg-[#0F1218] border border-[#1E2330] rounded-lg p-4">
      <div className="text-xs text-[#6B7280] uppercase tracking-wide">{label}</div>
      <div className={`mt-1 text-lg ${bold ? 'font-bold' : 'font-semibold'} ${color}`}>{value}</div>
    </div>
  )
}

function kindLabel(k: CCMovement['kind']) {
  return k === 'factura' ? 'Factura' : k === 'cobro' ? 'Cobro' : 'Nota crédito'
}

function escape(s: string) {
  return String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c] || c))
}

function fmt(v: number, cur: string) {
  return formatCurrency(v, asCurrency(cur))
}
