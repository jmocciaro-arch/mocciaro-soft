'use client'

import { useEffect, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import type { FiscalFieldDescriptor } from '@/lib/schemas/companies'

type Props = { companyId: string; country: string }

type CountrySchema = {
  country_code: string
  country_name: string
  tax_authority: string
  tax_id_label: string
  fields: FiscalFieldDescriptor[]
}

export function TabFiscality({ companyId, country }: Props) {
  const [schema, setSchema] = useState<CountrySchema | null>(null)
  const [data, setData] = useState<Record<string, unknown>>({})
  const [taxId, setTaxId] = useState('')
  const [saving, setSaving] = useState(false)
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [msg, setMsg] = useState<string | null>(null)

  // Cargar schema del país + fiscal_profile existente
  useEffect(() => {
    (async () => {
      const [schRes, coRes] = await Promise.all([
        fetch(`/api/companies/country-schemas?country=${country}`),
        fetch(`/api/companies/${companyId}`),
      ])
      const schJson = await schRes.json()
      const coJson = await coRes.json()
      if (schJson.data) setSchema(schJson.data)
      if (coJson.fiscal_profile) {
        setData(coJson.fiscal_profile.data ?? {})
        setTaxId(coJson.fiscal_profile.tax_id ?? '')
      } else if (coJson.company?.tax_id) {
        setTaxId(coJson.company.tax_id)
      }
    })()
  }, [companyId, country])

  const save = async (markComplete = false) => {
    setSaving(true); setErrors({}); setMsg(null)
    try {
      const res = await fetch(`/api/companies/${companyId}/fiscal-profile`, {
        method: 'PUT',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          country_code: country,
          tax_id: taxId || null,
          data,
          is_complete: markComplete,
        }),
      })
      const json = await res.json()
      if (!res.ok) {
        if (json.fiscal_errors) setErrors(json.fiscal_errors)
        setMsg(json.error ?? 'Error')
        return
      }
      setMsg(markComplete ? 'Guardado y marcado como completo ✓' : 'Guardado ✓')
    } finally {
      setSaving(false)
    }
  }

  if (!schema) return <div className="text-sm text-gray-400">Cargando schema fiscal…</div>

  // Agrupar campos por group
  const groups: Record<string, FiscalFieldDescriptor[]> = {}
  for (const f of schema.fields) {
    const g = f.group ?? 'general'
    groups[g] ??= []
    groups[g].push(f)
  }

  return (
    <div className="max-w-3xl">
      <div className="mb-4 text-sm text-gray-400">
        Autoridad fiscal: <span className="text-white font-medium">{schema.tax_authority}</span>
      </div>

      <div className="mb-6">
        <Input
          label={`${schema.tax_id_label} *`}
          value={taxId}
          onChange={(e) => setTaxId(e.target.value)}
        />
      </div>

      {Object.entries(groups).map(([groupName, fields]) => (
        <div key={groupName} className="mb-6">
          <h3 className="text-sm font-semibold text-orange-400 uppercase tracking-wider mb-3">
            {groupName.replace(/_/g, ' ')}
          </h3>
          <div className="grid grid-cols-2 gap-4">
            {fields.map((f) => (
              <FiscalField
                key={f.key}
                descriptor={f}
                value={data[f.key]}
                error={errors[f.key]}
                onChange={(v) => setData((d) => ({ ...d, [f.key]: v }))}
              />
            ))}
          </div>
        </div>
      ))}

      <div className="flex items-center gap-3 mt-6">
        <Button variant="secondary" onClick={() => save(false)} loading={saving}>Guardar borrador</Button>
        <Button onClick={() => save(true)} loading={saving}>Guardar y marcar completo</Button>
        {msg && <span className="text-sm text-gray-300">{msg}</span>}
      </div>
    </div>
  )
}

function FiscalField({
  descriptor,
  value,
  error,
  onChange,
}: {
  descriptor: FiscalFieldDescriptor
  value: unknown
  error?: string
  onChange: (v: unknown) => void
}) {
  const label = descriptor.label + (descriptor.required ? ' *' : '')

  switch (descriptor.type) {
    case 'text':
      return <Input label={label} value={(value as string) ?? ''} error={error} onChange={(e) => onChange(e.target.value)} />
    case 'number':
      return <Input label={label} type="number" value={(value as number) ?? ''} error={error} onChange={(e) => onChange(e.target.value === '' ? null : Number(e.target.value))} />
    case 'date':
      return <Input label={label} type="date" value={(value as string) ?? ''} error={error} onChange={(e) => onChange(e.target.value)} />
    case 'boolean':
      return (
        <label className="flex items-center gap-2 text-sm text-[#F0F2F5] pt-6">
          <input type="checkbox" checked={!!value} onChange={(e) => onChange(e.target.checked)} />
          {descriptor.label}{descriptor.hint ? ` (${descriptor.hint})` : ''}
        </label>
      )
    case 'select':
      return (
        <div>
          <label className="block text-sm font-medium text-[#9CA3AF] mb-1.5">{label}</label>
          <select
            className="w-full h-10 rounded-lg bg-[#1E2330] border border-[#2A3040] px-3 text-sm text-[#F0F2F5]"
            value={(value as string) ?? ''}
            onChange={(e) => onChange(e.target.value || null)}
          >
            <option value="">— Seleccionar —</option>
            {descriptor.options?.map((o) => <option key={o} value={o}>{o}</option>)}
          </select>
          {error && <p className="mt-1 text-xs text-red-400">{error}</p>}
        </div>
      )
    case 'array':
      return (
        <Input
          label={label + ' (separá por coma)'}
          value={Array.isArray(value) ? value.join(', ') : ''}
          error={error}
          onChange={(e) => onChange(e.target.value.split(',').map((s) => s.trim()).filter(Boolean))}
        />
      )
  }
}
