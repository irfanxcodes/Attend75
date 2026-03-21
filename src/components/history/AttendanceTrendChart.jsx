function buildPolylinePoints(points, width, height) {
  if (!points.length) {
    return ''
  }

  return points
    .map((value, index) => {
      const x = (index / Math.max(1, points.length - 1)) * width
      const y = height - (value / 100) * height
      return `${x},${y}`
    })
    .join(' ')
}

function AttendanceTrendChart({ history }) {
  const values = history.map((entry) => entry.attendanceRate)
  const chartWidth = 300
  const chartHeight = 120
  const polylinePoints = buildPolylinePoints(values, chartWidth, chartHeight)

  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-950">
      <h2 className="text-base font-semibold text-slate-900 dark:text-slate-100">Attendance Trend</h2>
      <div className="mt-3 overflow-x-auto">
        <svg viewBox={`0 0 ${chartWidth} ${chartHeight}`} className="h-32 w-full min-w-[300px]">
          <polyline fill="none" stroke="rgb(14 165 233)" strokeWidth="3" points={polylinePoints} strokeLinecap="round" />
          {values.map((value, index) => {
            const x = (index / Math.max(1, values.length - 1)) * chartWidth
            const y = chartHeight - (value / 100) * chartHeight

            return <circle key={`${history[index]?.date}-${value}`} cx={x} cy={y} r="3" fill="rgb(14 165 233)" />
          })}
        </svg>
      </div>
    </section>
  )
}

export default AttendanceTrendChart
