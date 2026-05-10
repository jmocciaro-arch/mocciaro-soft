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
import { DataTable, type DataTableColumn } from '@/components/ui/data-table'
import {
  Users, Plus, Phone, Mail, MessageSquare, MapPin,
  Building2, FileText, Edit3, Save, X, Loader2, UserPlus, Contact,
  CreditCard, Truck, Clock, ChevronRight, Trash2, Star,
  Globe, Hash, ArrowLeft, Search, Grid3X3, List
} from 'lucide-react'
import { DocLink } from '@/components/ui/doc-link'
import { useCompanyFilter } from '@/hooks/use-company-filter'
import { ClientMerge } from '@/components/clients/client-merge'
import { RelatedCompanies } from '@/components/clients/related-companies'
import { SyncContactsButton } from '@/components/clients/sync-contacts-button'
import { ContactCard } from '@/components/clients/contact-card'
import { ClientDetailModal } from '@/components/clientes/client-detail-modal'
import { ClientProductsHistory } from '@/components/clientes/client-products-history'
import { ProductDetailModal } from '@/components/catalogo/product-detail-modal'
import { BulkImportClientsModal } from '@/components/clientes/bulk-import-modal'
import { BulkActionsBar, BulkCheckbox, COMMON_BULK_ACTIONS } from '@/components/ui/bulk-actions-bar'
import { SavedViews } from '@/components/ui/saved-views'

// ═══════════════════════════════════════════════════════
// CONSTANTS
// ═══════════════════════════════════════════════════════

const PAGE_SIZE = 200
const countryFlags: Record<string, string> = { ES: '\u{1F1EA}\u{1F1F8}', AR: '\u{1F1E6}\u{1F1F7}', US: '\u{1F1FA}\u{1F1F8}', CL: '\u{1F1E8}\u{1F1F1}', UY: '\u{1F1FA}\u{1F1FE}', BR: '\u{1F1E7}\u{1F1F7}', MX: '\u{1F1F2}\u{1F1FD}', CO: '\u{1F1E8}\u{1F1F4}', DE: '\u{1F1E9}\u{1F1EA}', FR: '\u{1F1EB}\u{1F1F7}', IT: '\u{1F1EE}\u{1F1F9}', GB: '\u{1F1EC}\u{1F1E7}', EC: '\u{1F1EA}\u{1F1E8}', PE: '\u{1F1F5}\u{1F1EA}', PY: '\u{1F1F5}\u{1F1FE}', BO: '\u{1F1E7}\u{1F1F4}', VE: '\u{1F1FB}\u{1F1EA}', CR: '\u{1F1E8}\u{1F1F7}', PA: '\u{1F1F5}\u{1F1E6}', DO: '\u{1F1E9}\u{1F1F4}', GT: '\u{1F1EC}\u{1F1F9}', HN: '\u{1F1ED}\u{1F1F3}', SV: '\u{1F1F8}\u{1F1FB}', NI: '\u{1F1F3}\u{1F1EE}', PT: '\u{1F1F5}\u{1F1F9}' }
const countryNames: Record<string, string> = { ES: 'Espana', AR: 'Argentina', US: 'Estados Unidos', CL: 'Chile', UY: 'Uruguay', BR: 'Brasil', MX: 'Mexico', CO: 'Colombia', DE: 'Alemania', EC: 'Ecuador', PE: 'Peru', PY: 'Paraguay', FR: 'Francia', IT: 'Italia', GB: 'Reino Unido', PT: 'Portugal' }

import { Trophy, StarOff, GitMerge } from 'lucide-react'

const clientesTabs = [
  { id: 'clientes', label: 'Clientes', icon: <Building2 size={16} /> },
  { id: 'favoritos', label: 'Favoritos', icon: <Star size={16} /> },
  { id: 'ranking', label: 'Ranking', icon: <Trophy size={16} /> },
  { id: 'potenciales', label: 'Potenciales', icon: <UserPlus size={16} /> },
  { id: 'contactos', label: 'Contactos', icon: <Contact size={16} /> },
  { id: 'duplicados', label: 'Duplicados', icon: <GitMerge size={16} /> },
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
    const pick = <K extends keyof Client>(k: K) => records.find(r => r[k] !== null && r[k] !== undefined && r[k] !== '')?.[k]

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
      // ── condiciones comerciales ──
      currency: (pick('currency') as string | null) ?? null,
      sale_condition: (pick('sale_condition') as string | null) ?? null,
      payment_method: (pick('payment_method') as string | null) ?? null,
      payment_terms_days: (pick('payment_terms_days') as number | null) ?? null,
      bank_account: (pick('bank_account') as string | null) ?? null,
      delivery_address: (pick('delivery_address') as string | null) ?? null,
      delivery_city: (pick('delivery_city') as string | null) ?? null,
      delivery_state: (pick('delivery_state') as string | null) ?? null,
      delivery_postal_code: (pick('delivery_postal_code') as string | null) ?? null,
      delivery_country: (pick('delivery_country') as string | null) ?? null,
      delivery_contact: (pick('delivery_contact') as string | null) ?? null,
      delivery_phone: (pick('delivery_phone') as string | null) ?? null,
      incoterm: (pick('incoterm') as string | null) ?? null,
      delivery_method: (pick('delivery_method') as string | null) ?? null,
      delivery_terms: (pick('delivery_terms') as string | null) ?? null,
      delivery_notes: (pick('delivery_notes') as string | null) ?? null,
      fiscal_condition: (pick('fiscal_condition') as string | null) ?? null,
      tax_id_type: (pick('tax_id_type') as string | null) ?? null,
      subject_iva: primary.subject_iva,
      iva_rate: primary.iva_rate,
      subject_irpf: primary.subject_irpf,
      irpf_rate: primary.irpf_rate,
      subject_re: primary.subject_re,
      re_rate: primary.re_rate,
      subject_iibb: primary.subject_iibb,
      iibb_rate: primary.iibb_rate,
      iibb_jurisdiction: (pick('iibb_jurisdiction') as string | null) ?? null,
      subject_ganancias: primary.subject_ganancias,
      ganancias_rate: primary.ganancias_rate,
      commercial_notes: (pick('commercial_notes') as string | null) ?? null,
      preferred_language: (pick('preferred_language') as string | null) ?? null,
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
  // Sprint 2B — modal de ficha producto al click en un producto del tab Productos
  const [openProductId, setOpenProductId] = useState<string | null>(null)

  // Get all client_ids for this company (for querying related data)
  const allClientIds = useMemo(() => company.records.map(r => r.id), [company])

  // Load contacts from tt_client_contacts
  const loadContacts = useCallback(async () => {
    setLoadingContacts(true)
    try {
      const sb = createClient()
      const { data } = await sb
        .from('tt_client_contacts')
        .select('*')
        .in('client_id', allClientIds)
        .order('is_primary', { ascending: false })
      setContacts((data || []) as ClientContact[])
    } catch { /* ignore */ }
    setLoadingContacts(false)
  }, [allClientIds])

  // Load activity log
  const loadActivity = useCallback(async () => {
    const sb = createClient()
    const { data } = await sb
      .from('tt_activity_log')
      .select('*')
      .eq('entity_type', 'client')
      .in('entity_id', allClientIds)
      .order('created_at', { ascending: false })
      .limit(20)
    setActivity((data || []) as ActivityLog[])
  }, [allClientIds])

  // Load documents (quotes, orders, invoices) from tt_documents
  const loadDocuments = useCallback(async () => {
    const sb = createClient()
    const { data } = await sb
      .from('tt_documents')
      .select('id, doc_type, system_code, display_ref, status, total, currency, created_at')
      .in('client_id', allClientIds)
      .order('created_at', { ascending: false })
      .limit(30)
    setDocuments((data || []) as Record<string, unknown>[])
  }, [allClientIds])

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
      tax_id_type: company.tax_id_type,
      email: company.email,
      phone: company.phone,
      address: company.address,
      city: company.city,
      state: company.state,
      postal_code: company.postal_code,
      country: company.country,
      category: company.category,
      // pago
      payment_terms: company.payment_terms,
      payment_terms_days: company.payment_terms_days ?? 0,
      payment_method: company.payment_method,
      sale_condition: company.sale_condition,
      bank_account: company.bank_account,
      credit_limit: company.credit_limit,
      currency: company.currency || 'EUR',
      // entrega
      delivery_address: company.delivery_address,
      delivery_city: company.delivery_city,
      delivery_state: company.delivery_state,
      delivery_postal_code: company.delivery_postal_code,
      delivery_country: company.delivery_country,
      delivery_contact: company.delivery_contact,
      delivery_phone: company.delivery_phone,
      incoterm: company.incoterm,
      delivery_method: company.delivery_method,
      delivery_terms: company.delivery_terms,
      delivery_notes: company.delivery_notes,
      // fiscal
      fiscal_condition: company.fiscal_condition,
      subject_iva: company.subject_iva ?? true,
      iva_rate: company.iva_rate ?? 21,
      subject_irpf: company.subject_irpf ?? false,
      irpf_rate: company.irpf_rate ?? 15,
      subject_re: company.subject_re ?? false,
      re_rate: company.re_rate ?? 5.2,
      subject_iibb: company.subject_iibb ?? false,
      iibb_rate: company.iibb_rate ?? 0,
      iibb_jurisdiction: company.iibb_jurisdiction,
      subject_ganancias: company.subject_ganancias ?? false,
      ganancias_rate: company.ganancias_rate ?? 0,
      // otros
      commercial_notes: company.commercial_notes,
      preferred_language: company.preferred_language || 'es',
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
          tax_id_type: editData.tax_id_type,
          email: editData.email,
          phone: editData.phone,
          address: editData.address,
          city: editData.city,
          state: editData.state,
          postal_code: editData.postal_code,
          country: editData.country,
          category: editData.category,
          payment_terms: editData.payment_terms,
          payment_terms_days: editData.payment_terms_days,
          payment_method: editData.payment_method,
          sale_condition: editData.sale_condition,
          bank_account: editData.bank_account,
          credit_limit: editData.credit_limit,
          currency: editData.currency,
          delivery_address: editData.delivery_address,
          delivery_city: editData.delivery_city,
          delivery_state: editData.delivery_state,
          delivery_postal_code: editData.delivery_postal_code,
          delivery_country: editData.delivery_country,
          delivery_contact: editData.delivery_contact,
          delivery_phone: editData.delivery_phone,
          incoterm: editData.incoterm,
          delivery_method: editData.delivery_method,
          delivery_terms: editData.delivery_terms,
          delivery_notes: editData.delivery_notes,
          fiscal_condition: editData.fiscal_condition,
          subject_iva: editData.subject_iva,
          iva_rate: editData.iva_rate,
          subject_irpf: editData.subject_irpf,
          irpf_rate: editData.irpf_rate,
          subject_re: editData.subject_re,
          re_rate: editData.re_rate,
          subject_iibb: editData.subject_iibb,
          iibb_rate: editData.iibb_rate,
          iibb_jurisdiction: editData.iibb_jurisdiction,
          subject_ganancias: editData.subject_ganancias,
          ganancias_rate: editData.ganancias_rate,
          commercial_notes: editData.commercial_notes,
          preferred_language: editData.preferred_language,
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

  // Load OC data for glosario
  const [clientOCs, setClientOCs] = useState<Record<string, unknown>[]>([])
  const loadOCs = useCallback(async () => {
    const sb = createClient()
    const { data } = await sb.from('tt_documents')
      .select('id, doc_type, display_ref, system_code, status, total, created_at, metadata')
      .in('client_id', allClientIds)
      .order('created_at', { ascending: false })
    const withOC = (data || []).filter((d: Record<string, unknown>) => {
      const meta = d.metadata as Record<string, unknown> | null
      return meta?.client_reference || (d.doc_type as string) === 'pedido'
    })
    setClientOCs(withOC)
  }, [allClientIds])

  useEffect(() => { loadOCs() }, [loadOCs])

  const detailTabs = [
    { id: 'datos', label: 'Datos' },
    { id: 'contactos', label: `Contactos (${allContacts.length})` },
    { id: 'relacionadas', label: 'Relacionadas' },
    { id: 'oc_glosario', label: `OC Recibidas (${clientOCs.length})` },
    { id: 'productos', label: 'Productos' },
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
              <div className="flex justify-between text-xs"><span className="text-[#6B7280]">Moneda</span><span className="text-[#F0F2F5]">{company.currency || 'EUR'}</span></div>
              <div className="flex justify-between text-xs"><span className="text-[#6B7280]">Venta</span><span className="text-[#F0F2F5] capitalize">{(company.sale_condition || '-').replace(/_/g, ' ')}</span></div>
              <div className="flex justify-between text-xs"><span className="text-[#6B7280]">Pago</span><span className="text-[#F0F2F5] capitalize">{(company.payment_method || '-').replace(/_/g, ' ')}</span></div>
              <div className="flex justify-between text-xs"><span className="text-[#6B7280]">Plazo</span><span className="text-[#F0F2F5]">{company.payment_terms_days != null ? `${company.payment_terms_days} dias` : (company.payment_terms || '-')}</span></div>
              <div className="flex justify-between text-xs"><span className="text-[#6B7280]">Limite credito</span><span className="text-[#F0F2F5]">{company.credit_limit ? formatCurrency(company.credit_limit, (company.currency || 'EUR') as 'EUR' | 'ARS' | 'USD') : '-'}</span></div>
              <div className="flex justify-between text-xs"><span className="text-[#6B7280]">Incoterm</span><span className="text-[#F0F2F5]">{company.incoterm || '-'}</span></div>
              <div className="flex justify-between text-xs"><span className="text-[#6B7280]">Fiscal</span><span className="text-[#F0F2F5] capitalize">{(company.fiscal_condition || '-').replace(/_/g, ' ')}</span></div>
              <div className="flex justify-between text-xs"><span className="text-[#6B7280]">Categoria</span><span className="text-[#F0F2F5] capitalize">{company.category || '-'}</span></div>
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
                      <Select label="Tipo de identificacion fiscal" value={editData.tax_id_type || ''} onChange={(e) => setEditData({ ...editData, tax_id_type: e.target.value })} options={[
                        { value: '', label: '— sin definir —' },
                        { value: 'CIF', label: 'CIF (ES — empresa)' },
                        { value: 'NIF', label: 'NIF (ES — persona)' },
                        { value: 'NIE', label: 'NIE (ES — extranjero)' },
                        { value: 'CUIT', label: 'CUIT (AR — empresa)' },
                        { value: 'CUIL', label: 'CUIL (AR — persona)' },
                        { value: 'RUT', label: 'RUT (CL/UY)' },
                        { value: 'EIN', label: 'EIN (US)' },
                        { value: 'otro', label: 'Otro' },
                      ]} />
                    </div>

                    {/* ── Comerciales: moneda / pago / venta ── */}
                    <div className="pt-4 border-t border-[#1E2330]">
                      <h4 className="text-xs font-semibold text-[#FF6600] uppercase mb-3">Condiciones comerciales</h4>
                      <div className="grid grid-cols-3 gap-4">
                        <Select label="Moneda" value={editData.currency || 'EUR'} onChange={(e) => setEditData({ ...editData, currency: e.target.value })} options={[
                          { value: 'EUR', label: 'EUR — Euro' },
                          { value: 'USD', label: 'USD — Dolar US' },
                          { value: 'ARS', label: 'ARS — Peso AR' },
                          { value: 'BRL', label: 'BRL — Real' },
                          { value: 'CLP', label: 'CLP — Peso CL' },
                          { value: 'UYU', label: 'UYU — Peso UY' },
                          { value: 'MXN', label: 'MXN — Peso MX' },
                          { value: 'GBP', label: 'GBP — Libra' },
                        ]} />
                        <Select label="Condicion de venta" value={editData.sale_condition || ''} onChange={(e) => setEditData({ ...editData, sale_condition: e.target.value })} options={[
                          { value: '', label: '— sin definir —' },
                          { value: 'contado', label: 'Contado' },
                          { value: 'cuenta_corriente', label: 'Cuenta corriente' },
                          { value: 'anticipo', label: 'Con anticipo' },
                          { value: 'contra_entrega', label: 'Contra entrega' },
                          { value: 'mixto', label: 'Mixto (anticipo + saldo)' },
                          { value: 'consignacion', label: 'Consignacion' },
                        ]} />
                        <Select label="Forma de pago" value={editData.payment_method || ''} onChange={(e) => setEditData({ ...editData, payment_method: e.target.value })} options={[
                          { value: '', label: '— sin definir —' },
                          { value: 'transferencia', label: 'Transferencia bancaria' },
                          { value: 'efectivo', label: 'Efectivo' },
                          { value: 'cheque', label: 'Cheque' },
                          { value: 'tarjeta', label: 'Tarjeta' },
                          { value: 'paypal', label: 'PayPal' },
                          { value: 'mercado_pago', label: 'Mercado Pago' },
                          { value: 'debito_automatico', label: 'Debito automatico' },
                          { value: 'pagare', label: 'Pagare' },
                        ]} />
                      </div>
                      <div className="grid grid-cols-3 gap-4 mt-4">
                        <Input label="Plazo de pago (dias)" type="number" value={String(editData.payment_terms_days ?? 0)} onChange={(e) => setEditData({ ...editData, payment_terms_days: Number(e.target.value) })} />
                        <Input label="Condicion de pago (descripcion)" value={editData.payment_terms || ''} onChange={(e) => setEditData({ ...editData, payment_terms: e.target.value })} />
                        <Input label="Limite de credito" type="number" value={String(editData.credit_limit || 0)} onChange={(e) => setEditData({ ...editData, credit_limit: Number(e.target.value) })} />
                      </div>
                      <Input label="Cuenta bancaria (IBAN / CBU)" value={editData.bank_account || ''} onChange={(e) => setEditData({ ...editData, bank_account: e.target.value })} />
                    </div>

                    {/* ── Entrega ── */}
                    <div className="pt-4 border-t border-[#1E2330]">
                      <h4 className="text-xs font-semibold text-[#FF6600] uppercase mb-3">Entrega</h4>
                      <Input label="Direccion de entrega (si difiere de la fiscal)" value={editData.delivery_address || ''} onChange={(e) => setEditData({ ...editData, delivery_address: e.target.value })} />
                      <div className="grid grid-cols-4 gap-4 mt-4">
                        <Input label="Ciudad" value={editData.delivery_city || ''} onChange={(e) => setEditData({ ...editData, delivery_city: e.target.value })} />
                        <Input label="Provincia" value={editData.delivery_state || ''} onChange={(e) => setEditData({ ...editData, delivery_state: e.target.value })} />
                        <Input label="C.P." value={editData.delivery_postal_code || ''} onChange={(e) => setEditData({ ...editData, delivery_postal_code: e.target.value })} />
                        <Select label="Pais" value={editData.delivery_country || ''} onChange={(e) => setEditData({ ...editData, delivery_country: e.target.value })} options={[{ value: '', label: 'Mismo que fiscal' }, ...Object.entries(countryNames).map(([k, v]) => ({ value: k, label: v }))]} />
                      </div>
                      <div className="grid grid-cols-2 gap-4 mt-4">
                        <Input label="Persona de contacto en entrega" value={editData.delivery_contact || ''} onChange={(e) => setEditData({ ...editData, delivery_contact: e.target.value })} />
                        <Input label="Telefono de entrega" value={editData.delivery_phone || ''} onChange={(e) => setEditData({ ...editData, delivery_phone: e.target.value })} />
                      </div>
                      <div className="grid grid-cols-3 gap-4 mt-4">
                        <Select label="Incoterm" value={editData.incoterm || ''} onChange={(e) => setEditData({ ...editData, incoterm: e.target.value })} options={[
                          { value: '', label: '— no aplica —' },
                          { value: 'EXW', label: 'EXW — Ex Works' },
                          { value: 'FCA', label: 'FCA — Free Carrier' },
                          { value: 'FOB', label: 'FOB — Free on Board' },
                          { value: 'CFR', label: 'CFR — Cost and Freight' },
                          { value: 'CIF', label: 'CIF — Cost, Insurance, Freight' },
                          { value: 'CPT', label: 'CPT — Carriage Paid To' },
                          { value: 'CIP', label: 'CIP — Carriage and Insurance Paid' },
                          { value: 'DAP', label: 'DAP — Delivered at Place' },
                          { value: 'DPU', label: 'DPU — Delivered at Place Unloaded' },
                          { value: 'DDP', label: 'DDP — Delivered Duty Paid' },
                        ]} />
                        <Select label="Metodo de entrega" value={editData.delivery_method || ''} onChange={(e) => setEditData({ ...editData, delivery_method: e.target.value })} options={[
                          { value: '', label: '— sin definir —' },
                          { value: 'transporte_propio', label: 'Transporte propio' },
                          { value: 'mensajeria', label: 'Mensajeria local' },
                          { value: 'retira_cliente', label: 'Retira el cliente' },
                          { value: 'agencia', label: 'Agencia de transporte' },
                          { value: 'courier_internacional', label: 'Courier internacional' },
                        ]} />
                        <Input label="Plazo / condiciones" value={editData.delivery_terms || ''} onChange={(e) => setEditData({ ...editData, delivery_terms: e.target.value })} placeholder="ej: 48h habiles" />
                      </div>
                      <Input label="Instrucciones / notas de entrega" value={editData.delivery_notes || ''} onChange={(e) => setEditData({ ...editData, delivery_notes: e.target.value })} />
                    </div>

                    {/* ── Fiscal ── */}
                    <div className="pt-4 border-t border-[#1E2330]">
                      <h4 className="text-xs font-semibold text-[#FF6600] uppercase mb-3">Condicion fiscal e impuestos</h4>
                      <Select label="Condicion fiscal" value={editData.fiscal_condition || ''} onChange={(e) => setEditData({ ...editData, fiscal_condition: e.target.value })} options={editData.country === 'AR' ? [
                        { value: '', label: '— sin definir —' },
                        { value: 'responsable_inscripto', label: 'Responsable Inscripto (AR)' },
                        { value: 'monotributo', label: 'Monotributo (AR)' },
                        { value: 'exento', label: 'Exento (AR)' },
                        { value: 'consumidor_final', label: 'Consumidor Final (AR)' },
                        { value: 'no_responsable', label: 'No Responsable (AR)' },
                      ] : [
                        { value: '', label: '— sin definir —' },
                        { value: 'general', label: 'IVA general (ES)' },
                        { value: 'intracomunitario', label: 'IVA intracomunitario (UE)' },
                        { value: 'exento', label: 'Exento' },
                        { value: 'exportacion', label: 'Exportacion (extracomunitario)' },
                        { value: 'recargo_equivalencia', label: 'Recargo de equivalencia' },
                      ]} />

                      {/* IVA */}
                      <div className="grid grid-cols-2 gap-4 mt-4">
                        <label className="flex items-center gap-2 text-sm text-[#F0F2F5]">
                          <input type="checkbox" checked={editData.subject_iva ?? true} onChange={(e) => setEditData({ ...editData, subject_iva: e.target.checked })} />
                          Aplica IVA
                        </label>
                        <Input label="% IVA" type="number" value={String(editData.iva_rate ?? 21)} onChange={(e) => setEditData({ ...editData, iva_rate: Number(e.target.value) })} />
                      </div>

                      {/* IRPF (España) */}
                      {editData.country !== 'AR' && (
                        <div className="grid grid-cols-2 gap-4 mt-4">
                          <label className="flex items-center gap-2 text-sm text-[#F0F2F5]">
                            <input type="checkbox" checked={editData.subject_irpf ?? false} onChange={(e) => setEditData({ ...editData, subject_irpf: e.target.checked })} />
                            Retencion IRPF
                          </label>
                          <Input label="% IRPF" type="number" value={String(editData.irpf_rate ?? 15)} onChange={(e) => setEditData({ ...editData, irpf_rate: Number(e.target.value) })} />
                        </div>
                      )}

                      {/* Recargo de equivalencia (España) */}
                      {editData.country !== 'AR' && (
                        <div className="grid grid-cols-2 gap-4 mt-4">
                          <label className="flex items-center gap-2 text-sm text-[#F0F2F5]">
                            <input type="checkbox" checked={editData.subject_re ?? false} onChange={(e) => setEditData({ ...editData, subject_re: e.target.checked })} />
                            Recargo de equivalencia
                          </label>
                          <Input label="% R.E." type="number" value={String(editData.re_rate ?? 5.2)} onChange={(e) => setEditData({ ...editData, re_rate: Number(e.target.value) })} />
                        </div>
                      )}

                      {/* IIBB (Argentina) */}
                      {editData.country === 'AR' && (
                        <>
                          <div className="grid grid-cols-3 gap-4 mt-4">
                            <label className="flex items-center gap-2 text-sm text-[#F0F2F5]">
                              <input type="checkbox" checked={editData.subject_iibb ?? false} onChange={(e) => setEditData({ ...editData, subject_iibb: e.target.checked })} />
                              Retencion IIBB
                            </label>
                            <Input label="% IIBB" type="number" value={String(editData.iibb_rate ?? 0)} onChange={(e) => setEditData({ ...editData, iibb_rate: Number(e.target.value) })} />
                            <Input label="Jurisdiccion" value={editData.iibb_jurisdiction || ''} onChange={(e) => setEditData({ ...editData, iibb_jurisdiction: e.target.value })} placeholder="CABA, BA, ..." />
                          </div>
                          <div className="grid grid-cols-2 gap-4 mt-4">
                            <label className="flex items-center gap-2 text-sm text-[#F0F2F5]">
                              <input type="checkbox" checked={editData.subject_ganancias ?? false} onChange={(e) => setEditData({ ...editData, subject_ganancias: e.target.checked })} />
                              Retencion Ganancias
                            </label>
                            <Input label="% Ganancias" type="number" value={String(editData.ganancias_rate ?? 0)} onChange={(e) => setEditData({ ...editData, ganancias_rate: Number(e.target.value) })} />
                          </div>
                        </>
                      )}
                    </div>

                    {/* ── Otros ── */}
                    <div className="pt-4 border-t border-[#1E2330]">
                      <h4 className="text-xs font-semibold text-[#FF6600] uppercase mb-3">Otros</h4>
                      <Select label="Idioma preferido" value={editData.preferred_language || 'es'} onChange={(e) => setEditData({ ...editData, preferred_language: e.target.value })} options={[
                        { value: 'es', label: 'Espanol' },
                        { value: 'en', label: 'Ingles' },
                        { value: 'pt', label: 'Portugues' },
                        { value: 'fr', label: 'Frances' },
                        { value: 'it', label: 'Italiano' },
                      ]} />
                      <Input label="Notas comerciales (internas)" value={editData.commercial_notes || ''} onChange={(e) => setEditData({ ...editData, commercial_notes: e.target.value })} />
                    </div>

                    <div className="flex gap-2 justify-end pt-2">
                      <Button variant="secondary" onClick={() => setEditing(false)}>Cancelar</Button>
                      <Button variant="primary" onClick={saveEdit} loading={saving}><Save size={14} /> Guardar</Button>
                    </div>
                  </div>
                </Card>
              ) : (
                <div className="space-y-6">
                  {/* Datos basicos */}
                  <div>
                    <h4 className="text-xs font-semibold text-[#FF6600] uppercase mb-3">Datos basicos</h4>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                      <InfoField label="Razon social" value={company.legal_name} />
                      <InfoField label={company.tax_id_type || 'Identificacion fiscal'} value={company.tax_id} mono />
                      <InfoField label="Email" value={company.email} />
                      <InfoField label="Telefono" value={company.phone} />
                      <InfoField label="Direccion" value={[company.address, company.city, company.state].filter(Boolean).join(', ')} />
                      <InfoField label="Pais" value={`${countryFlags[company.country] || ''} ${countryNames[company.country] || company.country}`} />
                      <InfoField label="Codigo postal" value={company.postal_code} />
                      <InfoField label="Categoria" value={company.category} />
                      <InfoField label="Idioma" value={company.preferred_language} />
                      <InfoField label="Origen" value={company.source} />
                    </div>
                  </div>

                  {/* Comerciales */}
                  <div>
                    <h4 className="text-xs font-semibold text-[#FF6600] uppercase mb-3">Condiciones comerciales</h4>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                      <InfoField label="Moneda" value={company.currency} />
                      <InfoField label="Condicion de venta" value={company.sale_condition} />
                      <InfoField label="Forma de pago" value={company.payment_method} />
                      <InfoField label="Plazo de pago" value={company.payment_terms_days != null ? `${company.payment_terms_days} dias` : null} />
                      <InfoField label="Condicion de pago (texto)" value={company.payment_terms} />
                      <InfoField label="Limite de credito" value={company.credit_limit ? formatCurrency(company.credit_limit, (company.currency || 'EUR') as 'EUR' | 'ARS' | 'USD') : null} />
                      <InfoField label="Cuenta bancaria" value={company.bank_account} mono />
                    </div>
                  </div>

                  {/* Entrega */}
                  <div>
                    <h4 className="text-xs font-semibold text-[#FF6600] uppercase mb-3">Entrega</h4>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                      <InfoField label="Direccion de entrega" value={[company.delivery_address, company.delivery_city, company.delivery_state].filter(Boolean).join(', ')} />
                      <InfoField label="Pais de entrega" value={company.delivery_country ? (countryNames[company.delivery_country] || company.delivery_country) : null} />
                      <InfoField label="Contacto de entrega" value={company.delivery_contact} />
                      <InfoField label="Telefono de entrega" value={company.delivery_phone} />
                      <InfoField label="Incoterm" value={company.incoterm} />
                      <InfoField label="Metodo" value={company.delivery_method} />
                      <InfoField label="Plazo / condiciones" value={company.delivery_terms} />
                      <InfoField label="Notas" value={company.delivery_notes} />
                    </div>
                  </div>

                  {/* Fiscal */}
                  <div>
                    <h4 className="text-xs font-semibold text-[#FF6600] uppercase mb-3">Condicion fiscal e impuestos</h4>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                      <InfoField label="Condicion fiscal" value={company.fiscal_condition} />
                      <InfoField label="IVA" value={company.subject_iva === false ? 'Exento' : `${company.iva_rate ?? 21}%`} />
                      {company.country !== 'AR' && (
                        <>
                          <InfoField label="IRPF" value={company.subject_irpf ? `${company.irpf_rate ?? 15}%` : 'No retiene'} />
                          <InfoField label="Recargo equivalencia" value={company.subject_re ? `${company.re_rate ?? 5.2}%` : 'No aplica'} />
                        </>
                      )}
                      {company.country === 'AR' && (
                        <>
                          <InfoField label="IIBB" value={company.subject_iibb ? `${company.iibb_rate ?? 0}% — ${company.iibb_jurisdiction || '—'}` : 'No retiene'} />
                          <InfoField label="Ganancias" value={company.subject_ganancias ? `${company.ganancias_rate ?? 0}%` : 'No retiene'} />
                        </>
                      )}
                    </div>
                  </div>

                  {/* Notas comerciales */}
                  {company.commercial_notes && (
                    <div>
                      <h4 className="text-xs font-semibold text-[#FF6600] uppercase mb-3">Notas internas</h4>
                      <p className="text-sm text-[#9CA3AF] whitespace-pre-wrap">{company.commercial_notes}</p>
                    </div>
                  )}

                  <div className="text-xs text-[#6B7280] pt-2 border-t border-[#1E2330]">
                    {company.records.length} registro(s) vinculado(s) en la base
                  </div>
                </div>
              )}
            </div>
          )}

          {/* TAB: Contactos */}
          {activeDetailTab === 'contactos' && (
            <div className="space-y-4">
              <div className="flex justify-between items-center">
                <h3 className="text-sm font-semibold text-[#F0F2F5]">Contactos de {company.legal_name}</h3>
                <div className="flex gap-2">
                  <SyncContactsButton clientId={company.id} clientName={company.legal_name || company.name} clientEmail={company.email} onContactsUpdated={loadContacts} />
                  <Button variant="primary" size="sm" onClick={() => setShowAddContact(true)}><Plus size={14} /> Agregar contacto</Button>
                </div>
              </div>

              {loadingContacts ? (
                <div className="flex justify-center py-10"><Loader2 className="animate-spin text-[#FF6600]" size={24} /></div>
              ) : allContacts.length === 0 ? (
                <Card><p className="text-center text-[#6B7280] py-6">No hay contactos registrados</p></Card>
              ) : (
                <div className="space-y-3">
                  {allContacts.map((contact) => (
                    <ContactCard
                      key={contact.id}
                      contact={contact as unknown as Record<string, unknown>}
                      onUpdate={loadContacts}
                      onDelete={deleteContact}
                      onTogglePrimary={togglePrimary}
                    />
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

          {/* TAB: Relacionadas */}
          {activeDetailTab === 'relacionadas' && (
            <RelatedCompanies clientId={company.id} clientName={company.legal_name || company.name} />
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

          {/* TAB: OC Glosario */}
          {activeDetailTab === 'oc_glosario' && (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-semibold text-[#F0F2F5]">Glosario de OC — {company.legal_name}</h3>
              </div>
              <p className="text-xs text-[#6B7280]">Historial de ordenes de compra recibidas del cliente, vinculadas a pedidos internos.</p>
              {clientOCs.length === 0 ? (
                <div className="text-center py-10 text-[#4B5563]"><FileText size={40} className="mx-auto mb-2 opacity-30" /><p className="text-sm">No hay OC registradas para este cliente</p><p className="text-xs mt-1">Al crear un pedido, carga el numero de OC del cliente en el campo &ldquo;OC del cliente&rdquo;</p></div>
              ) : (
                <div className="overflow-x-auto rounded-lg border border-[#1E2330]">
                  <table className="w-full text-sm">
                    <thead><tr className="bg-[#0F1218] border-b border-[#1E2330] text-[#6B7280] text-xs uppercase">
                      <th className="px-4 py-3 text-left">OC Cliente</th>
                      <th className="px-4 py-3 text-left">Tipo Doc.</th>
                      <th className="px-4 py-3 text-left">Ref. Interna</th>
                      <th className="px-4 py-3 text-left">Estado</th>
                      <th className="px-4 py-3 text-left">Fecha</th>
                      <th className="px-4 py-3 text-right">Importe</th>
                    </tr></thead>
                    <tbody>
                      {clientOCs.map(d => {
                        const meta = d.metadata as Record<string, unknown> | null
                        const ocRef = (meta?.client_reference as string) || '-'
                        const attachments = (meta?.attachments as Array<{ name: string; url: string }>) || []
                        const ocFile = attachments.find(a => a.name.toLowerCase().includes('oc') || a.name.toLowerCase().includes('orden'))
                        return (
                          <tr key={d.id as string} className="border-b border-[#1E2330] hover:bg-[#1C2230]">
                            <td className="px-4 py-2.5">
                              <span className="font-mono text-[#FF6600] font-bold">{ocRef}</span>
                              {ocFile && <a href={ocFile.url} target="_blank" rel="noreferrer" className="ml-2 text-[10px] text-blue-400 hover:underline">PDF</a>}
                            </td>
                            <td className="px-4 py-2.5"><Badge variant="default" size="sm">{(d.doc_type as string) || '-'}</Badge></td>
                            <td className="px-4 py-2.5"><DocLink docRef={(d.display_ref as string) || (d.system_code as string) || '-'} docId={d.id as string} docType={d.doc_type as string} /></td>
                            <td className="px-4 py-2.5"><Badge variant={((d.status as string) === 'closed' || (d.status as string) === 'paid') ? 'success' : (d.status as string) === 'open' ? 'info' : 'default'} size="sm">{(d.status as string) || '-'}</Badge></td>
                            <td className="px-4 py-2.5 text-xs text-[#9CA3AF] whitespace-nowrap">{d.created_at ? formatDate(d.created_at as string) : '-'}</td>
                            <td className="px-4 py-2.5 text-right font-bold text-[#FF6600]">{formatCurrency((d.total as number) || 0)}</td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}

          {/* TAB: Productos (Sprint 2B — trazabilidad cliente <-> producto) */}
          {activeDetailTab === 'productos' && (
            <div className="space-y-3">
              <div>
                <h3 className="text-sm font-semibold text-[#F0F2F5]">Productos comprados — trazabilidad histórica</h3>
                <p className="text-xs text-[#9CA3AF] mt-1">
                  Lista de productos que esta empresa compró alguna vez (cotizaciones, pedidos, remitos y facturas no canceladas), con totales acumulados, último precio pactado y frecuencia. Click en un producto para ver su ficha.
                </p>
              </div>
              {/* Multi-tenant: una empresa puede tener varios client_ids agrupados.
                  Por ahora mostramos el primer client_id; si hay más, futuro: tabs o concat. */}
              {allClientIds[0] ? (
                <ClientProductsHistory
                  clientId={allClientIds[0]}
                  onProductClick={(pid) => setOpenProductId(pid)}
                />
              ) : (
                <Card><p className="text-center text-[#6B7280] py-6">Esta empresa no tiene client_id asociado.</p></Card>
              )}
              <ProductDetailModal
                productId={openProductId}
                onClose={() => setOpenProductId(null)}
              />
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
                        const docType = doc.doc_type as string
                        const typeLabels: Record<string, string> = { quote: 'Cotizacion', sales_order: 'Pedido', invoice: 'Factura', delivery: 'Remito', purchase_order: 'Orden compra' }
                        const statusColors: Record<string, string> = { draft: 'default', sent: 'info', accepted: 'success', confirmed: 'success', invoiced: 'orange', cancelled: 'danger', paid: 'success' }
                        return (
                          <TableRow key={doc.id as string}>
                            <TableCell><Badge variant="info" size="sm">{typeLabels[docType] || docType}</Badge></TableCell>
                            <TableCell><DocLink docRef={(doc.display_ref || doc.system_code) as string} docId={doc.id as string} docType={doc.doc_type as string} className="text-xs font-mono" /></TableCell>
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
            {documents.filter(d => d.doc_type === 'sales_order' && d.status !== 'delivered' && d.status !== 'cancelled').length === 0 ? (
              <p className="text-xs text-[#4B5563]">Sin pendientes</p>
            ) : (
              <div className="space-y-2">
                {documents.filter(d => d.doc_type === 'sales_order' && d.status !== 'delivered' && d.status !== 'cancelled').slice(0, 5).map(d => (
                  <div key={d.id as string} className="flex items-center justify-between p-2 rounded-lg bg-[#0F1218]">
                    <DocLink docRef={(d.display_ref || d.system_code) as string} docId={d.id as string} docType={d.doc_type as string} className="text-xs font-mono" />
                    <Badge variant="warning" size="sm">{d.status as string}</Badge>
                  </div>
                ))}
              </div>
            )}
          </Card>

          {/* Pendientes de pago */}
          <Card>
            <h3 className="text-xs font-semibold text-[#6B7280] uppercase mb-3">Pendientes de pago</h3>
            {documents.filter(d => d.doc_type === 'invoice' && d.status !== 'paid' && d.status !== 'cancelled').length === 0 ? (
              <p className="text-xs text-[#4B5563]">Sin pendientes</p>
            ) : (
              <div className="space-y-2">
                {documents.filter(d => d.doc_type === 'invoice' && d.status !== 'paid' && d.status !== 'cancelled').slice(0, 5).map(d => (
                  <div key={d.id as string} className="flex items-center justify-between p-2 rounded-lg bg-[#0F1218]">
                    <DocLink docRef={(d.display_ref || d.system_code) as string} docId={d.id as string} docType={d.doc_type as string} className="text-xs font-mono" />
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
                      <DocLink docRef={(d.display_ref || d.system_code) as string} docId={d.id as string} docType={d.doc_type as string} className="text-xs font-mono" />
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
  const { filterByCompany, companyKey } = useCompanyFilter()
  const { addToast } = useToast()
  const [allClients, setAllClients] = useState<Client[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [filterCountry, setFilterCountry] = useState('')
  const [countries, setCountries] = useState<string[]>([])
  const debounceRef = useRef<NodeJS.Timeout | null>(null)
  const [selectedCompany, setSelectedCompany] = useState<GroupedCompany | null>(null)
  const [advancedClient, setAdvancedClient] = useState<Client | null>(null)
  const [showBulkImport, setShowBulkImport] = useState(false)
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [showNew, setShowNew] = useState(false)
  const [newClient, setNewClient] = useState({ legal_name: '', tax_id: '', category: '' as string, country: 'ES', city: '', email: '', phone: '', address: '', contact_name: '', contact_position: '', contact_email: '', contact_phone: '' })
  const [savingNew, setSavingNew] = useState(false)
  const [displayCount, setDisplayCount] = useState(60)
  const [viewMode, setViewMode] = useState<'card' | 'table'>('card')
  const [clientMetrics, setClientMetrics] = useState<Record<string, {
    total_invoiced: number; pending_collection: number; last_activity: string | null; doc_count: number
    total_quoted: number; total_ordered: number; pending_delivery: number; pending_invoicing: number
    payments_received: number; quotes_count: number; orders_count: number; invoices_count: number
    delivery_notes_count: number; oldest_unpaid: string | null
  }>>({})

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
        let q = supabase
          .from('tt_clients')
          .select('*')
          .eq('active', true)
          .order('legal_name')
          .range(from, from + PAGE_SIZE - 1)
        q = filterByCompany(q)
        const { data } = await q
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
  }, [addToast, companyKey])

  useEffect(() => { loadClients() }, [loadClients])

  // Load client metrics (all transactional data)
  const loadMetrics = useCallback(async () => {
    const sb = createClient()
    let qMetrics = sb.from('tt_documents')
      .select('client_id, doc_type, status, total, created_at')
      .not('client_id', 'is', null)
    qMetrics = filterByCompany(qMetrics)
    const { data } = await qMetrics
    if (!data) return
    type M = typeof clientMetrics extends Record<string, infer V> ? V : never
    const empty = (): M => ({
      total_invoiced: 0, pending_collection: 0, last_activity: null, doc_count: 0,
      total_quoted: 0, total_ordered: 0, pending_delivery: 0, pending_invoicing: 0,
      payments_received: 0, quotes_count: 0, orders_count: 0, invoices_count: 0,
      delivery_notes_count: 0, oldest_unpaid: null,
    })
    const map: Record<string, M> = {}
    for (const doc of data) {
      const cid = doc.client_id as string
      if (!map[cid]) map[cid] = empty()
      const m = map[cid]
      m.doc_count++
      const total = (doc.total as number) || 0
      const st = doc.status as string
      const tp = doc.doc_type as string
      const ca = doc.created_at as string
      if (!m.last_activity || ca > m.last_activity) m.last_activity = ca

      // Cotizaciones
      if (tp === 'presupuesto' || tp === 'quote') { m.total_quoted += total; m.quotes_count++ }
      // Pedidos
      if (tp === 'pedido' || tp === 'order' || tp === 'so') { m.total_ordered += total; m.orders_count++ }
      // Albaranes
      if (tp === 'albaran' || tp === 'delivery_note') { m.delivery_notes_count++ }
      // Facturas
      if (tp === 'factura' || tp === 'factura_abono' || tp === 'invoice') {
        m.total_invoiced += total; m.invoices_count++
        if (['pending', 'partial', 'open', 'sent'].includes(st)) {
          m.pending_collection += total
          if (!m.oldest_unpaid || ca < m.oldest_unpaid) m.oldest_unpaid = ca
        }
      }
      // Pedidos pendientes de entrega (mercaderia por llegar al cliente)
      if ((tp === 'pedido' || tp === 'order' || tp === 'so') && ['open', 'partial', 'confirmed'].includes(st)) {
        m.pending_delivery += total
      }
      // Pendiente de facturar (albaranes entregados sin facturar)
      if ((tp === 'albaran' || tp === 'delivery_note') && ['delivered', 'completed', 'open'].includes(st)) {
        m.pending_invoicing += total
      }
    }
    // Pagos recibidos = total facturado - pendiente cobro
    for (const cid of Object.keys(map)) {
      map[cid].payments_received = map[cid].total_invoiced - map[cid].pending_collection
    }
    setClientMetrics(map)
  }, [companyKey])

  useEffect(() => { loadMetrics() }, [loadMetrics])

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

  // Compute global totals for % calculation
  const globalTotalInvoiced = useMemo(() => {
    let t = 0
    for (const m of Object.values(clientMetrics)) t += m.total_invoiced
    return t || 1 // avoid div by zero
  }, [clientMetrics])

  // Build table rows with metrics
  const tableRows = useMemo(() => {
    return companies.map(c => {
      // Aggregate metrics across all client IDs in this company group
      let total_invoiced = 0, pending_collection = 0, doc_count = 0
      let total_quoted = 0, total_ordered = 0, pending_delivery = 0, pending_invoicing = 0
      let payments_received = 0, quotes_count = 0, orders_count = 0, invoices_count = 0, delivery_notes_count = 0
      let last_activity: string | null = null
      let oldest_unpaid: string | null = null
      for (const rec of c.records) {
        const m = clientMetrics[rec.id]
        if (m) {
          total_invoiced += m.total_invoiced; pending_collection += m.pending_collection
          doc_count += m.doc_count; total_quoted += m.total_quoted; total_ordered += m.total_ordered
          pending_delivery += m.pending_delivery; pending_invoicing += m.pending_invoicing
          payments_received += m.payments_received; quotes_count += m.quotes_count
          orders_count += m.orders_count; invoices_count += m.invoices_count
          delivery_notes_count += m.delivery_notes_count
          if (m.last_activity && (!last_activity || m.last_activity > last_activity)) last_activity = m.last_activity
          if (m.oldest_unpaid && (!oldest_unpaid || m.oldest_unpaid < oldest_unpaid)) oldest_unpaid = m.oldest_unpaid
        }
      }
      const daysInactive = last_activity ? Math.floor((Date.now() - new Date(last_activity).getTime()) / 86400000) : 999
      const daysOldestUnpaid = oldest_unpaid ? Math.floor((Date.now() - new Date(oldest_unpaid).getTime()) / 86400000) : 0
      const pctRevenue = Math.round((total_invoiced / globalTotalInvoiced) * 10000) / 100

      return {
        ...c,
        _total_invoiced: total_invoiced,
        _pending_collection: pending_collection,
        _payments_received: payments_received,
        _total_quoted: total_quoted,
        _total_ordered: total_ordered,
        _pending_delivery: pending_delivery,
        _pending_invoicing: pending_invoicing,
        _last_activity: last_activity,
        _doc_count: doc_count,
        _quotes_count: quotes_count,
        _orders_count: orders_count,
        _invoices_count: invoices_count,
        _delivery_notes_count: delivery_notes_count,
        _days_inactive: daysInactive,
        _days_oldest_unpaid: daysOldestUnpaid,
        _pct_revenue: pctRevenue,
        _country_display: `${countryFlags[c.country] || ''} ${c.country}`,
        _is_favorite: (c.records[0] as unknown as Record<string, unknown>)?.is_favorite ? 'Si' : '',
      } as Record<string, unknown>
    })
  }, [companies, clientMetrics, globalTotalInvoiced])

  const clientColumns: DataTableColumn[] = useMemo(() => [
    // --- Datos base ---
    { key: '_is_favorite', label: 'Fav', sortable: true, type: 'text', width: '50px' },
    { key: 'legal_name', label: 'Empresa', sortable: true, searchable: true, type: 'text' },
    { key: 'tax_id', label: 'CIF/CUIT', sortable: true, searchable: true, type: 'text' },
    { key: 'email', label: 'Email', sortable: true, searchable: true, type: 'text', defaultVisible: false },
    { key: 'phone', label: 'Telefono', sortable: false, type: 'text', defaultVisible: false },
    { key: 'city', label: 'Ciudad', sortable: true, searchable: true, type: 'text', defaultVisible: false },
    { key: '_country_display', label: 'Pais', sortable: true, type: 'text' },
    { key: 'category', label: 'Categoria', sortable: true, searchable: true, type: 'text' },
    { key: 'currency', label: 'Moneda', sortable: true, type: 'text', defaultVisible: false },
    { key: 'sale_condition', label: 'Cond. Venta', sortable: true, type: 'text', defaultVisible: false },
    { key: 'payment_method', label: 'Forma Pago', sortable: true, type: 'text', defaultVisible: false },
    { key: 'payment_terms', label: 'Cond. Pago', sortable: true, type: 'text', defaultVisible: false },
    { key: 'payment_terms_days', label: 'Plazo (dias)', sortable: true, type: 'number', defaultVisible: false },
    { key: 'fiscal_condition', label: 'Cond. Fiscal', sortable: true, type: 'text', defaultVisible: false },
    { key: 'incoterm', label: 'Incoterm', sortable: true, type: 'text', defaultVisible: false },
    { key: 'contactCount', label: 'Contactos', sortable: true, type: 'number', defaultVisible: false },
    // --- Facturacion ---
    { key: '_total_invoiced', label: 'Total Facturado', sortable: true, type: 'currency' },
    { key: '_pct_revenue', label: '% Facturacion', sortable: true, type: 'number', render: (v) => v ? `${v}%` : '-' },
    { key: '_pending_collection', label: 'Pend. Cobro', sortable: true, type: 'currency' },
    { key: '_payments_received', label: 'Cobrado', sortable: true, type: 'currency', defaultVisible: false },
    { key: '_days_oldest_unpaid', label: 'Dias Deuda', sortable: true, type: 'number', render: (v) => { const d = v as number; return d > 90 ? `${d}d` : d > 0 ? `${d}d` : '-' } },
    // --- Pipeline ---
    { key: '_total_quoted', label: 'Cotizado', sortable: true, type: 'currency', defaultVisible: false },
    { key: '_total_ordered', label: 'Pedido', sortable: true, type: 'currency', defaultVisible: false },
    { key: '_pending_delivery', label: 'Merc. Pendiente', sortable: true, type: 'currency' },
    { key: '_pending_invoicing', label: 'Pend. Facturar', sortable: true, type: 'currency' },
    // --- Actividad ---
    { key: '_last_activity', label: 'Ultima Actividad', sortable: true, type: 'date' },
    { key: '_days_inactive', label: 'Dias Inactivo', sortable: true, type: 'number' },
    // --- Contadores ---
    { key: '_quotes_count', label: 'Cotizaciones', sortable: true, type: 'number', defaultVisible: false },
    { key: '_orders_count', label: 'Pedidos', sortable: true, type: 'number', defaultVisible: false },
    { key: '_delivery_notes_count', label: 'Albaranes', sortable: true, type: 'number', defaultVisible: false },
    { key: '_invoices_count', label: 'Facturas', sortable: true, type: 'number', defaultVisible: false },
    { key: '_doc_count', label: 'Total Docs', sortable: true, type: 'number', defaultVisible: false },
    // --- Extra ---
    { key: 'credit_limit', label: 'Limite Credito', sortable: true, type: 'currency', defaultVisible: false },
    { key: 'source', label: 'Fuente', sortable: true, type: 'text', defaultVisible: false },
  ], [])

  async function createNewClient() {
    if (!newClient.legal_name.trim()) { addToast({ type: 'error', title: 'El nombre de la empresa es obligatorio' }); return }
    setSavingNew(true)
    const supabase = createClient()
    try {
      // Defaults segun pais
      const isAR = newClient.country === 'AR'
      const isUS = newClient.country === 'US'
      const defaultCurrency = isAR ? 'ARS' : isUS ? 'USD' : 'EUR'
      const defaultTaxIdType = isAR ? 'CUIT' : newClient.country === 'ES' ? 'CIF' : null
      const defaultFiscal = isAR ? 'responsable_inscripto' : 'general'

      // Create the main client record
      const { data: clientData, error } = await supabase.from('tt_clients').insert({
        name: newClient.contact_name || newClient.legal_name,
        legal_name: newClient.legal_name,
        tax_id: newClient.tax_id || null,
        tax_id_type: defaultTaxIdType,
        country: newClient.country,
        city: newClient.city || null,
        email: newClient.email || null,
        phone: newClient.phone || null,
        address: newClient.address || null,
        category: newClient.category || null,
        active: true,
        payment_terms: 'contado',
        payment_terms_days: 0,
        sale_condition: 'contado',
        credit_limit: 0,
        currency: defaultCurrency,
        fiscal_condition: defaultFiscal,
        subject_iva: true,
        iva_rate: 21,
        preferred_language: 'es',
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
        {/* View mode toggle */}
        <div className="flex rounded-lg border border-[#2A3040] overflow-hidden">
          <button onClick={() => setViewMode('card')} className={`flex items-center gap-1.5 px-3 py-2 text-xs font-medium transition-all ${viewMode === 'card' ? 'bg-[#FF6600] text-white' : 'bg-[#141820] text-[#6B7280] hover:text-[#F0F2F5]'}`}>
            <Grid3X3 size={14} /> Tarjetas
          </button>
          <button onClick={() => setViewMode('table')} className={`flex items-center gap-1.5 px-3 py-2 text-xs font-medium transition-all ${viewMode === 'table' ? 'bg-[#FF6600] text-white' : 'bg-[#141820] text-[#6B7280] hover:text-[#F0F2F5]'}`}>
            <List size={14} /> Tabla
          </button>
        </div>
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
            { key: 'currency', label: 'Moneda' },
            { key: 'sale_condition', label: 'Cond. Venta' },
            { key: 'payment_method', label: 'Forma Pago' },
            { key: 'payment_terms', label: 'Condiciones Pago' },
            { key: 'payment_terms_days', label: 'Plazo (dias)' },
            { key: 'fiscal_condition', label: 'Cond. Fiscal' },
            { key: 'incoterm', label: 'Incoterm' },
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
            { key: 'currency', label: 'Moneda' },
            { key: 'sale_condition', label: 'Condicion de venta' },
            { key: 'payment_method', label: 'Forma de pago' },
            { key: 'payment_terms', label: 'Condiciones pago' },
            { key: 'payment_terms_days', label: 'Plazo pago (dias)', type: 'number' },
            { key: 'fiscal_condition', label: 'Condicion fiscal' },
            { key: 'tax_id_type', label: 'Tipo identificacion' },
            { key: 'incoterm', label: 'Incoterm' },
            { key: 'delivery_method', label: 'Metodo entrega' },
            { key: 'delivery_address', label: 'Direccion entrega' },
            { key: 'bank_account', label: 'Cuenta bancaria' },
            { key: 'notes', label: 'Observaciones' },
            { key: 'whatsapp', label: 'Web/WhatsApp' },
            { key: 'credit_limit', label: 'Descuento/Limite', type: 'number' },
            { key: 'active', label: 'Activa', type: 'boolean' },
          ]}
          permission="edit_clients"
        />
        <Button variant="secondary" onClick={() => setShowBulkImport(true)}>
          <Plus size={14} /> Importar CSV
        </Button>
        <Button variant="primary" onClick={() => setShowNew(true)}><Plus size={16} /> Nueva Empresa</Button>
      </div>
      {/* Saved Views (vistas guardadas) */}
      <div className="flex items-center gap-2 flex-wrap">
        <SavedViews
          entityType="clients"
          currentFilters={{ search, country: filterCountry }}
          onApplyView={(filters) => {
            const f = filters as { search?: string; country?: string }
            if (f.search !== undefined) setSearch(f.search)
            if (f.country !== undefined) setFilterCountry(f.country)
          }}
        />
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
      ) : viewMode === 'table' ? (
        <DataTable
          data={tableRows}
          columns={clientColumns}
          loading={loading}
          pageSize={50}
          showTotals
          totalLabel="empresas"
          onRowClick={(row) => {
            const comp = companies.find(c => c.id === (row.id as string))
            if (comp) setSelectedCompany(comp)
          }}
          exportFilename="clientes_torquetools"
          exportTargetTable="tt_clients"
        />
      ) : (
        <>
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
            {visibleCompanies.map((company) => (
              <Card key={company.id} hover onClick={() => setSelectedCompany(company)}>
                <div className="flex items-start justify-between mb-3">
                  <div className="flex items-center gap-3 min-w-0 flex-1">
                    <BulkCheckbox
                      checked={selectedIds.has(company.id)}
                      onChange={(c) => {
                        setSelectedIds(prev => {
                          const next = new Set(prev)
                          if (c) next.add(company.id); else next.delete(company.id)
                          return next
                        })
                      }}
                    />
                    <div className="w-11 h-11 rounded-xl bg-[#FF6600]/15 flex items-center justify-center text-sm font-bold text-[#FF6600] shrink-0">
                      {getInitials(company.legal_name)}
                    </div>
                    <div className="min-w-0">
                      <h3 className="text-sm font-bold text-[#F0F2F5] truncate">{company.legal_name}</h3>
                      {company.tax_id && <p className="text-xs font-mono text-[#6B7280] truncate">{company.tax_id}</p>}
                    </div>
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    <button
                      onClick={(e) => { e.stopPropagation(); setAdvancedClient(company.records[0] as Client) }}
                      className="p-1 rounded hover:bg-[#FF6600]/10 transition"
                      title="Vista profesional 360°"
                    >
                      <span className="text-[10px] text-[#FF6600] font-semibold">360°</span>
                    </button>
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

      {/* Vista 360° profesional (estilo Salesforce) */}
      <ClientDetailModal
        open={!!advancedClient}
        onClose={() => setAdvancedClient(null)}
        client={advancedClient as Parameters<typeof ClientDetailModal>[0]['client']}
        onSaved={() => { void loadClients(); setAdvancedClient(null) }}
      />

      {/* Bulk import desde CSV */}
      <BulkImportClientsModal
        open={showBulkImport}
        onClose={() => setShowBulkImport(false)}
        onImported={() => { void loadClients(); addToast({ type: 'success', title: 'Clientes importados' }) }}
      />

      {/* Bulk actions bar (flotante abajo) */}
      <BulkActionsBar
        selectedCount={selectedIds.size}
        totalCount={visibleCompanies.length}
        onClear={() => setSelectedIds(new Set())}
        onSelectAll={() => setSelectedIds(new Set(visibleCompanies.map(c => c.id)))}
        actions={[
          COMMON_BULK_ACTIONS.export(() => {
            const ids = Array.from(selectedIds)
            const rows = visibleCompanies.filter(c => ids.includes(c.id))
            const csv = ['Razón social,CUIT/CIF,País,Email,Teléfono'].concat(
              rows.map(c => {
                const r = c.records[0] as unknown as Record<string, unknown>
                return `"${(r.legal_name as string) || ''}","${(r.tax_id as string) || ''}","${(r.country as string) || ''}","${(r.email as string) || ''}","${(r.phone as string) || ''}"`
              })
            ).join('\n')
            const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8' })
            const url = URL.createObjectURL(blob)
            const a = document.createElement('a')
            a.href = url
            a.download = `clientes_export_${new Date().toISOString().split('T')[0]}.csv`
            a.click()
            URL.revokeObjectURL(url)
            addToast({ type: 'success', title: `${selectedIds.size} clientes exportados` })
          }),
        ]}
      />
    </div>
  )
}

// ═══════════════════════════════════════════════════════
// POTENCIALES TAB
// ═══════════════════════════════════════════════════════

function PotencialesTab() {
  const { filterByCompany, companyKey } = useCompanyFilter()
  const supabase = createClient()
  const { addToast } = useToast()
  const [leads, setLeads] = useState<Client[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')

  const load = useCallback(async () => {
    setLoading(true)
    const sb = createClient()
    let q = sb.from('tt_clients').select('*').or('category.eq.potential,category.eq.lead,source.eq.lead').eq('active', true).order('created_at', { ascending: false })
    q = filterByCompany(q)
    if (search) q = q.or(`name.ilike.%${search}%,legal_name.ilike.%${search}%`)
    const { data } = await q
    setLeads((data || []) as Client[])
    setLoading(false)
  }, [search, companyKey])

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
  const { filterByCompany, companyKey } = useCompanyFilter()
  const supabase = createClient()
  const [contacts, setContacts] = useState<(Client & { _companyName?: string })[]>([])
  const [dbContacts, setDbContacts] = useState<(ClientContact & { _companyName?: string })[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')

  const load = useCallback(async () => {
    setLoading(true)
    const sb = createClient()
    // Load contacts from tt_client_contacts table
    const { data: ccData } = await sb
      .from('tt_client_contacts')
      .select('*, client:tt_clients!client_id(id, legal_name)')
      .order('name')
      .limit(500)

    // Also load from tt_clients (where name differs from legal_name = person contacts)
    let q = sb.from('tt_clients').select('id, name, legal_name, email, phone, city, country, category').eq('active', true).order('name')
    q = filterByCompany(q)
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
  }, [search, companyKey])

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
  const { filterByCompany, companyKey } = useCompanyFilter()
  const [favorites, setFavorites] = useState<GroupedCompany[]>([])
  const [loading, setLoading] = useState(true)
  const [selectedCompany, setSelectedCompany] = useState<GroupedCompany | null>(null)

  useEffect(() => { loadFavorites() }, [companyKey])

  async function loadFavorites() {
    const supabase = createClient()
    setLoading(true)
    let qFav = supabase.from('tt_clients').select('*').eq('active', true).eq('is_favorite', true).order('legal_name')
    qFav = filterByCompany(qFav)
    const { data } = await qFav
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
  const { filterByCompany, companyKey } = useCompanyFilter()
  const [clients, setClients] = useState<(Client & { rank: number })[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => { loadRanking() }, [companyKey])

  async function loadRanking() {
    const supabase = createClient()
    setLoading(true)
    let qRank = supabase.from('tt_clients').select('*').eq('active', true).order('total_revenue', { ascending: false, nullsFirst: false }).limit(50)
    qRank = filterByCompany(qRank)
    const { data } = await qRank
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
              {activeTab === 'duplicados' && <ClientMerge />}
            </>
          )}
        </Tabs>
      </Suspense>
    </div>
  )
}
