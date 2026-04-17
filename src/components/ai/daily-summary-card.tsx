'use client'

import { useState, useEffect, useCallback } from 'react'
import { RefreshCw, Loader2, Sparkles, AlertTriangle, CheckCircle, ChevronRight, Cpu, ChevronDown, ChevronUp } from 'lucide-react'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { useCompanyContext } from '@/lib/company-context'

interface SummaryData {
  summary: string
  highlights: string[]
  actions: string[]
  concerns: string[]
  provider: string
  date: string
  fromCache: boolean
  error?: string
}

export function DailySummaryCard() {
  const { activeCompany } = useCompanyContext()
  const [data, setData] = useState<SummaryData | null>(null)
  const [loading, setLoading] = useState(false)
  const [expanded, setExpanded] = useState(true)
  const [lastRefresh, setLastRefresh] = useState<Date | null>(null)

  const load = useCallback(
    async (forceRefresh = false) => {
      if (!activeCompany?.id) return
      setLoading(true)
      try {
        const url = `/api/ai/daily-summary?companyId=${activeCompany.id}${forceRefresh ? '&refresh=1' : ''}`
        const res = await fetch(url)
        const json = await res.json() as SummaryData
        setData(json)
        setLastRefresh(new Date())
      } catch (e) {
        setData({ summary: '', highlights: [], actions: [], concerns: [], provider: '', date: '', fromCache: false, error: (e as Error).message })
      } finally {
        setLoading(false)
      }
    },
    [activeCompany?.id]
  )

  useEffect(() => {
    void load()
  }, [load])

  const getHighlightStyle = (h: string) => {
    if (h.startsWith('✅') || h.startsWith('🟢')) return { color: '#10b981', bg: 'rgba(16,185,129,0.08)', border: 'rgba(16,185,129,0.2)' }
    if (h.startsWith('⚠️') || h.startsWith('🟡') || h.startsWith('❗')) return { color: '#f59e0b', bg: 'rgba(245,158,11,0.08)', border: 'rgba(245,158,11,0.2)' }
    if (h.startsWith('❌') || h.startsWith('🔴') || h.startsWith('🚨')) return { color: '#ef4444', bg: 'rgba(239,68,68,0.08)', border: 'rgba(239,68,68,0.2)' }
    return { color: '#9CA3AF', bg: 'rgba(156,163,175,0.06)', border: 'rgba(156,163,175,0.15)' }
  }

  return (
    <Card className="p-0 overflow-hidden">
      {/* Header */}
      <div
        className="flex items-center justify-between px-4 py-3 border-b cursor-pointer"
        style={{ borderColor: '#2A3040', background: 'linear-gradient(90deg, rgba(249,115,22,0.06), transparent)' }}
        onClick={() => setExpanded((e) => !e)}
      >
        <div className="flex items-center gap-2">
          <div
            className="w-7 h-7 rounded-lg flex items-center justify-center"
            style={{ background: 'linear-gradient(135deg, #f97316, #ef4444)' }}
          >
            <Sparkles className="w-4 h-4 text-white" />
          </div>
          <div>
            <div className="font-semibold text-sm text-[#F0F2F5] flex items-center gap-2">
              Resumen Ejecutivo IA
              {data?.fromCache && (
                <Badge variant="default" size="sm">caché</Badge>
              )}
              {data?.provider && (
                <Badge variant="orange" size="sm">
                  <Cpu className="w-2.5 h-2.5 mr-1" />
                  {data.provider}
                </Badge>
              )}
            </div>
            {lastRefresh && (
              <div className="text-[10px] text-[#9CA3AF]">
                Actualizado {lastRefresh.toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' })}
              </div>
            )}
          </div>
        </div>

        <div className="flex items-center gap-2">
          <Button
            type="button"
            variant="ghost"
            size="icon"
            onClick={(e) => { e.stopPropagation(); void load(true) }}
            disabled={loading}
            title="Regenerar resumen"
          >
            {loading ? (
              <Loader2 className="w-4 h-4 animate-spin text-orange-400" />
            ) : (
              <RefreshCw className="w-4 h-4 text-[#9CA3AF]" />
            )}
          </Button>
          {expanded ? (
            <ChevronUp className="w-4 h-4 text-[#9CA3AF]" />
          ) : (
            <ChevronDown className="w-4 h-4 text-[#9CA3AF]" />
          )}
        </div>
      </div>

      {/* Content */}
      {expanded && (
        <div className="p-4 space-y-4">
          {loading && !data && (
            <div className="flex items-center justify-center gap-3 py-8 text-[#9CA3AF]">
              <Loader2 className="w-5 h-5 animate-spin text-orange-400" />
              <span className="text-sm">Generando resumen ejecutivo con IA...</span>
            </div>
          )}

          {data?.error && (
            <div className="flex items-center gap-2 text-sm text-red-400 bg-red-500/10 border border-red-500/20 rounded-xl px-3 py-2">
              <AlertTriangle className="w-4 h-4 shrink-0" />
              {data.error}
            </div>
          )}

          {data && !data.error && (
            <>
              {/* Summary */}
              {data.summary && (
                <div
                  className="rounded-xl border p-3"
                  style={{ background: 'rgba(249,115,22,0.04)', borderColor: 'rgba(249,115,22,0.2)' }}
                >
                  <div className="text-[10px] text-orange-400 uppercase font-bold mb-1.5">Resumen del día</div>
                  <p className="text-sm text-[#F0F2F5] leading-relaxed">{data.summary}</p>
                </div>
              )}

              {/* Highlights */}
              {data.highlights.length > 0 && (
                <div>
                  <div className="text-[10px] text-[#9CA3AF] uppercase font-bold mb-2">Lo más importante</div>
                  <div className="space-y-1.5">
                    {data.highlights.map((h, i) => {
                      const s = getHighlightStyle(h)
                      return (
                        <div
                          key={i}
                          className="rounded-lg px-3 py-2 text-sm"
                          style={{ background: s.bg, border: `1px solid ${s.border}`, color: s.color }}
                        >
                          {h}
                        </div>
                      )
                    })}
                  </div>
                </div>
              )}

              {/* Actions */}
              {data.actions.length > 0 && (
                <div>
                  <div className="text-[10px] text-[#9CA3AF] uppercase font-bold mb-2">
                    Acciones prioritarias para mañana
                  </div>
                  <div className="space-y-1">
                    {data.actions.map((action, i) => (
                      <div key={i} className="flex items-start gap-2 text-sm">
                        <div
                          className="w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold shrink-0 mt-0.5"
                          style={{ background: 'rgba(249,115,22,0.15)', color: '#f97316', border: '1px solid rgba(249,115,22,0.3)' }}
                        >
                          {i + 1}
                        </div>
                        <span className="text-[#F0F2F5] leading-snug">{action}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Concerns */}
              {data.concerns.length > 0 && (
                <div>
                  <div className="text-[10px] text-amber-400 uppercase font-bold mb-2 flex items-center gap-1">
                    <AlertTriangle className="w-3 h-3" />
                    Tendencias preocupantes
                  </div>
                  <div className="space-y-1.5">
                    {data.concerns.map((concern, i) => (
                      <div
                        key={i}
                        className="flex items-start gap-2 rounded-lg px-3 py-2 text-sm"
                        style={{ background: 'rgba(245,158,11,0.06)', border: '1px solid rgba(245,158,11,0.2)' }}
                      >
                        <ChevronRight className="w-3 h-3 text-amber-400 shrink-0 mt-0.5" />
                        <span className="text-amber-200">{concern}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {(!data.summary && !loading) && (
                <div className="text-center py-6 text-[#9CA3AF] text-sm">
                  <CheckCircle className="w-8 h-8 mx-auto mb-2 text-emerald-400 opacity-50" />
                  No hay datos suficientes para generar un resumen hoy
                </div>
              )}
            </>
          )}
        </div>
      )}
    </Card>
  )
}
