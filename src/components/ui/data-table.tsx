'use client'

import { useState, useMemo, useCallback, useRef, useEffect } from 'react'
import { cn } from '@/lib/utils'
import {
  ChevronUp, ChevronDown, ChevronsUpDown, Settings2,
  ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight,
  Search, Plus, Printer, Check, Loader2, X
} from 'lucide-react'
import { ExportButton } from './export-button'

// ----------------------------------------------------------------
// Types
// ----------------------------------------------------------------
export interface DataTableColumn {
  key: string
  label: string
  sortable?: boolean
  searchable?: boolean
  type?: 'text' | 'number' | 'date' | 'status' | 'currency'
  width?: string
  defaultVisible?: boolean
  render?: (value: unknown, row: Record<string, unknown>) => React.ReactNode
}

export interface DataTableProps {
  data: Record<string, unknown>[]
  columns: DataTableColumn[]
  loading?: boolean
  pageSize?: number
  totalLabel?: string
  showTotals?: boolean
  onRowClick?: (row: Record<string, unknown>) => void
  onNewClick?: () => void
  newLabel?: string
  exportFilename?: string
  exportTargetTable?: string
  /** Extra actions in the top bar */
  actions?: {
    label: string
    icon?: React.ReactNode
    onClick: () => void
  }[]
}

// ----------------------------------------------------------------
// Status badges
// ----------------------------------------------------------------
const STATUS_COLORS: Record<string, { bg: string; text: string }> = {
  cerrado: { bg: 'rgba(16,185,129,0.15)', text: '#10B981' },
  cerrada: { bg: 'rgba(16,185,129,0.15)', text: '#10B981' },
  completado: { bg: 'rgba(16,185,129,0.15)', text: '#10B981' },
  completada: { bg: 'rgba(16,185,129,0.15)', text: '#10B981' },
  cobrada: { bg: 'rgba(16,185,129,0.15)', text: '#10B981' },
  pagada: { bg: 'rgba(16,185,129,0.15)', text: '#10B981' },
  pagado: { bg: 'rgba(16,185,129,0.15)', text: '#10B981' },
  aceptada: { bg: 'rgba(16,185,129,0.15)', text: '#10B981' },
  aceptado: { bg: 'rgba(16,185,129,0.15)', text: '#10B981' },
  entregado: { bg: 'rgba(16,185,129,0.15)', text: '#10B981' },
  entregada: { bg: 'rgba(16,185,129,0.15)', text: '#10B981' },
  recibida: { bg: 'rgba(16,185,129,0.15)', text: '#10B981' },
  completa: { bg: 'rgba(16,185,129,0.15)', text: '#10B981' },
  pendiente: { bg: 'rgba(245,158,11,0.15)', text: '#F59E0B' },
  abierto: { bg: 'rgba(59,130,246,0.15)', text: '#3B82F6' },
  abierta: { bg: 'rgba(59,130,246,0.15)', text: '#3B82F6' },
  facturado: { bg: 'rgba(99,102,241,0.15)', text: '#6366F1' },
  facturada: { bg: 'rgba(99,102,241,0.15)', text: '#6366F1' },
  borrador: { bg: 'rgba(107,114,128,0.15)', text: '#6B7280' },
  enviada: { bg: 'rgba(59,130,246,0.15)', text: '#3B82F6' },
  enviado: { bg: 'rgba(59,130,246,0.15)', text: '#3B82F6' },
  parcial: { bg: 'rgba(249,115,22,0.15)', text: '#F97316' },
  'pago parcial': { bg: 'rgba(249,115,22,0.15)', text: '#F97316' },
  'entrega parcial': { bg: 'rgba(249,115,22,0.15)', text: '#F97316' },
  'facturacion parcial': { bg: 'rgba(249,115,22,0.15)', text: '#F97316' },
  cancelado: { bg: 'rgba(239,68,68,0.15)', text: '#EF4444' },
  cancelada: { bg: 'rgba(239,68,68,0.15)', text: '#EF4444' },
  rechazada: { bg: 'rgba(239,68,68,0.15)', text: '#EF4444' },
  rechazado: { bg: 'rgba(239,68,68,0.15)', text: '#EF4444' },
  vencida: { bg: 'rgba(239,68,68,0.15)', text: '#EF4444' },
  'vence pronto': { bg: 'rgba(249,115,22,0.15)', text: '#F97316' },
}

function StatusBadge({ label }: { label: string }) {
  const key = label.toLowerCase().trim()
  const c = STATUS_COLORS[key] || { bg: 'rgba(107,114,128,0.15)', text: '#6B7280' }
  return (
    <span
      className="inline-block px-2.5 py-0.5 rounded-full text-[10px] font-bold whitespace-nowrap"
      style={{ background: c.bg, color: c.text }}
    >
      {label.toUpperCase()}
    </span>
  )
}

// ----------------------------------------------------------------
// Period filter options
// ----------------------------------------------------------------
const PERIOD_OPTIONS = [
  { value: 'all', label: 'Todos' },
  { value: '30d', label: 'Ultimos 30 dias' },
  { value: '3m', label: 'Ultimos 3 meses' },
  { value: '6m', label: 'Ultimos 6 meses' },
  { value: 'year', label: 'Este anio' },
  { value: 'last_year', label: 'Anio pasado' },
]

function getPeriodRange(period: string): { from: Date | null; to: Date | null } {
  const now = new Date()
  switch (period) {
    case '30d': {
      const from = new Date(now)
      from.setDate(from.getDate() - 30)
      return { from, to: now }
    }
    case '3m': {
      const from = new Date(now)
      from.setMonth(from.getMonth() - 3)
      return { from, to: now }
    }
    case '6m': {
      const from = new Date(now)
      from.setMonth(from.getMonth() - 6)
      return { from, to: now }
    }
    case 'year': {
      return { from: new Date(now.getFullYear(), 0, 1), to: now }
    }
    case 'last_year': {
      return { from: new Date(now.getFullYear() - 1, 0, 1), to: new Date(now.getFullYear() - 1, 11, 31) }
    }
    default:
      return { from: null, to: null }
  }
}

// ----------------------------------------------------------------
// Helpers
// ----------------------------------------------------------------
function formatCellValue(value: unknown, type?: string): string {
  if (value === null || value === undefined) return ''
  if (type === 'currency' && typeof value === 'number') {
    return new Intl.NumberFormat('es-ES', { style: 'currency', currency: 'EUR', minimumFractionDigits: 2 }).format(value)
  }
  if (type === 'date' && typeof value === 'string') {
    try {
      const d = new Date(value)
      return d.toLocaleDateString('es-ES', { day: '2-digit', month: '2-digit', year: 'numeric' })
    } catch { return String(value) }
  }
  if (type === 'number' && typeof value === 'number') {
    return new Intl.NumberFormat('es-ES', { minimumFractionDigits: 2 }).format(value)
  }
  return String(value)
}

function parseDate(v: unknown): Date | null {
  if (!v) return null
  if (v instanceof Date) return v
  if (typeof v === 'string') {
    const d = new Date(v)
    return isNaN(d.getTime()) ? null : d
  }
  return null
}

// ----------------------------------------------------------------
// DataTable Component
// ----------------------------------------------------------------
export function DataTable({
  data,
  columns,
  loading = false,
  pageSize = 25,
  totalLabel = 'registros',
  showTotals = false,
  onRowClick,
  onNewClick,
  newLabel = 'Nuevo',
  exportFilename,
  exportTargetTable,
  actions,
}: DataTableProps) {
  // Column visibility
  const [visibleCols, setVisibleCols] = useState<Set<string>>(() => {
    const set = new Set<string>()
    columns.forEach(c => {
      if (c.defaultVisible !== false) set.add(c.key)
    })
    return set
  })
  const [showColMenu, setShowColMenu] = useState(false)
  const colMenuRef = useRef<HTMLDivElement>(null)

  // Per-column search
  const [colSearches, setColSearches] = useState<Record<string, string>>({})

  // Sorting
  const [sortKey, setSortKey] = useState<string | null>(null)
  const [sortDir, setSortDir] = useState<'asc' | 'desc' | null>(null)

  // Period filter
  const [period, setPeriod] = useState('all')

  // Pagination
  const [currentPage, setCurrentPage] = useState(0)

  // Checkbox selection
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())

  // Close column menu on outside click
  useEffect(() => {
    function handle(e: MouseEvent) {
      if (colMenuRef.current && !colMenuRef.current.contains(e.target as Node)) {
        setShowColMenu(false)
      }
    }
    if (showColMenu) document.addEventListener('mousedown', handle)
    return () => document.removeEventListener('mousedown', handle)
  }, [showColMenu])

  // Reset page when data/filters change
  useEffect(() => { setCurrentPage(0) }, [data, colSearches, sortKey, sortDir, period])

  // Visible columns list
  const activeColumns = useMemo(() => columns.filter(c => visibleCols.has(c.key)), [columns, visibleCols])

  // Detect date column for period filter
  const dateCol = useMemo(() => columns.find(c => c.type === 'date')?.key || 'fecha', [columns])

  // ---- Filtering pipeline ----
  const filtered = useMemo(() => {
    let result = [...data]

    // Period filter
    if (period !== 'all') {
      const { from, to } = getPeriodRange(period)
      if (from && to) {
        result = result.filter(row => {
          const d = parseDate(row[dateCol])
          return d && d >= from && d <= to
        })
      }
    }

    // Per-column search
    for (const [key, term] of Object.entries(colSearches)) {
      if (!term.trim()) continue
      const lower = term.trim().toLowerCase()
      result = result.filter(row => {
        const raw = row[key]
        const str = String(raw ?? '').toLowerCase()
        return str.includes(lower)
      })
    }

    return result
  }, [data, period, dateCol, colSearches])

  // ---- Sorting ----
  const sorted = useMemo(() => {
    if (!sortKey || !sortDir) return filtered
    const col = columns.find(c => c.key === sortKey)
    return [...filtered].sort((a, b) => {
      const va = a[sortKey]
      const vb = b[sortKey]
      let cmp = 0
      if (col?.type === 'currency' || col?.type === 'number') {
        cmp = (Number(va) || 0) - (Number(vb) || 0)
      } else if (col?.type === 'date') {
        const da = parseDate(va)
        const db = parseDate(vb)
        cmp = (da?.getTime() || 0) - (db?.getTime() || 0)
      } else {
        cmp = String(va ?? '').localeCompare(String(vb ?? ''), 'es')
      }
      return sortDir === 'desc' ? -cmp : cmp
    })
  }, [filtered, sortKey, sortDir, columns])

  // ---- Pagination ----
  const totalPages = Math.max(1, Math.ceil(sorted.length / pageSize))
  const pageData = useMemo(() => sorted.slice(currentPage * pageSize, (currentPage + 1) * pageSize), [sorted, currentPage, pageSize])

  // ---- Totals ----
  const totals = useMemo(() => {
    if (!showTotals) return null
    const sums: Record<string, number> = {}
    for (const col of activeColumns) {
      if (col.type === 'currency' || col.type === 'number') {
        sums[col.key] = filtered.reduce((s, row) => s + (Number(row[col.key]) || 0), 0)
      }
    }
    return sums
  }, [showTotals, filtered, activeColumns])

  // ---- Handlers ----
  const toggleSort = useCallback((key: string) => {
    if (sortKey === key) {
      if (sortDir === 'asc') setSortDir('desc')
      else if (sortDir === 'desc') { setSortKey(null); setSortDir(null) }
      else setSortDir('asc')
    } else {
      setSortKey(key)
      setSortDir('asc')
    }
  }, [sortKey, sortDir])

  const toggleCol = (key: string) => {
    setVisibleCols(prev => {
      const next = new Set(prev)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })
  }

  const toggleSelectAll = () => {
    if (selectedIds.size === pageData.length) {
      setSelectedIds(new Set())
    } else {
      setSelectedIds(new Set(pageData.map(r => String(r.id ?? r.referencia ?? ''))))
    }
  }

  const toggleSelect = (id: string) => {
    setSelectedIds(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const isAllSelected = pageData.length > 0 && selectedIds.size === pageData.length

  // ---- Render ----
  return (
    <div className="space-y-0">
      {/* Top toolbar */}
      <div className="flex items-center justify-between gap-3 mb-3 flex-wrap">
        <div className="flex items-center gap-2">
          {onNewClick && (
            <button
              onClick={onNewClick}
              className="flex items-center gap-1.5 px-4 py-2 text-sm font-semibold text-white bg-[#FF6600] rounded-lg hover:bg-[#E55C00] transition-colors"
            >
              <Plus size={16} /> {newLabel}
            </button>
          )}
          {actions?.map((a, i) => (
            <button
              key={i}
              onClick={a.onClick}
              className="flex items-center gap-1.5 px-3 py-2 text-sm text-[#9CA3AF] bg-[#141820] border border-[#2A3040] rounded-lg hover:text-[#F0F2F5] hover:border-[#3A4050] transition-colors"
            >
              {a.icon}
              {a.label}
            </button>
          ))}
        </div>

        <div className="flex items-center gap-2">
          {/* Period filter */}
          <select
            value={period}
            onChange={(e) => setPeriod(e.target.value)}
            className="px-3 py-2 text-xs bg-[#141820] border border-[#2A3040] rounded-lg text-[#9CA3AF] focus:outline-none focus:border-[#FF6600] transition-colors"
          >
            {PERIOD_OPTIONS.map(o => (
              <option key={o.value} value={o.value}>{o.label}</option>
            ))}
          </select>

          {/* Export */}
          {exportFilename && (
            <ExportButton
              data={filtered as Record<string, unknown>[]}
              filename={exportFilename}
              targetTable={exportTargetTable}
              columns={activeColumns.map(c => ({ key: c.key, label: c.label }))}
            />
          )}

          {/* Column visibility toggle */}
          <div className="relative" ref={colMenuRef}>
            <button
              onClick={() => setShowColMenu(!showColMenu)}
              className={cn(
                'flex items-center gap-1.5 px-3 py-2 text-xs border rounded-lg transition-colors',
                showColMenu
                  ? 'bg-[#1C2230] border-[#FF6600] text-[#FF6600]'
                  : 'bg-[#141820] border-[#2A3040] text-[#9CA3AF] hover:text-[#F0F2F5] hover:border-[#3A4050]'
              )}
            >
              <Settings2 size={14} />
              Columnas
            </button>
            {showColMenu && (
              <div className="absolute right-0 top-full mt-1 z-50 bg-[#1C2230] border border-[#2A3040] rounded-lg shadow-2xl w-56 max-h-80 overflow-y-auto py-1">
                <div className="px-3 py-2 border-b border-[#2A3040]">
                  <p className="text-[10px] font-bold text-[#6B7280] uppercase tracking-wider">Columnas visibles</p>
                </div>
                {columns.map(c => (
                  <button
                    key={c.key}
                    onClick={() => toggleCol(c.key)}
                    className="w-full flex items-center gap-2.5 px-3 py-2 text-sm text-[#D1D5DB] hover:bg-[#2A3040] transition-colors"
                  >
                    <div className={cn(
                      'w-4 h-4 rounded border flex items-center justify-center transition-colors',
                      visibleCols.has(c.key)
                        ? 'bg-[#FF6600] border-[#FF6600]'
                        : 'border-[#4B5563]'
                    )}>
                      {visibleCols.has(c.key) && <Check size={10} className="text-white" />}
                    </div>
                    {c.label}
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Table */}
      <div className="rounded-xl border border-[#1E2330] overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            {/* Header */}
            <thead>
              <tr className="bg-[#1C2230]">
                {/* Checkbox col */}
                <th className="w-10 px-3 py-3">
                  <div
                    onClick={toggleSelectAll}
                    className={cn(
                      'w-4 h-4 rounded border cursor-pointer flex items-center justify-center transition-colors',
                      isAllSelected ? 'bg-[#FF6600] border-[#FF6600]' : 'border-[#4B5563] hover:border-[#6B7280]'
                    )}
                  >
                    {isAllSelected && <Check size={10} className="text-white" />}
                  </div>
                </th>
                {activeColumns.map(col => (
                  <th
                    key={col.key}
                    className={cn(
                      'px-3 py-3 text-left text-[10px] font-bold text-[#6B7280] uppercase tracking-wider select-none',
                      col.sortable && 'cursor-pointer hover:text-[#FF6600] transition-colors'
                    )}
                    style={{ width: col.width }}
                    onClick={() => col.sortable && toggleSort(col.key)}
                  >
                    <div className="flex items-center gap-1">
                      <span className={cn(sortKey === col.key && 'text-[#FF6600]')}>{col.label}</span>
                      {col.sortable && (
                        <span className="inline-flex flex-col">
                          {sortKey === col.key ? (
                            sortDir === 'asc' ? <ChevronUp size={12} className="text-[#FF6600]" /> : <ChevronDown size={12} className="text-[#FF6600]" />
                          ) : (
                            <ChevronsUpDown size={12} className="text-[#4B5563]" />
                          )}
                        </span>
                      )}
                    </div>
                  </th>
                ))}
              </tr>
              {/* Search row */}
              <tr className="bg-[#141820] border-b border-[#1E2330]">
                <td className="px-3 py-1" />
                {activeColumns.map(col => (
                  <td key={col.key} className="px-3 py-1">
                    {col.searchable ? (
                      <div className="relative">
                        <Search size={10} className="absolute left-1.5 top-1/2 -translate-y-1/2 text-[#4B5563]" />
                        <input
                          type="text"
                          value={colSearches[col.key] || ''}
                          onChange={(e) => setColSearches(prev => ({ ...prev, [col.key]: e.target.value }))}
                          placeholder=""
                          className="w-full pl-5 pr-1 py-1 text-[10px] bg-transparent border-b border-[#1E2330] text-[#D1D5DB] placeholder-[#4B5563] focus:outline-none focus:border-[#FF6600] transition-colors"
                        />
                        {colSearches[col.key] && (
                          <button
                            onClick={() => setColSearches(prev => ({ ...prev, [col.key]: '' }))}
                            className="absolute right-0.5 top-1/2 -translate-y-1/2 text-[#4B5563] hover:text-[#9CA3AF]"
                          >
                            <X size={8} />
                          </button>
                        )}
                      </div>
                    ) : (
                      <div className="h-5" />
                    )}
                  </td>
                ))}
              </tr>
            </thead>

            {/* Body */}
            <tbody className="divide-y divide-[#1E2330]">
              {loading ? (
                <tr>
                  <td colSpan={activeColumns.length + 1} className="py-20 text-center">
                    <Loader2 className="animate-spin text-[#FF6600] mx-auto" size={28} />
                  </td>
                </tr>
              ) : pageData.length === 0 ? (
                <tr>
                  <td colSpan={activeColumns.length + 1} className="py-16 text-center text-[#6B7280] text-sm">
                    No hay {totalLabel}
                  </td>
                </tr>
              ) : (
                pageData.map((row, ri) => {
                  const rowId = String(row.id ?? row.referencia ?? ri)
                  const isSelected = selectedIds.has(rowId)
                  return (
                    <tr
                      key={rowId}
                      className={cn(
                        'transition-colors',
                        isSelected ? 'bg-[#FF6600]/5' : 'hover:bg-[#1A1F2E]',
                        onRowClick && 'cursor-pointer'
                      )}
                      onClick={() => onRowClick?.(row)}
                    >
                      {/* Checkbox */}
                      <td className="w-10 px-3 py-2.5" onClick={(e) => e.stopPropagation()}>
                        <div
                          onClick={() => toggleSelect(rowId)}
                          className={cn(
                            'w-4 h-4 rounded border cursor-pointer flex items-center justify-center transition-colors',
                            isSelected ? 'bg-[#FF6600] border-[#FF6600]' : 'border-[#4B5563] hover:border-[#6B7280]'
                          )}
                        >
                          {isSelected && <Check size={10} className="text-white" />}
                        </div>
                      </td>
                      {activeColumns.map(col => {
                        const val = row[col.key]
                        return (
                          <td
                            key={col.key}
                            className={cn(
                              'px-3 py-2.5',
                              (col.type === 'currency' || col.type === 'number') && 'text-right font-mono',
                              col.type === 'currency' && 'text-[#FF6600] font-semibold'
                            )}
                          >
                            {col.render ? (
                              col.render(val, row)
                            ) : col.type === 'status' ? (
                              <StatusBadge label={String(val ?? '')} />
                            ) : (
                              <span className="text-[#D1D5DB] text-xs">
                                {formatCellValue(val, col.type)}
                              </span>
                            )}
                          </td>
                        )
                      })}
                    </tr>
                  )
                })
              )}
            </tbody>

            {/* Totals row */}
            {showTotals && totals && !loading && pageData.length > 0 && (
              <tfoot>
                <tr className="bg-[#0F1218] border-t-2 border-[#2A3040]">
                  <td className="px-3 py-3" />
                  {activeColumns.map((col, i) => (
                    <td
                      key={col.key}
                      className={cn(
                        'px-3 py-3 text-xs font-bold',
                        (col.type === 'currency' || col.type === 'number') ? 'text-right font-mono text-[#FF6600]' : 'text-[#6B7280]'
                      )}
                    >
                      {i === 0 && !(col.type === 'currency' || col.type === 'number') && (
                        <span className="uppercase text-[10px]">Total ({filtered.length})</span>
                      )}
                      {totals[col.key] !== undefined && formatCellValue(totals[col.key], col.type)}
                    </td>
                  ))}
                </tr>
              </tfoot>
            )}
          </table>
        </div>
      </div>

      {/* Pagination */}
      {!loading && sorted.length > 0 && (
        <div className="flex items-center justify-between mt-3 px-1">
          <span className="text-xs text-[#6B7280]">
            Mostrando {currentPage * pageSize + 1} a {Math.min((currentPage + 1) * pageSize, sorted.length)} de {sorted.length} {totalLabel}
          </span>
          <div className="flex items-center gap-1">
            <button
              onClick={() => setCurrentPage(0)}
              disabled={currentPage === 0}
              className="p-1.5 rounded text-[#6B7280] hover:text-[#F0F2F5] disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
              title="Primera"
            >
              <ChevronsLeft size={14} />
            </button>
            <button
              onClick={() => setCurrentPage(p => Math.max(0, p - 1))}
              disabled={currentPage === 0}
              className="p-1.5 rounded text-[#6B7280] hover:text-[#F0F2F5] disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
              title="Anterior"
            >
              <ChevronLeft size={14} />
            </button>
            {/* Page numbers */}
            {Array.from({ length: Math.min(totalPages, 5) }, (_, i) => {
              let pg: number
              if (totalPages <= 5) {
                pg = i
              } else if (currentPage < 3) {
                pg = i
              } else if (currentPage > totalPages - 4) {
                pg = totalPages - 5 + i
              } else {
                pg = currentPage - 2 + i
              }
              return (
                <button
                  key={pg}
                  onClick={() => setCurrentPage(pg)}
                  className={cn(
                    'w-7 h-7 rounded text-xs font-medium transition-colors',
                    pg === currentPage
                      ? 'bg-[#FF6600] text-white'
                      : 'text-[#6B7280] hover:text-[#F0F2F5] hover:bg-[#1C2230]'
                  )}
                >
                  {pg + 1}
                </button>
              )
            })}
            <button
              onClick={() => setCurrentPage(p => Math.min(totalPages - 1, p + 1))}
              disabled={currentPage >= totalPages - 1}
              className="p-1.5 rounded text-[#6B7280] hover:text-[#F0F2F5] disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
              title="Siguiente"
            >
              <ChevronRight size={14} />
            </button>
            <button
              onClick={() => setCurrentPage(totalPages - 1)}
              disabled={currentPage >= totalPages - 1}
              className="p-1.5 rounded text-[#6B7280] hover:text-[#F0F2F5] disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
              title="Ultima"
            >
              <ChevronsRight size={14} />
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
