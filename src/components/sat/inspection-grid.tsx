'use client'

import { PARTS, PART_LBL, type PartKey } from '@/lib/sat/fein-data'

export type PartStatus = 'OK' | 'NOK' | 'NA' | ''
export type InspectionState = Record<PartKey, PartStatus>

export function emptyInspection(): InspectionState {
  return PARTS.reduce((acc, p) => ({ ...acc, [p]: '' as PartStatus }), {} as InspectionState)
}

interface Props {
  value: InspectionState
  onChange: (next: InspectionState) => void
  disabled?: boolean
  title?: string
}

/** Grid de 8 partes con toggles OK/NOK/NA (design Buscatools). */
export function InspectionGrid({ value, onChange, disabled, title }: Props) {
  const setPart = (part: PartKey, status: PartStatus) => {
    if (disabled) return
    onChange({ ...value, [part]: value[part] === status ? '' : status })
  }

  return (
    <div className="space-y-3">
      {title && (
        <div className="sn sn-o" style={{ marginBottom: 8 }}>{title}</div>
      )}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
        {PARTS.map((p) => {
          const v = value[p]
          const cardClass = v === 'OK' ? 'pc ok-st' : v === 'NOK' ? 'pc nok-st' : 'pc'
          return (
            <div key={p} className={cardClass}>
              <span className="pc-nm">{PART_LBL[p]}</span>
              <div className="pc-tg">
                <button
                  type="button"
                  className={`tgl ${v === 'OK' ? 's-ok' : ''}`}
                  onClick={() => setPart(p, 'OK')}
                  disabled={disabled}
                >OK</button>
                <button
                  type="button"
                  className={`tgl ${v === 'NOK' ? 's-nok' : ''}`}
                  onClick={() => setPart(p, 'NOK')}
                  disabled={disabled}
                >NOK</button>
                <button
                  type="button"
                  className={`tgl ${v === 'NA' ? 's-na' : ''}`}
                  onClick={() => setPart(p, 'NA')}
                  disabled={disabled}
                >N/A</button>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
