'use client'

/**
 * <ClientDetailView clientId={...} />
 *
 * Vista 360° del cliente — pensada para usarse como página standalone
 * (`/clientes/[id]/page.tsx`) o embebida desde un modal/drawer.
 *
 * Layout 3 columnas (desktop):
 *  - Sidebar izquierda  : datos básicos + contactos
 *  - Centro             : documentos del cliente con tabs (Presupuestos /
 *                          Pedidos / Albaranes / Facturas / Cobros)
 *  - Sidebar derecha    : cuenta corriente resumen + actividad reciente
 *
 * NUNCA usar supabase como dep de useCallback. Crear sb adentro.
 */

import { useEffect, useState, useCallback, useMemo } from 'react'
import Link from 'next/link'
import { useRouter, useSearchParams } from 'next/navigation'
import {
  ArrowLeft, Mail, Phone, MessageSquare, Globe, MapPin,
  CreditCard, FileText, Loader2, Edit3, Users, Activity, Hash,
  AlertCircle,
} from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Tabs } from '@/components/ui/tabs'
import { formatCurrency, formatDate, formatRelative, getInitials } from '@/lib/utils'
import { DocLink } from '@/components/ui/doc-link'
import { ClientDetailModal } from '@/components/clientes/client-detail-modal'

interface Props {
  clientId: string
}

interface ClientRow {
  id: string
  company_id?: string | null
  name: string | null
  legal_name: string | null
  trade_name?: string | null
  tax_id: string | null
  tax_id_type?: string | null
  email: string | null
  phone: string | null
  whatsapp?: string | null
  website?: string | null
  address: string | null
  city: string | null
  state?: string | null
  postal_code?: string | null
  country: string | null
  category?: string | null
  payment_terms?: string | null
  payment_terms_days?: number | null
  credit_limit?: number | null
  currency?: string | null
  notes?: string | null
  commercial_notes?: string | null
  is_favorite?: boolean | null
  active?: boolean | null
  created_at?: string | null
}

interface ContactRow {
  id: string
  name: string
  position: string | null
  email: string | null
  phone: string | null
  whatsapp: string | null
  is_primary: boolean
}

interface DocRow {
  id: string
  doc_type: string
  system_code: string
  display_ref: string | null
  status: string
  total: number
  currency: string
  created_at: string
}

interface PaymentRow {
  id: string
  amount: number
  currency: string
  method: string | null
  paid_at: string | null
  created_at: string
  invoice_id: string | null
}

interface ActivityRow {
  id: string
  action: string
  description: string | null
  created_at: string
}

const DOC_TAB_TYPES: Record<string, string[]> = {
  presupuestos: ['presupuesto', 'quote'],
  pedidos: ['pedido', 'order', 'so'],
  albaranes: ['albaran', 'delivery_note'],
  facturas: ['factura', 'factura_abono', 'invoice'],
}

function statusTone(status: string): 'default' | 'success' | 'warning' | 'danger' {
  const s = (status || '').toLowerCase()
  if (['paid', 'completed', 'closed', 'invoiced', 'delivered'].includes(s)) return 'success'
  if (['pending', 'partial', 'open', 'draft', 'sent', 'confirmed'].includes(s)) return 'warning'
  if (['cancelled', 'canceled', 'overdue', 'rejected'].includes(s)) return 'danger'
  return 'default'
}

export function ClientDetailView({ clientId }: Props) {
  const router = useRouter()
  const searchParams = useSearchParams()
  const initialTab = searchParams.get('tab') || 'presupuestos'

  const [client, setClient] = useState<ClientRow | null>(null)
  const [contacts, setContacts] = useState<ContactRow[]>([])
  const [documents, setDocuments] = useState<DocRow[]>([])
  const [payments, setPayments] = useState<PaymentRow[]>([])
  const [activity, setActivity] = useState<ActivityRow[]>([])
  const [loading, setLoading] = useState(true)
  const [notFound, setNotFound] = useState(false)
  const [editOpen, setEditOpen] = useState(false)

  const reload = useCallback(async () => {
    setLoading(true)
    const sb = createClient()
    const { data: c, error: cErr } = await sb
      .from('tt_clients')
      .select('*')
      .eq('id', clientId)
      .maybeSingle()
    if (cErr || !c) {
      setNotFound(true)
      setLoading(false)
      return
    }
    setClient(c as ClientRow)

    // Cargo en paralelo: contactos, documentos, pagos, actividad
    const [contactsRes, docsRes, paymentsRes, activityRes] = await Promise.all([
      sb
        .from('tt_client_contacts')
        .select('id, name, position, email, phone, whatsapp, is_primary')
        .eq('client_id', clientId)
        .order('is_primary', { ascending: false }),
      sb
        .from('tt_documents')
        .select('id, doc_type, system_code, display_ref, status, total, currency, created_at')
        .eq('client_id', clientId)
        .order('created_at', { ascending: false })
        .limit(300),
      sb
        .from('tt_payments')
        .select('id, amount, currency, method, paid_at, created_at, invoice_id')
        .eq('client_id', clientId)
        .order('created_at', { ascending: false })
        .limit(100),
      sb
        .from('tt_activity_log')
        .select('id, action, description, created_at')
        .eq('entity_type', 'client')
        .eq('entity_id', clientId)
        .order('created_at', { ascending: false })
        .limit(20),
    ])

    setContacts(((contactsRes.data || []) as ContactRow[]))
    setDocuments(((docsRes.data || []) as DocRow[]))
    setPayments(((paymentsRes.data || []) as PaymentRow[]))
    setActivity(((activityRes.data || []) as ActivityRow[]))
    setLoading(false)
  }, [clientId])

  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { void reload() }, [reload])

  // ─── Cuenta corriente: agregados rápidos
  const ccSummary = useMemo(() => {
    const invoices = documents.filter(d => DOC_TAB_TYPES.facturas.includes(d.doc_type))
    const totalInvoiced = invoices.reduce((s, d) => s + (Number(d.total) || 0), 0)
    const pendingInvoices = invoices.filter(d => ['pending', 'partial', 'open', 'sent'].includes((d.status || '').toLowerCase()))
    const pendingAmount = pendingInvoices.reduce((s, d) => s + (Number(d.total) || 0), 0)
    const paid = payments.reduce((s, p) => s + (Number(p.amount) || 0), 0)
    const balance = pendingAmount - paid // > 0 = debe; < 0 = saldo a favor
    return {
      totalInvoiced,
      pendingAmount,
      paid,
      balance,
      invoicesCount: invoices.length,
      pendingCount: pendingInvoices.length,
      currency: (client?.currency || invoices[0]?.currency || 'EUR') as 'EUR' | 'USD' | 'ARS',
    }
  }, [documents, payments, client])

  // ─── Filtrar documentos por tab
  const docsByTab = useMemo(() => {
    const out: Record<string, DocRow[]> = {
      presupuestos: [],
      pedidos: [],
      albaranes: [],
      facturas: [],
    }
    for (const d of documents) {
      for (const [tab, types] of Object.entries(DOC_TAB_TYPES)) {
        if (types.includes(d.doc_type)) {
          out[tab].push(d)
          break
        }
      }
    }
    return out
  }, [documents])

  if (notFound) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] gap-4 text-center px-4">
        <AlertCircle className="text-red-500" size={48} />
        <h1 className="text-xl font-bold text-[#F0F2F5]">Cliente no encontrado</h1>
        <p className="text-sm text-[#9CA3AF]">
          No existe un cliente con el ID solicitado o no tenés permisos para verlo.
        </p>
        <Link href="/clientes">
          <Button variant="primary">Volver a clientes</Button>
        </Link>
      </div>
    )
  }

  if (loading || !client) {
    return (
      <div className="flex items-center gap-2 px-5 py-6 text-sm text-[#9CA3AF]">
        <Loader2 size={16} className="animate-spin text-[#FF6600]" />
        Cargando ficha del cliente…
      </div>
    )
  }

  const displayName = client.legal_name || client.name || 'Sin nombre'

  const tabs = [
    { id: 'presupuestos', label: `Presupuestos (${docsByTab.presupuestos.length})` },
    { id: 'pedidos', label: `Pedidos (${docsByTab.pedidos.length})` },
    { id: 'albaranes', label: `Albaranes (${docsByTab.albaranes.length})` },
    { id: 'facturas', label: `Facturas (${docsByTab.facturas.length})` },
    { id: 'cobros', label: `Cobros (${payments.length})` },
    { id: 'cuenta-corriente', label: 'Cuenta corriente' },
  ]

  return (
    <div className="px-3 sm:px-5 py-4 space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <Link
          href="/clientes"
          className="inline-flex items-center gap-2 text-sm text-[#9CA3AF] hover:text-[#F0F2F5] transition-colors"
        >
          <ArrowLeft size={16} />
          Volver a clientes
        </Link>
        <div className="flex items-center gap-2">
          {client.phone && (
            <a href={`tel:${client.phone}`}>
              <Button variant="ghost" size="sm"><Phone size={14} /></Button>
            </a>
          )}
          {client.email && (
            <a href={`mailto:${client.email}`}>
              <Button variant="ghost" size="sm"><Mail size={14} /></Button>
            </a>
          )}
          {client.phone && (
            <a
              href={`https://wa.me/${client.phone.replace(/[^0-9+]/g, '')}`}
              target="_blank"
              rel="noreferrer"
            >
              <Button variant="ghost" size="sm"><MessageSquare size={14} /></Button>
            </a>
          )}
          <Button variant="secondary" size="sm" onClick={() => setEditOpen(true)}>
            <Edit3 size={14} className="mr-1" />
            Editar ficha
          </Button>
        </div>
      </div>

      {/* 3-col layout */}
      <div className="grid grid-cols-1 lg:grid-cols-[280px_minmax(0,1fr)_300px] gap-4">

        {/* LEFT: datos + contactos */}
        <div className="space-y-4 order-2 lg:order-1">
          <Card>
            <div className="space-y-3">
              <div className="w-14 h-14 rounded-xl bg-[#FF6600]/20 flex items-center justify-center mx-auto">
                <span className="text-xl font-bold text-[#FF6600]">{getInitials(displayName)}</span>
              </div>
              <h2 className="text-center text-sm font-bold text-[#F0F2F5]">{displayName}</h2>
              {client.tax_id && (
                <p className="text-center text-xs font-mono text-[#9CA3AF]">{client.tax_id}</p>
              )}
              {client.category && (
                <div className="flex justify-center">
                  <Badge variant="default">{client.category}</Badge>
                </div>
              )}
              <div className="pt-2 border-t border-[#1E2330] space-y-2 text-xs">
                {client.email && (
                  <div className="flex items-center gap-2 text-[#9CA3AF]">
                    <Mail size={12} /> <span className="truncate">{client.email}</span>
                  </div>
                )}
                {client.phone && (
                  <div className="flex items-center gap-2 text-[#9CA3AF]">
                    <Phone size={12} /> <span>{client.phone}</span>
                  </div>
                )}
                {client.website && (
                  <div className="flex items-center gap-2 text-[#9CA3AF]">
                    <Globe size={12} /> <span className="truncate">{client.website}</span>
                  </div>
                )}
                {(client.address || client.city) && (
                  <div className="flex items-start gap-2 text-[#9CA3AF]">
                    <MapPin size={12} className="mt-0.5" />
                    <span>
                      {[client.address, client.city, client.state, client.country].filter(Boolean).join(', ')}
                    </span>
                  </div>
                )}
                {client.payment_terms && (
                  <div className="flex items-center gap-2 text-[#9CA3AF]">
                    <CreditCard size={12} /> <span>{client.payment_terms}</span>
                  </div>
                )}
              </div>
            </div>
          </Card>

          {/* Contactos */}
          <Card>
            <div className="flex items-center gap-2 mb-3">
              <Users size={14} className="text-[#FF6600]" />
              <h3 className="text-xs font-semibold text-[#6B7280] uppercase">
                Contactos ({contacts.length})
              </h3>
            </div>
            {contacts.length === 0 ? (
              <p className="text-xs text-[#4B5563]">Sin contactos registrados</p>
            ) : (
              <div className="space-y-2">
                {contacts.map(c => (
                  <div key={c.id} className="p-2 rounded-lg bg-[#0F1218] border border-[#1E2330]">
                    <div className="flex items-center justify-between">
                      <p className="text-xs font-semibold text-[#F0F2F5]">{c.name}</p>
                      {c.is_primary && <Badge variant="success">Principal</Badge>}
                    </div>
                    {c.position && <p className="text-[10px] text-[#6B7280]">{c.position}</p>}
                    {c.email && <p className="text-[10px] text-[#9CA3AF] mt-1 truncate">{c.email}</p>}
                    {c.phone && <p className="text-[10px] text-[#9CA3AF]">{c.phone}</p>}
                  </div>
                ))}
              </div>
            )}
          </Card>
        </div>

        {/* CENTRO: tabs con documentos */}
        <div className="space-y-4 order-1 lg:order-2 min-w-0">
          <Tabs tabs={tabs} defaultTab={initialTab}>
            {(activeTab) => (
              <div>
                {activeTab === 'cuenta-corriente' ? (
                  <CCDetail
                    documents={documents}
                    payments={payments}
                    currency={ccSummary.currency}
                  />
                ) : activeTab === 'cobros' ? (
                  <PaymentsTable payments={payments} />
                ) : (
                  <DocsTable
                    docs={docsByTab[activeTab] || []}
                    onClick={(id) => router.push(`/documentos/${id}`)}
                  />
                )}
              </div>
            )}
          </Tabs>
        </div>

        {/* RIGHT: CC resumen + actividad */}
        <div className="space-y-4 order-3">
          <Card>
            <div className="flex items-center gap-2 mb-3">
              <CreditCard size={14} className="text-[#FF6600]" />
              <h3 className="text-xs font-semibold text-[#6B7280] uppercase">Cuenta corriente</h3>
            </div>
            <div className="space-y-2">
              <CCStat
                label="Total facturado"
                value={formatCurrency(ccSummary.totalInvoiced, ccSummary.currency)}
              />
              <CCStat
                label="Pendiente cobro"
                value={formatCurrency(ccSummary.pendingAmount, ccSummary.currency)}
                tone={ccSummary.pendingAmount > 0 ? 'warning' : 'default'}
              />
              <CCStat
                label="Total cobrado"
                value={formatCurrency(ccSummary.paid, ccSummary.currency)}
                tone="success"
              />
              <div className="border-t border-[#1E2330] pt-2">
                <CCStat
                  label="Saldo"
                  value={formatCurrency(Math.abs(ccSummary.balance), ccSummary.currency)}
                  tone={ccSummary.balance > 0 ? 'danger' : ccSummary.balance < 0 ? 'success' : 'default'}
                  sub={ccSummary.balance > 0 ? 'A deber' : ccSummary.balance < 0 ? 'A favor' : 'Saldado'}
                />
              </div>
            </div>
            {client.credit_limit ? (
              <p className="text-[10px] text-[#6B7280] mt-3">
                Límite crédito: {formatCurrency(client.credit_limit, ccSummary.currency)}
              </p>
            ) : null}
          </Card>

          <Card>
            <div className="flex items-center gap-2 mb-3">
              <Activity size={14} className="text-[#FF6600]" />
              <h3 className="text-xs font-semibold text-[#6B7280] uppercase">Actividad reciente</h3>
            </div>
            {activity.length === 0 ? (
              <p className="text-xs text-[#4B5563]">Sin actividad reciente</p>
            ) : (
              <div className="space-y-2">
                {activity.slice(0, 10).map(a => (
                  <div key={a.id} className="p-2 rounded-lg bg-[#0F1218]">
                    <p className="text-xs text-[#F0F2F5]">{a.action}</p>
                    {a.description && (
                      <p className="text-[10px] text-[#6B7280] mt-0.5 line-clamp-2">{a.description}</p>
                    )}
                    <p className="text-[10px] text-[#4B5563] mt-1">{formatRelative(a.created_at)}</p>
                  </div>
                ))}
              </div>
            )}
          </Card>
        </div>
      </div>

      {/* Modal edición ficha */}
      <ClientDetailModal
        open={editOpen}
        onClose={() => setEditOpen(false)}
        client={client as unknown as Parameters<typeof ClientDetailModal>[0]['client']}
        onSaved={() => { setEditOpen(false); void reload() }}
      />
    </div>
  )
}

// ─── helpers UI ──────────────────────────────────────────

function CCStat({ label, value, sub, tone = 'default' }: {
  label: string; value: string; sub?: string;
  tone?: 'default' | 'success' | 'warning' | 'danger'
}) {
  const colors: Record<string, string> = {
    default: 'text-[#F0F2F5]',
    success: 'text-emerald-400',
    warning: 'text-amber-400',
    danger: 'text-red-400',
  }
  return (
    <div className="flex items-center justify-between gap-2">
      <span className="text-[11px] text-[#6B7280]">{label}</span>
      <div className="text-right">
        <p className={`text-xs font-semibold ${colors[tone]}`}>{value}</p>
        {sub && <p className="text-[10px] text-[#4B5563]">{sub}</p>}
      </div>
    </div>
  )
}

function DocsTable({ docs, onClick }: { docs: DocRow[]; onClick: (id: string) => void }) {
  if (docs.length === 0) {
    return (
      <div className="p-8 text-center text-xs text-[#6B7280]">
        <FileText size={32} className="mx-auto mb-2 text-[#3A4252]" />
        No hay documentos en esta categoría.
      </div>
    )
  }
  return (
    <div className="space-y-1">
      {docs.map(d => (
        <button
          key={d.id}
          onClick={() => onClick(d.id)}
          className="w-full flex items-center justify-between gap-3 p-3 rounded-lg bg-[#0F1218] border border-[#1E2330] hover:border-[#FF6600]/40 hover:bg-[#141820] transition-colors text-left"
        >
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <DocLink
                docRef={(d.display_ref || d.system_code) as string}
                docId={d.id}
                docType={d.doc_type}
                className="text-xs font-mono"
              />
              <Badge variant={statusTone(d.status)}>{d.status}</Badge>
            </div>
            <p className="text-[10px] text-[#6B7280] mt-1">{formatDate(d.created_at)}</p>
          </div>
          <span className="text-sm font-semibold text-[#F0F2F5]">
            {formatCurrency(Number(d.total) || 0, (d.currency || 'EUR') as 'EUR' | 'USD' | 'ARS')}
          </span>
        </button>
      ))}
    </div>
  )
}

function PaymentsTable({ payments }: { payments: PaymentRow[] }) {
  if (payments.length === 0) {
    return (
      <div className="p-8 text-center text-xs text-[#6B7280]">
        <CreditCard size={32} className="mx-auto mb-2 text-[#3A4252]" />
        Sin cobros registrados.
      </div>
    )
  }
  return (
    <div className="space-y-1">
      {payments.map(p => (
        <div
          key={p.id}
          className="flex items-center justify-between gap-3 p-3 rounded-lg bg-[#0F1218] border border-[#1E2330]"
        >
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <Hash size={12} className="text-[#6B7280]" />
              <span className="text-xs font-mono text-[#F0F2F5]">{p.id.slice(0, 8)}</span>
              {p.method && <Badge variant="default">{p.method}</Badge>}
            </div>
            <p className="text-[10px] text-[#6B7280] mt-1">
              {formatDate(p.paid_at || p.created_at)}
            </p>
          </div>
          <span className="text-sm font-semibold text-emerald-400">
            {formatCurrency(Number(p.amount) || 0, (p.currency || 'EUR') as 'EUR' | 'USD' | 'ARS')}
          </span>
        </div>
      ))}
    </div>
  )
}

function CCDetail({ documents, payments, currency }: {
  documents: DocRow[]; payments: PaymentRow[]; currency: 'EUR' | 'USD' | 'ARS'
}) {
  // Combinar invoices y payments como movimientos
  const invoices = documents.filter(d => DOC_TAB_TYPES.facturas.includes(d.doc_type))
  const rows = useMemo(() => {
    type Row = { id: string; date: string; ref: string; type: 'invoice' | 'payment'; debit: number; credit: number }
    const out: Row[] = []
    for (const i of invoices) {
      out.push({
        id: i.id, date: i.created_at, ref: i.display_ref || i.system_code,
        type: 'invoice', debit: Number(i.total) || 0, credit: 0,
      })
    }
    for (const p of payments) {
      out.push({
        id: p.id, date: p.paid_at || p.created_at, ref: `Cobro ${p.method || ''}`.trim(),
        type: 'payment', debit: 0, credit: Number(p.amount) || 0,
      })
    }
    out.sort((a, b) => a.date.localeCompare(b.date))
    return out
  }, [invoices, payments])

  let running = 0
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-xs">
        <thead className="bg-[#0F1218] text-[#6B7280] uppercase">
          <tr>
            <th className="px-3 py-2 text-left">Fecha</th>
            <th className="px-3 py-2 text-left">Referencia</th>
            <th className="px-3 py-2 text-right">Debe</th>
            <th className="px-3 py-2 text-right">Haber</th>
            <th className="px-3 py-2 text-right">Saldo</th>
          </tr>
        </thead>
        <tbody>
          {rows.length === 0 && (
            <tr>
              <td colSpan={5} className="px-3 py-8 text-center text-[#6B7280]">
                Sin movimientos de cuenta corriente.
              </td>
            </tr>
          )}
          {rows.map(r => {
            running += r.debit - r.credit
            return (
              <tr key={`${r.type}-${r.id}`} className="border-b border-[#1E2330]">
                <td className="px-3 py-2 text-[#9CA3AF]">{formatDate(r.date)}</td>
                <td className="px-3 py-2 text-[#F0F2F5]">{r.ref}</td>
                <td className="px-3 py-2 text-right text-red-400">
                  {r.debit ? formatCurrency(r.debit, currency) : ''}
                </td>
                <td className="px-3 py-2 text-right text-emerald-400">
                  {r.credit ? formatCurrency(r.credit, currency) : ''}
                </td>
                <td className="px-3 py-2 text-right font-semibold text-[#F0F2F5]">
                  {formatCurrency(running, currency)}
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}
