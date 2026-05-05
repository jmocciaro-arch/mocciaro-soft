'use client'

/**
 * Barra fija inferior para acciones masivas sobre productos.
 * Aparece cuando hay productos seleccionados en el catálogo.
 *
 * Cada acción que requiere input (markup, marca, categoría, ciclo de vida)
 * abre un mini-popover dentro de la barra.
 */

import { useState } from 'react'
import {
  CheckSquare, X, Power, PowerOff, Tag, FolderTree, GitBranch,
  Percent, Trash2, Download, ChevronUp,
} from 'lucide-react'

type LifecycleStatus = 'borrador' | 'activo' | 'descatalogado' | 'obsoleto'
type MarkupTarget = 'price_eur' | 'cost_eur' | 'price_usd' | 'price_ars'

export interface ProductBulkActionsBarProps {
  selectedIds: string[]
  onClear: () => void
  onActivate: () => void
  onDeactivate: () => void
  onChangeBrand: (brand: string) => void
  onChangeCategory: (category: string, subcategory: string | null) => void
  onChangeLifecycle: (status: LifecycleStatus) => void
  onApplyMarkup: (pct: number, target: MarkupTarget) => void
  onSoftDelete: () => void
  onExport: () => void
  brands: string[]
  categories: { name: string; subcategories: string[] }[]
}

type PopoverKind = 'brand' | 'category' | 'lifecycle' | 'markup' | null

export function ProductBulkActionsBar({
  selectedIds,
  onClear,
  onActivate,
  onDeactivate,
  onChangeBrand,
  onChangeCategory,
  onChangeLifecycle,
  onApplyMarkup,
  onSoftDelete,
  onExport,
  brands,
  categories,
}: ProductBulkActionsBarProps) {
  const [popover, setPopover] = useState<PopoverKind>(null)

  // Brand picker
  const [brandSearch, setBrandSearch] = useState('')

  // Category picker
  const [pickedCategory, setPickedCategory] = useState<string>('')

  // Markup
  const [markupPct, setMarkupPct] = useState<string>('5')
  const [markupTarget, setMarkupTarget] = useState<MarkupTarget>('price_eur')

  // Confirm soft delete
  const [confirmDelete, setConfirmDelete] = useState(false)

  if (selectedIds.length === 0) return null

  const togglePopover = (k: PopoverKind) => {
    setPopover(prev => (prev === k ? null : k))
    setConfirmDelete(false)
  }

  const filteredBrands = brandSearch
    ? brands.filter(b => b.toLowerCase().includes(brandSearch.toLowerCase()))
    : brands

  const subcategories = pickedCategory
    ? (categories.find(c => c.name === pickedCategory)?.subcategories || [])
    : []

  return (
    <div className="fixed bottom-2 left-2 right-2 sm:bottom-4 sm:left-1/2 sm:right-auto sm:-translate-x-1/2 z-50 animate-in fade-in slide-in-from-bottom-2 duration-200 max-w-[calc(100vw-1rem)] sm:max-w-none overflow-x-auto">
      <div className="relative">
        {/* Popover container (above the bar) */}
        {popover && (
          <div className="absolute bottom-full mb-2 left-1/2 -translate-x-1/2 w-[min(92vw,520px)] rounded-xl bg-[#0F1218] border border-[#FF6600]/40 shadow-2xl shadow-orange-500/10 p-4">
            {popover === 'brand' && (
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <strong className="text-sm text-[#F0F2F5]">Cambiar marca</strong>
                  <button onClick={() => setPopover(null)} className="text-[#6B7280] hover:text-[#F0F2F5]">
                    <X size={14} />
                  </button>
                </div>
                <input
                  autoFocus
                  type="text"
                  value={brandSearch}
                  onChange={e => setBrandSearch(e.target.value)}
                  placeholder="Buscar marca..."
                  className="w-full h-9 rounded-lg bg-[#1E2330] border border-[#2A3040] px-3 text-sm text-[#F0F2F5] placeholder:text-[#4B5563] focus:outline-none focus:border-[#FF6600]"
                />
                <div className="max-h-[240px] overflow-y-auto space-y-1">
                  {filteredBrands.length === 0 ? (
                    <p className="text-xs text-[#6B7280] text-center py-4">Sin marcas</p>
                  ) : (
                    filteredBrands.map(b => (
                      <button
                        key={b}
                        onClick={() => { onChangeBrand(b); setPopover(null); setBrandSearch('') }}
                        className="w-full text-left px-3 py-1.5 rounded-md text-xs text-[#F0F2F5] hover:bg-[#1E2330]"
                      >
                        {b}
                      </button>
                    ))
                  )}
                </div>
              </div>
            )}

            {popover === 'category' && (
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <strong className="text-sm text-[#F0F2F5]">Cambiar categoría</strong>
                  <button onClick={() => setPopover(null)} className="text-[#6B7280] hover:text-[#F0F2F5]">
                    <X size={14} />
                  </button>
                </div>
                <div>
                  <label className="block text-[10px] uppercase font-bold text-[#6B7280] mb-1">Categoría</label>
                  <select
                    value={pickedCategory}
                    onChange={e => setPickedCategory(e.target.value)}
                    className="w-full h-9 rounded-lg bg-[#1E2330] border border-[#2A3040] px-3 text-sm text-[#F0F2F5] focus:outline-none focus:border-[#FF6600]"
                  >
                    <option value="">— Elegí categoría —</option>
                    {categories.map(c => (
                      <option key={c.name} value={c.name}>{c.name}</option>
                    ))}
                  </select>
                </div>
                {pickedCategory && (
                  <div>
                    <label className="block text-[10px] uppercase font-bold text-[#6B7280] mb-1">
                      Subcategoría (opcional)
                    </label>
                    <div className="flex flex-wrap gap-1.5 max-h-[140px] overflow-y-auto">
                      <button
                        onClick={() => { onChangeCategory(pickedCategory, null); setPopover(null); setPickedCategory('') }}
                        className="px-2.5 py-1 rounded-md text-xs bg-[#1E2330] border border-[#2A3040] text-[#9CA3AF] hover:text-[#F0F2F5]"
                      >
                        Sin subcategoría
                      </button>
                      {subcategories.map(sc => (
                        <button
                          key={sc}
                          onClick={() => { onChangeCategory(pickedCategory, sc); setPopover(null); setPickedCategory('') }}
                          className="px-2.5 py-1 rounded-md text-xs bg-[#1E2330] border border-[#2A3040] text-[#9CA3AF] hover:text-[#F0F2F5] hover:border-[#FF6600]/40"
                        >
                          {sc}
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}

            {popover === 'lifecycle' && (
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <strong className="text-sm text-[#F0F2F5]">Cambiar ciclo de vida</strong>
                  <button onClick={() => setPopover(null)} className="text-[#6B7280] hover:text-[#F0F2F5]">
                    <X size={14} />
                  </button>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  {(['borrador', 'activo', 'descatalogado', 'obsoleto'] as LifecycleStatus[]).map(s => (
                    <button
                      key={s}
                      onClick={() => { onChangeLifecycle(s); setPopover(null) }}
                      className="px-3 py-2 rounded-lg bg-[#1E2330] border border-[#2A3040] text-sm text-[#F0F2F5] hover:border-[#FF6600]/40 capitalize"
                    >
                      {s}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {popover === 'markup' && (
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <strong className="text-sm text-[#F0F2F5]">Aplicar markup</strong>
                  <button onClick={() => setPopover(null)} className="text-[#6B7280] hover:text-[#F0F2F5]">
                    <X size={14} />
                  </button>
                </div>
                <p className="text-[11px] text-[#6B7280]">
                  Multiplica el campo elegido por (1 + porcentaje/100). Usá negativo para bajar.
                </p>
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="block text-[10px] uppercase font-bold text-[#6B7280] mb-1">% Markup</label>
                    <input
                      type="number"
                      step="0.1"
                      value={markupPct}
                      onChange={e => setMarkupPct(e.target.value)}
                      className="w-full h-9 rounded-lg bg-[#1E2330] border border-[#2A3040] px-3 text-sm text-[#F0F2F5]"
                    />
                  </div>
                  <div>
                    <label className="block text-[10px] uppercase font-bold text-[#6B7280] mb-1">Campo</label>
                    <select
                      value={markupTarget}
                      onChange={e => setMarkupTarget(e.target.value as MarkupTarget)}
                      className="w-full h-9 rounded-lg bg-[#1E2330] border border-[#2A3040] px-3 text-sm text-[#F0F2F5]"
                    >
                      <option value="price_eur">Precio EUR</option>
                      <option value="cost_eur">Costo EUR</option>
                      <option value="price_usd">Precio USD</option>
                      <option value="price_ars">Precio ARS</option>
                    </select>
                  </div>
                </div>
                <button
                  onClick={() => {
                    const pct = Number(markupPct)
                    if (!Number.isFinite(pct)) return
                    onApplyMarkup(pct, markupTarget)
                    setPopover(null)
                  }}
                  className="w-full h-9 rounded-lg bg-[#FF6600] hover:bg-[#FF8833] text-white text-sm font-bold"
                >
                  Aplicar a {selectedIds.length} producto{selectedIds.length > 1 ? 's' : ''}
                </button>
              </div>
            )}
          </div>
        )}

        <div className="flex items-center gap-1.5 px-3 py-2.5 rounded-xl bg-[#141820] border border-[#FF6600]/40 shadow-2xl shadow-orange-500/20 backdrop-blur-sm">
          {/* Counter */}
          <div className="flex items-center gap-2 pr-2 border-r border-[#1E2330]">
            <CheckSquare size={14} className="text-[#FF6600]" />
            <span className="text-sm font-semibold text-[#F0F2F5]">
              {selectedIds.length} producto{selectedIds.length > 1 ? 's' : ''}
            </span>
          </div>

          {/* Activar / Desactivar */}
          <button
            onClick={onActivate}
            className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-semibold bg-emerald-500/10 text-emerald-400 hover:bg-emerald-500/20 border border-emerald-500/30"
            title="Marcar como activos"
          >
            <Power size={12} /> Activar
          </button>
          <button
            onClick={onDeactivate}
            className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-semibold bg-amber-500/10 text-amber-400 hover:bg-amber-500/20 border border-amber-500/30"
            title="Descatalogar"
          >
            <PowerOff size={12} /> Descatalogar
          </button>

          {/* Brand */}
          <button
            onClick={() => togglePopover('brand')}
            className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-semibold border ${
              popover === 'brand'
                ? 'bg-[#FF6600]/15 text-[#FF6600] border-[#FF6600]/40'
                : 'bg-[#1E2330] text-[#9CA3AF] hover:text-[#F0F2F5] border-[#2A3040]'
            }`}
          >
            <Tag size={12} /> Marca {popover === 'brand' && <ChevronUp size={11} />}
          </button>

          {/* Category */}
          <button
            onClick={() => togglePopover('category')}
            className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-semibold border ${
              popover === 'category'
                ? 'bg-[#FF6600]/15 text-[#FF6600] border-[#FF6600]/40'
                : 'bg-[#1E2330] text-[#9CA3AF] hover:text-[#F0F2F5] border-[#2A3040]'
            }`}
          >
            <FolderTree size={12} /> Categoría
          </button>

          {/* Lifecycle */}
          <button
            onClick={() => togglePopover('lifecycle')}
            className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-semibold border ${
              popover === 'lifecycle'
                ? 'bg-[#FF6600]/15 text-[#FF6600] border-[#FF6600]/40'
                : 'bg-[#1E2330] text-[#9CA3AF] hover:text-[#F0F2F5] border-[#2A3040]'
            }`}
          >
            <GitBranch size={12} /> Ciclo
          </button>

          {/* Markup */}
          <button
            onClick={() => togglePopover('markup')}
            className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-semibold border ${
              popover === 'markup'
                ? 'bg-[#FF6600]/15 text-[#FF6600] border-[#FF6600]/40'
                : 'bg-[#1E2330] text-[#9CA3AF] hover:text-[#F0F2F5] border-[#2A3040]'
            }`}
          >
            <Percent size={12} /> Markup
          </button>

          {/* Export */}
          <button
            onClick={onExport}
            className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-semibold bg-[#1E2330] text-[#9CA3AF] hover:text-[#F0F2F5] border border-[#2A3040]"
            title="Exportar selección a CSV"
          >
            <Download size={12} /> Exportar
          </button>

          {/* Soft delete */}
          {confirmDelete ? (
            <div className="flex items-center gap-1">
              <span className="text-[10px] text-red-400 px-1">¿Confirmar?</span>
              <button
                onClick={() => { onSoftDelete(); setConfirmDelete(false) }}
                className="px-2 py-1.5 rounded-lg text-[10px] font-bold bg-red-500/20 text-red-400 hover:bg-red-500/30 border border-red-500/40"
              >
                Sí
              </button>
              <button
                onClick={() => setConfirmDelete(false)}
                className="px-2 py-1.5 rounded-lg text-[10px] font-bold bg-[#1E2330] text-[#9CA3AF] border border-[#2A3040]"
              >
                No
              </button>
            </div>
          ) : (
            <button
              onClick={() => setConfirmDelete(true)}
              className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-semibold bg-red-500/10 text-red-400 hover:bg-red-500/20 border border-red-500/30"
              title="Marcar como obsoletos (soft delete)"
            >
              <Trash2 size={12} /> Eliminar
            </button>
          )}

          {/* Close */}
          <button
            onClick={onClear}
            className="ml-1 w-7 h-7 rounded-lg hover:bg-[#1E2330] flex items-center justify-center text-[#6B7280] hover:text-[#F0F2F5]"
            title="Limpiar selección"
          >
            <X size={14} />
          </button>
        </div>
      </div>
    </div>
  )
}
