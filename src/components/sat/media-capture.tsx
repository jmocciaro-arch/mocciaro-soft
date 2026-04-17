'use client'

import { useState, useCallback, useRef, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useToast } from '@/components/ui/toast'
import {
  Upload, X, Loader2, Camera, Video, Square, Circle as RecordIcon,
  Image as ImageIcon, Film, Play,
} from 'lucide-react'

export interface MediaItem {
  url: string
  caption?: string
  uploaded_at?: string
  uploaded_by?: string | null
  kind?: 'image' | 'video'
  mime_type?: string
  duration_s?: number
}

interface Props {
  media: MediaItem[]
  onChange: (media: MediaItem[]) => void
  bucket?: string
  pathPrefix: string
  maxItems?: number
  title?: string
  subtitle?: string
  disabled?: boolean
}

/**
 * Upload de fotos y videos. 3 formas de capturar:
 *  - Archivo (click o drag & drop)
 *  - Cámara (webcam/móvil) — foto
 *  - Videocámara — graba hasta 60 segundos
 * Cada item queda con caption editable y se sube al bucket.
 */
export function MediaCapture({
  media, onChange,
  bucket = 'sat-photos',
  pathPrefix,
  maxItems = 20,
  title, subtitle,
  disabled,
}: Props) {
  const [uploading, setUploading] = useState(false)
  const [dragging, setDragging] = useState(false)
  const [cameraMode, setCameraMode] = useState<null | 'photo' | 'video'>(null)
  const [recording, setRecording] = useState(false)
  const [recordingTime, setRecordingTime] = useState(0)
  const inputRef = useRef<HTMLInputElement>(null)
  const videoRef = useRef<HTMLVideoElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const recorderRef = useRef<MediaRecorder | null>(null)
  const chunksRef = useRef<Blob[]>([])
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const { addToast } = useToast()

  // Cerrar stream al desmontar o cerrar cam
  useEffect(() => {
    return () => stopCamera()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const stopCamera = useCallback(() => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop())
      streamRef.current = null
    }
    if (timerRef.current) {
      clearInterval(timerRef.current)
      timerRef.current = null
    }
    setRecordingTime(0)
    setRecording(false)
  }, [])

  const openCamera = useCallback(async (mode: 'photo' | 'video') => {
    if (disabled) return
    try {
      const constraints: MediaStreamConstraints = {
        video: { facingMode: { ideal: 'environment' }, width: { ideal: 1920 }, height: { ideal: 1080 } },
        audio: mode === 'video',
      }
      const stream = await navigator.mediaDevices.getUserMedia(constraints)
      streamRef.current = stream
      setCameraMode(mode)
      setTimeout(() => {
        if (videoRef.current && stream) {
          videoRef.current.srcObject = stream
          videoRef.current.play().catch(() => {})
        }
      }, 100)
    } catch (e: any) {
      addToast({ type: 'error', title: 'Cámara no disponible', message: e.message || 'Permiso denegado' })
    }
  }, [disabled, addToast])

  const closeCamera = useCallback(() => {
    stopCamera()
    setCameraMode(null)
  }, [stopCamera])

  // ── Tomar foto desde la cámara activa ──
  const takePhoto = useCallback(async () => {
    if (!videoRef.current || !canvasRef.current || !streamRef.current) return
    const video = videoRef.current
    const canvas = canvasRef.current
    canvas.width = video.videoWidth
    canvas.height = video.videoHeight
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    ctx.drawImage(video, 0, 0)
    canvas.toBlob(async (blob) => {
      if (!blob) return
      const file = new File([blob], `foto-${Date.now()}.jpg`, { type: 'image/jpeg' })
      await uploadFile(file, 'image')
      closeCamera()
    }, 'image/jpeg', 0.92)
  }, [closeCamera])

  // ── Grabar video ──
  const startRecording = useCallback(() => {
    if (!streamRef.current) return
    chunksRef.current = []
    try {
      const recorder = new MediaRecorder(streamRef.current, { mimeType: 'video/webm' })
      recorder.ondataavailable = (ev) => {
        if (ev.data && ev.data.size > 0) chunksRef.current.push(ev.data)
      }
      recorder.onstop = async () => {
        const blob = new Blob(chunksRef.current, { type: 'video/webm' })
        const file = new File([blob], `video-${Date.now()}.webm`, { type: 'video/webm' })
        await uploadFile(file, 'video', recordingTime)
        closeCamera()
      }
      recorder.start()
      recorderRef.current = recorder
      setRecording(true)
      setRecordingTime(0)
      timerRef.current = setInterval(() => {
        setRecordingTime((t) => {
          if (t >= 60) {
            stopRecording()
            return 60
          }
          return t + 1
        })
      }, 1000)
    } catch (e: any) {
      addToast({ type: 'error', title: 'Error al grabar', message: e.message })
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [closeCamera, addToast])

  const stopRecording = useCallback(() => {
    if (recorderRef.current && recorderRef.current.state !== 'inactive') {
      recorderRef.current.stop()
    }
    if (timerRef.current) clearInterval(timerRef.current)
    setRecording(false)
  }, [])

  // ── Upload helper ──
  const uploadFile = useCallback(async (file: File, kind: 'image' | 'video', durationS?: number) => {
    if (media.length >= maxItems) {
      addToast({ type: 'warning', title: 'Máximo superado', message: `Solo ${maxItems} archivos permitidos` })
      return
    }
    setUploading(true)
    const sb = createClient()
    const ext = file.name.split('.').pop()?.toLowerCase() || (kind === 'video' ? 'webm' : 'jpg')
    const timestamp = Date.now()
    const randomId = Math.random().toString(36).slice(2, 8)
    const path = `${pathPrefix}/${kind}_${timestamp}_${randomId}.${ext}`
    const { error } = await sb.storage.from(bucket).upload(path, file, {
      cacheControl: '3600', upsert: false,
    })
    setUploading(false)
    if (error) {
      addToast({ type: 'error', title: 'Error al subir', message: error.message })
      return
    }
    const { data: urlData } = sb.storage.from(bucket).getPublicUrl(path)
    const newItem: MediaItem = {
      url: urlData.publicUrl,
      caption: '',
      uploaded_at: new Date().toISOString(),
      kind,
      mime_type: file.type,
      duration_s: durationS,
    }
    onChange([...media, newItem])
    addToast({ type: 'success', title: `${kind === 'video' ? 'Video' : 'Foto'} guardada` })
  }, [media, onChange, bucket, pathPrefix, maxItems, addToast])

  const handleFiles = useCallback(async (files: FileList | File[]) => {
    if (disabled) return
    const arr = Array.from(files)
    for (const f of arr) {
      if (f.type.startsWith('image/')) await uploadFile(f, 'image')
      else if (f.type.startsWith('video/')) await uploadFile(f, 'video')
      else addToast({ type: 'warning', title: `Formato no soportado: ${f.name}` })
    }
  }, [disabled, uploadFile, addToast])

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    setDragging(false)
    if (disabled) return
    handleFiles(e.dataTransfer.files)
  }, [handleFiles, disabled])

  const handleRemove = useCallback(async (index: number) => {
    if (disabled) return
    const item = media[index]
    try {
      const sb = createClient()
      const urlObj = new URL(item.url)
      const parts = urlObj.pathname.split(`/${bucket}/`)
      if (parts.length === 2) await sb.storage.from(bucket).remove([parts[1]])
    } catch { /* ignore */ }
    onChange(media.filter((_, i) => i !== index))
  }, [media, onChange, bucket, disabled])

  const handleCaptionChange = (index: number, caption: string) => {
    const next = [...media]
    next[index] = { ...next[index], caption }
    onChange(next)
  }

  return (
    <div className="space-y-3">
      {(title || subtitle) && (
        <div>
          {title && <div className="text-sm font-semibold uppercase tracking-wider" style={{ color: 'var(--sat-or)' }}>{title}</div>}
          {subtitle && <div className="text-xs" style={{ color: 'var(--sat-tx2)' }}>{subtitle}</div>}
        </div>
      )}

      {/* Botones de acción */}
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          disabled={disabled || uploading}
          className="flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-semibold transition-colors"
          style={{ background: 'var(--sat-dk3)', color: 'var(--sat-tx)', border: '1px solid var(--sat-br2)', cursor: disabled ? 'not-allowed' : 'pointer' }}
        >
          <Upload size={15} /> Cargar archivo
        </button>
        <button
          type="button"
          onClick={() => openCamera('photo')}
          disabled={disabled || uploading}
          className="flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-semibold transition-colors"
          style={{ background: 'var(--sat-or)', color: 'var(--sat-dk)', border: 'none', cursor: disabled ? 'not-allowed' : 'pointer' }}
        >
          <Camera size={15} /> Sacar foto
        </button>
        <button
          type="button"
          onClick={() => openCamera('video')}
          disabled={disabled || uploading}
          className="flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-semibold transition-colors"
          style={{ background: 'var(--sat-rd)', color: '#fff', border: 'none', cursor: disabled ? 'not-allowed' : 'pointer' }}
        >
          <Video size={15} /> Grabar video
        </button>
        <div className="text-xs flex items-center ml-auto" style={{ color: 'var(--sat-tx3)' }}>
          {media.length} / {maxItems}
          {uploading && <Loader2 size={14} className="ml-2 animate-spin" style={{ color: 'var(--sat-or)' }} />}
        </div>
      </div>

      {/* Input oculto para archivo */}
      <input
        ref={inputRef}
        type="file"
        accept="image/*,video/*"
        multiple
        className="hidden"
        onChange={(e) => e.target.files && handleFiles(e.target.files)}
        disabled={disabled}
      />

      {/* Zona drag & drop */}
      <div
        onDrop={handleDrop}
        onDragOver={(e) => { e.preventDefault(); setDragging(true) }}
        onDragLeave={() => setDragging(false)}
        className="border-2 border-dashed rounded-lg p-3 text-center transition-all"
        style={{
          borderColor: dragging ? 'var(--sat-or)' : 'var(--sat-br2)',
          background: dragging ? 'var(--sat-or-d)' : 'transparent',
          fontSize: 12,
          color: dragging ? 'var(--sat-or)' : 'var(--sat-tx3)',
        }}
      >
        O arrastrá imágenes / videos acá
      </div>

      {/* Modal de cámara */}
      {cameraMode && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.92)', zIndex: 9999, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
          <div className="flex items-center justify-between w-full max-w-4xl mb-3">
            <div className="flex items-center gap-3">
              <span style={{ color: 'var(--sat-or)', fontWeight: 700, fontSize: 14, textTransform: 'uppercase' }}>
                {cameraMode === 'photo' ? '📷 Foto' : '🎥 Video'}
              </span>
              {recording && (
                <span style={{ display: 'flex', alignItems: 'center', gap: 6, color: 'var(--sat-rd)', fontSize: 13, fontWeight: 700 }}>
                  <span style={{ width: 8, height: 8, borderRadius: 50, background: 'var(--sat-rd)', animation: 'pulse 1s infinite' }} />
                  REC {String(Math.floor(recordingTime / 60)).padStart(2, '0')}:{String(recordingTime % 60).padStart(2, '0')} / 01:00
                </span>
              )}
            </div>
            <button
              type="button"
              onClick={closeCamera}
              style={{ background: 'var(--sat-dk3)', color: 'var(--sat-tx)', border: '1px solid var(--sat-br2)', borderRadius: 8, padding: '6px 12px', cursor: 'pointer' }}
            >
              <X size={16} />
            </button>
          </div>
          <video
            ref={videoRef}
            autoPlay
            playsInline
            muted
            style={{ maxWidth: '100%', maxHeight: '70vh', borderRadius: 12, border: '1px solid var(--sat-br)' }}
          />
          <canvas ref={canvasRef} style={{ display: 'none' }} />
          <div className="flex gap-3 mt-4">
            {cameraMode === 'photo' ? (
              <button
                type="button"
                onClick={takePhoto}
                style={{ background: 'var(--sat-or)', color: 'var(--sat-dk)', border: 'none', borderRadius: 50, padding: '14px 28px', fontWeight: 700, fontSize: 15, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 8 }}
              >
                <Camera size={18} /> Tomar foto
              </button>
            ) : recording ? (
              <button
                type="button"
                onClick={stopRecording}
                style={{ background: 'var(--sat-tx3)', color: '#fff', border: 'none', borderRadius: 50, padding: '14px 28px', fontWeight: 700, fontSize: 15, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 8 }}
              >
                <Square size={18} fill="currentColor" /> Detener
              </button>
            ) : (
              <button
                type="button"
                onClick={startRecording}
                style={{ background: 'var(--sat-rd)', color: '#fff', border: 'none', borderRadius: 50, padding: '14px 28px', fontWeight: 700, fontSize: 15, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 8 }}
              >
                <RecordIcon size={18} fill="currentColor" /> Grabar
              </button>
            )}
          </div>
        </div>
      )}

      {/* Grid de media */}
      {media.length > 0 && (
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
          {media.map((m, idx) => {
            const isVideo = m.kind === 'video' || m.mime_type?.startsWith('video/')
            return (
              <div
                key={idx}
                className="relative group rounded-lg overflow-hidden"
                style={{ background: 'var(--sat-dk3)', border: '1px solid var(--sat-br)' }}
              >
                {isVideo ? (
                  <a href={m.url} target="_blank" rel="noreferrer" className="block relative">
                    <video
                      src={m.url}
                      className="w-full aspect-square object-cover"
                      preload="metadata"
                    />
                    <div style={{ position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%, -50%)', background: 'rgba(0,0,0,0.6)', borderRadius: 50, padding: 10 }}>
                      <Play size={20} fill="#fff" color="#fff" />
                    </div>
                    {m.duration_s !== undefined && (
                      <span style={{ position: 'absolute', bottom: 4, right: 4, background: 'rgba(0,0,0,0.7)', color: '#fff', fontSize: 10, padding: '1px 5px', borderRadius: 3, fontFamily: 'ui-monospace, monospace' }}>
                        {String(Math.floor(m.duration_s / 60)).padStart(2, '0')}:{String(m.duration_s % 60).padStart(2, '0')}
                      </span>
                    )}
                  </a>
                ) : (
                  <a href={m.url} target="_blank" rel="noreferrer" className="block">
                    <img
                      src={m.url}
                      alt={m.caption || `Foto ${idx + 1}`}
                      className="w-full aspect-square object-cover"
                      loading="lazy"
                    />
                  </a>
                )}
                {!disabled && (
                  <button
                    type="button"
                    onClick={(e) => { e.stopPropagation(); handleRemove(idx) }}
                    className="absolute top-1 right-1 p-1 rounded-full opacity-0 group-hover:opacity-100 transition-opacity"
                    style={{ background: 'var(--sat-rd)', color: '#fff' }}
                    title="Eliminar"
                  >
                    <X size={12} />
                  </button>
                )}
                <span style={{ position: 'absolute', top: 4, left: 4, background: 'rgba(0,0,0,0.6)', color: '#fff', fontSize: 10, padding: '1px 5px', borderRadius: 3, display: 'flex', alignItems: 'center', gap: 3 }}>
                  {isVideo ? <Film size={10} /> : <ImageIcon size={10} />}
                </span>
                <input
                  type="text"
                  value={m.caption || ''}
                  onChange={(e) => handleCaptionChange(idx, e.target.value)}
                  placeholder="Describir..."
                  disabled={disabled}
                  className="w-full px-2 py-1 text-xs border-0 outline-none"
                  style={{
                    background: 'var(--sat-dk4)', color: 'var(--sat-tx2)',
                    borderTop: '1px solid var(--sat-br)',
                  }}
                />
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
