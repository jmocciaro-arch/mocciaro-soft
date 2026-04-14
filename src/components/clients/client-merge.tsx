'use client'

import { useState, useEffect, useRef } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Modal } from '@/components/ui/modal'
import { SearchBar } from '@/components/ui/search-bar'
import { KPICard } from '@/components/ui/kpi-card'
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from '@/components/ui/table'
import { useToast } from '@/components/ui/toast'
// Dedup works across all companies — no company filter needed
import {
  GitMerge, Loader2, Users, AlertTriangle,
  Mail, Phone, MapPin, CreditCard
} from 'lucide-react'

type Row = Record<string, unknown>

interface DuplicateGroup {
  name: string
  count: number
  ids: string[]
  records: Row[]
}

interface RelationCounts {
  quotes: number
  orders: number
  documents: number
  sat_tickets: number
  opportunities: number
}

// ═══════════════════════════════════════════════════════
// MAIN COMPONENT
// ═══════════════════════════════════════════════════════

export function ClientMerge() {
  // Client dedup works across all companies
  const { addToast } = useToast()
  const [groups, setGroups] = useState<DuplicateGroup[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [showMerge, setShowMerge] = useState(false)
  const [selectedGroup, setSelectedGroup] = useState<DuplicateGroup | null>(null)
  const [primaryId, setPrimaryId] = useState('')
  const [relationCounts, setRelationCounts] = useState<Record<string, RelationCounts>>({})
  const [merging, setMerging] = useState(false)

  // ── Load duplicate groups (once on mount) ──
  const didLoad = useRef(false)
  const reloadTrigger = useRef(0)

  const reload = () => {
    didLoad.current = false
    reloadTrigger.current++
    setLoading(true)
    setGroups([])
  }

  useEffect(() => {
    if (didLoad.current) return
    didLoad.current = true

    const sb = createClient()
    let cancelled = false

    async function fetchAll() {
      const all: Row[] = []
      for (let offset = 0; ; offset += 1000) {
        const { data } = await sb.from('tt_clients')
          .select('id, name, legal_name, tax_id, email, phone, address, city')
          .eq('active', true)
          .order('name')
          .range(offset, offset + 999)
        if (cancelled) return
        if (!data || data.length === 0) break
        all.push(...data)
        if (data.length < 1000) break
      }
      if (cancelled) return

      const map = new Map<string, Row[]>()
      for (const c of all) {
        const key = ((c.legal_name as string) || (c.name as string) || '').trim().toUpperCase()
        if (!key) continue
        if (!map.has(key)) map.set(key, [])
        map.get(key)!.push(c)
      }

      const dupes: DuplicateGroup[] = []
      for (const [, records] of map) {
        if (records.length > 1) {
          dupes.push({
            name: (records[0].legal_name as string) || (records[0].name as string) || '',
            count: records.length,
            ids: records.map(r => r.id as string),
            records,
          })
        }
      }
      dupes.sort((a, b) => b.count - a.count)
      if (!cancelled) { setGroups(dupes); setLoading(false) }
    }

    fetchAll()
    return () => { cancelled = true }
  }, [reloadTrigger.current]) // eslint-disable-line react-hooks/exhaustive-deps

  // ── Load relation counts for a group ──
  const loadRelationCounts = async (group: DuplicateGroup) => {
    const sb = createClient()
    const counts: Record<string, RelationCounts> = {}

    for (const id of group.ids) {
      const [quotes, orders, docs, sat, opps] = await Promise.all([
        sb.from('tt_quotes').select('id', { count: 'exact', head: true }).eq('client_id', id),
        sb.from('tt_sales_orders').select('id', { count: 'exact', head: true }).eq('client_id', id),
        sb.from('tt_documents').select('id', { count: 'exact', head: true }).eq('client_id', id),
        sb.from('tt_sat_tickets').select('id', { count: 'exact', head: true }).eq('client_id', id),
        sb.from('tt_opportunities').select('id', { count: 'exact', head: true }).eq('client_id', id),
      ])
      counts[id] = {
        quotes: quotes.count || 0,
        orders: orders.count || 0,
        documents: docs.count || 0,
        sat_tickets: sat.count || 0,
        opportunities: opps.count || 0,
      }
    }
    setRelationCounts(counts)
  }

  // ── Open merge modal ──
  const openMerge = async (group: DuplicateGroup) => {
    setSelectedGroup(group)
    setRelationCounts({})

    // Auto-select the record with most data as primary
    let bestId = group.ids[0]
    let bestScore = 0
    for (const rec of group.records) {
      let score = 0
      if (rec.email) score += 2
      if (rec.phone) score += 2
      if (rec.tax_id) score += 3
      if (rec.address) score += 1
      if (rec.city) score += 1
      if (score > bestScore) { bestScore = score; bestId = rec.id as string }
    }
    setPrimaryId(bestId)
    setShowMerge(true)

    // Load counts async
    await loadRelationCounts(group)
  }

  // ── Execute merge (client-side updates) ──
  const executeMerge = async () => {
    if (!selectedGroup || !primaryId) return

    const secondaryIds = selectedGroup.ids.filter(id => id !== primaryId)
    if (secondaryIds.length === 0) { addToast({ type: 'warning', title: 'Selecciona el cliente principal' }); return }

    setMerging(true)
    const sb = createClient()
    let totalMoved = 0

    try {
      for (const secId of secondaryIds) {
        // Reassign FKs in all dependent tables
        const tables: Array<{ table: string; column: string }> = [
          { table: 'tt_quotes', column: 'client_id' },
          { table: 'tt_opportunities', column: 'client_id' },
          { table: 'tt_sales_orders', column: 'client_id' },
          { table: 'tt_sat_tickets', column: 'client_id' },
          { table: 'tt_documents', column: 'client_id' },
          { table: 'tt_mail_followups', column: 'client_id' },
          { table: 'tt_alerts', column: 'client_id' },
          { table: 'tt_process_instances', column: 'customer_id' },
        ]
        for (const { table, column } of tables) {
          await sb.from(table).update({ [column]: primaryId }).eq(column, secId)
          totalMoved++
        }

        // Move contacts (skip dupes)
        const { data: existingContacts } = await sb.from('tt_client_contacts').select('name').eq('client_id', primaryId)
        const existingNames = new Set((existingContacts || []).map((c: Row) => ((c.name as string) || '').trim().toUpperCase()))

        const { data: secContacts } = await sb.from('tt_client_contacts').select('*').eq('client_id', secId)
        for (const contact of (secContacts || [])) {
          const name = ((contact.name as string) || '').trim().toUpperCase()
          if (!existingNames.has(name)) {
            await sb.from('tt_client_contacts').update({ client_id: primaryId }).eq('id', contact.id)
            existingNames.add(name)
          }
        }
        // Delete remaining dupes
        await sb.from('tt_client_contacts').delete().eq('client_id', secId)

        // Move addresses
        await sb.from('tt_client_addresses').update({ client_id: primaryId }).eq('client_id', secId)

        // Fill empty fields on primary
        const { data: secData } = await sb.from('tt_clients').select('*').eq('id', secId).single()
        const { data: priData } = await sb.from('tt_clients').select('*').eq('id', primaryId).single()
        if (secData && priData) {
          const updates: Record<string, unknown> = {}
          for (const field of ['tax_id', 'email', 'phone', 'address', 'city', 'state', 'postal_code'] as const) {
            if (!priData[field] && secData[field]) updates[field] = secData[field]
          }
          updates.total_revenue = ((priData.total_revenue as number) || 0) + ((secData.total_revenue as number) || 0)
          if (Object.keys(updates).length > 0) {
            await sb.from('tt_clients').update(updates).eq('id', primaryId)
          }
        }

        // Deactivate secondary
        await sb.from('tt_clients').update({ active: false }).eq('id', secId)
      }

      // Log activity
      await sb.from('tt_activity_log').insert({
        entity_type: 'client',
        entity_id: primaryId,
        action: 'merge',
        description: `Merged ${secondaryIds.length} duplicate(s). Records reassigned: ${totalMoved}`,
      })

      addToast({
        type: 'success',
        title: 'Clientes unificados',
        message: `${secondaryIds.length} duplicado(s) fusionado(s). ${totalMoved} registros reasignados.`,
      })

      setShowMerge(false)
      setMerging(false)
      reload()
    } catch (err) {
      addToast({ type: 'error', title: 'Error al unificar', message: (err as Error).message })
      setMerging(false)
    }
  }

  const [displayLimit, setDisplayLimit] = useState(50)

  // ── Filter ──
  const filtered = search
    ? groups.filter(g => g.name.toLowerCase().includes(search.toLowerCase()))
    : groups

  const displayed = filtered.slice(0, displayLimit)
  const hasMore = filtered.length > displayLimit
  const totalDupeRecords = groups.reduce((sum, g) => sum + g.count, 0)

  // ── Helpers ──
  const getRelTotal = (id: string): number => {
    const c = relationCounts[id]
    return c ? c.quotes + c.orders + c.documents + c.sat_tickets + c.opportunities : 0
  }

  const dataScore = (rec: Row): number => {
    let s = 0
    if (rec.email) s++
    if (rec.phone) s++
    if (rec.tax_id) s++
    if (rec.address) s++
    if (rec.city) s++
    return s
  }

  return (
    <div className="space-y-4">
      {/* KPIs */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <KPICard label="Grupos duplicados" value={groups.length} icon={<Users size={22} />} color="#F59E0B" />
        <KPICard label="Registros duplicados" value={totalDupeRecords} icon={<AlertTriangle size={22} />} color="#EF4444" />
        <KPICard label="Registros a liberar" value={totalDupeRecords - groups.length} icon={<GitMerge size={22} />} color="#10B981" />
      </div>

      {/* Search */}
      <Card>
        <SearchBar placeholder="Buscar grupo duplicado..." value={search} onChange={setSearch} />
      </Card>

      {/* List */}
      <Card className="p-0 overflow-hidden">
        {loading ? (
          <div className="flex items-center justify-center py-20">
            <Loader2 className="animate-spin text-[#FF6600]" size={32} />
          </div>
        ) : filtered.length === 0 ? (
          <div className="text-center py-20 text-[#6B7280]">
            <GitMerge size={48} className="mx-auto mb-3 opacity-30" />
            <p>{search ? 'Sin resultados' : 'No hay duplicados detectados'}</p>
          </div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Cliente</TableHead>
                <TableHead>Duplicados</TableHead>
                <TableHead>Datos</TableHead>
                <TableHead>Acciones</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {displayed.map((group) => (
                <TableRow key={group.name}>
                  <TableCell>
                    <span className="text-[#F0F2F5] font-medium">{group.name}</span>
                  </TableCell>
                  <TableCell>
                    <Badge variant="warning" size="md">{group.count} registros</Badge>
                  </TableCell>
                  <TableCell>
                    <div className="flex gap-1">
                      {group.records.some(r => r.email) && <Badge variant="info">email</Badge>}
                      {group.records.some(r => r.phone) && <Badge variant="info">tel</Badge>}
                      {group.records.some(r => r.tax_id) && <Badge variant="info">CUIT</Badge>}
                    </div>
                  </TableCell>
                  <TableCell>
                    <Button variant="secondary" size="sm" onClick={() => openMerge(group)}>
                      <GitMerge size={14} /> Resolver
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
        {hasMore && !loading && (
          <div className="p-4 text-center border-t border-[#1E2330]">
            <Button variant="ghost" onClick={() => setDisplayLimit(prev => prev + 50)}>
              Ver mas ({filtered.length - displayLimit} restantes)
            </Button>
          </div>
        )}
      </Card>

      {/* ── Merge Modal ── */}
      <Modal
        isOpen={showMerge}
        onClose={() => setShowMerge(false)}
        title={`Unificar: ${selectedGroup?.name || ''} (${selectedGroup?.count || 0} registros)`}
        size="full"
      >
        {selectedGroup && (
          <div className="space-y-6">
            {/* Instructions */}
            <div className="p-3 rounded-lg bg-amber-500/10 border border-amber-500/20">
              <p className="text-xs text-amber-400">
                Selecciona el registro <strong>principal</strong> — todos los documentos, cotizaciones, pedidos y tickets
                de los otros registros se van a mover al principal. Los duplicados se desactivan sin borrarse.
              </p>
            </div>

            {/* Cards grid */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
              {selectedGroup.records.map((rec) => {
                const id = rec.id as string
                const isSelected = id === primaryId
                const counts = relationCounts[id]
                const total = getRelTotal(id)

                return (
                  <button
                    key={id}
                    type="button"
                    onClick={() => setPrimaryId(id)}
                    className={`text-left p-4 rounded-xl border-2 transition-all ${
                      isSelected
                        ? 'border-[#FF6600] bg-[#FF6600]/5 ring-2 ring-[#FF6600]/20'
                        : 'border-[#2A3040] bg-[#0F1218] hover:border-[#4B5563]'
                    }`}
                  >
                    {/* Primary badge */}
                    <div className="flex items-center justify-between mb-3">
                      {isSelected ? (
                        <Badge variant="orange" size="md">Principal</Badge>
                      ) : (
                        <Badge variant="default" size="md">Duplicado</Badge>
                      )}
                      <span className="text-[10px] text-[#4B5563] font-mono">{id.slice(0, 8)}</span>
                    </div>

                    {/* Data fields */}
                    <div className="space-y-2 mb-4">
                      <DataField icon={<Mail size={12} />} label="Email" value={rec.email as string} />
                      <DataField icon={<Phone size={12} />} label="Tel" value={rec.phone as string} />
                      <DataField icon={<CreditCard size={12} />} label="CUIT" value={rec.tax_id as string} />
                      <DataField icon={<MapPin size={12} />} label="Dir" value={[rec.address, rec.city].filter(Boolean).join(', ') || null} />
                    </div>

                    {/* Relation counts */}
                    <div className="pt-3 border-t border-[#1E2330]">
                      {counts ? (
                        <div className="grid grid-cols-2 gap-1">
                          <RelCount label="Cotizaciones" value={counts.quotes} />
                          <RelCount label="Pedidos" value={counts.orders} />
                          <RelCount label="Documentos" value={counts.documents} />
                          <RelCount label="SAT" value={counts.sat_tickets} />
                          <RelCount label="Oportunidades" value={counts.opportunities} />
                          <div className="flex items-center gap-1">
                            <span className="text-[10px] font-bold text-[#FF6600]">Total: {total}</span>
                          </div>
                        </div>
                      ) : (
                        <div className="flex items-center gap-2 text-[10px] text-[#6B7280]">
                          <Loader2 size={10} className="animate-spin" /> Cargando...
                        </div>
                      )}
                    </div>

                    {/* Data completeness bar */}
                    <div className="mt-3 flex items-center gap-2">
                      <div className="flex-1 h-1.5 rounded-full bg-[#1E2330] overflow-hidden">
                        <div
                          className="h-full rounded-full bg-[#10B981] transition-all"
                          style={{ width: `${(dataScore(rec) / 5) * 100}%` }}
                        />
                      </div>
                      <span className="text-[10px] text-[#6B7280]">{dataScore(rec)}/5</span>
                    </div>
                  </button>
                )
              })}
            </div>

            {/* Summary */}
            <div className="flex items-center justify-between p-4 rounded-xl bg-[#0F1218] border border-[#2A3040]">
              <div>
                <p className="text-sm text-[#F0F2F5]">
                  <span className="text-[#FF6600] font-bold">{selectedGroup.count - 1}</span> registro(s) se van a fusionar en el principal
                </p>
                <p className="text-xs text-[#6B7280] mt-1">
                  Todos los documentos, cotizaciones, pedidos y tickets se mueven al registro principal.
                  Los duplicados quedan inactivos (no se borran).
                </p>
              </div>
              <div className="flex gap-3">
                <Button variant="secondary" onClick={() => setShowMerge(false)}>Cancelar</Button>
                <Button onClick={executeMerge} loading={merging}>
                  <GitMerge size={14} /> Unificar clientes
                </Button>
              </div>
            </div>
          </div>
        )}
      </Modal>
    </div>
  )
}

// ── Helper components ──

function DataField({ icon, label, value }: { icon: React.ReactNode; label: string; value: string | null }) {
  return (
    <div className="flex items-center gap-2">
      <span className="text-[#6B7280]">{icon}</span>
      {value ? (
        <span className="text-xs text-[#D1D5DB] truncate">{value}</span>
      ) : (
        <span className="text-xs text-[#4B5563]">Sin {label.toLowerCase()}</span>
      )}
    </div>
  )
}

function RelCount({ label, value }: { label: string; value: number }) {
  return (
    <div className="flex items-center gap-1">
      <span className={`text-[10px] ${value > 0 ? 'text-[#D1D5DB]' : 'text-[#4B5563]'}`}>
        {label}: <span className="font-bold">{value}</span>
      </span>
    </div>
  )
}
