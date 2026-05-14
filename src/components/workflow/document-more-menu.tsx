'use client'

/**
 * DOCUMENT MORE MENU
 * ==================
 *
 * Botón "Más ▾" con dropdown de acciones contextuales para un documento,
 * estilo StelOrder. Lee el catálogo declarativo de
 * `lib/document-actions-catalog.ts` y la config de
 * `lib/document-actions-config.ts` (habilitar/deshabilitar por tipo desde /admin).
 *
 * Uso:
 *   <DocumentMoreMenu
 *     documentType="coti"
 *     handlers={{
 *       send: openSendModal,
 *       generate_order: convertToOrder,
 *       duplicate: duplicateQuote,
 *       download_pdf: () => window.print(),
 *       delete: deleteQuote,
 *     }}
 *     hiddenKeys={['reopen']}   // opcional: ocultar puntualmente
 *   />
 *
 * REGLAS DE RENDERIZADO:
 * - Una acción se MUESTRA si:
 *     a) está en el catálogo con `implemented: true`,
 *     b) aplica al `documentType` (vía appliesTo),
 *     c) el caller pasó un handler para esa key,
 *     d) la config del admin no la deshabilitó,
 *     e) no está en `hiddenKeys`.
 * - Acciones con `danger: true` se pintan en rojo.
 * - Se agrupan con separadores por DocumentActionGroup.
 */

import { useEffect, useRef, useState } from 'react'
import { ChevronDown, MoreHorizontal } from 'lucide-react'
import {
  DOCUMENT_ACTIONS, GROUP_LABELS,
  type DocumentActionScope, type DocumentActionGroup, type DocumentActionDef,
} from '@/lib/document-actions-catalog'
import { loadDocumentActionsConfig, isActionEnabled } from '@/lib/document-actions-config'

export interface DocumentMoreMenuProps {
  documentType: DocumentActionScope
  /** Map de handlers por action.key. Si una key NO tiene handler aquí, no se renderiza. */
  handlers: Record<string, (() => void) | (() => Promise<void>) | undefined>
  /** Opcional: ocultar puntualmente algunas acciones aunque estén implementadas y configuradas. */
  hiddenKeys?: string[]
  /** Texto del botón. Default: "Más". */
  label?: string
  /** Variante visual del botón: 'primary' (naranja, default), 'ghost' (sin fondo). */
  variant?: 'primary' | 'ghost' | 'icon'
  /** Tamaño: 'sm' | 'md' (default md). */
  size?: 'sm' | 'md'
  /** Alineación del dropdown: 'left' | 'right' (default left). */
  align?: 'left' | 'right'
  /** Disabled state. */
  disabled?: boolean
}

const GROUP_ORDER: DocumentActionGroup[] = ['main', 'generate', 'transform', 'admin']

export function DocumentMoreMenu({
  documentType,
  handlers,
  hiddenKeys = [],
  label = 'Más',
  variant = 'primary',
  size = 'md',
  align = 'left',
  disabled = false,
}: DocumentMoreMenuProps) {
  const [open, setOpen] = useState(false)
  const [config, setConfig] = useState<Awaited<ReturnType<typeof loadDocumentActionsConfig>>>({})
  const [configLoaded, setConfigLoaded] = useState(false)
  const containerRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    let cancelled = false
    loadDocumentActionsConfig().then((c) => {
      if (!cancelled) { setConfig(c); setConfigLoaded(true) }
    }).catch(() => { if (!cancelled) setConfigLoaded(true) })
    return () => { cancelled = true }
  }, [])

  // Cerrar al click afuera
  useEffect(() => {
    if (!open) return
    function onDocClick(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false)
      }
    }
    document.addEventListener('mousedown', onDocClick)
    return () => document.removeEventListener('mousedown', onDocClick)
  }, [open])

  // Filtrado de acciones renderizables
  const renderable = DOCUMENT_ACTIONS.filter((a) => {
    if (a.implemented === false) return false
    if (!a.appliesTo.includes('*') && !a.appliesTo.includes(documentType)) return false
    if (hiddenKeys.includes(a.key)) return false
    if (!handlers[a.key]) return false
    if (configLoaded && !isActionEnabled(config, documentType, a.key)) return false
    return true
  })

  // Si no hay nada para mostrar, no mostrar el botón
  if (renderable.length === 0) return null

  // Agrupar por DocumentActionGroup en orden definido
  const grouped: Record<DocumentActionGroup, DocumentActionDef[]> = {
    main: [], generate: [], transform: [], admin: [],
  }
  for (const a of renderable) grouped[a.group].push(a)

  // Estilos del botón
  const btnBase = 'inline-flex items-center gap-1.5 rounded-lg font-semibold transition-colors disabled:opacity-50 disabled:cursor-not-allowed'
  const btnSize = size === 'sm' ? 'px-2.5 py-1 text-xs' : 'px-3 py-1.5 text-sm'
  const btnVariant = variant === 'primary'
    ? 'bg-[#FF6600] hover:bg-[#E55A00] text-white'
    : variant === 'ghost'
      ? 'text-[#9CA3AF] hover:text-[#F0F2F5] hover:bg-[#1E2330]'
      : 'text-[#9CA3AF] hover:text-[#F0F2F5]'

  return (
    <div className="relative inline-block" ref={containerRef}>
      <button
        type="button"
        onClick={() => !disabled && setOpen((v) => !v)}
        disabled={disabled}
        className={`${btnBase} ${btnSize} ${btnVariant}`}
        aria-haspopup="menu"
        aria-expanded={open}
      >
        {variant === 'icon' ? <MoreHorizontal size={16} /> : <>{label}<ChevronDown size={14} className={`transition-transform ${open ? 'rotate-180' : ''}`} /></>}
      </button>

      {open && (
        <div
          className={`absolute z-50 mt-1 min-w-[260px] rounded-xl border border-[#2A3040] bg-[#141820] shadow-2xl py-1 ${align === 'right' ? 'right-0' : 'left-0'}`}
          role="menu"
        >
          {GROUP_ORDER.map((group, gi) => {
            const items = grouped[group]
            if (items.length === 0) return null
            return (
              <div key={group}>
                {gi > 0 && (() => {
                  // Solo poner separador si el grupo anterior tuvo items
                  const prevHadItems = GROUP_ORDER.slice(0, gi).some((g) => grouped[g].length > 0)
                  return prevHadItems ? <div className="border-t border-[#2A3040] my-1" /> : null
                })()}
                <div className="px-3 py-1 text-[10px] uppercase tracking-wider text-[#4B5563] font-semibold">
                  {GROUP_LABELS[group]}
                </div>
                {items.map((a) => {
                  const Icon = a.icon
                  const handler = handlers[a.key]
                  if (!handler) return null
                  return (
                    <button
                      key={a.key}
                      type="button"
                      onClick={() => {
                        setOpen(false)
                        // Pequeño delay para que la animación del cierre se vea antes de la acción
                        setTimeout(() => { void handler() }, 50)
                      }}
                      className={`w-full flex items-center gap-2.5 px-3 py-2 text-sm text-left transition-colors ${
                        a.danger
                          ? 'text-red-400 hover:bg-red-500/10'
                          : 'text-[#F0F2F5] hover:bg-[#1E2330]'
                      }`}
                      role="menuitem"
                    >
                      <Icon size={14} className="shrink-0" />
                      <span>{a.label}</span>
                    </button>
                  )
                })}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
