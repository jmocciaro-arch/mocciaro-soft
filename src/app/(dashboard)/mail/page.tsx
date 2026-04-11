'use client'

import { useState, useEffect, useCallback, Suspense } from 'react'
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Tabs } from '@/components/ui/tabs'
import { SearchBar } from '@/components/ui/search-bar'
import { Modal } from '@/components/ui/modal'
import { Input } from '@/components/ui/input'
import { useToast } from '@/components/ui/toast'
import {
  Mail, Inbox, Send, Star, Loader2, RefreshCw,
  ExternalLink, Reply, User, Link2, Bell, LogIn
} from 'lucide-react'

const GOOGLE_CLIENT_ID = '903801923166-5g5npe9e9l9gccigrsrsg1h5acemmdok.apps.googleusercontent.com'
const GMAIL_SCOPES = 'https://www.googleapis.com/auth/gmail.readonly https://www.googleapis.com/auth/gmail.send'

type GmailMessage = {
  id: string
  threadId: string
  from: string
  to: string
  subject: string
  snippet: string
  date: string
  unread: boolean
  body?: string
}

const ACCOUNTS = [
  { id: 'buscatools', label: 'BuscaTools', email: 'buscatools@gmail.com' },
  { id: 'torquear', label: 'Torquear', email: 'torquear@gmail.com' },
  { id: 'torquetools', label: 'TorqueTools SL', email: 'torquetools.sl@gmail.com' },
  { id: 'gas', label: 'GAS LLC', email: 'gas.assembly@gmail.com' },
]

export default function MailPage() {
  const { addToast } = useToast()

  const [activeAccount, setActiveAccount] = useState('buscatools')
  const [accessToken, setAccessToken] = useState<string | null>(null)
  const [messages, setMessages] = useState<GmailMessage[]>([])
  const [loading, setLoading] = useState(false)
  const [search, setSearch] = useState('')

  const [selectedMsg, setSelectedMsg] = useState<GmailMessage | null>(null)
  const [showRead, setShowRead] = useState(false)
  const [showReply, setShowReply] = useState(false)
  const [replyBody, setReplyBody] = useState('')
  const [sending, setSending] = useState(false)

  const [unreadCount, setUnreadCount] = useState(0)

  // ─── OAuth flow ───
  const handleConnect = () => {
    const redirectUri = `${window.location.origin}/auth/gmail/callback`
    const params = new URLSearchParams({
      client_id: GOOGLE_CLIENT_ID,
      redirect_uri: redirectUri,
      response_type: 'token',
      scope: GMAIL_SCOPES,
      prompt: 'consent',
      login_hint: ACCOUNTS.find(a => a.id === activeAccount)?.email || '',
    })
    const authUrl = `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`
    // Open in popup
    const popup = window.open(authUrl, 'gmail-auth', 'width=500,height=600')

    // Listen for the token
    const checkPopup = setInterval(() => {
      try {
        if (popup?.closed) {
          clearInterval(checkPopup)
          return
        }
        const hash = popup?.location?.hash
        if (hash && hash.includes('access_token')) {
          const token = new URLSearchParams(hash.substring(1)).get('access_token')
          if (token) {
            setAccessToken(token)
            localStorage.setItem(`gmail_token_${activeAccount}`, token)
            popup?.close()
            clearInterval(checkPopup)
          }
        }
      } catch {
        // Cross-origin - wait for redirect
      }
    }, 500)
  }

  // Check for saved token
  useEffect(() => {
    const saved = localStorage.getItem(`gmail_token_${activeAccount}`)
    if (saved) setAccessToken(saved)
    else setAccessToken(null)
  }, [activeAccount])

  // ─── Fetch messages ───
  const fetchMessages = useCallback(async () => {
    if (!accessToken) return
    setLoading(true)

    try {
      const qParam = search ? `&q=${encodeURIComponent(search)}` : ''
      const listRes = await fetch(
        `https://gmail.googleapis.com/gmail/v1/users/me/messages?maxResults=30${qParam}`,
        { headers: { Authorization: `Bearer ${accessToken}` } }
      )

      if (!listRes.ok) {
        if (listRes.status === 401) {
          setAccessToken(null)
          localStorage.removeItem(`gmail_token_${activeAccount}`)
          addToast({ type: 'warning', title: 'Token expirado', message: 'Conectate de nuevo' })
        }
        setLoading(false)
        return
      }

      const listData = await listRes.json()
      const msgIds = (listData.messages || []).slice(0, 20)

      const parsed: GmailMessage[] = []
      for (const { id } of msgIds) {
        const res = await fetch(
          `https://gmail.googleapis.com/gmail/v1/users/me/messages/${id}?format=metadata&metadataHeaders=From&metadataHeaders=To&metadataHeaders=Subject&metadataHeaders=Date`,
          { headers: { Authorization: `Bearer ${accessToken}` } }
        )
        if (!res.ok) continue
        const msg = await res.json()

        const headers = msg.payload?.headers || []
        const getHeader = (name: string) => headers.find((h: { name: string }) => h.name.toLowerCase() === name.toLowerCase())?.value || ''

        parsed.push({
          id: msg.id,
          threadId: msg.threadId,
          from: getHeader('From'),
          to: getHeader('To'),
          subject: getHeader('Subject'),
          snippet: msg.snippet || '',
          date: getHeader('Date'),
          unread: (msg.labelIds || []).includes('UNREAD'),
        })
      }

      setMessages(parsed)
      setUnreadCount(parsed.filter(m => m.unread).length)
    } catch {
      addToast({ type: 'error', title: 'Error al cargar mails' })
    }
    setLoading(false)
  }, [accessToken, search, activeAccount, addToast])

  useEffect(() => {
    if (accessToken) fetchMessages()
  }, [accessToken, fetchMessages])

  // ─── Read message ───
  const openMessage = async (msg: GmailMessage) => {
    if (!accessToken) return
    setSelectedMsg(msg)
    setShowRead(true)

    try {
      const res = await fetch(
        `https://gmail.googleapis.com/gmail/v1/users/me/messages/${msg.id}?format=full`,
        { headers: { Authorization: `Bearer ${accessToken}` } }
      )
      const data = await res.json()

      // Extract body
      let body = ''
      const parts = data.payload?.parts || []
      const htmlPart = parts.find((p: Record<string, unknown>) => (p.mimeType as string) === 'text/html')
      const textPart = parts.find((p: Record<string, unknown>) => (p.mimeType as string) === 'text/plain')

      if (htmlPart?.body?.data) {
        body = atob(htmlPart.body.data.replace(/-/g, '+').replace(/_/g, '/'))
      } else if (textPart?.body?.data) {
        body = atob(textPart.body.data.replace(/-/g, '+').replace(/_/g, '/'))
      } else if (data.payload?.body?.data) {
        body = atob(data.payload.body.data.replace(/-/g, '+').replace(/_/g, '/'))
      }

      setSelectedMsg({ ...msg, body })
    } catch {
      addToast({ type: 'error', title: 'Error al leer mensaje' })
    }
  }

  // ─── Reply ───
  const handleReply = async () => {
    if (!accessToken || !selectedMsg || !replyBody.trim()) return
    setSending(true)

    const raw = [
      `To: ${selectedMsg.from}`,
      `Subject: Re: ${selectedMsg.subject}`,
      `In-Reply-To: ${selectedMsg.id}`,
      `References: ${selectedMsg.id}`,
      'Content-Type: text/plain; charset=utf-8',
      '',
      replyBody,
    ].join('\r\n')

    const encoded = btoa(unescape(encodeURIComponent(raw)))
      .replace(/\+/g, '-')
      .replace(/\//g, '_')
      .replace(/=+$/, '')

    try {
      await fetch('https://gmail.googleapis.com/gmail/v1/users/me/messages/send', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ raw: encoded, threadId: selectedMsg.threadId }),
      })
      addToast({ type: 'success', title: 'Respuesta enviada' })
      setShowReply(false)
      setReplyBody('')
    } catch {
      addToast({ type: 'error', title: 'Error al enviar' })
    }
    setSending(false)
  }

  const formatEmailDate = (dateStr: string) => {
    try {
      const d = new Date(dateStr)
      const now = new Date()
      if (d.toDateString() === now.toDateString()) {
        return d.toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' })
      }
      return d.toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit' })
    } catch {
      return dateStr
    }
  }

  const extractName = (from: string) => {
    const match = from.match(/^([^<]+)/)
    return match ? match[1].trim().replace(/"/g, '') : from
  }

  const accountTabs = ACCOUNTS.map(a => ({
    id: a.id,
    label: a.label,
    badge: a.id === activeAccount ? unreadCount : undefined,
  }))

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <h1 className="text-2xl font-bold text-[#F0F2F5]">Mail</h1>
          {unreadCount > 0 && (
            <span className="px-2 py-0.5 text-xs rounded-full bg-[#FF6600] text-white font-bold">
              {unreadCount}
            </span>
          )}
        </div>
        <div className="flex gap-2">
          {accessToken && (
            <Button variant="secondary" size="sm" onClick={fetchMessages} disabled={loading}>
              <RefreshCw size={14} className={loading ? 'animate-spin' : ''} /> Actualizar
            </Button>
          )}
        </div>
      </div>

      <Suspense fallback={<div className="flex justify-center py-10"><Loader2 className="animate-spin text-[#FF6600]" size={32} /></div>}>
      <Tabs tabs={accountTabs} defaultTab="buscatools" onChange={(id) => setActiveAccount(id)}>
        {() => (
          <>
            {!accessToken ? (
              <Card>
                <CardContent className="flex flex-col items-center justify-center py-16">
                  <div className="w-16 h-16 rounded-full bg-[#FF6600]/10 flex items-center justify-center mb-4">
                    <Mail size={32} className="text-[#FF6600]" />
                  </div>
                  <h3 className="text-lg font-semibold text-[#F0F2F5] mb-2">Conectar Gmail</h3>
                  <p className="text-sm text-[#6B7280] mb-6 text-center max-w-md">
                    Conectá tu cuenta de Gmail para ver, buscar y responder emails directamente desde acá
                  </p>
                  <Button onClick={handleConnect}>
                    <LogIn size={16} /> Conectar con Google
                  </Button>
                </CardContent>
              </Card>
            ) : (
              <div className="space-y-4">
                <SearchBar
                  placeholder="Buscar en bandeja..."
                  value={search}
                  onChange={setSearch}
                  onSearch={() => fetchMessages()}
                />

                <Card className="p-0 overflow-hidden">
                  {loading ? (
                    <div className="flex items-center justify-center py-20">
                      <Loader2 className="animate-spin text-[#FF6600]" size={32} />
                    </div>
                  ) : messages.length === 0 ? (
                    <div className="text-center py-20 text-[#6B7280]">
                      <Inbox size={48} className="mx-auto mb-3 opacity-30" />
                      <p>No hay mensajes</p>
                    </div>
                  ) : (
                    <div className="divide-y divide-[#1E2330]">
                      {messages.map((msg) => (
                        <div
                          key={msg.id}
                          onClick={() => openMessage(msg)}
                          className="flex items-start gap-3 p-4 cursor-pointer hover:bg-[#1A1F2E] transition-colors"
                        >
                          <div className="w-8 h-8 rounded-full bg-[#1E2330] flex items-center justify-center text-xs font-bold text-[#9CA3AF] shrink-0 mt-0.5">
                            {extractName(msg.from).charAt(0).toUpperCase()}
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center justify-between gap-2">
                              <span className={`text-sm truncate ${msg.unread ? 'font-semibold text-[#F0F2F5]' : 'text-[#9CA3AF]'}`}>
                                {extractName(msg.from)}
                              </span>
                              <span className="text-xs text-[#6B7280] shrink-0">{formatEmailDate(msg.date)}</span>
                            </div>
                            <p className={`text-sm truncate mt-0.5 ${msg.unread ? 'text-[#F0F2F5] font-medium' : 'text-[#9CA3AF]'}`}>
                              {msg.subject || '(sin asunto)'}
                            </p>
                            <p className="text-xs text-[#4B5563] truncate mt-0.5">{msg.snippet}</p>
                          </div>
                          {msg.unread && <div className="w-2.5 h-2.5 rounded-full bg-[#FF6600] shrink-0 mt-2" />}
                        </div>
                      ))}
                    </div>
                  )}
                </Card>
              </div>
            )}
          </>
        )}
      </Tabs>
      </Suspense>

      {/* ─── READ ─── */}
      <Modal isOpen={showRead} onClose={() => setShowRead(false)} title={selectedMsg?.subject || ''} size="xl">
        {selectedMsg && (
          <div className="space-y-4">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-sm font-medium text-[#F0F2F5]">{extractName(selectedMsg.from)}</p>
                <p className="text-xs text-[#6B7280]">{selectedMsg.from}</p>
                <p className="text-xs text-[#4B5563] mt-1">{selectedMsg.date}</p>
              </div>
              <div className="flex gap-2">
                <Button variant="ghost" size="sm" onClick={() => { setShowReply(true) }}>
                  <Reply size={14} /> Responder
                </Button>
              </div>
            </div>

            <div className="border-t border-[#1E2330] pt-4">
              {selectedMsg.body ? (
                <div
                  className="prose prose-invert prose-sm max-w-none text-[#D1D5DB] overflow-auto max-h-[400px]"
                  dangerouslySetInnerHTML={{ __html: selectedMsg.body }}
                />
              ) : (
                <p className="text-sm text-[#9CA3AF]">{selectedMsg.snippet}</p>
              )}
            </div>

            {/* Quick actions */}
            <div className="flex gap-2 pt-4 border-t border-[#1E2330]">
              <Button variant="secondary" size="sm">
                <Link2 size={14} /> Vincular cliente
              </Button>
              <Button variant="secondary" size="sm">
                <Bell size={14} /> Crear seguimiento
              </Button>
            </div>
          </div>
        )}
      </Modal>

      {/* ─── REPLY ─── */}
      <Modal isOpen={showReply} onClose={() => setShowReply(false)} title={`Re: ${selectedMsg?.subject || ''}`} size="lg">
        <div className="space-y-4">
          <p className="text-sm text-[#6B7280]">Para: {selectedMsg?.from}</p>
          <textarea
            value={replyBody}
            onChange={(e) => setReplyBody(e.target.value)}
            className="w-full h-40 rounded-lg bg-[#1E2330] border border-[#2A3040] px-3 py-2 text-sm text-[#F0F2F5] placeholder:text-[#4B5563] focus:outline-none focus:ring-2 focus:ring-orange-500/50 resize-none"
            placeholder="Escribí tu respuesta..."
            autoFocus
          />
          <div className="flex justify-end gap-3">
            <Button variant="secondary" onClick={() => setShowReply(false)}>Cancelar</Button>
            <Button onClick={handleReply} loading={sending}>
              <Send size={14} /> Enviar
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  )
}
