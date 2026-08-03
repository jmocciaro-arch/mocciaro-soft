'use client'

/**
 * /archivo — Biblioteca central de documentos.
 *
 * Dos fuentes ya existentes, unificadas en una sola vista:
 *  - Documentos de empresa (tt_company_documents + bucket company-documents):
 *    escrituras, poderes, constancias fiscales, contratos... con upload.
 *  - Adjuntos de operaciones (tt_document_attachments): OCs de clientes,
 *    pliegos, planos, firmas... solo lectura, con salto al documento padre.
 */

import { useState } from 'react'
import { FolderOpen } from 'lucide-react'
import { CompanyDocsTab } from '@/components/archivo/company-docs-tab'
import { AttachmentsTab } from '@/components/archivo/attachments-tab'

type Tab = 'empresa' | 'operaciones'

const TABS: Array<{ id: Tab; label: string }> = [
  { id: 'empresa', label: 'Documentos de empresa' },
  { id: 'operaciones', label: 'Adjuntos de operaciones' },
]

export default function ArchivoPage() {
  const [tab, setTab] = useState<Tab>('empresa')

  return (
    <div className="p-4 lg:p-6 max-w-6xl mx-auto">
      <div className="flex items-center gap-3 mb-1">
        <FolderOpen className="text-[#FF6600]" size={26} />
        <h1 className="text-2xl font-bold text-[#F0F2F5]">Archivo</h1>
      </div>
      <p className="text-sm text-[#9CA3AF] mb-5">
        Todos los documentos guardados en el sistema: subí los de la empresa y consultá los adjuntos de las operaciones.
      </p>

      <div className="flex gap-1 border-b border-[#1E2330] mb-5">
        {TABS.map((t) => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={
              tab === t.id
                ? 'px-4 py-2.5 text-sm font-semibold text-[#FF6600] border-b-2 border-[#FF6600]'
                : 'px-4 py-2.5 text-sm text-[#9CA3AF] hover:text-[#F0F2F5] border-b-2 border-transparent'
            }
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === 'empresa' ? <CompanyDocsTab /> : <AttachmentsTab />}
    </div>
  )
}
