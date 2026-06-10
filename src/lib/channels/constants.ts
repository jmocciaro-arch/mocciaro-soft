/**
 * Constantes de presentación del módulo Canales.
 * Los dominios de status replican los CHECK constraints de la migración v91
 * (verificados contra producción) — no inventar estados fuera de estas listas.
 */

/** tt_channels.status */
export const CHANNEL_STATUS_LABELS: Record<string, string> = {
  not_configured: 'Sin configurar',
  onboarding: 'Onboarding',
  active: 'Activo',
  paused: 'Pausado',
  error: 'Error',
}

export const CHANNEL_STATUS_BADGE: Record<string, 'success' | 'warning' | 'danger' | 'default'> = {
  active: 'success',
  onboarding: 'warning',
  error: 'danger',
  paused: 'default',
  not_configured: 'default',
}

/** tt_channel_listings.status */
export const LISTING_STATUS_LABELS: Record<string, string> = {
  draft: 'Borrador',
  pending: 'Pendiente',
  active: 'Activa',
  paused: 'Pausada',
  rejected: 'Rechazada',
  closed: 'Cerrada',
}

export const LISTING_STATUS_BADGE: Record<string, 'success' | 'warning' | 'danger' | 'info' | 'default'> = {
  active: 'success',
  pending: 'warning',
  rejected: 'danger',
  draft: 'default',
  paused: 'default',
  closed: 'default',
}

/** Identidad visual por código de canal (tt_channels.code). */
export const CHANNEL_VISUAL: Record<string, { initials: string; bg: string; fg: string }> = {
  mercadolibre: { initials: 'ML', bg: '#FFD100', fg: '#2D3277' },
  ebay: { initials: 'eB', bg: '#0064D2', fg: '#FFFFFF' },
  amazon: { initials: 'AZ', bg: '#232F3E', fg: '#FFFFFF' },
  alibaba: { initials: 'Ab', bg: '#FF6A00', fg: '#FFFFFF' },
}
