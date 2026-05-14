'use client'

/**
 * ADMIN — Historial de vinculaciones SKU del cliente → producto
 * =============================================================
 *
 * Lista los aliases guardados desde el cotizador / DocumentForm.
 * Permite filtrar, ver el producto vinculado y eliminar entradas
 * (por si se vinculó mal y querés que la próxima OC vuelva a quedar
 * en rojo para volver a elegir).
 */

import { useCallback, useEffect, useState } from 'react'
import { Loader2, Search, Trash2, Globe, User, RefreshCw } from 'lucide-react'
import { useToast } from '@/components/ui/toast'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { listAliases, deleteAlias, type SkuAlias } from '@/lib/sku-aliases'

type Row = SkuAlias & {
  product?: { sku: string; name: string } | null
  client?: { name: string; legal_name: string | null } | null
}

export function SkuAliasesAdmin() {
  const { addToast } = useToast()
  const [rows, setRows] = useState<Row[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [scopeFilter, setScopeFilter] = useState<'all' | 'client' | 'global'>('all')

  const load = useCallback(async () => {
    setLoading(true)
    const data = await listAliases()
    setRows(data)
    setLoading(false)
  }, [])

  useEffect(() => { load() }, [load])

  async function handleDelete(row: Row) {
    if (!confirm(`¿Eliminar el alias "${row.external_sku}" → ${row.product?.sku || row.product_id}?\n\nLa próxima OC con ese SKU del cliente va a volver a aparecer en rojo (sin match).`)) return
    const ok = await deleteAlias(row.id)
    if (ok) {
      addToast({ type: 'success', title: 'Alias eliminado' })
      load()
    } else {
      addToast({ type: 'error', title: 'No se pudo eliminar' })
    }
  }

  const visibleRows = rows.filter((r) => {
    if (scopeFilter === 'client' && !r.client_id) return false
    if (scopeFilter === 'global' && r.client_id) return false
    if (search) {
      const s = search.toLowerCase()
      const inSku = r.external_sku.toLowerCase().includes(s)
      const inProd = r.product?.sku.toLowerCase().includes(s) || r.product?.name.toLowerCase().includes(s)
      const inClient = r.client?.name.toLowerCase().includes(s) || r.client?.legal_name?.toLowerCase().includes(s)
      if (!inSku && !inProd && !inClient) return false
    }
    return true
  })

  const totalGlobal = rows.filter((r) => !r.client_id).length
  const totalClient = rows.filter((r) => r.client_id).length

  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h2 className="text-lg font-bold text-[#F0F2F5]">Vinculaciones SKU del cliente → producto</h2>
          <p className="text-sm text-[#9CA3AF] mt-1 max-w-2xl">
            Cada vez que vinculás manualmente un SKU del cliente (dot rojo en una OC)
            con un producto del catálogo, queda guardado acá. La próxima OC con ese
            mismo SKU lo encuentra solo (verde).
          </p>
        </div>
        <Button variant="ghost" size="sm" onClick={load}>
          <RefreshCw size={14} /> Refrescar
        </Button>
      </div>

      {/* Filtros */}
      <div className="flex items-center gap-3 flex-wrap">
        <Input
          placeholder="Buscar por SKU, producto o cliente…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          icon={<Search size={14} />}
          className="max-w-md"
        />
        <div className="flex items-center gap-1 bg-[#0B0E13] rounded-lg p-0.5 border border-[#2A3040]">
          {(['all', 'client', 'global'] as const).map((opt) => (
            <button
              key={opt}
              type="button"
              onClick={() => setScopeFilter(opt)}
              className={`px-3 py-1 text-xs font-medium rounded-md transition-all ${
                scopeFilter === opt ? 'bg-[#1E2330] text-[#FF6600]' : 'text-[#6B7280] hover:text-[#9CA3AF]'
              }`}
            >
              {opt === 'all' ? `Todos (${rows.length})` : opt === 'client' ? `Por cliente (${totalClient})` : `Globales (${totalGlobal})`}
            </button>
          ))}
        </div>
      </div>

      {/* Tabla */}
      <div className="rounded-xl border border-[#2A3040] bg-[#141820] overflow-hidden">
        {loading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 size={24} className="animate-spin text-[#FF6600]" />
          </div>
        ) : visibleRows.length === 0 ? (
          <div className="py-12 text-center text-sm text-[#6B7280]">
            {rows.length === 0
              ? 'Todavía no hay vinculaciones guardadas. Empezá vinculando ítems rojos en una cotización.'
              : 'No hay resultados con esos filtros.'}
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-[#0B0E13] border-b border-[#2A3040]">
              <tr>
                <th className="text-left px-4 py-3 text-xs font-semibold text-[#9CA3AF] uppercase tracking-wider">Alcance</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-[#9CA3AF] uppercase tracking-wider">SKU del cliente</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-[#9CA3AF] uppercase tracking-wider">Cliente</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-[#9CA3AF] uppercase tracking-wider">→ Producto</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-[#9CA3AF] uppercase tracking-wider">Origen</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-[#9CA3AF] uppercase tracking-wider">Creado</th>
                <th className="px-2 py-3" />
              </tr>
            </thead>
            <tbody>
              {visibleRows.map((r) => (
                <tr key={r.id} className="border-b border-[#1E2330] hover:bg-[#1C2230]/30">
                  <td className="px-4 py-2">
                    {r.client_id ? (
                      <Badge variant="orange"><User size={10} className="inline mr-1" /> Cliente</Badge>
                    ) : (
                      <Badge variant="info"><Globe size={10} className="inline mr-1" /> Global</Badge>
                    )}
                  </td>
                  <td className="px-4 py-2">
                    <code className="text-xs font-mono text-[#FF6600] bg-[#FF6600]/10 px-1.5 py-0.5 rounded">{r.external_sku}</code>
                  </td>
                  <td className="px-4 py-2 text-sm text-[#F0F2F5]">
                    {r.client ? (r.client.legal_name || r.client.name) : <span className="text-[#6B7280] italic">— global —</span>}
                  </td>
                  <td className="px-4 py-2">
                    {r.product ? (
                      <div className="flex flex-col">
                        <code className="text-xs font-mono text-emerald-400">{r.product.sku}</code>
                        <span className="text-xs text-[#9CA3AF] truncate max-w-md">{r.product.name}</span>
                      </div>
                    ) : (
                      <span className="text-xs text-red-400">Producto eliminado ({r.product_id.slice(0, 8)}…)</span>
                    )}
                  </td>
                  <td className="px-4 py-2">
                    <span className="text-[10px] uppercase tracking-wider text-[#6B7280]">{r.source}</span>
                  </td>
                  <td className="px-4 py-2 text-xs text-[#6B7280]">
                    {new Date(r.created_at).toLocaleDateString('es-AR')}
                  </td>
                  <td className="px-2 py-2 text-right">
                    <button
                      type="button"
                      onClick={() => handleDelete(r)}
                      className="text-red-400 hover:text-red-300 p-1.5 rounded hover:bg-red-500/10"
                      title="Eliminar este vínculo"
                    >
                      <Trash2 size={14} />
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
