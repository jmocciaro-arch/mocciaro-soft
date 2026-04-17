'use client'

import '@/components/sat/buscatools-theme.css'
import { useState, useEffect, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { SearchBar } from '@/components/ui/search-bar'
import { KPICard } from '@/components/ui/kpi-card'
import { useToast } from '@/components/ui/toast'
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from '@/components/ui/table'
import { BulkQuoteWizard } from '@/components/sat/bulk-quote-wizard'
import { useCompanyFilter } from '@/hooks/use-company-filter'
import { fmtNumber } from '@/lib/sat/currency-converter'
import { Package, Send, CheckCircle, Clock, Plus } from 'lucide-react'

type Row = Record<string, unknown>

const STATUS_LABEL: Record<string, { label: string; variant: 'default' | 'success' | 'warning' | 'info' }> = {
  pendiente: { label: 'Pendiente', variant: 'default' },
  enviada: { label: 'Enviada', variant: 'info' },
  aprobada: { label: 'Aprobada', variant: 'success' },
  rechazada: { label: 'Rechazada', variant: 'warning' },
}

export default function LotesPage() {
  const { filterByCompany, companyKey } = useCompanyFilter()
  const { addToast } = useToast()
  const [lotes, setLotes] = useState<Row[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [showWizard, setShowWizard] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    const sb = createClient()
    let q = sb
      .from('tt_sat_bulk_quotes')
      .select('*, tt_clients(name)')
      .order('created_at', { ascending: false })
    q = filterByCompany(q)
    const { data, error } = await q
    if (error) { addToast({ type: 'error', title: 'Error', message: error.message }) }
    setLotes((data || []) as Row[])
    setLoading(false)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [companyKey])

  useEffect(() => { load() }, [load])

  const filtered = search
    ? lotes.filter((l) => {
        const cliName = ((l.tt_clients as Row)?.name as string) || ''
        return [l.lote_id, cliName, l.status].some((v) => ((v as string) || '').toLowerCase().includes(search.toLowerCase()))
      })
    : lotes

  const pendientes = lotes.filter((l) => l.status === 'pendiente').length
  const enviadas = lotes.filter((l) => l.status === 'enviada').length
  const aprobadas = lotes.filter((l) => l.status === 'aprobada').length

  const handleDelete = async (id: string, loteId: string) => {
    if (!confirm(`¿Borrar el lote ${loteId}? Esta acción no se puede deshacer.`)) return
    const sb = createClient()
    const { error } = await sb.from('tt_sat_bulk_quotes').delete().eq('id', id)
    if (error) { addToast({ type: 'error', title: 'Error', message: error.message }); return }
    addToast({ type: 'success', title: 'Lote eliminado' })
    load()
  }

  const handleMarkApproved = async (id: string) => {
    const sb = createClient()
    const { error } = await sb.from('tt_sat_bulk_quotes').update({
      status: 'aprobada',
      ts_aprobada: new Date().toISOString(),
    }).eq('id', id)
    if (error) { addToast({ type: 'error', title: 'Error', message: error.message }); return }
    addToast({ type: 'success', title: 'Lote aprobado ✓' })
    load()
  }

  return (
    <div className="sat-theme space-y-6">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold" style={{ color: 'var(--sat-tx)' }}>Cotización por Lotes</h1>
          <p className="text-sm mt-1" style={{ color: 'var(--sat-tx2)' }}>Cotización multi-equipo para un cliente</p>
        </div>
        {!showWizard && (
          <Button onClick={() => setShowWizard(true)}>
            <Plus size={16} /> Nuevo lote
          </Button>
        )}
      </div>

      {showWizard ? (
        <BulkQuoteWizard
          onCancel={() => setShowWizard(false)}
          onSaved={() => { setShowWizard(false); load() }}
        />
      ) : (
        <>
          <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
            <KPICard label="Total lotes" value={lotes.length} icon={<Package size={22} />} />
            <KPICard label="Pendientes" value={pendientes} icon={<Clock size={22} />} color="#F59E0B" />
            <KPICard label="Enviadas" value={enviadas} icon={<Send size={22} />} color="#3B82F6" />
            <KPICard label="Aprobadas" value={aprobadas} icon={<CheckCircle size={22} />} color="#10B981" />
          </div>

          <Card>
            <SearchBar placeholder="Buscar por lote ID, cliente o estado..." value={search} onChange={setSearch} />
          </Card>

          <Card className="p-0 overflow-hidden">
            {loading ? (
              <div className="text-center py-16 text-sm" style={{ color: 'var(--sat-tx2)' }}>Cargando...</div>
            ) : filtered.length === 0 ? (
              <div className="text-center py-16">
                <Package size={48} className="mx-auto mb-3 opacity-30" style={{ color: 'var(--sat-tx3)' }} />
                <p style={{ color: 'var(--sat-tx2)' }}>Sin lotes. Creá uno con "+ Nuevo lote"</p>
              </div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Lote ID</TableHead>
                    <TableHead>Cliente</TableHead>
                    <TableHead>Equipos</TableHead>
                    <TableHead>Total</TableHead>
                    <TableHead>Estado</TableHead>
                    <TableHead>Fecha</TableHead>
                    <TableHead>Acciones</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filtered.map((l) => {
                    const st = STATUS_LABEL[(l.status as string) || 'pendiente']
                    const cliente = ((l.tt_clients as Row)?.name as string) || '–'
                    const nEquipos = (l.asset_ids as unknown[])?.length || 0
                    return (
                      <TableRow key={l.id as string}>
                        <TableCell><span style={{ fontFamily: 'var(--sat-mo)', color: 'var(--sat-or)' }}>{l.lote_id as string}</span></TableCell>
                        <TableCell>{cliente}</TableCell>
                        <TableCell><span style={{ fontFamily: 'var(--sat-mo)', textAlign: 'center' }}>{nEquipos}</span></TableCell>
                        <TableCell><span style={{ fontFamily: 'var(--sat-mo)', color: 'var(--sat-or)' }}>
                          {(l.currency as string) || 'USD'} $ {fmtNumber((l.total_amount as number) || 0)}
                        </span></TableCell>
                        <TableCell><Badge variant={st.variant}>{st.label}</Badge></TableCell>
                        <TableCell className="text-sm">{(l.created_at as string)?.split('T')[0]}</TableCell>
                        <TableCell>
                          <div className="flex gap-1">
                            {l.status !== 'aprobada' && (
                              <Button size="sm" variant="secondary" onClick={() => handleMarkApproved(l.id as string)}>✓ Aprobar</Button>
                            )}
                            <Button size="sm" variant="ghost" onClick={() => handleDelete(l.id as string, l.lote_id as string)}>✕</Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    )
                  })}
                </TableBody>
              </Table>
            )}
          </Card>
        </>
      )}
    </div>
  )
}
