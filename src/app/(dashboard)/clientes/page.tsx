'use client'

import { useState, useEffect, useRef, useCallback, Suspense } from 'react'
import { SearchBar } from '@/components/ui/search-bar'
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Modal } from '@/components/ui/modal'
import { Input } from '@/components/ui/input'
import { Select } from '@/components/ui/select'
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from '@/components/ui/table'
import { KPICard } from '@/components/ui/kpi-card'
import { Tabs } from '@/components/ui/tabs'
import { useToast } from '@/components/ui/toast'
import { createClient } from '@/lib/supabase/client'
import { formatCurrency, formatRelative } from '@/lib/utils'
import type { Client, ActivityLog, Quote } from '@/types'
import {
  Users, Plus, Phone, Mail, MessageSquare, MapPin,
  Building2, FileText, Edit3, Save, X, Loader2, UserPlus, Contact
} from 'lucide-react'

type Row = Record<string, unknown>

const PAGE_SIZE = 50
const countryFlags: Record<string, string> = { ES: '\ud83c\uddea\ud83c\uddf8', AR: '\ud83c\udde6\ud83c\uddf7', US: '\ud83c\uddfa\ud83c\uddf8', CL: '\ud83c\udde8\ud83c\uddf1', UY: '\ud83c\uddfa\ud83c\uddfe', BR: '\ud83c\udde7\ud83c\uddf7', MX: '\ud83c\uddf2\ud83c\uddfd', CO: '\ud83c\udde8\ud83c\uddf4', DE: '\ud83c\udde9\ud83c\uddea', FR: '\ud83c\uddeb\ud83c\uddf7', IT: '\ud83c\uddee\ud83c\uddf9', GB: '\ud83c\uddec\ud83c\udde7' }
const countryNames: Record<string, string> = { ES: 'Espana', AR: 'Argentina', US: 'Estados Unidos', CL: 'Chile', UY: 'Uruguay', BR: 'Brasil', MX: 'Mexico', CO: 'Colombia', DE: 'Alemania' }

const clientesTabs = [
  { id: 'clientes', label: 'Clientes', icon: <Users size={16} /> },
  { id: 'potenciales', label: 'Potenciales', icon: <UserPlus size={16} /> },
  { id: 'contactos', label: 'Contactos', icon: <Contact size={16} /> },
]

// ═══════════════════════════════════════════════════════
// CLIENTES TAB (existing functionality)
// ═══════════════════════════════════════════════════════
function ClientesTab() {
  const { addToast } = useToast()
  const [clients, setClients] = useState<Client[]>([])
  const [totalCount, setTotalCount] = useState(0)
  const [search, setSearch] = useState('')
  const [filterCountry, setFilterCountry] = useState('')
  const [countries, setCountries] = useState<string[]>([])
  const [loading, setLoading] = useState(true)
  const [loadingMore, setLoadingMore] = useState(false)
  const [offset, setOffset] = useState(0)
  const [hasMore, setHasMore] = useState(true)
  const debounceRef = useRef<NodeJS.Timeout | null>(null)
  const [selectedClient, setSelectedClient] = useState<Client | null>(null)
  const [editing, setEditing] = useState(false)
  const [editData, setEditData] = useState<Partial<Client>>({})
  const [savingEdit, setSavingEdit] = useState(false)
  const [clientActivity, setClientActivity] = useState<ActivityLog[]>([])
  const [clientQuotes, setClientQuotes] = useState<Quote[]>([])
  const [showNew, setShowNew] = useState(false)
  const [newClient, setNewClient] = useState({ company_name: '', legal_name: '', tax_id: '', type: 'empresa' as Client['type'], country: 'ES', city: '', email: '', phone: '', address: '' })
  const [savingNew, setSavingNew] = useState(false)

  useEffect(() => { loadCountries() }, [])
  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(() => { setOffset(0); setClients([]); setHasMore(true); loadClients(0, true) }, 300)
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current) }
  }, [search, filterCountry])

  async function loadCountries() {
    const supabase = createClient()
    const { data } = await supabase.from('tt_clients').select('country').not('country', 'is', null).limit(5000)
    if (data) { const unique = [...new Set(data.map((d: { country: string }) => d.country).filter(Boolean))]; unique.sort(); setCountries(unique) }
  }

  const loadClients = useCallback(async (fromOffset: number, reset: boolean = false) => {
    const supabase = createClient()
    if (reset) setLoading(true); else setLoadingMore(true)
    try {
      let query = supabase.from('tt_clients').select('*', { count: 'exact' }).eq('is_active', true).order('company_name').range(fromOffset, fromOffset + PAGE_SIZE - 1)
      if (filterCountry) query = query.eq('country', filterCountry)
      if (search.trim()) { const tokens = search.trim().toLowerCase().split(/\s+/); for (const token of tokens) { query = query.or(`company_name.ilike.%${token}%,legal_name.ilike.%${token}%,tax_id.ilike.%${token}%,email.ilike.%${token}%,city.ilike.%${token}%`) } }
      const { data, count } = await query
      const newClients = (data || []) as Client[]
      if (reset) setClients(newClients); else setClients((prev) => [...prev, ...newClients])
      setTotalCount(count || 0); setOffset(fromOffset + PAGE_SIZE); setHasMore(newClients.length === PAGE_SIZE)
    } finally { setLoading(false); setLoadingMore(false) }
  }, [search, filterCountry])

  async function openClientDetail(client: Client) {
    setSelectedClient(client); setEditing(false); setEditData({})
    const supabase = createClient()
    const [activityRes, quotesRes] = await Promise.all([
      supabase.from('tt_activity_log').select('*').eq('entity_type', 'client').eq('entity_id', client.id).order('created_at', { ascending: false }).limit(10),
      supabase.from('tt_quotes').select('*').eq('client_id', client.id).order('created_at', { ascending: false }).limit(5),
    ])
    setClientActivity((activityRes.data || []) as ActivityLog[]); setClientQuotes((quotesRes.data || []) as Quote[])
  }

  function startEditing() {
    if (!selectedClient) return; setEditing(true)
    setEditData({ company_name: selectedClient.company_name, legal_name: selectedClient.legal_name, tax_id: selectedClient.tax_id, email: selectedClient.email, phone: selectedClient.phone, city: selectedClient.city, address: selectedClient.address, country: selectedClient.country, type: selectedClient.type })
  }

  async function saveEdit() {
    if (!selectedClient) return; setSavingEdit(true)
    const supabase = createClient()
    try {
      const { error } = await supabase.from('tt_clients').update({ company_name: editData.company_name, legal_name: editData.legal_name, tax_id: editData.tax_id, email: editData.email, phone: editData.phone, city: editData.city, address: editData.address, country: editData.country, type: editData.type, updated_at: new Date().toISOString() }).eq('id', selectedClient.id)
      if (error) throw error
      const updated = { ...selectedClient, ...editData }; setSelectedClient(updated as Client); setClients((prev) => prev.map((c) => (c.id === selectedClient.id ? (updated as Client) : c))); setEditing(false); addToast({ type: 'success', title: 'Cliente actualizado' })
    } catch { addToast({ type: 'error', title: 'Error al actualizar' }) } finally { setSavingEdit(false) }
  }

  async function createNewClient() {
    if (!newClient.company_name.trim()) { addToast({ type: 'error', title: 'El nombre es obligatorio' }); return }
    setSavingNew(true)
    const supabase = createClient()
    try {
      const { error } = await supabase.from('tt_clients').insert({ company_name: newClient.company_name, legal_name: newClient.legal_name || null, tax_id: newClient.tax_id || null, type: newClient.type, country: newClient.country, city: newClient.city || null, email: newClient.email || null, phone: newClient.phone || null, address: newClient.address || null, is_active: true, tags: [], payment_terms: 'contado', credit_limit: 0, discount_default: 0, currency: newClient.country === 'AR' ? 'ARS' : newClient.country === 'US' ? 'USD' : 'EUR', total_revenue: 0 })
      if (error) throw error
      addToast({ type: 'success', title: 'Cliente creado', message: newClient.company_name })
      setShowNew(false); setNewClient({ company_name: '', legal_name: '', tax_id: '', type: 'empresa', country: 'ES', city: '', email: '', phone: '', address: '' })
      setOffset(0); setClients([]); loadClients(0, true)
    } catch { addToast({ type: 'error', title: 'Error al crear cliente' }) } finally { setSavingNew(false) }
  }

  return (
    <div className="space-y-4">
      <div className="flex justify-end"><Button variant="primary" onClick={() => setShowNew(true)}><Plus size={16} /> Nuevo Cliente</Button></div>
      <div className="flex flex-col sm:flex-row gap-3">
        <SearchBar placeholder="Buscar por nombre, CUIT/CIF, email, ciudad..." value={search} onChange={setSearch} className="flex-1 max-w-lg" />
        <div className="flex gap-2 flex-wrap">
          <button onClick={() => setFilterCountry('')} className={`px-3 py-2 rounded-lg text-xs font-medium transition-all ${!filterCountry ? 'bg-[#FF6600] text-white' : 'bg-[#1E2330] text-[#9CA3AF] hover:bg-[#2A3040]'}`}>Todos</button>
          {countries.slice(0, 8).map((country) => (
            <button key={country} onClick={() => setFilterCountry(filterCountry === country ? '' : country)} className={`px-3 py-2 rounded-lg text-xs font-medium transition-all ${filterCountry === country ? 'bg-[#FF6600] text-white' : 'bg-[#1E2330] text-[#9CA3AF] hover:bg-[#2A3040]'}`}>
              {countryFlags[country] || ''} {country}
            </button>
          ))}
        </div>
      </div>

      {loading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">{Array.from({ length: 6 }).map((_, i) => (<div key={i} className="rounded-xl bg-[#141820] border border-[#1E2330] p-5 animate-pulse"><div className="h-4 bg-[#1E2330] rounded w-32 mb-2" /><div className="h-3 bg-[#1E2330] rounded w-full" /></div>))}</div>
      ) : clients.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 text-[#4B5563]"><Users size={48} className="mb-4" /><p className="text-lg font-medium">No se encontraron clientes</p></div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {clients.map((client) => (
            <Card key={client.id} hover onClick={() => openClientDetail(client)}>
              <div className="flex items-start justify-between mb-3">
                <div className="flex items-center gap-2">
                  <div className="w-10 h-10 rounded-full bg-[#1E2330] flex items-center justify-center text-sm font-bold text-[#FF6600]">{client.company_name.charAt(0)}</div>
                  <div><h3 className="text-sm font-semibold text-[#F0F2F5]">{client.company_name}</h3>{client.code && <p className="text-[10px] font-mono text-[#6B7280]">{client.code}</p>}</div>
                </div>
                <span className="text-lg">{countryFlags[client.country] || client.country}</span>
              </div>
              <div className="space-y-1.5">
                {client.city && <div className="flex items-center gap-2 text-xs text-[#9CA3AF]"><MapPin size={12} /> {client.city}</div>}
                {client.email && <div className="flex items-center gap-2 text-xs text-[#9CA3AF]"><Mail size={12} /> {client.email}</div>}
                {client.phone && <div className="flex items-center gap-2 text-xs text-[#9CA3AF]"><Phone size={12} /> {client.phone}</div>}
              </div>
              <div className="flex items-center justify-between mt-3 pt-3 border-t border-[#1E2330]">
                <div className="flex gap-1 flex-wrap">{client.tags?.map((tag: string) => (<Badge key={tag} variant={tag === 'VIP' ? 'orange' : 'default'} size="sm">{tag}</Badge>))}<Badge variant="default" size="sm">{client.type}</Badge></div>
                {client.total_revenue > 0 && <p className="text-sm font-semibold text-[#FF6600]">{formatCurrency(client.total_revenue, (client.currency || 'EUR') as 'EUR' | 'ARS' | 'USD')}</p>}
              </div>
            </Card>
          ))}
        </div>
      )}

      {!loading && hasMore && clients.length > 0 && (
        <div className="flex justify-center pt-4"><Button variant="secondary" onClick={() => loadClients(offset, false)} loading={loadingMore}>Cargar mas ({clients.length} de {totalCount})</Button></div>
      )}

      {/* Detail Modal */}
      <Modal isOpen={!!selectedClient} onClose={() => { setSelectedClient(null); setEditing(false) }} title={selectedClient?.company_name || ''} size="xl">
        {selectedClient && (
          <div className="space-y-6">
            {editing ? (
              <div className="space-y-4">
                <Input label="Nombre de empresa" value={editData.company_name || ''} onChange={(e) => setEditData({ ...editData, company_name: e.target.value })} />
                <div className="grid grid-cols-2 gap-4"><Input label="Razon social" value={editData.legal_name || ''} onChange={(e) => setEditData({ ...editData, legal_name: e.target.value })} /><Input label="CIF / CUIT" value={editData.tax_id || ''} onChange={(e) => setEditData({ ...editData, tax_id: e.target.value })} /></div>
                <div className="grid grid-cols-2 gap-4"><Input label="Email" type="email" value={editData.email || ''} onChange={(e) => setEditData({ ...editData, email: e.target.value })} /><Input label="Telefono" value={editData.phone || ''} onChange={(e) => setEditData({ ...editData, phone: e.target.value })} /></div>
                <div className="flex gap-2 justify-end"><Button variant="secondary" onClick={() => setEditing(false)}>Cancelar</Button><Button variant="primary" onClick={saveEdit} loading={savingEdit}><Save size={14} /> Guardar</Button></div>
              </div>
            ) : (
              <>
                <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                  <div className="p-3 rounded-lg bg-[#0F1218] border border-[#1E2330]"><p className="text-xs text-[#6B7280]">Pais</p><p className="text-sm text-[#F0F2F5]">{countryFlags[selectedClient.country] || ''} {countryNames[selectedClient.country] || selectedClient.country}</p></div>
                  <div className="p-3 rounded-lg bg-[#0F1218] border border-[#1E2330]"><p className="text-xs text-[#6B7280]">Tipo</p><p className="text-sm text-[#F0F2F5] capitalize">{selectedClient.type}</p></div>
                  <div className="p-3 rounded-lg bg-[#0F1218] border border-[#1E2330]"><p className="text-xs text-[#6B7280]">CIF/CUIT</p><p className="text-sm font-mono text-[#F0F2F5]">{selectedClient.tax_id || '-'}</p></div>
                </div>
                <div className="flex flex-wrap gap-2">
                  <Button variant="primary" size="sm" onClick={startEditing}><Edit3 size={14} /> Editar</Button>
                  {selectedClient.phone && <a href={`tel:${selectedClient.phone}`}><Button variant="secondary" size="sm"><Phone size={14} /> Llamar</Button></a>}
                  {selectedClient.email && <a href={`mailto:${selectedClient.email}`}><Button variant="secondary" size="sm"><Mail size={14} /> Email</Button></a>}
                </div>
                {clientQuotes.length > 0 && (
                  <div><h4 className="text-sm font-semibold text-[#F0F2F5] mb-3">Cotizaciones recientes</h4>
                    <div className="space-y-2">{clientQuotes.map((q) => (<div key={q.id} className="flex items-center justify-between p-2.5 rounded-lg bg-[#0F1218] border border-[#1E2330]"><div><span className="text-xs font-mono text-[#FF6600]">{q.quote_number}</span><Badge variant="default" className="ml-2">{q.status}</Badge></div><span className="text-sm font-semibold text-[#F0F2F5]">{formatCurrency(q.total, (q.currency || 'EUR') as 'EUR' | 'ARS' | 'USD')}</span></div>))}</div>
                  </div>
                )}
              </>
            )}
          </div>
        )}
      </Modal>

      {/* New Client Modal */}
      <Modal isOpen={showNew} onClose={() => setShowNew(false)} title="Nuevo Cliente" size="lg">
        <div className="space-y-4">
          <Input label="Nombre de empresa *" value={newClient.company_name} onChange={(e) => setNewClient({ ...newClient, company_name: e.target.value })} />
          <Input label="Razon social" value={newClient.legal_name} onChange={(e) => setNewClient({ ...newClient, legal_name: e.target.value })} />
          <div className="grid grid-cols-2 gap-4">
            <Input label="CIF / CUIT" value={newClient.tax_id} onChange={(e) => setNewClient({ ...newClient, tax_id: e.target.value })} />
            <Select label="Tipo" value={newClient.type} onChange={(e) => setNewClient({ ...newClient, type: e.target.value as Client['type'] })} options={[{ value: 'empresa', label: 'Empresa' }, { value: 'autonomo', label: 'Autonomo' }, { value: 'particular', label: 'Particular' }, { value: 'distribuidor', label: 'Distribuidor' }]} />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <Select label="Pais" value={newClient.country} onChange={(e) => setNewClient({ ...newClient, country: e.target.value })} options={Object.entries(countryNames).map(([k, v]) => ({ value: k, label: v }))} />
            <Input label="Ciudad" value={newClient.city} onChange={(e) => setNewClient({ ...newClient, city: e.target.value })} />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <Input label="Email" type="email" value={newClient.email} onChange={(e) => setNewClient({ ...newClient, email: e.target.value })} />
            <Input label="Telefono" value={newClient.phone} onChange={(e) => setNewClient({ ...newClient, phone: e.target.value })} />
          </div>
          <div className="flex justify-end gap-2 pt-2"><Button variant="secondary" onClick={() => setShowNew(false)}>Cancelar</Button><Button variant="primary" onClick={createNewClient} loading={savingNew}><Save size={14} /> Guardar</Button></div>
        </div>
      </Modal>
    </div>
  )
}

// ═══════════════════════════════════════════════════════
// POTENCIALES TAB
// ═══════════════════════════════════════════════════════
function PotencialesTab() {
  const supabase = createClient()
  const { addToast } = useToast()
  const [leads, setLeads] = useState<Row[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')

  const load = useCallback(async () => {
    setLoading(true)
    let q = supabase.from('tt_clients').select('*').or('tags.cs.{potential},tags.cs.{lead},type.eq.particular').eq('is_active', true).order('created_at', { ascending: false })
    if (search) q = q.ilike('company_name', `%${search}%`)
    const { data } = await q
    // Also include clients with no revenue as potential
    const allData = data || []
    setLeads(allData)
    setLoading(false)
  }, [supabase, search])

  useEffect(() => { load() }, [load])

  const convertToClient = async (lead: Row) => {
    await supabase.from('tt_clients').update({ tags: ['cliente'], type: 'empresa' }).eq('id', lead.id)
    addToast({ type: 'success', title: 'Convertido a cliente' })
    load()
  }

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <KPICard label="Potenciales" value={leads.length} icon={<UserPlus size={22} />} />
      </div>
      <Card><SearchBar placeholder="Buscar potencial..." value={search} onChange={setSearch} className="flex-1" /></Card>
      <Card className="p-0 overflow-hidden">
        {loading ? (
          <div className="flex items-center justify-center py-20"><Loader2 className="animate-spin text-[#FF6600]" size={32} /></div>
        ) : leads.length === 0 ? (
          <div className="text-center py-20 text-[#6B7280]"><UserPlus size={48} className="mx-auto mb-3 opacity-30" /><p>No hay clientes potenciales</p></div>
        ) : (
          <Table>
            <TableHeader><TableRow><TableHead>Nombre</TableHead><TableHead>Tipo</TableHead><TableHead>Email</TableHead><TableHead>Pais</TableHead><TableHead>Acciones</TableHead></TableRow></TableHeader>
            <TableBody>
              {leads.map((l) => (
                <TableRow key={l.id as string}>
                  <TableCell className="font-medium text-[#F0F2F5]">{(l.company_name as string) || '-'}</TableCell>
                  <TableCell><Badge variant="default">{(l.type as string) || '-'}</Badge></TableCell>
                  <TableCell className="text-sm text-[#9CA3AF]">{(l.email as string) || '-'}</TableCell>
                  <TableCell>{countryFlags[(l.country as string)] || (l.country as string) || '-'}</TableCell>
                  <TableCell><Button variant="ghost" size="sm" onClick={() => convertToClient(l)} title="Convertir a cliente"><UserPlus size={14} /></Button></TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </Card>
    </div>
  )
}

// ═══════════════════════════════════════════════════════
// CONTACTOS TAB
// ═══════════════════════════════════════════════════════
function ContactosTab() {
  const supabase = createClient()
  const [contacts, setContacts] = useState<Row[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')

  const load = useCallback(async () => {
    setLoading(true)
    let q = supabase.from('tt_client_contacts').select('*, tt_clients(company_name)').order('full_name')
    if (search) q = q.or(`full_name.ilike.%${search}%,email.ilike.%${search}%,phone.ilike.%${search}%`)
    const { data } = await q
    setContacts(data || [])
    setLoading(false)
  }, [supabase, search])

  useEffect(() => { load() }, [load])

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <KPICard label="Total contactos" value={contacts.length} icon={<Contact size={22} />} />
      </div>
      <Card><SearchBar placeholder="Buscar contacto por nombre, email o telefono..." value={search} onChange={setSearch} className="flex-1" /></Card>
      <Card className="p-0 overflow-hidden">
        {loading ? (
          <div className="flex items-center justify-center py-20"><Loader2 className="animate-spin text-[#FF6600]" size={32} /></div>
        ) : contacts.length === 0 ? (
          <div className="text-center py-20 text-[#6B7280]"><Contact size={48} className="mx-auto mb-3 opacity-30" /><p>No hay contactos</p></div>
        ) : (
          <Table>
            <TableHeader><TableRow><TableHead>Nombre</TableHead><TableHead>Cargo</TableHead><TableHead>Empresa</TableHead><TableHead>Email</TableHead><TableHead>Telefono</TableHead></TableRow></TableHeader>
            <TableBody>
              {contacts.map((c) => (
                <TableRow key={c.id as string}>
                  <TableCell className="font-medium text-[#F0F2F5]">{(c.full_name as string) || '-'}</TableCell>
                  <TableCell className="text-sm text-[#9CA3AF]">{(c.position as string) || '-'}</TableCell>
                  <TableCell className="text-sm">{((c.tt_clients as Row)?.company_name as string) || '-'}</TableCell>
                  <TableCell className="text-sm text-[#9CA3AF]">{(c.email as string) || '-'}</TableCell>
                  <TableCell className="text-sm text-[#9CA3AF]">{(c.phone as string) || '-'}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </Card>
    </div>
  )
}

// ═══════════════════════════════════════════════════════
// MAIN PAGE
// ═══════════════════════════════════════════════════════
export default function ClientesPage() {
  return (
    <div className="space-y-6 animate-fade-in">
      <div>
        <h1 className="text-2xl font-bold text-[#F0F2F5]">Clientes</h1>
        <p className="text-sm text-[#6B7280] mt-1">Gestion de clientes, potenciales y contactos</p>
      </div>
      <Suspense fallback={<div className="flex justify-center py-10"><Loader2 className="animate-spin text-[#FF6600]" size={32} /></div>}>
        <Tabs tabs={clientesTabs} defaultTab="clientes">
          {(activeTab) => (
            <>
              {activeTab === 'clientes' && <ClientesTab />}
              {activeTab === 'potenciales' && <PotencialesTab />}
              {activeTab === 'contactos' && <ContactosTab />}
            </>
          )}
        </Tabs>
      </Suspense>
    </div>
  )
}
