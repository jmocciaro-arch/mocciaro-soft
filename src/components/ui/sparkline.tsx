interface SparklineProps {
  /** Valores por bucket (viejo → nuevo). Con menos de 2 puntos no renderiza. */
  values: number[]
  stroke?: string
  height?: number
  className?: string
}

/**
 * Sparkline mínima en SVG para KPIs. Solo dibuja datos reales que recibe:
 * la decisión de ocultarla cuando no hay datos suficientes es del caller
 * (ver hasSparkData en @/lib/dashboard/periods).
 */
export function Sparkline({ values, stroke = '#6B7280', height = 22, className }: SparklineProps) {
  if (values.length < 2) return null
  const max = Math.max(...values)
  const min = Math.min(...values)
  const range = max - min || 1
  const points = values
    .map((v, i) => {
      const x = (i / (values.length - 1)) * 100
      const y = 19 - ((v - min) / range) * 16
      return `${x.toFixed(1)},${y.toFixed(1)}`
    })
    .join(' ')
  return (
    <svg
      viewBox="0 0 100 22"
      preserveAspectRatio="none"
      aria-hidden="true"
      className={className ?? 'w-full mt-2'}
      style={{ height }}
    >
      <polyline points={points} fill="none" stroke={stroke} strokeWidth={2} vectorEffect="non-scaling-stroke" />
    </svg>
  )
}
