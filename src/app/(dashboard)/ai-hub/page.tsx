'use client'

import { useState, useRef, useEffect } from 'react'
import { useCompanyContext } from '@/lib/company-context'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import {
  Sparkles, Bot, Globe, Send, RotateCcw, Maximize2, Minimize2,
  Copy, ExternalLink, ChevronDown, Zap, MessageSquare, Volume2, VolumeX,
} from 'lucide-react'
import { VoiceChat, speakText, stopSpeaking } from '@/components/ai/voice-chat'

type AIProvider = 'mocciaro' | 'gemini' | 'copilot' | 'chatgpt' | 'perplexity' | 'claude'

interface ProviderConfig {
  id: AIProvider
  name: string
  icon: string
  color: string
  type: 'api' | 'iframe'    // api = nuestro backend con contexto ERP, iframe = embebido
  url?: string               // para iframe
  description: string
  supportsERP: boolean       // puede leer datos del ERP
}

const PROVIDERS: ProviderConfig[] = [
  {
    id: 'mocciaro',
    name: 'Mocciaro IA',
    icon: '🟠',
    color: '#f97316',
    type: 'api',
    description: 'Asistente del ERP con acceso a todos tus datos (leads, facturas, stock, clientes)',
    supportsERP: true,
  },
  {
    id: 'gemini',
    name: 'Google Gemini',
    icon: '🟣',
    color: '#8b5cf6',
    type: 'iframe',
    url: 'https://gemini.google.com/app',
    description: 'IA de Google — excelente para análisis de documentos y búsqueda',
    supportsERP: false,
  },
  {
    id: 'copilot',
    name: 'Microsoft Copilot',
    icon: '🔵',
    color: '#3b82f6',
    type: 'iframe',
    url: 'https://copilot.microsoft.com/',
    description: 'Copilot de Microsoft — conectado a Bing, bueno para research',
    supportsERP: false,
  },
  {
    id: 'chatgpt',
    name: 'ChatGPT',
    icon: '🟢',
    color: '#10b981',
    type: 'iframe',
    url: 'https://chatgpt.com/',
    description: 'OpenAI ChatGPT — el más popular, excelente para redacción',
    supportsERP: false,
  },
  {
    id: 'perplexity',
    name: 'Perplexity',
    icon: '🔷',
    color: '#06b6d4',
    type: 'iframe',
    url: 'https://www.perplexity.ai/',
    description: 'Buscador con IA — ideal para investigar competidores, precios, productos',
    supportsERP: false,
  },
  {
    id: 'claude',
    name: 'Claude',
    icon: '🟤',
    color: '#d97706',
    type: 'iframe',
    url: 'https://claude.ai/new',
    description: 'Anthropic Claude — excelente para análisis largo y razonamiento',
    supportsERP: false,
  },
]

interface Msg { role: 'user' | 'assistant'; content: string; provider?: string }

export default function AIHubPage() {
  const { activeCompany } = useCompanyContext()
  const [activeProvider, setActiveProvider] = useState<AIProvider>('mocciaro')
  const [messages, setMessages] = useState<Msg[]>([])
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const [fullscreen, setFullscreen] = useState(false)
  const [contextEnabled, setContextEnabled] = useState(true)
  const [voiceMode, setVoiceMode] = useState(false)   // auto-speak responses
  const scrollRef = useRef<HTMLDivElement>(null)
  const iframeRef = useRef<HTMLIFrameElement>(null)

  const provider = PROVIDERS.find((p) => p.id === activeProvider)!

  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight
  }, [messages, loading])

  async function sendMessage() {
    if (!input.trim() || loading) return
    const text = input.trim()
    setInput('')

    if (provider.type === 'iframe') {
      // Para providers externos: abrir directamente con el query en la URL
      const encodedQ = encodeURIComponent(text)
      const directUrls: Record<string, string> = {
        copilot: `https://copilot.microsoft.com/?q=${encodedQ}`,
        chatgpt: `https://chatgpt.com/?q=${encodedQ}`,
        gemini: `https://gemini.google.com/app?q=${encodedQ}`,
        perplexity: `https://www.perplexity.ai/search?q=${encodedQ}`,
        claude: `https://claude.ai/new?q=${encodedQ}`,
      }
      const directUrl = directUrls[provider.id]

      setMessages((m) => [...m, { role: 'user', content: text }])

      if (directUrl) {
        // Abrir/reusar ventana lateral con el query directo
        const w = Math.floor(screen.width * 0.5)
        const h = screen.height
        const left = screen.width - w
        window.open(directUrl, `mocciaro-ai-${provider.id}`, `width=${w},height=${h},left=${left},top=0,menubar=no,toolbar=no`)
        setMessages((m) => [...m, {
          role: 'assistant',
          content: `✅ Abrí ${provider.name} con tu pregunta. Fijate en la ventana lateral.`,
          provider: 'system',
        }])
      } else {
        await navigator.clipboard.writeText(text)
        setMessages((m) => [...m, {
          role: 'assistant',
          content: `📋 Copiado al clipboard. Pegalo en ${provider.name} (Cmd+V).`,
          provider: 'system',
        }])
      }
      return
    }

    // Para Mocciaro IA: usar nuestro backend con contexto ERP
    const newMsgs: Msg[] = [...messages, { role: 'user', content: text }]
    setMessages(newMsgs)
    setLoading(true)

    try {
      const res = await fetch('/api/assistant/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messages: newMsgs.filter((m) => m.role === 'user' || m.role === 'assistant').map((m) => ({
            role: m.role, content: m.content,
          })),
          companyId: contextEnabled ? activeCompany?.id : undefined,
          page: '/ai-hub',
        }),
      })
      const j = await res.json()
      if (res.ok) {
        setMessages([...newMsgs, { role: 'assistant', content: j.reply, provider: j.provider }])
        // Si voice mode está ON, leer la respuesta en voz alta
        if (voiceMode && j.reply) speakText(j.reply)
      } else {
        setMessages([...newMsgs, { role: 'assistant', content: `❌ ${j.error}`, provider: 'error' }])
      }
    } catch (err) {
      setMessages([...newMsgs, { role: 'assistant', content: `❌ ${(err as Error).message}`, provider: 'error' }])
    } finally {
      setLoading(false)
    }
  }

  function copyContext() {
    const ctx = `Soy usuario del ERP Mocciaro Soft. Empresa activa: ${activeCompany?.name || '—'}. Necesito ayuda con mi sistema de gestión. Puedo darte datos específicos si los necesitás.`
    navigator.clipboard.writeText(ctx)
  }

  const containerClass = fullscreen
    ? 'fixed inset-0 z-50 bg-[#0B0E13]'
    : 'p-6'

  return (
    <div className={containerClass}>
      <div className={`flex flex-col h-full ${fullscreen ? '' : 'max-h-[calc(100vh-120px)]'}`}>
        {/* Header */}
        <div className="flex items-center justify-between mb-3 shrink-0">
          <div>
            <h1 className="text-xl font-bold flex items-center gap-2">
              <Bot className="w-5 h-5" /> Hub de IA
            </h1>
            <p className="text-xs opacity-60">
              {activeCompany?.name || 'Sin empresa'} · {provider.name}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setContextEnabled(!contextEnabled)}
              className="text-xs px-2 py-1 rounded-md"
              style={{
                background: contextEnabled ? 'rgba(249,115,22,0.15)' : '#1E2330',
                color: contextEnabled ? '#f97316' : '#6B7280',
                border: `1px solid ${contextEnabled ? 'rgba(249,115,22,0.4)' : '#2A3040'}`,
              }}
              title="Inyectar datos del ERP en el contexto de Mocciaro IA"
            >
              <Zap className="w-3 h-3 inline mr-1" />
              Contexto ERP {contextEnabled ? 'ON' : 'OFF'}
            </button>
            <Button variant="ghost" size="sm" onClick={() => { copyContext() }}>
              <Copy className="w-3 h-3 mr-1" /> Copiar contexto
            </Button>
            <Button variant="ghost" size="sm" onClick={() => setFullscreen(!fullscreen)}>
              {fullscreen ? <Minimize2 className="w-4 h-4" /> : <Maximize2 className="w-4 h-4" />}
            </Button>
          </div>
        </div>

        {/* Provider tabs */}
        <div className="flex gap-1 overflow-x-auto pb-2 shrink-0">
          {PROVIDERS.map((p) => (
            <button
              key={p.id}
              type="button"
              onClick={() => setActiveProvider(p.id)}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold shrink-0 transition-all"
              style={{
                background: activeProvider === p.id ? p.color + '20' : '#151821',
                color: activeProvider === p.id ? p.color : '#9CA3AF',
                border: `1px solid ${activeProvider === p.id ? p.color + '60' : '#2A3040'}`,
              }}
            >
              <span>{p.icon}</span>
              <span>{p.name}</span>
              {p.supportsERP && <Zap className="w-2.5 h-2.5" />}
            </button>
          ))}
        </div>

        {/* Main content: split layout for iframe providers */}
        <div className="flex-1 flex gap-3 min-h-0 mt-2">

          {/* Left: Chat panel (siempre visible) */}
          <div className="flex flex-col" style={{ width: provider.type === 'iframe' ? '35%' : '100%', minWidth: 300 }}>
            {/* Description */}
            <div className="text-xs p-2 rounded-md mb-2" style={{ background: '#151821', border: '1px solid #2A3040' }}>
              <span>{provider.icon} </span>
              {provider.description}
              {provider.supportsERP && (
                <span className="ml-1" style={{ color: '#f97316' }}>
                  · ⚡ Con acceso a datos del ERP
                </span>
              )}
            </div>

            {/* Messages */}
            <div ref={scrollRef} className="flex-1 overflow-y-auto space-y-2 pr-1">
              {messages.length === 0 && (
                <div className="text-center py-8 opacity-60">
                  <div className="text-3xl mb-2">{provider.icon}</div>
                  <div className="text-sm font-semibold">{provider.name}</div>
                  <div className="text-xs mt-1">
                    {provider.type === 'api'
                      ? 'Preguntá lo que quieras — tengo acceso a tus leads, facturas, stock...'
                      : `Escribí acá → se copia al clipboard → pegalo en ${provider.name}`
                    }
                  </div>
                  {provider.type === 'api' && (
                    <div className="grid grid-cols-2 gap-2 mt-4 text-left max-w-xs mx-auto">
                      {['Leads hot de esta semana', 'Facturas pendientes', 'Redactá email de cobranza', 'Estado del pipeline'].map((q) => (
                        <button
                          key={q}
                          type="button"
                          onClick={() => { setInput(q); }}
                          className="p-2 text-[11px] rounded-md hover:bg-[#1E2330]"
                          style={{ background: '#151821', border: '1px solid #2A3040' }}
                        >
                          {q}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              )}
              {messages.map((m, i) => (
                <div key={i} className={m.role === 'user' ? 'flex justify-end' : 'flex justify-start'}>
                  <div
                    className="max-w-[90%] rounded-xl px-3 py-2 text-sm whitespace-pre-wrap"
                    style={{
                      background: m.role === 'user'
                        ? `${provider.color}cc`
                        : '#1E2330',
                      color: m.role === 'user' ? 'white' : '#F0F2F5',
                      border: m.role === 'assistant' ? '1px solid #2A3040' : 'none',
                    }}
                  >
                    {m.content}
                  </div>
                </div>
              ))}
              {loading && (
                <div className="flex justify-start">
                  <div className="rounded-xl px-3 py-2" style={{ background: '#1E2330', border: '1px solid #2A3040' }}>
                    <span className="inline-flex gap-1">
                      <span className="w-1.5 h-1.5 rounded-full animate-bounce" style={{ background: provider.color, animationDelay: '0ms' }} />
                      <span className="w-1.5 h-1.5 rounded-full animate-bounce" style={{ background: provider.color, animationDelay: '150ms' }} />
                      <span className="w-1.5 h-1.5 rounded-full animate-bounce" style={{ background: provider.color, animationDelay: '300ms' }} />
                    </span>
                  </div>
                </div>
              )}
            </div>

            {/* Input */}
            <div className="mt-2 shrink-0 space-y-2">
              {/* Voice controls */}
              {provider.type === 'api' && (
                <div className="flex items-center gap-2">
                  <VoiceChat
                    color={provider.color}
                    disabled={loading}
                    onTranscribed={(text) => {
                      setInput(text)
                      // Auto-enviar después de transcribir
                      setTimeout(() => {
                        const btn = document.getElementById('ai-hub-send-btn')
                        if (btn) btn.click()
                      }, 300)
                    }}
                  />
                  <button
                    type="button"
                    onClick={() => { setVoiceMode(!voiceMode); if (voiceMode) stopSpeaking() }}
                    className="flex items-center gap-1 text-xs px-2 py-1.5 rounded-md"
                    style={{
                      background: voiceMode ? `${provider.color}20` : '#1E2330',
                      color: voiceMode ? provider.color : '#6B7280',
                      border: `1px solid ${voiceMode ? provider.color + '60' : '#2A3040'}`,
                    }}
                    title={voiceMode ? 'Desactivar respuesta por voz' : 'Activar respuesta por voz'}
                  >
                    {voiceMode ? <Volume2 className="w-3 h-3" /> : <VolumeX className="w-3 h-3" />}
                    {voiceMode ? 'Voz ON' : 'Voz OFF'}
                  </button>
                  <span className="text-[10px] opacity-50">
                    {voiceMode ? '🎤 Hablá → Gemini transcribe → responde en voz alta' : '🎤 Click en el mic para hablar'}
                  </span>
                </div>
              )}

              <div className="flex gap-2">
                <textarea
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); void sendMessage() }
                  }}
                  rows={2}
                  placeholder={provider.type === 'api'
                    ? voiceMode ? '🎤 Hablá o escribí...' : 'Preguntá sobre tus datos...'
                    : `Escribí → se abre ${provider.name} con tu pregunta`
                  }
                  className="flex-1 rounded-lg bg-[#1E2330] border border-[#2A3040] px-3 py-2 text-sm resize-none focus:outline-none focus:ring-1"
                  style={{ outlineColor: provider.color }}
                  disabled={loading}
                />
                <button
                  id="ai-hub-send-btn"
                  type="button"
                  onClick={() => sendMessage()}
                  disabled={loading || !input.trim()}
                  className="px-3 rounded-lg self-end"
                  style={{ background: provider.color, opacity: loading || !input.trim() ? 0.5 : 1 }}
                >
                  <Send className="w-4 h-4 text-white" />
                </button>
              </div>
            </div>
          </div>

          {/* Right: Panel para providers externos */}
          {provider.type === 'iframe' && provider.url && (
            <div className="flex-1 rounded-xl overflow-hidden border flex flex-col items-center justify-center" style={{ border: `1px solid ${provider.color}40`, background: '#151821' }}>
              <div className="text-center p-8 space-y-4">
                <div className="text-6xl">{provider.icon}</div>
                <div className="text-lg font-bold">{provider.name}</div>
                <p className="text-sm opacity-60 max-w-sm">
                  {provider.description}
                </p>

                <div className="space-y-3">
                  <Button
                    variant="primary"
                    onClick={() => {
                      // Abrir en popup al lado
                      const w = Math.floor(screen.width * 0.5)
                      const h = screen.height
                      const left = screen.width - w
                      window.open(provider.url!, `mocciaro-ai-${provider.id}`, `width=${w},height=${h},left=${left},top=0,menubar=no,toolbar=no`)
                    }}
                  >
                    <ExternalLink className="w-4 h-4 mr-1" /> Abrir {provider.name} al lado
                  </Button>

                  <div className="text-xs opacity-50">
                    Se abre en ventana lateral — escribí acá a la izquierda → se copia al clipboard → pegalo allá
                  </div>
                </div>

                <div className="pt-4 border-t" style={{ borderColor: '#2A3040' }}>
                  <div className="text-xs opacity-60 mb-2">💡 Tip: hacé click en "Copiar contexto" arriba para pasarle a {provider.name} quién sos y qué datos tenés</div>
                  <div className="flex gap-2 justify-center flex-wrap">
                    <button
                      type="button"
                      onClick={() => {
                        const ctx = `Soy Juan Manuel Mocciaro, dueño de ${activeCompany?.name || 'Torquetools SL'}. Uso el ERP Mocciaro Soft para gestionar ventas de herramientas industriales (torquímetros, atornilladores FEIN/FIAM, balanceadores). Necesito tu ayuda como asistente de negocios.`
                        navigator.clipboard.writeText(ctx)
                        setMessages((m) => [...m, { role: 'assistant', content: '📋 Contexto copiado: presentación + empresa. Pegalo en ' + provider.name, provider: 'system' }])
                      }}
                      className="text-xs px-3 py-1.5 rounded-md hover:bg-[#1E2330]"
                      style={{ background: '#0F1218', border: '1px solid #2A3040' }}
                    >
                      📋 Copiar presentación
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        const ctx = `Tengo estos datos en mi ERP:\n- 1 lead HOT (Karin Leyva, ME Elecmetal, Perú, OC recibida)\n- 1 factura pendiente de cobro (FAC-TT2026-0001, EUR 1250)\n- Pipeline CRM activo\n- Productos: torquímetros FEIN, atornilladores FIAM, balanceadores TECNA`
                        navigator.clipboard.writeText(ctx)
                        setMessages((m) => [...m, { role: 'assistant', content: '📋 Datos del ERP copiados. Pegalo en ' + provider.name, provider: 'system' }])
                      }}
                      className="text-xs px-3 py-1.5 rounded-md hover:bg-[#1E2330]"
                      style={{ background: '#0F1218', border: '1px solid #2A3040' }}
                    >
                      📊 Copiar datos ERP
                    </button>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
