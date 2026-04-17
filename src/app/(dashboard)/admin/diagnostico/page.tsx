'use client'

import { useEffect, useState } from 'react'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { CheckCircle2, XCircle, RefreshCw, Activity } from 'lucide-react'

interface Check {
  name: string
  ok: boolean
  detail?: string
}

interface Report {
  ok: boolean
  summary: string
  checks: Check[]
  counts: Record<string, number>
  companies: any[]
}

export default function DiagnosticoPage() {
  const [data, setData] = useState<Report | null>(null)
  const [loading, setLoading] = useState(true)

  async function load() {
    setLoading(true)
    try {
      const res = await fetch('/api/health/sales-chain')
      const j = await res.json()
      setData(j)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { void load() }, [])

  return (
    <div className="p-6 space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Activity className="w-6 h-6" /> Diagnóstico de la cadena de ventas
          </h1>
          <p className="text-sm opacity-60">Verificación de tablas, migrations, API keys y buckets</p>
        </div>
        <Button onClick={load} disabled={loading}>
          <RefreshCw className="w-4 h-4 mr-1" /> Re-chequear
        </Button>
      </div>

      {loading ? (
        <Card className="p-8 text-center opacity-60">Chequeando todo...</Card>
      ) : data ? (
        <>
          <Card className="p-4">
            <div className="flex items-center gap-3">
              {data.ok ? <CheckCircle2 className="w-8 h-8 text-green-500" /> : <XCircle className="w-8 h-8 text-red-500" />}
              <div>
                <div className="text-2xl font-bold">{data.summary}</div>
                <div className="text-sm opacity-60">{data.ok ? 'Todo OK — cadena lista para operar' : 'Hay problemas a resolver'}</div>
              </div>
            </div>
          </Card>

          <div className="grid grid-cols-5 gap-3">
            {Object.entries(data.counts).map(([k, v]) => (
              <div key={k} className="p-3 rounded-lg border" style={{ borderColor: '#2A3040', background: '#151821' }}>
                <div className="text-xs opacity-60">{k.replace('tt_', '')}</div>
                <div className="text-2xl font-bold mt-1">{v}</div>
              </div>
            ))}
          </div>

          <Card className="p-0 overflow-hidden">
            <div className="p-3 border-b font-semibold" style={{ borderColor: '#2A3040' }}>
              Empresas y prefijos
            </div>
            <div className="divide-y" style={{ borderColor: '#2A3040' }}>
              {data.companies.map((c) => (
                <div key={c.id} className="p-3 flex items-center gap-3">
                  <span className="font-mono text-lg font-bold" style={{ color: c.code_prefix ? '#f97316' : '#ef4444' }}>
                    {c.code_prefix || 'XX'}
                  </span>
                  <div className="flex-1">
                    <div className="font-semibold">{c.trade_name || c.name}</div>
                    <div className="text-xs opacity-60">
                      {c.legal_name && `${c.legal_name} · `}
                      {c.tax_id && `${c.tax_id} · `}
                      {c.country}
                    </div>
                  </div>
                  {!c.code_prefix && <span className="text-xs text-red-400">⚠ Sin prefijo</span>}
                </div>
              ))}
            </div>
          </Card>

          <Card className="p-0 overflow-hidden">
            <div className="p-3 border-b font-semibold" style={{ borderColor: '#2A3040' }}>
              Checks ({data.checks.filter((c) => c.ok).length}/{data.checks.length} OK)
            </div>
            <div className="divide-y" style={{ borderColor: '#2A3040' }}>
              {data.checks.map((c) => (
                <div key={c.name} className="p-2 flex items-center gap-3 text-sm">
                  {c.ok ? <CheckCircle2 className="w-4 h-4 text-green-500 shrink-0" /> : <XCircle className="w-4 h-4 text-red-500 shrink-0" />}
                  <div className="font-mono text-xs flex-1">{c.name}</div>
                  {c.detail && (
                    <div className="text-xs opacity-60 truncate max-w-md" title={c.detail}>{c.detail}</div>
                  )}
                </div>
              ))}
            </div>
          </Card>

          {!data.ok && (
            <Card className="p-4">
              <h3 className="font-bold mb-2">📋 Cómo arreglar lo que falla</h3>
              <ol className="text-sm space-y-1 list-decimal pl-5">
                <li>Si falta una <strong>TABLE</strong>: aplicá las migrations v17, v18, v19, v20, v21, v22 en orden en el SQL Editor de Supabase</li>
                <li>Si falta <strong>next_document_code</strong>: aplicá v20</li>
                <li>Si falta <strong>ai_* en tt_opportunities</strong>: aplicá v21</li>
                <li>Si falta un <strong>BUCKET</strong>: aplicá v13, v17 y v19</li>
                <li>Si falta una <strong>ENV</strong>: agregá al <code>.env.local</code> y reiniciá el dev</li>
                <li>Si <strong>COMPANIES con code_prefix = 0</strong>: correr v20 (auto-seedea Torquetools/Buscatools/Torquear/GlobalAssembly)</li>
              </ol>
            </Card>
          )}
        </>
      ) : (
        <Card className="p-8 text-center">Error cargando diagnóstico</Card>
      )}
    </div>
  )
}
