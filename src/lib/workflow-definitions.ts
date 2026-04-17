/**
 * WORKFLOW DEFINITIONS — un paso estándar por tipo de documento.
 *
 * Cada documento del ERP tiene su propio flujo. Este archivo centraliza
 * los pasos para que la barra <DocumentProcessBar> reciba siempre la misma
 * estructura.
 */

import type { ProcessStep, StepStatus } from '@/components/workflow/document-process-bar'

export type DocumentType =
  | 'lead'
  | 'opportunity'
  | 'quote'
  | 'sales_order'
  | 'delivery_note'
  | 'invoice'
  | 'credit_note'
  | 'purchase_order'
  | 'client_po'
  | 'sat_ticket'
  | 'bank_statement'

/** Definiciones estáticas de los pasos de cada workflow */
export const WORKFLOWS: Record<DocumentType, Array<{ id: string; label: string; hint?: string; optional?: boolean }>> = {
  lead: [
    { id: 'capture', label: 'Captura', hint: 'Datos del contacto y mensaje' },
    { id: 'analysis', label: 'Análisis IA', hint: 'Scoring + tags' },
    { id: 'qualify', label: 'Cualificación', hint: 'Validación comercial' },
    { id: 'convert', label: 'Conversión', hint: 'A oportunidad' },
  ],

  opportunity: [
    { id: 'lead', label: 'Lead' },
    { id: 'proposal', label: 'Propuesta' },
    { id: 'negotiation', label: 'Negociación' },
    { id: 'won', label: 'Ganado' },
    { id: 'order', label: 'Pedido', optional: true },
  ],

  quote: [
    { id: 'draft', label: 'Borrador', hint: 'Datos, cliente, items' },
    { id: 'conditions', label: 'Condiciones', hint: 'Incoterm, pago, validez' },
    { id: 'approval', label: 'Aprobación', hint: 'Revisar antes de enviar' },
    { id: 'sent', label: 'Enviada' },
    { id: 'accepted', label: 'Aceptada', optional: true },
    { id: 'converted', label: 'Pedido', optional: true, hint: 'Convertir a pedido de venta' },
  ],

  sales_order: [
    { id: 'created', label: 'Creado' },
    { id: 'po_received', label: 'OC recibida', hint: 'Del cliente' },
    { id: 'stock_check', label: 'Stock' },
    { id: 'production', label: 'Producción', optional: true },
    { id: 'delivery', label: 'Entrega' },
    { id: 'invoice', label: 'Factura' },
  ],

  delivery_note: [
    { id: 'prepared', label: 'Preparado' },
    { id: 'shipped', label: 'Despachado' },
    { id: 'delivered', label: 'Entregado' },
    { id: 'signed', label: 'Firmado' },
    { id: 'invoiced', label: 'Facturado' },
  ],

  invoice: [
    { id: 'draft', label: 'Borrador' },
    { id: 'emitted', label: 'Emitida' },
    { id: 'authorized', label: 'CAE / AFIP', hint: 'Autorización fiscal' },
    { id: 'sent', label: 'Enviada' },
    { id: 'collected', label: 'Cobrada' },
  ],

  credit_note: [
    { id: 'draft', label: 'Borrador' },
    { id: 'emitted', label: 'Emitida' },
    { id: 'authorized', label: 'CAE' },
    { id: 'applied', label: 'Aplicada' },
  ],

  purchase_order: [
    { id: 'draft', label: 'Borrador' },
    { id: 'sent', label: 'Enviada' },
    { id: 'confirmed', label: 'Confirmada' },
    { id: 'received', label: 'Recepción' },
    { id: 'invoiced', label: 'Facturada' },
    { id: 'paid', label: 'Pagada' },
  ],

  client_po: [
    { id: 'uploaded', label: 'Subida' },
    { id: 'parsed', label: 'Parseada IA' },
    { id: 'matched', label: 'Matcheo', hint: 'vs cotización' },
    { id: 'validated', label: 'Validada' },
    { id: 'order', label: 'Pedido creado' },
  ],

  sat_ticket: [
    { id: 'diagnostico', label: 'Diagnóstico' },
    { id: 'cotizacion', label: 'Cotización' },
    { id: 'reparacion', label: 'Reparación' },
    { id: 'torque', label: 'Torque' },
    { id: 'cierre', label: 'Cierre' },
  ],

  bank_statement: [
    { id: 'uploaded', label: 'Subido' },
    { id: 'parsed', label: 'Parseado IA' },
    { id: 'auto_match', label: 'Auto-match' },
    { id: 'review', label: 'Revisión' },
    { id: 'reconciled', label: 'Conciliado' },
  ],
}

/**
 * Helper: construye los pasos con status según el currentStepId.
 * Los pasos antes del current son 'completed', el current es 'current',
 * el resto 'pending'.
 */
export function buildSteps(
  type: DocumentType,
  currentStepId: string,
  overrides?: Record<string, Partial<ProcessStep>>
): ProcessStep[] {
  const def = WORKFLOWS[type] || []
  const idx = def.findIndex((s) => s.id === currentStepId)
  return def.map((s, i) => {
    const base: ProcessStep = {
      id: s.id,
      label: s.label,
      hint: s.hint,
      optional: s.optional,
      status: i < idx ? 'completed' : i === idx ? 'current' : 'pending',
    }
    return overrides?.[s.id] ? { ...base, ...overrides[s.id] } : base
  })
}

/**
 * Helper alternativo: build por mapa de statuses explícitos.
 */
export function buildStepsByStatus(
  type: DocumentType,
  statuses: Record<string, StepStatus>
): ProcessStep[] {
  const def = WORKFLOWS[type] || []
  return def.map((s) => ({
    id: s.id,
    label: s.label,
    hint: s.hint,
    optional: s.optional,
    status: statuses[s.id] || 'pending',
  }))
}
