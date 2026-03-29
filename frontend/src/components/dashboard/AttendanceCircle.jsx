function RefreshIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" className="h-4 w-4">
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

function AttendanceCircle({ percentage, totalClasses, totalAttended, status, onRefresh, isRefreshing }) {
  const bounded = Math.max(0, Math.min(100, percentage))
  const circumference = 2 * Math.PI * 50
  const offset = circumference - (bounded / 100) * circumference

  const percentageColor = bounded > 75 ? '#22C55E' : bounded >= 60 ? '#F59E0B' : '#EF4444'

  return (
    <section className="rounded-2xl border border-white/20 bg-[#312051] p-4">
      <div className="flex items-center justify-between">
        <p className="text-sm font-medium text-[#D1D1D1]">Overall Attendance</p>
        <button
          type="button"
          onClick={onRefresh}
          disabled={isRefreshing}
          className="inline-flex h-7 w-7 items-center justify-center rounded-md border border-white/20 text-[#E8A08C] transition-colors hover:bg-white/10 disabled:opacity-60"
          aria-label="Reload attendance"
        >
          <RefreshIcon />
        </button>
      </div>

      <div className="mt-3 flex items-center gap-4">
        <div className="relative h-28 w-28 shrink-0">
          <svg viewBox="0 0 120 120" className="h-28 w-28 -rotate-90">
            <circle cx="60" cy="60" r="50" stroke="rgba(255,255,255,0.16)" strokeWidth="10" fill="none" />
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
          <div className="absolute inset-0 flex items-center justify-center">
            <span className="text-[30px] font-bold" style={{ color: percentageColor }}>
              {bounded}%
            </span>
          </div>
        </div>

        <div className="space-y-1.5 text-sm text-[#D1D1D1]">
          <p>
            Status: <span className="capitalize text-[#E7DEDE]">{status}</span>
          </p>
          <p>
            Classes conducted: <span className="text-[#E7DEDE]">{totalClasses}</span>
          </p>
          <p>
            Classes attended: <span className="text-[#E7DEDE]">{totalAttended}</span>
          </p>
        </div>
      </div>
    </section>
  )
}

export default AttendanceCircle
