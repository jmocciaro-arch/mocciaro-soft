'use client'

/**
 * ADMIN — Configurar acciones del menú "Más" por tipo de documento
 * ================================================================
 *
 * Tabla configurable: filas = tipos de documento, columnas = acciones.
 * Toggle por celda para habilitar/deshabilitar.
 *
 * Persiste en tt_system_params (key='document_actions_config') vía
 * lib/document-actions-config.ts.
 */

import { useEffect, useState } from 'react'
import { Save, Loader2, RotateCcw, FileText, Package, Truck, Receipt, ShoppingBag } from 'lucide-react'
import { useToast } from '@/components/ui/toast'
import { Button } from '@/components/ui/button'
import {
  DOCUMENT_ACTIONS, GROUP_LABELS,
  type DocumentActionScope, type DocumentActionGroup,
} from '@/lib/document-actions-catalog'
import {
  loadDocumentActionsConfig, saveDocumentActionsConfig,
  invalidateDocumentActionsCache,
  type DocumentActionsConfig,
} from '@/lib/document-actions-config'

const DOCUMENT_TYPES: Array<{ key: DocumentActionScope; label: string; icon: typeof FileText }> = [
  { key: 'coti', label: 'Cotización', icon: FileText },
  { key: 'pedido', label: 'Pedido', icon: Package },
  { key: 'delivery_note', label: 'Albarán', icon: Truck },
  { key: 'invoice', label: 'Factura', icon: Receipt },
  { key: 'pap', label: 'Pedido a Proveedor', icon: ShoppingBag },
]

const GROUP_ORDER: DocumentActionGroup[] = ['main', 'generate', 'transform', 'admin']

export function DocumentActionsAdmin() {
  const { addToast } = useToast()
  const [config, setConfig] = useState<DocumentActionsConfig>({})
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [dirty, setDirty] = useState(false)

  useEffect(() => {
    loadDocumentActionsConfig().then((c) => {
      setConfig(c)
      setLoading(false)
    }).catch(() => setLoading(false))
  }, [])

  // ¿Esta acción está habilitada para este tipo? Default true.
  function isEnabled(type: DocumentActionScope, key: string): boolean {
    const t = config[type]
    if (!t) return true
    return t[key] !== false
  }

  function toggle(type: DocumentActionScope, key: string) {
    setConfig((prev) => {
      const t = { ...(prev[type] || {}) }
      const currentlyEnabled = t[key] !== false
      if (currentlyEnabled) t[key] = false
      else delete t[key] // borrar el override para volver al default true
      const next = { ...prev, [type]: t }
      // Si el tipo quedó vacío, lo eliminamos para mantener limpio el JSON
      if (Object.keys(t).length === 0) delete next[type]
      return next
    })
    setDirty(true)
  }

  function resetAll() {
    if (!confirm('¿Restaurar todas las acciones al default (todas habilitadas)?')) return
    setConfig({})
    setDirty(true)
  }

  async function handleSave() {
    setSaving(true)
    try {
      await saveDocumentActionsConfig(config)
      invalidateDocumentActionsCache()
      setDirty(false)
      addToast({ type: 'success', title: 'Configuración guardada', message: 'Los menús "Más" usan la nueva config' })
    } catch (err) {
      const msg = err instanceof Error ? err.message : JSON.stringify(err)
      addToast({ type: 'error', title: 'No se pudo guardar', message: msg })
    } finally { setSaving(false) }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-16">
        <Loader2 size={32} className="animate-spin text-[#FF6600]" />
      </div>
    )
  }

  // Solo mostramos acciones implementadas. Las no implementadas no tiene sentido
  // configurarlas todavía.
  const implementedActions = DOCUMENT_ACTIONS.filter((a) => a.implemented !== false)

  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h2 className="text-lg font-bold text-[#F0F2F5]">Acciones del menú &quot;Más&quot; por documento</h2>
          <p className="text-sm text-[#9CA3AF] mt-1 max-w-2xl">
            Habilitá o deshabilitá las acciones disponibles en el menú <strong className="text-[#FF6600]">Más ▾</strong> de
            cada tipo de documento. Por defecto todas las acciones implementadas están habilitadas.
            Las acciones no implementadas todavía no aparecen acá.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="sm" onClick={resetAll}>
            <RotateCcw size={14} /> Restaurar defaults
          </Button>
          <Button variant="primary" size="sm" onClick={handleSave} loading={saving} disabled={!dirty}>
            <Save size={14} /> Guardar cambios
          </Button>
        </div>
      </div>

      {/* Tabla: filas = acciones, columnas = tipos de documento */}
      <div className="rounded-xl border border-[#2A3040] bg-[#141820] overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-[#0B0E13] border-b border-[#2A3040]">
            <tr>
              <th className="text-left px-4 py-3 text-xs font-semibold text-[#9CA3AF] uppercase tracking-wider sticky left-0 bg-[#0B0E13]">Acción</th>
              {DOCUMENT_TYPES.map((dt) => {
                const Icon = dt.icon
                return (
                  <th key={dt.key} className="px-3 py-3 text-xs font-semibold text-[#9CA3AF] uppercase tracking-wider">
                    <div className="flex flex-col items-center gap-1">
                      <Icon size={14} />
                      <span>{dt.label}</span>
                    </div>
                  </th>
                )
              })}
            </tr>
          </thead>
          <tbody>
            {GROUP_ORDER.flatMap((group) => {
              const groupActions = implementedActions.filter((a) => a.group === group)
              if (groupActions.length === 0) return []
              return [
                <tr key={`group-header-${group}`}>
                  <td colSpan={1 + DOCUMENT_TYPES.length} className="bg-[#1C2230] px-4 py-1.5 text-[10px] uppercase tracking-wider text-[#FF6600] font-bold border-b border-[#2A3040]">
                    {GROUP_LABELS[group]}
                  </td>
                </tr>,
                ...groupActions.map((a) => {
                  const Icon = a.icon
                  return (
                    <tr key={a.key} className="border-b border-[#1E2330] hover:bg-[#1C2230]/30">
                      <td className="px-4 py-2 sticky left-0 bg-[#141820]">
                        <div className="flex items-center gap-2">
                          <Icon size={14} className={a.danger ? 'text-red-400' : 'text-[#9CA3AF]'} />
                          <span className={a.danger ? 'text-red-400' : 'text-[#F0F2F5]'}>{a.label}</span>
                          <code className="text-[10px] text-[#4B5563] font-mono">{a.key}</code>
                        </div>
                      </td>
                      {DOCUMENT_TYPES.map((dt) => {
                        const applies = a.appliesTo.includes('*') || a.appliesTo.includes(dt.key)
                        if (!applies) {
                          return <td key={dt.key} className="text-center text-[#3A4050] text-xs">—</td>
                        }
                        const enabled = isEnabled(dt.key, a.key)
                        return (
                          <td key={dt.key} className="text-center px-2 py-2">
                            <button
                              type="button"
                              onClick={() => toggle(dt.key, a.key)}
                              className={`w-10 h-5 rounded-full transition-all relative shrink-0 mx-auto ${enabled ? 'bg-emerald-500/50' : 'bg-[#2A3040]'}`}
                              title={enabled ? 'Habilitada — click para deshabilitar' : 'Deshabilitada — click para habilitar'}
                            >
                              <div className={`w-4 h-4 rounded-full bg-white absolute top-0.5 transition-all ${enabled ? 'right-0.5' : 'left-0.5'}`} />
                            </button>
                          </td>
                        )
                      })}
                    </tr>
                  )
                }),
              ]
            })}
          </tbody>
        </table>
      </div>

      <p className="text-xs text-[#6B7280]">
        💡 Los cambios se aplican al menú &quot;Más&quot; de cada pantalla apenas guardás. El caché se invalida automáticamente.
      </p>
    </div>
  )
}
