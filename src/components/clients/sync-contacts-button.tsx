'use client'

import { useState, useEffect } from 'react'
import { Button } from '@/components/ui/button'
import { Modal } from '@/components/ui/modal'
import { useToast } from '@/components/ui/toast'
import { RefreshCw, Mail, AlertTriangle, CheckCircle, Loader2 } from 'lucide-react'
import { formatRelative } from '@/lib/utils'

interface SyncContactsButtonProps {
  clientId: string
  clientName: string
  clientEmail?: string | null
  onContactsUpdated?: () => void
}

type SyncStatus = 'idle' | 'configuring' | 'syncing' | 'success' | 'error'

export function SyncContactsButton({ clientId, clientName, clientEmail, onContactsUpdated }: SyncContactsButtonProps) {
  const { addToast } = useToast()
  const [status, setStatus] = useState<SyncStatus>('idle')
  const [showModal, setShowModal] = useState(false)
  const [domain, setDomain] = useState('')
  const [provider, setProvider] = useState<'gemini' | 'claude'>('gemini')
  const [result, setResult] = useState<{ added: number; found: number; provider: string } | null>(null)
  const [lastSync, setLastSync] = useState<string | null>(null)

  useEffect(() => {
    if (clientEmail && clientEmail.includes('@')) {
      setDomain(clientEmail.split('@')[1].toLowerCase())
    }
  }, [clientEmail])

  const handleOpen = () => {
    setShowModal(true)
    setStatus('configuring')
    setResult(null)
  }

  const handleSync = async () => {
    if (!domain.trim()) {
      addToast({ type: 'warning', title: 'Ingresa el dominio de email' })
      return
    }

    setStatus('syncing')

    try {
      const res = await fetch('/api/ai/execute', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'sync_contacts',
          provider,
          params: {
            client_id: clientId,
            domain: domain.trim().toLowerCase(),
          },
        }),
      })

      const data = await res.json()

      if (!res.ok || data.error) {
        throw new Error(data.error || 'Error en la sincronizacion')
      }

      setResult({
        added: data.contacts_added,
        found: data.contacts_found,
        provider: data.provider,
      })
      setStatus('success')
      setLastSync(new Date().toISOString())
      onContactsUpdated?.()

      addToast({
        type: 'success',
        title: 'Contactos actualizados',
        message: `${data.contacts_added} nuevo(s) de ${data.contacts_found} encontrado(s) via ${data.provider}`,
      })
    } catch (err) {
      setStatus('error')
      addToast({ type: 'error', title: 'Error', message: (err as Error).message })
    }
  }

  // Status-based icon and color
  const getStatusIcon = () => {
    switch (status) {
      case 'syncing':
        return <RefreshCw size={14} className="animate-spin text-amber-400" />
      case 'success':
        return <CheckCircle size={14} className="text-emerald-400" />
      case 'error':
        return <AlertTriangle size={14} className="text-red-400" />
      default:
        return <RefreshCw size={14} />
    }
  }

  const getButtonStyle = () => {
    switch (status) {
      case 'syncing':
        return 'border-amber-500/30 text-amber-400 bg-amber-500/5'
      case 'success':
        return 'border-emerald-500/30 text-emerald-400 bg-emerald-500/5'
      case 'error':
        return 'border-red-500/30 text-red-400 bg-red-500/5'
      default:
        return ''
    }
  }

  return (
    <>
      <button
        onClick={handleOpen}
        className={`inline-flex items-center gap-2 px-3 h-8 text-xs font-medium rounded-lg border transition-all
          ${status === 'idle'
            ? 'border-[#2A3040] text-[#9CA3AF] hover:bg-[#1E2330]'
            : getButtonStyle()
          }`}
      >
        {getStatusIcon()}
        {status === 'syncing' ? 'Sincronizando...' :
         status === 'success' ? `${result?.added || 0} nuevos` :
         'Actualizar contactos'}
        {lastSync && status === 'success' && (
          <span className="text-[10px] opacity-60">{formatRelative(lastSync)}</span>
        )}
      </button>

      <Modal isOpen={showModal} onClose={() => { setShowModal(false); if (status !== 'syncing') setStatus('idle') }} title="Actualizar contactos con IA" size="md">
        <div className="space-y-4">
          {/* Info */}
          <div className="p-3 rounded-lg bg-blue-500/10 border border-blue-500/20">
            <p className="text-xs text-blue-400">
              La IA va a analizar el dominio del cliente y generar contactos probables
              basandose en patrones de la empresa. Los contactos existentes no se duplican.
            </p>
          </div>

          {/* Domain input */}
          <div>
            <label className="block text-sm font-medium text-[#9CA3AF] mb-1.5">
              Dominio de email del cliente
            </label>
            <div className="flex items-center gap-2">
              <span className="text-sm text-[#6B7280]">@</span>
              <input
                type="text"
                value={domain}
                onChange={(e) => setDomain(e.target.value.toLowerCase())}
                placeholder="ej: nordex.com.uy"
                disabled={status === 'syncing'}
                className="flex-1 h-10 rounded-lg bg-[#1E2330] border border-[#2A3040] px-3 text-sm text-[#F0F2F5] placeholder:text-[#4B5563] focus:outline-none focus:ring-2 focus:ring-orange-500/50 disabled:opacity-50"
              />
            </div>
          </div>

          {/* Provider selector */}
          <div>
            <label className="block text-sm font-medium text-[#9CA3AF] mb-1.5">Motor IA</label>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setProvider('gemini')}
                disabled={status === 'syncing'}
                className={`flex-1 px-3 py-2 rounded-lg text-xs font-medium border transition-all ${
                  provider === 'gemini'
                    ? 'bg-blue-500/10 border-blue-500/30 text-blue-400'
                    : 'bg-[#0F1218] border-[#2A3040] text-[#6B7280] hover:border-[#4B5563]'
                }`}
              >
                Gemini (gratis)
              </button>
              <button
                type="button"
                onClick={() => setProvider('claude')}
                disabled={status === 'syncing'}
                className={`flex-1 px-3 py-2 rounded-lg text-xs font-medium border transition-all ${
                  provider === 'claude'
                    ? 'bg-orange-500/10 border-orange-500/30 text-orange-400'
                    : 'bg-[#0F1218] border-[#2A3040] text-[#6B7280] hover:border-[#4B5563]'
                }`}
              >
                Claude ($0.01/uso)
              </button>
            </div>
          </div>

          {/* Result */}
          {status === 'success' && result && (
            <div className="p-3 rounded-lg bg-emerald-500/10 border border-emerald-500/20">
              <div className="flex items-center gap-2">
                <CheckCircle size={16} className="text-emerald-400" />
                <p className="text-sm text-emerald-400 font-medium">
                  {result.added} contacto(s) agregado(s)
                </p>
              </div>
              <p className="text-xs text-[#9CA3AF] mt-1">
                {result.found} encontrado(s) en total via {result.provider}
              </p>
            </div>
          )}

          {status === 'error' && (
            <div className="p-3 rounded-lg bg-red-500/10 border border-red-500/20">
              <p className="text-xs text-red-400">Error en la sincronizacion. Intentalo de nuevo.</p>
            </div>
          )}

          {/* Actions */}
          <div className="flex justify-end gap-3 pt-2 border-t border-[#1E2330]">
            <Button variant="secondary" onClick={() => { setShowModal(false); if (status !== 'syncing') setStatus('idle') }}>
              {status === 'success' ? 'Cerrar' : 'Cancelar'}
            </Button>
            {status !== 'success' && (
              <Button onClick={handleSync} loading={status === 'syncing'}>
                {status === 'syncing' ? (
                  <><Loader2 size={14} className="animate-spin" /> Buscando contactos...</>
                ) : (
                  <><Mail size={14} /> Sincronizar</>
                )}
              </Button>
            )}
          </div>
        </div>
      </Modal>
    </>
  )
}
