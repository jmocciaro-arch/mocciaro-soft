'use client'

// ============================================================================
// /admin/whatsapp — Gestion de cuentas WhatsApp Business por empresa
// ============================================================================

import { useState, useEffect, useCallback } from 'react'
import {
  Plus, CheckCircle2, AlertCircle, Loader2, Copy, Star, StarOff,
  Power, Trash2, Eye, EyeOff, ExternalLink, X,
} from 'lucide-react'
import { useCompanyContext } from '@/lib/company-context'
import type { WhatsAppAccountPublic } from '@/lib/whatsapp/types'

interface FormState {
  id?: string
  display_name: string
  phone_number: string
  phone_number_id: string
  whatsapp_business_account_id: string
  business_name: string
  access_token: string
  app_secret: string
  webhook_verify_token: string
  webhook_path: string
  is_default: boolean
}

const emptyForm = (companyId?: string): FormState => ({
  display_name: '',
  phone_number: '',
  phone_number_id: '',
  whatsapp_business_account_id: '',
  business_name: '',
  access_token: '',
  app_secret: '',
  webhook_verify_token: Math.random().toString(36).slice(2, 14),
  webhook_path: companyId ? `wa-${companyId.slice(0, 8)}-${Math.random().toString(36).slice(2, 6)}` : '',
  is_default: false,
})

export default function WhatsAppAdminPage() {
  const { activeCompany, companies } = useCompanyContext()
  const [accounts, setAccounts] = useState<WhatsAppAccountPublic[]>([])
  const [loading, setLoading] = useState(true)
  const [formOpen, setFormOpen] = useState(false)
  const [form, setForm] = useState<FormState>(emptyForm())
  const [formCompanyId, setFormCompanyId] = useState<string>('')
  const [saving, setSaving] = useState(false)
  const [testing, setTesting] = useState<string | null>(null)
  const [testResult, setTestResult] = useState<{ id: string; ok: boolean; msg: string } | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [showTokens, setShowTokens] = useState<Record<string, boolean>>({})

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch('/api/whatsapp/accounts')
      const data = await res.json()
      setAccounts(data.accounts || [])
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error cargando cuentas')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { void load() }, [load])

  function openNewForm() {
    const cid = activeCompany?.id || companies[0]?.id || ''
    setFormCompanyId(cid)
    setForm(emptyForm(cid))
    setFormOpen(true)
    setError(null)
  }

  function openEditForm(a: WhatsAppAccountPublic) {
    setFormCompanyId(a.company_id)
    setForm({
      id: a.id,
      display_name: a.display_name,
      phone_number: a.phone_number,
      phone_number_id: a.phone_number_id,
      whatsapp_business_account_id: a.whatsapp_business_account_id,
      business_name: a.business_name || '',
      access_token: '',                       // vacio -> no se cambia
      app_secret: '',                         // vacio -> no se cambia
      webhook_verify_token: '',               // vacio -> no se cambia
      webhook_path: a.webhook_path,
      is_default: a.is_default,
    })
    setFormOpen(true)
    setError(null)
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setSaving(true)
    setError(null)

    try {
      const isEdit = !!form.id
      const url = isEdit ? `/api/whatsapp/accounts/${form.id}` : '/api/whatsapp/accounts'
      const method = isEdit ? 'PATCH' : 'POST'

      const payload: Record<string, unknown> = {
        company_id: formCompanyId,
        display_name: form.display_name,
        phone_number: form.phone_number,
        phone_number_id: form.phone_number_id,
        whatsapp_business_account_id: form.whatsapp_business_account_id,
        business_name: form.business_name || null,
        webhook_path: form.webhook_path,
        is_default: form.is_default,
      }
      // Solo enviar tokens si no estan vacios (permite editar sin re-ingresar)
      if (form.access_token) payload.access_token = form.access_token
      if (form.app_secret) payload.app_secret = form.app_secret
      if (form.webhook_verify_token) payload.webhook_verify_token = form.webhook_verify_token

      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Error guardando')

      await load()
      setFormOpen(false)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error guardando')
    } finally {
      setSaving(false)
    }
  }

  async function handleTest(account: WhatsAppAccountPublic) {
    setTesting(account.id)
    setTestResult(null)
    try {
      const res = await fetch('/api/whatsapp/test-connection', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ account_id: account.id }),
      })
      const data = await res.json()
      setTestResult({
        id: account.id,
        ok: !!data.ok,
        msg: data.ok
          ? `Conexion OK. Numero: ${(data.data as { display_phone_number?: string })?.display_phone_number || account.phone_number}`
          : (data.error || 'Error desconocido'),
      })
      await load()
    } finally {
      setTesting(null)
    }
  }

  async function handleToggleActive(account: WhatsAppAccountPublic) {
    await fetch(`/api/whatsapp/accounts/${account.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ active: !account.active }),
    })
    await load()
  }

  async function handleSetDefault(account: WhatsAppAccountPublic) {
    await fetch(`/api/whatsapp/accounts/${account.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ is_default: true }),
    })
    await load()
  }

  async function handleDelete(account: WhatsAppAccountPublic) {
    if (!confirm(`¿Borrar la cuenta "${account.display_name}"? Esta accion no se puede deshacer.`)) return
    await fetch(`/api/whatsapp/accounts/${account.id}`, { method: 'DELETE' })
    await load()
  }

  function copyWebhookUrl(url: string) {
    navigator.clipboard?.writeText(url)
  }

  function getCompanyName(id: string) {
    return companies.find(c => c.id === id)?.name || id.slice(0, 8)
  }

  return (
    <div className="space-y-6 max-w-5xl">
      {/* Header */}
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold text-[#F0F2F5]">WhatsApp Business</h1>
          <p className="text-sm text-[#9CA3AF] mt-1">
            Numeros conectados de WhatsApp Cloud API por empresa. Cada empresa puede tener varios.
          </p>
        </div>
        <button
          onClick={openNewForm}
          className="px-4 py-2 rounded-lg bg-[#FF6600] hover:bg-[#E55A00] text-white font-semibold flex items-center gap-2 shadow-lg shadow-orange-500/25"
        >
          <Plus size={18} /> Agregar numero
        </button>
      </div>

      {/* Lista de cuentas */}
      {loading ? (
        <div className="text-center py-12 text-[#6B7280]">
          <Loader2 size={28} className="animate-spin mx-auto mb-2" />
          Cargando cuentas...
        </div>
      ) : accounts.length === 0 ? (
        <div className="p-8 bg-[#141820] border border-[#1E2330] rounded-xl text-center">
          <p className="text-[#F0F2F5] font-semibold mb-2">Todavia no hay cuentas configuradas</p>
          <p className="text-sm text-[#9CA3AF] mb-4">Agrega tu primer numero de WhatsApp Business para empezar a enviar y recibir mensajes.</p>
          <button
            onClick={openNewForm}
            className="px-4 py-2 rounded-lg bg-[#FF6600] hover:bg-[#E55A00] text-white font-semibold inline-flex items-center gap-2"
          >
            <Plus size={18} /> Conectar primer numero
          </button>
        </div>
      ) : (
        <div className="space-y-3">
          {accounts.map(a => {
            const isEven = testResult && testResult.id === a.id
            return (
              <div
                key={a.id}
                className={`bg-[#141820] border rounded-xl p-5 ${a.active ? 'border-[#1E2330]' : 'border-[#1E2330] opacity-60'}`}
              >
                <div className="flex items-start justify-between gap-4 flex-wrap">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <h3 className="text-lg font-bold text-[#F0F2F5]">{a.display_name}</h3>
                      {a.is_default && (
                        <span className="px-2 py-0.5 bg-amber-500/20 text-amber-400 text-xs rounded-full flex items-center gap-1">
                          <Star size={12} /> Default
                        </span>
                      )}
                      {a.verification_status === 'verified' && (
                        <span className="px-2 py-0.5 bg-green-500/20 text-green-400 text-xs rounded-full flex items-center gap-1">
                          <CheckCircle2 size={12} /> Verificada
                        </span>
                      )}
                      {a.verification_status === 'error' && (
                        <span className="px-2 py-0.5 bg-red-500/20 text-red-400 text-xs rounded-full flex items-center gap-1">
                          <AlertCircle size={12} /> Error
                        </span>
                      )}
                      {a.verification_status === 'pending' && (
                        <span className="px-2 py-0.5 bg-slate-500/20 text-slate-400 text-xs rounded-full">
                          Sin probar
                        </span>
                      )}
                      {!a.active && (
                        <span className="px-2 py-0.5 bg-slate-500/20 text-slate-400 text-xs rounded-full">Desactivada</span>
                      )}
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 mt-3 text-sm">
                      <Field label="Empresa" value={getCompanyName(a.company_id)} />
                      <Field label="Telefono" value={a.phone_number} mono />
                      <Field label="Phone Number ID" value={a.phone_number_id} mono />
                      <Field label="WABA ID" value={a.whatsapp_business_account_id} mono />
                      <Field label="Token" value={a.access_token_last4 ? `••••${a.access_token_last4}` : '—'} mono />
                      <Field label="Webhook path" value={a.webhook_path} mono />
                    </div>
                    <div className="mt-3 p-3 bg-[#0A0D12] border border-[#1E2330] rounded-lg">
                      <div className="flex items-center justify-between gap-2 flex-wrap">
                        <div className="min-w-0 flex-1">
                          <div className="text-[10px] uppercase text-[#6B7280] tracking-wider">Webhook URL (copiar en Meta)</div>
                          <code className="text-xs text-[#F0F2F5] break-all">{a.webhook_url}</code>
                        </div>
                        <button
                          onClick={() => copyWebhookUrl(a.webhook_url)}
                          className="shrink-0 px-2 py-1 bg-[#1E2330] hover:bg-[#2A3040] rounded text-xs text-[#9CA3AF] flex items-center gap-1"
                        >
                          <Copy size={12} /> Copiar
                        </button>
                      </div>
                    </div>
                    {a.last_error && (
                      <div className="mt-2 text-xs text-red-400">Ultimo error: {a.last_error}</div>
                    )}
                    {isEven && testResult && (
                      <div className={`mt-2 text-xs flex items-center gap-2 ${testResult.ok ? 'text-green-400' : 'text-red-400'}`}>
                        {testResult.ok ? <CheckCircle2 size={14} /> : <AlertCircle size={14} />}
                        {testResult.msg}
                      </div>
                    )}
                  </div>

                  {/* Acciones */}
                  <div className="flex flex-col gap-2 shrink-0">
                    <button
                      onClick={() => handleTest(a)}
                      disabled={testing === a.id}
                      className="px-3 py-1.5 rounded-lg bg-blue-500/20 hover:bg-blue-500/30 text-blue-400 text-xs font-medium flex items-center gap-1.5 disabled:opacity-50"
                    >
                      {testing === a.id ? <Loader2 size={14} className="animate-spin" /> : <CheckCircle2 size={14} />}
                      Probar conexion
                    </button>
                    <button
                      onClick={() => openEditForm(a)}
                      className="px-3 py-1.5 rounded-lg bg-[#1E2330] hover:bg-[#2A3040] text-[#F0F2F5] text-xs font-medium"
                    >
                      Editar
                    </button>
                    {!a.is_default && (
                      <button
                        onClick={() => handleSetDefault(a)}
                        className="px-3 py-1.5 rounded-lg bg-[#1E2330] hover:bg-[#2A3040] text-[#9CA3AF] text-xs font-medium flex items-center gap-1.5"
                      >
                        <StarOff size={14} /> Hacer default
                      </button>
                    )}
                    <button
                      onClick={() => handleToggleActive(a)}
                      className="px-3 py-1.5 rounded-lg bg-[#1E2330] hover:bg-[#2A3040] text-[#9CA3AF] text-xs font-medium flex items-center gap-1.5"
                    >
                      <Power size={14} /> {a.active ? 'Desactivar' : 'Activar'}
                    </button>
                    <button
                      onClick={() => handleDelete(a)}
                      className="px-3 py-1.5 rounded-lg bg-red-500/10 hover:bg-red-500/20 text-red-400 text-xs font-medium flex items-center gap-1.5"
                    >
                      <Trash2 size={14} /> Borrar
                    </button>
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      )}

      {/* Ayuda / docs */}
      <div className="p-5 bg-[#0F1218] border border-[#1E2330] rounded-xl">
        <h3 className="text-sm font-semibold text-[#F0F2F5] mb-2 flex items-center gap-2">
          <ExternalLink size={16} /> Como obtener las credenciales
        </h3>
        <ol className="text-xs text-[#9CA3AF] space-y-1 list-decimal list-inside">
          <li>Crea una app tipo &quot;Business&quot; en <a href="https://developers.facebook.com/" target="_blank" rel="noopener noreferrer" className="text-[#FF6600] hover:underline">Meta for Developers</a>.</li>
          <li>Agregale el producto &quot;WhatsApp&quot; y registra o migra el numero al WABA.</li>
          <li>En <b>Settings → Basic</b> obtienes el <b>App Secret</b>.</li>
          <li>En <b>WhatsApp → API Setup</b> obtienes <b>Phone Number ID</b> y <b>WhatsApp Business Account ID</b>.</li>
          <li>Generá un <b>System User Token permanente</b> desde Business Manager (evita tokens de 24hs).</li>
          <li>Configurá el webhook en <b>Configuration → Webhooks</b> con la URL de arriba y el verify token.</li>
          <li>Suscribí los campos: <code>messages</code>, <code>message_template_status_update</code>.</li>
        </ol>
      </div>

      {/* Modal Form */}
      {formOpen && (
        <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4 overflow-auto" onClick={() => setFormOpen(false)}>
          <div
            className="bg-[#0F1218] border border-[#1E2330] rounded-2xl w-full max-w-2xl my-8 shadow-2xl"
            onClick={e => e.stopPropagation()}
          >
            <div className="flex items-center justify-between p-5 border-b border-[#1E2330]">
              <h2 className="text-lg font-bold text-[#F0F2F5]">
                {form.id ? 'Editar cuenta' : 'Conectar nuevo numero'}
              </h2>
              <button onClick={() => setFormOpen(false)} className="p-1.5 rounded-lg hover:bg-[#1E2330] text-[#9CA3AF]">
                <X size={18} />
              </button>
            </div>

            <form onSubmit={handleSubmit} className="p-5 space-y-4">
              {error && (
                <div className="p-3 bg-red-500/10 border border-red-500/30 text-red-400 text-sm rounded-lg">
                  {error}
                </div>
              )}

              <Input label="Empresa *" required>
                <select
                  value={formCompanyId}
                  onChange={e => setFormCompanyId(e.target.value)}
                  disabled={!!form.id}
                  className="w-full px-3 py-2 bg-[#141820] border border-[#1E2330] rounded-lg text-[#F0F2F5] text-sm focus:border-[#FF6600] focus:outline-none disabled:opacity-60"
                >
                  <option value="">— Eleg una empresa —</option>
                  {companies.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
              </Input>

              <Input label="Nombre para mostrar *" required>
                <input
                  required
                  value={form.display_name}
                  onChange={e => setForm({ ...form, display_name: e.target.value })}
                  placeholder="ej: TorqueTools ES - Principal"
                  className="input"
                />
              </Input>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <Input label="Numero (E.164) *" required>
                  <input
                    required
                    value={form.phone_number}
                    onChange={e => setForm({ ...form, phone_number: e.target.value })}
                    placeholder="+34600123456"
                    className="input"
                  />
                </Input>
                <Input label="Business Name">
                  <input
                    value={form.business_name}
                    onChange={e => setForm({ ...form, business_name: e.target.value })}
                    placeholder="TorqueTools SL"
                    className="input"
                  />
                </Input>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <Input label="Phone Number ID *" required>
                  <input
                    required
                    value={form.phone_number_id}
                    onChange={e => setForm({ ...form, phone_number_id: e.target.value })}
                    placeholder="123456789012345"
                    className="input"
                  />
                </Input>
                <Input label="WhatsApp Business Account ID *" required>
                  <input
                    required
                    value={form.whatsapp_business_account_id}
                    onChange={e => setForm({ ...form, whatsapp_business_account_id: e.target.value })}
                    placeholder="987654321098765"
                    className="input"
                  />
                </Input>
              </div>

              <Input
                label={`Access Token ${form.id ? '(dejar vacio para no cambiar)' : '*'}`}
                required={!form.id}
              >
                <TokenInput
                  value={form.access_token}
                  onChange={v => setForm({ ...form, access_token: v })}
                  required={!form.id}
                  placeholder="EAAIl..."
                  show={!!showTokens.access_token}
                  onToggleShow={() => setShowTokens(s => ({ ...s, access_token: !s.access_token }))}
                />
              </Input>

              <Input
                label={`App Secret ${form.id ? '(dejar vacio para no cambiar)' : '*'}`}
                required={!form.id}
              >
                <TokenInput
                  value={form.app_secret}
                  onChange={v => setForm({ ...form, app_secret: v })}
                  required={!form.id}
                  placeholder="abc123def456..."
                  show={!!showTokens.app_secret}
                  onToggleShow={() => setShowTokens(s => ({ ...s, app_secret: !s.app_secret }))}
                />
              </Input>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <Input
                  label={`Webhook Verify Token ${form.id ? '(dejar vacio para no cambiar)' : '*'}`}
                  required={!form.id}
                >
                  <TokenInput
                    value={form.webhook_verify_token}
                    onChange={v => setForm({ ...form, webhook_verify_token: v })}
                    required={!form.id}
                    placeholder="token-privado-123"
                    show={!!showTokens.verify_token}
                    onToggleShow={() => setShowTokens(s => ({ ...s, verify_token: !s.verify_token }))}
                  />
                </Input>
                <Input label="Webhook Path (slug unico) *" required>
                  <input
                    required
                    value={form.webhook_path}
                    disabled={!!form.id}
                    onChange={e => setForm({ ...form, webhook_path: e.target.value.toLowerCase().replace(/[^a-z0-9\-_]/g, '') })}
                    placeholder="tt-es-prod"
                    className="input"
                  />
                </Input>
              </div>

              <label className="flex items-center gap-2 text-sm text-[#F0F2F5]">
                <input
                  type="checkbox"
                  checked={form.is_default}
                  onChange={e => setForm({ ...form, is_default: e.target.checked })}
                  className="w-4 h-4 accent-[#FF6600]"
                />
                Hacer cuenta por defecto de esta empresa
              </label>

              <div className="flex items-center gap-2 pt-2">
                <button
                  type="submit"
                  disabled={saving}
                  className="px-4 py-2 rounded-lg bg-[#FF6600] hover:bg-[#E55A00] text-white font-semibold disabled:opacity-50 flex items-center gap-2"
                >
                  {saving && <Loader2 size={16} className="animate-spin" />}
                  {form.id ? 'Guardar cambios' : 'Conectar'}
                </button>
                <button
                  type="button"
                  onClick={() => setFormOpen(false)}
                  className="px-4 py-2 rounded-lg bg-[#1E2330] hover:bg-[#2A3040] text-[#F0F2F5]"
                >
                  Cancelar
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      <style jsx>{`
        .input {
          width: 100%;
          padding: 8px 12px;
          background: #141820;
          border: 1px solid #1E2330;
          border-radius: 8px;
          color: #F0F2F5;
          font-size: 14px;
        }
        .input:focus {
          border-color: #FF6600;
          outline: none;
        }
        .input:disabled { opacity: 0.6; }
      `}</style>
    </div>
  )
}

// ----------------------------------------------------------------------------
// Subcomponentes
// ----------------------------------------------------------------------------
function Field({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="min-w-0">
      <div className="text-[10px] uppercase text-[#6B7280] tracking-wider">{label}</div>
      <div className={`text-sm text-[#F0F2F5] truncate ${mono ? 'font-mono' : ''}`}>{value}</div>
    </div>
  )
}

function Input({ label, children, required }: { label: string; children: React.ReactNode; required?: boolean }) {
  return (
    <label className="block">
      <div className="text-xs text-[#9CA3AF] mb-1 font-medium">
        {label} {required && <span className="text-red-400">*</span>}
      </div>
      {children}
    </label>
  )
}

function TokenInput({
  value, onChange, required, placeholder, show, onToggleShow,
}: {
  value: string; onChange: (v: string) => void; required?: boolean
  placeholder?: string; show: boolean; onToggleShow: () => void
}) {
  return (
    <div className="relative">
      <input
        required={required}
        type={show ? 'text' : 'password'}
        value={value}
        onChange={e => onChange(e.target.value)}
        placeholder={placeholder}
        className="w-full px-3 py-2 pr-10 bg-[#141820] border border-[#1E2330] rounded-lg text-[#F0F2F5] text-sm font-mono focus:border-[#FF6600] focus:outline-none"
      />
      <button
        type="button"
        onClick={onToggleShow}
        className="absolute right-2 top-1/2 -translate-y-1/2 p-1 text-[#6B7280] hover:text-[#F0F2F5]"
      >
        {show ? <EyeOff size={16} /> : <Eye size={16} />}
      </button>
    </div>
  )
}
