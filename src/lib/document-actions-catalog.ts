/**
 * CATÁLOGO DE ACCIONES DE DOCUMENTO
 * =================================
 *
 * Inspirado en el botón "Más" de StelOrder. Cada documento del ERP
 * (cotización, pedido, albarán, factura, etc.) tiene un menú "Más"
 * con acciones contextuales: enviar, generar siguiente paso, duplicar,
 * crear evento, firmar, eliminar, etc.
 *
 * Este archivo es la fuente de verdad: define qué acciones existen,
 * a qué tipos de documento aplican, en qué grupo del menú aparecen
 * y si están "implementadas" (tienen handler conectado) o son placeholder.
 *
 * Por defecto TODAS las acciones implementadas vienen habilitadas.
 * El usuario las puede deshabilitar desde /admin → Acciones de documento.
 *
 * NO se hardcodean handlers acá — cada pantalla los inyecta vía
 * <DocumentMoreMenu handlers={{ ... }} />, así el catálogo queda
 * declarativo y reusable.
 */

import {
  Send, Copy, Download, FileDown, Package, Truck, Receipt,
  DollarSign, Calendar, CheckSquare, FolderOpen, Link as LinkIcon,
  Pen, Trash2, Eye, RotateCcw, FileText, Edit, ClipboardList,
  type LucideIcon,
} from 'lucide-react'

/** Tipos de documento donde puede aparecer una acción.
 *  '*' = todos los tipos. */
export type DocumentActionScope = 'coti' | 'pedido' | 'delivery_note' | 'invoice' | 'pap' | 'recepcion' | 'factura_compra' | '*'

/** Grupos visuales del menú (con separador entre grupos). */
export type DocumentActionGroup = 'main' | 'generate' | 'transform' | 'admin'

export interface DocumentActionDef {
  /** Identificador único, usado en config y handlers (snake_case). */
  key: string
  /** Texto visible en el menú. */
  label: string
  /** Ícono Lucide. */
  icon: LucideIcon
  /** A qué tipos de documento aplica esta acción. */
  appliesTo: DocumentActionScope[]
  /** Grupo del dropdown. */
  group: DocumentActionGroup
  /** Si true: acción destructiva, se pinta en rojo y pide confirmación. */
  danger?: boolean
  /** Si false: la acción está definida pero el handler no existe en NINGUNA
   *  pantalla del ERP todavía. NO se renderiza en el menú hasta que se
   *  implemente al menos en una pantalla. Sirve para tener el catálogo
   *  completo "previsto" sin contaminar el UI con botones muertos. */
  implemented?: boolean
}

/**
 * Catálogo central. Para agregar una acción nueva:
 *   1) Agregar entrada acá con `implemented: false`
 *   2) Implementar el handler en alguna pantalla
 *   3) Cambiar a `implemented: true`
 *   4) Aparece automáticamente en el menú "Más" de las pantallas que
 *      pasen el handler correspondiente.
 */
export const DOCUMENT_ACTIONS: DocumentActionDef[] = [
  // ── MAIN ── (acciones genéricas a cualquier documento)
  { key: 'send',          label: 'Enviar al cliente',     icon: Send,          appliesTo: ['coti', 'pedido', 'delivery_note', 'invoice'], group: 'main', implemented: true },
  { key: 'download_pdf',  label: 'Descargar PDF',         icon: Download,      appliesTo: ['*'],                                           group: 'main', implemented: true },
  { key: 'duplicate',     label: 'Duplicar',              icon: Copy,          appliesTo: ['coti', 'pedido', 'delivery_note', 'invoice', 'pap'], group: 'main', implemented: true },
  { key: 'view_original', label: 'Ver OC original',       icon: Eye,           appliesTo: ['coti', 'pedido'],                              group: 'main', implemented: false },
  { key: 'export',        label: 'Exportar…',             icon: FileDown,      appliesTo: ['*'],                                           group: 'main', implemented: false },

  // ── GENERATE ── (avanzar al siguiente paso del workflow)
  { key: 'generate_order',    label: 'Generar Pedido',     icon: Package,  appliesTo: ['coti'],                       group: 'generate', implemented: true },
  { key: 'generate_delivery', label: 'Generar Albarán',    icon: Truck,    appliesTo: ['pedido'],                     group: 'generate', implemented: true },
  { key: 'generate_invoice',  label: 'Generar Factura',    icon: Receipt,  appliesTo: ['pedido', 'delivery_note'],    group: 'generate', implemented: true },
  { key: 'register_payment',  label: 'Registrar Cobro',    icon: DollarSign, appliesTo: ['invoice'],                  group: 'generate', implemented: true },
  { key: 'generate_credit_note', label: 'Generar Nota de Crédito', icon: RotateCcw, appliesTo: ['invoice'],            group: 'generate', implemented: false },

  // ── TRANSFORM ── (acciones que crean entidades laterales)
  { key: 'create_event',     label: 'Crear evento en calendario', icon: Calendar,    appliesTo: ['*'],                group: 'transform', implemented: false },
  { key: 'create_task',      label: 'Crear tarea',                icon: CheckSquare, appliesTo: ['*'],                group: 'transform', implemented: false },
  { key: 'create_project',   label: 'Crear proyecto',             icon: FolderOpen,  appliesTo: ['*'],                group: 'transform', implemented: false },
  { key: 'link_project',     label: 'Relacionar proyecto…',       icon: LinkIcon,    appliesTo: ['*'],                group: 'transform', implemented: false },
  { key: 'sign',             label: 'Firmar',                     icon: Pen,         appliesTo: ['coti', 'invoice'],  group: 'transform', implemented: false },

  // ── ADMIN ── (peligro / mantenimiento)
  { key: 'edit_notes',     label: 'Editar observaciones',  icon: Edit,          appliesTo: ['*'],                                           group: 'admin', implemented: false },
  { key: 'audit_log',      label: 'Ver historial',         icon: ClipboardList, appliesTo: ['*'],                                           group: 'admin', implemented: false },
  { key: 'reopen',         label: 'Reabrir (borrador)',    icon: RotateCcw,     appliesTo: ['coti', 'pedido'],                              group: 'admin', implemented: true },
  { key: 'duplicate_as',   label: 'Duplicar como…',        icon: FileText,      appliesTo: ['coti'],                                        group: 'admin', implemented: false },
  { key: 'delete',         label: 'Eliminar',              icon: Trash2,        appliesTo: ['*'],                                           group: 'admin', implemented: true, danger: true },
]

/** Mapa rápido por key para lookups. */
export const ACTION_BY_KEY: Record<string, DocumentActionDef> = Object.fromEntries(
  DOCUMENT_ACTIONS.map((a) => [a.key, a])
)

/** Devuelve las acciones aplicables a un tipo de documento dado. */
export function actionsForType(type: DocumentActionScope): DocumentActionDef[] {
  return DOCUMENT_ACTIONS.filter((a) =>
    a.implemented !== false && (a.appliesTo.includes('*') || a.appliesTo.includes(type))
  )
}

/** Etiquetas legibles por grupo. */
export const GROUP_LABELS: Record<DocumentActionGroup, string> = {
  main: 'Acciones',
  generate: 'Generar siguiente paso',
  transform: 'Crear / Relacionar',
  admin: 'Administrativo',
}
