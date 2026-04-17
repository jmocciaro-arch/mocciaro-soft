'use client'

import { useState } from 'react'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { LEGAL_FORMS, SUPPORTED_COUNTRIES } from '@/lib/schemas/companies'

type CountryMeta = { country_code: string; country_name: string; currency_default: string; tax_id_label: string }

type Props = {
  countries: CountryMeta[]
  companyId: string | null
  onCreated: (id: string) => void
}

export function TabIdentity({ countries, companyId, onCreated }: Props) {
  const [form, setForm] = useState({
    name: '',
    legal_name: '',
    trade_name: '',
    tax_id: '',
    country: 'ES',
    legal_form: '' as (typeof LEGAL_FORMS)[number] | '',
    primary_activity: '',
    establishment_date: '',
    fiscal_year_start: '01-01',
    timezone: 'Europe/Madrid',
    default_currency: 'EUR',
    code_prefix: '',
    brand_color: '#F97316',
    email_main: '',
    phone: '',
    website: '',
  })
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const update = (k: string, v: string) => setForm((f) => ({ ...f, [k]: v }))

  // Al cambiar country, sugerimos currency_default del país
  const onChangeCountry = (code: string) => {
    const c = countries.find((x) => x.country_code === code)
    setForm((f) => ({
      ...f,
      country: code,
      default_currency: c?.currency_default ?? f.default_currency,
    }))
  }

  const submit = async () => {
    setError(null)
    setSaving(true)
    try {
      const res = await fetch('/api/companies', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          ...form,
          legal_form: form.legal_form || null,
          establishment_date: form.establishment_date || null,
          code_prefix: form.code_prefix || null,
        }),
      })
      const json = await res.json()
      if (!res.ok) {
        setError(json.error || 'Error al crear')
        return
      }
      onCreated(json.id)
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setSaving(false)
    }
  }

  if (companyId) {
    return (
      <div className="text-sm text-gray-400">
        Empresa creada. Pasá al siguiente paso para completar la fiscalidad.
      </div>
    )
  }

  return (
    <div className="grid grid-cols-2 gap-4 max-w-3xl">
      <Input label="Nombre comercial *" value={form.name} onChange={(e) => update('name', e.target.value)} />
      <Input label="Nombre de fantasía" value={form.trade_name} onChange={(e) => update('trade_name', e.target.value)} />
      <Input label="Razón social *" value={form.legal_name} onChange={(e) => update('legal_name', e.target.value)} />

      <div>
        <label className="block text-sm font-medium text-[#9CA3AF] mb-1.5">País *</label>
        <select
          className="w-full h-10 rounded-lg bg-[#1E2330] border border-[#2A3040] px-3 text-sm text-[#F0F2F5]"
          value={form.country}
          onChange={(e) => onChangeCountry(e.target.value)}
        >
          {countries.filter(c => SUPPORTED_COUNTRIES.includes(c.country_code as typeof SUPPORTED_COUNTRIES[number])).map((c) => (
            <option key={c.country_code} value={c.country_code}>{c.country_name}</option>
          ))}
        </select>
      </div>

      <Input
        label={`${countries.find(c => c.country_code === form.country)?.tax_id_label ?? 'Tax ID'} *`}
        value={form.tax_id}
        onChange={(e) => update('tax_id', e.target.value)}
      />

      <div>
        <label className="block text-sm font-medium text-[#9CA3AF] mb-1.5">Forma jurídica</label>
        <select
          className="w-full h-10 rounded-lg bg-[#1E2330] border border-[#2A3040] px-3 text-sm text-[#F0F2F5]"
          value={form.legal_form}
          onChange={(e) => update('legal_form', e.target.value)}
        >
          <option value="">— Seleccionar —</option>
          {LEGAL_FORMS.map((lf) => <option key={lf} value={lf}>{lf}</option>)}
        </select>
      </div>

      <Input label="Actividad principal" value={form.primary_activity} onChange={(e) => update('primary_activity', e.target.value)} />
      <Input label="Fecha constitución" type="date" value={form.establishment_date} onChange={(e) => update('establishment_date', e.target.value)} />
      <Input label="Inicio año fiscal (MM-DD)" value={form.fiscal_year_start} onChange={(e) => update('fiscal_year_start', e.target.value)} />
      <Input label="Timezone" value={form.timezone} onChange={(e) => update('timezone', e.target.value)} />
      <Input label="Moneda default (ISO)" value={form.default_currency} onChange={(e) => update('default_currency', e.target.value.toUpperCase())} />
      <Input label="Code prefix (2 letras)" value={form.code_prefix} onChange={(e) => update('code_prefix', e.target.value.toUpperCase())} maxLength={2} />
      <Input label="Color brand" type="color" value={form.brand_color} onChange={(e) => update('brand_color', e.target.value)} />
      <Input label="Email principal" type="email" value={form.email_main} onChange={(e) => update('email_main', e.target.value)} />
      <Input label="Teléfono" value={form.phone} onChange={(e) => update('phone', e.target.value)} />
      <Input label="Website" type="url" value={form.website} onChange={(e) => update('website', e.target.value)} />

      <div className="col-span-2 flex items-center gap-3 mt-2">
        <Button onClick={submit} loading={saving}>Crear empresa</Button>
        {error && <span className="text-sm text-red-400">{error}</span>}
      </div>
    </div>
  )
}
