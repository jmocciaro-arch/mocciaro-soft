'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { FileText } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { formatCurrency, formatRelative } from '@/lib/utils'
import { Badge } from '@/components/ui/badge'
import { WidgetSkeleton, WidgetError } from '../widget-wrapper'

interface RecentQuote {
  id: string
  quote_number: string
  total: number
  currency: string
  created_at: string
  status: string
  client?: { company_name: string } | null
}

export function WidgetRecentQuotes() {
  const router = useRouter()
  const [quotes, setQuotes] = useState<RecentQuote[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(false)

  useEffect(() => {
    async function load() {
      try {
        const supabase = createClient()
        const { data, error: e } = await supabase
          .from('tt_quotes')
          .select('id, quote_number, total, currency, created_at, status, client:tt_clients(company_name)')
          .order('created_at', { ascending: false })
          .limit(10)

        if (e) throw e
        setQuotes((data as unknown as RecentQuote[]) || [])
      } catch {
        setError(true)
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [])

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
            <span className="text-xs font-mono text-[#FF6600]">{q.quote_number}</span>
            <Badge variant={
              q.status === 'aceptada' ? 'success' :
              q.status === 'rechazada' ? 'danger' :
              q.status === 'enviada' ? 'info' : 'default'
            }>
              {q.status}
            </Badge>
          </div>
          <p className="text-xs text-[#D1D5DB] truncate">
            {q.client?.company_name || 'Sin cliente'}
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
