'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import { Button } from '@/components/ui/button'
import { useToast } from '@/components/ui/toast'
import { Loader2, Search, Save, ChevronLeft, ChevronRight, Download, Upload } from 'lucide-react'

interface Logistics {
  net_weight_kg: number | null
  gross_weight_kg: number | null
  length_cm: number | null
  width_cm: number | null
  height_cm: number | null
}
interface ProductRow {
  id: string
  sku: string
  name: string
  weight_kg: number | null
  logistics: Logistics[] | Logistics | null
}
type Draft = Record<keyof Logistics, string>

const FIELDS: (keyof Logistics)[] = ['net_weight_kg', 'gross_weight_kg', 'length_cm', 'width_cm', 'height_cm']
const INPUT = 'w-20 bg-[#0F1218] border border-[#2A3040] rounded px-2 py-1 text-[12px] text-[#F0F2F5] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#FF6600]'

function firstLog(row: ProductRow): Logistics | null {
  const l = row.logistics
  return l ? (Array.isArray(l) ? (l[0] ?? null) : l) : null
}
function toDraft(row: ProductRow): Draft {
  const l = firstLog(row)
  return {
    net_weight_kg: l?.net_weight_kg?.toString() ?? '',
    gross_weight_kg: l?.gross_weight_kg?.toString() ?? '',
    length_cm: l?.length_cm?.toString() ?? '',
    width_cm: l?.width_cm?.toString() ?? '',
    height_cm: l?.height_cm?.toString() ?? '',
  }
}

export function PhysicalDataTab({ canManage }: { canManage: boolean }) {
  const { addToast } = useToast()
  const [q, setQ] = useState('')
  const [page, setPage] = useState(0)
  const [rows, setRows] = useState<ProductRow[]>([])
  const [total, setTotal] = useState(0)
  const [drafts, setDrafts] = useState<Record<string, Draft>>({})
  const [dirty, setDirty] = useState<Set<string>>(new Set())
  const [loading, setLoading] = useState(true)
  const [savingId, setSavingId] = useState<string | null>(null)
  const [importing, setImporting] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)

  const load = useCallback(async (search: string, pg: number) => {
    setLoading(true)
    try {
      const res = await fetch(`/api/comex/product-logistics?q=${encodeURIComponent(search)}&page=${pg}`)
      const json = await res.json() as { data?: ProductRow[]; total?: number; error?: string }
      if (!res.ok) { addToast({ type: 'error', title: 'Error cargando productos', message: json.error }); return }
      const data = json.data ?? []
      setRows(data)
      setTotal(json.total ?? 0)
      setDrafts(Object.fromEntries(data.map(r => [r.id, toDraft(r)])))
      setDirty(new Set())
    } finally { setLoading(false) }
  }, [addToast])

  useEffect(() => { void load('', 0) }, [load])

  // Recargar pisa los drafts: si hay ediciones sin guardar, confirmar antes.
  function guardReload(fn: () => void) {
    if (dirty.size > 0 && !window.confirm('Tenés cambios sin guardar que se van a perder. ¿Seguir igual?')) return
    fn()
  }
  function doSearch() { guardReload(() => { setPage(0); void load(q, 0) }) }
  function goPage(pg: number) { guardReload(() => { setPage(pg); void load(q, pg) }) }

  function setField(productId: string, field: keyof Logistics, value: string) {
    setDrafts(d => ({ ...d, [productId]: { ...d[productId], [field]: value } }))
    setDirty(s => new Set(s).add(productId))
  }

  async function saveRow(row: ProductRow) {
    const d = drafts[row.id]
    const num = (v: string) => (v.trim() === '' ? null : Number(v))
    const payload = {
      product_id: row.id,
      net_weight_kg: num(d.net_weight_kg), gross_weight_kg: num(d.gross_weight_kg),
      length_cm: num(d.length_cm), width_cm: num(d.width_cm), height_cm: num(d.height_cm),
    }
    if (FIELDS.some(f => { const v = payload[f]; return v != null && (!Number.isFinite(v) || v < 0) })) {
      addToast({ type: 'warning', title: 'Valores inválidos', message: 'Pesos y medidas no pueden ser negativos.' }); return
    }
    setSavingId(row.id)
    try {
      const res = await fetch('/api/comex/product-logistics', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) })
      const json = await res.json().catch(() => ({})) as { error?: string; data?: Logistics }
      if (!res.ok) { addToast({ type: 'error', title: 'No se pudo guardar', message: json.error }); return }
      // Reflejar lo que persistió el server (valores normalizados) y limpiar dirty.
      if (json.data) {
        const sd = json.data
        setDrafts(d => ({ ...d, [row.id]: {
          net_weight_kg: sd.net_weight_kg?.toString() ?? '',
          gross_weight_kg: sd.gross_weight_kg?.toString() ?? '',
          length_cm: sd.length_cm?.toString() ?? '',
          width_cm: sd.width_cm?.toString() ?? '',
          height_cm: sd.height_cm?.toString() ?? '',
        } }))
      }
      setDirty(s => { const n = new Set(s); n.delete(row.id); return n })
      addToast({ type: 'success', title: `${row.sku} actualizado` })
    } catch (e) {
      addToast({ type: 'error', title: 'No se pudo conectar', message: (e as Error).message })
    } finally { setSavingId(null) }
  }

  // Import masivo: plantilla XLSX → POST multipart → resumen + recarga.
  async function importExcel(file: File) {
    setImporting(true)
    try {
      const fd = new FormData()
      fd.append('file', file)
      const res = await fetch('/api/comex/product-logistics/import', { method: 'POST', body: fd })
      const json = await res.json().catch(() => ({})) as { error?: string; updated?: number; unknown_skus?: number; invalid_rows?: string[] }
      if (!res.ok) { addToast({ type: 'error', title: 'No se pudo importar', message: json.error }); return }
      const extras = [
        json.unknown_skus ? `${json.unknown_skus} SKUs no encontrados` : null,
        json.invalid_rows?.length ? `${json.invalid_rows.length}+ filas con valores inválidos` : null,
      ].filter(Boolean).join(' · ')
      addToast({ type: extras ? 'warning' : 'success', title: `${json.updated ?? 0} productos actualizados`, message: extras || undefined })
      await load(q, page)
    } catch (e) {
      addToast({ type: 'error', title: 'No se pudo conectar', message: (e as Error).message })
    } finally {
      setImporting(false)
      if (fileRef.current) fileRef.current.value = ''
    }
  }

  const lastPage = Math.max(0, Math.ceil(total / 30) - 1)

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2 flex-wrap">
        <div className="relative flex-1 max-w-md min-w-[200px]">
          <Search size={15} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted" />
          <input
            className="w-full bg-surface border border-border-hover rounded-lg pl-8 pr-3 py-2 text-sm text-foreground focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary"
            placeholder="Buscar por SKU o nombre…" value={q}
            onChange={e => setQ(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') doSearch() }}
          />
        </div>
        <Button variant="secondary" onClick={doSearch}>Buscar</Button>
        {canManage && (
          <>
            <a href="/api/comex/product-logistics/template" download>
              <Button variant="secondary"><Download size={14} /> Plantilla Excel</Button>
            </a>
            <Button variant="secondary" disabled={importing} onClick={() => fileRef.current?.click()}>
              {importing ? <Loader2 size={14} className="animate-spin" /> : <Upload size={14} />}
              {importing ? 'Importando…' : 'Importar Excel'}
            </Button>
            <input
              ref={fileRef} type="file" accept=".xlsx,.xls" className="hidden"
              onChange={e => { const f = e.target.files?.[0]; if (f) void importExcel(f) }}
            />
          </>
        )}
        <span className="text-[11px] text-muted ml-auto">{total.toLocaleString('es-AR')} productos</span>
      </div>

      {loading ? (
        <div className="flex justify-center py-10"><Loader2 className="animate-spin text-[#FF6600]" size={28} /></div>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-[#1E2330]">
          <table className="w-full text-sm">
            <thead className="bg-[#0F1218] text-[11px] uppercase tracking-wider text-[#6B7280]">
              <tr>
                <th className="text-left px-3 py-2">SKU</th>
                <th className="text-left px-3 py-2">Producto</th>
                <th className="px-2 py-2">Peso neto</th>
                <th className="px-2 py-2">Peso bruto</th>
                <th className="px-2 py-2">Largo</th>
                <th className="px-2 py-2">Ancho</th>
                <th className="px-2 py-2">Alto</th>
                {canManage && <th className="px-3 py-2"></th>}
              </tr>
            </thead>
            <tbody className="divide-y divide-[#1E2330]">
              {rows.map(row => {
                const d = drafts[row.id]
                if (!d) return null
                return (
                  <tr key={row.id}>
                    <td className="px-3 py-2 font-mono text-[12px]">{row.sku}</td>
                    <td className="px-3 py-2 max-w-[260px] truncate" title={row.name}>{row.name}</td>
                    {FIELDS.map(f => (
                      <td key={f} className="px-2 py-1.5 text-center">
                        <input type="number" min="0" step="0.01" className={INPUT} disabled={!canManage}
                          value={d[f]} onChange={e => setField(row.id, f, e.target.value)} />
                      </td>
                    ))}
                    {canManage && (
                      <td className="px-3 py-2 text-right">
                        <Button size="sm" variant="secondary" disabled={savingId === row.id} onClick={() => void saveRow(row)}>
                          {savingId === row.id ? <Loader2 size={13} className="animate-spin" /> : <Save size={13} />}
                        </Button>
                      </td>
                    )}
                  </tr>
                )
              })}
              {rows.length === 0 && <tr><td colSpan={canManage ? 8 : 7} className="text-center text-[#6B7280] py-8">Sin resultados</td></tr>}
            </tbody>
          </table>
        </div>
      )}

      {total > 30 && (
        <div className="flex items-center justify-end gap-2 text-sm">
          <Button size="sm" variant="secondary" disabled={page <= 0} onClick={() => goPage(page - 1)}><ChevronLeft size={14} /></Button>
          <span className="text-[#6B7280]">{page + 1} / {lastPage + 1}</span>
          <Button size="sm" variant="secondary" disabled={page >= lastPage} onClick={() => goPage(page + 1)}><ChevronRight size={14} /></Button>
        </div>
      )}
    </div>
  )
}
