'use client'

import { useState, useEffect, useMemo } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useCompanyFilter } from '@/hooks/use-company-filter'
import { Card } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { KPICard } from '@/components/ui/kpi-card'
import { formatCurrency, formatDate } from '@/lib/utils'
import type { Supplier, PurchaseInvoice } from '@/types'
import { CalendarDays, CalendarClock, DollarSign, Loader2 } from 'lucide-react'

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

export function CalendarioPagosTab() {
  const { filterByCompany, companyKey, companyIds } = useCompanyFilter()
  const [invoices, setInvoices] = useState<PurchaseInvoice[]>([])
  const [loading, setLoading] = useState(true)
  const [selectedDay, setSelectedDay] = useState<string | null>(null)

  useEffect(() => {
    (async () => {
      setLoading(true)
      const sb = createClient()
      if (companyIds.length === 0) {
        setInvoices([])
        setLoading(false)
        return
      }
      const { data: supIds } = await sb.from('tt_suppliers').select('id').in('company_id', companyIds)
      const validSupplierIds = (supIds || []).map((r) => r.id as string)
      let result: PurchaseInvoice[] = []
      if (validSupplierIds.length > 0) {
        const { data } = await sb
          .from('tt_purchase_invoices')
          .select('*, supplier:tt_suppliers(id, name, legal_name)')
          .in('supplier_id', validSupplierIds)
          .not('due_date', 'is', null)
          .order('due_date', { ascending: true })
        result = (data || []) as PurchaseInvoice[]
      }
      if (result.length === 0) {
        let qDocInv = sb.from('tt_documents')
          .select('id, display_ref, system_code, total, status, created_at, metadata, client:tt_clients(id, name, legal_name)')
          .eq('doc_type', 'factura_compra')
          .order('created_at', { ascending: false })
          .limit(50)
        qDocInv = filterByCompany(qDocInv)
        const { data: docInvs } = await qDocInv
        result = (docInvs || []).map((d: Record<string, unknown>) => {
          const client = d.client as Record<string, unknown> | null
          return {
            id: d.id as string,
            supplier_id: null,
            supplier_invoice_number: (d.display_ref as string) || (d.system_code as string) || '',
            supplier_invoice_date: (d.created_at as string)?.split('T')[0] || '',
            subtotal: (d.total as number) || 0,
            tax_rate: 21,
            tax_amount: 0,
            total: (d.total as number) || 0,
            paid_amount: d.status === 'paid' ? (d.total as number) || 0 : 0,
            due_date: (d.created_at as string)?.split('T')[0] || null,
            status: (d.status as string) || 'pending',
            notes: '',
            created_at: d.created_at as string,
            supplier: client ? { id: client.id as string, name: (client.legal_name as string) || (client.name as string) || 'Sin proveedor', legal_name: client.legal_name as string } : null,
          } as unknown as PurchaseInvoice
        })
      }
      setInvoices(result)
      setLoading(false)
    })()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [companyKey])

  const calendarData = useMemo(() => {
    const days: Array<{ date: string; label: string; dayNum: number; weekday: string; invoices: PurchaseInvoice[]; isToday: boolean; isWeekend: boolean }> = []
    const today = new Date()
    today.setHours(0, 0, 0, 0)
    for (let i = 0; i < 30; i++) {
      const d = new Date(today)
      d.setDate(today.getDate() + i)
      const dateStr = d.toISOString().split('T')[0]
      const dayInvs = invoices.filter(inv => inv.due_date === dateStr)
      const weekday = d.toLocaleDateString('es-ES', { weekday: 'short' })
      days.push({
        date: dateStr,
        label: d.toLocaleDateString('es-ES', { day: 'numeric', month: 'short' }),
        dayNum: d.getDate(),
        weekday,
        invoices: dayInvs,
        isToday: i === 0,
        isWeekend: d.getDay() === 0 || d.getDay() === 6,
      })
    }
    return days
  }, [invoices])

  type ByCurrency = Record<string, number>
  const sumByCurrency = (list: PurchaseInvoice[]): ByCurrency => {
    const out: ByCurrency = {}
    for (const inv of list) {
      const c = ((inv as PurchaseInvoice & { currency?: string }).currency || 'EUR').toUpperCase()
      out[c] = (out[c] || 0) + (inv.total || 0)
    }
    return out
  }
  const formatByCurrency = (totals: ByCurrency): string => {
    const entries = Object.entries(totals).filter(([, v]) => v > 0)
    if (entries.length === 0) return formatCurrency(0)
    return entries
      .map(([c, v]) => `${c} ${v.toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`)
      .join(' · ')
  }

  const totalDueThisWeek = useMemo(() => {
    const now = new Date()
    const weekEnd = new Date(now)
    weekEnd.setDate(now.getDate() + 7)
    const ws = now.toISOString().split('T')[0]
    const we = weekEnd.toISOString().split('T')[0]
    return sumByCurrency(invoices.filter(i => i.status !== 'paid' && i.due_date && i.due_date >= ws && i.due_date <= we))
  }, [invoices])

  const totalDueNextWeek = useMemo(() => {
    const now = new Date()
    const weekStart = new Date(now)
    weekStart.setDate(now.getDate() + 7)
    const weekEnd = new Date(now)
    weekEnd.setDate(now.getDate() + 14)
    const ws = weekStart.toISOString().split('T')[0]
    const we = weekEnd.toISOString().split('T')[0]
    return sumByCurrency(invoices.filter(i => i.status !== 'paid' && i.due_date && i.due_date >= ws && i.due_date <= we))
  }, [invoices])

  const totalDueMonth = useMemo(
    () => sumByCurrency(invoices.filter(i => i.status !== 'paid')),
    [invoices]
  )

  const selectedDayInvoices = selectedDay ? calendarData.find(d => d.date === selectedDay)?.invoices || [] : []

  if (loading) return <div className="flex items-center justify-center py-20"><Loader2 className="animate-spin text-[#FF6600]" size={32} /></div>

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <KPICard label="Vence esta semana" value={formatByCurrency(totalDueThisWeek)} icon={<CalendarDays size={22} />} color="#F97316" />
        <KPICard label="Vence proxima semana" value={formatByCurrency(totalDueNextWeek)} icon={<CalendarClock size={22} />} color="#EAB308" />
        <KPICard label="Total pendiente (30d)" value={formatByCurrency(totalDueMonth)} icon={<DollarSign size={22} />} color="#EF4444" />
      </div>

      <div className="text-xs text-[#6B7280] px-1">Próximos 30 días — vencimientos de facturas de compra</div>

      <div className="grid grid-cols-5 sm:grid-cols-6 lg:grid-cols-10 gap-2">
        {calendarData.map(day => {
          const hasInvoices = day.invoices.length > 0
          const hasPaid = day.invoices.some(i => i.status === 'paid')
          const hasOverdue = day.invoices.some(i => i.status !== 'paid' && new Date(i.due_date!) < new Date())
          const hasPending = day.invoices.some(i => i.status !== 'paid')
          const totalDayByCurrency = sumByCurrency(day.invoices.filter(i => i.status !== 'paid'))
          const totalDayAmount = Object.values(totalDayByCurrency).reduce((s, v) => s + v, 0)

          let borderColor = 'border-[#1E2330]'
          let bgColor = 'bg-[#141820]'
          if (hasOverdue) { borderColor = 'border-red-500/40'; bgColor = 'bg-red-500/5' }
          else if (hasPending) { borderColor = 'border-amber-500/40'; bgColor = 'bg-amber-500/5' }
          else if (hasPaid && hasInvoices) { borderColor = 'border-emerald-500/40'; bgColor = 'bg-emerald-500/5' }

          return (
            <button
              key={day.date}
              onClick={() => setSelectedDay(selectedDay === day.date ? null : day.date)}
              className={`p-2 rounded-lg border ${borderColor} ${bgColor} transition-all hover:border-[#FF6600]/50 ${selectedDay === day.date ? 'ring-2 ring-[#FF6600]/50' : ''} ${day.isToday ? 'ring-1 ring-blue-500/50' : ''}`}
            >
              <div className="text-center">
                <p className="text-[10px] text-[#6B7280] uppercase">{day.weekday}</p>
                <p className={`text-sm font-bold ${day.isToday ? 'text-blue-400' : 'text-[#F0F2F5]'}`}>{day.dayNum}</p>
                {hasInvoices && (
                  <>
                    <div className="flex justify-center gap-0.5 mt-1">
                      {day.invoices.slice(0, 3).map((inv, idx) => (
                        <div key={idx} className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: inv.status === 'paid' ? '#22C55E' : getDueDateColor(inv.due_date) }} />
                      ))}
                    </div>
                    {totalDayAmount > 0 && <p className="text-[9px] font-mono text-amber-400 mt-0.5">{formatCurrency(totalDayAmount)}</p>}
                  </>
                )}
              </div>
            </button>
          )
        })}
      </div>

      {selectedDay && (
        <Card>
          <h3 className="text-sm font-semibold text-[#F0F2F5] mb-3">
            Facturas del {formatDate(selectedDay, 'dd MMMM yyyy')}
          </h3>
          {selectedDayInvoices.length === 0 ? (
            <p className="text-xs text-[#4B5563] py-4 text-center">No hay facturas con vencimiento este dia</p>
          ) : (
            <div className="space-y-2">
              {selectedDayInvoices.map(inv => {
                const ds = getInvoiceDisplayStatus(inv)
                const sName = (inv.supplier as Supplier | undefined)?.name || 'Proveedor'
                return (
                  <div key={inv.id} className="flex items-center justify-between p-3 rounded-lg bg-[#0F1218]">
                    <div>
                      <p className="text-sm font-semibold text-[#F0F2F5]">{inv.number}</p>
                      <p className="text-xs text-[#6B7280]">{sName}</p>
                    </div>
                    <div className="text-right">
                      <p className="text-sm font-bold text-[#FF6600]">{formatCurrency(inv.total)}</p>
                      <Badge variant={INVOICE_STATUS[ds]?.variant || 'default'} size="sm">{INVOICE_STATUS[ds]?.label || ds}</Badge>
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </Card>
      )}

      <div className="flex flex-wrap gap-4 text-xs text-[#6B7280]">
        <div className="flex items-center gap-1.5"><div className="w-3 h-3 rounded-full bg-emerald-500" /> Pagada</div>
        <div className="flex items-center gap-1.5"><div className="w-3 h-3 rounded-full bg-amber-500" /> Pendiente</div>
        <div className="flex items-center gap-1.5"><div className="w-3 h-3 rounded-full bg-red-500" /> Vencida</div>
        <div className="flex items-center gap-1.5"><div className="w-3 h-3 rounded border border-blue-500" /> Hoy</div>
      </div>
    </div>
  )
}
