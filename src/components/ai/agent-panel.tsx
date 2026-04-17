'use client'

import { useState } from 'react'
import { Bot, Send, Loader2, CheckCircle, XCircle, ChevronRight, Sparkles, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { useCompanyContext } from '@/lib/company-context'

interface AgentAction {
  tool: string
  params: Record<string, unknown>
  result?: unknown
  error?: string
  status: 'pending' | 'success' | 'failed'
}

interface AgentResult {
  taskId?: string
  plan: string[]
  actions: AgentAction[]
  summary: string
  ai_provider: string
  dryRun: boolean
  error?: string
}

const PRESET_TASKS = [
  { icon: '💰', label: 'Cobrá facturas vencidas', task: 'cobrá las facturas vencidas esta semana' },
  { icon: '🔥', label: 'Seguí leads hot', task: 'seguí los leads hot sin contacto reciente' },
  { icon: '📊', label: 'Cierre del mes', task: 'preparame el cierre del mes con resumen de ventas y facturas' },
  { icon: '⚠️', label: 'Alertas críticas', task: 'generá alertas para las situaciones más críticas del negocio' },
]

interface AgentPanelProps {
  onClose?: () => void
}

export function AgentPanel({ onClose }: AgentPanelProps) {
  const { activeCompany } = useCompanyContext()
  const [task, setTask] = useState('')
  const [loading, setLoading] = useState(false)
  const [planResult, setPlanResult] = useState<AgentResult | null>(null)
  const [executing, setExecuting] = useState(false)
  const [finalResult, setFinalResult] = useState<AgentResult | null>(null)
  const [error, setError] = useState<string | null>(null)

  const handlePlan = async (taskText?: string) => {
    const t = (taskText ?? task).trim()
    if (!t || !activeCompany?.id) return
    setLoading(true)
    setError(null)
    setPlanResult(null)
    setFinalResult(null)

    try {
      const res = await fetch('/api/ai/agent', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ companyId: activeCompany.id, task: t, dryRun: true }),
      })
      const data = await res.json() as AgentResult
      if (!res.ok) throw new Error(data.error || 'Error al planificar')
      setPlanResult(data)
      if (taskText) setTask(taskText)
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setLoading(false)
    }
  }

  const handleExecute = async () => {
    const t = task.trim()
    if (!t || !activeCompany?.id || !planResult) return
    setExecuting(true)
    setError(null)

    try {
      const res = await fetch('/api/ai/agent', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ companyId: activeCompany.id, task: t, dryRun: false }),
      })
      const data = await res.json() as AgentResult
      if (!res.ok) throw new Error(data.error || 'Error al ejecutar')
      setFinalResult(data)
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setExecuting(false)
    }
  }

  const reset = () => {
    setTask('')
    setPlanResult(null)
    setFinalResult(null)
    setError(null)
  }

  return (
    <div
      className="flex flex-col h-full"
      style={{ background: '#0F1218' }}
    >
      {/* Header */}
      <div
        className="flex items-center justify-between p-4 border-b"
        style={{ borderColor: '#2A3040', background: 'linear-gradient(90deg, rgba(249,115,22,0.08), transparent)' }}
      >
        <div className="flex items-center gap-3">
          <div
            className="w-9 h-9 rounded-xl flex items-center justify-center"
            style={{ background: 'linear-gradient(135deg, #f97316, #ef4444)' }}
          >
            <Bot className="w-5 h-5 text-white" />
          </div>
          <div>
            <div className="font-bold text-[#F0F2F5]">Agente IA Autónomo</div>
            <div className="text-[10px] text-[#9CA3AF]">
              {activeCompany?.name || 'Sin empresa'} · podés darme tareas en lenguaje natural
            </div>
          </div>
        </div>
        {onClose && (
          <button type="button" onClick={onClose} className="p-1.5 rounded hover:bg-white/10">
            <X className="w-4 h-4 text-[#9CA3AF]" />
          </button>
        )}
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {/* Preset tasks */}
        {!planResult && !finalResult && (
          <div>
            <div className="text-[10px] text-[#9CA3AF] uppercase font-bold mb-2">Tareas frecuentes</div>
            <div className="grid grid-cols-2 gap-2">
              {PRESET_TASKS.map((p) => (
                <button
                  key={p.label}
                  type="button"
                  onClick={() => handlePlan(p.task)}
                  disabled={loading}
                  className="p-3 text-left rounded-xl border hover:border-orange-500/40 transition-all text-sm"
                  style={{ background: '#151821', borderColor: '#2A3040' }}
                >
                  <div className="text-xl mb-1">{p.icon}</div>
                  <div className="font-medium text-[#F0F2F5] text-xs">{p.label}</div>
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Error */}
        {error && (
          <div className="flex items-center gap-2 text-sm text-red-400 bg-red-500/10 border border-red-500/20 rounded-xl px-3 py-2">
            <XCircle className="w-4 h-4 shrink-0" />
            {error}
          </div>
        )}

        {/* Plan preview */}
        {planResult && !finalResult && (
          <div className="space-y-3">
            <div className="flex items-center gap-2">
              <Sparkles className="w-4 h-4 text-orange-400" />
              <span className="text-sm font-semibold text-[#F0F2F5]">Plan de acción</span>
            </div>

            <div className="rounded-xl border divide-y divide-[#2A3040]" style={{ borderColor: '#2A3040' }}>
              {planResult.plan.map((step, i) => (
                <div key={i} className="flex items-start gap-3 px-3 py-2.5">
                  <div
                    className="w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold shrink-0 mt-0.5"
                    style={{ background: 'rgba(249,115,22,0.15)', color: '#f97316', border: '1px solid rgba(249,115,22,0.3)' }}
                  >
                    {i + 1}
                  </div>
                  <span className="text-sm text-[#F0F2F5]">{step}</span>
                </div>
              ))}
            </div>

            <div className="flex gap-2">
              <Button
                type="button"
                variant="primary"
                onClick={handleExecute}
                disabled={executing}
                className="flex-1"
              >
                {executing ? (
                  <><Loader2 className="w-4 h-4 animate-spin" /> Ejecutando...</>
                ) : (
                  <><ChevronRight className="w-4 h-4" /> Ejecutar plan</>
                )}
              </Button>
              <Button type="button" variant="ghost" onClick={reset} disabled={executing}>
                Cancelar
              </Button>
            </div>
          </div>
        )}

        {/* Final result */}
        {finalResult && (
          <div className="space-y-3">
            <div
              className="rounded-xl border p-3"
              style={{ background: '#151821', borderColor: 'rgba(16,185,129,0.3)' }}
            >
              <div className="flex items-center gap-2 mb-2">
                <CheckCircle className="w-4 h-4 text-emerald-400" />
                <span className="text-sm font-semibold text-emerald-400">Tarea completada</span>
              </div>
              <p className="text-sm text-[#F0F2F5]">{finalResult.summary}</p>
            </div>

            {/* Actions log */}
            {finalResult.actions.length > 0 && (
              <div>
                <div className="text-[10px] text-[#9CA3AF] uppercase font-bold mb-2">
                  Acciones ejecutadas ({finalResult.actions.length})
                </div>
                <div className="space-y-1.5">
                  {finalResult.actions.map((action, i) => (
                    <div
                      key={i}
                      className="flex items-start gap-2 rounded-lg px-3 py-2 text-xs"
                      style={{
                        background: action.status === 'success' ? 'rgba(16,185,129,0.05)' : 'rgba(239,68,68,0.05)',
                        border: `1px solid ${action.status === 'success' ? 'rgba(16,185,129,0.2)' : 'rgba(239,68,68,0.2)'}`,
                      }}
                    >
                      {action.status === 'success' ? (
                        <CheckCircle className="w-3 h-3 text-emerald-400 shrink-0 mt-0.5" />
                      ) : (
                        <XCircle className="w-3 h-3 text-red-400 shrink-0 mt-0.5" />
                      )}
                      <div className="flex-1 min-w-0">
                        <span className="font-mono text-[#9CA3AF]">{action.tool}</span>
                        {action.result != null && (
                          <span className="ml-2 text-[#F0F2F5]">
                            {typeof action.result === 'string'
                              ? action.result
                              : JSON.stringify(action.result as Record<string, unknown>)}
                          </span>
                        )}
                        {action.error && <span className="ml-2 text-red-400">{action.error}</span>}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            <Button type="button" variant="secondary" onClick={reset} className="w-full">
              Nueva tarea
            </Button>
          </div>
        )}

        {loading && (
          <div className="flex items-center justify-center gap-3 py-8 text-[#9CA3AF]">
            <Loader2 className="w-5 h-5 animate-spin text-orange-400" />
            <span className="text-sm">Planificando tarea con IA...</span>
          </div>
        )}
      </div>

      {/* Input */}
      {!planResult && !finalResult && (
        <div className="p-4 border-t" style={{ borderColor: '#2A3040' }}>
          <div className="flex gap-2">
            <input
              type="text"
              value={task}
              onChange={(e) => setTask(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handlePlan()}
              placeholder="¿Qué querés que haga? (ej: cobrá las facturas vencidas)"
              className="flex-1 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-1 focus:ring-orange-500/50"
              style={{ background: '#151821', border: '1px solid #2A3040', color: '#F0F2F5' }}
              disabled={loading}
            />
            <Button
              type="button"
              variant="primary"
              size="icon"
              onClick={() => handlePlan()}
              disabled={loading || !task.trim()}
            >
              {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
            </Button>
          </div>
        </div>
      )}
    </div>
  )
}
