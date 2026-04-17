/**
 * LEAD SCORING + DRAFT EMAIL
 *
 * Analiza un lead (mensaje + contexto) y devuelve:
 *   - score 0-100
 *   - temperatura hot/warm/cold
 *   - tags descriptivos
 *   - acción sugerida
 *   - draft de email de respuesta (tono Mocciaro)
 *   - necesidades extraídas (productos, presupuesto, urgencia)
 */

import { askAI } from '@/lib/ai'

export interface LeadScoreInput {
  name?: string
  email?: string
  phone?: string
  company?: string
  industry?: string
  source?: string
  rawMessage: string      // mail, whatsapp, formulario web, etc
  estimatedValue?: number
  previousInteractions?: Array<{ type: string; body: string; date: string }>
}

export interface LeadScoreResult {
  score: number
  temperature: 'hot' | 'warm' | 'cold'
  tags: string[]
  reason: string
  suggested_action: string
  suggested_email: string
  needs: {
    productos?: string[]
    presupuesto_estimado?: number
    urgencia?: 'baja' | 'media' | 'alta'
    volumen?: string
    plazo_entrega?: string
  }
  provider_used: 'gemini' | 'claude'
}

const SYSTEM_PROMPT = `Sos el asistente de ventas de Mocciaro — distribuidor argentino de herramientas industriales (taladros FEIN, neumáticas, torquímetros).
Tu trabajo es cualificar leads entrantes y ayudar al equipo comercial.

Tono de respuesta sugerido:
- Profesional pero cálido, argentino (usar "vos")
- Directo al grano, sin tecnicismos innecesarios
- Resaltar experiencia, stock local y soporte técnico
- Firma por defecto: "Saludos, Equipo Mocciaro"

Responder SIEMPRE con JSON estricto, sin markdown, sin texto extra.`

const USER_PROMPT_TEMPLATE = (input: LeadScoreInput) => `Analizá este lead y devolvé JSON con el siguiente formato:

{
  "score": 0-100,
  "temperature": "hot|warm|cold",
  "tags": ["enterprise","price-sensitive","urgente","follow-up","spam","etc"],
  "reason": "Explicación breve (1-2 líneas) del score",
  "suggested_action": "Llamar en 24hs | Mandar cotización | Descalificar | Nurturing",
  "suggested_email": "Draft de email completo, con asunto y cuerpo, listo para enviar",
  "needs": {
    "productos": ["..."],
    "presupuesto_estimado": 0,
    "urgencia": "baja|media|alta",
    "volumen": "unitario|lote|flota",
    "plazo_entrega": "inmediato|30 días|sin definir"
  }
}

Criterios de score — SOLO devolver valores en bandas de 20 (0, 20, 40, 60, 80, 100):
- 100 🔥 hot — enterprise, presupuesto aprobado, urgencia alta, producto específico identificado
- 80  🔥 hot — necesidad concreta + presupuesto estimado + timeline
- 60  🌡️ warm — necesidad identificada, presupuesto/timeline parcial
- 40  🌡️ warm — consulta con datos básicos pero sin compromiso
- 20  ❄️ cold — consulta genérica, falta info crítica
- 0   ❄️ cold — spam, fuera de alcance, no cualificado

IMPORTANTE: el campo "score" en la respuesta DEBE ser uno de: 0, 20, 40, 60, 80, 100. Nada de valores intermedios como 75 u 85.

=== DATOS DEL LEAD ===
Nombre: ${input.name || 'sin nombre'}
Email: ${input.email || 'sin email'}
Empresa: ${input.company || 'sin empresa'}
Industria: ${input.industry || 'sin información'}
Origen: ${input.source || 'desconocido'}
Valor estimado inicial: ${input.estimatedValue ? `$${input.estimatedValue}` : 'sin info'}

Mensaje del lead:
"""
${input.rawMessage}
"""
${input.previousInteractions?.length
  ? `\nInteracciones previas (${input.previousInteractions.length}):\n` +
    input.previousInteractions.map((i) => `- ${i.date} [${i.type}]: ${i.body.slice(0, 200)}`).join('\n')
  : ''}`

/** Fuerza el score a la banda de 20 más cercana (0,20,40,60,80,100) y ajusta temperature */
function snapScore(result: LeadScoreResult): LeadScoreResult {
  const raw = Math.max(0, Math.min(100, Number(result.score) || 0))
  const snapped = Math.round(raw / 20) * 20 as 0 | 20 | 40 | 60 | 80 | 100
  result.score = snapped
  // Re-derivar temperature para que coincida con la banda
  if (snapped >= 80) result.temperature = 'hot'
  else if (snapped >= 40) result.temperature = 'warm'
  else result.temperature = 'cold'
  return result
}

export async function scoreLead(input: LeadScoreInput): Promise<{ data: LeadScoreResult | null; error?: string }> {
  // Gemini primero
  try {
    const res = await askAI(
      [
        { role: 'system', content: SYSTEM_PROMPT },
        { role: 'user', content: USER_PROMPT_TEMPLATE(input) },
      ],
      { provider: 'gemini', maxTokens: 2048 }
    )
    if (!res.error && res.content) {
      const jsonMatch = res.content.match(/\{[\s\S]*\}/)
      const parsed = JSON.parse(jsonMatch ? jsonMatch[0] : res.content) as LeadScoreResult
      parsed.provider_used = 'gemini'
      return { data: snapScore(parsed) }
    }
  } catch {
    // fallthrough
  }

  // Claude fallback
  try {
    const res = await askAI(
      [
        { role: 'system', content: SYSTEM_PROMPT },
        { role: 'user', content: USER_PROMPT_TEMPLATE(input) },
      ],
      { provider: 'claude', maxTokens: 2048 }
    )
    if (!res.error && res.content) {
      const jsonMatch = res.content.match(/\{[\s\S]*\}/)
      const parsed = JSON.parse(jsonMatch ? jsonMatch[0] : res.content) as LeadScoreResult
      parsed.provider_used = 'claude'
      return { data: snapScore(parsed) }
    }
    return { data: null, error: res.error }
  } catch (err) {
    return { data: null, error: (err as Error).message }
  }
}
