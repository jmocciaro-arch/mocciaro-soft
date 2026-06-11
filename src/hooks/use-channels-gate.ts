'use client'

import { useState, useEffect, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import { usePermissions } from '@/hooks/use-permissions'
import { useCompanyFilter } from '@/hooks/use-company-filter'
import { computeChannelsGate, type ChannelsGate, type EnabledChannel } from '@/lib/channels/gate'

interface UseChannelsGateResult extends ChannelsGate {
  /** Canales enabled de la empresa activa (vacío si la condición A falla). */
  enabledChannels: EnabledChannel[]
  /** True mientras se resuelven permisos o canales. Mostrar skeleton, no empty-state. */
  loading: boolean
  refetch: () => Promise<void>
}

/**
 * Hook de gating del módulo Canales — ver matriz en @/lib/channels/gate.
 * Combina usePermissions (condición A) con la query de tt_channels
 * filtrada por empresa activa (condición B).
 */
export function useChannelsGate(): UseChannelsGateResult {
  const { can, loading: permsLoading } = usePermissions()
  const { filterByCompany, companyKey } = useCompanyFilter()
  const [enabledChannels, setEnabledChannels] = useState<EnabledChannel[]>([])
  const [channelsLoading, setChannelsLoading] = useState(true)

  const canView = !permsLoading && can('view_channels')

  const refetch = useCallback(async () => {
    // Sin permiso no hay nada que consultar: el módulo está ausente.
    if (!canView) {
      setEnabledChannels([])
      setChannelsLoading(permsLoading)
      return
    }
    setChannelsLoading(true)
    const supabase = createClient()
    let q = supabase
      .from('tt_channels')
      .select('id, code, label, status, last_sync_at')
      .eq('enabled', true)
      .order('label')
    q = filterByCompany(q)
    const { data, error } = await q
    setEnabledChannels(error ? [] : ((data as EnabledChannel[] | null) ?? []))
    setChannelsLoading(false)
    // filterByCompany cambia de identidad en cada render; companyKey es la dep estable (mismo patrón que calendario)
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
