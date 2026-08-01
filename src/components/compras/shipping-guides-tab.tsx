'use client'

import { useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useToast } from '@/components/ui/toast'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Select } from '@/components/ui/select'
import { formatDate } from '@/lib/utils'
import { Truck, Plus, ExternalLink, FileText, Trash2, Loader2, Package, X } from 'lucide-react'

// ----------------------------------------------------------------
// Tipos
// ----------------------------------------------------------------
export type ShippingGuide = {
  id: string
  carrier: string
  tracking_number: string
  pdf_url?: string
  pdf_name?: string
  eta_date?: string
  notes?: string
  added_at: string
}

type Source = 'tt_documents' | 'local'

interface ShippingGuidesTabProps {
  documentId: string
  source: Source
  initialGuides: ShippingGuide[]
}

// ----------------------------------------------------------------
// Carriers soportados
// ----------------------------------------------------------------
const CARRIERS = [
  'DHL Express',
  'DHL Parcel',
  'FedEx',
  'UPS',
  'TNT',
  'GLS',
  'Seur',
  'Correo Argentino',
  'Otro',
]

const CARRIER_COLORS: Record<string, string> = {
  'DHL Express': '#FFCC00',
  'DHL Parcel': '#FFCC00',
  FedEx: '#4D148C',
  UPS: '#351C15',
  TNT: '#FF6600',
  GLS: '#0066CC',
  Seur: '#FF6600',
  'Correo Argentino': '#005FAB',
  Otro: '#6B7280',
}

const CARRIER_TEXT_COLORS: Record<string, string> = {
  'DHL Express': '#000000',
  'DHL Parcel': '#000000',
  FedEx: '#ffffff',
  UPS: '#ffffff',
  TNT: '#ffffff',
  GLS: '#ffffff',
  Seur: '#ffffff',
  'Correo Argentino': '#ffffff',
  Otro: '#ffffff',
}

function getTrackingUrl(carrier: string, trackingNumber: string): string {
  const num = encodeURIComponent(trackingNumber.trim())
  switch (carrier) {
    case 'DHL Express':
      return `https://www.dhl.com/tracking/express?tracking-id=${num}`
    case 'DHL Parcel':
      return `https://www.dhl.com/tracking/parcel?tracking-id=${num}`
    case 'FedEx':
      return `https://www.fedex.com/apps/fedextrack/?action=track&tracknumbers=${num}`
    case 'UPS':
      return `https://www.ups.com/track?loc=es&tracknum=${num}`
    case 'TNT':
      return `https://www.tnt.com/express/es_es/site/herramientas-envio/seguimiento.html?searchType=CON&cons=${num}`
    case 'GLS':
      return `https://gls-group.eu/track?match=${num}`
    case 'Seur':
      return `https://www.seur.com/livetracking/?segOnlineIdentifier=${num}`
    case 'Correo Argentino':
      return `https://www.correoargentino.com.ar/formularios/rte?id=${num}`
    default:
      return ''
  }
}

// ----------------------------------------------------------------
// Componente
// ----------------------------------------------------------------
export function ShippingGuidesTab({ documentId, source, initialGuides }: ShippingGuidesTabProps) {
  const { addToast } = useToast()
  const supabase = createClient()

  const [guides, setGuides] = useState<ShippingGuide[]>(initialGuides)
  const [showForm, setShowForm] = useState(false)
  const [saving, setSaving] = useState(false)
  const [uploadingPdf, setUploadingPdf] = useState(false)
  const [deletingId, setDeletingId] = useState<string | null>(null)

  const [form, setForm] = useState({
    carrier: 'DHL Express',
    tracking_number: '',
    eta_date: '',
    notes: '',
    pdf_url: '',
    pdf_name: '',
  })

  async function persistGuides(newGuides: ShippingGuide[]) {
    const table = source === 'local' ? 'tt_purchase_orders' : 'tt_documents'
    const { error } = await supabase
      .from(table)
      .update({ metadata: { shipping_guides: newGuides } })
      .eq('id', documentId)
    if (error) throw new Error(error.message)
  }

  async function handlePdfUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    setUploadingPdf(true)
    try {
      const safeName = file.name.replace(/[^\w.-]/g, '_')
      const path = `documents/${documentId}/guides/${Date.now()}_${safeName}`
      const { error: uploadError } = await supabase.storage
        .from('attachments')
        .upload(path, file, { upsert: true })
      if (uploadError) throw new Error(uploadError.message)
      const { data: signed } = await supabase.storage
        .from('attachments')
        .createSignedUrl(path, 60 * 60 * 24 * 365)
      if (!signed?.signedUrl) throw new Error('No se pudo obtener la URL firmada')
      setForm(f => ({ ...f, pdf_url: signed.signedUrl, pdf_name: file.name }))
      addToast({ type: 'success', title: 'PDF cargado', message: file.name })
    } catch (err) {
      addToast({ type: 'error', title: 'Error al subir PDF', message: (err as Error).message })
    }
    setUploadingPdf(false)
  }

  async function handleSave() {
    if (!form.tracking_number.trim()) {
      addToast({ type: 'warning', title: 'El número de guía es obligatorio' })
      return
    }
    setSaving(true)
    try {
      const newGuide: ShippingGuide = {
        id: crypto.randomUUID(),
        carrier: form.carrier,
        tracking_number: form.tracking_number.trim(),
        eta_date: form.eta_date || undefined,
        notes: form.notes.trim() || undefined,
        pdf_url: form.pdf_url || undefined,
        pdf_name: form.pdf_name || undefined,
        added_at: new Date().toISOString(),
      }
      const updated = [...guides, newGuide]
      await persistGuides(updated)
      setGuides(updated)
      setShowForm(false)
      setForm({ carrier: 'DHL Express', tracking_number: '', eta_date: '', notes: '', pdf_url: '', pdf_name: '' })
      addToast({ type: 'success', title: 'Guía cargada', message: `${form.carrier} — ${form.tracking_number}` })
    } catch (err) {
      addToast({ type: 'error', title: 'Error al guardar', message: (err as Error).message })
    }
    setSaving(false)
  }

  async function handleDelete(id: string) {
    setDeletingId(id)
    try {
      const updated = guides.filter(g => g.id !== id)
      await persistGuides(updated)
      setGuides(updated)
      addToast({ type: 'success', title: 'Guía eliminada' })
    } catch (err) {
      addToast({ type: 'error', title: 'Error', message: (err as Error).message })
    }
    setDeletingId(null)
  }

  return (
    <div className="bg-[#141820] rounded-xl border border-[#2A3040] p-5 space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Truck size={16} className="text-[#FF6600]" />
          <h3 className="text-sm font-semibold text-[#F0F2F5]">Guías de Envío</h3>
          {guides.length > 0 && (
            <span className="text-xs px-2 py-0.5 rounded-full bg-[#FF6600]/10 text-[#FF6600] font-medium">
              {guides.length}
            </span>
          )}
        </div>
        {!showForm && (
          <Button variant="primary" size="sm" onClick={() => setShowForm(true)}>
            <Plus size={14} /> Agregar guía
          </Button>
        )}
      </div>

      {/* Formulario nueva guía */}
      {showForm && (
        <div className="p-4 rounded-xl border border-[#FF6600]/30 bg-[#FF6600]/5 space-y-4">
          <div className="flex items-center justify-between">
            <h4 className="text-sm font-semibold text-[#FF6600]">Nueva guía de envío</h4>
            <button
              onClick={() => { setShowForm(false); setForm({ carrier: 'DHL Express', tracking_number: '', eta_date: '', notes: '', pdf_url: '', pdf_name: '' }) }}
              className="text-[#6B7280] hover:text-[#F0F2F5]"
            >
              <X size={16} />
            </button>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <Select
              label="Courier *"
              value={form.carrier}
              onChange={e => setForm(f => ({ ...f, carrier: e.target.value }))}
              options={CARRIERS.map(c => ({ value: c, label: c }))}
            />
            <Input
              label="Número de guía *"
              value={form.tracking_number}
              onChange={e => setForm(f => ({ ...f, tracking_number: e.target.value }))}
              placeholder="Ej: 1234567890"
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <Input
              label="ETA estimada (opcional)"
              type="date"
              value={form.eta_date}
              onChange={e => setForm(f => ({ ...f, eta_date: e.target.value }))}
            />
            <Input
              label="Notas (opcional)"
              value={form.notes}
              onChange={e => setForm(f => ({ ...f, notes: e.target.value }))}
              placeholder="Observaciones sobre el envío..."
            />
          </div>

          {/* PDF upload */}
          <div>
            <p className="text-xs font-medium text-[#9CA3AF] mb-2">PDF de la guía (opcional)</p>
            {form.pdf_url ? (
              <div className="flex items-center gap-3 p-3 rounded-lg bg-[#0F1218] border border-[#1E2330]">
                <FileText size={16} className="text-[#FF6600] shrink-0" />
                <a
                  href={form.pdf_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-sm text-[#FF6600] hover:underline truncate flex-1"
                >
                  {form.pdf_name}
                </a>
                <button
                  onClick={() => setForm(f => ({ ...f, pdf_url: '', pdf_name: '' }))}
                  className="text-[#6B7280] hover:text-red-400"
                >
                  <X size={14} />
                </button>
              </div>
            ) : (
              <div className="border-2 border-dashed border-[#2A3040] rounded-xl p-4 text-center hover:border-[#FF6600]/30 transition-colors">
                <input
                  type="file"
                  id="guide-pdf-upload"
                  className="hidden"
                  accept=".pdf"
                  onChange={handlePdfUpload}
                />
                <label htmlFor="guide-pdf-upload" className="cursor-pointer">
                  {uploadingPdf ? (
                    <Loader2 size={24} className="mx-auto mb-1 text-[#FF6600] animate-spin" />
                  ) : (
                    <FileText size={24} className="mx-auto mb-1 text-[#4B5563]" />
                  )}
                  <p className="text-xs text-[#9CA3AF]">
                    {uploadingPdf ? 'Subiendo PDF...' : 'Subir PDF de la guía'}
                  </p>
                </label>
              </div>
            )}
          </div>

          {/* Vista previa de link de tracking */}
          {form.tracking_number && getTrackingUrl(form.carrier, form.tracking_number) && (
            <div className="flex items-center gap-2 p-2 rounded-lg bg-[#0F1218] border border-[#1E2330]">
              <ExternalLink size={12} className="text-[#6B7280] shrink-0" />
              <span className="text-xs text-[#6B7280] truncate">
                Link de tracking:{' '}
                <a
                  href={getTrackingUrl(form.carrier, form.tracking_number)}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-[#FF6600] hover:underline"
                >
                  {form.carrier} — {form.tracking_number}
                </a>
              </span>
            </div>
          )}

          <div className="flex justify-end gap-2 pt-1">
            <Button
              variant="secondary"
              size="sm"
              onClick={() => { setShowForm(false); setForm({ carrier: 'DHL Express', tracking_number: '', eta_date: '', notes: '', pdf_url: '', pdf_name: '' }) }}
            >
              Cancelar
            </Button>
            <Button variant="primary" size="sm" onClick={handleSave} loading={saving}>
              <Truck size={14} /> Guardar guía
            </Button>
          </div>
        </div>
      )}

      {/* Lista de guías */}
      {guides.length === 0 && !showForm ? (
        <div className="text-center py-10 text-[#4B5563]">
          <Package size={36} className="mx-auto mb-3 opacity-30" />
          <p className="text-sm">No hay guías de envío cargadas</p>
          <p className="text-xs mt-1">
            Cargá el número de guía DHL u otro courier para hacer seguimiento del envío
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {guides.map(guide => {
            const trackingUrl = getTrackingUrl(guide.carrier, guide.tracking_number)
            const bgColor = CARRIER_COLORS[guide.carrier] || '#6B7280'
            const textColor = CARRIER_TEXT_COLORS[guide.carrier] || '#ffffff'
            const isDeleting = deletingId === guide.id

            return (
              <div
                key={guide.id}
                className="p-4 rounded-xl bg-[#0F1218] border border-[#1E2330] space-y-3"
              >
                <div className="flex items-start gap-3">
                  {/* Carrier badge */}
                  <span
                    className="text-[10px] font-bold px-2 py-1 rounded-md shrink-0 mt-0.5"
                    style={{ backgroundColor: bgColor, color: textColor }}
                  >
                    {guide.carrier}
                  </span>

                  <div className="flex-1 min-w-0">
                    {/* Número de guía */}
                    <p className="text-sm font-mono font-bold text-[#F0F2F5]">
                      {guide.tracking_number}
                    </p>

                    {/* ETA */}
                    {guide.eta_date && (
                      <p className="text-xs text-emerald-400 mt-0.5 flex items-center gap-1">
                        <span className="font-semibold">ETA:</span>
                        {formatDate(guide.eta_date)}
                      </p>
                    )}

                    {/* Notas */}
                    {guide.notes && (
                      <p className="text-xs text-[#6B7280] mt-1">{guide.notes}</p>
                    )}

                    <p className="text-[10px] text-[#4B5563] mt-1">
                      Cargada {formatDate(guide.added_at)}
                    </p>
                  </div>

                  {/* Acciones */}
                  <div className="flex items-center gap-2 shrink-0">
                    {trackingUrl && (
                      <a
                        href={trackingUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                      >
                        <Button variant="primary" size="sm" className="text-xs">
                          <ExternalLink size={13} /> Rastrear
                        </Button>
                      </a>
                    )}
                    {guide.pdf_url && (
                      <a
                        href={guide.pdf_url}
                        target="_blank"
                        rel="noopener noreferrer"
                      >
                        <Button variant="secondary" size="sm" className="text-xs">
                          <FileText size={13} /> PDF
                        </Button>
                      </a>
                    )}
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => handleDelete(guide.id)}
                      loading={isDeleting}
                    >
                      <Trash2 size={14} className="text-red-400" />
                    </Button>
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
