/**
 * Next-Step Suggester — tipos + Zod schemas
 *
 * F1: solo doc_type='quotation' está soportado (acepta tt_documents
 * con doc_type IN ('presupuesto','quotation') y la tabla legacy tt_quotes).
 */
import { z } from 'zod'

export const ACTION_CODES = [
  'preview_pdf',
  'send_email',
  'duplicate_for_client',
  'convert_to_sales_order',
  'schedule_followup',
  'add_internal_note',
] as const

export type ActionCode = (typeof ACTION_CODES)[number]

export const DOC_TYPES = ['quotation'] as const
export type DocTypeKey = (typeof DOC_TYPES)[number]

export interface ActionDescriptor {
  code: ActionCode
  label: string
  icon: string
  shortcut: string | null
  enabled: boolean
  tooltip: string | null
}

export interface NextStepsResponse {
  doc_type: DocTypeKey
  doc_id: string
  doc_status: string
  actions: ActionDescriptor[]
  suggested: ActionCode
}

// ── Zod schemas ──────────────────────────────────────────────────────────────

export const docTypeSchema = z.enum(DOC_TYPES)
export const actionCodeSchema = z.enum(ACTION_CODES)

export const nextStepsQuerySchema = z.object({
  doc_type: docTypeSchema,
  doc_id: z.string().uuid(),
})

// Payload schemas por action (los strictos van en actions-catalog.ts)
export const executeBodySchema = z.object({
  doc_type: docTypeSchema,
  doc_id: z.string().uuid(),
  action_code: actionCodeSchema,
  payload: z.record(z.string(), z.unknown()).optional().default({}),
})

export type ExecuteBody = z.infer<typeof executeBodySchema>
