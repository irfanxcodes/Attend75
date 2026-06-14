import { ChevronLeft, ChevronRight } from 'lucide-react'

function CalendarHeader({ currentDate, onPreviousMonth, onNextMonth, onResetToToday }) {
  const monthLabel = currentDate.toLocaleString('default', {
    month: 'long',
    year: 'numeric',
  })

  return (
    <div className="flex items-center justify-between gap-2">
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={onPreviousMonth}
          className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-white/10 text-[#D8D4E7] transition hover:bg-white/10"
          aria-label="Previous month"
        >
          <ChevronLeft className="h-4 w-4" strokeWidth={2} />
        </button>
        <h2 className="text-base font-bold text-[#F7F4FF] sm:text-lg">{monthLabel}</h2>
        <button
          type="button"
          onClick={onNextMonth}
          className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-white/10 text-[#D8D4E7] transition hover:bg-white/10"
          aria-label="Next month"
        >
          <ChevronRight className="h-4 w-4" strokeWidth={2} />
        </button>
      </div>

      <button
        type="button"
        onClick={onResetToToday}
        className="rounded-full border border-white/15 px-3 py-1.5 text-[11px] font-semibold text-[#D8D4E7] transition hover:bg-white/10"
      >
        Jump to today
      </button>
    </div>
  )
}

export default CalendarHeader
