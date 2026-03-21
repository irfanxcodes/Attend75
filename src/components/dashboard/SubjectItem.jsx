function SubjectItem({ subject }) {
  return (
    <article className="rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-950">
      <div className="flex items-start justify-between gap-3">
        <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">{subject.name}</h3>
        <span className="rounded-full bg-sky-100 px-2.5 py-1 text-xs font-semibold text-sky-700 dark:bg-sky-900/40 dark:text-sky-300">
          {subject.percentage}%
        </span>
      </div>

      <div className="mt-3 grid grid-cols-2 gap-2 text-xs text-slate-600 dark:text-slate-400">
        <p>Total: {subject.totalClasses}</p>
        <p>Attended: {subject.attendedClasses}</p>
      </div>
    </article>
  )
}

export default SubjectItem
