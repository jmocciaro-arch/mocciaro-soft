'use client'

import '@/components/sat/buscatools-theme.css'
import { useState, useEffect, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { SearchBar } from '@/components/ui/search-bar'
import { KPICard } from '@/components/ui/kpi-card'
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from '@/components/ui/table'
import { useCompanyFilter } from '@/hooks/use-company-filter'
import { buildCsv, CSV_HDR_HISTORY, downloadCsv, buildServiceRow } from '@/lib/sat/csv-export'
import { fmtNumber } from '@/lib/sat/currency-converter'
import { FileText, Download, Calendar, CheckCircle, AlertTriangle } from 'lucide-react'

type Row = Record<string, unknown>

export default function HistoricoPage() {
  const { filterByCompany, companyKey } = useCompanyFilter()
  const [records, setRecords] = useState<Row[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')

  const load = useCallback(async () => {
    setLoading(true)
    const sb = createClient()
    let q = sb
      .from('tt_sat_service_history')
      .select('*, tt_sat_assets(ref, internal_id, model_normalized, client_name_raw, tt_clients(name))')
      .order('fecha', { ascending: false })
      .limit(1000)
    q = filterByCompany(q)
    const { data } = await q
    setRecords((data || []) as Row[])
    setLoading(false)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [companyKey])

  useEffect(() => { load() }, [load])

  const filtered = search
    ? records.filter((h) => {
        const asset = (h.tt_sat_assets as Row) || {}
        const cli = ((asset.tt_clients as Row)?.name as string) || (asset.client_name_raw as string) || ''
        return [h.fecha, h.tipo, h.tecnico, h.obs, asset.ref, asset.internal_id, asset.model_normalized, cli]
          .some((v) => ((v as string) || '').toLowerCase().includes(search.toLowerCase()))
      })
    : records

  const aprobadas = records.filter((h) => h.estado_final === 'APROBADA').length
  const reprobadas = records.filter((h) => h.estado_final === 'REPROBADA').length

  const exportCsv = () => {
    const rows = filtered.map((h, i) => {
      const asset = (h.tt_sat_assets as Row) || {}
      const torque = (h.torque_measurements as Record<string, unknown>) || {}
      const partes = (h.partes as Record<string, string>) || {}
      return [
        (asset.ref as string) || '', (h.service_number as number) || i + 1,
        h.fecha || '', h.tecnico || '',
        partes.carcasa || '', partes.tornillos || '', partes.conectores || '', '', '',
        partes.embrague || '', partes.firmware || '', partes.reversa || '', partes.cabezal || '', partes.rotor || '', '',
        ...((torque.min as unknown[]) || Array(10).fill(null)),
        ...((torque.max as unknown[]) || Array(10).fill(null)),
        ...((torque.tgt as unknown[]) || Array(10).fill(null)),
        h.tipo || '', '', '', h.tiempo_horas || '', h.estado_final || '',
        h.aprietes || '', torque.cp || '', torque.cpk || '', h.obs || '',
      ]
    })
    const csv = buildCsv(CSV_HDR_HISTORY, rows)
    downloadCsv(csv, `SAT_historico_${new Date().toISOString().split('T')[0]}.csv`)
  }

  return (
    <div className="sat-theme space-y-6">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold" style={{ color: 'var(--sat-tx)' }}>Histórico de Servicios</h1>
          <p className="text-sm mt-1" style={{ color: 'var(--sat-tx2)' }}>Registro permanente de todas las reparaciones cerradas</p>
        </div>
        <Button onClick={exportCsv} disabled={!filtered.length}>
          <Download size={16} /> Exportar CSV
        </Button>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <KPICard label="Total servicios" value={records.length} icon={<FileText size={22} />} />
        <KPICard label="Aprobados" value={aprobadas} icon={<CheckCircle size={22} />} color="#10B981" />
        <KPICard label="Reprobados" value={reprobadas} icon={<AlertTriangle size={22} />} color="#EF4444" />
      </div>

      <Card>
        <SearchBar placeholder="Buscar por ref, técnico, cliente, observaciones..." value={search} onChange={setSearch} />
      </Card>

      <Card className="p-0 overflow-hidden">
        {loading ? (
          <div className="text-center py-16 text-sm" style={{ color: 'var(--sat-tx2)' }}>Cargando...</div>
        ) : filtered.length === 0 ? (
          <div className="text-center py-16">
            <Calendar size={48} className="mx-auto mb-3 opacity-30" style={{ color: 'var(--sat-tx3)' }} />
            <p style={{ color: 'var(--sat-tx2)' }}>Sin registros en el histórico</p>
          </div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Ref</TableHead>
                  <TableHead>N°</TableHead>
                  <TableHead>Fecha</TableHead>
                  <TableHead>Tipo</TableHead>
                  <TableHead>Técnico</TableHead>
                  <TableHead>Cliente</TableHead>
                  <TableHead>Modelo</TableHead>
                  <TableHead>Cp</TableHead>
                  <TableHead>Cpk</TableHead>
                  <TableHead>Tiempo</TableHead>
                  <TableHead>Total</TableHead>
                  <TableHead>Estado</TableHead>
                  <TableHead>PDF</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.map((h) => {
                  const asset = (h.tt_sat_assets as Row) || {}
                  const cli = ((asset.tt_clients as Row)?.name as string) || (asset.client_name_raw as string) || '–'
                  const torque = (h.torque_measurements as Record<string, unknown>) || {}
                  const tipoVariant = ((h.tipo as string) || '').toLowerCase().includes('corr') ? 'warning' : 'info'
                  const estadoVariant = h.estado_final === 'APROBADA' ? 'success' : h.estado_final === 'REPROBADA' ? 'danger' : 'default'
                  return (
                    <TableRow key={h.id as string}>
                      <TableCell><span style={{ fontFamily: 'var(--sat-mo)', color: 'var(--sat-or)', fontSize: 13 }}>{(asset.ref as string) || '–'}</span></TableCell>
                      <TableCell><span style={{ fontFamily: 'var(--sat-mo)', fontSize: 13, textAlign: 'center' }}>{(h.service_number as number) ?? '–'}</span></TableCell>
                      <TableCell><span style={{ fontFamily: 'var(--sat-mo)', fontSize: 13 }}>{(h.fecha as string) || '–'}</span></TableCell>
                      <TableCell><Badge variant={tipoVariant as any}>{(h.tipo as string) || '–'}</Badge></TableCell>
                      <TableCell><span style={{ fontSize: 13 }}>{(h.tecnico as string) || '–'}</span></TableCell>
                      <TableCell><span style={{ fontSize: 13 }}>{cli}</span></TableCell>
                      <TableCell><span style={{ fontFamily: 'var(--sat-mo)', color: 'var(--sat-bl)', fontSize: 13 }}>{(asset.model_normalized as string) || '–'}</span></TableCell>
                      <TableCell><span style={{ fontFamily: 'var(--sat-mo)', fontSize: 13, color: 'var(--sat-bl)' }}>{(torque.cp as number)?.toFixed?.(3) ?? '–'}</span></TableCell>
                      <TableCell><span style={{ fontFamily: 'var(--sat-mo)', fontSize: 13, color: 'var(--sat-bl)' }}>{(torque.cpk as number)?.toFixed?.(3) ?? '–'}</span></TableCell>
                      <TableCell><span style={{ fontSize: 13 }}>{h.tiempo_horas ? `${h.tiempo_horas}h` : '–'}</span></TableCell>
                      <TableCell><span style={{ fontFamily: 'var(--sat-mo)', color: 'var(--sat-or)' }}>{h.cot_total ? `$ ${fmtNumber(h.cot_total as number)}` : '–'}</span></TableCell>
                      <TableCell><Badge variant={estadoVariant as any}>{(h.estado_final as string) || '–'}</Badge></TableCell>
                      <TableCell>
                        <div className="flex gap-1">
                          <a href={`/sat/historico/${h.id}/pdf`} target="_blank" rel="noreferrer" title="PDF del servicio">
                            <Button size="sm" variant="ghost"><Download size={12} /></Button>
                          </a>
                          {h.pdf_url ? (
                            <a href={h.pdf_url as string} target="_blank" rel="noreferrer" title={`PDF original${h.ntt_number ? ` (${h.ntt_number as string})` : ''}`}>
                              <Button size="sm" variant="ghost">📄</Button>
                            </a>
                          ) : null}
                        </div>
                      </TableCell>
                    </TableRow>
                  )
                })}
              </TableBody>
            </Table>
          </div>
        )}
      </Card>
    </div>
  )
}
