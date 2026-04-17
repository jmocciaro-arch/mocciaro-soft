'use client'

import { useState, useEffect, useCallback, useMemo } from 'react'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import { Card } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { SearchBar } from '@/components/ui/search-bar'
import { KPICard } from '@/components/ui/kpi-card'
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from '@/components/ui/table'
import { useCompanyFilter } from '@/hooks/use-company-filter'
import { ClipboardList, ChevronRight, Loader2, CheckCircle, Clock, AlertTriangle } from 'lucide-react'
import { fuzzyFilter } from '@/lib/sat/fuzzy-match'

type Row = Record<string, unknown>
type Hoja = {
  ntt_number: string
  cliente: string
  fecha_min: string
  equipos: number
  abiertos: number
  cerrados: number
  en_progreso: number
  status: 'abierta' | 'parcial' | 'cerrada'
  tickets: Row[]
}

export default function HojasPage() {
  const { filterByCompany, companyKey } = useCompanyFilter()
  const [tickets, setTickets] = useState<Row[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')

  const load = useCallback(async () => {
    setLoading(true)
    const sb = createClient()
    let q = sb
      .from('tt_sat_tickets')
      .select('*, tt_clients(name)')
      .order('created_at', { ascending: false })
      .limit(2000)
    q = filterByCompany(q)
    const { data } = await q
    setTickets((data || []) as Row[])
    setLoading(false)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [companyKey])

  useEffect(() => { load() }, [load])

  // Agrupar por ntt_number en metadata
  const hojas: Hoja[] = useMemo(() => {
    const map = new Map<string, Hoja>()
    for (const t of tickets) {
      const meta = (t.metadata as Record<string, unknown>) || {}
      const ntt = (meta.ntt_number as string) || null
      if (!ntt) continue

      if (!map.has(ntt)) {
        map.set(ntt, {
          ntt_number: ntt,
          cliente: ((t.tt_clients as Row)?.name as string) || '—',
          fecha_min: (t.created_at as string) || '',
          equipos: 0,
          abiertos: 0,
          cerrados: 0,
          en_progreso: 0,
          status: 'abierta',
          tickets: [],
        })
      }
      const h = map.get(ntt)!
      h.equipos++
      h.tickets.push(t)
      if (t.created_at && (t.created_at as string) < h.fecha_min) h.fecha_min = t.created_at as string
      if (['resolved', 'closed'].includes(t.status as string)) h.cerrados++
      else if (['in_progress', 'waiting_parts'].includes(t.status as string)) h.en_progreso++
      else h.abiertos++
    }
    // Status de la hoja
    for (const h of map.values()) {
      if (h.cerrados === h.equipos) h.status = 'cerrada'
      else if (h.cerrados > 0 || h.en_progreso > 0) h.status = 'parcial'
      else h.status = 'abierta'
    }
    return Array.from(map.values()).sort((a, b) => (b.ntt_number || '').localeCompare(a.ntt_number || ''))
  }, [tickets])

  const filtered = useMemo(() => {
    if (!search.trim()) return hojas
    return fuzzyFilter(hojas, search, (h) => [h.ntt_number, h.cliente])
  }, [hojas, search])

  const kpis = useMemo(() => ({
    total: hojas.length,
    abiertas: hojas.filter((h) => h.status === 'abierta').length,
    parciales: hojas.filter((h) => h.status === 'parcial').length,
    cerradas: hojas.filter((h) => h.status === 'cerrada').length,
  }), [hojas])

  return (
    <div className="sat-theme space-y-6">
      <div>
        <h1 className="text-2xl font-bold" style={{ color: 'var(--sat-tx)' }}>Hojas de mantenimiento</h1>
        <p className="text-sm mt-1" style={{ color: 'var(--sat-tx2)' }}>
          Notas de trabajo (NTT) que agrupan varios equipos del mismo cliente — crealas desde Activos seleccionando múltiples equipos
        </p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
        <KPICard label="Total hojas" value={kpis.total} icon={<ClipboardList size={22} />} />
        <KPICard label="Abiertas" value={kpis.abiertas} icon={<AlertTriangle size={22} />} color="#3B82F6" />
        <KPICard label="En progreso" value={kpis.parciales} icon={<Clock size={22} />} color="#F59E0B" />
        <KPICard label="Cerradas" value={kpis.cerradas} icon={<CheckCircle size={22} />} color="#10B981" />
      </div>

      <Card>
        <SearchBar
          placeholder="Buscar por NTT, cliente..."
          value={search}
          onChange={setSearch}
        />
      </Card>

      <Card className="p-0 overflow-hidden">
        {loading ? (
          <div className="flex justify-center py-16"><Loader2 className="animate-spin" style={{ color: 'var(--sat-or)' }} /></div>
        ) : filtered.length === 0 ? (
          <div className="text-center py-16">
            <ClipboardList size={48} className="mx-auto mb-3 opacity-30" style={{ color: 'var(--sat-tx3)' }} />
            <p style={{ color: 'var(--sat-tx2)' }}>Sin hojas de mantenimiento</p>
            <p className="text-xs mt-1" style={{ color: 'var(--sat-tx3)' }}>
              Creá una nueva yendo a <Link href="/sat/activos" className="underline">Activos</Link> y seleccionando los equipos
            </p>
          </div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>NTT</TableHead>
                <TableHead>Cliente</TableHead>
                <TableHead>Fecha</TableHead>
                <TableHead className="text-center">Equipos</TableHead>
                <TableHead className="text-center">Progreso</TableHead>
                <TableHead>Estado</TableHead>
                <TableHead>{' '}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.map((h) => {
                const stBadge =
                  h.status === 'cerrada' ? { variant: 'success' as const, label: 'Cerrada' }
                  : h.status === 'parcial' ? { variant: 'warning' as const, label: 'En progreso' }
                  : { variant: 'info' as const, label: 'Abierta' }
                const pct = h.equipos > 0 ? Math.round((h.cerrados / h.equipos) * 100) : 0
                return (
                  <TableRow key={h.ntt_number}>
                    <TableCell>
                      <Link href={`/sat/hojas/${h.ntt_number}`} className="hover:underline">
                        <span style={{ fontFamily: 'var(--sat-mo)', color: 'var(--sat-or)', fontWeight: 700 }}>
                          {h.ntt_number}
                        </span>
                      </Link>
                    </TableCell>
                    <TableCell>{h.cliente}</TableCell>
                    <TableCell>
                      <span style={{ fontFamily: 'var(--sat-mo)', fontSize: 13 }}>{(h.fecha_min || '').split('T')[0]}</span>
                    </TableCell>
                    <TableCell className="text-center">
                      <span style={{ fontFamily: 'var(--sat-mo)' }}>{h.equipos}</span>
                    </TableCell>
                    <TableCell className="text-center">
                      <span style={{ fontFamily: 'var(--sat-mo)', fontSize: 13, color: 'var(--sat-gn)' }}>{h.cerrados}</span>
                      <span style={{ color: 'var(--sat-tx3)' }}>/</span>
                      <span style={{ fontFamily: 'var(--sat-mo)', fontSize: 13 }}>{h.equipos}</span>
                      <span style={{ color: 'var(--sat-tx3)', fontSize: 11, marginLeft: 6 }}>({pct}%)</span>
                    </TableCell>
                    <TableCell><Badge variant={stBadge.variant}>{stBadge.label}</Badge></TableCell>
                    <TableCell>
                      <Link href={`/sat/hojas/${h.ntt_number}`}>
                        <Button size="sm" variant="secondary">Abrir <ChevronRight size={14} /></Button>
                      </Link>
                    </TableCell>
                  </TableRow>
                )
              })}
            </TableBody>
          </Table>
        )}
      </Card>
    </div>
  )
}
