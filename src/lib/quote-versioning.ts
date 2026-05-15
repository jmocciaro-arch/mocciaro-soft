/**
 * quote-versioning.ts — FASE 1.4
 *
 * Wrapper TS sobre las RPCs de versionado de cotizaciones (migration v74):
 *   - snapshot_quote_version: persiste estado actual + items como
 *     versión inmutable y avanza current_version_number.
 *   - mark_quote_accepted_version: marca qué versión aceptó el cliente.
 *
 * Convención de uso:
 *   - ANTES de editar una COT que fue enviada (`status='enviada'`),
 *     llamar a snapshotQuoteVersion() para preservar el estado original.
 *   - DESPUÉS la app aplica los cambios sobre tt_quotes/tt_quote_items
 *     normalmente.
 *   - Cuando el cliente acepta una versión específica (típicamente la
 *     última), markAcceptedVersion() la marca y deja status='aceptada'.
 *
 * Indicador UI:
 *   - Si accepted_version_number > 0, mostrar "v{accepted_version_number} (aceptada)".
 *   - Sino, mostrar "v{current_version_number} (en edición)".
 */

import { createClient } from '@/lib/supabase/client'

export interface QuoteVersion {
  id: string
  quote_id: string
  version_number: number
  snapshot: Record<string, unknown>
  items_snapshot: Array<Record<string, unknown>>
  change_summary: string | null
  parent_version_id: string | null
  created_by: string | null
  created_at: string
}

export interface VersionDisplayInfo {
  current_version_number: number
  accepted_version_number: number | null
  total_versions: number
  /** "v3 (aceptada por cliente)" / "v2 (en edición)" / etc. */
  label: string
}

/**
 * Crea un snapshot de la COT actual antes de editarla.
 * Devuelve el version_id y version_number creados.
 */
export async function snapshotQuoteVersion(args: {
  quoteId: string
  changeSummary?: string | null
  actorUserId?: string | null
}): Promise<{ ok: boolean; versionId?: string; versionNumber?: number; error?: string }> {
  try {
    const sb = createClient()
    const { data, error } = await sb.rpc('snapshot_quote_version', {
      p_quote_id: args.quoteId,
      p_change_summary: args.changeSummary ?? null,
      p_actor_id: args.actorUserId ?? null,
    })

    if (error) return { ok: false, error: error.message }
    const row = (data as Array<{ version_id: string; version_number: number }>)?.[0]
    if (!row) return { ok: false, error: 'RPC sin resultado' }

    return { ok: true, versionId: row.version_id, versionNumber: row.version_number }
  } catch (err) {
    return { ok: false, error: (err as Error).message }
  }
}

/**
 * Marca una versión como aceptada por el cliente.
 * Hace status='aceptada' + accepted_at=now() en la COT.
 */
export async function markAcceptedVersion(args: {
  quoteId: string
  versionNumber: number
  actorUserId?: string | null
}): Promise<{ ok: boolean; error?: string }> {
  try {
    const sb = createClient()
    const { error } = await sb.rpc('mark_quote_accepted_version', {
      p_quote_id: args.quoteId,
      p_version_number: args.versionNumber,
      p_actor_id: args.actorUserId ?? null,
    })
    if (error) return { ok: false, error: error.message }
    return { ok: true }
  } catch (err) {
    return { ok: false, error: (err as Error).message }
  }
}

/**
 * Lista todas las versiones de una COT (más reciente primero).
 */
export async function listQuoteVersions(quoteId: string): Promise<QuoteVersion[]> {
  const sb = createClient()
  const { data } = await sb
    .from('tt_quote_versions')
    .select('*')
    .eq('quote_id', quoteId)
    .order('version_number', { ascending: false })

  return (data || []) as QuoteVersion[]
}

/**
 * Info para mostrar en la UI ("COT-2026-0005 v3 (aceptada)").
 */
export async function getQuoteVersionInfo(quoteId: string): Promise<VersionDisplayInfo | null> {
  const sb = createClient()
  const { data: quote } = await sb
    .from('tt_quotes')
    .select('current_version_number, accepted_version_number')
    .eq('id', quoteId)
    .maybeSingle()

  if (!quote) return null

  const { count } = await sb
    .from('tt_quote_versions')
    .select('id', { count: 'exact', head: true })
    .eq('quote_id', quoteId)

  const current = (quote.current_version_number as number) || 1
  const accepted = (quote.accepted_version_number as number | null) ?? null

  let label = ''
  if (accepted !== null) {
    label = `v${accepted} (aceptada)`
    if (current > accepted + 1) {
      label += ` — editada (v${current - 1} actual)`
    }
  } else if ((count ?? 0) === 0) {
    label = 'v1 (borrador)'
  } else {
    // Hay versiones snapshot pero ninguna aceptada
    label = `v${Math.max(1, current - 1)} (en edición)`
  }

  return {
    current_version_number: current,
    accepted_version_number: accepted,
    total_versions: count ?? 0,
    label,
  }
}

/**
 * Helper de UI: ¿hay que mostrar el banner "Esta COT fue enviada al
 * cliente. Editar crea una nueva versión"?
 */
export function shouldWarnBeforeEdit(args: {
  status: string | null
  totalVersions: number
}): boolean {
  return args.status === 'enviada' || args.status === 'aceptada' || args.totalVersions > 0
}
