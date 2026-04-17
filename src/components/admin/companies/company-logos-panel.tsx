'use client'

import { useRef, useState } from 'react'
import Image from 'next/image'
import { Upload, RefreshCw, ImageOff, CheckCircle2 } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { useToast } from '@/components/ui/toast'

type CompanyRow = {
  id: string
  name: string
  logo_url?: string | null
  country?: string | null
  code_prefix?: string | null
}

interface Props {
  companies: CompanyRow[]
  onUpdated: () => void
}

const COUNTRY_FLAGS: Record<string, string> = {
  AR: '🇦🇷',
  ES: '🇪🇸',
  US: '🇺🇸',
  UY: '🇺🇾',
  CL: '🇨🇱',
  BR: '🇧🇷',
  MX: '🇲🇽',
}

// Agrega timestamp a la URL pública para forzar recarga del caché del browser
function bustCache(url: string) {
  return `${url}?t=${Date.now()}`
}

export function CompanyLogosPanel({ companies, onUpdated }: Props) {
  const supabase = createClient()
  const { addToast } = useToast()

  const [uploading, setUploading] = useState<string | null>(null)
  const [justUploaded, setJustUploaded] = useState<string | null>(null)
  // Mapa de previsualización local para refrescar sin esperar al reload
  const [localPreviews, setLocalPreviews] = useState<Record<string, string>>({})
  const inputRefs = useRef<Record<string, HTMLInputElement | null>>({})

  const triggerInput = (companyId: string) => {
    inputRefs.current[companyId]?.click()
  }

  const handleFile = async (companyId: string, file: File | null) => {
    if (!file) return

    // Validación básica
    if (!file.type.startsWith('image/')) {
      addToast({ type: 'warning', title: 'Solo se aceptan imágenes (PNG, JPG, SVG)' })
      return
    }
    if (file.size > 5 * 1024 * 1024) {
      addToast({ type: 'warning', title: 'El archivo supera 5 MB' })
      return
    }

    // Preview local inmediato
    const localUrl = URL.createObjectURL(file)
    setLocalPreviews((prev) => ({ ...prev, [companyId]: localUrl }))

    setUploading(companyId)
    try {
      const ext = file.name.split('.').pop()?.toLowerCase() || 'png'
      const storagePath = `by-id/${companyId}/logo.${ext}`

      // Upload a Supabase Storage con upsert
      const { error: uploadErr } = await supabase.storage
        .from('company-logos')
        .upload(storagePath, file, { upsert: true, contentType: file.type })

      if (uploadErr) throw uploadErr

      // URL pública
      const { data: { publicUrl } } = supabase.storage
        .from('company-logos')
        .getPublicUrl(storagePath)

      // Actualizar logo_url en DB
      const { error: dbErr } = await supabase
        .from('tt_companies')
        .update({ logo_url: publicUrl })
        .eq('id', companyId)

      if (dbErr) throw dbErr

      setJustUploaded(companyId)
      setTimeout(() => setJustUploaded(null), 3000)
      addToast({ type: 'success', title: 'Logo actualizado correctamente' })
      onUpdated()
    } catch (e) {
      // Revertir preview local si falló
      setLocalPreviews((prev) => {
        const next = { ...prev }
        delete next[companyId]
        return next
      })
      addToast({
        type: 'error',
        title: 'Error subiendo logo',
        message: e instanceof Error ? e.message : 'Error desconocido',
      })
    } finally {
      setUploading(false as unknown as string)
      setUploading(null)
    }
  }

  return (
    <div className="space-y-2">
      <p className="text-[11px] font-semibold uppercase tracking-wider text-[#6B7280] mb-4">
        Logos de empresas — clic en la imagen o en el botón para reemplazar
      </p>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {companies.map((c) => {
          const isUploading = uploading === c.id
          const wasJustUploaded = justUploaded === c.id
          const displayUrl = localPreviews[c.id] || (c.logo_url ? bustCache(c.logo_url) : null)
          const flag = COUNTRY_FLAGS[c.country ?? ''] ?? '🏢'

          return (
            <div
              key={c.id}
              className="group relative flex flex-col items-center gap-3 p-4 rounded-xl bg-[#0F1218] border border-[#1E2330] hover:border-[#2A3040] transition-all"
            >
              {/* Nombre empresa */}
              <div className="flex items-center gap-1.5 w-full">
                <span className="text-base">{flag}</span>
                <div>
                  <p className="text-xs font-semibold text-[#F0F2F5] truncate max-w-[150px]">{c.name}</p>
                  {c.code_prefix && (
                    <p className="text-[10px] text-[#4B5563] font-mono">{c.code_prefix}</p>
                  )}
                </div>
                {wasJustUploaded && (
                  <CheckCircle2 size={14} className="ml-auto text-emerald-400 shrink-0" />
                )}
              </div>

              {/* Logo preview — click para reemplazar */}
              <button
                type="button"
                onClick={() => triggerInput(c.id)}
                disabled={isUploading}
                className="relative w-full h-28 rounded-lg bg-[#1A2030] border-2 border-dashed border-[#2A3040] hover:border-orange-500/50 transition-colors flex items-center justify-center overflow-hidden cursor-pointer group/img"
                title="Clic para cambiar logo"
              >
                {displayUrl ? (
                  <>
                    <Image
                      src={displayUrl}
                      alt={`Logo ${c.name}`}
                      fill
                      className="object-contain p-2"
                      unoptimized
                    />
                    {/* Overlay hover */}
                    <div className="absolute inset-0 bg-black/60 opacity-0 group-hover/img:opacity-100 transition-opacity flex items-center justify-center rounded-lg">
                      <div className="flex flex-col items-center gap-1">
                        <Upload size={18} className="text-white" />
                        <span className="text-white text-[10px] font-medium">Cambiar logo</span>
                      </div>
                    </div>
                  </>
                ) : (
                  <div className="flex flex-col items-center gap-2 text-[#4B5563]">
                    <ImageOff size={28} />
                    <span className="text-[10px]">Sin logo</span>
                  </div>
                )}

                {/* Spinner de carga */}
                {isUploading && (
                  <div className="absolute inset-0 bg-black/70 flex items-center justify-center rounded-lg">
                    <RefreshCw size={20} className="text-orange-400 animate-spin" />
                  </div>
                )}
              </button>

              {/* Botón explícito de upload */}
              <button
                type="button"
                onClick={() => triggerInput(c.id)}
                disabled={isUploading}
                className="w-full flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-lg text-[11px] font-medium bg-[#1E2330] hover:bg-[#2A3040] text-[#9CA3AF] hover:text-[#F0F2F5] transition-all disabled:opacity-50 disabled:cursor-not-allowed border border-[#2A3040]"
              >
                {isUploading ? (
                  <>
                    <RefreshCw size={12} className="animate-spin" />
                    Subiendo…
                  </>
                ) : (
                  <>
                    <Upload size={12} />
                    Subir nuevo logo
                  </>
                )}
              </button>

              {/* URL actual (tooltip en hover) */}
              {c.logo_url && (
                <p className="text-[9px] text-[#374151] truncate w-full text-center" title={c.logo_url}>
                  {c.logo_url.split('/').slice(-2).join('/')}
                </p>
              )}

              {/* Input file oculto */}
              <input
                ref={(el) => { inputRefs.current[c.id] = el }}
                type="file"
                accept="image/png,image/jpeg,image/jpg,image/svg+xml,image/webp"
                className="hidden"
                onChange={(e) => handleFile(c.id, e.target.files?.[0] ?? null)}
                // Limpiar value para poder subir el mismo archivo de nuevo
                onClick={(e) => { (e.target as HTMLInputElement).value = '' }}
              />
            </div>
          )
        })}
      </div>
    </div>
  )
}
