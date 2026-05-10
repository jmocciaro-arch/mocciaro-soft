/**
 * NEXT STEP RESOLVER
 *
 * Dado un documento (cotización, pedido, albarán, factura), devuelve cuál es
 * el próximo paso lógico que el usuario tiene que ejecutar. Es la fuente de
 * verdad usada por <NextStepPanel>, la bandeja /inicio y los CTAs primarios.
 *
 * Centraliza la lógica que antes estaba duplicada en document-actions.tsx.
 */

import type { LucideIcon } from 'lucide-react'
import {
  Mail, FileText, Package, Truck, CreditCard, DollarSign,
  CheckCircle, AlertTriangle, Clock, ShoppingCart, Box,
} from 'lucide-react'

export type DocSource = 'local' | 'tt_documents'

export type DocKind =
  | 'coti'
  | 'pedido'
  | 'delivery_note'
  | 'factura'
  | 'lead'
  | 'opportunity'
  | 'purchase_order'
  | 'purchase_invoice'
  | 'sat_ticket'

export interface NextStepAction {
  /** Identificador estable de la acción (ej. "generate_order") */
  key: string
  /** Texto del botón principal — visible al usuario */
  label: string
  /** Subtítulo / hint que explica por qué es el siguiente paso */
  hint: string
  /** Ícono lucide */
  icon: LucideIcon
  /** Variante visual para colorear el panel */
  tone: 'primary' | 'success' | 'warning' | 'danger' | 'neutral'
  /** Acción "blocked": se muestra el botón deshabilitado con razón */
  blocked?: boolean
  blockedReason?: string
}

export interface NextStepResult {
  /** Estado humano legible del documento ahora mismo */
  currentLabel: string
  /** ¿Está completado / no requiere acción? */
  done: boolean
  /** Acción primaria (botón gigante naranja) */
  primary: NextStepAction | null
  /** Acciones secundarias (botones outline) */
  secondary: NextStepAction[]
  /** Razones por las que NO se puede avanzar (bloqueos) */
  blockers: string[]
}

type Doc = Record<string, unknown>

const norm = (s: unknown) => String(s ?? '').toLowerCase().trim()

// ---------------------------------------------------------------
// COTIZACIÓN
// ---------------------------------------------------------------
function nextStepCoti(doc: Doc): NextStepResult {
  const status = norm(doc.status)
  const total = Number(doc.total) || 0
  const blockers: string[] = []
  if (!doc.client_id && !doc.customer_id) blockers.push('Falta seleccionar cliente')
  if (total <= 0) blockers.push('La cotización no tiene importe')

  if (status === 'draft' || status === 'borrador' || status === '') {
    return {
      currentLabel: 'Borrador',
      done: false,
      primary: {
        key: 'send',
        label: 'Enviar al cliente',
        hint: blockers.length ? blockers[0] : 'La cotización está lista para mandar por mail/WhatsApp',
        icon: Mail,
        tone: 'primary',
        blocked: blockers.length > 0,
        blockedReason: blockers[0],
      },
      secondary: [
        { key: 'pdf', label: 'Generar PDF', hint: 'Descargar para revisar', icon: FileText, tone: 'neutral' },
        { key: 'accept', label: 'Marcar aceptada', hint: 'Si el cliente ya confirmó verbalmente', icon: CheckCircle, tone: 'success' },
      ],
      blockers,
    }
  }

  if (status === 'sent' || status === 'enviada') {
    return {
      currentLabel: 'Enviada — esperando respuesta',
      done: false,
      primary: {
        key: 'accept',
        label: 'Marcar aceptada',
        hint: 'Cuando el cliente confirme, esto la convierte en pedido',
        icon: CheckCircle,
        tone: 'success',
      },
      secondary: [
        { key: 'reject', label: 'Marcar rechazada', hint: 'Cerrar como perdida', icon: AlertTriangle, tone: 'danger' },
        { key: 'send', label: 'Reenviar', hint: 'Recordar al cliente', icon: Mail, tone: 'neutral' },
      ],
      blockers,
    }
  }

  if (status === 'accepted' || status === 'aceptada') {
    return {
      currentLabel: 'Aceptada por el cliente',
      done: false,
      primary: {
        key: 'generate_order',
        label: 'Convertir a pedido',
        hint: 'Generar PED-XXXX y reservar stock',
        icon: Package,
        tone: 'primary',
      },
      secondary: [
        { key: 'pdf', label: 'PDF firmado', hint: 'Para archivo', icon: FileText, tone: 'neutral' },
      ],
      blockers,
    }
  }

  if (status === 'rejected' || status === 'rechazada') {
    return {
      currentLabel: 'Rechazada / Perdida',
      done: true,
      primary: null,
      secondary: [
        { key: 'reopen', label: 'Reabrir', hint: 'Volver a borrador para renegociar', icon: Mail, tone: 'neutral' },
      ],
      blockers,
    }
  }

  return {
    currentLabel: status || 'Sin estado',
    done: false,
    primary: null,
    secondary: [],
    blockers,
  }
}

// ---------------------------------------------------------------
// PEDIDO
// ---------------------------------------------------------------
function nextStepPedido(doc: Doc): NextStepResult {
  const status = norm(doc.status)
  const blockers: string[] = []
  const stockOk = doc._stock_ready as boolean | undefined

  if (status === 'fully_delivered') {
    return {
      currentLabel: 'Entregado al cliente',
      done: false,
      primary: {
        key: 'invoice_direct',
        label: 'Emitir factura',
        hint: 'Cerrar el ciclo: facturar lo entregado',
        icon: CreditCard,
        tone: 'primary',
      },
      secondary: [],
      blockers,
    }
  }

  if (status === 'partially_delivered') {
    return {
      currentLabel: 'Entrega parcial',
      done: false,
      primary: {
        key: 'generate_delivery',
        label: 'Crear remito por el saldo',
        hint: 'Quedan items pendientes de entregar',
        icon: Truck,
        tone: 'primary',
      },
      secondary: [
        { key: 'invoice_direct', label: 'Facturar lo entregado', hint: 'Si querés cobrar lo que ya salió', icon: CreditCard, tone: 'neutral' },
      ],
      blockers,
    }
  }

  if (status === 'open' || status === 'accepted' || status === 'confirmado' || status === '') {
    if (stockOk === false) blockers.push('Falta stock — generar pedido de compra primero')
    return {
      currentLabel: 'Confirmado — listo para preparar',
      done: false,
      primary: {
        key: 'generate_delivery',
        label: 'Crear remito / albarán',
        hint: blockers.length ? blockers[0] : 'Reserva el stock y genera el documento de entrega',
        icon: Truck,
        tone: 'primary',
        blocked: blockers.length > 0,
        blockedReason: blockers[0],
      },
      secondary: [
        { key: 'invoice_direct', label: 'Facturar directo', hint: 'Saltear remito (servicios)', icon: CreditCard, tone: 'neutral' },
        { key: 'send', label: 'Enviar confirmación', hint: 'Avisar al cliente', icon: Mail, tone: 'neutral' },
      ],
      blockers,
    }
  }

  return { currentLabel: status || 'Sin estado', done: false, primary: null, secondary: [], blockers }
}

// ---------------------------------------------------------------
// REMITO / ALBARÁN
// ---------------------------------------------------------------
function nextStepDelivery(doc: Doc): NextStepResult {
  const status = norm(doc.status)

  if (status === 'closed' || status === 'invoiced' || status === 'fully_invoiced') {
    return {
      currentLabel: 'Facturado',
      done: true,
      primary: null,
      secondary: [{ key: 'pdf', label: 'PDF', hint: 'Descargar comprobante', icon: FileText, tone: 'neutral' }],
      blockers: [],
    }
  }

  return {
    currentLabel: status === 'delivered' ? 'Entregado al cliente' : 'Pendiente de facturar',
    done: false,
    primary: {
      key: 'generate_invoice',
      label: 'Emitir factura',
      hint: 'Convertir el remito en factura para cobrar',
      icon: CreditCard,
      tone: 'primary',
    },
    secondary: [
      { key: 'pdf', label: 'PDF', hint: 'Comprobante de entrega', icon: FileText, tone: 'neutral' },
    ],
    blockers: [],
  }
}

// ---------------------------------------------------------------
// FACTURA
// ---------------------------------------------------------------
function nextStepFactura(doc: Doc): NextStepResult {
  const status = norm(doc.status)
  const total = Number(doc.total) || 0
  const paid = Number(doc.paid_amount) || 0
  const dueDate = doc.due_date as string | null
  const overdue = dueDate ? new Date(dueDate) < new Date() : false

  if (status === 'paid' || status === 'collected' || (paid >= total && total > 0)) {
    return {
      currentLabel: 'Cobrada',
      done: true,
      primary: null,
      secondary: [{ key: 'pdf', label: 'PDF', hint: 'Comprobante', icon: FileText, tone: 'neutral' }],
      blockers: [],
    }
  }

  if (status === 'partial') {
    return {
      currentLabel: `Cobro parcial (${paid.toFixed(2)} / ${total.toFixed(2)})`,
      done: false,
      primary: {
        key: 'register_payment',
        label: 'Registrar saldo',
        hint: `Falta cobrar ${(total - paid).toFixed(2)}`,
        icon: DollarSign,
        tone: 'warning',
      },
      secondary: [
        { key: 'send', label: 'Recordar al cliente', hint: 'Enviar mail de seguimiento', icon: Mail, tone: 'neutral' },
      ],
      blockers: [],
    }
  }

  if (status === 'draft' || status === 'borrador') {
    return {
      currentLabel: 'Borrador',
      done: false,
      primary: {
        key: 'send',
        label: 'Enviar al cliente',
        hint: 'Esto la marca como Emitida',
        icon: Mail,
        tone: 'primary',
      },
      secondary: [
        { key: 'pdf', label: 'PDF', hint: 'Revisar antes de enviar', icon: FileText, tone: 'neutral' },
      ],
      blockers: [],
    }
  }

  // Emitida / pendiente de cobro
  return {
    currentLabel: overdue ? 'Vencida — gestionar cobro' : 'Emitida — esperando cobro',
    done: false,
    primary: {
      key: 'register_payment',
      label: 'Registrar cobro',
      hint: overdue
        ? '⚠️ La factura está vencida — priorizar el cobro'
        : 'Cuando entre la transferencia, registrala acá',
      icon: DollarSign,
      tone: overdue ? 'danger' : 'primary',
    },
    secondary: [
      { key: 'send', label: 'Reenviar / recordar', hint: 'Mandar otra vez al cliente', icon: Mail, tone: 'neutral' },
      { key: 'pdf', label: 'PDF', hint: 'Comprobante', icon: FileText, tone: 'neutral' },
    ],
    blockers: overdue ? [`Vence el ${dueDate}`] : [],
  }
}

// ---------------------------------------------------------------
// LEAD / OPORTUNIDAD
// ---------------------------------------------------------------
function nextStepLead(doc: Doc): NextStepResult {
  const stage = norm(doc.stage || doc.status)

  if (stage === 'lead' || stage === '') {
    return {
      currentLabel: 'Lead nuevo',
      done: false,
      primary: {
        key: 'qualify',
        label: 'Cualificar',
        hint: 'Validar interés y crear oportunidad',
        icon: CheckCircle,
        tone: 'primary',
      },
      secondary: [
        { key: 'discard', label: 'Descartar', hint: 'No es para nosotros', icon: AlertTriangle, tone: 'danger' },
      ],
      blockers: [],
    }
  }

  if (stage === 'propuesta' || stage === 'proposal') {
    return {
      currentLabel: 'En propuesta',
      done: false,
      primary: {
        key: 'create_quote',
        label: 'Crear cotización',
        hint: 'Pasar de oportunidad a presupuesto formal',
        icon: FileText,
        tone: 'primary',
      },
      secondary: [
        { key: 'schedule_followup', label: 'Programar seguimiento', hint: 'Recordatorio de contacto', icon: Clock, tone: 'neutral' },
      ],
      blockers: [],
    }
  }

  if (stage === 'negociacion' || stage === 'negotiation') {
    return {
      currentLabel: 'Negociando',
      done: false,
      primary: {
        key: 'mark_won',
        label: 'Marcar como ganado',
        hint: 'Y disparar generación de pedido',
        icon: CheckCircle,
        tone: 'success',
      },
      secondary: [
        { key: 'mark_lost', label: 'Marcar perdido', hint: 'Con motivo de pérdida', icon: AlertTriangle, tone: 'danger' },
      ],
      blockers: [],
    }
  }

  if (stage === 'ganado' || stage === 'won') {
    return {
      currentLabel: 'Ganado',
      done: true,
      primary: {
        key: 'create_order',
        label: 'Generar pedido',
        hint: 'Cerrar el ciclo comercial',
        icon: Package,
        tone: 'primary',
      },
      secondary: [],
      blockers: [],
    }
  }

  return { currentLabel: stage || 'Sin etapa', done: stage === 'perdido', primary: null, secondary: [], blockers: [] }
}

// ---------------------------------------------------------------
// PEDIDO DE COMPRA
// ---------------------------------------------------------------
function nextStepPurchaseOrder(doc: Doc): NextStepResult {
  const status = norm(doc.status)

  if (status === 'draft' || status === 'borrador') {
    return {
      currentLabel: 'Borrador',
      done: false,
      primary: { key: 'send_po', label: 'Enviar al proveedor', hint: 'Mandar la OC por mail', icon: Mail, tone: 'primary' },
      secondary: [{ key: 'pdf', label: 'PDF', hint: 'Revisar', icon: FileText, tone: 'neutral' }],
      blockers: [],
    }
  }

  if (status === 'sent' || status === 'confirmed') {
    return {
      currentLabel: 'Enviada — esperando recepción',
      done: false,
      primary: { key: 'receive', label: 'Registrar recepción', hint: 'Cuando llegue la mercadería', icon: ShoppingCart, tone: 'primary' },
      secondary: [],
      blockers: [],
    }
  }

  if (status === 'received') {
    return {
      currentLabel: 'Recibida',
      done: false,
      primary: { key: 'register_invoice', label: 'Registrar factura proveedor', hint: 'Cargar la factura recibida', icon: FileText, tone: 'primary' },
      secondary: [],
      blockers: [],
    }
  }

  return { currentLabel: status, done: status === 'paid', primary: null, secondary: [], blockers: [] }
}

// ---------------------------------------------------------------
// FACTURA DE COMPRA
// ---------------------------------------------------------------
function nextStepPurchaseInvoice(doc: Doc): NextStepResult {
  const status = norm(doc.status)
  const total = Number(doc.total) || 0
  const paid = Number(doc.paid_amount) || 0

  if (status === 'paid' || paid >= total) {
    return { currentLabel: 'Pagada', done: true, primary: null, secondary: [], blockers: [] }
  }

  return {
    currentLabel: 'Pendiente de pago',
    done: false,
    primary: {
      key: 'register_supplier_payment',
      label: 'Registrar pago',
      hint: `Falta pagar ${(total - paid).toFixed(2)}`,
      icon: DollarSign,
      tone: 'primary',
    },
    secondary: [],
    blockers: [],
  }
}

// ---------------------------------------------------------------
// TICKET SAT
// ---------------------------------------------------------------
function nextStepSat(doc: Doc): NextStepResult {
  const status = norm(doc.status)

  if (status === 'cerrado' || status === 'resuelto') {
    return { currentLabel: 'Cerrado', done: true, primary: null, secondary: [], blockers: [] }
  }

  if (status === 'esperando_repuesto') {
    return {
      currentLabel: 'Esperando repuesto',
      done: false,
      primary: { key: 'check_stock', label: 'Verificar llegada de repuesto', hint: 'Si llegó, continuar reparación', icon: Box, tone: 'warning' },
      secondary: [],
      blockers: ['Bloqueado por repuesto'],
    }
  }

  if (status === 'en_proceso') {
    return {
      currentLabel: 'En reparación',
      done: false,
      primary: { key: 'finish_repair', label: 'Marcar como resuelto', hint: 'Cuando termines la reparación', icon: CheckCircle, tone: 'primary' },
      secondary: [],
      blockers: [],
    }
  }

  return {
    currentLabel: 'Abierto',
    done: false,
    primary: { key: 'start_diagnosis', label: 'Iniciar diagnóstico', hint: 'Evaluar la falla', icon: CheckCircle, tone: 'primary' },
    secondary: [],
    blockers: [],
  }
}

// ---------------------------------------------------------------
// FACHADA PÚBLICA
// ---------------------------------------------------------------

/**
 * Calcula el siguiente paso lógico para un documento.
 *
 * @param doc Registro de la base de datos (debe incluir al menos `status`)
 * @param kind Tipo de documento
 */
export function getNextStep(doc: Doc, kind: DocKind): NextStepResult {
  if (!doc) {
    return { currentLabel: 'Sin documento', done: false, primary: null, secondary: [], blockers: [] }
  }

  switch (kind) {
    case 'coti': return nextStepCoti(doc)
    case 'pedido': return nextStepPedido(doc)
    case 'delivery_note': return nextStepDelivery(doc)
    case 'factura': return nextStepFactura(doc)
    case 'lead':
    case 'opportunity': return nextStepLead(doc)
    case 'purchase_order': return nextStepPurchaseOrder(doc)
    case 'purchase_invoice': return nextStepPurchaseInvoice(doc)
    case 'sat_ticket': return nextStepSat(doc)
    default: return { currentLabel: 'Desconocido', done: false, primary: null, secondary: [], blockers: [] }
  }
}

/**
 * Inferir el `DocKind` a partir de un row genérico de tt_documents.
 */
export function inferKind(doc: Doc): DocKind {
  const t = norm(doc.type || doc.doc_type)
  if (t === 'presupuesto' || t === 'quote' || t === 'cotizacion') return 'coti'
  if (t === 'pedido' || t === 'sales_order' || t === 'order') return 'pedido'
  if (t === 'albaran' || t === 'remito' || t === 'delivery_note') return 'delivery_note'
  if (t === 'factura' || t === 'invoice' || t === 'factura_abono') return 'factura'
  if (t === 'pap' || t === 'purchase_order') return 'purchase_order'
  if (t === 'factura_compra' || t === 'purchase_invoice') return 'purchase_invoice'
  if (t === 'lead') return 'lead'
  if (t === 'opportunity' || t === 'oportunidad') return 'opportunity'
  if (t === 'sat_ticket' || t === 'sat') return 'sat_ticket'
  return 'coti'
}
