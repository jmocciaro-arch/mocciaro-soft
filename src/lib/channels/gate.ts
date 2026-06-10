/**
 * Gating del módulo Canales (SPEC-dashboard-canales.md §1).
 *
 * Doble condición:
 *   A) RBAC:    el usuario tiene el permiso `view_channels`
 *   B) Empresa: la empresa activa tiene ≥1 canal con enabled=true en tt_channels
 *
 * Matriz de visibilidad:
 *   sin A, sin B → módulo AUSENTE (no se renderiza, ni deshabilitado)
 *   con A, sin B → módulo visible con empty-state
 *   sin A, con B → módulo AUSENTE
 *   con A, con B → módulo visible y funcional
 *
 * La lógica es pura para poder testearla sin React (vitest, env node).
 * El hook `useChannelsGate()` la alimenta con datos reales.
 */

/** Canal habilitado de la empresa activa, tal como lo devuelve tt_channels. */
export interface EnabledChannel {
  id: string
  code: string
  label: string
  status: string
  last_sync_at: string | null
}

export interface ChannelsGate {
  /** Condición A. Si es false, el módulo y el filtro de canal NO se renderizan. */
  showModule: boolean
  /** A sin B: mostrar el módulo con empty-state "Sin canales habilitados". */
  isEmpty: boolean
  /** A y B: módulo visible y funcional. */
  functional: boolean
}

export function computeChannelsGate(
  canViewChannels: boolean,
  enabledChannelsCount: number,
): ChannelsGate {
  const hasEnabledChannels = enabledChannelsCount > 0
  return {
    showModule: canViewChannels,
    isEmpty: canViewChannels && !hasEnabledChannels,
    functional: canViewChannels && hasEnabledChannels,
  }
}
