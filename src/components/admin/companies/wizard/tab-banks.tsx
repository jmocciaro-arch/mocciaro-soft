'use client'

import { useEffect, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'

type Bank = {
  id: string
  bank_name: string
  account_number: string
  iban: string | null
  cbu: string | null
  clabe: string | null
  routing_number: string | null
  currency: string
  country_code: string
  is_primary: boolean
  is_active: boolean
}

export function TabBanks({ companyId, defaultCountry, defaultCurrency }: { companyId: string; defaultCountry: string; defaultCurrency: string }) {
  const [list, setList] = useState<Bank[]>([])
  const [form, setForm] = useState({
    bank_name: '',
    account_number: '',
    iban: '',
    swift_bic: '',
    cbu: '',
    alias_cbu: '',
    routing_number: '',
    clabe: '',
    pix_key: '',
    holder_name: '',
    currency: defaultCurrency,
    country_code: defaultCountry,
    is_primary: false,
  })
  const [error, setError] = useState<string | null>(null)

  const load = async () => {
    const res = await fetch(`/api/companies/${companyId}/bank-accounts`)
    const json = await res.json()
    setList(json.data ?? [])
  }

  useEffect(() => { load() }, [companyId])

  const add = async () => {
    setError(null)
    const payload: Record<string, unknown> = { ...form }
    // Limpiar campos vacíos para evitar unique/check constraints falsos
    for (const k of Object.keys(payload)) if (payload[k] === '') payload[k] = null
    const res = await fetch(`/api/companies/${companyId}/bank-accounts`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(payload),
    })
    const json = await res.json()
    if (!res.ok) {
      setError(json.error ?? 'Error')
      return
    }
    setForm({ ...form, bank_name: '', account_number: '', iban: '', cbu: '', alias_cbu: '', routing_number: '', clabe: '', pix_key: '' })
    load()
  }

  const remove = async (id: string) => {
    await fetch(`/api/companies/${companyId}/bank-accounts/${id}`, { method: 'DELETE' })
    load()
  }

  // Campos condicionales por país
  const countrySpecific = () => {
    switch (form.country_code) {
      case 'ES':
        return (<>
          <Input label="IBAN *" value={form.iban} onChange={(e) => setForm((f) => ({ ...f, iban: e.target.value.toUpperCase() }))} />
          <Input label="SWIFT/BIC" value={form.swift_bic} onChange={(e) => setForm((f) => ({ ...f, swift_bic: e.target.value.toUpperCase() }))} />
        </>)
      case 'AR':
        return (<>
          <Input label="CBU *" value={form.cbu} onChange={(e) => setForm((f) => ({ ...f, cbu: e.target.value }))} />
          <Input label="Alias CBU" value={form.alias_cbu} onChange={(e) => setForm((f) => ({ ...f, alias_cbu: e.target.value }))} />
        </>)
      case 'US':
        return (<>
          <Input label="Routing number *" value={form.routing_number} onChange={(e) => setForm((f) => ({ ...f, routing_number: e.target.value }))} />
          <Input label="SWIFT (wire)" value={form.swift_bic} onChange={(e) => setForm((f) => ({ ...f, swift_bic: e.target.value.toUpperCase() }))} />
        </>)
      case 'MX':
        return <Input label="CLABE *" value={form.clabe} onChange={(e) => setForm((f) => ({ ...f, clabe: e.target.value }))} />
      case 'BR':
        return <Input label="Chave PIX" value={form.pix_key} onChange={(e) => setForm((f) => ({ ...f, pix_key: e.target.value }))} />
      default:
        return null
    }
  }

  return (
    <div className="max-w-4xl">
      <h3 className="text-sm font-semibold text-orange-400 uppercase tracking-wider mb-3">Cuentas bancarias</h3>
      {list.length === 0 ? (
        <div className="text-sm text-gray-500 italic mb-6">Sin cuentas registradas.</div>
      ) : (
        <table className="w-full text-sm mb-6">
          <thead className="text-gray-400 border-b border-[#2A3040]">
            <tr>
              <th className="text-left py-2">Banco</th>
              <th className="text-left py-2">Cuenta</th>
              <th className="text-left py-2">Moneda</th>
              <th className="text-left py-2">País</th>
              <th className="text-left py-2">Primary</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {list.filter(b => b.is_active).map((b) => (
              <tr key={b.id} className="border-b border-[#1E2330]">
                <td className="py-2">{b.bank_name}</td>
                <td className="py-2 font-mono text-xs">{b.iban || b.cbu || b.clabe || b.routing_number || b.account_number}</td>
                <td className="py-2">{b.currency}</td>
                <td className="py-2">{b.country_code}</td>
                <td className="py-2">{b.is_primary ? '★' : ''}</td>
                <td className="py-2">
                  <button onClick={() => remove(b.id)} className="text-red-400 hover:text-red-300 text-xs">Desactivar</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      <h3 className="text-sm font-semibold text-orange-400 uppercase tracking-wider mb-3">Agregar cuenta</h3>
      <div className="grid grid-cols-2 gap-4">
        <Input label="Banco *" value={form.bank_name} onChange={(e) => setForm((f) => ({ ...f, bank_name: e.target.value }))} />
        <Input label="Nº cuenta *" value={form.account_number} onChange={(e) => setForm((f) => ({ ...f, account_number: e.target.value }))} />
        <Input label="País (2 letras)" value={form.country_code} maxLength={2} onChange={(e) => setForm((f) => ({ ...f, country_code: e.target.value.toUpperCase() }))} />
        <Input label="Moneda (ISO)" value={form.currency} maxLength={3} onChange={(e) => setForm((f) => ({ ...f, currency: e.target.value.toUpperCase() }))} />
        {countrySpecific()}
        <Input label="Titular" value={form.holder_name} onChange={(e) => setForm((f) => ({ ...f, holder_name: e.target.value }))} />
        <label className="flex items-center gap-2 text-sm text-[#F0F2F5]">
          <input type="checkbox" checked={form.is_primary} onChange={(e) => setForm((f) => ({ ...f, is_primary: e.target.checked }))} />
          Primary para esta moneda
        </label>
      </div>

      <div className="mt-4 flex items-center gap-3">
        <Button onClick={add}>Agregar cuenta</Button>
        {error && <span className="text-sm text-red-400">{error}</span>}
      </div>
    </div>
  )
}
