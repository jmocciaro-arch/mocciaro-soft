'use client'

/**
 * Wrapper client del Next-Step Suggester.
 *
 * - Renderiza N chips con su variante actual.
 * - Maneja keyboard 1-4 + Esc.
 * - Para send_email y duplicate_for_client abre modal con form mínimo (F1).
 * - Después de execute exitoso: chip → done + UndoBanner con countdown.
 * - Después de execute fallido: chip → error con tooltip del error.
 */
import { useCallback, useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Modal } from '@/components/ui/modal'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { SearchableSelect } from '@/components/ui/searchable-select'
import { createClient } from '@/lib/supabase/client'
import { NextStepChip, type ChipVariant } from './NextStepChip'
import { UndoBanner } from './UndoBanner'
import { useExecuteAction, type ExecuteResult } from './use-execute-action'
import type { ActionCode, ActionDescriptor } from '@/lib/next-steps/types'

export interface NextStepActionsProps {
  docType: 'quotation'
  docId: string
  actions: ActionDescriptor[]
  suggested: ActionCode
}

interface DoneState {
  code: ActionCode
  label: string
  redirectTo?: string
  pdfUrl?: string
}

export function NextStepActions({
  docType,
  docId,
  actions,
  suggested,
}: NextStepActionsProps) {
  const router = useRouter()
  const { execute, pending, error, resetError } = useExecuteAction(docType, docId)

  // Estado UI: chip que ya se ejecutó OK (para mostrar variante "done")
  const [done, setDone] = useState<DoneState | null>(null)

  // Modal email
  const [emailOpen, setEmailOpen] = useState(false)
  const [emailTo, setEmailTo] = useState('')
  const [emailSubject, setEmailSubject] = useState('')

  // Modal duplicate
  const [dupOpen, setDupOpen] = useState(false)
  const [dupClientId, setDupClientId] = useState('')

  // ── Búsqueda async de clientes para SearchableSelect ──────────────────────
  const searchClients = useCallback(async (q: string) => {
    const sb = createClient()
    const { data } = await sb
      .from('tt_clients')
      .select('id, name, legal_name')
      .or(`name.ilike.%${q}%,legal_name.ilike.%${q}%`)
      .limit(20)
    return (data ?? []).map((c) => ({
      value: c.id as string,
      label: (c.legal_name as string) || (c.name as string) || c.id,
    }))
  }, [])

  // ── Ejecutar acción ────────────────────────────────────────────────────────
  const handleResult = useCallback(
    (code: ActionCode, label: string, res: ExecuteResult) => {
      if (!res.ok) return
      const r = res.result ?? {}
      setDone({
        code,
        label,
        redirectTo: r.redirect_to,
        pdfUrl: r.pdf_url,
      })
      if (r.pdf_url) {
        window.open(r.pdf_url, '_blank', 'noopener,noreferrer')
      }
    },
    []
  )

  const runDirect = useCallback(
    async (code: ActionCode, label: string) => {
      const res = await execute(code, {})
      handleResult(code, label, res)
    },
    [execute, handleResult]
  )

  const triggerAction = useCallback(
    (action: ActionDescriptor) => {
      if (!action.enabled) return
      if (action.code === 'send_email') {
        setEmailOpen(true)
        return
      }
      if (action.code === 'duplicate_for_client') {
        setDupOpen(true)
        return
      }
      // preview_pdf, convert_to_sales_order → directo
      runDirect(action.code, action.label)
    },
    [runDirect]
  )

  // ── Keyboard shortcuts 1-4 ────────────────────────────────────────────────
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      // No interceptar si hay un input/textarea con foco
      const tgt = e.target as HTMLElement | null
      if (
        tgt &&
        (tgt.tagName === 'INPUT' ||
          tgt.tagName === 'TEXTAREA' ||
          tgt.isContentEditable)
      ) {
        return
      }
      const num = Number(e.key)
      if (!Number.isFinite(num) || num < 1 || num > 9) return
      const target = actions.find((a) => a.shortcut === String(num) && a.enabled)
      if (target) {
        e.preventDefault()
        triggerAction(target)
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [actions, triggerAction])

  // ── Modal submit handlers ─────────────────────────────────────────────────
  const submitEmail = useCallback(async () => {
    setEmailOpen(false)
    const res = await execute('send_email', {
      recipients: [{ email: emailTo, type: 'to' }],
      subject: emailSubject || undefined,
      attachments: ['pdf'],
    })
    handleResult('send_email', 'Enviar por email', res)
  }, [execute, emailTo, emailSubject, handleResult])

  const submitDuplicate = useCallback(async () => {
    setDupOpen(false)
    const res = await execute('duplicate_for_client', {
      target_client_id: dupClientId,
    })
    handleResult('duplicate_for_client', 'Duplicar para otro cliente', res)
  }, [execute, dupClientId, handleResult])

  // ── Variante de cada chip ─────────────────────────────────────────────────
  const variants = useMemo(() => {
    const map = new Map<ActionCode, ChipVariant>()
    for (const a of actions) {
      if (done?.code === a.code) {
        map.set(a.code, 'done')
      } else if (error?.code === a.code) {
        map.set(a.code, 'error')
      } else if (pending === a.code) {
        map.set(a.code, 'loading')
      } else if (!a.enabled) {
        map.set(a.code, 'disabled')
      } else if (a.code === suggested) {
        map.set(a.code, 'suggested')
      } else {
        map.set(a.code, 'normal')
      }
    }
    return map
  }, [actions, done, error, pending, suggested])

  const onUndoTimeout = useCallback(() => {
    if (done?.redirectTo && done.redirectTo !== window.location.pathname) {
      router.push(done.redirectTo)
    }
    setDone(null)
    router.refresh()
  }, [done, router])

  const onUndoCancel = useCallback(() => {
    setDone(null)
  }, [])

  return (
    <div>
      <div className="flex flex-wrap items-center gap-3 pt-2">
        {actions.map((a) => (
          <NextStepChip
            key={a.code}
            label={a.label}
            icon={a.icon}
            shortcut={a.shortcut}
            variant={variants.get(a.code) ?? 'normal'}
            tooltip={a.tooltip}
            errorMessage={error?.code === a.code ? error.message : undefined}
            doneLabel={done?.code === a.code ? `${a.label} hecho` : undefined}
            onClick={() => triggerAction(a)}
            onErrorReset={resetError}
          />
        ))}
      </div>

      {/* Error inline (al lado de los chips) */}
      {error && (
        <div className="mt-2 inline-flex items-center gap-2 rounded-md border border-[#E24B4A] bg-[#2A1414] px-3 py-2 text-sm text-[#FCA5A5]">
          <i className="ti ti-alert-circle text-[14px]" aria-hidden />
          <span>{error.message}</span>
          {error.message.toLowerCase().includes('gmail') && (
            <a
              href="/api/auth/google"
              className="underline hover:no-underline"
            >
              Reconectar Gmail
            </a>
          )}
        </div>
      )}

      {/* Undo banner */}
      {done && (
        <UndoBanner
          message={done.label}
          seconds={5}
          onTimeout={onUndoTimeout}
          onCancel={onUndoCancel}
        />
      )}

      {/* Modal email — F1: form mínimo (to + subject opcional) */}
      <Modal
        isOpen={emailOpen}
        onClose={() => setEmailOpen(false)}
        title="Enviar por email"
        size="md"
      >
        <div className="space-y-3">
          <Input
            label="Para (email)"
            type="email"
            value={emailTo}
            onChange={(e) => setEmailTo(e.target.value)}
            placeholder="cliente@ejemplo.com"
            required
          />
          <Input
            label="Asunto (opcional)"
            value={emailSubject}
            onChange={(e) => setEmailSubject(e.target.value)}
            placeholder="Dejá vacío para usar el default"
          />
          <p className="text-xs text-[#6B7280]">
            Se adjunta el PDF de la cotización automáticamente.
          </p>
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="secondary" onClick={() => setEmailOpen(false)}>
              Cancelar
            </Button>
            <Button
              variant="primary"
              onClick={submitEmail}
              disabled={!emailTo || !/\S+@\S+\.\S+/.test(emailTo)}
            >
              Enviar
            </Button>
          </div>
        </div>
      </Modal>

      {/* Modal duplicate */}
      <Modal
        isOpen={dupOpen}
        onClose={() => setDupOpen(false)}
        title="Duplicar para otro cliente"
        size="md"
      >
        <div className="space-y-3">
          <SearchableSelect
            label="Cliente destino"
            value={dupClientId}
            onChange={(v) => setDupClientId(v)}
            onSearch={searchClients}
            placeholder="Buscar cliente…"
          />
          <p className="text-xs text-[#6B7280]">
            Se creará una nueva cotización en borrador con los mismos items.
          </p>
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="secondary" onClick={() => setDupOpen(false)}>
              Cancelar
            </Button>
            <Button
              variant="primary"
              onClick={submitDuplicate}
              disabled={!dupClientId}
            >
              Duplicar
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  )
}
