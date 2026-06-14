function RefreshIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" className="h-3.5 w-3.5">
      <path
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M20 12a8 8 0 1 1-2.34-5.66M20 4v5h-5"
      />
    </svg>
  )
}

function AttendanceCircle({
  percentage,
  totalClasses,
  totalAttended,
  classesLeft,
  canMiss,
  toAttend,
  status,
  onRefresh,
  isRefreshing,
}) {
  const bounded = Math.max(0, Math.min(100, percentage))
  const circumference = 2 * Math.PI * 50
  const offset = circumference - (bounded / 100) * circumference

  const percentageColor = bounded > 75 ? '#4EF0A0' : bounded >= 60 ? '#FFB23E' : '#FF5B5B'
  const headline =
    status === 'safe'
      ? "You're clear of the 75% line."
      : status === 'borderline'
        ? "Close to the 75% line."
        : 'Need more classes for 75%.'
  const detail =
    status === 'safe'
      ? `Skip up to ${Math.max(0, canMiss)} more classes and stay above target.`
      : `Attend your next classes to improve from ${bounded}%.`

  return (
    <section className="rounded-2xl border border-[#47D796]/70 bg-[#4A466A] p-3 shadow-[0_8px_20px_rgba(40,36,62,0.18)] md:p-4">
      <div className="flex items-start justify-between">
        <div className="flex items-center gap-2">
          <span className="inline-flex rounded-full bg-[#4EF0A0] px-2 py-0.5 text-[10px] font-extrabold uppercase tracking-wide text-[#1C2030]">
            {status}
          </span>
        </div>
        <button
          type="button"
          onClick={onRefresh}
          disabled={isRefreshing}
          className="inline-flex h-6 w-6 items-center justify-center rounded-md border border-white/15 text-[#D8D4E7] transition-colors hover:bg-white/10 disabled:opacity-60"
          aria-label="Reload attendance"
        >
          <RefreshIcon />
        </button>
      </div>

      <div className="mt-2 grid gap-4 md:grid-cols-[130px_1fr] md:items-center">
        <div className="relative mx-auto h-[120px] w-[120px] shrink-0 md:mx-0 md:h-[130px] md:w-[130px]">
          <svg viewBox="0 0 120 120" className="h-full w-full -rotate-90">
            <circle cx="60" cy="60" r="50" stroke="#302A52" strokeWidth="10" fill="none" />
            <circle
              cx="60"
              cy="60"
              r="50"
              stroke={percentageColor}
              strokeWidth="10"
              strokeLinecap="round"
              fill="none"
              strokeDasharray={circumference}
              strokeDashoffset={offset}
              className="transition-all duration-500"
            />
          </svg>
          <div className="absolute inset-0 flex flex-col items-center justify-center">
            <span className="text-3xl font-extrabold leading-none" style={{ color: percentageColor }}>{bounded}%</span>
            <span className="mt-1 text-[10px] font-semibold text-[#9F9AB5]">of 75% target</span>
          </div>
        </div>

        <div>
          <h2 className="max-w-xl text-lg font-extrabold leading-tight text-[#F7F4FF] md:text-xl">
            {headline}
          </h2>
          <p className="mt-1 text-xs font-medium text-[#D8D4E7]">{detail}</p>
        </div>
      </div>

      <div className="mt-3 grid grid-cols-5 gap-3 border-t border-white/10 pt-3">
        {[
          ['Conducted', totalClasses, '#F7F4FF'],
          ['Attended', totalAttended, '#4EF0A0'],
          ['Can Miss', Math.max(0, canMiss), '#4EF0A0'],
          ['To Attend', Math.max(0, toAttend), '#FFB23E'],
          ['Classes Left', Math.max(0, classesLeft), '#6CB4FF'],
        ].map(([label, value, color]) => (
          <div key={label}>
            <p className="text-[9px] font-extrabold uppercase tracking-[0.18em] text-[#BDB8CC]">{label}</p>
            <p className="mt-1 text-2xl font-extrabold leading-none" style={{ color }}>{value}</p>
          </div>
        ))}
      </div>
    </section>
  )
}

export default AttendanceCircle
