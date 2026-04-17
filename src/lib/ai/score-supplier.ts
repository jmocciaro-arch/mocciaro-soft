/**
 * SUPPLIER SCORING — AI
 *
 * Analiza un proveedor (historial de OCs, recepciones, incidencias)
 * y devuelve un score de fiabilidad, entrega, calidad y precio.
 *
 * Gemini primero → Claude fallback (igual que score-lead)
 */

import { askAI } from '@/lib/ai'

export interface SupplierScoreInput {
  name: string
  category?: string | null
  country?: string | null
  /** Total de OCs enviadas */
  total_orders: number
  /** OCs recibidas a tiempo */
  on_time_orders: number
  /** Total facturado al proveedor */
  total_spent: number
  /** Valor promedio de OC */
  avg_order_value: number
  /** Dias promedio de entrega (real) */
  avg_delivery_days?: number
  /** Dias prometidos de entrega */
  promised_delivery_days?: number
  /** Incidencias de calidad registradas */
  quality_issues: number
  /** Reclamos o disputas */
  complaints: number
  /** Ultima interaccion (fecha ISO) */
  last_interaction?: string | null
  /** Notas adicionales / comentarios del equipo */
  notes?: string | null
  /** Interacciones recientes para contexto */
  recent_interactions?: Array<{ type: string; outcome?: string; date: string }>
}

export interface SupplierScoreResult {
  /** Score global 0-100 */
  score: number
  /** Fiabilidad: cumple plazos y condiciones */
  delivery_score: number
  /** Calidad del producto */
  quality_score: number
  /** Competitividad de precios */
  price_score: number
  /** Fiabilidad general (comunicación, doc, etc.) */
  reliability_score: number
  /** Tags descriptivos */
  tags: string[]
  /** Resumen de la evaluacion */
  analysis: string
  /** Accion sugerida */
  suggested_action: string
  /** Proveedor IA que respondio */
  provider_used: 'gemini' | 'claude'
}

const SYSTEM_PROMPT = `Sos el analista de compras de Mocciaro — empresa distribuidora argentina de herramientas industriales.
Tu trabajo es evaluar proveedores basándote en su historial de desempeño.

Criterios de evaluación:
- delivery_score: cumplimiento de plazos (% on-time, días reales vs prometidos)
- quality_score: incidencias de calidad y reclamos vs total de pedidos
- price_score: estimado subjetivo basado en categoría y volumen (sin datos de benchmark)
- reliability_score: comunicación, documentación, respuesta ante problemas

Responder SIEMPRE con JSON estricto, sin markdown, sin texto extra.`

const USER_PROMPT_TEMPLATE = (input: SupplierScoreInput) => `Analizá este proveedor y devolvé JSON con el siguiente formato exacto:

{
  "score": 0-100,
  "delivery_score": 0-100,
  "quality_score": 0-100,
  "price_score": 0-100,
  "reliability_score": 0-100,
  "tags": ["confiable","entrega-tardía","alta-calidad","precio-alto","etc"],
  "analysis": "Resumen de 2-3 oraciones del desempeño del proveedor",
  "suggested_action": "Mantener | Renegociar precios | Monitorear | Buscar alternativa | Dar de baja"
}

Datos del proveedor:
- Nombre: ${input.name}
- Categoría: ${input.category || 'sin categoría'}
- País: ${input.country || 'desconocido'}
- Total OCs: ${input.total_orders}
- OCs a tiempo: ${input.on_time_orders} (${input.total_orders > 0 ? Math.round((input.on_time_orders / input.total_orders) * 100) : 0}%)
- Total facturado: $${input.total_spent.toLocaleString('es-AR')}
- Valor promedio OC: $${input.avg_order_value.toLocaleString('es-AR')}
- Días entrega promedio real: ${input.avg_delivery_days ?? 'desconocido'}
- Días entrega prometidos: ${input.promised_delivery_days ?? 'desconocido'}
- Incidencias de calidad: ${input.quality_issues}
- Reclamos: ${input.complaints}
- Última interacción: ${input.last_interaction ?? 'desconocida'}
${input.notes ? `- Notas: ${input.notes}` : ''}
${input.recent_interactions?.length ? `- Interacciones recientes: ${JSON.stringify(input.recent_interactions)}` : ''}

Tags sugeridos para incluir según contexto:
- "confiable", "entrega-puntual", "entrega-tardía", "alta-calidad", "problemas-calidad",
- "precio-competitivo", "precio-alto", "buena-comunicacion", "mala-comunicacion",
- "pagos-al-dia", "proveedor-estratégico", "proveedor-riesgo", "nuevo-proveedor"

Score global = promedio ponderado (delivery 35%, quality 35%, reliability 20%, price 10%)`

function snapScore(result: SupplierScoreResult): SupplierScoreResult {
  const snap = (n: number) => Math.round(n / 10) * 10
  return {
    ...result,
    score: Math.max(0, Math.min(100, snap(result.score))),
    delivery_score: Math.max(0, Math.min(100, snap(result.delivery_score))),
    quality_score: Math.max(0, Math.min(100, snap(result.quality_score))),
    price_score: Math.max(0, Math.min(100, snap(result.price_score))),
    reliability_score: Math.max(0, Math.min(100, snap(result.reliability_score))),
  }
}

export async function scoreSupplier(
  input: SupplierScoreInput
): Promise<{ data: SupplierScoreResult | null; error?: string }> {
  const messages = [
    { role: 'system' as const, content: SYSTEM_PROMPT },
    { role: 'user' as const, content: USER_PROMPT_TEMPLATE(input) },
  ]

  // Gemini primero
  try {
    const res = await askAI(messages, { provider: 'gemini', maxTokens: 1024 })
    if (!res.error && res.content) {
      const jsonMatch = res.content.match(/\{[\s\S]*\}/)
      const parsed = JSON.parse(jsonMatch ? jsonMatch[0] : res.content) as SupplierScoreResult
      parsed.provider_used = 'gemini'
      return { data: snapScore(parsed) }
    }
  } catch {
    // fallthrough a Claude
  }

  // Claude fallback
  try {
    const res = await askAI(messages, { provider: 'claude', maxTokens: 1024 })
    if (!res.error && res.content) {
      const jsonMatch = res.content.match(/\{[\s\S]*\}/)
      const parsed = JSON.parse(jsonMatch ? jsonMatch[0] : res.content) as SupplierScoreResult
      parsed.provider_used = 'claude'
      return { data: snapScore(parsed) }
    }
    return { data: null, error: res.error }
  } catch (err) {
    return { data: null, error: (err as Error).message }
  }
}
