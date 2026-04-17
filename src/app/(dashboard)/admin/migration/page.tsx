'use client'

import { useEffect, useState, useCallback } from 'react'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { useCompanyContext } from '@/lib/company-context'
import { Play, CheckCircle2, XCircle, Loader2, RefreshCw, AlertTriangle } from 'lucide-react'

interface PhaseRow {
  id: string
  label: string
  entity: string
  lastRun?: {
    status: 'running' | 'completed' | 'failed' | 'partial'
    processed?: number
    inserted?: number
    errors?: number
    started_at?: string
    completed_at?: string
  } | null
}

export default function MigrationPage() {
  const { activeCompany } = useCompanyContext()
  const [phases, setPhases] = useState<PhaseRow[]>([])
  const [running, setRunning] = useState<string | null>(null)
  const [log, setLog] = useState<Array<{ ts: string; msg: string; type: 'info'|'ok'|'err' }>>([])
  const [runAll, setRunAll] = useState(false)

  const load = useCallback(async () => {
    if (!activeCompany?.id) return
    const res = await fetch(`/api/migration/stelorder?companyId=${activeCompany.id}`)
    const j = await res.json()
    setPhases(j.phases || [])
  }, [activeCompany?.id])

  useEffect(() => { void load() }, [load])

  function addLog(msg: string, type: 'info'|'ok'|'err' = 'info') {
    setLog((l) => [...l, { ts: new Date().toISOString().slice(11, 19), msg, type }])
  }

  async function runPhase(phaseId: string) {
    if (!activeCompany?.id || running) return
    setRunning(phaseId)
    const phase = phases.find((p) => p.id === phaseId)
    addLog(`▶ Ejecutando: ${phase?.label}...`)
    try {
      const res = await fetch('/api/migration/stelorder', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ companyId: activeCompany.id, phaseId }),
      })
      const j = await res.json()
      if (res.ok && j.ok) {
        const { processed, inserted, errors } = j.result
        addLog(`✓ ${phase?.label}: ${processed} items, ${inserted} insertados, ${errors} errores (${Math.round(j.durationMs/1000)}s)`, errors > 0 ? 'err' : 'ok')
      } else {
        addLog(`✗ ${phase?.label}: ${j.error}`, 'err')
      }
    } catch (err) {
      addLog(`✗ ${phase?.label}: ${(err as Error).message}`, 'err')
    } finally {
      setRunning(null)
      void load()
    }
  }

  async function runAllPhases() {
    if (!activeCompany?.id || running) return
    if (!confirm('Se ejecutarán TODAS las fases en orden. Puede tardar 30 min - 3 horas según volumen. ¿Continuar?')) return
    setRunAll(true)
    addLog(`▶▶ INICIO DE MIGRACIÓN COMPLETA — ${phases.length} fases`)
    for (const p of phases) {
      if (!runAll) break
      await runPhase(p.id)
      // Pequeña pausa entre fases
      await new Promise(r => setTimeout(r, 500))
    }
    addLog(`✓✓ MIGRACIÓN COMPLETA`, 'ok')
    setRunAll(false)
  }

  function statusBadge(p: PhaseRow) {
    if (running === p.id) return <Badge variant="warning"><Loader2 className="w-3 h-3 inline animate-spin mr-1" /> Corriendo</Badge>
    if (!p.lastRun) return <Badge>Pendiente</Badge>
    if (p.lastRun.status === 'completed') return <Badge variant="success">✓ OK</Badge>
    if (p.lastRun.status === 'partial') return <Badge variant="warning">⚠ Parcial</Badge>
    if (p.lastRun.status === 'failed') return <Badge variant="danger">✗ Falló</Badge>
    if (p.lastRun.status === 'running') return <Badge variant="warning">Corriendo...</Badge>
    return <Badge>{p.lastRun.status}</Badge>
  }

  return (
    <div className="p-6 space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Migración StelOrder → Mocciaro Soft</h1>
          <p className="text-sm opacity-60">
            Empresa activa: <strong>{activeCompany?.name || '—'}</strong>
            {' · '}Prefijo: <strong>{(activeCompany as any)?.code_prefix || '—'}</strong>
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="secondary" onClick={load}><RefreshCw className="w-4 h-4 mr-1" /> Refrescar</Button>
          <Button onClick={runAllPhases} disabled={!!running}>
            <Play className="w-4 h-4 mr-1" /> Migrar todo
          </Button>
        </div>
      </div>

      {!activeCompany?.id && (
        <Card className="p-4">
          <div style={{ background: 'rgba(239,68,68,0.1)', padding: 8, borderRadius: 6 }}>
            <AlertTriangle className="w-5 h-5 inline mr-2" />
            Seleccioná una empresa activa antes de migrar. Recomendado: <strong>Torquetools SL</strong>
          </div>
        </Card>
      )}

      <Card className="p-0 overflow-hidden">
        <div className="p-3 border-b font-semibold" style={{ borderColor: '#2A3040' }}>
          Fases ({phases.length})
        </div>
        <div className="divide-y" style={{ borderColor: '#2A3040' }}>
          {phases.map((p) => (
            <div key={p.id} className="p-3 flex items-center gap-3">
              <span className="font-mono text-xs opacity-60 w-20">{p.id}</span>
              <div className="flex-1 min-w-0">
                <div className="font-semibold">{p.label}</div>
                <div className="text-xs opacity-60">entity: {p.entity}</div>
                {p.lastRun && (
                  <div className="text-xs mt-1 opacity-80">
                    Última: <strong>{p.lastRun.processed ?? 0}</strong> items ·
                    {' '}{p.lastRun.inserted ?? 0} insertados
                    {p.lastRun.errors ? ` · ${p.lastRun.errors} errores` : ''}
                  </div>
                )}
              </div>
              <div className="flex items-center gap-2">
                {statusBadge(p)}
                <Button
                  size="sm"
                  onClick={() => runPhase(p.id)}
                  disabled={!!running || !activeCompany?.id}
                >
                  {running === p.id ? 'Corriendo...' : 'Ejecutar'}
                </Button>
              </div>
            </div>
          ))}
        </div>
      </Card>

      {log.length > 0 && (
        <Card className="p-0 overflow-hidden">
          <div className="p-3 border-b font-semibold flex justify-between" style={{ borderColor: '#2A3040' }}>
            <span>Log de ejecución ({log.length})</span>
            <button className="text-xs underline opacity-60" onClick={() => setLog([])}>Limpiar</button>
          </div>
          <div className="p-3 font-mono text-xs max-h-96 overflow-y-auto">
            {log.map((l, i) => (
              <div key={i} style={{
                color: l.type === 'ok' ? '#10b981' : l.type === 'err' ? '#ef4444' : 'inherit',
              }}>
                <span className="opacity-60">[{l.ts}]</span> {l.msg}
              </div>
            ))}
          </div>
        </Card>
      )}
    </div>
  )
}
