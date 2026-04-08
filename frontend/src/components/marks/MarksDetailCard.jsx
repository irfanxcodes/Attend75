function MarksRow({ label, value }) {
  return (
    <div className="flex items-center justify-between gap-4 py-0.5">
      <span className="text-[15px] font-normal text-[#1A1328]">{label}</span>
      <span className="text-[15px] font-medium text-[#1A1328]">{value ?? '-'}</span>
    </div>
  )
}

function MarksDetailCard({ marks, displaySubjectCode = '' }) {
  if (!marks) {
    return null
  }

  const components = Array.isArray(marks.components) ? marks.components : []
  const splitIndex = Math.ceil(components.length / 2)
  const leftComponents = components.slice(0, splitIndex)
  const rightComponents = components.slice(splitIndex)
  const orderedComponents = [...leftComponents, ...rightComponents]
  const subjectLabel = String(displaySubjectCode || marks.subjectCode || '').trim() || 'SUBJ'

  return (
    <article className="rounded-3xl bg-[#C9B7A3] p-5 transition-all duration-200 ease-out">
      <div className="mb-4 flex items-center justify-between gap-3">
        <p className="text-sm font-semibold uppercase tracking-wide text-[#2E2248]">{subjectLabel}</p>
        {marks.units ? <p className="text-xs font-medium text-[#2E2248]/80">Credit: {marks.units}</p> : null}
      </div>

      <div className="space-y-2.5">
        {orderedComponents.map((component) => (
          <MarksRow key={`${subjectLabel}-${component.name}`} label={component.name} value={component.value} />
        ))}
      </div>

      {!components.length ? (
        <p className="mt-4 text-sm text-[#2E2248]">No components are available for this subject.</p>
      ) : null}

      <div className="mt-4 h-px bg-[#5C4B3A]/20" />

      <div className="mt-3 flex items-center justify-between gap-4">
        <p className="text-[16px] font-semibold text-[#120D20]">Total</p>
        <p className="text-[18px] font-semibold text-[#120D20]">{marks.total}</p>
      </div>
    </article>
  )
}

export default MarksDetailCard
