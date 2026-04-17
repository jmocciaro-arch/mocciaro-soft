'use client'

import { useRef, useState } from 'react'
import { Modal } from '@/components/ui/modal'
import { Button } from '@/components/ui/button'

interface Props {
  open: boolean
  onClose: () => void
  companyId: string
  onUploaded?: (statementId: string) => void
}

/**
 * Sube un extracto bancario y dispara el parseo + matching automático.
 */
export function BankStatementUploader({ open, onClose, companyId, onUploaded }: Props) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [bankName, setBankName] = useState('')
  const [accountNumber, setAccountNumber] = useState('')
  const [loading, setLoading] = useState(false)
  const [msg, setMsg] = useState('')
  const [stats, setStats] = useState<{ total: number; matched: number; provider: string } | null>(null)

  async function handleFile(file: File) {
    if (file.type !== 'application/pdf') {
      setMsg('✗ Solo PDF')
      return
    }
    setLoading(true)
    setMsg('Subiendo y parseando con IA... (puede tardar ~30-60s)')
    try {
      const fd = new FormData()
      fd.append('file', file)
      fd.append('companyId', companyId)
      if (bankName) fd.append('bank_name', bankName)
      if (accountNumber) fd.append('account_number', accountNumber)

      const res = await fetch('/api/bank-statements/parse', { method: 'POST', body: fd })
      const j = await res.json()
      if (!res.ok) throw new Error(j.error || 'Error parseando')

      setMsg(`✓ ${j.matchedCount}/${j.totalLines} líneas matcheadas automáticamente`)
      setStats({ total: j.totalLines, matched: j.matchedCount, provider: j.provider })
      onUploaded?.(j.statementId)
    } catch (err) {
      setMsg('✗ ' + (err as Error).message)
    } finally {
      setLoading(false)
    }
  }

  return (
    <Modal isOpen={open} onClose={onClose} title="Subir extracto bancario" size="md">
      <div className="space-y-3">
        <input
          ref={inputRef}
          type="file"
          accept="application/pdf"
          className="hidden"
          onChange={(e) => { const f = e.target.files?.[0]; if (f) void handleFile(f) }}
        />

        <div className="grid grid-cols-2 gap-3">
          <label className="flex flex-col gap-1">
            <span className="text-xs opacity-70">Banco (opcional)</span>
            <input
              value={bankName}
              onChange={(e) => setBankName(e.target.value)}
              placeholder="Galicia / Santander / etc"
              className="rounded-md bg-[#1E2330] border border-[#2A3040] px-2 py-1.5 text-sm"
            />
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-xs opacity-70">Nº cuenta (opcional)</span>
            <input
              value={accountNumber}
              onChange={(e) => setAccountNumber(e.target.value)}
              placeholder="123-456-789"
              className="rounded-md bg-[#1E2330] border border-[#2A3040] px-2 py-1.5 text-sm"
            />
          </label>
        </div>

        {!stats ? (
          <div
            className="border-2 border-dashed rounded-lg p-6 text-center cursor-pointer hover:bg-[#1E2330]"
            style={{ borderColor: 'var(--sat-br, #2A3040)' }}
            onClick={() => inputRef.current?.click()}
            onDragOver={(e) => e.preventDefault()}
            onDrop={(e) => { e.preventDefault(); const f = e.dataTransfer.files?.[0]; if (f) void handleFile(f) }}
          >
            <div className="text-3xl mb-2">🏦</div>
            <div className="text-sm font-semibold mb-1">
              {loading ? 'Procesando...' : 'Subí el PDF del extracto'}
            </div>
            <div className="text-xs opacity-60">
              La IA extrae movimientos y matchea automáticamente con facturas pendientes
            </div>
          </div>
        ) : (
          <div className="space-y-2">
            <div className="grid grid-cols-3 gap-2 text-center">
              <Stat label="Líneas" value={String(stats.total)} />
              <Stat label="Matcheadas" value={String(stats.matched)} color="#10b981" />
              <Stat label="Pendientes" value={String(stats.total - stats.matched)} color="#f97316" />
            </div>
            <div className="text-xs opacity-60 text-center">Parseado con {stats.provider}</div>
          </div>
        )}

        {msg && (
          <div
            className="text-xs p-2 rounded-md"
            style={{
              background: msg.startsWith('✓') ? 'rgba(16,185,129,0.1)'
                : msg.startsWith('✗') ? 'rgba(239,68,68,0.1)'
                : 'rgba(249,115,22,0.1)',
            }}
          >
            {msg}
          </div>
        )}

        <div className="flex justify-end gap-2">
          <Button variant="secondary" onClick={onClose}>{stats ? 'Ver líneas' : 'Cerrar'}</Button>
        </div>
      </div>
    </Modal>
  )
}

function Stat({ label, value, color }: { label: string; value: string; color?: string }) {
  return (
    <div className="p-2 rounded-md" style={{ background: '#1E2330', border: '1px solid var(--sat-br, #2A3040)' }}>
      <div className="text-[10px] opacity-60 uppercase">{label}</div>
      <div className="font-bold text-lg mt-0.5" style={{ color: color || 'inherit' }}>{value}</div>
    </div>
  )
}
