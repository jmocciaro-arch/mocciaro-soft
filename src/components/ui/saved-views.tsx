'use client'

/**
 * Saved Views (vistas guardadas con filtros) — estilo Linear / Salesforce / Notion.
 * Permite guardar combinación de filtros + ordenamiento como vista reutilizable.
 */

import { useEffect, useState, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import { useToast } from '@/components/ui/toast'
import {
  Filter, Save, Pin, PinOff, Trash2, Plus, Star, Check, X, ChevronDown,
} from 'lucide-react'

export interface SavedView {
  id: string
  user_id: string | null
  entity_type: string
  name: string
  icon: string | null
  filters: Record<string, unknown>
  sort_by: string | null
  sort_dir: 'asc' | 'desc' | null
  is_shared: boolean
  is_pinned: boolean
  sort_order: number
}

interface Props {
  entityType: string
  currentFilters: Record<string, unknown>
  currentSortBy?: string | null
  currentSortDir?: 'asc' | 'desc' | null
  onApplyView: (filters: Record<string, unknown>, sortBy?: string | null, sortDir?: 'asc' | 'desc' | null) => void
  activeViewId?: string | null
}

export function SavedViews({ entityType, currentFilters, currentSortBy, currentSortDir, onApplyView, activeViewId }: Props) {
  const supabase = createClient()
  const { addToast } = useToast()
  const [views, setViews] = useState<SavedView[]>([])
  const [showSaveDialog, setShowSaveDialog] = useState(false)
  const [showAllDialog, setShowAllDialog] = useState(false)
  const [newViewName, setNewViewName] = useState('')
  const [newViewIcon, setNewViewIcon] = useState('⭐')
  const [newViewShared, setNewViewShared] = useState(false)
  const [saving, setSaving] = useState(false)

  const load = useCallback(async () => {
    const { data: userResult } = await supabase.auth.getUser()
    const user = userResult.user
    if (!user) return
    const { data } = await supabase
      .from('tt_saved_views')
      .select('*')
      .eq('entity_type', entityType)
      .or(`user_id.eq.${user.id},is_shared.eq.true`)
      .order('is_pinned', { ascending: false })
      .order('sort_order')
    setViews((data || []) as SavedView[])
  }, [supabase, entityType])

  useEffect(() => { void load() }, [load])

  const saveCurrentAsView = async () => {
    if (!newViewName.trim()) { addToast({ type: 'warning', title: 'Nombre obligatorio' }); return }
    setSaving(true)
    try {
      const { data: userResult } = await supabase.auth.getUser()
      const user = userResult.user
      if (!user) throw new Error('No autenticado')
      const { error } = await supabase.from('tt_saved_views').insert({
        user_id: user.id,
        entity_type: entityType,
        name: newViewName.trim(),
        icon: newViewIcon,
        filters: currentFilters,
        sort_by: currentSortBy,
        sort_dir: currentSortDir,
        is_shared: newViewShared,
        is_pinned: false,
      })
      if (error) throw error
      addToast({ type: 'success', title: 'Vista guardada' })
      setShowSaveDialog(false)
      setNewViewName('')
      void load()
    } catch (e) {
      addToast({ type: 'error', title: 'Error', message: (e as Error).message })
    } finally {
      setSaving(false)
    }
  }

  const togglePin = async (v: SavedView) => {
    await supabase.from('tt_saved_views').update({ is_pinned: !v.is_pinned }).eq('id', v.id)
    void load()
  }

  const deleteView = async (id: string) => {
    if (!confirm('¿Eliminar esta vista guardada?')) return
    await supabase.from('tt_saved_views').delete().eq('id', id)
    setViews(vs => vs.filter(x => x.id !== id))
  }

  const pinnedViews = views.filter(v => v.is_pinned)

  return (
    <div className="flex items-center gap-2 flex-wrap">
      {/* Pinned views como pills */}
      {pinnedViews.map(v => (
        <button
          key={v.id}
          onClick={() => onApplyView(v.filters, v.sort_by, v.sort_dir)}
          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition ${
            activeViewId === v.id
              ? 'bg-[#FF6600] text-white'
              : 'bg-[#1E2330] border border-[#2A3040] text-[#9CA3AF] hover:text-[#F0F2F5]'
          }`}
          title={v.is_shared ? 'Vista compartida' : 'Mi vista'}
        >
          {v.icon && <span>{v.icon}</span>}
          {v.name}
          {v.is_shared && <span className="text-[9px] uppercase opacity-60">share</span>}
        </button>
      ))}

      {/* Botón "+ Vista" para guardar la actual */}
      <button
        onClick={() => setShowSaveDialog(true)}
        className="flex items-center gap-1 px-3 py-1.5 rounded-lg border border-dashed border-[#2A3040] text-[#6B7280] hover:text-[#FF6600] hover:border-[#FF6600]/40 text-xs font-medium transition"
        title="Guardar filtros actuales como vista"
      >
        <Plus size={11} /> Vista
      </button>

      {/* Botón "Todas las vistas" */}
      {views.length > pinnedViews.length && (
        <button
          onClick={() => setShowAllDialog(s => !s)}
          className="flex items-center gap-1 px-2 py-1.5 rounded-lg border border-[#2A3040] bg-[#0F1218] text-[#9CA3AF] hover:text-[#F0F2F5] text-xs font-medium relative"
        >
          <Filter size={11} />
          {views.length - pinnedViews.length} más
          <ChevronDown size={11} className={showAllDialog ? 'rotate-180' : ''} />
        </button>
      )}

      {/* Dropdown todas */}
      {showAllDialog && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setShowAllDialog(false)} />
          <div className="absolute z-50 mt-1 ml-2 top-full left-0 w-72 rounded-xl bg-[#0F1218] border border-[#1E2330] shadow-2xl shadow-black/60 overflow-hidden">
            <div className="p-2 border-b border-[#1E2330] text-[10px] uppercase font-bold text-[#6B7280]">Vistas guardadas</div>
            <div className="max-h-[300px] overflow-y-auto py-1">
              {views.length === 0 ? (
                <div className="p-4 text-center text-xs text-[#6B7280]">Aún no guardaste vistas</div>
              ) : views.map(v => (
                <div key={v.id} className="flex items-center group hover:bg-[#1E2330]">
                  <button
                    onClick={() => { onApplyView(v.filters, v.sort_by, v.sort_dir); setShowAllDialog(false) }}
                    className="flex-1 flex items-center gap-2 px-3 py-2 text-sm text-left"
                  >
                    {v.icon && <span>{v.icon}</span>}
                    <span className="text-[#F0F2F5] truncate">{v.name}</span>
                    {v.is_shared && <span className="text-[9px] uppercase text-[#6B7280]">share</span>}
                  </button>
                  <button
                    onClick={() => togglePin(v)}
                    className="p-1.5 text-[#6B7280] hover:text-[#FF6600] opacity-0 group-hover:opacity-100"
                    title={v.is_pinned ? 'Despinear' : 'Pinear'}
                  >
                    {v.is_pinned ? <PinOff size={11} /> : <Pin size={11} />}
                  </button>
                  <button
                    onClick={() => deleteView(v.id)}
                    className="p-1.5 text-[#6B7280] hover:text-red-400 opacity-0 group-hover:opacity-100"
                    title="Eliminar"
                  >
                    <Trash2 size={11} />
                  </button>
                </div>
              ))}
            </div>
          </div>
        </>
      )}

      {/* Modal guardar */}
      {showSaveDialog && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 backdrop-blur-sm" onClick={() => setShowSaveDialog(false)}>
          <div onClick={e => e.stopPropagation()} className="w-[400px] rounded-xl bg-[#0F1218] border border-[#1E2330] p-4 space-y-3">
            <div className="flex items-center gap-2">
              <Save size={14} className="text-[#FF6600]" />
              <strong className="text-sm text-[#F0F2F5]">Guardar vista</strong>
            </div>
            <p className="text-xs text-[#6B7280]">Guardás los filtros actuales como una vista reutilizable.</p>
            <div>
              <label className="block text-xs text-[#9CA3AF] mb-1">Nombre *</label>
              <input
                autoFocus
                value={newViewName}
                onChange={e => setNewViewName(e.target.value)}
                placeholder="ej: Mis clientes activos AR"
                className="w-full h-9 rounded-lg bg-[#1E2330] border border-[#2A3040] px-3 text-sm text-[#F0F2F5]"
              />
            </div>
            <div>
              <label className="block text-xs text-[#9CA3AF] mb-1">Ícono</label>
              <div className="flex gap-1">
                {['⭐','🔥','📌','💎','🎯','📊','🚀','💰','📞','📧','🏢','✨'].map(ic => (
                  <button
                    key={ic}
                    onClick={() => setNewViewIcon(ic)}
                    className={`w-8 h-8 rounded-lg border text-base ${
                      newViewIcon === ic ? 'border-[#FF6600] bg-[#FF6600]/10' : 'border-[#2A3040] bg-[#1E2330]'
                    }`}
                  >{ic}</button>
                ))}
              </div>
            </div>
            <label className="flex items-center gap-2 text-xs text-[#9CA3AF] cursor-pointer">
              <input
                type="checkbox"
                checked={newViewShared}
                onChange={e => setNewViewShared(e.target.checked)}
                className="w-4 h-4 rounded accent-orange-500"
              />
              Compartir con todo el equipo
            </label>
            <div className="flex justify-end gap-2 pt-2 border-t border-[#1E2330]">
              <Button variant="secondary" size="sm" onClick={() => setShowSaveDialog(false)}>Cancelar</Button>
              <Button size="sm" onClick={saveCurrentAsView} loading={saving}>
                <Save size={11} /> Guardar vista
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
