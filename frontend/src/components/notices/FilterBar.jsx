const CATEGORIES = [
  { name: 'All', color: '#F7F4FF' },
  { name: 'Exam', color: '#FF5B5B' },
  { name: 'Fee', color: '#FFB23E' },
  { name: 'Academic', color: '#6CB4FF' },
  { name: 'Internship', color: '#A78BFA' },
  { name: 'Event', color: '#4EF0A0' },
  { name: 'Guest Lecture', color: '#D97706' },
  { name: 'General', color: '#7a6f94' },
]

function FilterBar({ active, onChange }) {
  return (
    <div className="flex gap-2 overflow-x-auto pb-1 scrollbar-none">
      {CATEGORIES.map((cat) => {
        const isActive = active === cat.name || (cat.name === 'All' && !active)
        return (
          <button
            key={cat.name}
            type="button"
            onClick={() => onChange(cat.name === 'All' ? null : cat.name)}
            className={`flex shrink-0 items-center gap-1.5 rounded-full px-3 py-1.5 text-[10px] font-semibold transition ${
              isActive
                ? 'bg-white/15 text-[#F7F4FF] ring-1 ring-white/20'
                : 'bg-white/5 text-[#9F9AB5] hover:bg-white/10'
            }`}
          >
            <span className="h-2 w-2 rounded-full" style={{ backgroundColor: cat.color }} />
            {cat.name}
          </button>
        )
      })}
    </div>
  )
}

export default FilterBar
