'use client'

import { useRef, useState } from 'react'
import { Modal } from '@/components/ui/modal'
import { Button } from '@/components/ui/button'
import type { ParsedOC, OCDiscrepancy } from '@/lib/ai/parse-oc-pdf'

interface Props {
  open: boolean
  onClose: () => void
  companyId: string
  clientId?: string
  quoteDocumentId?: string
  onParsed?: (result: { data: ParsedOC; discrepancies: OCDiscrepancy[]; ocParsedId?: string }) => void
}

export function OCParserModal({ open, onClose, companyId, clientId, quoteDocumentId, onParsed }: Props) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [loading, setLoading] = useState(false)
  const [result, setResult] = useState<{ data: ParsedOC; discrepancies: OCDiscrepancy[]; ocParsedId?: string } | null>(null)
  const [msg, setMsg] = useState('')

  async function handleFile(file: File) {
    if (file.type !== 'application/pdf') {
      setMsg('✗ Solo PDF')
      return
    }
    setLoading(true)
    setMsg('Analizando OC con IA...')
    try {
      const fd = new FormData()
      fd.append('file', file)
      fd.append('companyId', companyId)
      if (clientId) fd.append('clientId', clientId)
      if (quoteDocumentId) fd.append('quoteDocumentId', quoteDocumentId)
      fd.append('createDocument', 'true')

      const res = await fetch('/api/oc/parse', { method: 'POST', body: fd })
      const j = await res.json()
      if (!res.ok) throw new Error(j.error || 'Error parseando')
      setResult({ data: j.data, discrepancies: j.discrepancies || [], ocParsedId: j.ocParsedId })
      setMsg(`✓ Parseado con ${j.data.provider_used}`)
      onParsed?.({ data: j.data, discrepancies: j.discrepancies, ocParsedId: j.ocParsedId })
    } catch (err) {
      setMsg('✗ ' + (err as Error).message)
    } finally {
      setLoading(false)
    }
  }

  const highCount = result?.discrepancies.filter((d) => d.severity === 'high').length || 0
  const medCount = result?.discrepancies.filter((d) => d.severity === 'medium').length || 0

  return (
    <Modal isOpen={open} onClose={onClose} title="Importar OC del cliente" size="lg">
      <div className="space-y-3">
        <input
          ref={inputRef}
          type="file"
          accept="application/pdf"
          className="hidden"
          onChange={(e) => { const f = e.target.files?.[0]; if (f) void handleFile(f) }}
        />

        {!result ? (
          <>
            <div
              className="border-2 border-dashed rounded-lg p-6 text-center cursor-pointer hover:bg-[#1E2330]"
              style={{ borderColor: 'var(--sat-br, #2A3040)' }}
              onClick={() => inputRef.current?.click()}
              onDragOver={(e) => e.preventDefault()}
              onDrop={(e) => { e.preventDefault(); const f = e.dataTransfer.files?.[0]; if (f) void handleFile(f) }}
            >
              <div className="text-3xl mb-2">📋</div>
              <div className="text-sm font-semibold mb-1">
                {loading ? 'Analizando...' : 'Subí la OC del cliente (PDF)'}
              </div>
              <div className="text-xs opacity-60">
                La IA extrae número, items, cantidades y compara con la cotización
              </div>
            </div>
            {msg && <div className="text-xs opacity-70 text-center">{msg}</div>}
          </>
        ) : (
          <>
            <div className="grid grid-cols-4 gap-2 text-xs">
              <Stat label="Nº OC" value={result.data.numero_oc || '–'} />
              <Stat label="Items" value={String(result.data.items.length)} />
              <Stat label="Total" value={`$${(result.data.total || 0).toFixed(2)}`} />
              <Stat label="Confianza" value={`${Math.round((result.data.confidence || 0) * 100)}%`} />
            </div>

            {result.discrepancies.length > 0 ? (
              <div className="space-y-1">
                <div className="flex items-center gap-2 text-sm font-semibold">
                  <span>Discrepancias con cotización</span>
                  {highCount > 0 && <span style={{ color: '#ef4444' }}>🔴 {highCount} críticas</span>}
                  {medCount > 0 && <span style={{ color: '#f97316' }}>🟠 {medCount} medias</span>}
                </div>
                <div className="max-h-56 overflow-y-auto border rounded-lg p-2 text-xs" style={{ borderColor: 'var(--sat-br, #2A3040)' }}>
                  {result.discrepancies.map((d, i) => (
                    <div key={i} className="flex items-start gap-2 py-1 border-b" style={{ borderColor: 'var(--sat-br, #2A3040)' }}>
                      <span>{d.severity === 'high' ? '🔴' : d.severity === 'medium' ? '🟠' : '🟡'}</span>
                      <span>{d.detail}</span>
                    </div>
                  ))}
                </div>
              </div>
            ) : (
              <div className="text-xs p-2 rounded-md" style={{ background: 'rgba(16,185,129,0.1)', color: '#10b981' }}>
                ✓ La OC coincide perfectamente con la cotización
              </div>
            )}

            <div className="flex items-center justify-between border rounded-lg p-2 text-xs" style={{ borderColor: 'var(--sat-br, #2A3040)' }}>
              <span>Cliente OC: <strong>{result.data.emisor_razon_social}</strong></span>
              <span>Items: <strong>{result.data.items.length}</strong></span>
            </div>
          </>
        )}

        <div className="flex justify-end gap-2 pt-2">
          <Button variant="secondary" onClick={onClose}>{result ? 'Listo' : 'Cerrar'}</Button>
          {result && <Button onClick={() => { setResult(null); inputRef.current?.click() }}>Otra OC</Button>}
        </div>
      </div>
    </Modal>
  )
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="p-2 rounded-md" style={{ background: '#1E2330', border: '1px solid var(--sat-br, #2A3040)' }}>
      <div className="text-[10px] opacity-60 uppercase">{label}</div>
      <div className="font-semibold mt-0.5">{value}</div>
    </div>
  )
}
