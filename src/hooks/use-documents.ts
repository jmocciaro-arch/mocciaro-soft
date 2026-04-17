'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import {
  listDocuments,
  getDocument,
  type DocumentDetail,
  type ListDocumentsFilters,
  type ListDocumentsResult,
} from '@/lib/documents/client'

// -----------------------------------------------------------------------------
// useDocuments — lista con filtros. Re-fetch cuando cambian los filtros.
// Devuelve helpers para paginar y refrescar manualmente.
// -----------------------------------------------------------------------------
export function useDocuments(filters: ListDocumentsFilters) {
  const [state, setState] = useState<{ data: ListDocumentsResult | null; loading: boolean; error: string | null }>({
    data: null,
    loading: true,
    error: null,
  })

  // Clave serializada: evita re-fetch si filters es mismo por valor.
  const key = JSON.stringify(filters)
  const reqId = useRef(0)

  const load = useCallback(async () => {
    const myReq = ++reqId.current
    setState((s) => ({ ...s, loading: true, error: null }))
    try {
      const data = await listDocuments(filters)
      if (reqId.current !== myReq) return              // request viejo, ignorar
      setState({ data, loading: false, error: null })
    } catch (e) {
      if (reqId.current !== myReq) return
      const msg = e instanceof Error ? e.message : 'Error cargando documentos'
      setState({ data: null, loading: false, error: msg })
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key])

  useEffect(() => { load() }, [load])

  return { ...state, refetch: load }
}

// -----------------------------------------------------------------------------
// useDocument — detalle + refetch manual. Se usa en el editor.
// -----------------------------------------------------------------------------
export function useDocument(id: string | null) {
  const [state, setState] = useState<{ data: DocumentDetail | null; loading: boolean; error: string | null }>({
    data: null,
    loading: true,
    error: null,
  })

  const reqId = useRef(0)

  const load = useCallback(async () => {
    if (!id) { setState({ data: null, loading: false, error: null }); return }
    const myReq = ++reqId.current
    setState((s) => ({ ...s, loading: true, error: null }))
    try {
      const data = await getDocument(id)
      if (reqId.current !== myReq) return
      setState({ data, loading: false, error: null })
    } catch (e) {
      if (reqId.current !== myReq) return
      const msg = e instanceof Error ? e.message : 'Error cargando documento'
      setState({ data: null, loading: false, error: msg })
    }
  }, [id])

  useEffect(() => { load() }, [load])

  return { ...state, refetch: load }
}
