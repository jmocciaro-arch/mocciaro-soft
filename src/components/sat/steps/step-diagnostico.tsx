'use client'

import { useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { SearchableSelect } from '@/components/ui/searchable-select'
import type { DiagnosticoData, InspectionPart } from '../sat-workflow-types'
import { DEFAULT_INSPECTION_PARTS } from '../sat-workflow-types'

interface StepDiagnosticoProps {
  data: DiagnosticoData
  onChange: (data: DiagnosticoData) => void
  readOnly?: boolean
}

const STATUS_OPTIONS: Array<{ value: InspectionPart['status']; label: string; color: string; activeBg: string }> = [
  { value: 'OK', label: 'OK', color: '#10B981', activeBg: '#10B981' },
  { value: 'NOK', label: 'NOK', color: '#EF4444', activeBg: '#EF4444' },
  { value: 'NA', label: 'N/A', color: '#6B7280', activeBg: '#6B7280' },
]

export function StepDiagnostico({ data, onChange, readOnly }: StepDiagnosticoProps) {
  const update = (partial: Partial<DiagnosticoData>) => {
    onChange({ ...data, ...partial })
  }

  const updatePart = (index: number, field: keyof InspectionPart, value: string) => {
    const grid = [...data.inspection_grid]
    grid[index] = { ...grid[index], [field]: value }
    update({ inspection_grid: grid })
  }

  const handleClientChange = (clientId: string, clientName?: string) => {
    update({ client_id: clientId, client_name: clientName || '' })
  }

  /** Server-side search: busca clientes por nombre via Supabase ilike, deduplicando por nombre */
  const searchClients = async (query: string): Promise<Array<{ value: string; label: string }>> => {
    const sb = createClient()
    const { data: cl } = await sb
      .from('tt_clients')
      .select('id, name')
      .eq('active', true)
      .ilike('name', `%${query}%`)
      .order('name')
      .limit(100)
    // Deduplicar por nombre: quedarse con el primer ID de cada nombre único
    const seen = new Map<string, string>()
    for (const c of (cl || [])) {
      const name = (c.name as string).trim()
      if (!seen.has(name.toLowerCase())) {
        seen.set(name.toLowerCase(), c.id as string)
      }
    }
    return Array.from(seen.entries()).map(([, id]) => {
      const original = (cl || []).find(c => c.id === id)
      return { value: id, label: (original?.name as string) || '' }
    }).slice(0, 30)
  }

  // Initialize grid if empty
  useEffect(() => {
    if (data.inspection_grid.length === 0) {
      update({ inspection_grid: DEFAULT_INSPECTION_PARTS.map(p => ({ ...p })) })
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const okCount = data.inspection_grid.filter(p => p.status === 'OK').length
  const nokCount = data.inspection_grid.filter(p => p.status === 'NOK').length

  return (
    <div className="space-y-5">
      {/* ── Section: Datos de ingreso ── */}
      <div className="border border-[#2A3040] rounded-xl overflow-hidden">
        <div className="px-4 py-2.5 bg-[#1E2330]/60 border-b border-[#2A3040]">
          <h3 className="text-xs font-bold uppercase tracking-wider text-[#F97316]">
            1 &nbsp; Datos de ingreso
          </h3>
        </div>
        <div className="p-4 space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <SearchableSelect
              label="Cliente *"
              value={data.client_id}
              onChange={handleClientChange}
              onSearch={searchClients}
              minSearchLength={2}
              placeholder="Buscar cliente por nombre..."
              disabled={readOnly}
            />
            <Input
              label="Nro de serie *"
              value={data.asset_serial}
              onChange={(e) => update({ asset_serial: e.target.value })}
              placeholder="Ej: SN-2024-001"
              readOnly={readOnly}
            />
            <Input
              label="Marca"
              value={data.brand}
              onChange={(e) => update({ brand: e.target.value })}
              placeholder="Ej: Tohnichi, FEIN..."
              readOnly={readOnly}
            />
            <Input
              label="Modelo"
              value={data.model}
              onChange={(e) => update({ model: e.target.value })}
              placeholder="Modelo del equipo"
              readOnly={readOnly}
            />
          </div>
          <Input
            label="Descripcion del equipo"
            value={data.asset_description}
            onChange={(e) => update({ asset_description: e.target.value })}
            placeholder="Descripcion breve del activo"
            readOnly={readOnly}
          />
          <div>
            <label className="block text-sm font-medium text-[#9CA3AF] mb-1.5">Problema reportado *</label>
            <textarea
              value={data.reported_issue}
              onChange={(e) => update({ reported_issue: e.target.value })}
              className="w-full h-20 rounded-lg bg-[#1E2330] border border-[#2A3040] px-3 py-2 text-sm text-[#F0F2F5] placeholder:text-[#4B5563] focus:outline-none focus:ring-2 focus:ring-orange-500/50 resize-none"
              placeholder="Describi el problema que reporta el cliente..."
              readOnly={readOnly}
            />
          </div>
        </div>
      </div>

      {/* ── Section: Diagnostico de partes — grid 4x2 estilo BuscaTools ── */}
      <div className="border border-[#2A3040] rounded-xl overflow-hidden">
        <div className="px-4 py-2.5 bg-[#1E2330]/60 border-b border-[#2A3040] flex items-center justify-between">
          <h3 className="text-xs font-bold uppercase tracking-wider text-[#F97316]">
            D &nbsp; Diagnostico de partes — estado al ingreso
          </h3>
          <div className="flex gap-2">
            <Badge variant="success">{okCount} OK</Badge>
            <Badge variant="danger">{nokCount} NOK</Badge>
          </div>
        </div>
        <div className="p-3 bg-amber-500/5 border-b border-[#2A3040]">
          <p className="text-[11px] text-amber-400">
            Marca el estado en que LLEGO la herramienta — antes de cualquier intervencion
          </p>
        </div>
        {/* 4x2 Grid */}
        <div className="p-4 grid grid-cols-2 lg:grid-cols-4 gap-3">
          {data.inspection_grid.map((part, idx) => (
            <div
              key={idx}
              className="border border-[#2A3040] rounded-lg overflow-hidden bg-[#0F1218]"
            >
              {/* Part Name Header */}
              <div className="px-3 py-2 bg-[#1E2330]/50 border-b border-[#2A3040]">
                <span className="text-[11px] font-bold uppercase tracking-wide text-[#D1D5DB]">
                  {part.name}
                </span>
              </div>
              {/* OK / NOK / N/A Buttons */}
              <div className="p-2 flex gap-1">
                {STATUS_OPTIONS.map(opt => (
                  <button
                    key={opt.value}
                    type="button"
                    disabled={readOnly}
                    onClick={() => updatePart(idx, 'status', opt.value)}
                    className="flex-1 py-1.5 rounded text-[11px] font-bold transition-all duration-150"
                    style={{
                      backgroundColor: part.status === opt.value ? opt.activeBg : 'transparent',
                      color: part.status === opt.value ? '#fff' : opt.color,
                      border: `1.5px solid ${part.status === opt.value ? opt.activeBg : opt.color + '40'}`,
                      opacity: readOnly ? 0.6 : 1,
                    }}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* ── Section: Observaciones ── */}
      <div className="border border-[#2A3040] rounded-xl overflow-hidden">
        <div className="px-4 py-2.5 bg-[#1E2330]/60 border-b border-[#2A3040]">
          <h3 className="text-xs font-bold uppercase tracking-wider text-[#F97316]">
            Observaciones de diagnostico
          </h3>
        </div>
        <div className="p-4">
          <textarea
            value={data.initial_notes}
            onChange={(e) => update({ initial_notes: e.target.value })}
            className="w-full h-24 rounded-lg bg-[#1E2330] border border-[#2A3040] px-3 py-2 text-sm text-[#F0F2F5] placeholder:text-[#4B5563] focus:outline-none focus:ring-2 focus:ring-orange-500/50 resize-none"
            placeholder="Fallas detectadas, piezas daniadas..."
            readOnly={readOnly}
          />
        </div>
      </div>
    </div>
  )
}
