'use client'

import { useState, useEffect, useMemo } from 'react'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { SearchBar } from '@/components/ui/search-bar'
import { createClient } from '@/lib/supabase/client'
import '@/components/sat/buscatools-theme.css'

type FiltroTipo = 'todos' | 'ASM' | 'ASW'

interface FeinModel {
  id: string
  model_code: string
  name: string | null
  tipo: string | null
  par_min: number | null
  par_max: number | null
  par_unit: string | null
  vel_min: number | null
  vel_max: number | null
  vel_unit: string | null
  vel_fabrica: string | null
  peso: string | null
  interfaz: string | null
  precision: string | null
  uso: string | null
  numero_pedido: string | null
}

export default function SatModelosPage() {
  const [modelos, setModelos] = useState<FeinModel[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [filtro, setFiltro] = useState<FiltroTipo>('todos')

  useEffect(() => {
    const load = async () => {
      setLoading(true)
      const sb = createClient()
      const { data, error } = await sb
        .from('tt_fein_models')
        .select('*')
        .order('model_code', { ascending: true })
      if (!error && data) setModelos(data as FeinModel[])
      setLoading(false)
    }
    load()
  }, [])

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    return modelos.filter((m) => {
      const code = (m.model_code || '').toUpperCase()
      if (filtro === 'ASM' && !code.startsWith('ASM')) return false
      if (filtro === 'ASW' && !code.startsWith('ASW')) return false
      if (!q) return true
      return (
        m.model_code?.toLowerCase().includes(q) ||
        m.name?.toLowerCase().includes(q) ||
        m.tipo?.toLowerCase().includes(q) ||
        m.uso?.toLowerCase().includes(q)
      )
    })
  }, [modelos, search, filtro])

  return (
    <div className="sat-theme">
      <div className="p-6 space-y-6">
        <div>
          <h1 className="text-2xl font-bold text-white">Modelos FEIN</h1>
          <p className="text-sm text-zinc-400">
            Especificaciones técnicas de los modelos FEIN
          </p>
        </div>

        <Card className="p-4 bg-zinc-900 border-zinc-800">
          <div className="flex flex-col md:flex-row gap-3">
            <SearchBar
              value={search}
              onChange={setSearch}
              placeholder="Buscar modelo..."
              className="flex-1"
            />
            <div className="flex gap-2">
              <Button
                variant={filtro === 'todos' ? 'secondary' : 'outline'}
                onClick={() => setFiltro('todos')}
                className="sat-btn"
              >
                Todos
              </Button>
              <Button
                variant={filtro === 'ASM' ? 'secondary' : 'outline'}
                onClick={() => setFiltro('ASM')}
                className="sat-btn"
              >
                ASM
              </Button>
              <Button
                variant={filtro === 'ASW' ? 'secondary' : 'outline'}
                onClick={() => setFiltro('ASW')}
                className="sat-btn"
              >
                ASW
              </Button>
            </div>
          </div>
        </Card>

        {loading ? (
          <div className="text-center text-zinc-500 py-12">Cargando...</div>
        ) : filtered.length === 0 ? (
          <div className="text-center text-zinc-500 py-12">Sin modelos</div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {filtered.map((m) => {
              const code = (m.model_code || '').toUpperCase()
              const colorCls = code.startsWith('ASM')
                ? 'sn-a'
                : code.startsWith('ASW')
                ? 'sn-o'
                : 'sn-g'
              return (
                <Card
                  key={m.id}
                  className={`sat-kpi ${colorCls} p-5 bg-zinc-900 border-zinc-800`}
                >
                  <div className="mb-3">
                    <h3 className="text-xl font-bold text-orange-400">
                      {m.model_code}
                    </h3>
                    <p className="text-sm text-zinc-400">
                      {m.name || m.tipo || ''}
                    </p>
                  </div>

                  <div className="grid grid-cols-2 gap-3 text-sm">
                    <div>
                      <div className="text-xs text-zinc-500">Par</div>
                      <div className="text-white">
                        {m.par_min ?? '-'}–{m.par_max ?? '-'} {m.par_unit || ''}
                      </div>
                    </div>
                    <div>
                      <div className="text-xs text-zinc-500">Velocidad</div>
                      <div className="text-white">
                        {m.vel_min ?? '-'}–{m.vel_max ?? '-'} {m.vel_unit || ''}
                      </div>
                    </div>
                    <div>
                      <div className="text-xs text-zinc-500">Vel. fábrica</div>
                      <div className="text-white">{m.vel_fabrica || '-'}</div>
                    </div>
                    <div>
                      <div className="text-xs text-zinc-500">Peso</div>
                      <div className="text-white">{m.peso || '-'}</div>
                    </div>
                    <div>
                      <div className="text-xs text-zinc-500">Interfaz</div>
                      <div className="text-white">{m.interfaz || '-'}</div>
                    </div>
                    <div>
                      <div className="text-xs text-zinc-500">Precisión</div>
                      <div className="text-green-400">{m.precision || '-'}</div>
                    </div>
                    <div className="col-span-2">
                      <div className="text-xs text-zinc-500">Uso</div>
                      <div className="text-zinc-300 italic">{m.uso || '-'}</div>
                    </div>
                    <div className="col-span-2">
                      <div className="text-xs text-zinc-500">N° pedido</div>
                      <div className="font-mono text-xs text-orange-400">
                        {m.numero_pedido || '-'}
                      </div>
                    </div>
                  </div>
                </Card>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}
