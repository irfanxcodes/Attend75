function SubjectItem({ subject }) {
  const percentageColor =
    subject.percentage > 75 ? '#22C55E' : subject.percentage >= 60 ? '#F59E0B' : '#EF4444'

  return (
    <article className="rounded-xl border border-white/15 bg-[#3A315D] p-4">
      <div className="flex items-start justify-between gap-3">
        <h3 className="text-sm font-semibold text-[#E7DEDE]">{subject.name}</h3>
        <span className="rounded-full bg-black/15 px-2.5 py-1 text-xs font-semibold" style={{ color: percentageColor }}>
          {subject.percentage}%
        </span>
      </div>

      <div className="mt-3 grid grid-cols-2 gap-2 text-xs text-[#D1D1D1]">
        <p>Total: {subject.totalClasses}</p>
        <p>Attended: {subject.attendedClasses}</p>
      </div>
    </article>
  )
}

export default SubjectItem
