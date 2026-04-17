'use client'

import { useEffect, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { DOC_KINDS } from '@/lib/schemas/companies'
import { createClient } from '@/lib/supabase/client'

type Doc = {
  id: string
  doc_kind: string
  label: string
  storage_path: string
  issued_at: string | null
  expires_at: string | null
  mime_type: string | null
  is_active: boolean
}

export function TabDocuments({ companyId }: { companyId: string }) {
  const [list, setList] = useState<Doc[]>([])
  const [docKind, setDocKind] = useState<(typeof DOC_KINDS)[number]>('alta_fiscal')
  const [label, setLabel] = useState('')
  const [issuedAt, setIssuedAt] = useState('')
  const [expiresAt, setExpiresAt] = useState('')
  const [file, setFile] = useState<File | null>(null)
  const [uploading, setUploading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const load = async () => {
    const res = await fetch(`/api/companies/${companyId}/documents`)
    const json = await res.json()
    setList(json.data ?? [])
  }

  useEffect(() => { load() }, [companyId])

  const upload = async () => {
    if (!file || !label) { setError('Falta archivo o etiqueta'); return }
    setError(null); setUploading(true)
    try {
      const supabase = createClient()
      const path = `${companyId}/${Date.now()}-${file.name.replace(/[^a-zA-Z0-9.-]/g, '_')}`
      const { error: upErr } = await supabase.storage.from('company-documents').upload(path, file, { upsert: false })
      if (upErr) { setError(upErr.message); return }

      const res = await fetch(`/api/companies/${companyId}/documents`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          doc_kind: docKind,
          label,
          storage_bucket: 'company-documents',
          storage_path: path,
          mime_type: file.type || null,
          size_bytes: file.size,
          issued_at: issuedAt || null,
          expires_at: expiresAt || null,
        }),
      })
      const json = await res.json()
      if (!res.ok) { setError(json.error ?? 'Error al registrar'); return }
      setLabel(''); setIssuedAt(''); setExpiresAt(''); setFile(null)
      load()
    } finally {
      setUploading(false)
    }
  }

  const remove = async (id: string) => {
    await fetch(`/api/companies/${companyId}/documents/${id}`, { method: 'DELETE' })
    load()
  }

  return (
    <div className="max-w-4xl">
      <h3 className="text-sm font-semibold text-orange-400 uppercase tracking-wider mb-3">Documentos legales</h3>
      {list.length === 0 ? (
        <div className="text-sm text-gray-500 italic mb-6">Sin documentos cargados.</div>
      ) : (
        <table className="w-full text-sm mb-6">
          <thead className="text-gray-400 border-b border-[#2A3040]">
            <tr>
              <th className="text-left py-2">Tipo</th>
              <th className="text-left py-2">Etiqueta</th>
              <th className="text-left py-2">Emitido</th>
              <th className="text-left py-2">Expira</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {list.filter(d => d.is_active).map((d) => (
              <tr key={d.id} className="border-b border-[#1E2330]">
                <td className="py-2 text-xs text-gray-400">{d.doc_kind}</td>
                <td className="py-2">{d.label}</td>
                <td className="py-2 text-xs">{d.issued_at ?? '—'}</td>
                <td className="py-2 text-xs">{d.expires_at ?? '—'}</td>
                <td className="py-2">
                  <button onClick={() => remove(d.id)} className="text-red-400 hover:text-red-300 text-xs">Eliminar</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      <h3 className="text-sm font-semibold text-orange-400 uppercase tracking-wider mb-3">Subir documento</h3>
      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="block text-sm font-medium text-[#9CA3AF] mb-1.5">Tipo *</label>
          <select
            className="w-full h-10 rounded-lg bg-[#1E2330] border border-[#2A3040] px-3 text-sm text-[#F0F2F5]"
            value={docKind}
            onChange={(e) => setDocKind(e.target.value as (typeof DOC_KINDS)[number])}
          >
            {DOC_KINDS.map((k) => <option key={k} value={k}>{k}</option>)}
          </select>
        </div>
        <Input label="Etiqueta *" value={label} onChange={(e) => setLabel(e.target.value)} />
        <Input label="Emitido" type="date" value={issuedAt} onChange={(e) => setIssuedAt(e.target.value)} />
        <Input label="Expira" type="date" value={expiresAt} onChange={(e) => setExpiresAt(e.target.value)} />
        <div className="col-span-2">
          <label className="block text-sm font-medium text-[#9CA3AF] mb-1.5">Archivo *</label>
          <input
            type="file"
            onChange={(e) => setFile(e.target.files?.[0] ?? null)}
            className="text-sm text-gray-300"
          />
        </div>
      </div>

      <div className="mt-4 flex items-center gap-3">
        <Button onClick={upload} loading={uploading} disabled={!file || !label}>Subir y registrar</Button>
        {error && <span className="text-sm text-red-400">{error}</span>}
      </div>
    </div>
  )
}
