function SubjectSelectorGrid({ subjects, selectedSubjectCode, disabled, onSelect }) {
  if (!subjects.length) {
    return (
      <div className="rounded-xl border border-white/15 bg-[#3A315D] p-3 text-sm text-[#D1D1D1]">
        No subjects available for this semester.
      </div>
    )
  }

  return (
    <div className="grid grid-cols-3 gap-2.5 sm:grid-cols-4">
      {subjects.map((subject) => {
        const isSelected = selectedSubjectCode === subject.subjectCode

        return (
          <button
            key={subject.subjectId}
            type="button"
            onClick={() => onSelect(subject.subjectCode)}
            disabled={disabled}
            className={[
              'rounded-xl border px-3 py-2 text-center text-xs font-semibold transition-all duration-200 ease-out sm:text-sm',
              isSelected
                ? 'scale-[1.03] border-[#E8A08C] bg-[#E8A08C] text-[#2F1D4F] shadow-[0_0_14px_rgba(232,160,140,0.35)]'
                : 'border-[#E2D7CA]/60 bg-[#D8CCBC] text-[#231A36] hover:bg-[#E1D5C6] hover:border-[#E7DED3]',
              disabled ? 'cursor-not-allowed opacity-60' : '',
            ].join(' ')}
            aria-pressed={isSelected}
          >
            {subject.subjectCode}
          </button>
        )
      })}
    </div>
  )
}

export default SubjectSelectorGrid
