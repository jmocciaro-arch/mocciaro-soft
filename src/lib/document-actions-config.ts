/**
 * CONFIGURACIÓN DE ACCIONES DE DOCUMENTO
 * =====================================
 *
 * Persiste los overrides "deshabilitar acción X en tipo Y" del usuario
 * en una única fila de tt_system_params con key='document_actions_config'.
 *
 * Por defecto TODAS las acciones implementadas están habilitadas.
 * La config solo guarda los `false` (overrides).
 *
 * Schema del value (JSON serializado):
 *   {
 *     "coti": { "duplicate": false, "delete": false },
 *     "pedido": { "generate_invoice": false }
 *   }
 */

import { createClient } from '@/lib/supabase/client'
import type { DocumentActionScope } from './document-actions-catalog'

const PARAM_KEY = 'document_actions_config'

export type DocumentActionsConfig = Partial<Record<DocumentActionScope, Record<string, boolean>>>

let cache: { value: DocumentActionsConfig; loadedAt: number } | null = null
const CACHE_TTL_MS = 60_000

/** Lee la config desde tt_system_params (con caché en memoria 60s). */
export async function loadDocumentActionsConfig(): Promise<DocumentActionsConfig> {
  if (cache && Date.now() - cache.loadedAt < CACHE_TTL_MS) {
    return cache.value
  }
  const sb = createClient()
  const { data } = await sb.from('tt_system_params').select('value').eq('key', PARAM_KEY).maybeSingle()
  let parsed: DocumentActionsConfig = {}
  if (data?.value) {
    try { parsed = JSON.parse(data.value as string) as DocumentActionsConfig } catch { /* corrupto: usar default */ }
  }
  cache = { value: parsed, loadedAt: Date.now() }
  return parsed
}

/** Sobrescribe la config completa (upsert). */
export async function saveDocumentActionsConfig(config: DocumentActionsConfig): Promise<void> {
  const sb = createClient()
  const valueStr = JSON.stringify(config)
  // upsert por key (la tabla tt_system_params tiene key UNIQUE)
  const { data: existing } = await sb.from('tt_system_params').select('id').eq('key', PARAM_KEY).maybeSingle()
  if (existing) {
    await sb.from('tt_system_params').update({ value: valueStr }).eq('key', PARAM_KEY)
  } else {
    await sb.from('tt_system_params').insert({ key: PARAM_KEY, value: valueStr, description: 'Acciones habilitadas por tipo de documento en el menú "Más"' })
  }
  cache = { value: config, loadedAt: Date.now() }
}

/** Helper: ¿está habilitada esta acción para este tipo de documento? */
export function isActionEnabled(config: DocumentActionsConfig, type: DocumentActionScope, actionKey: string): boolean {
  // Si no hay override explícito, está habilitada
  const typeCfg = config[type]
  if (!typeCfg) return true
  if (typeCfg[actionKey] === false) return false
  return true
}

/** Invalida el caché — útil después de guardar desde /admin. */
export function invalidateDocumentActionsCache(): void {
  cache = null
}
