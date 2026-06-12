'use client'

import { useState, useEffect, useCallback, useMemo } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useCompanyFilter } from '@/hooks/use-company-filter'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Select } from '@/components/ui/select'
import { Badge } from '@/components/ui/badge'
import { Modal } from '@/components/ui/modal'
import { KPICard } from '@/components/ui/kpi-card'
import { useToast } from '@/components/ui/toast'
import { formatCurrency, formatDate } from '@/lib/utils'
import type { Supplier, PurchasePayment } from '@/types'
import { Banknote, CircleDollarSign, CreditCard, Receipt, CheckCircle, Loader2 } from 'lucide-react'

function getDueDateColor(dueDate: string | null): string {
  if (!dueDate) return '#6B7280'
  const due = new Date(dueDate)
  const today = new Date()
  const days = Math.ceil((due.getTime() - today.getTime()) / (1000 * 60 * 60 * 24))
  if (days < 0) return '#EF4444' // overdue
  if (days <= 7) return '#F59E0B' // due soon
  return '#10B981' // ok
}

export function PagosTab() {
  const supabase = createClient()
  const { addToast } = useToast()
  const { companyKey, companyIds } = useCompanyFilter()
  const [payments, setPayments] = useState<PurchasePayment[]>([])
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState<'all' | 'normal' | 'advance'>('all')
  const [showAdvance, setShowAdvance] = useState(false)
  const [suppliers, setSuppliers] = useState<Supplier[]>([])
  const [saving, setSaving] = useState(false)
  const [newAdv, setNewAdv] = useState({ supplier_id: '', amount: 0, payment_date: new Date().toISOString().split('T')[0], payment_method: 'transferencia', bank_reference: '', advance_reason: '', expected_goods_date: '', notes: '' })

  const load = useCallback(async () => {
    setLoading(true)
    const sb = createClient()
    if (companyIds.length === 0) {
      setPayments([])
      setLoading(false)
      return
    }
    const { data: supIds } = await sb.from('tt_suppliers').select('id').in('company_id', companyIds)
    const validSupplierIds = (supIds || []).map((r) => r.id as string)
    if (validSupplierIds.length === 0) {
      setPayments([])
      setLoading(false)
      return
    }
    const { data } = await sb
      .from('tt_purchase_payments')
      .select('*, supplier:tt_suppliers(id, name, legal_name)')
      .in('supplier_id', validSupplierIds)
      .order('payment_date', { ascending: false })
    setPayments((data || []) as PurchasePayment[])
    setLoading(false)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [companyKey])

  useEffect(() => { load() }, [load])

  const filtered = useMemo(() => {
    if (filter === 'normal') return payments.filter(p => !p.is_advance)
    if (filter === 'advance') return payments.filter(p => p.is_advance)
    return payments
  }, [payments, filter])

  const totalPaidMonth = useMemo(() => {
    const now = new Date()
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().split('T')[0]
    return payments.filter(p => p.payment_date >= monthStart).reduce((s, p) => s + p.amount, 0)
  }, [payments])

  const advancesPending = payments.filter(p => p.is_advance && !p.goods_received)
  const paymentsThisWeek = useMemo(() => {
    const now = new Date()
    const weekStart = new Date(now)
    weekStart.setDate(now.getDate() - now.getDay())
    const ws = weekStart.toISOString().split('T')[0]
    return payments.filter(p => p.payment_date >= ws).length
  }, [payments])

  async function handleCreateAdvance() {
    if (!newAdv.supplier_id || newAdv.amount <= 0) { addToast({ type: 'error', title: 'Completa los datos obligatorios' }); return }
    setSaving(true)
    const reminderDate = newAdv.expected_goods_date || null
    const { error } = await supabase.from('tt_purchase_payments').insert({
      supplier_id: newAdv.supplier_id,
      amount: newAdv.amount,
      payment_date: newAdv.payment_date,
      payment_method: newAdv.payment_method,
      bank_reference: newAdv.bank_reference || null,
      advance_reason: newAdv.advance_reason || null,
      expected_goods_date: newAdv.expected_goods_date || null,
      reminder_date: reminderDate,
      is_advance: true,
      goods_received: false,
      status: 'completed',
      notes: newAdv.notes || null,
    })
    if (!error) {
      addToast({ type: 'success', title: 'Anticipo registrado' })
      setShowAdvance(false)
      setNewAdv({ supplier_id: '', amount: 0, payment_date: new Date().toISOString().split('T')[0], payment_method: 'transferencia', bank_reference: '', advance_reason: '', expected_goods_date: '', notes: '' })
      load()
    } else { addToast({ type: 'error', title: 'Error', message: error.message }) }
    setSaving(false)
  }

  async function markGoodsReceived(paymentId: string) {
    await supabase.from('tt_purchase_payments').update({
      goods_received: true,
      goods_received_date: new Date().toISOString().split('T')[0],
    }).eq('id', paymentId)
    await supabase.from('tt_alerts').update({ status: 'resolved' }).eq('document_id', paymentId).eq('type', 'advance_goods_pending')
    addToast({ type: 'success', title: 'Mercaderia recibida marcada' })
    load()
  }

  const loadSuppliers = async () => {
    const { data } = await supabase.from('tt_suppliers').select('id, name, legal_name').eq('active', true).order('name')
    setSuppliers((data || []) as Supplier[])
  }

  return (
    <div className="space-y-4">
      <div className="flex justify-end gap-2">
        <Button variant="secondary" onClick={() => { setShowAdvance(true); loadSuppliers() }}><Banknote size={16} /> Registrar anticipo</Button>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <KPICard label="Pagado este mes" value={formatCurrency(totalPaidMonth)} icon={<CircleDollarSign size={22} />} color="#10B981" />
        <KPICard label="Anticipos pendientes" value={advancesPending.length} icon={<Banknote size={22} />} color="#3B82F6" />
        <KPICard label="Pagos esta semana" value={paymentsThisWeek} icon={<CreditCard size={22} />} />
        <KPICard label="Total pagos" value={filtered.length} icon={<Receipt size={22} />} color="#6B7280" />
      </div>

      <div className="flex gap-2">
        {(['all', 'normal', 'advance'] as const).map(f => (
          <button key={f} onClick={() => setFilter(f)} className={`px-4 py-2 rounded-lg text-xs font-medium transition-all ${filter === f ? 'bg-[#FF6600] text-white' : 'bg-[#1E2330] text-[#9CA3AF] hover:bg-[#2A3040]'}`}>
            {f === 'all' ? 'Todos' : f === 'normal' ? 'Normales' : 'Anticipos'}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-20"><Loader2 className="animate-spin text-[#FF6600]" size={32} /></div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-20 text-[#6B7280]"><CreditCard size={48} className="mx-auto mb-3 opacity-30" /><p>No hay pagos registrados</p></div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
          {filtered.map((pay) => {
            const sName = (pay.supplier as Supplier | undefined)?.name || 'Proveedor'
            return (
              <Card key={pay.id}>
                <div className="flex items-start justify-between mb-2">
                  <div>
                    <p className="text-sm font-bold text-[#F0F2F5]">{sName}</p>
                    <p className="text-xs text-[#6B7280]">{formatDate(pay.payment_date)} | {pay.payment_method || '-'}</p>
                  </div>
                  <div className="flex gap-1">
                    {pay.is_advance && <Badge variant="info" size="sm">ANTICIPO</Badge>}
                    <Badge variant="success" size="sm">{pay.status}</Badge>
                  </div>
                </div>
                <p className="text-xl font-bold text-emerald-400 mb-2">{formatCurrency(pay.amount)}</p>
                {pay.bank_reference && <p className="text-xs text-[#4B5563] mb-1">Ref: {pay.bank_reference}</p>}
                {pay.is_advance && (
                  <div className="pt-2 border-t border-[#1E2330] mt-2">
                    {pay.advance_reason && <p className="text-xs text-[#9CA3AF] mb-1">Motivo: {pay.advance_reason}</p>}
                    {pay.expected_goods_date && (
                      <div className="flex items-center justify-between">
                        <p className="text-xs text-[#6B7280]">
                          Mercaderia esperada: <span style={{ color: getDueDateColor(pay.expected_goods_date) }}>{formatDate(pay.expected_goods_date)}</span>
                        </p>
                        {pay.goods_received ? (
                          <Badge variant="success" size="sm">Recibida</Badge>
                        ) : (
                          <Button variant="secondary" size="sm" onClick={() => markGoodsReceived(pay.id)}>
                            <CheckCircle size={12} /> Recibida
                          </Button>
                        )}
                      </div>
                    )}
                    {pay.goods_received && pay.goods_received_date && (
                      <p className="text-xs text-emerald-400 mt-1">Recibida el {formatDate(pay.goods_received_date)}</p>
                    )}
                  </div>
                )}
              </Card>
            )
          })}
        </div>
      )}

      <Modal isOpen={showAdvance} onClose={() => setShowAdvance(false)} title="Registrar anticipo a proveedor" size="lg">
        <div className="space-y-4">
          <div className="p-3 rounded-lg bg-blue-500/10 border border-blue-500/20 text-xs text-blue-400">
            Los anticipos son pagos realizados antes de recibir la mercaderia. Se genera un recordatorio automatico para la fecha de recepcion esperada.
          </div>
          <Select label="Proveedor *" value={newAdv.supplier_id} onChange={(e) => setNewAdv({ ...newAdv, supplier_id: e.target.value })} options={[{ value: '', label: 'Seleccionar...' }, ...suppliers.map(s => ({ value: s.id, label: s.legal_name || s.name }))]} />
          <div className="grid grid-cols-2 gap-4">
            <Input label="Monto *" type="number" value={newAdv.amount} onChange={(e) => setNewAdv({ ...newAdv, amount: Number(e.target.value) })} />
            <Input label="Fecha de pago *" type="date" value={newAdv.payment_date} onChange={(e) => setNewAdv({ ...newAdv, payment_date: e.target.value })} />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <Select label="Metodo de pago" value={newAdv.payment_method} onChange={(e) => setNewAdv({ ...newAdv, payment_method: e.target.value })} options={[
              { value: 'transferencia', label: 'Transferencia' }, { value: 'cheque', label: 'Cheque' },
              { value: 'efectivo', label: 'Efectivo' }, { value: 'tarjeta', label: 'Tarjeta' },
            ]} />
            <Input label="Referencia bancaria" value={newAdv.bank_reference} onChange={(e) => setNewAdv({ ...newAdv, bank_reference: e.target.value })} />
          </div>
          <Input label="Motivo del anticipo" value={newAdv.advance_reason} onChange={(e) => setNewAdv({ ...newAdv, advance_reason: e.target.value })} placeholder="Por que se paga por adelantado..." />
          <Input label="Fecha esperada de recepcion de mercaderia" type="date" value={newAdv.expected_goods_date} onChange={(e) => setNewAdv({ ...newAdv, expected_goods_date: e.target.value })} />
          <Input label="Notas" value={newAdv.notes} onChange={(e) => setNewAdv({ ...newAdv, notes: e.target.value })} />
          <div className="flex justify-end gap-3 pt-4 border-t border-[#1E2330]">
            <Button variant="secondary" onClick={() => setShowAdvance(false)}>Cancelar</Button>
            <Button onClick={handleCreateAdvance} loading={saving}><Banknote size={14} /> Registrar anticipo</Button>
          </div>
        </div>
      </Modal>
    </div>
  )
}
