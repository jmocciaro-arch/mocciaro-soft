'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { FileText } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { useCompanyFilter } from '@/hooks/use-company-filter'
import { formatCurrency, formatRelative } from '@/lib/utils'
import { Badge } from '@/components/ui/badge'
import { DocLink } from '@/components/ui/doc-link'
import { WidgetSkeleton, WidgetError } from '../widget-wrapper'

interface RecentQuote {
  id: string
  number: string
  total: number
  currency: string
  created_at: string
  status: string
  client?: { name: string } | null
  _source?: 'local' | 'tt_documents'
  _clientName?: string
}

function getClientNameFromDoc(doc: Record<string, unknown>): string {
  const raw = (doc.metadata as Record<string, unknown>)?.stelorder_raw as Record<string, unknown> | undefined
  if (!raw) return 'Sin cliente'
  return (raw['account-name'] as string) || (raw['legal-name'] as string) || (raw['name'] as string) || 'Sin cliente'
}

export function WidgetRecentQuotes() {
  const router = useRouter()
  const [quotes, setQuotes] = useState<RecentQuote[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(false)
  const { filterByCompany, companyKey } = useCompanyFilter()

  useEffect(() => {
    async function load() {
      try {
        const sb = createClient()
        // Load from both sources
        let localQ = sb.from('tt_quotes').select('id, number, total, currency, created_at, status, client:tt_clients(name)').order('created_at', { ascending: false }).limit(5)
        localQ = filterByCompany(localQ)

        let docQ = sb.from('tt_documents').select('id, display_ref, system_code, total, currency, created_at, status, metadata').eq('doc_type', 'coti').order('created_at', { ascending: false }).limit(10)
        docQ = filterByCompany(docQ)

        const [localRes, docRes] = await Promise.all([localQ, docQ])

        if (localRes.error) throw localRes.error
        if (docRes.error) throw docRes.error

        const localQuotes = ((localRes.data || []) as unknown as RecentQuote[]).map(q => ({
          ...q, _source: 'local' as const,
        }))
        const docQuotes = (docRes.data || []).map((d: Record<string, unknown>) => ({
          id: d.id as string,
          number: (d.display_ref as string) || (d.system_code as string) || '-',
          total: (d.total as number) || 0,
          currency: (d.currency as string) || 'EUR',
          created_at: d.created_at as string,
          status: (d.status as string) || 'closed',
          _source: 'tt_documents' as const,
          _clientName: getClientNameFromDoc(d),
        }))

        // Merge and sort by created_at desc, take top 10
        const merged = [...localQuotes, ...docQuotes]
          .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
          .slice(0, 10)
        setQuotes(merged)
      } catch {
        setError(true)
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [companyKey])

  if (loading) return <WidgetSkeleton />
  if (error) return <WidgetError />

  if (quotes.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-full text-[#4B5563] py-6">
        <FileText size={28} className="mb-2" />
        <p className="text-xs">No hay cotizaciones todavia</p>
      </div>
    )
  }

  return (
    <div className="space-y-2">
      {quotes.map(q => (
        <div
          key={q.id}
          onClick={() => router.push(`/cotizador/${q.id}`)}
          className="p-2.5 rounded-lg bg-[#0F1218] border border-[#1E2330] hover:border-[#2A3040] transition-all cursor-pointer"
        >
          <div className="flex items-center justify-between mb-0.5">
            <DocLink docRef={q.number} docId={q.id} docType="coti" className="text-xs font-mono" />
            <Badge variant={
              q.status === 'aceptada' ? 'success' :
              q.status === 'rechazada' ? 'danger' :
              q.status === 'enviada' ? 'info' : 'default'
            }>
              {q.status}
            </Badge>
          </div>
          <p className="text-xs text-[#D1D5DB] truncate">
            {q._clientName || q.client?.name || 'Sin cliente'}
          </p>
          <div className="flex items-center justify-between mt-1">
            <p className="text-sm font-semibold text-[#F0F2F5]">
              {formatCurrency(q.total, (q.currency || 'EUR') as 'EUR' | 'ARS' | 'USD')}
            </p>
            <span className="text-[10px] text-[#4B5563]">{formatRelative(q.created_at)}</span>
          </div>
        </div>
      ))}
    </div>
  )
}
