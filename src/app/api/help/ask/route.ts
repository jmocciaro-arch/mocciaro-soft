import { NextRequest, NextResponse } from 'next/server'
import fs from 'node:fs/promises'
import path from 'node:path'
import { callClaude } from '@/lib/ai/ai-helper'
import { requireAuth } from '@/lib/auth/require-admin'

export const runtime = 'nodejs'
export const maxDuration = 30

/**
 * POST /api/help/ask
 *
 * Body: { question: string, history?: Array<{ role: 'user'|'assistant', content: string }> }
 *
 * Asistente IA del soft. Responde preguntas del usuario basándose en el
 * manual de usuario (docs/MANUAL-USUARIO-MOCCIARO-SOFT.md). Usa Claude
 * Haiku 4.5 con prompt caching del manual (el manual es ~80KB, se
 * cachea ephemeral por 5 min para abaratar consultas seguidas).
 */

let manualCache: { text: string; mtime: number } | null = null

async function loadManual(): Promise<string> {
  const manualPath = path.join(process.cwd(), 'docs', 'MANUAL-USUARIO-MOCCIARO-SOFT.md')
  const stat = await fs.stat(manualPath)
  if (manualCache && manualCache.mtime === stat.mtimeMs) {
    return manualCache.text
  }
  const text = await fs.readFile(manualPath, 'utf-8')
  manualCache = { text, mtime: stat.mtimeMs }
  return text
}

export async function POST(req: NextRequest) {
  const auth = await requireAuth()
  if (!auth.ok) return auth.response

  let body: { question?: string; history?: Array<{ role: 'user' | 'assistant'; content: string }> }
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'JSON inválido' }, { status: 400 })
  }

  const question = (body.question || '').trim()
  if (!question) {
    return NextResponse.json({ error: 'Pregunta vacía' }, { status: 400 })
  }
  if (question.length > 1000) {
    return NextResponse.json({ error: 'Pregunta demasiado larga (max 1000 caracteres)' }, { status: 400 })
  }

  let manual: string
  try {
    manual = await loadManual()
  } catch (e) {
    return NextResponse.json(
      { error: `No se pudo cargar el manual: ${(e as Error).message}` },
      { status: 500 }
    )
  }

  // System prompt con el manual entero. El cacheSystemPrompt:true marca
  // este bloque como ephemeral (5 min TTL en Anthropic) — la primera
  // request paga el manual, las siguientes en 5 min reusan el cache
  // (90% más barato).
  const systemPrompt = `Sos el asistente integrado del soft "Mocciaro Soft" (un ERP/CRM web).

Tu tarea: responder preguntas del usuario basándote ÚNICAMENTE en el contenido del manual de usuario que te paso abajo. Si la pregunta no está cubierta en el manual, decilo claramente ("Esto no está cubierto en el manual"); no inventes funcionalidad.

Reglas:
- Respondé SIEMPRE en español rioplatense (voseo, "vos" en lugar de "tú").
- Sé conciso: máximo 4 párrafos cortos. Si hace falta listar pasos, usá numeración.
- Si la respuesta involucra una pantalla o ruta del soft, mencioná la ruta exacta (ej: "andá a /cotizador") y/o el botón visible (ej: "click en 'Importar OC'").
- Si el usuario pregunta cómo hacer algo y hay un atajo de teclado, mencioná el atajo.
- NO inventes endpoints API, IDs, nombres de tabla u otros detalles técnicos. Si te lo preguntan y no está en el manual, redirigí al manual o decí que no está documentado.
- Si la pregunta es ambigua, pediendo clarificación corta antes de responder.

═══════════ MANUAL DE USUARIO COMPLETO ═══════════

${manual}

═══════════════════════════════════════════════════`

  // Mensajes: incluir history (si lo hay) + pregunta nueva
  type AnthropicMessage = { role: 'user' | 'assistant'; content: string }
  const messages: AnthropicMessage[] = []
  for (const m of (body.history || []).slice(-6)) {
    if (m.role === 'user' || m.role === 'assistant') {
      messages.push({ role: m.role, content: m.content })
    }
  }
  messages.push({ role: 'user', content: question })

  // Adaptamos al wrapper callClaude (que espera userContent como array de bloques)
  // Para chat multi-turn convertimos los messages a bloques alternados.
  // Como callClaude solo acepta un único userContent, hacemos llamada directa
  // a Anthropic Messages API en este caso para soportar history.

  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey) {
    return NextResponse.json({ error: 'ANTHROPIC_API_KEY no configurada' }, { status: 500 })
  }

  // Si NO hay history, usamos callClaude (con cache + tracking)
  if (messages.length === 1) {
    const result = await callClaude({
      operation: 'help_assistant',
      systemPrompt,
      userContent: [{ type: 'text', text: question }],
      cacheKeyInput: question.toLowerCase(),
      maxTokens: 1024,
      useCache: true,
      cacheSystemPrompt: true,
      userId: auth.ttUserId,
    })
    if (!result.data) {
      return NextResponse.json({ error: result.error || 'Sin respuesta' }, { status: 500 })
    }
    return NextResponse.json({
      answer: result.data,
      meta: { cacheHit: result.cacheHit, costUsd: result.costUsd, model: result.model },
    })
  }

  // Multi-turn: llamada directa con history. Sin response cache (cada conversación es única).
  try {
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 1024,
        system: [{ type: 'text', text: systemPrompt, cache_control: { type: 'ephemeral' } }],
        messages,
      }),
    })
    if (!res.ok) {
      const t = await res.text()
      return NextResponse.json(
        { error: `Anthropic API error ${res.status}: ${t.slice(0, 200)}` },
        { status: 500 }
      )
    }
    const j = await res.json() as {
      content: Array<{ type: string; text?: string }>
      usage?: { input_tokens: number; output_tokens: number; cache_read_input_tokens?: number }
    }
    const answer = j.content?.find(c => c.type === 'text')?.text || ''
    return NextResponse.json({
      answer,
      meta: {
        cacheHit: (j.usage?.cache_read_input_tokens ?? 0) > 0,
        inputTokens: j.usage?.input_tokens,
        outputTokens: j.usage?.output_tokens,
        cacheReadTokens: j.usage?.cache_read_input_tokens,
        model: 'claude-haiku-4-5-20251001',
      },
    })
  } catch (e) {
    return NextResponse.json({ error: `Error de red: ${(e as Error).message}` }, { status: 500 })
  }
}
