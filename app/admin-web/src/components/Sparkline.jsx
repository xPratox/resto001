import { useId } from 'react'

function buildPoints(data, width, height, padding) {
  const values = data.length ? data : [0, 0, 0, 0]
  const min = Math.min(...values)
  const max = Math.max(...values)
  const stepX = values.length > 1 ? (width - padding * 2) / (values.length - 1) : 0

  return values.map((value, index) => {
    const normalized = max === min ? 0.5 : (value - min) / (max - min)
    const x = padding + stepX * index
    const y = height - padding - normalized * (height - padding * 2)

    return [x, y]
  })
}

function Sparkline({ data = [], className = '' }) {
  const gradientId = useId()
  const width = 112
  const height = 36
  const points = buildPoints(data.filter((value) => Number.isFinite(value)).map(Number), width, height, 4)
  const pointList = points.map(([x, y]) => `${x},${y}`).join(' ')

  return (
    <svg viewBox={`0 0 ${width} ${height}`} className={className} fill="none" aria-hidden="true">
      <defs>
        <linearGradient id={gradientId} x1="0" y1="0" x2={width} y2="0">
          <stop offset="0%" stopColor="rgb(34 211 238)" stopOpacity="0.95" />
          <stop offset="100%" stopColor="rgb(186 230 253)" stopOpacity="0.6" />
        </linearGradient>
      </defs>

      <polyline points={pointList} stroke={`url(#${gradientId})`} strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

export default Sparkline