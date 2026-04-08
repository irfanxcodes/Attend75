function polarToCartesian(centerX, centerY, radius, angle) {
  const x = centerX + radius * Math.cos(angle)
  const y = centerY + radius * Math.sin(angle)
  return { x, y }
}

function buildPolygonPoints(values, maxValue, centerX, centerY, radius) {
  if (!values.length || maxValue <= 0) {
    return ''
  }

  const step = (Math.PI * 2) / values.length
  const startAngle = -Math.PI / 2

  return values
    .map((value, index) => {
      const ratio = Math.max(0, Math.min(1, Number(value || 0) / maxValue))
      const point = polarToCartesian(centerX, centerY, ratio * radius, startAngle + step * index)
      return `${point.x},${point.y}`
    })
    .join(' ')
}

function MarksRadarChart({ data, isLoading = false }) {
  const chartSize = 320
  const center = chartSize / 2
  const outerRadius = 110
  const levels = [0.2, 0.4, 0.6, 0.8, 1]
  const maxValue = 60
  const subjects = Array.isArray(data) ? data : []

  if (isLoading) {
    return (
      <section className="pb-4 pt-2">
        <div className="mx-auto h-72 w-72 animate-pulse rounded-2xl bg-[#2A2148]/65 sm:h-80 sm:w-80" />
      </section>
    )
  }

  if (!subjects.length) {
    return (
      <section className="pb-4 pt-2">
        <p className="text-sm text-[#D1D1D1]">No marks data available yet.</p>
      </section>
    )
  }

  const step = (Math.PI * 2) / subjects.length
  const startAngle = -Math.PI / 2

  const axisPoints = subjects.map((subject, index) => {
    const angle = startAngle + step * index
    const edge = polarToCartesian(center, center, outerRadius, angle)
    const label = polarToCartesian(center, center, outerRadius + 20, angle)

    return {
      id: subject.subjectCode,
      angle,
      edge,
      label,
      labelText: subject.subjectCode,
    }
  })

  const polygonPoints = buildPolygonPoints(
    subjects.map((subject) => subject.total),
    maxValue,
    center,
    center,
    outerRadius,
  )

  return (
    <section className="pb-4 pt-2">
      <div className="mx-auto flex max-w-sm justify-center sm:max-w-md">
        <svg viewBox={`0 0 ${chartSize} ${chartSize}`} role="img" aria-label="Marks radar chart" className="h-72 w-72 sm:h-80 sm:w-80">
          {levels.map((level) => {
            const ringPoints = axisPoints
              .map((point) => {
                const p = polarToCartesian(center, center, outerRadius * level, point.angle)
                return `${p.x},${p.y}`
              })
              .join(' ')

            return (
              <polygon
                key={level}
                points={ringPoints}
                fill="none"
                stroke="rgba(255,255,255,0.16)"
                strokeWidth="1"
              />
            )
          })}

          {axisPoints.map((point) => (
            <line
              key={`${point.id}-axis`}
              x1={center}
              y1={center}
              x2={point.edge.x}
              y2={point.edge.y}
              stroke="rgba(255,255,255,0.14)"
              strokeWidth="1"
            />
          ))}

          <polygon points={polygonPoints} fill="rgba(239,68,68,0.5)" stroke="rgba(244,114,182,0.7)" strokeWidth="2" />

          {axisPoints.map((point) => (
            <text
              key={`${point.id}-label`}
              x={point.label.x}
              y={point.label.y}
              textAnchor="middle"
              dominantBaseline="middle"
              fontSize="12"
              fontWeight="600"
              fill="#B6AECF"
            >
              {point.labelText}
            </text>
          ))}
        </svg>
      </div>
    </section>
  )
}

export default MarksRadarChart
