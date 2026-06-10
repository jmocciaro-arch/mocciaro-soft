'use client'

import { useState, useEffect, useCallback } from 'react'
import { usePermissions } from '@/hooks/use-permissions'
import { useCompanyFilter } from '@/hooks/use-company-filter'
import { computeChannelsGate, type ChannelsGate, type EnabledChannel } from '@/lib/channels/gate'

interface UseChannelsGateResult extends ChannelsGate {
  /** Canales enabled de la(s) empresa(s) activa(s) (vacío si la condición A falla). */
  enabledChannels: EnabledChannel[]
  /** True mientras se resuelven permisos o canales. Mostrar skeleton, no empty-state. */
  loading: boolean
  refetch: () => Promise<void>
}

/**
 * Hook de gating del módulo Canales — ver matriz en @/lib/channels/gate.
 * Combina usePermissions (condición A) con los canales enabled de la
 * empresa activa (condición B) vía GET /api/channels: la RLS de tt_channels
 * es company-scoped por la empresa DEFAULT del usuario, así que la lectura
 * va por el server, que valida permiso + acceso por empresa explícitamente.
 */
export function useChannelsGate(): UseChannelsGateResult {
  const { can, loading: permsLoading } = usePermissions()
  const { companyIds, companyKey } = useCompanyFilter()
  const [enabledChannels, setEnabledChannels] = useState<EnabledChannel[]>([])
  const [channelsLoading, setChannelsLoading] = useState(true)

  const canView = !permsLoading && can('view_channels')

  const refetch = useCallback(async () => {
    // Sin permiso (o sin empresa seleccionada todavía) no hay nada que consultar.
    if (!canView || companyIds.length === 0) {
      setEnabledChannels([])
      setChannelsLoading(permsLoading)
      return
    }
    setChannelsLoading(true)
    try {
      const res = await fetch(`/api/channels?company_id=${companyIds.join(',')}`)
      if (!res.ok) {
        setEnabledChannels([])
        return
      }
      const json = await res.json() as { channels?: EnabledChannel[] }
      setEnabledChannels(json.channels ?? [])
    } catch {
      setEnabledChannels([])
    } finally {
      setChannelsLoading(false)
    }
    // companyIds cambia de identidad por render; companyKey es la dep estable (mismo patrón que calendario)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [canView, permsLoading, companyKey])

  useEffect(() => { void refetch() }, [refetch])

  const gate = computeChannelsGate(canView, enabledChannels.length)

  return {
    ...gate,
    enabledChannels,
    loading: permsLoading || (canView && channelsLoading),
    refetch,
  }
}
