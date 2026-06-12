'use client'

import { useState, useEffect, useCallback, useMemo, useRef } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { useCompanyFilter } from '@/hooks/use-company-filter'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Select } from '@/components/ui/select'
import { Badge } from '@/components/ui/badge'
import { Modal } from '@/components/ui/modal'
import { useToast } from '@/components/ui/toast'
import { DataTable, type DataTableColumn } from '@/components/ui/data-table'
import { documentToTableRow, purchaseInvoiceToRow } from '@/lib/document-helpers'
import { generateDocNumber } from '@/lib/doc-numbering'
import { formatCurrency, formatDate } from '@/lib/utils'
import type { Supplier, PurchaseInvoice, PurchasePayment } from '@/types'
import { CreditCard, FileCheck, ArrowLeft, Loader2, Plus, X, Save } from 'lucide-react'

type Row = Record<string, unknown>

const INVOICE_STATUS: Record<string, { label: string; variant: 'default' | 'success' | 'warning' | 'danger' | 'info' | 'orange' }> = {
  pending: { label: 'Pendiente', variant: 'warning' },
  due_soon: { label: 'Vence pronto', variant: 'orange' },
  overdue: { label: 'Vencida', variant: 'danger' },
  paid: { label: 'Pagada', variant: 'success' },
  partial: { label: 'Pago parcial', variant: 'info' },
}

function getInvoiceDisplayStatus(inv: PurchaseInvoice): string {
  if (inv.status === 'paid') return 'paid'
  if (inv.status === 'partial') return 'partial'
  if (!inv.due_date) return 'pending'
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const due = new Date(inv.due_date)
  due.setHours(0, 0, 0, 0)
  const diffDays = Math.ceil((due.getTime() - today.getTime()) / (1000 * 60 * 60 * 24))
  if (diffDays < 0) return 'overdue'
  if (diffDays <= 7) return 'due_soon'
  return 'pending'
}

function getDueDateColor(dueDate: string | null): string {
  if (!dueDate) return '#6B7280'
  const due = new Date(dueDate)
  const today = new Date()
  const days = Math.ceil((due.getTime() - today.getTime()) / (1000 * 60 * 60 * 24))
  if (days < 0) return '#EF4444'
  if (days <= 7) return '#F59E0B'
  return '#10B981'
}

function getSupplierName(po: Row): string {
  const supplier = po.supplier as Row | undefined
  if (supplier) return (supplier.legal_name as string) || (supplier.name as string) || 'Sin proveedor'
  return (po.supplier_name as string) || 'Sin proveedor'
}

const EU_INTRACOM_CODES = new Set([
  'AT','BE','BG','CY','CZ','DE','DK','EE','FI','FR','GR','HR','HU','IE',
  'IT','LT','LU','LV','MT','NL','PL','PT','RO','SE','SI','SK',
])

function isEUIntracomCountry(country: string | null | undefined): boolean {
  if (!country) return false
  return EU_INTRACOM_CODES.has(country.toUpperCase())
}

async function generateInvoiceNumber(companyId?: string | null): Promise<string> {
  return generateDocNumber('FC', companyId ?? null)
}

async function checkPaymentAlerts() {
  const supabase = createClient()
  const today = new Date().toISOString().split('T')[0]
  const in7days = new Date(Date.now() + 7 * 86400000).toISOString().split('T')[0]
  const { data: dueSoon } = await supabase
    .from('tt_purchase_invoices')
    .select('id, number, total, due_date, supplier_id')
    .neq('status', 'paid')
    .gte('due_date', today)
    .lte('due_date', in7days)
  for (const inv of dueSoon || []) {
    const { data: existing } = await supabase
      .from('tt_alerts').select('id')
      .eq('type', 'payment_due_soon').eq('document_id', inv.id)
      .eq('status', 'active').limit(1)
    if (!existing?.length) {
      await supabase.from('tt_alerts').insert({
        type: 'payment_due_soon', severity: 'warning',
        title: `Factura ${inv.number} vence el ${formatDate(inv.due_date)}`,
        description: `Monto: ${formatCurrency(inv.total)}. Programar pago.`,
        document_id: inv.id, status: 'active',
      })
    }
  }
}

export function FacturasCompraTab() {
  const supabase = createClient()
  const router = useRouter()
  const searchParams = useSearchParams()
  const { addToast } = useToast()
  const { filterByCompany, companyKey, companyIds, defaultCompanyId } = useCompanyFilter()
  const [invoices, setInvoices] = useState<PurchaseInvoice[]>([])
  const [suppliers, setSuppliers] = useState<Supplier[]>([])
  const [purchaseOrders, setPurchaseOrders] = useState<Row[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState('')
  const [showCreate, setShowCreate] = useState(false)
  const [showPayment, setShowPayment] = useState(false)
  const [selectedInvoice, setSelectedInvoice] = useState<PurchaseInvoice | null>(null)
  const [saving, setSaving] = useState(false)
  const [newInv, setNewInv] = useState({ supplier_id: '', purchase_order_id: '', supplier_invoice_number: '', supplier_invoice_date: '', subtotal: 0, tax_rate: 21, due_date: '', notes: '' })
  const [newPay, setNewPay] = useState({ amount: 0, payment_date: new Date().toISOString().split('T')[0], payment_method: 'transferencia', bank_reference: '', bank_account: '', notes: '' })
  const [invoicePayments, setInvoicePayments] = useState<PurchasePayment[]>([])
  const [supplierIntracom, setSupplierIntracom] = useState<{ isEU: boolean; country: string | null }>({ isEU: false, country: null })

  // Cuando cambia el proveedor seleccionado, chequear si es UE-intracom.
  useEffect(() => {
    if (!newInv.supplier_id) {
      setSupplierIntracom({ isEU: false, country: null })
      return
    }
    const sb = createClient()
    sb.from('tt_suppliers')
      .select('country')
      .eq('id', newInv.supplier_id)
      .single()
      .then(({ data }) => {
        const country = (data?.country as string) || null
        setSupplierIntracom({ isEU: isEUIntracomCountry(country), country })
      })
  }, [newInv.supplier_id])

  // Historical purchase invoices from tt_documents
  const [histDocs, setHistDocs] = useState<Row[]>([])

  const load = useCallback(async () => {
    setLoading(true)
    const sb = createClient()

    // tt_purchase_invoices NO tiene company_id propio → filtramos por las
    // facturas cuyo supplier pertenezca a las companies activas.
    if (companyIds.length === 0) {
      setInvoices([])
      setHistDocs([])
      setLoading(false)
      return
    }
    const { data: supIds } = await sb.from('tt_suppliers').select('id').in('company_id', companyIds)
    const validSupplierIds = (supIds || []).map((r) => r.id as string)
    if (validSupplierIds.length === 0) {
      setInvoices([])
    } else {
      const { data } = await sb
        .from('tt_purchase_invoices')
        .select('*, supplier:tt_suppliers(id, name, legal_name)')
        .in('supplier_id', validSupplierIds)
        .order('created_at', { ascending: false })
      setInvoices((data || []) as PurchaseInvoice[])
    }

    // Also load historical from tt_documents (tiene company_id propio)
    let qDoc = sb.from('tt_documents').select('*, client:tt_clients(id, name, legal_name)')
      .eq('doc_type', 'factura_compra')
      .order('created_at', { ascending: false })
      .range(0, 99)
    qDoc = filterByCompany(qDoc)
    const { data: docData } = await qDoc
    setHistDocs(docData || [])

    setLoading(false)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [companyKey])

  useEffect(() => { load(); checkPaymentAlerts() }, [load])

  // Fix 2/5 — Leer query param fromRecepcion para precargar nueva factura compra desde una OC recepcionada
  const fromRecepcionHandledRef = useRef(false)
  useEffect(() => {
    if (fromRecepcionHandledRef.current) return
    const poId = searchParams.get('fromRecepcion')
    if (!poId) return
    fromRecepcionHandledRef.current = true
    ;(async () => {
      // Cargar OC + items + supplier
      const { data: po } = await supabase
        .from('tt_purchase_orders')
        .select('id, supplier_id, total, status, supplier:tt_suppliers(id, name, legal_name)')
        .eq('id', poId)
        .single()
      if (!po) return
      const { data: items } = await supabase
        .from('tt_po_items')
        .select('qty_received, unit_cost')
        .eq('purchase_order_id', poId)
      const subtotal = (items || []).reduce((s, it: Row) => s + ((it.qty_received as number) || 0) * ((it.unit_cost as number) || 0), 0)
      // tax_rate: 0 si intracom UE (chequear country del supplier)
      let taxRate = 21
      if (po.supplier_id) {
        const { data: sup } = await supabase.from('tt_suppliers').select('country').eq('id', po.supplier_id).single()
        if (isEUIntracomCountry((sup?.country as string) || null)) taxRate = 0
      }
      await loadSuppliers()
      await loadPOs()
      setNewInv((prev) => ({
        ...prev,
        supplier_id: (po.supplier_id as string) || '',
        purchase_order_id: po.id as string,
        subtotal: Number(subtotal.toFixed(2)),
        tax_rate: taxRate,
      }))
      setShowCreate(true)
      router.replace('/compras?tab=facturas')
    })()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams])

  const loadSuppliers = async () => {
    const { data } = await supabase.from('tt_suppliers').select('id, name, legal_name').eq('active', true).order('name')
    setSuppliers((data || []) as Supplier[])
  }

  const loadPOs = async () => {
    // JOIN a tt_suppliers para que el dropdown "OC vinculada" muestre el
    // nombre correcto en lugar de "Sin proveedor".
    const { data } = await supabase.from('tt_purchase_orders')
      .select('id, supplier_name, total, status, supplier:tt_suppliers(id, name, legal_name)')
      .order('created_at', { ascending: false })
      .limit(50)
    setPurchaseOrders((data || []).map((po) => ({
      ...po,
      supplier_name: getSupplierName(po as Row),
    })))
  }

  const filtered = useMemo(() => {
    let result = invoices
    if (statusFilter) {
      result = result.filter(inv => {
        const ds = getInvoiceDisplayStatus(inv)
        return ds === statusFilter
      })
    }
    if (search.trim()) {
      const tokens = search.trim().toLowerCase().split(/\s+/)
      result = result.filter(inv => {
        const sName = (inv.supplier as Supplier | undefined)?.name || ''
        const searchable = [inv.number, sName, inv.supplier_invoice_number, inv.notes].filter(Boolean).join(' ').toLowerCase()
        return tokens.every(t => searchable.includes(t))
      })
    }
    return result
  }, [invoices, search, statusFilter])

  const totalPending = filtered.filter(i => i.status !== 'paid').reduce((s, i) => s + i.total, 0)
  const dueThisWeek = filtered.filter(i => {
    if (i.status === 'paid' || !i.due_date) return false
    const due = new Date(i.due_date)
    const now = new Date()
    const in7 = new Date(Date.now() + 7 * 86400000)
    return due >= now && due <= in7
  }).length
  const overdueAmount = filtered.filter(i => {
    if (i.status === 'paid' || !i.due_date) return false
    return new Date(i.due_date) < new Date()
  }).reduce((s, i) => s + i.total, 0)

  async function handleCreateInvoice() {
    if (!newInv.supplier_id) { addToast({ type: 'error', title: 'Selecciona un proveedor' }); return }
    setSaving(true)
    const taxAmount = newInv.subtotal * newInv.tax_rate / 100
    const total = newInv.subtotal + taxAmount
    const { error } = await supabase.from('tt_purchase_invoices').insert({
      number: await generateInvoiceNumber(defaultCompanyId),
      supplier_id: newInv.supplier_id,
      purchase_order_id: newInv.purchase_order_id || null,
      supplier_invoice_number: newInv.supplier_invoice_number || null,
      supplier_invoice_date: newInv.supplier_invoice_date || null,
      subtotal: newInv.subtotal,
      tax_rate: newInv.tax_rate,
      tax_amount: taxAmount,
      total,
      due_date: newInv.due_date || null,
      notes: newInv.notes || null,
      status: 'pending',
    })
    if (!error) {
      addToast({ type: 'success', title: 'Factura registrada' })
      setShowCreate(false)
      setNewInv({ supplier_id: '', purchase_order_id: '', supplier_invoice_number: '', supplier_invoice_date: '', subtotal: 0, tax_rate: 21, due_date: '', notes: '' })
      load()
    } else { addToast({ type: 'error', title: 'Error', message: error.message }) }
    setSaving(false)
  }

  async function openInvoiceDetail(inv: PurchaseInvoice) {
    setSelectedInvoice(inv)
    const { data } = await supabase
      .from('tt_purchase_payments')
      .select('*')
      .eq('purchase_invoice_id', inv.id)
      .order('payment_date', { ascending: false })
    setInvoicePayments((data || []) as PurchasePayment[])
  }

  async function handleRegisterPayment() {
    if (!selectedInvoice || newPay.amount <= 0) { addToast({ type: 'error', title: 'Monto invalido' }); return }
    setSaving(true)
    const { error } = await supabase.from('tt_purchase_payments').insert({
      purchase_invoice_id: selectedInvoice.id,
      supplier_id: selectedInvoice.supplier_id,
      purchase_order_id: selectedInvoice.purchase_order_id,
      amount: newPay.amount,
      payment_date: newPay.payment_date,
      payment_method: newPay.payment_method,
      bank_reference: newPay.bank_reference || null,
      bank_account: newPay.bank_account || null,
      notes: newPay.notes || null,
      is_advance: false,
      status: 'completed',
    })
    if (error) { addToast({ type: 'error', title: 'Error', message: error.message }); setSaving(false); return }

    // Update invoice status + paid_amount + payment_count (tolerancia ±0.01 redondeo)
    const totalPaid = invoicePayments.reduce((s, p) => s + p.amount, 0) + newPay.amount
    const paymentCount = invoicePayments.length + 1
    const newStatus = totalPaid >= (selectedInvoice.total - 0.01) ? 'paid' : 'partial'
    await supabase.from('tt_purchase_invoices').update({
      status: newStatus,
      paid_amount: totalPaid,
      payment_count: paymentCount,
      paid_at: newStatus === 'paid' ? new Date().toISOString() : null,
    }).eq('id', selectedInvoice.id)

    // Resolve related alerts
    if (newStatus === 'paid') {
      await supabase.from('tt_alerts')
        .update({ status: 'resolved' })
        .eq('document_id', selectedInvoice.id)
        .in('type', ['payment_due_soon', 'payment_overdue'])
    }

    addToast({ type: 'success', title: 'Pago registrado' })
    setShowPayment(false)
    setNewPay({ amount: 0, payment_date: new Date().toISOString().split('T')[0], payment_method: 'transferencia', bank_reference: '', bank_account: '', notes: '' })
    load()
    openInvoiceDetail({ ...selectedInvoice, status: newStatus })
    setSaving(false)
  }

  // Build combined DataTable rows from local invoices + historical docs
  // (declarado antes del early return para no violar rules-of-hooks)
  const tableRows = useMemo(() => {
    const localRows = filtered.map((inv) => {
      const ds = getInvoiceDisplayStatus(inv)
      const sName = (inv.supplier as Supplier | undefined)?.name || 'Proveedor'
      return {
        id: inv.id,
        referencia: inv.number || '-',
        proveedor: sName,
        ref_proveedor: inv.supplier_invoice_number || '',
        estado: INVOICE_STATUS[ds]?.label || ds,
        fecha: inv.created_at,
        importe: inv.total || 0,
        moneda: inv.currency || 'EUR',
        fecha_vencimiento: inv.due_date,
        _raw: inv,
        _source: 'local',
      }
    })
    const docRows = histDocs.map((d) => {
      const r = documentToTableRow(d)
      r.proveedor = r.cliente
      return r
    })
    return [...localRows, ...docRows]
  }, [filtered, histDocs])

  // Invoice detail view
  if (selectedInvoice) {
    const ds = getInvoiceDisplayStatus(selectedInvoice)
    const totalPaid = invoicePayments.reduce((s, p) => s + p.amount, 0)
    const remaining = selectedInvoice.total - totalPaid
    const sName = (selectedInvoice.supplier as Supplier | undefined)?.name || 'Proveedor'

    return (
      <div className="space-y-4 animate-in fade-in">
        <button onClick={() => setSelectedInvoice(null)} className="flex items-center gap-2 text-[#9CA3AF] hover:text-[#F0F2F5] transition-colors text-sm">
          <ArrowLeft size={16} /> Volver a facturas
        </button>

        <div className="flex items-start justify-between">
          <div>
            <h2 className="text-xl font-bold text-[#F0F2F5]">{selectedInvoice.number}</h2>
            <p className="text-sm text-[#6B7280]">{sName} {selectedInvoice.supplier_invoice_number ? `| Factura proveedor: ${selectedInvoice.supplier_invoice_number}` : ''}</p>
          </div>
          <Badge variant={INVOICE_STATUS[ds]?.variant || 'default'} size="md">{INVOICE_STATUS[ds]?.label || ds}</Badge>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <div className="p-4 rounded-xl bg-[#141820] border border-[#1E2330]">
            <p className="text-xs text-[#6B7280]">Subtotal</p>
            <p className="text-lg font-bold text-[#F0F2F5]">{formatCurrency(selectedInvoice.subtotal)}</p>
          </div>
          <div className="p-4 rounded-xl bg-[#141820] border border-[#1E2330]">
            <p className="text-xs text-[#6B7280]">IVA ({selectedInvoice.tax_rate}%)</p>
            <p className="text-lg font-bold text-[#F0F2F5]">{formatCurrency(selectedInvoice.tax_amount)}</p>
          </div>
          <div className="p-4 rounded-xl bg-[#141820] border border-[#1E2330]">
            <p className="text-xs text-[#6B7280]">Total</p>
            <p className="text-lg font-bold text-[#FF6600]">{formatCurrency(selectedInvoice.total)}</p>
          </div>
          <div className="p-4 rounded-xl bg-[#141820] border border-[#1E2330]">
            <p className="text-xs text-[#6B7280]">Pendiente</p>
            <p className={`text-lg font-bold ${remaining > 0 ? 'text-amber-400' : 'text-emerald-400'}`}>{formatCurrency(remaining)}</p>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <Card>
            <h3 className="text-sm font-semibold text-[#F0F2F5] mb-3">Datos de la factura</h3>
            <div className="space-y-2 text-xs">
              <div className="flex justify-between"><span className="text-[#6B7280]">Fecha factura proveedor</span><span className="text-[#F0F2F5]">{selectedInvoice.supplier_invoice_date ? formatDate(selectedInvoice.supplier_invoice_date) : '-'}</span></div>
              <div className="flex justify-between"><span className="text-[#6B7280]">Fecha vencimiento</span><span className="text-[#F0F2F5]" style={{ color: getDueDateColor(selectedInvoice.due_date) }}>{selectedInvoice.due_date ? formatDate(selectedInvoice.due_date) : '-'}</span></div>
              <div className="flex justify-between"><span className="text-[#6B7280]">Moneda</span><span className="text-[#F0F2F5]">{selectedInvoice.currency}</span></div>
              {selectedInvoice.notes && <div className="pt-2 border-t border-[#1E2330]"><span className="text-[#6B7280]">Notas: </span><span className="text-[#F0F2F5]">{selectedInvoice.notes}</span></div>}
            </div>
          </Card>

          <Card>
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-sm font-semibold text-[#F0F2F5]">Pagos realizados</h3>
              {remaining > 0 && <Button variant="primary" size="sm" onClick={() => { setNewPay({ ...newPay, amount: remaining }); setShowPayment(true) }}><CreditCard size={14} /> Registrar pago</Button>}
            </div>
            {invoicePayments.length === 0 ? (
              <p className="text-xs text-[#4B5563] py-4 text-center">Sin pagos registrados</p>
            ) : (
              <div className="space-y-2">
                {invoicePayments.map(pay => (
                  <div key={pay.id} className="flex items-center justify-between p-2 rounded-lg bg-[#0F1218]">
                    <div>
                      <p className="text-sm font-semibold text-emerald-400">{formatCurrency(pay.amount)}</p>
                      <p className="text-xs text-[#6B7280]">{formatDate(pay.payment_date)} | {pay.payment_method}</p>
                      {pay.bank_reference && <p className="text-xs text-[#4B5563]">Ref: {pay.bank_reference}</p>}
                    </div>
                    <Badge variant="success" size="sm">Pagado</Badge>
                  </div>
                ))}
              </div>
            )}
          </Card>
        </div>

        {/* Payment modal */}
        <Modal isOpen={showPayment} onClose={() => setShowPayment(false)} title="Registrar pago" size="md">
          <div className="space-y-4">
            <Input label="Monto *" type="number" value={newPay.amount} onChange={(e) => setNewPay({ ...newPay, amount: Number(e.target.value) })} />
            <Input label="Fecha de pago *" type="date" value={newPay.payment_date} onChange={(e) => setNewPay({ ...newPay, payment_date: e.target.value })} />
            <Select label="Metodo de pago" value={newPay.payment_method} onChange={(e) => setNewPay({ ...newPay, payment_method: e.target.value })} options={[
              { value: 'transferencia', label: 'Transferencia bancaria' }, { value: 'cheque', label: 'Cheque' },
              { value: 'efectivo', label: 'Efectivo' }, { value: 'tarjeta', label: 'Tarjeta' },
              { value: 'paypal', label: 'PayPal' }, { value: 'otro', label: 'Otro' },
            ]} />
            <Input label="Referencia bancaria" value={newPay.bank_reference} onChange={(e) => setNewPay({ ...newPay, bank_reference: e.target.value })} placeholder="Nro transferencia, cheque..." />
            <Input label="Cuenta bancaria" value={newPay.bank_account} onChange={(e) => setNewPay({ ...newPay, bank_account: e.target.value })} />
            <Input label="Notas" value={newPay.notes} onChange={(e) => setNewPay({ ...newPay, notes: e.target.value })} />
            <div className="flex justify-end gap-3 pt-4 border-t border-[#1E2330]">
              <Button variant="secondary" onClick={() => setShowPayment(false)}>Cancelar</Button>
              <Button onClick={handleRegisterPayment} loading={saving}><CreditCard size={14} /> Registrar pago</Button>
            </div>
          </div>
        </Modal>
      </div>
    )
  }

  const FC_COLS: DataTableColumn[] = [
    { key: 'referencia', label: 'Referencia', sortable: true, searchable: true, width: '140px' },
    { key: 'proveedor', label: 'Proveedor', sortable: true, searchable: true },
    { key: 'ref_proveedor', label: 'Ref. proveedor', searchable: true, defaultVisible: true },
    { key: 'estado', label: 'Estado', sortable: true, type: 'status', width: '120px' },
    { key: 'fecha', label: 'Fecha', sortable: true, type: 'date', width: '110px' },
    { key: 'importe', label: 'Importe', sortable: true, type: 'currency', width: '120px' },
    { key: 'fecha_vencimiento', label: 'Vencimiento', sortable: true, type: 'date', width: '110px' },
  ]

  const handleInvRowClick = (row: Record<string, unknown>) => {
    if (row._source === 'local') {
      openInvoiceDetail(row._raw as PurchaseInvoice)
    }
  }

  return (
    <div className="space-y-4">
      <DataTable
        data={tableRows}
        columns={FC_COLS}
        loading={loading}
        totalLabel="facturas de compra"
        showTotals
        onRowClick={handleInvRowClick}
        onNewClick={() => { setShowCreate(true); loadSuppliers(); loadPOs() }}
        newLabel="Registrar factura"
        exportFilename="facturas_compra"
        pageSize={25}
      />

      {/* Create invoice modal */}
      <Modal isOpen={showCreate} onClose={() => setShowCreate(false)} title="Registrar factura de compra" size="xl">
        <div className="space-y-4">
          {supplierIntracom.isEU && (
            <div className="bg-yellow-500/10 border border-yellow-500/30 text-yellow-200 p-3 rounded text-sm">
              ⚠️ Proveedor UE ({supplierIntracom.country}) distinto de ES. Posible operación intracomunitaria — IVA debería ser 0% con reverse charge. Revisá antes de guardar.
            </div>
          )}
          <div className="grid grid-cols-2 gap-4">
            <Select label="Proveedor *" value={newInv.supplier_id} onChange={(e) => setNewInv({ ...newInv, supplier_id: e.target.value })} options={[{ value: '', label: 'Seleccionar...' }, ...suppliers.map(s => ({ value: s.id, label: s.legal_name || s.name }))]} />
            <Select label="OC vinculada" value={newInv.purchase_order_id} onChange={(e) => setNewInv({ ...newInv, purchase_order_id: e.target.value })} options={[{ value: '', label: 'Ninguna' }, ...purchaseOrders.map(po => ({ value: po.id as string, label: `${(po.supplier_name as string)} - ${formatCurrency((po.total as number) || 0)}` }))]} />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <Input label="N de factura del proveedor" value={newInv.supplier_invoice_number} onChange={(e) => setNewInv({ ...newInv, supplier_invoice_number: e.target.value })} placeholder="Ej: FA-2024-001" />
            <Input label="Fecha factura proveedor" type="date" value={newInv.supplier_invoice_date} onChange={(e) => setNewInv({ ...newInv, supplier_invoice_date: e.target.value })} />
          </div>
          <div className="grid grid-cols-3 gap-4">
            <Input label="Subtotal (sin IVA) *" type="number" value={newInv.subtotal} onChange={(e) => setNewInv({ ...newInv, subtotal: Number(e.target.value) })} />
            <Input label="IVA %" type="number" value={newInv.tax_rate} onChange={(e) => setNewInv({ ...newInv, tax_rate: Number(e.target.value) })} />
            <div className="p-3 rounded-lg bg-[#0F1218] border border-[#1E2330]">
              <p className="text-xs text-[#6B7280] mb-1">Total</p>
              <p className="text-lg font-bold text-[#FF6600]">{formatCurrency(newInv.subtotal + (newInv.subtotal * newInv.tax_rate / 100))}</p>
            </div>
          </div>
          <Input label="Fecha de vencimiento" type="date" value={newInv.due_date} onChange={(e) => setNewInv({ ...newInv, due_date: e.target.value })} />
          <Input label="Notas" value={newInv.notes} onChange={(e) => setNewInv({ ...newInv, notes: e.target.value })} />
          <div className="flex justify-end gap-3 pt-4 border-t border-[#1E2330]">
            <Button variant="secondary" onClick={() => setShowCreate(false)}>Cancelar</Button>
            <Button onClick={handleCreateInvoice} loading={saving}><FileCheck size={14} /> Registrar factura</Button>
          </div>
        </div>
      </Modal>
    </div>
  )
}
