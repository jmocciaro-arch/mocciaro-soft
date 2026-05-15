/**
 * delivery-rules.ts — FASE 1.5
 *
 * Reglas puras (sin Supabase) para decidir si una propuesta de REM
 * dispara overdelivery, calcular saldos pendientes, y validar
 * pre-commit.
 *
 * Extraído como módulo separado para que sea testeable sin mocks.
 */

export interface OrderLineSummary {
  /** ID del so_item / document_line */
  id: string
  /** Cantidad pedida en el PED */
  ordered: number
  /** Cantidad ya entregada en REMs previos */
  delivered: number
}

export interface DeliveryProposalLine {
  id: string
  toDeliver: number
}

export interface OverdeliveryCheck {
  id: string
  ordered: number
  delivered: number
  toDeliver: number
  pending: number
  excess: number
}

/**
 * Identifica qué líneas exceden la cantidad pendiente.
 * pending = max(0, ordered - delivered)
 * excess  = max(0, toDeliver - pending)
 */
export function checkOverdelivery(
  orderLines: OrderLineSummary[],
  proposal: DeliveryProposalLine[]
): OverdeliveryCheck[] {
  const out: OverdeliveryCheck[] = []
  const byId = new Map(orderLines.map((l) => [l.id, l]))
  for (const p of proposal) {
    const line = byId.get(p.id)
    if (!line) continue
    const pending = Math.max(0, line.ordered - line.delivered)
    const excess = Math.max(0, p.toDeliver - pending)
    if (excess > 0) {
      out.push({
        id: line.id,
        ordered: line.ordered,
        delivered: line.delivered,
        toDeliver: p.toDeliver,
        pending,
        excess,
      })
    }
  }
  return out
}

export interface DeliveryEligibility {
  /** El REM puede emitirse sin más permisos */
  allowed: boolean
  /** Si requiere allow_overdelivery, lista de líneas en exceso */
  overdeliveryLines: OverdeliveryCheck[]
  /** Motivo cuando allowed=false */
  reason?: string
}

/**
 * Determina si una propuesta de REM puede emitirse, considerando:
 *  - si hay overdelivery: requiere permiso + motivo
 *  - si toDeliver=0 en todas las líneas: no se puede emitir
 *  - si alguna toDeliver es negativa: error
 */
export function evaluateDeliveryProposal(args: {
  orderLines: OrderLineSummary[]
  proposal: DeliveryProposalLine[]
  hasOverdeliveryPermission: boolean
  overdeliveryReason?: string | null
}): DeliveryEligibility {
  if (args.proposal.some((p) => p.toDeliver < 0)) {
    return { allowed: false, overdeliveryLines: [], reason: 'Cantidades negativas no permitidas' }
  }

  const totalToDeliver = args.proposal.reduce((s, p) => s + p.toDeliver, 0)
  if (totalToDeliver === 0) {
    return { allowed: false, overdeliveryLines: [], reason: 'Selecciona al menos un ítem para entregar' }
  }

  const overdeliveryLines = checkOverdelivery(args.orderLines, args.proposal)
  if (overdeliveryLines.length === 0) {
    return { allowed: true, overdeliveryLines: [] }
  }

  if (!args.hasOverdeliveryPermission) {
    return {
      allowed: false,
      overdeliveryLines,
      reason: `${overdeliveryLines.length} ítem(s) exceden lo pendiente del pedido. Requiere permiso allow_overdelivery.`,
    }
  }

  if (!args.overdeliveryReason || args.overdeliveryReason.trim().length < 3) {
    return {
      allowed: false,
      overdeliveryLines,
      reason: 'Motivo de sobreentrega requerido (mínimo 3 caracteres).',
    }
  }

  return { allowed: true, overdeliveryLines }
}

/**
 * Calcula si un PED se cierra automáticamente al sumar los REMs.
 * `closed` cuando para TODAS las líneas: delivered >= ordered.
 */
export function isOrderFullyDelivered(orderLines: OrderLineSummary[]): boolean {
  if (orderLines.length === 0) return false
  return orderLines.every((l) => l.delivered >= l.ordered)
}
