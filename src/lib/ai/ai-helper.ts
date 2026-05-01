/**
 * AI Helper — cache de respuestas + tracking de consumo + prompt caching.
 *
 * Optimizaciones implementadas:
 * 1. Modelo Haiku 4.5 por default (3x más barato que Sonnet con calidad similar para tareas estructuradas)
 * 2. Prompt caching (ephemeral) de system prompts — reduce 90% costo de tokens de sistema repetidos
 * 3. Cache de respuestas por hash SHA256 del input — evita re-llamar la API si el mismo PDF ya fue procesado
 * 4. Tracking de consumo en tt_ai_usage — visibilidad de costos reales por operación
 */

import crypto from 'crypto'
import { createClient as createServiceClient } from '@supabase/supabase-js'

// ================================================================
// PRECIOS por millón de tokens (actualizar si cambian)
// Fuente: https://docs.anthropic.com/en/docs/about-claude/pricing
// ================================================================
export const CLAUDE_PRICING: Record<string, { input: number; cache_write: number; cache_read: number; output: number }> = {
  // Haiku 4.5: la opción recomendada para extracción estructurada de documentos
  'claude-haiku-4-5-20250929':  { input: 1.00,  cache_write: 1.25, cache_read: 0.10, output: 5.00 },
  // Sonnet 4.5: más potente pero 3x más caro
  'claude-sonnet-4-5-20250929': { input: 3.00,  cache_write: 3.75, cache_read: 0.30, output: 15.00 },
  // Opus 4: el más caro, reservar para tareas de razonamiento complejo
  'claude-opus-4-20250514':     { input: 15.00, cache_write: 18.75, cache_read: 1.50, output: 75.00 },
}

// Modelo default (barato y suficiente para OC parsing)
export const DEFAULT_MODEL = 'claude-haiku-4-5-20250929'

// ================================================================
// CACHE — por hash SHA256 del input
// ================================================================

export function hashInput(...parts: string[]): string {
  const h = crypto.createHash('sha256')
  for (const p of parts) h.update(p)
  return h.digest('hex')
}

export interface CachedResult<T = unknown> {
  output: T
  hit: true
  model_used: string | null
  input_tokens: number | null
  output_tokens: number | null
  cost_usd: number
  cached_at: string
}

/** Busca resultado en cache. Si existe, incrementa hit_count y actualiza last_hit_at. */
export async function lookupCache<T = unknown>(
  operation: string,
  cacheKey: string
): Promise<CachedResult<T> | null> {
  const sb = createServiceClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } }
  )
  const { data } = await sb
    .from('tt_ai_cache')
    .select('*')
    .eq('cache_key', cacheKey)
    .eq('operation', operation)
    .single()
  if (!data) return null

  // Incrementar hit count en background (sin await bloqueante)
  void sb.from('tt_ai_cache').update({
    hit_count: (data.hit_count || 0) + 1,
    last_hit_at: new Date().toISOString(),
  }).eq('id', data.id)

  return {
    output: data.output as T,
    hit: true,
    model_used: data.model_used,
    input_tokens: data.input_tokens,
    output_tokens: data.output_tokens,
    cost_usd: Number(data.cost_usd || 0),
    cached_at: data.created_at,
  }
}

/** Guarda resultado en cache. */
export async function saveCache(params: {
  operation: string
  cacheKey: string
  inputPreview?: string
  output: unknown
  model?: string
  inputTokens?: number
  outputTokens?: number
  costUsd?: number
}): Promise<void> {
  const sb = createServiceClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } }
  )
  await sb.from('tt_ai_cache').upsert(
    {
      cache_key: params.cacheKey,
      operation: params.operation,
      input_preview: params.inputPreview?.slice(0, 200),
      output: params.output,
      model_used: params.model,
      input_tokens: params.inputTokens,
      output_tokens: params.outputTokens,
      cost_usd: params.costUsd ?? 0,
    },
    { onConflict: 'cache_key' }
  )
}

// ================================================================
// TRACKING — registra cada request para ver consumo
// ================================================================

export interface UsageLogParams {
  operation: string
  provider: 'claude' | 'gemini'
  model?: string
  inputTokens?: number
  outputTokens?: number
  cacheReadTokens?: number
  cacheHit?: boolean
  costUsd?: number
  durationMs?: number
  userId?: string | null
  companyId?: string | null
  referenceType?: string
  referenceId?: string | null
  metadata?: Record<string, unknown>
}

export async function logUsage(params: UsageLogParams): Promise<void> {
  try {
    const sb = createServiceClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
      { auth: { persistSession: false } }
    )
    await sb.from('tt_ai_usage').insert({
      operation: params.operation,
      provider: params.provider,
      model: params.model,
      input_tokens: params.inputTokens ?? 0,
      output_tokens: params.outputTokens ?? 0,
      cache_read_tokens: params.cacheReadTokens ?? 0,
      cache_hit: params.cacheHit ?? false,
      cost_usd: params.costUsd ?? 0,
      duration_ms: params.durationMs,
      user_id: params.userId ?? null,
      company_id: params.companyId ?? null,
      reference_type: params.referenceType,
      reference_id: params.referenceId ?? null,
      metadata: params.metadata ?? null,
    })
  } catch (err) {
    // No queremos romper la operación principal por un error de tracking
    console.error('[AI usage log] error:', err)
  }
}

// ================================================================
// CÁLCULO DE COSTO en USD
// ================================================================

export function calcClaudeCost(params: {
  model: string
  inputTokens: number
  outputTokens: number
  cacheWriteTokens?: number
  cacheReadTokens?: number
}): number {
  const p = CLAUDE_PRICING[params.model]
  if (!p) return 0
  const cost =
    (params.inputTokens / 1_000_000) * p.input +
    (params.outputTokens / 1_000_000) * p.output +
    ((params.cacheWriteTokens ?? 0) / 1_000_000) * p.cache_write +
    ((params.cacheReadTokens ?? 0) / 1_000_000) * p.cache_read
  return Number(cost.toFixed(4))
}

// ================================================================
// WRAPPER DE LLAMADA A CLAUDE con cache + tracking
// ================================================================

export interface ClaudeCallParams {
  operation: string
  systemPrompt: string
  userContent: Array<Record<string, unknown>>   // tal como va al body de Messages API
  cacheKeyInput: string                         // string para hashear (ej: PDF base64)
  model?: string
  maxTokens?: number
  useCache?: boolean                            // si es true, consulta cache primero
  cacheSystemPrompt?: boolean                   // si es true, marca system prompt como cacheable (ephemeral)
  userId?: string | null
  companyId?: string | null
  referenceType?: string
  referenceId?: string | null
}

export interface ClaudeCallResult<T = string> {
  data: T | null
  error?: string
  cacheHit: boolean
  costUsd: number
  model: string
  inputTokens: number
  outputTokens: number
  cacheReadTokens: number
}

export async function callClaude(params: ClaudeCallParams): Promise<ClaudeCallResult<string>> {
  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey) {
    return {
      data: null, error: 'ANTHROPIC_API_KEY no configurada',
      cacheHit: false, costUsd: 0, model: params.model || DEFAULT_MODEL,
      inputTokens: 0, outputTokens: 0, cacheReadTokens: 0,
    }
  }

  const model = params.model || DEFAULT_MODEL
  const cacheKey = hashInput(params.operation, model, params.systemPrompt, params.cacheKeyInput)
  const t0 = Date.now()

  // 1) Cache hit?
  if (params.useCache ?? true) {
    const cached = await lookupCache<string>(params.operation, cacheKey)
    if (cached) {
      // Registrar hit
      await logUsage({
        operation: params.operation,
        provider: 'claude',
        model: cached.model_used ?? undefined,
        cacheHit: true,
        costUsd: 0,
        durationMs: Date.now() - t0,
        userId: params.userId,
        companyId: params.companyId,
        referenceType: params.referenceType,
        referenceId: params.referenceId,
      })
      return {
        data: cached.output,
        cacheHit: true,
        costUsd: 0,
        model: cached.model_used || model,
        inputTokens: 0,
        outputTokens: 0,
        cacheReadTokens: 0,
      }
    }
  }

  // 2) Llamar a Claude con prompt caching opcional
  const systemBlocks: Array<Record<string, unknown>> = params.cacheSystemPrompt
    ? [{ type: 'text', text: params.systemPrompt, cache_control: { type: 'ephemeral' } }]
    : [{ type: 'text', text: params.systemPrompt }]

  try {
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
        // Habilitar prompt caching beta si se usa
        ...(params.cacheSystemPrompt ? { 'anthropic-beta': 'prompt-caching-2024-07-31' } : {}),
      },
      body: JSON.stringify({
        model,
        max_tokens: params.maxTokens ?? 8192,
        system: systemBlocks,
        messages: [{ role: 'user', content: params.userContent }],
      }),
    })

    if (!res.ok) {
      const text = await res.text()
      return {
        data: null, error: `Claude ${res.status}: ${text.slice(0, 300)}`,
        cacheHit: false, costUsd: 0, model,
        inputTokens: 0, outputTokens: 0, cacheReadTokens: 0,
      }
    }

    const data = await res.json() as {
      content?: Array<{ text?: string }>
      usage?: {
        input_tokens?: number
        output_tokens?: number
        cache_creation_input_tokens?: number
        cache_read_input_tokens?: number
      }
    }

    const text = data.content?.[0]?.text ?? ''
    const inputTokens = data.usage?.input_tokens ?? 0
    const outputTokens = data.usage?.output_tokens ?? 0
    const cacheWriteTokens = data.usage?.cache_creation_input_tokens ?? 0
    const cacheReadTokens = data.usage?.cache_read_input_tokens ?? 0
    const costUsd = calcClaudeCost({ model, inputTokens, outputTokens, cacheWriteTokens, cacheReadTokens })

    // 3) Guardar en cache (sólo si hubo respuesta válida)
    if ((params.useCache ?? true) && text) {
      await saveCache({
        operation: params.operation,
        cacheKey,
        inputPreview: params.cacheKeyInput.slice(0, 200),
        output: text,
        model,
        inputTokens,
        outputTokens,
        costUsd,
      })
    }

    // 4) Log de consumo
    await logUsage({
      operation: params.operation,
      provider: 'claude',
      model,
      inputTokens,
      outputTokens,
      cacheReadTokens,
      cacheHit: false,
      costUsd,
      durationMs: Date.now() - t0,
      userId: params.userId,
      companyId: params.companyId,
      referenceType: params.referenceType,
      referenceId: params.referenceId,
    })

    return {
      data: text,
      cacheHit: false,
      costUsd,
      model,
      inputTokens,
      outputTokens,
      cacheReadTokens,
    }
  } catch (err) {
    return {
      data: null, error: `Claude excepción: ${(err as Error).message}`,
      cacheHit: false, costUsd: 0, model,
      inputTokens: 0, outputTokens: 0, cacheReadTokens: 0,
    }
  }
}
