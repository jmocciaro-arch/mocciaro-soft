'use client'

/**
 * <SupplierDetailView supplierId={...} />
 *
 * Vista 360° del proveedor — pensada para usarse como página standalone
 * (`/proveedores/[id]/page.tsx`).
 *
 * 3 columnas (desktop):
 *  - Sidebar izquierda: datos básicos + contactos
 *  - Centro: tabs OC / Facturas compra / Pagos / Anticipos
 *  - Sidebar derecha: KPIs (gasto YTD, OCs abiertas) + actividad reciente
 *
 * NUNCA `supabase` en deps de useCallback. `const sb = createClient()` adentro.
 */

import { useEffect, useState, useCallback, useMemo } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import {
  ArrowLeft, Mail, Phone, MessageSquare, MapPin,
  CreditCard, FileText, Loader2, Users, AlertCircle,
  Truck, DollarSign, Hash,
} from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Tabs } from '@/components/ui/tabs'
import { formatCurrency, formatDate, getInitials } from '@/lib/utils'
import { DocLink } from '@/components/ui/doc-link'

interface Props {
  supplierId: string
}

interface SupplierRow {
  id: string
  name: string
  legal_name: string | null
  reference: string | null
  tax_id: string | null
  email: string | null
  phone: string | null
  address: string | null
  city: string | null
  country: string | null
  payment_terms: string | null
  category: string | null
  notes: string | null
  active: boolean
  created_at: string
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

interface AdvanceRow {
  id: string
  amount: number
  currency: string
  status: string
  expected_goods_date: string | null
  created_at: string
}

function statusTone(status: string): 'default' | 'success' | 'warning' | 'danger' {
  const s = (status || '').toLowerCase()
  if (['paid', 'completed', 'closed', 'received'].includes(s)) return 'success'
  if (['pending', 'partial', 'open', 'draft', 'sent', 'confirmed'].includes(s)) return 'warning'
  if (['cancelled', 'canceled', 'overdue', 'rejected'].includes(s)) return 'danger'
  return 'default'
}

export function SupplierDetailView({ supplierId }: Props) {
  const router = useRouter()
  const [supplier, setSupplier] = useState<SupplierRow | null>(null)
  const [contacts, setContacts] = useState<ContactRow[]>([])
  const [pos, setPos] = useState<DocRow[]>([])
  const [invoices, setInvoices] = useState<DocRow[]>([])
  const [payments, setPayments] = useState<PaymentRow[]>([])
  const [advances, setAdvances] = useState<AdvanceRow[]>([])
  const [loading, setLoading] = useState(true)
  const [notFound, setNotFound] = useState(false)

  const reload = useCallback(async () => {
    setLoading(true)
    const sb = createClient()

    const { data: s, error } = await sb
      .from('tt_suppliers')
      .select('*')
      .eq('id', supplierId)
      .maybeSingle()
    if (error || !s) {
      setNotFound(true)
      setLoading(false)
      return
    }
    setSupplier(s as SupplierRow)

    // En paralelo: contactos, POs (purchase_orders), facturas compra, pagos, anticipos
    const [contactsRes, poRes, invRes, payRes, advRes] = await Promise.all([
      sb
        .from('tt_supplier_contacts')
        .select('id, name, position, email, phone, whatsapp, is_primary')
        .eq('supplier_id', supplierId)
        .order('is_primary', { ascending: false }),
      sb
        .from('tt_purchase_orders')
        .select('document_id, tt_documents!inner(id, doc_type, system_code, display_ref, status, total, currency, created_at)')
        .eq('supplier_id', supplierId)
        .order('created_at', { foreignTable: 'tt_documents', ascending: false })
        .limit(50),
      sb
        .from('tt_purchase_invoices')
        .select('id, supplier_invoice_number, status, total, currency, invoice_date, created_at, document_id')
        .eq('supplier_id', supplierId)
        .order('created_at', { ascending: false })
        .limit(50),
      sb
        .from('tt_purchase_payments')
        .select('id, amount, currency, method, paid_at, created_at, invoice_id')
        .eq('supplier_id', supplierId)
        .order('created_at', { ascending: false })
        .limit(50),
      sb
        .from('tt_purchase_advances')
        .select('id, amount, currency, status, expected_goods_date, created_at')
        .eq('supplier_id', supplierId)
        .order('created_at', { ascending: false })
        .limit(50),
    ])

    setContacts(((contactsRes.data || []) as ContactRow[]))

    setPos(
      ((poRes.data || []) as Array<Record<string, unknown>>)
        .map(r => (r.tt_documents as DocRow | null))
        .filter((d): d is DocRow => !!d)
    )

    // Facturas de compra: pueden tener su propio document_id ó vivir como tt_purchase_invoices
    setInvoices(
      ((invRes.data || []) as Array<Record<string, unknown>>).map(i => ({
        id: i.id as string,
        doc_type: 'factura_compra',
        system_code: (i.supplier_invoice_number as string) || (i.id as string).slice(0, 8),
        display_ref: (i.supplier_invoice_number as string) || null,
        status: (i.status as string) || 'pending',
        total: Number(i.total) || 0,
        currency: (i.currency as string) || 'EUR',
        created_at: (i.invoice_date as string) || (i.created_at as string),
      }))
    )

    setPayments(((payRes.data || []) as PaymentRow[]))
    setAdvances(((advRes.data || []) as AdvanceRow[]))
    setLoading(false)
  }, [supplierId])

  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { void reload() }, [reload])

  const stats = useMemo(() => {
    const totalOC = pos.reduce((s, d) => s + (Number(d.total) || 0), 0)
    const openOC = pos.filter(d => !['received', 'completed', 'closed', 'cancelled'].includes((d.status || '').toLowerCase())).length
    const totalInv = invoices.reduce((s, d) => s + (Number(d.total) || 0), 0)
    const paid = payments.reduce((s, p) => s + (Number(p.amount) || 0), 0)
    const totalAdv = advances.reduce((s, a) => s + (Number(a.amount) || 0), 0)
    return { totalOC, openOC, totalInv, paid, totalAdv, balance: totalInv - paid - totalAdv }
  }, [pos, invoices, payments, advances])

  if (notFound) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] gap-4 text-center px-4">
        <AlertCircle className="text-red-500" size={48} />
        <h1 className="text-xl font-bold text-[#F0F2F5]">Proveedor no encontrado</h1>
        <Link href="/compras?tab=proveedores">
          <Button variant="primary">Volver a proveedores</Button>
        </Link>
      </div>
    )
  }

  if (loading || !supplier) {
    return (
      <div className="flex items-center gap-2 px-5 py-6 text-sm text-[#9CA3AF]">
        <Loader2 size={16} className="animate-spin text-[#FF6600]" />
        Cargando proveedor…
      </div>
    )
  }

  const displayName = supplier.legal_name || supplier.name

  const tabs = [
    { id: 'ocs', label: `OC (${pos.length})` },
    { id: 'facturas', label: `Facturas (${invoices.length})` },
    { id: 'pagos', label: `Pagos (${payments.length})` },
    { id: 'anticipos', label: `Anticipos (${advances.length})` },
  ]

  return (
    <div className="px-3 sm:px-5 py-4 space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <Link
          href="/compras?tab=proveedores"
          className="inline-flex items-center gap-2 text-sm text-[#9CA3AF] hover:text-[#F0F2F5]"
        >
          <ArrowLeft size={16} />
          Volver a proveedores
        </Link>
        <div className="flex items-center gap-2">
          {supplier.phone && (
            <a href={`tel:${supplier.phone}`}><Button variant="ghost" size="sm"><Phone size={14} /></Button></a>
          )}
          {supplier.email && (
            <a href={`mailto:${supplier.email}`}><Button variant="ghost" size="sm"><Mail size={14} /></Button></a>
          )}
          {supplier.phone && (
            <a href={`https://wa.me/${supplier.phone.replace(/[^0-9+]/g, '')}`} target="_blank" rel="noreferrer">
              <Button variant="ghost" size="sm"><MessageSquare size={14} /></Button>
            </a>
          )}
          <Button
            variant="secondary"
            size="sm"
            onClick={() => router.push(`/compras?tab=proveedores&supplierId=${supplier.id}`)}
          >
            Editar ficha
          </Button>
        </div>
      </div>

      {/* 3-col layout */}
      <div className="grid grid-cols-1 lg:grid-cols-[280px_minmax(0,1fr)_300px] gap-4">

        {/* LEFT */}
        <div className="space-y-4 order-2 lg:order-1">
          <Card>
            <div className="space-y-3">
              <div className="w-14 h-14 rounded-xl bg-[#FF6600]/20 flex items-center justify-center mx-auto">
                <span className="text-xl font-bold text-[#FF6600]">{getInitials(displayName)}</span>
              </div>
              <h2 className="text-center text-sm font-bold text-[#F0F2F5]">{displayName}</h2>
              {supplier.tax_id && (
                <p className="text-center text-xs font-mono text-[#9CA3AF]">{supplier.tax_id}</p>
              )}
              {supplier.category && (
                <div className="flex justify-center"><Badge variant="default">{supplier.category}</Badge></div>
              )}
              <div className="pt-2 border-t border-[#1E2330] space-y-2 text-xs">
                {supplier.email && (
                  <div className="flex items-center gap-2 text-[#9CA3AF]">
                    <Mail size={12} /> <span className="truncate">{supplier.email}</span>
                  </div>
                )}
                {supplier.phone && (
                  <div className="flex items-center gap-2 text-[#9CA3AF]">
                    <Phone size={12} /> <span>{supplier.phone}</span>
                  </div>
                )}
                {(supplier.address || supplier.city) && (
                  <div className="flex items-start gap-2 text-[#9CA3AF]">
                    <MapPin size={12} className="mt-0.5" />
                    <span>{[supplier.address, supplier.city, supplier.country].filter(Boolean).join(', ')}</span>
                  </div>
                )}
                {supplier.payment_terms && (
                  <div className="flex items-center gap-2 text-[#9CA3AF]">
                    <CreditCard size={12} /> <span>{supplier.payment_terms}</span>
                  </div>
                )}
              </div>
            </div>
          </Card>

          <Card>
            <div className="flex items-center gap-2 mb-3">
              <Users size={14} className="text-[#FF6600]" />
              <h3 className="text-xs font-semibold text-[#6B7280] uppercase">Contactos ({contacts.length})</h3>
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

        {/* CENTRO */}
        <div className="space-y-4 order-1 lg:order-2 min-w-0">
          <Tabs tabs={tabs}>
            {(active) => (
              <div>
                {active === 'ocs' && (
                  <DocList docs={pos} onClick={(id) => router.push(`/documentos/${id}`)} />
                )}
                {active === 'facturas' && (
                  <DocList docs={invoices} onClick={(id) => router.push(`/documentos/${id}`)} />
                )}
                {active === 'pagos' && (
                  <PaymentList payments={payments} />
                )}
                {active === 'anticipos' && (
                  <AdvanceList advances={advances} />
                )}
              </div>
            )}
          </Tabs>
        </div>

        {/* RIGHT */}
        <div className="space-y-4 order-3">
          <Card>
            <div className="flex items-center gap-2 mb-3">
              <DollarSign size={14} className="text-[#FF6600]" />
              <h3 className="text-xs font-semibold text-[#6B7280] uppercase">Resumen</h3>
            </div>
            <div className="space-y-2 text-xs">
              <Row label="Total OC" value={formatCurrency(stats.totalOC, 'EUR')} />
              <Row label="OC abiertas" value={String(stats.openOC)} />
              <Row label="Total facturado" value={formatCurrency(stats.totalInv, 'EUR')} />
              <Row label="Pagado" value={formatCurrency(stats.paid, 'EUR')} tone="success" />
              <Row label="Anticipos" value={formatCurrency(stats.totalAdv, 'EUR')} />
              <div className="border-t border-[#1E2330] pt-2">
                <Row
                  label="Saldo a pagar"
                  value={formatCurrency(Math.max(stats.balance, 0), 'EUR')}
                  tone={stats.balance > 0 ? 'danger' : 'success'}
                />
              </div>
            </div>
          </Card>
        </div>
      </div>
    </div>
  )
}

function Row({ label, value, tone = 'default' }: {
  label: string; value: string; tone?: 'default' | 'success' | 'danger' | 'warning'
}) {
  const colors = {
    default: 'text-[#F0F2F5]',
    success: 'text-emerald-400',
    danger: 'text-red-400',
    warning: 'text-amber-400',
  } as const
  return (
    <div className="flex items-center justify-between gap-2">
      <span className="text-[11px] text-[#6B7280]">{label}</span>
      <span className={`text-xs font-semibold ${colors[tone]}`}>{value}</span>
    </div>
  )
}

function DocList({ docs, onClick }: { docs: DocRow[]; onClick: (id: string) => void }) {
  if (docs.length === 0) {
    return (
      <div className="p-8 text-center text-xs text-[#6B7280]">
        <FileText size={32} className="mx-auto mb-2 text-[#3A4252]" />
        Sin documentos.
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

function PaymentList({ payments }: { payments: PaymentRow[] }) {
  if (payments.length === 0) {
    return <div className="p-8 text-center text-xs text-[#6B7280]">Sin pagos.</div>
  }
  return (
    <div className="space-y-1">
      {payments.map(p => (
        <div key={p.id} className="flex items-center justify-between gap-3 p-3 rounded-lg bg-[#0F1218] border border-[#1E2330]">
          <div>
            <div className="flex items-center gap-2">
              <Hash size={12} className="text-[#6B7280]" />
              <span className="text-xs font-mono text-[#F0F2F5]">{p.id.slice(0, 8)}</span>
              {p.method && <Badge variant="default">{p.method}</Badge>}
            </div>
            <p className="text-[10px] text-[#6B7280] mt-1">{formatDate(p.paid_at || p.created_at)}</p>
          </div>
          <span className="text-sm font-semibold text-red-400">
            -{formatCurrency(p.amount, (p.currency || 'EUR') as 'EUR' | 'USD' | 'ARS')}
          </span>
        </div>
      ))}
    </div>
  )
}

function AdvanceList({ advances }: { advances: AdvanceRow[] }) {
  if (advances.length === 0) {
    return <div className="p-8 text-center text-xs text-[#6B7280]">Sin anticipos.</div>
  }
  return (
    <div className="space-y-1">
      {advances.map(a => (
        <div key={a.id} className="flex items-center justify-between gap-3 p-3 rounded-lg bg-[#0F1218] border border-[#1E2330]">
          <div>
            <div className="flex items-center gap-2">
              <Truck size={12} className="text-[#6B7280]" />
              <Badge variant={statusTone(a.status)}>{a.status}</Badge>
            </div>
            <p className="text-[10px] text-[#6B7280] mt-1">
              Esperado: {a.expected_goods_date ? formatDate(a.expected_goods_date) : '—'}
            </p>
          </div>
          <span className="text-sm font-semibold text-amber-400">
            {formatCurrency(a.amount, (a.currency || 'EUR') as 'EUR' | 'USD' | 'ARS')}
          </span>
        </div>
      ))}
    </div>
  )
}
