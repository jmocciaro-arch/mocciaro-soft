import { proposedQuoteActionSchema, type ProposedQuoteAction } from '@/lib/schemas/assistant-quote'

/**
 * Extrae la acción propuesta (crear_borrador_cotizacion) del texto que devuelve
 * el modelo, de forma DEFENSIVA: tolera bloque ```action / ```json o un objeto
 * JSON suelto, repara comas finales, valida con Zod y NUNCA tira (si no hay
 * acción válida, devuelve el texto tal cual y action=null).
 */

export interface ParsedAssistantReply {
  reply: string
  action: ProposedQuoteAction | null
}

function tryParseJson(s: string): unknown {
  try { return JSON.parse(s) } catch { /* sigue */ }
  // Reparar comas finales antes de } o ]
  try { return JSON.parse(s.replace(/,(\s*[}\]])/g, '$1')) } catch { /* sigue */ }
  return null
}

export function extractProposedAction(raw: string): ParsedAssistantReply {
  const text = (raw ?? '').trim()
  if (!text) return { reply: '', action: null }

  const candidates: Array<{ json: string; full: string }> = []

  // 1) Bloque fenced ```action / ```json
  const fence = text.match(/```(?:action|json)?\s*([\s\S]*?)```/i)
  if (fence) candidates.push({ json: fence[1].trim(), full: fence[0] })

  // 2) Objeto JSON suelto que mencione el tipo de acción
  if (candidates.length === 0 && text.includes('crear_borrador_cotizacion')) {
    const start = text.indexOf('{')
    const end = text.lastIndexOf('}')
    if (start >= 0 && end > start) {
      const slice = text.slice(start, end + 1)
      candidates.push({ json: slice, full: slice })
    }
  }

  for (const c of candidates) {
    const parsed = tryParseJson(c.json)
    if (!parsed || typeof parsed !== 'object') continue
    const result = proposedQuoteActionSchema.safeParse(parsed)
    if (result.success) {
      const reply = text.replace(c.full, '').trim() || 'Te preparé el borrador. Revisalo y confirmá para crearlo.'
      return { reply, action: result.data }
    }
  }

  return { reply: text, action: null }
}
