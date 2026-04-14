'use client'

import { useEffect, useMemo } from 'react'
import { Input } from '@/components/ui/input'
import { Select } from '@/components/ui/select'
import { Card } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Gauge } from 'lucide-react'
import type { TorqueData, TorqueMeasurement } from '../sat-workflow-types'

interface StepTorqueProps {
  data: TorqueData
  onChange: (data: TorqueData) => void
  readOnly?: boolean
}

const UNITS = [
  { value: 'Nm', label: 'Nm (Newton-metro)' },
  { value: 'ft-lb', label: 'ft-lb (pie-libra)' },
  { value: 'kgf-cm', label: 'kgf·cm' },
]

/** Calcula estadísticas de torque: media, std, CV, Cp, Cpk */
function computeTorqueStats(
  measurements: TorqueMeasurement[],
  target: number,
  tolerancePercent: number
): { mean: number | null; std_dev: number | null; cv: number | null; cp: number | null; cpk: number | null; efficiency: number | null; result: 'CAPAZ' | 'REVISAR' | null } {
  const values = measurements.map(m => m.value).filter((v): v is number => v !== null && v > 0)

  if (values.length < 3 || target <= 0 || tolerancePercent <= 0) {
    return { mean: null, std_dev: null, cv: null, cp: null, cpk: null, efficiency: null, result: null }
  }

  const n = values.length
  const mean = values.reduce((a, b) => a + b, 0) / n
  const variance = values.reduce((sum, v) => sum + Math.pow(v - mean, 2), 0) / (n - 1)
  const std_dev = Math.sqrt(variance)

  const cv = mean !== 0 ? (std_dev / mean) * 100 : null

  const tolerance = target * (tolerancePercent / 100)
  const USL = target + tolerance
  const LSL = target - tolerance

  const cp = std_dev > 0 ? (USL - LSL) / (6 * std_dev) : null
  const cpk = std_dev > 0
    ? Math.min((USL - mean) / (3 * std_dev), (mean - LSL) / (3 * std_dev))
    : null

  const efficiency = target !== 0 ? (mean / target) * 100 : null

  // Capaz si Cpk >= 1.33
  const result = cpk !== null ? (cpk >= 1.33 ? 'CAPAZ' : 'REVISAR') : null

  return {
    mean: Math.round(mean * 100) / 100,
    std_dev: Math.round(std_dev * 1000) / 1000,
    cv: cv !== null ? Math.round(cv * 100) / 100 : null,
    cp: cp !== null ? Math.round(cp * 100) / 100 : null,
    cpk: cpk !== null ? Math.round(cpk * 100) / 100 : null,
    efficiency: efficiency !== null ? Math.round(efficiency * 100) / 100 : null,
    result,
  }
}

export function StepTorque({ data, onChange, readOnly }: StepTorqueProps) {
  // Initialize 10 measurements if empty — mount-only
  useEffect(() => {
    if (data.measurements.length === 0) {
      onChange({
        ...data,
        measurements: Array.from({ length: 10 }, (_, i) => ({ index: i + 1, value: null })),
      })
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const update = (partial: Partial<TorqueData>) => {
    onChange({ ...data, ...partial })
  }

  const updateMeasurement = (index: number, value: string) => {
    const measurements = data.measurements.map((m) =>
      m.index === index ? { ...m, value: value === '' ? null : parseFloat(value) } : m
    )
    update({ measurements })
  }

  // Auto-compute stats when measurements or target change
  const stats = useMemo(() => {
    return computeTorqueStats(data.measurements, data.target_torque, data.tolerance_percent)
  }, [data.measurements, data.target_torque, data.tolerance_percent])

  // Sync computed stats to parent data
  useEffect(() => {
    if (
      stats.mean !== data.mean || stats.std_dev !== data.std_dev ||
      stats.cv !== data.cv || stats.cp !== data.cp || stats.cpk !== data.cpk ||
      stats.efficiency !== data.efficiency || stats.result !== data.result
    ) {
      onChange({ ...data, ...stats })
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stats])

  const filledCount = data.measurements.filter(m => m.value !== null && m.value > 0).length

  // Color helpers for measurement values
  const getMeasurementColor = (value: number | null): string => {
    if (value === null || data.target_torque <= 0 || data.tolerance_percent <= 0) return '#F0F2F5'
    const tolerance = data.target_torque * (data.tolerance_percent / 100)
    const USL = data.target_torque + tolerance
    const LSL = data.target_torque - tolerance
    if (value >= LSL && value <= USL) return '#10B981' // green — in spec
    return '#EF4444' // red — out of spec
  }

  return (
    <div className="space-y-6">
      {/* Config */}
      <Card>
        <h3 className="text-sm font-semibold text-[#10B981] mb-4 flex items-center gap-2">
          <Gauge size={16} /> Parametros de torque
        </h3>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <Input
            label="Torque objetivo *"
            type="number"
            min={0}
            step={0.1}
            value={data.target_torque || ''}
            onChange={(e) => update({ target_torque: parseFloat(e.target.value) || 0 })}
            readOnly={readOnly}
          />
          <Input
            label="Tolerancia (%)"
            type="number"
            min={0}
            max={100}
            step={0.5}
            value={data.tolerance_percent || ''}
            onChange={(e) => update({ tolerance_percent: parseFloat(e.target.value) || 0 })}
            readOnly={readOnly}
          />
          <Select
            label="Unidad"
            options={UNITS}
            value={data.unit}
            onChange={(e) => update({ unit: e.target.value as TorqueData['unit'] })}
            disabled={readOnly}
          />
        </div>
        {data.target_torque > 0 && data.tolerance_percent > 0 && (
          <div className="mt-3 px-3 py-2 rounded-lg bg-[#0F1218] border border-[#1E2330]">
            <span className="text-xs text-[#9CA3AF]">
              Rango aceptable: <span className="text-[#10B981] font-mono font-bold">
                {(data.target_torque * (1 - data.tolerance_percent / 100)).toFixed(1)} — {(data.target_torque * (1 + data.tolerance_percent / 100)).toFixed(1)} {data.unit}
              </span>
            </span>
          </div>
        )}
      </Card>

      {/* 10 Measurements Grid */}
      <Card>
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-sm font-semibold text-[#10B981]">10 Mediciones</h3>
          <Badge variant={filledCount >= 10 ? 'success' : 'warning'}>{filledCount}/10</Badge>
        </div>
        <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
          {data.measurements.map((m) => (
            <div key={m.index} className="relative">
              <label className="block text-[10px] text-[#6B7280] mb-1 text-center">#{m.index}</label>
              <input
                type="number"
                min={0}
                step={0.01}
                value={m.value ?? ''}
                onChange={(e) => updateMeasurement(m.index, e.target.value)}
                readOnly={readOnly}
                className="w-full h-12 rounded-lg bg-[#0F1218] border border-[#1E2330] px-3 text-center text-lg font-mono focus:outline-none focus:ring-2 focus:ring-green-500/50 transition-all"
                style={{ color: getMeasurementColor(m.value) }}
                placeholder="—"
              />
            </div>
          ))}
        </div>
      </Card>

      {/* Stats Results */}
      {stats.mean !== null && (
        <Card>
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-sm font-semibold text-[#10B981]">Resultados estadisticos</h3>
            {stats.result && (
              <Badge
                variant={stats.result === 'CAPAZ' ? 'success' : 'danger'}
                size="md"
              >
                {stats.result === 'CAPAZ' ? '✅ CAPAZ' : '⚠️ REVISAR'}
              </Badge>
            )}
          </div>
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
            <StatBox label="Media" value={stats.mean} unit={data.unit} />
            <StatBox label="Desv. Est." value={stats.std_dev} unit={data.unit} />
            <StatBox label="CV (%)" value={stats.cv} unit="%" highlight={stats.cv !== null && stats.cv > 5} />
            <StatBox label="Cp" value={stats.cp} highlight={stats.cp !== null && stats.cp < 1.33} />
            <StatBox label="Cpk" value={stats.cpk} highlight={stats.cpk !== null && stats.cpk < 1.33} />
            <StatBox label="Eficiencia" value={stats.efficiency} unit="%" />
          </div>
          {stats.result === 'REVISAR' && (
            <div className="mt-4 p-3 rounded-lg bg-red-500/10 border border-red-500/20">
              <p className="text-xs text-red-400">
                Cpk &lt; 1.33 — El proceso no es capaz. Se recomienda revisar el equipo o recalibrar.
              </p>
            </div>
          )}
        </Card>
      )}
    </div>
  )
}

function StatBox({ label, value, unit, highlight }: { label: string; value: number | null; unit?: string; highlight?: boolean }) {
  return (
    <div className={`p-3 rounded-lg border ${highlight ? 'bg-red-500/5 border-red-500/20' : 'bg-[#0F1218] border-[#1E2330]'}`}>
      <p className="text-[10px] text-[#6B7280] mb-1">{label}</p>
      <p className={`text-lg font-mono font-bold ${highlight ? 'text-red-400' : 'text-[#F0F2F5]'}`}>
        {value !== null ? value.toFixed(2) : '—'}
        {unit && value !== null && <span className="text-[10px] text-[#6B7280] ml-1">{unit}</span>}
      </p>
    </div>
  )
}
