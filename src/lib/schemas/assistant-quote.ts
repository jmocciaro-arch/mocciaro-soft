import { z } from 'zod'

/**
 * Schemas del borrador de cotización que arma el asistente IA.
 * Se usan tanto para validar el payload del endpoint POST /api/assistant/create-quote
 * como para validar la acción propuesta por el modelo antes de mostrarla en la tarjeta.
 */

export const assistantQuoteItemSchema = z.object({
  product_id: z.string().uuid().nullable().optional(),
  sku: z.string().trim().min(1).nullable().optional(),
  description: z.string().trim().min(1, 'description requerida'),
  quantity: z.number().positive('quantity debe ser > 0'),
  // Si no viene, el server resuelve el precio (tarifa del cliente -> lista -> catálogo).
  unit_price: z.number().min(0).nullable().optional(),
  discount_pct: z.number().min(0).max(100).optional().default(0),
})

export const createQuoteDraftSchema = z.object({
  company_id: z.string().uuid(),
  client_id: z.string().uuid().nullable().optional(),
  currency: z.string().trim().min(1).max(8),
  notes: z.string().max(2000).optional(),
  tax_rate: z.number().min(0).max(100).optional().default(0),
  items: z.array(assistantQuoteItemSchema).min(1, 'al menos un item').max(100),
})

export type AssistantQuoteItem = z.infer<typeof assistantQuoteItemSchema>
export type CreateQuoteDraftInput = z.infer<typeof createQuoteDraftSchema>
