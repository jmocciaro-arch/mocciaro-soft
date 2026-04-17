'use client'

import { useState, useEffect, useRef } from 'react'
import { usePathname } from 'next/navigation'
import { useCompanyContext } from '@/lib/company-context'
import { Sparkles, X, Send, Copy, RotateCcw, Bot, Volume2, VolumeX } from 'lucide-react'
import { AgentPanel } from '@/components/ai/agent-panel'
import { VoiceChat, speakText, stopSpeaking } from '@/components/ai/voice-chat'

type ActiveTab = 'chat' | 'agent'

interface Msg { role: 'user' | 'assistant'; content: string }

const STORAGE_KEY = 'mocciaro-ai-assistant-history'
const QUICK_PROMPTS = [
  { icon: '🔥', label: 'Leads hot', prompt: 'Mostrame mis leads hot' },
  { icon: '💰', label: 'Facturas pendientes', prompt: '¿Qué facturas tengo pendientes de cobro?' },
  { icon: '📊', label: 'Pipeline', prompt: 'Resumí el estado del pipeline de ventas' },
  { icon: '✉️', label: 'Redactar email', prompt: 'Ayudame a redactar un email de seguimiento post-cotización' },
  { icon: '🎯', label: 'Próximas acciones', prompt: '¿Qué acciones prioritarias debería hacer esta semana?' },
  { icon: '❓', label: 'Cómo uso...', prompt: '¿Cómo uso el módulo de conciliación bancaria?' },
]

export function AIAssistant() {
  const [open, setOpen] = useState(false)
  const [activeTab, setActiveTab] = useState<ActiveTab>('chat')
  const [messages, setMessages] = useState<Msg[]>([])
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const [provider, setProvider] = useState<string>('')
  const [voiceMode, setVoiceMode] = useState(false)
  const pathname = usePathname()
  const { activeCompany } = useCompanyContext()
  const scrollRef = useRef<HTMLDivElement>(null)

  // Cargar historial
  useEffect(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY)
      if (raw) setMessages(JSON.parse(raw))
    } catch { /* */ }
  }, [])

  // Persistir historial
  useEffect(() => {
    if (messages.length > 0) localStorage.setItem(STORAGE_KEY, JSON.stringify(messages))
  }, [messages])

  // Auto-scroll al final
  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight
  }, [messages, loading])

  async function send(text?: string) {
    const content = (text ?? input).trim()
    if (!content || loading) return
    const newMessages: Msg[] = [...messages, { role: 'user', content }]
    setMessages(newMessages)
    setInput('')
    setLoading(true)
    try {
      const res = await fetch('/api/assistant/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messages: newMessages,
          companyId: activeCompany?.id,
          page: pathname,
        }),
      })
      const j = await res.json()
      if (!res.ok) throw new Error(j.error || 'Error')
      setProvider(j.provider)
      setMessages([...newMessages, { role: 'assistant', content: j.reply }])
      if (voiceMode && j.reply) speakText(j.reply)
    } catch (err) {
      setMessages([...newMessages, { role: 'assistant', content: `✗ ${(err as Error).message}` }])
    } finally {
      setLoading(false)
    }
  }

  function clearChat() {
    setMessages([])
    localStorage.removeItem(STORAGE_KEY)
  }

  function copyMessage(text: string) {
    navigator.clipboard.writeText(text)
  }

  return (
    <>
      {/* Botón flotante */}
      {!open && (
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="fixed z-50 shadow-xl transition-transform hover:scale-110"
          style={{
            bottom: 24, right: 24,
            width: 56, height: 56, borderRadius: '50%',
            background: 'linear-gradient(135deg, #f97316, #ef4444)',
            color: 'white',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            boxShadow: '0 8px 24px rgba(249,115,22,0.4)',
          }}
          title="Asistente IA Mocciaro"
        >
          <Sparkles className="w-6 h-6" />
        </button>
      )}

      {/* Ventana de chat */}
      {open && (
        <div
          className="fixed z-50 flex flex-col shadow-2xl"
          style={{
            bottom: 24, right: 24,
            width: 420, height: 600, maxHeight: 'calc(100vh - 48px)', maxWidth: 'calc(100vw - 48px)',
            background: '#0F1218', border: '1px solid #2A3040', borderRadius: 16,
            overflow: 'hidden',
          }}
        >
          {/* Header */}
          <div
            className="flex items-center justify-between p-3 border-b"
            style={{ borderColor: '#2A3040', background: 'linear-gradient(90deg, rgba(249,115,22,0.1), transparent)' }}
          >
            <div className="flex items-center gap-2">
              <div
                className="w-8 h-8 rounded-full flex items-center justify-center"
                style={{ background: 'linear-gradient(135deg, #f97316, #ef4444)' }}
              >
                <Sparkles className="w-4 h-4 text-white" />
              </div>
              <div>
                <div className="font-bold text-sm">Asistente Mocciaro</div>
                <div className="text-[10px] opacity-60">
                  {activeCompany?.name || 'Sin empresa'}{provider ? ` · ${provider}` : ''}
                </div>
              </div>
            </div>
            <div className="flex items-center gap-1">
              {activeTab === 'chat' && (
                <button
                  type="button"
                  onClick={clearChat}
                  className="p-1.5 rounded hover:bg-white/10"
                  title="Limpiar chat"
                >
                  <RotateCcw className="w-4 h-4 opacity-70" />
                </button>
              )}
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="p-1.5 rounded hover:bg-white/10"
                title="Cerrar"
              >
                <X className="w-4 h-4 opacity-70" />
              </button>
            </div>
          </div>

          {/* Tabs */}
          <div className="flex border-b" style={{ borderColor: '#2A3040' }}>
            <button
              type="button"
              onClick={() => setActiveTab('chat')}
              className="flex-1 flex items-center justify-center gap-1.5 py-2 text-xs font-semibold transition-colors"
              style={{
                color: activeTab === 'chat' ? '#f97316' : '#9CA3AF',
                borderBottom: activeTab === 'chat' ? '2px solid #f97316' : '2px solid transparent',
                background: 'transparent',
              }}
            >
              <Sparkles className="w-3.5 h-3.5" /> Chat IA
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('agent')}
              className="flex-1 flex items-center justify-center gap-1.5 py-2 text-xs font-semibold transition-colors"
              style={{
                color: activeTab === 'agent' ? '#f97316' : '#9CA3AF',
                borderBottom: activeTab === 'agent' ? '2px solid #f97316' : '2px solid transparent',
                background: 'transparent',
              }}
            >
              <Bot className="w-3.5 h-3.5" /> Agente IA
            </button>
          </div>

          {/* Agent tab */}
          {activeTab === 'agent' && (
            <div className="flex-1 overflow-hidden">
              <AgentPanel />
            </div>
          )}

          {/* Mensajes */}
          {activeTab === 'chat' && (
          <div ref={scrollRef} className="flex-1 overflow-y-auto p-3 space-y-3">
            {messages.length === 0 ? (
              <div className="space-y-3">
                <div className="text-center py-4">
                  <div className="text-4xl mb-2">✨</div>
                  <div className="font-semibold text-sm">¿En qué te ayudo?</div>
                  <div className="text-xs opacity-60 mt-1">Puedo consultar tus datos, redactar emails y guiarte por el ERP</div>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  {QUICK_PROMPTS.map((qp) => (
                    <button
                      key={qp.label}
                      type="button"
                      onClick={() => send(qp.prompt)}
                      className="p-2 text-left rounded-lg border text-xs hover:bg-[#1E2330]"
                      style={{ borderColor: '#2A3040', background: '#151821' }}
                    >
                      <div className="text-lg mb-0.5">{qp.icon}</div>
                      <div className="font-semibold">{qp.label}</div>
                    </button>
                  ))}
                </div>
              </div>
            ) : (
              messages.map((m, i) => (
                <div key={i} className={m.role === 'user' ? 'flex justify-end' : 'flex justify-start'}>
                  <div
                    className="max-w-[85%] rounded-2xl px-3 py-2 text-sm whitespace-pre-wrap relative group"
                    style={{
                      background: m.role === 'user'
                        ? 'linear-gradient(135deg, rgba(249,115,22,0.9), rgba(239,68,68,0.9))'
                        : '#1E2330',
                      color: m.role === 'user' ? 'white' : '#F0F2F5',
                      border: m.role === 'assistant' ? '1px solid #2A3040' : 'none',
                    }}
                  >
                    {m.content}
                    {m.role === 'assistant' && (
                      <button
                        type="button"
                        onClick={() => copyMessage(m.content)}
                        className="absolute -top-2 -right-2 opacity-0 group-hover:opacity-100 transition-opacity p-1 rounded-full"
                        style={{ background: '#2A3040' }}
                        title="Copiar"
                      >
                        <Copy className="w-3 h-3" />
                      </button>
                    )}
                  </div>
                </div>
              ))
            )}
            {loading && (
              <div className="flex justify-start">
                <div className="rounded-2xl px-3 py-2 text-sm" style={{ background: '#1E2330', border: '1px solid #2A3040' }}>
                  <span className="inline-flex gap-1">
                    <span className="w-1.5 h-1.5 rounded-full bg-orange-500 animate-bounce" style={{ animationDelay: '0ms' }} />
                    <span className="w-1.5 h-1.5 rounded-full bg-orange-500 animate-bounce" style={{ animationDelay: '150ms' }} />
                    <span className="w-1.5 h-1.5 rounded-full bg-orange-500 animate-bounce" style={{ animationDelay: '300ms' }} />
                  </span>
                </div>
              </div>
            )}
          </div>
          )}

          {/* Input (chat only) */}
          {activeTab === 'chat' && (
          <div className="p-3 border-t" style={{ borderColor: '#2A3040' }}>
            {/* Voice controls */}
            <div className="flex items-center gap-2 mb-2">
              <VoiceChat
                color="#f97316"
                disabled={loading}
                onTranscribed={(text) => {
                  setInput(text)
                  setTimeout(() => void send(), 200)
                }}
              />
              <button
                type="button"
                onClick={() => { setVoiceMode(!voiceMode); if (voiceMode) stopSpeaking() }}
                className="flex items-center gap-1 text-[10px] px-1.5 py-1 rounded"
                style={{
                  background: voiceMode ? 'rgba(249,115,22,0.2)' : 'transparent',
                  color: voiceMode ? '#f97316' : '#6B7280',
                  border: `1px solid ${voiceMode ? 'rgba(249,115,22,0.5)' : '#2A3040'}`,
                }}
              >
                {voiceMode ? <Volume2 className="w-3 h-3" /> : <VolumeX className="w-3 h-3" />}
                {voiceMode ? 'Voz' : 'Mudo'}
              </button>
            </div>
            <div className="flex gap-2 items-end">
              <textarea
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault()
                    void send()
                  }
                }}
                rows={1}
                placeholder={voiceMode ? '🎤 Hablá o escribí...' : 'Preguntá lo que quieras...'}
                className="flex-1 rounded-lg bg-[#1E2330] border border-[#2A3040] px-3 py-2 text-sm resize-none focus:outline-none focus:ring-1 focus:ring-orange-500/50"
                style={{ maxHeight: 100 }}
                disabled={loading}
              />
              <button
                type="button"
                onClick={() => send()}
                disabled={loading || !input.trim()}
                className="p-2 rounded-lg"
                style={{
                  background: 'linear-gradient(135deg, #f97316, #ef4444)',
                  opacity: loading || !input.trim() ? 0.5 : 1,
                }}
              >
                <Send className="w-4 h-4 text-white" />
              </button>
            </div>
          </div>
          )}
        </div>
      )}
    </>
  )
}
