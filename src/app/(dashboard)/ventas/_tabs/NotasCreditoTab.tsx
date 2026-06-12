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
import { Badge } from '@/components/ui/badge'
import { SearchBar } from '@/components/ui/search-bar'
import { KPICard } from '@/components/ui/kpi-card'
import { DocumentForm } from '@/components/workflow/document-form'
import { documentToTableRow, mapStatus } from '@/lib/document-helpers'
import { formatCurrency, formatDate } from '@/lib/utils'
import { generateDocNumber } from '@/lib/doc-numbering'
import {
  RotateCcw, Plus, Loader2, X, DollarSign, Save,
  CheckSquare, Square, AlertTriangle,
} from 'lucide-react'

type Row = Record<string, unknown>

const NOTA_CREDITO_COLS: DataTableColumn[] = [
  { key: 'referencia', label: 'Numero', sortable: true, searchable: true, width: '140px' },
  { key: 'cliente', label: 'Cliente', sortable: true, searchable: true },
  { key: 'factura_original', label: 'Factura original', searchable: true, width: '140px' },
  { key: 'motivo', label: 'Motivo', searchable: true, width: '160px' },
  { key: 'estado', label: 'Estado', sortable: true, type: 'status', width: '120px' },
  { key: 'fecha', label: 'Fecha', sortable: true, type: 'date', width: '110px' },
  { key: 'importe', label: 'Total', sortable: true, type: 'currency', width: '120px' },
]

const CREDIT_NOTE_REASON_LABELS: Record<string, string> = {
  devolucion: 'Devolucion',
  error_facturacion: 'Error de facturacion',
  descuento_posterior: 'Descuento posterior',
  anulacion: 'Anulacion',
  otro: 'Otro',
}

export function NotasCreditoTab() {
  const { filterByCompany, companyKey, defaultCompanyId } = useCompanyFilter()
  const { addToast } = useToast()

  const [rows, setRows] = useState<Record<string, unknown>[]>([])
  const [loading, setLoading] = useState(true)
  const [showCreate, setShowCreate] = useState(false)
  const [saving, setSaving] = useState(false)

  // Create form state
  const [invoiceSearch, setInvoiceSearch] = useState('')
  const [invoiceResults, setInvoiceResults] = useState<Row[]>([])
  const [invoicesLoading, setInvoicesLoading] = useState(false)
  const [selectedInvoice, setSelectedInvoice] = useState<Row | null>(null)
  const [selectedInvoiceItems, setSelectedInvoiceItems] = useState<Array<{
    id: string; description: string; quantity: number; unit_price: number;
    discount_pct: number; max_qty: number; include: boolean
  }>>([])
  const [creditReason, setCreditReason] = useState('')
  const [creditReasonCustom, setCreditReasonCustom] = useState('')

  // Detail navigation
  const [selectedDoc, setSelectedDoc] = useState<{ id: string; source: 'local' | 'tt_documents' } | null>(null)

  // Load credit notes
  const load = useCallback(async () => {
    setLoading(true)
    const sb = createClient()
    let q = sb
      .from('tt_documents')
      .select('*, client:tt_clients(id, name, legal_name, tax_id)')
      .eq('is_credit_note', true)
    q = filterByCompany(q)
    const { data, error } = await q.order('created_at', { ascending: false }).range(0, 499)

    if (error) {
      addToast({ type: 'error', title: 'Error al cargar notas de credito', message: error.message })
    }

    const mapped = (data || []).map((doc: Row) => {
      const client = doc.client as Record<string, unknown> | undefined
      const clientName = (client?.legal_name as string) || (client?.name as string) || 'Sin cliente'
      const ref = (doc.display_ref as string) || (doc.system_code as string) || 'S/N'
      const reason = (doc.credit_note_reason as string) || ''
      return {
        id: doc.id,
        referencia: ref,
        cliente: clientName,
        factura_original: (doc.original_invoice_ref as string) || '-',
        motivo: CREDIT_NOTE_REASON_LABELS[reason] || reason || '-',
        estado: mapStatus(doc.status as string),
        fecha: doc.created_at ? formatDate(doc.created_at as string) : '',
        importe: -Math.abs((doc.total as number) || 0),
        _raw: doc,
        _source: 'tt_documents',
      }
    })
    setRows(mapped)
    setLoading(false)
  }, [companyKey])

  useEffect(() => { load() }, [load])

  // Search invoices for credit note creation
  const searchInvoices = useCallback(async (term: string) => {
    setInvoiceSearch(term)
    if (term.length < 2) { setInvoiceResults([]); return }
    setInvoicesLoading(true)
    const sb = createClient()
    let q = sb
      .from('tt_documents')
      .select('*, client:tt_clients(id, name, legal_name, tax_id)')
      .in('doc_type', ['factura', 'factura_abono'])
      .or(`display_ref.ilike.%${term}%,system_code.ilike.%${term}%`)
      .eq('is_credit_note', false)
    q = filterByCompany(q)
    const { data } = await q.order('created_at', { ascending: false }).limit(20)
    setInvoiceResults(data || [])
    setInvoicesLoading(false)
  }, [companyKey])

  // Select an invoice and load its items
  const selectOriginalInvoice = useCallback(async (invoice: Row) => {
    setSelectedInvoice(invoice)
    const ref = (invoice.display_ref as string) || (invoice.system_code as string) || ''
    setInvoiceSearch(ref)
    setInvoiceResults([])

    // Load invoice items
    const sb = createClient()
    const { data: items } = await sb
      .from('tt_document_lines')
      .select('*')
      .eq('document_id', invoice.id)
      .order('sort_order')

    setSelectedInvoiceItems((items || []).map((item: Row) => ({
      id: item.id as string,
      description: (item.description as string) || '',
      quantity: (item.quantity as number) || 0,
      unit_price: (item.unit_price as number) || 0,
      discount_pct: (item.discount_pct as number) || 0,
      max_qty: (item.quantity as number) || 0,
      include: true,
    })))
  }, [])

  const resetCreateForm = () => {
    setSelectedInvoice(null)
    setSelectedInvoiceItems([])
    setInvoiceSearch('')
    setInvoiceResults([])
    setCreditReason('')
    setCreditReasonCustom('')
  }

  // Create credit note
  const handleCreateCreditNote = useCallback(async () => {
    if (!selectedInvoice) {
      addToast({ type: 'warning', title: 'Selecciona una factura original' })
      return
    }
    if (!creditReason) {
      addToast({ type: 'warning', title: 'Selecciona un motivo' })
      return
    }
    const includedItems = selectedInvoiceItems.filter(it => it.include && it.quantity > 0)
    if (includedItems.length === 0) {
      addToast({ type: 'warning', title: 'Incluye al menos un item' })
      return
    }

    setSaving(true)
    const sb = createClient()

    // Calculate totals (negative)
    const subtotal = includedItems.reduce((s, it) => {
      return s + (it.quantity * it.unit_price * (1 - (it.discount_pct || 0) / 100))
    }, 0)
    const taxPct = (selectedInvoice.tax_pct as number) || 21
    const taxAmount = subtotal * (taxPct / 100)
    const total = subtotal + taxAmount

    // Generate doc number
    const docNum = await generateDocNumber('NC', (selectedInvoice.company_id as string | null) ?? null)
    const originalRef = (selectedInvoice.display_ref as string) || (selectedInvoice.system_code as string) || ''

    // Create the credit note document
    const { data: doc, error } = await sb
      .from('tt_documents')
      .insert({
        company_id: (selectedInvoice.company_id as string) || defaultCompanyId,
        client_id: (selectedInvoice.client_id as string) || null,
        doc_type: 'factura',
        display_ref: docNum,
        system_code: docNum,
        status: 'draft',
        currency: (selectedInvoice.currency as string) || 'EUR',
        subtotal: -Math.abs(subtotal),
        tax_pct: taxPct,
        tax_amount: -Math.abs(taxAmount),
        total: -Math.abs(total),
        is_credit_note: true,
        credit_note_reason: creditReason === 'otro' ? creditReasonCustom || 'otro' : creditReason,
        original_invoice_id: selectedInvoice.id as string,
        original_invoice_ref: originalRef,
        notes: `Nota de credito sobre factura ${originalRef}`,
        internal_notes: creditReason === 'otro' ? creditReasonCustom : CREDIT_NOTE_REASON_LABELS[creditReason] || creditReason,
        payment_terms: (selectedInvoice.payment_terms as string) || null,
        incoterm: (selectedInvoice.incoterm as string) || null,
      })
      .select()
      .single()

    if (error || !doc) {
      addToast({ type: 'error', title: 'Error al crear nota de credito', message: error?.message })
      setSaving(false)
      return
    }

    // Insert items (negative quantities)
    const itemPayloads = includedItems.map((item, i) => ({
      document_id: doc.id,
      description: item.description,
      quantity: -Math.abs(item.quantity),
      unit_price: item.unit_price,
      discount_pct: item.discount_pct || 0,
      line_total: -(item.quantity * item.unit_price * (1 - (item.discount_pct || 0) / 100)),
      sort_order: i,
    }))
    const { error: itemsError } = await sb.from('tt_document_lines').insert(itemPayloads)
    if (itemsError) {
      addToast({ type: 'error', title: 'Error al crear items', message: itemsError.message })
    }

    addToast({ type: 'success', title: 'Nota de credito creada', message: docNum })
    setSaving(false)
    setShowCreate(false)
    resetCreateForm()
    load()
  }, [selectedInvoice, creditReason, creditReasonCustom, selectedInvoiceItems, defaultCompanyId])

  // Navigate to original invoice
  const openOriginalInvoice = (row: Record<string, unknown>) => {
    const raw = row._raw as Row
    if (raw.original_invoice_id) {
      setSelectedDoc({ id: raw.original_invoice_id as string, source: 'tt_documents' })
    }
  }

  // Detail view
  if (selectedDoc) {
    return (
      <DocumentForm
        documentId={selectedDoc.id}
        documentType="factura"
        source={selectedDoc.source}
        onBack={() => { setSelectedDoc(null); load() }}
        onUpdate={load}
        siblingIds={[]}
      />
    )
  }

  // KPIs
  const totalNCs = rows.length
  const totalAmount = rows.reduce((s, r) => s + Math.abs((r.importe as number) || 0), 0)

  return (
    <div className="space-y-4">
      {/* KPIs */}
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
        <KPICard
          label="Notas de credito"
          value={totalNCs}
          icon={<RotateCcw size={22} />}
          color="#EF4444"
        />
        <KPICard
          label="Total acreditado"
          value={formatCurrency(totalAmount)}
          icon={<DollarSign size={22} />}
          color="#F59E0B"
        />
        <div className="flex items-end justify-end">
          <Button variant="primary" onClick={() => { setShowCreate(true); resetCreateForm() }}>
            <Plus size={16} /> Nueva nota de credito
          </Button>
        </div>
      </div>

      {/* Table with custom render for negative amounts and factura original link */}
      <DataTable
        data={rows}
        columns={NOTA_CREDITO_COLS.map(col => {
          if (col.key === 'importe') {
            return {
              ...col,
              render: (value: unknown) => (
                <span className="text-red-400 font-medium">
                  {formatCurrency(Math.abs(value as number))}
                </span>
              ),
            }
          }
          if (col.key === 'factura_original') {
            return {
              ...col,
              render: (value: unknown, row: Record<string, unknown>) => {
                const raw = row._raw as Row
                if (!raw.original_invoice_id) return <span className="text-[#4B5563]">-</span>
                return (
                  <button
                    onClick={(e) => { e.stopPropagation(); openOriginalInvoice(row) }}
                    className="text-[#FF6600] hover:underline text-sm"
                  >
                    {value as string}
                  </button>
                )
              },
            }
          }
          return col
        })}
        loading={loading}
        totalLabel="notas de credito"
        showTotals
        exportFilename="notas_credito_torquetools"
        pageSize={25}
      />

      {/* CREATE CREDIT NOTE MODAL */}
      <Modal
        isOpen={showCreate}
        onClose={() => { setShowCreate(false); resetCreateForm() }}
        title="Nueva nota de credito"
        size="xl"
      >
        <div className="space-y-6">
          {/* Step 1: Select original invoice */}
          <div>
            <label className="block text-sm font-semibold text-[#F0F2F5] mb-2">
              1. Selecciona la factura original
            </label>
            <div className="relative">
              <SearchBar
                placeholder="Buscar factura por numero..."
                value={invoiceSearch}
                onChange={(v) => {
                  searchInvoices(v)
                  if (!v) setSelectedInvoice(null)
                }}
              />
              {invoicesLoading && (
                <Loader2 size={14} className="animate-spin absolute right-3 top-3 text-[#6B7280]" />
              )}
              {invoiceResults.length > 0 && invoiceSearch.length >= 2 && !selectedInvoice && (
                <div className="absolute z-20 w-full mt-1 bg-[#141820] border border-[#1E2330] rounded-lg shadow-xl max-h-60 overflow-y-auto">
                  {invoiceResults.map(inv => {
                    const client = inv.client as Record<string, unknown> | undefined
                    const clientName = (client?.legal_name as string) || (client?.name as string) || 'Sin cliente'
                    return (
                      <button
                        key={inv.id as string}
                        onClick={() => selectOriginalInvoice(inv)}
                        className="w-full text-left px-4 py-3 hover:bg-[#1E2330] transition-colors border-b border-[#1E2330]/30 last:border-0"
                      >
                        <div className="flex items-center justify-between">
                          <div>
                            <p className="text-sm font-medium text-[#F0F2F5]">
                              {(inv.display_ref as string) || (inv.system_code as string) || 'S/N'}
                            </p>
                            <p className="text-xs text-[#6B7280]">{clientName}</p>
                          </div>
                          <div className="text-right">
                            <p className="text-sm font-medium text-[#F0F2F5]">
                              {formatCurrency((inv.total as number) || 0)}
                            </p>
                            <p className="text-xs text-[#6B7280]">
                              {inv.created_at ? formatDate(inv.created_at as string) : ''}
                            </p>
                          </div>
                        </div>
                      </button>
                    )
                  })}
                </div>
              )}
            </div>
            {selectedInvoice && (
              <div className="mt-3 p-3 rounded-lg bg-[#0F1218] border border-[#1E2330] flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-[#F0F2F5]">
                    Factura: {(selectedInvoice.display_ref as string) || (selectedInvoice.system_code as string)}
                  </p>
                  <p className="text-xs text-[#6B7280]">
                    {((selectedInvoice.client as Record<string, unknown>)?.legal_name as string) ||
                     ((selectedInvoice.client as Record<string, unknown>)?.name as string) || 'Sin cliente'}
                    {' - '}Total: {formatCurrency((selectedInvoice.total as number) || 0)}
                  </p>
                </div>
                <button
                  onClick={() => { setSelectedInvoice(null); setSelectedInvoiceItems([]); setInvoiceSearch('') }}
                  className="p-1 text-[#6B7280] hover:text-red-400"
                >
                  <X size={16} />
                </button>
              </div>
            )}
          </div>

          {/* Step 2: Reason */}
          <div>
            <label className="block text-sm font-semibold text-[#F0F2F5] mb-2">
              2. Motivo de la nota de credito *
            </label>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
              {[
                { value: 'devolucion', label: 'Devolucion' },
                { value: 'error_facturacion', label: 'Error de facturacion' },
                { value: 'descuento_posterior', label: 'Descuento posterior' },
                { value: 'anulacion', label: 'Anulacion total' },
                { value: 'otro', label: 'Otro' },
              ].map(opt => (
                <button
                  key={opt.value}
                  onClick={() => setCreditReason(opt.value)}
                  className={`px-3 py-2.5 rounded-lg border text-sm text-left transition-all ${
                    creditReason === opt.value
                      ? 'border-[#FF6600] bg-[#FF6600]/10 text-[#FF6600]'
                      : 'border-[#1E2330] bg-[#0F1218] text-[#9CA3AF] hover:border-[#2A3040]'
                  }`}
                >
                  {opt.label}
                </button>
              ))}
            </div>
            {creditReason === 'otro' && (
              <Input
                label="Especifica el motivo"
                value={creditReasonCustom}
                onChange={e => setCreditReasonCustom(e.target.value)}
                placeholder="Describe el motivo..."
                className="mt-3"
              />
            )}
          </div>

          {/* Step 3: Items (editable quantities for partial credit) */}
          {selectedInvoice && selectedInvoiceItems.length > 0 && (
            <div>
              <label className="block text-sm font-semibold text-[#F0F2F5] mb-2">
                3. Items a acreditar (ajusta cantidades para credito parcial)
              </label>
              <div className="rounded-lg border border-[#1E2330] overflow-hidden">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-[#0F1218] text-[#6B7280] text-xs">
                      <th className="text-center px-3 py-2 font-medium w-[50px]">Incluir</th>
                      <th className="text-left px-3 py-2 font-medium">Descripcion</th>
                      <th className="text-right px-3 py-2 font-medium w-[80px]">Cant. orig.</th>
                      <th className="text-right px-3 py-2 font-medium w-[90px]">Cant. NC</th>
                      <th className="text-right px-3 py-2 font-medium w-[100px]">Precio</th>
                      <th className="text-right px-3 py-2 font-medium w-[60px]">Dto%</th>
                      <th className="text-right px-3 py-2 font-medium w-[110px]">Subtotal NC</th>
                    </tr>
                  </thead>
                  <tbody>
                    {selectedInvoiceItems.map((item, i) => (
                      <tr key={item.id} className="border-t border-[#1E2330]/50">
                        <td className="px-3 py-2 text-center">
                          <button
                            onClick={() => {
                              const updated = [...selectedInvoiceItems]
                              updated[i] = { ...updated[i], include: !updated[i].include }
                              setSelectedInvoiceItems(updated)
                            }}
                            className="text-[#6B7280] hover:text-[#FF6600] transition-colors"
                          >
                            {item.include ? <CheckSquare size={18} className="text-[#FF6600]" /> : <Square size={18} />}
                          </button>
                        </td>
                        <td className="px-3 py-2 text-[#F0F2F5] text-xs">{item.description}</td>
                        <td className="px-3 py-2 text-right text-[#6B7280] text-xs">{item.max_qty}</td>
                        <td className="px-2 py-1.5">
                          <input
                            type="number"
                            min={0}
                            max={item.max_qty}
                            className="w-full h-7 rounded bg-[#1E2330] border border-[#2A3040] px-2 text-xs text-[#F0F2F5] text-right disabled:opacity-40"
                            value={item.quantity}
                            disabled={!item.include}
                            onChange={e => {
                              const updated = [...selectedInvoiceItems]
                              updated[i] = { ...updated[i], quantity: Math.min(Number(e.target.value), item.max_qty) }
                              setSelectedInvoiceItems(updated)
                            }}
                          />
                        </td>
                        <td className="px-3 py-2 text-right text-[#F0F2F5] text-xs">{formatCurrency(item.unit_price)}</td>
                        <td className="px-3 py-2 text-right text-[#6B7280] text-xs">{item.discount_pct}%</td>
                        <td className="px-3 py-2 text-right font-medium text-xs">
                          {item.include ? (
                            <span className="text-red-400">
                              -{formatCurrency(item.quantity * item.unit_price * (1 - (item.discount_pct || 0) / 100))}
                            </span>
                          ) : (
                            <span className="text-[#4B5563]">-</span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>

                {/* Totals row */}
                <div className="px-4 py-3 border-t border-[#1E2330] bg-[#0F1218] flex justify-end">
                  <div className="w-64 space-y-1 text-sm">
                    <div className="flex justify-between text-[#9CA3AF]">
                      <span>Subtotal NC:</span>
                      <span className="text-red-400 font-medium">
                        -{formatCurrency(
                          selectedInvoiceItems
                            .filter(it => it.include)
                            .reduce((s, it) => s + it.quantity * it.unit_price * (1 - (it.discount_pct || 0) / 100), 0)
                        )}
                      </span>
                    </div>
                    <div className="flex justify-between text-[#9CA3AF]">
                      <span>IVA {(selectedInvoice.tax_pct as number) || 21}%:</span>
                      <span className="text-red-400">
                        -{formatCurrency(
                          selectedInvoiceItems
                            .filter(it => it.include)
                            .reduce((s, it) => s + it.quantity * it.unit_price * (1 - (it.discount_pct || 0) / 100), 0) *
                          (((selectedInvoice.tax_pct as number) || 21) / 100)
                        )}
                      </span>
                    </div>
                    <div className="flex justify-between border-t border-[#1E2330] pt-2">
                      <span className="font-semibold text-[#F0F2F5]">Total NC:</span>
                      <span className="font-bold text-red-400 text-lg">
                        -{formatCurrency(
                          (() => {
                            const sub = selectedInvoiceItems
                              .filter(it => it.include)
                              .reduce((s, it) => s + it.quantity * it.unit_price * (1 - (it.discount_pct || 0) / 100), 0)
                            return sub + sub * (((selectedInvoice.tax_pct as number) || 21) / 100)
                          })()
                        )}
                      </span>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* No items message */}
          {selectedInvoice && selectedInvoiceItems.length === 0 && (
            <div className="p-4 rounded-lg bg-[#0F1218] border border-[#1E2330] text-center">
              <AlertTriangle size={20} className="mx-auto text-amber-400 mb-2" />
              <p className="text-sm text-[#6B7280]">
                La factura seleccionada no tiene items en tt_document_lines.
                Se creara la nota de credito por el total de la factura.
              </p>
            </div>
          )}

          {/* Actions */}
          <div className="flex justify-end gap-3 pt-4 border-t border-[#1E2330]">
            <Button variant="secondary" onClick={() => { setShowCreate(false); resetCreateForm() }}>
              Cancelar
            </Button>
            <Button
              variant="primary"
              onClick={handleCreateCreditNote}
              loading={saving}
              disabled={!selectedInvoice || !creditReason}
            >
              <Save size={14} /> Crear nota de credito
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  )
}

// ===============================================================
// MAIN PAGE
