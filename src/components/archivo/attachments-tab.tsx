'use client'

/**
 * Tab "Adjuntos de operaciones" del Archivo.
 * Lista cross-módulo de tt_document_attachments (OCs de clientes, pliegos,
 * planos, firmas...) vía /api/archivo/attachments, con salto al documento
 * padre. Solo lectura: los adjuntos se cargan desde cada operación.
 */

import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import { Download, ExternalLink } from 'lucide-react'
import { useCompanyContext } from '@/lib/company-context'
import { getAttachmentUrl, formatFileSize, type DocumentAttachment } from '@/lib/document-attachments'

interface AttachmentRow extends DocumentAttachment {
  parent_doc_type: string
  parent_system_code: string
}

const CATEGORIES = [
  { value: '', label: 'Todas las categorías' },
  { value: 'oc_cliente', label: 'OC del cliente' },
  { value: 'pliego', label: 'Pliego' },
  { value: 'especificaciones', label: 'Especificaciones' },
  { value: 'plano', label: 'Plano' },
  { value: 'foto', label: 'Foto' },
  { value: 'email', label: 'Email' },
  { value: 'firma', label: 'Firma' },
  { value: 'otro', label: 'Otro' },
]

export function AttachmentsTab() {
  const { activeCompanyId } = useCompanyContext()
  const [rows, setRows] = useState<AttachmentRow[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [category, setCategory] = useState('')
  const [q, setQ] = useState('')

  const load = useCallback(async () => {
    if (!activeCompanyId) return
    setLoading(true)
    setError(null)
    try {
      const params = new URLSearchParams({ companyId: activeCompanyId })
      if (category) params.set('category', category)
      if (q.trim()) params.set('q', q.trim())
      const res = await fetch(`/api/archivo/attachments?${params}`)
      const json = await res.json()
      if (!res.ok) throw new Error(json.error ?? 'Error al listar adjuntos')
      setRows(json.data ?? [])
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setLoading(false)
    }
  }, [activeCompanyId, category, q])

  useEffect(() => {
    // Debounce para la búsqueda de texto
    const t = setTimeout(load, 300)
    return () => clearTimeout(t)
  }, [load])

  const download = async (att: AttachmentRow) => {
    try {
      const url = await getAttachmentUrl(att)
      window.open(url, '_blank')
    } catch (e) {
      setError((e as Error).message)
    }
  }

  if (!activeCompanyId) {
    return <p className="text-sm text-[#9CA3AF]">Elegí una empresa activa para ver sus adjuntos.</p>
  }

  return (
    <div className="space-y-4">
      {/* Filtros */}
      <div className="flex flex-col sm:flex-row gap-3">
        <input
          placeholder="Buscar por nombre o n° de documento…"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          className="flex-1 bg-[#0F1218] border border-[#2A3040] rounded-lg px-3 py-2 text-sm text-[#F0F2F5] placeholder:text-[#4B5563] focus:border-[#FF6600] outline-none"
        />
        <select
          value={category}
          onChange={(e) => setCategory(e.target.value)}
          className="bg-[#0F1218] border border-[#2A3040] rounded-lg px-3 py-2 text-sm text-[#F0F2F5]"
        >
          {CATEGORIES.map((c) => (
            <option key={c.value} value={c.value}>{c.label}</option>
          ))}
        </select>
      </div>

      {error && <p className="text-sm text-red-400">{error}</p>}

      {/* Listado */}
      <div className="bg-[#141820] border border-[#1E2330] rounded-xl overflow-hidden">
        {loading ? (
          <p className="text-sm text-[#9CA3AF] p-4">Cargando…</p>
        ) : rows.length === 0 ? (
          <p className="text-sm text-[#9CA3AF] p-4">
            No hay adjuntos para esta empresa{category || q ? ' con esos filtros' : ''}. Los adjuntos se cargan desde cada operación (ej: importar OC en el cotizador).
          </p>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs uppercase tracking-wide text-[#6B7280] border-b border-[#1E2330]">
                <th className="px-4 py-2.5">Archivo</th>
                <th className="px-4 py-2.5">Categoría</th>
                <th className="px-4 py-2.5">Documento</th>
                <th className="px-4 py-2.5">Tamaño</th>
                <th className="px-4 py-2.5">Fecha</th>
                <th className="px-4 py-2.5 text-right">Acciones</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id} className="border-b border-[#1E2330]/50 hover:bg-[#1A1F2E]">
                  <td className="px-4 py-2.5 text-[#F0F2F5] font-medium max-w-[320px] truncate" title={r.name}>{r.name}</td>
                  <td className="px-4 py-2.5">
                    <span className="text-xs px-2 py-0.5 rounded-full bg-[#1E2330] text-[#9CA3AF]">
                      {CATEGORIES.find((c) => c.value === r.category)?.label ?? r.category}
                    </span>
                  </td>
                  <td className="px-4 py-2.5">
                    <Link href={`/documentos/${r.document_id}`} className="text-[#FF6600] hover:underline inline-flex items-center gap-1">
                      {r.parent_system_code || r.parent_doc_type}
                      <ExternalLink size={12} />
                    </Link>
                  </td>
                  <td className="px-4 py-2.5 text-[#9CA3AF]">{formatFileSize(r.size_bytes)}</td>
                  <td className="px-4 py-2.5 text-[#9CA3AF]">{new Date(r.created_at).toLocaleDateString('es-AR')}</td>
                  <td className="px-4 py-2.5 text-right">
                    <button onClick={() => download(r)} title="Descargar" className="p-1.5 text-[#9CA3AF] hover:text-[#FF6600]">
                      <Download size={16} />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  )
}
