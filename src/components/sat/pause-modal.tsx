'use client'

import { useState } from 'react'
import { Modal } from '@/components/ui/modal'
import { Button } from '@/components/ui/button'
import { PAUSE_REASONS_FULL, type PauseReasonKey } from '@/lib/sat/fein-data'

interface Props {
  open: boolean
  onClose: () => void
  onConfirm: (reason: PauseReasonKey, detail: string) => Promise<void> | void
}

/** Modal con 5 motivos predefinidos + detalle opcional. */
export function PauseModal({ open, onClose, onConfirm }: Props) {
  const [reason, setReason] = useState<PauseReasonKey | ''>('')
  const [detail, setDetail] = useState('')
  const [err, setErr] = useState('')
  const [saving, setSaving] = useState(false)

  const handleConfirm = async () => {
    if (!reason) { setErr('Seleccioná un motivo para continuar'); return }
    setErr('')
    setSaving(true)
    try {
      await onConfirm(reason as PauseReasonKey, detail)
      setReason(''); setDetail('')
      onClose()
    } finally {
      setSaving(false)
    }
  }

  return (
    <Modal isOpen={open} onClose={onClose} title="⏸ Pausar esta ficha">
      <div className="space-y-4">
        <p className="text-sm text-[#9CA3AF]">
          La reparación queda guardada. Podés retomar desde donde dejaste cuando quieras.
        </p>

        <div>
          <label className="block text-sm font-semibold text-[#9CA3AF] mb-2">¿Por qué pausás? *</label>
          <div className="flex flex-col gap-2">
            {PAUSE_REASONS_FULL.map((r) => (
              <label
                key={r.key}
                className={`flex items-center gap-2 cursor-pointer p-2 border rounded-lg ${
                  reason === r.key
                    ? 'bg-orange-500/10 border-orange-500 text-orange-400'
                    : 'bg-[#1E2330] border-[#2A3040] text-[#D1D5DB] hover:border-[#3A4050]'
                }`}
              >
                <input
                  type="radio"
                  name="pauseReason"
                  value={r.key}
                  checked={reason === r.key}
                  onChange={(e) => setReason(e.target.value as PauseReasonKey)}
                  className="accent-orange-500"
                />
                <span>{r.icon} {r.label}</span>
              </label>
            ))}
          </div>
        </div>

        <div>
          <label className="block text-sm font-semibold text-[#9CA3AF] mb-1.5">Detalle adicional (opcional)</label>
          <textarea
            value={detail}
            onChange={(e) => setDetail(e.target.value)}
            placeholder="Ej: Se rompió el cabezal, hay que pedir repuesto al depósito..."
            className="w-full h-20 rounded-lg bg-[#1E2330] border border-[#2A3040] px-3 py-2 text-sm text-[#F0F2F5] placeholder:text-[#4B5563] focus:outline-none focus:ring-2 focus:ring-orange-500/50 resize-none"
          />
        </div>

        {err && <div className="text-sm text-red-400">{err}</div>}

        <div className="flex justify-end gap-2 pt-3 border-t border-[#1E2330]">
          <Button variant="secondary" onClick={onClose}>Cancelar</Button>
          <Button onClick={handleConfirm} loading={saving} style={{ background: '#F59E0B' }}>
            ⏸ Guardar y pausar
          </Button>
        </div>
      </div>
    </Modal>
  )
}
