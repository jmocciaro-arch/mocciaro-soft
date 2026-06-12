'use client'

import useSWR, { type SWRConfiguration, useSWRConfig } from 'swr'
import { createClient } from '@/lib/supabase/client'

/**
 * Hook genérico para queries Supabase con cache SWR.
 *
 * @param key  — Identificador único de la query (array para deps).
 *               Pasar `null` para deshabilitar (cuando faltan datos).
 * @param fetcher — Función async que recibe el client supabase y devuelve data.
 *
 * Cache: comparte resultados entre componentes con la misma key.
 * Dedupe: 5s default (config en SWRProvider).
 * Refetch on focus: sí.
 *
 * Ejemplo:
 *   const { data: clients, isLoading } = useSupabase(
 *     ['clients', companyId],
 *     async (sb) => sb.from('tt_clients').select('id, name').eq('company_id', companyId)
 *   )
 */
export function useSupabase<T>(
  key: readonly unknown[] | null,
  fetcher: (sb: ReturnType<typeof createClient>) => Promise<{ data: T | null; error: unknown }>,
  options?: SWRConfiguration
) {
  return useSWR(
    key,
    async () => {
      const sb = createClient()
      const { data, error } = await fetcher(sb)
      if (error) throw error
      return data
    },
    options
  )
}

/**
 * Hook para invalidar manualmente una query (después de mutaciones).
 *
 * Ejemplo:
 *   const invalidate = useInvalidate()
 *   await sb.from('tt_clients').insert(...)
 *   invalidate(['clients', companyId]) // refetch automático en los components que usan esa key
 */
export function useInvalidate() {
  const { mutate } = useSWRConfig()
  return (key: readonly unknown[]) => {
    void mutate(key)
  }
}
