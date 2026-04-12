'use client'

import { useState, useEffect, useRef, useCallback, Suspense, useMemo } from 'react'
import { SearchBar } from '@/components/ui/search-bar'
import { Card } from '@/components/ui/card'
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
import { formatCurrency, formatDate, formatRelative, getInitials } from '@/lib/utils'
import type { Client, ClientContact, GroupedCompany, ActivityLog } from '@/types'
import { ExportButton } from '@/components/ui/export-button'
import { ImportButton } from '@/components/ui/import-button'
import {
  Users, Plus, Phone, Mail, MessageSquare, MapPin,
  Building2, FileText, Edit3, Save, X, Loader2, UserPlus, Contact,
  CreditCard, Truck, Clock, ChevronRight, Trash2, Star,
  Globe, Hash, ArrowLeft, Search
} from 'lucide-react'
import { DocLink } from '@/components/ui/doc-link'

// ═══════════════════════════════════════════════════════
// CONSTANTS
// ═══════════════════════════════════════════════════════

const PAGE_SIZE = 200
const countryFlags: Record<string, string> = { ES: '\u{1F1EA}\u{1F1F8}', AR: '\u{1F1E6}\u{1F1F7}', US: '\u{1F1FA}\u{1F1F8}', CL: '\u{1F1E8}\u{1F1F1}', UY: '\u{1F1FA}\u{1F1FE}', BR: '\u{1F1E7}\u{1F1F7}', MX: '\u{1F1F2}\u{1F1FD}', CO: '\u{1F1E8}\u{1F1F4}', DE: '\u{1F1E9}\u{1F1EA}', FR: '\u{1F1EB}\u{1F1F7}', IT: '\u{1F1EE}\u{1F1F9}', GB: '\u{1F1EC}\u{1F1E7}', EC: '\u{1F1EA}\u{1F1E8}', PE: '\u{1F1F5}\u{1F1EA}', PY: '\u{1F1F5}\u{1F1FE}', BO: '\u{1F1E7}\u{1F1F4}', VE: '\u{1F1FB}\u{1F1EA}', CR: '\u{1F1E8}\u{1F1F7}', PA: '\u{1F1F5}\u{1F1E6}', DO: '\u{1F1E9}\u{1F1F4}', GT: '\u{1F1EC}\u{1F1F9}', HN: '\u{1F1ED}\u{1F1F3}', SV: '\u{1F1F8}\u{1F1FB}', NI: '\u{1F1F3}\u{1F1EE}', PT: '\u{1F1F5}\u{1F1F9}' }
const countryNames: Record<string, string> = { ES: 'Espana', AR: 'Argentina', US: 'Estados Unidos', CL: 'Chile', UY: 'Uruguay', BR: 'Brasil', MX: 'Mexico', CO: 'Colombia', DE: 'Alemania', EC: 'Ecuador', PE: 'Peru', PY: 'Paraguay', FR: 'Francia', IT: 'Italia', GB: 'Reino Unido', PT: 'Portugal' }

import { Trophy, StarOff } from 'lucide-react'

const clientesTabs = [
  { id: 'clientes', label: 'Clientes', icon: <Building2 size={16} /> },
  { id: 'favoritos', label: 'Favoritos', icon: <Star size={16} /> },
  { id: 'ranking', label: 'Ranking', icon: <Trophy size={16} /> },
  { id: 'potenciales', label: 'Potenciales', icon: <UserPlus size={16} /> },
  { id: 'contactos', label: 'Contactos', icon: <Contact size={16} /> },
]

// ═══════════════════════════════════════════════════════
// HELPER: Group clients by legal_name into companies
// ═══════════════════════════════════════════════════════

function groupClientsByCompany(clients: Client[]): GroupedCompany[] {
  const map = new Map<string, Client[]>()

  for (const c of clients) {
    // Use legal_name as grouping key; fallback to name if legal_name is empty/null
    const key = (c.legal_name || c.name || '').trim().toUpperCase()
    if (!key) continue
    const existing = map.get(key)
    if (existing) existing.push(c)
    else map.set(key, [c])
  }

  const companies: GroupedCompany[] = []
  for (const [, records] of map) {
    // Pick the record with the most data as "primary"
    const sorted = [...records].sort((a, b) => {
      const scoreA = (a.tax_id ? 2 : 0) + (a.email ? 1 : 0) + (a.phone ? 1 : 0) + (a.address ? 1 : 0)
      const scoreB = (b.tax_id ? 2 : 0) + (b.email ? 1 : 0) + (b.phone ? 1 : 0) + (b.address ? 1 : 0)
      return scoreB - scoreA
    })
    const primary = sorted[0]

    // Extract contacts from all records (the "name" field contains the contact person name)
    const inlineContacts: { name: string; email: string | null; phone: string | null }[] = []
    const seenNames = new Set<string>()
    for (const rec of records) {
      const contactName = (rec.name || '').trim()
      // Only add as contact if name differs from legal_name (meaning it's a person, not the company name repeated)
      const legalUpper = (rec.legal_name || '').trim().toUpperCase()
      const nameUpper = contactName.toUpperCase()
      if (contactName && nameUpper !== legalUpper && !seenNames.has(nameUpper)) {
        seenNames.add(nameUpper)
        inlineContacts.push({ name: contactName, email: rec.email, phone: rec.phone })
      }
    }

    // Merge best data across records
    const bestTaxId = records.find(r => r.tax_id)?.tax_id || null
    const bestEmail = records.find(r => r.email)?.email || null
    const bestPhone = records.find(r => r.phone)?.phone || null
    const bestAddress = records.find(r => r.address)?.address || null
    const bestCity = records.find(r => r.city)?.city || null
    const bestCategory = records.find(r => r.category)?.category || null
    const bestPaymentTerms = records.find(r => r.payment_terms)?.payment_terms || null

    companies.push({
      id: primary.id,
      legal_name: primary.legal_name || primary.name,
      name: primary.name,
      tax_id: bestTaxId,
      email: bestEmail,
      phone: bestPhone,
      whatsapp: primary.whatsapp,
      address: bestAddress,
      city: bestCity,
      state: primary.state,
      postal_code: primary.postal_code,
      country: primary.country,
      category: bestCategory,
      payment_terms: bestPaymentTerms,
      credit_limit: primary.credit_limit,
      source: primary.source,
      records,
      inlineContacts,
      contactCount: inlineContacts.length,
    })
  }

  companies.sort((a, b) => a.legal_name.localeCompare(b.legal_name))
  return companies
}

// ═══════════════════════════════════════════════════════
// COMPANY DETAIL VIEW
// ═══════════════════════════════════════════════════════

function CompanyDetail({ company, onClose, onUpdate }: {
  company: GroupedCompany
  onClose: () => void
  onUpdate: () => void
}) {
  const { addToast } = useToast()
  const supabase = createClient()
  const [activeDetailTab, setActiveDetailTab] = useState('datos')
  const [editing, setEditing] = useState(false)
  const [editData, setEditData] = useState<Partial<Client>>({})
  const [saving, setSaving] = useState(false)
  const [contacts, setContacts] = useState<ClientContact[]>([])
  const [loadingContacts, setLoadingContacts] = useState(true)
  const [activity, setActivity] = useState<ActivityLog[]>([])
  const [documents, setDocuments] = useState<Record<string, unknown>[]>([])
  const [showAddContact, setShowAddContact] = useState(false)
  const [newContact, setNewContact] = useState({ name: '', position: '', email: '', phone: '', whatsapp: '' })
  const [savingContact, setSavingContact] = useState(false)
  const [editingContact, setEditingContact] = useState<string | null>(null)
  const [editContactData, setEditContactData] = useState<Partial<ClientContact>>({})

  // Get all client_ids for this company (for querying related data)
  const allClientIds = useMemo(() => company.records.map(r => r.id), [company])

  // Load contacts from tt_client_contacts
  const loadContacts = useCallback(async () => {
    setLoadingContacts(true)
    try {
      const { data } = await supabase
        .from('tt_client_contacts')
        .select('*')
        .in('client_id', allClientIds)
        .order('is_primary', { ascending: false })
      setContacts((data || []) as ClientContact[])
    } catch { /* ignore */ }
    setLoadingContacts(false)
  }, [allClientIds, supabase])

  // Load activity log
  const loadActivity = useCallback(async () => {
    const { data } = await supabase
      .from('tt_activity_log')
      .select('*')
      .eq('entity_type', 'client')
      .in('entity_id', allClientIds)
      .order('created_at', { ascending: false })
      .limit(20)
    setActivity((data || []) as ActivityLog[])
  }, [allClientIds, supabase])

  // Load documents (quotes, orders, invoices) from tt_documents
  const loadDocuments = useCallback(async () => {
    const { data } = await supabase
      .from('tt_documents')
      .select('id, type, system_code, display_ref, status, total, currency, created_at')
      .in('client_id', allClientIds)
      .order('created_at', { ascending: false })
      .limit(30)
    setDocuments((data || []) as Record<string, unknown>[])
  }, [allClientIds, supabase])

  useEffect(() => {
    loadContacts()
    loadActivity()
    loadDocuments()
  }, [loadContacts, loadActivity, loadDocuments])

  function startEditing() {
    setEditing(true)
    setEditData({
      legal_name: company.legal_name,
      tax_id: company.tax_id,
      email: company.email,
      phone: company.phone,
      address: company.address,
      city: company.city,
      state: company.state,
      postal_code: company.postal_code,
      country: company.country,
      category: company.category,
      payment_terms: company.payment_terms,
      credit_limit: company.credit_limit,
    })
  }

  async function saveEdit() {
    setSaving(true)
    try {
      // Update all records that share this legal_name
      for (const rec of company.records) {
        await supabase.from('tt_clients').update({
          legal_name: editData.legal_name,
          tax_id: editData.tax_id,
          email: editData.email,
          phone: editData.phone,
          address: editData.address,
          city: editData.city,
          state: editData.state,
          postal_code: editData.postal_code,
          country: editData.country,
          category: editData.category,
          payment_terms: editData.payment_terms,
          credit_limit: editData.credit_limit,
          updated_at: new Date().toISOString(),
        }).eq('id', rec.id)
      }
      setEditing(false)
      addToast({ type: 'success', title: 'Empresa actualizada' })
      onUpdate()
    } catch {
      addToast({ type: 'error', title: 'Error al guardar' })
    }
    setSaving(false)
  }

  async function addContact() {
    if (!newContact.name.trim()) { addToast({ type: 'error', title: 'El nombre es obligatorio' }); return }
    setSavingContact(true)
    try {
      const { error } = await supabase.from('tt_client_contacts').insert({
        client_id: company.id,
        name: newContact.name,
        position: newContact.position || null,
        email: newContact.email || null,
        phone: newContact.phone || null,
        whatsapp: newContact.whatsapp || null,
        is_primary: contacts.length === 0,
      })
      if (error) throw error
      setShowAddContact(false)
      setNewContact({ name: '', position: '', email: '', phone: '', whatsapp: '' })
      addToast({ type: 'success', title: 'Contacto agregado' })
      loadContacts()
    } catch {
      addToast({ type: 'error', title: 'Error al crear contacto' })
    }
    setSavingContact(false)
  }

  async function saveContactEdit(contactId: string) {
    try {
      await supabase.from('tt_client_contacts').update({
        name: editContactData.name,
        position: editContactData.position || null,
        email: editContactData.email || null,
        phone: editContactData.phone || null,
        whatsapp: editContactData.whatsapp || null,
      }).eq('id', contactId)
      setEditingContact(null)
      addToast({ type: 'success', title: 'Contacto actualizado' })
      loadContacts()
    } catch {
      addToast({ type: 'error', title: 'Error al actualizar' })
    }
  }

  async function deleteContact(contactId: string) {
    try {
      await supabase.from('tt_client_contacts').delete().eq('id', contactId)
      addToast({ type: 'success', title: 'Contacto eliminado' })
      loadContacts()
    } catch {
      addToast({ type: 'error', title: 'Error al eliminar' })
    }
  }

  async function togglePrimary(contactId: string) {
    // Set all contacts as non-primary first, then set the selected one
    for (const c of contacts) {
      await supabase.from('tt_client_contacts').update({ is_primary: c.id === contactId }).eq('id', c.id)
    }
    addToast({ type: 'success', title: 'Contacto principal actualizado' })
    loadContacts()
  }

  // All inline contacts from the duplicate records
  const allContacts = useMemo(() => {
    const fromDb = contacts.map(c => ({
      source: 'db' as const,
      id: c.id,
      name: c.name,
      position: c.position,
      email: c.email,
      phone: c.phone,
      whatsapp: c.whatsapp,
      is_primary: c.is_primary,
    }))
    const fromRecords = company.inlineContacts.map((ic, i) => ({
      source: 'inline' as const,
      id: `inline-${i}`,
      name: ic.name,
      position: null as string | null,
      email: ic.email,
      phone: ic.phone,
      whatsapp: null as string | null,
      is_primary: false,
    }))
    // Merge: DB contacts take priority, dedupe by name
    const seen = new Set(fromDb.map(c => c.name.toUpperCase()))
    const extra = fromRecords.filter(c => !seen.has(c.name.toUpperCase()))
    return [...fromDb, ...extra]
  }, [contacts, company.inlineContacts])

  const detailTabs = [
    { id: 'datos', label: 'Datos' },
    { id: 'contactos', label: `Contactos (${allContacts.length})` },
    { id: 'historial', label: 'Historial' },
    { id: 'documentos', label: `Documentos (${documents.length})` },
  ]

  return (
    <div className="fixed inset-0 z-50 flex bg-[#0B0E13]/95 backdrop-blur-sm animate-in fade-in duration-200">
      {/* TOP BAR */}
      <div className="absolute top-0 left-0 right-0 h-14 bg-[#141820] border-b border-[#1E2330] flex items-center px-4 gap-4 z-10">
        <button onClick={onClose} className="flex items-center gap-2 text-[#9CA3AF] hover:text-[#F0F2F5] transition-colors">
          <ArrowLeft size={18} />
          <span className="text-sm">Volver</span>
        </button>
        <div className="flex items-center gap-3 flex-1">
          <div className="w-8 h-8 rounded-lg bg-[#FF6600]/20 flex items-center justify-center">
            <Building2 size={16} className="text-[#FF6600]" />
          </div>
          <div>
            <h1 className="text-base font-bold text-[#F0F2F5] leading-tight">{company.legal_name}</h1>
            <p className="text-xs text-[#6B7280]">{countryFlags[company.country] || ''} {company.tax_id || 'Sin CUIT/CIF'}</p>
          </div>
        </div>
        <div className="flex gap-2">
          {company.phone && <a href={`tel:${company.phone}`}><Button variant="ghost" size="sm"><Phone size={14} /></Button></a>}
          {company.email && <a href={`mailto:${company.email}`}><Button variant="ghost" size="sm"><Mail size={14} /></Button></a>}
          {company.phone && <a href={`https://wa.me/${company.phone.replace(/[^0-9+]/g, '')}`} target="_blank" rel="noreferrer"><Button variant="ghost" size="sm"><MessageSquare size={14} /></Button></a>}
        </div>
      </div>

      <div className="flex flex-1 pt-14 overflow-hidden">
        {/* LEFT PANEL: Company Info */}
        <div className="w-72 border-r border-[#1E2330] overflow-y-auto p-4 space-y-4 shrink-0 hidden lg:block">
          <Card>
            <div className="space-y-3">
              <div className="w-14 h-14 rounded-xl bg-[#FF6600]/20 flex items-center justify-center mx-auto">
                <span className="text-xl font-bold text-[#FF6600]">{getInitials(company.legal_name)}</span>
              </div>
              <h2 className="text-center text-sm font-bold text-[#F0F2F5]">{company.legal_name}</h2>
              {company.tax_id && <p className="text-center text-xs font-mono text-[#9CA3AF]">{company.tax_id}</p>}
              <div className="pt-2 border-t border-[#1E2330] space-y-2">
                {company.address && <div className="flex items-start gap-2 text-xs text-[#9CA3AF]"><MapPin size={12} className="mt-0.5 shrink-0" /><span>{company.address}{company.city ? `, ${company.city}` : ''}</span></div>}
                {company.phone && <div className="flex items-center gap-2 text-xs text-[#9CA3AF]"><Phone size={12} className="shrink-0" /><span>{company.phone}</span></div>}
                {company.email && <div className="flex items-center gap-2 text-xs text-[#9CA3AF]"><Mail size={12} className="shrink-0" /><span className="truncate">{company.email}</span></div>}
                <div className="flex items-center gap-2 text-xs text-[#9CA3AF]"><Globe size={12} className="shrink-0" /><span>{countryFlags[company.country] || ''} {countryNames[company.country] || company.country}</span></div>
              </div>
            </div>
          </Card>

          <Card>
            <h3 className="text-xs font-semibold text-[#6B7280] uppercase mb-3">Condiciones</h3>
            <div className="space-y-2">
              <div className="flex justify-between text-xs"><span className="text-[#6B7280]">Pago</span><span className="text-[#F0F2F5]">{company.payment_terms || '-'}</span></div>
              <div className="flex justify-between text-xs"><span className="text-[#6B7280]">Limite credito</span><span className="text-[#F0F2F5]">{company.credit_limit ? formatCurrency(company.credit_limit, 'EUR') : '-'}</span></div>
              <div className="flex justify-between text-xs"><span className="text-[#6B7280]">Categoria</span><span className="text-[#F0F2F5] capitalize">{company.category || '-'}</span></div>
              <div className="flex justify-between text-xs"><span className="text-[#6B7280]">Origen</span><span className="text-[#F0F2F5]">{company.source || '-'}</span></div>
            </div>
          </Card>

          <Card>
            <h3 className="text-xs font-semibold text-[#6B7280] uppercase mb-3">Acciones rapidas</h3>
            <div className="grid grid-cols-2 gap-2">
              {company.phone && <a href={`tel:${company.phone}`}><Button variant="secondary" size="sm" className="w-full text-xs"><Phone size={12} /> Llamar</Button></a>}
              {company.email && <a href={`mailto:${company.email}`}><Button variant="secondary" size="sm" className="w-full text-xs"><Mail size={12} /> Email</Button></a>}
              {company.phone && <a href={`https://wa.me/${company.phone.replace(/[^0-9+]/g, '')}`} target="_blank" rel="noreferrer"><Button variant="secondary" size="sm" className="w-full text-xs"><MessageSquare size={12} /> WhatsApp</Button></a>}
            </div>
          </Card>
        </div>

        {/* CENTER PANEL: Tabs */}
        <div className="flex-1 overflow-y-auto p-4">
          {/* Simple tab bar */}
          <div className="flex gap-1 p-1 bg-[#0F1218] rounded-lg border border-[#1E2330] mb-4 overflow-x-auto">
            {detailTabs.map((tab) => (
              <button
                key={tab.id}
                onClick={() => setActiveDetailTab(tab.id)}
                className={`px-4 py-2 text-sm font-medium rounded-md transition-all whitespace-nowrap ${
                  activeDetailTab === tab.id ? 'bg-[#1E2330] text-[#FF6600] shadow-sm' : 'text-[#6B7280] hover:text-[#9CA3AF]'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>

          {/* TAB: Datos */}
          {activeDetailTab === 'datos' && (
            <div className="space-y-4">
              <div className="flex justify-between items-center">
                <h3 className="text-sm font-semibold text-[#F0F2F5]">Datos de la empresa</h3>
                {!editing && <Button variant="secondary" size="sm" onClick={startEditing}><Edit3 size={14} /> Editar</Button>}
              </div>
              {editing ? (
                <Card>
                  <div className="space-y-4">
                    <Input label="Razon social / Nombre empresa *" value={editData.legal_name || ''} onChange={(e) => setEditData({ ...editData, legal_name: e.target.value })} />
                    <div className="grid grid-cols-2 gap-4">
                      <Input label="CUIT / CIF" value={editData.tax_id || ''} onChange={(e) => setEditData({ ...editData, tax_id: e.target.value })} />
                      <Select label="Categoria" value={editData.category || ''} onChange={(e) => setEditData({ ...editData, category: e.target.value })} options={[{ value: '', label: 'Sin categoria' }, { value: 'empresa', label: 'Empresa' }, { value: 'autonomo', label: 'Autonomo' }, { value: 'particular', label: 'Particular' }, { value: 'distribuidor', label: 'Distribuidor' }]} />
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                      <Input label="Email" type="email" value={editData.email || ''} onChange={(e) => setEditData({ ...editData, email: e.target.value })} />
                      <Input label="Telefono" value={editData.phone || ''} onChange={(e) => setEditData({ ...editData, phone: e.target.value })} />
                    </div>
                    <Input label="Direccion" value={editData.address || ''} onChange={(e) => setEditData({ ...editData, address: e.target.value })} />
                    <div className="grid grid-cols-3 gap-4">
                      <Input label="Ciudad" value={editData.city || ''} onChange={(e) => setEditData({ ...editData, city: e.target.value })} />
                      <Input label="Provincia / Estado" value={editData.state || ''} onChange={(e) => setEditData({ ...editData, state: e.target.value })} />
                      <Input label="Codigo postal" value={editData.postal_code || ''} onChange={(e) => setEditData({ ...editData, postal_code: e.target.value })} />
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                      <Select label="Pais" value={editData.country || 'ES'} onChange={(e) => setEditData({ ...editData, country: e.target.value })} options={Object.entries(countryNames).map(([k, v]) => ({ value: k, label: v }))} />
                      <Input label="Condiciones de pago" value={editData.payment_terms || ''} onChange={(e) => setEditData({ ...editData, payment_terms: e.target.value })} />
                    </div>
                    <Input label="Limite de credito" type="number" value={String(editData.credit_limit || 0)} onChange={(e) => setEditData({ ...editData, credit_limit: Number(e.target.value) })} />
                    <div className="flex gap-2 justify-end pt-2">
                      <Button variant="secondary" onClick={() => setEditing(false)}>Cancelar</Button>
                      <Button variant="primary" onClick={saveEdit} loading={saving}><Save size={14} /> Guardar</Button>
                    </div>
                  </div>
                </Card>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  <InfoField label="Razon social" value={company.legal_name} />
                  <InfoField label="CUIT / CIF" value={company.tax_id} mono />
                  <InfoField label="Email" value={company.email} />
                  <InfoField label="Telefono" value={company.phone} />
                  <InfoField label="Direccion" value={[company.address, company.city, company.state].filter(Boolean).join(', ')} />
                  <InfoField label="Pais" value={`${countryFlags[company.country] || ''} ${countryNames[company.country] || company.country}`} />
                  <InfoField label="Codigo postal" value={company.postal_code} />
                  <InfoField label="Condiciones de pago" value={company.payment_terms} />
                  <InfoField label="Limite de credito" value={company.credit_limit ? formatCurrency(company.credit_limit, 'EUR') : null} />
                  <InfoField label="Categoria" value={company.category} />
                  <InfoField label="Origen" value={company.source} />
                  <InfoField label="Registros vinculados" value={`${company.records.length} registro(s) en la base`} />
                </div>
              )}
            </div>
          )}

          {/* TAB: Contactos */}
          {activeDetailTab === 'contactos' && (
            <div className="space-y-4">
              <div className="flex justify-between items-center">
                <h3 className="text-sm font-semibold text-[#F0F2F5]">Contactos de {company.legal_name}</h3>
                <Button variant="primary" size="sm" onClick={() => setShowAddContact(true)}><Plus size={14} /> Agregar contacto</Button>
              </div>

              {loadingContacts ? (
                <div className="flex justify-center py-10"><Loader2 className="animate-spin text-[#FF6600]" size={24} /></div>
              ) : allContacts.length === 0 ? (
                <Card><p className="text-center text-[#6B7280] py-6">No hay contactos registrados</p></Card>
              ) : (
                <div className="space-y-3">
                  {allContacts.map((contact) => (
                    <Card key={contact.id}>
                      {editingContact === contact.id ? (
                        <div className="space-y-3">
                          <div className="grid grid-cols-2 gap-3">
                            <Input label="Nombre" value={editContactData.name || ''} onChange={(e) => setEditContactData({ ...editContactData, name: e.target.value })} />
                            <Input label="Cargo" value={editContactData.position || ''} onChange={(e) => setEditContactData({ ...editContactData, position: e.target.value })} />
                          </div>
                          <div className="grid grid-cols-3 gap-3">
                            <Input label="Email" value={editContactData.email || ''} onChange={(e) => setEditContactData({ ...editContactData, email: e.target.value })} />
                            <Input label="Telefono" value={editContactData.phone || ''} onChange={(e) => setEditContactData({ ...editContactData, phone: e.target.value })} />
                            <Input label="WhatsApp" value={editContactData.whatsapp || ''} onChange={(e) => setEditContactData({ ...editContactData, whatsapp: e.target.value })} />
                          </div>
                          <div className="flex gap-2 justify-end">
                            <Button variant="secondary" size="sm" onClick={() => setEditingContact(null)}>Cancelar</Button>
                            <Button variant="primary" size="sm" onClick={() => saveContactEdit(contact.id)}><Save size={12} /> Guardar</Button>
                          </div>
                        </div>
                      ) : (
                        <div className="flex items-center gap-3">
                          <div className="w-10 h-10 rounded-full bg-[#1E2330] flex items-center justify-center text-sm font-bold text-[#FF6600] shrink-0">
                            {getInitials(contact.name)}
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2">
                              <span className="text-sm font-semibold text-[#F0F2F5]">{contact.name}</span>
                              {contact.is_primary && <Badge variant="orange" size="sm">Principal</Badge>}
                              {contact.source === 'inline' && <Badge variant="default" size="sm">StelOrder</Badge>}
                            </div>
                            {contact.position && <p className="text-xs text-[#6B7280]">{contact.position}</p>}
                            <div className="flex gap-4 mt-1 flex-wrap">
                              {contact.email && <span className="text-xs text-[#9CA3AF] flex items-center gap-1"><Mail size={10} />{contact.email}</span>}
                              {contact.phone && <span className="text-xs text-[#9CA3AF] flex items-center gap-1"><Phone size={10} />{contact.phone}</span>}
                            </div>
                          </div>
                          {contact.source === 'db' && (
                            <div className="flex gap-1 shrink-0">
                              {!contact.is_primary && (
                                <Button variant="ghost" size="sm" onClick={() => togglePrimary(contact.id)} title="Marcar como principal"><Star size={14} /></Button>
                              )}
                              <Button variant="ghost" size="sm" onClick={() => {
                                setEditingContact(contact.id)
                                setEditContactData({ name: contact.name, position: contact.position, email: contact.email, phone: contact.phone, whatsapp: contact.whatsapp })
                              }}><Edit3 size={14} /></Button>
                              <Button variant="ghost" size="sm" onClick={() => deleteContact(contact.id)}><Trash2 size={14} className="text-red-400" /></Button>
                            </div>
                          )}
                        </div>
                      )}
                    </Card>
                  ))}
                </div>
              )}

              {/* Add contact modal */}
              <Modal isOpen={showAddContact} onClose={() => setShowAddContact(false)} title="Agregar contacto" size="md">
                <div className="space-y-4">
                  <Input label="Nombre *" value={newContact.name} onChange={(e) => setNewContact({ ...newContact, name: e.target.value })} />
                  <Input label="Cargo / Posicion" value={newContact.position} onChange={(e) => setNewContact({ ...newContact, position: e.target.value })} />
                  <div className="grid grid-cols-2 gap-4">
                    <Input label="Email" type="email" value={newContact.email} onChange={(e) => setNewContact({ ...newContact, email: e.target.value })} />
                    <Input label="Telefono" value={newContact.phone} onChange={(e) => setNewContact({ ...newContact, phone: e.target.value })} />
                  </div>
                  <Input label="WhatsApp" value={newContact.whatsapp} onChange={(e) => setNewContact({ ...newContact, whatsapp: e.target.value })} />
                  <div className="flex justify-end gap-2 pt-2">
                    <Button variant="secondary" onClick={() => setShowAddContact(false)}>Cancelar</Button>
                    <Button variant="primary" onClick={addContact} loading={savingContact}><Save size={14} /> Guardar</Button>
                  </div>
                </div>
              </Modal>
            </div>
          )}

          {/* TAB: Historial */}
          {activeDetailTab === 'historial' && (
            <div className="space-y-4">
              <h3 className="text-sm font-semibold text-[#F0F2F5]">Historial de actividad</h3>
              {activity.length === 0 ? (
                <Card><p className="text-center text-[#6B7280] py-6">No hay actividad registrada</p></Card>
              ) : (
                <div className="space-y-2">
                  {activity.map((a) => (
                    <Card key={a.id}>
                      <div className="flex items-start gap-3">
                        <div className="w-8 h-8 rounded-full bg-[#1E2330] flex items-center justify-center shrink-0">
                          <Clock size={14} className="text-[#6B7280]" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm text-[#F0F2F5]">{a.action}</p>
                          {a.detail && <p className="text-xs text-[#6B7280] mt-0.5">{a.detail}</p>}
                          <p className="text-xs text-[#4B5563] mt-1">{formatRelative(a.created_at)}</p>
                        </div>
                      </div>
                    </Card>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* TAB: Documentos */}
          {activeDetailTab === 'documentos' && (
            <div className="space-y-4">
              <h3 className="text-sm font-semibold text-[#F0F2F5]">Documentos vinculados</h3>
              {documents.length === 0 ? (
                <Card><p className="text-center text-[#6B7280] py-6">No hay documentos vinculados a esta empresa</p></Card>
              ) : (
                <Card className="p-0 overflow-hidden">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Tipo</TableHead>
                        <TableHead>Referencia</TableHead>
                        <TableHead>Estado</TableHead>
                        <TableHead>Total</TableHead>
                        <TableHead>Fecha</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {documents.map((doc) => {
                        const docType = doc.type as string
                        const typeLabels: Record<string, string> = { quote: 'Cotizacion', sales_order: 'Pedido', invoice: 'Factura', delivery: 'Remito', purchase_order: 'Orden compra' }
                        const statusColors: Record<string, string> = { draft: 'default', sent: 'info', accepted: 'success', confirmed: 'success', invoiced: 'orange', cancelled: 'danger', paid: 'success' }
                        return (
                          <TableRow key={doc.id as string}>
                            <TableCell><Badge variant="info" size="sm">{typeLabels[docType] || docType}</Badge></TableCell>
                            <TableCell><DocLink docRef={(doc.display_ref || doc.system_code) as string} docId={doc.id as string} docType={doc.type as string} className="text-xs font-mono" /></TableCell>
                            <TableCell><Badge variant={(statusColors[(doc.status as string)] || 'default') as 'default' | 'success' | 'warning' | 'danger' | 'info' | 'orange'} size="sm">{doc.status as string}</Badge></TableCell>
                            <TableCell className="font-semibold text-[#F0F2F5]">{formatCurrency((doc.total as number) || 0, ((doc.currency as string) || 'EUR') as 'EUR' | 'ARS' | 'USD')}</TableCell>
                            <TableCell className="text-xs text-[#9CA3AF]">{formatDate(doc.created_at as string)}</TableCell>
                          </TableRow>
                        )
                      })}
                    </TableBody>
                  </Table>
                </Card>
              )}
            </div>
          )}
        </div>

        {/* RIGHT PANEL: Resumen */}
        <div className="w-72 border-l border-[#1E2330] overflow-y-auto p-4 space-y-4 shrink-0 hidden xl:block">
          <Card>
            <h3 className="text-xs font-semibold text-[#6B7280] uppercase mb-3">Resumen</h3>
            <div className="space-y-3">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-lg bg-blue-500/10 flex items-center justify-center"><FileText size={14} className="text-blue-400" /></div>
                <div><p className="text-xs text-[#6B7280]">Documentos</p><p className="text-sm font-semibold text-[#F0F2F5]">{documents.length}</p></div>
              </div>
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-lg bg-emerald-500/10 flex items-center justify-center"><Users size={14} className="text-emerald-400" /></div>
                <div><p className="text-xs text-[#6B7280]">Contactos</p><p className="text-sm font-semibold text-[#F0F2F5]">{allContacts.length}</p></div>
              </div>
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-lg bg-orange-500/10 flex items-center justify-center"><Hash size={14} className="text-orange-400" /></div>
                <div><p className="text-xs text-[#6B7280]">Registros DB</p><p className="text-sm font-semibold text-[#F0F2F5]">{company.records.length}</p></div>
              </div>
            </div>
          </Card>

          {/* Pendientes de entrega */}
          <Card>
            <h3 className="text-xs font-semibold text-[#6B7280] uppercase mb-3">Pendientes de entrega</h3>
            {documents.filter(d => d.type === 'sales_order' && d.status !== 'delivered' && d.status !== 'cancelled').length === 0 ? (
              <p className="text-xs text-[#4B5563]">Sin pendientes</p>
            ) : (
              <div className="space-y-2">
                {documents.filter(d => d.type === 'sales_order' && d.status !== 'delivered' && d.status !== 'cancelled').slice(0, 5).map(d => (
                  <div key={d.id as string} className="flex items-center justify-between p-2 rounded-lg bg-[#0F1218]">
                    <DocLink docRef={(d.display_ref || d.system_code) as string} docId={d.id as string} docType={d.type as string} className="text-xs font-mono" />
                    <Badge variant="warning" size="sm">{d.status as string}</Badge>
                  </div>
                ))}
              </div>
            )}
          </Card>

          {/* Pendientes de pago */}
          <Card>
            <h3 className="text-xs font-semibold text-[#6B7280] uppercase mb-3">Pendientes de pago</h3>
            {documents.filter(d => d.type === 'invoice' && d.status !== 'paid' && d.status !== 'cancelled').length === 0 ? (
              <p className="text-xs text-[#4B5563]">Sin pendientes</p>
            ) : (
              <div className="space-y-2">
                {documents.filter(d => d.type === 'invoice' && d.status !== 'paid' && d.status !== 'cancelled').slice(0, 5).map(d => (
                  <div key={d.id as string} className="flex items-center justify-between p-2 rounded-lg bg-[#0F1218]">
                    <DocLink docRef={(d.display_ref || d.system_code) as string} docId={d.id as string} docType={d.type as string} className="text-xs font-mono" />
                    <span className="text-xs font-semibold text-red-400">{formatCurrency((d.total as number) || 0, ((d.currency as string) || 'EUR') as 'EUR' | 'ARS' | 'USD')}</span>
                  </div>
                ))}
              </div>
            )}
          </Card>

          {/* Ultimas transacciones */}
          <Card>
            <h3 className="text-xs font-semibold text-[#6B7280] uppercase mb-3">Ultimas transacciones</h3>
            {documents.length === 0 ? (
              <p className="text-xs text-[#4B5563]">Sin transacciones</p>
            ) : (
              <div className="space-y-2">
                {documents.slice(0, 5).map(d => (
                  <div key={d.id as string} className="flex items-center justify-between p-2 rounded-lg bg-[#0F1218]">
                    <div>
                      <DocLink docRef={(d.display_ref || d.system_code) as string} docId={d.id as string} docType={d.type as string} className="text-xs font-mono" />
                      <p className="text-[10px] text-[#4B5563]">{formatRelative(d.created_at as string)}</p>
                    </div>
                    <span className="text-xs font-semibold text-[#F0F2F5]">{formatCurrency((d.total as number) || 0, ((d.currency as string) || 'EUR') as 'EUR' | 'ARS' | 'USD')}</span>
                  </div>
                ))}
              </div>
            )}
          </Card>
        </div>
      </div>
    </div>
  )
}

// ═══════════════════════════════════════════════════════
// SMALL HELPER: Info Field
// ═══════════════════════════════════════════════════════

function InfoField({ label, value, mono }: { label: string; value: string | null | undefined; mono?: boolean }) {
  return (
    <div className="p-3 rounded-lg bg-[#0F1218] border border-[#1E2330]">
      <p className="text-xs text-[#6B7280] mb-0.5">{label}</p>
      <p className={`text-sm text-[#F0F2F5] ${mono ? 'font-mono' : ''}`}>{value || '-'}</p>
    </div>
  )
}

// ═══════════════════════════════════════════════════════
// CLIENTES TAB (Companies grouped by legal_name)
// ═══════════════════════════════════════════════════════

function ClientesTab() {
  const { addToast } = useToast()
  const [allClients, setAllClients] = useState<Client[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [filterCountry, setFilterCountry] = useState('')
  const [countries, setCountries] = useState<string[]>([])
  const debounceRef = useRef<NodeJS.Timeout | null>(null)
  const [selectedCompany, setSelectedCompany] = useState<GroupedCompany | null>(null)
  const [showNew, setShowNew] = useState(false)
  const [newClient, setNewClient] = useState({ legal_name: '', tax_id: '', category: '' as string, country: 'ES', city: '', email: '', phone: '', address: '', contact_name: '', contact_position: '', contact_email: '', contact_phone: '' })
  const [savingNew, setSavingNew] = useState(false)
  const [displayCount, setDisplayCount] = useState(60)

  async function toggleFavorite(clientId: string, isFavorite: boolean) {
    const supabase = createClient()
    await supabase.from('tt_clients').update({ is_favorite: isFavorite }).eq('id', clientId)
    // Update local state
    setAllClients(prev => prev.map(c => c.id === clientId ? { ...c, is_favorite: isFavorite } as Client : c))
    addToast({ type: 'success', title: isFavorite ? '⭐ Agregado a favoritos' : 'Quitado de favoritos' })
  }

  const loadClients = useCallback(async () => {
    setLoading(true)
    const supabase = createClient()
    try {
      // Load all active clients (paginated in large batches)
      let allData: Client[] = []
      let from = 0
      let keepGoing = true
      while (keepGoing) {
        const { data } = await supabase
          .from('tt_clients')
          .select('*')
          .eq('active', true)
          .order('legal_name')
          .range(from, from + PAGE_SIZE - 1)
        const batch = (data || []) as Client[]
        allData = [...allData, ...batch]
        if (batch.length < PAGE_SIZE) keepGoing = false
        else from += PAGE_SIZE
      }
      setAllClients(allData)

      // Extract unique countries
      const unique = [...new Set(allData.map(c => c.country).filter(Boolean))]
      unique.sort()
      setCountries(unique)
    } catch {
      addToast({ type: 'error', title: 'Error al cargar clientes' })
    }
    setLoading(false)
  }, [addToast])

  useEffect(() => { loadClients() }, [loadClients])

  // Group and filter
  const companies = useMemo(() => {
    let filtered = allClients
    if (filterCountry) filtered = filtered.filter(c => c.country === filterCountry)
    if (search.trim()) {
      const tokens = search.trim().toLowerCase().split(/\s+/)
      filtered = filtered.filter(c => {
        const searchable = [c.name, c.legal_name, c.tax_id, c.email, c.city, c.phone].filter(Boolean).join(' ').toLowerCase()
        return tokens.every(t => searchable.includes(t))
      })
    }
    return groupClientsByCompany(filtered)
  }, [allClients, search, filterCountry])

  const visibleCompanies = useMemo(() => companies.slice(0, displayCount), [companies, displayCount])

  async function createNewClient() {
    if (!newClient.legal_name.trim()) { addToast({ type: 'error', title: 'El nombre de la empresa es obligatorio' }); return }
    setSavingNew(true)
    const supabase = createClient()
    try {
      // Create the main client record
      const { data: clientData, error } = await supabase.from('tt_clients').insert({
        name: newClient.contact_name || newClient.legal_name,
        legal_name: newClient.legal_name,
        tax_id: newClient.tax_id || null,
        country: newClient.country,
        city: newClient.city || null,
        email: newClient.email || null,
        phone: newClient.phone || null,
        address: newClient.address || null,
        category: newClient.category || null,
        active: true,
        payment_terms: 'contado',
        credit_limit: 0,
      }).select('id').single()
      if (error) throw error

      // If a contact name was provided, also create a contact record
      if (newClient.contact_name.trim() && clientData) {
        await supabase.from('tt_client_contacts').insert({
          client_id: clientData.id,
          name: newClient.contact_name,
          position: newClient.contact_position || null,
          email: newClient.contact_email || newClient.email || null,
          phone: newClient.contact_phone || newClient.phone || null,
          is_primary: true,
        })
      }

      addToast({ type: 'success', title: 'Empresa creada', message: newClient.legal_name })
      setShowNew(false)
      setNewClient({ legal_name: '', tax_id: '', category: '', country: 'ES', city: '', email: '', phone: '', address: '', contact_name: '', contact_position: '', contact_email: '', contact_phone: '' })
      loadClients()
    } catch {
      addToast({ type: 'error', title: 'Error al crear empresa' })
    }
    setSavingNew(false)
  }

  if (selectedCompany) {
    return (
      <CompanyDetail
        company={selectedCompany}
        onClose={() => setSelectedCompany(null)}
        onUpdate={() => { setSelectedCompany(null); loadClients() }}
      />
    )
  }

  return (
    <div className="space-y-4">
      {/* KPIs */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <KPICard label="Empresas" value={companies.length} icon={<Building2 size={22} />} />
        <KPICard label="Total registros" value={allClients.length} icon={<Users size={22} />} />
        <KPICard label="Paises" value={countries.length} icon={<Globe size={22} />} />
        <KPICard label="Con contactos" value={companies.filter(c => c.contactCount > 0).length} icon={<Contact size={22} />} />
      </div>

      {/* Actions */}
      <div className="flex justify-end gap-2">
        <ExportButton
          data={companies as unknown as Record<string, unknown>[]}
          filename="clientes_torquetools"
          targetTable="tt_clients"
          columns={[
            { key: 'legal_name', label: 'Razon Social' },
            { key: 'tax_id', label: 'CUIT/CIF' },
            { key: 'email', label: 'Email' },
            { key: 'phone', label: 'Telefono' },
            { key: 'country', label: 'Pais' },
            { key: 'city', label: 'Ciudad' },
            { key: 'category', label: 'Categoria' },
            { key: 'payment_terms', label: 'Condiciones Pago' },
            { key: 'contactCount', label: 'Contactos' },
          ]}
        />
        <ImportButton
          targetTable="tt_clients"
          fields={[
            { key: 'legal_name', label: 'Razon social', required: true },
            { key: 'name', label: 'Contacto' },
            { key: 'stelorder_id', label: 'Referencia StelOrder' },
            { key: 'tax_id', label: 'CIF/CUIT' },
            { key: 'email', label: 'Email' },
            { key: 'phone', label: 'Telefono' },
            { key: 'address', label: 'Direccion' },
            { key: 'city', label: 'Ciudad' },
            { key: 'state', label: 'Provincia' },
            { key: 'postal_code', label: 'Codigo postal' },
            { key: 'country', label: 'Pais' },
            { key: 'category', label: 'Categoria' },
            { key: 'payment_terms', label: 'Condiciones pago' },
            { key: 'notes', label: 'Observaciones' },
            { key: 'whatsapp', label: 'Web/WhatsApp' },
            { key: 'credit_limit', label: 'Descuento/Limite', type: 'number' },
            { key: 'active', label: 'Activa', type: 'boolean' },
          ]}
          permission="edit_clients"
        />
        <Button variant="primary" onClick={() => setShowNew(true)}><Plus size={16} /> Nueva Empresa</Button>
      </div>

      {/* Search & Filters */}
      <div className="flex flex-col sm:flex-row gap-3">
        <SearchBar placeholder="Buscar empresa, contacto, CUIT/CIF, email..." value={search} onChange={(val) => { setSearch(val); setDisplayCount(60) }} className="flex-1 max-w-lg" />
        <div className="flex gap-2 flex-wrap">
          <button onClick={() => { setFilterCountry(''); setDisplayCount(60) }} className={`px-3 py-2 rounded-lg text-xs font-medium transition-all ${!filterCountry ? 'bg-[#FF6600] text-white' : 'bg-[#1E2330] text-[#9CA3AF] hover:bg-[#2A3040]'}`}>Todos</button>
          {countries.slice(0, 8).map((country) => (
            <button key={country} onClick={() => { setFilterCountry(filterCountry === country ? '' : country); setDisplayCount(60) }} className={`px-3 py-2 rounded-lg text-xs font-medium transition-all ${filterCountry === country ? 'bg-[#FF6600] text-white' : 'bg-[#1E2330] text-[#9CA3AF] hover:bg-[#2A3040]'}`}>
              {countryFlags[country] || ''} {country}
            </button>
          ))}
        </div>
      </div>

      {/* Company List */}
      {loading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="rounded-xl bg-[#141820] border border-[#1E2330] p-5 animate-pulse">
              <div className="h-5 bg-[#1E2330] rounded w-40 mb-3" />
              <div className="h-3 bg-[#1E2330] rounded w-full mb-2" />
              <div className="h-3 bg-[#1E2330] rounded w-2/3" />
            </div>
          ))}
        </div>
      ) : companies.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 text-[#4B5563]">
          <Building2 size={48} className="mb-4" />
          <p className="text-lg font-medium">No se encontraron empresas</p>
          <p className="text-sm mt-1">Proba con otros filtros o terminos de busqueda</p>
        </div>
      ) : (
        <>
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
            {visibleCompanies.map((company) => (
              <Card key={company.id} hover onClick={() => setSelectedCompany(company)}>
                <div className="flex items-start justify-between mb-3">
                  <div className="flex items-center gap-3 min-w-0 flex-1">
                    <div className="w-11 h-11 rounded-xl bg-[#FF6600]/15 flex items-center justify-center text-sm font-bold text-[#FF6600] shrink-0">
                      {getInitials(company.legal_name)}
                    </div>
                    <div className="min-w-0">
                      <h3 className="text-sm font-bold text-[#F0F2F5] truncate">{company.legal_name}</h3>
                      {company.tax_id && <p className="text-xs font-mono text-[#6B7280] truncate">{company.tax_id}</p>}
                    </div>
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    <button onClick={(e) => { e.stopPropagation(); const rec = company.records[0] as unknown as Record<string, unknown>; toggleFavorite(company.id, !rec?.is_favorite) }} className="p-1 hover:scale-110 transition-transform" title="Favorito">
                      <Star size={16} className={(company.records[0] as unknown as Record<string, unknown>)?.is_favorite ? 'text-yellow-400 fill-yellow-400' : 'text-[#4B5563]'} />
                    </button>
                    <span className="text-lg">{countryFlags[company.country] || company.country}</span>
                    <ChevronRight size={14} className="text-[#4B5563]" />
                  </div>
                </div>

                {/* Primary contact */}
                {company.inlineContacts.length > 0 && (
                  <div className="mb-3 p-2 rounded-lg bg-[#0F1218] border border-[#1E2330]">
                    <div className="flex items-center gap-2">
                      <div className="w-6 h-6 rounded-full bg-[#1E2330] flex items-center justify-center text-[10px] font-bold text-[#FF6600]">
                        {getInitials(company.inlineContacts[0].name)}
                      </div>
                      <div className="min-w-0">
                        <p className="text-xs font-medium text-[#F0F2F5] truncate">{company.inlineContacts[0].name}</p>
                        {company.inlineContacts[0].email && <p className="text-[10px] text-[#6B7280] truncate">{company.inlineContacts[0].email}</p>}
                      </div>
                    </div>
                  </div>
                )}

                <div className="space-y-1.5">
                  {company.city && <div className="flex items-center gap-2 text-xs text-[#9CA3AF]"><MapPin size={12} /> {company.city}</div>}
                  {company.email && <div className="flex items-center gap-2 text-xs text-[#9CA3AF]"><Mail size={12} /> <span className="truncate">{company.email}</span></div>}
                  {company.phone && <div className="flex items-center gap-2 text-xs text-[#9CA3AF]"><Phone size={12} /> {company.phone}</div>}
                </div>

                <div className="flex items-center justify-between mt-3 pt-3 border-t border-[#1E2330]">
                  <div className="flex gap-1.5 flex-wrap">
                    {company.category && <Badge variant="default" size="sm">{company.category}</Badge>}
                    {company.payment_terms && <Badge variant="info" size="sm">{company.payment_terms}</Badge>}
                  </div>
                  <div className="flex items-center gap-1.5">
                    {company.contactCount > 0 && (
                      <Badge variant="orange" size="sm">
                        <Users size={10} className="mr-0.5" />{company.contactCount}
                      </Badge>
                    )}
                    {company.records.length > 1 && (
                      <span title={`${company.records.length} registros duplicados`}>
                        <Badge variant="warning" size="sm">
                          {company.records.length}x
                        </Badge>
                      </span>
                    )}
                  </div>
                </div>
              </Card>
            ))}
          </div>

          {/* Load more */}
          {visibleCompanies.length < companies.length && (
            <div className="flex justify-center pt-4">
              <Button variant="secondary" onClick={() => setDisplayCount(prev => prev + 60)}>
                Cargar mas ({visibleCompanies.length} de {companies.length})
              </Button>
            </div>
          )}
        </>
      )}

      {/* New Company Modal */}
      <Modal isOpen={showNew} onClose={() => setShowNew(false)} title="Nueva Empresa" size="lg">
        <div className="space-y-4">
          <h4 className="text-xs font-semibold text-[#6B7280] uppercase">Datos de la empresa</h4>
          <Input label="Nombre de empresa / Razon social *" value={newClient.legal_name} onChange={(e) => setNewClient({ ...newClient, legal_name: e.target.value })} />
          <div className="grid grid-cols-2 gap-4">
            <Input label="CUIT / CIF" value={newClient.tax_id} onChange={(e) => setNewClient({ ...newClient, tax_id: e.target.value })} />
            <Select label="Categoria" value={newClient.category} onChange={(e) => setNewClient({ ...newClient, category: e.target.value })} options={[{ value: '', label: 'Seleccionar...' }, { value: 'empresa', label: 'Empresa' }, { value: 'autonomo', label: 'Autonomo' }, { value: 'particular', label: 'Particular' }, { value: 'distribuidor', label: 'Distribuidor' }]} />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <Select label="Pais" value={newClient.country} onChange={(e) => setNewClient({ ...newClient, country: e.target.value })} options={Object.entries(countryNames).map(([k, v]) => ({ value: k, label: v }))} />
            <Input label="Ciudad" value={newClient.city} onChange={(e) => setNewClient({ ...newClient, city: e.target.value })} />
          </div>
          <Input label="Direccion" value={newClient.address} onChange={(e) => setNewClient({ ...newClient, address: e.target.value })} />
          <div className="grid grid-cols-2 gap-4">
            <Input label="Email empresa" type="email" value={newClient.email} onChange={(e) => setNewClient({ ...newClient, email: e.target.value })} />
            <Input label="Telefono empresa" value={newClient.phone} onChange={(e) => setNewClient({ ...newClient, phone: e.target.value })} />
          </div>

          <div className="border-t border-[#1E2330] pt-4 mt-4">
            <h4 className="text-xs font-semibold text-[#6B7280] uppercase mb-3">Contacto principal (opcional)</h4>
            <div className="grid grid-cols-2 gap-4">
              <Input label="Nombre del contacto" value={newClient.contact_name} onChange={(e) => setNewClient({ ...newClient, contact_name: e.target.value })} />
              <Input label="Cargo / Posicion" value={newClient.contact_position} onChange={(e) => setNewClient({ ...newClient, contact_position: e.target.value })} />
            </div>
            <div className="grid grid-cols-2 gap-4 mt-4">
              <Input label="Email contacto" type="email" value={newClient.contact_email} onChange={(e) => setNewClient({ ...newClient, contact_email: e.target.value })} />
              <Input label="Telefono contacto" value={newClient.contact_phone} onChange={(e) => setNewClient({ ...newClient, contact_phone: e.target.value })} />
            </div>
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <Button variant="secondary" onClick={() => setShowNew(false)}>Cancelar</Button>
            <Button variant="primary" onClick={createNewClient} loading={savingNew}><Save size={14} /> Crear Empresa</Button>
          </div>
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
  const [leads, setLeads] = useState<Client[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')

  const load = useCallback(async () => {
    setLoading(true)
    let q = supabase.from('tt_clients').select('*').or('category.eq.potential,category.eq.lead,source.eq.lead').eq('active', true).order('created_at', { ascending: false })
    if (search) q = q.or(`name.ilike.%${search}%,legal_name.ilike.%${search}%`)
    const { data } = await q
    setLeads((data || []) as Client[])
    setLoading(false)
  }, [supabase, search])

  useEffect(() => { load() }, [load])

  const convertToClient = async (lead: Client) => {
    await supabase.from('tt_clients').update({ category: 'cliente' }).eq('id', lead.id)
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
            <TableHeader><TableRow><TableHead>Empresa</TableHead><TableHead>Contacto</TableHead><TableHead>Email</TableHead><TableHead>Pais</TableHead><TableHead>Acciones</TableHead></TableRow></TableHeader>
            <TableBody>
              {leads.map((l) => (
                <TableRow key={l.id}>
                  <TableCell className="font-bold text-[#F0F2F5]">{l.legal_name || l.name || '-'}</TableCell>
                  <TableCell className="text-sm text-[#9CA3AF]">{l.name !== l.legal_name ? l.name : '-'}</TableCell>
                  <TableCell className="text-sm text-[#9CA3AF]">{l.email || '-'}</TableCell>
                  <TableCell>{countryFlags[l.country] || l.country || '-'}</TableCell>
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
// CONTACTOS TAB (Cross-client contact search)
// ═══════════════════════════════════════════════════════

function ContactosTab() {
  const supabase = createClient()
  const [contacts, setContacts] = useState<(Client & { _companyName?: string })[]>([])
  const [dbContacts, setDbContacts] = useState<(ClientContact & { _companyName?: string })[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')

  const load = useCallback(async () => {
    setLoading(true)
    // Load contacts from tt_client_contacts table
    const { data: ccData } = await supabase
      .from('tt_client_contacts')
      .select('*, client:tt_clients!client_id(id, legal_name)')
      .order('name')
      .limit(500)

    // Also load from tt_clients (where name differs from legal_name = person contacts)
    let q = supabase.from('tt_clients').select('id, name, legal_name, email, phone, city, country, category').eq('active', true).order('name')
    if (search) q = q.or(`name.ilike.%${search}%,email.ilike.%${search}%,phone.ilike.%${search}%`)
    const { data: clientData } = await q

    // Filter clientData to only contacts (where name != legal_name)
    const personContacts = (clientData || []).filter(c => {
      const name = (c.name || '').trim().toUpperCase()
      const legal = (c.legal_name || '').trim().toUpperCase()
      return name && name !== legal
    }) as (Client & { _companyName?: string })[]

    // Add company name to person contacts
    for (const pc of personContacts) {
      pc._companyName = pc.legal_name || ''
    }

    setContacts(personContacts)

    // Process DB contacts
    const processedDb = (ccData || []).map((cc: Record<string, unknown>) => {
      const client = cc.client as Record<string, unknown> | null
      return {
        ...(cc as unknown as ClientContact),
        _companyName: (client?.legal_name as string) || '',
      }
    })

    // Filter DB contacts by search
    if (search) {
      const s = search.toLowerCase()
      setDbContacts(processedDb.filter((c: { name: string; email?: string | null; phone?: string | null }) =>
        c.name.toLowerCase().includes(s) ||
        (c.email && c.email.toLowerCase().includes(s)) ||
        (c.phone && c.phone.toLowerCase().includes(s))
      ))
    } else {
      setDbContacts(processedDb)
    }

    setLoading(false)
  }, [supabase, search])

  useEffect(() => { load() }, [load])

  // Merge both sources, dedupe by name
  const allContacts = useMemo(() => {
    const merged: { name: string; company: string; email: string | null; phone: string | null; source: string }[] = []
    const seen = new Set<string>()

    for (const c of dbContacts) {
      const key = c.name.toUpperCase()
      if (!seen.has(key)) {
        seen.add(key)
        merged.push({ name: c.name, company: c._companyName || '', email: c.email, phone: c.phone, source: 'DB' })
      }
    }

    for (const c of contacts) {
      const key = (c.name || '').toUpperCase()
      if (key && !seen.has(key)) {
        seen.add(key)
        merged.push({ name: c.name, company: c._companyName || '', email: c.email, phone: c.phone, source: 'StelOrder' })
      }
    }

    return merged
  }, [contacts, dbContacts])

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <KPICard label="Total contactos" value={allContacts.length} icon={<Contact size={22} />} />
      </div>
      <Card><SearchBar placeholder="Buscar contacto por nombre, email o telefono..." value={search} onChange={setSearch} className="flex-1" /></Card>
      <Card className="p-0 overflow-hidden">
        {loading ? (
          <div className="flex items-center justify-center py-20"><Loader2 className="animate-spin text-[#FF6600]" size={32} /></div>
        ) : allContacts.length === 0 ? (
          <div className="text-center py-20 text-[#6B7280]"><Contact size={48} className="mx-auto mb-3 opacity-30" /><p>No hay contactos</p></div>
        ) : (
          <Table>
            <TableHeader><TableRow><TableHead>Contacto</TableHead><TableHead>Empresa</TableHead><TableHead>Email</TableHead><TableHead>Telefono</TableHead><TableHead>Origen</TableHead></TableRow></TableHeader>
            <TableBody>
              {allContacts.slice(0, 100).map((c, i) => (
                <TableRow key={`${c.name}-${i}`}>
                  <TableCell>
                    <div className="flex items-center gap-2">
                      <div className="w-8 h-8 rounded-full bg-[#1E2330] flex items-center justify-center text-xs font-bold text-[#FF6600]">{getInitials(c.name)}</div>
                      <span className="font-medium text-[#F0F2F5]">{c.name}</span>
                    </div>
                  </TableCell>
                  <TableCell className="text-sm font-semibold text-[#9CA3AF]">{c.company || '-'}</TableCell>
                  <TableCell className="text-sm text-[#9CA3AF]">{c.email || '-'}</TableCell>
                  <TableCell className="text-sm text-[#9CA3AF]">{c.phone || '-'}</TableCell>
                  <TableCell><Badge variant={c.source === 'DB' ? 'success' : 'default'} size="sm">{c.source}</Badge></TableCell>
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
// FAVORITOS TAB
// ═══════════════════════════════════════════════════════

function FavoritosTab() {
  const [favorites, setFavorites] = useState<GroupedCompany[]>([])
  const [loading, setLoading] = useState(true)
  const [selectedCompany, setSelectedCompany] = useState<GroupedCompany | null>(null)

  useEffect(() => { loadFavorites() }, [])

  async function loadFavorites() {
    const supabase = createClient()
    setLoading(true)
    const { data } = await supabase.from('tt_clients').select('*').eq('active', true).eq('is_favorite', true).order('legal_name')
    const grouped = groupClientsByCompany((data || []) as Client[])
    setFavorites(grouped)
    setLoading(false)
  }

  async function removeFavorite(companyId: string) {
    const supabase = createClient()
    await supabase.from('tt_clients').update({ is_favorite: false }).eq('id', companyId)
    loadFavorites()
  }

  if (selectedCompany) {
    return <CompanyDetail company={selectedCompany} onClose={() => { setSelectedCompany(null); loadFavorites() }} onUpdate={loadFavorites} />
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <Star className="text-yellow-400" size={20} fill="currentColor" />
        <h3 className="text-lg font-semibold text-[#F0F2F5]">Clientes favoritos</h3>
        <Badge>{favorites.length}</Badge>
      </div>
      {loading ? (
        <div className="flex justify-center py-10"><Loader2 className="animate-spin text-[#FF6600]" size={32} /></div>
      ) : favorites.length === 0 ? (
        <Card className="p-10 text-center">
          <StarOff className="mx-auto mb-3 text-[#4B5563]" size={40} />
          <p className="text-[#6B7280]">No tenés clientes favoritos todavía</p>
          <p className="text-sm text-[#4B5563] mt-1">Marcá clientes con la ⭐ para verlos acá</p>
        </Card>
      ) : (
        <div className="grid gap-3">
          {favorites.map(c => (
            <Card key={c.id} className="p-4 hover:border-[#FF6600]/30 cursor-pointer transition-all" onClick={() => setSelectedCompany(c)}>
              <div className="flex items-center gap-4">
                <div className="w-12 h-12 rounded-xl bg-yellow-500/10 flex items-center justify-center text-yellow-400 font-bold text-lg flex-shrink-0">
                  {getInitials(c.legal_name || c.name)}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="font-bold text-[#F0F2F5] truncate">{c.legal_name || c.name}</div>
                  <div className="text-sm text-[#6B7280]">{c.email || ''} · {c.country || ''}</div>
                </div>
                <button onClick={(e) => { e.stopPropagation(); removeFavorite(c.id) }} className="p-2 text-yellow-400 hover:text-yellow-300" title="Quitar de favoritos">
                  <Star size={18} fill="currentColor" />
                </button>
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  )
}

// ═══════════════════════════════════════════════════════
// RANKING TAB
// ═══════════════════════════════════════════════════════

function RankingTab() {
  const [clients, setClients] = useState<(Client & { rank: number })[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => { loadRanking() }, [])

  async function loadRanking() {
    const supabase = createClient()
    setLoading(true)
    const { data } = await supabase.from('tt_clients').select('*').eq('active', true).order('total_revenue', { ascending: false, nullsFirst: false }).limit(50)
    const ranked = (data || []).map((c: Record<string, unknown>, i: number) => ({ ...c, rank: i + 1 })) as (Client & { rank: number })[]
    setClients(ranked)
    setLoading(false)
  }

  function tierBadge(rank: number) {
    if (rank <= 3) return <span className="text-2xl">🥇</span>
    if (rank <= 10) return <span className="text-xl">🥈</span>
    if (rank <= 25) return <span className="text-lg">🥉</span>
    return <span className="text-[#4B5563] font-mono text-sm">#{rank}</span>
  }

  function tierColor(rank: number) {
    if (rank <= 3) return 'border-yellow-500/30 bg-yellow-500/5'
    if (rank <= 10) return 'border-gray-400/20 bg-gray-400/5'
    if (rank <= 25) return 'border-orange-700/20 bg-orange-700/5'
    return ''
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <Trophy className="text-yellow-400" size={20} />
        <h3 className="text-lg font-semibold text-[#F0F2F5]">Top clientes por facturación</h3>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
        <KPICard label="Top 3 facturación" value={formatCurrency(clients.slice(0, 3).reduce((s, c) => s + (c.total_revenue || 0), 0), 'EUR')} icon={<Trophy size={20} />} color="#FFD700" />
        <KPICard label="Top 10 facturación" value={formatCurrency(clients.slice(0, 10).reduce((s, c) => s + (c.total_revenue || 0), 0), 'EUR')} icon={<Trophy size={20} />} color="#C0C0C0" />
        <KPICard label="Total ranking (50)" value={formatCurrency(clients.reduce((s, c) => s + (c.total_revenue || 0), 0), 'EUR')} icon={<Trophy size={20} />} color="#CD7F32" />
      </div>

      {loading ? (
        <div className="flex justify-center py-10"><Loader2 className="animate-spin text-[#FF6600]" size={32} /></div>
      ) : clients.length === 0 ? (
        <Card className="p-10 text-center">
          <Trophy className="mx-auto mb-3 text-[#4B5563]" size={40} />
          <p className="text-[#6B7280]">No hay datos de facturación para generar ranking</p>
          <p className="text-sm text-[#4B5563] mt-1">El ranking se genera automáticamente a partir de las facturas</p>
        </Card>
      ) : (
        <Card>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-16">#</TableHead>
                <TableHead>Cliente</TableHead>
                <TableHead>País</TableHead>
                <TableHead className="text-right">Facturación total</TableHead>
                <TableHead className="text-right">Pedidos</TableHead>
                <TableHead>Última compra</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {clients.map(c => (
                <TableRow key={c.id} className={`${tierColor(c.rank)} transition-all`}>
                  <TableCell className="text-center">{tierBadge(c.rank)}</TableCell>
                  <TableCell>
                    <div className="font-semibold text-[#F0F2F5]">{c.legal_name || c.name}</div>
                    <div className="text-xs text-[#6B7280]">{c.tax_id || ''}</div>
                  </TableCell>
                  <TableCell>{c.country || '-'}</TableCell>
                  <TableCell className="text-right font-bold text-[#FF6600]">{formatCurrency(c.total_revenue || 0, 'EUR')}</TableCell>
                  <TableCell className="text-right">{c.total_orders || 0}</TableCell>
                  <TableCell className="text-[#6B7280]">{c.last_order_date ? formatDate(c.last_order_date) : '-'}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
          <ExportButton
            data={clients.map(c => ({ rank: c.rank, cliente: c.legal_name || c.name, cuit: c.tax_id, pais: c.country, facturacion: c.total_revenue, pedidos: c.total_orders, ultima_compra: c.last_order_date }))}
            filename="ranking_clientes"
            columns={[
              { key: 'rank', label: 'Ranking' },
              { key: 'cliente', label: 'Cliente' },
              { key: 'cuit', label: 'CUIT/CIF' },
              { key: 'pais', label: 'País' },
              { key: 'facturacion', label: 'Facturación EUR' },
              { key: 'pedidos', label: 'Pedidos' },
              { key: 'ultima_compra', label: 'Última compra' },
            ]}
            className="p-3"
          />
        </Card>
      )}
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
        <p className="text-sm text-[#6B7280] mt-1">Gestion de empresas, contactos y potenciales</p>
      </div>
      <Suspense fallback={<div className="flex justify-center py-10"><Loader2 className="animate-spin text-[#FF6600]" size={32} /></div>}>
        <Tabs tabs={clientesTabs} defaultTab="clientes">
          {(activeTab) => (
            <>
              {activeTab === 'clientes' && <ClientesTab />}
              {activeTab === 'favoritos' && <FavoritosTab />}
              {activeTab === 'ranking' && <RankingTab />}
              {activeTab === 'potenciales' && <PotencialesTab />}
              {activeTab === 'contactos' && <ContactosTab />}
            </>
          )}
        </Tabs>
      </Suspense>
    </div>
  )
}
