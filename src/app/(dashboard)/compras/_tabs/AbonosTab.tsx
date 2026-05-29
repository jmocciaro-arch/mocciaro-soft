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
import { useToast } from '@/components/ui/toast'
import { DataTable, type DataTableColumn } from '@/components/ui/data-table'
import { KPICard } from '@/components/ui/kpi-card'
import { SearchableSelect } from '@/components/ui/searchable-select'
import { formatCurrency, formatDate } from '@/lib/utils'
import type { Supplier, PurchaseInvoice, PurchaseCreditNote, PurchaseCreditNoteItem } from '@/types'
import { generateDocNumber } from '@/lib/doc-numbering'
import { Receipt, Plus, X, Save, CheckCircle, AlertTriangle, Loader2, ArrowLeft, FileText, RotateCcw, DollarSign, FileCheck, Clock, Hash } from 'lucide-react'

type Row = Record<string, unknown>

const CN_STATUS: Record<string, { label: string; variant: 'default' | 'success' | 'warning' | 'danger' | 'info' | 'orange' }> = {
  pending: { label: 'Pendiente', variant: 'warning' },
  applied: { label: 'Aplicado', variant: 'success' },
  rejected: { label: 'Rechazado', variant: 'danger' },
}

const EU_INTRACOM_CODES = new Set([
  'AT','BE','BG','CY','CZ','DE','DK','EE','FI','FR','GR','HR','HU','IE',
  'IT','LT','LU','LV','MT','NL','PL','PT','RO','SE','SI','SK',
])

function isEUIntracomCountry(country: string | null | undefined): boolean {
  if (!country) return false
  return EU_INTRACOM_CODES.has(country.toUpperCase())
}

async function generateCNNumber(companyId?: string | null): Promise<string> {
  return generateDocNumber('AB', companyId ?? null)
}

export function AbonosTab() {
  const { addToast } = useToast()
  const { filterByCompany, defaultCompanyId, companyKey } = useCompanyFilter()
  const [creditNotes, setCreditNotes] = useState<PurchaseCreditNote[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState('')
  const [showCreate, setShowCreate] = useState(false)
  const [selectedCN, setSelectedCN] = useState<PurchaseCreditNote | null>(null)
  const [cnItems, setCnItems] = useState<PurchaseCreditNoteItem[]>([])
  const [saving, setSaving] = useState(false)

  // Create form state
  const [newCN, setNewCN] = useState({
    supplier_id: '',
    purchase_invoice_id: '',
    supplier_cn_number: '',
    supplier_cn_date: '',
    reason: '',
    subtotal: 0,
    tax_rate: 21,
    notes: '',
    items: [{ description: '', quantity: 1, unit_price: 0, sku: '', product_id: '' }] as Array<{
      description: string; quantity: number; unit_price: number; sku: string; product_id: string
    }>,
  })

  // Suppliers for searchable select
  const searchSuppliers = useCallback(async (query: string) => {
    const sb = createClient()
    const { data } = await sb
      .from('tt_suppliers')
      .select('id, name, legal_name')
      .eq('active', true)
      .or(`name.ilike.%${query}%,legal_name.ilike.%${query}%`)
      .order('name')
      .limit(20)
    return (data || []).map(s => ({ value: s.id, label: s.legal_name || s.name }))
  }, [])

  // Warning de proveedor UE-intracom
  const [supplierIntracom, setSupplierIntracom] = useState<{ isEU: boolean; country: string | null }>({ isEU: false, country: null })
  useEffect(() => {
    if (!newCN.supplier_id) {
      setSupplierIntracom({ isEU: false, country: null })
      return
    }
    const sb = createClient()
    sb.from('tt_suppliers')
      .select('country')
      .eq('id', newCN.supplier_id)
      .single()
      .then(({ data }) => {
        const country = (data?.country as string) || null
        setSupplierIntracom({ isEU: isEUIntracomCountry(country), country })
      })
  }, [newCN.supplier_id])

  // Invoices for the selected supplier
  const [supplierInvoices, setSupplierInvoices] = useState<Array<{ value: string; label: string }>>([])
  useEffect(() => {
    if (!newCN.supplier_id) { setSupplierInvoices([]); return }
    const loadInvoices = async () => {
      const sb = createClient()
      const { data } = await sb
        .from('tt_purchase_invoices')
        .select('id, number, supplier_invoice_number, total')
        .eq('supplier_id', newCN.supplier_id)
        .order('created_at', { ascending: false })
        .limit(50)
      setSupplierInvoices(
        (data || []).map(i => ({
          value: i.id,
          label: `${i.number}${i.supplier_invoice_number ? ` (${i.supplier_invoice_number})` : ''} - ${formatCurrency(i.total)}`,
        }))
      )
    }
    loadInvoices()
  }, [newCN.supplier_id])

  const load = useCallback(async () => {
    setLoading(true)
    const sb = createClient()
    let q = sb
      .from('tt_purchase_credit_notes')
      .select('*, supplier:tt_suppliers(id, name, legal_name), purchase_invoice:tt_purchase_invoices(id, number)')
      .order('created_at', { ascending: false })
    q = filterByCompany(q)
    const { data } = await q
    setCreditNotes((data || []) as PurchaseCreditNote[])
    setLoading(false)
  }, [companyKey])

  useEffect(() => { void load() }, [load])

  // Filter
  const filtered = useMemo(() => {
    let result = creditNotes
    if (statusFilter) {
      result = result.filter(cn => cn.status === statusFilter)
    }
    if (search.trim()) {
      const tokens = search.trim().toLowerCase().split(/\s+/)
      result = result.filter(cn => {
        const sName = cn.supplier?.name || cn.supplier?.legal_name || ''
        const invRef = (cn.purchase_invoice as PurchaseInvoice | undefined)?.number || ''
        const searchable = [cn.number, sName, cn.supplier_cn_number, cn.reason, invRef].filter(Boolean).join(' ').toLowerCase()
        return tokens.every(t => searchable.includes(t))
      })
    }
    return result
  }, [creditNotes, search, statusFilter])

  // KPIs
  const pendingTotal = creditNotes.filter(cn => cn.status === 'pending').reduce((s, cn) => s + cn.total, 0)
  const appliedTotal = creditNotes.filter(cn => cn.status === 'applied').reduce((s, cn) => s + cn.total, 0)
  const pendingCount = creditNotes.filter(cn => cn.status === 'pending').length

  // Computed subtotal/tax/total for create form
  const computedSubtotal = newCN.items.reduce((s, item) => s + item.quantity * item.unit_price, 0)
  const computedTaxAmount = computedSubtotal * newCN.tax_rate / 100
  const computedTotal = computedSubtotal + computedTaxAmount

  function addItem() {
    setNewCN(prev => ({
      ...prev,
      items: [...prev.items, { description: '', quantity: 1, unit_price: 0, sku: '', product_id: '' }],
    }))
  }

  function removeItem(idx: number) {
    setNewCN(prev => ({
      ...prev,
      items: prev.items.filter((_, i) => i !== idx),
    }))
  }

  function updateItem(idx: number, field: string, value: string | number) {
    setNewCN(prev => ({
      ...prev,
      items: prev.items.map((item, i) => i === idx ? { ...item, [field]: value } : item),
    }))
  }

  async function handleCreate() {
    if (!newCN.supplier_id) { addToast({ type: 'error', title: 'Selecciona un proveedor' }); return }
    if (newCN.items.length === 0 || !newCN.items.some(i => i.description.trim())) {
      addToast({ type: 'error', title: 'Agrega al menos un item con descripcion' }); return
    }
    setSaving(true)
    const sb = createClient()
    const number = await generateCNNumber(defaultCompanyId)
    const { data: cnData, error } = await sb.from('tt_purchase_credit_notes').insert({
      number,
      company_id: defaultCompanyId,
      supplier_id: newCN.supplier_id,
      purchase_invoice_id: newCN.purchase_invoice_id || null,
      supplier_cn_number: newCN.supplier_cn_number || null,
      supplier_cn_date: newCN.supplier_cn_date || null,
      reason: newCN.reason || null,
      status: 'pending',
      currency: 'EUR',
      subtotal: computedSubtotal,
      tax_rate: newCN.tax_rate,
      tax_amount: computedTaxAmount,
      total: computedTotal,
      notes: newCN.notes || null,
    }).select('id').single()

    if (error || !cnData) {
      addToast({ type: 'error', title: 'Error al crear abono', message: error?.message || 'Error desconocido' })
      setSaving(false)
      return
    }

    // Insert items
    const itemsToInsert = newCN.items
      .filter(i => i.description.trim())
      .map(i => ({
        credit_note_id: cnData.id,
        product_id: i.product_id || null,
        sku: i.sku || null,
        description: i.description,
        quantity: i.quantity,
        unit_price: i.unit_price,
        subtotal: i.quantity * i.unit_price,
      }))

    if (itemsToInsert.length > 0) {
      await sb.from('tt_purchase_credit_note_items').insert(itemsToInsert)
    }

    addToast({ type: 'success', title: 'Abono creado', message: `Numero: ${number}` })
    setShowCreate(false)
    setNewCN({
      supplier_id: '', purchase_invoice_id: '', supplier_cn_number: '',
      supplier_cn_date: '', reason: '', subtotal: 0, tax_rate: 21, notes: '',
      items: [{ description: '', quantity: 1, unit_price: 0, sku: '', product_id: '' }],
    })
    load()
    setSaving(false)
  }

  async function openDetail(cn: PurchaseCreditNote) {
    setSelectedCN(cn)
    const sb = createClient()
    const { data } = await sb
      .from('tt_purchase_credit_note_items')
      .select('*')
      .eq('credit_note_id', cn.id)
      .order('id')
    setCnItems((data || []) as PurchaseCreditNoteItem[])
  }

  async function handleApply() {
    if (!selectedCN) return
    setSaving(true)
    const sb = createClient()
    const { error } = await sb
      .from('tt_purchase_credit_notes')
      .update({ status: 'applied', updated_at: new Date().toISOString() })
      .eq('id', selectedCN.id)
    if (!error) {
      addToast({ type: 'success', title: 'Abono aplicado' })
      setSelectedCN(prev => prev ? { ...prev, status: 'applied' } : null)
      load()
    } else {
      addToast({ type: 'error', title: 'Error', message: error.message })
    }
    setSaving(false)
  }

  async function handleReject() {
    if (!selectedCN) return
    setSaving(true)
    const sb = createClient()
    const { error } = await sb
      .from('tt_purchase_credit_notes')
      .update({ status: 'rejected', updated_at: new Date().toISOString() })
      .eq('id', selectedCN.id)
    if (!error) {
      addToast({ type: 'success', title: 'Abono rechazado' })
      setSelectedCN(prev => prev ? { ...prev, status: 'rejected' } : null)
      load()
    } else {
      addToast({ type: 'error', title: 'Error', message: error.message })
    }
    setSaving(false)
  }

  // Detail view
  if (selectedCN) {
    const sName = selectedCN.supplier?.name || selectedCN.supplier?.legal_name || 'Proveedor'
    const invRef = (selectedCN.purchase_invoice as PurchaseInvoice | undefined)?.number || null
    const st = CN_STATUS[selectedCN.status] || CN_STATUS.pending

    return (
      <div className="space-y-4 animate-in fade-in">
        <button onClick={() => setSelectedCN(null)} className="flex items-center gap-2 text-[#9CA3AF] hover:text-[#F0F2F5] transition-colors text-sm">
          <ArrowLeft size={16} /> Volver a abonos
        </button>

        <div className="flex items-start justify-between">
          <div>
            <h2 className="text-xl font-bold text-[#F0F2F5]">{selectedCN.number}</h2>
            <p className="text-sm text-[#6B7280]">
              {sName}
              {selectedCN.supplier_cn_number ? ` | N. abono proveedor: ${selectedCN.supplier_cn_number}` : ''}
            </p>
          </div>
          <Badge variant={st.variant} size="md">{st.label}</Badge>
        </div>

        {/* Totals cards */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <div className="p-4 rounded-xl bg-[#141820] border border-[#1E2330]">
            <p className="text-xs text-[#6B7280]">Subtotal</p>
            <p className="text-lg font-bold text-[#F0F2F5]">{formatCurrency(selectedCN.subtotal)}</p>
          </div>
          <div className="p-4 rounded-xl bg-[#141820] border border-[#1E2330]">
            <p className="text-xs text-[#6B7280]">IVA ({selectedCN.tax_rate}%)</p>
            <p className="text-lg font-bold text-[#F0F2F5]">{formatCurrency(selectedCN.tax_amount)}</p>
          </div>
          <div className="p-4 rounded-xl bg-[#141820] border border-[#1E2330]">
            <p className="text-xs text-[#6B7280]">Total abono</p>
            <p className="text-lg font-bold text-[#FF6600]">{formatCurrency(selectedCN.total)}</p>
          </div>
          <div className="p-4 rounded-xl bg-[#141820] border border-[#1E2330]">
            <p className="text-xs text-[#6B7280]">Fecha abono</p>
            <p className="text-lg font-bold text-[#F0F2F5]">
              {selectedCN.supplier_cn_date ? formatDate(selectedCN.supplier_cn_date) : '-'}
            </p>
          </div>
        </div>

        {/* Reason */}
        {selectedCN.reason && (
          <Card className="p-4">
            <p className="text-xs text-[#6B7280] mb-1">Motivo</p>
            <p className="text-sm text-[#F0F2F5]">{selectedCN.reason}</p>
          </Card>
        )}

        {/* Linked invoice */}
        {invRef && (
          <Card className="p-4">
            <p className="text-xs text-[#6B7280] mb-1">Factura vinculada</p>
            <p className="text-sm text-[#F0F2F5] flex items-center gap-2">
              <FileCheck size={14} className="text-[#FF6600]" /> {invRef}
            </p>
          </Card>
        )}

        {/* Items table */}
        <Card className="p-0 overflow-hidden">
          <div className="px-4 py-3 border-b border-[#1E2330]">
            <h3 className="font-semibold text-sm text-[#F0F2F5]">Items del abono</h3>
          </div>
          {cnItems.length === 0 ? (
            <div className="p-6 text-center text-sm text-[#6B7280]">Sin items registrados</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-[#1E2330] text-[#6B7280]">
                    <th className="px-4 py-2 text-left font-medium">Descripcion</th>
                    <th className="px-4 py-2 text-left font-medium">SKU</th>
                    <th className="px-4 py-2 text-right font-medium">Cantidad</th>
                    <th className="px-4 py-2 text-right font-medium">Precio unit.</th>
                    <th className="px-4 py-2 text-right font-medium">Subtotal</th>
                  </tr>
                </thead>
                <tbody>
                  {cnItems.map(item => (
                    <tr key={item.id} className="border-b border-[#1E2330]/50 hover:bg-[#1E2330]/30">
                      <td className="px-4 py-2 text-[#F0F2F5]">{item.description || '-'}</td>
                      <td className="px-4 py-2 text-[#9CA3AF]">{item.sku || '-'}</td>
                      <td className="px-4 py-2 text-right text-[#F0F2F5]">{item.quantity}</td>
                      <td className="px-4 py-2 text-right text-[#F0F2F5]">{formatCurrency(item.unit_price)}</td>
                      <td className="px-4 py-2 text-right text-[#FF6600] font-medium">{formatCurrency(item.subtotal)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>

        {/* Notes */}
        {selectedCN.notes && (
          <Card className="p-4">
            <p className="text-xs text-[#6B7280] mb-1">Notas</p>
            <p className="text-sm text-[#9CA3AF]">{selectedCN.notes}</p>
          </Card>
        )}

        {/* Action buttons */}
        {selectedCN.status === 'pending' && (
          <div className="flex gap-2">
            <Button variant="primary" onClick={handleApply} disabled={saving}>
              {saving ? <Loader2 size={16} className="animate-spin" /> : <CheckCircle size={16} />}
              Aplicar abono
            </Button>
            <Button variant="secondary" onClick={handleReject} disabled={saving}>
              <X size={16} /> Rechazar
            </Button>
          </div>
        )}
      </div>
    )
  }

  // List view
  return (
    <div className="space-y-4 animate-in fade-in">
      {/* KPIs */}
      <div className="grid grid-cols-3 gap-4">
        <KPICard
          label="Abonos pendientes"
          value={formatCurrency(pendingTotal)}
          icon={<Receipt size={20} />}
          color="#EAB308"
        />
        <KPICard
          label="Abonos aplicados"
          value={formatCurrency(appliedTotal)}
          icon={<CheckCircle size={20} />}
          color="#10B981"
        />
        <KPICard
          label="Pendientes"
          value={pendingCount}
          icon={<Clock size={20} />}
          color="#FF6600"
        />
      </div>

      {/* Filters and actions */}
      <div className="flex items-center gap-3 flex-wrap">
        <div className="flex-1 min-w-[200px]">
          <Input
            placeholder="Buscar abonos..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            icon={<Hash size={14} />}
          />
        </div>
        <Select
          options={[
            { value: '', label: 'Todos los estados' },
            { value: 'pending', label: 'Pendiente' },
            { value: 'applied', label: 'Aplicado' },
            { value: 'rejected', label: 'Rechazado' },
          ]}
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          className="w-44"
        />
        <Button variant="primary" onClick={() => { setShowCreate(true) }}>
          <Plus size={16} /> Nuevo abono
        </Button>
      </div>

      {/* Data table */}
      <DataTable
        data={filtered.map(cn => ({
          id: cn.id,
          number: cn.number,
          supplier: cn.supplier?.name || cn.supplier?.legal_name || '-',
          invoice_ref: (cn.purchase_invoice as PurchaseInvoice | undefined)?.number || '-',
          date: cn.supplier_cn_date || cn.created_at,
          total: cn.total,
          status: cn.status,
          reason: cn.reason || '-',
          _raw: cn,
        }))}
        columns={[
          { key: 'number', label: 'Numero', sortable: true },
          { key: 'supplier', label: 'Proveedor', sortable: true, searchable: true },
          { key: 'invoice_ref', label: 'Factura ref.', sortable: true },
          {
            key: 'date', label: 'Fecha', sortable: true, type: 'date',
            render: (v) => v ? formatDate(v as string) : '-',
          },
          {
            key: 'total', label: 'Total', sortable: true, type: 'currency',
            render: (v) => <span className="text-[#FF6600] font-medium">{formatCurrency(v as number)}</span>,
          },
          {
            key: 'status', label: 'Estado', sortable: true, type: 'status',
            render: (v) => {
              const st = CN_STATUS[v as string] || CN_STATUS.pending
              return <Badge variant={st.variant}>{st.label}</Badge>
            },
          },
          { key: 'reason', label: 'Motivo', searchable: true },
        ]}
        loading={loading}
        onRowClick={(row) => openDetail(row._raw as PurchaseCreditNote)}
        onNewClick={() => setShowCreate(true)}
        newLabel="Nuevo abono"
        exportFilename="abonos_compra"
        totalLabel="abonos"
      />

      {/* CREATE MODAL */}
      <Modal isOpen={showCreate} onClose={() => setShowCreate(false)} title="Nuevo abono de proveedor" size="xl">
        <div className="space-y-4">
          {supplierIntracom.isEU && (
            <div className="bg-yellow-500/10 border border-yellow-500/30 text-yellow-200 p-3 rounded text-sm">
              ⚠️ Proveedor UE ({supplierIntracom.country}) distinto de ES. Posible operación intracomunitaria — IVA debería ser 0% con reverse charge. Revisá antes de guardar.
            </div>
          )}
          {/* Supplier */}
          <SearchableSelect
            label="Proveedor"
            value={newCN.supplier_id}
            onChange={(val) => setNewCN(prev => ({ ...prev, supplier_id: val, purchase_invoice_id: '' }))}
            placeholder="Buscar proveedor..."
            onSearch={searchSuppliers}
            minSearchLength={2}
          />

          {/* Linked invoice */}
          {newCN.supplier_id && supplierInvoices.length > 0 && (
            <SearchableSelect
              label="Factura vinculada (opcional)"
              value={newCN.purchase_invoice_id}
              onChange={(val) => setNewCN(prev => ({ ...prev, purchase_invoice_id: val }))}
              placeholder="Seleccionar factura..."
              options={supplierInvoices}
            />
          )}

          <div className="grid grid-cols-2 gap-3">
            <Input
              label="N. abono proveedor"
              value={newCN.supplier_cn_number}
              onChange={(e) => setNewCN(prev => ({ ...prev, supplier_cn_number: e.target.value }))}
              placeholder="Ej: AB-2024-001"
            />
            <Input
              label="Fecha abono proveedor"
              type="date"
              value={newCN.supplier_cn_date}
              onChange={(e) => setNewCN(prev => ({ ...prev, supplier_cn_date: e.target.value }))}
            />
          </div>

          <Input
            label="Motivo del abono"
            value={newCN.reason}
            onChange={(e) => setNewCN(prev => ({ ...prev, reason: e.target.value }))}
            placeholder="Ej: Devolucion de mercaderia, diferencia de precio..."
          />

          {/* Items */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="text-sm font-medium text-[#9CA3AF]">Items</label>
              <Button variant="ghost" size="sm" onClick={addItem}>
                <Plus size={14} /> Agregar item
              </Button>
            </div>
            <div className="space-y-2">
              {newCN.items.map((item, idx) => (
                <div key={idx} className="grid grid-cols-[1fr_80px_80px_100px_32px] gap-2 items-end">
                  <Input
                    placeholder="Descripcion"
                    value={item.description}
                    onChange={(e) => updateItem(idx, 'description', e.target.value)}
                  />
                  <Input
                    placeholder="Cant."
                    type="number"
                    min="1"
                    value={item.quantity}
                    onChange={(e) => updateItem(idx, 'quantity', Number(e.target.value))}
                  />
                  <Input
                    placeholder="SKU"
                    value={item.sku}
                    onChange={(e) => updateItem(idx, 'sku', e.target.value)}
                  />
                  <Input
                    placeholder="Precio"
                    type="number"
                    min="0"
                    step="0.01"
                    value={item.unit_price}
                    onChange={(e) => updateItem(idx, 'unit_price', Number(e.target.value))}
                  />
                  <button
                    onClick={() => removeItem(idx)}
                    className="h-10 w-8 flex items-center justify-center text-[#6B7280] hover:text-red-400 transition-colors"
                    disabled={newCN.items.length <= 1}
                  >
                    <X size={14} />
                  </button>
                </div>
              ))}
            </div>
          </div>

          {/* Tax rate */}
          <div className="grid grid-cols-3 gap-3">
            <Select
              label="Tipo IVA"
              options={[
                { value: '0', label: '0% (Intracomunitaria)' },
                { value: '4', label: '4% (Superreducido)' },
                { value: '10', label: '10% (Reducido)' },
                { value: '21', label: '21% (General)' },
              ]}
              value={String(newCN.tax_rate)}
              onChange={(e) => setNewCN(prev => ({ ...prev, tax_rate: Number(e.target.value) }))}
            />
            <div className="p-3 rounded-xl bg-[#141820] border border-[#1E2330]">
              <p className="text-xs text-[#6B7280] mb-1">Subtotal</p>
              <p className="text-lg font-bold text-[#F0F2F5]">{formatCurrency(computedSubtotal)}</p>
            </div>
            <div className="p-3 rounded-xl bg-[#141820] border border-[#1E2330]">
              <p className="text-xs text-[#6B7280] mb-1">Total (con IVA)</p>
              <p className="text-lg font-bold text-[#FF6600]">{formatCurrency(computedTotal)}</p>
            </div>
          </div>

          <Input
            label="Notas"
            value={newCN.notes}
            onChange={(e) => setNewCN(prev => ({ ...prev, notes: e.target.value }))}
            placeholder="Notas internas..."
          />

          <div className="flex justify-end gap-2 pt-2">
            <Button variant="secondary" onClick={() => setShowCreate(false)}>Cancelar</Button>
            <Button variant="primary" onClick={handleCreate} disabled={saving}>
              {saving ? <Loader2 size={16} className="animate-spin" /> : <Plus size={16} />}
              Crear abono
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  )
}
