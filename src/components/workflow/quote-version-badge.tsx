'use client'

/**
 * QuoteVersionBadge — FASE 1.4
 *
 * Indicador compacto del versionado de una COT que se puede embeber
 * en el header del cotizador.
 *
 *   "COT-2026-0005 [v3 (aceptada)]"
 *   "COT-2026-0008 [v2 (en edición)] (3 versiones)"
 *
 * Click expande un dropdown con el historial y permite navegar al
 * snapshot de cada versión (read-only).
 */

import { useEffect, useState } from 'react'
import {
  getQuoteVersionInfo,
  listQuoteVersions,
  type VersionDisplayInfo,
  type QuoteVersion,
} from '@/lib/quote-versioning'
import { Badge } from '@/components/ui/badge'
import { formatDate } from '@/lib/utils'
import { History, ChevronDown, ChevronUp, Check } from 'lucide-react'

export interface QuoteVersionBadgeProps {
  quoteId: string
  /** Optional: callback cuando el usuario clickea una versión */
  onSelectVersion?: (version: QuoteVersion) => void
}

export function QuoteVersionBadge({ quoteId, onSelectVersion }: QuoteVersionBadgeProps) {
  const [info, setInfo] = useState<VersionDisplayInfo | null>(null)
  const [open, setOpen] = useState(false)
  const [versions, setVersions] = useState<QuoteVersion[]>([])
  const [loadingVersions, setLoadingVersions] = useState(false)

  useEffect(() => {
    getQuoteVersionInfo(quoteId).then(setInfo).catch(() => setInfo(null))
  }, [quoteId])

  useEffect(() => {
    if (open && versions.length === 0) {
      setLoadingVersions(true)
      listQuoteVersions(quoteId)
        .then(setVersions)
        .finally(() => setLoadingVersions(false))
    }
  }, [open, quoteId, versions.length])

  if (!info) return null

  const variant: 'success' | 'warning' | 'default' =
    info.accepted_version_number !== null ? 'success' : 'warning'

  return (
    <div className="relative inline-block">
      <button
        onClick={() => setOpen((o) => !o)}
        className="inline-flex items-center gap-1.5 px-2 py-1 bg-[#0B0E13] hover:bg-[#1C2230] border border-[#1E2330] rounded-md text-xs transition-colors"
      >
        <History size={12} className="text-[#9CA3AF]" />
        <Badge variant={variant}>{info.label}</Badge>
        {info.total_versions > 1 && (
          <span className="text-[10px] text-[#6B7280]">({info.total_versions})</span>
        )}
        {open ? <ChevronUp size={12} className="text-[#9CA3AF]" /> : <ChevronDown size={12} className="text-[#9CA3AF]" />}
      </button>

      {open && (
        <div className="absolute right-0 top-full mt-1 w-72 bg-[#1C2230] border border-[#2A3040] rounded-lg shadow-xl z-50 max-h-[400px] overflow-y-auto">
          <div className="p-2 border-b border-[#2A3040]">
            <div className="text-[10px] uppercase tracking-wider text-[#6B7280]">Historial de versiones</div>
          </div>

          {loadingVersions && (
            <div className="p-3 text-xs text-[#6B7280] text-center">Cargando…</div>
          )}

          {!loadingVersions && versions.length === 0 && (
            <div className="p-3 text-xs text-[#6B7280] text-center">
              Sin versiones snapshot todavía. La COT está en su estado original.
            </div>
          )}

          {!loadingVersions && versions.map((v) => {
            const isAccepted = info.accepted_version_number === v.version_number
            return (
              <button
                key={v.id}
                onClick={() => {
                  onSelectVersion?.(v)
                  setOpen(false)
                }}
                className="w-full text-left p-2 hover:bg-[#2A3040] border-b border-[#2A3040] last:border-b-0"
              >
                <div className="flex items-center gap-2">
                  <span className={`text-xs font-semibold ${isAccepted ? 'text-[#10B981]' : 'text-[#F0F2F5]'}`}>
                    v{v.version_number}
                  </span>
                  {isAccepted && <Check size={12} className="text-[#10B981]" />}
                  <span className="text-[10px] text-[#6B7280] ml-auto">
                    {formatDate(v.created_at)}
                  </span>
                </div>
                {v.change_summary && (
                  <div className="text-[10px] text-[#9CA3AF] mt-0.5 line-clamp-2">
                    {v.change_summary}
                  </div>
                )}
              </button>
            )
          })}
        </div>
      )}
    </div>
  )
}
