'use client'

import { useState, useRef, useEffect } from 'react'
import { Modal } from '@/components/ui/modal'
import { Send, Loader2, AlertCircle, Sparkles, BookOpen } from 'lucide-react'

interface ChatMessage {
  role: 'user' | 'assistant'
  content: string
  timestamp: number
  meta?: { cacheHit?: boolean; costUsd?: number }
}

/**
 * Abrir desde cualquier lado del soft con:
 *   window.dispatchEvent(new CustomEvent('open-help'))
 *
 * El componente escucha ese evento y abre el modal.
 */

const SUGGESTIONS = [
  '¿Cómo importo una OC del cliente?',
  '¿Cómo creo una cotización nueva?',
  '¿Dónde veo qué productos compró un cliente?',
  '¿Cómo cambio de empresa activa?',
  '¿Qué muestra la línea de tiempo de un documento?',
  '¿Cómo recupero mi contraseña?',
]

export function HelpAssistant() {
  const [open, setOpen] = useState(false)
  const [history, setHistory] = useState<ChatMessage[]>([])
  const [question, setQuestion] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const scrollRef = useRef<HTMLDivElement>(null)

  const onClose = () => setOpen(false)

  // Escuchar evento global para abrir desde cualquier lado del soft
  useEffect(() => {
    const handler = () => setOpen(true)
    window.addEventListener('open-help', handler)
    return () => window.removeEventListener('open-help', handler)
  }, [])

  // Auto-scroll al fondo cuando hay mensaje nuevo
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight
    }
  }, [history, loading])

  async function ask(text: string) {
    const q = text.trim()
    if (!q || loading) return
    setError(null)
    setQuestion('')
    const userMsg: ChatMessage = { role: 'user', content: q, timestamp: Date.now() }
    const newHistory = [...history, userMsg]
    setHistory(newHistory)
    setLoading(true)
    try {
      const res = await fetch('/api/help/ask', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          question: q,
          history: history.map(m => ({ role: m.role, content: m.content })),
        }),
      })
      const j = await res.json()
      if (!res.ok) {
        setError(j.error || `HTTP ${res.status}`)
        return
      }
      setHistory([
        ...newHistory,
        { role: 'assistant', content: j.answer, timestamp: Date.now(), meta: j.meta },
      ])
    } catch (e) {
      setError(`Error de red: ${(e as Error).message}`)
    } finally {
      setLoading(false)
    }
  }

  function reset() {
    setHistory([])
    setError(null)
    setQuestion('')
  }

  return (
    <>
      <Modal isOpen={open} onClose={onClose} title="Asistente del soft" size="lg">
        <div className="flex flex-col h-[70vh] max-h-[600px]">
          {/* Header info */}
          <div className="px-4 py-3 border-b border-[#1E2330] bg-[#0F1218] rounded-t-lg flex items-center gap-3">
            <div className="w-9 h-9 rounded-full bg-[#FF6600]/20 flex items-center justify-center shrink-0">
              <Sparkles size={16} className="text-[#FF6600]" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold text-[#F0F2F5]">Asistente IA</p>
              <p className="text-[11px] text-[#6B7280]">Respuestas basadas en el manual de usuario · Claude Haiku 4.5</p>
            </div>
            {history.length > 0 && (
              <button
                onClick={reset}
                className="text-xs text-[#9CA3AF] hover:text-[#F0F2F5] px-2 py-1 rounded hover:bg-[#1E2330] transition"
                title="Empezar conversación nueva"
              >
                Limpiar
              </button>
            )}
          </div>

          {/* Mensajes */}
          <div ref={scrollRef} className="flex-1 overflow-y-auto p-4 space-y-3">
            {history.length === 0 && !loading && (
              <div className="space-y-3">
                <div className="text-center py-4">
                  <BookOpen size={36} className="mx-auto mb-3 text-[#3A4050]" />
                  <p className="text-sm text-[#9CA3AF]">
                    Preguntame cualquier cosa del soft.
                  </p>
                  <p className="text-[11px] text-[#6B7280] mt-1">
                    Respondo en base al manual oficial.
                  </p>
                </div>
                <div>
                  <p className="text-[10px] uppercase tracking-wider text-[#6B7280] font-semibold mb-2">Preguntas frecuentes</p>
                  <div className="space-y-1.5">
                    {SUGGESTIONS.map((s) => (
                      <button
                        key={s}
                        onClick={() => ask(s)}
                        className="w-full text-left px-3 py-2 rounded-md bg-[#1E2330] hover:bg-[#2A3040] text-xs text-[#9CA3AF] hover:text-[#F0F2F5] transition border border-transparent hover:border-[#FF6600]/30"
                      >
                        {s}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            )}

            {history.map((m, i) => (
              <div
                key={i}
                className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}
              >
                <div
                  className={`max-w-[85%] px-3 py-2 rounded-lg text-sm whitespace-pre-wrap break-words ${
                    m.role === 'user'
                      ? 'bg-[#FF6600] text-white'
                      : 'bg-[#1E2330] text-[#F0F2F5] border border-[#2A3040]'
                  }`}
                >
                  {m.content}
                  {m.meta?.cacheHit && (
                    <span className="block text-[9px] opacity-50 mt-1">⚡ cacheado</span>
                  )}
                </div>
              </div>
            ))}

            {loading && (
              <div className="flex justify-start">
                <div className="bg-[#1E2330] border border-[#2A3040] px-3 py-2 rounded-lg text-sm text-[#9CA3AF] flex items-center gap-2">
                  <Loader2 size={14} className="animate-spin" />
                  Pensando...
                </div>
              </div>
            )}

            {error && (
              <div className="flex items-start gap-2 p-3 rounded-lg border border-red-500/30 bg-red-500/5">
                <AlertCircle size={14} className="text-red-400 shrink-0 mt-0.5" />
                <p className="text-sm text-red-400">{error}</p>
              </div>
            )}
          </div>

          {/* Input */}
          <div className="p-3 border-t border-[#1E2330] bg-[#0F1218] rounded-b-lg">
            <form
              onSubmit={(e) => {
                e.preventDefault()
                void ask(question)
              }}
              className="flex gap-2 items-end"
            >
              <textarea
                value={question}
                onChange={(e) => setQuestion(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault()
                    void ask(question)
                  }
                }}
                placeholder="Escribí tu pregunta…"
                rows={1}
                maxLength={1000}
                disabled={loading}
                className="flex-1 resize-none bg-[#1E2330] border border-[#2A3040] focus:border-[#FF6600]/50 rounded-md px-3 py-2 text-sm text-[#F0F2F5] placeholder:text-[#6B7280] outline-none disabled:opacity-50"
              />
              <button
                type="submit"
                disabled={loading || !question.trim()}
                className="px-3 py-2 rounded-md bg-[#FF6600] hover:bg-[#FF8533] disabled:opacity-40 disabled:cursor-not-allowed text-white transition flex items-center gap-1.5"
                aria-label="Enviar pregunta"
              >
                {loading ? <Loader2 size={14} className="animate-spin" /> : <Send size={14} />}
              </button>
            </form>
            <p className="text-[10px] text-[#6B7280] mt-1.5 text-center">
              Enter para enviar · Shift+Enter para nueva línea · {1000 - question.length} chars
            </p>
          </div>
        </div>
      </Modal>
    </>
  )
}
