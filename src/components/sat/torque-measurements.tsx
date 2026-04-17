'use client'

import { useMemo } from 'react'
import { calculateTorqueStats, cpColor, type TorqueStats } from '@/lib/sat/torque-calculations'

export interface TorqueMeasurementsState {
  lci: number | null
  nom: number | null
  lcs: number | null
  unit: 'Nm' | 'ft-lb' | 'kgf-cm'
  min: Array<number | null>
  max: Array<number | null>
  tgt: Array<number | null>
}

export function emptyTorqueState(): TorqueMeasurementsState {
  return {
    lci: null, nom: null, lcs: null, unit: 'Nm',
    min: Array(10).fill(null),
    max: Array(10).fill(null),
    tgt: Array(10).fill(null),
  }
}

interface Props {
  value: TorqueMeasurementsState
  onChange: (next: TorqueMeasurementsState) => void
  stats?: TorqueStats | null
}

export function TorqueMeasurements({ value, onChange, stats: externalStats }: Props) {
  const stats = useMemo<TorqueStats>(() => {
    if (externalStats) return externalStats
    return calculateTorqueStats({
      lci: value.lci,
      nom: value.nom,
      lcs: value.lcs,
      min_values: value.min,
      max_values: value.max,
      tgt_values: value.tgt,
    })
  }, [value, externalStats])

  const setCell = (field: 'min' | 'max' | 'tgt', idx: number, v: string) => {
    const num = v === '' ? null : parseFloat(v)
    const next = { ...value, [field]: [...value[field]] }
    next[field][idx] = isNaN(num as number) ? null : (num as number)
    onChange(next)
  }

  const setLim = (field: 'lci' | 'nom' | 'lcs', v: string) => {
    const num = v === '' ? null : parseFloat(v)
    onChange({ ...value, [field]: isNaN(num as number) ? null : num })
  }

  return (
    <div className="space-y-3">
      <div className="sn sn-g">TORQUE — Parámetros y mediciones</div>

      {/* Limites */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <div className="fg">
          <label>LCI (limite inferior)</label>
          <input
            type="number"
            step="0.01"
            value={value.lci ?? ''}
            onChange={(e) => setLim('lci', e.target.value)}
          />
        </div>
        <div className="fg">
          <label>Nominal</label>
          <input
            type="number"
            step="0.01"
            value={value.nom ?? ''}
            onChange={(e) => setLim('nom', e.target.value)}
          />
        </div>
        <div className="fg">
          <label>LCS (limite superior)</label>
          <input
            type="number"
            step="0.01"
            value={value.lcs ?? ''}
            onChange={(e) => setLim('lcs', e.target.value)}
          />
        </div>
      </div>

      {/* 10 mediciones */}
      <div style={{ overflowX: 'auto' }}>
        <table className="sat-table" style={{ minWidth: 520 }}>
          <thead>
            <tr>
              <th style={{ width: 40 }}>N°</th>
              <th>MIN</th>
              <th>MAX</th>
              <th>TGT</th>
              <th>Repet. %</th>
            </tr>
          </thead>
          <tbody>
            {Array.from({ length: 10 }).map((_, i) => (
              <tr key={i}>
                <td style={{ color: 'var(--sat-tx3)', fontFamily: 'var(--sat-mo)' }}>{i + 1}</td>
                <td>
                  <input
                    type="number"
                    step="0.01"
                    value={value.min[i] ?? ''}
                    onChange={(e) => setCell('min', i, e.target.value)}
                    style={{ width: 80, padding: '4px 8px' }}
                  />
                </td>
                <td>
                  <input
                    type="number"
                    step="0.01"
                    value={value.max[i] ?? ''}
                    onChange={(e) => setCell('max', i, e.target.value)}
                    style={{ width: 80, padding: '4px 8px' }}
                  />
                </td>
                <td>
                  <input
                    type="number"
                    step="0.01"
                    value={value.tgt[i] ?? ''}
                    onChange={(e) => setCell('tgt', i, e.target.value)}
                    style={{ width: 80, padding: '4px 8px' }}
                  />
                </td>
                <td style={{ fontFamily: 'var(--sat-mo)', fontSize: 13, color: 'var(--sat-tx2)' }}>
                  {stats.repetibilidad[i] !== null && stats.repetibilidad[i] !== undefined
                    ? stats.repetibilidad[i]!.toFixed(2) + '%'
                    : '–'}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Estadisticas */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <StatCard label="Promedio TGT" value={stats.mean} suffix={value.unit} />
        <StatCard label="σ (std dev)" value={stats.stddev} />
        <StatCard
          label="Cp"
          value={stats.cp}
          tone={cpColor(stats.cp)}
        />
        <StatCard
          label="Cpk"
          value={stats.cpk}
          tone={cpColor(stats.cpk)}
        />
        <StatCard label="CV %" value={stats.cv} suffix="%" />
        <StatCard label="Eficiencia" value={stats.efficiency} suffix="%" tone="green" />
        <StatCard label="Prom MIN" value={stats.mean_min} suffix={value.unit} />
        <StatCard label="Prom MAX" value={stats.mean_max} suffix={value.unit} />
      </div>

      {/* Resultado */}
      {stats.result && (
        <div
          className="sn"
          style={{
            background: stats.result === 'CAPAZ' ? 'var(--sat-gn-d)' : 'var(--sat-rd-d)',
            color: stats.result === 'CAPAZ' ? 'var(--sat-gn)' : 'var(--sat-rd)',
            borderLeftColor: stats.result === 'CAPAZ' ? 'var(--sat-gn)' : 'var(--sat-rd)',
            fontSize: 16,
          }}
        >
          {stats.result === 'CAPAZ' ? '✓ CAPAZ (Cpk ≥ 1.33)' : '⚠ REVISAR (Cpk < 1.33)'}
        </div>
      )}
    </div>
  )
}

function StatCard({
  label, value, suffix, tone = 'gray',
}: { label: string; value: number | null; suffix?: string; tone?: 'green' | 'amber' | 'red' | 'gray' }) {
  const toneColor = {
    green: 'var(--sat-gn)',
    amber: 'var(--sat-am)',
    red: 'var(--sat-rd)',
    gray: 'var(--sat-tx)',
  }[tone]
  return (
    <div
      style={{
        background: 'var(--sat-dk3)',
        border: '1px solid var(--sat-br)',
        borderRadius: 8,
        padding: '8px 12px',
      }}
    >
      <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--sat-tx3)', textTransform: 'uppercase', letterSpacing: 0.5 }}>
        {label}
      </div>
      <div style={{ fontSize: 20, fontWeight: 700, fontFamily: 'var(--sat-mo)', color: toneColor }}>
        {value === null || isNaN(value) ? '–' : value.toFixed(2)}
        {suffix && value !== null && !isNaN(value) && <span style={{ fontSize: 13, color: 'var(--sat-tx3)', marginLeft: 4 }}>{suffix}</span>}
      </div>
    </div>
  )
}
