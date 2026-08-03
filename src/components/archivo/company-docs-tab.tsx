'use client'

/**
 * Tab "Documentos de empresa" del Archivo.
 * Reutiliza la infraestructura del wizard de empresas: bucket
 * 'company-documents' + API /api/companies/[id]/documents.
 * Requiere migration-v77 aplicada (alinea tt_company_documents al código).
 */

import { useCallback, useEffect, useState } from 'react'
import { Download, Trash2, Upload } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { DOC_KINDS } from '@/lib/schemas/companies'
import { createClient } from '@/lib/supabase/client'
import { useCompanyContext } from '@/lib/company-context'
import { formatFileSize } from '@/lib/document-attachments'

interface CompanyDoc {
  id: string
  doc_kind: string
  label: string
  storage_bucket: string
  storage_path: string
  mime_type: string | null
  size_bytes: number | null
  expires_at: string | null
  created_at: string
}

const kindLabel = (k: string) => k.replace(/_/g, ' ')

export function CompanyDocsTab() {
  const { activeCompanyId, companies } = useCompanyContext()
  const [docs, setDocs] = useState<CompanyDoc[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  // Form de upload
  const [file, setFile] = useState<File | null>(null)
  const [label, setLabel] = useState('')
  const [docKind, setDocKind] = useState<string>('other')
  const [uploading, setUploading] = useState(false)

  const companyName = companies.find((c) => c.id === activeCompanyId)?.name ?? ''

  const load = useCallback(async () => {
    if (!activeCompanyId) return
    setLoading(true)
    setError(null)
    try {
      const res = await fetch(`/api/companies/${activeCompanyId}/documents`)
      const json = await res.json()
      if (!res.ok) throw new Error(json.error ?? 'Error al listar')
      setDocs(json.data ?? [])
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setLoading(false)
    }
  }, [activeCompanyId])

  useEffect(() => { load() }, [load])

  const upload = async () => {
    if (!activeCompanyId || !file || !label.trim()) {
      setError('Falta el archivo o la etiqueta')
      return
    }
    setUploading(true)
    setError(null)
    try {
      const supabase = createClient()
      const path = `${activeCompanyId}/${Date.now()}-${file.name.replace(/[^a-zA-Z0-9.-]/g, '_')}`
      const { error: upErr } = await supabase.storage
        .from('company-documents')
        .upload(path, file, { upsert: false })
      if (upErr) throw new Error(upErr.message)

      const res = await fetch(`/api/companies/${activeCompanyId}/documents`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          doc_kind: docKind,
          label: label.trim(),
          storage_bucket: 'company-documents',
          storage_path: path,
          mime_type: file.type || null,
          size_bytes: file.size,
        }),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error ?? 'Error al registrar el documento')
      setFile(null)
      setLabel('')
      load()
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setUploading(false)
    }
  }

  const download = async (doc: CompanyDoc) => {
    const supabase = createClient()
    const { data, error: sigErr } = await supabase.storage
      .from(doc.storage_bucket)
      .createSignedUrl(doc.storage_path, 3600)
    if (sigErr || !data) { setError(sigErr?.message ?? 'No se pudo generar el link'); return }
    window.open(data.signedUrl, '_blank')
  }

  const remove = async (doc: CompanyDoc) => {
    if (!confirm(`¿Borrar "${doc.label}"?`)) return
    const res = await fetch(`/api/companies/${activeCompanyId}/documents/${doc.id}`, { method: 'DELETE' })
    if (!res.ok) { setError('No se pudo borrar'); return }
    load()
  }

  if (!activeCompanyId) {
    return <p className="text-sm text-[#9CA3AF]">Elegí una empresa activa para ver sus documentos.</p>
  }

  return (
    <div className="space-y-5">
      {/* Upload */}
      <div className="bg-[#141820] border border-[#1E2330] rounded-xl p-4">
        <h3 className="text-sm font-semibold text-[#F0F2F5] mb-3 flex items-center gap-2">
          <Upload size={16} className="text-[#FF6600]" /> Subir documento · {companyName}
        </h3>
        <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
          <input
            type="file"
            onChange={(e) => setFile(e.target.files?.[0] ?? null)}
            className="text-sm text-[#9CA3AF] file:mr-3 file:px-3 file:py-2 file:rounded-lg file:border-0 file:bg-[#1E2330] file:text-[#F0F2F5] file:text-xs file:cursor-pointer"
          />
          <Input placeholder="Etiqueta (ej: Contrato alquiler depósito)" value={label} onChange={(e) => setLabel(e.target.value)} />
          <select
            value={docKind}
            onChange={(e) => setDocKind(e.target.value)}
            className="bg-[#0F1218] border border-[#2A3040] rounded-lg px-3 py-2 text-sm text-[#F0F2F5] capitalize"
          >
            {DOC_KINDS.map((k) => (
              <option key={k} value={k}>{kindLabel(k)}</option>
            ))}
          </select>
          <Button onClick={upload} loading={uploading} disabled={!file || !label.trim()}>
            Subir y registrar
          </Button>
        </div>
        {error && <p className="text-sm text-red-400 mt-2">{error}</p>}
      </div>

      {/* Listado */}
      <div className="bg-[#141820] border border-[#1E2330] rounded-xl overflow-hidden">
        {loading ? (
          <p className="text-sm text-[#9CA3AF] p-4">Cargando…</p>
        ) : docs.length === 0 ? (
          <p className="text-sm text-[#9CA3AF] p-4">No hay documentos de empresa todavía. Subí el primero arriba.</p>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs uppercase tracking-wide text-[#6B7280] border-b border-[#1E2330]">
                <th className="px-4 py-2.5">Documento</th>
                <th className="px-4 py-2.5">Tipo</th>
                <th className="px-4 py-2.5">Tamaño</th>
                <th className="px-4 py-2.5">Vence</th>
                <th className="px-4 py-2.5 text-right">Acciones</th>
              </tr>
            </thead>
            <tbody>
              {docs.map((d) => (
                <tr key={d.id} className="border-b border-[#1E2330]/50 hover:bg-[#1A1F2E]">
                  <td className="px-4 py-2.5 text-[#F0F2F5] font-medium">{d.label}</td>
                  <td className="px-4 py-2.5 text-[#9CA3AF] capitalize">{kindLabel(d.doc_kind)}</td>
                  <td className="px-4 py-2.5 text-[#9CA3AF]">{formatFileSize(d.size_bytes)}</td>
                  <td className="px-4 py-2.5 text-[#9CA3AF]">{d.expires_at ?? '—'}</td>
                  <td className="px-4 py-2.5 text-right">
                    <button onClick={() => download(d)} title="Descargar" className="p-1.5 text-[#9CA3AF] hover:text-[#FF6600]">
                      <Download size={16} />
                    </button>
                    <button onClick={() => remove(d)} title="Borrar" className="p-1.5 text-[#9CA3AF] hover:text-red-400">
                      <Trash2 size={16} />
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
