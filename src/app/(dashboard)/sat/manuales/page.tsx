'use client'

import { useState, useEffect, useMemo } from 'react'
import { FileText, Book, Wrench, File, Plus, ExternalLink } from 'lucide-react'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { SearchBar } from '@/components/ui/search-bar'
import { useToast } from '@/components/ui/toast'
import { createClient } from '@/lib/supabase/client'
import { MODELOS_FEIN } from '@/lib/sat/fein-data'
import '@/components/sat/buscatools-theme.css'

interface SatManual {
  id: string
  title: string
  descripcion: string | null
  tipo: 'manual' | 'catalogo' | 'instructivo' | 'otro' | string
  modelos: string[] | null
  url: string
  created_at: string
}

const iconForTipo = (tipo: string) => {
  switch (tipo) {
    case 'manual':
      return <Book className="w-5 h-5" />
    case 'catalogo':
      return <FileText className="w-5 h-5" />
    case 'instructivo':
      return <Wrench className="w-5 h-5" />
    default:
      return <File className="w-5 h-5" />
  }
}

export default function SatManualesPage() {
  const [manuales, setManuales] = useState<SatManual[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [modelo, setModelo] = useState<string>('')
  const { addToast } = useToast()

  useEffect(() => {
    const load = async () => {
      setLoading(true)
      const sb = createClient()
      const { data, error } = await sb
        .from('tt_sat_manuals')
        .select('*')
        .order('created_at', { ascending: false })
      if (!error && data) setManuales(data as SatManual[])
      setLoading(false)
    }
    load()
  }, [])

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    return manuales.filter((m) => {
      if (modelo && !(m.modelos || []).includes(modelo)) return false
      if (!q) return true
      return (
        m.title?.toLowerCase().includes(q) ||
        m.descripcion?.toLowerCase().includes(q) ||
        (m.modelos || []).some((mm) => mm.toLowerCase().includes(q))
      )
    })
  }, [manuales, search, modelo])

  const handleNuevo = () => {
    addToast({
      type: 'info',
      title: 'Próxima iteración',
      message: 'Modal de alta de manual en próxima iter',
    })
  }

  return (
    <div className="sat-theme">
      <div className="p-6 space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-white">Manuales SAT</h1>
            <p className="text-sm text-zinc-400">
              Documentación técnica, catálogos e instructivos
            </p>
          </div>
          <Button onClick={handleNuevo} className="sat-btn">
            <Plus className="w-4 h-4 mr-2" />
            Nuevo manual
          </Button>
        </div>

        <Card className="p-4 bg-zinc-900 border-zinc-800">
          <div className="flex flex-col md:flex-row gap-3">
            <SearchBar
              value={search}
              onChange={setSearch}
              placeholder="Buscar manual..."
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
        </Card>

        {loading ? (
          <div className="text-center text-zinc-500 py-12">Cargando...</div>
        ) : filtered.length === 0 ? (
          <div className="text-center text-zinc-500 py-12">Sin manuales</div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {filtered.map((m) => (
              <Card
                key={m.id}
                className="p-5 bg-zinc-900 border-zinc-800 sat-kpi c-or flex flex-col"
              >
                <div className="flex items-start gap-3 mb-3">
                  <div className="text-orange-400">{iconForTipo(m.tipo)}</div>
                  <div className="flex-1">
                    <h3 className="font-semibold text-white">{m.title}</h3>
                    <Badge variant="default" className="mt-1 text-xs">
                      {m.tipo}
                    </Badge>
                  </div>
                </div>

                {m.modelos && m.modelos.length > 0 && (
                  <div className="flex flex-wrap gap-1 mb-3">
                    {m.modelos.map((md) => (
                      <Badge key={md} variant="default" className="text-xs">
                        {md}
                      </Badge>
                    ))}
                  </div>
                )}

                {m.descripcion && (
                  <p className="text-sm text-zinc-400 mb-4 flex-1">
                    {m.descripcion}
                  </p>
                )}

                <Button
                  onClick={() => window.open(m.url, '_blank')}
                  className="sat-btn w-full"
                >
                  <ExternalLink className="w-4 h-4 mr-2" />
                  Abrir PDF
                </Button>
              </Card>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
