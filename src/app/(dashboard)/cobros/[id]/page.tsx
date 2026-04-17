'use client'

import { useEffect, useState, useCallback } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { DocumentProcessBar } from '@/components/workflow/document-process-bar'
import { buildSteps } from '@/lib/workflow-definitions'
import { ArrowLeft, CheckCircle2, XCircle, ExternalLink, Search } from 'lucide-react'

interface Line {
  id: string
  line_number?: number
  date: string
  description: string
  reference?: string
  amount: number
  type?: string
  matched_document_id?: string
  matched_client_id?: string
  match_confidence?: number
  match_method?: string
  match_reason?: string
  match_status: 'unmatched' | 'suggested' | 'confirmed' | 'rejected' | 'ignored'
  matched_doc?: { legal_number?: string; invoice_number?: string; total?: number; client_id?: string }
}

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
  lines_count: number
  matched_count: number
  unmatched_count: number
  status: string
}

export default function StatementDetailPage() {
  const { id } = useParams<{ id: string }>()
  const router = useRouter()
  const supabase = createClient()
  const [statement, setStatement] = useState<Statement | null>(null)
  const [lines, setLines] = useState<Line[]>([])
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState<'all' | 'unmatched' | 'suggested' | 'confirmed'>('all')

  const load = useCallback(async () => {
    setLoading(true)
    const { data: stmt } = await supabase.from('tt_bank_statements').select('*').eq('id', id).single()
    setStatement(stmt as Statement)

    const { data: lns } = await supabase
      .from('tt_bank_statement_lines')
      .select(`
        *,
        matched_doc:tt_documents!tt_bank_statement_lines_matched_document_id_fkey (
          legal_number, invoice_number, total
        )
      `)
      .eq('statement_id', id)
      .order('date', { ascending: true })

    setLines((lns as Line[]) || [])
    setLoading(false)
  }, [id])

  useEffect(() => { void load() }, [load])

  async function confirmMatch(lineId: string, action: 'confirm' | 'reject') {
    const res = await fetch('/api/bank-statements/confirm-match', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ lineId, action }),
    })
    if (res.ok) {
      setLines((prev) => prev.map((l) => l.id === lineId ? {
        ...l, match_status: action === 'confirm' ? 'confirmed' : 'rejected',
      } : l))
    } else {
      const j = await res.json()
      alert('Error: ' + j.error)
    }
  }

  const filtered = filter === 'all' ? lines : lines.filter((l) => l.match_status === filter)
  const counts = {
    all: lines.length,
    unmatched: lines.filter((l) => l.match_status === 'unmatched').length,
    suggested: lines.filter((l) => l.match_status === 'suggested').length,
    confirmed: lines.filter((l) => l.match_status === 'confirmed').length,
  }

  const matchedPct = statement?.lines_count ? Math.round((statement.matched_count / statement.lines_count) * 100) : 0
  const stepId = !statement ? 'uploaded'
    : matchedPct === 100 ? 'reconciled'
    : counts.suggested > 0 ? 'review'
    : statement.status === 'parsed' ? 'auto_match'
    : 'parsed'

  return (
    <div className="space-y-4">
      <DocumentProcessBar
        code={`EXT-${statement?.id?.slice(0, 8) || '…'}`}
        badge={{
          label: statement?.status || 'cargando',
          variant: matchedPct === 100 ? 'success' : matchedPct > 0 ? 'warning' : 'info',
        }}
        entity={statement && (
          <span>
            <strong>{statement.bank_name || 'Banco sin nombre'}</strong>
            {statement.account_number && ` · Cuenta ${statement.account_number}`}
            {statement.period_from && statement.period_to && ` · ${statement.period_from} → ${statement.period_to}`}
            {` · Moneda ${statement.currency}`}
          </span>
        )}
        alerts={[
          ...(statement && counts.unmatched > 0 ? [{ type: 'warning' as const, message: `${counts.unmatched} líneas sin match — revisá manualmente` }] : []),
          ...(statement && counts.suggested > 0 ? [{ type: 'info' as const, message: `${counts.suggested} sugerencias IA pendientes de confirmar` }] : []),
          ...(statement && counts.all > 0 && counts.confirmed === counts.all ? [{ type: 'success' as const, message: '✓ Extracto totalmente conciliado' }] : []),
        ]}
        steps={buildSteps('bank_statement', stepId)}
        actions={statement?.original_pdf_url ? [{
          label: 'Ver PDF', variant: 'ghost' as const,
          onClick: () => window.open(statement.original_pdf_url!, '_blank'),
        }] : []}
        onClose={() => router.back()}
      />
      <div className="px-6 space-y-4">
      <div className="flex items-center gap-3" style={{ display: 'none' }}>
        <Button variant="secondary" size="sm" onClick={() => router.back()}>
          <ArrowLeft className="w-4 h-4 mr-1" /> Volver
        </Button>
        <h1 className="text-2xl font-bold">{statement?.bank_name || 'Extracto'}</h1>
        {statement?.account_number && <span className="opacity-60">· {statement.account_number}</span>}
        {statement?.original_pdf_url && (
          <a href={statement.original_pdf_url} target="_blank" rel="noopener noreferrer" className="text-xs underline opacity-70 ml-auto">
            <ExternalLink className="w-3 h-3 inline" /> Ver PDF original
          </a>
        )}
      </div>

      {statement && (
        <div className="grid grid-cols-4 gap-3">
          <KPI label="Periodo" value={`${statement.period_from || '–'} → ${statement.period_to || '–'}`} />
          <KPI label="Saldo inicial" value={statement.opening_balance != null ? `$${statement.opening_balance.toLocaleString('es-AR')}` : '—'} />
          <KPI label="Saldo final" value={statement.closing_balance != null ? `$${statement.closing_balance.toLocaleString('es-AR')}` : '—'} />
          <KPI label="Moneda" value={statement.currency} />
        </div>
      )}

      <div className="flex gap-2">
        <FilterBtn label={`Todas ${counts.all}`} active={filter === 'all'} onClick={() => setFilter('all')} />
        <FilterBtn label={`✓ Confirmadas ${counts.confirmed}`} active={filter === 'confirmed'} onClick={() => setFilter('confirmed')} />
        <FilterBtn label={`💡 Sugeridas ${counts.suggested}`} active={filter === 'suggested'} onClick={() => setFilter('suggested')} />
        <FilterBtn label={`⚠️ Sin match ${counts.unmatched}`} active={filter === 'unmatched'} onClick={() => setFilter('unmatched')} />
      </div>

      <Card className="p-0 overflow-hidden">
        {loading ? (
          <div className="p-8 text-center opacity-60">Cargando...</div>
        ) : filtered.length === 0 ? (
          <div className="p-8 text-center opacity-60">Sin líneas</div>
        ) : (
          <div className="divide-y" style={{ borderColor: '#2A3040' }}>
            {filtered.map((l) => (
              <LineRow key={l.id} line={l} onConfirm={() => confirmMatch(l.id, 'confirm')} onReject={() => confirmMatch(l.id, 'reject')} />
            ))}
          </div>
        )}
      </Card>
      </div>
    </div>
  )
}

function KPI({ label, value }: { label: string; value: string }) {
  return (
    <div className="p-3 rounded-lg border" style={{ borderColor: '#2A3040', background: '#151821' }}>
      <div className="text-xs opacity-60">{label}</div>
      <div className="text-lg font-bold mt-1">{value}</div>
    </div>
  )
}

function FilterBtn({ label, active, onClick }: { label: string; active: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="px-3 py-1.5 rounded-md text-xs font-semibold"
      style={{
        background: active ? 'var(--sat-or, #f97316)' : 'transparent',
        color: active ? '#0A0C0F' : 'inherit',
        border: '1px solid #2A3040',
      }}
    >
      {label}
    </button>
  )
}

function LineRow({ line, onConfirm, onReject }: { line: Line; onConfirm: () => void; onReject: () => void }) {
  const bg =
    line.match_status === 'confirmed' ? 'rgba(16,185,129,0.05)'
    : line.match_status === 'suggested' ? 'rgba(249,115,22,0.05)'
    : line.match_status === 'rejected' ? 'rgba(239,68,68,0.05)'
    : 'transparent'

  const conf = line.match_confidence || 0
  const confColor = conf >= 0.85 ? '#10b981' : conf >= 0.6 ? '#f97316' : '#ef4444'

  return (
    <div className="p-3" style={{ background: bg }}>
      <div className="flex items-start gap-3">
        <div className="text-xs opacity-60 w-20">{line.date}</div>
        <div className="flex-1 min-w-0">
          <div className="text-sm font-mono truncate">{line.description}</div>
          {line.reference && <div className="text-xs opacity-60">ref: {line.reference}</div>}
          {line.match_reason && (
            <div className="text-xs mt-1 flex items-center gap-2">
              <Badge variant="default">{line.match_method}</Badge>
              <span style={{ color: confColor }}>{Math.round(conf * 100)}%</span>
              <span className="opacity-70">{line.match_reason}</span>
            </div>
          )}
          {line.matched_doc && (
            <div className="text-xs mt-1 opacity-80">
              → Factura <strong>{line.matched_doc.legal_number || line.matched_doc.invoice_number}</strong>
              {line.matched_doc.total ? ` · $${Number(line.matched_doc.total).toLocaleString('es-AR')}` : ''}
            </div>
          )}
        </div>
        <div className="text-right">
          <div className="font-bold" style={{ color: line.amount >= 0 ? '#10b981' : '#ef4444' }}>
            {line.amount >= 0 ? '+' : ''}${line.amount.toLocaleString('es-AR')}
          </div>
          {line.match_status === 'confirmed' && <Badge>✓ Confirmado</Badge>}
          {line.match_status === 'rejected' && <Badge variant="default">✗ Rechazado</Badge>}
          {line.match_status === 'unmatched' && <Badge variant="default">Sin match</Badge>}
        </div>
        {(line.match_status === 'suggested') && (
          <div className="flex flex-col gap-1">
            <Button size="sm" onClick={onConfirm}>
              <CheckCircle2 className="w-3 h-3 mr-1" /> Confirmar
            </Button>
            <Button size="sm" variant="secondary" onClick={onReject}>
              <XCircle className="w-3 h-3 mr-1" /> Rechazar
            </Button>
          </div>
        )}
        {line.match_status === 'unmatched' && line.amount > 0 && (
          <Button size="sm" variant="secondary" onClick={() => alert('TODO: picker manual de factura')}>
            <Search className="w-3 h-3 mr-1" /> Buscar manual
          </Button>
        )}
      </div>
    </div>
  )
}
