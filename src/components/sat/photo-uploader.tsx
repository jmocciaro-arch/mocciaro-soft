'use client'

import { useState, useCallback, useRef } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useToast } from '@/components/ui/toast'
import { Upload, X, Loader2, Image as ImageIcon, Camera } from 'lucide-react'

export interface Photo {
  url: string
  caption?: string
  uploaded_at?: string
  uploaded_by?: string | null
}

interface Props {
  photos: Photo[]
  onChange: (photos: Photo[]) => void
  bucket?: string             // default 'sat-photos'
  pathPrefix: string          // ej: 'assets/<assetId>' o 'tickets/<ticketId>/in'
  maxPhotos?: number          // default 20
  title?: string              // sección header
  subtitle?: string
  disabled?: boolean
}

/**
 * Uploader reutilizable con drag & drop.
 * - Sube a Supabase Storage bucket 'sat-photos' (o el que se pase)
 * - Retorna URLs publicas (el bucket es publico)
 * - Permite caption por foto (click en foto abre modal simple)
 * - Permite eliminar con ✕
 * - Acepta multiples archivos a la vez
 */
export function PhotoUploader({
  photos,
  onChange,
  bucket = 'sat-photos',
  pathPrefix,
  maxPhotos = 20,
  title,
  subtitle,
  disabled,
}: Props) {
  const [uploading, setUploading] = useState(false)
  const [dragging, setDragging] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)
  const { addToast } = useToast()

  const handleFiles = useCallback(async (files: FileList | File[]) => {
    if (disabled) return
    const filesArray = Array.from(files).filter((f) => f.type.startsWith('image/'))
    if (!filesArray.length) {
      addToast({ type: 'warning', title: 'Solo imágenes', message: 'Se aceptan JPG, PNG, WEBP, HEIC' })
      return
    }
    if (photos.length + filesArray.length > maxPhotos) {
      addToast({ type: 'warning', title: 'Máximo superado', message: `Solo ${maxPhotos} fotos permitidas` })
      return
    }

    setUploading(true)
    const sb = createClient()
    const newPhotos: Photo[] = []

    for (const file of filesArray) {
      const ext = file.name.split('.').pop()?.toLowerCase() || 'jpg'
      const timestamp = Date.now()
      const randomId = Math.random().toString(36).slice(2, 8)
      const path = `${pathPrefix}/${timestamp}_${randomId}.${ext}`

      const { error: uploadErr } = await sb.storage.from(bucket).upload(path, file, {
        cacheControl: '3600',
        upsert: false,
      })

      if (uploadErr) {
        console.error('Upload error:', uploadErr)
        addToast({ type: 'error', title: 'Error al subir', message: `${file.name}: ${uploadErr.message}` })
        continue
      }

      const { data: urlData } = sb.storage.from(bucket).getPublicUrl(path)
      newPhotos.push({
        url: urlData.publicUrl,
        caption: '',
        uploaded_at: new Date().toISOString(),
      })
    }

    if (newPhotos.length) {
      onChange([...photos, ...newPhotos])
      addToast({ type: 'success', title: `${newPhotos.length} foto(s) subida(s)` })
    }
    setUploading(false)
  }, [photos, onChange, bucket, pathPrefix, maxPhotos, disabled, addToast])

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    setDragging(false)
    if (disabled) return
    handleFiles(e.dataTransfer.files)
  }, [handleFiles, disabled])

  const handleRemove = useCallback(async (index: number) => {
    if (disabled) return
    const photo = photos[index]
    // Intentar borrar del storage (no crítico si falla)
    try {
      const sb = createClient()
      // Extraer path después del bucket
      const urlObj = new URL(photo.url)
      const parts = urlObj.pathname.split(`/${bucket}/`)
      if (parts.length === 2) {
        await sb.storage.from(bucket).remove([parts[1]])
      }
    } catch (e) {
      // ignorar
    }
    const next = photos.filter((_, i) => i !== index)
    onChange(next)
  }, [photos, onChange, bucket, disabled])

  const handleCaptionChange = (index: number, caption: string) => {
    const next = [...photos]
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

      {/* Drop zone */}
      <div
        onDrop={handleDrop}
        onDragOver={(e) => { e.preventDefault(); setDragging(true) }}
        onDragLeave={() => setDragging(false)}
        onClick={() => !disabled && inputRef.current?.click()}
        className="border-2 border-dashed rounded-lg p-4 text-center cursor-pointer transition-all"
        style={{
          borderColor: dragging ? 'var(--sat-or)' : 'var(--sat-br2)',
          background: dragging ? 'var(--sat-or-d)' : 'var(--sat-dk3)',
          cursor: disabled ? 'not-allowed' : 'pointer',
          opacity: disabled ? 0.5 : 1,
        }}
      >
        <input
          ref={inputRef}
          type="file"
          accept="image/*"
          multiple
          capture="environment"
          className="hidden"
          onChange={(e) => e.target.files && handleFiles(e.target.files)}
          disabled={disabled}
        />
        {uploading ? (
          <div className="flex items-center justify-center gap-2" style={{ color: 'var(--sat-or)' }}>
            <Loader2 size={18} className="animate-spin" /> Subiendo...
          </div>
        ) : (
          <div className="flex items-center justify-center gap-3">
            <Camera size={22} style={{ color: 'var(--sat-tx2)' }} />
            <div>
              <div className="text-sm font-semibold" style={{ color: 'var(--sat-tx) ' }}>
                Tocá para sacar foto o arrastrá imágenes
              </div>
              <div className="text-xs" style={{ color: 'var(--sat-tx3)' }}>
                JPG / PNG / WEBP / HEIC  ·  Máx {maxPhotos} fotos  ·  {photos.length} cargada{photos.length === 1 ? '' : 's'}
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Grid de fotos */}
      {photos.length > 0 && (
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
          {photos.map((p, idx) => (
            <div
              key={idx}
              className="relative group rounded-lg overflow-hidden"
              style={{ background: 'var(--sat-dk3)', border: '1px solid var(--sat-br)' }}
            >
              <a href={p.url} target="_blank" rel="noreferrer" className="block">
                <img
                  src={p.url}
                  alt={p.caption || `Foto ${idx + 1}`}
                  className="w-full aspect-square object-cover"
                  loading="lazy"
                />
              </a>
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
              <input
                type="text"
                value={p.caption || ''}
                onChange={(e) => handleCaptionChange(idx, e.target.value)}
                placeholder="Caption..."
                disabled={disabled}
                className="w-full px-2 py-1 text-xs border-0 outline-none"
                style={{
                  background: 'var(--sat-dk4)',
                  color: 'var(--sat-tx2)',
                  borderTop: '1px solid var(--sat-br)',
                }}
              />
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
