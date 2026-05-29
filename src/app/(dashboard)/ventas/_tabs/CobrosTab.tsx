'use client'

import { useState, useEffect, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useCompanyFilter } from '@/hooks/use-company-filter'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Select } from '@/components/ui/select'
import { Modal } from '@/components/ui/modal'
import { useToast } from '@/components/ui/toast'
import { DataTable, type DataTableColumn } from '@/components/ui/data-table'
import { KPICard } from '@/components/ui/kpi-card'
import { formatCurrency } from '@/lib/utils'
import { paymentToRow } from '@/lib/document-helpers'
import { Receipt, Plus, CreditCard, Save } from 'lucide-react'

const COBRO_COLS: DataTableColumn[] = [
  { key: 'referencia', label: 'Referencia', sortable: true, searchable: true, width: '140px' },
  { key: 'cliente', label: 'Cliente', searchable: true },
  { key: 'concepto', label: 'Concepto / Forma pago', searchable: true },
  { key: 'estado', label: 'Estado', sortable: true, type: 'status', width: '120px' },
  { key: 'fecha', label: 'Fecha', sortable: true, type: 'date', width: '110px' },
  { key: 'importe', label: 'Importe', sortable: true, type: 'currency', width: '120px' },
]

export function CobrosTab() {
  const { filterByCompany, companyKey, companyIds } = useCompanyFilter()
  const supabase = createClient()
  const { addToast } = useToast()
  const [rows, setRows] = useState<Record<string, unknown>[]>([])
  const [loading, setLoading] = useState(true)
  const [showRegister, setShowRegister] = useState(false)
  const [invoices, setInvoices] = useState<Record<string, unknown>[]>([])
  const [newPayment, setNewPayment] = useState({ invoice_id: '', amount: 0, payment_method: 'transferencia', bank_reference: '', payment_date: new Date().toISOString().split('T')[0] })
  const [saving, setSaving] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    const sb = createClient()
    if (companyIds.length === 0) {
      setRows([])
      setLoading(false)
      return
    }
    const { data: invIds } = await sb
      .from('tt_documents')
      .select('id')
      .in('company_id', companyIds)
      .in('doc_type', ['factura', 'factura_abono'])
    const validInvIds = (invIds || []).map((r) => r.id as string)
    if (validInvIds.length === 0) {
      setRows([])
      setLoading(false)
      return
    }
    const { data } = await sb
      .from('tt_payments')
      .select('*, tt_documents!invoice_id(display_ref, system_code)')
      .in('invoice_id', validInvIds)
      .order('created_at', { ascending: false })
    setRows((data || []).map(paymentToRow))
    setLoading(false)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [companyKey])

  useEffect(() => { load() }, [load])

  const loadInvoices = async () => {
    let q = supabase.from('tt_documents')
      .select('id, display_ref, system_code, total, status, client:tt_clients(name, legal_name)')
      .in('doc_type', ['factura', 'factura_abono'])
      .in('status', ['pending', 'partial', 'open', 'sent', 'draft'])
    q = filterByCompany(q)
    const { data } = await q
      .order('created_at', { ascending: false })
      .limit(50)
    setInvoices(data || [])
  }

  const handleRegisterPayment = async () => {
    if (!newPayment.amount || newPayment.amount <= 0) { addToast({ type: 'warning', title: 'El importe debe ser mayor a 0' }); return }
    setSaving(true)
    const sb = createClient()
    const { error } = await sb.from('tt_payments').insert({
      invoice_id: newPayment.invoice_id || null,
      amount: newPayment.amount,
      payment_method: newPayment.payment_method,
      bank_reference: newPayment.bank_reference || null,
      payment_date: newPayment.payment_date,
    })
    if (error) {
      addToast({ type: 'error', title: 'Error registrando cobro', message: error.message })
      setSaving(false)
      return
    }
    if (newPayment.invoice_id) {
      try {
        const { data: allPayments } = await sb
          .from('tt_payments')
          .select('amount')
          .eq('invoice_id', newPayment.invoice_id)
        const totalPaid = (allPayments || []).reduce((s, p) => s + Number(p.amount || 0), 0)
        const paymentCount = (allPayments || []).length

        const { data: doc } = await sb
          .from('tt_documents')
          .select('id, total')
          .eq('id', newPayment.invoice_id)
          .maybeSingle()

        if (doc) {
          const total = Number(doc.total || 0)
          const status = totalPaid >= total - 0.01 ? 'paid'
                       : totalPaid > 0.01 ? 'partial'
                       : 'pending'
          await sb.from('tt_documents').update({
            paid_amount: totalPaid,
            payment_count: paymentCount,
            status,
          }).eq('id', newPayment.invoice_id)
        }
      } catch (err) {
        console.error('No se pudo actualizar paid_amount de la factura', err)
        addToast({ type: 'warning', title: 'Cobro guardado, pero el saldo de la factura no se actualizó automáticamente — refrescá la página' })
      }
    }
    addToast({ type: 'success', title: 'Cobro registrado y factura actualizada' })
    setShowRegister(false)
    setNewPayment({ invoice_id: '', amount: 0, payment_method: 'transferencia', bank_reference: '', payment_date: new Date().toISOString().split('T')[0] })
    load()
    setSaving(false)
  }

  const totalCobrado = rows.reduce((s, r) => s + ((r.importe as number) || 0), 0)

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
        <KPICard label="Total cobrado" value={formatCurrency(totalCobrado)} icon={<CreditCard size={22} />} color="#10B981" />
        <KPICard label="Cobros registrados" value={rows.length} icon={<Receipt size={22} />} />
        <div className="flex items-end justify-end">
          <Button variant="primary" onClick={() => { setShowRegister(true); loadInvoices() }}>
            <Plus size={16} /> Registrar Cobro
          </Button>
        </div>
      </div>
      <DataTable
        data={rows}
        columns={COBRO_COLS}
        loading={loading}
        totalLabel="cobros"
        showTotals
        exportFilename="cobros_torquetools"
        pageSize={25}
      />
      <Modal isOpen={showRegister} onClose={() => setShowRegister(false)} title="Registrar Cobro" size="md">
        <div className="space-y-4">
          <Select label="Factura relacionada" value={newPayment.invoice_id} onChange={e => setNewPayment({ ...newPayment, invoice_id: e.target.value })}
            options={invoices.map(inv => ({ value: inv.id as string, label: `${(inv.display_ref as string) || (inv.system_code as string) || 'S/N'} — ${formatCurrency((inv.total as number) || 0)} — ${((inv.client as Record<string, unknown>)?.legal_name as string) || 'Sin cliente'}` }))}
            placeholder="Sin factura vinculada" />
          <div className="grid grid-cols-2 gap-4">
            <Input label="Importe *" type="number" min={0} step={0.01} value={newPayment.amount || ''} onChange={e => setNewPayment({ ...newPayment, amount: Number(e.target.value) })} />
            <Input label="Fecha" type="date" value={newPayment.payment_date} onChange={e => setNewPayment({ ...newPayment, payment_date: e.target.value })} />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <Select label="Metodo de pago" value={newPayment.payment_method} onChange={e => setNewPayment({ ...newPayment, payment_method: e.target.value })}
              options={[{ value: 'transferencia', label: 'Transferencia bancaria' }, { value: 'cheque', label: 'Cheque' }, { value: 'efectivo', label: 'Efectivo' }, { value: 'tarjeta', label: 'Tarjeta' }, { value: 'paypal', label: 'PayPal' }, { value: 'otro', label: 'Otro' }]} />
            <Input label="Referencia bancaria" value={newPayment.bank_reference} onChange={e => setNewPayment({ ...newPayment, bank_reference: e.target.value })} placeholder="Nro transferencia, cheque..." />
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="secondary" onClick={() => setShowRegister(false)}>Cancelar</Button>
            <Button variant="primary" onClick={handleRegisterPayment} loading={saving}><Save size={14} /> Registrar</Button>
          </div>
        </div>
      </Modal>
    </div>
  )
}
