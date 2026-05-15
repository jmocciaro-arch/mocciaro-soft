'use client'

/**
 * BankAccountsAdmin — FASE 1.2 (cierre)
 *
 * Admin UI para gestionar cuentas bancarias por empresa.
 *
 * Permisos: requiere RBAC manage_bank_accounts (verificado por la
 * página admin que lo embebe; no se duplica aquí).
 *
 * CRUD básico contra tt_bank_accounts (esquema normalizado por
 * migration v73: company_id, bank_name, account_holder, iban_or_cbu,
 * currency, is_active, notes).
 */

import { useState, useEffect, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Select } from '@/components/ui/select'
import { Modal } from '@/components/ui/modal'
import { Badge } from '@/components/ui/badge'
import { useToast } from '@/components/ui/toast'
import { Plus, Pencil, Trash2, Building2, Loader2, X } from 'lucide-react'

interface BankAccountRow {
  id: string
  company_id: string | null
  bank_name: string | null
  account_holder: string | null
  iban_or_cbu: string | null
  currency: string
  is_active: boolean
  notes: string | null
}

interface CompanyOption {
  id: string
  name: string
}

const EMPTY_FORM = {
  id: '',
  company_id: '',
  bank_name: '',
  account_holder: '',
  iban_or_cbu: '',
  currency: 'EUR',
  is_active: true,
  notes: '',
}

const CURRENCIES = [
  { value: 'EUR', label: 'EUR' },
  { value: 'ARS', label: 'ARS' },
  { value: 'USD', label: 'USD' },
]

export function BankAccountsAdmin() {
  const { addToast } = useToast()
  const [accounts, setAccounts] = useState<BankAccountRow[]>([])
  const [companies, setCompanies] = useState<CompanyOption[]>([])
  const [loading, setLoading] = useState(true)
  const [modalOpen, setModalOpen] = useState(false)
  const [form, setForm] = useState({ ...EMPTY_FORM })
  const [saving, setSaving] = useState(false)
  const [filterCompany, setFilterCompany] = useState<string>('all')

  const load = useCallback(async () => {
    setLoading(true)
    const sb = createClient()
    const [{ data: bData }, { data: cData }] = await Promise.all([
      sb
        .from('tt_bank_accounts')
        .select('id, company_id, bank_name, account_holder, iban_or_cbu, currency, is_active, notes')
        .order('bank_name', { ascending: true }),
      sb.from('tt_companies').select('id, name').order('name'),
    ])
    setAccounts((bData || []) as BankAccountRow[])
    setCompanies(((cData || []) as Array<{ id: string; name: string }>).map((c) => ({
      id: c.id,
      name: c.name,
    })))
    setLoading(false)
  }, [])

  useEffect(() => { void load() }, [load])

  function openNew() {
    setForm({ ...EMPTY_FORM, company_id: filterCompany !== 'all' ? filterCompany : '' })
    setModalOpen(true)
  }

  function openEdit(row: BankAccountRow) {
    setForm({
      id: row.id,
      company_id: row.company_id ?? '',
      bank_name: row.bank_name ?? '',
      account_holder: row.account_holder ?? '',
      iban_or_cbu: row.iban_or_cbu ?? '',
      currency: row.currency || 'EUR',
      is_active: row.is_active,
      notes: row.notes ?? '',
    })
    setModalOpen(true)
  }

  async function handleSave() {
    if (!form.company_id) {
      addToast({ type: 'warning', title: 'Seleccioná la empresa titular' })
      return
    }
    if (!form.bank_name || !form.iban_or_cbu) {
      addToast({ type: 'warning', title: 'Banco e IBAN/CBU son obligatorios' })
      return
    }
    setSaving(true)
    const sb = createClient()
    const payload = {
      company_id: form.company_id,
      bank_name: form.bank_name.trim(),
      account_holder: form.account_holder.trim() || null,
      iban_or_cbu: form.iban_or_cbu.trim(),
      currency: form.currency,
      is_active: form.is_active,
      notes: form.notes.trim() || null,
    }
    const { error } = form.id
      ? await sb.from('tt_bank_accounts').update(payload).eq('id', form.id)
      : await sb.from('tt_bank_accounts').insert(payload)

    setSaving(false)
    if (error) {
      addToast({ type: 'error', title: 'Error al guardar', message: error.message })
      return
    }
    addToast({ type: 'success', title: form.id ? 'Cuenta actualizada' : 'Cuenta creada' })
    setModalOpen(false)
    void load()
  }

  async function toggleActive(row: BankAccountRow) {
    const sb = createClient()
    const { error } = await sb
      .from('tt_bank_accounts')
      .update({ is_active: !row.is_active })
      .eq('id', row.id)
    if (error) {
      addToast({ type: 'error', title: 'Error', message: error.message })
      return
    }
    void load()
  }

  async function handleDelete(row: BankAccountRow) {
    if (!confirm(`¿Eliminar cuenta "${row.bank_name}"? Esta acción es irreversible.`)) return
    const sb = createClient()
    const { error } = await sb.from('tt_bank_accounts').delete().eq('id', row.id)
    if (error) {
      addToast({ type: 'error', title: 'Error', message: error.message })
      return
    }
    addToast({ type: 'success', title: 'Cuenta eliminada' })
    void load()
  }

  const companyNameById = new Map(companies.map((c) => [c.id, c.name]))
  const filtered = accounts.filter((a) => filterCompany === 'all' || a.company_id === filterCompany)

  return (
    <>
      <Card>
        <CardHeader>
          <CardTitle>Cuentas bancarias</CardTitle>
          <div className="flex gap-2">
            <Select
              value={filterCompany}
              onChange={(e) => setFilterCompany(e.target.value)}
              options={[
                { value: 'all', label: 'Todas las empresas' },
                ...companies.map((c) => ({ value: c.id, label: c.name })),
              ]}
            />
            <Button size="sm" onClick={openNew}><Plus size={14} /> Nueva cuenta</Button>
          </div>
        </CardHeader>
        <CardContent>
          {loading && (
            <div className="flex justify-center py-10">
              <Loader2 className="animate-spin text-[#FF6600]" size={28} />
            </div>
          )}

          {!loading && filtered.length === 0 && (
            <div className="text-center py-10 text-[#6B7280]">
              <Building2 size={40} className="mx-auto mb-2 opacity-30" />
              <p className="text-sm">Sin cuentas bancarias todavía</p>
              <p className="text-xs mt-1">Agregá una para poder asignarla en cobros de transferencia</p>
            </div>
          )}

          {!loading && filtered.length > 0 && (
            <div className="border border-[#1E2330] rounded-lg overflow-hidden">
              <table className="w-full text-sm">
                <thead className="bg-[#0F1218] text-[#9CA3AF]">
                  <tr>
                    <th className="px-3 py-2 text-left text-xs font-medium">Empresa</th>
                    <th className="px-3 py-2 text-left text-xs font-medium">Banco</th>
                    <th className="px-3 py-2 text-left text-xs font-medium">Titular</th>
                    <th className="px-3 py-2 text-left text-xs font-medium">IBAN / CBU</th>
                    <th className="px-3 py-2 text-left text-xs font-medium">Moneda</th>
                    <th className="px-3 py-2 text-left text-xs font-medium">Estado</th>
                    <th className="px-3 py-2 text-right text-xs font-medium">Acciones</th>
                  </tr>
                </thead>
                <tbody className="text-[#F0F2F5]">
                  {filtered.map((r) => (
                    <tr key={r.id} className="border-t border-[#1E2330] hover:bg-[#0F1218]">
                      <td className="px-3 py-2 text-xs">{companyNameById.get(r.company_id || '') ?? '—'}</td>
                      <td className="px-3 py-2 font-medium">{r.bank_name || '—'}</td>
                      <td className="px-3 py-2 text-xs">{r.account_holder || '—'}</td>
                      <td className="px-3 py-2 font-mono text-xs">{r.iban_or_cbu || '—'}</td>
                      <td className="px-3 py-2 text-xs">{r.currency}</td>
                      <td className="px-3 py-2">
                        <button onClick={() => void toggleActive(r)} className="cursor-pointer">
                          <Badge variant={r.is_active ? 'success' : 'default'}>
                            {r.is_active ? 'Activa' : 'Inactiva'}
                          </Badge>
                        </button>
                      </td>
                      <td className="px-3 py-2 text-right">
                        <div className="inline-flex items-center gap-1">
                          <button
                            onClick={() => openEdit(r)}
                            className="p-1.5 text-[#9CA3AF] hover:text-[#FF6600] rounded"
                            title="Editar"
                          >
                            <Pencil size={14} />
                          </button>
                          <button
                            onClick={() => void handleDelete(r)}
                            className="p-1.5 text-[#9CA3AF] hover:text-[#EF4444] rounded"
                            title="Eliminar"
                          >
                            <Trash2 size={14} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      <Modal isOpen={modalOpen} onClose={() => setModalOpen(false)} title={form.id ? 'Editar cuenta bancaria' : 'Nueva cuenta bancaria'} size="md">
        <div className="space-y-4">
          <Select
            label="Empresa titular *"
            value={form.company_id}
            onChange={(e) => setForm({ ...form, company_id: e.target.value })}
            options={companies.map((c) => ({ value: c.id, label: c.name }))}
            placeholder="Seleccioná empresa"
          />
          <div className="grid grid-cols-2 gap-3">
            <Input label="Banco *" value={form.bank_name} onChange={(e) => setForm({ ...form, bank_name: e.target.value })} placeholder="BBVA, Galicia, Santander…" />
            <Select label="Moneda" value={form.currency} onChange={(e) => setForm({ ...form, currency: e.target.value })} options={CURRENCIES} />
          </div>
          <Input label="Titular" value={form.account_holder} onChange={(e) => setForm({ ...form, account_holder: e.target.value })} placeholder="Razón social del titular" />
          <Input label="IBAN / CBU *" value={form.iban_or_cbu} onChange={(e) => setForm({ ...form, iban_or_cbu: e.target.value })} placeholder="ES00 0000 0000 ... / 0000000000000000000000" />
          <div>
            <label className="block text-xs font-medium text-[#9CA3AF] mb-1.5 uppercase tracking-wider">Notas</label>
            <textarea
              value={form.notes}
              onChange={(e) => setForm({ ...form, notes: e.target.value })}
              rows={2}
              className="w-full bg-[#0B0E13] border border-[#2A3040] rounded-lg p-2 text-sm text-[#F0F2F5] focus:outline-none focus:ring-2 focus:ring-orange-500/50 resize-y"
              placeholder="Cuenta principal de cobros, secundaria, etc."
            />
          </div>
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={form.is_active}
              onChange={(e) => setForm({ ...form, is_active: e.target.checked })}
              className="w-4 h-4 rounded border-[#2A3040] text-[#FF6600] focus:ring-[#FF6600]"
            />
            <span className="text-sm text-[#F0F2F5]">Activa (disponible para nuevos cobros)</span>
          </label>
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="secondary" onClick={() => setModalOpen(false)} disabled={saving}>
              <X size={14} /> Cancelar
            </Button>
            <Button variant="primary" onClick={handleSave} loading={saving}>
              Guardar
            </Button>
          </div>
        </div>
      </Modal>
    </>
  )
}
