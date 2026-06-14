function SubjectSelectorGrid({ subjects, selectedSubjectCode, disabled, onSelect }) {
  if (!subjects.length) {
    return (
      <div className="rounded-xl border border-white/10 bg-[#3D3660] p-3 text-sm text-[#9F9AB5]">
        No subjects available for this semester.
      </div>
    )
  }

  return (
    <div className="flex flex-wrap gap-2">
      {subjects.map((subject) => {
        const isSelected = selectedSubjectCode === subject.subjectCode

        return (
          <button
            key={subject.subjectId}
            type="button"
            onClick={() => onSelect(subject.subjectCode)}
            disabled={disabled}
            className={[
              'rounded-full border px-4 py-2 text-xs font-semibold transition-all duration-200 sm:text-sm',
              isSelected
                ? 'border-[#FF916C] bg-[#FF916C] text-[#1D183E] shadow-[0_0_12px_rgba(255,145,108,0.3)]'
                : 'border-[#D8D4E7]/40 bg-[#D8D4E7]/15 text-[#F7F4FF] hover:border-[#D8D4E7]/60 hover:bg-[#D8D4E7]/25',
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
