'use client'

import { useEffect, useRef, useState } from 'react'
import { Modal } from '@/components/ui/modal'
import { Button } from '@/components/ui/button'
import type { ParsedOC, OCDiscrepancy } from '@/lib/ai/parse-oc-pdf'

// Match SKU cliente ↔ catálogo devuelto por el endpoint para cada item.
// El cotizador lo usa para precargar product_id cuando hay alias o SKU exacto.
interface SKUMatch {
  externalSKU: string
  product: { id: string; sku: string; name: string; brand: string | null; price_eur: number | null } | null
  confidence: number
  source: string
}

interface OnParsedPayload {
  data: ParsedOC
  discrepancies: OCDiscrepancy[]
  ocParsedId?: string
  // matches[i] corresponde a data.items[i] (mismo orden).
  matches?: SKUMatch[]
  // Path del PDF en bucket 'client-pos' + nombre original — el cotizador
  // los usa al guardar para llamar a /api/oc/attach-to-quote y dejar el
  // PDF como attachment 'oc_cliente' de la cotización.
  pdf_storage_path?: string | null
  pdf_file_name?: string | null
}

interface Props {
  open: boolean
  onClose: () => void
  companyId: string
  /** Nombre de la empresa activa — para comparar contra el "receptor" que detectó la IA. */
  companyName?: string | null
  clientId?: string
  quoteDocumentId?: string
  onParsed?: (result: OnParsedPayload) => void
}

export function OCParserModal({ open, onClose, companyId, companyName, clientId, quoteDocumentId, onParsed }: Props) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [loading, setLoading] = useState(false)
  const [result, setResult] = useState<{
    data: ParsedOC
    discrepancies: OCDiscrepancy[]
    ocParsedId?: string
    matches?: SKUMatch[]
    pdf_storage_path?: string | null
    pdf_file_name?: string | null
  } | null>(null)
  const [msg, setMsg] = useState('')
  // Preview local del PDF que se acaba de subir — se arma con URL.createObjectURL
  // sobre el mismo File en memoria del browser (no hace falta pedirle al backend
  // una signed URL del bucket privado: es literalmente el archivo que el usuario
  // eligió, así que el preview es 100% fiel).
  const [pdfPreviewUrl, setPdfPreviewUrl] = useState<string | null>(null)

  // Al cerrar (Cancelar, X, backdrop, o después de confirmar) resetear todo
  // el estado — el componente NO se desmonta entre aperturas (el padre solo
  // togglea `open`), así que sin esto la próxima apertura mostraría el
  // resultado de la OC anterior en vez del dropzone de subida.
  useEffect(() => {
    if (!open) {
      setPdfPreviewUrl((prev) => {
        if (prev) URL.revokeObjectURL(prev)
        return null
      })
      setResult(null)
      setMsg('')
    }
  }, [open])
  useEffect(() => () => { if (pdfPreviewUrl) URL.revokeObjectURL(pdfPreviewUrl) }, [pdfPreviewUrl])

  async function handleFile(file: File) {
    if (file.type !== 'application/pdf') {
      setMsg('✗ Solo PDF')
      return
    }
    setPdfPreviewUrl((prev) => {
      if (prev) URL.revokeObjectURL(prev)
      return URL.createObjectURL(file)
    })
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
      // Ya NO se llama a onParsed acá — antes los datos se aplicaban a la
      // cotización apenas terminaba de parsear, sin que el usuario confirmara
      // nada. Ahora solo se guarda el resultado; onParsed se dispara recién
      // cuando el usuario revisa el PDF al lado de los datos extraídos y
      // clickea "Confirmar y usar estos datos".
      setResult({
        data: j.data,
        discrepancies: j.discrepancies || [],
        ocParsedId: j.ocParsedId,
        matches: j.matches,
        pdf_storage_path: j.pdf_storage_path,
        pdf_file_name: j.pdf_file_name,
      })
      setMsg(`✓ Parseado con ${j.data.provider_used}`)
    } catch (err) {
      setMsg('✗ ' + (err as Error).message)
    } finally {
      setLoading(false)
    }
  }

  function handleConfirm() {
    if (!result) return
    onParsed?.({
      data: result.data,
      discrepancies: result.discrepancies,
      ocParsedId: result.ocParsedId,
      matches: result.matches,
      pdf_storage_path: result.pdf_storage_path,
      pdf_file_name: result.pdf_file_name,
    })
    onClose()
  }

  const highCount = result?.discrepancies.filter((d) => d.severity === 'high').length || 0
  const medCount = result?.discrepancies.filter((d) => d.severity === 'medium').length || 0

  return (
    <Modal isOpen={open} onClose={onClose} title="Importar OC del cliente" size={result ? 'full' : 'lg'}>
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
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {/* Columna izquierda: PDF original, para confirmar visualmente que lo
              que se cargó es lo que dice la OC antes de seguir el proceso. */}
          <div className="rounded-lg border overflow-hidden bg-[#0B0E13]" style={{ borderColor: 'var(--sat-br, #2A3040)', height: '70vh' }}>
            {pdfPreviewUrl ? (
              <iframe src={pdfPreviewUrl} title="OC original" className="w-full h-full" />
            ) : (
              <div className="w-full h-full flex items-center justify-center text-xs opacity-60">
                No se pudo previsualizar el PDF
              </div>
            )}
          </div>

          {/* Columna derecha: datos extraídos por la IA */}
          <div className="space-y-3 overflow-y-auto pr-1" style={{ maxHeight: '70vh' }}>
            <div className="grid grid-cols-4 gap-2 text-xs">
              <Stat label="Nº OC" value={result.data.numero_oc || '–'} />
              <Stat label="Items" value={String(result.data.items.length)} />
              <Stat label="Total" value={`$${(result.data.total || 0).toFixed(2)}`} />
              <Stat label="Confianza" value={`${Math.round((result.data.confidence || 0) * 100)}%`} />
            </div>

            {/* Campos que antes no se mostraban (proveedor detectado, condición
                de pago, IVA) — el usuario no podía ver si la IA los había
                extraído o no. */}
            <div className="grid grid-cols-3 gap-2 text-xs">
              <Stat label="Condición de pago" value={result.data.condicion_pago || 'No detectada'} />
              <Stat
                label="IVA detectado"
                value={
                  result.data.items.some((it) => it.iva_pct != null)
                    ? `${result.data.items.find((it) => it.iva_pct != null)?.iva_pct}%`
                    : result.data.iva
                      ? `$${result.data.iva.toFixed(2)}`
                      : 'No detectado'
                }
              />
              <Stat label="Proveedor (nosotros)" value={result.data.receptor_razon_social || '–'} />
            </div>

            {companyName && result.data.receptor_razon_social &&
              !result.data.receptor_razon_social.toLowerCase().includes(companyName.toLowerCase().slice(0, 6)) &&
              !companyName.toLowerCase().includes(result.data.receptor_razon_social.toLowerCase().slice(0, 6)) && (
              <div className="text-xs p-2 rounded-md" style={{ background: 'rgba(249,115,22,0.1)', color: '#f97316' }}>
                ⚠️ La OC dice &quot;{result.data.receptor_razon_social}&quot; pero elegiste <strong>{companyName}</strong> como empresa emisora — verificá que sea la empresa correcta antes de guardar.
              </div>
            )}

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

            <p className="text-[11px] opacity-60 text-center pt-1">
              Comparación con el PDF a la izquierda antes de continuar — si algo no coincide, &quot;Otra OC&quot; para volver a subirla.
            </p>
          </div>
          </div>
        )}

        <div className="flex justify-end gap-2 pt-2">
          {!result ? (
            <Button variant="secondary" onClick={onClose}>Cerrar</Button>
          ) : (
            <>
              <Button variant="secondary" onClick={onClose}>Cancelar</Button>
              <Button variant="outline" onClick={() => { setResult(null); inputRef.current?.click() }}>Otra OC</Button>
              <Button onClick={handleConfirm}>✓ Confirmar y usar estos datos</Button>
            </>
          )}
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
