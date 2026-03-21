import SubjectItem from './SubjectItem'

function SubjectList({ subjects }) {
  if (!subjects.length) {
    return (
      <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-950">
        <h2 className="text-base font-semibold text-slate-900 dark:text-slate-100">Subjects</h2>
        <p className="mt-2 text-sm text-slate-500 dark:text-slate-400">No subject data available.</p>
      </section>
    )
  }

  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-950">
      <div className="flex items-center justify-between">
        <h2 className="text-base font-semibold text-slate-900 dark:text-slate-100">Subjects</h2>
        <p className="text-xs text-slate-500 dark:text-slate-400">{subjects.length} total</p>
      </div>

      <div className="mt-3 max-h-64 space-y-3 overflow-y-auto pr-1">
        {subjects.map((subject) => (
          <SubjectItem key={subject.id} subject={subject} />
        ))}
      </div>
    </section>
  )
}

export default SubjectList
