function CalendarHeader({ currentDate, onPreviousMonth, onNextMonth, onResetToToday }) {
  const monthLabel = currentDate.toLocaleString('default', {
    month: 'long',
    year: 'numeric',
  })

  return (
    <div className="flex items-center justify-between gap-3 rounded-2xl bg-[#E2BC8B] px-4 py-3 text-[#15122D] shadow-sm">
      <button
        type="button"
        onClick={onPreviousMonth}
        className="inline-flex h-9 w-9 items-center justify-center rounded-full bg-[#D7AC77] text-xl leading-none transition hover:bg-[#CB9D66] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#5C5687]"
        aria-label="Go to previous month"
      >
        {'<'}
      </button>

      <h2 className="text-2xl font-bold tracking-tight">{monthLabel}</h2>

      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={onResetToToday}
          className="inline-flex h-9 w-9 items-center justify-center rounded-full  transition hover:focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#5C5687]"
          aria-label="Reset to today"
          title="Today"
        >
          <img src="/calendar.svg" alt="" aria-hidden="true" className="h-4 w-4" />
        </button>

        <button
          type="button"
          onClick={onNextMonth}
          className="inline-flex h-9 w-9 items-center justify-center rounded-full bg-[#D7AC77] text-xl leading-none transition hover:bg-[#CB9D66] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#5C5687]"
          aria-label="Go to next month"
        >
          {'>'}
        </button>
      </div>
    </div>
  )
}

export default CalendarHeader
