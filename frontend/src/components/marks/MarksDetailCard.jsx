function MarksDetailCard({ marks, displaySubjectCode = '' }) {
  if (!marks) return null

  const components = Array.isArray(marks.components) ? marks.components : []
  const subjectLabel = String(displaySubjectCode || marks.subjectCode || '').trim() || 'SUBJ'

  return (
    <article className="overflow-hidden rounded-2xl bg-[#E8DCC8] transition-all duration-300">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-[#C9B7A3]/50 px-5 py-3">
        <div className="flex items-center gap-2">
          <span className="h-2.5 w-2.5 rounded-full bg-[#FFB23E]" />
          <span className="text-base font-bold text-[#1A1328]">{subjectLabel}</span>
        </div>
        {marks.units ? (
          <span className="text-xs font-medium text-[#5C4B3A]">Credit: {marks.units}</span>
        ) : null}
      </div>

      {/* Component rows */}
      <div className="px-5 py-2">
        {components.length > 0 ? (
          <div className="divide-y divide-[#C9B7A3]/40">
            {components.map((component) => (
              <div key={`${subjectLabel}-${component.name}`} className="flex items-center justify-between py-2.5">
                <span className="text-sm text-[#1A1328]">{component.name}</span>
                <span className="text-sm font-semibold text-[#1A1328]">{component.value}</span>
              </div>
            ))}
          </div>
        ) : (
          <p className="py-3 text-sm text-[#5C4B3A]">No components available for this subject.</p>
        )}
      </div>

      {/* Total row */}
      <div className="border-t border-[#C9B7A3]/50 px-5 py-3">
        <div className="flex items-center justify-between">
          <span className="text-base font-bold text-[#1A1328]">Total</span>
          <div className="flex items-baseline gap-1">
            <span className="text-2xl font-extrabold text-[#1A1328]">{marks.total}</span>
            <span className="text-sm text-[#5C4B3A]">/ {marks.maxTotal}</span>
          </div>
        </div>
      </div>
    </article>
  )
}

export default MarksDetailCard
