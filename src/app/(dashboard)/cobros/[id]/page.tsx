'use client'

import { useEffect, useState, useCallback, useMemo } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { DocumentProcessBar } from '@/components/workflow/document-process-bar'
import { buildSteps } from '@/lib/workflow-definitions'
import { CheckCircle2, XCircle, Search, X as XIcon } from 'lucide-react'

interface InvoiceMatch {
  id: string
  display_ref: string | null
  legal_number: string | null
  invoice_number: string | null
  total: number | null
  status: string | null
  client_name?: string | null
}

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
  const [pickerLine, setPickerLine] = useState<Line | null>(null)

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

  async function confirmMatch(lineId: string, action: 'confirm' | 'reject', documentId?: string) {
    const res = await fetch('/api/bank-statements/confirm-match', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ lineId, action, documentId }),
    })
    if (res.ok) {
      setLines((prev) => prev.map((l) => l.id === lineId ? {
        ...l, match_status: action === 'confirm' ? 'confirmed' : 'rejected',
      } : l))
    } else {
      const j = await res.json().catch(() => ({ error: 'Error desconocido' }))
      alert('Error: ' + j.error)
    }
  }

  async function handlePickerConfirm(line: Line, invoice: InvoiceMatch) {
    await confirmMatch(line.id, 'confirm', invoice.id)
    setPickerLine(null)
    void load()
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
              <LineRow
                key={l.id}
                line={l}
                onConfirm={() => confirmMatch(l.id, 'confirm')}
                onReject={() => confirmMatch(l.id, 'reject')}
                onPick={() => setPickerLine(l)}
              />
            ))}
          </div>
        )}
      </Card>
      </div>

      {pickerLine && (
        <InvoicePickerModal
          line={pickerLine}
          onClose={() => setPickerLine(null)}
          onPick={(inv) => handlePickerConfirm(pickerLine, inv)}
        />
      )}
    </div>
  )
}

function InvoicePickerModal({
  line,
  onClose,
  onPick,
}: {
  line: Line
  onClose: () => void
  onPick: (invoice: InvoiceMatch) => void
}) {
  const supabase = createClient()
  const [search, setSearch] = useState('')
  const [results, setResults] = useState<InvoiceMatch[]>([])
  const [loading, setLoading] = useState(false)
  const [selected, setSelected] = useState<InvoiceMatch | null>(null)

  // Rango de tolerancia ±20% sobre el monto de la línea
  const minAmount = useMemo(() => Math.abs(line.amount) * 0.8, [line.amount])
  const maxAmount = useMemo(() => Math.abs(line.amount) * 1.2, [line.amount])

  useEffect(() => {
    let cancelled = false
    async function run() {
      setLoading(true)
      let query = supabase
        .from('tt_documents')
        .select(`
          id, display_ref, legal_number, invoice_number, total, status,
          client:tt_clients ( name, legal_name )
        `)
        .eq('doc_type', 'factura')
        .in('status', ['pending', 'partial', 'open', 'sent', 'draft'])
        .gte('total', minAmount)
        .lte('total', maxAmount)
        .order('created_at', { ascending: false })
        .limit(50)

      if (search.trim()) {
        const term = `%${search.trim()}%`
        query = query.or(
          `display_ref.ilike.${term},legal_number.ilike.${term},invoice_number.ilike.${term}`
        )
      }

      const { data } = await query
      if (cancelled) return
      const mapped: InvoiceMatch[] = (data || []).map((r: Record<string, unknown>) => {
        const client = r.client as { name?: string; legal_name?: string } | null
        return {
          id: r.id as string,
          display_ref: (r.display_ref as string) ?? null,
          legal_number: (r.legal_number as string) ?? null,
          invoice_number: (r.invoice_number as string) ?? null,
          total: (r.total as number) ?? null,
          status: (r.status as string) ?? null,
          client_name: client?.legal_name || client?.name || null,
        }
      })
      setResults(mapped)
      setLoading(false)
    }
    const t = setTimeout(run, 250)
    return () => { cancelled = true; clearTimeout(t) }
  }, [search, minAmount, maxAmount, supabase])

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ background: 'rgba(0,0,0,0.6)' }}
      onClick={onClose}
    >
      <div
        className="w-full max-w-2xl rounded-lg overflow-hidden flex flex-col"
        style={{ background: '#151821', border: '1px solid #2A3040', maxHeight: '85vh' }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="p-4 border-b flex items-center justify-between" style={{ borderColor: '#2A3040' }}>
          <div>
            <div className="text-sm font-semibold">Buscar factura para conciliar</div>
            <div className="text-xs opacity-60 mt-1">
              Movimiento: {line.date} · ${line.amount.toLocaleString('es-AR')} · {line.description}
            </div>
            <div className="text-xs opacity-50 mt-1">
              Mostrando facturas pendientes con total entre ${minAmount.toLocaleString('es-AR')} y ${maxAmount.toLocaleString('es-AR')} (±20%)
            </div>
          </div>
          <button onClick={onClose} className="p-1 opacity-60 hover:opacity-100" aria-label="Cerrar">
            <XIcon className="w-5 h-5" />
          </button>
        </div>

        <div className="p-3 border-b" style={{ borderColor: '#2A3040' }}>
          <input
            autoFocus
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar por número de factura, referencia..."
            className="w-full px-3 py-2 rounded text-sm"
            style={{ background: '#0A0C0F', border: '1px solid #2A3040', color: 'inherit' }}
          />
        </div>

        <div className="flex-1 overflow-y-auto">
          {loading ? (
            <div className="p-6 text-center text-sm opacity-60">Buscando...</div>
          ) : results.length === 0 ? (
            <div className="p-6 text-center text-sm opacity-60">Sin facturas que matcheen el rango de monto</div>
          ) : (
            <div className="divide-y" style={{ borderColor: '#2A3040' }}>
              {results.map((inv) => {
                const isSel = selected?.id === inv.id
                const ref = inv.display_ref || inv.legal_number || inv.invoice_number || '-'
                return (
                  <button
                    key={inv.id}
                    type="button"
                    onClick={() => setSelected(inv)}
                    className="w-full text-left p-3 hover:opacity-80"
                    style={{ background: isSel ? 'rgba(249,115,22,0.1)' : 'transparent' }}
                  >
                    <div className="flex items-center justify-between gap-3">
                      <div className="min-w-0 flex-1">
                        <div className="text-sm font-semibold truncate">{ref}</div>
                        <div className="text-xs opacity-70 truncate">{inv.client_name || 'Sin cliente'}</div>
                      </div>
                      <div className="text-right shrink-0">
                        <div className="text-sm font-bold">${(inv.total || 0).toLocaleString('es-AR')}</div>
                        <Badge variant="default">{inv.status || '-'}</Badge>
                      </div>
                    </div>
                  </button>
                )
              })}
            </div>
          )}
        </div>

        <div className="p-3 border-t flex items-center justify-end gap-2" style={{ borderColor: '#2A3040' }}>
          <Button variant="secondary" onClick={onClose}>Cancelar</Button>
          <Button onClick={() => selected && onPick(selected)} disabled={!selected}>
            Confirmar match
          </Button>
        </div>
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

function LineRow({ line, onConfirm, onReject, onPick }: { line: Line; onConfirm: () => void; onReject: () => void; onPick: () => void }) {
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
          <Button size="sm" variant="secondary" onClick={onPick}>
            <Search className="w-3 h-3 mr-1" /> Buscar manual
          </Button>
        )}
      </div>
    </div>
  )
}
