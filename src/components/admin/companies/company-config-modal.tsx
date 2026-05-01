'use client'

/**
 * CompanyConfigModal — UI profesional para configurar una empresa.
 * Inspirado en Stripe / Amazon Seller Central / MercadoLibre.
 *
 * 4 pestañas:
 * - GENERAL    : nombres, identificación fiscal, país, parámetros operativos
 * - DIRECCIÓN  : campos diferenciados (calle, número, piso, ciudad, etc)
 * - FISCAL     : régimen, IVA, año fiscal, factura electrónica
 * - BANCO      : multi-cuenta con validación por país (CBU, IBAN, ABA, SWIFT)
 */

import { useEffect, useState, useCallback } from 'react'
import { Modal } from '@/components/ui/modal'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { useToast } from '@/components/ui/toast'
import { createClient } from '@/lib/supabase/client'
import {
  Building2, MapPin, Receipt, Banknote, Save, Plus, Trash2,
  Star, AlertCircle, CheckCircle2, Globe2, Hash, Mail, Phone, Sparkles,
} from 'lucide-react'

export interface CompanyConfigData {
  id: string
  name?: string | null
  trade_name?: string | null
  legal_name?: string | null
  tax_id?: string | null
  country?: string | null
  email_main?: string | null
  phone?: string | null
  website?: string | null
  default_tax_rate?: number | string | null
  default_margin?: number | string | null
  currency?: string | null
  legal_form?: string | null
  fiscal_year_start?: string | null
  timezone?: string | null
  // Dirección estructurada
  address_street?: string | null
  address_number?: string | null
  address_floor?: string | null
  address_apartment?: string | null
  address_postal_code?: string | null
  address_city?: string | null
  address_state?: string | null
  address_references?: string | null
  // Legacy (texto único, usado para detectar empresas no migradas)
  address?: string | null
  iban?: string | null
}

interface BankAccount {
  id?: string
  alias: string
  bank_name: string
  bank_country?: string | null
  account_holder: string
  account_holder_tax_id?: string | null
  account_type?: 'checking' | 'savings' | 'business' | 'other' | null
  currency: 'ARS' | 'EUR' | 'USD' | 'GBP' | 'BRL' | 'CLP' | 'UYU'
  iban?: string | null
  bic_swift?: string | null
  cbu?: string | null
  cbu_alias?: string | null
  account_number?: string | null
  routing_number?: string | null
  is_default?: boolean
  is_active?: boolean
  notes?: string | null
}

interface Props {
  open: boolean
  onClose: () => void
  company: CompanyConfigData | null
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

const LEGAL_FORMS_BY_COUNTRY: Record<string, string[]> = {
  AR: ['SA', 'SRL', 'SAS', 'Monotributista', 'Responsable Inscripto'],
  ES: ['SL', 'SA', 'SLU', 'SAU', 'Autónomo', 'Cooperativa'],
  US: ['LLC', 'Corp', 'S-Corp', 'Sole Proprietor', 'Partnership'],
}

const CURRENCIES: BankAccount['currency'][] = ['ARS', 'EUR', 'USD', 'GBP', 'BRL', 'CLP', 'UYU']

// ================================================================
// VALIDADORES
// ================================================================
const validators = {
  iban: (v: string): { valid: boolean; msg?: string } => {
    if (!v) return { valid: true }
    const clean = v.replace(/\s/g, '').toUpperCase()
    if (!/^[A-Z]{2}\d{2}[A-Z0-9]{11,30}$/.test(clean)) {
      return { valid: false, msg: 'IBAN inválido. Formato: ESxx + 22 dígitos para España' }
    }
    return { valid: true }
  },
  cbu: (v: string): { valid: boolean; msg?: string } => {
    if (!v) return { valid: true }
    const clean = v.replace(/\D/g, '')
    if (clean.length !== 22) return { valid: false, msg: 'CBU debe tener 22 dígitos' }
    return { valid: true }
  },
  bic: (v: string): { valid: boolean; msg?: string } => {
    if (!v) return { valid: true }
    if (!/^[A-Z]{6}[A-Z0-9]{2}([A-Z0-9]{3})?$/.test(v.toUpperCase())) {
      return { valid: false, msg: 'BIC/SWIFT inválido. Formato: 8 u 11 caracteres' }
    }
    return { valid: true }
  },
  routingUS: (v: string): { valid: boolean; msg?: string } => {
    if (!v) return { valid: true }
    if (!/^\d{9}$/.test(v.replace(/\D/g, ''))) {
      return { valid: false, msg: 'Routing number USA debe tener 9 dígitos' }
    }
    return { valid: true }
  },
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
export function CompanyConfigModal({ open, onClose, company, onSaved }: Props) {
  const supabase = createClient()
  const { addToast } = useToast()

  const [tab, setTab] = useState<'general' | 'address' | 'fiscal' | 'bank'>('general')
  const [form, setForm] = useState<CompanyConfigData | null>(null)
  const [accounts, setAccounts] = useState<BankAccount[]>([])
  const [editingAccount, setEditingAccount] = useState<BankAccount | null>(null)
  const [saving, setSaving] = useState(false)
  const [migrating, setMigrating] = useState(false)

  useEffect(() => {
    if (!open || !company) return
    setForm({ ...company })
    setTab('general')
    setEditingAccount(null)
    // Cargar cuentas bancarias
    void supabase
      .from('tt_company_bank_accounts')
      .select('*')
      .eq('company_id', company.id)
      .order('is_default', { ascending: false })
      .order('alias')
      .then(({ data }) => setAccounts((data || []) as BankAccount[]))
  }, [open, company, supabase])

  const update = useCallback((k: keyof CompanyConfigData, v: unknown) => {
    setForm(f => f ? { ...f, [k]: v as never } : f)
  }, [])

  const handleCountryChange = useCallback((code: string) => {
    const c = COUNTRIES.find(x => x.code === code)
    setForm(f => f ? { ...f, country: code, currency: c?.currency || f.currency } : f)
  }, [])

  const taxIdLabel = COUNTRIES.find(c => c.code === form?.country)?.taxIdLabel || 'Tax ID'
  const taxIdValidation = form?.tax_id ? validators.taxId(form.tax_id, form.country) : { valid: true }
  const emailValidation = form?.email_main ? validators.email(form.email_main) : { valid: true }

  // ----------------- MIGRACIÓN LEGACY -----------------
  const hasLegacyData = !!(form?.address || form?.iban) && !form?.address_street
  const handleMigrateLegacy = async () => {
    if (!form?.id) return
    setMigrating(true)
    try {
      const res = await fetch('/api/admin/migrate-company-data', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ companyId: form.id }),
      })
      const j = await res.json()
      if (!res.ok) throw new Error(j.error || 'Error en la migración')
      // Recargar datos de la empresa
      const { data } = await supabase.from('tt_companies').select('*').eq('id', form.id).single()
      if (data) setForm(data as CompanyConfigData)
      // Recargar cuentas (puede haberse creado una nueva)
      const { data: accs } = await supabase
        .from('tt_company_bank_accounts').select('*').eq('company_id', form.id)
        .order('is_default', { ascending: false })
      setAccounts((accs || []) as BankAccount[])
      addToast({
        type: 'success',
        title: 'Datos migrados con IA',
        message: j.results?.[0]?.confidence ? `Confianza: ${(j.results[0].confidence * 100).toFixed(0)}% · Costo: $${j.results[0].cost?.toFixed(4) || '0'}` : undefined,
      })
    } catch (e) {
      addToast({ type: 'error', title: 'Error migrando', message: (e as Error).message })
    } finally {
      setMigrating(false)
    }
  }

  // ----------------- SAVE -----------------
  const handleSave = async () => {
    if (!form?.id) return
    setSaving(true)
    try {
      const payload: Partial<CompanyConfigData> = {
        name: form.name,
        trade_name: form.trade_name,
        legal_name: form.legal_name,
        tax_id: form.tax_id,
        country: form.country,
        email_main: form.email_main,
        phone: form.phone,
        website: form.website,
        default_tax_rate: form.default_tax_rate ? Number(form.default_tax_rate) : null,
        default_margin: form.default_margin ? Number(form.default_margin) : null,
        currency: form.currency,
        legal_form: form.legal_form,
        fiscal_year_start: form.fiscal_year_start,
        timezone: form.timezone,
        address_street: form.address_street,
        address_number: form.address_number,
        address_floor: form.address_floor,
        address_apartment: form.address_apartment,
        address_postal_code: form.address_postal_code,
        address_city: form.address_city,
        address_state: form.address_state,
        address_references: form.address_references,
      }
      const { error } = await supabase.from('tt_companies').update(payload).eq('id', form.id)
      if (error) throw error
      addToast({ type: 'success', title: 'Empresa actualizada' })
      onSaved()
      onClose()
    } catch (e) {
      addToast({ type: 'error', title: 'Error guardando', message: (e as Error).message })
    } finally {
      setSaving(false)
    }
  }

  // ----------------- CUENTAS BANCARIAS -----------------
  const newAccount = (): BankAccount => ({
    alias: '',
    bank_name: '',
    account_holder: form?.legal_name || form?.name || '',
    account_holder_tax_id: form?.tax_id ?? null,
    currency: (form?.currency as BankAccount['currency']) || 'ARS',
    bank_country: form?.country,
    is_default: accounts.length === 0,
    is_active: true,
  })

  const saveAccount = async () => {
    if (!editingAccount || !form?.id) return
    if (!editingAccount.alias.trim() || !editingAccount.bank_name.trim() || !editingAccount.account_holder.trim()) {
      addToast({ type: 'warning', title: 'Completá alias, banco y titular' })
      return
    }
    setSaving(true)
    try {
      const payload = { ...editingAccount, company_id: form.id }
      const isNew = !editingAccount.id
      const { error } = isNew
        ? await supabase.from('tt_company_bank_accounts').insert(payload)
        : await supabase.from('tt_company_bank_accounts').update(payload).eq('id', editingAccount.id!)
      if (error) throw error
      addToast({ type: 'success', title: isNew ? 'Cuenta agregada' : 'Cuenta actualizada' })
      // Recargar
      const { data } = await supabase
        .from('tt_company_bank_accounts')
        .select('*')
        .eq('company_id', form.id)
        .order('is_default', { ascending: false })
        .order('alias')
      setAccounts((data || []) as BankAccount[])
      setEditingAccount(null)
    } catch (e) {
      addToast({ type: 'error', title: 'Error', message: (e as Error).message })
    } finally {
      setSaving(false)
    }
  }

  const deleteAccount = async (id: string) => {
    if (!confirm('¿Eliminar esta cuenta bancaria?')) return
    const { error } = await supabase.from('tt_company_bank_accounts').delete().eq('id', id)
    if (error) {
      addToast({ type: 'error', title: 'Error', message: error.message }); return
    }
    setAccounts(a => a.filter(x => x.id !== id))
    addToast({ type: 'success', title: 'Cuenta eliminada' })
  }

  const setAsDefault = async (id: string, currency: string) => {
    if (!form?.id) return
    // Quitar default de las demás de la misma moneda
    await supabase
      .from('tt_company_bank_accounts')
      .update({ is_default: false })
      .eq('company_id', form.id)
      .eq('currency', currency)
    await supabase.from('tt_company_bank_accounts').update({ is_default: true }).eq('id', id)
    const { data } = await supabase
      .from('tt_company_bank_accounts')
      .select('*')
      .eq('company_id', form.id)
      .order('is_default', { ascending: false })
      .order('alias')
    setAccounts((data || []) as BankAccount[])
  }

  if (!form) return null

  return (
    <Modal isOpen={open} onClose={onClose} title="Configurar empresa" size="xl">
      <div className="space-y-4">
        {/* Header con nombre */}
        <div className="flex items-center gap-3 pb-2 border-b border-[#1E2330]">
          <div className="w-10 h-10 rounded-lg bg-[#FF6600]/15 border border-[#FF6600]/30 flex items-center justify-center">
            <Building2 size={18} className="text-[#FF6600]" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold text-[#F0F2F5] truncate">{form.name || 'Sin nombre'}</p>
            <p className="text-[10px] text-[#6B7280]">{form.tax_id || ''} · {form.country || ''}</p>
          </div>
        </div>

        {/* Banner de migración cuando detecta datos legacy */}
        {hasLegacyData && (
          <div className="rounded-xl bg-gradient-to-r from-violet-500/10 to-blue-500/10 border border-violet-500/30 p-4 space-y-3">
            <div className="flex items-start gap-3">
              <div className="w-9 h-9 rounded-lg bg-violet-500/20 border border-violet-500/40 flex items-center justify-center shrink-0">
                <Sparkles size={16} className="text-violet-300" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold text-violet-200">Esta empresa tiene datos en formato legacy</p>
                <p className="text-xs text-[#9CA3AF] mt-0.5">
                  La dirección y los datos bancarios están guardados como texto único.
                  Click <strong>"Migrar con IA"</strong> y Claude los va a parsear automáticamente
                  en los campos estructurados (calle, número, ciudad, IBAN/CBU, etc.).
                </p>
                {form.address && (
                  <div className="mt-2 p-2 rounded bg-[#0F1218] border border-[#1E2330]">
                    <p className="text-[10px] uppercase text-[#6B7280] mb-1">Dirección legacy actual</p>
                    <p className="text-xs text-[#D1D5DB]">{form.address}</p>
                  </div>
                )}
              </div>
              <Button
                size="sm"
                onClick={handleMigrateLegacy}
                loading={migrating}
                disabled={migrating}
              >
                <Sparkles size={12} /> Migrar con IA
              </Button>
            </div>
          </div>
        )}

        {/* Tabs */}
        <div className="flex gap-1 p-1 bg-[#0A0D12] rounded-lg border border-[#1E2330]">
          {([
            { id: 'general', label: 'General', icon: Building2 },
            { id: 'address', label: 'Dirección', icon: MapPin },
            { id: 'fiscal',  label: 'Fiscal',   icon: Receipt },
            { id: 'bank',    label: 'Cuentas bancarias', icon: Banknote },
          ] as const).map(t => (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className={`flex-1 flex items-center justify-center gap-2 px-3 py-2 rounded-md text-xs font-medium transition-all ${
                tab === t.id
                  ? 'bg-[#FF6600] text-white shadow-lg shadow-orange-500/20'
                  : 'text-[#6B7280] hover:text-[#F0F2F5] hover:bg-[#1E2330]'
              }`}
            >
              <t.icon size={13} /> {t.label}
              {t.id === 'bank' && accounts.length > 0 && (
                <span className={`text-[9px] px-1.5 py-0.5 rounded-full ${tab === t.id ? 'bg-white/20' : 'bg-[#1E2330]'}`}>
                  {accounts.length}
                </span>
              )}
            </button>
          ))}
        </div>

        {/* ============ TAB: GENERAL ============ */}
        {tab === 'general' && (
          <div className="space-y-4">
            <SectionHeader icon={<Building2 size={14} />} title="Identificación" />
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <Input
                label="Nombre comercial *"
                value={form.name || ''}
                onChange={e => update('name', e.target.value)}
                placeholder="Como aparece en marca"
              />
              <Input
                label="Nombre de fantasía"
                value={form.trade_name || ''}
                onChange={e => update('trade_name', e.target.value)}
                placeholder="Si opera con otro nombre"
              />
              <div className="md:col-span-2">
                <Input
                  label="Razón social"
                  value={form.legal_name || ''}
                  onChange={e => update('legal_name', e.target.value)}
                  placeholder="Nombre legal completo (factura)"
                />
              </div>
            </div>

            <SectionHeader icon={<Globe2 size={14} />} title="Localización fiscal" />
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-[#9CA3AF] mb-1.5">País *</label>
                <select
                  value={form.country || ''}
                  onChange={e => handleCountryChange(e.target.value)}
                  className="w-full h-10 rounded-lg bg-[#1E2330] border border-[#2A3040] px-3 text-sm text-[#F0F2F5] focus:outline-none focus:ring-2 focus:ring-orange-500/50"
                >
                  <option value="">— Seleccionar —</option>
                  {COUNTRIES.map(c => <option key={c.code} value={c.code}>{c.name} ({c.code})</option>)}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-[#9CA3AF] mb-1.5">
                  {taxIdLabel} {taxIdValidation.valid ? '*' : <span className="text-red-400">⚠</span>}
                </label>
                <input
                  value={form.tax_id || ''}
                  onChange={e => update('tax_id', e.target.value)}
                  placeholder={
                    form.country === 'AR' ? '20-12345678-9' :
                    form.country === 'ES' ? 'B12345678' :
                    form.country === 'US' ? '12-3456789' : 'Identificación fiscal'
                  }
                  className={`w-full h-10 rounded-lg bg-[#1E2330] border px-3 text-sm text-[#F0F2F5] focus:outline-none focus:ring-2 transition-all ${
                    !taxIdValidation.valid ? 'border-red-500/50 focus:ring-red-500/50' : 'border-[#2A3040] focus:ring-orange-500/50'
                  }`}
                />
                {!taxIdValidation.valid && (
                  <p className="text-[10px] text-red-400 mt-1 flex items-center gap-1"><AlertCircle size={10} /> {taxIdValidation.msg}</p>
                )}
              </div>
            </div>

            <SectionHeader icon={<Mail size={14} />} title="Contacto" />
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-[#9CA3AF] mb-1.5">Email principal</label>
                <input
                  type="email"
                  value={form.email_main || ''}
                  onChange={e => update('email_main', e.target.value)}
                  placeholder="info@empresa.com"
                  className={`w-full h-10 rounded-lg bg-[#1E2330] border px-3 text-sm text-[#F0F2F5] focus:outline-none focus:ring-2 transition-all ${
                    !emailValidation.valid ? 'border-red-500/50 focus:ring-red-500/50' : 'border-[#2A3040] focus:ring-orange-500/50'
                  }`}
                />
                {!emailValidation.valid && (
                  <p className="text-[10px] text-red-400 mt-1 flex items-center gap-1"><AlertCircle size={10} /> {emailValidation.msg}</p>
                )}
              </div>
              <Input
                label="Teléfono"
                value={form.phone || ''}
                onChange={e => update('phone', e.target.value)}
                placeholder="+54 11 1234-5678"
              />
              <div className="md:col-span-2">
                <Input
                  label="Sitio web"
                  type="url"
                  value={form.website || ''}
                  onChange={e => update('website', e.target.value)}
                  placeholder="https://empresa.com"
                />
              </div>
            </div>

            <SectionHeader icon={<Hash size={14} />} title="Parámetros operativos" />
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <Input
                label="Tasa IVA (%)"
                type="number"
                value={form.default_tax_rate ?? ''}
                onChange={e => update('default_tax_rate', e.target.value)}
                placeholder="21"
              />
              <Input
                label="Margen default (%)"
                type="number"
                value={form.default_margin ?? ''}
                onChange={e => update('default_margin', e.target.value)}
                placeholder="30"
              />
              <div>
                <label className="block text-sm font-medium text-[#9CA3AF] mb-1.5">Moneda default</label>
                <select
                  value={form.currency || ''}
                  onChange={e => update('currency', e.target.value)}
                  className="w-full h-10 rounded-lg bg-[#1E2330] border border-[#2A3040] px-3 text-sm text-[#F0F2F5] focus:outline-none focus:ring-2 focus:ring-orange-500/50"
                >
                  {CURRENCIES.map(c => <option key={c} value={c}>{c}</option>)}
                </select>
              </div>
            </div>
          </div>
        )}

        {/* ============ TAB: ADDRESS ============ */}
        {tab === 'address' && (
          <div className="space-y-4">
            <SectionHeader icon={<MapPin size={14} />} title="Dirección fiscal" />

            <div className="grid grid-cols-1 md:grid-cols-12 gap-3">
              <div className="md:col-span-7">
                <Input
                  label="Calle / Vía *"
                  value={form.address_street || ''}
                  onChange={e => update('address_street', e.target.value)}
                  placeholder="Av. Corrientes / Calle Mayor"
                />
              </div>
              <div className="md:col-span-2">
                <Input
                  label="Número *"
                  value={form.address_number || ''}
                  onChange={e => update('address_number', e.target.value)}
                  placeholder="1234"
                />
              </div>
              <div className="md:col-span-1">
                <Input
                  label="Piso"
                  value={form.address_floor || ''}
                  onChange={e => update('address_floor', e.target.value)}
                  placeholder="3"
                />
              </div>
              <div className="md:col-span-2">
                <Input
                  label="Depto / Unidad"
                  value={form.address_apartment || ''}
                  onChange={e => update('address_apartment', e.target.value)}
                  placeholder="A"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-12 gap-3">
              <div className="md:col-span-3">
                <Input
                  label="CP / ZIP *"
                  value={form.address_postal_code || ''}
                  onChange={e => update('address_postal_code', e.target.value)}
                  placeholder="C1043"
                />
              </div>
              <div className="md:col-span-5">
                <Input
                  label="Ciudad / Localidad *"
                  value={form.address_city || ''}
                  onChange={e => update('address_city', e.target.value)}
                  placeholder="Buenos Aires"
                />
              </div>
              <div className="md:col-span-4">
                <Input
                  label="Provincia / Estado"
                  value={form.address_state || ''}
                  onChange={e => update('address_state', e.target.value)}
                  placeholder="CABA / Madrid / California"
                />
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-[#9CA3AF] mb-1.5">Referencias / Indicaciones</label>
              <textarea
                value={form.address_references || ''}
                onChange={e => update('address_references', e.target.value)}
                rows={2}
                placeholder="Entre calles, edificio, indicaciones para llegar..."
                className="w-full rounded-lg bg-[#1E2330] border border-[#2A3040] px-3 py-2 text-sm text-[#F0F2F5] focus:outline-none focus:ring-2 focus:ring-orange-500/50 resize-none"
              />
            </div>

            {/* Vista previa */}
            <div className="p-3 rounded-lg bg-[#0F1218] border border-[#1E2330]">
              <p className="text-[10px] uppercase tracking-wider text-[#6B7280] mb-1">Vista previa (como aparecerá en facturas)</p>
              <p className="text-sm text-[#F0F2F5] leading-relaxed">
                {[
                  [form.address_street, form.address_number].filter(Boolean).join(' '),
                  [form.address_floor && `Piso ${form.address_floor}`, form.address_apartment && `Depto ${form.address_apartment}`].filter(Boolean).join(' · '),
                  [form.address_postal_code, form.address_city, form.address_state].filter(Boolean).join(', '),
                  COUNTRIES.find(c => c.code === form.country)?.name,
                ].filter(Boolean).join(' — ') || <span className="text-[#4B5563] italic">(sin dirección cargada)</span>}
              </p>
            </div>
          </div>
        )}

        {/* ============ TAB: FISCAL ============ */}
        {tab === 'fiscal' && (
          <div className="space-y-4">
            <SectionHeader icon={<Receipt size={14} />} title="Régimen fiscal" />
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-[#9CA3AF] mb-1.5">Forma jurídica</label>
                <select
                  value={form.legal_form || ''}
                  onChange={e => update('legal_form', e.target.value)}
                  className="w-full h-10 rounded-lg bg-[#1E2330] border border-[#2A3040] px-3 text-sm text-[#F0F2F5] focus:outline-none"
                >
                  <option value="">— Seleccionar —</option>
                  {(LEGAL_FORMS_BY_COUNTRY[form.country || ''] || []).map(lf => (
                    <option key={lf} value={lf}>{lf}</option>
                  ))}
                </select>
              </div>
              <Input
                label="Inicio año fiscal (MM-DD)"
                value={form.fiscal_year_start || ''}
                onChange={e => update('fiscal_year_start', e.target.value)}
                placeholder="01-01"
              />
              <Input
                label="Timezone"
                value={form.timezone || ''}
                onChange={e => update('timezone', e.target.value)}
                placeholder="America/Argentina/Buenos_Aires"
              />
            </div>
            <div className="p-3 rounded-lg bg-blue-500/5 border border-blue-500/20 text-xs text-blue-300">
              💡 Para conectar con AFIP, Hacienda o IRS, configurá los certificados en <strong>Admin → Integraciones</strong>.
            </div>
          </div>
        )}

        {/* ============ TAB: BANK ============ */}
        {tab === 'bank' && (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <SectionHeader icon={<Banknote size={14} />} title="Cuentas bancarias" />
              {!editingAccount && (
                <Button size="sm" onClick={() => setEditingAccount(newAccount())}>
                  <Plus size={12} /> Nueva cuenta
                </Button>
              )}
            </div>

            {editingAccount ? (
              <BankAccountForm
                account={editingAccount}
                onChange={setEditingAccount}
                onSave={saveAccount}
                onCancel={() => setEditingAccount(null)}
                saving={saving}
              />
            ) : accounts.length === 0 ? (
              <div className="rounded-lg border border-dashed border-[#2A3040] bg-[#0A0D12] p-8 text-center">
                <Banknote size={32} className="mx-auto mb-3 text-[#3A4050]" />
                <p className="text-sm text-[#6B7280]">No hay cuentas bancarias configuradas.</p>
                <p className="text-xs text-[#4B5563] mt-1">Agregá una para que aparezca en facturas y cobros.</p>
              </div>
            ) : (
              <div className="space-y-2">
                {accounts.map(acc => (
                  <BankAccountCard
                    key={acc.id}
                    account={acc}
                    onEdit={() => setEditingAccount(acc)}
                    onDelete={() => acc.id && deleteAccount(acc.id)}
                    onSetDefault={() => acc.id && setAsDefault(acc.id, acc.currency)}
                  />
                ))}
              </div>
            )}
          </div>
        )}

        {/* Footer */}
        <div className="flex justify-end gap-3 pt-4 border-t border-[#1E2330]">
          <Button variant="secondary" onClick={onClose}>Cancelar</Button>
          {tab !== 'bank' && (
            <Button onClick={handleSave} loading={saving}>
              <Save size={14} /> Guardar cambios
            </Button>
          )}
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
    <div className="flex items-center gap-2 pt-2">
      <span className="text-[#FF6600]">{icon}</span>
      <span className="text-[10px] font-bold uppercase tracking-wider text-[#FF6600]">{title}</span>
      <div className="flex-1 h-px bg-[#1E2330]" />
    </div>
  )
}

function BankAccountCard({ account, onEdit, onDelete, onSetDefault }: {
  account: BankAccount
  onEdit: () => void
  onDelete: () => void
  onSetDefault: () => void
}) {
  const ident = account.iban
    ? `IBAN ${account.iban.slice(0, 4)}…${account.iban.slice(-4)}`
    : account.cbu
    ? `CBU ${account.cbu.slice(0, 4)}…${account.cbu.slice(-4)}`
    : account.account_number
    ? `Acc ${account.account_number.slice(0, 4)}…${account.account_number.slice(-4)}`
    : '—'

  return (
    <div className="rounded-lg border border-[#1E2330] bg-[#0F1218] p-3 hover:border-[#2A3040] transition">
      <div className="flex items-start gap-3">
        <div className="w-9 h-9 rounded-lg bg-emerald-500/10 border border-emerald-500/30 flex items-center justify-center shrink-0">
          <Banknote size={14} className="text-emerald-400" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <p className="text-sm font-semibold text-[#F0F2F5] truncate">{account.alias}</p>
            <Badge variant="default" size="sm">{account.currency}</Badge>
            {account.is_default && (
              <Badge variant="warning" size="sm"><Star size={10} className="inline mr-0.5" /> Default</Badge>
            )}
          </div>
          <p className="text-xs text-[#6B7280] mt-0.5">{account.bank_name} · {account.account_holder}</p>
          <p className="text-[11px] font-mono text-[#9CA3AF] mt-1">{ident}</p>
        </div>
        <div className="flex items-center gap-1">
          {!account.is_default && (
            <button
              onClick={onSetDefault}
              title="Marcar como default"
              className="w-8 h-8 rounded-lg hover:bg-[#1E2330] flex items-center justify-center text-[#6B7280] hover:text-yellow-400"
            >
              <Star size={13} />
            </button>
          )}
          <button
            onClick={onEdit}
            title="Editar"
            className="px-3 h-8 rounded-lg hover:bg-[#1E2330] text-xs text-[#9CA3AF] hover:text-[#F0F2F5]"
          >
            Editar
          </button>
          <button
            onClick={onDelete}
            title="Eliminar"
            className="w-8 h-8 rounded-lg hover:bg-red-500/10 flex items-center justify-center text-[#6B7280] hover:text-red-400"
          >
            <Trash2 size={13} />
          </button>
        </div>
      </div>
    </div>
  )
}

function BankAccountForm({ account, onChange, onSave, onCancel, saving }: {
  account: BankAccount
  onChange: (a: BankAccount) => void
  onSave: () => void
  onCancel: () => void
  saving: boolean
}) {
  const upd = (k: keyof BankAccount, v: unknown) => onChange({ ...account, [k]: v as never })

  // Validaciones
  const ibanV = validators.iban(account.iban || '')
  const cbuV = validators.cbu(account.cbu || '')
  const bicV = validators.bic(account.bic_swift || '')
  const routingV = validators.routingUS(account.routing_number || '')

  // Mostrar campos según moneda / país del banco
  const showIBAN = ['EUR', 'GBP'].includes(account.currency) || account.bank_country === 'ES'
  const showCBU = account.currency === 'ARS' || account.bank_country === 'AR'
  const showABA = account.currency === 'USD' && account.bank_country === 'US'

  return (
    <div className="rounded-lg border border-[#FF6600]/30 bg-[#FF6600]/5 p-4 space-y-4">
      <p className="text-xs font-bold uppercase text-[#FF6600]">
        {account.id ? 'Editar cuenta bancaria' : 'Nueva cuenta bancaria'}
      </p>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <Input
          label="Alias *"
          value={account.alias}
          onChange={e => upd('alias', e.target.value)}
          placeholder="ej: Galicia EUR principal"
        />
        <Input
          label="Banco *"
          value={account.bank_name}
          onChange={e => upd('bank_name', e.target.value)}
          placeholder="ej: Banco Santander"
        />
        <Input
          label="Titular *"
          value={account.account_holder}
          onChange={e => upd('account_holder', e.target.value)}
        />
        <Input
          label="CUIT/CIF/EIN del titular"
          value={account.account_holder_tax_id || ''}
          onChange={e => upd('account_holder_tax_id', e.target.value)}
          placeholder="del titular de la cuenta"
        />
        <div>
          <label className="block text-sm font-medium text-[#9CA3AF] mb-1.5">Moneda *</label>
          <select
            value={account.currency}
            onChange={e => upd('currency', e.target.value)}
            className="w-full h-10 rounded-lg bg-[#1E2330] border border-[#2A3040] px-3 text-sm text-[#F0F2F5] focus:outline-none focus:ring-2 focus:ring-orange-500/50"
          >
            {CURRENCIES.map(c => <option key={c} value={c}>{c}</option>)}
          </select>
        </div>
        <div>
          <label className="block text-sm font-medium text-[#9CA3AF] mb-1.5">Tipo de cuenta</label>
          <select
            value={account.account_type || ''}
            onChange={e => upd('account_type', e.target.value || null)}
            className="w-full h-10 rounded-lg bg-[#1E2330] border border-[#2A3040] px-3 text-sm text-[#F0F2F5] focus:outline-none"
          >
            <option value="">— Seleccionar —</option>
            <option value="checking">Cuenta corriente</option>
            <option value="savings">Caja de ahorro</option>
            <option value="business">Cuenta empresa</option>
            <option value="other">Otro</option>
          </select>
        </div>
      </div>

      {/* Campos específicos por país/moneda */}
      <div className="border-t border-[#1E2330] pt-3 space-y-3">
        <p className="text-[10px] font-bold uppercase tracking-wider text-[#9CA3AF]">
          Identificadores ({account.currency})
        </p>

        {showIBAN && (
          <div>
            <label className="block text-sm font-medium text-[#9CA3AF] mb-1.5">
              IBAN {ibanV.valid ? '' : <span className="text-red-400">⚠</span>}
            </label>
            <input
              value={account.iban || ''}
              onChange={e => upd('iban', e.target.value.toUpperCase())}
              placeholder="ES12 3456 7890 1234 5678 9012"
              className={`w-full h-10 rounded-lg bg-[#1E2330] border px-3 text-sm font-mono text-[#F0F2F5] focus:outline-none focus:ring-2 ${
                !ibanV.valid ? 'border-red-500/50 focus:ring-red-500/50' : 'border-[#2A3040] focus:ring-orange-500/50'
              }`}
            />
            {!ibanV.valid && <p className="text-[10px] text-red-400 mt-1">{ibanV.msg}</p>}
          </div>
        )}

        {showCBU && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-medium text-[#9CA3AF] mb-1.5">
                CBU {cbuV.valid ? '' : <span className="text-red-400">⚠</span>}
              </label>
              <input
                value={account.cbu || ''}
                onChange={e => upd('cbu', e.target.value.replace(/\D/g, ''))}
                placeholder="0000000000000000000000"
                maxLength={22}
                className={`w-full h-10 rounded-lg bg-[#1E2330] border px-3 text-sm font-mono text-[#F0F2F5] focus:outline-none focus:ring-2 ${
                  !cbuV.valid ? 'border-red-500/50 focus:ring-red-500/50' : 'border-[#2A3040] focus:ring-orange-500/50'
                }`}
              />
              {!cbuV.valid && <p className="text-[10px] text-red-400 mt-1">{cbuV.msg}</p>}
              {account.cbu && cbuV.valid && (
                <p className="text-[10px] text-emerald-400 mt-1 flex items-center gap-1">
                  <CheckCircle2 size={10} /> CBU válido (22 dígitos)
                </p>
              )}
            </div>
            <Input
              label="Alias CBU"
              value={account.cbu_alias || ''}
              onChange={e => upd('cbu_alias', e.target.value)}
              placeholder="empresa.galicia.eur"
            />
          </div>
        )}

        {showABA && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <Input
              label="Account Number"
              value={account.account_number || ''}
              onChange={e => upd('account_number', e.target.value)}
              placeholder="123456789012"
            />
            <div>
              <label className="block text-sm font-medium text-[#9CA3AF] mb-1.5">
                Routing Number (ABA) {routingV.valid ? '' : <span className="text-red-400">⚠</span>}
              </label>
              <input
                value={account.routing_number || ''}
                onChange={e => upd('routing_number', e.target.value.replace(/\D/g, ''))}
                placeholder="123456789"
                maxLength={9}
                className={`w-full h-10 rounded-lg bg-[#1E2330] border px-3 text-sm font-mono text-[#F0F2F5] focus:outline-none focus:ring-2 ${
                  !routingV.valid ? 'border-red-500/50 focus:ring-red-500/50' : 'border-[#2A3040] focus:ring-orange-500/50'
                }`}
              />
              {!routingV.valid && <p className="text-[10px] text-red-400 mt-1">{routingV.msg}</p>}
            </div>
          </div>
        )}

        <div>
          <label className="block text-sm font-medium text-[#9CA3AF] mb-1.5">
            BIC / SWIFT {bicV.valid ? '' : <span className="text-red-400">⚠</span>}
            <span className="text-[10px] text-[#4B5563] ml-1">(internacional, opcional)</span>
          </label>
          <input
            value={account.bic_swift || ''}
            onChange={e => upd('bic_swift', e.target.value.toUpperCase())}
            placeholder="BSCHESMM o BSCHESMMXXX"
            className={`w-full h-10 rounded-lg bg-[#1E2330] border px-3 text-sm font-mono text-[#F0F2F5] focus:outline-none focus:ring-2 ${
              !bicV.valid ? 'border-red-500/50 focus:ring-red-500/50' : 'border-[#2A3040] focus:ring-orange-500/50'
            }`}
          />
          {!bicV.valid && <p className="text-[10px] text-red-400 mt-1">{bicV.msg}</p>}
        </div>

        <div className="flex items-center gap-2 pt-2">
          <input
            type="checkbox"
            id="is_default"
            checked={!!account.is_default}
            onChange={e => upd('is_default', e.target.checked)}
            className="w-4 h-4 rounded border-[#2A3040] bg-[#1E2330] accent-orange-500"
          />
          <label htmlFor="is_default" className="text-xs text-[#9CA3AF] cursor-pointer">
            Marcar como cuenta default para <strong>{account.currency}</strong>
          </label>
        </div>
      </div>

      <div className="flex justify-end gap-2 pt-2 border-t border-[#1E2330]">
        <Button variant="secondary" size="sm" onClick={onCancel} disabled={saving}>Cancelar</Button>
        <Button size="sm" onClick={onSave} loading={saving}>
          <Save size={12} /> {account.id ? 'Actualizar' : 'Agregar cuenta'}
        </Button>
      </div>
    </div>
  )
}
