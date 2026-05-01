'use client'

/**
 * Modal de detalle de cliente — UX profesional estilo Salesforce.
 *
 * 6 pestañas:
 * - General      : datos básicos, identificación fiscal, contacto principal
 * - Dirección    : campos diferenciados, vista previa
 * - Comercial    : condiciones de pago, lista de precios, scoring, descuentos
 * - Contactos    : múltiples personas dentro de la empresa
 * - Direcciones  : facturación + entregas múltiples
 * - Actividad    : timeline cronológico
 */

import { useEffect, useState, useCallback, useMemo } from 'react'
import { Modal } from '@/components/ui/modal'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { useToast } from '@/components/ui/toast'
import { createClient } from '@/lib/supabase/client'
import {
  User, MapPin, DollarSign, Users, Building2, Activity,
  Save, Plus, Trash2, Star, AlertCircle, Mail, Phone, Globe2,
  TrendingUp, FileText, Receipt, Hash,
} from 'lucide-react'

export interface ClientData {
  id: string
  name?: string | null
  trade_name?: string | null
  legal_name?: string | null
  tax_id?: string | null
  email?: string | null
  phone?: string | null
  whatsapp?: string | null
  website?: string | null
  // Dirección
  address_street?: string | null
  address_number?: string | null
  address_floor?: string | null
  address_apartment?: string | null
  postal_code?: string | null
  city?: string | null
  state?: string | null
  country?: string | null
  address_references?: string | null
  // Comercial
  category?: string | null
  payment_terms?: string | null
  credit_limit?: number | null
  preferred_currency?: string | null
  price_list_code?: string | null
  default_discount_pct?: number | null
  scoring?: number | null
  source?: string | null
  active?: boolean
  notes?: string | null
}

interface ClientStats {
  quotes_count: number
  orders_count: number
  invoices_count: number
  total_invoiced: number
  total_pending: number
  last_invoice_at: string | null
  last_quote_at: string | null
  contacts_count: number
  addresses_count: number
}

interface ClientContact {
  id?: string
  full_name: string
  position?: string | null
  email?: string | null
  phone?: string | null
  mobile?: string | null
  whatsapp?: string | null
  receives_quotes?: boolean
  receives_invoices?: boolean
  receives_remitos?: boolean
  is_collections?: boolean
  is_primary?: boolean
  active?: boolean
  notes?: string | null
}

interface ClientAddress {
  id?: string
  alias: string
  type?: 'billing' | 'shipping' | 'branch' | 'site' | 'other' | null
  contact_name?: string | null
  phone?: string | null
  street?: string | null
  number?: string | null
  floor?: string | null
  apartment?: string | null
  postal_code?: string | null
  city?: string | null
  state?: string | null
  country?: string | null
  references_text?: string | null
  is_default_billing?: boolean
  is_default_shipping?: boolean
  active?: boolean
}

interface ActivityEntry {
  id: string
  action: string
  description: string | null
  created_at: string
  user_id: string | null
  metadata: Record<string, unknown> | null
}

interface Props {
  open: boolean
  onClose: () => void
  client: ClientData | null
  onSaved: () => void
}

const COUNTRIES = [
  { code: 'AR', name: 'Argentina', taxIdLabel: 'CUIT', currency: 'ARS' },
  { code: 'ES', name: 'España', taxIdLabel: 'CIF/NIF', currency: 'EUR' },
  { code: 'US', name: 'Estados Unidos', taxIdLabel: 'EIN', currency: 'USD' },
  { code: 'UY', name: 'Uruguay', taxIdLabel: 'RUT', currency: 'UYU' },
  { code: 'CL', name: 'Chile', taxIdLabel: 'RUT', currency: 'CLP' },
  { code: 'BR', name: 'Brasil', taxIdLabel: 'CNPJ', currency: 'BRL' },
  { code: 'MX', name: 'México', taxIdLabel: 'RFC', currency: 'MXN' },
]

const CATEGORIES = [
  { value: 'A',           label: 'Cliente A — preferencial', tone: 'emerald' },
  { value: 'B',           label: 'Cliente B — estándar',     tone: 'blue' },
  { value: 'distribuidor',label: 'Distribuidor / reventa',  tone: 'violet' },
  { value: 'monotributo', label: 'Monotributo',              tone: 'orange' },
  { value: 'consumidor',  label: 'Consumidor final',         tone: 'gray' },
]

const PAYMENT_TERMS = [
  'Contado', '15 días', '30 días', '45 días', '60 días', '90 días', 'A convenir',
]

const SOURCES = [
  'Referido', 'Web', 'Llamada en frío', 'Feria/evento', 'LinkedIn', 'Mercado Libre', 'Otro',
]

// ================================================================
// VALIDADORES
// ================================================================
const validators = {
  taxId: (v: string, country?: string | null): { valid: boolean; msg?: string } => {
    if (!v) return { valid: true }
    const clean = v.replace(/[\s-]/g, '')
    if (country === 'AR') {
      if (!/^\d{11}$/.test(clean)) return { valid: false, msg: 'CUIT debe tener 11 dígitos' }
    } else if (country === 'ES') {
      if (!/^[A-Z0-9]{8,10}$/i.test(clean)) return { valid: false, msg: 'CIF/NIF inválido' }
    } else if (country === 'US') {
      if (!/^\d{9}$/.test(clean)) return { valid: false, msg: 'EIN debe tener 9 dígitos' }
    }
    return { valid: true }
  },
  email: (v: string): { valid: boolean; msg?: string } => {
    if (!v) return { valid: true }
    if (!/^\S+@\S+\.\S+$/.test(v)) return { valid: false, msg: 'Email inválido' }
    return { valid: true }
  },
}

// ================================================================
// COMPONENT
// ================================================================
export function ClientDetailModal({ open, onClose, client, onSaved }: Props) {
  const supabase = createClient()
  const { addToast } = useToast()

  const [tab, setTab] = useState<'general' | 'address' | 'commercial' | 'contacts' | 'addresses' | 'activity'>('general')
  const [form, setForm] = useState<ClientData | null>(null)
  const [stats, setStats] = useState<ClientStats | null>(null)
  const [contacts, setContacts] = useState<ClientContact[]>([])
  const [addresses, setAddresses] = useState<ClientAddress[]>([])
  const [activity, setActivity] = useState<ActivityEntry[]>([])
  const [editingContact, setEditingContact] = useState<ClientContact | null>(null)
  const [editingAddress, setEditingAddress] = useState<ClientAddress | null>(null)
  const [saving, setSaving] = useState(false)

  // Cargar todo al abrir
  useEffect(() => {
    if (!open || !client) return
    setForm({ ...client })
    setTab('general')
    setEditingContact(null)
    setEditingAddress(null)

    const id = client.id

    void Promise.all([
      supabase.from('tt_client_stats').select('*').eq('client_id', id).single(),
      supabase.from('tt_client_contacts').select('*').eq('client_id', id).order('is_primary', { ascending: false }).order('full_name'),
      supabase.from('tt_client_addresses').select('*').eq('client_id', id).order('alias'),
      supabase.from('tt_activity_log').select('*').eq('entity_type', 'client').eq('entity_id', id).order('created_at', { ascending: false }).limit(50),
    ]).then(([s, c, a, act]) => {
      setStats((s.data || null) as ClientStats | null)
      setContacts((c.data || []) as ClientContact[])
      setAddresses((a.data || []) as ClientAddress[])
      setActivity((act.data || []) as ActivityEntry[])
    })
  }, [open, client, supabase])

  const update = useCallback((k: keyof ClientData, v: unknown) => {
    setForm(f => f ? { ...f, [k]: v as never } : f)
  }, [])

  const taxIdLabel = COUNTRIES.find(c => c.code === form?.country)?.taxIdLabel || 'Tax ID'
  const taxIdValidation = useMemo(() => form?.tax_id ? validators.taxId(form.tax_id, form.country) : { valid: true }, [form?.tax_id, form?.country])
  const emailValidation = useMemo(() => form?.email ? validators.email(form.email) : { valid: true }, [form?.email])

  const handleSave = async () => {
    if (!form?.id) return
    if (!taxIdValidation.valid || !emailValidation.valid) {
      addToast({ type: 'warning', title: 'Corregí los errores antes de guardar' }); return
    }
    setSaving(true)
    try {
      const payload: Partial<ClientData> = {
        name: form.name, trade_name: form.trade_name, legal_name: form.legal_name, tax_id: form.tax_id,
        email: form.email, phone: form.phone, whatsapp: form.whatsapp, website: form.website,
        address_street: form.address_street, address_number: form.address_number, address_floor: form.address_floor,
        address_apartment: form.address_apartment, postal_code: form.postal_code, city: form.city,
        state: form.state, country: form.country, address_references: form.address_references,
        category: form.category, payment_terms: form.payment_terms,
        credit_limit: form.credit_limit ? Number(form.credit_limit) : null,
        preferred_currency: form.preferred_currency, price_list_code: form.price_list_code,
        default_discount_pct: form.default_discount_pct ? Number(form.default_discount_pct) : null,
        scoring: form.scoring ? Number(form.scoring) : null,
        source: form.source, active: form.active, notes: form.notes,
      }
      const { error } = await supabase.from('tt_clients').update(payload).eq('id', form.id)
      if (error) throw error
      // Activity log
      await supabase.from('tt_activity_log').insert({
        entity_type: 'client', entity_id: form.id,
        action: 'updated', description: `Datos del cliente actualizados`,
      })
      addToast({ type: 'success', title: 'Cliente actualizado' })
      onSaved()
      onClose()
    } catch (e) {
      addToast({ type: 'error', title: 'Error', message: (e as Error).message })
    } finally {
      setSaving(false)
    }
  }

  // Contactos
  const newContact = (): ClientContact => ({ full_name: '', is_primary: contacts.length === 0, active: true })
  const saveContact = async () => {
    if (!editingContact || !form?.id) return
    if (!editingContact.full_name.trim()) { addToast({ type: 'warning', title: 'Nombre obligatorio' }); return }
    setSaving(true)
    try {
      const payload = { ...editingContact, client_id: form.id }
      const isNew = !editingContact.id
      const { error } = isNew
        ? await supabase.from('tt_client_contacts').insert(payload)
        : await supabase.from('tt_client_contacts').update(payload).eq('id', editingContact.id!)
      if (error) throw error
      const { data } = await supabase.from('tt_client_contacts').select('*').eq('client_id', form.id).order('is_primary', { ascending: false })
      setContacts((data || []) as ClientContact[])
      setEditingContact(null)
      addToast({ type: 'success', title: isNew ? 'Contacto agregado' : 'Contacto actualizado' })
    } catch (e) {
      addToast({ type: 'error', title: 'Error', message: (e as Error).message })
    } finally { setSaving(false) }
  }
  const deleteContact = async (id: string) => {
    if (!confirm('¿Eliminar este contacto?')) return
    await supabase.from('tt_client_contacts').delete().eq('id', id)
    setContacts(c => c.filter(x => x.id !== id))
  }

  // Direcciones
  const newAddress = (): ClientAddress => ({
    alias: '',
    type: 'shipping',
    country: form?.country,
    is_default_shipping: addresses.filter(a => a.is_default_shipping).length === 0,
    active: true,
  })
  const saveAddress = async () => {
    if (!editingAddress || !form?.id) return
    if (!editingAddress.alias.trim()) { addToast({ type: 'warning', title: 'Alias obligatorio' }); return }
    setSaving(true)
    try {
      const payload = { ...editingAddress, client_id: form.id }
      const isNew = !editingAddress.id
      const { error } = isNew
        ? await supabase.from('tt_client_addresses').insert(payload)
        : await supabase.from('tt_client_addresses').update(payload).eq('id', editingAddress.id!)
      if (error) throw error
      const { data } = await supabase.from('tt_client_addresses').select('*').eq('client_id', form.id).order('alias')
      setAddresses((data || []) as ClientAddress[])
      setEditingAddress(null)
      addToast({ type: 'success', title: 'Dirección guardada' })
    } catch (e) {
      addToast({ type: 'error', title: 'Error', message: (e as Error).message })
    } finally { setSaving(false) }
  }
  const deleteAddress = async (id: string) => {
    if (!confirm('¿Eliminar esta dirección?')) return
    await supabase.from('tt_client_addresses').delete().eq('id', id)
    setAddresses(a => a.filter(x => x.id !== id))
  }

  if (!form) return null

  const cat = CATEGORIES.find(c => c.value === form.category)
  const initials = (form.name || '?').split(' ').map(p => p[0]).slice(0, 2).join('').toUpperCase()

  return (
    <Modal isOpen={open} onClose={onClose} title="" size="xl">
      <div className="space-y-4">

        {/* ============ HEADER 360° ============ */}
        <div className="flex items-start gap-4 pb-4 border-b border-[#1E2330]">
          <div className="w-14 h-14 rounded-xl bg-gradient-to-br from-[#FF6600] to-[#E55A00] flex items-center justify-center shadow-lg shadow-orange-500/20 shrink-0">
            <span className="text-lg font-bold text-white">{initials}</span>
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <h2 className="text-lg font-bold text-[#F0F2F5]">{form.name || 'Sin nombre'}</h2>
              {form.trade_name && <span className="text-xs text-[#6B7280]">({form.trade_name})</span>}
              {cat && <Badge variant="default" size="sm">{cat.label.split('—')[0].trim()}</Badge>}
              {form.active === false && <Badge variant="danger" size="sm">Inactivo</Badge>}
              {(form.scoring ?? 0) > 0 && (
                <span className="text-[10px] font-bold text-yellow-400 flex items-center gap-1">
                  <Star size={10} fill="currentColor" /> {form.scoring}/100
                </span>
              )}
            </div>
            <p className="text-xs text-[#6B7280] mt-0.5">
              {[form.tax_id, COUNTRIES.find(c => c.code === form.country)?.name].filter(Boolean).join(' · ')}
            </p>
          </div>
          {/* KPIs rápidos */}
          {stats && (
            <div className="flex gap-3">
              <KPIInline label="Cotiz." value={stats.quotes_count} icon={<FileText size={11} />} />
              <KPIInline label="Pedidos" value={stats.orders_count} icon={<Receipt size={11} />} />
              <KPIInline label="Facturado" value={`$${stats.total_invoiced?.toLocaleString('es-AR') || 0}`} icon={<TrendingUp size={11} />} tone="emerald" />
              {stats.total_pending > 0 && (
                <KPIInline label="Pendiente" value={`$${stats.total_pending.toLocaleString('es-AR')}`} icon={<DollarSign size={11} />} tone="orange" />
              )}
            </div>
          )}
        </div>

        {/* ============ TABS ============ */}
        <div className="flex gap-1 p-1 bg-[#0A0D12] rounded-lg border border-[#1E2330] overflow-x-auto">
          {([
            { id: 'general',    label: 'General',     icon: User },
            { id: 'address',    label: 'Dirección',   icon: MapPin },
            { id: 'commercial', label: 'Comercial',   icon: DollarSign },
            { id: 'contacts',   label: 'Contactos',   icon: Users, count: contacts.length },
            { id: 'addresses',  label: 'Direcciones', icon: Building2, count: addresses.length },
            { id: 'activity',   label: 'Actividad',   icon: Activity, count: activity.length },
          ] as const).map(t => (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition whitespace-nowrap ${
                tab === t.id ? 'bg-[#FF6600] text-white' : 'text-[#6B7280] hover:text-[#F0F2F5] hover:bg-[#1E2330]'
              }`}
            >
              <t.icon size={12} /> {t.label}
              {('count' in t && (t as { count?: number }).count) ? (
                <span className={`text-[9px] px-1 rounded ${tab === t.id ? 'bg-white/20' : 'bg-[#1E2330]'}`}>
                  {(t as { count: number }).count}
                </span>
              ) : null}
            </button>
          ))}
        </div>

        {/* ============ TAB GENERAL ============ */}
        {tab === 'general' && (
          <div className="space-y-4">
            <SectionHeader icon={<User size={14} />} title="Identificación" />
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <Input label="Razón social *" value={form.name || ''} onChange={e => update('name', e.target.value)} />
              <Input label="Nombre de fantasía" value={form.trade_name || ''} onChange={e => update('trade_name', e.target.value)} />
              <Input label="Nombre legal completo" value={form.legal_name || ''} onChange={e => update('legal_name', e.target.value)} />
              <div>
                <label className="block text-sm font-medium text-[#9CA3AF] mb-1.5">País</label>
                <select
                  value={form.country || ''}
                  onChange={e => {
                    const c = COUNTRIES.find(x => x.code === e.target.value)
                    setForm(f => f ? { ...f, country: e.target.value, preferred_currency: c?.currency || f.preferred_currency } : f)
                  }}
                  className="w-full h-10 rounded-lg bg-[#1E2330] border border-[#2A3040] px-3 text-sm text-[#F0F2F5] focus:outline-none focus:ring-2 focus:ring-orange-500/50"
                >
                  <option value="">— Seleccionar —</option>
                  {COUNTRIES.map(c => <option key={c.code} value={c.code}>{c.name}</option>)}
                </select>
              </div>
              <ValidatedInput
                label={taxIdLabel + ' *'}
                value={form.tax_id || ''}
                onChange={v => update('tax_id', v)}
                validation={taxIdValidation}
                placeholder={form.country === 'AR' ? '20-12345678-9' : form.country === 'ES' ? 'B12345678' : ''}
              />
              <Input label="Categoría">
                <select
                  value={form.category || ''}
                  onChange={e => update('category', e.target.value || null)}
                  className="w-full h-10 rounded-lg bg-[#1E2330] border border-[#2A3040] px-3 text-sm text-[#F0F2F5]"
                >
                  <option value="">— Sin categoría —</option>
                  {CATEGORIES.map(c => <option key={c.value} value={c.value}>{c.label}</option>)}
                </select>
              </Input>
            </div>

            <SectionHeader icon={<Mail size={14} />} title="Contacto principal" />
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <ValidatedInput
                label="Email"
                value={form.email || ''}
                onChange={v => update('email', v)}
                validation={emailValidation}
                placeholder="contacto@empresa.com"
                type="email"
              />
              <Input label="Teléfono" value={form.phone || ''} onChange={e => update('phone', e.target.value)} placeholder="+54 11 1234-5678" />
              <Input label="WhatsApp" value={form.whatsapp || ''} onChange={e => update('whatsapp', e.target.value)} placeholder="+54 9 11 1234-5678" />
              <Input label="Sitio web" type="url" value={form.website || ''} onChange={e => update('website', e.target.value)} placeholder="https://empresa.com" />
            </div>

            <SectionHeader icon={<Hash size={14} />} title="Origen y notas" />
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div>
                <label className="block text-sm font-medium text-[#9CA3AF] mb-1.5">Origen</label>
                <select
                  value={form.source || ''}
                  onChange={e => update('source', e.target.value || null)}
                  className="w-full h-10 rounded-lg bg-[#1E2330] border border-[#2A3040] px-3 text-sm text-[#F0F2F5]"
                >
                  <option value="">— Sin definir —</option>
                  {SOURCES.map(s => <option key={s} value={s}>{s}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-[#9CA3AF] mb-1.5">Scoring (0-100)</label>
                <input
                  type="number" min="0" max="100"
                  value={form.scoring ?? ''}
                  onChange={e => update('scoring', e.target.value ? parseInt(e.target.value) : null)}
                  placeholder="ej: 85"
                  className="w-full h-10 rounded-lg bg-[#1E2330] border border-[#2A3040] px-3 text-sm text-[#F0F2F5]"
                />
              </div>
            </div>
            <div>
              <label className="block text-sm font-medium text-[#9CA3AF] mb-1.5">Notas internas</label>
              <textarea
                value={form.notes || ''}
                onChange={e => update('notes', e.target.value)}
                rows={3}
                placeholder="Observaciones, preferencias del cliente, historial informal..."
                className="w-full rounded-lg bg-[#1E2330] border border-[#2A3040] px-3 py-2 text-sm text-[#F0F2F5] resize-none focus:outline-none focus:ring-2 focus:ring-orange-500/50"
              />
            </div>
          </div>
        )}

        {/* ============ TAB DIRECCIÓN ============ */}
        {tab === 'address' && (
          <div className="space-y-4">
            <SectionHeader icon={<MapPin size={14} />} title="Dirección fiscal principal" />
            <div className="grid grid-cols-12 gap-3">
              <div className="col-span-7"><Input label="Calle / Vía" value={form.address_street || ''} onChange={e => update('address_street', e.target.value)} /></div>
              <div className="col-span-2"><Input label="Número" value={form.address_number || ''} onChange={e => update('address_number', e.target.value)} /></div>
              <div className="col-span-1"><Input label="Piso" value={form.address_floor || ''} onChange={e => update('address_floor', e.target.value)} /></div>
              <div className="col-span-2"><Input label="Depto" value={form.address_apartment || ''} onChange={e => update('address_apartment', e.target.value)} /></div>
            </div>
            <div className="grid grid-cols-12 gap-3">
              <div className="col-span-3"><Input label="CP / ZIP" value={form.postal_code || ''} onChange={e => update('postal_code', e.target.value)} /></div>
              <div className="col-span-5"><Input label="Ciudad" value={form.city || ''} onChange={e => update('city', e.target.value)} /></div>
              <div className="col-span-4"><Input label="Provincia / Estado" value={form.state || ''} onChange={e => update('state', e.target.value)} /></div>
            </div>
            <div>
              <label className="block text-sm font-medium text-[#9CA3AF] mb-1.5">Referencias</label>
              <textarea
                value={form.address_references || ''}
                onChange={e => update('address_references', e.target.value)}
                rows={2}
                placeholder="Entre calles, edificio, indicaciones para llegar..."
                className="w-full rounded-lg bg-[#1E2330] border border-[#2A3040] px-3 py-2 text-sm text-[#F0F2F5] resize-none focus:outline-none focus:ring-2 focus:ring-orange-500/50"
              />
            </div>
            <div className="p-3 rounded-lg bg-[#0F1218] border border-[#1E2330]">
              <p className="text-[10px] uppercase text-[#6B7280] mb-1">Vista previa (factura/cotización)</p>
              <p className="text-sm text-[#F0F2F5]">
                {[
                  [form.address_street, form.address_number].filter(Boolean).join(' '),
                  [form.address_floor && `Piso ${form.address_floor}`, form.address_apartment && `Depto ${form.address_apartment}`].filter(Boolean).join(' · '),
                  [form.postal_code, form.city, form.state].filter(Boolean).join(', '),
                  COUNTRIES.find(c => c.code === form.country)?.name,
                ].filter(Boolean).join(' — ') || <span className="text-[#4B5563] italic">(sin dirección)</span>}
              </p>
            </div>
          </div>
        )}

        {/* ============ TAB COMERCIAL ============ */}
        {tab === 'commercial' && (
          <div className="space-y-4">
            <SectionHeader icon={<DollarSign size={14} />} title="Términos comerciales" />
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div>
                <label className="block text-sm font-medium text-[#9CA3AF] mb-1.5">Condición de pago</label>
                <select
                  value={form.payment_terms || ''}
                  onChange={e => update('payment_terms', e.target.value || null)}
                  className="w-full h-10 rounded-lg bg-[#1E2330] border border-[#2A3040] px-3 text-sm text-[#F0F2F5]"
                >
                  <option value="">— Sin definir —</option>
                  {PAYMENT_TERMS.map(p => <option key={p} value={p}>{p}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-[#9CA3AF] mb-1.5">Moneda preferida</label>
                <select
                  value={form.preferred_currency || ''}
                  onChange={e => update('preferred_currency', e.target.value || null)}
                  className="w-full h-10 rounded-lg bg-[#1E2330] border border-[#2A3040] px-3 text-sm text-[#F0F2F5]"
                >
                  <option value="">— Sin definir —</option>
                  {['ARS','USD','EUR','GBP','BRL','CLP','UYU'].map(c => <option key={c} value={c}>{c}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-[#9CA3AF] mb-1.5">Lista de precios</label>
                <select
                  value={form.price_list_code || ''}
                  onChange={e => update('price_list_code', e.target.value || null)}
                  className="w-full h-10 rounded-lg bg-[#1E2330] border border-[#2A3040] px-3 text-sm text-[#F0F2F5]"
                >
                  <option value="">PVP (default)</option>
                  <option value="cliente_a">Cliente A</option>
                  <option value="distribuidor">Distribuidor</option>
                </select>
              </div>
              <Input
                label="Descuento default (%)"
                type="number"
                value={form.default_discount_pct ?? ''}
                onChange={e => update('default_discount_pct', e.target.value ? parseFloat(e.target.value) : null)}
                placeholder="ej: 10"
              />
              <Input
                label="Límite de crédito"
                type="number"
                value={form.credit_limit ?? ''}
                onChange={e => update('credit_limit', e.target.value ? parseFloat(e.target.value) : null)}
                placeholder="ej: 500000"
              />
            </div>

            {stats && (
              <>
                <SectionHeader icon={<TrendingUp size={14} />} title="Resumen comercial" />
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                  <StatBox label="Cotizaciones" value={stats.quotes_count} icon={<FileText size={14} />} />
                  <StatBox label="Pedidos" value={stats.orders_count} icon={<Receipt size={14} />} />
                  <StatBox label="Facturado" value={`$${(stats.total_invoiced || 0).toLocaleString('es-AR')}`} icon={<TrendingUp size={14} />} tone="emerald" />
                  <StatBox label="Pendiente" value={`$${(stats.total_pending || 0).toLocaleString('es-AR')}`} icon={<DollarSign size={14} />} tone={stats.total_pending > 0 ? 'orange' : 'gray'} />
                </div>
              </>
            )}
          </div>
        )}

        {/* ============ TAB CONTACTOS ============ */}
        {tab === 'contacts' && (
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <SectionHeader icon={<Users size={14} />} title={`Contactos (${contacts.length})`} />
              {!editingContact && (
                <Button size="sm" onClick={() => setEditingContact(newContact())}>
                  <Plus size={12} /> Nuevo contacto
                </Button>
              )}
            </div>
            {editingContact ? (
              <ContactForm contact={editingContact} onChange={setEditingContact} onSave={saveContact} onCancel={() => setEditingContact(null)} saving={saving} />
            ) : contacts.length === 0 ? (
              <EmptyState icon={<Users size={32} />} text="No hay contactos cargados" sub="Agregá personas que se comunican con vos en esta empresa" />
            ) : (
              <div className="space-y-2">
                {contacts.map(c => (
                  <ContactCard key={c.id} contact={c} onEdit={() => setEditingContact(c)} onDelete={() => c.id && deleteContact(c.id)} />
                ))}
              </div>
            )}
          </div>
        )}

        {/* ============ TAB DIRECCIONES ============ */}
        {tab === 'addresses' && (
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <SectionHeader icon={<Building2 size={14} />} title={`Direcciones (${addresses.length})`} />
              {!editingAddress && (
                <Button size="sm" onClick={() => setEditingAddress(newAddress())}>
                  <Plus size={12} /> Nueva dirección
                </Button>
              )}
            </div>
            {editingAddress ? (
              <AddressForm address={editingAddress} onChange={setEditingAddress} onSave={saveAddress} onCancel={() => setEditingAddress(null)} saving={saving} />
            ) : addresses.length === 0 ? (
              <EmptyState icon={<Building2 size={32} />} text="Sin direcciones de entrega/sucursal" sub="Agregá direcciones para usar en remitos" />
            ) : (
              <div className="space-y-2">
                {addresses.map(a => (
                  <AddressCard key={a.id} address={a} onEdit={() => setEditingAddress(a)} onDelete={() => a.id && deleteAddress(a.id)} />
                ))}
              </div>
            )}
          </div>
        )}

        {/* ============ TAB ACTIVIDAD ============ */}
        {tab === 'activity' && (
          <div className="space-y-3">
            <SectionHeader icon={<Activity size={14} />} title="Timeline de actividad" />
            {activity.length === 0 ? (
              <EmptyState icon={<Activity size={32} />} text="Sin actividad registrada" sub="Las acciones del sistema aparecerán aquí" />
            ) : (
              <div className="space-y-2 relative pl-6 before:absolute before:left-2 before:top-2 before:bottom-2 before:w-px before:bg-[#1E2330]">
                {activity.map(a => (
                  <div key={a.id} className="relative flex gap-3">
                    <div className="absolute -left-[1.25rem] top-1.5 w-2.5 h-2.5 rounded-full bg-[#FF6600] ring-4 ring-[#0A0D12]" />
                    <div className="flex-1 rounded-lg bg-[#0F1218] border border-[#1E2330] p-2.5">
                      <div className="flex items-center gap-2 flex-wrap">
                        <Badge variant="default" size="sm">{a.action}</Badge>
                        <span className="text-[10px] text-[#6B7280]">
                          {new Date(a.created_at).toLocaleString('es-AR')}
                        </span>
                      </div>
                      {a.description && <p className="text-xs text-[#D1D5DB] mt-1">{a.description}</p>}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* ============ FOOTER ============ */}
        <div className="flex justify-between items-center pt-4 border-t border-[#1E2330]">
          <label className="flex items-center gap-2 text-xs text-[#9CA3AF] cursor-pointer">
            <input
              type="checkbox"
              checked={form.active !== false}
              onChange={e => update('active', e.target.checked)}
              className="w-4 h-4 rounded border-[#2A3040] bg-[#1E2330] accent-emerald-500"
            />
            Cliente activo
          </label>
          <div className="flex gap-3">
            <Button variant="secondary" onClick={onClose}>Cancelar</Button>
            {tab !== 'contacts' && tab !== 'addresses' && tab !== 'activity' && (
              <Button onClick={handleSave} loading={saving}>
                <Save size={14} /> Guardar
              </Button>
            )}
          </div>
        </div>
      </div>
    </Modal>
  )
}

// ================================================================
// SUBCOMPONENTES
// ================================================================

function SectionHeader({ icon, title }: { icon: React.ReactNode; title: string }) {
  return (
    <div className="flex items-center gap-2">
      <span className="text-[#FF6600]">{icon}</span>
      <span className="text-[10px] font-bold uppercase tracking-wider text-[#FF6600]">{title}</span>
      <div className="flex-1 h-px bg-[#1E2330]" />
    </div>
  )
}

function ValidatedInput({ label, value, onChange, validation, placeholder, type = 'text' }: {
  label: string
  value: string
  onChange: (v: string) => void
  validation: { valid: boolean; msg?: string }
  placeholder?: string
  type?: string
}) {
  return (
    <div>
      <label className="block text-sm font-medium text-[#9CA3AF] mb-1.5">
        {label} {!validation.valid && <span className="text-red-400">⚠</span>}
      </label>
      <input
        type={type}
        value={value}
        onChange={e => onChange(e.target.value)}
        placeholder={placeholder}
        className={`w-full h-10 rounded-lg bg-[#1E2330] border px-3 text-sm text-[#F0F2F5] focus:outline-none focus:ring-2 transition ${
          !validation.valid ? 'border-red-500/50 focus:ring-red-500/50' : 'border-[#2A3040] focus:ring-orange-500/50'
        }`}
      />
      {!validation.valid && <p className="text-[10px] text-red-400 mt-1 flex items-center gap-1"><AlertCircle size={10} /> {validation.msg}</p>}
    </div>
  )
}

function KPIInline({ label, value, icon, tone = 'gray' }: { label: string; value: number | string; icon: React.ReactNode; tone?: 'gray'|'emerald'|'orange' }) {
  const colors = { gray: 'text-[#9CA3AF]', emerald: 'text-emerald-400', orange: 'text-orange-400' }
  return (
    <div className="text-right shrink-0">
      <div className="flex items-center gap-1 text-[9px] uppercase text-[#6B7280] justify-end">
        {icon} {label}
      </div>
      <div className={`text-sm font-bold font-mono ${colors[tone]}`}>{value}</div>
    </div>
  )
}

function StatBox({ label, value, icon, tone = 'gray' }: { label: string; value: number | string; icon: React.ReactNode; tone?: 'gray'|'emerald'|'orange' }) {
  const colors = {
    gray: { border: 'border-[#1E2330]', text: 'text-[#F0F2F5]', icon: 'text-[#6B7280]' },
    emerald: { border: 'border-emerald-500/20', text: 'text-emerald-400', icon: 'text-emerald-400' },
    orange: { border: 'border-orange-500/20', text: 'text-orange-400', icon: 'text-orange-400' },
  }[tone]
  return (
    <div className={`p-3 rounded-lg bg-[#0F1218] border ${colors.border}`}>
      <div className={`flex items-center gap-1.5 text-[10px] uppercase ${colors.icon}`}>
        {icon} {label}
      </div>
      <div className={`text-lg font-bold font-mono ${colors.text} mt-1`}>{value}</div>
    </div>
  )
}

function EmptyState({ icon, text, sub }: { icon: React.ReactNode; text: string; sub?: string }) {
  return (
    <div className="rounded-lg border border-dashed border-[#2A3040] bg-[#0A0D12] p-8 text-center">
      <div className="text-[#3A4050] mx-auto mb-3 inline-block">{icon}</div>
      <p className="text-sm text-[#6B7280]">{text}</p>
      {sub && <p className="text-xs text-[#4B5563] mt-1">{sub}</p>}
    </div>
  )
}

function ContactCard({ contact, onEdit, onDelete }: { contact: ClientContact; onEdit: () => void; onDelete: () => void }) {
  return (
    <div className="rounded-lg border border-[#1E2330] bg-[#0F1218] p-3 flex items-start gap-3">
      <div className="w-9 h-9 rounded-lg bg-blue-500/10 border border-blue-500/30 flex items-center justify-center shrink-0">
        <User size={14} className="text-blue-400" />
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <p className="text-sm font-semibold text-[#F0F2F5]">{contact.full_name}</p>
          {contact.is_primary && <Badge variant="warning" size="sm"><Star size={10} className="inline" /> Principal</Badge>}
          {contact.receives_quotes && <Badge variant="info" size="sm">Cotizaciones</Badge>}
          {contact.receives_invoices && <Badge variant="info" size="sm">Facturas</Badge>}
          {contact.is_collections && <Badge variant="default" size="sm">Cobranzas</Badge>}
        </div>
        {contact.position && <p className="text-xs text-[#9CA3AF] mt-0.5">{contact.position}</p>}
        <div className="flex items-center gap-3 mt-1 text-[11px] text-[#6B7280] flex-wrap">
          {contact.email && <span className="flex items-center gap-1"><Mail size={10} /> {contact.email}</span>}
          {contact.phone && <span className="flex items-center gap-1"><Phone size={10} /> {contact.phone}</span>}
          {contact.whatsapp && <span className="flex items-center gap-1">📱 {contact.whatsapp}</span>}
        </div>
      </div>
      <div className="flex gap-1">
        <button onClick={onEdit} className="px-3 h-8 rounded-lg hover:bg-[#1E2330] text-xs text-[#9CA3AF]">Editar</button>
        <button onClick={onDelete} className="w-8 h-8 rounded-lg hover:bg-red-500/10 flex items-center justify-center text-[#6B7280] hover:text-red-400">
          <Trash2 size={13} />
        </button>
      </div>
    </div>
  )
}

function ContactForm({ contact, onChange, onSave, onCancel, saving }: {
  contact: ClientContact
  onChange: (c: ClientContact) => void
  onSave: () => void
  onCancel: () => void
  saving: boolean
}) {
  const upd = (k: keyof ClientContact, v: unknown) => onChange({ ...contact, [k]: v as never })
  return (
    <div className="rounded-lg border border-[#FF6600]/30 bg-[#FF6600]/5 p-4 space-y-3">
      <p className="text-xs font-bold uppercase text-[#FF6600]">{contact.id ? 'Editar contacto' : 'Nuevo contacto'}</p>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <Input label="Nombre completo *" value={contact.full_name} onChange={e => upd('full_name', e.target.value)} />
        <Input label="Cargo" value={contact.position || ''} onChange={e => upd('position', e.target.value)} placeholder="ej: Jefe de Compras" />
        <Input label="Email" type="email" value={contact.email || ''} onChange={e => upd('email', e.target.value)} />
        <Input label="Teléfono fijo" value={contact.phone || ''} onChange={e => upd('phone', e.target.value)} />
        <Input label="Móvil" value={contact.mobile || ''} onChange={e => upd('mobile', e.target.value)} />
        <Input label="WhatsApp" value={contact.whatsapp || ''} onChange={e => upd('whatsapp', e.target.value)} />
      </div>
      <div className="border-t border-[#1E2330] pt-3 space-y-2">
        <p className="text-[10px] uppercase text-[#9CA3AF]">Recibe automáticamente:</p>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
          {[
            { key: 'is_primary',         label: 'Principal' },
            { key: 'receives_quotes',    label: 'Cotizaciones' },
            { key: 'receives_invoices',  label: 'Facturas' },
            { key: 'receives_remitos',   label: 'Remitos' },
            { key: 'is_collections',     label: 'Cobranzas' },
          ].map(({ key, label }) => (
            <label key={key} className="flex items-center gap-2 text-xs text-[#9CA3AF] cursor-pointer">
              <input
                type="checkbox"
                checked={!!(contact as unknown as Record<string, unknown>)[key]}
                onChange={e => upd(key as keyof ClientContact, e.target.checked)}
                className="w-4 h-4 rounded border-[#2A3040] bg-[#1E2330] accent-orange-500"
              />
              {label}
            </label>
          ))}
        </div>
      </div>
      <div className="flex justify-end gap-2 pt-2 border-t border-[#1E2330]">
        <Button variant="secondary" size="sm" onClick={onCancel} disabled={saving}>Cancelar</Button>
        <Button size="sm" onClick={onSave} loading={saving}>
          <Save size={12} /> {contact.id ? 'Actualizar' : 'Agregar'}
        </Button>
      </div>
    </div>
  )
}

function AddressCard({ address, onEdit, onDelete }: { address: ClientAddress; onEdit: () => void; onDelete: () => void }) {
  const fullAddress = [
    [address.street, address.number].filter(Boolean).join(' '),
    [address.postal_code, address.city, address.state].filter(Boolean).join(', '),
  ].filter(Boolean).join(' — ')
  const typeLabel = { billing: 'Facturación', shipping: 'Entrega', branch: 'Sucursal', site: 'Obra', other: 'Otra' }[address.type || 'other']
  return (
    <div className="rounded-lg border border-[#1E2330] bg-[#0F1218] p-3 flex items-start gap-3">
      <div className="w-9 h-9 rounded-lg bg-violet-500/10 border border-violet-500/30 flex items-center justify-center shrink-0">
        <Building2 size={14} className="text-violet-400" />
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <p className="text-sm font-semibold text-[#F0F2F5]">{address.alias}</p>
          <Badge variant="default" size="sm">{typeLabel}</Badge>
          {address.is_default_billing && <Badge variant="warning" size="sm"><Star size={10} className="inline" /> Facturación</Badge>}
          {address.is_default_shipping && <Badge variant="warning" size="sm"><Star size={10} className="inline" /> Entrega</Badge>}
        </div>
        <p className="text-xs text-[#9CA3AF] mt-0.5">{fullAddress || <span className="italic text-[#4B5563]">(sin dirección)</span>}</p>
        {address.contact_name && <p className="text-[11px] text-[#6B7280] mt-1">Recibe: {address.contact_name}</p>}
      </div>
      <div className="flex gap-1">
        <button onClick={onEdit} className="px-3 h-8 rounded-lg hover:bg-[#1E2330] text-xs text-[#9CA3AF]">Editar</button>
        <button onClick={onDelete} className="w-8 h-8 rounded-lg hover:bg-red-500/10 flex items-center justify-center text-[#6B7280] hover:text-red-400">
          <Trash2 size={13} />
        </button>
      </div>
    </div>
  )
}

function AddressForm({ address, onChange, onSave, onCancel, saving }: {
  address: ClientAddress
  onChange: (a: ClientAddress) => void
  onSave: () => void
  onCancel: () => void
  saving: boolean
}) {
  const upd = (k: keyof ClientAddress, v: unknown) => onChange({ ...address, [k]: v as never })
  return (
    <div className="rounded-lg border border-[#FF6600]/30 bg-[#FF6600]/5 p-4 space-y-3">
      <p className="text-xs font-bold uppercase text-[#FF6600]">{address.id ? 'Editar dirección' : 'Nueva dirección'}</p>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <Input label="Alias *" value={address.alias} onChange={e => upd('alias', e.target.value)} placeholder="ej: Sucursal Buenos Aires" />
        <div>
          <label className="block text-sm font-medium text-[#9CA3AF] mb-1.5">Tipo</label>
          <select
            value={address.type || 'shipping'}
            onChange={e => upd('type', e.target.value)}
            className="w-full h-10 rounded-lg bg-[#1E2330] border border-[#2A3040] px-3 text-sm text-[#F0F2F5]"
          >
            <option value="billing">Facturación</option>
            <option value="shipping">Entrega</option>
            <option value="branch">Sucursal</option>
            <option value="site">Obra</option>
            <option value="other">Otra</option>
          </select>
        </div>
      </div>
      <div className="grid grid-cols-12 gap-3">
        <div className="col-span-7"><Input label="Calle / Vía" value={address.street || ''} onChange={e => upd('street', e.target.value)} /></div>
        <div className="col-span-2"><Input label="Número" value={address.number || ''} onChange={e => upd('number', e.target.value)} /></div>
        <div className="col-span-1"><Input label="Piso" value={address.floor || ''} onChange={e => upd('floor', e.target.value)} /></div>
        <div className="col-span-2"><Input label="Depto" value={address.apartment || ''} onChange={e => upd('apartment', e.target.value)} /></div>
      </div>
      <div className="grid grid-cols-12 gap-3">
        <div className="col-span-3"><Input label="CP" value={address.postal_code || ''} onChange={e => upd('postal_code', e.target.value)} /></div>
        <div className="col-span-5"><Input label="Ciudad" value={address.city || ''} onChange={e => upd('city', e.target.value)} /></div>
        <div className="col-span-4"><Input label="Provincia/Estado" value={address.state || ''} onChange={e => upd('state', e.target.value)} /></div>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <Input label="Persona que recibe" value={address.contact_name || ''} onChange={e => upd('contact_name', e.target.value)} />
        <Input label="Teléfono de la dirección" value={address.phone || ''} onChange={e => upd('phone', e.target.value)} />
      </div>
      <div>
        <label className="block text-sm font-medium text-[#9CA3AF] mb-1.5">Referencias</label>
        <textarea
          value={address.references_text || ''}
          onChange={e => upd('references_text', e.target.value)}
          rows={2}
          className="w-full rounded-lg bg-[#1E2330] border border-[#2A3040] px-3 py-2 text-sm text-[#F0F2F5] resize-none"
        />
      </div>
      <div className="flex flex-wrap gap-3 pt-2">
        <label className="flex items-center gap-2 text-xs text-[#9CA3AF] cursor-pointer">
          <input
            type="checkbox"
            checked={!!address.is_default_billing}
            onChange={e => upd('is_default_billing', e.target.checked)}
            className="w-4 h-4 rounded border-[#2A3040] bg-[#1E2330] accent-orange-500"
          />
          Default para facturación
        </label>
        <label className="flex items-center gap-2 text-xs text-[#9CA3AF] cursor-pointer">
          <input
            type="checkbox"
            checked={!!address.is_default_shipping}
            onChange={e => upd('is_default_shipping', e.target.checked)}
            className="w-4 h-4 rounded border-[#2A3040] bg-[#1E2330] accent-orange-500"
          />
          Default para entregas
        </label>
      </div>
      <div className="flex justify-end gap-2 pt-2 border-t border-[#1E2330]">
        <Button variant="secondary" size="sm" onClick={onCancel} disabled={saving}>Cancelar</Button>
        <Button size="sm" onClick={onSave} loading={saving}>
          <Save size={12} /> {address.id ? 'Actualizar' : 'Agregar'}
        </Button>
      </div>
    </div>
  )
}
