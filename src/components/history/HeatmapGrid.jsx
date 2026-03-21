function intensityClass(rate) {
  if (rate >= 90) return 'bg-emerald-600'
  if (rate >= 75) return 'bg-emerald-500'
  if (rate >= 60) return 'bg-emerald-400'
  if (rate > 0) return 'bg-emerald-200 dark:bg-emerald-800'
  return 'bg-slate-200 dark:bg-slate-800'
}

function HeatmapGrid({ history }) {
  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-950">
      <h2 className="text-base font-semibold text-slate-900 dark:text-slate-100">Daily Activity</h2>
      <div className="mt-3 grid grid-cols-7 gap-2">
        {history.map((entry) => (
          <div key={entry.date} className="flex flex-col items-center gap-1">
            <span className={[`h-6 w-6 rounded-md`, intensityClass(entry.attendanceRate)].join(' ')} />
            <span className="text-[10px] text-slate-500 dark:text-slate-400">{entry.date.slice(8)}</span>
          </div>
        ))}
      </div>
    </section>
  )
}

export default HeatmapGrid
