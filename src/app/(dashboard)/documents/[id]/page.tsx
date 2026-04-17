'use client'

import { use } from 'react'
import Link from 'next/link'
import { ArrowLeft, Loader2, AlertCircle, Hash } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { useDocument } from '@/hooks/use-documents'
import { DocumentToolbar } from '@/components/documents/document-toolbar'
import { DocumentHeaderForm } from '@/components/documents/document-header-form'
import { DocumentLinesEditor } from '@/components/documents/document-lines-editor'
import { DocumentTimeline } from '@/components/documents/document-timeline'
import { StatusBadge, docTypeLabel } from '@/components/documents/status-badge'

function fmtDate(iso: string | null) {
  if (!iso) return '—'
  try { return new Date(iso).toLocaleString('es-AR', { dateStyle: 'medium', timeStyle: 'short' }) }
  catch { return iso }
}

export default function DocumentEditorPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params)
  const { data, loading, error, refetch } = useDocument(id)

  if (loading) {
    return (
      <div className="flex items-center justify-center py-24">
        <Loader2 className="h-8 w-8 animate-spin text-orange-400" />
      </div>
    )
  }

  if (error || !data) {
    return (
      <div className="max-w-lg mx-auto py-16">
        <Card>
          <div className="flex flex-col items-center text-center space-y-3">
            <AlertCircle className="h-10 w-10 text-red-400" />
            <h2 className="text-lg font-semibold text-[#F0F2F5]">No pudimos cargar el documento</h2>
            <p className="text-sm text-[#9CA3AF]">{error ?? 'Documento inexistente o sin acceso'}</p>
            <div className="flex gap-2 pt-2">
              <Link href="/documents">
                <Button variant="ghost" size="sm">Volver al listado</Button>
              </Link>
              <Button variant="secondary" size="sm" onClick={refetch}>Reintentar</Button>
            </div>
          </div>
        </Card>
      </div>
    )
  }

  const { document: doc, relations_in, relations_out } = data

  return (
    <div className="space-y-6">
      {/* Back */}
      <div>
        <Link
          href="/documents"
          className="inline-flex items-center gap-1 text-xs text-[#9CA3AF] hover:text-[#F0F2F5] transition-colors"
        >
          <ArrowLeft className="h-3.5 w-3.5" />
          Volver al listado
        </Link>
      </div>

      {/* Encabezado */}
      <div className="rounded-xl border border-[#1E2330] bg-[#141820] p-5">
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div className="min-w-0">
            <div className="flex items-center gap-2 text-xs text-[#9CA3AF] uppercase tracking-wider">
              <span>{docTypeLabel(doc.doc_type)}</span>
              <span>·</span>
              <span className="capitalize">{doc.direction}</span>
              <span>·</span>
              <span className="font-mono">{doc.currency_code}</span>
            </div>
            <div className="flex items-center gap-3 mt-2 flex-wrap">
              <h1 className="text-2xl font-bold text-[#F0F2F5] font-mono break-all">
                {doc.doc_code ?? <span className="italic text-[#6B7280]">borrador — sin numerar</span>}
              </h1>
              <StatusBadge status={doc.status} />
              {doc.doc_number && (
                <span className="inline-flex items-center gap-1 text-xs text-[#9CA3AF]">
                  <Hash className="h-3 w-3" /> {doc.doc_number}{doc.doc_year ? ` · ${doc.doc_year}` : ''}
                </span>
              )}
            </div>
            <div className="mt-2 text-sm text-[#D1D5DB]">
              {doc.counterparty_name ?? <span className="text-[#6B7280] italic">Sin contraparte</span>}
              {doc.counterparty_tax_id && (
                <span className="text-[#6B7280] font-mono ml-2">· {doc.counterparty_tax_id}</span>
              )}
            </div>
            <div className="mt-1 text-xs text-[#6B7280]">
              Emitido: {fmtDate(doc.issued_at)} · Creado: {fmtDate(doc.created_at)}
            </div>
          </div>
        </div>

        {/* Toolbar */}
        <div className="mt-4 pt-4 border-t border-[#1E2330]">
          <DocumentToolbar detail={data} onChanged={refetch} />
        </div>
      </div>

      {/* Relaciones */}
      {(relations_in.length > 0 || relations_out.length > 0) && (
        <Card>
          <div className="text-[11px] font-semibold uppercase tracking-wider text-[#6B7280] mb-3">
            Relaciones
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-sm">
            {relations_in.length > 0 && (
              <div>
                <div className="text-xs text-[#9CA3AF] mb-2">Este doc proviene de:</div>
                <ul className="space-y-1">
                  {relations_in.map((r) => (
                    <li key={r.id}>
                      {r.source ? (
                        <Link
                          href={`/documents/${r.source.id}`}
                          className="inline-flex items-center gap-2 text-orange-400 hover:text-orange-300 font-mono text-xs"
                        >
                          {r.source.doc_code ?? 'borrador'}
                          <span className="text-[#6B7280]">({r.relation_type})</span>
                        </Link>
                      ) : (
                        <span className="text-[#6B7280] text-xs">— ({r.relation_type})</span>
                      )}
                    </li>
                  ))}
                </ul>
              </div>
            )}
            {relations_out.length > 0 && (
              <div>
                <div className="text-xs text-[#9CA3AF] mb-2">Derivaciones generadas:</div>
                <ul className="space-y-1">
                  {relations_out.map((r) => (
                    <li key={r.id}>
                      {r.target ? (
                        <Link
                          href={`/documents/${r.target.id}`}
                          className="inline-flex items-center gap-2 text-orange-400 hover:text-orange-300 font-mono text-xs"
                        >
                          {r.target.doc_code ?? 'borrador'}
                          <span className="text-[#6B7280]">({r.relation_type})</span>
                        </Link>
                      ) : (
                        <span className="text-[#6B7280] text-xs">— ({r.relation_type})</span>
                      )}
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        </Card>
      )}

      {/* Grid principal: editor + timeline */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Columna izquierda: cabecera + líneas (ocupa 2/3) */}
        <div className="lg:col-span-2 space-y-6">
          <Card>
            <div className="text-[11px] font-semibold uppercase tracking-wider text-[#6B7280] mb-3">
              Cabecera
            </div>
            <DocumentHeaderForm doc={doc} onSaved={refetch} />
          </Card>

          <Card>
            <DocumentLinesEditor detail={data} onChanged={refetch} />
          </Card>
        </div>

        {/* Columna derecha: timeline (1/3) */}
        <div className="lg:col-span-1">
          <Card>
            <div className="text-[11px] font-semibold uppercase tracking-wider text-[#6B7280] mb-3">
              Historia
            </div>
            <DocumentTimeline events={data.events} />
          </Card>
        </div>
      </div>
    </div>
  )
}
