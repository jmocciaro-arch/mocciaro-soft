'use client'

import { useMemo, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { FileText, Plus, ChevronLeft, ChevronRight, Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Select } from '@/components/ui/select'
import { SearchBar } from '@/components/ui/search-bar'
import { Card } from '@/components/ui/card'
import { StatusBadge, docTypeLabel } from '@/components/documents/status-badge'
import { useDocuments } from '@/hooks/use-documents'
import { useCompanyContext } from '@/lib/company-context'
import { DOC_TYPES, DOC_STATUSES, type DocType, type DocStatus } from '@/lib/schemas/documents'
import type { DocumentListRow } from '@/lib/documents/client'

// Opciones de filtros derivadas de las constantes del dominio. Así si cambian
// los enums, la UI queda alineada sin tocar nada acá.
const DOC_TYPE_OPTIONS = [{ value: '', label: 'Todos los tipos' }, ...DOC_TYPES.map((t) => ({ value: t, label: docTypeLabel(t) }))]
const STATUS_OPTIONS = [{ value: '', label: 'Todos los estados' }, ...DOC_STATUSES.map((s) => ({ value: s, label: s }))]

function fmtCurrency(n: number, currency: string) {
  try {
    return new Intl.NumberFormat('es-AR', { style: 'currency', currency, minimumFractionDigits: 2 })
      .format(Number(n) || 0)
  } catch {
    return `${currency} ${Number(n || 0).toFixed(2)}`
  }
}

function fmtDate(iso: string) {
  try { return new Date(iso).toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit', year: 'numeric' }) }
  catch { return iso }
}

export default function DocumentsListPage() {
  const router = useRouter()
  const { activeCompanyId, companies } = useCompanyContext()

  const [docType, setDocType] = useState<DocType | ''>('')
  const [status, setStatus] = useState<DocStatus | ''>('')
  const [search, setSearch] = useState('')
  const [page, setPage] = useState(1)
  const pageSize = 50

  const { data, loading, error, refetch } = useDocuments({
    companyId: activeCompanyId ?? undefined,
    docType: docType || undefined,
    status: status || undefined,
    page,
    pageSize,
  })

  // Filtros client-side sobre la página (search por código/contraparte).
  // Los filtros fuertes viajan al server; el search local cubre casos frecuentes
  // sin pegarle a la API en cada tecla.
  const rows = useMemo<DocumentListRow[]>(() => {
    const base = data?.data ?? []
    if (!search.trim()) return base
    const q = search.trim().toLowerCase()
    return base.filter((r) =>
      (r.doc_code ?? '').toLowerCase().includes(q) ||
      (r.counterparty_name ?? '').toLowerCase().includes(q)
    )
  }, [data, search])

  const total = data?.count ?? 0
  const totalPages = Math.max(1, Math.ceil(total / pageSize))

  const companyName = (id: string | null) => {
    if (!id) return '—'
    return companies.find((c) => c.id === id)?.name ?? '—'
  }

  return (
    <div className="space-y-6">
      {/* Encabezado */}
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div>
          <div className="flex items-center gap-2">
            <FileText className="h-5 w-5 text-orange-400" />
            <h1 className="text-2xl font-bold text-[#F0F2F5]">Documentos</h1>
          </div>
          <p className="text-sm text-[#9CA3AF] mt-1">
            Cotizaciones, órdenes, remitos, facturas y más — unificados.
          </p>
        </div>
        <Link href="/documents/new">
          <Button variant="primary">
            <Plus className="h-4 w-4" />
            Nuevo documento
          </Button>
        </Link>
      </div>

      {/* Filtros */}
      <Card className="!p-4">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
          <SearchBar
            placeholder="Buscar por código o contraparte…"
            value={search}
            onChange={setSearch}
            className="md:col-span-2"
          />
          <Select
            value={docType}
            onChange={(e) => { setDocType(e.target.value as DocType | ''); setPage(1) }}
            options={DOC_TYPE_OPTIONS}
          />
          <Select
            value={status}
            onChange={(e) => { setStatus(e.target.value as DocStatus | ''); setPage(1) }}
            options={STATUS_OPTIONS}
          />
        </div>
        {activeCompanyId && (
          <p className="text-xs text-[#6B7280] mt-3">
            Mostrando documentos de <span className="text-[#F0F2F5] font-medium">{companyName(activeCompanyId)}</span> —
            cambiá la empresa activa en el topbar para ver otras.
          </p>
        )}
      </Card>

      {/* Tabla */}
      <div className="rounded-xl border border-[#1E2330] bg-[#0F1218] overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-[#141820] text-[10px] uppercase tracking-wider text-[#6B7280]">
                <th className="px-3 py-2 text-left">Tipo</th>
                <th className="px-3 py-2 text-left">Código / Nº</th>
                <th className="px-3 py-2 text-left">Contraparte</th>
                <th className="px-3 py-2 text-left">Fecha</th>
                <th className="px-3 py-2 text-left">Estado</th>
                <th className="px-3 py-2 text-right">Total</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#1E2330]">
              {loading ? (
                <tr>
                  <td colSpan={6} className="py-16 text-center">
                    <Loader2 className="h-6 w-6 animate-spin text-orange-400 mx-auto" />
                  </td>
                </tr>
              ) : error ? (
                <tr>
                  <td colSpan={6} className="py-12 text-center">
                    <p className="text-sm text-red-400 mb-3">{error}</p>
                    <Button variant="secondary" size="sm" onClick={refetch}>Reintentar</Button>
                  </td>
                </tr>
              ) : rows.length === 0 ? (
                <tr>
                  <td colSpan={6} className="py-16 text-center text-[#6B7280] text-sm">
                    No hay documentos con estos filtros.
                  </td>
                </tr>
              ) : (
                rows.map((r) => (
                  <tr
                    key={r.id}
                    onClick={() => router.push(`/documents/${r.id}`)}
                    className="hover:bg-[#141820] cursor-pointer transition-colors"
                  >
                    <td className="px-3 py-2.5">
                      <span className="text-[#F0F2F5] text-sm">{docTypeLabel(r.doc_type)}</span>
                    </td>
                    <td className="px-3 py-2.5">
                      <div className="text-[#F0F2F5] text-sm font-mono">
                        {r.doc_code ?? <span className="text-[#6B7280] italic">borrador</span>}
                      </div>
                      {r.doc_number && (
                        <div className="text-[10px] text-[#6B7280] font-mono">
                          Nº {r.doc_number}{r.doc_year ? ` · ${r.doc_year}` : ''}
                        </div>
                      )}
                    </td>
                    <td className="px-3 py-2.5 text-[#D1D5DB] text-sm">
                      {r.counterparty_name ?? <span className="text-[#6B7280]">—</span>}
                    </td>
                    <td className="px-3 py-2.5 text-[#9CA3AF] text-xs font-mono">{fmtDate(r.doc_date)}</td>
                    <td className="px-3 py-2.5"><StatusBadge status={r.status} /></td>
                    <td className="px-3 py-2.5 text-right font-mono text-sm text-orange-400 font-semibold">
                      {fmtCurrency(Number(r.total), r.currency_code)}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Paginación */}
      {!loading && total > 0 && (
        <div className="flex items-center justify-between">
          <span className="text-xs text-[#6B7280]">
            Página {page} de {totalPages} · {total} documento{total === 1 ? '' : 's'} en total
          </span>
          <div className="flex items-center gap-2">
            <Button
              variant="ghost"
              size="sm"
              disabled={page <= 1}
              onClick={() => setPage((p) => Math.max(1, p - 1))}
            >
              <ChevronLeft className="h-4 w-4" />
              Anterior
            </Button>
            <Button
              variant="ghost"
              size="sm"
              disabled={page >= totalPages}
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
            >
              Siguiente
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        </div>
      )}
    </div>
  )
}
