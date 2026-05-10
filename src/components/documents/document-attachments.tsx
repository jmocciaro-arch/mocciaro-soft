'use client'

/**
 * <DocumentAttachments> — gestión de archivos adjuntos por documento.
 *
 * Se monta debajo de los items de cualquier documento (cotización, pedido,
 * factura, OC) y permite subir archivos categorizados.
 *
 * Categorías destacadas:
 *   - oc_cliente → si hay alguno, aparece el botón especial "Ver OC original"
 *   - pliego, especificaciones, plano, foto, email, firma, otro
 *
 * Soporta:
 *   - Subida por drag-and-drop (Supabase Storage)
 *   - Links externos (Google Drive, Dropbox, OneDrive)
 */

import { useEffect, useState, useCallback, useRef } from 'react'
import {
  Paperclip, Upload, Link2, FileText, Trash2, Download, Eye,
  Loader2, FileBox, ExternalLink, Plus,
} from 'lucide-react'
import { useToast } from '@/components/ui/toast'
import { Button } from '@/components/ui/button'
import { Modal } from '@/components/ui/modal'
import { Input } from '@/components/ui/input'
import { cn } from '@/lib/utils'
import {
  listAttachments, uploadAttachment, addExternalLink, getAttachmentUrl,
  deleteAttachment, CATEGORY_LABELS, formatFileSize, isImage, isPdf,
  type DocumentAttachment, type AttachmentDocType, type AttachmentCategory,
} from '@/lib/document-attachments'

interface Props {
  documentId: string
  documentType: AttachmentDocType
  /** Si es solo lectura, no muestra botones de subir/borrar */
  readOnly?: boolean
  /** Callback al cambiar la lista (útil para refrescar contadores afuera) */
  onChange?: (attachments: DocumentAttachment[]) => void
}

const CATEGORIES: AttachmentCategory[] = [
  'oc_cliente', 'pliego', 'especificaciones', 'plano', 'foto', 'email', 'firma', 'otro',
]

export function DocumentAttachments({ documentId, documentType, readOnly = false, onChange }: Props) {
  const { addToast } = useToast()
  const [attachments, setAttachments] = useState<DocumentAttachment[]>([])
  const [loading, setLoading] = useState(true)
  const [uploading, setUploading] = useState(false)
  const [showLinkModal, setShowLinkModal] = useState(false)
  const [pendingCategory, setPendingCategory] = useState<AttachmentCategory>('oc_cliente')
  const [dragOver, setDragOver] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  // Link modal state
  const [linkName, setLinkName] = useState('')
  const [linkUrl, setLinkUrl] = useState('')

  const reload = useCallback(async () => {
    setLoading(true)
    try {
      const list = await listAttachments(documentType, documentId)
      setAttachments(list)
      onChange?.(list)
    } catch (err) {
      addToast({ type: 'error', title: 'Error cargando adjuntos', message: (err as Error).message })
    } finally {
      setLoading(false)
    }
  }, [documentType, documentId, addToast, onChange])

  useEffect(() => {
    let cancelled = false
    void (async () => {
      if (cancelled) return
      await reload()
    })()
    return () => { cancelled = true }
  }, [reload])

  // ---------------------------------------------------------------
  // UPLOAD
  // ---------------------------------------------------------------
  const handleFiles = useCallback(async (files: FileList | File[], category: AttachmentCategory) => {
    if (!files || files.length === 0) return
    setUploading(true)
    try {
      for (const file of Array.from(files)) {
        await uploadAttachment({ file, documentId, documentType, category })
      }
      addToast({ type: 'success', title: 'Adjuntos subidos', message: `${files.length} archivo(s)` })
      await reload()
    } catch (err) {
      addToast({ type: 'error', title: 'Error subiendo archivo', message: (err as Error).message })
    } finally {
      setUploading(false)
    }
  }, [documentId, documentType, addToast, reload])

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault(); setDragOver(false)
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      void handleFiles(e.dataTransfer.files, pendingCategory)
    }
  }

  const handleAddLink = async () => {
    if (!linkName.trim() || !linkUrl.trim()) {
      addToast({ type: 'warning', title: 'Falta nombre o URL' })
      return
    }
    try {
      await addExternalLink({
        documentType, documentId,
        category: pendingCategory,
        name: linkName,
        url: linkUrl,
      })
      addToast({ type: 'success', title: 'Link agregado' })
      setShowLinkModal(false)
      setLinkName(''); setLinkUrl('')
      await reload()
    } catch (err) {
      addToast({ type: 'error', title: 'Error', message: (err as Error).message })
    }
  }

  const handleOpen = async (att: DocumentAttachment) => {
    try {
      const url = await getAttachmentUrl(att)
      window.open(url, '_blank', 'noopener,noreferrer')
    } catch (err) {
      addToast({ type: 'error', title: 'Error abriendo archivo', message: (err as Error).message })
    }
  }

  const handleDelete = async (att: DocumentAttachment) => {
    if (!confirm(`¿Eliminar el adjunto "${att.name}"?`)) return
    try {
      await deleteAttachment(att)
      addToast({ type: 'success', title: 'Adjunto eliminado' })
      await reload()
    } catch (err) {
      addToast({ type: 'error', title: 'Error', message: (err as Error).message })
    }
  }

  // ---------------------------------------------------------------
  // RENDER
  // ---------------------------------------------------------------
  const ocCliente = attachments.find(a => a.category === 'oc_cliente')
  const grouped = CATEGORIES
    .map(cat => ({ cat, items: attachments.filter(a => a.category === cat) }))
    .filter(g => g.items.length > 0)

  return (
    <div className="rounded-xl border border-[#1E2330] bg-[#141820] p-4 print:hidden">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-xs font-bold text-[#9CA3AF] uppercase tracking-widest flex items-center gap-2">
          <Paperclip size={12} className="text-[#FF6600]" />
          Adjuntos ({attachments.length})
        </h3>
        {!readOnly && (
          <div className="flex items-center gap-1.5">
            <Button variant="outline" size="sm" onClick={() => setShowLinkModal(true)}>
              <Link2 size={12} /> Link externo
            </Button>
            <Button variant="primary" size="sm" onClick={() => fileInputRef.current?.click()} loading={uploading}>
              <Upload size={12} /> Subir archivo
            </Button>
          </div>
        )}
      </div>

      {/* BOTÓN GRANDE — VER OC ORIGINAL (solo si hay) */}
      {ocCliente && (
        <button
          onClick={() => handleOpen(ocCliente)}
          className="w-full mb-3 group relative rounded-lg border-2 border-[#FF6600]/40 bg-gradient-to-r from-[#FF6600]/15 to-[#FF6600]/5 px-4 py-3 hover:border-[#FF6600] transition-all flex items-center gap-3 text-left"
        >
          <div className="w-10 h-10 rounded-lg bg-[#FF6600]/20 flex items-center justify-center shrink-0 text-xl">
            📋
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-[10px] font-bold text-[#FF6600] uppercase tracking-widest">Ver OC original del cliente</p>
            <p className="text-sm font-semibold text-[#F0F2F5] truncate group-hover:text-[#FF6600] transition-colors">
              {ocCliente.name}
            </p>
            <p className="text-[10px] text-[#9CA3AF] flex items-center gap-1.5 mt-0.5">
              {ocCliente.external_url ? (
                <><ExternalLink size={10} /> Link externo</>
              ) : (
                <><FileText size={10} /> {formatFileSize(ocCliente.size_bytes)}</>
              )}
            </p>
          </div>
          <Eye size={18} className="text-[#FF6600] opacity-0 group-hover:opacity-100 transition-opacity" />
        </button>
      )}

      {/* Selector de categoría para próximas subidas */}
      {!readOnly && (
        <div className="mb-3">
          <p className="text-[10px] text-[#6B7280] mb-1.5 uppercase tracking-wider font-medium">
            Categoría para los próximos archivos:
          </p>
          <div className="flex flex-wrap gap-1.5">
            {CATEGORIES.map(cat => {
              const meta = CATEGORY_LABELS[cat]
              const isSelected = pendingCategory === cat
              return (
                <button
                  key={cat}
                  onClick={() => setPendingCategory(cat)}
                  className={cn(
                    'flex items-center gap-1 px-2 py-1 rounded-md text-[11px] font-medium border transition-colors',
                    isSelected ? meta.color : 'text-[#6B7280] bg-[#0F1218] border-[#2A3040] hover:text-[#F0F2F5]'
                  )}
                >
                  <span>{meta.emoji}</span>
                  {meta.label}
                </button>
              )
            })}
          </div>
        </div>
      )}

      {/* Dropzone — solo si no es readonly */}
      {!readOnly && (
        <div
          onDragOver={(e) => { e.preventDefault(); setDragOver(true) }}
          onDragLeave={() => setDragOver(false)}
          onDrop={handleDrop}
          className={cn(
            'rounded-lg border-2 border-dashed px-4 py-3 text-center transition-colors mb-3',
            dragOver
              ? 'border-[#FF6600] bg-[#FF6600]/10'
              : 'border-[#2A3040] bg-[#0F1218]'
          )}
        >
          <input
            ref={fileInputRef}
            type="file"
            multiple
            className="hidden"
            onChange={(e) => e.target.files && handleFiles(e.target.files, pendingCategory)}
          />
          {uploading ? (
            <div className="flex items-center justify-center gap-2 text-xs text-[#9CA3AF]">
              <Loader2 size={14} className="animate-spin" /> Subiendo...
            </div>
          ) : (
            <>
              <Upload size={20} className="mx-auto text-[#6B7280] mb-1.5" />
              <p className="text-xs text-[#9CA3AF]">
                Arrastrá archivos acá o{' '}
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  className="text-[#FF6600] hover:text-[#FF7711] font-medium underline underline-offset-2"
                >
                  elegilos del disco
                </button>
              </p>
              <p className="text-[10px] text-[#6B7280] mt-1">
                Categoría: <span className="font-medium">{CATEGORY_LABELS[pendingCategory].emoji} {CATEGORY_LABELS[pendingCategory].label}</span>
                {' · '}máx 50MB por archivo
              </p>
            </>
          )}
        </div>
      )}

      {/* LISTA AGRUPADA POR CATEGORÍA */}
      {loading ? (
        <div className="flex items-center justify-center py-4 text-xs text-[#6B7280]">
          <Loader2 size={12} className="animate-spin mr-2" /> Cargando...
        </div>
      ) : grouped.length === 0 ? (
        <p className="text-xs text-[#6B7280] italic text-center py-3">
          {readOnly ? 'Sin adjuntos.' : 'Todavía no hay adjuntos. Subí la OC del cliente, pliegos o especificaciones.'}
        </p>
      ) : (
        <div className="space-y-3">
          {grouped.map(({ cat, items }) => {
            const meta = CATEGORY_LABELS[cat]
            return (
              <div key={cat}>
                <div className="flex items-center gap-1.5 mb-1.5">
                  <span className={cn('inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-bold border', meta.color)}>
                    {meta.emoji} {meta.label}
                  </span>
                  <span className="text-[10px] text-[#6B7280]">{items.length}</span>
                </div>
                <div className="space-y-1">
                  {items.map(att => (
                    <AttachmentRow
                      key={att.id}
                      att={att}
                      onOpen={() => handleOpen(att)}
                      onDelete={readOnly ? undefined : () => handleDelete(att)}
                    />
                  ))}
                </div>
              </div>
            )
          })}
        </div>
      )}

      {/* Modal: link externo */}
      <Modal
        isOpen={showLinkModal}
        onClose={() => setShowLinkModal(false)}
        title="Agregar link externo"
        size="md"
      >
        <div className="space-y-4">
          <p className="text-xs text-[#9CA3AF]">
            Útil para archivos grandes que ya están en Drive, Dropbox o OneDrive.
            Categoría: <span className="font-medium">{CATEGORY_LABELS[pendingCategory].emoji} {CATEGORY_LABELS[pendingCategory].label}</span>
          </p>
          <Input
            label="Nombre"
            value={linkName}
            onChange={(e) => setLinkName(e.target.value)}
            placeholder="Ej: OC-12345 Cliente Nordex.pdf"
          />
          <Input
            label="URL"
            value={linkUrl}
            onChange={(e) => setLinkUrl(e.target.value)}
            placeholder="https://drive.google.com/..."
          />
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="secondary" onClick={() => setShowLinkModal(false)}>Cancelar</Button>
            <Button onClick={handleAddLink}><Plus size={12} /> Agregar</Button>
          </div>
        </div>
      </Modal>
    </div>
  )
}

// =====================================================
// Sub-component: Row con preview / acciones
// =====================================================
function AttachmentRow({
  att, onOpen, onDelete,
}: {
  att: DocumentAttachment
  onOpen: () => void
  onDelete?: () => void
}) {
  const Icon = att.external_url ? ExternalLink : isImage(att.mime_type) ? FileBox : isPdf(att.mime_type) ? FileText : Paperclip

  return (
    <div className="group flex items-center gap-2 px-2.5 py-1.5 rounded-md bg-[#0F1218] border border-[#1E2330] hover:border-[#FF6600]/30 transition-colors">
      <Icon size={13} className="text-[#9CA3AF] shrink-0" />
      <div className="flex-1 min-w-0">
        <p className="text-xs font-medium text-[#F0F2F5] truncate">{att.name}</p>
        <p className="text-[10px] text-[#6B7280]">
          {att.external_url
            ? 'Link externo'
            : `${formatFileSize(att.size_bytes)}${att.mime_type ? ` · ${att.mime_type}` : ''}`
          }
          {' · '}
          {new Date(att.created_at).toLocaleDateString('es-AR')}
        </p>
      </div>
      <button
        onClick={onOpen}
        className="text-[#9CA3AF] hover:text-[#FF6600] transition-colors p-1"
        title="Abrir / descargar"
      >
        {att.external_url ? <ExternalLink size={12} /> : <Download size={12} />}
      </button>
      {onDelete && (
        <button
          onClick={onDelete}
          className="text-[#6B7280] hover:text-red-400 opacity-0 group-hover:opacity-100 transition-all p-1"
          title="Eliminar"
        >
          <Trash2 size={12} />
        </button>
      )}
    </div>
  )
}
