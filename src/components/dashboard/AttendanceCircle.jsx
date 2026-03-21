function AttendanceCircle({ percentage }) {
  const bounded = Math.max(0, Math.min(100, percentage))

  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-950">
      <p className="text-sm font-medium text-slate-500 dark:text-slate-400">Overall Attendance</p>
      <div className="mt-4 flex justify-center">
        <div
          className="relative flex h-36 w-36 items-center justify-center rounded-full"
          style={{
            background: `conic-gradient(rgb(14 165 233) ${bounded * 3.6}deg, rgb(226 232 240) 0deg)`,
          }}
        >
          <div className="flex h-28 w-28 items-center justify-center rounded-full bg-white dark:bg-slate-950">
            <span className="text-3xl font-bold text-slate-900 dark:text-slate-100">{bounded}%</span>
          </div>
        </div>
      </div>
    </section>
  )
}

export default AttendanceCircle
