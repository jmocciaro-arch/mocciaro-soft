'use client'

interface Props {
  score?: number | null
  temperature?: 'hot' | 'warm' | 'cold' | null
  tags?: string[]
  size?: 'sm' | 'md'
}

/**
 * Badge visual para mostrar el scoring IA del lead.
 * El score es siempre una banda de 20 (0, 20, 40, 60, 80, 100).
 */
export function LeadScoreBadge({ score, temperature, tags, size = 'sm' }: Props) {
  if (score == null && !temperature) return null

  // Snap defensivo (por si viene un valor viejo sin banda)
  const snapped = score != null ? Math.round(score / 20) * 20 : null

  const icon = temperature === 'hot' ? '🔥' : temperature === 'warm' ? '🌡️' : '❄️'
  const bg =
    temperature === 'hot' ? 'rgba(239,68,68,0.15)'
    : temperature === 'warm' ? 'rgba(249,115,22,0.15)'
    : 'rgba(59,130,246,0.15)'
  const border =
    temperature === 'hot' ? 'rgba(239,68,68,0.4)'
    : temperature === 'warm' ? 'rgba(249,115,22,0.4)'
    : 'rgba(59,130,246,0.4)'
  const color =
    temperature === 'hot' ? '#ef4444'
    : temperature === 'warm' ? '#f97316'
    : '#3b82f6'

  const padding = size === 'md' ? '6px 10px' : '3px 7px'
  const fontSize = size === 'md' ? 13 : 11

  return (
    <div className="inline-flex items-center gap-1.5" style={{
      background: bg, border: `1px solid ${border}`, borderRadius: 999,
      padding, fontSize, color, fontWeight: 600,
    }}>
      <span>{icon}</span>
      {snapped != null && (
        <>
          <span>{snapped}%</span>
          {/* Barra de 5 segmentos */}
          <span className="inline-flex gap-0.5" style={{ marginLeft: 2 }}>
            {[20, 40, 60, 80, 100].map((threshold) => (
              <span
                key={threshold}
                style={{
                  width: size === 'md' ? 6 : 4,
                  height: size === 'md' ? 10 : 7,
                  borderRadius: 1,
                  background: snapped >= threshold ? color : 'rgba(255,255,255,0.15)',
                }}
              />
            ))}
          </span>
        </>
      )}
      {temperature && <span style={{ textTransform: 'uppercase' }}>{temperature}</span>}
      {tags?.slice(0, 2).map((t) => (
        <span key={t} style={{ opacity: 0.8, fontWeight: 500 }}>· {t}</span>
      ))}
    </div>
  )
}
