'use client'

/**
 * Hook que envía POST /api/next-steps/execute con manejo de loading/error/result.
 */
import { useCallback, useState } from 'react'
import type { ActionCode } from '@/lib/next-steps/types'

export interface ExecuteResult {
  ok: boolean
  log_id?: string
  action_code: ActionCode
  result?: {
    redirect_to?: string
    pdf_url?: string
    sales_order_id?: string
    new_doc_id?: string
    number?: string
    mutated?: boolean
    [k: string]: unknown
  }
  error?: string
}

export function useExecuteAction(docType: 'quotation', docId: string) {
  const [pending, setPending] = useState<ActionCode | null>(null)
  const [error, setError] = useState<{ code: ActionCode; message: string } | null>(null)

  const execute = useCallback(
    async (
      code: ActionCode,
      payload: Record<string, unknown> = {}
    ): Promise<ExecuteResult> => {
      setPending(code)
      setError(null)
      try {
        const res = await fetch('/api/next-steps/execute', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ doc_type: docType, doc_id: docId, action_code: code, payload }),
        })
        const json = (await res.json().catch(() => ({}))) as ExecuteResult & { error?: string }
        if (!res.ok || !json.ok) {
          const msg = json.error ?? `Error ${res.status}`
          setError({ code, message: msg })
          return { ok: false, action_code: code, error: msg }
        }
        return json
      } catch (e) {
        const msg = (e as Error).message
        setError({ code, message: msg })
        return { ok: false, action_code: code, error: msg }
      } finally {
        setPending(null)
      }
    },
    [docType, docId]
  )

  const resetError = useCallback(() => setError(null), [])

  return { execute, pending, error, resetError }
}
