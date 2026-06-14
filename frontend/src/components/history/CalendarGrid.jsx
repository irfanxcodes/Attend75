const WEEKDAY_LABELS = ['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT']

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

function CalendarGrid({ currentDate, selectedDate, onSelectDate, dayStatusMap }) {
  const cells = buildCalendarCells(currentDate)
  const today = new Date()
  const isCurrentMonth =
    currentDate.getFullYear() === today.getFullYear() && currentDate.getMonth() === today.getMonth()
  const todayDay = isCurrentMonth ? today.getDate() : null

  return (
    <div>
      {/* Weekday headers */}
      <div className="mb-2 grid grid-cols-7 text-center">
        {WEEKDAY_LABELS.map((day) => (
          <span key={day} className="text-[10px] font-bold uppercase tracking-wider text-[#9F9AB5]">
            {day}
          </span>
        ))}
      </div>

      {/* Day cells */}
      <div className="grid grid-cols-7 gap-y-1">
        {cells.map((cell) => {
          if (!cell.day) {
            return <span key={cell.id} className="h-10 sm:h-11" aria-hidden="true" />
          }

          const isSelected = selectedDate === cell.day
          const isToday = todayDay === cell.day
          const status = dayStatusMap?.[cell.day]
          // status can be: 'all_present', 'some_absent', 'all_absent', 'no_data', undefined

          let dotElements = null
          if (status === 'all_present') {
            dotElements = (
              <div className="mt-0.5 flex justify-center gap-px">
                <span className="h-1 w-1 rounded-full bg-[#4EF0A0]" />
                <span className="h-1 w-1 rounded-full bg-[#4EF0A0]" />
                <span className="h-1 w-1 rounded-full bg-[#4EF0A0]" />
              </div>
            )
          } else if (status === 'some_absent') {
            dotElements = (
              <div className="mt-0.5 flex justify-center gap-px">
                <span className="h-1 w-1 rounded-full bg-[#4EF0A0]" />
                <span className="h-1 w-1 rounded-full bg-[#FF5B5B]" />
                <span className="h-1 w-1 rounded-full bg-[#4EF0A0]" />
              </div>
            )
          } else if (status === 'all_absent') {
            dotElements = (
              <div className="mt-0.5 flex justify-center gap-px">
                <span className="h-1 w-1 rounded-full bg-[#FF5B5B]" />
                <span className="h-1 w-1 rounded-full bg-[#FF5B5B]" />
                <span className="h-1 w-1 rounded-full bg-[#FF5B5B]" />
              </div>
            )
          }

          return (
            <button
              key={cell.id}
              type="button"
              onClick={() => onSelectDate(cell.day)}
              className={`flex h-10 flex-col items-center justify-center rounded-lg text-xs font-medium transition-all duration-200 sm:h-11 sm:text-sm ${
                isSelected
                  ? 'bg-[#FF916C] font-bold text-[#1D183E] shadow-md'
                  : isToday
                    ? 'font-bold text-[#FF916C]'
                    : 'text-[#D8D4E7] hover:bg-white/5'
              }`}
              aria-pressed={isSelected}
            >
              <span>{cell.day}</span>
              {dotElements}
            </button>
          )
        })}
      </div>
    </div>
  )
}

export default CalendarGrid
