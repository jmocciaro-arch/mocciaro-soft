'use client'

import { useCallback, useMemo, useState } from 'react'
import {
  TorqueMeasurements,
  type TorqueMeasurementsState,
} from '@/components/sat/torque-measurements'
import { calculateTorqueStats } from '@/lib/sat/torque-calculations'
import type { TorqueData } from '../sat-workflow-types'

interface StepTorqueProps {
  data: TorqueData
  onChange: (data: TorqueData) => void
  readOnly?: boolean
}

// ── Converter TorqueData -> TorqueMeasurementsState ─────────────────
function toMeasurementsState(
  d: TorqueData,
  localMin: Array<number | null>,
  localMax: Array<number | null>,
): TorqueMeasurementsState {
  const tol = d.tolerance_percent || 0
  const nom = d.target_torque || null
  const tgt: Array<number | null> = Array.from({ length: 10 }, (_, i) => {
    const m = d.measurements.find((x) => x.index === i + 1)
    return m ? m.value : null
  })
  return {
    lci: nom !== null && tol > 0 ? nom * (1 - tol / 100) : null,
    nom,
    lcs: nom !== null && tol > 0 ? nom * (1 + tol / 100) : null,
    unit: d.unit,
    min: localMin,
    max: localMax,
    tgt,
  }
}

export function StepTorque({ data, onChange, readOnly }: StepTorqueProps) {
  // min/max no persisten en TorqueData → state local
  const [localMin, setLocalMin] = useState<Array<number | null>>(Array(10).fill(null))
  const [localMax, setLocalMax] = useState<Array<number | null>>(Array(10).fill(null))

  const update = useCallback((partial: Partial<TorqueData>) => {
    onChange({ ...data, ...partial })
  }, [data, onChange])

  const state = useMemo(
    () => toMeasurementsState(data, localMin, localMax),
    [data, localMin, localMax],
  )

  const handleChange = (next: TorqueMeasurementsState) => {
    if (readOnly) return
    // Actualizar min/max locales
    setLocalMin(next.min)
    setLocalMax(next.max)

    // Derivar target_torque y tolerance_percent desde nom/lci/lcs
    let target = next.nom ?? 0
    let tol = data.tolerance_percent
    if (next.nom !== null && next.lci !== null && next.lcs !== null && next.nom !== 0) {
      // tolerancia simétrica aproximada
      const upper = ((next.lcs - next.nom) / next.nom) * 100
      const lower = ((next.nom - next.lci) / next.nom) * 100
      tol = Math.round(((upper + lower) / 2) * 100) / 100
      target = next.nom
    } else if (next.nom !== null) {
      target = next.nom
    }

    // Calcular estadísticas con los valores actuales
    const stats = calculateTorqueStats({
      lci: next.lci,
      nom: next.nom,
      lcs: next.lcs,
      min_values: next.min,
      max_values: next.max,
      tgt_values: next.tgt,
    })

    update({
      target_torque: target,
      tolerance_percent: tol,
      unit: next.unit,
      measurements: next.tgt.map((v, i) => ({ index: i + 1, value: v })),
      mean: stats.mean,
      std_dev: stats.stddev,
      cv: stats.cv,
      cp: stats.cp,
      cpk: stats.cpk,
      efficiency: stats.efficiency,
      result: stats.result,
    })
  }

  const updateHeader = (patch: { target_torque?: number; tolerance_percent?: number; unit?: TorqueData['unit'] }) => {
    if (readOnly) return
    const next: TorqueData = { ...data, ...patch }
    const tol = next.tolerance_percent || 0
    const nom = next.target_torque || null
    // Recalcular stats con nuevos lci/lcs
    const stats = calculateTorqueStats({
      lci: nom !== null && tol > 0 ? nom * (1 - tol / 100) : null,
      nom,
      lcs: nom !== null && tol > 0 ? nom * (1 + tol / 100) : null,
      min_values: localMin,
      max_values: localMax,
      tgt_values: next.measurements.map((m) => m.value),
    })
    update({
      ...patch,
      mean: stats.mean,
      std_dev: stats.stddev,
      cv: stats.cv,
      cp: stats.cp,
      cpk: stats.cpk,
      efficiency: stats.efficiency,
      result: stats.result,
    })
  }

  return (
    <div className="space-y-4">
      {/* Header con target + tolerance + unit */}
      <div
        style={{
          background: 'var(--sat-dk2)',
          border: '1px solid var(--sat-br)',
          borderRadius: 12,
          padding: 16,
        }}
      >
        <div className="sn sn-g" style={{ marginBottom: 10 }}>Parámetros de torque</div>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <div className="fg">
            <label>Torque objetivo</label>
            <input
              type="number"
              min={0}
              step={0.01}
              value={data.target_torque || ''}
              onChange={(e) => updateHeader({ target_torque: parseFloat(e.target.value) || 0 })}
              readOnly={readOnly}
            />
          </div>
          <div className="fg">
            <label>Tolerancia %</label>
            <input
              type="number"
              min={0}
              max={100}
              step={0.5}
              value={data.tolerance_percent || ''}
              onChange={(e) => updateHeader({ tolerance_percent: parseFloat(e.target.value) || 0 })}
              readOnly={readOnly}
            />
          </div>
          <div className="fg">
            <label>Unidad</label>
            <select
              value={data.unit}
              onChange={(e) => updateHeader({ unit: e.target.value as TorqueData['unit'] })}
              disabled={readOnly}
            >
              <option value="Nm">Nm</option>
              <option value="ft-lb">ft-lb</option>
              <option value="kgf-cm">kgf·cm</option>
            </select>
          </div>
        </div>
      </div>

      {/* Core measurements table */}
      <div
        style={{
          background: 'var(--sat-dk2)',
          border: '1px solid var(--sat-br)',
          borderRadius: 12,
          padding: 16,
        }}
      >
        <TorqueMeasurements value={state} onChange={handleChange} />
      </div>
    </div>
  )
}
