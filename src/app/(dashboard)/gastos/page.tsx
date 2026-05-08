'use client'

import { useState, useEffect, useCallback, useMemo } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useCompanyContext } from '@/lib/company-context'
import { Card } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Select } from '@/components/ui/select'
import { Modal } from '@/components/ui/modal'
import { Input } from '@/components/ui/input'
import { ReceiptScanner } from '@/components/ai/receipt-scanner'
import { DocumentProcessBar } from '@/components/workflow/document-process-bar'
import { buildSteps } from '@/lib/workflow-definitions'
import { Receipt, Plus, X, ScanLine, List, RefreshCw, Filter, CheckSquare, Edit3, Save, Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { useToast } from '@/components/ui/toast'

// ===============================================================
// EXPENSE TYPE DEFINITIONS
// ===============================================================
const EXPENSE_TYPES = [
  { value: 'ticket', label: 'Ticket', description: 'Sin impuestos' },
  { value: 'factura_gasto', label: 'Factura gasto', description: 'Con impuestos, deducible' },
  { value: 'inversion', label: 'Inversion', description: 'Con impuestos, amortizable' },
  { value: 'nomina', label: 'Nomina', description: 'Personal' },
  { value: 'alquiler', label: 'Alquiler', description: 'Local/oficina' },
  { value: 'suministro', label: 'Suministro', description: 'Luz, agua, internet' },
  { value: 'viaje', label: 'Viaje', description: 'Desplazamientos' },
  { value: 'otro', label: 'Otro', description: '' },
] as const

type ExpenseType = typeof EXPENSE_TYPES[number]['value']

const EXPENSE_TYPE_COLORS: Record<string, { bg: string; text: string; border: string }> = {
  ticket: { bg: 'bg-slate-500/10', text: 'text-slate-400', border: 'border-slate-500/20' },
  factura_gasto: { bg: 'bg-blue-500/10', text: 'text-blue-400', border: 'border-blue-500/20' },
  inversion: { bg: 'bg-purple-500/10', text: 'text-purple-400', border: 'border-purple-500/20' },
  nomina: { bg: 'bg-emerald-500/10', text: 'text-emerald-400', border: 'border-emerald-500/20' },
  alquiler: { bg: 'bg-amber-500/10', text: 'text-amber-400', border: 'border-amber-500/20' },
  suministro: { bg: 'bg-cyan-500/10', text: 'text-cyan-400', border: 'border-cyan-500/20' },
  viaje: { bg: 'bg-rose-500/10', text: 'text-rose-400', border: 'border-rose-500/20' },
  otro: { bg: 'bg-gray-500/10', text: 'text-gray-400', border: 'border-gray-500/20' },
}

function ExpenseTypeBadge({ type }: { type: string | null }) {
  if (!type) return null
  const colors = EXPENSE_TYPE_COLORS[type] || EXPENSE_TYPE_COLORS.otro
  const label = EXPENSE_TYPES.find(t => t.value === type)?.label || type
  return (
    <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-medium ${colors.bg} ${colors.text} ${colors.border}`}>
      {label}
    </span>
  )
}

interface GastoDoc {
  id: string
  description: string | null
  total: number | null
  subtotal: number | null
  tax_amount: number | null
  invoice_date: string | null
  number: string | null
  status: string
  currency: string | null
  created_at: string
  expense_type: string | null
  tax_deductible: boolean | null
  expense_category: string | null
  ocr_extracted_data: {
    proveedor?: string | null
    tipo_comprobante?: string | null
    cuit_emisor?: string | null
  } | null
}

export default function GastosPage() {
  const { activeCompany, activeCompanyIds } = useCompanyContext()
  const { addToast } = useToast()

  const [gastos, setGastos] = useState<GastoDoc[]>([])
  const [loading, setLoading] = useState(true)
  const [showScanner, setShowScanner] = useState(false)
  const [view, setView] = useState<'list' | 'scanner'>('list')
  const [typeFilter, setTypeFilter] = useState('')
  const [editingGasto, setEditingGasto] = useState<GastoDoc | null>(null)
  const [editData, setEditData] = useState<{
    expense_type: string
    tax_deductible: boolean
    description: string
  }>({ expense_type: '', tax_deductible: false, description: '' })
  const [saving, setSaving] = useState(false)

  const loadGastos = useCallback(async () => {
    if (activeCompanyIds.length === 0) return
    setLoading(true)
    const sb = createClient()
    const { data } = await sb
      .from('tt_documents')
      .select('id, description, total, subtotal, tax_amount, invoice_date, number, status, currency, created_at, ocr_extracted_data, expense_type, tax_deductible, expense_category')
      .in('company_id', activeCompanyIds)
      .eq('doc_type', 'gasto')
      .order('created_at', { ascending: false })
      .limit(100)

    setGastos((data as GastoDoc[] | null) || [])
    setLoading(false)
  }, [activeCompanyIds])

  useEffect(() => { void loadGastos() }, [loadGastos])

  // Filtered gastos
  const filteredGastos = useMemo(() => {
    if (!typeFilter) return gastos
    return gastos.filter(g => g.expense_type === typeFilter)
  }, [gastos, typeFilter])

  const totalMes = filteredGastos.reduce((s, g) => {
    const now = new Date()
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString()
    if (g.invoice_date && g.invoice_date >= monthStart) return s + Number(g.total || 0)
    return s
  }, 0)

  const deduciblesMes = filteredGastos.reduce((s, g) => {
    const now = new Date()
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString()
    if (g.invoice_date && g.invoice_date >= monthStart && g.tax_deductible) return s + Number(g.total || 0)
    return s
  }, 0)

  const fmt = (v: number | null | undefined, cur = 'ARS') => {
    if (!v && v !== 0) return '--'
    return `${cur === 'EUR' ? '\u20AC' : '$'}${Number(v).toLocaleString('es-AR', { maximumFractionDigits: 2 })}`
  }

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'borrador': return <Badge variant="default">Borrador</Badge>
      case 'aprobado': return <Badge variant="success">Aprobado</Badge>
      case 'rechazado': return <Badge variant="danger">Rechazado</Badge>
      default: return <Badge variant="default">{status}</Badge>
    }
  }

  const borradores = filteredGastos.filter((g) => g.status === 'borrador').length
  const aprobados = filteredGastos.filter((g) => g.status === 'aprobado').length

  function openEdit(g: GastoDoc) {
    setEditingGasto(g)
    setEditData({
      expense_type: g.expense_type || '',
      tax_deductible: g.tax_deductible || false,
      description: g.description || '',
    })
  }

  async function handleSaveEdit() {
    if (!editingGasto) return
    setSaving(true)
    const sb = createClient()
    const { error } = await sb
      .from('tt_documents')
      .update({
        expense_type: editData.expense_type || null,
        tax_deductible: editData.tax_deductible,
        description: editData.description || null,
      })
      .eq('id', editingGasto.id)
    if (!error) {
      addToast({ type: 'success', title: 'Gasto actualizado' })
      setEditingGasto(null)
      loadGastos()
    } else {
      addToast({ type: 'error', title: 'Error', message: error.message })
    }
    setSaving(false)
  }

  return (
    <div className="space-y-4">
      {/* Barra sticky con codigo + stepper + alertas */}
      <DocumentProcessBar
        code="GASTOS"
        badge={{
          label: view === 'scanner' ? 'Escaneando' : `${filteredGastos.length} registros`,
          variant: borradores > 0 ? 'warning' : aprobados === filteredGastos.length && filteredGastos.length > 0 ? 'success' : 'info',
        }}
        entity={
          <span>
            {activeCompany?.name || 'Todas las empresas'} · Gastos y comprobantes
          </span>
        }
        alerts={[
          ...(borradores > 0 ? [{ type: 'warning' as const, message: `${borradores} gasto${borradores !== 1 ? 's' : ''} en borrador pendiente${borradores !== 1 ? 's' : ''} de aprobacion` }] : []),
          ...(gastos.length === 0 ? [{ type: 'info' as const, message: 'No hay gastos registrados -- escanea el primer comprobante' }] : []),
        ]}
        steps={buildSteps('purchase_order', 'draft')}
        actions={[
          {
            label: view === 'list' ? 'Escanear comprobante' : 'Ver listado',
            onClick: () => setView(view === 'list' ? 'scanner' : 'list'),
            icon: 'play',
            variant: 'secondary',
          },
        ]}
      />
      <div className="p-6 space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Receipt className="w-6 h-6 text-orange-400" /> Gastos
          </h1>
          <p className="text-sm text-[#9CA3AF]">
            {activeCompany?.name || 'Todas las empresas'} · Carga tickets y facturas con OCR
          </p>
        </div>
        <div className="flex gap-2">
          <Button
            variant="secondary"
            size="sm"
            onClick={() => setView(view === 'list' ? 'scanner' : 'list')}
          >
            {view === 'list' ? (
              <><ScanLine className="w-4 h-4" /> Escanear comprobante</>
            ) : (
              <><List className="w-4 h-4" /> Ver listado</>
            )}
          </Button>
          <Button
            variant="ghost"
            size="icon"
            onClick={loadGastos}
            disabled={loading}
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          </Button>
        </div>
      </div>

      {/* KPI */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <Card className="p-4">
          <div className="text-[10px] text-[#9CA3AF] uppercase font-bold mb-1">Gastos este mes</div>
          <div className="text-2xl font-bold text-orange-400">{fmt(totalMes)}</div>
        </Card>
        <Card className="p-4">
          <div className="text-[10px] text-[#9CA3AF] uppercase font-bold mb-1">Total registros</div>
          <div className="text-2xl font-bold text-[#F0F2F5]">{filteredGastos.length}</div>
        </Card>
        <Card className="p-4">
          <div className="text-[10px] text-[#9CA3AF] uppercase font-bold mb-1">Borradores</div>
          <div className="text-2xl font-bold text-amber-400">{borradores}</div>
        </Card>
        <Card className="p-4">
          <div className="text-[10px] text-[#9CA3AF] uppercase font-bold mb-1">Deducibles este mes</div>
          <div className="text-2xl font-bold text-emerald-400">{fmt(deduciblesMes)}</div>
        </Card>
      </div>

      {/* Type filter */}
      {view === 'list' && (
        <div className="flex items-center gap-3">
          <Filter className="w-4 h-4 text-[#6B7280]" />
          <Select
            options={[
              { value: '', label: 'Todos los tipos' },
              ...EXPENSE_TYPES.map(t => ({ value: t.value, label: `${t.label}${t.description ? ` (${t.description})` : ''}` })),
            ]}
            value={typeFilter}
            onChange={(e) => setTypeFilter(e.target.value)}
            className="w-64"
          />
          {typeFilter && (
            <button
              onClick={() => setTypeFilter('')}
              className="text-xs text-[#6B7280] hover:text-[#F0F2F5] transition-colors flex items-center gap-1"
            >
              <X className="w-3 h-3" /> Limpiar filtro
            </button>
          )}
        </div>
      )}

      {/* Scanner view */}
      {view === 'scanner' && (
        <Card className="p-4">
          <div className="flex items-center gap-2 mb-4">
            <ScanLine className="w-5 h-5 text-orange-400" />
            <h2 className="font-semibold">Escanear comprobante con OCR</h2>
          </div>
          {activeCompany?.id ? (
            <ReceiptScanner
              companyId={activeCompany.id}
              onSaved={(docId) => {
                void loadGastos()
                setView('list')
              }}
            />
          ) : (
            <div className="text-sm text-[#9CA3AF] py-4 text-center">
              Selecciona una empresa primero
            </div>
          )}
        </Card>
      )}

      {/* List view */}
      {view === 'list' && (
        <Card className="p-0 overflow-hidden">
          <div className="px-4 py-3 border-b flex items-center justify-between" style={{ borderColor: '#2A3040' }}>
            <h2 className="font-semibold text-sm">Historial de gastos</h2>
            <span className="text-xs text-[#9CA3AF]">{filteredGastos.length} registros</span>
          </div>

          {loading ? (
            <div className="p-8 text-center text-[#9CA3AF] text-sm">Cargando gastos...</div>
          ) : filteredGastos.length === 0 ? (
            <div className="p-12 text-center space-y-3">
              <Receipt className="w-12 h-12 mx-auto text-[#2A3040]" />
              <div className="text-[#9CA3AF] text-sm">
                {typeFilter ? 'No hay gastos de este tipo' : 'No hay gastos registrados'}
              </div>
              {!typeFilter && (
                <Button variant="primary" size="sm" onClick={() => setView('scanner')}>
                  <Plus className="w-4 h-4" /> Escanear primer comprobante
                </Button>
              )}
            </div>
          ) : (
            <div className="divide-y divide-[#2A3040]">
              {filteredGastos.map((g) => (
                <div
                  key={g.id}
                  className="px-4 py-3 hover:bg-[#1E2330] transition-colors cursor-pointer"
                  onClick={() => openEdit(g)}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex-1 min-w-0">
                      <div className="font-medium text-sm text-[#F0F2F5] truncate flex items-center gap-2">
                        {g.ocr_extracted_data?.proveedor || g.description || 'Sin descripcion'}
                        <ExpenseTypeBadge type={g.expense_type} />
                        {g.tax_deductible && (
                          <span className="inline-flex items-center gap-0.5 rounded-full border px-1.5 py-0.5 text-[10px] font-medium bg-emerald-500/10 text-emerald-400 border-emerald-500/20">
                            <CheckSquare className="w-2.5 h-2.5" /> Deducible
                          </span>
                        )}
                      </div>
                      <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                        {g.ocr_extracted_data?.tipo_comprobante && (
                          <span className="text-[10px] text-[#9CA3AF]">
                            {g.ocr_extracted_data.tipo_comprobante}
                          </span>
                        )}
                        {g.number && (
                          <span className="text-[10px] text-[#9CA3AF]">#{g.number}</span>
                        )}
                        {g.invoice_date && (
                          <span className="text-[10px] text-[#9CA3AF]">
                            {new Date(g.invoice_date).toLocaleDateString('es-AR')}
                          </span>
                        )}
                        {g.ocr_extracted_data?.cuit_emisor && (
                          <span className="text-[10px] text-[#9CA3AF]">
                            CUIT: {g.ocr_extracted_data.cuit_emisor}
                          </span>
                        )}
                      </div>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      {getStatusBadge(g.status)}
                      <span className="font-bold text-sm text-orange-400">
                        {fmt(g.total, g.currency || 'ARS')}
                      </span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </Card>
      )}

      {/* EDIT MODAL */}
      <Modal isOpen={!!editingGasto} onClose={() => setEditingGasto(null)} title="Editar gasto" size="md">
        {editingGasto && (
          <div className="space-y-4">
            <div className="p-3 rounded-xl bg-[#0F1218] border border-[#1E2330]">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-[#F0F2F5]">
                    {editingGasto.ocr_extracted_data?.proveedor || editingGasto.description || 'Sin descripcion'}
                  </p>
                  <p className="text-xs text-[#6B7280]">
                    {editingGasto.number ? `#${editingGasto.number}` : ''} {editingGasto.invoice_date ? new Date(editingGasto.invoice_date).toLocaleDateString('es-AR') : ''}
                  </p>
                </div>
                <span className="font-bold text-lg text-orange-400">
                  {fmt(editingGasto.total, editingGasto.currency || 'ARS')}
                </span>
              </div>
            </div>

            <Input
              label="Descripcion"
              value={editData.description}
              onChange={(e) => setEditData(prev => ({ ...prev, description: e.target.value }))}
              placeholder="Descripcion del gasto"
            />

            <Select
              label="Tipo de gasto"
              options={[
                { value: '', label: 'Sin tipo' },
                ...EXPENSE_TYPES.map(t => ({
                  value: t.value,
                  label: `${t.label}${t.description ? ` -- ${t.description}` : ''}`,
                })),
              ]}
              value={editData.expense_type}
              onChange={(e) => setEditData(prev => ({ ...prev, expense_type: e.target.value }))}
            />

            <div className="flex items-center gap-3">
              <label className="flex items-center gap-2 cursor-pointer group">
                <input
                  type="checkbox"
                  checked={editData.tax_deductible}
                  onChange={(e) => setEditData(prev => ({ ...prev, tax_deductible: e.target.checked }))}
                  className="w-4 h-4 rounded border-[#2A3040] bg-[#1E2330] text-[#FF6600] focus:ring-[#FF6600] focus:ring-offset-0"
                />
                <span className="text-sm text-[#9CA3AF] group-hover:text-[#F0F2F5] transition-colors">
                  Deducible fiscalmente
                </span>
              </label>
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <Button variant="secondary" onClick={() => setEditingGasto(null)}>Cancelar</Button>
              <Button variant="primary" onClick={handleSaveEdit} disabled={saving}>
                {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                Guardar
              </Button>
            </div>
          </div>
        )}
      </Modal>
      </div>
    </div>
  )
}
