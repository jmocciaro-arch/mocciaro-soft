'use client'

import { useEffect, useState, useCallback } from 'react'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import { useCompanyFilter } from '@/hooks/use-company-filter'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { BankStatementUploader } from '@/components/ai/bank-statement-uploader'
import { Plus, RefreshCw, FileText, CheckCircle2, Clock, Banknote } from 'lucide-react'

interface Statement {
  id: string
  bank_name?: string
  account_number?: string
  currency: string
  period_from?: string
  period_to?: string
  opening_balance?: number
  closing_balance?: number
  original_pdf_url?: string
  parsed_by?: string
  lines_count: number
  matched_count: number
  unmatched_count: number
  status: string
  created_at: string
}

export default function CobrosPage() {
  const supabase = createClient()
  const { filterByCompany, activeCompanyId } = useCompanyFilter()
  const [statements, setStatements] = useState<Statement[]>([])
  const [loading, setLoading] = useState(true)
  const [uploaderOpen, setUploaderOpen] = useState(false)
  const [openInvoices, setOpenInvoices] = useState<number>(0)
  const [collectedThisMonth, setCollectedThisMonth] = useState<number>(0)

  const load = useCallback(async () => {
    setLoading(true)
    const q = supabase.from('tt_bank_statements').select('*').order('created_at', { ascending: false }).limit(50)
    const { data } = await filterByCompany(q)
    setStatements((data as Statement[]) || [])

    // KPIs
    const openQ = supabase.from('tt_documents').select('total', { count: 'exact' })
      .eq('doc_type', 'factura').in('status', ['emitida', 'autorizada', 'pendiente_cobro'])
    const { count: openCount } = await filterByCompany(openQ) as any
    setOpenInvoices(openCount || 0)

    const firstDay = new Date()
    firstDay.setDate(1)
    const collQ = supabase.from('tt_documents').select('total')
      .eq('doc_type', 'factura').eq('status', 'cobrada')
      .gte('updated_at', firstDay.toISOString())
    const { data: colls } = await filterByCompany(collQ)
    setCollectedThisMonth((colls || []).reduce((s: number, d: any) => s + Number(d.total || 0), 0))

    setLoading(false)
  }, [activeCompanyId])

  useEffect(() => { void load() }, [load])

  return (
    <div className="p-6 space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Banknote className="w-6 h-6 text-green-500" /> Cobros y conciliación bancaria
          </h1>
          <p className="text-sm opacity-60">Subí extractos → IA matchea automáticamente con facturas pendientes</p>
        </div>
        <Button onClick={() => setUploaderOpen(true)}><Plus className="w-4 h-4 mr-1" /> Subir extracto</Button>
      </div>

      <div className="grid grid-cols-4 gap-3">
        <KPI label="📄 Facturas pendientes" value={String(openInvoices)} />
        <KPI label="✓ Cobrado este mes" value={`$${collectedThisMonth.toLocaleString('es-AR')}`} color="#10b981" />
        <KPI label="📊 Extractos cargados" value={String(statements.length)} />
        <KPI
          label="🤖 Auto-match promedio"
          value={statements.length ? `${Math.round(
            statements.reduce((s, st) => s + (st.lines_count ? st.matched_count / st.lines_count : 0), 0) / statements.length * 100
          )}%` : '—'}
          color="#f97316"
        />
      </div>

      <Card className="p-0 overflow-hidden">
        <div className="p-3 border-b flex items-center justify-between" style={{ borderColor: '#2A3040' }}>
          <strong>Extractos ({statements.length})</strong>
          <Button size="sm" variant="secondary" onClick={load}><RefreshCw className="w-3 h-3 mr-1" /> Refrescar</Button>
        </div>
        {loading ? (
          <div className="p-8 text-center opacity-60">Cargando...</div>
        ) : statements.length === 0 ? (
          <div className="p-8 text-center opacity-60">Sin extractos cargados — subí el primero con el botón</div>
        ) : (
          <div className="divide-y" style={{ borderColor: '#2A3040' }}>
            {statements.map((s) => {
              const pct = s.lines_count ? Math.round((s.matched_count / s.lines_count) * 100) : 0
              return (
                <Link key={s.id} href={`/cobros/${s.id}`} className="block p-3 hover:bg-[#1E2330]">
                  <div className="flex items-center gap-3">
                    <FileText className="w-5 h-5 opacity-60" />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <strong>{s.bank_name || 'Banco sin nombre'}</strong>
                        {s.account_number && <span className="text-xs opacity-60">· {s.account_number}</span>}
                        <Badge variant="default">{s.currency}</Badge>
                        {s.parsed_by && <Badge variant="default">🤖 {s.parsed_by}</Badge>}
                      </div>
                      <div className="text-xs opacity-60 mt-1">
                        {s.period_from && s.period_to && <>Periodo: {s.period_from} → {s.period_to} · </>}
                        {s.lines_count} líneas
                      </div>
                    </div>
                    <div className="text-right">
                      <div className="flex items-center gap-1">
                        <CheckCircle2 className="w-3 h-3" style={{ color: '#10b981' }} />
                        <strong>{s.matched_count}</strong>
                        <span className="opacity-60">/</span>
                        <Clock className="w-3 h-3" style={{ color: '#f97316' }} />
                        <strong>{s.unmatched_count}</strong>
                      </div>
                      <div className="text-xs opacity-60">
                        <span style={{ color: pct >= 80 ? '#10b981' : pct >= 50 ? '#f97316' : '#ef4444' }}>{pct}%</span> auto-matched
                      </div>
                    </div>
                  </div>
                </Link>
              )
            })}
          </div>
        )}
      </Card>

      {activeCompanyId && (
        <BankStatementUploader
          open={uploaderOpen}
          onClose={() => setUploaderOpen(false)}
          companyId={activeCompanyId}
          onUploaded={() => { setUploaderOpen(false); void load() }}
        />
      )}
    </div>
  )
}

function KPI({ label, value, color }: { label: string; value: string; color?: string }) {
  return (
    <div className="p-3 rounded-lg border" style={{ borderColor: '#2A3040', background: '#151821' }}>
      <div className="text-xs opacity-60">{label}</div>
      <div className="text-2xl font-bold mt-1" style={{ color: color || 'inherit' }}>{value}</div>
    </div>
  )
}
