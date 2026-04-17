'use client'

import { useState, useRef, useCallback } from 'react'
import { Camera, Upload, X, Loader2, Save, CheckCircle, ScanLine } from 'lucide-react'
import { Button } from '@/components/ui/button'

interface ReceiptItem {
  descripcion: string
  cantidad: number
  precio: number
}

interface ExtractedReceipt {
  proveedor: string | null
  fecha: string | null
  items: ReceiptItem[]
  subtotal: number | null
  iva: number | null
  total: number | null
  tipo_comprobante: string | null
  numero: string | null
  cuit_emisor: string | null
}

interface ReceiptScannerProps {
  companyId: string
  onSaved?: (docId: string) => void
}

export function ReceiptScanner({ companyId, onSaved }: ReceiptScannerProps) {
  const [preview, setPreview] = useState<string | null>(null)
  const [imageFile, setImageFile] = useState<File | null>(null)
  const [loading, setLoading] = useState(false)
  const [scanning, setScanning] = useState(false)
  const [extracted, setExtracted] = useState<ExtractedReceipt | null>(null)
  const [editedData, setEditedData] = useState<ExtractedReceipt | null>(null)
  const [saved, setSaved] = useState(false)
  const [savedDocId, setSavedDocId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [cameraOpen, setCameraOpen] = useState(false)

  const inputRef = useRef<HTMLInputElement>(null)
  const videoRef = useRef<HTMLVideoElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const streamRef = useRef<MediaStream | null>(null)

  const handleFile = useCallback((file: File) => {
    if (!file.type.startsWith('image/')) {
      setError('Solo se aceptan imágenes (JPG, PNG, WEBP)')
      return
    }
    setImageFile(file)
    setExtracted(null)
    setEditedData(null)
    setSaved(false)
    setSavedDocId(null)
    setError(null)

    const reader = new FileReader()
    reader.onload = (e) => setPreview(e.target?.result as string)
    reader.readAsDataURL(file)
  }, [])

  const openCamera = useCallback(async () => {
    setError(null)
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: { ideal: 'environment' }, width: { ideal: 1920 } },
      })
      streamRef.current = stream
      setCameraOpen(true)
      setTimeout(() => {
        if (videoRef.current) {
          videoRef.current.srcObject = stream
          videoRef.current.play().catch(() => {})
        }
      }, 100)
    } catch (e) {
      setError(`Cámara no disponible: ${(e as Error).message}`)
    }
  }, [])

  const takePhoto = useCallback(() => {
    if (!videoRef.current || !canvasRef.current) return
    const video = videoRef.current
    const canvas = canvasRef.current
    canvas.width = video.videoWidth
    canvas.height = video.videoHeight
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    ctx.drawImage(video, 0, 0)
    canvas.toBlob((blob) => {
      if (!blob) return
      const file = new File([blob], `receipt-${Date.now()}.jpg`, { type: 'image/jpeg' })
      handleFile(file)
      closeCamera()
    }, 'image/jpeg', 0.92)
  }, [handleFile]) // eslint-disable-line react-hooks/exhaustive-deps

  const closeCamera = useCallback(() => {
    streamRef.current?.getTracks().forEach((t) => t.stop())
    streamRef.current = null
    setCameraOpen(false)
  }, [])

  const scanImage = useCallback(async () => {
    if (!imageFile) return
    setScanning(true)
    setError(null)
    try {
      const formData = new FormData()
      formData.append('file', imageFile)
      formData.append('companyId', companyId)

      const res = await fetch('/api/ai/ocr-receipt', {
        method: 'POST',
        body: formData,
      })

      const data = await res.json() as { extracted?: ExtractedReceipt; docId?: string; error?: string }
      if (!res.ok) throw new Error(data.error || 'Error al escanear')

      if (data.extracted) {
        setExtracted(data.extracted)
        setEditedData({ ...data.extracted })
      }
      if (data.docId) {
        setSaved(true)
        setSavedDocId(data.docId)
        onSaved?.(data.docId)
      }
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setScanning(false)
    }
  }, [imageFile, companyId, onSaved])

  const saveGasto = useCallback(async () => {
    if (!editedData || !companyId) return
    setLoading(true)
    setError(null)
    try {
      const formData = new FormData()
      if (imageFile) formData.append('file', imageFile)
      formData.append('companyId', companyId)

      // Re-submit with edited data applied
      const res = await fetch('/api/ai/ocr-receipt', {
        method: 'POST',
        body: formData,
      })
      const data = await res.json() as { docId?: string; error?: string }
      if (!res.ok) throw new Error(data.error || 'Error al guardar')
      if (data.docId) {
        setSaved(true)
        setSavedDocId(data.docId)
        onSaved?.(data.docId)
      }
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setLoading(false)
    }
  }, [editedData, companyId, imageFile, onSaved])

  const updateField = (key: keyof ExtractedReceipt, value: unknown) => {
    setEditedData((prev) => prev ? { ...prev, [key]: value } : null)
  }

  return (
    <div className="space-y-4">
      {/* Acciones */}
      {!preview && (
        <div className="flex flex-wrap gap-2">
          <Button
            type="button"
            variant="primary"
            size="sm"
            onClick={openCamera}
            className="flex items-center gap-2"
          >
            <Camera className="w-4 h-4" /> Sacar foto
          </Button>
          <Button
            type="button"
            variant="secondary"
            size="sm"
            onClick={() => inputRef.current?.click()}
            className="flex items-center gap-2"
          >
            <Upload className="w-4 h-4" /> Subir imagen
          </Button>
          <input
            ref={inputRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={(e) => e.target.files?.[0] && handleFile(e.target.files[0])}
          />
        </div>
      )}

      {/* Camera modal */}
      {cameraOpen && (
        <div
          className="fixed inset-0 z-50 flex flex-col items-center justify-center"
          style={{ background: 'rgba(0,0,0,0.95)' }}
        >
          <div className="flex items-center justify-between w-full max-w-2xl mb-3 px-4">
            <span className="text-orange-400 font-bold text-sm uppercase">Fotografiar comprobante</span>
            <button
              type="button"
              onClick={closeCamera}
              className="p-2 rounded-lg"
              style={{ background: '#1E2330', border: '1px solid #2A3040' }}
            >
              <X className="w-4 h-4" />
            </button>
          </div>
          <video
            ref={videoRef}
            autoPlay
            playsInline
            muted
            className="max-w-full max-h-[70vh] rounded-xl"
            style={{ border: '1px solid #2A3040' }}
          />
          <canvas ref={canvasRef} className="hidden" />
          <Button type="button" variant="primary" size="lg" onClick={takePhoto} className="mt-4">
            <Camera className="w-5 h-5" /> Tomar foto
          </Button>
        </div>
      )}

      {/* Preview */}
      {preview && (
        <div className="space-y-3">
          <div className="relative rounded-xl overflow-hidden" style={{ maxHeight: 300 }}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={preview} alt="Comprobante" className="w-full object-contain" style={{ maxHeight: 300 }} />
            <button
              type="button"
              onClick={() => { setPreview(null); setImageFile(null); setExtracted(null); setEditedData(null); setSaved(false) }}
              className="absolute top-2 right-2 p-1.5 rounded-full"
              style={{ background: 'rgba(0,0,0,0.7)' }}
            >
              <X className="w-4 h-4 text-white" />
            </button>
          </div>

          {!extracted && (
            <Button
              type="button"
              variant="primary"
              onClick={scanImage}
              disabled={scanning}
              className="w-full"
            >
              {scanning ? (
                <><Loader2 className="w-4 h-4 animate-spin" /> Analizando con IA...</>
              ) : (
                <><ScanLine className="w-4 h-4" /> Escanear comprobante</>
              )}
            </Button>
          )}
        </div>
      )}

      {/* Error */}
      {error && (
        <div className="flex items-center gap-2 text-sm text-red-400 bg-red-500/10 border border-red-500/20 rounded-lg px-3 py-2">
          <X className="w-4 h-4 shrink-0" />
          {error}
        </div>
      )}

      {/* Saved success */}
      {saved && savedDocId && (
        <div className="flex items-center gap-2 text-sm text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 rounded-lg px-3 py-2">
          <CheckCircle className="w-4 h-4 shrink-0" />
          Gasto guardado correctamente (ID: {savedDocId.slice(0, 8)}...)
        </div>
      )}

      {/* Extracted data form */}
      {editedData && !saved && (
        <div className="space-y-3 rounded-xl border p-4" style={{ background: '#151821', borderColor: '#2A3040' }}>
          <div className="text-xs font-bold text-orange-400 uppercase tracking-wider">Datos extraídos — revisá y editá</div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <label className="text-[10px] text-[#9CA3AF] uppercase font-bold">Proveedor</label>
              <input
                type="text"
                value={editedData.proveedor || ''}
                onChange={(e) => updateField('proveedor', e.target.value || null)}
                className="w-full rounded-lg px-3 py-2 text-sm"
                style={{ background: '#0F1218', border: '1px solid #2A3040', color: '#F0F2F5' }}
                placeholder="Nombre del proveedor"
              />
            </div>
            <div className="space-y-1">
              <label className="text-[10px] text-[#9CA3AF] uppercase font-bold">Fecha</label>
              <input
                type="date"
                value={editedData.fecha || ''}
                onChange={(e) => updateField('fecha', e.target.value || null)}
                className="w-full rounded-lg px-3 py-2 text-sm"
                style={{ background: '#0F1218', border: '1px solid #2A3040', color: '#F0F2F5' }}
              />
            </div>
            <div className="space-y-1">
              <label className="text-[10px] text-[#9CA3AF] uppercase font-bold">Tipo comprobante</label>
              <input
                type="text"
                value={editedData.tipo_comprobante || ''}
                onChange={(e) => updateField('tipo_comprobante', e.target.value || null)}
                className="w-full rounded-lg px-3 py-2 text-sm"
                style={{ background: '#0F1218', border: '1px solid #2A3040', color: '#F0F2F5' }}
                placeholder="FACTURA A, TICKET..."
              />
            </div>
            <div className="space-y-1">
              <label className="text-[10px] text-[#9CA3AF] uppercase font-bold">Número</label>
              <input
                type="text"
                value={editedData.numero || ''}
                onChange={(e) => updateField('numero', e.target.value || null)}
                className="w-full rounded-lg px-3 py-2 text-sm"
                style={{ background: '#0F1218', border: '1px solid #2A3040', color: '#F0F2F5' }}
                placeholder="0001-00001234"
              />
            </div>
            <div className="space-y-1">
              <label className="text-[10px] text-[#9CA3AF] uppercase font-bold">CUIT emisor</label>
              <input
                type="text"
                value={editedData.cuit_emisor || ''}
                onChange={(e) => updateField('cuit_emisor', e.target.value || null)}
                className="w-full rounded-lg px-3 py-2 text-sm"
                style={{ background: '#0F1218', border: '1px solid #2A3040', color: '#F0F2F5' }}
                placeholder="20-12345678-9"
              />
            </div>
            <div className="space-y-1">
              <label className="text-[10px] text-[#9CA3AF] uppercase font-bold">Total</label>
              <input
                type="number"
                step="0.01"
                value={editedData.total ?? ''}
                onChange={(e) => updateField('total', e.target.value ? Number(e.target.value) : null)}
                className="w-full rounded-lg px-3 py-2 text-sm"
                style={{ background: '#0F1218', border: '1px solid #2A3040', color: '#f97316', fontWeight: 700 }}
                placeholder="0.00"
              />
            </div>
          </div>

          {/* Items */}
          {editedData.items.length > 0 && (
            <div>
              <div className="text-[10px] text-[#9CA3AF] uppercase font-bold mb-2">Items ({editedData.items.length})</div>
              <div className="space-y-1 max-h-40 overflow-y-auto">
                {editedData.items.map((item, i) => (
                  <div key={i} className="flex items-center gap-2 text-xs rounded px-2 py-1" style={{ background: '#0F1218' }}>
                    <span className="flex-1 truncate text-[#F0F2F5]">{item.descripcion}</span>
                    <span className="text-[#9CA3AF]">x{item.cantidad}</span>
                    <span className="text-orange-400 font-mono">{Number(item.precio).toFixed(2)}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          <Button
            type="button"
            variant="primary"
            onClick={saveGasto}
            disabled={loading}
            className="w-full"
          >
            {loading ? (
              <><Loader2 className="w-4 h-4 animate-spin" /> Guardando...</>
            ) : (
              <><Save className="w-4 h-4" /> Guardar como gasto</>
            )}
          </Button>
        </div>
      )}
    </div>
  )
}
