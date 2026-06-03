'use client'

import { useRef, useState } from 'react'
import Image from 'next/image'
import { Upload, RefreshCw, ImageOff, CheckCircle2, Edit } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { useToast } from '@/components/ui/toast'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'

export type CompanyRow = {
  id: string
  name: string
  logo_url?: string | null
  country?: string | null
  code_prefix?: string | null
  tax_id?: string | null
  default_tax_rate?: number | string | null
  active?: boolean | null
}

interface Props {
  companies: CompanyRow[]
  onUpdated: () => void
  showInactive?: boolean
  onConfigure?: (company: CompanyRow) => void
  onReactivate?: (companyId: string) => void
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

export function CompanyLogosPanel({
  companies, onUpdated, showInactive = false, onConfigure, onReactivate,
}: Props) {
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

  const visible = companies.filter(c => showInactive || c.active !== false)

  return (
    <div className="space-y-2">
      {visible.length === 0 ? (
        <p className="text-sm text-[#6B7280] text-center py-10">
          {companies.length === 0
            ? 'No hay empresas cargadas'
            : 'No hay empresas activas. Activá "Mostrar inactivas" para verlas.'}
        </p>
      ) : (
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {visible.map((c) => {
          const isUploading = uploading === c.id
          const wasJustUploaded = justUploaded === c.id
          const displayUrl = localPreviews[c.id] || (c.logo_url ? bustCache(c.logo_url) : null)
          const flag = COUNTRY_FLAGS[c.country ?? ''] ?? '🏢'
          const isInactive = c.active === false

          return (
            <div
              key={c.id}
              className={`group relative flex flex-col gap-3 p-4 rounded-xl border transition-all ${
                isInactive
                  ? 'bg-[#0A0D12] border-[#2A3040] opacity-70'
                  : 'bg-[#0F1218] border-[#1E2330] hover:border-[#2A3040]'
              }`}
            >
              {/* Header: nombre + badge */}
              <div className="flex items-center gap-2 w-full">
                <span className="text-base shrink-0">{flag}</span>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-[#F0F2F5] truncate">{c.name}</p>
                  {c.code_prefix && (
                    <p className="text-[10px] text-[#4B5563] font-mono">{c.code_prefix}</p>
                  )}
                </div>
                {wasJustUploaded && (
                  <CheckCircle2 size={14} className="text-emerald-400 shrink-0" />
                )}
                {isInactive ? (
                  <Badge variant="default">Inactiva</Badge>
                ) : (
                  <Badge variant="success">Activa</Badge>
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

              {/* Datos compactos */}
              <div className="grid grid-cols-3 gap-2 w-full">
                <div>
                  <p className="text-[10px] text-[#6B7280]">CIF/CUIT</p>
                  <p className="text-[#D1D5DB] text-xs truncate" title={c.tax_id ?? undefined}>{c.tax_id || '-'}</p>
                </div>
                <div>
                  <p className="text-[10px] text-[#6B7280]">País</p>
                  <p className="text-[#D1D5DB] text-xs">{c.country || '-'}</p>
                </div>
                <div>
                  <p className="text-[10px] text-[#6B7280]">IVA</p>
                  <p className="text-[#D1D5DB] text-xs">{c.default_tax_rate ? `${c.default_tax_rate}%` : '-'}</p>
                </div>
              </div>

              {/* Acción principal: Configurar o Reactivar */}
              {isInactive ? (
                <Button
                  variant="ghost"
                  size="sm"
                  className="w-full text-emerald-300 hover:text-emerald-200"
                  onClick={() => onReactivate?.(c.id)}
                >
                  Reactivar empresa
                </Button>
              ) : (
                <Button
                  variant="ghost"
                  size="sm"
                  className="w-full"
                  onClick={() => onConfigure?.(c)}
                >
                  <Edit size={13} /> Configurar
                </Button>
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
      )}
    </div>
  )
}
