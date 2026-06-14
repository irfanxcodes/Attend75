function polarToCartesian(centerX, centerY, radius, angle) {
  const x = centerX + radius * Math.cos(angle)
  const y = centerY + radius * Math.sin(angle)
  return { x, y }
}

function buildPolygonPoints(values, maxValue, centerX, centerY, radius) {
  if (!values.length || maxValue <= 0) return ''
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

function MarksRadarChart({ data, isLoading = false, selectedSubjectCode = '' }) {
  const chartSize = 280
  const center = chartSize / 2
  const outerRadius = 95
  const levels = [0.2, 0.4, 0.6, 0.8, 1]
  const maxValue = 60
  const subjects = Array.isArray(data) ? data : []

  if (isLoading) {
    return (
      <div className="flex h-full items-center justify-center">
        <div className="h-56 w-56 animate-pulse rounded-full bg-[#3D3660]/50" />
      </div>
    )
  }

  if (!subjects.length) {
    return (
      <div className="flex h-full items-center justify-center">
        <p className="text-sm text-[#9F9AB5]">No marks data available yet.</p>
      </div>
    )
  }

  const step = (Math.PI * 2) / subjects.length
  const startAngle = -Math.PI / 2

  const selectedIndex = subjects.findIndex((s) => s.subjectCode === selectedSubjectCode)

  const axisPoints = subjects.map((subject, index) => {
    const angle = startAngle + step * index
    const edge = polarToCartesian(center, center, outerRadius, angle)
    const label = polarToCartesian(center, center, outerRadius + 22, angle)
    return { id: subject.subjectCode, angle, edge, label, labelText: subject.subjectCode }
  })

  const polygonPoints = buildPolygonPoints(
    subjects.map((s) => s.total),
    maxValue,
    center,
    center,
    outerRadius,
  )

  return (
    <div className="flex items-center justify-center">
      <svg viewBox={`0 0 ${chartSize} ${chartSize}`} role="img" aria-label="Marks radar chart" className="h-56 w-56 sm:h-64 sm:w-64">
        <defs>
          {/* Glow filter for selected point */}
          <filter id="selectedGlow" x="-50%" y="-50%" width="200%" height="200%">
            <feGaussianBlur stdDeviation="3" result="blur" />
            <feMerge>
              <feMergeNode in="blur" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
        </defs>

        {/* Grid levels */}
        {levels.map((level) => {
          const ringPoints = axisPoints
            .map((point) => {
              const p = polarToCartesian(center, center, outerRadius * level, point.angle)
              return `${p.x},${p.y}`
            })
            .join(' ')
          return <polygon key={level} points={ringPoints} fill="none" stroke="rgba(255,255,255,0.1)" strokeWidth="0.8" />
        })}

        {/* Axis lines */}
        {axisPoints.map((point) => (
          <line key={`${point.id}-axis`} x1={center} y1={center} x2={point.edge.x} y2={point.edge.y} stroke="rgba(255,255,255,0.08)" strokeWidth="0.8" />
        ))}

        {/* Data polygon */}
        <polygon
          points={polygonPoints}
          fill="rgba(255,145,108,0.2)"
          stroke="#FF916C"
          strokeWidth="2"
          style={{ transition: 'all 0.4s cubic-bezier(0.4, 0, 0.2, 1)' }}
        />

        {/* Highlight line from center to selected point */}
        {selectedIndex >= 0 ? (() => {
          const ratio = Math.max(0, Math.min(1, Number(subjects[selectedIndex].total || 0) / maxValue))
          const point = polarToCartesian(center, center, ratio * outerRadius, startAngle + step * selectedIndex)
          return (
            <line
              x1={center}
              y1={center}
              x2={point.x}
              y2={point.y}
              stroke="#4EF0A0"
              strokeWidth="1.5"
              strokeDasharray="4 2"
              opacity="0.6"
              style={{ transition: 'all 0.4s cubic-bezier(0.4, 0, 0.2, 1)' }}
            />
          )
        })() : null}

        {/* Data points */}
        {subjects.map((subject, index) => {
          const ratio = Math.max(0, Math.min(1, Number(subject.total || 0) / maxValue))
          const point = polarToCartesian(center, center, ratio * outerRadius, startAngle + step * index)
          const isSelected = index === selectedIndex
          const isHighlighted = isSelected

          return (
            <circle
              key={subject.subjectCode}
              cx={point.x}
              cy={point.y}
              r={isHighlighted ? 6 : 3.5}
              fill={isHighlighted ? '#4EF0A0' : '#F7F4FF'}
              stroke={isHighlighted ? '#4EF0A0' : '#2D2845'}
              strokeWidth={isHighlighted ? 2 : 1.5}
              filter={isHighlighted ? 'url(#selectedGlow)' : undefined}
              style={{ transition: 'all 0.4s cubic-bezier(0.4, 0, 0.2, 1)' }}
            />
          )
        })}

        {/* Labels */}
        {axisPoints.map((point, index) => {
          const isSelected = index === selectedIndex
          return (
            <text
              key={`${point.id}-label`}
              x={point.label.x}
              y={point.label.y}
              textAnchor="middle"
              dominantBaseline="middle"
              fontSize={isSelected ? '12' : '11'}
              fontWeight={isSelected ? '800' : '600'}
              fill={isSelected ? '#4EF0A0' : '#9F9AB5'}
              style={{ transition: 'all 0.3s ease-out' }}
            >
              {point.labelText}
            </text>
          )
        })}

        {/* Selected subject score tooltip — positioned near the label, not the data point */}
        {selectedIndex >= 0 ? (() => {
          const subject = subjects[selectedIndex]
          const labelPoint = axisPoints[selectedIndex].label
          // Place tooltip below the label text
          const tooltipX = labelPoint.x
          const tooltipY = labelPoint.y + 14

          return (
            <g style={{ transition: 'all 0.4s cubic-bezier(0.4, 0, 0.2, 1)' }}>
              <rect
                x={tooltipX - 20}
                y={tooltipY - 9}
                width="40"
                height="18"
                rx="4"
                fill="#2D2845"
                stroke="#4EF0A0"
                strokeWidth="1"
                opacity="0.95"
              />
              <text
                x={tooltipX}
                y={tooltipY + 1}
                textAnchor="middle"
                dominantBaseline="middle"
                fontSize="9"
                fontWeight="700"
                fill="#4EF0A0"
              >
                {subject.total}
              </text>
            </g>
          )
        })() : null}
      </svg>
    </div>
  )
}

export default MarksRadarChart
