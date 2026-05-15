'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { Card } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { createClient } from '@/lib/supabase/client'
import { useToast } from '@/components/ui/toast'
import {
  ArrowLeft, Loader2, RefreshCw, History, Layers, Boxes,
  AlertTriangle, Search, Building2, ShoppingCart,
} from 'lucide-react'
import {
  DuplicateGroupCard,
  type DuplicateGroup,
  type DuplicateProduct,
} from '@/components/catalogo/duplicate-group-card'
import { formatDate } from '@/lib/utils'

type Mode = 'exact' | 'aggressive'
type ReasonFilter = 'all' | DuplicateGroup['reason']

interface MergeLogRow {
  id: string
  master_id: string
  duplicate_id: string
  merged_at: string
  prev_name: string
  prev_sku: string
  refs_moved: Record<string, number> | null
  match_reason: string | null
  reverted_at: string | null
  master?: { sku: string; name: string } | null
}

export default function DuplicatesPage() {
  const sb = useMemo(() => createClient(), [])
  const { addToast } = useToast()

  const [loading, setLoading] = useState(false)
  const [busy, setBusy] = useState(false)
  const [mode, setMode] = useState<Mode>('aggressive')
  const [threshold, setThreshold] = useState(0.85)
  const [reasonFilter, setReasonFilter] = useState<ReasonFilter>('all')
  const [companyFilter, setCompanyFilter] = useState<string>('all')
  const [search, setSearch] = useState('')
  const [groups, setGroups] = useState<DuplicateGroup[]>([])
  const [companies, setCompanies] = useState<Array<{ id: string; name: string }>>([])
  const [showHistory, setShowHistory] = useState(false)
  const [history, setHistory] = useState<MergeLogRow[]>([])

  // Cargar empresas para el filtro
  useEffect(() => {
    void sb
      .from('tt_companies')
      .select('id, name')
      .order('name')
      .then(({ data }) => setCompanies((data as Array<{ id: string; name: string }>) ?? []))
  }, [sb])

  const fetchGroups = useCallback(async () => {
    setLoading(true)
    try {
      const { data, error } = await sb.rpc('find_duplicate_groups', {
        p_mode: mode,
        p_fuzzy_threshold: threshold,
        p_limit_groups: 200,
      })
      if (error) throw error
      setGroups(((data as DuplicateGroup[] | null) ?? []))
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      addToast({ type: 'error', title: 'No se pudieron cargar duplicados', message: msg })
    } finally {
      setLoading(false)
    }
  }, [sb, mode, threshold, addToast])

  const fetchHistory = useCallback(async () => {
    const { data } = await sb
      .from('tt_product_merge_log')
      .select('id, master_id, duplicate_id, merged_at, prev_name, prev_sku, refs_moved, match_reason, reverted_at, master:tt_products!tt_product_merge_log_master_id_fkey(sku, name)')
      .order('merged_at', { ascending: false })
      .limit(50)
    setHistory((data as unknown as MergeLogRow[]) ?? [])
  }, [sb])

  useEffect(() => {
    void fetchGroups()
  }, [fetchGroups])

  // Filtros client-side
  const filteredGroups = useMemo(() => {
    let g = groups
    if (reasonFilter !== 'all') g = g.filter((x) => x.reason === reasonFilter)
    if (companyFilter !== 'all') {
      g = g.filter((grp) =>
        grp.products.some((p) => Object.keys(p.usage_by_company).includes(companyFilter))
      )
    }
    if (search.trim()) {
      const q = search.trim().toLowerCase()
      g = g.filter((grp) =>
        grp.products.some(
          (p) =>
            p.sku.toLowerCase().includes(q) ||
            p.name.toLowerCase().includes(q) ||
            (p.ean ?? '').toLowerCase().includes(q) ||
            (p.manufacturer_code ?? '').toLowerCase().includes(q),
        ),
      )
    }
    return g
  }, [groups, reasonFilter, companyFilter, search])

  const stats = useMemo(() => {
    const dupCount = filteredGroups.reduce((s, g) => s + g.group_size, 0)
    const removableCount = filteredGroups.reduce((s, g) => s + (g.group_size - 1), 0)
    const stockTotal = filteredGroups.reduce(
      (s, g) => s + g.products.reduce((ss, p) => ss + p.total_stock, 0),
      0,
    )
    const docTotal = filteredGroups.reduce(
      (s, g) => s + g.products.reduce((ss, p) => ss + p.total_doc_items, 0),
      0,
    )
    return { groups: filteredGroups.length, dupCount, removableCount, stockTotal, docTotal }
  }, [filteredGroups])

  async function handleMerge(masterId: string, duplicateIds: string[], reason: string) {
    setBusy(true)
    try {
      const { data: user } = await sb.auth.getUser()
      const { data, error } = await sb.rpc('merge_products', {
        p_master_id: masterId,
        p_duplicate_ids: duplicateIds,
        p_merged_by: user.user?.id ?? null,
        p_match_reason: reason,
        p_notes: null,
      })
      if (error) throw error
      const merged = (data as { merged_count?: number } | null)?.merged_count ?? 0
      addToast({
        type: 'success',
        title: 'Merge completado',
        message: `${merged} producto(s) hermanado(s) al maestro.`,
      })
      await fetchGroups()
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      addToast({ type: 'error', title: 'Error al hermanar', message: msg })
    } finally {
      setBusy(false)
    }
  }

  async function handleRevert(logId: string) {
    if (!confirm('¿Revertir este merge? El duplicado volverá a estar activo pero las referencias FK no se moverán de vuelta.')) return
    try {
      const { error } = await sb.rpc('revert_product_merge', { p_log_id: logId })
      if (error) throw error
      addToast({ type: 'success', title: 'Merge revertido', message: 'El duplicado volvió a estado activo.' })
      await fetchHistory()
      await fetchGroups()
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      addToast({ type: 'error', title: 'No se pudo revertir', message: msg })
    }
  }

  return (
    <div className="space-y-4 p-4 md:p-6 max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Link href="/catalogo">
            <Button variant="ghost" size="sm"><ArrowLeft className="w-4 h-4" /> Catálogo</Button>
          </Link>
          <div>
            <h1 className="text-xl font-bold text-[#1F2937]">Duplicados de productos</h1>
            <p className="text-xs text-[#6B7280]">
              Detecta y hermana productos repetidos. Inferimos la empresa por el uso en documentos y stock.
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="secondary"
            size="sm"
            onClick={() => { setShowHistory((v) => !v); if (!showHistory) void fetchHistory() }}
          >
            <History className="w-4 h-4" /> Historial
          </Button>
          <Button variant="primary" size="sm" onClick={fetchGroups} disabled={loading}>
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
            Reanalizar
          </Button>
        </div>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        {[
          { label: 'Grupos',                 value: stats.groups,         Icon: Layers },
          { label: 'Duplicados detectados',  value: stats.dupCount,       Icon: AlertTriangle },
          { label: 'Se pueden mergear',      value: stats.removableCount, Icon: Boxes },
          { label: 'Stock involucrado',      value: stats.stockTotal,     Icon: Boxes },
          { label: 'Usos en docs',           value: stats.docTotal,       Icon: ShoppingCart },
        ].map(({ label, value, Icon }) => (
          <Card key={label} className="!p-4">
            <div className="flex items-start gap-3">
              <div className="w-9 h-9 rounded-md bg-[#FFF7ED] text-[#FF6600] flex items-center justify-center flex-shrink-0">
                <Icon className="w-4 h-4" />
              </div>
              <div className="min-w-0">
                <p className="text-[11px] uppercase tracking-wide text-[#6B7280]">{label}</p>
                <p className="text-xl font-bold text-[#1F2937] mt-0.5">{value}</p>
              </div>
            </div>
          </Card>
        ))}
      </div>

      {/* Filtros */}
      <Card>
        <div className="grid grid-cols-1 md:grid-cols-5 gap-3">
          <div>
            <label className="block text-xs font-medium text-[#6B7280] mb-1">Modo</label>
            <select
              value={mode}
              onChange={(e) => setMode(e.target.value as Mode)}
              className="w-full h-9 px-2 text-sm rounded-md border border-[#E5E5E5] bg-white"
            >
              <option value="exact">Solo exactos (rápido, sin falsos +)</option>
              <option value="aggressive">Agresivo (auto-SKUs + fuzzy)</option>
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-[#6B7280] mb-1">
              Umbral fuzzy ({(threshold * 100).toFixed(0)}%)
            </label>
            <input
              type="range"
              min={0.7}
              max={0.99}
              step={0.01}
              value={threshold}
              onChange={(e) => setThreshold(parseFloat(e.target.value))}
              disabled={mode === 'exact'}
              className="w-full"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-[#6B7280] mb-1">Razón</label>
            <select
              value={reasonFilter}
              onChange={(e) => setReasonFilter(e.target.value as ReasonFilter)}
              className="w-full h-9 px-2 text-sm rounded-md border border-[#E5E5E5] bg-white"
            >
              <option value="all">Todas</option>
              <option value="ean">EAN idéntico</option>
              <option value="manufacturer_code">Cód. fabricante igual</option>
              <option value="sku_norm">SKU normalizado igual</option>
              <option value="name_norm">Nombre idéntico</option>
              <option value="name_fuzzy">Nombre similar</option>
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-[#6B7280] mb-1">Empresa con uso</label>
            <select
              value={companyFilter}
              onChange={(e) => setCompanyFilter(e.target.value)}
              className="w-full h-9 px-2 text-sm rounded-md border border-[#E5E5E5] bg-white"
            >
              <option value="all">Todas</option>
              {companies.map((c) => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-[#6B7280] mb-1">Buscar (SKU/nombre/EAN)</label>
            <div className="relative">
              <Search className="w-4 h-4 absolute left-2 top-1/2 -translate-y-1/2 text-[#9CA3AF]" />
              <Input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Filtrar..."
                className="pl-8 h-9"
              />
            </div>
          </div>
        </div>
        <p className="text-[11px] text-[#9CA3AF] mt-2">
          <Building2 className="inline w-3 h-3" /> Recordá: <b>tt_products</b> no tiene company_id —
          la empresa se infiere por uso en <code>tt_documents</code>/<code>tt_stock</code>. Si todos los duplicados de un grupo
          aparecen en la <i>misma</i> empresa, probablemente vinieron de la misma importación.
        </p>
      </Card>

      {/* Historial */}
      {showHistory && (
        <Card>
          <h3 className="text-sm font-bold mb-3 flex items-center gap-2">
            <History className="w-4 h-4" /> Últimos 50 merges
          </h3>
          {history.length === 0 ? (
            <p className="text-xs text-[#6B7280]">Sin merges aún.</p>
          ) : (
            <div className="space-y-1.5 text-xs">
              {history.map((h) => (
                <div key={h.id} className="flex items-center gap-2 p-2 rounded border border-[#E5E5E5]">
                  <span className="text-[#6B7280] flex-shrink-0">{formatDate(h.merged_at)}</span>
                  <code className="text-[#6B7280]">{h.prev_sku}</code>
                  <span className="truncate flex-1">→ {h.master?.sku ?? h.master_id.slice(0, 8)}</span>
                  {h.match_reason && <Badge variant="default" size="sm">{h.match_reason}</Badge>}
                  {h.reverted_at ? (
                    <Badge variant="warning" size="sm">revertido</Badge>
                  ) : (
                    <button
                      onClick={() => handleRevert(h.id)}
                      className="text-[#FF6600] hover:underline text-[11px]"
                    >
                      Revertir
                    </button>
                  )}
                </div>
              ))}
            </div>
          )}
        </Card>
      )}

      {/* Resultados */}
      {loading ? (
        <Card>
          <div className="flex items-center justify-center py-12 text-[#6B7280]">
            <Loader2 className="w-5 h-5 animate-spin mr-2" /> Analizando catálogo...
          </div>
        </Card>
      ) : filteredGroups.length === 0 ? (
        <Card>
          <div className="text-center py-12 text-[#6B7280]">
            <Layers className="w-10 h-10 mx-auto mb-2 text-[#D1D5DB]" />
            <p className="font-medium text-[#1F2937]">No se encontraron grupos de duplicados</p>
            <p className="text-xs mt-1">Probá cambiar a modo agresivo o bajar el umbral fuzzy.</p>
          </div>
        </Card>
      ) : (
        <div className="space-y-3">
          {filteredGroups.map((g) => (
            <DuplicateGroupCard
              key={g.group_key}
              group={g}
              busy={busy}
              onMerge={handleMerge}
            />
          ))}
        </div>
      )}
    </div>
  )
}
