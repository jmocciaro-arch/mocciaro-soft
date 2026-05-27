'use client'

/**
 * NextStepPanel — Next-Step Suggester F1.
 *
 * Strip horizontal con chips de acciones contextuales para el documento actual.
 * El cache server-side de 30s (unstable_cache con tag `next-steps-${docId}`)
 * vive en el endpoint GET /api/next-steps; este wrapper hace el fetch.
 *
 * NOTA — Adaptación a la spec original: la spec pedía Server Component, pero
 * el parent (/documentos/[id]/page.tsx) es 'use client' y no se puede anidar
 * un Server Component dentro. La cache de 30s sigue funcionando del lado
 * server vía unstable_cache en el route handler.
 */
import { useEffect, useState } from 'react'
import { NextStepActions } from './NextStepActions.client'
import type { NextStepsResponse } from '@/lib/next-steps/types'

export interface NextStepPanelProps {
  docType: 'quotation'
  docId: string
  /** Status del documento — si llega como prop evitamos ocultar el panel para
   *  estados terminales (cancelled/rejected/expired/converted). */
  docStatus?: string | null
}

const TERMINAL_STATUSES = new Set([
  'cancelled', 'cancelado', 'rejected', 'rechazado', 'rechazada',
  'expired', 'expirado', 'expirada', 'vencido', 'vencida',
  'converted', 'convertido', 'convertida',
])

function Skeleton() {
  const widths = [140, 160, 200, 170]
  return (
    <div className="flex flex-wrap items-center gap-3 pt-2 animate-pulse">
      {widths.map((w, i) => (
        <div
          key={i}
          className="h-9 rounded-md bg-[#1A1F2A] border border-[#2A3040]"
          style={{ width: w }}
        />
      ))}
    </div>
  )
}

export function NextStepPanel({ docType, docId, docStatus }: NextStepPanelProps) {
  const [data, setData] = useState<NextStepsResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [fetchError, setFetchError] = useState<string | null>(null)

  // Fast-fail: si el status es terminal no renderizar nada.
  const skip = docStatus && TERMINAL_STATUSES.has(String(docStatus).toLowerCase())

  useEffect(() => {
    if (skip) {
      setLoading(false)
      return
    }
    let cancelled = false
    const run = async () => {
      setLoading(true)
      setFetchError(null)
      try {
        const res = await fetch(
          `/api/next-steps?doc_type=${encodeURIComponent(docType)}&doc_id=${encodeURIComponent(docId)}`,
          { cache: 'no-store' }
        )
        if (!res.ok) {
          const j = (await res.json().catch(() => ({}))) as { error?: string }
          throw new Error(j.error ?? `Error ${res.status}`)
        }
        const json = (await res.json()) as NextStepsResponse
        if (!cancelled) setData(json)
      } catch (e) {
        if (!cancelled) setFetchError((e as Error).message)
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    void run()
    return () => {
      cancelled = true
    }
  }, [docType, docId, skip])

  if (skip) return null

  return (
    <section
      aria-label="Próximo paso"
      className="bg-[#141820] rounded-xl border border-[#2A3040] px-4 py-3"
    >
      <h3 className="text-[12px] font-bold text-[#9CA3AF] uppercase tracking-wide">
        Próximo paso
      </h3>

      {loading && <Skeleton />}

      {!loading && fetchError && (
        <div className="mt-2 inline-flex items-center gap-2 rounded-md border border-[#E24B4A] bg-[#2A1414] px-3 py-2 text-sm text-[#FCA5A5]">
          <i className="ti ti-alert-circle text-[14px]" aria-hidden />
          <span>No se pudieron cargar las acciones: {fetchError}</span>
        </div>
      )}

      {!loading && !fetchError && data && data.actions.length > 0 && (
        <NextStepActions
          docType={docType}
          docId={docId}
          actions={data.actions}
          suggested={data.suggested}
        />
      )}

      {!loading && !fetchError && data && data.actions.length === 0 && (
        <p className="mt-2 text-xs text-[#6B7280]">
          No hay acciones disponibles para tu rol en este estado.
        </p>
      )}
    </section>
  )
}
