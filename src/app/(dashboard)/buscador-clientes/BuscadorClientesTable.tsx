'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'

interface ClienteRow {
  id: string
  full_name: string
  company: string | null
  phone: string | null
  country: string | null
  approved: boolean
  approved_at: string | null
  created_at: string
  user_id: string | null
  email: string
}

interface Props {
  rows: ClienteRow[]
}

function formatDate(iso: string | null) {
  if (!iso) return '—'
  return new Date(iso).toLocaleDateString('es-AR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

export function BuscadorClientesTable({ rows }: Props) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [loadingId, setLoadingId] = useState<string | null>(null)
  const [errorMsg, setErrorMsg] = useState<string | null>(null)

  async function handleAction(id: string, approved: boolean) {
    setLoadingId(id)
    setErrorMsg(null)
    try {
      const res = await fetch(`/api/buscador-clientes/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ approved }),
      })
      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        throw new Error(body.error ?? `Error ${res.status}`)
      }
      startTransition(() => {
        router.refresh()
      })
    } catch (err: unknown) {
      setErrorMsg(err instanceof Error ? err.message : 'Error desconocido')
    } finally {
      setLoadingId(null)
    }
  }

  if (rows.length === 0) {
    return (
      <div className="rounded-xl border border-gray-200 bg-white p-12 text-center text-gray-500">
        No hay clientes registrados todavía.
      </div>
    )
  }

  return (
    <div className="space-y-3">
      {errorMsg && (
        <div className="rounded-lg bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700">
          {errorMsg}
        </div>
      )}

      <div className="overflow-x-auto rounded-xl border border-gray-200 bg-white shadow-sm">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-gray-100 bg-gray-50">
              <th className="px-4 py-3 text-left font-semibold text-gray-600 whitespace-nowrap">Nombre</th>
              <th className="px-4 py-3 text-left font-semibold text-gray-600 whitespace-nowrap">Empresa</th>
              <th className="px-4 py-3 text-left font-semibold text-gray-600 whitespace-nowrap">País</th>
              <th className="px-4 py-3 text-left font-semibold text-gray-600 whitespace-nowrap">Teléfono</th>
              <th className="px-4 py-3 text-left font-semibold text-gray-600 whitespace-nowrap">Email</th>
              <th className="px-4 py-3 text-left font-semibold text-gray-600 whitespace-nowrap">Registro</th>
              <th className="px-4 py-3 text-left font-semibold text-gray-600 whitespace-nowrap">Estado</th>
              <th className="px-4 py-3 text-left font-semibold text-gray-600 whitespace-nowrap">Acciones</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {rows.map((row) => {
              const isLoading = loadingId === row.id || isPending && loadingId === row.id
              return (
                <tr key={row.id} className="hover:bg-gray-50 transition-colors">
                  <td className="px-4 py-3 font-medium text-gray-900 whitespace-nowrap">
                    {row.full_name}
                  </td>
                  <td className="px-4 py-3 text-gray-600 whitespace-nowrap">
                    {row.company ?? '—'}
                  </td>
                  <td className="px-4 py-3 text-gray-600 whitespace-nowrap">
                    {row.country ?? '—'}
                  </td>
                  <td className="px-4 py-3 text-gray-600 whitespace-nowrap">
                    {row.phone ?? '—'}
                  </td>
                  <td className="px-4 py-3 text-gray-600">
                    {row.email || '—'}
                  </td>
                  <td className="px-4 py-3 text-gray-500 whitespace-nowrap text-xs">
                    {formatDate(row.created_at)}
                  </td>
                  <td className="px-4 py-3 whitespace-nowrap">
                    {row.approved ? (
                      <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-green-50 text-green-700 border border-green-200">
                        <span className="w-1.5 h-1.5 rounded-full bg-green-500 inline-block" />
                        Aprobado
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-yellow-50 text-yellow-700 border border-yellow-200">
                        <span className="w-1.5 h-1.5 rounded-full bg-yellow-400 inline-block" />
                        Pendiente
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-3 whitespace-nowrap">
                    <div className="flex items-center gap-2">
                      {!row.approved ? (
                        <button
                          onClick={() => handleAction(row.id, true)}
                          disabled={isLoading}
                          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-green-600 hover:bg-green-700 text-white transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                          {isLoading ? (
                            <span className="w-3 h-3 border border-white border-t-transparent rounded-full animate-spin" />
                          ) : null}
                          Aprobar
                        </button>
                      ) : (
                        <button
                          onClick={() => handleAction(row.id, false)}
                          disabled={isLoading}
                          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-red-50 hover:bg-red-100 text-red-700 border border-red-200 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                          {isLoading ? (
                            <span className="w-3 h-3 border border-red-400 border-t-transparent rounded-full animate-spin" />
                          ) : null}
                          Revocar
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      <p className="text-xs text-gray-400 text-right">
        {rows.length} cliente{rows.length !== 1 ? 's' : ''} en total
      </p>
    </div>
  )
}
