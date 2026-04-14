'use client'

import { useEffect } from 'react'
import { Input } from '@/components/ui/input'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Plus, Trash2, Wrench, Clock } from 'lucide-react'
import type { ReparacionData, InspectionPart } from '../sat-workflow-types'
import { DEFAULT_INSPECTION_PARTS } from '../sat-workflow-types'

interface StepReparacionProps {
  data: ReparacionData
  onChange: (data: ReparacionData) => void
  readOnly?: boolean
}

const STATUS_OPTIONS: Array<{ value: InspectionPart['status']; label: string; color: string }> = [
  { value: 'OK', label: 'OK', color: '#10B981' },
  { value: 'NOK', label: 'NOK', color: '#EF4444' },
  { value: 'NA', label: 'N/A', color: '#6B7280' },
]

export function StepReparacion({ data, onChange, readOnly }: StepReparacionProps) {
  const update = (partial: Partial<ReparacionData>) => {
    const next = { ...data, ...partial }
    // Auto-calculate minutes
    if (next.start_time && next.end_time) {
      const start = new Date(next.start_time)
      const end = new Date(next.end_time)
      next.total_minutes = Math.max(0, Math.round((end.getTime() - start.getTime()) / 60000))
    }
    onChange(next)
  }

  // Initialize grid if empty — intentional mount-only effect
  useEffect(() => {
    if (data.post_repair_grid.length === 0) {
      update({ post_repair_grid: DEFAULT_INSPECTION_PARTS.map(p => ({ ...p, status: 'NA' as const })) })
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const updatePart = (index: number, field: keyof InspectionPart, value: string) => {
    const grid = [...data.post_repair_grid]
    grid[index] = { ...grid[index], [field]: value }
    update({ post_repair_grid: grid })
  }

  const addPartUsed = () => {
    update({
      parts_used: [...data.parts_used, { description: '', part_number: '', qty: 1 }]
    })
  }

  const removePartUsed = (idx: number) => {
    update({ parts_used: data.parts_used.filter((_, i) => i !== idx) })
  }

  const updatePartUsed = (idx: number, field: string, value: string | number) => {
    const parts = data.parts_used.map((p, i) => i === idx ? { ...p, [field]: value } : p)
    update({ parts_used: parts })
  }

  const okCount = data.post_repair_grid.filter(p => p.status === 'OK').length
  const formatTime = (min: number) => {
    const h = Math.floor(min / 60)
    const m = min % 60
    return h > 0 ? `${h}h ${m}m` : `${m}m`
  }

  return (
    <div className="space-y-6">
      {/* Work Description */}
      <Card>
        <h3 className="text-sm font-semibold text-[#14B8A6] mb-4 flex items-center gap-2">
          <Wrench size={16} /> Trabajo realizado
        </h3>
        <textarea
          value={data.work_performed}
          onChange={(e) => update({ work_performed: e.target.value })}
          className="w-full h-32 rounded-lg bg-[#1E2330] border border-[#2A3040] px-3 py-2 text-sm text-[#F0F2F5] placeholder:text-[#4B5563] focus:outline-none focus:ring-2 focus:ring-teal-500/50 resize-none"
          placeholder="Describi en detalle el trabajo de reparacion realizado..."
          readOnly={readOnly}
        />
      </Card>

      {/* Time Tracking */}
      <Card>
        <h3 className="text-sm font-semibold text-[#14B8A6] mb-4 flex items-center gap-2">
          <Clock size={16} /> Tiempo de trabajo
        </h3>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <Input
            label="Inicio"
            type="datetime-local"
            value={data.start_time}
            onChange={(e) => update({ start_time: e.target.value })}
            readOnly={readOnly}
          />
          <Input
            label="Fin"
            type="datetime-local"
            value={data.end_time}
            onChange={(e) => update({ end_time: e.target.value })}
            readOnly={readOnly}
          />
          <div>
            <label className="block text-sm font-medium text-[#9CA3AF] mb-1.5">Tiempo total</label>
            <div className="h-10 flex items-center px-3 rounded-lg bg-[#0F1218] border border-[#1E2330] text-sm font-mono text-[#14B8A6]">
              {data.total_minutes > 0 ? formatTime(data.total_minutes) : '—'}
            </div>
          </div>
        </div>
      </Card>

      {/* Parts Used */}
      <Card>
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-sm font-semibold text-[#14B8A6]">Repuestos utilizados</h3>
          {!readOnly && (
            <Button variant="secondary" size="sm" onClick={addPartUsed}>
              <Plus size={14} /> Agregar
            </Button>
          )}
        </div>
        {data.parts_used.length === 0 ? (
          <p className="text-sm text-[#6B7280] text-center py-4">Sin repuestos registrados</p>
        ) : (
          <div className="space-y-2">
            {data.parts_used.map((part, idx) => (
              <div key={idx} className="flex items-center gap-2 p-2 rounded-lg bg-[#0F1218] border border-[#1E2330]">
                <input
                  value={part.description}
                  onChange={(e) => updatePartUsed(idx, 'description', e.target.value)}
                  className="flex-1 h-8 rounded bg-[#1E2330] border border-[#2A3040] px-2 text-xs text-[#F0F2F5] placeholder:text-[#4B5563] focus:outline-none focus:ring-1 focus:ring-teal-500/50"
                  placeholder="Descripcion"
                  readOnly={readOnly}
                />
                <input
                  value={part.part_number}
                  onChange={(e) => updatePartUsed(idx, 'part_number', e.target.value)}
                  className="w-28 h-8 rounded bg-[#1E2330] border border-[#2A3040] px-2 text-xs text-[#F0F2F5] font-mono placeholder:text-[#4B5563] focus:outline-none focus:ring-1 focus:ring-teal-500/50"
                  placeholder="PN"
                  readOnly={readOnly}
                />
                <input
                  type="number"
                  min={1}
                  value={part.qty}
                  onChange={(e) => updatePartUsed(idx, 'qty', parseInt(e.target.value) || 1)}
                  className="w-16 h-8 rounded bg-[#1E2330] border border-[#2A3040] px-2 text-xs text-[#F0F2F5] focus:outline-none focus:ring-1 focus:ring-teal-500/50"
                  readOnly={readOnly}
                />
                {!readOnly && (
                  <button onClick={() => removePartUsed(idx)} className="p-1 rounded hover:bg-red-500/10 text-red-400">
                    <Trash2 size={14} />
                  </button>
                )}
              </div>
            ))}
          </div>
        )}
      </Card>

      {/* Post-Repair Inspection Grid */}
      <Card>
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-sm font-semibold text-[#14B8A6]">Inspeccion post-reparacion</h3>
          <Badge variant="success">{okCount}/{data.post_repair_grid.length} OK</Badge>
        </div>
        <div className="space-y-2">
          {data.post_repair_grid.map((part, idx) => (
            <div key={idx} className="flex items-center gap-3 p-3 rounded-lg bg-[#0F1218] border border-[#1E2330]">
              <span className="text-sm text-[#D1D5DB] flex-1 min-w-0">{part.name}</span>
              <div className="flex gap-1 shrink-0">
                {STATUS_OPTIONS.map(opt => (
                  <button
                    key={opt.value}
                    type="button"
                    disabled={readOnly}
                    onClick={() => updatePart(idx, 'status', opt.value)}
                    className="px-3 py-1 rounded-md text-xs font-bold transition-all"
                    style={{
                      backgroundColor: part.status === opt.value ? opt.color : 'transparent',
                      color: part.status === opt.value ? '#fff' : opt.color,
                      border: `1px solid ${opt.color}40`,
                    }}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
              <input
                type="text"
                value={part.notes}
                onChange={(e) => updatePart(idx, 'notes', e.target.value)}
                placeholder="Nota..."
                readOnly={readOnly}
                className="w-32 h-8 rounded bg-[#1E2330] border border-[#2A3040] px-2 text-xs text-[#F0F2F5] placeholder:text-[#4B5563] focus:outline-none focus:ring-1 focus:ring-teal-500/50"
              />
            </div>
          ))}
        </div>
      </Card>

      {/* Technician Notes */}
      <Card>
        <label className="block text-sm font-medium text-[#9CA3AF] mb-1.5">Notas del tecnico</label>
        <textarea
          value={data.technician_notes}
          onChange={(e) => update({ technician_notes: e.target.value })}
          className="w-full h-20 rounded-lg bg-[#1E2330] border border-[#2A3040] px-3 py-2 text-sm text-[#F0F2F5] placeholder:text-[#4B5563] focus:outline-none focus:ring-2 focus:ring-teal-500/50 resize-none"
          placeholder="Observaciones finales de la reparacion..."
          readOnly={readOnly}
        />
      </Card>
    </div>
  )
}
