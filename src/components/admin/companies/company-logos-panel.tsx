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
  logo_iso_url?: string | null
  country?: string | null
  code_prefix?: string | null
  tax_id?: string | null
  default_tax_rate?: number | string | null
  active?: boolean | null
}

type LogoKind = 'logo' | 'iso'

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

  const [uploading, setUploading] = useState<string | null>(null) // formato: `${companyId}:${kind}`
  const [justUploaded, setJustUploaded] = useState<string | null>(null)
  // Mapa de previsualización local para refrescar sin esperar al reload (key: `${companyId}:${kind}`)
  const [localPreviews, setLocalPreviews] = useState<Record<string, string>>({})
  const inputRefs = useRef<Record<string, HTMLInputElement | null>>({})

  const slotKey = (companyId: string, kind: LogoKind) => `${companyId}:${kind}`

  const triggerInput = (companyId: string, kind: LogoKind) => {
    inputRefs.current[slotKey(companyId, kind)]?.click()
  }

  const handleFile = async (companyId: string, kind: LogoKind, file: File | null) => {
    if (!file) return
    const sk = slotKey(companyId, kind)

    if (!file.type.startsWith('image/')) {
      addToast({ type: 'warning', title: 'Solo se aceptan imágenes (PNG, JPG, SVG)' })
      return
    }
    if (file.size > 5 * 1024 * 1024) {
      addToast({ type: 'warning', title: 'El archivo supera 5 MB' })
      return
    }

    const localUrl = URL.createObjectURL(file)
    setLocalPreviews((prev) => ({ ...prev, [sk]: localUrl }))

    setUploading(sk)
    try {
      const ext = file.name.split('.').pop()?.toLowerCase() || 'png'
      const filename = kind === 'iso' ? 'iso' : 'logo'
      const storagePath = `by-id/${companyId}/${filename}.${ext}`

      const { error: uploadErr } = await supabase.storage
        .from('company-logos')
        .upload(storagePath, file, { upsert: true, contentType: file.type })

      if (uploadErr) throw uploadErr

      const { data: { publicUrl } } = supabase.storage
        .from('company-logos')
        .getPublicUrl(storagePath)

      const dbField = kind === 'iso' ? 'logo_iso_url' : 'logo_url'
      const { error: dbErr } = await supabase
        .from('tt_companies')
        .update({ [dbField]: publicUrl })
        .eq('id', companyId)

      if (dbErr) throw dbErr

      setJustUploaded(sk)
      setTimeout(() => setJustUploaded(null), 3000)
      addToast({ type: 'success', title: kind === 'iso' ? 'Isotipo actualizado' : 'Logotipo actualizado' })
      onUpdated()
    } catch (e) {
      setLocalPreviews((prev) => { const n = { ...prev }; delete n[sk]; return n })
      addToast({
        type: 'error',
        title: 'Error subiendo logo',
        message: e instanceof Error ? e.message : 'Error desconocido',
      })
    } finally {
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
          const flag = COUNTRY_FLAGS[c.country ?? ''] ?? '🏢'
          const isInactive = c.active === false

          const renderSlot = (kind: LogoKind, sourceUrl: string | null | undefined, label: string, aspect: 'wide' | 'square') => {
            const sk = slotKey(c.id, kind)
            const isUploading = uploading === sk
            const wasJustUploaded = justUploaded === sk
            const displayUrl = localPreviews[sk] || (sourceUrl ? bustCache(sourceUrl) : null)
            return (
              <div className="flex flex-col gap-1 flex-1 min-w-0">
                <div className="flex items-center justify-between">
                  <span className="text-[10px] uppercase tracking-wider text-[#6B7280]">{label}</span>
                  {wasJustUploaded && <CheckCircle2 size={12} className="text-emerald-400 shrink-0" />}
                </div>
                <button
                  type="button"
                  onClick={() => triggerInput(c.id, kind)}
                  disabled={isUploading}
                  className={`relative w-full rounded-lg bg-[#1A2030] border-2 border-dashed border-[#2A3040] hover:border-orange-500/50 transition-colors flex items-center justify-center overflow-hidden cursor-pointer group/img ${
                    aspect === 'square' ? 'aspect-square' : 'h-24'
                  }`}
                  title={`Clic para cambiar ${label.toLowerCase()}`}
                >
                  {displayUrl ? (
                    <>
                      <Image src={displayUrl} alt={`${label} ${c.name}`} fill className="object-contain p-2" unoptimized />
                      <div className="absolute inset-0 bg-black/60 opacity-0 group-hover/img:opacity-100 transition-opacity flex items-center justify-center rounded-lg">
                        <div className="flex flex-col items-center gap-1">
                          <Upload size={16} className="text-white" />
                          <span className="text-white text-[9px] font-medium">Cambiar</span>
                        </div>
                      </div>
                    </>
                  ) : (
                    <div className="flex flex-col items-center gap-1 text-[#4B5563]">
                      <ImageOff size={20} />
                      <span className="text-[9px]">Sin {label.toLowerCase()}</span>
                    </div>
                  )}
                  {isUploading && (
                    <div className="absolute inset-0 bg-black/70 flex items-center justify-center rounded-lg">
                      <RefreshCw size={18} className="text-orange-400 animate-spin" />
                    </div>
                  )}
                </button>
              </div>
            )
          }

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
                {isInactive ? (
                  <Badge variant="default">Inactiva</Badge>
                ) : (
                  <Badge variant="success">Activa</Badge>
                )}
              </div>

              {/* Logotipo (con nombre) + Isotipo (cuadrado) */}
              <div className="flex gap-2 items-stretch">
                {renderSlot('logo', c.logo_url, 'Logotipo', 'wide')}
                {renderSlot('iso', c.logo_iso_url, 'Isotipo', 'square')}
              </div>

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

              {/* Inputs file ocultos — uno por tipo */}
              <input
                ref={(el) => { inputRefs.current[slotKey(c.id, 'logo')] = el }}
                type="file"
                accept="image/png,image/jpeg,image/jpg,image/svg+xml,image/webp"
                className="hidden"
                onChange={(e) => handleFile(c.id, 'logo', e.target.files?.[0] ?? null)}
                onClick={(e) => { (e.target as HTMLInputElement).value = '' }}
              />
              <input
                ref={(el) => { inputRefs.current[slotKey(c.id, 'iso')] = el }}
                type="file"
                accept="image/png,image/jpeg,image/jpg,image/svg+xml,image/webp"
                className="hidden"
                onChange={(e) => handleFile(c.id, 'iso', e.target.files?.[0] ?? null)}
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
