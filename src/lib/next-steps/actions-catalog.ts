/**
 * Catálogo de acciones del Next-Step Suggester.
 *
 * Define: label visible, ícono Tabler, shortcut numérico, schema de payload,
 * y si la acción está habilitada en F1 (tooltip explica si no).
 */
import { z } from 'zod'
import type { ActionCode } from './types'

export interface CatalogEntry {
  code: ActionCode
  label: string
  icon: string
  shortcut: string | null
  /** Si false en F1, el chip se muestra deshabilitado con tooltip. */
  enabledInF1: boolean
  /** Tooltip cuando enabledInF1=false. */
  disabledTooltip: string | null
  /** Schema Zod del payload para POST /execute. */
  payloadSchema: z.ZodTypeAny
}

export const ACTIONS_CATALOG: Record<ActionCode, CatalogEntry> = {
  preview_pdf: {
    code: 'preview_pdf',
    label: 'Previsualizar',
    icon: 'ti-eye',
    shortcut: '1',
    enabledInF1: true,
    disabledTooltip: null,
    payloadSchema: z.object({}).strict(),
  },
  send_email: {
    code: 'send_email',
    label: 'Enviar por email',
    icon: 'ti-mail',
    shortcut: '2',
    enabledInF1: true,
    disabledTooltip: null,
    payloadSchema: z
      .object({
        recipients: z
          .array(
            z.object({
              email: z.string().email(),
              name: z.string().optional(),
              type: z.enum(['to', 'cc', 'bcc']).optional(),
            })
          )
          .min(1),
        subject: z.string().optional(),
        body_html: z.string().optional(),
        attachments: z.array(z.string()).optional(),
      })
      .strict(),
  },
  duplicate_for_client: {
    code: 'duplicate_for_client',
    label: 'Duplicar para otro cliente',
    icon: 'ti-copy',
    shortcut: '3',
    enabledInF1: true,
    disabledTooltip: null,
    payloadSchema: z
      .object({
        target_client_id: z.string().uuid(),
      })
      .strict(),
  },
  convert_to_sales_order: {
    code: 'convert_to_sales_order',
    label: 'Convertir a pedido',
    icon: 'ti-arrow-right',
    shortcut: '4',
    enabledInF1: true,
    disabledTooltip: null,
    payloadSchema: z.object({}).strict(),
  },
  schedule_followup: {
    code: 'schedule_followup',
    label: 'Programar seguimiento',
    icon: 'ti-clock',
    shortcut: null,
    enabledInF1: false,
    disabledTooltip: 'Disponible en F3',
    payloadSchema: z.object({}).passthrough(),
  },
  add_internal_note: {
    code: 'add_internal_note',
    label: 'Agregar nota',
    icon: 'ti-note',
    shortcut: null,
    enabledInF1: false,
    disabledTooltip: 'Disponible en F2',
    payloadSchema: z.object({}).passthrough(),
  },
}
