'use client'

import { SWRConfig } from 'swr'
import type { ReactNode } from 'react'

/**
 * SWRProvider — config global para todos los hooks SWR del ERP.
 *
 * Defaults:
 *   - revalidateOnFocus: true     — refetch al volver a la pestaña
 *   - revalidateOnReconnect: true — refetch al recuperar internet
 *   - dedupingInterval: 5000      — no hagas la misma query 2 veces en 5s
 *   - errorRetryCount: 2          — reintenta 2 veces si falla
 *   - keepPreviousData: true      — UI no parpadea al cambiar de query
 *
 * Las queries Supabase ahora se cachean a nivel app. Cambiar de pestaña y
 * volver no recarga datos si están "frescos".
 */
export function SWRProvider({ children }: { children: ReactNode }) {
  return (
    <SWRConfig
      value={{
        revalidateOnFocus: true,
        revalidateOnReconnect: true,
        dedupingInterval: 5_000,
        errorRetryCount: 2,
        errorRetryInterval: 3_000,
        keepPreviousData: true,
        shouldRetryOnError: (err) => {
          // No reintentar en errores de auth — el user tiene que reloguearse
          if (err?.status === 401 || err?.status === 403) return false
          return true
        },
      }}
    >
      {children}
    </SWRConfig>
  )
}
