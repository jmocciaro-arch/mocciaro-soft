'use client'

import { useEffect, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { ADDRESS_KINDS } from '@/lib/schemas/companies'

type Address = {
  id: string
  kind: string
  label: string | null
  line1: string
  line2: string | null
  city: string
  state: string | null
  postal_code: string | null
  country_code: string
  is_default: boolean
}

export function TabAddresses({ companyId, defaultCountry }: { companyId: string; defaultCountry: string }) {
  const [list, setList] = useState<Address[]>([])
  const [loading, setLoading] = useState(true)
  const [form, setForm] = useState<Partial<Address>>({ kind: 'fiscal', country_code: defaultCountry, is_default: true })

  const load = async () => {
    setLoading(true)
    const res = await fetch(`/api/companies/${companyId}/addresses`)
    const json = await res.json()
    setList(json.data ?? [])
    setLoading(false)
  }

  useEffect(() => { load() }, [companyId])

  const add = async () => {
    const res = await fetch(`/api/companies/${companyId}/addresses`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(form),
    })
    if (res.ok) {
      setForm({ kind: 'fiscal', country_code: defaultCountry, is_default: false })
      load()
    }
  }

  const remove = async (id: string) => {
    await fetch(`/api/companies/${companyId}/addresses/${id}`, { method: 'DELETE' })
    load()
  }

  return (
    <div className="max-w-4xl">
      <h3 className="text-sm font-semibold text-orange-400 uppercase tracking-wider mb-3">Direcciones registradas</h3>
      {loading ? (
        <div className="text-sm text-gray-400">Cargando…</div>
      ) : list.length === 0 ? (
        <div className="text-sm text-gray-500 italic">No hay direcciones.</div>
      ) : (
        <table className="w-full text-sm mb-6">
          <thead className="text-gray-400 border-b border-[#2A3040]">
            <tr>
              <th className="text-left py-2">Tipo</th>
              <th className="text-left py-2">Calle</th>
              <th className="text-left py-2">Ciudad</th>
              <th className="text-left py-2">País</th>
              <th className="text-left py-2">Default</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {list.map((a) => (
              <tr key={a.id} className="border-b border-[#1E2330]">
                <td className="py-2"><span className="px-2 py-0.5 rounded bg-[#1E2330] text-xs">{a.kind}</span></td>
                <td className="py-2">{a.line1}{a.line2 ? `, ${a.line2}` : ''}</td>
                <td className="py-2">{a.city}</td>
                <td className="py-2">{a.country_code}</td>
                <td className="py-2">{a.is_default ? '★' : ''}</td>
                <td className="py-2">
                  <button onClick={() => remove(a.id)} className="text-red-400 hover:text-red-300 text-xs">Eliminar</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      <h3 className="text-sm font-semibold text-orange-400 uppercase tracking-wider mb-3">Agregar dirección</h3>
      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="block text-sm font-medium text-[#9CA3AF] mb-1.5">Tipo *</label>
          <select
            className="w-full h-10 rounded-lg bg-[#1E2330] border border-[#2A3040] px-3 text-sm text-[#F0F2F5]"
            value={form.kind}
            onChange={(e) => setForm((f) => ({ ...f, kind: e.target.value }))}
          >
            {ADDRESS_KINDS.map((k) => <option key={k} value={k}>{k}</option>)}
          </select>
        </div>
        <Input label="Etiqueta" value={form.label ?? ''} onChange={(e) => setForm((f) => ({ ...f, label: e.target.value }))} />
        <Input label="Línea 1 *" value={form.line1 ?? ''} onChange={(e) => setForm((f) => ({ ...f, line1: e.target.value }))} />
        <Input label="Línea 2" value={form.line2 ?? ''} onChange={(e) => setForm((f) => ({ ...f, line2: e.target.value }))} />
        <Input label="Ciudad *" value={form.city ?? ''} onChange={(e) => setForm((f) => ({ ...f, city: e.target.value }))} />
        <Input label="Provincia/Estado" value={form.state ?? ''} onChange={(e) => setForm((f) => ({ ...f, state: e.target.value }))} />
        <Input label="CP" value={form.postal_code ?? ''} onChange={(e) => setForm((f) => ({ ...f, postal_code: e.target.value }))} />
        <Input label="País (2 letras)" value={form.country_code ?? ''} onChange={(e) => setForm((f) => ({ ...f, country_code: e.target.value.toUpperCase() }))} maxLength={2} />
        <label className="flex items-center gap-2 text-sm text-[#F0F2F5]">
          <input type="checkbox" checked={!!form.is_default} onChange={(e) => setForm((f) => ({ ...f, is_default: e.target.checked }))} />
          Default para este tipo
        </label>
      </div>

      <div className="mt-4">
        <Button onClick={add}>Agregar dirección</Button>
      </div>
    </div>
  )
}
