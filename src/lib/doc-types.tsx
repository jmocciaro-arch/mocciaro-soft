/**
 * doc-types.ts — Centralización de labels, colores e iconos de documentos.
 *
 * Diccionarios compartidos entre data-table, document-chain, document-list-card y
 * send-document-modal. Cada componente puede consumir directamente lo que necesite.
 *
 * Si agregás un nuevo tipo de documento o estado, hacelo acá y se propaga.
 */

import {
  FileText, ClipboardList, Truck, CreditCard, DollarSign,
  ShoppingCart, Target, AlertCircle,
} from 'lucide-react'
import type { ReactNode } from 'react'

// ─────────────────────────────────────────────────────────────────
// TYPE LABELS — etiqueta legible por tipo de documento
// ─────────────────────────────────────────────────────────────────
export const TYPE_LABELS: Record<string, string> = {
  lead: 'Lead',
  coti: 'Cotización',
  oc_cliente: 'OC Cliente',
  orden_compra: 'OC Cliente',
  pedido: 'Pedido',
  delivery_note: 'Albarán',
  factura: 'Factura',
  cobro: 'Cobro',
  pap: 'Pedido a Proveedor',
  recepcion: 'Recepción',
  factura_compra: 'Factura de Compra',
}

// ─────────────────────────────────────────────────────────────────
// TYPE ICONS — icono + color por tipo
// ─────────────────────────────────────────────────────────────────
export const TYPE_ICONS: Record<string, { icon: ReactNode; color: string; label: string }> = {
  lead: { icon: <Target size={16} />, color: '#6B7280', label: 'Lead' },
  coti: { icon: <FileText size={16} />, color: '#3B82F6', label: 'Cotización' },
  oc_cliente: { icon: <ClipboardList size={16} />, color: '#8B5CF6', label: 'OC Cliente' },
  pedido: { icon: <ClipboardList size={16} />, color: '#FF6600', label: 'Pedido' },
  pap: { icon: <ShoppingCart size={16} />, color: '#F59E0B', label: 'PAP' },
  recepcion: { icon: <Truck size={16} />, color: '#14B8A6', label: 'Recepción' },
  delivery_note: { icon: <Truck size={16} />, color: '#00C853', label: 'Albarán' },
  factura: { icon: <CreditCard size={16} />, color: '#EC4899', label: 'Factura' },
  cobro: { icon: <DollarSign size={16} />, color: '#10B981', label: 'Cobro' },
  factura_compra: { icon: <CreditCard size={16} />, color: '#EF4444', label: 'Fact. compra' },
  default: { icon: <AlertCircle size={16} />, color: '#6B7280', label: 'Documento' },
}

// ─────────────────────────────────────────────────────────────────
// STATUS COLORS — colores por estado normalizado (label legible)
// Para uso en badges sólidos (bg + text)
// ─────────────────────────────────────────────────────────────────
export const STATUS_COLORS: Record<string, { bg: string; text: string }> = {
  // Verdes — completados
  cerrado: { bg: 'rgba(16,185,129,0.15)', text: '#10B981' },
  cerrada: { bg: 'rgba(16,185,129,0.15)', text: '#10B981' },
  completado: { bg: 'rgba(16,185,129,0.15)', text: '#10B981' },
  completada: { bg: 'rgba(16,185,129,0.15)', text: '#10B981' },
  completed: { bg: 'rgba(16,185,129,0.15)', text: '#10B981' },
  cobrada: { bg: 'rgba(16,185,129,0.15)', text: '#10B981' },
  pagada: { bg: 'rgba(16,185,129,0.15)', text: '#10B981' },
  pagado: { bg: 'rgba(16,185,129,0.15)', text: '#10B981' },
  paid: { bg: 'rgba(16,185,129,0.15)', text: '#10B981' },
  aceptada: { bg: 'rgba(16,185,129,0.15)', text: '#10B981' },
  aceptado: { bg: 'rgba(16,185,129,0.15)', text: '#10B981' },
  accepted: { bg: 'rgba(16,185,129,0.15)', text: '#10B981' },
  entregado: { bg: 'rgba(16,185,129,0.15)', text: '#10B981' },
  entregada: { bg: 'rgba(16,185,129,0.15)', text: '#10B981' },
  delivered: { bg: 'rgba(16,185,129,0.15)', text: '#10B981' },
  received: { bg: 'rgba(16,185,129,0.15)', text: '#10B981' },
  recibida: { bg: 'rgba(16,185,129,0.15)', text: '#10B981' },
  fully_delivered: { bg: 'rgba(16,185,129,0.15)', text: '#10B981' },
  completa: { bg: 'rgba(16,185,129,0.15)', text: '#10B981' },
  // Amarillos/Naranjas — pendientes / parciales
  pendiente: { bg: 'rgba(245,158,11,0.15)', text: '#F59E0B' },
  pending: { bg: 'rgba(245,158,11,0.15)', text: '#F59E0B' },
  parcial: { bg: 'rgba(249,115,22,0.15)', text: '#F97316' },
  partial: { bg: 'rgba(249,115,22,0.15)', text: '#F97316' },
  'pago parcial': { bg: 'rgba(249,115,22,0.15)', text: '#F97316' },
  'entrega parcial': { bg: 'rgba(249,115,22,0.15)', text: '#F97316' },
  'facturacion parcial': { bg: 'rgba(249,115,22,0.15)', text: '#F97316' },
  partially_delivered: { bg: 'rgba(249,115,22,0.15)', text: '#F97316' },
  partially_invoiced: { bg: 'rgba(249,115,22,0.15)', text: '#F97316' },
  'vence pronto': { bg: 'rgba(249,115,22,0.15)', text: '#F97316' },
  // Azules — abiertos / en proceso
  abierto: { bg: 'rgba(59,130,246,0.15)', text: '#3B82F6' },
  abierta: { bg: 'rgba(59,130,246,0.15)', text: '#3B82F6' },
  open: { bg: 'rgba(59,130,246,0.15)', text: '#3B82F6' },
  enviada: { bg: 'rgba(59,130,246,0.15)', text: '#3B82F6' },
  enviado: { bg: 'rgba(59,130,246,0.15)', text: '#3B82F6' },
  sent: { bg: 'rgba(59,130,246,0.15)', text: '#3B82F6' },
  confirmed: { bg: 'rgba(59,130,246,0.15)', text: '#3B82F6' },
  // Lila — facturados (post-cierre venta)
  facturado: { bg: 'rgba(99,102,241,0.15)', text: '#6366F1' },
  facturada: { bg: 'rgba(99,102,241,0.15)', text: '#6366F1' },
  invoiced: { bg: 'rgba(99,102,241,0.15)', text: '#6366F1' },
  fully_invoiced: { bg: 'rgba(99,102,241,0.15)', text: '#6366F1' },
  // Grises — borrador / cerrado
  borrador: { bg: 'rgba(107,114,128,0.15)', text: '#6B7280' },
  draft: { bg: 'rgba(107,114,128,0.15)', text: '#6B7280' },
  closed: { bg: 'rgba(107,114,128,0.15)', text: '#6B7280' },
  // Rojos — cancelado / rechazado / vencido
  cancelado: { bg: 'rgba(239,68,68,0.15)', text: '#EF4444' },
  cancelada: { bg: 'rgba(239,68,68,0.15)', text: '#EF4444' },
  cancelled: { bg: 'rgba(239,68,68,0.15)', text: '#EF4444' },
  rechazada: { bg: 'rgba(239,68,68,0.15)', text: '#EF4444' },
  rechazado: { bg: 'rgba(239,68,68,0.15)', text: '#EF4444' },
  rejected: { bg: 'rgba(239,68,68,0.15)', text: '#EF4444' },
  vencida: { bg: 'rgba(239,68,68,0.15)', text: '#EF4444' },
  overdue: { bg: 'rgba(239,68,68,0.15)', text: '#EF4444' },
}

// ─────────────────────────────────────────────────────────────────
// STATUS LABELS — mapeo de status code → etiqueta legible en español
// ─────────────────────────────────────────────────────────────────
export const STATUS_LABELS: Record<string, string> = {
  // Cotización
  draft: 'Borrador',
  sent: 'Enviada',
  accepted: 'Aceptada',
  rejected: 'Rechazada',
  closed: 'Cerrada',
  // Pedido
  open: 'Abierto',
  partially_delivered: 'Entrega parcial',
  fully_delivered: 'Entregado',
  partially_invoiced: 'Fact. parcial',
  fully_invoiced: 'Facturado',
  // Albarán
  pending: 'Pendiente',
  delivered: 'Entregado',
  received: 'Recibido',
  // Factura
  paid: 'Pagada',
  partial: 'Pago parcial',
  cancelled: 'Cancelada',
  overdue: 'Vencida',
  // Genéricos
  validated: 'Validada',
  pending_validation: 'Pend. validación',
  emitida: 'Emitida',
  invoiced: 'Facturada',
  in_process: 'En proceso',
  completed: 'Completado',
  confirmed: 'Confirmado',
}

export function getStatusLabel(status: string): string {
  return STATUS_LABELS[status] || status
}

export function getTypeLabel(type: string): string {
  return TYPE_LABELS[type] || type
}

// ─────────────────────────────────────────────────────────────────
// STATUS ALIASES — equivalencias entre slugs ES y EN
//
// En la DB el mismo "borrador" puede aparecer escrito como:
//   - 'draft' (en módulos antiguos / tt_documents)
//   - 'borrador' (en módulos nuevos en español / cotizador)
//
// Cuando filtramos por status (ej. `eq('status', 'draft')`) hay que
// considerar ambos. Usar `aliasesFor('draft')` y pasar a `.in()`.
// ─────────────────────────────────────────────────────────────────
const STATUS_ALIAS_GROUPS: string[][] = [
  ['draft', 'borrador'],
  ['sent', 'enviada', 'enviado'],
  ['accepted', 'aceptada', 'aceptado'],
  ['rejected', 'rechazada', 'rechazado'],
  ['closed', 'cerrado', 'cerrada'],
  ['open', 'abierto', 'abierta'],
  ['pending', 'pendiente'],
  ['partial', 'parcial'],
  ['paid', 'pagada', 'pagado', 'cobrada'],
  ['delivered', 'entregado', 'entregada', 'fully_delivered'],
  ['received', 'recibida', 'recibido'],
  ['invoiced', 'facturada', 'facturado', 'fully_invoiced'],
  ['cancelled', 'cancelado', 'cancelada'],
  ['overdue', 'vencida'],
  ['completed', 'completado', 'completada', 'completa'],
  ['confirmed', 'confirmado', 'confirmada'],
  ['partially_delivered', 'entrega parcial'],
  ['partially_invoiced', 'facturacion parcial', 'fact. parcial'],
]

export const STATUS_ALIASES: Record<string, string[]> = (() => {
  const map: Record<string, string[]> = {}
  for (const group of STATUS_ALIAS_GROUPS) {
    for (const slug of group) map[slug] = group
  }
  return map
})()

/** Devuelve todos los alias de un status (incluyéndose). Útil para `.in('status', aliasesFor('draft'))`. */
export function aliasesFor(status: string): string[] {
  return STATUS_ALIASES[status] || [status]
}

/** Normaliza un status raw (cualquier idioma/forma) a su label legible en es-ES. */
export function mapStatus(status: string | null | undefined): string {
  if (!status) return 'Borrador'
  return STATUS_LABELS[status] || status.charAt(0).toUpperCase() + status.slice(1).replace(/_/g, ' ')
}
