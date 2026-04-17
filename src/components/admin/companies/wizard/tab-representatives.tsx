'use client'

import { useEffect, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { LEGAL_REP_ROLES } from '@/lib/schemas/companies'

type Rep = {
  id: string
  full_name: string
  role: string
  tax_id: string | null
  appointment_date: string | null
  signing_authority: boolean
  is_active: boolean
}

export function TabRepresentatives({ companyId }: { companyId: string }) {
  const [list, setList] = useState<Rep[]>([])
  const [form, setForm] = useState({
    full_name: '',
    role: 'administrador_unico' as (typeof LEGAL_REP_ROLES)[number],
    tax_id: '',
    tax_id_type: '',
    nationality: '',
    birth_date: '',
    appointment_date: '',
    end_date: '',
    signing_authority: false,
    powers_scope: '',
    email: '',
    phone: '',
  })

  const load = async () => {
    const res = await fetch(`/api/companies/${companyId}/legal-representatives`)
    const json = await res.json()
    setList(json.data ?? [])
  }

  useEffect(() => { load() }, [companyId])

  const add = async () => {
    const payload: Record<string, unknown> = { ...form }
    for (const k of Object.keys(payload)) if (payload[k] === '') payload[k] = null
    const res = await fetch(`/api/companies/${companyId}/legal-representatives`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(payload),
    })
    if (res.ok) {
      setForm({ ...form, full_name: '', tax_id: '', appointment_date: '', end_date: '', email: '', phone: '', powers_scope: '' })
      load()
    }
  }

  const remove = async (id: string) => {
    await fetch(`/api/companies/${companyId}/legal-representatives/${id}`, { method: 'DELETE' })
    load()
  }

  return (
    <div className="max-w-4xl">
      <h3 className="text-sm font-semibold text-orange-400 uppercase tracking-wider mb-3">Representantes legales</h3>
      {list.length === 0 ? (
        <div className="text-sm text-gray-500 italic mb-6">Sin representantes cargados.</div>
      ) : (
        <table className="w-full text-sm mb-6">
          <thead className="text-gray-400 border-b border-[#2A3040]">
            <tr>
              <th className="text-left py-2">Nombre</th>
              <th className="text-left py-2">Rol</th>
              <th className="text-left py-2">Tax ID</th>
              <th className="text-left py-2">Designación</th>
              <th className="text-left py-2">Firma</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {list.filter(r => r.is_active).map((r) => (
              <tr key={r.id} className="border-b border-[#1E2330]">
                <td className="py-2">{r.full_name}</td>
                <td className="py-2 text-xs text-gray-400">{r.role}</td>
                <td className="py-2 font-mono text-xs">{r.tax_id ?? '—'}</td>
                <td className="py-2 text-xs">{r.appointment_date ?? '—'}</td>
                <td className="py-2">{r.signing_authority ? '✓' : ''}</td>
                <td className="py-2">
                  <button onClick={() => remove(r.id)} className="text-red-400 hover:text-red-300 text-xs">Cesar</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      <h3 className="text-sm font-semibold text-orange-400 uppercase tracking-wider mb-3">Agregar representante</h3>
      <div className="grid grid-cols-2 gap-4">
        <Input label="Nombre completo *" value={form.full_name} onChange={(e) => setForm((f) => ({ ...f, full_name: e.target.value }))} />
        <div>
          <label className="block text-sm font-medium text-[#9CA3AF] mb-1.5">Rol *</label>
          <select
            className="w-full h-10 rounded-lg bg-[#1E2330] border border-[#2A3040] px-3 text-sm text-[#F0F2F5]"
            value={form.role}
            onChange={(e) => setForm((f) => ({ ...f, role: e.target.value as (typeof LEGAL_REP_ROLES)[number] }))}
          >
            {LEGAL_REP_ROLES.map((r) => <option key={r} value={r}>{r}</option>)}
          </select>
        </div>
        <Input label="Tax ID (DNI/CUIT/NIF)" value={form.tax_id} onChange={(e) => setForm((f) => ({ ...f, tax_id: e.target.value }))} />
        <Input label="Tipo tax ID" value={form.tax_id_type} onChange={(e) => setForm((f) => ({ ...f, tax_id_type: e.target.value }))} />
        <Input label="Nacionalidad (2 letras)" maxLength={2} value={form.nationality} onChange={(e) => setForm((f) => ({ ...f, nationality: e.target.value.toUpperCase() }))} />
        <Input label="Nacimiento" type="date" value={form.birth_date} onChange={(e) => setForm((f) => ({ ...f, birth_date: e.target.value }))} />
        <Input label="Designación" type="date" value={form.appointment_date} onChange={(e) => setForm((f) => ({ ...f, appointment_date: e.target.value }))} />
        <Input label="Cese" type="date" value={form.end_date} onChange={(e) => setForm((f) => ({ ...f, end_date: e.target.value }))} />
        <Input label="Email" type="email" value={form.email} onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))} />
        <Input label="Teléfono" value={form.phone} onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))} />
        <label className="flex items-center gap-2 text-sm text-[#F0F2F5]">
          <input type="checkbox" checked={form.signing_authority} onChange={(e) => setForm((f) => ({ ...f, signing_authority: e.target.checked }))} />
          Tiene autoridad de firma
        </label>
        <div className="col-span-2">
          <label className="block text-sm font-medium text-[#9CA3AF] mb-1.5">Alcance de poderes</label>
          <textarea
            className="w-full rounded-lg bg-[#1E2330] border border-[#2A3040] px-3 py-2 text-sm text-[#F0F2F5]"
            rows={3}
            value={form.powers_scope}
            onChange={(e) => setForm((f) => ({ ...f, powers_scope: e.target.value }))}
          />
        </div>
      </div>

      <div className="mt-4">
        <Button onClick={add}>Agregar representante</Button>
      </div>
    </div>
  )
}
