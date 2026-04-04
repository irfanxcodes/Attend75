function CalendarHeader({ currentDate, onPreviousMonth, onNextMonth, onResetToToday }) {
  const monthLabel = currentDate.toLocaleString('default', {
    month: 'long',
    year: 'numeric',
  })

  return (
    <div className="flex items-center justify-between gap-1 rounded-2xl bg-[#E2BC8B] px-2 py-2 text-[#15122D] shadow-sm sm:gap-3 sm:px-4 sm:py-3">
      <button
        type="button"
        onClick={onPreviousMonth}
        className="inline-flex h-8 w-8 items-center justify-center rounded-full bg-[#D7AC77] text-lg leading-none transition hover:bg-[#CB9D66] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#5C5687] sm:h-9 sm:w-9 sm:text-xl"
        aria-label="Go to previous month"
      >
        {'<'}
      </button>

      <h2 className="min-w-0 truncate px-1 text-center text-base font-bold tracking-tight sm:text-2xl">{monthLabel}</h2>

      <div className="flex items-center gap-1 sm:gap-2">
        <button
          type="button"
          onClick={onResetToToday}
          className="inline-flex h-8 w-8 items-center justify-center rounded-full transition hover:focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#5C5687] sm:h-9 sm:w-9"
          aria-label="Reset to today"
          title="Today"
        >
          <img src="/calendar.svg" alt="" aria-hidden="true" className="h-4 w-4 sm:h-[18px] sm:w-[18px]" />
        </button>

        <button
          type="button"
          onClick={onNextMonth}
          className="inline-flex h-8 w-8 items-center justify-center rounded-full bg-[#D7AC77] text-lg leading-none transition hover:bg-[#CB9D66] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#5C5687] sm:h-9 sm:w-9 sm:text-xl"
          aria-label="Go to next month"
        >
          {'>'}
        </button>
      </div>
    </div>
  )
}

export default CalendarHeader
