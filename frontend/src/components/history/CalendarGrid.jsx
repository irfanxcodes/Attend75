const WEEKDAY_LABELS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

function buildCalendarCells(currentDate) {
  const year = currentDate.getFullYear()
  const month = currentDate.getMonth()
  const firstWeekday = new Date(year, month, 1).getDay()
  const daysInMonth = new Date(year, month + 1, 0).getDate()

  const leadingEmpty = Array.from({ length: firstWeekday }, (_, index) => ({
    id: `empty-${index}`,
    day: null,
  }))

  const monthDays = Array.from({ length: daysInMonth }, (_, index) => ({
    id: `day-${index + 1}`,
    day: index + 1,
  }))

  return [...leadingEmpty, ...monthDays]
}

function CalendarGrid({ currentDate, selectedDate, onSelectDate }) {
  const cells = buildCalendarCells(currentDate)

  return (
    <div className="rounded-2xl bg-[#E2BC8B] p-4 text-[#15122D] shadow-sm">
      <div className="mb-2 grid grid-cols-7 gap-2 text-center text-xs font-semibold uppercase tracking-wide text-[#3E365F]/80">
        {WEEKDAY_LABELS.map((day) => (
          <span key={day}>{day}</span>
        ))}
      </div>

      <div className="grid grid-cols-7 gap-2">
        {cells.map((cell) => {
          if (!cell.day) {
            return <span key={cell.id} className="h-10" aria-hidden="true" />
          }

          const isSelected = selectedDate === cell.day

          return (
            <button
              key={cell.id}
              type="button"
              onClick={() => onSelectDate(cell.day)}
              className={`h-10 rounded-full text-sm font-medium transition duration-200 ${
                isSelected
                  ? 'bg-[#5B5485] text-white shadow-sm'
                  : 'text-[#1D1738] hover:bg-[#D2A56C] hover:text-[#121021]'
              }`}
              aria-pressed={isSelected}
            >
              {cell.day}
            </button>
          )
        })}
      </div>
    </div>
  )
}

export default CalendarGrid
