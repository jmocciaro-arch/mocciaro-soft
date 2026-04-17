'use client'

import { useState, useMemo } from 'react'
import { Package, Wrench, Sparkles, Plus, Percent, Pencil, Trash2 } from 'lucide-react'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import {
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
} from '@/components/ui/table'
import { SearchBar } from '@/components/ui/search-bar'
import { KPICard } from '@/components/ui/kpi-card'
import { useToast } from '@/components/ui/toast'
import { useSpareParts } from '@/hooks/use-spare-parts'
import { MODELOS_FEIN } from '@/lib/sat/fein-data'
import { fmtNumber } from '@/lib/sat/currency-converter'
import '@/components/sat/buscatools-theme.css'

export default function SatRepuestosPage() {
  const [search, setSearch] = useState('')
  const [modelo, setModelo] = useState<string>('')
  const { parts, loading, remove } = useSpareParts({
    search,
    model: modelo || undefined,
  })
  const { addToast } = useToast()

  const isAdmin = true

  const kpis = useMemo(() => {
    const total = parts.filter((p) => p.tipo === 'repuesto').length
    const accesorios = parts.filter((p) => p.tipo === 'accesorio').length
    const custom = parts.filter((p) => p.is_custom).length
    return { total, accesorios, custom }
  }, [parts])

  const handleNuevo = () => {
    addToast({
      type: 'info',
      title: 'Próxima iteración',
      message: 'Modal de alta de repuesto en próxima iter',
    })
  }

  const handleAjusteMasivo = () => {
    addToast({
      type: 'info',
      title: 'Próxima iteración',
      message: 'Modal de ajuste masivo en próxima iter',
    })
  }

  const handleEditar = (_id: string) => {
    addToast({
      type: 'info',
      title: 'Próxima iteración',
      message: 'Editar repuesto en próxima iter',
    })
  }

  const handleEliminar = async (id: string, desc: string) => {
    if (!confirm(`¿Eliminar "${desc}"?`)) return
    try {
      await remove(id)
      addToast({ type: 'success', title: 'Eliminado', message: desc })
    } catch (e) {
      addToast({ type: 'error', title: 'Error', message: (e as Error)?.message || '' })
    }
  }

  return (
    <div className="sat-theme">
      <div className="p-6 space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-white">Catálogo de repuestos</h1>
            <p className="text-sm text-zinc-400">
              Repuestos, accesorios y consumibles FEIN
            </p>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" onClick={handleAjusteMasivo} className="sat-btn">
              <Percent className="w-4 h-4 mr-2" />
              Ajuste masivo
            </Button>
            <Button onClick={handleNuevo} className="sat-btn">
              <Plus className="w-4 h-4 mr-2" />
              Nuevo repuesto
            </Button>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="sat-kpi c-or">
            <KPICard
              label="Total repuestos"
              value={kpis.total}
              icon={<Package className="w-5 h-5" />}
              color="#FF6600"
            />
          </div>
          <div className="sat-kpi c-bl">
            <KPICard
              label="Total accesorios"
              value={kpis.accesorios}
              icon={<Wrench className="w-5 h-5" />}
              color="#3B82F6"
            />
          </div>
          <div className="sat-kpi c-pu">
            <KPICard
              label="Custom"
              value={kpis.custom}
              icon={<Sparkles className="w-5 h-5" />}
              color="#A855F7"
            />
          </div>
        </div>

        <Card className="p-4 bg-zinc-900 border-zinc-800">
          <div className="flex flex-col md:flex-row gap-3 mb-4">
            <SearchBar
              value={search}
              onChange={setSearch}
              placeholder="Buscar por código o descripción..."
              className="flex-1"
            />
            <select
              value={modelo}
              onChange={(e) => setModelo(e.target.value)}
              className="bg-zinc-800 border border-zinc-700 text-white rounded-md px-3 py-2 text-sm"
            >
              <option value="">Todos los modelos</option>
              {MODELOS_FEIN.map((m) => (
                <option key={m} value={m}>
                  {m}
                </option>
              ))}
            </select>
          </div>

          <div className="sat-table overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>POS</TableHead>
                  <TableHead>Código</TableHead>
                  <TableHead>Descripción</TableHead>
                  <TableHead>Modelos</TableHead>
                  {isAdmin && <TableHead className="text-right">€ EUR</TableHead>}
                  <TableHead className="text-right">$ USD</TableHead>
                  <TableHead className="text-center">Acciones</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {loading ? (
                  <TableRow>
                    <TableCell className="text-center py-8 text-zinc-500">
                      Cargando...
                    </TableCell>
                  </TableRow>
                ) : parts.length === 0 ? (
                  <TableRow>
                    <TableCell className="text-center py-8 text-zinc-500">
                      Sin repuestos
                    </TableCell>
                  </TableRow>
                ) : (
                  parts.map((p) => (
                    <TableRow key={p.id}>
                      <TableCell className="font-mono text-xs text-orange-400">
                        {p.pos || '-'}
                      </TableCell>
                      <TableCell className="font-mono text-xs">
                        {p.codigo || p.sku}
                      </TableCell>
                      <TableCell>
                        {p.descripcion}
                        {p.is_custom && (
                          <Badge variant="default" className="ml-2">
                            custom
                          </Badge>
                        )}
                      </TableCell>
                      <TableCell className="text-xs text-zinc-400">
                        {(p.modelos || []).join(', ')}
                      </TableCell>
                      {isAdmin && (
                        <TableCell className="text-right font-mono text-xs">
                          {fmtNumber(p.precio_eur || 0)}
                        </TableCell>
                      )}
                      <TableCell className="text-right font-mono text-xs text-orange-400">
                        {fmtNumber(p.precio_venta || 0)}
                      </TableCell>
                      <TableCell className="text-center">
                        <div className="flex gap-1 justify-center">
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => handleEditar(p.id)}
                          >
                            <Pencil className="w-3 h-3" />
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => handleEliminar(p.id, p.descripcion)}
                          >
                            <Trash2 className="w-3 h-3" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        </Card>
      </div>
    </div>
  )
}
