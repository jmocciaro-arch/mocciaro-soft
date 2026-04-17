'use client'

import { useRef, useState } from 'react'
import { Button } from '@/components/ui/button'
import type { ExtractedInvoiceData } from '@/lib/invoicing/invoice-types'

interface Props {
  onParsed: (data: ExtractedInvoiceData, file: File) => void
  onError?: (msg: string) => void
}

export function InvoicePDFUploader({ onParsed, onError }: Props) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [loading, setLoading] = useState(false)
  const [status, setStatus] = useState<string>('')

  async function handleFile(file: File) {
    if (!file) return
    if (file.type !== 'application/pdf') {
      onError?.('Solo se aceptan PDFs')
      return
    }

    setLoading(true)
    setStatus('Subiendo y analizando con IA...')

    try {
      const fd = new FormData()
      fd.append('file', file)

      const res = await fetch('/api/invoices/parse', { method: 'POST', body: fd })
      const json = await res.json()

      if (!res.ok) {
        onError?.(json.error || 'Error al parsear el PDF')
        setStatus('')
        return
      }

      setStatus(`✓ Parseado con ${json.data.provider_used || 'IA'}`)
      onParsed(json.data as ExtractedInvoiceData, file)
    } catch (err) {
      onError?.((err as Error).message)
      setStatus('')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="space-y-3">
      <input
        ref={inputRef}
        type="file"
        accept="application/pdf"
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0]
          if (f) void handleFile(f)
        }}
      />

      <div
        className="border-2 border-dashed rounded-lg p-6 text-center cursor-pointer transition-colors hover:bg-[#1E2330]"
        style={{ borderColor: 'var(--sat-br, #2A3040)' }}
        onClick={() => inputRef.current?.click()}
        onDragOver={(e) => e.preventDefault()}
        onDrop={(e) => {
          e.preventDefault()
          const f = e.dataTransfer.files?.[0]
          if (f) void handleFile(f)
        }}
      >
        <div className="text-3xl mb-2">📄</div>
        <div className="text-sm font-semibold mb-1">
          {loading ? 'Analizando...' : 'Subí la factura PDF o arrastrala acá'}
        </div>
        <div className="text-xs opacity-60">
          La IA extrae nº, CAE, cliente, items y totales automáticamente
        </div>
        {status && (
          <div className="mt-3 text-xs" style={{ color: 'var(--sat-gn, #10b981)' }}>
            {status}
          </div>
        )}
      </div>

      <div className="flex justify-end">
        <Button
          type="button"
          variant="secondary"
          size="sm"
          onClick={() => inputRef.current?.click()}
          disabled={loading}
        >
          {loading ? 'Analizando...' : 'Seleccionar PDF'}
        </Button>
      </div>
    </div>
  )
}
